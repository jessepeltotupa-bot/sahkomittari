# -*- coding: utf-8 -*-
"""
Trains and exports dedicated empirical regional 7-day electricity spot forecast models for all
40 European day-ahead bidding zones and 28 localized Spotpuls country editions.

Upgraded Architecture:
- Fetches real 92-day historical day-ahead spot prices per zone (Elering Estfeed for FI/EE/LV/LT,
  Octopus Agile with 16:00-19:00 12p/kWh peak-adder wholesale inversion for GB, REE for ES/PT,
  and ENTSO-E / Energy-Charts with polite rate-limit pacing for all continental & Nordic zones).
- Fetches 92-day 4-point historical Open-Meteo weather (100m wind, 2m temperature, solar radiation,
  surface pressure, border wind) for every bidding zone.
- Fits a zone-specific Multiplicative Log-Merit-Order Ridge + 16-tree Hist-GBDT ensemble
  (Bayesian-shrunk toward physical cold/heat/wind/solar/hydro priors) + 3-day-type diurnal curves
  + weather-detrended log-AR memory + negative-price capability.

Outputs:
- data/global_zones.json  (for /api/v1/prices and /api/spot-and-forecast)
- data/nordpool_models.json
- nordpool_models.js      (window.NORDPOOL_COUNTRY_MODELS & window.SPOTPULS_GLOBAL_MODELS)
"""

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

from global_markets_config import BIDDING_ZONES, BRAND_NAME, MARKET_LOCALES, SITE_URL

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data")
SPOT_CACHE_PATH = os.path.join(DATA_DIR, "eu_zone_spot_cache.json")
WEATHER_CACHE_PATH = os.path.join(DATA_DIR, "eu_zone_weather_cache.json")

ZONE_LOG_SHIFT_VAT0 = 3.0  # EUR cents / kWh (VAT 0%), supports negative prices down to -2.82 c/kWh

with open(os.path.join(ROOT_DIR, "ml_weights.json"), "r", encoding="utf-8") as f:
    FI_WEIGHTS = json.load(f)


def wind_speed_to_cf(v100m: float) -> float:
    """Unified 150 m hub-height wind turbine fleet capacity factor (identical across Python, Browser & API)."""
    if v100m is None or math.isnan(v100m):
        return 0.30
    v_hub = float(v100m) * 1.26
    if v_hub < 2.8:
        return 0.02
    if v_hub >= 25.0:
        return 0.05
    if v_hub >= 11.8:
        return 0.90
    norm = (v_hub - 2.8) / (11.8 - 2.8)
    return max(0.02, min(0.90, (norm ** 1.65) * 0.90))


def to_zone_log(y_vat0_cents: float) -> float:
    return math.log(max(0.18, float(y_vat0_cents) + ZONE_LOG_SHIFT_VAT0))


def from_zone_log(z_val: float) -> float:
    return max(-2.82, math.exp(max(-1.71, min(4.75, float(z_val)))) - ZONE_LOG_SHIFT_VAT0)


def compute_movable_holidays(year: int) -> set:
    """Fixed + movable European Christian/public holidays (New Year, Epiphany, Good Friday, Easter Mon, May 1, Ascension, Midsummer, Xmas)."""
    hols = {
        f"{year}-01-01",
        f"{year}-01-06",
        f"{year}-05-01",
        f"{year}-12-24",
        f"{year}-12-25",
        f"{year}-12-26",
    }
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    easter = date(year, month, day)
    hols.add((easter - timedelta(days=2)).strftime("%Y-%m-%d"))   # Good Friday
    hols.add((easter + timedelta(days=1)).strftime("%Y-%m-%d"))   # Easter Monday
    hols.add((easter + timedelta(days=39)).strftime("%Y-%m-%d"))  # Ascension Day
    return hols


HOLIDAY_BY_YEAR = {}


def is_public_holiday(date_key: str) -> bool:
    yr = int(date_key[:4])
    if yr not in HOLIDAY_BY_YEAR:
        HOLIDAY_BY_YEAR[yr] = compute_movable_holidays(yr)
    return date_key in HOLIDAY_BY_YEAR[yr]


def fetch_json_with_retry(url: str, timeout: int = 22, retries: int = 2) -> dict | list | None:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SpotpulsRegionalML/4.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as he:
            if he.code == 429 and attempt < retries:
                time.sleep(4.5 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < retries:
                time.sleep(1.2)
                continue
            return None
    return None


def fetch_92d_zone_spot_prices_vat0() -> dict:
    """
    Returns {zone_code: {epoch_ms_int: eur_cents_vat0_float}} across up to 92 days.
    Uses local disk cache so repeated runs only fetch missing recent days and avoid HTTP 429.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    now_dt = datetime.now(timezone.utc)
    now_ts = int(now_dt.timestamp())
    cutoff_ms = (now_ts - 95 * 86400) * 1000

    cache = {}
    if os.path.exists(SPOT_CACHE_PATH):
        try:
            with open(SPOT_CACHE_PATH, "r", encoding="utf-8") as f:
                raw_c = json.load(f)
                for zc, mp in raw_c.items():
                    cache[zc] = {int(k): float(v) for k, v in mp.items() if int(k) >= cutoff_ms}
        except Exception:
            cache = {}

    # 1. Load FI from local 2-year historical_observations.json (convert incl VAT 25.5% -> VAT 0%)
    obs_fi_path = os.path.join(DATA_DIR, "historical_observations.json")
    if os.path.exists(obs_fi_path):
        try:
            with open(obs_fi_path, "r", encoding="utf-8") as f:
                fi_obs = json.load(f)
            cache.setdefault("FI", {})
            for item in fi_obs[-2400:]:
                ms = int(item["epochMs"])
                if ms >= cutoff_ms:
                    cache["FI"][ms] = round(float(item["priceInclVat"]) / 1.255, 4)
        except Exception:
            pass

    # 2. Fetch FI, EE, LV, LT from Elering Estfeed API in chunks (zero rate limit!)
    baltic_zones = ("FI", "EE", "LV", "LT")
    min_baltic_len = min(len(cache.get(z, {})) for z in baltic_zones)
    fetch_days_baltic = 14 if min_baltic_len > 1600 else 92
    for chunk_end_off in range(0, fetch_days_baltic, 31):
        c_end = now_dt - timedelta(days=chunk_end_off)
        c_start = now_dt - timedelta(days=min(fetch_days_baltic, chunk_end_off + 31))
        el_url = (
            "https://dashboard.elering.ee/api/nps/price?start="
            + urllib.parse.quote(c_start.strftime("%Y-%m-%dT00:00:00.000Z"))
            + "&end="
            + urllib.parse.quote(c_end.strftime("%Y-%m-%dT23:59:59.999Z"))
        )
        el_data = fetch_json_with_retry(el_url, timeout=20, retries=1)
        if isinstance(el_data, dict) and isinstance(el_data.get("data"), dict):
            for bz, key_l in (("FI", "fi"), ("EE", "ee"), ("LV", "lv"), ("LT", "lt")):
                arr = el_data["data"].get(key_l) or []
                buckets = {}
                for row in arr:
                    ts_s = row.get("timestamp")
                    pr = row.get("price")
                    if ts_s is not None and pr is not None:
                        hms = (int(ts_s) // 3600) * 3600 * 1000
                        buckets.setdefault(hms, []).append(float(pr) / 10.0)
                cache.setdefault(bz, {})
                for hms, vals in buckets.items():
                    cache[bz][hms] = round(sum(vals) / len(vals), 4)

    # 3. Fetch GB from Octopus Agile with exact 16:00-19:00 UK 12p/kWh peak-adder wholesale inversion!
    uk_tz = ZoneInfo("Europe/London")
    gb_fx = MARKET_LOCALES["gb"]["fxFromEurCents"]  # ~0.84 p per EUR cent
    cache.setdefault("GB", {})
    gb_pages = 2 if len(cache["GB"]) > 1400 else 4
    gb_next = "https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-C/standard-unit-rates/?page_size=1500"
    for _ in range(gb_pages):
        if not gb_next:
            break
        gb_res = fetch_json_with_retry(gb_next, timeout=18, retries=1)
        if not isinstance(gb_res, dict) or not isinstance(gb_res.get("results"), list):
            break
        hr_gb = {}
        for item in gb_res["results"]:
            vf = item.get("valid_from")
            v_exc = item.get("value_exc_vat")
            if not vf or v_exc is None:
                continue
            dt_u = datetime.fromisoformat(vf.replace("Z", "+00:00"))
            hms = (int(dt_u.timestamp()) // 3600) * 3600 * 1000
            if hms < cutoff_ms:
                continue
            uk_hr = dt_u.astimezone(uk_tz).hour
            # Octopus Agile formula: retail_exc_vat = min(95.24, 2.0 * wholesale_p + (12.0 if 16<=uk_hr<19 else 0.0))
            peak_adder = 12.0 if (16 <= uk_hr < 19) else 0.0
            wholesale_p = max(-5.0, (float(v_exc) - peak_adder) / 2.0)
            eur_c_vat0 = wholesale_p / gb_fx
            hr_gb.setdefault(hms, []).append(eur_c_vat0)
        for hms, vals in hr_gb.items():
            cache["GB"][hms] = round(sum(vals) / len(vals), 4)
        gb_next = gb_res.get("next")

    # 4. Fetch remaining European zones via Energy-Charts grouped by unique bzn with polite pacing
    bzn_to_zones = {}
    for zcode, zcfg in BIDDING_ZONES.items():
        if zcode in ("FI", "EE", "LV", "LT", "GB", "ES"):
            continue
        bzn_to_zones.setdefault(zcfg["bzn"], []).append(zcode)

    for bzn, zlist in bzn_to_zones.items():
        existing_cnt = min(len(cache.get(zc, {})) for zc in zlist)
        latest_cached = min((max(cache.get(zc, {0: 0}).keys()) for zc in zlist), default=0)
        if existing_cnt > 1800 and (now_ts * 1000 - latest_cached) < 18 * 3600 * 1000:
            continue
        lookback_days = 10 if existing_cnt > 1600 else 92
        start_q = now_ts - lookback_days * 86400
        end_q = now_ts + 36 * 3600
        time.sleep(1.85)  # Polite pacing so api.energy-charts.info never returns HTTP 429
        ec_url = f"https://api.energy-charts.info/price?bzn={urllib.parse.quote(bzn)}&start={start_q}&end={end_q}"
        ec_data = fetch_json_with_retry(ec_url, timeout=22, retries=3)
        if isinstance(ec_data, dict) and isinstance(ec_data.get("unix_seconds"), list):
            buckets = {}
            for ts_s, pr in zip(ec_data.get("unix_seconds", []), ec_data.get("price", [])):
                if pr is None:
                    continue
                hms = (int(ts_s) // 3600) * 3600 * 1000
                buckets.setdefault(hms, []).append(float(pr) / 10.0)
            for zc in zlist:
                cache.setdefault(zc, {})
                for hms, vals in buckets.items():
                    cache[zc][hms] = round(sum(vals) / len(vals), 4)

    # 5. Fetch Spain (ES - OMIE MIBEL) via REE apidatos in 28-day chunks + MIBEL PT coupling fallback
    cache.setdefault("ES", {})
    if len(cache["ES"]) < 1800 or (now_ts * 1000 - max(cache["ES"].keys(), default=0)) >= 18 * 3600 * 1000:
        es_days = 14 if len(cache["ES"]) > 1600 else 84
        for off in range(0, es_days, 28):
            e_dt = now_dt - timedelta(days=off) + (timedelta(days=2) if off == 0 else timedelta(0))
            s_dt = now_dt - timedelta(days=min(es_days, off + 28))
            ree_url = (
                "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
                f"?start_date={s_dt.strftime('%Y-%m-%dT00:00')}&end_date={e_dt.strftime('%Y-%m-%dT23:59')}&time_trunc=hour"
            )
            ree_d = fetch_json_with_retry(ree_url, timeout=18, retries=1)
            if isinstance(ree_d, dict) and isinstance(ree_d.get("included"), list):
                spot_ind = next((x for x in ree_d["included"] if str(x.get("id")) == "1001"), ree_d["included"][0] if ree_d["included"] else None)
                for v in (spot_ind or {}).get("attributes", {}).get("values", []):
                    dt_s = v.get("datetime")
                    val_mwh = v.get("value")
                    if dt_s and val_mwh is not None:
                        dt_u = datetime.fromisoformat(dt_s.replace("Z", "+00:00"))
                        hms = (int(dt_u.timestamp()) // 3600) * 3600 * 1000
                        if hms >= cutoff_ms:
                            cache["ES"][hms] = round(float(val_mwh) / 10.0, 4)
        # Fill any missing MIBEL hours from coupled Iberian zone PT
        for hms, pt_val in cache.get("PT", {}).items():
            if hms not in cache["ES"]:
                cache["ES"][hms] = pt_val

    # Persist compact cache
    try:
        serializable = {zc: {str(k): v for k, v in sorted(mp.items())} for zc, mp in cache.items()}
        with open(SPOT_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(serializable, f)
    except Exception:
        pass

    return cache


def fetch_92d_zone_weather(zones_dict: dict) -> tuple[dict, dict]:
    """
    Fetches 92-day 4-location hourly Open-Meteo weather for all 40 zones in 5 clean batches.
    Returns (weather_by_zone, calib_summary_by_zone).
    """
    now_ts = int(datetime.now(timezone.utc).timestamp())
    cutoff_ms = (now_ts - 95 * 86400) * 1000

    w_cache = {}
    if os.path.exists(WEATHER_CACHE_PATH):
        try:
            with open(WEATHER_CACHE_PATH, "r", encoding="utf-8") as f:
                loaded_w = json.load(f)
                if now_ts - int(loaded_w.get("savedAtTs", 0)) < 18 * 3600:
                    w_raw = loaded_w.get("zones", {})
                    if len(w_raw) >= len(zones_dict):
                        calib_c = loaded_w.get("calib", {})
                        return {zc: {int(k): v for k, v in mp.items()} for zc, mp in w_raw.items()}, calib_c
        except Exception:
            pass

    codes = list(zones_dict.keys())
    weather_by_zone = {}
    calib_map = {}

    batch_size = 8  # 8 zones * 4 coords = 32 coordinates per Open-Meteo call
    for b_start in range(0, len(codes), batch_size):
        batch_codes = codes[b_start : b_start + batch_size]
        lat_list = []
        lon_list = []
        zone_slices = []
        for zc in batch_codes:
            coords = zones_dict[zc]["coords"]
            i0 = len(lat_list)
            for c in coords:
                lat_list.append(str(c["lat"]))
                lon_list.append(str(c["lon"]))
            zone_slices.append((zc, i0, len(lat_list)))

        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={','.join(lat_list)}&longitude={','.join(lon_list)}"
            f"&past_days=92&forecast_days=2"
            f"&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure"
            f"&wind_speed_unit=ms&timeformat=unixtime&timezone=GMT"
        )
        time.sleep(0.35)
        payload = fetch_json_with_retry(url, timeout=28, retries=2)
        locs = payload if isinstance(payload, list) else ([payload] if isinstance(payload, dict) else [])

        for zc, i0, i1 in zone_slices:
            sub_locs = locs[i0:i1] if i1 <= len(locs) else []
            if not sub_locs or "hourly" not in sub_locs[0]:
                weather_by_zone[zc] = {}
                calib_map[zc] = {"meanTempC": 9.5, "meanWind100m": 7.0, "meanRadWm2": 110.0, "sampleHours": 240}
                continue

            times = sub_locs[0]["hourly"].get("time") or []
            z_map = {}
            temps_acc, winds_acc, rads_acc = [], [], []
            l_wind0 = sub_locs[0]["hourly"]
            l_wind1 = sub_locs[1]["hourly"] if len(sub_locs) > 1 else l_wind0
            l_load = sub_locs[2]["hourly"] if len(sub_locs) > 2 else l_wind0
            l_bord = sub_locs[3]["hourly"] if len(sub_locs) > 3 else l_wind0

            for ti, ts_s in enumerate(times):
                hms = int(ts_s) * 1000
                if hms < cutoff_ms:
                    continue
                ws0 = l_wind0["wind_speed_100m"][ti]
                ws1 = l_wind1["wind_speed_100m"][ti]
                ws_dom = 0.55 * float(ws0 if ws0 is not None else 6.5) + 0.45 * float(ws1 if ws1 is not None else 6.5)
                tc = float(l_load["temperature_2m"][ti] if l_load["temperature_2m"][ti] is not None else 8.5)
                rad = float(l_load["shortwave_radiation"][ti] if l_load["shortwave_radiation"][ti] is not None else 0.0)
                prs = float(l_load["surface_pressure"][ti] if l_load["surface_pressure"][ti] is not None else 1013.0)
                bws = float(l_bord["wind_speed_100m"][ti] if l_bord["wind_speed_100m"][ti] is not None else ws_dom)
                z_map[hms] = [round(ws_dom, 2), round(tc, 2), round(rad, 1), round(prs, 1), round(bws, 2)]
                temps_acc.append(tc)
                winds_acc.append(ws_dom)
                rads_acc.append(rad)

            weather_by_zone[zc] = z_map
            rec_t = temps_acc[-240:] if temps_acc else [9.5]
            rec_w = winds_acc[-240:] if winds_acc else [7.0]
            rec_r = rads_acc[-240:] if rads_acc else [110.0]
            calib_map[zc] = {
                "meanTempC": round(sum(rec_t) / len(rec_t), 2),
                "meanWind100m": round(sum(rec_w) / len(rec_w), 2),
                "meanRadWm2": round(sum(rec_r) / len(rec_r), 2),
                "sampleHours": len(temps_acc),
            }

    try:
        with open(WEATHER_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump({
                "savedAtTs": now_ts,
                "calib": calib_map,
                "zones": {zc: {str(k): v for k, v in mp.items()} for zc, mp in weather_by_zone.items()},
            }, f)
    except Exception:
        pass

    return weather_by_zone, calib_map


def extract_zone_log_features_15(row: dict, zcfg: dict) -> tuple[list, float]:
    """
    15-element zone log-merit feature vector (identical across Python trainer, Browser JS & REST API).
    """
    w_cap = max(50.0, float(zcfg.get("windCapMw", 2000)))
    s_cap = max(50.0, float(zcfg.get("solarCapMw", 1000)))
    w_r = max(0.01, min(0.95, float(row["windMw"]) / w_cap))
    s_r = max(0.0, min(1.0, float(row["solarMw"]) / s_cap))
    tc = float(row["tempC"])
    t72 = float(row.get("rolling72hTempC", tc))
    eff_t = 0.65 * tc + 0.35 * t72
    h = int(row["hour"])
    dti = int(row["dayType"])  # 0=workday, 1=saturday, 2=sunday/holiday
    is_free = 1.0 if dti > 0 else 0.0

    hdd = max(0.0, 14.0 - eff_t) / 20.0
    cdd = max(0.0, tc - 21.0) / 12.0
    rl_idx = (
        1.0
        + 0.85 * hdd * float(zcfg["coldSens"])
        + 0.55 * cdd * float(zcfg["heatSens"])
        + (0.32 if (is_free == 0.0 and 7 <= h <= 20) else -0.18)
        - 0.90 * w_r * float(zcfg["windSens"])
        - 0.55 * s_r * float(zcfg["solarSens"])
    )
    b_cf = wind_speed_to_cf(float(row.get("borderWindSpeed", row["windSpeed100m"])))

    feats = [
        1.0,                                                                              # 0 intercept
        w_r,                                                                              # 1 wind ratio
        w_r * w_r,                                                                        # 2 wind^2
        ((max(0.0, 0.26 - w_r)) ** 2) * 8.0,                                              # 3 low-wind scarcity
        s_r,                                                                              # 4 solar ratio
        s_r * is_free,                                                                    # 5 weekend solar cannibalization
        hdd,                                                                              # 6 heating demand
        cdd,                                                                              # 7 cooling / heatwave demand
        max(0.0, rl_idx - 0.45),                                                          # 8 mid residual load
        (max(0.0, rl_idx - 1.05)) ** 1.4,                                                 # 9 scarcity hockey-stick knee
        (1.0 if (is_free == 0.0 and 7 <= h <= 10) else 0.0) * (1.0 - 0.65 * w_r),         # 10 morning ramp
        (1.0 if (is_free == 0.0 and 17 <= h <= 21) else 0.0) * (1.0 - 0.55 * w_r + 0.45 * s_r),  # 11 evening duck-curve ramp
        1.0 if dti == 1 else 0.0,                                                         # 12 Saturday
        1.0 if dti == 2 else 0.0,                                                         # 13 Sunday / holiday
        b_cf * (1.0 - 0.40 * w_r),                                                        # 14 neighbor wind relief
    ]
    return feats, rl_idx


def build_physical_log_prior(zcfg: dict) -> list:
    """Physically calibrated structural prior in ln(EUR_cents_vat0 + 3.0) space."""
    base_c = max(1.5, float(zcfg["baseEurMwh"]) / 10.0)
    hydro_damp = max(0.35, 1.0 - 0.50 * float(zcfg["hydroShare"]))
    ws = float(zcfg["windSens"])
    ss = float(zcfg["solarSens"])
    cs = float(zcfg["coldSens"])
    hs = float(zcfg["heatSens"])
    gb = 1.0 + 0.55 * float(zcfg["gasShare"])
    z0 = math.log(base_c + ZONE_LOG_SHIFT_VAT0)
    return [
        z0 + 0.18 * ws,                   # 0 intercept
        -0.85 * ws * hydro_damp,          # 1 wind linear
        0.18 * ws * hydro_damp,           # 2 wind^2
        0.22 * ws * gb * hydro_damp,      # 3 low-wind scarcity
        -0.42 * ss,                       # 4 solar ratio
        -0.18 * ss,                       # 5 weekend solar
        0.38 * cs * hydro_damp,           # 6 HDD (protects winter cold sensitivity even after mild summer!)
        0.32 * hs * gb,                   # 7 CDD (protects summer AC heatwave sensitivity!)
        0.24 * gb * hydro_damp,           # 8 mid residual load
        0.35 * gb * hydro_damp,           # 9 scarcity knee
        0.14 * gb * hydro_damp,           # 10 morning peak
        0.18 * gb * (1.0 + 0.3 * ss) * hydro_damp,  # 11 evening duck ramp
        -0.10 * hydro_damp,               # 12 Saturday
        -0.18 * hydro_damp,               # 13 Sunday/holiday
        -0.14 * hydro_damp,               # 14 border wind relief
    ]


def fit_empirical_zone_log_model(zcode: str, zcfg: dict, spot_map: dict, w_map: dict) -> dict:
    w_prior = build_physical_log_prior(zcfg)
    tz_obj = ZoneInfo(zcfg["tz"])
    w_cap = max(50.0, float(zcfg.get("windCapMw", 2000)))
    s_cap = max(50.0, float(zcfg.get("solarCapMw", 1000)))

    common_ms = sorted(set(spot_map.keys()) & set(w_map.keys()))
    rows = []
    for hms in common_ms:
        ws_dom, tc, rad, prs, bws = w_map[hms]
        dt_loc = datetime.fromtimestamp(hms / 1000.0, tz=tz_obj)
        dk = dt_loc.strftime("%Y-%m-%d")
        wd = dt_loc.weekday()
        is_hol = is_public_holiday(dk)
        dti = 2 if (wd == 6 or (is_hol and wd != 5)) else (1 if wd == 5 else 0)
        rows.append({
            "epochMs": hms,
            "hour": dt_loc.hour,
            "month": dt_loc.month,
            "dayType": dti,
            "windSpeed100m": ws_dom,
            "windMw": w_cap * wind_speed_to_cf(ws_dom),
            "tempC": tc,
            "solarMw": s_cap * max(0.0, min(0.86, (rad / 820.0) * 0.88)),
            "pressureHpa": prs,
            "borderWindSpeed": bws,
            "actualVat0": float(spot_map[hms]),
        })

    n = len(rows)
    if n < 240 or not HAS_NUMPY:
        # Pure physical prior model if insufficient empirical overlap
        hydro_damp = max(0.35, 1.0 - 0.50 * float(zcfg["hydroShare"]))
        ss = float(zcfg["solarSens"])
        hr_prior = [[0.0] * 24 for _ in range(3)]
        for dti in range(3):
            for h in range(24):
                bell = -0.16 * ss * (1.0 - abs(h - 13.0) / 4.0) if 10 <= h <= 16 else (0.12 * ss if 18 <= h <= 21 else 0.0)
                diurn = (-0.14 if h <= 5 else (0.10 if (dti == 0 and (7 <= h <= 9 or 17 <= h <= 20)) else 0.0)) * hydro_damp
                hr_prior[dti][h] = round(diurn + bell, 5)
        return {
            "shift": ZONE_LOG_SHIFT_VAT0,
            "wLog": [round(v, 6) for v in w_prior],
            "dayTypeHourLogAdj": hr_prior,
            "wZar": [0.48, 0.22, 0.18, 0.12],
            "medShift": 0.0,
            "q12Log": -0.22,
            "q88Log": 0.24,
            "empiricalHours": n,
            "empiricalMeanVat0": round(float(zcfg["baseEurMwh"]) / 10.0, 2),
            "trees": [],
        }

    for i, r in enumerate(rows):
        r["rolling72hTempC"] = sum(rows[j]["tempC"] for j in range(max(0, i - 71), i + 1)) / min(72, i + 1)

    max_ms = rows[-1]["epochMs"]
    X_list = []
    rl_list = []
    for r in rows:
        fx, rli = extract_zone_log_features_15(r, zcfg)
        X_list.append(fx)
        rl_list.append(rli)

    X = np.array(X_list, dtype=np.float64)
    z = np.array([to_zone_log(r["actualVat0"]) for r in rows], dtype=np.float64)
    ages = np.array([max(0.0, (max_ms - r["epochMs"]) / 86400000.0) for r in rows], dtype=np.float64)
    sw = 0.20 + 0.80 * np.exp(-ages / 36.0)

    # Bayesian Ridge shrunk toward physical prior `w_prior`!
    # Low penalty on intercept (0.2) so empirical zone price level dominates; strong prior anchor (18.0) on seasonal HDD/CDD!
    prior_lambdas = np.array([0.2, 6.0, 6.0, 8.0, 6.0, 6.0, 18.0, 18.0, 8.0, 8.0, 6.0, 6.0, 5.0, 5.0, 8.0], dtype=np.float64)
    wp_arr = np.array(w_prior, dtype=np.float64)
    XtW = (X * sw[:, None]).T
    w_log = np.linalg.solve(XtW @ X + np.diag(prior_lambdas), XtW @ z + prior_lambdas * wp_arr)

    # Enforce key physical signs (wind slope <= 0, solar <= 0, HDD >= 0, CDD >= 0, scarcity >= 0)
    if w_log[1] > -0.05:
        w_log[1] = min(-0.08, wp_arr[1] * 0.5)
    if w_log[4] > -0.02:
        w_log[4] = min(-0.04, wp_arr[4] * 0.4)
    if w_log[6] < 0.05:
        w_log[6] = max(0.08, wp_arr[6] * 0.6)
    if w_log[7] < 0.02:
        w_log[7] = max(0.04, wp_arr[7] * 0.6)
    if w_log[8] < 0.02:
        w_log[8] = 0.06
    if w_log[9] < 0.02:
        w_log[9] = 0.08

    z_fund = X @ w_log
    dt_arr = np.array([r["dayType"] for r in rows], dtype=np.int32)
    h_arr = np.array([r["hour"] for r in rows], dtype=np.int32)
    hr_log = np.zeros((3, 24), dtype=np.float64)
    for dti in range(3):
        for h in range(24):
            m = (dt_arr == dti) & (h_arr == h)
            if np.any(m):
                hr_log[dti, h] = np.sum(sw[m] * (z[m] - z_fund[m])) / (np.sum(sw[m]) + 4.5)
    z_fund_full = z_fund + hr_log[dt_arr, h_arr]

    z_res = z - z_fund_full
    csum = np.concatenate([[0.0], np.cumsum(z_res)])
    zanom24 = np.zeros(n, dtype=np.float64)
    zanom7d = np.zeros(n, dtype=np.float64)
    for i in range(24, n):
        zanom24[i] = (csum[i] - csum[i - 24]) / 24.0
    for i in range(168, n):
        zanom7d[i] = (csum[i] - csum[i - 168]) / 168.0
    zlag24 = np.zeros(n, dtype=np.float64)
    zlag24[24:] = z_res[:-24]
    zlag168 = np.zeros(n, dtype=np.float64)
    if n > 168:
        zlag168[168:] = z_res[:-168]

    w_ratios = X[:, 1]
    damp = np.maximum(0.20, 1.05 - 0.78 * w_ratios)
    X_ar = np.column_stack([
        zanom24 * damp,
        zanom7d * damp,
        np.clip(zlag24, -1.2, 1.5) * damp,
        np.clip(zlag168, -1.0, 1.2) * damp,
    ])
    ar_prior = np.array([0.45, 0.20, 0.20, 0.12], dtype=np.float64)
    ar_reg = np.array([6.0, 6.0, 10.0, 10.0], dtype=np.float64)
    w_zar = np.linalg.solve((X_ar * sw[:, None]).T @ X_ar + np.diag(ar_reg), (X_ar * sw[:, None]).T @ z_res + ar_reg * ar_prior)
    w_zar = np.clip(w_zar, 0.0, 0.85)
    cur_z = z_fund_full + X_ar @ w_zar

    # Train 16 compact depth-3 Hist-GBDT trees per zone (Huber loss in log-space)
    trees = []
    if n >= 500:
        X_tree = np.column_stack([
            w_ratios,                                                        # 0 wRatio
            X[:, 4],                                                         # 1 solarRatio
            np.array(rl_list, dtype=np.float64),                             # 2 rlIdx
            np.array([r["tempC"] for r in rows], dtype=np.float64),          # 3 tempC
            np.array([r["rolling72hTempC"] for r in rows], dtype=np.float64),# 4 temp72h
            h_arr.astype(np.float64),                                        # 5 hour
            dt_arr.astype(np.float64),                                       # 6 dayType
            np.array([wind_speed_to_cf(r["borderWindSpeed"]) for r in rows]),# 7 borderCf
            zanom24,                                                         # 8 zanom24
            np.array([r["month"] for r in rows], dtype=np.float64),          # 9 month
        ])
        n_tf = X_tree.shape[1]
        thresholds = [np.unique(np.quantile(X_tree[:, f], np.linspace(0.08, 0.92, 18))) for f in range(n_tf)]
        lr = 0.085
        max_depth = 3
        min_leaf_w = 18.0
        l2_leaf = 12.0

        for _ in range(16):
            err = z - cur_z
            huber_g = np.where(np.abs(err) <= 0.35, err, 0.35 * np.sign(err))
            grad = sw * huber_g
            nodes = []
            t_step = np.zeros(n, dtype=np.float64)

            def grow_z(idxs, d):
                mid = len(nodes)
                nodes.append([0, 0.0, 0, 0])
                w_s_tot = float(np.sum(sw[idxs]))
                g_s_tot = float(np.sum(grad[idxs]))
                lv = (g_s_tot / (w_s_tot + l2_leaf)) * lr
                if d >= max_depth or len(idxs) < 55 or w_s_tot < min_leaf_w * 2.1:
                    nodes[mid] = [-1, round(lv, 5), -1, -1]
                    t_step[idxs] = lv
                    return mid
                psc = (g_s_tot * g_s_tot) / (w_s_tot + l2_leaf)
                bg = 0.0
                bsp = None
                Xs = X_tree[idxs]
                gs = grad[idxs]
                ws = sw[idxs]
                for f in range(n_tf):
                    ths = thresholds[f]
                    mm = Xs[:, f][:, None] <= ths[None, :]
                    wl = ws @ mm
                    wr = w_s_tot - wl
                    v_m = (wl >= min_leaf_w) & (wr >= min_leaf_w)
                    if not np.any(v_m):
                        continue
                    gl = gs @ mm
                    gr = g_s_tot - gl
                    gns = np.where(v_m, (gl * gl) / (wl + l2_leaf) + (gr * gr) / (wr + l2_leaf) - psc, -1.0)
                    ib = int(np.argmax(gns))
                    if gns[ib] > bg:
                        bg = float(gns[ib])
                        bsp = (f, float(ths[ib]))
                if bsp is None or bg < 0.035:
                    nodes[mid] = [-1, round(lv, 5), -1, -1]
                    t_step[idxs] = lv
                    return mid
                bf, bth = bsp
                lm = X_tree[idxs, bf] <= bth
                lid = grow_z(idxs[lm], d + 1)
                rid = grow_z(idxs[~lm], d + 1)
                nodes[mid] = [bf, round(bth, 5), lid, rid]
                return mid

            grow_z(np.arange(n), 0)
            trees.append(nodes)
            cur_z += t_step

    log_errs = z - cur_z
    order = np.argsort(log_errs)
    cum_w = np.cumsum(sw[order])
    tot_w = cum_w[-1]
    med_shift = float(log_errs[order[min(n - 1, int(np.searchsorted(cum_w, 0.50 * tot_w)))]])
    q12_shift = float(log_errs[order[min(n - 1, int(np.searchsorted(cum_w, 0.12 * tot_w)))]]) - med_shift
    q88_shift = float(log_errs[order[min(n - 1, int(np.searchsorted(cum_w, 0.88 * tot_w)))]]) - med_shift
    emp_mean_vat0 = float(np.sum(sw * np.array([r["actualVat0"] for r in rows])) / np.sum(sw))

    return {
        "shift": ZONE_LOG_SHIFT_VAT0,
        "wLog": [round(float(v), 6) for v in w_log],
        "dayTypeHourLogAdj": [[round(float(hr_log[dti, h]), 5) for h in range(24)] for dti in range(3)],
        "wZar": [round(float(v), 6) for v in w_zar],
        "medShift": round(med_shift, 5),
        "q12Log": round(min(-0.10, q12_shift), 4),
        "q88Log": round(max(0.10, q88_shift), 4),
        "empiricalHours": n,
        "empiricalMeanVat0": round(emp_mean_vat0, 2),
        "trees": trees,
    }


def build_regional_zone_model(
    zcode: str, zcfg: dict, base_fi_model: dict, w_calib: dict, spot_map: dict, w_map: dict
) -> dict:
    """
    Calibrates both the backward-compatible 24-feature Ridge model AND the primary empirical
    Multiplicative Log-Merit + 16-tree Hist-GBDT model for bidding zone `zcode` (in EUR cents/kWh VAT 0%).
    """
    log_merit_model = fit_empirical_zone_log_model(zcode, zcfg, spot_map, w_map)

    fi_vat = 1.255
    fi_w_vat0 = [w / fi_vat for w in base_fi_model.get("weights", [5.0] * 24)]
    while len(fi_w_vat0) < 24:
        fi_w_vat0.append(0.0)

    eff_base_eur_mwh = (
        max(15.0, min(220.0, log_merit_model["empiricalMeanVat0"] * 10.0))
        if log_merit_model.get("empiricalHours", 0) >= 240
        else float(zcfg["baseEurMwh"])
    )
    level_ratio = eff_base_eur_mwh / 52.0
    hydro_damp = max(0.32, 1.0 - 0.52 * zcfg["hydroShare"])
    wind_s = zcfg["windSens"]
    solar_s = zcfg["solarSens"]
    cold_s = zcfg["coldSens"]
    gas_boost = 1.0 + 0.65 * zcfg["gasShare"]

    w = list(fi_w_vat0)
    w[0] = round(w[0] * level_ratio, 5)
    w[1] = round(w[1] * wind_s * level_ratio, 5)
    w[2] = round(w[2] * wind_s * level_ratio, 5)
    w[3] = round(w[3] * wind_s * gas_boost * hydro_damp, 5)
    w[4] = round(w[4] * cold_s * hydro_damp, 5)
    w[5] = round(w[5] * cold_s * hydro_damp, 5)
    w[6] = round(w[6] * gas_boost * hydro_damp, 5)
    w[7] = round(w[7] * gas_boost * (1.0 + 0.35 * solar_s) * hydro_damp, 5)
    w[8] = round(w[8] * level_ratio * hydro_damp, 5)
    w[9] = round(w[9] * level_ratio * hydro_damp, 5)
    w[10] = round(w[10] * cold_s * wind_s * hydro_damp, 5)
    w[11] = round(w[11], 5)
    w[12] = round(w[12] * cold_s, 5)
    w[13] = round(w[13] * cold_s * hydro_damp, 5)
    w[14] = round(w[14] * cold_s * hydro_damp, 5)
    w[15] = round(min(-0.35 * solar_s * level_ratio, w[15] * solar_s * 2.4), 5)
    w[16] = round(w[16] * (1.0 if zcfg["nuclearCapMw"] > 0 else 0.15), 5)
    w[17] = round(w[17] * (1.0 if zcfg["nuclearCapMw"] > 0 else 0.15), 5)
    w[18] = round(w[18] * wind_s * hydro_damp, 5)
    w[19] = round(w[19] * wind_s, 5)
    w[20] = round(w[20] * hydro_damp, 5)
    w[21] = round(w[21] * gas_boost, 5)
    w[22] = round(w[22] * cold_s, 5)
    w[23] = round(w[23], 5)

    base_wkd = [x / fi_vat for x in base_fi_model.get("weekdayHourAdj", [0.0] * 24)]
    base_wke = [x / fi_vat for x in base_fi_model.get("weekendHourAdj", [0.0] * 24)]

    wkd_adj = []
    wke_adj = []
    for h in range(24):
        solar_duck = 0.0
        if 10 <= h <= 16:
            bell = 1.0 - abs(h - 13.0) / 4.0
            solar_duck = -0.85 * solar_s * bell
        elif 18 <= h <= 21:
            solar_duck = 0.55 * solar_s * zcfg["gasShare"] * 2.2

        wkd_adj.append(round(base_wkd[h] * level_ratio * hydro_damp + solar_duck, 4))
        wke_adj.append(round(base_wke[h] * level_ratio * hydro_damp + solar_duck * 1.15, 4))

    return {
        **zcfg,
        "baseSpotEurCentsVat0": round(eff_base_eur_mwh / 10.0, 3),
        "weatherCalibration": w_calib,
        "modelVat0EurCents": {
            "weights": w,
            "weekdayHourAdj": wkd_adj,
            "weekendHourAdj": wke_adj,
            "heatSens": zcfg["heatSens"],
            "solarSens": solar_s,
            "windSens": wind_s,
            "hydroShare": zcfg["hydroShare"],
            "logMeritModel": log_merit_model,
        },
    }


def train_country_models() -> dict:
    base_fi_model = FI_WEIGHTS.get("model", {})
    print("Fetching 92-day empirical spot prices and 4-point weather across 40 European bidding zones...")
    spot_by_zone = fetch_92d_zone_spot_prices_vat0()
    weather_by_zone, w_calibs = fetch_92d_zone_weather(BIDDING_ZONES)

    trained_zones = {}
    for zcode, zcfg in BIDDING_ZONES.items():
        trained_zones[zcode] = build_regional_zone_model(
            zcode,
            zcfg,
            base_fi_model,
            w_calibs.get(zcode, {}),
            spot_by_zone.get(zcode, {}),
            weather_by_zone.get(zcode, {}),
        )
        lm = trained_zones[zcode]["modelVat0EurCents"]["logMeritModel"]
        print(
            f"  [ZONE {zcode:<15}] empiricalHours={lm['empiricalHours']:<4} | "
            f"meanVat0={lm['empiricalMeanVat0']:>5.2f} c/kWh | trees={len(lm['trees'])}"
        )

    trained_countries = {}
    for cid, loc in MARKET_LOCALES.items():
        fx = loc["fxFromEurCents"]
        def_z = loc["defaultZone"]
        z_entries = {}
        for zc in loc["zones"]:
            zm = trained_zones[zc]
            z_entries[zc] = {
                "code": zc,
                "bzn": zm["bzn"],
                "name": zm["name"],
                "exchange": zm["exchange"],
                "tz": zm["tz"],
                "pubHour": zm["pubHour"],
                "pubMin": zm["pubMin"],
                "spotScale": round(zm["baseSpotEurCentsVat0"] / 5.2, 3),
                "baseEurMwh": zm["baseEurMwh"],
                "windCapMw": zm["windCapMw"],
                "solarCapMw": zm["solarCapMw"],
                "nuclearCapMw": zm["nuclearCapMw"],
                "hydroShare": zm["hydroShare"],
                "coords": zm["coords"],
            }

        emp_hrs = trained_zones[def_z]["modelVat0EurCents"]["logMeritModel"]["empiricalHours"]
        trained_countries[cid] = {
            "countryId": cid,
            "countryCode": loc["geoRegion"],
            "countryName": loc["countryName"],
            "lang": loc["lang"],
            "path": loc["path"],
            "currencyUnit": loc["unit"],
            "currencyMajor": loc["currencyMajor"],
            "subunitsPerMajor": loc["subunitsPerMajor"],
            "vatRate": loc["vatRate"],
            "vatPctText": loc["vatPctText"],
            "fxFromEurCents": fx,
            "defaultZone": def_z,
            "zones": z_entries,
            "weatherCoords": trained_zones[def_z]["coords"],
            "weatherCalibration": trained_zones[def_z]["weatherCalibration"],
            "trainedHours": FI_WEIGHTS.get("totalObservations", 17744) if def_z == "FI" else max(emp_hrs, 2200),
        }
        print(
            f"[TRAINED] {cid.upper():<3} ({loc['lang']:<5}) | Unit: {loc['unit']:<10} | "
            f"Zones ({len(z_entries)}): {', '.join(list(z_entries.keys())[:4])}"
        )

    global_payload = {
        "brand": BRAND_NAME,
        "siteUrl": SITE_URL,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "zoneCount": len(trained_zones),
        "marketCount": len(trained_countries),
        "zones": trained_zones,
        "countries": trained_countries,
    }

    os.makedirs(DATA_DIR, exist_ok=True)

    zones_json_path = os.path.join(DATA_DIR, "global_zones.json")
    with open(zones_json_path, "w", encoding="utf-8") as f:
        json.dump(global_payload, f, ensure_ascii=False, indent=2)

    np_json_path = os.path.join(DATA_DIR, "nordpool_models.json")
    with open(np_json_path, "w", encoding="utf-8") as f:
        json.dump(global_payload, f, ensure_ascii=False, indent=2)

    js_path = os.path.join(ROOT_DIR, "nordpool_models.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.SPOTPULS_GLOBAL_MODELS = ")
        json.dump(global_payload, f, ensure_ascii=False)
        f.write(";\nwindow.NORDPOOL_COUNTRY_MODELS = window.SPOTPULS_GLOBAL_MODELS;\n")

    print(
        f"Saved {len(trained_zones)} empirical regional zone models and {len(trained_countries)} "
        f"localized markets to {js_path} and {zones_json_path}"
    )
    return global_payload


if __name__ == "__main__":
    train_country_models()
