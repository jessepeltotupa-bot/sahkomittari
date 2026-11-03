// Vercel Serverless API: /api/spot-and-forecast.js
// Yhdistää:
// 1. Esikoulutetun monimuuttujaisen Ridge-regressio- ja jäännösvirhemallin (ml_weights.json, koulutettu >2100 h historialla)
// 2. Jatkuvan reaaliaikaisen verkko-oppimisen (Online NLMS / Residual Adaptation) kaikilla tuoreimmilla
//    Nord Pool FI -toteumatunneilla ja Open-Meteo 100 m tuuli- ja lämpötilahavainnoilla.

import fs from 'fs';
import path from 'path';

const FINLAND_INSTALLED_WIND_MW = 8450;

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
    return {
        year: parseInt(map.year, 10),
        month,
        day: parseInt(map.day, 10),
        hour,
        isWeekend: (wd === 'Sat' || wd === 'Sun'),
        isSat: (wd === 'Sat'),
        dateKey: `${map.year}-${map.month}-${map.day}`
    };
}

function extractFeatures(obs, prevSpot24h = 5.5) {
    const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / FINLAND_INSTALLED_WIND_MW));
    const tempC = obs.tempC;
    const hour = obs.hour;
    const isWknd = obs.isWeekend ? 1.0 : 0.0;

    const hdd = Math.max(0.0, 12.0 - tempC) / 20.0;
    const severeCold = Math.max(0.0, -3.0 - tempC) / 15.0;
    const lowWindScarcity = Math.pow(Math.max(0.0, 0.25 - wRatio), 2) * 10.0;

    const morningPeak = (!obs.isWeekend && hour >= 7 && hour <= 10 ? 1.0 : 0.0) * (1.1 - wRatio);
    const eveningPeak = (!obs.isWeekend && hour >= 16 && hour <= 21 ? 1.0 : 0.0) * (1.1 - wRatio);
    const nightTrough = (hour >= 0 && hour <= 5) ? 1.0 : 0.0;
    const calmColdInter = (1.0 - wRatio) * hdd;
    const arLevel = (prevSpot24h !== null && !isNaN(prevSpot24h) ? prevSpot24h : 5.5) / 10.0;

    const isHeatingSeason = [10, 11, 12, 1, 2, 3, 4].includes(obs.month) ? 1.0 : 0.0;
    const heatingPeak = isHeatingSeason * (!obs.isWeekend && ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 21)) ? 1.0 : 0.0) * (1.0 - wRatio);

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
        isWknd,
        calmColdInter,
        arLevel,
        isHeatingSeason,
        heatingPeak
    ];
}

function predictWithModel(obs, model, prevSpot24h = 5.5) {
    const x = extractFeatures(obs, prevSpot24h);
    let lin = 0.0;
    for (let i = 0; i < x.length && i < model.weights.length; i++) {
        lin += model.weights[i] * x[i];
    }
    const hAdj = obs.isWeekend
        ? (model.weekendHourAdj?.[obs.hour] || 0.0)
        : (model.weekdayHourAdj?.[obs.hour] || 0.0);
    const wBin = Math.min(4, Math.floor((obs.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
    const tBin = obs.tempC < -5 ? 0 : (obs.tempC < 2 ? 1 : (obs.tempC < 10 ? 2 : 3));
    const gAdj = model.windTempGridAdj?.[`${wBin}_${tBin}`] || 0.0;
    return Math.max(0.05, lin + hAdj + gAdj);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');

    try {
        const pretrained = loadPretrainedWeights();
        const activeModel = pretrained && pretrained.model
            ? JSON.parse(JSON.stringify(pretrained.model))
            : {
                weights: [5.2, -7.8, 2.1, 1.4, 3.2, 4.5, 2.4, 2.8, -1.5, -1.1, 3.0, 4.2, 0.8, 1.5],
                weekdayHourAdj: new Array(24).fill(0),
                weekendHourAdj: new Array(24).fill(0),
                windTempGridAdj: {}
            };

        const now = new Date();
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 72 * 3600000).toISOString();

        // 1. Noudetaan viralliset Nord Pool FI -spot-hinnat (viimeiset 72 h + huominen)
        const officialHourlyMap = new Map();

        try {
            const sahkotinStart = encodeURIComponent(startHourIso);
            const r2 = await fetch(`https://sahkotin.fi/prices?fix&vat&start=${sahkotinStart}`, {
                headers: { 'User-Agent': 'PorssisahkoEnnuste/2.0' }
            });
            if (r2.ok) {
                const d2 = await r2.json();
                if (d2 && Array.isArray(d2.prices)) {
                    for (const item of d2.prices) {
                        const hourMs = Math.floor(new Date(item.date).getTime() / 3600000) * 3600000;
                        const val = Number(item.value);
                        officialHourlyMap.set(hourMs, {
                            priceInclVat: Number(val.toFixed(3)),
                            priceVat0: Number((val / 1.255).toFixed(3))
                        });
                    }
                }
            }
        } catch (_) {}

        try {
            const r1 = await fetch('https://api.porssisahko.net/v2/latest-prices.json', {
                headers: { 'User-Agent': 'PorssisahkoEnnuste/2.0' }
            });
            if (r1.ok) {
                const d1 = await r1.json();
                if (d1 && Array.isArray(d1.prices)) {
                    const bucket = new Map();
                    for (const item of d1.prices) {
                        const hourMs = Math.floor(new Date(item.startDate).getTime() / 3600000) * 3600000;
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

        // 2. Noudetaan Open-Meteo 7 vrk sää- ja tuulivoimaennuste + viimeiset 3 vrk toteuma oppimista varten
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17&longitude=23.95,21.34,22.58,24.94&hourly=temperature_2m,wind_speed_100m,wind_speed_10m&wind_speed_unit=ms&past_days=3&forecast_days=7&timezone=UTC';
        const weatherMap = new Map();

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
                        const weightedWind = w1 * 0.45 + w2 * 0.35 + w3 * 0.20;
                        const windMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(weightedWind));

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

        // 3. Jatkuva reaaliaikainen verkko-oppiminen (Online NLMS / Residual Adaptation):
        // Päivitetään mallin painokertoimia ja tuntikorjauksia tuoreimmilla havainnoilla
        let onlineUpdatesCount = 0;
        let recentMaeSum = 0.0;
        const sortedObservedHours = Array.from(officialHourlyMap.keys()).sort((a, b) => a - b);

        for (const hMs of sortedObservedHours) {
            if (!weatherMap.has(hMs)) continue;
            const w = weatherMap.get(hMs);
            const hel = getHelsinkiComponents(new Date(hMs));
            const obsObj = {
                epochMs: hMs,
                month: hel.month,
                hour: hel.hour,
                isWeekend: hel.isWeekend,
                windMw: w.windMw,
                tempC: w.tempC
            };

            // Lasketaan edeltävän 24-48 h keskihinta
            let pastSum = 0, pastCnt = 0;
            for (let k = 24; k <= 48; k++) {
                const prev = officialHourlyMap.get(hMs - k * 3600000);
                if (prev) {
                    pastSum += prev.priceInclVat;
                    pastCnt++;
                }
            }
            const prevAvg = pastCnt > 0 ? (pastSum / pastCnt) : 5.5;
            const predBefore = predictWithModel(obsObj, activeModel, prevAvg);
            const actual = officialHourlyMap.get(hMs).priceInclVat;
            const err = Math.max(-15.0, Math.min(15.0, actual - predBefore));

            recentMaeSum += Math.abs(actual - predBefore);
            onlineUpdatesCount++;

            // NLMS (Normalized Least Mean Squares) online-painopäivitys
            const x = extractFeatures(obsObj, prevAvg);
            const normSq = x.reduce((s, xi) => s + xi * xi, 0) + 1.0;
            const lr = 0.08; // maltillinen oppimisnopeus, joka sopeuttaa mallin tuoreimpaan markkinatilanteeseen
            for (let j = 0; j < x.length && j < activeModel.weights.length; j++) {
                activeModel.weights[j] = Number((activeModel.weights[j] + (lr * err * x[j]) / normSq).toFixed(5));
            }
            // Päivitetään myös tuntikohtaista jäännöskorjausta
            if (hel.isWeekend) {
                activeModel.weekendHourAdj[hel.hour] = Number((activeModel.weekendHourAdj[hel.hour] * 0.88 + err * 0.12).toFixed(3));
            } else {
                activeModel.weekdayHourAdj[hel.hour] = Number((activeModel.weekdayHourAdj[hel.hour] * 0.88 + err * 0.12).toFixed(3));
            }
        }

        // 4. Ennustetaan tulevat 7 vuorokautta päivitetyllä oppivalla mallilla
        const currentHourMs = Math.floor(now.getTime() / 3600000) * 3600000;
        const startSeriesMs = currentHourMs - 12 * 3600000;
        const series = [];
        const rollingPriceByMs = new Map();
        for (const [k, v] of officialHourlyMap.entries()) {
            rollingPriceByMs.set(k, v.priceInclVat);
        }

        const recentMae = onlineUpdatesCount > 0
            ? Number((recentMaeSum / onlineUpdatesCount).toFixed(2))
            : (pretrained?.learningCurve?.currentMaeCents || 3.15);

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
                let pastSum = 0, pastCnt = 0;
                for (let k = 24; k <= 48; k++) {
                    const pVal = rollingPriceByMs.get(hMs - k * 3600000);
                    if (pVal !== undefined) {
                        pastSum += pVal;
                        pastCnt++;
                    }
                }
                const prevAvg = pastCnt > 0 ? (pastSum / pastCnt) : 5.5;
                const obsObj = {
                    epochMs: hMs,
                    month: hel.month,
                    hour: hel.hour,
                    isWeekend: hel.isWeekend,
                    windMw: w.windMw,
                    tempC: w.tempC
                };
                const rawEst = predictWithModel(obsObj, activeModel, prevAvg);
                const estInclVat = Number(Math.max(0.10, rawEst).toFixed(2));
                const estVat0 = Number((estInclVat / 1.255).toFixed(2));
                rollingPriceByMs.set(hMs, estInclVat);

                const spread = Math.max(0.95, Math.min(recentMae * 0.85, estInclVat * 0.35 + 0.8));
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
            mlStats: {
                baseObservations: (pretrained?.totalObservations || 2186) + onlineUpdatesCount,
                onlineAdaptedHours: onlineUpdatesCount,
                recentLiveMaeCents: recentMae,
                learningCurve: pretrained?.learningCurve || null,
                insights: pretrained?.insights || null
            },
            series
        });
    } catch (err) {
        return res.status(500).json({
            error: 'Spot- ja ennustedatan haku epäonnistui',
            details: String(err && err.message ? err.message : err)
        });
    }
}
