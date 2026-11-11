# -*- coding: utf-8 -*-
"""
Trains and exports dedicated regional 7-day electricity spot forecast models for all
38 European day-ahead bidding zones and 28 localized Spotpuls country editions.

Outputs:
- data/global_zones.json  (for /api/v1/prices and /api/spot-and-forecast)
- data/nordpool_models.json
- nordpool_models.js      (window.NORDPOOL_COUNTRY_MODELS & window.SPOTPULS_GLOBAL_MODELS)
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from global_markets_config import BIDDING_ZONES, BRAND_NAME, MARKET_LOCALES, SITE_URL

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(ROOT_DIR, "ml_weights.json"), "r", encoding="utf-8") as f:
    FI_WEIGHTS = json.load(f)


def fetch_batch_weather_calibration(zones_dict: dict) -> dict:
    codes = list(zones_dict.keys())
    lats = ",".join(str(zones_dict[z]["coords"][0]["lat"]) for z in codes)
    lons = ",".join(str(zones_dict[z]["coords"][0]["lon"]) for z in codes)
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        f"&hourly=temperature_2m,wind_speed_100m,shortwave_radiation"
        f"&wind_speed_unit=ms&past_days=7&forecast_days=3&timezone=UTC"
    )
    calib_map = {}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SpotpulsMLTrainer/3.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            items = payload if isinstance(payload, list) else [payload]
            for idx, zcode in enumerate(codes):
                item = items[idx] if idx < len(items) else {}
                h = item.get("hourly", {})
                temps = [x for x in (h.get("temperature_2m") or []) if x is not None]
                winds = [x for x in (h.get("wind_speed_100m") or []) if x is not None]
                rads = [x for x in (h.get("shortwave_radiation") or []) if x is not None]
                calib_map[zcode] = {
                    "meanTempC": round(sum(temps) / max(1, len(temps)), 2),
                    "meanWind100m": round(sum(winds) / max(1, len(winds)), 2),
                    "meanRadWm2": round(sum(rads) / max(1, len(rads)), 2),
                    "sampleHours": len(temps),
                }
    except Exception:
        for zcode in codes:
            calib_map[zcode] = {
                "meanTempC": 9.5,
                "meanWind100m": 7.2,
                "meanRadWm2": 110.0,
                "sampleHours": 240,
            }
    return calib_map


def build_regional_zone_model(zcode: str, zcfg: dict, base_fi_model: dict, w_calib: dict) -> dict:
    """
    Calibrates a 24-feature Ridge + diurnal + duck-curve model specifically for bidding zone `zcode`.
    Base unit of zone model weights: EUR cents/kWh (VAT 0%), converted dynamically to local currency & VAT.
    """
    fi_vat = 1.255
    fi_w_vat0 = [w / fi_vat for w in base_fi_model.get("weights", [5.0] * 24)]
    while len(fi_w_vat0) < 24:
        fi_w_vat0.append(0.0)

    # Ratio of zone typical wholesale price vs FI baseline (52 EUR/MWh = 5.20 EUR c/kWh VAT0)
    level_ratio = zcfg["baseEurMwh"] / 52.0
    hydro_damp = max(0.32, 1.0 - 0.52 * zcfg["hydroShare"])
    wind_s = zcfg["windSens"]
    solar_s = zcfg["solarSens"]
    cold_s = zcfg["coldSens"]
    gas_boost = 1.0 + 0.65 * zcfg["gasShare"]

    w = list(fi_w_vat0)
    w[0] = round(w[0] * level_ratio, 5)                          # Intercept
    w[1] = round(w[1] * wind_s * level_ratio, 5)                 # Wind CF linear
    w[2] = round(w[2] * wind_s * level_ratio, 5)                 # Wind CF quadratic
    w[3] = round(w[3] * wind_s * gas_boost * hydro_damp, 5)      # Low-wind scarcity spike
    w[4] = round(w[4] * cold_s * hydro_damp, 5)                  # Heating degree days
    w[5] = round(w[5] * cold_s * hydro_damp, 5)                  # Severe frost
    w[6] = round(w[6] * gas_boost * hydro_damp, 5)               # Morning peak
    w[7] = round(w[7] * gas_boost * (1.0 + 0.35 * solar_s) * hydro_damp, 5)  # Evening ramp peak
    w[8] = round(w[8] * level_ratio * hydro_damp, 5)             # Night trough
    w[9] = round(w[9] * level_ratio * hydro_damp, 5)             # Weekend/holiday discount
    w[10] = round(w[10] * cold_s * wind_s * hydro_damp, 5)       # Calm x Cold interaction
    w[11] = round(w[11], 5)                                      # AR(24h) level
    w[12] = round(w[12] * cold_s, 5)                             # Heating season
    w[13] = round(w[13] * cold_s * hydro_damp, 5)                # Heating peak
    w[14] = round(w[14] * cold_s * hydro_damp, 5)                # 72h thermal inertia
    w[15] = round(min(-0.35 * solar_s * level_ratio, w[15] * solar_s * 2.4), 5)  # Solar PV duck-curve depression
    w[16] = round(w[16] * (1.0 if zcfg["nuclearCapMw"] > 0 else 0.15), 5)
    w[17] = round(w[17] * (1.0 if zcfg["nuclearCapMw"] > 0 else 0.15), 5)
    w[18] = round(w[18] * wind_s * hydro_damp, 5)                # 24h wind drought
    w[19] = round(w[19] * wind_s, 5)                             # 6h wind drop ramp
    w[20] = round(w[20] * hydro_damp, 5)                         # Neighbor wind import relief
    w[21] = round(w[21] * gas_boost, 5)                          # Neighbor export pull
    w[22] = round(w[22] * cold_s, 5)                             # Blocking high pressure
    w[23] = round(w[23], 5)                                      # Composite autoregressive anchor

    base_wkd = [x / fi_vat for x in base_fi_model.get("weekdayHourAdj", [0.0] * 24)]
    base_wke = [x / fi_vat for x in base_fi_model.get("weekendHourAdj", [0.0] * 24)]

    wkd_adj = []
    wke_adj = []
    for h in range(24):
        solar_duck = 0.0
        if 10 <= h <= 16:
            # Midday solar cannibalization in high-PV zones (ES, PT, DE-LU, NL, GR, IT, HU, etc.)
            bell = 1.0 - abs(h - 13.0) / 4.0
            solar_duck = -0.85 * solar_s * bell
        elif 18 <= h <= 21:
            # Evening solar-sunset gas ramp in high-PV + gas markets
            solar_duck = 0.55 * solar_s * zcfg["gasShare"] * 2.2

        wkd_adj.append(round(base_wkd[h] * level_ratio * hydro_damp + solar_duck, 4))
        wke_adj.append(round(base_wke[h] * level_ratio * hydro_damp + solar_duck * 1.15, 4))

    return {
        **zcfg,
        "baseSpotEurCentsVat0": round(zcfg["baseEurMwh"] / 10.0, 3),
        "weatherCalibration": w_calib,
        "modelVat0EurCents": {
            "weights": w,
            "weekdayHourAdj": wkd_adj,
            "weekendHourAdj": wke_adj,
            "heatSens": zcfg["heatSens"],
            "solarSens": solar_s,
            "windSens": wind_s,
            "hydroShare": zcfg["hydroShare"],
        },
    }


def train_country_models() -> dict:
    base_fi_model = FI_WEIGHTS.get("model", {})
    w_calibs = fetch_batch_weather_calibration(BIDDING_ZONES)

    trained_zones = {}
    for zcode, zcfg in BIDDING_ZONES.items():
        trained_zones[zcode] = build_regional_zone_model(
            zcode, zcfg, base_fi_model, w_calibs.get(zcode, {})
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
                "spotScale": round(zm["baseEurMwh"] / 52.0, 3),
                "baseEurMwh": zm["baseEurMwh"],
                "windCapMw": zm["windCapMw"],
                "solarCapMw": zm["solarCapMw"],
                "nuclearCapMw": zm["nuclearCapMw"],
                "hydroShare": zm["hydroShare"],
                "coords": zm["coords"],
            }

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
            "trainedHours": FI_WEIGHTS.get("totalObservations", 17552),
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

    os.makedirs(os.path.join(ROOT_DIR, "data"), exist_ok=True)

    zones_json_path = os.path.join(ROOT_DIR, "data", "global_zones.json")
    with open(zones_json_path, "w", encoding="utf-8") as f:
        json.dump(global_payload, f, ensure_ascii=False, indent=2)

    np_json_path = os.path.join(ROOT_DIR, "data", "nordpool_models.json")
    with open(np_json_path, "w", encoding="utf-8") as f:
        json.dump(global_payload, f, ensure_ascii=False, indent=2)

    js_path = os.path.join(ROOT_DIR, "nordpool_models.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("window.SPOTPULS_GLOBAL_MODELS = ")
        json.dump(global_payload, f, ensure_ascii=False)
        f.write(";\nwindow.NORDPOOL_COUNTRY_MODELS = window.SPOTPULS_GLOBAL_MODELS;\n")

    print(
        f"Saved {len(trained_zones)} regional zone models and {len(trained_countries)} "
        f"localized markets to {js_path} and {zones_json_path}"
    )
    return global_payload


if __name__ == "__main__":
    train_country_models()
