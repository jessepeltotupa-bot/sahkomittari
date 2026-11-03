# -*- coding: utf-8 -*-
"""
Laaja historiallinen koneoppimisputki (2 vuotta / ~17 500 tuntia oikeaa Nord Pool FI + sää- ja tuulivoimadataa).
1. Noutaa toteutuneet Nord Pool FI -spot-tuntihinnat (sahkotin.fi 180 vrk jaksoissa + porssisahko.net)
   sekä toteutuneet 100 m tuulennopeudet ja lämpötilat (Open-Meteo Historical Archive API + Forecast API)
   viimeisen 730 vuorokauden (2 vuoden) ajalta.
2. Tallentaa koko yhdistetyn aikasarjan tietokantaan data/historical_observations.json.
3. Kouluttaa monimuuttujaisen Ridge-regressiomallin, vuodenaikakohtaiset tuntiprofiilit sekä
   Tuulivoima x Lämpötila -hintamatriisin.
4. Laskee oppimiskäyrän (Out-of-Sample MAE) kasvavilla datamäärillä ja tallentaa opitun mallin
   tiedostoihin ml_weights.json ja ml_weights.js.
"""

import json
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

FINLAND_INSTALLED_WIND_MW = 8450.0
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OBS_FILE = os.path.join(DATA_DIR, "historical_observations.json")
WEIGHTS_JSON_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_weights.json")
WEIGHTS_JS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ml_weights.js")


def wind_speed_to_cf(v100m: float) -> float:
    if v100m is None or math.isnan(v100m):
        return 0.30
    # 150 m napakorkeuden tuulennopeus rannikko- ja metsävyöhykkeellä
    v_hub = v100m * 1.26
    if v_hub < 2.8:
        return 0.02
    if v_hub >= 25.0:
        return 0.05
    if v_hub >= 11.8:
        return 0.90
    norm = (v_hub - 2.8) / (11.8 - 2.8)
    return max(0.02, min(0.90, (norm ** 1.65) * 0.90))


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
    return {
        "year": dt_hel.year,
        "month": dt_hel.month,
        "day": dt_hel.day,
        "hour": dt_hel.hour,
        "weekday": wd,
        "is_weekend": wd >= 5,
        "is_sat": wd == 5,
        "date_key": dt_hel.strftime("%Y-%m-%d"),
    }


def fetch_json(url: str, timeout: int = 35):
    req = urllib.request.Request(url, headers={"User-Agent": "PorssisahkoMLTrainer/2.0"})
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
                    # Ennen 1.9.2024 arvonlisävero oli 24 %, skaalataan yhtenäiseen 25,5 % kantaan
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


def parse_open_meteo_response(data, weather_map: dict):
    locs = data if isinstance(data, list) else [data]
    if len(locs) >= 4 and "hourly" in locs[0]:
        times = locs[0]["hourly"]["time"]
        for i, t_str in enumerate(times):
            dt = datetime.fromisoformat(t_str + ":00+00:00")
            h_ms = int(dt.timestamp()) * 1000

            def get_w(loc_idx):
                h_obj = locs[loc_idx]["hourly"]
                w100_arr = h_obj.get("wind_speed_100m")
                if w100_arr and i < len(w100_arr) and w100_arr[i] is not None:
                    return float(w100_arr[i])
                w10_arr = h_obj.get("wind_speed_10m")
                if w10_arr and i < len(w10_arr) and w10_arr[i] is not None:
                    return float(w10_arr[i]) * 1.45
                return 6.5

            w1, w2, w3 = get_w(0), get_w(1), get_w(2)
            weighted_wind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20
            cf = wind_speed_to_cf(weighted_wind)
            wind_mw = round(FINLAND_INSTALLED_WIND_MW * cf)

            t_south = locs[3]["hourly"]["temperature_2m"][i]
            t_west = locs[2]["hourly"]["temperature_2m"][i]
            t_north = locs[0]["hourly"]["temperature_2m"][i]
            t_south = float(t_south) if t_south is not None else 5.0
            t_west = float(t_west) if t_west is not None else 3.0
            t_north = float(t_north) if t_north is not None else 1.0
            weighted_temp = round(t_south * 0.55 + t_west * 0.25 + t_north * 0.20, 1)

            weather_map[h_ms] = {
                "windSpeed100m": round(weighted_wind, 2),
                "windMw": int(wind_mw),
                "tempC": weighted_temp,
            }


def fetch_historical_weather(days_back: int = 730) -> dict:
    """Yhdistää Open-Meteo ERA5 Archive API:n (pitkä historia) ja Forecast API:n (viimeiset 90 vrk)."""
    weather_map = {}
    now_utc = datetime.now(timezone.utc)

    # 1. Pitkä historia ERA5 Archive API:sta (days_back .. 85 vrk sitten) kahdella nopealla pisteellä:
    # Piste A: Kalajoki/Pohjois-Pohjanmaa (64.26, 23.95) - Suomen pääasiallinen tuulivoimavyöhyke
    # Piste B: Länsi-/Etelä-Suomi (61.50, 22.50) - Rannikon tuulivoima ja kulutuksen lämpötilakeskipiste
    if days_back > 90:
        arch_start = (now_utc - timedelta(days=days_back)).strftime("%Y-%m-%d")
        arch_end = (now_utc - timedelta(days=85)).strftime("%Y-%m-%d")
        url_north = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=64.26&longitude=23.95&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        url_south = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude=61.50&longitude=22.50&start_date={arch_start}&end_date={arch_end}"
            f"&hourly=temperature_2m,wind_speed_100m&wind_speed_unit=ms&timezone=UTC"
        )
        try:
            d_north = fetch_json(url_north, timeout=30)
            d_south = fetch_json(url_south, timeout=30)
            times = d_north["hourly"]["time"]
            w_n_arr = d_north["hourly"]["wind_speed_100m"]
            t_n_arr = d_north["hourly"]["temperature_2m"]
            w_s_arr = d_south["hourly"]["wind_speed_100m"]
            t_s_arr = d_south["hourly"]["temperature_2m"]

            for i, t_str in enumerate(times):
                dt = datetime.fromisoformat(t_str + ":00+00:00")
                h_ms = int(dt.timestamp()) * 1000
                wn = float(w_n_arr[i]) if w_n_arr[i] is not None else 6.5
                ws = float(w_s_arr[i]) if i < len(w_s_arr) and w_s_arr[i] is not None else wn
                tn = float(t_n_arr[i]) if t_n_arr[i] is not None else 2.0
                ts = float(t_s_arr[i]) if i < len(t_s_arr) and t_s_arr[i] is not None else tn

                weighted_wind = wn * 0.55 + ws * 0.45
                cf = wind_speed_to_cf(weighted_wind)
                wind_mw = round(FINLAND_INSTALLED_WIND_MW * cf)
                weighted_temp = round(ts * 0.75 + tn * 0.25, 1)

                weather_map[h_ms] = {
                    "windSpeed100m": round(weighted_wind, 2),
                    "windMw": int(wind_mw),
                    "tempC": weighted_temp,
                }
            print(f"  [ERA5 Archive] {arch_start}..{arch_end} ladattu ({len(weather_map)} tuntia)")
        except Exception as e:
            print(f"[Warn] Open-Meteo Archive fetch error: {e}")

    # 2. Tuoreimmat 90 vrk + lähipäivät Forecast API:sta
    fc_url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude=64.26,62.47,62.73,60.17&longitude=23.95,21.34,22.58,24.94"
        f"&hourly=temperature_2m,wind_speed_100m,wind_speed_10m"
        f"&wind_speed_unit=ms&past_days=90&forecast_days=2&timezone=UTC"
    )
    try:
        fc_data = fetch_json(fc_url, timeout=35)
        parse_open_meteo_response(fc_data, weather_map)
    except Exception as e:
        print(f"[Warn] Open-Meteo Forecast fetch error: {e}")

    return weather_map


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


def extract_features(obs: dict, prev_spot_24h: float = None) -> list:
    w_ratio = max(0.01, min(0.95, obs["windMw"] / FINLAND_INSTALLED_WIND_MW))
    temp_c = obs["tempC"]
    hour = obs["hour"]
    is_wknd = 1.0 if obs["isWeekend"] else 0.0

    hdd = max(0.0, 12.0 - temp_c) / 20.0
    severe_cold = max(0.0, -3.0 - temp_c) / 15.0
    low_wind_scarcity = max(0.0, 0.25 - w_ratio) ** 2 * 10.0

    morning_peak = (1.0 if (not obs["isWeekend"] and 7 <= hour <= 10) else 0.0) * (1.1 - w_ratio)
    evening_peak = (1.0 if (not obs["isWeekend"] and 16 <= hour <= 21) else 0.0) * (1.1 - w_ratio)
    night_trough = 1.0 if (0 <= hour <= 5) else 0.0
    calm_cold_inter = (1.0 - w_ratio) * hdd
    ar_level = (prev_spot_24h if prev_spot_24h is not None else 5.5) / 10.0

    is_heating_season = 1.0 if obs["month"] in (10, 11, 12, 1, 2, 3, 4) else 0.0
    heating_peak = (
        is_heating_season
        * (1.0 if (not obs["isWeekend"] and (7 <= hour <= 10 or 16 <= hour <= 21)) else 0.0)
        * (1.0 - w_ratio)
    )

    return [
        1.0,
        w_ratio,
        w_ratio ** 2,
        low_wind_scarcity,
        hdd,
        severe_cold,
        morning_peak,
        evening_peak,
        night_trough,
        is_wknd,
        calm_cold_inter,
        ar_level,
        is_heating_season,
        heating_peak,
    ]


def fit_ridge_regression(observations: list, ridge_lambda: float = 1.8, uniform_weights: bool = False) -> dict:
    n_feat = 14
    XtX = [[0.0] * n_feat for _ in range(n_feat)]
    Xty = [0.0] * n_feat

    spot_by_ms = {o["epochMs"]: o["priceInclVat"] for o in observations}
    valid_rows = []
    max_ms = observations[-1]["epochMs"] if observations else 0

    for o in observations:
        y_raw = float(o["priceInclVat"])
        # Huber-tyyppinen vaimennus yksittäisille siirtoverkon vikatunneille (> 30 snt/kWh)
        y = max(-1.0, min(30.0, y_raw)) if y_raw <= 30.0 else 30.0 + math.sqrt(y_raw - 30.0)
        age_days = max(0.0, (max_ms - o["epochMs"]) / (1000.0 * 3600.0 * 24.0))
        # Yhdistetty painotus: tuoreimmat viikot kalibroivat markkinatason, kun taas
        # koko 2 vuoden historia opettaa harvinaiset pakkas- ja tuulivoimatilanteet
        sample_w = 1.0 if uniform_weights else (0.04 + 0.96 * math.exp(-age_days / 28.0))

        past_vals = [
            spot_by_ms[o["epochMs"] - k * 3600000]
            for k in range(24, 49)
            if (o["epochMs"] - k * 3600000) in spot_by_ms
        ]
        prev_avg = sum(past_vals) / len(past_vals) if past_vals else 5.5
        x = extract_features(o, prev_avg)
        valid_rows.append((o, x, y, sample_w))

        for i in range(n_feat):
            Xty[i] += sample_w * x[i] * y
            for j in range(n_feat):
                XtX[i][j] += sample_w * x[i] * x[j]

    for i in range(1, n_feat):
        XtX[i][i] += ridge_lambda

    weights = solve_linear_system(XtX, Xty)

    weekday_hour_res = {h: [0.0, 0.0] for h in range(24)}
    weekend_hour_res = {h: [0.0, 0.0] for h in range(24)}
    wind_temp_grid = {}
    wind_temp_empirical = {}  # "wBin_tBin" -> [sum_price, count]

    for o, x, y, sample_w in valid_rows:
        pred_lin = sum(w * xi for w, xi in zip(weights, x))
        res = y - pred_lin
        if o["isWeekend"]:
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
        # Koko 2 vuoden historia opettaa erityisesti harvinaiset pakkas- ja myrskyruudut
        grid_w = 0.35 + 0.65 * sample_w
        wind_temp_grid[key][0] += res * grid_w
        wind_temp_grid[key][1] += grid_w
        wind_temp_empirical[key][0] += float(o["priceInclVat"])
        wind_temp_empirical[key][1] += 1

    weekday_hour_adj = [
        round(weekday_hour_res[h][0] / (weekday_hour_res[h][1] + 4.0), 3) for h in range(24)
    ]
    weekend_hour_adj = [
        round(weekend_hour_res[h][0] / (weekend_hour_res[h][1] + 4.0), 3) for h in range(24)
    ]

    grid_adj = {}
    empirical_matrix = {}
    for k, pair in wind_temp_grid.items():
        hour_cleaned = pair[0] / (pair[1] + 8.0)
        grid_adj[k] = round(hour_cleaned * 0.45, 3)
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


def predict_with_learned_model(obs: dict, model: dict, prev_spot_24h: float = 5.5) -> float:
    x = extract_features(obs, prev_spot_24h)
    lin = sum(w * xi for w, xi in zip(model["weights"], x))
    h_adj = (
        model["weekendHourAdj"][obs["hour"]]
        if obs["isWeekend"]
        else model["weekdayHourAdj"][obs["hour"]]
    )
    w_bin = min(4, int((obs["windMw"] / FINLAND_INSTALLED_WIND_MW) * 5))
    t_bin = 0 if obs["tempC"] < -5 else (1 if obs["tempC"] < 2 else (2 if obs["tempC"] < 10 else 3))
    g_adj = model["windTempGridAdj"].get(f"{w_bin}_{t_bin}", 0.0)
    return max(0.05, lin + h_adj + g_adj)


def evaluate_learning_curve(observations: list) -> dict:
    if len(observations) < 1000:
        return {}

    # Poimitaan monivuodenaikainen out-of-sample -testiaineisto (talvipakkanen, kevät, kesä ja tuorein viikko),
    # jotta nähdään miten opetusdatan kasvu 3 vuorokaudesta täyteen 2 vuoteen parantaa ennustetta
    n_total = len(observations)
    holdout_indices = set()
    for center_frac in (0.22, 0.48, 0.74, 0.99):
        start_idx = max(48, min(n_total - 120, int(n_total * center_frac) - 84))
        for idx in range(start_idx, min(n_total, start_idx + 120)):
            holdout_indices.add(idx)

    train_pool = [o for idx, o in enumerate(observations) if idx not in holdout_indices]
    test_set = [o for idx, o in enumerate(observations) if idx in holdout_indices]
    spot_by_ms = {o["epochMs"]: o["priceInclVat"] for o in observations}

    def calc_mae(model_obj):
        errs = []
        for o in test_set:
            past_vals = [
                spot_by_ms[o["epochMs"] - k * 3600000]
                for k in range(24, 49)
                if (o["epochMs"] - k * 3600000) in spot_by_ms
            ]
            prev_avg = sum(past_vals) / len(past_vals) if past_vals else 5.5
            pred = predict_with_learned_model(o, model_obj, prev_avg)
            errs.append(abs(o["priceInclVat"] - pred))
        return round(sum(errs) / len(errs), 2)

    naive_errs = []
    for o in test_set:
        naive_pred = 8.80
        naive_errs.append(abs(o["priceInclVat"] - naive_pred))
    naive_mae = round(sum(naive_errs) / len(naive_errs), 2)

    stages = []
    for label, hours_cnt, reg_l in [
        ("Alkuvaihe (3 vrk / 72 tuntia)", 72, 180.0),
        ("Viikkotaso (7 vrk / 168 tuntia)", 168, 65.0),
        ("Kuukausitaso (30 vrk / 720 tuntia)", 720, 12.0),
        ("Puolivuotistaso (180 vrk / 4 320 tuntia)", 4320, 3.5),
        (f"Täysi opittu historia ({len(observations)} tuntia / 2 vuotta)", len(train_pool), 1.8),
    ]:
        subset = train_pool[-min(len(train_pool), hours_cnt) :]
        m = fit_ridge_regression(subset, ridge_lambda=reg_l, uniform_weights=True)
        mae = calc_mae(m)
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


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    existing_obs = {}
    if os.path.exists(OBS_FILE):
        try:
            with open(OBS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                for item in loaded:
                    ws100 = float(item.get("windSpeed100m", 6.5))
                    item["windMw"] = int(round(FINLAND_INSTALLED_WIND_MW * wind_speed_to_cf(ws100)))
                    existing_obs[item["epochMs"]] = item
        except Exception:
            pass

    days_to_fetch = 730 if len(existing_obs) < 10000 else 30
    print(f"Noudetaan Nord Pool FI -spot-hinnat ja ERA5/Open-Meteo -tuulivoimadata ({days_to_fetch} vrk)...")
    spot_map = fetch_historical_spot_prices(days_back=days_to_fetch)
    weather_map = fetch_historical_weather(days_back=days_to_fetch)

    now_ms = int(datetime.now(timezone.utc).timestamp() // 3600) * 3600 * 1000
    added_count = 0

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
            }

    all_obs = [existing_obs[k] for k in sorted(existing_obs.keys())]
    with open(OBS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_obs, f, ensure_ascii=False)

    print(f"Opetusdatassa yhteensä {len(all_obs)} tuntihavaintoa (uusia lisätty: {added_count}).")

    learned_model = fit_ridge_regression(all_obs)
    learning_curve = evaluate_learning_curve(all_obs)

    spot_by_ms = {o["epochMs"]: o["priceInclVat"] for o in all_obs}
    recent_backtest = []
    for o in all_obs[-72:]:
        past_vals = [
            spot_by_ms[o["epochMs"] - k * 3600000]
            for k in range(24, 49)
            if (o["epochMs"] - k * 3600000) in spot_by_ms
        ]
        prev_avg = sum(past_vals) / len(past_vals) if past_vals else 5.5
        pred = round(predict_with_learned_model(o, learned_model, prev_avg), 2)
        recent_backtest.append(
            {
                "epochMs": o["epochMs"],
                "dateKey": o["dateKey"],
                "hour": o["hour"],
                "actual": o["priceInclVat"],
                "predicted": pred,
                "windMw": o["windMw"],
                "tempC": o["tempC"],
            }
        )

    low_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] < 1500]
    high_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] > 4500]
    freezing_obs = [o["priceInclVat"] for o in all_obs if o["tempC"] < -5.0]
    avg_low_wind = round(sum(low_wind_obs) / max(1, len(low_wind_obs)), 2)
    avg_high_wind = round(sum(high_wind_obs) / max(1, len(high_wind_obs)), 2)
    avg_freezing = round(sum(freezing_obs) / max(1, len(freezing_obs)), 2)
    wind_effect_per_1000mw = round((avg_high_wind - avg_low_wind) / 3.5, 2)

    # Kuukausikohtaiset toteutuneet keskihinnat ja tuulivoima historiasta
    monthly_stats = {}
    for o in all_obs:
        m = o["month"]
        if m not in monthly_stats:
            monthly_stats[m] = {"sumPrice": 0.0, "sumWind": 0, "sumTemp": 0.0, "count": 0}
        monthly_stats[m]["sumPrice"] += o["priceInclVat"]
        monthly_stats[m]["sumWind"] += o["windMw"]
        monthly_stats[m]["sumTemp"] += o["tempC"]
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
                "hours": c,
            })

    payload = {
        "trainedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totalObservations": len(all_obs),
        "firstObservationDate": all_obs[0]["dateKey"] if all_obs else "",
        "lastObservationDate": all_obs[-1]["dateKey"] if all_obs else "",
        "model": learned_model,
        "learningCurve": learning_curve,
        "insights": {
            "avgPriceLowWindUnder1500Mw": avg_low_wind,
            "avgPriceHighWindOver4500Mw": avg_high_wind,
            "avgPriceFreezingUnderMinus5C": avg_freezing,
            "windEffectPer1000MwCents": wind_effect_per_1000mw,
        },
        "monthlySummary": monthly_summary,
        "recentBacktest": recent_backtest,
    }

    with open(WEIGHTS_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(WEIGHTS_JS_FILE, "w", encoding="utf-8") as f:
        f.write("window.PORSSISAHKO_ML_WEIGHTS = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print("Opittu 2 vuoden malli tallennettu tiedostoihin ml_weights.json ja ml_weights.js!")
    if learning_curve:
        print("Oppimiskäyrä (Out-of-sample MAE snt/kWh):")
        print(f"  - Oppimaton peruskaava: {learning_curve['naiveBaselineMaeCents']} snt/kWh")
        for st in learning_curve["stages"]:
            print(f"  - {st['label']}: {st['maeCents']} snt/kWh")


if __name__ == "__main__":
    main()
