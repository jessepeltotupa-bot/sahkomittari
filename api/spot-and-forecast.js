// Vercel Serverless API: /api/spot-and-forecast.js
// Yhdistää:
// 1. Esikoulutetun 24 muuttujan vaiheittaisen Ridge-regressio- ja jäännösvirhemallin (ml_weights.json, koulutettu 17 552 h historialla)
// 2. Jatkuvan reaaliaikaisen verkko-oppimisen (Online NLMS / Residual Adaptation) tuoreimmilla Nord Pool FI -toteumatunneilla
// 3. 6 pisteen Open-Meteo -sää-, aurinkosäteily-, ilmanpaine- ja rajasiirtoennusteen (Suomi, Pohjois-Ruotsi SE1, Viro EE)
//    sekä Suomen ydinvoimaloiden (OL1, OL2, OL3, LO1, LO2) huoltoseisokkikalenterin.

import fs from 'fs';
import path from 'path';

const FINLAND_INSTALLED_WIND_MW = 8450;
const FINLAND_NUCLEAR_MAX_MW = 4394;
const FINLAND_SOLAR_MAX_MW = 1250;

function loadPretrainedWeights() {
    try {
        const p = path.join(process.cwd(), 'ml_weights.json');
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
    } catch (_) {}
    return null;
}

function windSpeedToCapacityFactor(v100m) {
    if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.30;
    const vHub = v100m * 1.26;
    if (vHub < 2.8) return 0.02;
    if (vHub >= 25.0) return 0.05;
    if (vHub >= 11.8) return 0.90;
    const norm = (vHub - 2.8) / (11.8 - 2.8);
    return Math.max(0.02, Math.min(0.90, Math.pow(norm, 1.65) * 0.90));
}

function radiationToSolarMw(radWm2, month, hour) {
    if (radWm2 !== null && radWm2 !== undefined && !isNaN(radWm2)) {
        const cf = Math.max(0.0, Math.min(0.82, (radWm2 / 820.0) * 0.80));
        return Math.round(FINLAND_SOLAR_MAX_MW * cf);
    }
    if (hour < 5 || hour > 20 || [11, 12, 1].includes(month)) return 0;
    const seasonPeak = Math.max(0.0, Math.sin(((month - 2.2) / 8.5) * Math.PI));
    const hourPeak = Math.max(0.0, Math.cos(((hour - 13.0) / 5.5) * (Math.PI / 2.0)));
    return Math.round(FINLAND_SOLAR_MAX_MW * 0.55 * seasonPeak * hourPeak);
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
    const wd = map.weekday;
    const dateKey = `${map.year}-${map.month}-${map.day}`;
    const isWeekend = (wd === 'Sat' || wd === 'Sun');
    const fixedHolidays = ['01-01', '01-06', '05-01', '12-06', '12-24', '12-25', '12-26'];
    const isHoliday = fixedHolidays.includes(`${map.month}-${map.day}`);
    return {
        year: parseInt(map.year, 10),
        month,
        day: parseInt(map.day, 10),
        hour,
        isWeekend,
        isHoliday,
        isFreeDay: isWeekend || isHoliday,
        dateKey
    };
}

function getNuclearStatusForDate(dateKey, schedule) {
    let offlineMw = 0;
    const list = Array.isArray(schedule) ? schedule : [];
    for (const item of list) {
        if (dateKey >= item.start && dateKey <= item.end) {
            offlineMw += item.mw;
        }
    }
    offlineMw = Math.min(3000, offlineMw);
    return {
        nuclearMw: Math.round(FINLAND_NUCLEAR_MAX_MW - offlineMw),
        nuclearDeficitMw: Math.round(offlineMw)
    };
}

function extractFeatures24(obs) {
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / FINLAND_INSTALLED_WIND_MW));
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
    const prev24 = obs.prev24hMean !== undefined ? obs.prev24hMean : 5.5;
    const arLevel = (Math.min(22.0, prev24) / 10.0) * windMemoryDamping;

    const isHeatingSeason = [10, 11, 12, 1, 2, 3, 4].includes(obs.month) ? 1.0 : 0.0;
    const heatingPeak = isHeatingSeason * (!obs.isFreeDay && ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 21)) ? 1.0 : 0.0) * (1.0 - wRatio);

    const t72 = obs.rolling72hTempC !== undefined ? obs.rolling72hTempC : tempC;
    const rolling72hHdd = Math.max(0.0, 10.0 - t72) / 20.0;

    const solarMw = obs.solarMw || 0.0;
    const solarRatio = solarMw / FINLAND_SOLAR_MAX_MW;

    const nucDefMw = obs.nuclearDeficitMw || 0.0;
    const nucDefRatio = nucDefMw / 2000.0;
    const nucScarcityInter = nucDefRatio * Math.max(0.0, 0.55 - wRatio) * (obs.isFreeDay ? 0.5 : 1.0);

    const w24Ratio = Math.max(0.01, Math.min(0.95, (obs.rolling24hWindMw || obs.windMw) / FINLAND_INSTALLED_WIND_MW));
    const rolling24hLowWind = Math.max(0.0, 0.35 - w24Ratio) * 2.0;

    const windRampDrop = Math.max(0.0, -(obs.windRamp6hMw || 0.0)) / 2500.0;

    const seCf = windSpeedToCapacityFactor(obs.seWindSpeed !== undefined ? obs.seWindSpeed : 6.5);
    const seImportRelief = seCf * (1.0 - wRatio * 0.5);

    const eeCf = windSpeedToCapacityFactor(obs.eeWindSpeed !== undefined ? obs.eeWindSpeed : 6.5);
    const eeExportPull = Math.max(0.0, 0.45 - eeCf) * (hour >= 7 && hour <= 21 ? 1.0 : 0.3);

    const pressHpa = obs.pressureHpa !== undefined ? obs.pressureHpa : 1013.0;
    const blockingHigh = Math.max(0.0, (pressHpa - 1018.0) / 25.0) * isHeatingSeason;

    const lag24Same = Math.min(28.0, obs.lag24hSameHour !== undefined ? obs.lag24hSameHour : prev24);
    const prev7d = Math.min(20.0, obs.prev7dMean !== undefined ? obs.prev7dMean : prev24);
    const prevStd = Math.min(15.0, obs.prev24hStd !== undefined ? obs.prev24hStd : 2.0);
    const arComposite = ((0.45 * lag24Same + 0.35 * prev7d + 0.20 * prevStd) / 10.0) * windMemoryDamping;

    return [
        1.0,
        wRatio,
        wRatio * wRatio,
        lowWindScarcity,
        hdd,
        severeCold,
        morningPeak,
        eveningPeak,
        nightTrough,
        isFree,
        calmColdInter,
        arLevel,
        isHeatingSeason,
        heatingPeak,
        rolling72hHdd,
        solarRatio,
        nucDefRatio,
        nucScarcityInter,
        rolling24hLowWind,
        windRampDrop,
        seImportRelief,
        eeExportPull,
        blockingHigh,
        arComposite
    ];
}

function predictHourWithModel(obs, model) {
    const x = extractFeatures24(obs);
    const w = model.weights;
    let lin = 0;
    for (let i = 0; i < Math.min(w.length, x.length); i++) lin += w[i] * x[i];
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / FINLAND_INSTALLED_WIND_MW));
    const hRaw = obs.isFreeDay ? model.weekendHourAdj[obs.hour] : model.weekdayHourAdj[obs.hour];
    const hScale = hRaw > 0 ? Math.max(0.20, 1.15 - 0.90 * wRatio) : 1.0;
    const wBin = Math.min(4, Math.floor((obs.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
    const tBin = obs.tempC < -5 ? 0 : (obs.tempC < 2 ? 1 : (obs.tempC < 10 ? 2 : 3));
    const gAdj = (model.windTempGridAdj && model.windTempGridAdj[`${wBin}_${tBin}`]) || 0.0;
    return Math.max(0.05, lin + hRaw * hScale + gAdj);
}

function adaptModelOnline(baseModel, recentObservations) {
    const weights = [...baseModel.weights];
    while (weights.length < 24) weights.push(0.0);
    const weekdayHourAdj = [...baseModel.weekdayHourAdj];
    const weekendHourAdj = [...baseModel.weekendHourAdj];
    const windTempGridAdj = { ...(baseModel.windTempGridAdj || {}) };

    if (!recentObservations || recentObservations.length < 24) {
        return { weights, weekdayHourAdj, weekendHourAdj, windTempGridAdj, onlineSamples: 0 };
    }

    const tail = recentObservations.slice(-168);
    for (const obs of tail) {
        const y = Math.max(-0.5, Math.min(35.0, obs.priceInclVat));
        const x = extractFeatures24(obs);
        let predLin = 0;
        let normSq = 1.0;
        for (let i = 0; i < 24; i++) {
            predLin += weights[i] * x[i];
            normSq += x[i] * x[i];
        }
        const hAdj = obs.isFreeDay ? weekendHourAdj[obs.hour] : weekdayHourAdj[obs.hour];
        const err = y - (predLin + hAdj);
        const lr = 0.035 / normSq;
        for (let i = 0; i < 24; i++) {
            weights[i] += lr * err * x[i];
        }
        if (obs.isFreeDay) {
            weekendHourAdj[obs.hour] = weekendHourAdj[obs.hour] * 0.96 + (y - predLin) * 0.04;
        } else {
            weekdayHourAdj[obs.hour] = weekdayHourAdj[obs.hour] * 0.96 + (y - predLin) * 0.04;
        }
    }

    return {
        weights: weights.map(v => Math.round(v * 100000) / 100000),
        weekdayHourAdj: weekdayHourAdj.map(v => Math.round(v * 1000) / 1000),
        weekendHourAdj: weekendHourAdj.map(v => Math.round(v * 1000) / 1000),
        windTempGridAdj,
        onlineSamples: tail.length
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const pretrained = loadPretrainedWeights();
        const now = new Date();
        const pastStart = new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString();
        const futureEnd = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();

        const sahkotinUrl = `https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(pastStart)}&end=${encodeURIComponent(futureEnd)}`;
        const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17,63.82,59.43&longitude=23.95,21.34,22.58,24.94,20.26,24.75&hourly=temperature_2m,wind_speed_100m,wind_speed_10m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=10&forecast_days=8&timezone=UTC`;

        const [spotResp, weatherResp] = await Promise.allSettled([
            fetch(sahkotinUrl, { headers: { 'Accept': 'application/json' } }),
            fetch(openMeteoUrl, { headers: { 'Accept': 'application/json' } })
        ]);

        const spotMap = new Map();
        if (spotResp.status === 'fulfilled' && spotResp.value.ok) {
            const spotJson = await spotResp.value.json();
            if (spotJson && Array.isArray(spotJson.prices)) {
                for (const item of spotJson.prices) {
                    const ms = Math.floor(new Date(item.date).getTime() / 3600000) * 3600000;
                    spotMap.set(ms, Number(item.value));
                }
            }
        }

        const weatherMap = new Map();
        if (weatherResp.status === 'fulfilled' && weatherResp.value.ok) {
            const wJson = await weatherResp.value.json();
            const locs = Array.isArray(wJson) ? wJson : [wJson];
            if (locs.length >= 6 && locs[0].hourly) {
                const times = locs[0].hourly.time;
                for (let i = 0; i < times.length; i++) {
                    const tMs = new Date(times[i] + ':00Z').getTime();
                    const getW = (idx) => {
                        const hObj = locs[idx].hourly;
                        if (hObj.wind_speed_100m && hObj.wind_speed_100m[i] != null) return hObj.wind_speed_100m[i];
                        if (hObj.wind_speed_10m && hObj.wind_speed_10m[i] != null) return hObj.wind_speed_10m[i] * 1.45;
                        return 6.5;
                    };
                    const w1 = getW(0), w2 = getW(1), w3 = getW(2);
                    const weightedWind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20;
                    const cf = windSpeedToCapacityFactor(weightedWind);
                    const windMw = Math.round(FINLAND_INSTALLED_WIND_MW * cf);

                    const tSouth = locs[3].hourly.temperature_2m[i] ?? 5.0;
                    const tWest = locs[2].hourly.temperature_2m[i] ?? 3.0;
                    const tNorth = locs[0].hourly.temperature_2m[i] ?? 1.0;
                    const weightedTemp = Math.round((tSouth * 0.55 + tWest * 0.25 + tNorth * 0.20) * 10) / 10;

                    const radS = locs[3].hourly.shortwave_radiation ? (locs[3].hourly.shortwave_radiation[i] ?? 0) : 0;
                    const radW = locs[2].hourly.shortwave_radiation ? (locs[2].hourly.shortwave_radiation[i] ?? 0) : 0;
                    const solarRadWm2 = Math.round((radS * 0.6 + radW * 0.4) * 10) / 10;
                    const pressureHpa = locs[2].hourly.surface_pressure ? (locs[2].hourly.surface_pressure[i] ?? 1013.0) : 1013.0;

                    const seWindSpeed = Math.round(getW(4) * 100) / 100;
                    const eeWindSpeed = Math.round(getW(5) * 100) / 100;

                    weatherMap.set(tMs, {
                        windSpeed100m: Math.round(weightedWind * 100) / 100,
                        windMw,
                        tempC: weightedTemp,
                        solarRadWm2,
                        pressureHpa,
                        seWindSpeed,
                        eeWindSpeed
                    });
                }
            }
        }

        const schedule = pretrained ? pretrained.nuclearOutageSchedule : [];
        const sortedWeatherMs = Array.from(weatherMap.keys()).sort((a, b) => a - b);
        for (let i = 0; i < sortedWeatherMs.length; i++) {
            const ms = sortedWeatherMs[i];
            const w = weatherMap.get(ms);
            const hel = getHelsinkiComponents(new Date(ms));
            const nuc = getNuclearStatusForDate(hel.dateKey, schedule);
            w.nuclearMw = nuc.nuclearMw;
            w.nuclearDeficitMw = nuc.nuclearDeficitMw;
            w.solarMw = radiationToSolarMw(w.solarRadWm2, hel.month, hel.hour);

            let sumW24 = 0, cntW24 = 0;
            for (let j = Math.max(0, i - 23); j <= i; j++) {
                sumW24 += weatherMap.get(sortedWeatherMs[j]).windMw;
                cntW24++;
            }
            w.rolling24hWindMw = Math.round(sumW24 / Math.max(1, cntW24));
            const w6 = weatherMap.get(sortedWeatherMs[Math.max(0, i - 6)]).windMw;
            w.windRamp6hMw = w.windMw - w6;

            let sumT72 = 0, cntT72 = 0;
            for (let j = Math.max(0, i - 71); j <= i; j++) {
                sumT72 += weatherMap.get(sortedWeatherMs[j]).tempC;
                cntT72++;
            }
            w.rolling72hTempC = Math.round((sumT72 / Math.max(1, cntT72)) * 100) / 100;
        }

        const recentObs = [];
        const sortedSpotMs = Array.from(spotMap.keys()).sort((a, b) => a - b);
        for (const ms of sortedSpotMs) {
            if (weatherMap.has(ms)) {
                const w = weatherMap.get(ms);
                const hel = getHelsinkiComponents(new Date(ms));
                recentObs.push({
                    epochMs: ms,
                    hour: hel.hour,
                    month: hel.month,
                    isWeekend: hel.isWeekend,
                    isFreeDay: hel.isFreeDay,
                    priceInclVat: spotMap.get(ms),
                    ...w
                });
            }
        }

        const baseModel = (pretrained && pretrained.model) ? pretrained.model : {
            weights: [6.0, -5.0, 2.0, 12.0, 2.0, 3.0, 1.8, 2.2, -1.5, -1.2, 4.0, 2.0, 1.0, 1.5, 1.0, -0.5, 0.8, 1.5, 1.2, 0.8, -1.2, 0.9, 1.1, 2.5],
            weekdayHourAdj: new Array(24).fill(0),
            weekendHourAdj: new Array(24).fill(0),
            windTempGridAdj: {}
        };

        const activeModel = adaptModelOnline(baseModel, recentObs);

        const recentSpotValues = recentObs.slice(-24).map(o => o.priceInclVat);
        const prev24hMean = recentSpotValues.length > 0
            ? recentSpotValues.reduce((a, b) => a + b, 0) / recentSpotValues.length
            : 5.5;
        const prev24hStd = recentSpotValues.length > 1
            ? Math.sqrt(recentSpotValues.reduce((a, b) => a + Math.pow(b - prev24hMean, 2), 0) / recentSpotValues.length)
            : 2.0;
        const recent7dValues = recentObs.slice(-168).map(o => o.priceInclVat);
        const prev7dMean = recent7dValues.length > 0
            ? recent7dValues.reduce((a, b) => a + b, 0) / recent7dValues.length
            : prev24hMean;

        const last24ByHour = {};
        for (const o of recentObs.slice(-48)) {
            last24ByHour[o.hour] = o.priceInclVat;
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const startWindowMs = nowHourMs - (nowHourMs % (24 * 3600000)) - 24 * 3600000;
        const endWindowMs = startWindowMs + 8 * 24 * 3600000;

        const series = [];
        for (let t = startWindowMs; t < endWindowMs; t += 3600000) {
            const dObj = new Date(t);
            const hel = getHelsinkiComponents(dObj);
            const w = weatherMap.get(t) || {
                windSpeed100m: 6.5, windMw: 2450, tempC: 4.0, solarRadWm2: 0, solarMw: 0,
                pressureHpa: 1013, seWindSpeed: 6.5, eeWindSpeed: 6.5, nuclearMw: 4394, nuclearDeficitMw: 0
            };

            if (spotMap.has(t)) {
                const spotIncl = spotMap.get(t);
                series.push({
                    epochMs: t,
                    iso: dObj.toISOString(),
                    hel,
                    priceInclVat: spotIncl,
                    priceVat0: spotIncl / 1.255,
                    isForecast: false,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw: w.solarMw,
                    nuclearMw: w.nuclearMw,
                    seWindSpeed: w.seWindSpeed
                });
            } else {
                const hoursAhead = Math.max(1, (t - nowHourMs) / 3600000);
                const arDecay = Math.exp(-hoursAhead / 60.0);
                const obsCandidate = {
                    hour: hel.hour,
                    month: hel.month,
                    isWeekend: hel.isWeekend,
                    isFreeDay: hel.isFreeDay,
                    ...w,
                    prev24hMean: prev24hMean * arDecay + 5.2 * (1 - arDecay),
                    prev24hStd,
                    prev7dMean,
                    lag24hSameHour: (last24ByHour[hel.hour] ?? prev24hMean) * arDecay + 5.2 * (1 - arDecay)
                };
                const predIncl = Math.round(predictHourWithModel(obsCandidate, activeModel) * 100) / 100;
                const deltaWindMs = 0.70 + Math.min(1.60, (hoursAhead / 168.0) * 1.50);
                const deltaTempC = 0.60 + Math.min(1.80, (hoursAhead / 168.0) * 1.60);
                const windHighMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor((w.windSpeed100m || 6.5) + deltaWindMs));
                const windLowMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(Math.max(1.5, (w.windSpeed100m || 6.5) - deltaWindMs)));

                const estOpt = predictHourWithModel({
                    ...obsCandidate,
                    windMw: windHighMw,
                    rolling24hWindMw: Math.round((obsCandidate.rolling24hWindMw || w.windMw) * 0.4 + windHighMw * 0.6),
                    tempC: w.tempC + deltaTempC
                }, activeModel);
                const estPess = predictHourWithModel({
                    ...obsCandidate,
                    windMw: windLowMw,
                    rolling24hWindMw: Math.round((obsCandidate.rolling24hWindMw || w.windMw) * 0.4 + windLowMw * 0.6),
                    tempC: w.tempC - deltaTempC
                }, activeModel);

                const baseMargin = 0.55 + Math.min(1.65, (hoursAhead / 168.0) * 1.45);
                const rawMin = Math.min(predIncl - baseMargin * 0.85, estOpt - baseMargin * 0.45);
                const rawMax = Math.max(predIncl + baseMargin * 1.05, estPess + baseMargin * 0.55);

                series.push({
                    epochMs: t,
                    iso: dObj.toISOString(),
                    hel,
                    priceInclVat: predIncl,
                    priceVat0: predIncl / 1.255,
                    minInclVat: Math.max(0.0, Math.round(rawMin * 100) / 100),
                    maxInclVat: Math.round(Math.max(predIncl + 0.5, rawMax) * 100) / 100,
                    isForecast: true,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw: w.solarMw,
                    nuclearMw: w.nuclearMw,
                    seWindSpeed: w.seWindSpeed
                });
            }
        }

        res.status(200).json({
            status: 'ok',
            trainedObservations: (pretrained ? pretrained.totalObservations : 0) + activeModel.onlineSamples,
            featureCount: 24,
            learningCurve: pretrained ? pretrained.learningCurve : null,
            ablationStudy: pretrained ? pretrained.ablationStudy : null,
            walkForwardPeriods: pretrained ? pretrained.walkForwardPeriods : null,
            insights: pretrained ? pretrained.insights : null,
            series
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: String(err) });
    }
}
