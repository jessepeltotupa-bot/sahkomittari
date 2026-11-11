// Spotpuls Public REST API v1: /api/v1/prices
// Real-time day-ahead spot electricity prices & self-learning 7-day regional forecasts
// across all 40 European bidding zones.
// Powered by Spotpuls — https://spotpuls.app

import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://spotpuls.app';

const ZONE_ALIASES = {
    SE: 'SE3',
    NO: 'NO1',
    DK: 'DK2',
    DE: 'DE-LU',
    LU: 'DE-LU',
    DELU: 'DE-LU',
    IT: 'IT-North',
    'IT-NORD': 'IT-North',
    'IT-CNOR': 'IT-Centre-North',
    'IT-CSUD': 'IT-Centre-South',
    'IT-SUD': 'IT-South',
    'IT-SICI': 'IT-Sicily',
    'IT-SARD': 'IT-Sardinia',
    IE: 'IE-SEM',
    'IE(SEM)': 'IE-SEM',
    SEM: 'IE-SEM',
    UK: 'GB',
    EL: 'GR'
};

const NORDPOOL_SPOTHINTA_ZONES = new Set([
    'FI', 'SE1', 'SE2', 'SE3', 'SE4',
    'NO1', 'NO2', 'NO3', 'NO4', 'NO5',
    'DK1', 'DK2', 'EE', 'LV', 'LT'
]);

let cachedGlobalConfig = null;
let cachedFiWeights = null;

function loadGlobalConfig() {
    if (cachedGlobalConfig) return cachedGlobalConfig;
    try {
        const p = path.join(process.cwd(), 'data', 'global_zones.json');
        if (fs.existsSync(p)) {
            cachedGlobalConfig = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return cachedGlobalConfig;
        }
    } catch (_) {}
    return { zones: {}, countries: {} };
}

function loadFiWeights() {
    if (cachedFiWeights) return cachedFiWeights;
    try {
        const p = path.join(process.cwd(), 'ml_weights.json');
        if (fs.existsSync(p)) {
            cachedFiWeights = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return cachedFiWeights;
        }
    } catch (_) {}
    return null;
}

function resolveZoneCode(rawZone, zonesObj) {
    if (!rawZone) return 'FI';
    const trimmed = String(rawZone).trim();
    if (zonesObj[trimmed]) return trimmed;
    const upper = trimmed.toUpperCase();
    if (zonesObj[upper]) return upper;
    if (ZONE_ALIASES[upper] && zonesObj[ZONE_ALIASES[upper]]) return ZONE_ALIASES[upper];
    for (const k of Object.keys(zonesObj)) {
        if (k.toUpperCase() === upper) return k;
    }
    return 'FI';
}

function findMarketForZone(zoneCode, countriesObj) {
    const zCountry = (zoneCode.split('-')[0] || 'FI').toLowerCase();
    if (zCountry === 'de') return countriesObj.de;
    if (zCountry === 'it') return countriesObj.it;
    if (zCountry === 'ie') return countriesObj.ie;
    if (zoneCode.startsWith('SE')) return countriesObj.se;
    if (zoneCode.startsWith('NO')) return countriesObj.no;
    if (zoneCode.startsWith('DK')) return countriesObj.dk;
    if (countriesObj[zCountry]) return countriesObj[zCountry];
    for (const c of Object.values(countriesObj)) {
        if (c.zones && c.zones[zoneCode] && c.countryId !== 'en') return c;
    }
    return countriesObj.fi || countriesObj.en || null;
}

function getZoneTimeComponents(epochMs, tz) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz || 'Europe/Helsinki',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const parts = fmt.formatToParts(new Date(epochMs));
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hour = parseInt(map.hour, 10) % 24;
    const month = parseInt(map.month, 10);
    const wd = map.weekday;
    const isWeekend = (wd === 'Sat' || wd === 'Sun');
    const fixedHolidays = ['01-01', '01-06', '05-01', '12-24', '12-25', '12-26'];
    const isHoliday = fixedHolidays.includes(`${map.month}-${map.day}`);
    return {
        year: parseInt(map.year, 10),
        month,
        day: parseInt(map.day, 10),
        hour,
        isWeekend,
        isSat: wd === 'Sat',
        isFreeDay: isWeekend || isHoliday,
        dateKey: `${map.year}-${map.month}-${map.day}`
    };
}

function windSpeedToCapacityFactor(v100m) {
    if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.28;
    const v = Number(v100m);
    if (v < 3.0) return 0.02;
    if (v >= 25.0) return 0.08;
    if (v >= 14.2) return 0.86;
    const norm = (v - 3.0) / (14.2 - 3.0);
    return Math.max(0.02, Math.min(0.86, Math.pow(norm, 1.72) * 0.86));
}

function radiationToSolarCf(radWm2, month, hour) {
    if (radWm2 !== null && radWm2 !== undefined && !isNaN(radWm2)) {
        return Math.max(0.0, Math.min(0.84, (Number(radWm2) / 820.0) * 0.82));
    }
    if (hour < 6 || hour > 20) return 0.0;
    const seasonPeak = Math.max(0.08, Math.sin(((month - 1.5) / 10.0) * Math.PI));
    const hourPeak = Math.max(0.0, Math.cos(((hour - 13.0) / 5.5) * (Math.PI / 2.0)));
    return 0.55 * seasonPeak * hourPeak;
}

async function fetchZoneOfficialSpotVat0EurCents(zoneCode, zcfg) {
    const spotVat0Map = new Map();
    const now = new Date();
    const past10dIso = new Date(now.getTime() - 10 * 86400000).toISOString();
    const future48hIso = new Date(now.getTime() + 48 * 3600000).toISOString();
    const minuteBust = Math.floor(Date.now() / 60000);

    const tasks = [];

    // 1. Finland: sahkotin.fi + spot-hinta.fi
    if (zoneCode === 'FI') {
        tasks.push(
            fetch(`https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(past10dIso)}&end=${encodeURIComponent(future48hIso)}&_t=${minuteBust}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.prices)) {
                        for (const it of d.prices) {
                            const hMs = Math.floor(new Date(it.date).getTime() / 3600000) * 3600000;
                            const valVat0 = Number(it.value) / 1.255;
                            if (!isNaN(valVat0)) spotVat0Map.set(hMs, valVat0);
                        }
                    }
                }).catch(() => {})
        );
    }

    // 2. Nordics & Baltics (15 zones): api.spot-hinta.fi
    if (NORDPOOL_SPOTHINTA_ZONES.has(zoneCode)) {
        const shUrl = zoneCode === 'FI'
            ? `https://api.spot-hinta.fi/TodayAndDayForward?_t=${minuteBust}`
            : `https://api.spot-hinta.fi/TodayAndDayForward?region=${encodeURIComponent(zoneCode)}&_t=${minuteBust}`;
        tasks.push(
            fetch(shUrl)
                .then(r => r.ok ? r.json() : null)
                .then(arr => {
                    if (!Array.isArray(arr)) return;
                    const buckets = new Map();
                    for (const it of arr) {
                        if (!it || !it.DateTime || it.PriceNoTax === undefined) continue;
                        const hMs = Math.floor(new Date(it.DateTime).getTime() / 3600000) * 3600000;
                        const cVat0 = Number(it.PriceNoTax) * 100.0;
                        if (!isNaN(cVat0)) {
                            if (!buckets.has(hMs)) buckets.set(hMs, []);
                            buckets.get(hMs).push(cVat0);
                        }
                    }
                    for (const [hMs, vals] of buckets.entries()) {
                        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                        spotVat0Map.set(hMs, avg);
                    }
                }).catch(() => {})
        );
    }

    // 3. Germany / Austria direct EPEX feed (aWATTar)
    if (zoneCode === 'DE-LU' || zoneCode === 'AT') {
        const host = zoneCode === 'AT' ? 'api.awattar.at' : 'api.awattar.de';
        const startMs = now.getTime() - 7 * 86400000;
        const endMs = now.getTime() + 48 * 3600000;
        tasks.push(
            fetch(`https://${host}/v1/marketdata?start=${startMs}&end=${endMs}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.data)) {
                        for (const it of d.data) {
                            const hMs = Math.floor(Number(it.start_timestamp) / 3600000) * 3600000;
                            const cVat0 = Number(it.marketprice) / 10.0; // EUR/MWh -> EUR c/kWh
                            if (!isNaN(cVat0)) spotVat0Map.set(hMs, cVat0);
                        }
                    }
                }).catch(() => {})
        );
    }

    // 4. Spain & Portugal: Red Eléctrica (REE apidatos)
    if (zoneCode === 'ES' || zoneCode === 'PT') {
        const sIso = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 16);
        const eIso = new Date(now.getTime() + 36 * 3600000).toISOString().slice(0, 16);
        tasks.push(
            fetch(`https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${sIso}&end_date=${eIso}&time_trunc=hour`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    const included = d?.included || [];
                    const spotSeries = included.find(x => String(x?.attributes?.title || '').toLowerCase().includes('spot')) || included[0];
                    const vals = spotSeries?.attributes?.values || [];
                    for (const v of vals) {
                        const hMs = Math.floor(new Date(v.datetime).getTime() / 3600000) * 3600000;
                        const cVat0 = Number(v.value) / 10.0;
                        if (!isNaN(cVat0)) spotVat0Map.set(hMs, cVat0);
                    }
                }).catch(() => {})
        );
    }

    // 5. Great Britain (GB): Octopus wholesale / Agile half-hourly feed aggregated to hourly
    if (zoneCode === 'GB') {
        const pFrom = new Date(now.getTime() - 4 * 86400000).toISOString();
        tasks.push(
            fetch(`https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-C/standard-unit-rates/?period_from=${encodeURIComponent(pFrom)}&page_size=250`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.results)) {
                        const buckets = new Map();
                        for (const it of d.results) {
                            const hMs = Math.floor(new Date(it.valid_from).getTime() / 3600000) * 3600000;
                            // Convert Agile retail ex-VAT p/kWh approximation to wholesale EUR cents/kWh VAT0
                            const agileExVatPence = Number(it.value_exc_vat);
                            const approxWholesalePence = Math.max(-5.0, agileExVatPence / 2.1);
                            const eurCentsVat0 = approxWholesalePence / 0.84;
                            if (!isNaN(eurCentsVat0)) {
                                if (!buckets.has(hMs)) buckets.set(hMs, []);
                                buckets.get(hMs).push(eurCentsVat0);
                            }
                        }
                        for (const [hMs, vals] of buckets.entries()) {
                            spotVat0Map.set(hMs, vals.reduce((a, b) => a + b, 0) / vals.length);
                        }
                    }
                }).catch(() => {})
        );
    }

    // 6. Fraunhofer ISE Energy-Charts ENTSO-E feed for European zones
    if (zcfg && zcfg.bzn && !['ES', 'GB'].includes(zoneCode)) {
        const startDay = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const endDay = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
        const ecUrl = `https://api.energy-charts.info/price?bzn=${encodeURIComponent(zcfg.bzn)}&start=${startDay}&end=${endDay}`;
        tasks.push(
            fetch(ecUrl, { headers: { 'User-Agent': 'Spotpuls/1.0 (+https://spotpuls.app)' } })
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.unix_seconds) && Array.isArray(d.price)) {
                        const buckets = new Map();
                        for (let i = 0; i < d.unix_seconds.length; i++) {
                            if (d.price[i] === null || d.price[i] === undefined) continue;
                            const hMs = Math.floor((Number(d.unix_seconds[i]) * 1000) / 3600000) * 3600000;
                            const cVat0 = Number(d.price[i]) / 10.0;
                            if (!isNaN(cVat0)) {
                                if (!buckets.has(hMs)) buckets.set(hMs, []);
                                buckets.get(hMs).push(cVat0);
                            }
                        }
                        for (const [hMs, vals] of buckets.entries()) {
                            if (!spotVat0Map.has(hMs)) {
                                spotVat0Map.set(hMs, vals.reduce((a, b) => a + b, 0) / vals.length);
                            }
                        }
                    }
                }).catch(() => {})
        );
    }

    await Promise.allSettled(tasks);
    return spotVat0Map;
}

function extractZoneFeatures24(obs, zcfg) {
    const wCap = Math.max(100, zcfg.windCapMw || 3000);
    const sCap = Math.max(100, zcfg.solarCapMw || 1500);
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / wCap));
    const tempC = obs.tempC;
    const hour = obs.hour;
    const isFree = obs.isFreeDay ? 1.0 : 0.0;

    const hdd = Math.max(0.0, 12.0 - tempC) / 20.0;
    const severeCold = Math.max(0.0, -3.0 - tempC) / 15.0;
    const workdayActive = (!obs.isFreeDay && hour >= 6 && hour <= 22) ? 1.25 : 0.45;
    const lowWindScarcity = Math.pow(Math.max(0.0, 0.25 - wRatio), 2) * 10.0
        + Math.pow(Math.max(0.0, 0.13 - wRatio), 2) * 45.0 * workdayActive;

    const morningPeak = (!obs.isFreeDay && hour >= 7 && hour <= 10 ? 1.0 : 0.0) * Math.max(0.0, 1.0 - wRatio * 1.1);
    const eveningPeak = (!obs.isFreeDay && hour >= 16 && hour <= 21 ? 1.0 : 0.0) * Math.max(0.0, 1.0 - wRatio * 1.1);
    const nightTrough = (hour >= 0 && hour <= 5) ? 1.0 : 0.0;
    const calmColdInter = (1.0 - wRatio) * hdd;

    const windMemoryDamping = Math.max(0.12, 1.0 - 0.85 * wRatio);
    const prev24 = obs.prev24hMean !== undefined ? obs.prev24hMean : (zcfg.baseEurMwh / 10.0);
    const arLevel = (Math.min(28.0, prev24) / 10.0) * windMemoryDamping;

    const isHeatingSeason = [10, 11, 12, 1, 2, 3, 4].includes(obs.month) ? 1.0 : 0.0;
    const heatingPeak = isHeatingSeason * (!obs.isFreeDay && ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 21)) ? 1.0 : 0.0) * (1.0 - wRatio);

    const t72 = obs.rolling72hTempC !== undefined ? obs.rolling72hTempC : tempC;
    const rolling72hHdd = Math.max(0.0, 10.0 - t72) / 20.0;

    const solarRatio = Math.max(0.0, Math.min(0.95, (obs.solarMw || 0.0) / sCap));
    const nucDefRatio = (obs.nuclearDeficitMw || 0.0) / 2000.0;
    const nucScarcityInter = nucDefRatio * Math.max(0.0, 0.55 - wRatio) * (obs.isFreeDay ? 0.5 : 1.0);

    const w24Ratio = Math.max(0.01, Math.min(0.95, (obs.rolling24hWindMw || obs.windMw) / wCap));
    const rolling24hLowWind = Math.max(0.0, 0.35 - w24Ratio) * 2.0;
    const windRampDrop = Math.max(0.0, -(obs.windRamp6hMw || 0.0)) / Math.max(400.0, wCap * 0.30);

    const borderCf = windSpeedToCapacityFactor(obs.borderWindSpeed !== undefined ? obs.borderWindSpeed : 6.5);
    const borderImportRelief = borderCf * (1.0 - wRatio * 0.5);
    const borderExportPull = Math.max(0.0, 0.45 - borderCf) * (hour >= 7 && hour <= 21 ? 1.0 : 0.3);

    const pressHpa = obs.pressureHpa !== undefined ? obs.pressureHpa : 1013.0;
    const blockingHigh = Math.max(0.0, (pressHpa - 1018.0) / 25.0) * isHeatingSeason;

    const lag24Same = Math.min(35.0, obs.lag24hSameHour !== undefined ? obs.lag24hSameHour : prev24);
    const prev7d = Math.min(30.0, obs.prev7dMean !== undefined ? obs.prev7dMean : prev24);
    const prevStd = Math.min(18.0, obs.prev24hStd !== undefined ? obs.prev24hStd : 2.0);
    const arComposite = ((0.45 * lag24Same + 0.35 * prev7d + 0.20 * prevStd) / 10.0) * windMemoryDamping;

    return [
        1.0, wRatio, wRatio * wRatio, lowWindScarcity, hdd, severeCold,
        morningPeak, eveningPeak, nightTrough, isFree, calmColdInter, arLevel,
        isHeatingSeason, heatingPeak, rolling72hHdd, solarRatio,
        nucDefRatio, nucScarcityInter, rolling24hLowWind, windRampDrop,
        borderImportRelief, borderExportPull, blockingHigh, arComposite
    ];
}

function predictVat0EurCents(obs, model, zcfg) {
    const x = extractZoneFeatures24(obs, zcfg);
    const w = model.weights;
    let lin = 0.0;
    for (let i = 0; i < Math.min(w.length, x.length); i++) lin += w[i] * x[i];
    const wCap = Math.max(100, zcfg.windCapMw || 3000);
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / wCap));
    const hRaw = obs.isFreeDay ? (model.weekendHourAdj[obs.hour] || 0) : (model.weekdayHourAdj[obs.hour] || 0);
    const hScale = hRaw > 0 ? Math.max(0.22, 1.15 - 0.85 * wRatio) : 1.0;

    // Cooling Degree Day (CDD) summer A/C demand effect for warm/Mediterranean zones
    const cdd = Math.max(0.0, (obs.tempC || 15.0) - 23.0) / 10.0;
    const heatPremium = cdd * (zcfg.heatSens || 0.15) * (obs.hour >= 12 && obs.hour <= 22 ? 3.2 : 1.1);

    return Math.max(0.04, lin + hRaw * hScale + heatPremium);
}

function adaptZoneModelOnline(baseModel, recentObs, zcfg) {
    const weights = [...baseModel.weights];
    while (weights.length < 24) weights.push(0.0);
    const weekdayHourAdj = [...baseModel.weekdayHourAdj];
    const weekendHourAdj = [...baseModel.weekendHourAdj];

    if (!recentObs || recentObs.length < 12) {
        return { weights, weekdayHourAdj, weekendHourAdj, onlineSamples: 0 };
    }

    const tail = recentObs.slice(-168);
    for (const obs of tail) {
        const y = Math.max(-1.0, Math.min(40.0, obs.spotVat0EurCents));
        const x = extractZoneFeatures24(obs, zcfg);
        let predLin = 0.0;
        let normSq = 1.0;
        for (let i = 0; i < 24; i++) {
            predLin += weights[i] * x[i];
            normSq += x[i] * x[i];
        }
        const hAdj = obs.isFreeDay ? weekendHourAdj[obs.hour] : weekdayHourAdj[obs.hour];
        const err = Math.max(-8.0, Math.min(8.0, y - (predLin + hAdj)));
        const lr = 0.030 / normSq;
        for (let i = 0; i < 24; i++) {
            weights[i] += lr * err * x[i];
        }
        if (weights[15] > 0) weights[15] = 0;
        if (obs.isFreeDay) {
            weekendHourAdj[obs.hour] = weekendHourAdj[obs.hour] * 0.94 + (y - predLin) * 0.06;
        } else {
            weekdayHourAdj[obs.hour] = weekdayHourAdj[obs.hour] * 0.94 + (y - predLin) * 0.06;
        }
    }

    return {
        weights: weights.map(v => Number(v.toFixed(5))),
        weekdayHourAdj: weekdayHourAdj.map(v => Number(v.toFixed(4))),
        weekendHourAdj: weekendHourAdj.map(v => Number(v.toFixed(4))),
        onlineSamples: tail.length
    };
}

export async function buildSpotpulsZoneResponse(query = {}) {
    const globalCfg = loadGlobalConfig();
    const zonesObj = globalCfg.zones || {};
    const countriesObj = globalCfg.countries || {};

    if (query.list === 'zones' || query.list === '1') {
        const list = Object.values(zonesObj).map(z => {
            const mkt = findMarketForZone(z.code, countriesObj);
            const dashPath = mkt ? mkt.path : '/en/';
            return {
                zone: z.code,
                bzn: z.bzn,
                name: z.name,
                country: z.country,
                exchange: z.exchange,
                timezone: z.tz,
                currencyUnit: mkt ? mkt.currencyUnit : 'ct/kWh',
                vatRate: z.code === 'NO4' ? 1.0 : (mkt ? mkt.vatRate : 1.20),
                dashboardUrl: `${SITE_URL}${dashPath}?zone=${encodeURIComponent(z.code)}`,
                apiUrl: `${SITE_URL}/api/v1/prices?zone=${encodeURIComponent(z.code)}`
            };
        });
        return {
            isZoneDirectory: true,
            payload: {
                status: 'ok',
                provider: 'Spotpuls',
                website: SITE_URL,
                apiDocsUrl: `${SITE_URL}/api-docs/`,
                openApiSpec: `${SITE_URL}/openapi.json`,
                zoneCount: list.length,
                zones: list
            }
        };
    }

    const zoneCode = resolveZoneCode(query.zone || query.bzn || query.region, zonesObj);
    const zcfg = zonesObj[zoneCode] || zonesObj.FI;
    const mkt = findMarketForZone(zoneCode, countriesObj) || {
        countryId: 'en',
        path: '/en/',
        currencyUnit: 'ct/kWh',
        currencyMajor: '€',
        fxFromEurCents: 1.0,
        vatRate: 1.20
    };

    const wantEurMwh = String(query.currency || '').toLowerCase() === 'eur_mwh';
    const wantEurCents = String(query.currency || '').toLowerCase() === 'eur_cents';
    const includeVat = query.vat === '0' || query.vat === 'false' ? false : true;
    const effectiveVatRate = (zoneCode === 'NO4' || !includeVat) ? 1.0 : (mkt.vatRate || 1.20);
    const fxScale = (wantEurMwh || wantEurCents) ? 1.0 : (mkt.fxFromEurCents || 1.0);
    const unitLabel = wantEurMwh ? 'EUR/MWh' : (wantEurCents ? 'ct/kWh' : mkt.currencyUnit);

    const coords = zcfg.coords || [
        { lat: 64.26, lon: 23.95 },
        { lat: 63.10, lon: 21.62 },
        { lat: 60.17, lon: 24.94 },
        { lat: 63.82, lon: 20.26 }
    ];
    const lats = coords.map(c => c.lat).join(',');
    const lons = coords.map(c => c.lon).join(',');
    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=10&forecast_days=8&timezone=UTC`;

    const [spotVat0Map, weatherResp] = await Promise.all([
        fetchZoneOfficialSpotVat0EurCents(zoneCode, zcfg),
        fetch(openMeteoUrl).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);

    const weatherMap = new Map();
    const wCap = Math.max(100, zcfg.windCapMw || 3000);
    const sCap = Math.max(100, zcfg.solarCapMw || 1500);

    if (weatherResp) {
        const locs = Array.isArray(weatherResp) ? weatherResp : [weatherResp];
        if (locs.length >= 1 && locs[0].hourly && Array.isArray(locs[0].hourly.time)) {
            const times = locs[0].hourly.time;
            const l0 = locs[0], l1 = locs[1] || l0, l2 = locs[2] || l0, l3 = locs[3] || l0;
            for (let i = 0; i < times.length; i++) {
                const tMs = Date.parse(times[i] + ':00Z');
                const w1 = l0.hourly.wind_speed_100m?.[i] ?? 6.5;
                const w2 = l1.hourly.wind_speed_100m?.[i] ?? w1;
                const wLoad = l2.hourly.wind_speed_100m?.[i] ?? w1;
                const weightedWind = w1 * 0.50 + w2 * 0.35 + wLoad * 0.15;
                const windMw = Math.round(wCap * windSpeedToCapacityFactor(weightedWind));

                const tLoad = l2.hourly.temperature_2m?.[i] ?? 8.0;
                const tW1 = l0.hourly.temperature_2m?.[i] ?? tLoad;
                const tempC = Number((tLoad * 0.70 + tW1 * 0.30).toFixed(1));

                const radLoad = l2.hourly.shortwave_radiation?.[i] ?? 0;
                const radW2 = l1.hourly.shortwave_radiation?.[i] ?? radLoad;
                const solarRadWm2 = Number((radLoad * 0.6 + radW2 * 0.4).toFixed(1));
                const pressureHpa = l2.hourly.surface_pressure?.[i] ?? 1013.0;
                const borderWindSpeed = Number((l3.hourly.wind_speed_100m?.[i] ?? weightedWind).toFixed(2));

                weatherMap.set(tMs, {
                    windSpeed100m: Number(weightedWind.toFixed(2)),
                    windMw,
                    tempC,
                    solarRadWm2,
                    pressureHpa,
                    borderWindSpeed
                });
            }
        }
    }

    const fiWeights = loadFiWeights();
    const fiSchedule = zoneCode === 'FI' && fiWeights ? (fiWeights.nuclearOutageSchedule || []) : [];

    const sortedWMs = Array.from(weatherMap.keys()).sort((a, b) => a - b);
    for (let i = 0; i < sortedWMs.length; i++) {
        const ms = sortedWMs[i];
        const w = weatherMap.get(ms);
        const zt = getZoneTimeComponents(ms, zcfg.tz);
        let nucOff = 0;
        for (const item of fiSchedule) {
            if (zt.dateKey >= item.start && zt.dateKey <= item.end) nucOff += item.mw;
        }
        w.nuclearDeficitMw = Math.min(3000, nucOff);
        w.nuclearMw = Math.max(0, (zcfg.nuclearCapMw || 0) - w.nuclearDeficitMw);
        w.solarMw = Math.round(sCap * radiationToSolarCf(w.solarRadWm2, zt.month, zt.hour));

        let sumW24 = 0, cntW24 = 0;
        for (let j = Math.max(0, i - 23); j <= i; j++) {
            sumW24 += weatherMap.get(sortedWMs[j]).windMw;
            cntW24++;
        }
        w.rolling24hWindMw = Math.round(sumW24 / Math.max(1, cntW24));
        w.windRamp6hMw = w.windMw - weatherMap.get(sortedWMs[Math.max(0, i - 6)]).windMw;

        let sumT72 = 0, cntT72 = 0;
        for (let j = Math.max(0, i - 71); j <= i; j++) {
            sumT72 += weatherMap.get(sortedWMs[j]).tempC;
            cntT72++;
        }
        w.rolling72hTempC = Number((sumT72 / Math.max(1, cntT72)).toFixed(2));
    }

    const recentObs = [];
    const sortedSpotMs = Array.from(spotVat0Map.keys()).sort((a, b) => a - b);
    for (const ms of sortedSpotMs) {
        const w = weatherMap.get(ms);
        if (!w) continue;
        const zt = getZoneTimeComponents(ms, zcfg.tz);
        recentObs.push({
            epochMs: ms,
            hour: zt.hour,
            month: zt.month,
            isWeekend: zt.isWeekend,
            isFreeDay: zt.isFreeDay,
            spotVat0EurCents: spotVat0Map.get(ms),
            ...w
        });
    }

    const baseZoneModel = zcfg.modelVat0EurCents || {
        weights: [5.0, -4.0, 1.5, 9.5, 1.6, 2.4, 1.4, 1.8, -1.2, -1.0, 3.2, 1.6, 0.8, 1.2, 0.8, -0.6, 0.5, 1.0, 1.0, 0.6, -0.9, 0.7, 0.9, 2.0],
        weekdayHourAdj: new Array(24).fill(0),
        weekendHourAdj: new Array(24).fill(0)
    };
    const activeModel = adaptZoneModelOnline(baseZoneModel, recentObs, zcfg);

    const baseMeanVat0 = zcfg.baseSpotEurCentsVat0 || (zcfg.baseEurMwh / 10.0) || 6.5;
    const recent24 = recentObs.slice(-24).map(o => o.spotVat0EurCents);
    const prev24hMean = recent24.length > 0 ? recent24.reduce((a, b) => a + b, 0) / recent24.length : baseMeanVat0;
    const prev24hStd = recent24.length > 1
        ? Math.sqrt(recent24.reduce((a, b) => a + Math.pow(b - prev24hMean, 2), 0) / recent24.length)
        : 1.8;
    const recent168 = recentObs.slice(-168).map(o => o.spotVat0EurCents);
    const prev7dMean = recent168.length > 0 ? recent168.reduce((a, b) => a + b, 0) / recent168.length : baseMeanVat0;

    const last24ByHour = {};
    for (const o of recentObs.slice(-48)) last24ByHour[o.hour] = o.spotVat0EurCents;

    const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
    const nowZt = getZoneTimeComponents(nowHourMs, zcfg.tz);
    const startSeriesMs = nowHourMs - nowZt.hour * 3600000;
    const daysReq = Math.max(1, Math.min(8, parseInt(query.days || '8', 10) || 8));
    const totalHours = daysReq * 24;

    const convertPrice = (eurCentsVat0) => {
        if (wantEurMwh) return Number((eurCentsVat0 * 10.0 * (includeVat ? effectiveVatRate : 1.0)).toFixed(2));
        return Number((eurCentsVat0 * fxScale * effectiveVatRate).toFixed(2));
    };

    const series = [];
    for (let i = 0; i < totalHours; i++) {
        const t = startSeriesMs + i * 3600000;
        const zt = getZoneTimeComponents(t, zcfg.tz);
        const w = weatherMap.get(t) || {
            windSpeed100m: 6.5,
            windMw: Math.round(wCap * 0.28),
            tempC: 8.0,
            solarRadWm2: 0,
            solarMw: 0,
            pressureHpa: 1013,
            borderWindSpeed: 6.5,
            nuclearMw: zcfg.nuclearCapMw || 0,
            nuclearDeficitMw: 0
        };

        const hoursAhead = Math.max(1, (t - nowHourMs) / 3600000);
        const arDecay = Math.exp(-hoursAhead / 60.0);
        const obsCand = {
            hour: zt.hour,
            month: zt.month,
            isWeekend: zt.isWeekend,
            isFreeDay: zt.isFreeDay,
            ...w,
            prev24hMean: prev24hMean * arDecay + baseMeanVat0 * (1 - arDecay),
            prev24hStd,
            prev7dMean,
            lag24hSameHour: (last24ByHour[zt.hour] ?? prev24hMean) * arDecay + baseMeanVat0 * (1 - arDecay)
        };

        const predVat0 = predictVat0EurCents(obsCand, activeModel, zcfg);
        const horizonCurve = Math.pow(Math.min(1.0, hoursAhead / 168.0), 1.35);
        const dWind = 0.35 + horizonCurve * 0.85;
        const dTemp = 0.30 + horizonCurve * 0.90;

        const wHigh = Math.round(wCap * windSpeedToCapacityFactor((w.windSpeed100m || 6.5) + dWind));
        const wLow = Math.round(wCap * windSpeedToCapacityFactor(Math.max(1.5, (w.windSpeed100m || 6.5) - dWind)));
        const estOpt = predictVat0EurCents({ ...obsCand, windMw: wHigh, tempC: w.tempC + dTemp }, activeModel, zcfg);
        const estPess = predictVat0EurCents({ ...obsCand, windMw: wLow, tempC: w.tempC - dTemp }, activeModel, zcfg);

        const spread = Math.max(predVat0 * (0.08 + 0.12 * horizonCurve), Math.abs(estPess - estOpt) * 0.42);
        const minVat0 = Math.max(0.02, predVat0 - spread * 0.92);
        const maxVat0 = Math.max(predVat0 + 0.08, predVat0 + spread * 1.08);

        if (spotVat0Map.has(t)) {
            const actualVat0 = spotVat0Map.get(t);
            const pOut = convertPrice(actualVat0);
            series.push({
                epochMs: t,
                timestamp: new Date(t).toISOString(),
                dateKey: zt.dateKey,
                hour: zt.hour,
                isWeekend: zt.isWeekend,
                isForecast: false,
                price: pOut,
                minPrice: pOut,
                maxPrice: pOut,
                predictedPrice: convertPrice(predVat0),
                priceEurMwhVat0: Number((actualVat0 * 10.0).toFixed(2)),
                priceEurCentsVat0: Number(actualVat0.toFixed(3)),
                priceInclVat: Number((actualVat0 * fxScale * (zoneCode === 'NO4' ? 1.0 : (mkt.vatRate || 1.20))).toFixed(3)),
                priceVat0: Number((actualVat0 * fxScale).toFixed(3)),
                probabilityPct: 100,
                windMw: w.windMw,
                windSpeed100m: w.windSpeed100m,
                solarMw: w.solarMw || 0,
                tempC: w.tempC
            });
        } else {
            const pOut = convertPrice(predVat0);
            const minOut = convertPrice(minVat0);
            const maxOut = convertPrice(maxVat0);
            const probPct = Math.max(62, Math.min(94, Math.round(93 - (hoursAhead / 168.0) * 24)));
            series.push({
                epochMs: t,
                timestamp: new Date(t).toISOString(),
                dateKey: zt.dateKey,
                hour: zt.hour,
                isWeekend: zt.isWeekend,
                isForecast: true,
                price: pOut,
                minPrice: minOut,
                maxPrice: maxOut,
                predictedPrice: pOut,
                priceEurMwhVat0: Number((predVat0 * 10.0).toFixed(2)),
                priceEurCentsVat0: Number(predVat0.toFixed(3)),
                priceInclVat: Number((predVat0 * fxScale * (zoneCode === 'NO4' ? 1.0 : (mkt.vatRate || 1.20))).toFixed(3)),
                priceVat0: Number((predVat0 * fxScale).toFixed(3)),
                minInclVat: Number((minVat0 * fxScale * (zoneCode === 'NO4' ? 1.0 : (mkt.vatRate || 1.20))).toFixed(3)),
                maxInclVat: Number((maxVat0 * fxScale * (zoneCode === 'NO4' ? 1.0 : (mkt.vatRate || 1.20))).toFixed(3)),
                probabilityPct: probPct,
                windMw: w.windMw,
                windSpeed100m: w.windSpeed100m,
                solarMw: w.solarMw || 0,
                tempC: w.tempC
            });
        }
    }

    const currentSlot = series.find(s => s.epochMs === nowHourMs) || series[0] || null;
    const dashboardPath = mkt.path || '/en/';
    const dashboardUrl = `${SITE_URL}${dashboardPath}${mkt.zones && Object.keys(mkt.zones).length > 1 ? `?zone=${encodeURIComponent(zoneCode)}` : ''}`;

    return {
        isZoneDirectory: false,
        zoneCode,
        unitLabel,
        dashboardUrl,
        currentSlot,
        series,
        payload: {
            status: 'ok',
            meta: {
                provider: 'Spotpuls',
                website: SITE_URL,
                dashboardUrl,
                apiDocsUrl: `${SITE_URL}/api-docs/`,
                openApiSpec: `${SITE_URL}/openapi.json`,
                attribution: `Spot electricity prices & 7-day regional forecast by Spotpuls (${SITE_URL})`,
                license: 'CC BY 4.0 — Free with attribution/link to https://spotpuls.app',
                generatedAt: new Date().toISOString()
            },
            market: {
                zone: zoneCode,
                bzn: zcfg.bzn,
                name: zcfg.name,
                country: zcfg.country,
                exchange: zcfg.exchange,
                timezone: zcfg.tz,
                unit: unitLabel,
                vatIncluded: zoneCode === 'NO4' ? false : includeVat,
                vatRate: effectiveVatRate,
                rollingMeanEurCentsVat0: Number(prev7dMean.toFixed(2))
            },
            currentHour: currentSlot,
            series
        }
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    res.setHeader('X-Powered-By-Data', `Spotpuls (${SITE_URL})`);
    res.setHeader('Link', `<${SITE_URL}>; rel="canonical", <${SITE_URL}/openapi.json>; rel="service-desc", <${SITE_URL}/api-docs/>; rel="documentation"`);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const q = req.query || {};
        const result = await buildSpotpulsZoneResponse(q);

        if (result.isZoneDirectory) {
            return res.status(200).json(result.payload);
        }

        const fmt = String(q.format || 'json').toLowerCase();
        if (fmt === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="spotpuls_${result.zoneCode}.csv"`);
            const lines = [
                `# Source: Spotpuls (${SITE_URL}) — Zone: ${result.zoneCode} (${result.unitLabel})`,
                'timestamp_utc,date_local,hour_local,is_forecast,price,min_price,max_price,eur_mwh_vat0,wind_mw,temp_c'
            ];
            for (const s of result.series) {
                lines.push(`${s.timestamp},${s.dateKey},${s.hour},${s.isForecast ? 1 : 0},${s.price},${s.minPrice},${s.maxPrice},${s.priceEurMwhVat0},${s.windMw},${s.tempC}`);
            }
            return res.status(200).send(lines.join('\n'));
        }

        if (fmt === 'badge' || fmt === 'svg') {
            res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
            const curVal = result.currentSlot ? result.currentSlot.price : '—';
            const labelLeft = `SPOTPULS · ${result.zoneCode}`;
            const labelRight = `${curVal} ${result.unitLabel}`;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="28" role="img" aria-label="${labelLeft}: ${labelRight}">
  <rect width="118" height="28" fill="#111210"/>
  <rect x="118" width="132" height="28" fill="#ffd000"/>
  <rect x="0.5" y="0.5" width="249" height="27" fill="none" stroke="#111210"/>
  <text x="59" y="18" fill="#f6f7f3" text-anchor="middle" font-family="monospace" font-weight="700" font-size="11">${labelLeft}</text>
  <text x="184" y="18" fill="#111210" text-anchor="middle" font-family="monospace" font-weight="700" font-size="11.5">${labelRight}</text>
</svg>`;
            return res.status(200).send(svg);
        }

        return res.status(200).json(result.payload);
    } catch (err) {
        return res.status(500).json({
            status: 'error',
            provider: 'Spotpuls',
            website: SITE_URL,
            message: String(err)
        });
    }
}
