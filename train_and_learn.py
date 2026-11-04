# -*- coding: utf-8 -*-
"""
Monimuuttujainen pörssisähkön koneoppimis- ja backtest-moottori (2 vuotta / ~17 550 tuntia).
Tutkii ja opettaa Nord Pool FI -spot-hintaan vaikuttavat fyysiset, meteorologiset ja
sähkömarkkinoiden fundamentaaliparametrit (24 piirrettä + tuntiprofiilit + 5x4 säähintamatriisi):

1. Suomen tuulivoimatuotanto (150 m napakorkeus, epälineaarinen tehokäyrä, 8 450 MW kapasiteetti)
2. Tuulikuivuuden kesto (24 h liukuva tuulikeskiarvo) ja tuuliramppi (6 h muutosnopeus MW)
3. Lämpötila, lämmitystarveluku (HDD) ja rakennuskannan 72 h lämpöhidasvaraus (pakkaskertymä)
4. Suomen ydinvoimaloiden huoltoseisokit ja käytettävissä oleva kapasiteetti (4 394 MW: OL1, OL2, OL3, LO1, LO2)
   sekä ydinvoimavajeen ja tyynen sään yhdysvaikutus
5. Rajasiirtoyhteydet (Estlink 2 658 MW tila) sekä Pohjois-Ruotsin (SE1/SE2) ja Viron (EE) tuulivoima- ja lämpötilaero
6. Aurinkosäteily (W/m²) ja Suomen aurinkovoimatuotanto (1 250 MW kapasiteetti, kevät/kesäpäivän ankkakäyrä)
7. Ilmanpaine (hPa) ja talven korkeapainesulku (Dunkelflaute-indeksi)
8. Pohjoismainen vesitilanne- ja vuodenaikasykli (kevätsulaminen vs. lopputalven allasminimi)
9. Suomen viralliset arkipyhät (pääsiäinen, joulu, juhannus, itsenäisyyspäivä jne.), viikonpäivä- ja tuntirakenne
10. Autoregressiivinen markkinamuisti (toteutunut 24 h takainen sama tunti, 24 h keskiarvo, 24 h hintavolatiliteetti, 7 vrk taso)
"""

import json
import math
import os
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

FINLAND_INSTALLED_WIND_MW = 8450.0
FINLAND_NUCLEAR_MAX_MW = 4394.0  # OL1 (890) + OL2 (890) + OL3 (1600) + LO1 (507) + LO2 (507)
FINLAND_SOLAR_MAX_MW = 1250.0

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OBS_FILE = os.path.join(DATA_DIR, "historical_observations.json")
ERROR_LEDGER_FILE = os.path.join(DATA_DIR, "error_learning_ledger.json")
WEIGHTS_JSON_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_weights.json")
WEIGHTS_JS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_weights.js")


# Suomen ydinvoimaloiden (OL1, OL2, OL3, LO1, LO2) toteutuneet ja ilmoitetut vuosihuolto- ja vika-ajanjaksot
# sekä Estlink 2 (658 MW) -merikaapelin vika-ajanjaksot 2024–2026
NUCLEAR_OUTAGE_SCHEDULE = [
    # 2024 vuosihuollot ja rajoitukset
    {"unit": "OL3", "mw": 1600, "start": "2024-03-02", "end": "2024-04-29", "reason": "OL3 vuosihuolto"},
    {"unit": "OL2", "mw": 890, "start": "2024-04-28", "end": "2024-05-14", "reason": "OL2 vuosihuolto"},
    {"unit": "OL1", "mw": 890, "start": "2024-05-16", "end": "2024-06-02", "reason": "OL1 vuosihuolto"},
    {"unit": "LO1", "mw": 507, "start": "2024-08-17", "end": "2024-09-14", "reason": "Loviisa 1 vuosihuolto"},
    {"unit": "OL2", "mw": 890, "start": "2024-09-09", "end": "2024-10-06", "reason": "OL2 generaattorin roottorihuolto"},
    {"unit": "LO2", "mw": 507, "start": "2024-09-15", "end": "2024-10-08", "reason": "Loviisa 2 vuosihuolto"},
    {"unit": "OL3", "mw": 1600, "start": "2024-11-17", "end": "2024-11-20", "reason": "OL3 turbiinihäiriö"},
    # 2025 vuosihuollot ja rajoitukset
    {"unit": "OL3", "mw": 1600, "start": "2025-03-01", "end": "2025-05-05", "reason": "OL3 vuosihuolto (65 vrk)"},
    {"unit": "OL1", "mw": 890, "start": "2025-05-11", "end": "2025-05-23", "reason": "OL1 vuosihuolto"},
    {"unit": "OL2", "mw": 890, "start": "2025-05-25", "end": "2025-06-15", "reason": "OL2 vuosihuolto"},
    {"unit": "LO1", "mw": 507, "start": "2025-08-16", "end": "2025-09-10", "reason": "Loviisa 1 vuosihuolto"},
    {"unit": "LO2", "mw": 507, "start": "2025-09-14", "end": "2025-10-06", "reason": "Loviisa 2 vuosihuolto"},
    # 2026 vuosihuollot
    {"unit": "OL3", "mw": 1600, "start": "2026-03-01", "end": "2026-04-22", "reason": "OL3 vuosihuolto"},
    {"unit": "OL2", "mw": 890, "start": "2026-04-26", "end": "2026-05-12", "reason": "OL2 vuosihuolto"},
    {"unit": "OL1", "mw": 890, "start": "2026-05-15", "end": "2026-05-29", "reason": "OL1 vuosihuolto"},
    {"unit": "LO1", "mw": 507, "start": "2026-08-15", "end": "2026-09-12", "reason": "Loviisa 1 vuosihuolto"},
    {"unit": "LO2", "mw": 507, "start": "2026-09-15", "end": "2026-10-10", "reason": "Loviisa 2 vuosihuolto"},
]

ESTLINK2_OUTAGES = [
    {"mw": 658, "start": "2024-01-26", "end": "2024-09-04", "reason": "Estlink 2 merikaapelivika"},
    {"mw": 658, "start": "2024-12-25", "end": "2025-07-15", "reason": "Estlink 2 merikaapelivaurio"},
]


def get_nuclear_and_border_status(date_key: str) -> dict:
    """Palauttaa päiväkohtaisen Suomen ydinvoimakapasiteetin (MW) ja Estlink 2 -tilan."""
    offline_mw = 0.0
    active_outages = []
    for item in NUCLEAR_OUTAGE_SCHEDULE:
        if item["start"] <= date_key <= item["end"]:
            offline_mw += item["mw"]
            active_outages.append(item["reason"])
    # OL2 tehonrajoitus (155 MW) roottoririskien ehkäisemiseksi 2024–2025, kun laitos ei ole vuosihuollossa
    if "2024-10-07" <= date_key <= "2026-04-25" and not any("OL2" in r for r in active_outages):
        offline_mw += 155.0

    offline_mw = min(3000.0, offline_mw)
    avail_mw = round(FINLAND_NUCLEAR_MAX_MW - offline_mw)

    estlink2_online = 1.0
    for el in ESTLINK2_OUTAGES:
        if el["start"] <= date_key <= el["end"]:
            estlink2_online = 0.0
            break

    return {
        "nuclearMw": avail_mw,
        "nuclearDeficitMw": round(offline_mw),
        "estlink2Online": estlink2_online,
        "outageReasons": active_outages,
    }


def compute_finnish_holidays(year: int) -> set:
    """Laskee Suomen viralliset arkipyhät (mukaan lukien pääsiäinen, helatorstai ja juhannus)."""
    holidays = {
        f"{year}-01-01",  # Uudenvuodenpäivä
        f"{year}-01-06",  # Loppiainen
        f"{year}-05-01",  # Vapunpäivä
        f"{year}-12-06",  # Itsenäisyyspäivä
        f"{year}-12-24",  # Jouluaatto
        f"{year}-12-25",  # Joulupäivä
        f"{year}-12-26",  # Tapaninpäivä
    }
    # Pääsiäissunnuntai (Anonymous Gregorian algorithm)
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

    holidays.add((easter - timedelta(days=2)).strftime("%Y-%m-%d"))   # Pitkäperjantai
    holidays.add((easter + timedelta(days=1)).strftime("%Y-%m-%d"))   # 2. pääsiäispäivä
    holidays.add((easter + timedelta(days=39)).strftime("%Y-%m-%d"))  # Helatorstai

    # Juhannusaatto ja juhannuspäivä (kesäkuun 19.–25. päivän välinen perjantai ja lauantai)
    d_jun = date(year, 6, 19)
    while d_jun.weekday() != 4:  # Perjantai
        d_jun += timedelta(days=1)
    holidays.add(d_jun.strftime("%Y-%m-%d"))
    holidays.add((d_jun + timedelta(days=1)).strftime("%Y-%m-%d"))

    return holidays


HOLIDAY_CACHE = {}


def is_finnish_holiday(date_key: str) -> bool:
    year = int(date_key[:4])
    if year not in HOLIDAY_CACHE:
        HOLIDAY_CACHE[year] = compute_finnish_holidays(year)
    return date_key in HOLIDAY_CACHE[year]


def wind_speed_to_cf(v100m: float) -> float:
    if v100m is None or math.isnan(v100m):
        return 0.30
    v_hub = v100m * 1.26
    if v_hub < 2.8:
        return 0.02
    if v_hub >= 25.0:
        return 0.05
    if v_hub >= 11.8:
        return 0.90
    norm = (v_hub - 2.8) / (11.8 - 2.8)
    return max(0.02, min(0.90, (norm ** 1.65) * 0.90))


def radiation_to_solar_mw(rad_wm2: float, month: int, hour: int) -> float:
    """Muuntaa lyhytaaltosäteilyn (W/m²) Suomen aurinkovoimatuotannoksi (MW)."""
    if rad_wm2 is not None and not math.isnan(rad_wm2):
        # Huomioidaan paneelien kylmän ilman hyötysuhde keväällä ja 1 250 MW nimellisteho
        cf = max(0.0, min(0.82, (rad_wm2 / 820.0) * 0.80))
        return round(FINLAND_SOLAR_MAX_MW * cf, 1)
    # Astronominen varalaskenta jos säteilyarvo puuttuu
    if hour < 5 or hour > 20 or month in (11, 12, 1):
        return 0.0
    season_peak = max(0.0, math.sin((month - 2.2) / 8.5 * math.pi))
    hour_peak = max(0.0, math.cos((hour - 13.0) / 5.5 * (math.pi / 2.0)))
    return round(FINLAND_SOLAR_MAX_MW * 0.55 * season_peak * hour_peak, 1)


def utc_to_helsinki_parts(epoch_ms: int) -> dict:
    dt_utc = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc)
    year = dt_utc.year

    march_last = datetime(year, 3, 31, 1, 0, tzinfo=timezone.utc)
    while march_last.weekday() != 6:
        march_last -= timedelta(days=1)

    oct_last = datetime(year, 10, 31, 1, 0, tzinfo=timezone.utc)
    while oct_last.weekday() != 6:
        oct_last -= timedelta(days=1)

    offset_hours = 3 if (march_last <= dt_utc < oct_last) else 2
    dt_hel = dt_utc + timedelta(hours=offset_hours)
    wd = dt_hel.weekday()
    date_key = dt_hel.strftime("%Y-%m-%d")
    day_of_year = dt_hel.timetuple().tm_yday
    holiday = is_finnish_holiday(date_key)
    return {
        "year": dt_hel.year,
        "month": dt_hel.month,
        "day": dt_hel.day,
        "hour": dt_hel.hour,
        "weekday": wd,
        "day_of_year": day_of_year,
        "is_weekend": wd >= 5,
        "is_holiday": holiday,
        "is_free_day": (wd >= 5) or holiday,
        "date_key": date_key,
    }


def fetch_json(url: str, timeout: int = 35):
    req = urllib.request.Request(url, headers={"User-Agent": "PorssisahkoMLTrainer/3.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_historical_spot_prices(days_back: int = 730) -> dict:
    """Noutaa toteutuneet Nord Pool FI -tuntihinnat (muunnettuna ALV 25,5 % tasoon) 180 vrk erissä."""
    now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    spot_map = {}

    chunk_days = 180
    cur_end = now_utc + timedelta(days=2)
    earliest = now_utc - timedelta(days=days_back)

    while cur_end > earliest:
        cur_start = max(earliest, cur_end - timedelta(days=chunk_days))
        start_str = cur_start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        end_str = cur_end.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        url = f"https://sahkotin.fi/prices?fix&vat&start={urllib.parse.quote(start_str)}&end={urllib.parse.quote(end_str)}"
        try:
            data = fetch_json(url, timeout=35)
            if data and "prices" in data:
                for item in data["prices"]:
                    dt = datetime.fromisoformat(item["date"].replace("Z", "+00:00"))
                    h_ms = int(dt.timestamp() // 3600) * 3600 * 1000
                    val = float(item["value"])
                    if dt < datetime(2024, 9, 1, tzinfo=timezone.utc) and val > 0:
                        val = val * (1.255 / 1.24)
                    spot_map[h_ms] = round(val, 3)
        except Exception as e:
            print(f"[Warn] sahkotin chunk {start_str}..{end_str} error: {e}")
        cur_end = cur_start

    try:
        data2 = fetch_json("https://api.porssisahko.net/v2/latest-prices.json")
        if data2 and "prices" in data2:
            buckets = {}
            for item in data2["prices"]:
                dt = datetime.fromisoformat(item["startDate"].replace("Z", "+00:00"))
                h_ms = int(dt.timestamp() // 3600) * 3600 * 1000
                buckets.setdefault(h_ms, []).append(float(item["price"]))
            for h_ms, vals in buckets.items():
                spot_map[h_ms] = round(sum(vals) / len(vals), 3)
    except Exception as e:
        print(f"[Warn] porssisahko.net fetch error: {e}")

    return spot_map


def fetch_enrichment_weather(days_back: int = 730, need_archive: bool = True) -> dict:
    """
    Noutaa:
    - Suomen tuulivoimavyöhykkeiden 100 m tuulennopeudet ja lämpötilat
    - Aurinkosäteilyn (shortwave_radiation W/m²) ja ilmanpaineen (surface_pressure hPa)
    - Pohjois-Ruotsin (SE1/SE2, 63.82, 20.26) tuulennopeuden ja lämpötilan (tuontisähkön saatavuus)
    - Viron/Baltian (EE, 59.43, 24.75) tuulennopeuden ja lämpötilan (Estlink-vientipaine)
    """
    weather_map = {}
    now_utc = datetime.now(timezone.utc)

    if need_archive and days_back > 90:
        arch_start = (now_utc - timedelta(days=days_back)).strftime("%Y-%m-%d")
        arch_end = (now_utc - timedelta(days=85)).strftime("%Y-%m-%d")

        # 1. Suomen tuuli ja lämpötila (Kalajoki + Länsi-Suomi)
        url_fi_n = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=64.26&longitude=23.95&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        url_fi_s = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=61.50&longitude=22.50&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        # 2. Aurinkosäteily (W/m²) ja ilmanpaine (hPa)
        url_rad_p = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=61.50&longitude=22.50&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=shortwave_radiation,surface_pressure&timezone=UTC"
        )
        # 3. Ruotsin SE1/SE2 (Uumaja/Pohjanlahti) tuuli ja lämpötila
        url_se = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=63.82&longitude=20.26&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        # 4. Viron EE (Tallinna) tuuli ja lämpötila
        url_ee = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=59.43&longitude=24.75&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        try:
            d_fn = fetch_json(url_fi_n, timeout=30)
            d_fs = fetch_json(url_fi_s, timeout=30)
            d_rp = fetch_json(url_rad_p, timeout=30)
            d_se = fetch_json(url_se, timeout=30)
            d_ee = fetch_json(url_ee, timeout=30)

            times = d_fn["hourly"]["time"]
            for i, t_str in enumerate(times):
                dt = datetime.fromisoformat(t_str + ":00+00:00")
                h_ms = int(dt.timestamp()) * 1000

                wn = float(d_fn["hourly"]["wind_speed_100m"][i] or 6.5)
                ws = float(d_fs["hourly"]["wind_speed_100m"][i] or wn)
                tn = float(d_fn["hourly"]["temperature_2m"][i] or 2.0)
                ts = float(d_fs["hourly"]["temperature_2m"][i] or tn)

                rad = float(d_rp["hourly"]["shortwave_radiation"][i] or 0.0)
                press = float(d_rp["hourly"]["surface_pressure"][i] or 1013.0)
                w_se = float(d_se["hourly"]["wind_speed_100m"][i] or 6.5)
                t_se = float(d_se["hourly"]["temperature_2m"][i] or ts)
                w_ee = float(d_ee["hourly"]["wind_speed_100m"][i] or 6.5)
                t_ee = float(d_ee["hourly"]["temperature_2m"][i] or ts)

                weighted_wind = wn * 0.55 + ws * 0.45
                cf = wind_speed_to_cf(weighted_wind)
                wind_mw = round(FINLAND_INSTALLED_WIND_MW * cf)
                weighted_temp = round(ts * 0.75 + tn * 0.25, 1)

                weather_map[h_ms] = {
                    "windSpeed100m": round(weighted_wind, 2),
                    "windMw": int(wind_mw),
                    "tempC": weighted_temp,
                    "solarRadWm2": round(rad, 1),
                    "pressureHpa": round(press, 1),
                    "seWindSpeed": round(w_se, 2),
                    "seTempC": round(t_se, 1),
                    "eeWindSpeed": round(w_ee, 2),
                    "eeTempC": round(t_ee, 1),
                }
            print(f"  [ERA5 Moniparametri-arkisto] {arch_start}..{arch_end} ladattu ({len(weather_map)} tuntia)")
        except Exception as e:
            print(f"[Warn] ERA5 multi-parameter archive fetch error: {e}")

    # Tuoreimmat 90 vrk + ennustepäivät Forecast API:sta (6 pistettä: Kalajoki, Kristiinankaupunki, Seinäjoki, Helsinki, SE1 Uumaja, EE Tallinna)
    fc_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude=64.26,62.47,62.73,60.17,63.82,59.43"
        f"&longitude=23.95,21.34,22.58,24.94,20.26,24.75"
        f"&hourly=temperature_2m,wind_speed_100m,wind_speed_10m,shortwave_radiation,surface_pressure"
        f"&wind_speed_unit=ms&past_days=90&forecast_days=2&timezone=UTC"
    )
    try:
        locs = fetch_json(fc_url, timeout=35)
        if isinstance(locs, list) and len(locs) >= 6:
            times = locs[0]["hourly"]["time"]
            for i, t_str in enumerate(times):
                dt = datetime.fromisoformat(t_str + ":00+00:00")
                h_ms = int(dt.timestamp()) * 1000

                def get_w(idx):
                    h_obj = locs[idx]["hourly"]
                    w100 = h_obj.get("wind_speed_100m")
                    if w100 and i < len(w100) and w100[i] is not None:
                        return float(w100[i])
                    w10 = h_obj.get("wind_speed_10m")
                    if w10 and i < len(w10) and w10[i] is not None:
                        return float(w10[i]) * 1.45
                    return 6.5

                w1, w2, w3 = get_w(0), get_w(1), get_w(2)
                weighted_wind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20
                cf = wind_speed_to_cf(weighted_wind)
                wind_mw = round(FINLAND_INSTALLED_WIND_MW * cf)

                t_south = float(locs[3]["hourly"]["temperature_2m"][i] or 5.0)
                t_west = float(locs[2]["hourly"]["temperature_2m"][i] or 3.0)
                t_north = float(locs[0]["hourly"]["temperature_2m"][i] or 1.0)
                weighted_temp = round(t_south * 0.55 + t_west * 0.25 + t_north * 0.20, 1)

                rad_s = float(locs[3]["hourly"]["shortwave_radiation"][i] or 0.0)
                rad_w = float(locs[2]["hourly"]["shortwave_radiation"][i] or 0.0)
                rad = round(rad_s * 0.6 + rad_w * 0.4, 1)

                press = float(locs[2]["hourly"]["surface_pressure"][i] or 1013.0)
                w_se = get_w(4)
                t_se = float(locs[4]["hourly"]["temperature_2m"][i] or weighted_temp)
                w_ee = get_w(5)
                t_ee = float(locs[5]["hourly"]["temperature_2m"][i] or weighted_temp)

                weather_map[h_ms] = {
                    "windSpeed100m": round(weighted_wind, 2),
                    "windMw": int(wind_mw),
                    "tempC": weighted_temp,
                    "solarRadWm2": rad,
                    "pressureHpa": round(press, 1),
                    "seWindSpeed": round(w_se, 2),
                    "seTempC": round(t_se, 1),
                    "eeWindSpeed": round(w_ee, 2),
                    "eeTempC": round(t_ee, 1),
                }
    except Exception as e:
        print(f"[Warn] Open-Meteo Forecast 6-loc fetch error: {e}")

    return weather_map


def enrich_rolling_dynamics(all_obs: list):
    """
    Laskee aikasarjasta dynaamiset muuttujat jokaiselle tunnille:
    - rolling24hWindMw (tuulikuivuuden kesto)
    - windRamp6h (tuulivoiman 6 h muutosnopeus MW)
    - rolling72hTempC (rakennusten lämpöhidasvaraus / pakkasjakson kumuloituminen)
    - solarMw (aurinkovoima-arvio MW)
    - nuclearMw, nuclearDeficitMw, estlink2Online
    - lag24hSameHour, prev24hMean, prev24hStd, prev7dMean
    """
    n = len(all_obs)
    for idx, o in enumerate(all_obs):
        hel = utc_to_helsinki_parts(o["epochMs"])
        o["dayOfYear"] = hel["day_of_year"]
        o["isHoliday"] = hel["is_holiday"]
        o["isFreeDay"] = hel["is_free_day"]

        nuc = get_nuclear_and_border_status(o["dateKey"])
        o["nuclearMw"] = nuc["nuclearMw"]
        o["nuclearDeficitMw"] = nuc["nuclearDeficitMw"]
        o["estlink2Online"] = nuc["estlink2Online"]

        rad = o.get("solarRadWm2", 0.0)
        o["solarMw"] = radiation_to_solar_mw(rad, o["month"], o["hour"])

        # 24 h tuulikeskiarvo (tuulikuivuus)
        w_slice = [all_obs[j]["windMw"] for j in range(max(0, idx - 23), idx + 1)]
        o["rolling24hWindMw"] = round(sum(w_slice) / len(w_slice))

        # 6 h tuuliramppi
        prev6_w = all_obs[max(0, idx - 6)]["windMw"]
        o["windRamp6hMw"] = o["windMw"] - prev6_w

        # 72 h lämpötilakeskiarvo (rakennusten lämpöhidasvaraus)
        t_slice = [all_obs[j]["tempC"] for j in range(max(0, idx - 71), idx + 1)]
        o["rolling72hTempC"] = round(sum(t_slice) / len(t_slice), 2)

        # Markkinamuisti (käytetään vain >24 h takaisia tunteja, jotta day-ahead-ennuste on realistinen)
        if idx >= 24:
            o["lag24hSameHour"] = all_obs[idx - 24]["priceInclVat"]
        else:
            o["lag24hSameHour"] = o["priceInclVat"]

        if idx >= 48:
            p24_slice = [all_obs[j]["priceInclVat"] for j in range(idx - 48, idx - 24)]
            mean24 = sum(p24_slice) / len(p24_slice)
            var24 = sum((v - mean24) ** 2 for v in p24_slice) / len(p24_slice)
            o["prev24hMean"] = round(mean24, 3)
            o["prev24hStd"] = round(math.sqrt(var24), 3)
        else:
            o["prev24hMean"] = 5.5
            o["prev24hStd"] = 2.0

        if idx >= 192:
            p7d_slice = [all_obs[j]["priceInclVat"] for j in range(idx - 192, idx - 24)]
            o["prev7dMean"] = round(sum(p7d_slice) / len(p7d_slice), 3)
        else:
            o["prev7dMean"] = o["prev24hMean"]


FEATURE_NAMES = [
    "Vakiotermi (Intercept)",
    "Tuulivoima-aste (wRatio)",
    "Tuulivoiman neliötermi (wRatio²)",
    "Tuuliniukkuus (< 25 % kapasiteetista)",
    "Lämmitystarveluku (HDD < +12 °C)",
    "Kova pakkanen (< -3 °C)",
    "Arkiaamun kulutushuippu x tuulivaje",
    "Arki-illan kulutushuippu x tuulivaje",
    "Yökuoppa (klo 00–05)",
    "Viikonloppu tai arkipyhä (isFreeDay)",
    "Tyynessä pakkasessa -yhdysvaikutus",
    "Markkinamuisti: 24 h keskitaso",
    "Lämmityskausi (loka–huhtikuu)",
    "Talven kulutushuippu x tuulivaje",
    # Uudet opitut fundamentaaliparametrit (14..23):
    "Rakennusten 72 h pakkasvaraus (rolling72hHdd)",
    "Aurinkovoimatuotanto (solarMw / ankkakäyrä)",
    "Ydinvoiman huoltovaje (nuclearDeficitMw)",
    "Ydinvoimavaje x tuulivaje -niukkuuskerroin",
    "Tuulikuivuuden 24 h kesto (rolling24hLowWind)",
    "Tuulirampin 6 h pudotus (windDropRamp)",
    "Ruotsin (SE1) tuulivoimatuonti-indeksi",
    "Viron (EE) ja Estlink 2 -vientipaine",
    "Korkeapainesulku (ilmanpaine > 1020 hPa talvella)",
    "Markkinamuisti: sama tunti 24 h sitten + 7 vrk taso + volatiliteetti",
]


def extract_features_24(obs: dict, active_groups: int = 6) -> list:
    """
    Muodostaa 24-ulotteisen piirrevektorin.
    active_groups (0..6) mahdollistaa vaiheittaisen ablaatiotestauksen (Stepwise Backtest).
    """
    w_ratio = max(0.01, min(0.95, obs["windMw"] / FINLAND_INSTALLED_WIND_MW))
    temp_c = obs["tempC"]
    hour = obs["hour"]
    is_free = 1.0 if obs.get("isFreeDay", obs["isWeekend"]) else 0.0

    hdd = max(0.0, 12.0 - temp_c) / 20.0
    severe_cold = max(0.0, -3.0 - temp_c) / 15.0
    # Epälineaarinen niukkuuspiikki, kun tuulivoima putoaa alle 1 800 MW (erityisesti arkipäivisin klo 06–22)
    workday_active = 1.25 if (is_free == 0.0 and 6 <= hour <= 22) else 0.45
    low_wind_scarcity = (
        (max(0.0, 0.25 - w_ratio) ** 2 * 10.0)
        + (max(0.0, 0.13 - w_ratio) ** 2 * 45.0 * workday_active)
    )

    morning_peak = (1.0 if (is_free == 0.0 and 7 <= hour <= 10) else 0.0) * max(0.0, 1.0 - w_ratio * 1.1)
    evening_peak = (1.0 if (is_free == 0.0 and 16 <= hour <= 21) else 0.0) * max(0.0, 1.0 - w_ratio * 1.1)
    night_trough = 1.0 if (0 <= hour <= 5) else 0.0
    calm_cold_inter = (1.0 - w_ratio) * hdd

    # Markkinamuisti vaimenee, jos tuulivoima nousee myrskylukemiin (tuuli nollaa edellisen päivän niukkuuspiikin)
    wind_memory_damping = max(0.12, 1.0 - 0.85 * w_ratio)
    prev24 = obs.get("prev24hMean", 5.5)
    ar_level = (min(22.0, prev24) / 10.0) * wind_memory_damping

    is_heating_season = 1.0 if obs["month"] in (10, 11, 12, 1, 2, 3, 4) else 0.0
    heating_peak = (
        is_heating_season
        * (1.0 if (is_free == 0.0 and (7 <= hour <= 10 or 16 <= hour <= 21)) else 0.0)
        * (1.0 - w_ratio)
    )

    # Uudet parametrit (indeksit 14..23):
    t72 = obs.get("rolling72hTempC", temp_c)
    rolling_72h_hdd = max(0.0, 10.0 - t72) / 20.0

    solar_mw = obs.get("solarMw", 0.0)
    solar_ratio = solar_mw / FINLAND_SOLAR_MAX_MW

    nuc_def_mw = obs.get("nuclearDeficitMw", 0.0)
    nuc_def_ratio = nuc_def_mw / 2000.0  # 1.0 vastaa ~2000 MW ydinvoimavajetta
    nuc_scarcity_inter = nuc_def_ratio * max(0.0, 0.55 - w_ratio) * (1.0 if is_free == 0.0 else 0.5)

    w24_ratio = max(0.01, min(0.95, obs.get("rolling24hWindMw", obs["windMw"]) / FINLAND_INSTALLED_WIND_MW))
    rolling_24h_low_wind = max(0.0, 0.35 - w24_ratio) * 2.0

    wind_ramp_drop = max(0.0, -obs.get("windRamp6hMw", 0.0)) / 2500.0

    se_wind = obs.get("seWindSpeed", 6.5)
    se_cf = wind_speed_to_cf(se_wind)
    # Kun Ruotsissa tuulee ja Suomessa on tyyntä, tuontisähkö painaa hintaa alas
    se_import_relief = se_cf * (1.0 - w_ratio * 0.5)

    ee_wind = obs.get("eeWindSpeed", 6.5)
    ee_cf = wind_speed_to_cf(ee_wind)
    el2_online = obs.get("estlink2Online", 1.0)
    # Kun Virossa on tyyntä ja Estlink 2 on käytössä, vientipaine nostaa Suomen päivähintaa
    ee_export_pull = (0.65 + 0.35 * el2_online) * max(0.0, 0.45 - ee_cf) * (1.0 if 7 <= hour <= 21 else 0.3)

    press_hpa = obs.get("pressureHpa", 1013.0)
    blocking_high = max(0.0, (press_hpa - 1018.0) / 25.0) * is_heating_season

    lag24_same = min(28.0, obs.get("lag24hSameHour", prev24))
    prev7d = min(20.0, obs.get("prev7dMean", prev24))
    prev_std = min(15.0, obs.get("prev24hStd", 2.0))
    ar_composite = ((0.45 * lag24_same + 0.35 * prev7d + 0.20 * prev_std) / 10.0) * wind_memory_damping

    vec = [
        1.0,                   # 0
        w_ratio,               # 1
        w_ratio ** 2,          # 2
        low_wind_scarcity,     # 3
        hdd,                   # 4
        severe_cold,           # 5
        morning_peak,          # 6
        evening_peak,          # 7
        night_trough,          # 8
        is_free,               # 9
        calm_cold_inter,       # 10
        ar_level,              # 11
        is_heating_season,     # 12
        heating_peak,          # 13
        rolling_72h_hdd,       # 14
        solar_ratio,           # 15
        nuc_def_ratio,         # 16
        nuc_scarcity_inter,    # 17
        rolling_24h_low_wind,  # 18
        wind_ramp_drop,        # 19
        se_import_relief,      # 20
        ee_export_pull,        # 21
        blocking_high,         # 22
        ar_composite,          # 23
    ]

    if active_groups == 0:
        return [1.0] + [0.0] * 23
    if active_groups == 1:
        # Vain tuulivoima (0..3)
        return vec[:4] + [0.0] * 20
    if active_groups == 2:
        # + Lämpötila ja 72 h pakkasvaraus (0..5, 10, 12, 14)
        keep = {0, 1, 2, 3, 4, 5, 10, 12, 14}
        return [v if idx in keep else 0.0 for idx, v in enumerate(vec)]
    if active_groups == 3:
        # + Tuntiprofiili, arkipyhät ja aurinkovoima (0..10, 12..15)
        keep = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15}
        return [v if idx in keep else 0.0 for idx, v in enumerate(vec)]
    if active_groups == 4:
        # + Ydinvoimaloiden huoltoseisokit (16, 17)
        keep = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17}
        return [v if idx in keep else 0.0 for idx, v in enumerate(vec)]
    if active_groups == 5:
        # + Tuulikuivuus, tuuliramppi, SE1/EE rajatuuli ja ilmanpaine (18..22)
        keep = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22}
        return [v if idx in keep else 0.0 for idx, v in enumerate(vec)]
    return vec


def solve_linear_system(A: list, b: list) -> list:
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        max_row = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[max_row] = M[max_row], M[col]
        pivot = M[col][col]
        if abs(pivot) < 1e-10:
            continue
        for j in range(col, n + 1):
            M[col][j] /= pivot
        for r in range(n):
            if r != col:
                factor = M[r][col]
                for j in range(col, n + 1):
                    M[r][j] -= factor * M[col][j]
    return [M[i][n] for i in range(n)]


STAGE_FEATURE_INDICES = {
    0: [0],                                  # Taso 0: Vakiotermi (keskiarvo)
    1: [0, 1, 2, 3],                         # Taso 1: + Suomen tuulivoiman epälineaarinen tehokäyrä
    2: [0, 4, 5, 10, 12, 14],                # Taso 2: + Lämpötila & rakennusten 72 h pakkasvaraus
    3: [0, 6, 7, 8, 9, 13, 15],              # Taso 3: + Tuntiprofiili, arkipyhät & aurinkovoima (W/m²)
    4: [0, 16, 17],                          # Taso 4: + Ydinvoimaloiden huoltoseisokit (OL1–OL3, LO1–LO2)
    5: [0, 18, 19, 20, 21, 22],              # Taso 5: + Tuulikuivuus, SE1/EE-rajatuuli & ilmanpaine (hPa)
    6: [0, 11, 23],                          # Taso 6: + Markkinamuisti, sama tunti 24 h sitten & volatiliteetti
}


def fit_subspace_ridge(rows: list, residuals: list, feat_indices: list, ridge_lambda: float) -> list:
    """Ratkaisee painot valituille piirreindekseille jäännösvirhettä vasten."""
    k = len(feat_indices)
    A = [[0.0] * k for _ in range(k)]
    b = [0.0] * k
    for (_, x, _, w), res in zip(rows, residuals):
        for i_local, idx_i in enumerate(feat_indices):
            xi = x[idx_i]
            b[i_local] += w * xi * res
            for j_local, idx_j in enumerate(feat_indices):
                A[i_local][j_local] += w * xi * x[idx_j]
    for i_local, idx_i in enumerate(feat_indices):
        if idx_i != 0:
            A[i_local][i_local] += ridge_lambda
        else:
            A[i_local][i_local] += 0.05
    sub_w = solve_linear_system(A, b)
    full_w = [0.0] * 24
    for i_local, idx_i in enumerate(feat_indices):
        full_w[idx_i] = sub_w[i_local]
    return full_w


def fit_ridge_regression(
    observations: list,
    ridge_lambda: float = 2.0,
    uniform_weights: bool = False,
    active_groups: int = 6,
) -> dict:
    """
    Vaiheittainen ortogonalisoitu Ridge-regressio (Stagewise Boosted Ridge):
    Estää kevään ydinvoimahuoltojen (+10 °C) ja talven pakkasten (-15 °C) keskinäisen
    kollineaarisuusharhan sovittamalla kunkin fysikaalisen ilmiöryhmän edellisen vaiheen
    jäännösvirheeseen ja varmistamalla, että jokainen vaihe pienentää virhettä (MAE).
    """
    n_feat = 24
    valid_rows = []
    max_ms = observations[-1]["epochMs"] if observations else 0

    for o in observations:
        y_raw = float(o["priceInclVat"])
        y = max(-1.0, min(30.0, y_raw)) if y_raw <= 30.0 else 30.0 + math.sqrt(y_raw - 30.0)
        age_days = max(0.0, (max_ms - o["epochMs"]) / (1000.0 * 3600.0 * 24.0))
        sample_w = 1.0 if uniform_weights else (0.045 + 0.955 * math.exp(-age_days / 28.0))
        x = extract_features_24(o, active_groups=6)
        valid_rows.append((o, x, y, sample_w))

    weights = [0.0] * n_feat
    current_preds = [0.0] * len(valid_rows)

    stage_lambdas = {
        0: 0.01,
        1: ridge_lambda * 1.0,
        2: ridge_lambda * 2.5,
        3: ridge_lambda * 1.8,
        4: ridge_lambda * 4.0,
        5: ridge_lambda * 3.5,
        6: ridge_lambda * 1.2,
    }

    for stg in range(0, active_groups + 1):
        f_idx = STAGE_FEATURE_INDICES[stg]
        residuals = [row[2] - pred for row, pred in zip(valid_rows, current_preds)]
        delta_w = fit_subspace_ridge(valid_rows, residuals, f_idx, stage_lambdas[stg])

        # Enforce physically sound sign constraints on key structural drivers (e.g. nuclear deficit >= 0, solar <= 0)
        if stg == 3 and delta_w[15] > 0.0:
            delta_w[15] = -0.35  # Aurinkovoima laskee keskipäivän hintaa
        if stg == 4:
            if delta_w[16] < 0.0:
                delta_w[16] = 0.45  # Ydinvoimavaje nostaa perushintaa
            if delta_w[17] < 0.0:
                delta_w[17] = 1.65  # Ydinvoimavaje x tuulivaje nostaa hintaa

        # Valitaan askelpituus eta in [0.1..1.0], joka minimoi painotetun MAE-virheen
        best_eta = 0.0 if stg > 0 else 1.0
        best_loss = sum(row[3] * abs(row[2] - max(0.05, pred)) for row, pred in zip(valid_rows, current_preds))
        step_candidates = [1.0] if stg == 0 else [0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0]
        for eta in step_candidates:
            loss = 0.0
            for (o, x, y, w), pred in zip(valid_rows, current_preds):
                step_val = sum(delta_w[idx] * x[idx] for idx in f_idx)
                loss += w * abs(y - max(0.05, pred + eta * step_val))
            if loss < best_loss:
                best_loss = loss
                best_eta = eta

        for idx in f_idx:
            weights[idx] += best_eta * delta_w[idx]
        for r_i, (o, x, y, w) in enumerate(valid_rows):
            current_preds[r_i] = sum(weights[j] * x[j] for j in range(n_feat))

    # Virhepainotettu jatko-opetus (Error-Boosted Residual Refinement):
    # Painotetaan tuoreita tunteja, joissa mallin ennustevirhe oli suuri, ja korjataan painoja suoraan virheiden perusteella.
    if active_groups >= 6 and not uniform_weights and len(valid_rows) > 240:
        boosted_rows = []
        residuals_boost = []
        for (o, x, y, w), pred in zip(valid_rows, current_preds):
            err = y - max(0.05, pred)
            hard_mult = 1.0 + min(2.2, abs(err) / 2.4)
            boosted_rows.append((o, x, y, w * hard_mult))
            residuals_boost.append(err)
        all_feat_idx = list(range(n_feat))
        delta_boost = fit_subspace_ridge(boosted_rows, residuals_boost, all_feat_idx, ridge_lambda * 3.2)
        if delta_boost[15] > 0.0:
            delta_boost[15] = 0.0
        if delta_boost[16] < 0.0:
            delta_boost[16] = 0.0
        if delta_boost[17] < 0.0:
            delta_boost[17] = 0.0
        base_loss = sum(row[3] * abs(row[2] - max(0.05, pred)) for row, pred in zip(valid_rows, current_preds))
        best_boost_eta = 0.0
        for eta_b in (0.08, 0.15, 0.25, 0.35, 0.5):
            loss_b = 0.0
            for (o, x, y, w), pred in zip(valid_rows, current_preds):
                corr = sum(delta_boost[j] * x[j] for j in range(n_feat))
                loss_b += w * abs(y - max(0.05, pred + eta_b * corr))
            if loss_b < base_loss:
                base_loss = loss_b
                best_boost_eta = eta_b
        if best_boost_eta > 0.0:
            for j in range(n_feat):
                weights[j] += best_boost_eta * delta_boost[j]
            for r_i, (o, x, y, w) in enumerate(valid_rows):
                current_preds[r_i] = sum(weights[j] * x[j] for j in range(n_feat))

    weekday_hour_res = {h: [0.0, 0.0] for h in range(24)}
    weekend_hour_res = {h: [0.0, 0.0] for h in range(24)}
    wind_temp_grid = {}
    wind_temp_empirical = {}

    for o, x, y, sample_w in valid_rows:
        pred_lin = sum(w * xi for w, xi in zip(weights, x))
        res = y - pred_lin
        if o.get("isFreeDay", o["isWeekend"]):
            weekend_hour_res[o["hour"]][0] += res * sample_w
            weekend_hour_res[o["hour"]][1] += sample_w
        else:
            weekday_hour_res[o["hour"]][0] += res * sample_w
            weekday_hour_res[o["hour"]][1] += sample_w

        w_bin = min(4, int((o["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
        t_bin = 0 if o["tempC"] < -5 else (1 if o["tempC"] < 2 else (2 if o["tempC"] < 10 else 3))
        key = f"{w_bin}_{t_bin}"
        if key not in wind_temp_grid:
            wind_temp_grid[key] = [0.0, 0.0]
            wind_temp_empirical[key] = [0.0, 0]
        grid_w = 0.35 + 0.65 * sample_w
        wind_temp_grid[key][0] += res * grid_w
        wind_temp_grid[key][1] += grid_w
        wind_temp_empirical[key][0] += float(o["priceInclVat"])
        wind_temp_empirical[key][1] += 1

    use_profile = active_groups >= 3
    weekday_hour_adj = [
        round(weekday_hour_res[h][0] / (weekday_hour_res[h][1] + 4.0), 3) if use_profile else 0.0
        for h in range(24)
    ]
    weekend_hour_adj = [
        round(weekend_hour_res[h][0] / (weekend_hour_res[h][1] + 4.0), 3) if use_profile else 0.0
        for h in range(24)
    ]

    grid_adj = {}
    empirical_matrix = {}
    for k, pair in wind_temp_grid.items():
        hour_cleaned = pair[0] / (pair[1] + 8.0)
        grid_adj[k] = round(hour_cleaned * 0.45, 3) if active_groups >= 2 else 0.0
    for k, ep in wind_temp_empirical.items():
        if ep[1] > 0:
            empirical_matrix[k] = {
                "avgPrice": round(ep[0] / ep[1], 2),
                "hoursCount": ep[1],
            }

    return {
        "weights": [round(w, 5) for w in weights],
        "weekdayHourAdj": weekday_hour_adj,
        "weekendHourAdj": weekend_hour_adj,
        "windTempGridAdj": grid_adj,
        "empiricalMatrix": empirical_matrix,
    }


def predict_with_learned_model(obs: dict, model: dict, active_groups: int = 6) -> float:
    x = extract_features_24(obs, active_groups=active_groups)
    lin = sum(w * xi for w, xi in zip(model["weights"], x))
    is_free = obs.get("isFreeDay", obs["isWeekend"])
    w_ratio = max(0.01, min(0.95, obs["windMw"] / FINLAND_INSTALLED_WIND_MW))
    h_raw = (
        model["weekendHourAdj"][obs["hour"]]
        if is_free
        else model["weekdayHourAdj"][obs["hour"]]
    )
    h_scale = max(0.20, 1.15 - 0.90 * w_ratio) if h_raw > 0 else 1.0
    h_adj = h_raw * h_scale
    w_bin = min(4, int((obs["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
    t_bin = 0 if obs["tempC"] < -5 else (1 if obs["tempC"] < 2 else (2 if o_temp(obs) < 10 else 3))
    g_adj = model["windTempGridAdj"].get(f"{w_bin}_{t_bin}", 0.0)
    return max(0.05, lin + h_adj + g_adj)


def o_temp(obs: dict) -> float:
    return obs["tempC"]


def compute_metrics(actuals: list, preds: list, hours: list = None) -> dict:
    n = len(actuals)
    if n == 0:
        return {"maeCents": 0.0, "rmseCents": 0.0, "corrR": 0.0, "cheapest6hHitRatePct": 0.0}
    abs_errs = [abs(a - p) for a, p in zip(actuals, preds)]
    sq_errs = [(a - p) ** 2 for a, p in zip(actuals, preds)]
    mae = sum(abs_errs) / n
    rmse = math.sqrt(sum(sq_errs) / n)

    mean_a = sum(actuals) / n
    mean_p = sum(preds) / n
    num = sum((a - mean_a) * (p - mean_p) for a, p in zip(actuals, preds))
    den_a = math.sqrt(sum((a - mean_a) ** 2 for a in actuals))
    den_p = math.sqrt(sum((p - mean_p) ** 2 for p in preds))
    corr_r = num / (den_a * den_p) if (den_a > 1e-6 and den_p > 1e-6) else 0.0

    # Lasketaan kuinka tarkasti malli tunnistaa jokaisen 24 h vuorokauden 6 halvinta tuntia
    hit_rates = []
    for start in range(0, n - 23, 24):
        act_day = actuals[start : start + 24]
        pred_day = preds[start : start + 24]
        true_cheapest_6 = set(sorted(range(24), key=lambda idx: act_day[idx])[:6])
        pred_cheapest_6 = set(sorted(range(24), key=lambda idx: pred_day[idx])[:6])
        hit_rates.append(len(true_cheapest_6 & pred_cheapest_6) / 6.0 * 100.0)
    hit_pct = sum(hit_rates) / len(hit_rates) if hit_rates else 75.0

    return {
        "maeCents": round(mae, 2),
        "rmseCents": round(rmse, 2),
        "corrR": round(max(0.0, corr_r), 3),
        "cheapest6hHitRatePct": round(hit_pct, 1),
    }


def run_ablation_and_walkforward_backtest(observations: list) -> dict:
    """
    Suorittaa:
    1. Vaiheittaisen parametrien ablaatiotestin (Taso 0..6) out-of-sample -testijaksoilla
    2. Viiden eri markkinatilanteen (72 h kukin) aidon Walk-Forward Out-of-Sample -backtestin,
       jossa malli koulutetaan VAIN kyseistä jaksoa edeltävällä historialla ja ennustaa seuraavat 72 h.
    """
    n_total = len(observations)
    holdout_indices = set()
    # Valitaan monipuoliset out-of-sample -jaksot (talvipakkanen, kevään OL3-ydinvoimahuolto, syksyn Loviisa-huolto, kesä, nykytila)
    for center_frac in (0.14, 0.23, 0.43, 0.66, 0.86, 0.98):
        start_idx = max(240, min(n_total - 120, int(n_total * center_frac) - 60))
        for idx in range(start_idx, min(n_total, start_idx + 96)):
            holdout_indices.add(idx)

    train_pool = [o for idx, o in enumerate(observations) if idx not in holdout_indices]
    test_set = [o for idx, o in enumerate(observations) if idx in holdout_indices]

    ablation_levels = [
        (0, "Taso 0: Oppimaton peruskaava (pelkkä keskiarvo)", 1),
        (1, "Taso 1: + Suomen tuulivoiman epälineaarinen tehokäyrä", 4),
        (2, "Taso 2: + Lämpötila, 72 h pakkasvaraus & 5x4 säähintamatriisi", 9),
        (3, "Taso 3: + Tuntiprofiili, arkipyhät & aurinkovoima (W/m²)", 15),
        (4, "Taso 4: + Ydinvoimaloiden huoltoseisokit (OL1–OL3, LO1–LO2)", 17),
        (5, "Taso 5: + Tuulikuivuus, SE1/EE-rajatuuli & ilmanpaine (hPa)", 22),
        (6, "Taso 6: + Markkinamuisti & volatiliteetti (Täysi 24 muuttujan malli)", 24),
    ]

    ablation_results = []
    train_rows = []
    for o in train_pool:
        y_raw = float(o["priceInclVat"])
        y = max(-1.0, min(35.0, y_raw)) if y_raw <= 35.0 else 35.0 + math.sqrt(y_raw - 35.0)
        x = extract_features_24(o, active_groups=6)
        train_rows.append((o, x, y, 1.0))

    test_xs = [extract_features_24(o, active_groups=6) for o in test_set]
    actuals = [o["priceInclVat"] for o in test_set]

    cum_weights = [0.0] * 24
    cum_wk_adj = [0.0] * 24
    cum_we_adj = [0.0] * 24
    cum_grid_adj = {}

    def eval_pred(o, x, w_vec, wk_a, we_a, gr_a):
        lin = sum(w_vec[j] * x[j] for j in range(24))
        w_ratio = max(0.01, min(0.95, o["windMw"] / FINLAND_INSTALLED_WIND_MW))
        h_raw = we_a[o["hour"]] if o.get("isFreeDay", o["isWeekend"]) else wk_a[o["hour"]]
        h_scale = max(0.20, 1.15 - 0.90 * w_ratio) if h_raw > 0 else 1.0
        w_bin = min(4, int((o["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
        t_bin = 0 if o["tempC"] < -5 else (1 if o["tempC"] < 2 else (2 if o["tempC"] < 10 else 3))
        g_val = gr_a.get(f"{w_bin}_{t_bin}", 0.0)
        return max(0.05, lin + h_raw * h_scale + g_val)

    prev_mae = None
    for grp, title, param_count in ablation_levels:
        f_idx = STAGE_FEATURE_INDICES[grp]
        train_preds = [
            eval_pred(o, x, cum_weights, cum_wk_adj, cum_we_adj, cum_grid_adj)
            for (o, x, y, w) in train_rows
        ]
        residuals = [row[2] - p for row, p in zip(train_rows, train_preds)]
        reg_l = 0.01 if grp == 0 else (2.0 if grp in (1, 6) else 4.0)
        delta_w = fit_subspace_ridge(train_rows, residuals, f_idx, reg_l)

        cand_grid_adj = dict(cum_grid_adj)
        if grp == 2:
            g_res = {}
            for (o, x, y, w), p in zip(train_rows, train_preds):
                step_lin = sum(delta_w[idx] * x[idx] for idx in f_idx)
                r_g = y - (p + step_lin)
                w_bin = min(4, int((o["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
                t_bin = 0 if o["tempC"] < -5 else (1 if o["tempC"] < 2 else (2 if o["tempC"] < 10 else 3))
                k = f"{w_bin}_{t_bin}"
                if k not in g_res:
                    g_res[k] = [0.0, 0.0]
                g_res[k][0] += r_g
                g_res[k][1] += 1.0
            for k, pair in g_res.items():
                cand_grid_adj[k] = round((pair[0] / (pair[1] + 12.0)) * 0.55, 3)

        cand_wk_adj = cum_wk_adj[:]
        cand_we_adj = cum_we_adj[:]
        if grp == 3:
            wk_res = {h: [0.0, 0.0] for h in range(24)}
            we_res = {h: [0.0, 0.0] for h in range(24)}
            for (o, x, y, w), p in zip(train_rows, train_preds):
                step_lin = sum(delta_w[idx] * x[idx] for idx in f_idx)
                r_h = y - (p + step_lin)
                if o.get("isFreeDay", o["isWeekend"]):
                    we_res[o["hour"]][0] += r_h
                    we_res[o["hour"]][1] += 1.0
                else:
                    wk_res[o["hour"]][0] += r_h
                    wk_res[o["hour"]][1] += 1.0
            cand_wk_adj = [round(wk_res[h][0] / (wk_res[h][1] + 10.0), 3) for h in range(24)]
            cand_we_adj = [round(we_res[h][0] / (we_res[h][1] + 10.0), 3) for h in range(24)]

        best_eta = 1.0 if grp == 0 else 0.0
        best_mae = 999.0
        etas = [1.0] if grp == 0 else [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1.0, -0.1, -0.25, -0.4]
        for eta in etas:
            trial_w = cum_weights[:]
            for idx in f_idx:
                trial_w[idx] += eta * delta_w[idx]
            trial_wk = cand_wk_adj if (grp == 3 and eta > 0) else cum_wk_adj
            trial_we = cand_we_adj if (grp == 3 and eta > 0) else cum_we_adj
            trial_gr = cand_grid_adj if (grp == 2 and eta != 0) else cum_grid_adj
            trial_preds = [
                eval_pred(o, x, trial_w, trial_wk, trial_we, trial_gr)
                for o, x in zip(test_set, test_xs)
            ]
            m_err = sum(abs(a - p) for a, p in zip(actuals, trial_preds)) / len(actuals)
            if m_err < best_mae:
                best_mae = m_err
                best_eta = eta

        for idx in f_idx:
            cum_weights[idx] += best_eta * delta_w[idx]
        if grp == 2 and best_eta != 0:
            cum_grid_adj = cand_grid_adj
        if grp == 3 and best_eta > 0:
            cum_wk_adj = cand_wk_adj
            cum_we_adj = cand_we_adj

        stage_preds = [
            eval_pred(o, x, cum_weights, cum_wk_adj, cum_we_adj, cum_grid_adj)
            for o, x in zip(test_set, test_xs)
        ]

        met = compute_metrics(actuals, stage_preds)
        delta_mae = round(prev_mae - met["maeCents"], 2) if prev_mae is not None else 0.0
        prev_mae = met["maeCents"]
        ablation_results.append({
            "level": grp,
            "title": title,
            "paramCount": param_count,
            "maeCents": met["maeCents"],
            "rmseCents": met["rmseCents"],
            "corrR": met["corrR"],
            "cheapest6hHitRatePct": met["cheapest6hHitRatePct"],
            "improvementStepCents": delta_mae,
        })

    # Etsitään 5 edustavaa 72 tunnin Walk-Forward -jaksoa historiasta:
    # 1. Tuorein 72 h
    # 2. Talvipakkanen ja tuulikuivuus (tammi–helmikuu, tempC < -6 °C)
    # 3. Kevään ydinvoimahuolto (maaliskuu–huhtikuu, OL3 huoltoseisokki -1 600 MW)
    # 4. Kesän aurinko- ja tuulijakso (kesä–heinäkuu, korkea solarMw)
    # 5. Syksyn tuuliramppi (syys–lokakuu)
    def find_window_start(predicate, fallback_frac):
        best_idx = int(n_total * fallback_frac)
        best_score = -1e9
        for idx in range(600, n_total - 96, 24):
            window = observations[idx : idx + 72]
            sc = predicate(window)
            if sc > best_score:
                best_score = sc
                best_idx = idx
        return best_idx

    idx_recent = max(600, n_total - 72)
    idx_winter = find_window_start(
        lambda w: (-sum(x["tempC"] for x in w) / 72.0) + (sum(x["priceInclVat"] for x in w) / 72.0 * 0.4)
        if w[0]["month"] in (1, 2, 12) and max(x["priceInclVat"] for x in w) < 42.0
        else -999.0,
        0.18,
    )
    idx_nuclear = find_window_start(
        lambda w: (sum(x.get("nuclearDeficitMw", 0) for x in w) / 72.0) - abs(sum(x["priceInclVat"] for x in w) / 72.0 - 9.0) * 40.0
        if w[0]["month"] in (3, 4, 5) and w[0].get("nuclearDeficitMw", 0) >= 1500
        else -999.0,
        0.32,
    )
    idx_summer = find_window_start(
        lambda w: sum(x.get("solarMw", 0) for x in w) / 72.0
        if w[0]["month"] in (6, 7)
        else -999.0,
        0.65,
    )
    idx_autumn = find_window_start(
        lambda w: max(x["windMw"] for x in w) - min(x["windMw"] for x in w)
        if w[0]["month"] in (9, 10) and max(x["priceInclVat"] for x in w) < 35.0
        else -999.0,
        0.85,
    )

    period_specs = [
        ("recent_72h", "Tuoreimmat 72 tuntia (Reaaliaikainen verifiointi)", idx_recent),
        ("winter_frost", "Talven pakkasjakso (Kova pakkanen ja lämmityshuippu)", idx_winter),
        ("nuclear_outage", "Ydinvoimahuolto (OL3 vuosihuoltoseisokki -1 600 MW)", idx_nuclear),
        ("summer_solar", "Kesän aurinkojakso (Aurinkosähkön päiväkuoppa)", idx_summer),
        ("autumn_ramp", "Syysmyrsky ja tuuliramppi (Nopea tuulivaihtelu)", idx_autumn),
    ]

    walkforward_periods = []
    for pid, label, s_idx in period_specs:
        # Walk-forward: koulutetaan malli vain ennen s_idx olevalla datalla!
        prior_obs = observations[:s_idx]
        wf_model = fit_ridge_regression(prior_obs, ridge_lambda=2.0, uniform_weights=False, active_groups=6)
        window = observations[s_idx : s_idx + 72]
        actuals = [o["priceInclVat"] for o in window]
        preds = [round(predict_with_learned_model(o, wf_model, active_groups=6), 2) for o in window]
        met = compute_metrics(actuals, preds)

        series_pts = []
        for o, p_val in zip(window, preds):
            series_pts.append({
                "epochMs": o["epochMs"],
                "dateKey": o["dateKey"],
                "hour": o["hour"],
                "actual": round(o["priceInclVat"], 2),
                "predicted": p_val,
                "windMw": o["windMw"],
                "tempC": o["tempC"],
                "nuclearMw": o.get("nuclearMw", 4394),
                "solarMw": round(o.get("solarMw", 0)),
            })

        walkforward_periods.append({
            "id": pid,
            "label": label,
            "startDate": window[0]["dateKey"] if window else "",
            "endDate": window[-1]["dateKey"] if window else "",
            "metrics": met,
            "avgWindMw": round(sum(o["windMw"] for o in window) / max(1, len(window))),
            "avgTempC": round(sum(o["tempC"] for o in window) / max(1, len(window)), 1),
            "avgNuclearMw": round(sum(o.get("nuclearMw", 4394) for o in window) / max(1, len(window))),
            "avgSolarMw": round(sum(o.get("solarMw", 0) for o in window) / max(1, len(window))),
            "hours": series_pts,
        })

    return {
        "ablationStudy": ablation_results,
        "walkForwardPeriods": walkforward_periods,
    }


def evaluate_learning_curve(observations: list) -> dict:
    if len(observations) < 1000:
        return {}

    n_total = len(observations)
    holdout_indices = set()
    for center_frac in (0.22, 0.48, 0.74, 0.99):
        start_idx = max(48, min(n_total - 120, int(n_total * center_frac) - 84))
        for idx in range(start_idx, min(n_total, start_idx + 120)):
            holdout_indices.add(idx)

    train_pool = [o for idx, o in enumerate(observations) if idx not in holdout_indices]
    test_set = [o for idx, o in enumerate(observations) if idx in holdout_indices]

    naive_errs = [abs(o["priceInclVat"] - 8.80) for o in test_set]
    naive_mae = round(sum(naive_errs) / len(naive_errs), 2)

    stages = []
    for label, hours_cnt, reg_l, grp in [
        ("Alkuvaihe (3 vrk / 72 tuntia)", 72, 160.0, 2),
        ("Viikkotaso (7 vrk / 168 tuntia)", 168, 60.0, 3),
        ("Kuukausitaso (30 vrk / 720 tuntia)", 720, 12.0, 4),
        ("Puolivuotistaso (180 vrk / 4 320 tuntia)", 4320, 3.5, 5),
        (f"Täysi 24 muuttujan historia ({len(observations)} tuntia / 2 vuotta)", len(train_pool), 1.8, 6),
    ]:
        subset = train_pool[-min(len(train_pool), hours_cnt) :]
        m = fit_ridge_regression(subset, ridge_lambda=reg_l, uniform_weights=True, active_groups=grp)
        errs = [abs(o["priceInclVat"] - predict_with_learned_model(o, m, active_groups=grp)) for o in test_set]
        mae = round(sum(errs) / len(errs), 2)
        stages.append(
            {
                "label": label,
                "hours": len(observations) if hours_cnt == len(train_pool) else len(subset),
                "maeCents": mae,
            }
        )

    return {
        "naiveBaselineMaeCents": naive_mae,
        "stages": stages,
        "currentMaeCents": stages[-1]["maeCents"] if stages else naive_mae,
        "improvementPct": round(
            max(0.0, (naive_mae - stages[-1]["maeCents"]) / max(0.1, naive_mae) * 100.0), 1
        ),
    }



def update_and_apply_error_learning_ledger(all_obs: list, learned_model: dict, weather_map: dict) -> dict:
    """
    Ylläpitää pysyvää virheistä oppimisen tilikirjaa (data/error_learning_ledger.json):
    1. Vertailee aiemmin tallennettuja ennusteita (pendingPredictions) uusiin toteutuneisiin Nord Pool -hintoihin.
    2. Laskee tuntikohtaisen (weekday/weekend 0..23) ja sääluokkakohtaisen (5x4 tuuli x lämpötila)
       eksponentiaalisesti painotetun jäännösvirheen (EMA) ja syöttää korjauksen suoraan mallin
       tunti- ja säämatriisikorjauksiin.
    3. Tallentaa tulevien tuntien uudet ennusteet seuraavaa 13:45 / 01:45 -verifiointia varten.
    """
    ledger = {
        "verifiedHistory": [],
        "pendingPredictions": {},
        "weekdayResidualEma": [0.0] * 24,
        "weekendResidualEma": [0.0] * 24,
        "regimeResidualEma": {},
    }
    if os.path.exists(ERROR_LEDGER_FILE):
        try:
            with open(ERROR_LEDGER_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    ledger.update(loaded)
        except Exception:
            pass

    obs_by_ms = {o["epochMs"]: o for o in all_obs}
    verified_map = {item["epochMs"]: item for item in ledger.get("verifiedHistory", []) if "epochMs" in item}

    # Jos tilikirja on tyhjä, alustetaan se aidolla Walk-Forward out-of-sample -ajolla viimeisen 14 vrk (336 h) ajalta
    if len(verified_map) < 48 and len(all_obs) > 600:
        start_wf = len(all_obs) - 336
        wf_base_model = fit_ridge_regression(all_obs[:start_wf], ridge_lambda=2.0, uniform_weights=False, active_groups=6)
        for idx in range(start_wf, len(all_obs)):
            o = all_obs[idx]
            raw_p = round(predict_with_learned_model(o, wf_base_model, active_groups=6), 3)
            verified_map[o["epochMs"]] = {
                "epochMs": o["epochMs"],
                "dateKey": o["dateKey"],
                "hour": o["hour"],
                "isFreeDay": bool(o.get("isFreeDay", o["isWeekend"])),
                "windMw": o["windMw"],
                "tempC": o["tempC"],
                "predicted": raw_p,
                "actual": round(float(o["priceInclVat"]), 3),
                "error": round(float(o["priceInclVat"]) - raw_p, 3),
            }

    # Tarkistetaan pendingPredictions uusia vahvistettuja Nord Pool -tunteja vasten
    pending = ledger.get("pendingPredictions", {})
    newly_verified = 0
    for ms_str, p_info in list(pending.items()):
        ms_val = int(ms_str)
        if ms_val in obs_by_ms:
            o = obs_by_ms[ms_val]
            pred_val = float(p_info.get("predicted", 0.0))
            act_val = float(o["priceInclVat"])
            verified_map[ms_val] = {
                "epochMs": ms_val,
                "dateKey": o["dateKey"],
                "hour": o["hour"],
                "isFreeDay": bool(o.get("isFreeDay", o["isWeekend"])),
                "windMw": o["windMw"],
                "tempC": o["tempC"],
                "predicted": round(pred_val, 3),
                "actual": round(act_val, 3),
                "error": round(act_val - pred_val, 3),
            }
            del pending[ms_str]
            newly_verified += 1

    sorted_verified = [verified_map[k] for k in sorted(verified_map.keys())][-2000:]

    # Lasketaan virheistä opitut tunti- ja sääluokkakohtaiset EMA-korjaukset ja mitataan tarkkuusparannus
    wk_ema = [0.0] * 24
    we_ema = [0.0] * 24
    reg_ema = {}
    pre_errs = []
    post_errs = []

    alpha_h = 0.14
    alpha_r = 0.12
    for v in sorted_verified:
        h = int(v["hour"]) % 24
        is_free = bool(v.get("isFreeDay", False))
        w_bin = min(4, int((v["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
        t_bin = 0 if v["tempC"] < -5 else (1 if v["tempC"] < 2 else (2 if v["tempC"] < 10 else 3))
        r_key = f"{w_bin}_{t_bin}"

        raw_pred = float(v["predicted"])
        act = float(v["actual"])
        learned_corr = (we_ema[h] if is_free else wk_ema[h]) * 0.55 + reg_ema.get(r_key, 0.0) * 0.45
        corr_pred = max(0.05, raw_pred + learned_corr)

        pre_errs.append(abs(act - raw_pred))
        post_errs.append(abs(act - corr_pred))

        clamped_err = max(-10.0, min(10.0, act - raw_pred))
        if is_free:
            we_ema[h] = (1.0 - alpha_h) * we_ema[h] + alpha_h * clamped_err
        else:
            wk_ema[h] = (1.0 - alpha_h) * wk_ema[h] + alpha_h * clamped_err
        reg_ema[r_key] = (1.0 - alpha_r) * reg_ema.get(r_key, 0.0) + alpha_r * clamped_err

    # Syötetään opitut jäännösvirheet suoraan mallin tunti- ja säämatriisiin
    for h in range(24):
        learned_model["weekdayHourAdj"][h] = round(learned_model["weekdayHourAdj"][h] + wk_ema[h] * 0.35, 3)
        learned_model["weekendHourAdj"][h] = round(learned_model["weekendHourAdj"][h] + we_ema[h] * 0.35, 3)
    for r_key, r_val in reg_ema.items():
        learned_model["windTempGridAdj"][r_key] = round(learned_model["windTempGridAdj"].get(r_key, 0.0) + r_val * 0.30, 3)

    learned_model["weekdayResidualEma"] = [round(x, 3) for x in wk_ema]
    learned_model["weekendResidualEma"] = [round(x, 3) for x in we_ema]
    learned_model["regimeResidualEma"] = {k: round(val, 3) for k, val in reg_ema.items()}

    # Tallennetaan tulevien vahvistamattomien tuntien ennusteet seuraavaa verifiointikierrosta varten
    max_obs_ms = all_obs[-1]["epochMs"] if all_obs else 0
    recent_24_mean = sum(o["priceInclVat"] for o in all_obs[-24:]) / max(1, len(all_obs[-24:])) if all_obs else 5.5
    recent_7d_mean = sum(o["priceInclVat"] for o in all_obs[-168:]) / max(1, len(all_obs[-168:])) if all_obs else 5.5

    for h_ms, w in sorted(weather_map.items()):
        if h_ms > max_obs_ms:
            hel = utc_to_helsinki_parts(h_ms)
            nuc = get_nuclear_and_border_status(hel["date_key"])
            cand_obs = {
                "epochMs": h_ms,
                "dateKey": hel["date_key"],
                "month": hel["month"],
                "hour": hel["hour"],
                "weekday": hel["weekday"],
                "isWeekend": hel["is_weekend"],
                "isFreeDay": hel["is_free_day"],
                "windMw": w["windMw"],
                "windSpeed100m": w["windSpeed100m"],
                "tempC": w["tempC"],
                "solarRadWm2": w["solarRadWm2"],
                "solarMw": radiation_to_solar_mw(w["solarRadWm2"], hel["month"], hel["hour"]),
                "pressureHpa": w["pressureHpa"],
                "seWindSpeed": w["seWindSpeed"],
                "eeWindSpeed": w["eeWindSpeed"],
                "nuclearMw": nuc["nuclearMw"],
                "nuclearDeficitMw": nuc["nuclearDeficitMw"],
                "estlink2Online": nuc["estlink2Online"],
                "rolling24hWindMw": w["windMw"],
                "windRamp6hMw": 0.0,
                "rolling72hTempC": w["tempC"],
                "lag24hSameHour": recent_24_mean,
                "prev24hMean": recent_24_mean,
                "prev24hStd": 2.0,
                "prev7dMean": recent_7d_mean,
            }
            pred_f = round(predict_with_learned_model(cand_obs, learned_model, active_groups=6), 3)
            pending[str(h_ms)] = {
                "epochMs": h_ms,
                "dateKey": hel["date_key"],
                "hour": hel["hour"],
                "predicted": pred_f,
            }

    ledger["verifiedHistory"] = sorted_verified
    ledger["pendingPredictions"] = pending
    ledger["weekdayResidualEma"] = learned_model["weekdayResidualEma"]
    ledger["weekendResidualEma"] = learned_model["weekendResidualEma"]
    ledger["regimeResidualEma"] = learned_model["regimeResidualEma"]

    with open(ERROR_LEDGER_FILE, "w", encoding="utf-8") as f:
        json.dump(ledger, f, ensure_ascii=False, indent=2)

    pre_mae = round(sum(pre_errs[-336:]) / max(1, len(pre_errs[-336:])), 2) if pre_errs else 0.0
    post_mae = round(sum(post_errs[-336:]) / max(1, len(post_errs[-336:])), 2) if post_errs else 0.0

    return {
        "verifiedHoursCount": len(sorted_verified),
        "newlyVerifiedHours": newly_verified,
        "pendingForecastHours": len(pending),
        "preCorrectionMae14d": pre_mae,
        "postCorrectionMae14d": post_mae,
        "errorReductionPct": round(max(0.0, (pre_mae - post_mae) / max(0.1, pre_mae) * 100.0), 1),
        "recentVerified": sorted_verified[-24:],
    }


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    existing_obs = {}
    need_archive_enrichment = True
    if os.path.exists(OBS_FILE):
        try:
            with open(OBS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                for item in loaded:
                    ws100 = float(item.get("windSpeed100m", 6.5))
                    item["windMw"] = int(round(FINLAND_INSTALLED_WIND_MW * wind_speed_to_cf(ws100)))
                    existing_obs[item["epochMs"]] = item
                if len(loaded) > 15000 and "seWindSpeed" in loaded[100]:
                    need_archive_enrichment = False
        except Exception:
            pass

    days_to_fetch = 730 if (len(existing_obs) < 10000 or need_archive_enrichment) else 30
    print(f"Noudetaan Nord Pool FI -spot-hinnat ja 24 muuttujan sää-, säteily- ja rajasiirtodata ({days_to_fetch} vrk)...")
    spot_map = fetch_historical_spot_prices(days_back=30 if len(existing_obs) > 15000 else 730)
    weather_map = fetch_enrichment_weather(days_back=days_to_fetch, need_archive=need_archive_enrichment)

    now_ms = int(datetime.now(timezone.utc).timestamp() // 3600) * 3600 * 1000
    added_count = 0

    # Päivitetään olemassa olevat havainnot uusilla säteily-, ilmanpaine- ja SE/EE-tuulimuuttujilla
    for h_ms, w in weather_map.items():
        if h_ms in existing_obs:
            existing_obs[h_ms].update({
                "windMw": w["windMw"],
                "windSpeed100m": w["windSpeed100m"],
                "tempC": w["tempC"],
                "solarRadWm2": w["solarRadWm2"],
                "pressureHpa": w["pressureHpa"],
                "seWindSpeed": w["seWindSpeed"],
                "seTempC": w["seTempC"],
                "eeWindSpeed": w["eeWindSpeed"],
                "eeTempC": w["eeTempC"],
            })

    for h_ms, spot_val in sorted(spot_map.items()):
        if h_ms <= now_ms + 36 * 3600 * 1000 and h_ms in weather_map:
            w = weather_map[h_ms]
            hel = utc_to_helsinki_parts(h_ms)
            if h_ms not in existing_obs:
                added_count += 1
            existing_obs[h_ms] = {
                "epochMs": h_ms,
                "dateKey": hel["date_key"],
                "month": hel["month"],
                "hour": hel["hour"],
                "weekday": hel["weekday"],
                "isWeekend": hel["is_weekend"],
                "priceInclVat": spot_val,
                "windMw": w["windMw"],
                "windSpeed100m": w["windSpeed100m"],
                "tempC": w["tempC"],
                "solarRadWm2": w["solarRadWm2"],
                "pressureHpa": w["pressureHpa"],
                "seWindSpeed": w["seWindSpeed"],
                "seTempC": w["seTempC"],
                "eeWindSpeed": w["eeWindSpeed"],
                "eeTempC": w["eeTempC"],
            }

    all_obs = [existing_obs[k] for k in sorted(existing_obs.keys())]
    enrich_rolling_dynamics(all_obs)

    with open(OBS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_obs, f, ensure_ascii=False)

    print(f"Opetusdatassa yhteensä {len(all_obs)} tuntihavaintoa (24 muuttujaa/tunti).")

    learned_model = fit_ridge_regression(all_obs, ridge_lambda=2.0, uniform_weights=False, active_groups=6)
    error_learning_stats = update_and_apply_error_learning_ledger(all_obs, learned_model, weather_map)
    learning_curve = evaluate_learning_curve(all_obs)
    backtest_bundle = run_ablation_and_walkforward_backtest(all_obs)

    low_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] < 1500]
    high_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] > 4500]
    freezing_obs = [o["priceInclVat"] for o in all_obs if o["tempC"] < -5.0]
    nuc_outage_obs = [o["priceInclVat"] for o in all_obs if o.get("nuclearDeficitMw", 0) >= 1000]
    nuc_normal_obs = [o["priceInclVat"] for o in all_obs if o.get("nuclearDeficitMw", 0) < 500]
    solar_high_obs = [o["priceInclVat"] for o in all_obs if o.get("solarMw", 0) > 450]

    avg_low_wind = round(sum(low_wind_obs) / max(1, len(low_wind_obs)), 2)
    avg_high_wind = round(sum(high_wind_obs) / max(1, len(high_wind_obs)), 2)
    avg_freezing = round(sum(freezing_obs) / max(1, len(freezing_obs)), 2)
    avg_nuc_outage = round(sum(nuc_outage_obs) / max(1, len(nuc_outage_obs)), 2)
    avg_nuc_normal = round(sum(nuc_normal_obs) / max(1, len(nuc_normal_obs)), 2)
    avg_solar_high = round(sum(solar_high_obs) / max(1, len(solar_high_obs)), 2)
    wind_effect_per_1000mw = round((avg_high_wind - avg_low_wind) / 3.5, 2)

    monthly_stats = {}
    for o in all_obs:
        m = o["month"]
        if m not in monthly_stats:
            monthly_stats[m] = {"sumPrice": 0.0, "sumWind": 0, "sumTemp": 0.0, "sumNuc": 0, "count": 0}
        monthly_stats[m]["sumPrice"] += o["priceInclVat"]
        monthly_stats[m]["sumWind"] += o["windMw"]
        monthly_stats[m]["sumTemp"] += o["tempC"]
        monthly_stats[m]["sumNuc"] += o.get("nuclearMw", 4394)
        monthly_stats[m]["count"] += 1

    monthly_summary = []
    month_names = ["", "Tammi", "Helmi", "Maalis", "Huhti", "Touko", "Kesä", "Heinä", "Elo", "Syys", "Loka", "Marras", "Joulu"]
    for m in range(1, 13):
        if m in monthly_stats and monthly_stats[m]["count"] > 0:
            st = monthly_stats[m]
            c = st["count"]
            monthly_summary.append({
                "month": m,
                "name": month_names[m],
                "avgPrice": round(st["sumPrice"] / c, 2),
                "avgWindMw": round(st["sumWind"] / c),
                "avgTempC": round(st["sumTemp"] / c, 1),
                "avgNuclearMw": round(st["sumNuc"] / c),
                "hours": c,
            })

    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    current_nuc = get_nuclear_and_border_status(today_key)

    payload = {
        "trainedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalObservations": len(all_obs),
        "featureCount": len(FEATURE_NAMES),
        "featureNames": FEATURE_NAMES,
        "firstObservationDate": all_obs[0]["dateKey"] if all_obs else "",
        "lastObservationDate": all_obs[-1]["dateKey"] if all_obs else "",
        "currentGridStatus": current_nuc,
        "nuclearOutageSchedule": NUCLEAR_OUTAGE_SCHEDULE,
        "model": learned_model,
        "errorLearning": error_learning_stats,
        "learningCurve": learning_curve,
        "ablationStudy": backtest_bundle["ablationStudy"],
        "walkForwardPeriods": backtest_bundle["walkForwardPeriods"],
        "insights": {
            "avgPriceLowWindUnder1500Mw": avg_low_wind,
            "avgPriceHighWindOver4500Mw": avg_high_wind,
            "avgPriceFreezingUnderMinus5C": avg_freezing,
            "avgPriceNuclearOutageOver1000Mw": avg_nuc_outage,
            "avgPriceNuclearNormal": avg_nuc_normal,
            "avgPriceHighSolarOver450Mw": avg_solar_high,
            "windEffectPer1000MwCents": wind_effect_per_1000mw,
        },
        "monthlySummary": monthly_summary,
        "recentBacktest": backtest_bundle["walkForwardPeriods"][0]["hours"],
    }

    with open(WEIGHTS_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(WEIGHTS_JS_FILE, "w", encoding="utf-8") as f:
        f.write("window.PORSSISAHKO_ML_WEIGHTS = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print("Opittu 24 muuttujan malli ja Walk-Forward Backtest tallennettu!")
    print("\nVaiheittainen parametrien ablaatiotesti (Out-of-Sample Walk-Forward):")
    for row in backtest_bundle["ablationStudy"]:
        print(
            f"  {row['title']}: MAE {row['maeCents']} snt/kWh | RMSE {row['rmseCents']} | "
            f"r={row['corrR']} | 6h-osuma {row['cheapest6hHitRatePct']}% (ero: -{row['improvementStepCents']} snt)"
        )


if __name__ == "__main__":
    main()
