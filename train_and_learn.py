# -*- coding: utf-8 -*-
"""
Oppiva pörssisähkön ennustemalli (Continuous Learning Pipeline).
1. Noutaa toteutuneet Nord Pool FI -spot-tuntihinnat (sahkotin.fi & porssisahko.net) sekä
   toteutuneet 100 m tuulennopeudet ja lämpötilat Suomen keskeisiltä tuulivoima- ja kulutusalueilta
   (Open-Meteo Historical Forecast / Archive API) viimeiseltä 90 vuorokaudelta.
2. Yhdistää uudet havainnot pysyvään tietokantaan (data/historical_observations.json),
   jolloin opetusdata kasvaa jokaisella ajokerralla.
3. Kouluttaa monimuuttujaisen Ridge-regressiomallin (Cholesky/Gauss-ratkaisijalla ilman raskaita riippuvuuksia),
   24 tunnin empiriaprofiilit (arkipäivät vs. viikonloput) sekä Tuulivoima x Lämpötila -jäännösvirhematriisin.
4. Todentaa oppimisen (Learning Curve): mittaa ennustevirheen (MAE snt/kWh) kasvavilla datamäärillä
   (7 vrk -> 30 vrk -> 60 vrk -> 90+ vrk) ja tallentaa opitut painokertoimet tiedostoihin
   ml_weights.json ja ml_weights.js.
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
    if v100m < 3.0:
        return 0.02
    if v100m >= 25.0:
        return 0.05
    if v100m >= 12.5:
        return 0.88
    norm = (v100m - 3.0) / (12.5 - 3.0)
    return max(0.02, min(0.88, (norm ** 2.15) * 0.88))


def utc_to_helsinki_parts(epoch_ms: int) -> dict:
    # Suomen aikavyöhyke (EET UTC+2, kesäaika EEST UTC+3 maaliskuun viimeisestä su lokakuun viimeiseen su)
    dt_utc = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc)
    year = dt_utc.year

    # Maaliskuun viimeinen sunnuntai klo 01:00 UTC
    march_last = datetime(year, 3, 31, 1, 0, tzinfo=timezone.utc)
    while march_last.weekday() != 6:
        march_last -= timedelta(days=1)

    # Lokakuun viimeinen sunnuntai klo 01:00 UTC
    oct_last = datetime(year, 10, 31, 1, 0, tzinfo=timezone.utc)
    while oct_last.weekday() != 6:
        oct_last -= timedelta(days=1)

    offset_hours = 3 if (march_last <= dt_utc < oct_last) else 2
    dt_hel = dt_utc + timedelta(hours=offset_hours)
    wd = dt_hel.weekday()  # 0=Ma .. 5=La, 6=Su
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


def fetch_json(url: str, timeout: int = 25):
    req = urllib.request.Request(url, headers={"User-Agent": "PorssisahkoMLTrainer/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_historical_spot_prices(days_back: int = 90) -> dict:
    """Noutaa toteutuneet Nord Pool FI -tuntihinnat (sis. ALV 25,5 %) viimeiseltä N vuorokaudelta."""
    now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start_utc = now_utc - timedelta(days=days_back)
    end_utc = now_utc + timedelta(days=2)

    spot_map = {}  # hour_epoch_ms -> price_incl_vat

    # 1. Noudetaan sahkotin.fi API:sta (tukee pitkää aikaväliä)
    try:
        start_str = start_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        end_str = end_utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        url = f"https://sahkotin.fi/prices?fix&vat&start={urllib.parse.quote(start_str)}&end={urllib.parse.quote(end_str)}"
        data = fetch_json(url)
        if data and "prices" in data:
            for item in data["prices"]:
                dt = datetime.fromisoformat(item["date"].replace("Z", "+00:00"))
                h_ms = int(dt.timestamp() // 3600) * 3600 * 1000
                val = float(item["value"])
                # Vuoden 2024 syyskuussa ALV nousi 24 % -> 25,5 %, kaikki tuoreet ovat 25,5 %
                spot_map[h_ms] = round(val, 3)
    except Exception as e:
        print(f"[Warn] sahkotin.fi fetch error: {e}")

    # 2. Täydennetään tuoreimmat 48 h api.porssisahko.net v2 -rajapinnasta
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


def fetch_historical_weather(days_back: int = 90) -> dict:
    """Noutaa toteutuneet 100 m tuulennopeudet ja lämpötilat Suomen tuulivoima- ja kulutusalueilta."""
    weather_map = {}  # hour_epoch_ms -> {windSpeed100m, windMw, tempC}
    past_days = min(92, max(7, days_back))
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude=64.26,62.47,62.73,60.17&longitude=23.95,21.34,22.58,24.94"
        f"&hourly=temperature_2m,wind_speed_100m,wind_speed_10m"
        f"&wind_speed_unit=ms&past_days={past_days}&forecast_days=2&timezone=UTC"
    )
    try:
        data = fetch_json(url, timeout=30)
        locs = data if isinstance(data, list) else [data]
        if len(locs) >= 4 and "hourly" in locs[0]:
            times = locs[0]["hourly"]["time"]
            for i, t_str in enumerate(times):
                dt = datetime.fromisoformat(t_str + ":00+00:00")
                h_ms = int(dt.timestamp()) * 1000

                def get_w(loc_idx):
                    h_obj = locs[loc_idx]["hourly"]
                    w100 = h_obj.get("wind_speed_100m", [None])[i]
                    if w100 is not None:
                        return float(w100)
                    w10 = h_obj.get("wind_speed_10m", [None])[i]
                    return float(w10) * 1.45 if w10 is not None else 6.5

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
    except Exception as e:
        print(f"[Warn] Open-Meteo fetch error: {e}")

    return weather_map


def solve_linear_system(A: list, b: list) -> list:
    """Ratkaisee lineaarisen yhtälöryhmän A * w = b Gauss-Jordanin eliminaatiolla."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]

    for col in range(n):
        # Etsi suurin alkio sarakkeesta
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
    """
    Muodostaa piirrevektorin x_t opittavalle mallille:
    0: Vakiotermi (1.0)
    1: Tuulivoimaosuus W = windMw / 8450 (0..0.88)
    2: Tuulivoiman epälineaarinen saturaatio W^2
    3: Matalan tuulen niukkuusindikaattori max(0, 0.22 - W)^2
    4: Lämmitystarve HDD = max(0, 12 - tempC) / 20.0
    5: Kireä pakkanen max(0, -3 - tempC) / 15.0
    6: Arkipäivän aamuhuippu (klo 07-10) * (1 - W)
    7: Arkipäivän iltahuippu (klo 16-21) * (1 - W)
    8: Yökuoppa (klo 00-06)
    9: Viikonloppuvähennys (La/Su)
    10: Tyynen pakkaspäivän yhteisvaikutus: (1 - W) * HDD
    11: Autoregressiivinen hintamuisti (edellisen 24 h keskitaso tai edellisen vrk sama tunti)
    """
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


def fit_ridge_regression(observations: list, ridge_lambda: float = 1.5) -> dict:
    """Sovittaa monimuuttujaisen Ridge-regression ja tuntikohtaiset jäännösvirhekorjaukset."""
    n_feat = 14
    XtX = [[0.0] * n_feat for _ in range(n_feat)]
    Xty = [0.0] * n_feat

    # Lasketaan liukuva edellisen 24-48 h toteutunut keskihinta autoregressiiviseksi piirteeksi
    spot_by_ms = {o["epochMs"]: o["priceInclVat"] for o in observations}

    valid_rows = []
    max_ms = observations[-1]["epochMs"] if observations else 0
    for o in observations:
        y_raw = float(o["priceInclVat"])
        # Huber-tyyppinen vaimennus yksittäisille siirtoverkon häiriöpiikeille (> 30 snt/kWh)
        y = max(-1.0, min(30.0, y_raw)) if y_raw <= 30.0 else 30.0 + math.sqrt(y_raw - 30.0)
        age_days = max(0.0, (max_ms - o["epochMs"]) / (1000.0 * 3600.0 * 24.0))
        sample_w = math.exp(-age_days / 12.0)

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

    # Lasketaan tuntikohtaiset jäännösvirheet (arkipäivä 0..23 ja viikonloppu 0..23)
    # sekä Tuuliluokka (0..4) x Lämpötilaluokka (0..3) -korjausmatriisi
    weekday_hour_res = {h: [0.0, 0.0] for h in range(24)}
    weekend_hour_res = {h: [0.0, 0.0] for h in range(24)}
    wind_temp_grid = {}  # "wBin_tBin" -> [weighted_sum, weight_total]

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
        wind_temp_grid[key][0] += res * sample_w
        wind_temp_grid[key][1] += sample_w

    weekday_hour_adj = [
        round(weekday_hour_res[h][0] / (weekday_hour_res[h][1] + 4.0), 3) for h in range(24)
    ]
    weekend_hour_adj = [
        round(weekend_hour_res[h][0] / (weekend_hour_res[h][1] + 4.0), 3) for h in range(24)
    ]

    grid_adj = {}
    for k, pair in wind_temp_grid.items():
        hour_cleaned = pair[0] / (pair[1] + 8.0)
        grid_adj[k] = round(hour_cleaned * 0.45, 3)

    return {
        "weights": [round(w, 5) for w in weights],
        "weekdayHourAdj": weekday_hour_adj,
        "weekendHourAdj": weekend_hour_adj,
        "windTempGridAdj": grid_adj,
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
    """
    Testaa ja todistaa, miten malli paranee kun sille kertyy enemmän opetusdataa:
    Käytetään viimeistä 14 vuorokautta (336 tuntia) riippumattomana testiaineistona (out-of-sample),
    ja koulutetaan malli ennen testiaineistoa:
    - Vaihe 1: Koulutettu vain 7 vrk datalla (168 h)
    - Vaihe 2: Koulutettu 21 vrk datalla (504 h)
    - Vaihe 3: Koulutettu 45 vrk datalla (1080 h)
    - Vaihe 4: Koulutettu koko historiallisella datalla
    Lisäksi verrataan oppimattomaan kiinteään peruskaavaan.
    """
    if len(observations) < 500:
        return {}

    test_size = 336  # 14 vrk (2 viikkoa) testiaineisto
    train_pool = observations[:-test_size]
    test_set = observations[-test_size:]
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

    # Kiinteä oppimaton lähtötaso (naive baseline)
    naive_errs = []
    for o in test_set:
        w_ratio = o["windMw"] / FINLAND_INSTALLED_WIND_MW
        naive_pred = max(0.5, 8.5 - w_ratio * 9.0)
        naive_errs.append(abs(o["priceInclVat"] - naive_pred))
    naive_mae = round(sum(naive_errs) / len(naive_errs), 2)

    stages = []
    for label, hours_cnt in [
        ("Alkuvaihe (3 vrk / 72 tuntia dataa)", 72),
        ("Perusvaihe (7 vrk / 168 tuntia dataa)", 168),
        ("Kasvuvaihe (21 vrk / 504 tuntia dataa)", 504),
        (f"Nykyinen opittu malli ({len(observations)} tuntia dataa)", len(train_pool)),
    ]:
        subset = train_pool[-min(len(train_pool), hours_cnt) :]
        m = fit_ridge_regression(subset)
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
                    existing_obs[item["epochMs"]] = item
        except Exception:
            pass

    print("Noudetaan toteutuneet Nord Pool FI -spot-hinnat ja sää-/tuulivoimadata (90 vrk)...")
    spot_map = fetch_historical_spot_prices(days_back=90)
    weather_map = fetch_historical_weather(days_back=90)

    now_ms = int(datetime.now(timezone.utc).timestamp() // 3600) * 3600 * 1000
    added_count = 0

    for h_ms, spot_val in sorted(spot_map.items()):
        # Tallennetaan opetusdataan vain toteutuneet ja vahvistetut tunnit
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

    # Koulutetaan malli koko kertyneellä historialla
    learned_model = fit_ridge_regression(all_obs)
    learning_curve = evaluate_learning_curve(all_obs)

    # Lasketaan viimeisen 48 toteutuneen tunnin backtest-vertailu (Toteutunut vs. Opittu ennuste)
    spot_by_ms = {o["epochMs"]: o["priceInclVat"] for o in all_obs}
    recent_backtest = []
    for o in all_obs[-48:]:
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

    # Lasketaan datasta opitut havainnolliset herkkyysluvut käyttäjälle näytettäväksi
    # (esim. kuinka paljon +1000 MW tuulivoimaa laskee hintaa keskimäärin)
    low_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] < 1500]
    high_wind_obs = [o["priceInclVat"] for o in all_obs if o["windMw"] > 4500]
    avg_low_wind = round(sum(low_wind_obs) / max(1, len(low_wind_obs)), 2)
    avg_high_wind = round(sum(high_wind_obs) / max(1, len(high_wind_obs)), 2)
    wind_effect_per_1000mw = round((avg_high_wind - avg_low_wind) / 3.5, 2)

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
            "windEffectPer1000MwCents": wind_effect_per_1000mw,
        },
        "recentBacktest": recent_backtest,
    }

    with open(WEIGHTS_JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open(WEIGHTS_JS_FILE, "w", encoding="utf-8") as f:
        f.write("window.PORSSISAHKO_ML_WEIGHTS = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print("Opittu malli tallennettu tiedostoihin ml_weights.json ja ml_weights.js!")
    if learning_curve:
        print("Oppimiskäyrä (Out-of-sample MAE snt/kWh):")
        print(f"  - Oppimaton peruskaava: {learning_curve['naiveBaselineMaeCents']} snt/kWh")
        for st in learning_curve["stages"]:
            print(f"  - {st['label']}: {st['maeCents']} snt/kWh")


if __name__ == "__main__":
    main()
