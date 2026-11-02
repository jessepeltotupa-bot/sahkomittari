// Vercel Serverless API: /api/spot-and-forecast.js
// Noutaa viralliset Nord Pool FI -pörssisähkön spot-hinnat sekä laskee 7 vuorokauden (168 h)
// fysikaalis-tilastollisen hintaennusteen Suomen tuulivoimatuotannon (100 m tuulennopeudet
// Kalajoki/Pyhäjoki, Kristiinankaupunki/Närpiö, Ilmajoki ja Simo) sekä lämpötilojen perusteella.

const FINLAND_INSTALLED_WIND_MW = 8450;

function windSpeedToCapacityFactor(v100m) {
    if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.30;
    if (v100m < 3.0) return 0.02;
    if (v100m >= 25.0) return 0.05; // Myrskykatkaisu
    if (v100m >= 12.5) return 0.88;
    // Sigmoidal / kuutiollinen turbiinikäyrä välillä 3.0 - 12.5 m/s
    const norm = (v100m - 3.0) / (12.5 - 3.0);
    const cf = Math.pow(norm, 2.15) * 0.88;
    return Math.max(0.02, Math.min(0.88, cf));
}

function getHelsinkiComponents(dateObj) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Helsinki',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const parts = fmt.formatToParts(dateObj);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hour = parseInt(map.hour, 10) % 24;
    const month = parseInt(map.month, 10);
    const wd = map.weekday; // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const isWeekend = (wd === 'Sat' || wd === 'Sun');
    const isSat = (wd === 'Sat');
    return {
        year: parseInt(map.year, 10),
        month,
        day: parseInt(map.day, 10),
        hour,
        isWeekend,
        isSat,
        dateKey: `${map.year}-${map.month}-${map.day}`
    };
}

// Tyypillinen tuntikerroin Suomen sähkömarkkinalla (arkipäivä vs. viikonloppu)
const WEEKDAY_HOURLY_FACTORS = [
    0.66, 0.60, 0.57, 0.56, 0.59, 0.72,
    0.98, 1.32, 1.48, 1.36, 1.20, 1.12,
    1.06, 1.04, 1.08, 1.16, 1.30, 1.46,
    1.50, 1.42, 1.24, 1.02, 0.84, 0.72
];

const WEEKEND_HOURLY_FACTORS = [
    0.68, 0.62, 0.58, 0.56, 0.56, 0.60,
    0.68, 0.78, 0.90, 1.00, 1.05, 1.06,
    1.04, 1.02, 1.02, 1.05, 1.12, 1.20,
    1.22, 1.18, 1.08, 0.94, 0.80, 0.70
];

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');

    try {
        const now = new Date();
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 24 * 3600000).toISOString();

        // 1. Noudetaan viralliset spot-hinnat (porssisahko.net v2 + sahkotin.fi varalla)
        let officialHourlyMap = new Map(); // hourEpochMs -> { priceInclVat, priceVat0 }

        try {
            const r1 = await fetch('https://api.porssisahko.net/v2/latest-prices.json', {
                headers: { 'User-Agent': 'PorssisahkoEnnuste/1.0' }
            });
            if (r1.ok) {
                const d1 = await r1.json();
                if (d1 && Array.isArray(d1.prices)) {
                    const bucket = new Map();
                    for (const item of d1.prices) {
                        const t = new Date(item.startDate).getTime();
                        const hourMs = Math.floor(t / 3600000) * 3600000;
                        if (!bucket.has(hourMs)) bucket.set(hourMs, []);
                        bucket.get(hourMs).push(Number(item.price));
                    }
                    for (const [hourMs, vals] of bucket.entries()) {
                        const avgIncl = vals.reduce((a, b) => a + b, 0) / vals.length;
                        officialHourlyMap.set(hourMs, {
                            priceInclVat: Number(avgIncl.toFixed(3)),
                            priceVat0: Number((avgIncl / 1.255).toFixed(3))
                        });
                    }
                }
            }
        } catch (_) {}

        try {
            const sahkotinStart = encodeURIComponent(startHourIso);
            const r2 = await fetch(`https://sahkotin.fi/prices?fix&vat&start=${sahkotinStart}`, {
                headers: { 'User-Agent': 'PorssisahkoEnnuste/1.0' }
            });
            if (r2.ok) {
                const d2 = await r2.json();
                if (d2 && Array.isArray(d2.prices)) {
                    for (const item of d2.prices) {
                        const t = new Date(item.date).getTime();
                        const hourMs = Math.floor(t / 3600000) * 3600000;
                        if (!officialHourlyMap.has(hourMs)) {
                            const val = Number(item.value);
                            officialHourlyMap.set(hourMs, {
                                priceInclVat: Number(val.toFixed(3)),
                                priceVat0: Number((val / 1.255).toFixed(3))
                            });
                        }
                    }
                }
            }
        } catch (_) {}

        // 2. Noudetaan Open-Meteo 7 vrk sää- ja tuulivoimaennuste Suomen tuulivoimavyöhykkeille ja kulutuskeskuksille
        // Kalajoki/Pyhäjoki (64.26, 23.95), Kristiinankaupunki/Närpiö (62.47, 21.34), Ilmajoki (62.73, 22.58), Oulu/Simo (65.30, 25.20), Helsinki (60.17, 24.94)
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17&longitude=23.95,21.34,22.58,24.94&hourly=temperature_2m,wind_speed_100m,wind_speed_10m&wind_speed_unit=ms&past_days=1&forecast_days=7&timezone=UTC';
        const weatherMap = new Map(); // hourMs -> { windSpeed100m, windMw, tempC }

        try {
            const rw = await fetch(weatherUrl);
            if (rw.ok) {
                const dw = await rw.json();
                const locs = Array.isArray(dw) ? dw : [dw];
                if (locs.length >= 4 && locs[0].hourly && Array.isArray(locs[0].hourly.time)) {
                    const times = locs[0].hourly.time;
                    for (let i = 0; i < times.length; i++) {
                        const tMs = Date.parse(times[i] + ':00Z');
                        const w1 = locs[0].hourly.wind_speed_100m?.[i] ?? (locs[0].hourly.wind_speed_10m?.[i] * 1.45) ?? 6.5;
                        const w2 = locs[1].hourly.wind_speed_100m?.[i] ?? (locs[1].hourly.wind_speed_10m?.[i] * 1.45) ?? 6.5;
                        const w3 = locs[2].hourly.wind_speed_100m?.[i] ?? (locs[2].hourly.wind_speed_10m?.[i] * 1.45) ?? 6.0;
                        // Painotettu tuulennopeus Suomen tuulipuistokapasiteetin mukaan
                        const weightedWind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20;
                        const cf = windSpeedToCapacityFactor(weightedWind);
                        const windMw = Math.round(FINLAND_INSTALLED_WIND_MW * cf);

                        // Painotettu lämpötila kulutuksen mukaan (Etelä-Suomi + Länsi-Suomi + Pohjois-Suomi)
                        const tSouth = locs[3].hourly.temperature_2m?.[i] ?? 5.0;
                        const tWest = locs[2].hourly.temperature_2m?.[i] ?? 3.0;
                        const tNorth = locs[0].hourly.temperature_2m?.[i] ?? 1.0;
                        const weightedTemp = Number((tSouth * 0.55 + tWest * 0.25 + tNorth * 0.20).toFixed(1));

                        weatherMap.set(tMs, {
                            windSpeed100m: Number(weightedWind.toFixed(1)),
                            windMw,
                            tempC: weightedTemp
                        });
                    }
                }
            }
        } catch (_) {}

        // 3. Kalibroidaan ennustemallin perustaso viimeisten toteutuneiden spot-tuntien ja tuulituotannon perusteella
        let observedSum = 0;
        let modelUnscaledSum = 0;
        let calCount = 0;

        function computeRawForecastPriceInclVat(hourMs, weather) {
            const hel = getHelsinkiComponents(new Date(hourMs));
            const w = weather || { windSpeed100m: 6.5, windMw: 2400, tempC: 4.0 };
            const windRatio = w.windMw / FINLAND_INSTALLED_WIND_MW; // 0.02 .. 0.88

            // Lämmitystarve: kun lämpötila laskee alle +12 C, kulutus kasvaa; alle -5 C jyrkemmin
            const heatingDegrees = Math.max(0, 12.0 - w.tempC);
            const coldPenalty = heatingDegrees * 0.32 + Math.max(0, -5.0 - w.tempC) * 0.55;

            // Tuulivoiman hintaa laskeva vaikutus (Suomen markkinalla korkea tuulituotanto painaa hinnan lähelle 0-2 snt/kWh)
            const baseThermalAndHydro = 7.40 + coldPenalty;
            const windDiscount = Math.pow(windRatio / 0.35, 1.25) * 4.80;
            const dailyBase = Math.max(0.45, baseThermalAndHydro - windDiscount);

            const hourProfile = hel.isWeekend
                ? WEEKEND_HOURLY_FACTORS[hel.hour]
                : WEEKDAY_HOURLY_FACTORS[hel.hour];

            // Jos tuulivoimaa on yli 4800 MW, myös päiväpiikit tasoittuvat voimakkaasti
            const peakCompression = windRatio > 0.52 ? 0.55 : (windRatio < 0.16 ? 1.30 : 1.0);
            const adjustedFactor = 1.0 + (hourProfile - 1.0) * peakCompression;

            return Math.max(0.15, dailyBase * adjustedFactor);
        }

        for (const [hourMs, spotObj] of officialHourlyMap.entries()) {
            if (weatherMap.has(hourMs) && spotObj.priceInclVat >= 0) {
                observedSum += spotObj.priceInclVat;
                modelUnscaledSum += computeRawForecastPriceInclVat(hourMs, weatherMap.get(hourMs));
                calCount++;
            }
        }

        let calibrationOffset = 0.0;
        if (calCount >= 12 && modelUnscaledSum > 0) {
            const obsAvg = observedSum / calCount;
            const modAvg = modelUnscaledSum / calCount;
            // Rajoitetaan kalibrointisiirtymä kohtuulliseksi, jotta yksittäinen häiriöpiikki ei vääristä koko viikkoa
            calibrationOffset = Math.max(-3.5, Math.min(4.5, (obsAvg - modAvg) * 0.55));
        }

        // 4. Rakennetaan yhtenäinen aikasarja: kuluva vuorokausi + 6 tulevaa vuorokautta (yht. 168 h)
        const currentHourMs = Math.floor(now.getTime() / 3600000) * 3600000;
        const startSeriesMs = currentHourMs - 12 * 3600000;
        const series = [];

        for (let i = 0; i < 180; i++) {
            const hMs = startSeriesMs + i * 3600000;
            const w = weatherMap.get(hMs) || { windSpeed100m: 6.5, windMw: 2400, tempC: 4.0 };
            const official = officialHourlyMap.get(hMs);
            const hel = getHelsinkiComponents(new Date(hMs));

            if (official) {
                series.push({
                    timestamp: new Date(hMs).toISOString(),
                    epochMs: hMs,
                    dateKey: hel.dateKey,
                    hour: hel.hour,
                    isWeekend: hel.isWeekend,
                    isSat: hel.isSat,
                    month: hel.month,
                    isForecast: false,
                    priceInclVat: official.priceInclVat,
                    priceVat0: official.priceVat0,
                    minInclVat: official.priceInclVat,
                    maxInclVat: official.priceInclVat,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC
                });
            } else {
                const rawEst = computeRawForecastPriceInclVat(hMs, w) + calibrationOffset;
                const estInclVat = Number(Math.max(0.10, rawEst).toFixed(2));
                const estVat0 = Number((estInclVat / 1.255).toFixed(2));
                const spread = Math.max(1.10, estInclVat * 0.28);
                series.push({
                    timestamp: new Date(hMs).toISOString(),
                    epochMs: hMs,
                    dateKey: hel.dateKey,
                    hour: hel.hour,
                    isWeekend: hel.isWeekend,
                    isSat: hel.isSat,
                    month: hel.month,
                    isForecast: true,
                    priceInclVat: estInclVat,
                    priceVat0: estVat0,
                    minInclVat: Number(Math.max(0.0, estInclVat - spread).toFixed(2)),
                    maxInclVat: Number((estInclVat + spread * 1.15).toFixed(2)),
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC
                });
            }
        }

        return res.status(200).json({
            generatedAt: new Date().toISOString(),
            installedWindMw: FINLAND_INSTALLED_WIND_MW,
            officialHoursCount: officialHourlyMap.size,
            series
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Spot- ja ennustedatan haku epäonnistui',
            details: String(err && err.message ? err.message : err)
        });
    }
}
