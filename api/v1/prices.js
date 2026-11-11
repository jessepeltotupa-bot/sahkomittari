// Spotpuls Public REST & Automation API v1: /api/v1/prices
// High-accuracy day-ahead spot electricity prices, 7-day Log-Merit + Hist-GBDT forecasts,
// and universal smart-home / EV / IoT / analytics integration endpoints across 40 European bidding zones.
// Powered by Spotpuls — https://spotpuls.app

import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://spotpuls.app';
const FINLAND_INSTALLED_WIND_MW = 9600.0;
const FINLAND_SOLAR_MAX_MW = 1250.0;
const FINLAND_NUCLEAR_MAX_MW = 4394.0;

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

const ELERING_ZONES = {
    FI: 'fi',
    EE: 'ee',
    LV: 'lv',
    LT: 'lt'
};

let cachedGlobalConfig = null;
let cachedFiWeights = null;
const upstreamSpotCache = new Map();
const upstreamWeatherCache = new Map();
const tzFmtCache = new Map();
const easterUtcCache = new Map();
const UPSTREAM_TTL_MS = 5 * 60 * 1000;

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

function getEasterSundayUtcMs(year) {
    if (easterUtcCache.has(year)) return easterUtcCache.get(year);
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const ms = Date.UTC(year, month - 1, day);
    easterUtcCache.set(year, ms);
    return ms;
}

function isPublicHolidayDateKey(dateKey, isFinland = false) {
    if (!dateKey || dateKey.length < 10) return false;
    const md = dateKey.slice(5);
    if (md === '01-01' || md === '01-06' || md === '05-01' || md === '12-24' || md === '12-25' || md === '12-26') {
        return true;
    }
    if (isFinland && md === '12-06') return true;
    const yr = parseInt(dateKey.slice(0, 4), 10);
    const mo = parseInt(dateKey.slice(5, 7), 10);
    const dy = parseInt(dateKey.slice(8, 10), 10);
    if (isNaN(yr) || isNaN(mo) || isNaN(dy)) return false;
    const curMs = Date.UTC(yr, mo - 1, dy);
    const diffDays = Math.round((curMs - getEasterSundayUtcMs(yr)) / 86400000);
    if (diffDays === -2 || diffDays === 0 || diffDays === 1 || diffDays === 39) return true;
    if (isFinland && mo === 6 && dy >= 19 && dy <= 25) {
        const dow = new Date(curMs).getUTCDay();
        if (dow === 5 || dow === 6) return true;
    }
    return false;
}

function getZoneFormatter(tz) {
    const key = tz || 'Europe/Helsinki';
    let fmt = tzFmtCache.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-GB', {
            timeZone: key,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            weekday: 'short',
            hour12: false
        });
        tzFmtCache.set(key, fmt);
    }
    return fmt;
}

function getZoneTimeComponents(epochMs, tz, isFinland = false) {
    const parts = getZoneFormatter(tz).formatToParts(new Date(epochMs));
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const hour = parseInt(map.hour, 10) % 24;
    const month = parseInt(map.month, 10);
    const wd = map.weekday;
    const isSat = wd === 'Sat';
    const isSun = wd === 'Sun';
    const isWeekend = isSat || isSun;
    const dateKey = `${map.year}-${map.month}-${map.day}`;
    const isHoliday = isPublicHolidayDateKey(dateKey, isFinland);
    const dayType = (isSun || (isHoliday && !isSat)) ? 2 : (isSat ? 1 : 0);
    return {
        year: parseInt(map.year, 10),
        month,
        day: parseInt(map.day, 10),
        hour,
        isWeekend,
        isSat,
        isHoliday,
        isFreeDay: dayType > 0,
        dayType,
        dateKey
    };
}

function windSpeedToCapacityFactor(v100m) {
    if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.30;
    const vHub = Number(v100m) * 1.26;
    if (vHub < 2.8) return 0.02;
    if (vHub >= 25.0) return 0.05;
    if (vHub >= 11.8) return 0.90;
    const norm = (vHub - 2.8) / (11.8 - 2.8);
    return Math.max(0.02, Math.min(0.90, Math.pow(norm, 1.65) * 0.90));
}

function radiationToSolarCf(radWm2, month, hour, isFinland = false) {
    if (radWm2 !== null && radWm2 !== undefined && !isNaN(radWm2)) {
        const cap = isFinland ? 0.82 : 0.86;
        const mult = isFinland ? 0.80 : 0.88;
        return Math.max(0.0, Math.min(cap, (Number(radWm2) / 820.0) * mult));
    }
    if (hour < 6 || hour > 20) return 0.0;
    const seasonPeak = Math.max(0.08, Math.sin(((month - 1.5) / 10.0) * Math.PI));
    const hourPeak = Math.max(0.0, Math.cos(((hour - 13.0) / 5.5) * (Math.PI / 2.0)));
    return 0.55 * seasonPeak * hourPeak;
}

function evalCompactTrees(trees, xt) {
    if (!Array.isArray(trees) || trees.length === 0) return 0.0;
    let total = 0.0;
    for (let t = 0; t < trees.length; t++) {
        const nodes = trees[t];
        if (!Array.isArray(nodes) || nodes.length === 0) continue;
        let nid = 0;
        let guard = 0;
        while (nodes[nid] && nodes[nid][0] >= 0 && guard++ < 16) {
            const featIdx = nodes[nid][0];
            nid = (xt[featIdx] <= nodes[nid][1]) ? nodes[nid][2] : nodes[nid][3];
        }
        if (nodes[nid]) total += Number(nodes[nid][1] || 0.0);
    }
    return total;
}

// --- Finland 21-feature Log-Merit + 45-tree Hist-GBDT Ensemble (in snt/kWh incl. FI VAT 25.5%) ---
function toFiLogPrice(yCents, shift = 3.5) {
    return Math.log(Math.max(0.20, Number(yCents) + shift));
}

function fromFiLogPrice(zVal, shift = 3.5) {
    return Math.max(-3.30, Math.exp(Math.max(-1.61, Math.min(4.85, Number(zVal)))) - shift);
}

function computeFiResidualLoadGw(obs) {
    const temp = Number(obs.tempC ?? 4.0);
    const t72 = Number(obs.rolling72hTempC ?? temp);
    const effTemp = 0.65 * temp + 0.35 * t72;
    const heatingMw = Math.max(0.0, 14.0 - effTemp) * 185.0 + Math.max(0.0, -5.0 - effTemp) * 95.0;
    const h = Number(obs.hour ?? 12);
    const isFree = (obs.dayType ?? 0) > 0;
    let diurnalMw = 0.0;
    if (isFree) {
        diurnalMw = h < 7 ? -650.0 : ((h >= 9 && h <= 21) ? 450.0 : -250.0);
    } else if (h >= 7 && h <= 10) {
        diurnalMw = 1450.0;
    } else if (h >= 11 && h <= 15) {
        diurnalMw = 1050.0;
    } else if (h >= 16 && h <= 20) {
        diurnalMw = 1550.0;
    } else if (h >= 21 && h <= 22) {
        diurnalMw = 400.0;
    } else {
        diurnalMw = -900.0;
    }
    const demandMw = 7600.0 + heatingMw + diurnalMw;
    const wNow = Number(obs.windMw ?? 2400.0);
    const w12 = Number(obs.wind12hSmoothMw ?? wNow);
    const windMw = 0.65 * wNow + 0.35 * w12;
    const solarMw = Number(obs.solarMw ?? 0.0);
    const nucDef = Number(obs.nuclearDeficitMw ?? 0.0);
    const nucMw = FINLAND_NUCLEAR_MAX_MW - nucDef;
    const seCf = windSpeedToCapacityFactor(obs.seWindSpeed ?? obs.borderWindSpeed ?? 6.5);
    const eeCf = windSpeedToCapacityFactor(obs.eeWindSpeed ?? obs.windSpeed100m ?? 6.5);
    const el2 = 1.0;
    const netBorderMw = 1500.0 * seCf - (650.0 + 650.0 * el2) * Math.max(0.0, 0.50 - eeCf);
    return (demandMw - windMw - solarMw - nucMw - netBorderMw) / 1000.0;
}

function extractFiLogMeritFeatures21(obs) {
    const wNow = Number(obs.windMw ?? 2400.0);
    const w12 = Number(obs.wind12hSmoothMw ?? wNow);
    const wRatio = Math.max(0.01, Math.min(0.95, wNow / FINLAND_INSTALLED_WIND_MW));
    const w12Ratio = Math.max(0.01, Math.min(0.95, w12 / FINLAND_INSTALLED_WIND_MW));
    const tempC = Number(obs.tempC ?? 4.0);
    const t72 = Number(obs.rolling72hTempC ?? tempC);
    const h = Number(obs.hour ?? 12);
    const dti = Number(obs.dayType ?? 0);
    const isFree = dti > 0 ? 1.0 : 0.0;
    const rl = obs.resLoadGw !== undefined ? Number(obs.resLoadGw) : computeFiResidualLoadGw(obs);
    const hdd = Math.max(0.0, 12.0 - tempC) / 20.0;
    const rollingHdd = Math.max(0.0, 10.0 - t72) / 20.0;
    const solarMw = Number(obs.solarMw ?? 0.0);
    const solarRatio = solarMw / FINLAND_SOLAR_MAX_MW;
    const nucDef = Number(obs.nuclearDeficitMw ?? 0.0) / 2000.0;
    const seCf = windSpeedToCapacityFactor(obs.seWindSpeed ?? obs.borderWindSpeed ?? 6.5);
    const eeCf = windSpeedToCapacityFactor(obs.eeWindSpeed ?? obs.windSpeed100m ?? 6.5);
    const w24Ratio = Math.max(0.01, Math.min(0.95, Number(obs.rolling24hWindMw ?? wNow) / FINLAND_INSTALLED_WIND_MW));
    return {
        rl,
        dti,
        wRatio,
        w12Ratio,
        solarMw,
        seCf,
        eeCf,
        feats: [
            1.0,
            wRatio,
            wRatio * wRatio,
            w12Ratio,
            Math.pow(Math.max(0.0, 0.25 - wRatio), 2) * 8.0,
            Math.max(0.0, 2.0 - rl),
            Math.max(0.0, rl - 2.0),
            Math.pow(Math.max(0.0, rl - 5.0), 1.3),
            hdd,
            rollingHdd,
            ((isFree === 0.0 && h >= 7 && h <= 10) ? 1.0 : 0.0) * (1.0 - 0.75 * wRatio),
            ((isFree === 0.0 && h >= 16 && h <= 20) ? 1.0 : 0.0) * (1.0 - 0.75 * wRatio),
            solarRatio,
            solarRatio * isFree,
            (h >= 0 && h <= 5) ? 1.0 : 0.0,
            dti === 1 ? 1.0 : 0.0,
            dti === 2 ? 1.0 : 0.0,
            nucDef,
            seCf * (1.0 - 0.5 * wRatio),
            Math.max(0.0, 0.45 - eeCf) * ((h >= 7 && h <= 21) ? 1.0 : 0.35),
            Math.max(0.0, 0.32 - w24Ratio) * 2.0
        ]
    };
}

function predictFiLogFundamental(obs, ens) {
    const ex = extractFiLogMeritFeatures21(obs);
    const wLog = ens.wLog || [];
    let zf = 0.0;
    for (let i = 0; i < wLog.length && i < ex.feats.length; i++) zf += wLog[i] * ex.feats[i];
    const hrAdj = ens.dayTypeHourLogAdj?.[ex.dti]?.[obs.hour] || 0.0;
    return { zFund: zf + hrAdj, ex };
}

function predictFiVat0WithEnsemble(obs, ens, arCtx) {
    const shift = Number(ens.shift || 3.5);
    const { zFund, ex } = predictFiLogFundamental(obs, ens);
    const hoursAhead = Math.max(0.0, Number(arCtx?.hoursAhead ?? 12.0));
    const decay = Math.exp(-hoursAhead / 64.0);
    const damp = Math.max(0.20, 1.05 - 0.80 * ex.wRatio) * decay;
    const zanom24 = Number(arCtx?.zanom24 ?? 0.0);
    const zanom7d = Number(arCtx?.zanom7d ?? 0.0);
    const zlag24 = Math.max(-1.2, Math.min(1.5, Number(arCtx?.zlag24 ?? zanom24)));
    const zlag168 = Math.max(-1.0, Math.min(1.2, Number(arCtx?.zlag168 ?? zanom7d)));
    const wZar = ens.wZar || [0.45, 0.20, 0.18, 0.12];
    const arTerm = (wZar[0] * zanom24 + wZar[1] * zanom7d + wZar[2] * zlag24 + wZar[3] * zlag168) * damp;
    const xt = [
        ex.wRatio,
        ex.w12Ratio,
        ex.rl,
        Number(obs.tempC ?? 4.0),
        Number(obs.rolling72hTempC ?? obs.tempC ?? 4.0),
        Number(obs.hour ?? 12),
        Number(ex.dti),
        ex.solarMw,
        Number(obs.nuclearDeficitMw ?? 0.0),
        ex.seCf,
        ex.eeCf,
        zanom24 * decay,
        zanom7d * decay,
        Number(obs.month ?? 1)
    ];
    const treeSum = evalCompactTrees(ens.trees, xt);
    const zp = zFund + arTerm + treeSum + Number(ens.medShift || 0.0);
    const inclVat255 = fromFiLogPrice(zp, shift);
    return inclVat255 / 1.255;
}

// --- 40-Zone Empirical Log-Merit + 16-tree Hist-GBDT Model (in EUR cents/kWh VAT 0%) ---
function toZoneLogVat0(yVat0, shift = 3.0) {
    return Math.log(Math.max(0.18, Number(yVat0) + shift));
}

function fromZoneLogVat0(zVal, shift = 3.0) {
    return Math.max(-2.82, Math.exp(Math.max(-1.71, Math.min(4.75, Number(zVal)))) - shift);
}

function extractZoneLogFeatures15(obs, zcfg) {
    const wCap = Math.max(50.0, Number(zcfg.windCapMw || 2000));
    const sCap = Math.max(50.0, Number(zcfg.solarCapMw || 1000));
    const wRatio = Math.max(0.01, Math.min(0.95, Number(obs.windMw || 0) / wCap));
    const sRatio = Math.max(0.0, Math.min(1.0, Number(obs.solarMw || 0) / sCap));
    const tc = Number(obs.tempC ?? 8.0);
    const t72 = Number(obs.rolling72hTempC ?? tc);
    const effT = 0.65 * tc + 0.35 * t72;
    const h = Number(obs.hour ?? 12);
    const dti = Number(obs.dayType ?? 0);
    const isFree = dti > 0 ? 1.0 : 0.0;
    const hdd = Math.max(0.0, 14.0 - effT) / 20.0;
    const cdd = Math.max(0.0, tc - 21.0) / 12.0;
    const windSens = Number(zcfg.windSens ?? zcfg.modelVat0EurCents?.windSens ?? 1.0);
    const solarSens = Number(zcfg.solarSens ?? zcfg.modelVat0EurCents?.solarSens ?? 1.0);
    const coldSens = Number(zcfg.coldSens ?? 1.0);
    const heatSens = Number(zcfg.heatSens ?? zcfg.modelVat0EurCents?.heatSens ?? 0.3);

    const rlIdx = (
        1.0
        + 0.85 * hdd * coldSens
        + 0.55 * cdd * heatSens
        + ((isFree === 0.0 && h >= 7 && h <= 20) ? 0.32 : -0.18)
        - 0.90 * wRatio * windSens
        - 0.55 * sRatio * solarSens
    );
    const bCf = windSpeedToCapacityFactor(obs.borderWindSpeed ?? obs.windSpeed100m ?? 6.5);
    return {
        wRatio,
        sRatio,
        rlIdx,
        dti,
        bCf,
        feats: [
            1.0,
            wRatio,
            wRatio * wRatio,
            Math.pow(Math.max(0.0, 0.26 - wRatio), 2) * 8.0,
            sRatio,
            sRatio * isFree,
            hdd,
            cdd,
            Math.max(0.0, rlIdx - 0.45),
            Math.pow(Math.max(0.0, rlIdx - 1.05), 1.4),
            ((isFree === 0.0 && h >= 7 && h <= 10) ? 1.0 : 0.0) * (1.0 - 0.65 * wRatio),
            ((isFree === 0.0 && h >= 17 && h <= 21) ? 1.0 : 0.0) * (1.0 - 0.55 * wRatio + 0.45 * sRatio),
            dti === 1 ? 1.0 : 0.0,
            dti === 2 ? 1.0 : 0.0,
            bCf * (1.0 - 0.40 * wRatio)
        ]
    };
}

function predictZoneLogFundamental(obs, lm, zcfg) {
    const ex = extractZoneLogFeatures15(obs, zcfg);
    const wLog = lm.wLog || [];
    let zf = 0.0;
    for (let i = 0; i < wLog.length && i < ex.feats.length; i++) zf += wLog[i] * ex.feats[i];
    const hrAdj = lm.dayTypeHourLogAdj?.[ex.dti]?.[obs.hour] || 0.0;
    return { zFund: zf + hrAdj, ex };
}

function predictZoneLogMeritVat0(obs, lm, zcfg, arCtx) {
    const shift = Number(lm.shift || 3.0);
    const { zFund, ex } = predictZoneLogFundamental(obs, lm, zcfg);
    const hoursAhead = Math.max(0.0, Number(arCtx?.hoursAhead ?? 12.0));
    const decay = Math.exp(-hoursAhead / 64.0);
    const damp = Math.max(0.20, 1.05 - 0.78 * ex.wRatio) * decay;
    const zanom24 = Number(arCtx?.zanom24 ?? 0.0);
    const zanom7d = Number(arCtx?.zanom7d ?? 0.0);
    const zlag24 = Math.max(-1.2, Math.min(1.5, Number(arCtx?.zlag24 ?? zanom24)));
    const zlag168 = Math.max(-1.0, Math.min(1.2, Number(arCtx?.zlag168 ?? zanom7d)));
    const wZar = lm.wZar || [0.45, 0.20, 0.20, 0.12];
    const arTerm = (wZar[0] * zanom24 + wZar[1] * zanom7d + wZar[2] * zlag24 + wZar[3] * zlag168) * damp;
    const xt = [
        ex.wRatio,
        ex.sRatio,
        ex.rlIdx,
        Number(obs.tempC ?? 8.0),
        Number(obs.rolling72hTempC ?? obs.tempC ?? 8.0),
        Number(obs.hour ?? 12),
        Number(ex.dti),
        ex.bCf,
        zanom24 * decay,
        Number(obs.month ?? 1)
    ];
    const treeSum = evalCompactTrees(lm.trees, xt);
    const zp = zFund + arTerm + treeSum + Number(lm.medShift || 0.0);
    return fromZoneLogVat0(zp, shift);
}

// Legacy linear fallback if a zone lacks logMeritModel
function predictFallbackLinearVat0(obs, baseModel, zcfg) {
    const wCap = Math.max(100, zcfg.windCapMw || 3000);
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / wCap));
    const baseVat0 = zcfg.baseSpotEurCentsVat0 || ((zcfg.baseEurMwh || 65.0) / 10.0);
    const hRaw = obs.isFreeDay ? (baseModel?.weekendHourAdj?.[obs.hour] || 0) : (baseModel?.weekdayHourAdj?.[obs.hour] || 0);
    return Math.max(-2.50, baseVat0 * (1.25 - 0.70 * wRatio) + hRaw);
}

async function fetchZoneOfficialSpotVat0EurCents(zoneCode, zcfg) {
    const nowMs = Date.now();
    const cached = upstreamSpotCache.get(zoneCode);
    if (cached && (nowMs - cached.ts) < UPSTREAM_TTL_MS && cached.map.size >= 24) {
        return cached.map;
    }

    const spotVat0Map = new Map();
    const now = new Date(nowMs);
    const past14dIso = new Date(nowMs - 14 * 86400000).toISOString();
    const future48hIso = new Date(nowMs + 48 * 3600000).toISOString();
    const minuteBust = Math.floor(nowMs / 60000);
    const tasks = [];

    // 1. Finland: sahkotin.fi (14d history + tomorrow)
    if (zoneCode === 'FI') {
        tasks.push(
            fetch(`https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(past14dIso)}&end=${encodeURIComponent(future48hIso)}&_t=${minuteBust}`)
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

    // 2. Finland & Baltics (FI, EE, LV, LT): Elering Estfeed TSO API (14d, fast, zero rate limits)
    if (ELERING_ZONES[zoneCode]) {
        const elKey = ELERING_ZONES[zoneCode];
        tasks.push(
            fetch(`https://dashboard.elering.ee/api/nps/price?start=${encodeURIComponent(past14dIso)}&end=${encodeURIComponent(future48hIso)}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    const arr = d?.data?.[elKey];
                    if (!Array.isArray(arr)) return;
                    const buckets = new Map();
                    for (const row of arr) {
                        if (row.timestamp === undefined || row.price === undefined) continue;
                        const hMs = Math.floor(Number(row.timestamp) / 3600) * 3600 * 1000;
                        const cVat0 = Number(row.price) / 10.0;
                        if (!isNaN(cVat0)) {
                            if (!buckets.has(hMs)) buckets.set(hMs, []);
                            buckets.get(hMs).push(cVat0);
                        }
                    }
                    for (const [hMs, vals] of buckets.entries()) {
                        spotVat0Map.set(hMs, vals.reduce((a, b) => a + b, 0) / vals.length);
                    }
                }).catch(() => {})
        );
    }

    // 3. Nordics & Baltics (15 zones): api.spot-hinta.fi for instant today + tomorrow confirmation
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
                        spotVat0Map.set(hMs, vals.reduce((a, b) => a + b, 0) / vals.length);
                    }
                }).catch(() => {})
        );
    }

    // 4. Germany / Austria direct EPEX feed (aWATTar, 14d)
    if (zoneCode === 'DE-LU' || zoneCode === 'AT') {
        const host = zoneCode === 'AT' ? 'api.awattar.at' : 'api.awattar.de';
        const startMs = nowMs - 14 * 86400000;
        const endMs = nowMs + 48 * 3600000;
        tasks.push(
            fetch(`https://${host}/v1/marketdata?start=${startMs}&end=${endMs}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.data)) {
                        for (const it of d.data) {
                            const hMs = Math.floor(Number(it.start_timestamp) / 3600000) * 3600000;
                            const cVat0 = Number(it.marketprice) / 10.0;
                            if (!isNaN(cVat0)) spotVat0Map.set(hMs, cVat0);
                        }
                    }
                }).catch(() => {})
        );
    }

    // 5. Spain & Portugal: Red Electrica (REE apidatos, 14d)
    if (zoneCode === 'ES' || zoneCode === 'PT') {
        const sIso = new Date(nowMs - 14 * 86400000).toISOString().slice(0, 16);
        const eIso = new Date(nowMs + 36 * 3600000).toISOString().slice(0, 16);
        tasks.push(
            fetch(`https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${sIso}&end_date=${eIso}&time_trunc=hour`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    const included = d?.included || [];
                    const spotSeries = included.find(x => String(x?.id) === '1001')
                        || included.find(x => String(x?.attributes?.title || '').toLowerCase().includes('spot'))
                        || included[0];
                    const vals = spotSeries?.attributes?.values || [];
                    for (const v of vals) {
                        const hMs = Math.floor(new Date(v.datetime).getTime() / 3600000) * 3600000;
                        const cVat0 = Number(v.value) / 10.0;
                        if (!isNaN(cVat0)) spotVat0Map.set(hMs, cVat0);
                    }
                }).catch(() => {})
        );
    }

    // 6. Great Britain (GB): Octopus Agile with exact 16:00-19:00 UK 12p/kWh peak-adder wholesale inversion
    if (zoneCode === 'GB') {
        const pFrom = new Date(nowMs - 14 * 86400000).toISOString();
        tasks.push(
            fetch(`https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-C/standard-unit-rates/?period_from=${encodeURIComponent(pFrom)}&page_size=800`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && Array.isArray(d.results)) {
                        const buckets = new Map();
                        for (const it of d.results) {
                            const hMs = Math.floor(new Date(it.valid_from).getTime() / 3600000) * 3600000;
                            if (isNaN(hMs)) continue;
                            const ukZt = getZoneTimeComponents(hMs, 'Europe/London', false);
                            const peakAdder = (ukZt.hour >= 16 && ukZt.hour < 19) ? 12.0 : 0.0;
                            const wholesalePence = Math.max(-5.0, (Number(it.value_exc_vat) - peakAdder) / 2.0);
                            const eurCentsVat0 = wholesalePence / 0.84;
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

    // 7. Fraunhofer ISE Energy-Charts ENTSO-E feed for non-Elering/non-GB/non-ES European zones
    if (zcfg && zcfg.bzn && !['FI', 'EE', 'LV', 'LT', 'ES', 'GB'].includes(zoneCode)) {
        const startDay = new Date(nowMs - 12 * 86400000).toISOString().slice(0, 10);
        const endDay = new Date(nowMs + 2 * 86400000).toISOString().slice(0, 10);
        const ecUrl = `https://api.energy-charts.info/price?bzn=${encodeURIComponent(zcfg.bzn)}&start=${startDay}&end=${endDay}`;
        tasks.push(
            fetch(ecUrl, { headers: { 'User-Agent': 'Spotpuls/2.0 (+https://spotpuls.app)' } })
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
    if (spotVat0Map.size > 0) {
        upstreamSpotCache.set(zoneCode, { ts: nowMs, map: spotVat0Map });
    } else if (cached) {
        return cached.map;
    }
    return spotVat0Map;
}

async function fetchZoneWeatherMap(zoneCode, zcfg) {
    const nowMs = Date.now();
    const cached = upstreamWeatherCache.get(zoneCode);
    if (cached && (nowMs - cached.ts) < UPSTREAM_TTL_MS && cached.map.size >= 48) {
        return cached.map;
    }

    const isFi = zoneCode === 'FI';
    const wCap = Math.max(100, isFi ? FINLAND_INSTALLED_WIND_MW : (zcfg.windCapMw || 3000));
    const sCap = Math.max(50, isFi ? FINLAND_SOLAR_MAX_MW : (zcfg.solarCapMw || 1500));

    let openMeteoUrl = '';
    if (isFi) {
        openMeteoUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17,63.82,59.43&longitude=23.95,21.34,22.58,24.94,20.26,24.75&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=14&forecast_days=8&timezone=UTC';
    } else {
        const coords = zcfg.coords || [
            { lat: 54.18, lon: 7.89 },
            { lat: 52.85, lon: 9.85 },
            { lat: 50.11, lon: 8.68 },
            { lat: 55.47, lon: 8.45 }
        ];
        const lats = coords.map(c => c.lat).join(',');
        const lons = coords.map(c => c.lon).join(',');
        openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=14&forecast_days=8&timezone=UTC`;
    }

    const weatherResp = await fetch(openMeteoUrl).then(r => r.ok ? r.json() : null).catch(() => null);
    const weatherMap = new Map();

    if (weatherResp) {
        const locs = Array.isArray(weatherResp) ? weatherResp : [weatherResp];
        if (locs.length >= 1 && locs[0].hourly && Array.isArray(locs[0].hourly.time)) {
            const times = locs[0].hourly.time;
            for (let i = 0; i < times.length; i++) {
                const tMs = Date.parse(times[i] + ':00Z');
                if (isFi && locs.length >= 4) {
                    const w1 = locs[0].hourly.wind_speed_100m?.[i] ?? 6.5;
                    const w2 = locs[1].hourly.wind_speed_100m?.[i] ?? 6.5;
                    const w3 = locs[2].hourly.wind_speed_100m?.[i] ?? 6.0;
                    const weightedWind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20;
                    const windMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(weightedWind));
                    const tSouth = locs[3].hourly.temperature_2m?.[i] ?? 5.0;
                    const tWest = locs[2].hourly.temperature_2m?.[i] ?? 3.0;
                    const tNorth = locs[0].hourly.temperature_2m?.[i] ?? 1.0;
                    const tempC = Number((tSouth * 0.55 + tWest * 0.25 + tNorth * 0.20).toFixed(1));
                    const radS = locs[3].hourly.shortwave_radiation?.[i] ?? 0;
                    const radW = locs[2].hourly.shortwave_radiation?.[i] ?? 0;
                    const solarRadWm2 = Number((radS * 0.6 + radW * 0.4).toFixed(1));
                    const pressureHpa = locs[2].hourly.surface_pressure?.[i] ?? 1013.0;
                    const seWindSpeed = Number((locs[4]?.hourly?.wind_speed_100m?.[i] ?? weightedWind).toFixed(2));
                    const eeWindSpeed = Number((locs[5]?.hourly?.wind_speed_100m?.[i] ?? weightedWind).toFixed(2));
                    weatherMap.set(tMs, {
                        windSpeed100m: Number(weightedWind.toFixed(2)),
                        windMw,
                        tempC,
                        solarRadWm2,
                        pressureHpa,
                        seWindSpeed,
                        eeWindSpeed,
                        borderWindSpeed: seWindSpeed
                    });
                } else {
                    const l0 = locs[0], l1 = locs[1] || l0, l2 = locs[2] || l0, l3 = locs[3] || l0;
                    const w1 = l0.hourly.wind_speed_100m?.[i] ?? 6.5;
                    const w2 = l1.hourly.wind_speed_100m?.[i] ?? w1;
                    const weightedWind = w1 * 0.55 + w2 * 0.45;
                    const windMw = Math.round(wCap * windSpeedToCapacityFactor(weightedWind));
                    const tempC = Number((l2.hourly.temperature_2m?.[i] ?? 8.0).toFixed(1));
                    const solarRadWm2 = Number((l2.hourly.shortwave_radiation?.[i] ?? 0.0).toFixed(1));
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
    }

    const fiWeights = loadFiWeights();
    const fiSchedule = isFi && fiWeights ? (fiWeights.nuclearOutageSchedule || []) : [];
    const sortedWMs = Array.from(weatherMap.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedWMs.length; i++) {
        const ms = sortedWMs[i];
        const w = weatherMap.get(ms);
        const zt = getZoneTimeComponents(ms, zcfg.tz, isFi);
        let nucOff = 0;
        for (const item of fiSchedule) {
            if (zt.dateKey >= item.start && zt.dateKey <= item.end) nucOff += item.mw;
        }
        w.nuclearDeficitMw = Math.min(3000, nucOff);
        w.nuclearMw = Math.max(0, (zcfg.nuclearCapMw || 0) - w.nuclearDeficitMw);
        w.solarMw = Math.round(sCap * radiationToSolarCf(w.solarRadWm2, zt.month, zt.hour, isFi));

        let sumW24 = 0, cntW24 = 0;
        for (let j = Math.max(0, i - 23); j <= i; j++) {
            sumW24 += weatherMap.get(sortedWMs[j]).windMw;
            cntW24++;
        }
        w.rolling24hWindMw = Math.round(sumW24 / Math.max(1, cntW24));

        let sumW12 = 0, cntW12 = 0;
        for (let j = Math.max(0, i - 6); j < Math.min(sortedWMs.length, i + 6); j++) {
            sumW12 += weatherMap.get(sortedWMs[j]).windMw;
            cntW12++;
        }
        w.wind12hSmoothMw = Math.round(sumW12 / Math.max(1, cntW12));
        w.windRamp6hMw = w.windMw - weatherMap.get(sortedWMs[Math.max(0, i - 6)]).windMw;

        let sumT72 = 0, cntT72 = 0;
        for (let j = Math.max(0, i - 71); j <= i; j++) {
            sumT72 += weatherMap.get(sortedWMs[j]).tempC;
            cntT72++;
        }
        w.rolling72hTempC = Number((sumT72 / Math.max(1, cntT72)).toFixed(2));
    }

    if (weatherMap.size > 0) {
        upstreamWeatherCache.set(zoneCode, { ts: nowMs, map: weatherMap });
    } else if (cached) {
        return cached.map;
    }
    return weatherMap;
}

function computeSmartAutomationSummary(series, nowHourMs, windowHours, thresholdVal) {
    const next24 = series.filter(s => s.epochMs >= nowHourMs && s.epochMs < nowHourMs + 24 * 3600000);
    const pool = next24.length > 0 ? next24 : series.slice(0, 24);
    const wLen = Math.max(1, Math.min(24, Math.min(windowHours, pool.length)));

    // 1. Optimal contiguous N-hour block (ideal for heat pumps, water heaters, dishwashers)
    let bestContig = null;
    for (let i = 0; i <= pool.length - wLen; i++) {
        let sumSpot = 0, sumTot = 0;
        for (let j = 0; j < wLen; j++) {
            sumSpot += pool[i + j].spotPrice;
            sumTot += pool[i + j].totalPrice;
        }
        const avgTot = sumTot / wLen;
        if (!bestContig || avgTot < bestContig.avgTotalPrice) {
            const startMs = pool[i].epochMs;
            const endMs = pool[i + wLen - 1].epochMs + 3600000;
            bestContig = {
                windowHours: wLen,
                start: new Date(startMs).toISOString(),
                end: new Date(endMs).toISOString(),
                startEpochMs: startMs,
                endEpochMs: endMs,
                avgSpotPrice: Number((sumSpot / wLen).toFixed(3)),
                avgTotalPrice: Number(avgTot.toFixed(3)),
                activeNow: nowHourMs >= startMs && nowHourMs < endMs
            };
        }
    }

    // 2. N cheapest non-contiguous individual hours in next 24h (ideal for EV smart charging & batteries)
    const sortedByTotal = [...pool].sort((a, b) => a.totalPrice - b.totalPrice || a.epochMs - b.epochMs);
    const selectedCheap = sortedByTotal.slice(0, wLen);
    const selectedEpochSet = new Set(selectedCheap.map(s => s.epochMs));
    const maxSelSpot = selectedCheap.length > 0 ? selectedCheap[selectedCheap.length - 1].spotPrice : null;
    const maxSelTotal = selectedCheap.length > 0 ? selectedCheap[selectedCheap.length - 1].totalPrice : null;

    // 3. Highest 3-hour contiguous peak window to avoid (ideal for peak shaving)
    const pLen = Math.min(3, pool.length);
    let worstPeak = null;
    for (let i = 0; i <= pool.length - pLen; i++) {
        let sumTot = 0, sumSpot = 0;
        for (let j = 0; j < pLen; j++) {
            sumSpot += pool[i + j].spotPrice;
            sumTot += pool[i + j].totalPrice;
        }
        const avgTot = sumTot / pLen;
        if (!worstPeak || avgTot > worstPeak.avgTotalPrice) {
            const startMs = pool[i].epochMs;
            const endMs = pool[i + pLen - 1].epochMs + 3600000;
            worstPeak = {
                windowHours: pLen,
                start: new Date(startMs).toISOString(),
                end: new Date(endMs).toISOString(),
                startEpochMs: startMs,
                endEpochMs: endMs,
                avgSpotPrice: Number((sumSpot / pLen).toFixed(3)),
                avgTotalPrice: Number(avgTot.toFixed(3)),
                activeNow: nowHourMs >= startMs && nowHourMs < endMs
            };
        }
    }

    // Rank each hour in next 24h (1 = cheapest, 24 = most expensive)
    const rankMap = new Map();
    sortedByTotal.forEach((s, idx) => rankMap.set(s.epochMs, idx + 1));

    const cur = pool.find(s => s.epochMs === nowHourMs) || pool[0] || null;
    const hasThreshold = thresholdVal !== null && !isNaN(thresholdVal);
    const belowThresholdNow = (hasThreshold && cur) ? (cur.spotPrice <= thresholdVal) : null;

    return {
        rankMap,
        selectedEpochSet,
        automation: {
            windowHours: wLen,
            threshold: hasThreshold ? thresholdVal : null,
            belowThresholdNow,
            cheapestContiguousWindow: bestContig,
            cheapestHours: {
                count: selectedCheap.length,
                maxSelectedSpotPrice: maxSelSpot,
                maxSelectedTotalPrice: maxSelTotal,
                activeNow: selectedEpochSet.has(nowHourMs),
                timestamps: selectedCheap.sort((a, b) => a.epochMs - b.epochMs).map(s => s.timestamp)
            },
            peakAvoidWindow: worstPeak
        }
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
                currencyMajor: mkt ? mkt.currencyMajor : 'EUR',
                subunitsPerMajor: mkt ? (mkt.subunitsPerMajor || 100) : 100,
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
                supportedFormats: ['json', 'compact', 'ha', 'evcc', 'victron', 'csv', 'ical', 'prometheus', 'plain', 'badge', 'widget'],
                zoneCount: list.length,
                zones: list
            }
        };
    }

    const zoneCode = resolveZoneCode(query.zone || query.bzn || query.region, zonesObj);
    const isFi = zoneCode === 'FI';
    const zcfg = zonesObj[zoneCode] || zonesObj.FI;
    const mkt = findMarketForZone(zoneCode, countriesObj) || {
        countryId: 'en',
        path: '/en/',
        currencyUnit: 'ct/kWh',
        currencyMajor: 'EUR',
        subunitsPerMajor: 100,
        fxFromEurCents: 1.0,
        vatRate: 1.20
    };

    const currParam = String(query.currency || 'local').toLowerCase();
    const wantEurMwh = currParam === 'eur_mwh';
    const wantEurKwh = currParam === 'eur_kwh';
    const wantEurCents = currParam === 'eur_cents' || currParam === 'eur';
    const includeVat = query.vat === '0' || query.vat === 'false' ? false : true;
    const effectiveVatRate = (zoneCode === 'NO4' || !includeVat) ? 1.0 : (mkt.vatRate || 1.20);
    const fxScale = (wantEurMwh || wantEurCents || wantEurKwh) ? 1.0 : (mkt.fxFromEurCents || 1.0);
    const subunitsPerMajor = (wantEurCents || wantEurKwh) ? 100 : (mkt.subunitsPerMajor || 100);
    const majorCurrencyCode = (wantEurMwh || wantEurCents || wantEurKwh) ? 'EUR' : (mkt.currencyMajor || 'EUR');
    const unitLabel = wantEurMwh
        ? 'EUR/MWh'
        : (wantEurKwh ? 'EUR/kWh' : (wantEurCents ? 'ct/kWh' : mkt.currencyUnit));

    const marginAdd = isNaN(parseFloat(query.margin)) ? 0.0 : parseFloat(query.margin);
    const transferAdd = isNaN(parseFloat(query.transfer)) ? 0.0 : parseFloat(query.transfer);
    const fixedAddon = marginAdd + transferAdd;
    const windowHours = Math.max(1, Math.min(24, parseInt(query.window || '3', 10) || 3));
    const thresholdVal = query.threshold !== undefined && query.threshold !== '' ? parseFloat(query.threshold) : null;

    const [spotVat0Map, weatherMap] = await Promise.all([
        fetchZoneOfficialSpotVat0EurCents(zoneCode, zcfg),
        fetchZoneWeatherMap(zoneCode, zcfg)
    ]);

    const fiWeights = loadFiWeights();
    const fiLogEns = isFi ? (fiWeights?.model?.logMeritEnsemble || null) : null;
    const hasFiLogEns = Boolean(fiLogEns && Array.isArray(fiLogEns.wLog) && fiLogEns.wLog.length >= 21);
    const zoneLogModel = zcfg?.modelVat0EurCents?.logMeritModel || null;
    const hasZoneLogModel = Boolean(zoneLogModel && Array.isArray(zoneLogModel.wLog) && zoneLogModel.wLog.length >= 15);

    const wCap = Math.max(100, isFi ? FINLAND_INSTALLED_WIND_MW : (zcfg.windCapMw || 3000));
    const sCap = Math.max(50, isFi ? FINLAND_SOLAR_MAX_MW : (zcfg.solarCapMw || 1500));

    const recentObs = [];
    const logResByMs = new Map();
    const kernelHist = [];
    const sortedSpotMs = Array.from(spotVat0Map.keys()).sort((a, b) => a - b);

    for (const ms of sortedSpotMs) {
        const w = weatherMap.get(ms);
        const zt = getZoneTimeComponents(ms, zcfg.tz, isFi);
        const actualVat0 = spotVat0Map.get(ms);
        if (!w) continue;
        const obsRow = {
            epochMs: ms,
            dateKey: zt.dateKey,
            hour: zt.hour,
            month: zt.month,
            isWeekend: zt.isWeekend,
            isSat: zt.isSat,
            isFreeDay: zt.isFreeDay,
            dayType: zt.dayType,
            spotVat0EurCents: actualVat0,
            ...w
        };
        recentObs.push(obsRow);
        if (hasFiLogEns) {
            const { zFund } = predictFiLogFundamental(obsRow, fiLogEns);
            logResByMs.set(ms, toFiLogPrice(actualVat0 * 1.255, fiLogEns.shift || 3.5) - zFund);
        } else if (hasZoneLogModel) {
            const { zFund } = predictZoneLogFundamental(obsRow, zoneLogModel, zcfg);
            logResByMs.set(ms, toZoneLogVat0(actualVat0, zoneLogModel.shift || 3.0) - zFund);
        }
        kernelHist.push({
            ms,
            wind: w.windSpeed100m || 6.5,
            borderWind: w.borderWindSpeed || w.windSpeed100m || 6.5,
            solar: w.solarMw || 0,
            hour: zt.hour,
            temp: w.tempC || 8.0,
            dti: zt.dayType,
            vat0: actualVat0
        });
    }

    function getArContext(targetMs, latestConfMs) {
        let s24 = 0.0, c24 = 0, s7d = 0.0, c7d = 0;
        for (let h = 0; h < 168; h++) {
            const rv = logResByMs.get(latestConfMs - h * 3600000);
            if (rv !== undefined) {
                if (h < 24) { s24 += rv; c24++; }
                s7d += rv;
                c7d++;
            }
        }
        const zanom24 = c24 > 0 ? (s24 / c24) : 0.0;
        const zanom7d = c7d > 0 ? (s7d / c7d) : zanom24;
        let lagMs = targetMs - 24 * 3600000;
        while (lagMs > latestConfMs) lagMs -= 24 * 3600000;
        const zlag24 = logResByMs.get(lagMs) ?? zanom24;
        const zlag168 = logResByMs.get(targetMs - 168 * 3600000) ?? zanom7d;
        return { zanom24, zanom7d, zlag24, zlag168 };
    }

    function kernelPredictVat0(targetMs, wCand, targetHour, targetDti) {
        let num = 0.0, numSq = 0.0, den = 0.0;
        const cutoff = targetMs - 12 * 3600000;
        const cWind = wCand.windSpeed100m || 6.5;
        const cBWind = wCand.borderWindSpeed || cWind;
        const cSol = wCand.solarMw || 0;
        const cTemp = wCand.tempC || 8.0;
        for (let i = 0; i < kernelHist.length; i++) {
            const h = kernelHist[i];
            if (h.ms > cutoff) break;
            const dWind = (cWind - h.wind) / (isFi ? 1.15 : 1.35);
            const dBWind = (cBWind - h.borderWind) / 2.60;
            const dSol = (cSol - h.solar) / Math.max(120.0, sCap * 0.25);
            const hrDiff = Math.abs(targetHour - h.hour);
            const dHr = Math.min(hrDiff, 24 - hrDiff) / 1.85;
            const dTemp = (cTemp - h.temp) / 4.60;
            const dWk = (targetDti === h.dti) ? 0.0 : ((targetDti > 0 && h.dti > 0) ? 0.55 : 1.30);
            const ageD = Math.max(0.0, (targetMs - h.ms) / 86400000.0);
            const wt = Math.exp(-0.5 * (dWind * dWind + dBWind * dBWind + dSol * dSol + dHr * dHr + dTemp * dTemp + dWk * dWk) - ageD / 12.0);
            num += wt * h.vat0;
            numSq += wt * h.vat0 * h.vat0;
            den += wt;
        }
        if (den <= 1e-6) return { est: null, weightSum: 0, localStd: 0.5 };
        const mean = num / den;
        return { est: mean, weightSum: den, localStd: Math.sqrt(Math.max(0.0, numSq / den - mean * mean)) };
    }

    function predictModelVat0(obsCand, arCtx) {
        if (hasFiLogEns) return predictFiVat0WithEnsemble(obsCand, fiLogEns, arCtx);
        if (hasZoneLogModel) return predictZoneLogMeritVat0(obsCand, zoneLogModel, zcfg, arCtx);
        return predictFallbackLinearVat0(obsCand, zcfg.modelVat0EurCents, zcfg);
    }

    // 14-day online hour residual calibration
    const hourBiasVat0 = [new Array(24).fill(0.0), new Array(24).fill(0.0), new Array(24).fill(0.0)];
    if (recentObs.length >= 24) {
        const calStart = Math.max(24, recentObs.length - 336);
        for (let idx = calStart; idx < recentObs.length; idx++) {
            const o = recentObs[idx];
            const arH = { ...getArContext(o.epochMs, o.epochMs - 24 * 3600000), hoursAhead: 18 };
            const baseP = predictModelVat0(o, arH);
            const kpH = kernelPredictVat0(o.epochMs, o, o.hour, o.dayType);
            const kA = kpH.est !== null ? Math.min(0.24, kpH.weightSum / (kpH.weightSum + 3.2)) : 0.0;
            const rawP = kpH.est !== null ? (kA * kpH.est + (1.0 - kA) * baseP) : baseP;
            const res = Math.max(-7.0, Math.min(7.0, o.spotVat0EurCents - rawP));
            hourBiasVat0[o.dayType][o.hour] = 0.86 * hourBiasVat0[o.dayType][o.hour] + 0.14 * res;
        }
    }

    const baseMeanVat0 = zoneLogModel?.empiricalMeanVat0 || zcfg.baseSpotEurCentsVat0 || ((zcfg.baseEurMwh || 65.0) / 10.0);
    const allConfVals = Array.from(spotVat0Map.values());
    const rollingMeanVat0 = allConfVals.length >= 18
        ? (allConfVals.reduce((a, b) => a + b, 0) / allConfVals.length)
        : baseMeanVat0;

    const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
    const nowZt = getZoneTimeComponents(nowHourMs, zcfg.tz, isFi);
    const startSeriesMs = nowHourMs - nowZt.hour * 3600000;
    const daysReq = Math.max(1, Math.min(8, parseInt(query.days || '8', 10) || 8));
    const maxHoursParam = query.hours ? Math.max(1, Math.min(192, parseInt(query.hours, 10) || (daysReq * 24))) : (daysReq * 24);
    const totalHours = Math.min(192, maxHoursParam);
    const latestConfMs = sortedSpotMs.length > 0 ? sortedSpotMs[sortedSpotMs.length - 1] : nowHourMs;

    const decimals = wantEurKwh ? 4 : 2;
    const convertPrice = (eurCentsVat0) => {
        if (wantEurMwh) return Number((eurCentsVat0 * 10.0 * (includeVat ? effectiveVatRate : 1.0)).toFixed(2));
        if (wantEurKwh) return Number(((eurCentsVat0 / 100.0) * (includeVat ? effectiveVatRate : 1.0)).toFixed(4));
        return Number((eurCentsVat0 * fxScale * effectiveVatRate).toFixed(2));
    };

    const series = [];
    for (let i = 0; i < totalHours; i++) {
        const t = startSeriesMs + i * 3600000;
        const zt = getZoneTimeComponents(t, zcfg.tz, isFi);
        const w = weatherMap.get(t) || {
            windSpeed100m: 6.5,
            windMw: Math.round(wCap * 0.30),
            wind12hSmoothMw: Math.round(wCap * 0.30),
            rolling24hWindMw: Math.round(wCap * 0.30),
            windRamp6hMw: 0,
            tempC: 8.0,
            rolling72hTempC: 8.0,
            solarRadWm2: 0,
            solarMw: 0,
            pressureHpa: 1013,
            borderWindSpeed: 6.5,
            seWindSpeed: 6.5,
            eeWindSpeed: 6.5,
            nuclearMw: zcfg.nuclearCapMw || 0,
            nuclearDeficitMw: 0
        };

        const hoursAhead = Math.max(1, (t - nowHourMs) / 3600000);
        const arCtx = { ...getArContext(t, Math.min(latestConfMs, t - 3600000)), hoursAhead };
        const obsCand = {
            epochMs: t,
            dateKey: zt.dateKey,
            hour: zt.hour,
            month: zt.month,
            isWeekend: zt.isWeekend,
            isSat: zt.isSat,
            isFreeDay: zt.isFreeDay,
            dayType: zt.dayType,
            ...w
        };

        const modVat0 = predictModelVat0(obsCand, arCtx);
        const kp = kernelPredictVat0(t, w, zt.hour, zt.dayType);
        const kAlpha = kp.est !== null ? Math.min(0.24, kp.weightSum / (kp.weightSum + 3.2)) : 0.0;
        const rawPredVat0 = kp.est !== null ? (kAlpha * kp.est + (1.0 - kAlpha) * modVat0) : modVat0;
        const biasDecay = Math.exp(-Math.max(0.0, hoursAhead) / 144.0);
        const predVat0 = Math.max(-2.82, rawPredVat0 + hourBiasVat0[zt.dayType][zt.hour] * 0.45 * biasDecay);

        const horizonCurve = Math.pow(Math.min(1.0, hoursAhead / 168.0), 1.35);
        const dWind = 0.30 + horizonCurve * 0.75;
        const dTemp = 0.28 + horizonCurve * 0.80;
        const wHigh = Math.round(wCap * windSpeedToCapacityFactor((w.windSpeed100m || 6.5) + dWind));
        const wLow = Math.round(wCap * windSpeedToCapacityFactor(Math.max(1.4, (w.windSpeed100m || 6.5) - dWind)));
        const estOpt = predictModelVat0({ ...obsCand, windMw: wHigh, wind12hSmoothMw: Math.round((w.wind12hSmoothMw || w.windMw) * 0.5 + wHigh * 0.5), tempC: w.tempC + dTemp }, arCtx);
        const estPess = predictModelVat0({ ...obsCand, windMw: wLow, wind12hSmoothMw: Math.round((w.wind12hSmoothMw || w.windMw) * 0.5 + wLow * 0.5), tempC: w.tempC - dTemp }, arCtx);

        const priceMagVat0 = Math.max(1.5, Math.abs(predVat0));
        const weatherHalf = Math.abs(estPess - estOpt) * 0.40;
        const baseHalf = Math.max(0.20, priceMagVat0 * (0.08 + 0.11 * horizonCurve));
        const spread = Math.max(baseHalf, Math.min(Math.max(0.80, priceMagVat0 * 0.28 + 0.45), Math.hypot(weatherHalf, baseHalf)));
        const minVat0 = Math.max(-2.82, predVat0 - spread * 0.92);
        const maxVat0 = Math.max(predVat0 + 0.08, predVat0 + spread * 1.08);

        const isConfirmed = spotVat0Map.has(t);
        const chosenVat0 = isConfirmed ? spotVat0Map.get(t) : predVat0;
        const spotOut = convertPrice(chosenVat0);
        const minOut = isConfirmed ? spotOut : convertPrice(minVat0);
        const maxOut = isConfirmed ? spotOut : convertPrice(maxVat0);
        const predOut = convertPrice(predVat0);
        const totalOut = Number((spotOut + fixedAddon).toFixed(decimals));
        const probPct = isConfirmed ? 100 : Math.max(62, Math.min(94, Math.round(93 - (hoursAhead / 168.0) * 24)));

        series.push({
            epochMs: t,
            timestamp: new Date(t).toISOString(),
            endTimestamp: new Date(t + 3600000).toISOString(),
            dateKey: zt.dateKey,
            hour: zt.hour,
            isWeekend: zt.isWeekend,
            isHoliday: zt.isHoliday,
            isForecast: !isConfirmed,
            price: spotOut,
            spotPrice: spotOut,
            totalPrice: totalOut,
            minPrice: minOut,
            maxPrice: maxOut,
            predictedPrice: predOut,
            priceEurMwhVat0: Number((chosenVat0 * 10.0).toFixed(2)),
            priceEurCentsVat0: Number(chosenVat0.toFixed(3)),
            priceInclVat: Number((chosenVat0 * fxScale * (zoneCode === 'NO4' ? 1.0 : (mkt.vatRate || 1.20))).toFixed(3)),
            priceVat0: Number((chosenVat0 * fxScale).toFixed(3)),
            probabilityPct: probPct,
            windMw: w.windMw,
            windSpeed100m: w.windSpeed100m,
            solarMw: w.solarMw || 0,
            tempC: w.tempC
        });
    }

    const rolling30dAvg = convertPrice(rollingMeanVat0);
    const cheapCut = rolling30dAvg * 0.72;
    const highCut = rolling30dAvg * 1.28;

    const { rankMap, selectedEpochSet, automation } = computeSmartAutomationSummary(series, nowHourMs, windowHours, thresholdVal);
    for (const s of series) {
        s.rank24h = rankMap.get(s.epochMs) || null;
        s.inCheapestHours = selectedEpochSet.has(s.epochMs);
        s.level = s.spotPrice <= cheapCut ? 'cheap' : (s.spotPrice >= highCut ? 'high' : 'normal');
    }

    const todayKey = nowZt.dateKey;
    const tomZt = getZoneTimeComponents(nowHourMs + 24 * 3600000, zcfg.tz, isFi);
    const tomorrowKey = tomZt.dateKey;
    const todaySlots = series.filter(s => s.dateKey === todayKey);
    const tomorrowSlots = series.filter(s => s.dateKey === tomorrowKey);
    const next24Slots = series.filter(s => s.epochMs >= nowHourMs && s.epochMs < nowHourMs + 24 * 3600000);

    const calcStats = (arr) => {
        if (!arr || arr.length === 0) return { min: null, max: null, avg: null };
        const vals = arr.map(x => x.spotPrice);
        return {
            min: Number(Math.min(...vals).toFixed(decimals)),
            max: Number(Math.max(...vals).toFixed(decimals)),
            avg: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(decimals))
        };
    };

    const todayStats = calcStats(todaySlots);
    const tomorrowStats = calcStats(tomorrowSlots);
    const next24Stats = calcStats(next24Slots);
    const tomorrowConfirmed = tomorrowSlots.length >= 12 && tomorrowSlots.every(s => !s.isForecast);

    const summary = {
        todayDate: todayKey,
        todayMin: todayStats.min,
        todayMax: todayStats.max,
        todayAvg: todayStats.avg,
        tomorrowDate: tomorrowKey,
        tomorrowConfirmed,
        tomorrowMin: tomorrowStats.min,
        tomorrowMax: tomorrowStats.max,
        tomorrowAvg: tomorrowStats.avg,
        next24hMin: next24Stats.min,
        next24hMax: next24Stats.max,
        next24hAvg: next24Stats.avg,
        rolling30dAvg
    };

    const currentSlot = series.find(s => s.epochMs === nowHourMs) || series[0] || null;
    const dashboardPath = mkt.path || '/en/';
    const dashboardUrl = `${SITE_URL}${dashboardPath}${mkt.zones && Object.keys(mkt.zones).length > 1 ? `?zone=${encodeURIComponent(zoneCode)}` : ''}`;

    return {
        isZoneDirectory: false,
        zoneCode,
        zcfg,
        mkt,
        unitLabel,
        majorCurrencyCode,
        subunitsPerMajor,
        wantEurMwh,
        wantEurKwh,
        decimals,
        dashboardUrl,
        nowHourMs,
        currentSlot,
        summary,
        automation,
        todaySlots,
        tomorrowSlots,
        next24Slots,
        series,
        payload: {
            status: 'ok',
            meta: {
                provider: 'Spotpuls',
                website: SITE_URL,
                dashboardUrl,
                apiDocsUrl: `${SITE_URL}/api-docs/`,
                openApiSpec: `${SITE_URL}/openapi.json`,
                unit: unitLabel,
                currencyMajor: majorCurrencyCode,
                attribution: `Spot electricity prices & 7-day regional forecast by Spotpuls (${SITE_URL})`,
                license: 'CC BY 4.0 — Free with attribution/link to https://spotpuls.app',
                modelEngine: isFi ? 'Spotpuls Log-Merit + 45-tree Hist-GBDT + Analog Kernel' : 'Spotpuls Empirical Zone Log-Merit + 16-tree Hist-GBDT',
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
                marginAddon: marginAdd,
                transferAddon: transferAdd,
                rollingMeanEurCentsVat0: Number(rollingMeanVat0.toFixed(2))
            },
            current: currentSlot,
            currentHour: currentSlot,
            summary,
            automation,
            series
        }
    };
}

function buildIcalCalendar(result) {
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const toIcsUtc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const byDate = new Map();
    for (const s of result.series) {
        if (!byDate.has(s.dateKey)) byDate.set(s.dateKey, []);
        byDate.get(s.dateKey).push(s);
    }
    const wHrs = result.automation.windowHours || 3;
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Spotpuls//Electricity Spot & Forecast Schedule//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:Spotpuls ${result.zoneCode} (${result.unitLabel})`,
        `X-WR-CALDESC:Optimal electricity usage windows and peak alerts by Spotpuls (${SITE_URL})`
    ];

    for (const [dateKey, daySlots] of byDate.entries()) {
        if (daySlots.length < 6) continue;
        const len = Math.min(wHrs, daySlots.length);
        let bestIdx = 0, bestAvg = Infinity;
        let worstIdx = 0, worstAvg = -Infinity;
        for (let i = 0; i <= daySlots.length - len; i++) {
            let sum = 0;
            for (let j = 0; j < len; j++) sum += daySlots[i + j].totalPrice;
            const avg = sum / len;
            if (avg < bestAvg) { bestAvg = avg; bestIdx = i; }
            if (avg > worstAvg) { worstAvg = avg; worstIdx = i; }
        }
        const bStart = daySlots[bestIdx].epochMs;
        const bEnd = daySlots[bestIdx + len - 1].epochMs + 3600000;
        const isFc = daySlots[bestIdx].isForecast ? 'Forecast' : 'Confirmed';
        lines.push(
            'BEGIN:VEVENT',
            `UID:spotpuls-cheap-${result.zoneCode}-${dateKey}@spotpuls.app`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${toIcsUtc(bStart)}`,
            `DTEND:${toIcsUtc(bEnd)}`,
            `SUMMARY:[Spotpuls ${result.zoneCode}] Cheapest ${len}h avg ${bestAvg.toFixed(2)} ${result.unitLabel} (${isFc})`,
            `DESCRIPTION:Optimal ${len}-hour electricity window in ${result.zoneCode}. Average price: ${bestAvg.toFixed(2)} ${result.unitLabel} (${isFc}). Live chart: ${result.dashboardUrl}`,
            `URL:${result.dashboardUrl}`,
            'END:VEVENT'
        );

        const pStart = daySlots[worstIdx].epochMs;
        const pEnd = daySlots[worstIdx + len - 1].epochMs + 3600000;
        lines.push(
            'BEGIN:VEVENT',
            `UID:spotpuls-peak-${result.zoneCode}-${dateKey}@spotpuls.app`,
            `DTSTAMP:${dtStamp}`,
            `DTSTART:${toIcsUtc(pStart)}`,
            `DTEND:${toIcsUtc(pEnd)}`,
            `SUMMARY:[Spotpuls ${result.zoneCode}] Peak ${len}h avg ${worstAvg.toFixed(2)} ${result.unitLabel}`,
            `DESCRIPTION:Highest price window in ${result.zoneCode}. Average price: ${worstAvg.toFixed(2)} ${result.unitLabel}. Live chart: ${result.dashboardUrl}`,
            `URL:${result.dashboardUrl}`,
            'END:VEVENT'
        );
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

function buildPrometheusMetrics(result) {
    const z = result.zoneCode;
    const u = result.unitLabel;
    const cur = result.currentSlot;
    const auto = result.automation;
    const sum = result.summary;
    const lines = [
        '# HELP spotpuls_spot_price Current hour spot electricity price',
        '# TYPE spotpuls_spot_price gauge',
        `spotpuls_spot_price{zone="${z}",unit="${u}"} ${cur ? cur.spotPrice : 0}`,
        '# HELP spotpuls_total_price Current hour total electricity price including configured margin/transfer',
        '# TYPE spotpuls_total_price gauge',
        `spotpuls_total_price{zone="${z}",unit="${u}"} ${cur ? cur.totalPrice : 0}`,
        '# HELP spotpuls_price_eur_mwh_vat0 Current hour wholesale spot price in EUR/MWh VAT 0%',
        '# TYPE spotpuls_price_eur_mwh_vat0 gauge',
        `spotpuls_price_eur_mwh_vat0{zone="${z}"} ${cur ? cur.priceEurMwhVat0 : 0}`,
        '# HELP spotpuls_is_forecast 1 if current hour is ML forecast, 0 if exchange-confirmed',
        '# TYPE spotpuls_is_forecast gauge',
        `spotpuls_is_forecast{zone="${z}"} ${cur && cur.isForecast ? 1 : 0}`,
        '# HELP spotpuls_rank_24h Rank of current hour among next 24 hours (1 = cheapest)',
        '# TYPE spotpuls_rank_24h gauge',
        `spotpuls_rank_24h{zone="${z}"} ${cur && cur.rank24h ? cur.rank24h : 0}`,
        '# HELP spotpuls_cheapest_window_active 1 if current hour is inside optimal contiguous window',
        '# TYPE spotpuls_cheapest_window_active gauge',
        `spotpuls_cheapest_window_active{zone="${z}",window_hours="${auto.windowHours}"} ${auto.cheapestContiguousWindow?.activeNow ? 1 : 0}`,
        '# HELP spotpuls_cheapest_hours_active 1 if current hour is among N cheapest hours in next 24h',
        '# TYPE spotpuls_cheapest_hours_active gauge',
        `spotpuls_cheapest_hours_active{zone="${z}",window_hours="${auto.windowHours}"} ${auto.cheapestHours?.activeNow ? 1 : 0}`,
        '# HELP spotpuls_today_min_price Minimum spot price today',
        '# TYPE spotpuls_today_min_price gauge',
        `spotpuls_today_min_price{zone="${z}",unit="${u}"} ${sum.todayMin ?? 0}`,
        '# HELP spotpuls_today_max_price Maximum spot price today',
        '# TYPE spotpuls_today_max_price gauge',
        `spotpuls_today_max_price{zone="${z}",unit="${u}"} ${sum.todayMax ?? 0}`,
        '# HELP spotpuls_today_avg_price Average spot price today',
        '# TYPE spotpuls_today_avg_price gauge',
        `spotpuls_today_avg_price{zone="${z}",unit="${u}"} ${sum.todayAvg ?? 0}`,
        '# HELP spotpuls_wind_generation_mw Estimated regional wind power generation in MW',
        '# TYPE spotpuls_wind_generation_mw gauge',
        `spotpuls_wind_generation_mw{zone="${z}"} ${cur ? cur.windMw : 0}`,
        '# HELP spotpuls_temperature_celsius Regional load-weighted temperature in Celsius',
        '# TYPE spotpuls_temperature_celsius gauge',
        `spotpuls_temperature_celsius{zone="${z}"} ${cur ? cur.tempC : 0}`
    ];
    return lines.join('\n') + '\n';
}

function buildEmbedWidgetHtml(result, theme = 'light') {
    const isDark = theme === 'dark';
    const bg = isDark ? '#111210' : '#f6f7f3';
    const fg = isDark ? '#f6f7f3' : '#111210';
    const muted = isDark ? '#a5a89e' : '#535750';
    const border = isDark ? '#32352f' : '#111210';
    const grid = isDark ? '#262924' : '#d6d8cf';
    const bars = result.next24Slots.length > 0 ? result.next24Slots : result.series.slice(0, 24);
    const vals = bars.map(b => b.spotPrice);
    const minV = Math.min(0, ...vals);
    const maxV = Math.max(10, ...vals);
    const span = Math.max(1, maxV - minV);
    const W = 420, H = 112, padL = 6, padR = 6, padT = 8, padB = 18;
    const pW = W - padL - padR, pH = H - padT - padB;
    const zeroY = padT + pH - ((0 - minV) / span) * pH;
    const colW = pW / Math.max(1, bars.length);

    let rects = `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
    bars.forEach((b, idx) => {
        const x = padL + idx * colW + colW * 0.12;
        const bw = Math.max(2, colW * 0.76);
        const yVal = padT + pH - ((b.spotPrice - minV) / span) * pH;
        const yTop = Math.min(zeroY, yVal);
        const bh = Math.max(2, Math.abs(zeroY - yVal));
        const fill = b.level === 'cheap' ? '#009e3d' : (b.level === 'high' ? '#ff3b00' : '#0038ff');
        const op = b.isForecast ? '0.68' : '1';
        const stroke = b.epochMs === result.nowHourMs ? `stroke="#ffd000" stroke-width="1.8"` : '';
        rects += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${fill}" fill-opacity="${op}" ${stroke}><title>${String(b.hour).padStart(2, '0')}:00 · ${b.spotPrice} ${result.unitLabel}${b.isForecast ? ' (forecast)' : ''}</title></rect>`;
        if (idx % 6 === 0) {
            rects += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" fill="${muted}" font-family="monospace">${String(b.hour).padStart(2, '0')}</text>`;
        }
    });

    const curPrice = result.currentSlot ? result.currentSlot.spotPrice : '—';
    const wInfo = result.automation.cheapestContiguousWindow;
    const winTxt = wInfo
        ? `${new Date(wInfo.startEpochMs).toISOString().slice(11, 16)}–${new Date(wInfo.endEpochMs).toISOString().slice(11, 16)} UTC (${wInfo.avgSpotPrice} ${result.unitLabel})`
        : '—';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spotpuls ${result.zoneCode} Live Spot Widget</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:${bg};color:${fg};font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;padding:10px}
.card{border:1.5px solid ${border};padding:10px 12px;background:${bg}}
.top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.zone{font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${muted}}
.now{font-size:20px;font-weight:700}
.unit{font-size:11px;font-weight:600;color:${muted}}
.meta{display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${muted};margin-top:6px;padding-top:6px;border-top:1px solid ${grid}}
a{color:${fg};text-decoration:none;font-weight:700;border-bottom:1.5px solid #ffd000}
</style>
</head>
<body>
<div class="card">
  <div class="top">
    <div>
      <div class="zone">SPOTPULS · ${result.zoneCode} (${result.zcfg.exchange || 'DAY-AHEAD'})</div>
      <div class="now">${curPrice} <span class="unit">${result.unitLabel}</span></div>
    </div>
    <div style="text-align:right;font-size:10.5px;color:${muted}">
      <div>Min 24h: <strong style="color:${fg}">${result.summary.next24hMin ?? '—'}</strong></div>
      <div>Max 24h: <strong style="color:${fg}">${result.summary.next24hMax ?? '—'}</strong></div>
    </div>
  </div>
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">${rects}</svg>
  <div class="meta">
    <span>Best ${result.automation.windowHours}h: ${winTxt}</span>
    <a href="${result.dashboardUrl}" target="_blank" rel="noopener">Spotpuls</a>
  </div>
</div>
</body>
</html>`;
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

        // 1. Ultra-compact payload (<500 B) for Shelly Gen2/Gen3, ESPHome, ESP32, Arduino, Tasmota, PLC
        if (fmt === 'compact' || fmt === 'shelly' || fmt === 'esp' || fmt === 'iot') {
            const cur = result.currentSlot;
            const cw = result.automation.cheapestContiguousWindow;
            const compactPayload = {
                z: result.zoneCode,
                u: result.unitLabel,
                t: Math.floor(result.nowHourMs / 1000),
                now: cur ? cur.spotPrice : null,
                tot: cur ? cur.totalPrice : null,
                lvl: cur ? cur.level : 'normal',
                rk: cur ? cur.rank24h : null,
                fc: cur && cur.isForecast ? 1 : 0,
                runContig: cw?.activeNow ? 1 : 0,
                runCheap: result.automation.cheapestHours?.activeNow ? 1 : 0,
                avoidPeak: result.automation.peakAvoidWindow?.activeNow ? 1 : 0,
                belowThr: result.automation.belowThresholdNow === null ? null : (result.automation.belowThresholdNow ? 1 : 0),
                wHrs: result.automation.windowHours,
                wStart: cw ? Math.floor(cw.startEpochMs / 1000) : null,
                wEnd: cw ? Math.floor(cw.endEpochMs / 1000) : null,
                wAvg: cw ? cw.avgTotalPrice : null,
                min24: result.summary.next24hMin,
                max24: result.summary.next24hMax,
                avg24: result.summary.next24hAvg,
                p24: result.next24Slots.map(s => s.spotPrice)
            };
            return res.status(200).json(compactPayload);
        }

        // 2. Native Home Assistant + ApexCharts-Card / Nordpool-card compatible JSON
        if (fmt === 'ha' || fmt === 'homeassistant' || fmt === 'apexcharts') {
            const cur = result.currentSlot;
            const cw = result.automation.cheapestContiguousWindow;
            const mapHaSlot = (s) => ({
                start: s.timestamp,
                end: s.endTimestamp,
                value: s.spotPrice,
                total: s.totalPrice,
                min: s.minPrice,
                max: s.maxPrice,
                is_forecast: s.isForecast
            });
            return res.status(200).json({
                state: cur ? cur.spotPrice : null,
                total_price: cur ? cur.totalPrice : null,
                unit_of_measurement: result.unitLabel,
                zone: result.zoneCode,
                attribution: `Data provided by Spotpuls (${SITE_URL})`,
                is_forecast: cur ? cur.isForecast : false,
                price_level: cur ? cur.level : 'normal',
                rank_24h: cur ? cur.rank24h : null,
                run_contiguous_now: Boolean(cw?.activeNow),
                run_cheapest_now: Boolean(result.automation.cheapestHours?.activeNow),
                avoid_peak_now: Boolean(result.automation.peakAvoidWindow?.activeNow),
                below_threshold_now: result.automation.belowThresholdNow,
                cheapest_window_start: cw ? cw.start : null,
                cheapest_window_end: cw ? cw.end : null,
                cheapest_window_avg: cw ? cw.avgTotalPrice : null,
                today_min: result.summary.todayMin,
                today_max: result.summary.todayMax,
                today_avg: result.summary.todayAvg,
                tomorrow_valid: result.summary.tomorrowConfirmed,
                tomorrow_min: result.summary.tomorrowMin,
                tomorrow_max: result.summary.tomorrowMax,
                tomorrow_avg: result.summary.tomorrowAvg,
                raw_today: result.todaySlots.map(mapHaSlot),
                raw_tomorrow: result.tomorrowSlots.map(mapHaSlot),
                forecast_7d: result.series.map(mapHaSlot)
            });
        }

        // 3. Native evcc.io open-source EV / solar charger tariff array
        if (fmt === 'evcc') {
            const useMinor = String(q.unit || '').toLowerCase() === 'minor';
            const div = (useMinor || result.wantEurMwh || result.wantEurKwh) ? 1.0 : result.subunitsPerMajor;
            const evccList = result.series
                .filter(s => s.epochMs >= result.nowHourMs - 3600000)
                .map(s => ({
                    start: s.timestamp,
                    end: s.endTimestamp,
                    value: Number((s.totalPrice / div).toFixed(5))
                }));
            return res.status(200).json(evccList);
        }

        // 4. Node-RED / Victron VenusOS Dynamic ESS automation schedule
        if (fmt === 'victron' || fmt === 'nodered') {
            return res.status(200).json({
                zone: result.zoneCode,
                unit: result.unitLabel,
                nowEpochSec: Math.floor(result.nowHourMs / 1000),
                currentSpot: result.currentSlot?.spotPrice ?? null,
                currentTotal: result.currentSlot?.totalPrice ?? null,
                relayContiguousOn: Boolean(result.automation.cheapestContiguousWindow?.activeNow),
                relayCheapestHoursOn: Boolean(result.automation.cheapestHours?.activeNow),
                relayPeakCutActive: Boolean(result.automation.peakAvoidWindow?.activeNow),
                schedule: result.series.filter(s => s.epochMs >= result.nowHourMs).map(s => ({
                    unix: Math.floor(s.epochMs / 1000),
                    spot: s.spotPrice,
                    total: s.totalPrice,
                    rank24h: s.rank24h,
                    chargeRecommended: s.inCheapestHours,
                    isForecast: s.isForecast
                }))
            });
        }

        // 5. CSV for Google Sheets IMPORTDATA(), Excel PowerQuery, R, Pandas
        if (fmt === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="spotpuls_${result.zoneCode}.csv"`);
            const lines = [
                `# Source: Spotpuls (${SITE_URL}) — Zone: ${result.zoneCode} (${result.unitLabel})`,
                'timestamp_utc,date_local,hour_local,is_forecast,spot_price,total_price,min_price,max_price,eur_mwh_vat0,wind_mw,solar_mw,temp_c'
            ];
            for (const s of result.series) {
                lines.push(`${s.timestamp},${s.dateKey},${s.hour},${s.isForecast ? 1 : 0},${s.spotPrice},${s.totalPrice},${s.minPrice},${s.maxPrice},${s.priceEurMwhVat0},${s.windMw},${s.solarMw},${s.tempC}`);
            }
            return res.status(200).send(lines.join('\n'));
        }

        // 6. iCalendar (.ics) live calendar subscription for Apple/Google/Outlook Calendar
        if (fmt === 'ical' || fmt === 'ics') {
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="spotpuls_${result.zoneCode}.ics"`);
            return res.status(200).send(buildIcalCalendar(result));
        }

        // 7. Prometheus / Grafana / VictoriaMetrics OpenMetrics exposition format
        if (fmt === 'prometheus' || fmt === 'metrics') {
            res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
            return res.status(200).send(buildPrometheusMetrics(result));
        }

        // 8. Plain single-value text for Apple Shortcuts, Tasker, curl, bash, Loxone, KNX/PLC
        if (fmt === 'plain' || fmt === 'text') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            const field = String(q.field || 'spot').toLowerCase();
            const cur = result.currentSlot;
            let outVal = '';
            if (field === 'total') outVal = cur ? String(cur.totalPrice) : '';
            else if (field === 'level') outVal = cur ? String(cur.level) : '';
            else if (field === 'rank') outVal = cur && cur.rank24h ? String(cur.rank24h) : '';
            else if (field === 'run_now' || field === 'run_contiguous') outVal = result.automation.cheapestContiguousWindow?.activeNow ? '1' : '0';
            else if (field === 'run_cheap') outVal = result.automation.cheapestHours?.activeNow ? '1' : '0';
            else if (field === 'avoid_peak') outVal = result.automation.peakAvoidWindow?.activeNow ? '1' : '0';
            else if (field === 'below_threshold') outVal = result.automation.belowThresholdNow ? '1' : '0';
            else if (field === 'min24') outVal = String(result.summary.next24hMin ?? '');
            else if (field === 'max24') outVal = String(result.summary.next24hMax ?? '');
            else outVal = cur ? String(cur.spotPrice) : '';
            return res.status(200).send(outVal);
        }

        // 9. Crisp monochrome + signal-yellow SVG status badge (zero emojis)
        if (fmt === 'badge' || fmt === 'svg') {
            res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
            const curVal = result.currentSlot ? result.currentSlot.spotPrice : '—';
            const labelLeft = `SPOTPULS · ${result.zoneCode}`;
            const labelRight = `${curVal} ${result.unitLabel}`;
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="28" role="img" aria-label="${labelLeft}: ${labelRight}">
  <rect width="120" height="28" fill="#111210"/>
  <rect x="120" width="136" height="28" fill="#ffd000"/>
  <rect x="0.5" y="0.5" width="255" height="27" fill="none" stroke="#111210"/>
  <text x="60" y="18" fill="#f6f7f3" text-anchor="middle" font-family="monospace" font-weight="700" font-size="11">${labelLeft}</text>
  <text x="188" y="18" fill="#111210" text-anchor="middle" font-family="monospace" font-weight="700" font-size="11.5">${labelRight}</text>
</svg>`;
            return res.status(200).send(svg);
        }

        // 10. Responsive embeddable HTML/SVG live price + 24h mini-chart widget (zero emojis)
        if (fmt === 'widget' || fmt === 'embed' || fmt === 'html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            const theme = String(q.theme || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';
            return res.status(200).send(buildEmbedWidgetHtml(result, theme));
        }

        // Optional JSONP wrapper for legacy embedded browser dashboards
        if (q.callback && /^[a-zA-Z_$][0-9a-zA-Z_$.]{0,60}$/.test(String(q.callback))) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            return res.status(200).send(`${q.callback}(${JSON.stringify(result.payload)});`);
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
