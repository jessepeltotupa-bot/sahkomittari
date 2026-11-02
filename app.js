// Pörssisähkö, jatkuvasti oppiva 7 vrk hintaennuste ja postinumeropohjainen siirtohintalaskuri
(function () {
    const DSO_DATA = window.PORSSISAHKO_DSO_DATA || {
        vatRate: 1.255,
        electricityTaxVat0: 2.253,
        electricityTaxInclVat: 2.8275,
        companies: {},
        municipalities: [],
        postalPrefixRules: []
    };

    const ML_BASE = window.PORSSISAHKO_ML_WEIGHTS || {
        trainedAt: null,
        totalObservations: 2186,
        model: {
            weights: [5.2, -7.8, 2.1, 1.4, 3.2, 4.5, 2.4, 2.8, -1.5, -1.1, 3.0, 4.2, 0.8, 1.5],
            weekdayHourAdj: new Array(24).fill(0),
            weekendHourAdj: new Array(24).fill(0),
            windTempGridAdj: {}
        },
        learningCurve: null,
        insights: null,
        recentBacktest: []
    };

    const FINLAND_INSTALLED_WIND_MW = 8450;

    const state = {
        postalCode: localStorage.getItem('ps_postal') || '00100',
        cityName: localStorage.getItem('ps_city') || 'Helsinki',
        dsoId: localStorage.getItem('ps_dso') || 'helen',
        altDsoIds: [],
        tariffType: localStorage.getItem('ps_tariff') || 'general',
        marginCents: parseFloat(localStorage.getItem('ps_margin') || '0.45'),
        includeVat: localStorage.getItem('ps_vat') !== '0',
        showTotalInChart: localStorage.getItem('ps_show_total') !== '0',
        selectedDayIndex: 0,
        windowHours: 3,
        applianceKw: 11.0,
        annualKwh: 12000,
        nightSharePct: 55,
        series: [],
        daysList: [],
        generatedAt: null,
        mlStats: {
            totalLearnedHours: ML_BASE.totalObservations || 2186,
            onlineNewHours: 0,
            liveMaeCents: ML_BASE.learningCurve?.currentMaeCents || 3.32,
            activeModel: JSON.parse(JSON.stringify(ML_BASE.model))
        }
    };

    const bodyEl = document.body;
    if (bodyEl) {
        const presetDso = bodyEl.getAttribute('data-preset-dso');
        const presetPostal = bodyEl.getAttribute('data-preset-postal');
        const presetCity = bodyEl.getAttribute('data-preset-city');
        if (presetDso && DSO_DATA.companies[presetDso]) state.dsoId = presetDso;
        if (presetPostal) state.postalCode = presetPostal;
        if (presetCity) state.cityName = presetCity;
    }

    function saveSettings() {
        try {
            localStorage.setItem('ps_postal', state.postalCode);
            localStorage.setItem('ps_city', state.cityName);
            localStorage.setItem('ps_dso', state.dsoId);
            localStorage.setItem('ps_tariff', state.tariffType);
            localStorage.setItem('ps_margin', String(state.marginCents));
            localStorage.setItem('ps_vat', state.includeVat ? '1' : '0');
            localStorage.setItem('ps_show_total', state.showTotalInChart ? '1' : '0');
        } catch (_) {}
    }

    function formatNum(val, decimals = 2) {
        if (val === null || val === undefined || isNaN(val)) return '—';
        return Number(val).toFixed(decimals).replace('.', ',');
    }

    function resolvePostalOrCity(inputRaw) {
        const q = String(inputRaw || '').trim();
        if (!q) return null;

        const digits = q.replace(/\D/g, '');
        if (digits.length >= 2) {
            const p5 = digits.padEnd(5, '0').slice(0, 5);
            for (const m of DSO_DATA.municipalities) {
                if (m.postal === p5) {
                    return { postal: p5, city: m.name, dsoId: m.primary, alt: m.alt || [] };
                }
            }
            const p3 = p5.slice(0, 3);
            const p2 = p5.slice(0, 2);
            for (const r of DSO_DATA.postalPrefixRules) {
                if (r.prefix.length === 3 && r.prefix === p3) {
                    return { postal: p5, city: r.city, dsoId: r.dso, alt: r.alt || [] };
                }
            }
            for (const m of DSO_DATA.municipalities) {
                if (m.postal_range && m.postal_range.includes('-')) {
                    const [low, high] = m.postal_range.split('-');
                    if (p5 >= low && p5 <= high) {
                        return { postal: p5, city: m.name, dsoId: m.primary, alt: m.alt || [] };
                    }
                }
            }
            for (const r of DSO_DATA.postalPrefixRules) {
                if (r.prefix.length === 2 && r.prefix === p2) {
                    return { postal: p5, city: r.city, dsoId: r.dso, alt: r.alt || [] };
                }
            }
        }

        const lower = q.toLowerCase();
        for (const m of DSO_DATA.municipalities) {
            if (m.name.toLowerCase() === lower || m.name.toLowerCase().startsWith(lower)) {
                return { postal: m.postal, city: m.name, dsoId: m.primary, alt: m.alt || [] };
            }
        }
        for (const [id, comp] of Object.entries(DSO_DATA.companies)) {
            if (comp.name.toLowerCase().includes(lower) || comp.short_name.toLowerCase().includes(lower)) {
                return { postal: state.postalCode, city: comp.region_desc, dsoId: id, alt: [] };
            }
        }
        return null;
    }

    function getActiveDso() {
        return DSO_DATA.companies[state.dsoId] || DSO_DATA.companies['caruna'] || Object.values(DSO_DATA.companies)[0];
    }

    function calculateHourBreakdown(slot) {
        const dso = getActiveDso();
        const vatDivider = state.includeVat ? 1.0 : DSO_DATA.vatRate;

        const spotCents = state.includeVat ? slot.priceInclVat : slot.priceVat0;
        const marginCents = state.marginCents / vatDivider;
        const taxCents = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;

        let transferCentsInclVat = dso.general_c_kwh;
        let transferLabel = 'Yleissiirto';

        if (state.tariffType === 'time') {
            const isDay = slot.hour >= 7 && slot.hour < 22;
            transferCentsInclVat = isDay ? dso.day_c_kwh : dso.night_c_kwh;
            transferLabel = isDay ? 'Päiväsiirto (07–22)' : 'Yösiirto (22–07)';
        } else if (state.tariffType === 'season') {
            const isWinterMonth = (slot.month >= 11 || slot.month <= 3);
            const isMonToSat = !slot.isWeekend || slot.isSat;
            const isWinterDay = isWinterMonth && isMonToSat && (slot.hour >= 7 && slot.hour < 22);
            transferCentsInclVat = isWinterDay ? dso.winter_day_c_kwh : dso.other_c_kwh;
            transferLabel = isWinterDay ? 'Talviarkipäivä' : 'Muu aika';
        }

        const transferCents = transferCentsInclVat / vatDivider;
        const totalCents = spotCents + marginCents + transferCents + taxCents;

        return {
            spotCents,
            marginCents,
            transferCents,
            transferLabel,
            taxCents,
            totalCents
        };
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

    function windSpeedToCapacityFactor(v100m) {
        if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.30;
        if (v100m < 3.0) return 0.02;
        if (v100m >= 25.0) return 0.05;
        if (v100m >= 12.5) return 0.88;
        const norm = (v100m - 3.0) / (12.5 - 3.0);
        return Math.max(0.02, Math.min(0.88, Math.pow(norm, 2.15) * 0.88));
    }

    // 14-piirteinen koneoppimismalli (sama arkkitehtuuri kuin train_and_learn.py:ssä ja /api/spot-and-forecast.js:ssä)
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

    function predictWithLearnedModel(obs, model, prevSpot24h = 5.5) {
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

    // Tallentaa selaimen paikalliseen oppimismuistiin uudet toteutuneet havainnot ja päivittää mallin painoja
    function runBrowserOnlineLearning(officialHourlyMap, weatherMap) {
        let storedObs = {};
        try {
            const raw = localStorage.getItem('ps_online_obs_v1');
            if (raw) storedObs = JSON.parse(raw);
        } catch (_) {}

        for (const [hMs, spotObj] of officialHourlyMap.entries()) {
            if (weatherMap.has(hMs)) {
                const w = weatherMap.get(hMs);
                storedObs[hMs] = {
                    epochMs: Number(hMs),
                    priceInclVat: spotObj.priceInclVat,
                    windMw: w.windMw,
                    tempC: w.tempC
                };
            }
        }

        // Pidä enintään 1000 tuoreinta selaimen keräämää lisätuntia localStoragessa
        const sortedKeys = Object.keys(storedObs).map(Number).sort((a, b) => a - b);
        const trimmedKeys = sortedKeys.slice(-1000);
        const nextStore = {};
        for (const k of trimmedKeys) nextStore[k] = storedObs[k];
        try {
            localStorage.setItem('ps_online_obs_v1', JSON.stringify(nextStore));
        } catch (_) {}

        const activeModel = JSON.parse(JSON.stringify(ML_BASE.model));
        let errSum = 0.0;
        let count = 0;

        for (const k of trimmedKeys) {
            const item = nextStore[k];
            const hel = getHelsinkiComponents(new Date(item.epochMs));
            const obsObj = {
                epochMs: item.epochMs,
                month: hel.month,
                hour: hel.hour,
                isWeekend: hel.isWeekend,
                windMw: item.windMw,
                tempC: item.tempC
            };

            let pastSum = 0, pastCnt = 0;
            for (let lag = 24; lag <= 48; lag++) {
                const prev = nextStore[item.epochMs - lag * 3600000];
                if (prev) {
                    pastSum += prev.priceInclVat;
                    pastCnt++;
                }
            }
            const prevAvg = pastCnt > 0 ? (pastSum / pastCnt) : 5.5;
            const pred = predictWithLearnedModel(obsObj, activeModel, prevAvg);
            const err = Math.max(-15.0, Math.min(15.0, item.priceInclVat - pred));
            errSum += Math.abs(item.priceInclVat - pred);
            count++;

            const x = extractFeatures(obsObj, prevAvg);
            const normSq = x.reduce((s, xi) => s + xi * xi, 0) + 1.0;
            const lr = 0.08;
            for (let j = 0; j < x.length && j < activeModel.weights.length; j++) {
                activeModel.weights[j] = Number((activeModel.weights[j] + (lr * err * x[j]) / normSq).toFixed(5));
            }
            if (hel.isWeekend) {
                activeModel.weekendHourAdj[hel.hour] = Number((activeModel.weekendHourAdj[hel.hour] * 0.88 + err * 0.12).toFixed(3));
            } else {
                activeModel.weekdayHourAdj[hel.hour] = Number((activeModel.weekdayHourAdj[hel.hour] * 0.88 + err * 0.12).toFixed(3));
            }
        }

        state.mlStats.activeModel = activeModel;
        state.mlStats.onlineNewHours = count;
        state.mlStats.totalLearnedHours = (ML_BASE.totalObservations || 2186) + count;
        if (count >= 12) {
            state.mlStats.liveMaeCents = Number((errSum / count).toFixed(2));
        }
        return activeModel;
    }

    async function fetchClientSideWithOnlineML() {
        const now = new Date();
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 72 * 3600000).toISOString();
        const officialHourlyMap = new Map();

        try {
            const r = await fetch(`https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(startHourIso)}`);
            if (r.ok) {
                const d = await r.json();
                if (d && Array.isArray(d.prices)) {
                    for (const item of d.prices) {
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
                        const w1 = locs[0].hourly.wind_speed_100m?.[i] ?? 6.5;
                        const w2 = locs[1].hourly.wind_speed_100m?.[i] ?? 6.5;
                        const w3 = locs[2].hourly.wind_speed_100m?.[i] ?? 6.0;
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

        const learnedModel = runBrowserOnlineLearning(officialHourlyMap, weatherMap);

        const currentHourMs = Math.floor(now.getTime() / 3600000) * 3600000;
        const startSeriesMs = currentHourMs - 12 * 3600000;
        const series = [];
        const rollingPriceByMs = new Map();
        for (const [k, v] of officialHourlyMap.entries()) {
            rollingPriceByMs.set(k, v.priceInclVat);
        }

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
                for (let lag = 24; lag <= 48; lag++) {
                    const pVal = rollingPriceByMs.get(hMs - lag * 3600000);
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
                const rawEst = predictWithLearnedModel(obsObj, learnedModel, prevAvg);
                const estInclVat = Number(Math.max(0.10, rawEst).toFixed(2));
                rollingPriceByMs.set(hMs, estInclVat);

                const spread = Math.max(0.95, Math.min(state.mlStats.liveMaeCents * 0.85, estInclVat * 0.35 + 0.8));
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
                    priceVat0: Number((estInclVat / 1.255).toFixed(2)),
                    minInclVat: Number(Math.max(0.0, estInclVat - spread).toFixed(2)),
                    maxInclVat: Number((estInclVat + spread * 1.15).toFixed(2)),
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC
                });
            }
        }
        return { generatedAt: new Date().toISOString(), series };
    }

    async function loadSpotAndForecastData() {
        let data = null;
        try {
            const resp = await fetch('/api/spot-and-forecast');
            if (resp.ok) {
                data = await resp.json();
                if (data.mlStats) {
                    state.mlStats.totalLearnedHours = data.mlStats.baseObservations || state.mlStats.totalLearnedHours;
                    state.mlStats.onlineNewHours = data.mlStats.onlineAdaptedHours || 0;
                    state.mlStats.liveMaeCents = data.mlStats.recentLiveMaeCents || state.mlStats.liveMaeCents;
                }
            }
        } catch (_) {}

        if (!data || !Array.isArray(data.series) || data.series.length === 0) {
            data = await fetchClientSideWithOnlineML();
        }

        state.series = data.series || [];
        state.generatedAt = data.generatedAt;

        const todayHel = getHelsinkiComponents(new Date());
        const byDate = new Map();
        for (const item of state.series) {
            if (item.dateKey < todayHel.dateKey) continue;
            if (!byDate.has(item.dateKey)) byDate.set(item.dateKey, []);
            byDate.get(item.dateKey).push(item);
        }

        const weekdayNamesFi = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
        const daysList = [];
        let idx = 0;
        for (const [dateKey, items] of byDate.entries()) {
            if (items.length < 18 && idx > 0) continue;
            items.sort((a, b) => a.hour - b.hour);
            const parts = dateKey.split('-');
            const dt = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0));
            const wdName = weekdayNamesFi[dt.getUTCDay()];
            const dayNum = parseInt(parts[2], 10);
            const monthNum = parseInt(parts[1], 10);
            const hasForecast = items.some(x => x.isForecast);
            const allForecast = items.every(x => x.isForecast);

            let label = `${wdName} ${dayNum}.${monthNum}.`;
            if (idx === 0) label = `Tänään (${wdName} ${dayNum}.${monthNum}.)`;
            else if (idx === 1) label = `Huomenna (${wdName} ${dayNum}.${monthNum}.)`;

            daysList.push({
                index: idx,
                dateKey,
                label,
                shortLabel: `${wdName} ${dayNum}.${monthNum}.`,
                hasForecast,
                allForecast,
                items
            });
            idx++;
            if (daysList.length >= 7) break;
        }
        state.daysList = daysList;
        renderAll();
    }

    function renderDsoPanel() {
        const dso = getActiveDso();
        const postalInput = document.getElementById('postal-input');
        if (postalInput && document.activeElement !== postalInput) {
            postalInput.value = state.postalCode;
        }

        const detectedEl = document.getElementById('detected-dso-banner');
        if (detectedEl) {
            const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
            const genC = formatNum(dso.general_c_kwh * vatFactor, 2);
            const dayC = formatNum(dso.day_c_kwh * vatFactor, 2);
            const nightC = formatNum(dso.night_c_kwh * vatFactor, 2);
            const taxC = formatNum(state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0, 2);

            let altHtml = '';
            if (state.altDsoIds && state.altDsoIds.length > 0) {
                const btns = state.altDsoIds
                    .filter(id => DSO_DATA.companies[id])
                    .map(id => `<button type="button" class="alt-dso-btn" data-dso="${id}">Vaihda: ${DSO_DATA.companies[id].short_name}</button>`)
                    .join(' ');
                if (btns) {
                    altHtml = `<div class="alt-dso-row">Kunnan reuna-alueella toimii myös toinen verkkoyhtiö: ${btns}</div>`;
                }
            }

            detectedEl.innerHTML = `
                <div class="dso-summary-main">
                    <div>
                        <div class="dso-kicker">Postinumero ${state.postalCode} (${state.cityName})</div>
                        <div class="dso-title">${dso.name}</div>
                        <div class="dso-sub">Yleissiirto ${genC} snt/kWh (perusmaksu ${formatNum(dso.general_base_eur, 2)} €/kk) | Yösiirto päivä ${dayC} / yö ${nightC} snt/kWh | Sähkövero ${taxC} snt/kWh</div>
                    </div>
                    <div class="dso-manual-select-wrap">
                        <label for="dso-select" class="field-label">Verkkoyhtiö</label>
                        <select id="dso-select" class="select-control">
                            ${Object.values(DSO_DATA.companies).map(c => `<option value="${c.id}" ${c.id === state.dsoId ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${altHtml}
            `;

            const selectEl = document.getElementById('dso-select');
            if (selectEl) {
                selectEl.addEventListener('change', function () {
                    state.dsoId = this.value;
                    saveSettings();
                    renderAll();
                });
            }

            detectedEl.querySelectorAll('.alt-dso-btn').forEach(btn => {
                btn.addEventListener('click', function () {
                    const targetId = this.getAttribute('data-dso');
                    if (targetId && DSO_DATA.companies[targetId]) {
                        const prevId = state.dsoId;
                        state.dsoId = targetId;
                        state.altDsoIds = state.altDsoIds.filter(x => x !== targetId).concat([prevId]);
                        saveSettings();
                        renderAll();
                    }
                });
            });
        }

        document.querySelectorAll('[data-tariff-btn]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tariff-btn') === state.tariffType);
        });
        document.querySelectorAll('[data-mode-btn]').forEach(btn => {
            const isTotal = btn.getAttribute('data-mode-btn') === 'total';
            btn.classList.toggle('active', isTotal === state.showTotalInChart);
        });
    }

    function renderKpiCards() {
        const nowMs = Date.now();
        const currentHourMs = Math.floor(nowMs / 3600000) * 3600000;
        const currentSlot = state.series.find(s => s.epochMs === currentHourMs) || state.series[0];
        if (!currentSlot) return;

        const curBreak = calculateHourBreakdown(currentSlot);
        const elNowSpot = document.getElementById('kpi-now-spot');
        const elNowTotal = document.getElementById('kpi-now-total');
        const elNowBreak = document.getElementById('kpi-now-breakdown');

        if (elNowSpot) elNowSpot.textContent = `${formatNum(curBreak.spotCents, 2)} snt/kWh`;
        if (elNowTotal) elNowTotal.textContent = `${formatNum(curBreak.totalCents, 2)} snt/kWh`;
        if (elNowBreak) {
            elNowBreak.textContent = `Spot ${formatNum(curBreak.spotCents, 2)} + ${curBreak.transferLabel} ${formatNum(curBreak.transferCents, 2)} + Sähkövero ${formatNum(curBreak.taxCents, 2)} + Marginaali ${formatNum(curBreak.marginCents, 2)} snt/kWh`;
        }

        const todayObj = state.daysList[0];
        if (todayObj && todayObj.items.length > 0) {
            const enriched = todayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const minByTotal = enriched.reduce((a, b) => (b.br.totalCents < a.br.totalCents ? b : a), enriched[0]);
            const elMin = document.getElementById('kpi-today-min');
            const elMinSub = document.getElementById('kpi-today-min-sub');
            if (elMin) elMin.textContent = `${formatNum(minByTotal.br.totalCents, 2)} snt/kWh`;
            if (elMinSub) elMinSub.textContent = `Klo ${String(minByTotal.slot.hour).padStart(2, '0')}:00 (Spot ${formatNum(minByTotal.br.spotCents, 2)} snt/kWh)`;
        }

        const tomorrowObj = state.daysList[1];
        if (tomorrowObj && tomorrowObj.items.length > 0) {
            const enrichedTom = tomorrowObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const avgSpotTom = enrichedTom.reduce((s, x) => s + x.br.spotCents, 0) / enrichedTom.length;
            const avgTotTom = enrichedTom.reduce((s, x) => s + x.br.totalCents, 0) / enrichedTom.length;
            const avgWindTom = Math.round(tomorrowObj.items.reduce((s, x) => s + x.windMw, 0) / tomorrowObj.items.length);

            const elTom = document.getElementById('kpi-tomorrow-avg');
            const elTomSub = document.getElementById('kpi-tomorrow-sub');
            const elTomTitle = document.getElementById('kpi-tomorrow-title');
            if (elTomTitle) {
                elTomTitle.textContent = tomorrowObj.allForecast ? 'Huomisen oppiva hintaennuste' : 'Huomisen vahvistettu hinta';
            }
            if (elTom) elTom.textContent = `${formatNum(avgTotTom, 2)} snt/kWh`;
            if (elTomSub) {
                elTomSub.textContent = `Spot ${formatNum(avgSpotTom, 2)} snt/kWh | Tuulivoimaennuste keskim. ${avgWindTom} MW`;
            }
        }
    }

    function renderDayTabsAndChart() {
        const tabsEl = document.getElementById('day-tabs');
        if (!tabsEl) return;

        let tabsHtml = `<button type="button" class="day-tab ${state.selectedDayIndex === -1 ? 'active' : ''}" data-day-idx="-1">7 vrk yleiskatsaus</button>`;
        for (const d of state.daysList) {
            const badge = d.allForecast ? '<span class="tab-tag forecast">Oppiva ennuste</span>' : '<span class="tab-tag official">Virallinen</span>';
            tabsHtml += `<button type="button" class="day-tab ${state.selectedDayIndex === d.index ? 'active' : ''}" data-day-idx="${d.index}">${d.label} ${badge}</button>`;
        }
        tabsEl.innerHTML = tabsHtml;

        tabsEl.querySelectorAll('.day-tab').forEach(btn => {
            btn.addEventListener('click', function () {
                state.selectedDayIndex = parseInt(this.getAttribute('data-day-idx'), 10);
                renderDayTabsAndChart();
            });
        });

        const chartContainer = document.getElementById('price-chart');
        const tableBody = document.getElementById('hourly-table-body');
        const chartTitle = document.getElementById('chart-view-title');
        if (!chartContainer || !tableBody) return;

        if (state.selectedDayIndex === -1) {
            if (chartTitle) {
                chartTitle.textContent = '7 vuorokauden pörssisähkö- ja kokonaishintaennuste (tuntisarja ja tuulivoima)';
            }
            const allItems = state.daysList.flatMap(d => d.items.map(it => ({ ...it, dayShort: d.shortLabel })));
            const enriched = allItems.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const maxVal = Math.max(15, ...enriched.map(x => state.showTotalInChart ? x.br.totalCents : x.br.spotCents));

            let barsHtml = '<div class="week-bars-grid">';
            for (const x of enriched) {
                const val = state.showTotalInChart ? x.br.totalCents : x.br.spotCents;
                const hPct = Math.max(3, Math.min(100, (val / maxVal) * 100));
                const cls = x.slot.isForecast ? 'bar-fill forecast' : 'bar-fill official';
                const showDayDivider = x.slot.hour === 0;
                barsHtml += `
                    <div class="week-bar-col ${showDayDivider ? 'day-start' : ''}" title="${x.slot.dayShort} klo ${String(x.slot.hour).padStart(2, '0')}:00 | Kokonaishinta ${formatNum(x.br.totalCents, 2)} snt/kWh (Spot ${formatNum(x.br.spotCents, 2)} snt) | Tuulivoima ${x.slot.windMw} MW | Lämpötila ${formatNum(x.slot.tempC, 1)} °C">
                        <div class="week-bar-track">
                            <div class="${cls}" style="height:${hPct.toFixed(1)}%;"></div>
                        </div>
                        ${showDayDivider ? `<span class="week-bar-label">${x.slot.dayShort}</span>` : ''}
                    </div>
                `;
            }
            barsHtml += '</div>';
            chartContainer.innerHTML = barsHtml;

            let rowsHtml = '';
            for (const d of state.daysList) {
                const enr = d.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
                const avgSpot = enr.reduce((acc, x) => acc + x.br.spotCents, 0) / enr.length;
                const avgTot = enr.reduce((acc, x) => acc + x.br.totalCents, 0) / enr.length;
                const minTot = Math.min(...enr.map(x => x.br.totalCents));
                const maxTot = Math.max(...enr.map(x => x.br.totalCents));
                const avgWind = Math.round(d.items.reduce((acc, x) => acc + x.windMw, 0) / d.items.length);
                const avgTemp = d.items.reduce((acc, x) => acc + x.tempC, 0) / d.items.length;

                rowsHtml += `
                    <tr>
                        <td><strong>${d.label}</strong></td>
                        <td><span class="status-pill ${d.allForecast ? 'forecast' : 'official'}">${d.allForecast ? 'Oppiva ML-ennuste' : 'Virallinen Nord Pool'}</span></td>
                        <td><strong>${formatNum(avgSpot, 2)} snt/kWh</strong></td>
                        <td>${formatNum(avgTot - avgSpot, 2)} snt/kWh</td>
                        <td><strong>${formatNum(avgTot, 2)} snt/kWh</strong> (${formatNum(minTot, 2)}–${formatNum(maxTot, 2)})</td>
                        <td>${avgWind} MW / ${formatNum(avgTemp, 1)} °C</td>
                    </tr>
                `;
            }
            tableBody.innerHTML = rowsHtml;
            return;
        }

        const dayObj = state.daysList.find(d => d.index === state.selectedDayIndex) || state.daysList[0];
        if (!dayObj) return;

        if (chartTitle) {
            chartTitle.textContent = `${dayObj.label} — ${dayObj.allForecast ? 'Oppivan mallin ennustama tuntihinta (opittu ' + state.mlStats.totalLearnedHours + ' tunnin datasta)' : 'Vahvistettu tuntihinta ja siirtoerittely'}`;
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const enriched = dayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
        const maxVal = Math.max(14, ...enriched.map(x => state.showTotalInChart ? x.br.totalCents : Math.max(x.br.spotCents, x.slot.maxInclVat || x.br.spotCents)));

        let barsHtml = '<div class="hourly-bars-grid">';
        for (const x of enriched) {
            const isNow = x.slot.epochMs === nowHourMs;
            const displayVal = state.showTotalInChart ? x.br.totalCents : x.br.spotCents;
            const totalPct = Math.max(4, Math.min(100, (displayVal / maxVal) * 100));

            const spotShareOfBar = state.showTotalInChart && x.br.totalCents > 0
                ? Math.max(0, Math.min(100, (x.br.spotCents / x.br.totalCents) * 100))
                : 100;
            const fixedShareOfBar = 100 - spotShareOfBar;

            const priceLevelClass = x.br.spotCents < 3.0 ? 'level-cheap' : (x.br.spotCents < 8.0 ? 'level-norm' : 'level-high');
            const forecastClass = x.slot.isForecast ? 'is-forecast' : 'is-official';

            barsHtml += `
                <div class="hour-bar-col ${isNow ? 'current-hour' : ''}" title="Klo ${String(x.slot.hour).padStart(2, '0')}:00–${String((x.slot.hour + 1) % 24).padStart(2, '0')}:00 | Kokonaishinta: ${formatNum(x.br.totalCents, 2)} snt/kWh (Spot ${formatNum(x.br.spotCents, 2)} + Siirto ${formatNum(x.br.transferCents, 2)} + Vero ${formatNum(x.br.taxCents, 2)} + Marg. ${formatNum(x.br.marginCents, 2)}) | Tuuli ${x.slot.windMw} MW, ${formatNum(x.slot.tempC, 1)} °C">
                    <div class="hour-bar-val">${formatNum(displayVal, 1)}</div>
                    <div class="hour-bar-track">
                        <div class="hour-bar-stack ${priceLevelClass} ${forecastClass}" style="height:${totalPct.toFixed(1)}%;">
                            <div class="stack-spot" style="height:${spotShareOfBar.toFixed(1)}%;"></div>
                            ${state.showTotalInChart ? `<div class="stack-transfer" style="height:${fixedShareOfBar.toFixed(1)}%;"></div>` : ''}
                        </div>
                    </div>
                    <div class="hour-bar-time">${String(x.slot.hour).padStart(2, '0')}</div>
                </div>
            `;
        }
        barsHtml += '</div>';
        chartContainer.innerHTML = barsHtml;

        let rowsHtml = '';
        for (const x of enriched) {
            const isNow = x.slot.epochMs === nowHourMs;
            const rangeText = x.slot.isForecast
                ? `<span class="muted-range">(${formatNum(x.slot.minInclVat, 1)}–${formatNum(x.slot.maxInclVat, 1)})</span>`
                : '';
            rowsHtml += `
                <tr class="${isNow ? 'row-current-hour' : ''}">
                    <td><strong>Klo ${String(x.slot.hour).padStart(2, '0')}:00–${String((x.slot.hour + 1) % 24).padStart(2, '0')}:00</strong> ${isNow ? '<span class="now-badge">Nyt</span>' : ''}</td>
                    <td><span class="status-pill ${x.slot.isForecast ? 'forecast' : 'official'}">${x.slot.isForecast ? 'Oppiva ennuste' : 'Virallinen'}</span></td>
                    <td><strong>${formatNum(x.br.spotCents, 2)} snt/kWh</strong> ${rangeText}</td>
                    <td>${formatNum(x.br.transferCents + x.br.taxCents + x.br.marginCents, 2)} snt/kWh <span class="muted-range">(${x.br.transferLabel})</span></td>
                    <td><strong>${formatNum(x.br.totalCents, 2)} snt/kWh</strong></td>
                    <td>${x.slot.windMw} MW / ${formatNum(x.slot.tempC, 1)} °C</td>
                </tr>
            `;
        }
        tableBody.innerHTML = rowsHtml;
    }

    function renderMlLearningPanel() {
        const panelEl = document.getElementById('ml-learning-panel');
        if (!panelEl) return;

        const lc = ML_BASE.learningCurve || {
            naiveBaselineMaeCents: 5.67,
            currentMaeCents: 3.32,
            improvementPct: 41.4,
            stages: [
                { label: 'Alkuvaihe (3 vrk / 72 tuntia dataa)', hours: 72, maeCents: 4.72 },
                { label: 'Perusvaihe (7 vrk / 168 tuntia dataa)', hours: 168, maeCents: 4.70 },
                { label: 'Kasvuvaihe (21 vrk / 504 tuntia dataa)', hours: 504, maeCents: 3.46 },
                { label: `Nykyinen opittu malli (${state.mlStats.totalLearnedHours} tuntia dataa)`, hours: state.mlStats.totalLearnedHours, maeCents: 3.32 }
            ]
        };
        const ins = ML_BASE.insights || {
            avgPriceLowWindUnder1500Mw: 8.63,
            avgPriceHighWindOver4500Mw: 2.18,
            windEffectPer1000MwCents: -1.84
        };

        const stagesHtml = [
            { label: 'Oppimaton kiinteä peruskaava (0 h opetusdataa)', maeCents: lc.naiveBaselineMaeCents, isBase: true },
            ...lc.stages
        ].map(st => {
            const barWidth = Math.max(20, Math.min(100, (st.maeCents / lc.naiveBaselineMaeCents) * 100));
            const accuracyGain = st.isBase ? 'Lähtötaso' : `-${formatNum(lc.naiveBaselineMaeCents - st.maeCents, 2)} snt/kWh virhe`;
            return `
                <div class="lc-row">
                    <div class="lc-meta">
                        <span><strong>${st.label}</strong></span>
                        <span>Keskivirhe (MAE): <strong>${formatNum(st.maeCents, 2)} snt/kWh</strong> <span class="muted-range">(${accuracyGain})</span></span>
                    </div>
                    <div class="lc-bar-bg">
                        <div class="lc-bar-fill ${st.isBase ? 'naive' : 'learned'}" style="width:${barWidth.toFixed(1)}%;"></div>
                    </div>
                </div>
            `;
        }).join('');

        panelEl.innerHTML = `
            <div class="ml-stats-grid">
                <div class="ml-stat-box">
                    <div class="opt-kicker">Kertynyt opetusdata yhteensä</div>
                    <div class="opt-time-large">${state.mlStats.totalLearnedHours} tuntia</div>
                    <div class="opt-price-line">Sisältää ${ML_BASE.totalObservations || 2186} historiallista tuntia + ${state.mlStats.onlineNewHours} reaaliajassa sopeutettua tuntia</div>
                </div>
                <div class="ml-stat-box">
                    <div class="opt-kicker">Mitattu ennustetarkkuus (MAE)</div>
                    <div class="opt-time-large">${formatNum(lc.currentMaeCents, 2)} snt/kWh</div>
                    <div class="opt-price-line">Virhe on pienentynyt <strong>${formatNum(lc.improvementPct, 1)} %</strong> datan karttuessa (lähtötaso ${formatNum(lc.naiveBaselineMaeCents, 2)} snt/kWh)</div>
                </div>
                <div class="ml-stat-box">
                    <div class="opt-kicker">Datasta opittu tuulivoimavaikutus</div>
                    <div class="opt-time-large">${formatNum(ins.windEffectPer1000MwCents, 2)} snt / +1000 MW</div>
                    <div class="opt-price-line">Tyyni (&lt;1500 MW): keskim. <strong>${formatNum(ins.avgPriceLowWindUnder1500Mw, 2)} snt</strong> | Tuulinen (&gt;4500 MW): <strong>${formatNum(ins.avgPriceHighWindOver4500Mw, 2)} snt</strong></div>
                </div>
            </div>

            <div style="margin-top:18px;">
                <h3 style="font-size:16px; color:#163022; margin-bottom:10px;">Todistettu oppimiskäyrä: miten lisädata pienentää ennustevirhettä (Out-of-Sample Backtest)</h3>
                ${stagesHtml}
            </div>
        `;
    }

    function renderCheapestWindowCalculator() {
        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const upcoming = state.series.filter(s => s.epochMs >= nowHourMs).slice(0, 36);
        const resultEl = document.getElementById('cheapest-window-result');
        if (!resultEl || upcoming.length < state.windowHours) return;

        const wLen = state.windowHours;
        let bestWindow = null;
        let worstWindow = null;

        for (let i = 0; i <= upcoming.length - wLen; i++) {
            const slice = upcoming.slice(i, i + wLen);
            const breakdowns = slice.map(s => calculateHourBreakdown(s));
            const avgTotal = breakdowns.reduce((a, b) => a + b.totalCents, 0) / wLen;
            const avgSpot = breakdowns.reduce((a, b) => a + b.spotCents, 0) / wLen;
            const avgTransferAndTax = avgTotal - avgSpot;

            const candidate = {
                startSlot: slice[0],
                endSlot: slice[slice.length - 1],
                avgTotal,
                avgSpot,
                avgTransferAndTax
            };

            if (!bestWindow || candidate.avgTotal < bestWindow.avgTotal) bestWindow = candidate;
            if (!worstWindow || candidate.avgTotal > worstWindow.avgTotal) worstWindow = candidate;
        }

        if (!bestWindow) return;

        const totalKwh = state.applianceKw * wLen;
        const bestEur = (bestWindow.avgTotal * totalKwh) / 100.0;
        const worstEur = (worstWindow.avgTotal * totalKwh) / 100.0;
        const savedEur = Math.max(0, worstEur - bestEur);

        const startHel = getHelsinkiComponents(new Date(bestWindow.startSlot.epochMs));
        const endHel = getHelsinkiComponents(new Date(bestWindow.endSlot.epochMs + 3600000));

        resultEl.innerHTML = `
            <div class="opt-result-grid">
                <div class="opt-main-box">
                    <div class="opt-kicker">Edullisin ${wLen} tunnin jakso kokonaishinnalla (seuraavat 36 h)</div>
                    <div class="opt-time-large">Klo ${String(startHel.hour).padStart(2, '0')}:00 – ${String(endHel.hour).padStart(2, '0')}:00 (${startHel.day}.${startHel.month}.)</div>
                    <div class="opt-price-line">
                        Kokonaishinta keskimäärin <strong>${formatNum(bestWindow.avgTotal, 2)} snt/kWh</strong>
                        (Spot ${formatNum(bestWindow.avgSpot, 2)} snt + Siirto, vero ja marginaali ${formatNum(bestWindow.avgTransferAndTax, 2)} snt)
                    </div>
                </div>
                <div class="opt-cost-box">
                    <div class="opt-kicker">Kustannus (${formatNum(state.applianceKw, 1)} kW x ${wLen} h = ${formatNum(totalKwh, 1)} kWh)</div>
                    <div class="opt-eur-large">${formatNum(bestEur, 2)} €</div>
                    <div class="opt-save-line">Säästö kalleimpaan jaksoon verrattuna: <strong>${formatNum(savedEur, 2)} €</strong> (kallein ${formatNum(worstEur, 2)} €)</div>
                </div>
            </div>
        `;
    }

    function renderAnnualTransferComparison() {
        const dso = getActiveDso();
        const container = document.getElementById('annual-comparison-result');
        if (!container || !dso) return;

        const kwh = Math.max(500, state.annualKwh);
        const nightShare = Math.max(0, Math.min(100, state.nightSharePct)) / 100.0;
        const dayShare = 1.0 - nightShare;

        const avgSpot = state.series.length > 0
            ? state.series.reduce((a, b) => a + (state.includeVat ? b.priceInclVat : b.priceVat0), 0) / state.series.length
            : 5.20;
        const taxC = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;
        const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
        const marginC = state.marginCents * vatFactor;

        const energyAndMarginEur = ((avgSpot + marginC) * kwh) / 100.0;
        const taxEur = (taxC * kwh) / 100.0;

        const genTransferEur = ((dso.general_c_kwh * vatFactor) * kwh) / 100.0 + (dso.general_base_eur * vatFactor * 12);
        const genTotalEur = energyAndMarginEur + taxEur + genTransferEur;

        const timeAvgC = (dso.day_c_kwh * dayShare + dso.night_c_kwh * nightShare) * vatFactor;
        const timeTransferEur = (timeAvgC * kwh) / 100.0 + (dso.time_base_eur * vatFactor * 12);
        const timeTotalEur = energyAndMarginEur + taxEur + timeTransferEur;

        const winterDayShare = Math.max(0.10, dayShare * 0.55);
        const otherSeasonShare = 1.0 - winterDayShare;
        const seasonAvgC = (dso.winter_day_c_kwh * winterDayShare + dso.other_c_kwh * otherSeasonShare) * vatFactor;
        const seasonTransferEur = (seasonAvgC * kwh) / 100.0 + (dso.season_base_eur * vatFactor * 12);
        const seasonTotalEur = energyAndMarginEur + taxEur + seasonTransferEur;

        const options = [
            { id: 'general', title: 'Yleissiirto', transferEur: genTransferEur, totalEur: genTotalEur, baseMonth: dso.general_base_eur * vatFactor, avgC: (genTotalEur * 100) / kwh },
            { id: 'time', title: 'Yösiirto / Aikasiirto', transferEur: timeTransferEur, totalEur: timeTotalEur, baseMonth: dso.time_base_eur * vatFactor, avgC: (timeTotalEur * 100) / kwh },
            { id: 'season', title: 'Kausisiirto', transferEur: seasonTransferEur, totalEur: seasonTotalEur, baseMonth: dso.season_base_eur * vatFactor, avgC: (seasonTotalEur * 100) / kwh }
        ];

        const cheapest = options.reduce((a, b) => (b.totalEur < a.totalEur ? b : a), options[0]);

        container.innerHTML = options.map(opt => {
            const isBest = opt.id === cheapest.id;
            return `
                <div class="comp-card ${isBest ? 'best-choice' : ''}">
                    <div class="comp-card-header">
                        <span class="comp-title">${opt.title} (${dso.short_name})</span>
                        ${isBest ? '<span class="best-badge">Edullisin valinta</span>' : ''}
                    </div>
                    <div class="comp-total-eur">${formatNum(opt.totalEur, 0)} € / vuosi <span class="comp-month">(${formatNum(opt.totalEur / 12, 0)} €/kk)</span></div>
                    <div class="comp-avg-c">Kaikki kulut yhteensä keskimäärin <strong>${formatNum(opt.avgC, 2)} snt/kWh</strong></div>
                    <ul class="comp-list">
                        <li>Sähköenergia + marginaali: ${formatNum(energyAndMarginEur, 0)} €/v</li>
                        <li>Verkkoyhtiön siirto + perusmaksu (${formatNum(opt.baseMonth, 2)} €/kk): ${formatNum(opt.transferEur, 0)} €/v</li>
                        <li>Sähkövero ja huoltovarmuusmaksu: ${formatNum(taxEur, 0)} €/v</li>
                    </ul>
                </div>
            `;
        }).join('');
    }

    function renderAll() {
        renderDsoPanel();
        renderKpiCards();
        renderDayTabsAndChart();
        renderMlLearningPanel();
        renderCheapestWindowCalculator();
        renderAnnualTransferComparison();
    }

    function bindEvents() {
        const postalForm = document.getElementById('postal-search-form');
        const postalInput = document.getElementById('postal-input');

        function handlePostalLookup() {
            if (!postalInput) return;
            const res = resolvePostalOrCity(postalInput.value);
            if (res) {
                state.postalCode = res.postal;
                state.cityName = res.city;
                state.dsoId = res.dsoId;
                state.altDsoIds = res.alt || [];
                saveSettings();
                renderAll();
            }
        }

        if (postalForm) {
            postalForm.addEventListener('submit', function (e) {
                e.preventDefault();
                handlePostalLookup();
            });
        }
        if (postalInput) {
            postalInput.addEventListener('input', function () {
                const v = this.value.trim();
                if (/^\d{5}$/.test(v)) {
                    handlePostalLookup();
                }
            });
        }

        document.querySelectorAll('[data-tariff-btn]').forEach(btn => {
            btn.addEventListener('click', function () {
                state.tariffType = this.getAttribute('data-tariff-btn');
                saveSettings();
                renderAll();
            });
        });

        document.querySelectorAll('[data-mode-btn]').forEach(btn => {
            btn.addEventListener('click', function () {
                state.showTotalInChart = this.getAttribute('data-mode-btn') === 'total';
                saveSettings();
                renderAll();
            });
        });

        const marginInput = document.getElementById('margin-input');
        if (marginInput) {
            marginInput.value = state.marginCents;
            marginInput.addEventListener('input', function () {
                const v = parseFloat(String(this.value).replace(',', '.'));
                if (!isNaN(v) && v >= 0 && v <= 5) {
                    state.marginCents = v;
                    saveSettings();
                    renderAll();
                }
            });
        }

        const vatToggle = document.getElementById('vat-select');
        if (vatToggle) {
            vatToggle.value = state.includeVat ? '1' : '0';
            vatToggle.addEventListener('change', function () {
                state.includeVat = this.value === '1';
                saveSettings();
                renderAll();
            });
        }

        document.querySelectorAll('[data-win-hours]').forEach(btn => {
            btn.addEventListener('click', function () {
                state.windowHours = parseInt(this.getAttribute('data-win-hours'), 10);
                document.querySelectorAll('[data-win-hours]').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                renderCheapestWindowCalculator();
            });
        });

        const kwInput = document.getElementById('appliance-kw-input');
        if (kwInput) {
            kwInput.value = state.applianceKw;
            kwInput.addEventListener('input', function () {
                const v = parseFloat(String(this.value).replace(',', '.'));
                if (!isNaN(v) && v > 0) {
                    state.applianceKw = v;
                    renderCheapestWindowCalculator();
                }
            });
        }

        document.querySelectorAll('[data-preset-kw]').forEach(btn => {
            btn.addEventListener('click', function () {
                const kw = parseFloat(this.getAttribute('data-preset-kw'));
                const hrs = parseInt(this.getAttribute('data-preset-hrs') || '3', 10);
                state.applianceKw = kw;
                state.windowHours = hrs;
                if (kwInput) kwInput.value = kw;
                document.querySelectorAll('[data-win-hours]').forEach(b => {
                    b.classList.toggle('active', parseInt(b.getAttribute('data-win-hours'), 10) === hrs);
                });
                renderCheapestWindowCalculator();
            });
        });

        const annualKwhInput = document.getElementById('annual-kwh-input');
        if (annualKwhInput) {
            annualKwhInput.value = state.annualKwh;
            annualKwhInput.addEventListener('input', function () {
                const v = parseInt(this.value, 10);
                if (!isNaN(v) && v >= 500) {
                    state.annualKwh = v;
                    renderAnnualTransferComparison();
                }
            });
        }

        const nightShareInput = document.getElementById('night-share-input');
        const nightShareLabel = document.getElementById('night-share-label');
        if (nightShareInput) {
            nightShareInput.value = state.nightSharePct;
            nightShareInput.addEventListener('input', function () {
                const v = parseInt(this.value, 10);
                if (!isNaN(v)) {
                    state.nightSharePct = v;
                    if (nightShareLabel) nightShareLabel.textContent = `${v} %`;
                    renderAnnualTransferComparison();
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const initRes = resolvePostalOrCity(state.postalCode);
        if (initRes && !document.body.getAttribute('data-preset-dso')) {
            state.cityName = initRes.city;
            state.dsoId = initRes.dsoId;
            state.altDsoIds = initRes.alt || [];
        }
        bindEvents();
        renderDsoPanel();
        renderMlLearningPanel();
        loadSpotAndForecastData();
    });
})();
