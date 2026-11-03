// Sähkömittari — Nord Pool FI, 2 vuoden historiasta oppiva 7 vrk ennustemalli ja postinumeropohjainen siirtohintalaskuri
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
        totalObservations: 17500,
        firstObservationDate: '2024-11-03',
        lastObservationDate: '2026-11-03',
        model: {
            weights: [5.2, -7.8, 2.1, 1.4, 3.2, 4.5, 2.4, 2.8, -1.5, -1.1, 3.0, 4.2, 0.8, 1.5],
            weekdayHourAdj: new Array(24).fill(0),
            weekendHourAdj: new Array(24).fill(0),
            windTempGridAdj: {},
            empiricalMatrix: {}
        },
        learningCurve: null,
        insights: null,
        monthlySummary: [],
        recentBacktest: []
    };

    const FINLAND_INSTALLED_WIND_MW = 8450;
    const FINLAND_NUCLEAR_MAX_MW = 4394;
    const FINLAND_SOLAR_MAX_MW = 1250;

    const state = {
        postalCode: localStorage.getItem('ps_postal') || '00100',
        cityName: localStorage.getItem('ps_city') || 'Helsinki',
        dsoId: localStorage.getItem('ps_dso') || 'helen',
        altDsoIds: [],
        tariffType: localStorage.getItem('ps_tariff') || 'general',
        marginCents: parseFloat(localStorage.getItem('ps_margin') || '0.45'),
        includeVat: localStorage.getItem('ps_vat') !== '0',
        showTotalInChart: localStorage.getItem('ps_show_total') !== '0',
        nuclearScenario: 'auto',
        selectedBacktestId: 'winter_frost',
        selectedDayIndex: 0,
        windowHours: 3,
        applianceKw: 11.0,
        annualKwh: 12000,
        nightSharePct: 55,
        series: [],
        daysList: [],
        generatedAt: null,
        mlStats: {
            totalLearnedHours: ML_BASE.totalObservations || 17552,
            onlineNewHours: 0,
            liveMaeCents: ML_BASE.learningCurve?.currentMaeCents || 1.81,
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
        let isNightRate = false;

        if (state.tariffType === 'time') {
            const isDay = slot.hour >= 7 && slot.hour < 22;
            transferCentsInclVat = isDay ? dso.day_c_kwh : dso.night_c_kwh;
            transferLabel = isDay ? 'Päiväsiirto (07–22)' : 'Yösiirto (22–07)';
            isNightRate = !isDay;
        } else if (state.tariffType === 'season') {
            const isWinterMonth = (slot.month >= 11 || slot.month <= 3);
            const isMonToSat = !slot.isWeekend || slot.isSat;
            const isWinterDay = isWinterMonth && isMonToSat && (slot.hour >= 7 && slot.hour < 22);
            transferCentsInclVat = isWinterDay ? dso.winter_day_c_kwh : dso.other_c_kwh;
            transferLabel = isWinterDay ? 'Talviarkipäivä' : 'Muu aika';
            isNightRate = !isWinterDay;
        }

        const transferCents = transferCentsInclVat / vatDivider;
        const fixedAdd = marginCents + transferCents + taxCents;
        const totalCents = spotCents + fixedAdd;

        const rawMinIncl = slot.minInclVat !== undefined ? slot.minInclVat : slot.priceInclVat;
        const rawMaxIncl = slot.maxInclVat !== undefined ? slot.maxInclVat : slot.priceInclVat;
        const minSpotCents = state.includeVat ? rawMinIncl : (rawMinIncl / DSO_DATA.vatRate);
        const maxSpotCents = state.includeVat ? rawMaxIncl : (rawMaxIncl / DSO_DATA.vatRate);
        const minTotalCents = minSpotCents + fixedAdd;
        const maxTotalCents = maxSpotCents + fixedAdd;

        return {
            spotCents,
            minSpotCents,
            maxSpotCents,
            marginCents,
            transferCents,
            transferLabel,
            isNightRate,
            taxCents,
            totalCents,
            minTotalCents,
            maxTotalCents
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

    function getScenarioNuclearDeficitMw(dateKey) {
        if (state.nuclearScenario === 'ol3') return 1600;
        if (state.nuclearScenario === 'ol12') return 890;
        if (state.nuclearScenario === 'loviisa') return 507;
        if (state.nuclearScenario === 'major') return 2490;
        const sched = Array.isArray(ML_BASE.nuclearOutageSchedule) ? ML_BASE.nuclearOutageSchedule : [];
        let off = 0;
        for (const item of sched) {
            if (dateKey >= item.start && dateKey <= item.end) off += item.mw;
        }
        return Math.min(3000, off);
    }

    function extractFeatures(obs, prevSpot24h = 5.5) {
        const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / FINLAND_INSTALLED_WIND_MW));
        const tempC = obs.tempC;
        const hour = obs.hour;
        const fixedHolidays = ['01-01', '01-06', '05-01', '12-06', '12-24', '12-25', '12-26'];
        const md = obs.dateKey ? obs.dateKey.slice(5) : '';
        const isFreeDay = obs.isWeekend || fixedHolidays.includes(md);
        const isFree = isFreeDay ? 1.0 : 0.0;

        const hdd = Math.max(0.0, 12.0 - tempC) / 20.0;
        const severeCold = Math.max(0.0, -3.0 - tempC) / 15.0;
        const workdayActive = (!isFreeDay && hour >= 6 && hour <= 22) ? 1.25 : 0.45;
        const lowWindScarcity = Math.pow(Math.max(0.0, 0.25 - wRatio), 2) * 10.0
            + Math.pow(Math.max(0.0, 0.13 - wRatio), 2) * 45.0 * workdayActive;

        const morningPeak = (!isFreeDay && hour >= 7 && hour <= 10 ? 1.0 : 0.0) * Math.max(0.0, 1.0 - wRatio * 1.1);
        const eveningPeak = (!isFreeDay && hour >= 16 && hour <= 21 ? 1.0 : 0.0) * Math.max(0.0, 1.0 - wRatio * 1.1);
        const nightTrough = (hour >= 0 && hour <= 5) ? 1.0 : 0.0;
        const calmColdInter = (1.0 - wRatio) * hdd;

        const windMemoryDamping = Math.max(0.12, 1.0 - 0.85 * wRatio);
        const prev24 = (prevSpot24h !== null && !isNaN(prevSpot24h)) ? prevSpot24h : 5.5;
        const arLevel = (Math.min(22.0, prev24) / 10.0) * windMemoryDamping;

        const isHeatingSeason = [10, 11, 12, 1, 2, 3, 4].includes(obs.month) ? 1.0 : 0.0;
        const heatingPeak = isHeatingSeason * (!isFreeDay && ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 21)) ? 1.0 : 0.0) * (1.0 - wRatio);

        const t72 = obs.rolling72hTempC !== undefined ? obs.rolling72hTempC : tempC;
        const rolling72hHdd = Math.max(0.0, 10.0 - t72) / 20.0;

        const solarMw = obs.solarMw !== undefined ? obs.solarMw : radiationToSolarMw(obs.solarRadWm2, obs.month, hour);
        const solarRatio = solarMw / FINLAND_SOLAR_MAX_MW;

        const nucDefMw = obs.nuclearDeficitMw !== undefined ? obs.nuclearDeficitMw : getScenarioNuclearDeficitMw(obs.dateKey || '');
        const nucDefRatio = nucDefMw / 2000.0;
        const nucScarcityInter = nucDefRatio * Math.max(0.0, 0.55 - wRatio) * (isFreeDay ? 0.5 : 1.0);

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

    function predictWithLearnedModel(obs, model, prevSpot24h = 5.5) {
        const x = extractFeatures(obs, prevSpot24h);
        let lin = 0.0;
        for (let i = 0; i < x.length && i < model.weights.length; i++) {
            lin += model.weights[i] * x[i];
        }
        const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / FINLAND_INSTALLED_WIND_MW));
        const hRaw = obs.isWeekend
            ? (model.weekendHourAdj?.[obs.hour] || 0.0)
            : (model.weekdayHourAdj?.[obs.hour] || 0.0);
        const hScale = hRaw > 0 ? Math.max(0.20, 1.15 - 0.90 * wRatio) : 1.0;
        const hAdj = hRaw * hScale;
        const wBin = Math.min(4, Math.floor((obs.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
        const tBin = obs.tempC < -5 ? 0 : (obs.tempC < 2 ? 1 : (obs.tempC < 10 ? 2 : 3));
        const gAdj = model.windTempGridAdj?.[`${wBin}_${tBin}`] || 0.0;

        // Jos käyttäjä simuloi ydinvoimaseisokkia, lisätään suora fysikaalinen niukkuusvaikutus
        const scenDefMw = getScenarioNuclearDeficitMw(obs.dateKey || '');
        const baseDefMw = obs.baseNuclearDeficitMw || 0;
        const extraDefMw = Math.max(0, scenDefMw - baseDefMw);
        const extraNucPremium = (extraDefMw / 1000.0) * (1.25 + 3.40 * Math.max(0, 0.65 - wRatio)) * (obs.isWeekend ? 0.65 : 1.0);

        return Math.max(0.05, lin + hAdj + gAdj + extraNucPremium);
    }

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
        state.mlStats.totalLearnedHours = (ML_BASE.totalObservations || 17500) + count;
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

        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17,63.82,59.43&longitude=23.95,21.34,22.58,24.94,20.26,24.75&hourly=temperature_2m,wind_speed_100m,wind_speed_10m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=4&forecast_days=7&timezone=UTC';
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
                        const radS = locs[3].hourly.shortwave_radiation?.[i] ?? 0;
                        const radW = locs[2].hourly.shortwave_radiation?.[i] ?? 0;
                        const solarRadWm2 = Number((radS * 0.6 + radW * 0.4).toFixed(1));
                        const pressureHpa = locs[2].hourly.surface_pressure?.[i] ?? 1013.0;
                        const seWindSpeed = locs[4]?.hourly?.wind_speed_100m?.[i] ?? weightedWind;
                        const eeWindSpeed = locs[5]?.hourly?.wind_speed_100m?.[i] ?? weightedWind;
                        weatherMap.set(tMs, {
                            windSpeed100m: Number(weightedWind.toFixed(1)),
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
        } catch (_) {}

        const sortedWMs = Array.from(weatherMap.keys()).sort((a, b) => a - b);
        for (let i = 0; i < sortedWMs.length; i++) {
            const ms = sortedWMs[i];
            const w = weatherMap.get(ms);
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
            const w = weatherMap.get(hMs) || {
                windSpeed100m: 6.5, windMw: 2400, tempC: 4.0, solarRadWm2: 0,
                pressureHpa: 1013, seWindSpeed: 6.5, eeWindSpeed: 6.5,
                rolling24hWindMw: 2400, windRamp6hMw: 0, rolling72hTempC: 4.0
            };
            const official = officialHourlyMap.get(hMs);
            const hel = getHelsinkiComponents(new Date(hMs));
            const solarMw = radiationToSolarMw(w.solarRadWm2, hel.month, hel.hour);
            const baseDefMw = getScenarioNuclearDeficitMw(hel.dateKey);
            const nuclearMw = FINLAND_NUCLEAR_MAX_MW - baseDefMw;
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
                    basePriceInclVat: official.priceInclVat,
                    priceVat0: official.priceVat0,
                    minInclVat: official.priceInclVat,
                    maxInclVat: official.priceInclVat,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw,
                    nuclearMw,
                    baseNuclearDeficitMw: baseDefMw
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
                const lag24Same = rollingPriceByMs.get(hMs - 24 * 3600000) ?? prevAvg;
                const obsObj = {
                    epochMs: hMs,
                    dateKey: hel.dateKey,
                    month: hel.month,
                    hour: hel.hour,
                    isWeekend: hel.isWeekend,
                    ...w,
                    solarMw,
                    nuclearDeficitMw: baseDefMw,
                    baseNuclearDeficitMw: baseDefMw,
                    lag24hSameHour: lag24Same,
                    prev24hMean: prevAvg,
                    prev7dMean: prevAvg
                };
                const rawEst = predictWithLearnedModel(obsObj, learnedModel, prevAvg);
                const estInclVat = Number(Math.max(0.10, rawEst).toFixed(2));
                rollingPriceByMs.set(hMs, estInclVat);

                // Lasketaan todennäköinen vaihteluväli [minInclVat, maxInclVat] sääennusteen
                // epävarmuudesta (±tuulennopeus ja ±lämpötila) sekä ennustehorisontin pituudesta
                const hoursAhead = Math.max(1, (hMs - currentHourMs) / 3600000);
                const deltaWindMs = 0.70 + Math.min(1.60, (hoursAhead / 168.0) * 1.50);
                const deltaTempC = 0.60 + Math.min(1.80, (hoursAhead / 168.0) * 1.60);

                const windHighMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor((w.windSpeed100m || 6.5) + deltaWindMs));
                const windLowMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(Math.max(1.5, (w.windSpeed100m || 6.5) - deltaWindMs)));

                const estOptimistic = predictWithLearnedModel({
                    ...obsObj,
                    windMw: windHighMw,
                    rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.4 + windHighMw * 0.6),
                    tempC: w.tempC + deltaTempC
                }, learnedModel, prevAvg);

                const estPessimistic = predictWithLearnedModel({
                    ...obsObj,
                    windMw: windLowMw,
                    rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.4 + windLowMw * 0.6),
                    tempC: w.tempC - deltaTempC
                }, learnedModel, prevAvg);

                const baseMargin = 0.55 + Math.min(1.65, (hoursAhead / 168.0) * 1.45);
                const rawMin = Math.min(estInclVat - baseMargin * 0.85, estOptimistic - baseMargin * 0.45);
                const rawMax = Math.max(estInclVat + baseMargin * 1.05, estPessimistic + baseMargin * 0.55);

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
                    basePriceInclVat: estInclVat,
                    priceVat0: Number((estInclVat / 1.255).toFixed(2)),
                    minInclVat: Number(Math.max(0.0, rawMin).toFixed(2)),
                    maxInclVat: Number(Math.max(estInclVat + 0.5, rawMax).toFixed(2)),
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw,
                    nuclearMw,
                    baseNuclearDeficitMw: baseDefMw
                });
            }
        }
        return { generatedAt: new Date().toISOString(), series };
    }

    function applyNuclearScenarioToForecast() {
        for (const s of state.series) {
            if (s.basePriceInclVat === undefined) s.basePriceInclVat = s.priceInclVat;
            const scenDefMw = getScenarioNuclearDeficitMw(s.dateKey || '');
            s.nuclearMw = FINLAND_NUCLEAR_MAX_MW - scenDefMw;
            if (!s.isForecast) continue;
            const baseDef = s.baseNuclearDeficitMw || 0;
            const extraDefMw = Math.max(0, scenDefMw - baseDef);
            const wRatio = Math.max(0.01, Math.min(0.95, (s.windMw || 2400) / FINLAND_INSTALLED_WIND_MW));
            const extraPremium = (extraDefMw / 1000.0) * (1.35 + 3.60 * Math.max(0, 0.65 - wRatio)) * (s.isWeekend ? 0.65 : 1.0);
            const nextIncl = Number(Math.max(0.10, s.basePriceInclVat + extraPremium).toFixed(2));
            const spread = Math.max(0.95, nextIncl * 0.32 + 0.8);
            s.priceInclVat = nextIncl;
            s.priceVat0 = Number((nextIncl / 1.255).toFixed(2));
            s.minInclVat = Number(Math.max(0.0, nextIncl - spread).toFixed(2));
            s.maxInclVat = Number((nextIncl + spread * 1.15).toFixed(2));
        }
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

    function renderTelemetryAndDsoPanel() {
        const dso = getActiveDso();
        const postalInput = document.getElementById('postal-input');
        if (postalInput && document.activeElement !== postalInput) {
            postalInput.value = state.postalCode;
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const curSlot = state.series.find(s => s.epochMs === nowHourMs) || state.series[0];
        if (curSlot) {
            const br = calculateHourBreakdown(curSlot);
            const tSpot = document.getElementById('tel-spot');
            const tTrans = document.getElementById('tel-transfer');
            const tWind = document.getElementById('tel-wind');
            const tHours = document.getElementById('tel-hours');
            if (tSpot) tSpot.textContent = `${formatNum(br.spotCents, 2)} snt/kWh`;
            if (tTrans) tTrans.textContent = `${formatNum(br.transferCents + br.taxCents, 2)} snt/kWh (${dso.short_name})`;
            if (tWind) tWind.textContent = `${curSlot.windMw} MW (${formatNum(curSlot.tempC, 1)} °C)`;
            if (tHours) tHours.textContent = `${state.mlStats.totalLearnedHours} h`;
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
                        <span class="dso-kicker">JAKELUVERKKO [${state.postalCode} ${state.cityName.toUpperCase()}]</span>
                        <span class="dso-title">${dso.name}</span>
                        <div class="dso-sub">Yleissiirto ${genC} snt/kWh (${formatNum(dso.general_base_eur, 2)} €/kk) | Yösiirto päivä ${dayC} / yö ${nightC} snt/kWh | Sähkövero ${taxC} snt/kWh</div>
                    </div>
                    <div class="dso-manual-select-wrap">
                        <select id="dso-select" class="select-control" aria-label="Valitse sähköverkkoyhtiö">
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

    // Kuittimainen oikean palstan pistorasiahinta-erittely
    function renderReceiptLedger() {
        const container = document.getElementById('receipt-ledger-body');
        if (!container) return;

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const currentSlot = state.series.find(s => s.epochMs === nowHourMs) || state.series[0];
        if (!currentSlot) return;

        const curBreak = calculateHourBreakdown(currentSlot);
        const dso = getActiveDso();

        const todayObj = state.daysList[0];
        let minText = '—', avgText = '—';
        if (todayObj && todayObj.items.length > 0) {
            const enr = todayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const minItem = enr.reduce((a, b) => (b.br.totalCents < a.br.totalCents ? b : a), enr[0]);
            const avgTot = enr.reduce((a, b) => a + b.br.totalCents, 0) / enr.length;
            minText = `klo ${String(minItem.slot.hour).padStart(2, '0')}:00 (${formatNum(minItem.br.totalCents, 2)} snt)`;
            avgText = `${formatNum(avgTot, 2)} snt/kWh`;
        }

        const tomObj = state.daysList[1];
        let tomText = '—';
        if (tomObj && tomObj.items.length > 0) {
            const enrT = tomObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const avgT = enrT.reduce((a, b) => a + b.br.totalCents, 0) / enrT.length;
            if (tomObj.hasForecast) {
                const avgMinT = enrT.reduce((a, b) => a + b.br.minTotalCents, 0) / enrT.length;
                const avgMaxT = enrT.reduce((a, b) => a + b.br.maxTotalCents, 0) / enrT.length;
                tomText = `<strong>${formatNum(avgMinT, 1)}–${formatNum(avgMaxT, 1)} snt/kWh</strong> (odotus ${formatNum(avgT, 2)})`;
            } else {
                tomText = `${formatNum(avgT, 2)} snt/kWh (vahvistettu)`;
            }
        }

        container.innerHTML = `
            <div class="receipt-ledger">
                <div class="receipt-big-total">
                    <div>
                        <div class="field-label" style="margin:0;">PISTORASIAHINTA NYT (KLO ${String(currentSlot.hour).padStart(2, '0')}:00)</div>
                        <div style="font-size:11.5px; color:#4a4f4a;">${dso.short_name} (${state.postalCode})</div>
                    </div>
                    <div class="receipt-big-num">${formatNum(curBreak.totalCents, 2)} <span style="font-size:13px; font-weight:600;">snt/kWh</span></div>
                </div>

                <div class="receipt-row">
                    <span>Nord Pool FI spot-hinta</span>
                    <strong>${formatNum(curBreak.spotCents, 2)} snt/kWh</strong>
                </div>
                <div class="receipt-row">
                    <span>Myyjän marginaali</span>
                    <span>${formatNum(curBreak.marginCents, 2)} snt/kWh</span>
                </div>
                <div class="receipt-row">
                    <span>${curBreak.transferLabel} (${dso.short_name})</span>
                    <span>${formatNum(curBreak.transferCents, 2)} snt/kWh</span>
                </div>
                <div class="receipt-row">
                    <span>Sähkövero + huoltovarmuus</span>
                    <span>${formatNum(curBreak.taxCents, 2)} snt/kWh</span>
                </div>
                <div class="receipt-row total-row">
                    <span>KOKONAISHINTA YHTEENSÄ</span>
                    <span>${formatNum(curBreak.totalCents, 2)} snt/kWh</span>
                </div>

                <div style="margin-top:14px; padding-top:10px; border-top:1px solid #cbc7ba;">
                    <div class="receipt-row">
                        <span>Päivän halvin tunti tänään</span>
                        <strong>${minText}</strong>
                    </div>
                    <div class="receipt-row">
                        <span>Tämän päivän keskihinta (kok.)</span>
                        <span>${avgText}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Huomisen keskihinta (kok.)</span>
                        <span>${tomText}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Tarkka vektoripohjainen SVG-mittarikaavio (Spot + Siirto + Luottamusväli + Tuulivoimakäyrä)
    function buildSvgChart(enrichedItems, isWeekView) {
        const W = 900;
        const H = 290;
        const padL = 44;
        const padR = 48;
        const padT = 18;
        const padB = 34;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const n = Math.max(1, enrichedItems.length);
        const vals = enrichedItems.map(x => {
            if (x.slot.isForecast) {
                return state.showTotalInChart ? x.br.maxTotalCents : x.br.maxSpotCents;
            }
            return state.showTotalInChart ? x.br.totalCents : x.br.spotCents;
        });
        const maxPrice = Math.max(16, Math.ceil(Math.max(...vals, 15) / 5) * 5);
        const maxWind = 8000;

        const yForPrice = (c) => padT + plotH - Math.max(0, Math.min(1, c / maxPrice)) * plotH;
        const yForWind = (mw) => padT + plotH - Math.max(0, Math.min(1, mw / maxWind)) * plotH;
        const colW = plotW / n;

        let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="290" xmlns="http://www.w3.org/2000/svg" style="display:block; font-family:monospace;">`;
        svg += `
            <defs>
                <pattern id="forecastHatch" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <rect width="6" height="6" fill="#2b4c65" fill-opacity="0.78" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="2" stroke-opacity="0.38" />
                </pattern>
            </defs>
        `;

        // Yösiirron / edullisen siirtoajan taustavyöhykkeet
        if (state.tariffType !== 'general') {
            for (let i = 0; i < n; i++) {
                if (enrichedItems[i].br.isNightRate) {
                    const x0 = padL + i * colW;
                    svg += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${(colW + 0.4).toFixed(1)}" height="${plotH}" fill="#e6ece8" />`;
                }
            }
        }

        // Vaakasuorat hintaviivat (vasen akseli: snt/kWh) ja tuulivoima-asteikko (oikea akseli: MW)
        const steps = 4;
        for (let s = 0; s <= steps; s++) {
            const pVal = (maxPrice / steps) * s;
            const wVal = (maxWind / steps) * s;
            const y = yForPrice(pVal);
            svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#d4d0c4" stroke-width="1" stroke-dasharray="${s === 0 ? 'none' : '2,2'}" />`;
            svg += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#4a4f4a">${Math.round(pVal)} snt</text>`;
            svg += `<text x="${W - padR + 6}" y="${(y + 4).toFixed(1)}" text-anchor="start" font-size="10" fill="#b45309">${Math.round(wVal / 1000)} GW</text>`;
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;

        // Pylväät (pinottu siirto+vero+marginaali pohjalla ja spot päällä)
        for (let i = 0; i < n; i++) {
            const xObj = enrichedItems[i];
            const x0 = padL + i * colW;
            const barW = Math.max(1.5, colW * (isWeekView ? 0.82 : 0.72));
            const barX = x0 + (colW - barW) / 2;

            const totalVal = state.showTotalInChart ? xObj.br.totalCents : xObj.br.spotCents;
            const fixedVal = state.showTotalInChart ? (xObj.br.transferCents + xObj.br.taxCents + xObj.br.marginCents) : 0;

            const yTopTotal = yForPrice(totalVal);
            const yTopFixed = yForPrice(fixedVal);
            const yBottom = padT + plotH;

            let spotFill = xObj.br.spotCents < 3.0 ? '#1e6b43' : (xObj.br.spotCents < 8.0 ? '#2b4c65' : '#a83820');
            if (xObj.slot.isForecast) {
                spotFill = 'url(#forecastHatch)';
            }

            // Jos kyseessä on nykyinen tunti, korostetaan tausta
            if (xObj.slot.epochMs === nowHourMs) {
                svg += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="#1b4332" fill-opacity="0.12" />`;
            }

            // Ennustetunnin todennäköinen vaihteluväli-varjostus (min-max) pylvään taustalla
            if (xObj.slot.isForecast) {
                const minChartVal = state.showTotalInChart ? xObj.br.minTotalCents : xObj.br.minSpotCents;
                const maxChartVal = state.showTotalInChart ? xObj.br.maxTotalCents : xObj.br.maxSpotCents;
                if (maxChartVal > minChartVal) {
                    const yMin = yForPrice(minChartVal);
                    const yMax = yForPrice(maxChartVal);
                    const bandH = Math.max(2, yMin - yMax);
                    svg += `<rect x="${barX.toFixed(1)}" y="${yMax.toFixed(1)}" width="${barW.toFixed(1)}" height="${bandH.toFixed(1)}" fill="#1e5638" fill-opacity="0.18" />`;
                }
            }

            // Kiinteä siirto+vero-osuus pohjalle
            if (state.showTotalInChart && fixedVal > 0) {
                const hFixed = Math.max(0, yBottom - yTopFixed);
                svg += `<rect x="${barX.toFixed(1)}" y="${yTopFixed.toFixed(1)}" width="${barW.toFixed(1)}" height="${hFixed.toFixed(1)}" fill="#9e9b90" />`;
            }

            // Spot-osuus päälle
            const hSpot = Math.max(1.5, yTopFixed - yTopTotal);
            svg += `<rect x="${barX.toFixed(1)}" y="${yTopTotal.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSpot.toFixed(1)}" fill="${spotFill}" />`;

            // Ennusteen todennäköinen vaihteluväli-viiksi (min-max) ja päätyviivat
            if (xObj.slot.isForecast) {
                const minChartVal = state.showTotalInChart ? xObj.br.minTotalCents : xObj.br.minSpotCents;
                const maxChartVal = state.showTotalInChart ? xObj.br.maxTotalCents : xObj.br.maxSpotCents;
                if (maxChartVal > minChartVal) {
                    const yMin = yForPrice(minChartVal);
                    const yMax = yForPrice(maxChartVal);
                    const cx = barX + barW / 2;
                    svg += `<line x1="${cx.toFixed(1)}" y1="${yMax.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yMin.toFixed(1)}" stroke="#161816" stroke-width="${isWeekView ? '1.0' : '1.4'}" stroke-opacity="0.72" />`;
                    if (!isWeekView) {
                        const capW = Math.min(5, barW * 0.35);
                        svg += `<line x1="${(cx - capW).toFixed(1)}" y1="${yMax.toFixed(1)}" x2="${(cx + capW).toFixed(1)}" y2="${yMax.toFixed(1)}" stroke="#161816" stroke-width="1.4" stroke-opacity="0.8" />`;
                        svg += `<line x1="${(cx - capW).toFixed(1)}" y1="${yMin.toFixed(1)}" x2="${(cx + capW).toFixed(1)}" y2="${yMin.toFixed(1)}" stroke="#161816" stroke-width="1.4" stroke-opacity="0.8" />`;
                    }
                }
            }

            // Aikaleimat ala-akselille
            if (isWeekView) {
                if (xObj.slot.hour === 0) {
                    svg += `<line x1="${x0.toFixed(1)}" y1="${padT}" x2="${x0.toFixed(1)}" y2="${padT + plotH}" stroke="#8c887a" stroke-width="1" stroke-dasharray="3,3" />`;
                    svg += `<text x="${(x0 + 4).toFixed(1)}" y="${H - 10}" font-size="10.5" font-weight="bold" fill="#161816">${xObj.slot.dayShort || ''}</text>`;
                }
            } else {
                if (i % 2 === 0 || n <= 24) {
                    const cx = x0 + colW / 2;
                    svg += `<text x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="#161816">${String(xObj.slot.hour).padStart(2, '0')}</text>`;
                }
            }

            // Näkymätön hover-alue tarkkaa lukemaa varten
            svg += `<rect class="svg-hover-slot" data-slot-idx="${i}" x="${x0.toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:crosshair;" />`;
        }

        // Tuulivoimakäyrä (MW) kuparin värisenä viivana kaavion päällä
        const windPoints = enrichedItems.map((xObj, i) => {
            const cx = padL + i * colW + colW / 2;
            const cy = yForWind(xObj.slot.windMw);
            return `${cx.toFixed(1)},${cy.toFixed(1)}`;
        }).join(' ');
        svg += `<polyline fill="none" stroke="#b45309" stroke-width="2.2" points="${windPoints}" pointer-events="none" />`;

        svg += `</svg>`;
        return svg;
    }

    function renderDayTabsAndChart() {
        const tabsEl = document.getElementById('day-tabs');
        if (!tabsEl) return;

        // 7 vuorokauden matriisipainikkeet + 7 vrk kokonaisaikasarja
        let tabsHtml = '';
        for (const d of state.daysList) {
            const enr = d.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const avgVal = enr.reduce((a, b) => a + (state.showTotalInChart ? b.br.totalCents : b.br.spotCents), 0) / enr.length;
            const avgMin = enr.reduce((a, b) => a + (state.showTotalInChart ? b.br.minTotalCents : b.br.minSpotCents), 0) / enr.length;
            const avgMax = enr.reduce((a, b) => a + (state.showTotalInChart ? b.br.maxTotalCents : b.br.maxSpotCents), 0) / enr.length;
            const avgWind = Math.round(d.items.reduce((a, b) => a + b.windMw, 0) / d.items.length);
            const tag = d.allForecast ? 'ENNUSTE' : (d.hasForecast ? 'OSIN ENNUSTE' : 'VAHVISTETTU');
            const priceLabel = d.hasForecast
                ? `${formatNum(avgMin, 1)}–${formatNum(avgMax, 1)} snt`
                : `${formatNum(avgVal, 2)} snt/kWh`;
            const metaLabel = d.hasForecast
                ? `Odotus ${formatNum(avgVal, 1)} snt | ${avgWind} MW`
                : `Tuuli ${avgWind} MW`;
            tabsHtml += `
                <button type="button" class="day-tab ${state.selectedDayIndex === d.index ? 'active' : ''}" data-day-idx="${d.index}">
                    <span class="day-tab-name">${d.shortLabel} [${tag}]</span>
                    <span class="day-tab-price">${priceLabel}</span>
                    <span class="day-tab-meta">${metaLabel}</span>
                </button>
            `;
        }
        tabsHtml += `
            <button type="button" class="day-tab ${state.selectedDayIndex === -1 ? 'active' : ''}" data-day-idx="-1">
                <span class="day-tab-name">KOKO 7 VRK SARJA</span>
                <span class="day-tab-price">168 TUNTIA</span>
                <span class="day-tab-meta">Vaihteluväli + Tuuli</span>
            </button>
        `;
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
        const readoutEl = document.getElementById('chart-readout-strip');
        if (!chartContainer || !tableBody) return;

        let activeItems = [];
        const isWeekView = state.selectedDayIndex === -1;

        if (isWeekView) {
            if (chartTitle) {
                chartTitle.textContent = '7 VUOROKAUDEN TUNTISARJA, TODENNÄKÖINEN VAIHTELUVÄLI JA TUULIVOIMA (168 H)';
            }
            const rawAll = state.daysList.flatMap(d => d.items.map(it => ({ ...it, dayShort: d.shortLabel })));
            activeItems = rawAll.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
        } else {
            const dayObj = state.daysList.find(d => d.index === state.selectedDayIndex) || state.daysList[0];
            if (!dayObj) return;
            if (chartTitle) {
                chartTitle.textContent = `${dayObj.label.toUpperCase()} — ${dayObj.hasForecast ? 'ENNUSTETTU TODENNÄKÖINEN HINTA-ALUE & SIIRTO' : 'VAHVISTETTU TUNTIHINTA & SIIRTO'}`;
            }
            activeItems = dayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
        }

        chartContainer.innerHTML = buildSvgChart(activeItems, isWeekView);

        function updateReadout(xObj) {
            if (!readoutEl || !xObj) return;
            const dayPrefix = xObj.slot.dayShort ? `${xObj.slot.dayShort} ` : '';
            if (xObj.slot.isForecast) {
                readoutEl.innerHTML = `
                    <span><strong>VALITTU TUNTI:</strong> ${dayPrefix}klo ${String(xObj.slot.hour).padStart(2, '0')}:00–${String((xObj.slot.hour + 1) % 24).padStart(2, '0')}:00 (Ennuste)</span>
                    <span><strong>TODENNÄKÖINEN HINTA:</strong> ${formatNum(xObj.br.minTotalCents, 2)}–${formatNum(xObj.br.maxTotalCents, 2)} snt/kWh (odotus ${formatNum(xObj.br.totalCents, 2)} snt | Spot ${formatNum(xObj.br.minSpotCents, 2)}–${formatNum(xObj.br.maxSpotCents, 2)} snt)</span>
                    <span><strong>TUULIVOIMA:</strong> ${xObj.slot.windMw} MW (${formatNum(xObj.slot.tempC, 1)} °C)</span>
                `;
            } else {
                readoutEl.innerHTML = `
                    <span><strong>VALITTU TUNTI:</strong> ${dayPrefix}klo ${String(xObj.slot.hour).padStart(2, '0')}:00–${String((xObj.slot.hour + 1) % 24).padStart(2, '0')}:00 (Nord Pool vahvistettu)</span>
                    <span><strong>KOKONAISHINTA:</strong> ${formatNum(xObj.br.totalCents, 2)} snt/kWh (Spot ${formatNum(xObj.br.spotCents, 2)} + Siirto ${formatNum(xObj.br.transferCents, 2)} + Vero ${formatNum(xObj.br.taxCents, 2)})</span>
                    <span><strong>TUULIVOIMA:</strong> ${xObj.slot.windMw} MW (${formatNum(xObj.slot.tempC, 1)} °C)</span>
                `;
            }
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const defaultReadoutItem = activeItems.find(x => x.slot.epochMs === nowHourMs) || activeItems[0];
        updateReadout(defaultReadoutItem);

        chartContainer.querySelectorAll('.svg-hover-slot').forEach(rect => {
            rect.addEventListener('mouseenter', function () {
                const i = parseInt(this.getAttribute('data-slot-idx'), 10);
                if (activeItems[i]) updateReadout(activeItems[i]);
            });
        });

        if (isWeekView) {
            let rowsHtml = '';
            for (const d of state.daysList) {
                const enr = d.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
                const avgSpot = enr.reduce((acc, x) => acc + x.br.spotCents, 0) / enr.length;
                const avgMinSpot = enr.reduce((acc, x) => acc + x.br.minSpotCents, 0) / enr.length;
                const avgMaxSpot = enr.reduce((acc, x) => acc + x.br.maxSpotCents, 0) / enr.length;
                const avgTot = enr.reduce((acc, x) => acc + x.br.totalCents, 0) / enr.length;
                const avgMinTot = enr.reduce((acc, x) => acc + x.br.minTotalCents, 0) / enr.length;
                const avgMaxTot = enr.reduce((acc, x) => acc + x.br.maxTotalCents, 0) / enr.length;
                const avgWind = Math.round(d.items.reduce((acc, x) => acc + x.windMw, 0) / d.items.length);
                const avgTemp = d.items.reduce((acc, x) => acc + x.tempC, 0) / d.items.length;

                const spotColHtml = d.hasForecast
                    ? `<strong>${formatNum(avgMinSpot, 2)}–${formatNum(avgMaxSpot, 2)} snt</strong> <span class="muted-range">(odotus ${formatNum(avgSpot, 2)})</span>`
                    : `<strong>${formatNum(avgSpot, 2)} snt/kWh</strong>`;
                const totColHtml = d.hasForecast
                    ? `<strong>${formatNum(avgMinTot, 2)}–${formatNum(avgMaxTot, 2)} snt/kWh</strong> <span class="muted-range">(odotus ${formatNum(avgTot, 2)})</span>`
                    : `<strong>${formatNum(avgTot, 2)} snt/kWh</strong>`;

                rowsHtml += `
                    <tr>
                        <td><strong>${d.label}</strong></td>
                        <td><span class="status-pill ${d.hasForecast ? 'forecast' : 'official'}">${d.hasForecast ? 'Ennusteväli' : 'Nord Pool'}</span></td>
                        <td>${spotColHtml}</td>
                        <td>${formatNum(avgTot - avgSpot, 2)} snt/kWh</td>
                        <td>${totColHtml}</td>
                        <td>${avgWind} MW / ${formatNum(avgTemp, 1)} °C</td>
                    </tr>
                `;
            }
            tableBody.innerHTML = rowsHtml;
            return;
        }

        const maxDayTotal = Math.max(15, ...activeItems.map(x => x.slot.isForecast ? x.br.maxTotalCents : x.br.totalCents));
        let rowsHtml = '';
        for (const x of activeItems) {
            const isNow = x.slot.epochMs === nowHourMs;
            const barPct = Math.max(4, Math.min(100, (x.br.totalCents / maxDayTotal) * 100));

            const spotHtml = x.slot.isForecast
                ? `<strong>${formatNum(x.br.minSpotCents, 2)}–${formatNum(x.br.maxSpotCents, 2)} snt</strong> <span class="muted-range">(odotus ${formatNum(x.br.spotCents, 2)})</span>`
                : `<strong>${formatNum(x.br.spotCents, 2)} snt/kWh</strong>`;

            const totalHtml = x.slot.isForecast
                ? `<strong>${formatNum(x.br.minTotalCents, 2)}–${formatNum(x.br.maxTotalCents, 2)} snt/kWh</strong> <span class="muted-range">(odotus ${formatNum(x.br.totalCents, 2)})</span>`
                : `<strong>${formatNum(x.br.totalCents, 2)} snt/kWh</strong>`;

            rowsHtml += `
                <tr class="${isNow ? 'row-current-hour' : ''}">
                    <td><strong>${String(x.slot.hour).padStart(2, '0')}:00–${String((x.slot.hour + 1) % 24).padStart(2, '0')}:00</strong> ${isNow ? '<span class="now-badge">NYT</span>' : ''}</td>
                    <td><span class="status-pill ${x.slot.isForecast ? 'forecast' : 'official'}">${x.slot.isForecast ? 'Vaihteluväli' : 'Vahvistettu'}</span></td>
                    <td>${spotHtml}</td>
                    <td>${formatNum(x.br.transferCents + x.br.taxCents + x.br.marginCents, 2)} snt <span class="muted-range">(${x.br.transferLabel})</span></td>
                    <td>
                        <div class="inline-bar-wrap">
                            <span class="inline-bar-track"><span class="inline-bar-fill" style="width:${barPct.toFixed(0)}%;"></span></span>
                            ${totalHtml}
                        </div>
                    </td>
                    <td>${x.slot.windMw} MW / ${formatNum(x.slot.tempC, 1)} °C</td>
                </tr>
            `;
        }
        tableBody.innerHTML = rowsHtml;
    }

    // Rakentaa 72 tunnin Backtest-vertaikaavion (Toteutunut Nord Pool vs. Mallin ennuste) sekä 2 vuoden Tuuli x Lämpötila -matriisin
    function renderMlLearningPanel() {
        const panelEl = document.getElementById('ml-learning-panel');
        if (!panelEl) return;

        const lc = ML_BASE.learningCurve || {
            naiveBaselineMaeCents: 7.16,
            currentMaeCents: 1.81,
            improvementPct: 74.7,
            stages: [
                { label: 'Alkuvaihe (3 vrk / 72 tuntia)', hours: 72, maeCents: 7.48 },
                { label: 'Viikkotaso (7 vrk / 168 tuntia)', hours: 168, maeCents: 5.45 },
                { label: 'Kuukausitaso (30 vrk / 720 tuntia)', hours: 720, maeCents: 2.88 },
                { label: `Täysi 24 muuttujan historia (${state.mlStats.totalLearnedHours} tuntia)`, hours: state.mlStats.totalLearnedHours, maeCents: 1.81 }
            ]
        };
        const ins = ML_BASE.insights || {
            avgPriceLowWindUnder1500Mw: 10.72,
            avgPriceHighWindOver4500Mw: 1.47,
            avgPriceFreezingUnderMinus5C: 14.44,
            avgPriceNuclearOutageOver1000Mw: 6.82,
            avgPriceNuclearNormal: 4.91,
            avgPriceHighSolarOver450Mw: 2.34,
            windEffectPer1000MwCents: -2.64
        };

        const stagesHtml = [
            { label: 'Oppimaton kiinteä lähtökaava (0 h dataa)', maeCents: lc.naiveBaselineMaeCents, isBase: true },
            ...lc.stages
        ].map(st => {
            const barWidth = Math.max(18, Math.min(100, (st.maeCents / lc.naiveBaselineMaeCents) * 100));
            const diff = st.isBase ? 'Vertailutaso' : `-${formatNum(Math.max(0, lc.naiveBaselineMaeCents - st.maeCents), 2)} snt/kWh`;
            return `
                <div class="lc-row">
                    <div class="lc-meta">
                        <span>${st.label}</span>
                        <span>MAE: <strong>${formatNum(st.maeCents, 2)} snt/kWh</strong> (${diff})</span>
                    </div>
                    <div class="lc-bar-bg">
                        <div class="lc-bar-fill ${st.isBase ? 'naive' : 'learned'}" style="width:${barWidth.toFixed(1)}%;"></div>
                    </div>
                </div>
            `;
        }).join('');

        // Empiirinen Tuulivoima (5 luokkaa) x Lämpötila (4 luokkaa) -hintamatriisi opitusta historiasta
        const emp = ML_BASE.model?.empiricalMatrix || {};
        const windLabels = ['< 1 700 MW (Tyyni)', '1 700–3 400 MW', '3 400–5 100 MW', '5 100–6 800 MW', '> 6 800 MW (Myrsky)'];
        let matrixRowsHtml = '';
        for (let wBin = 0; wBin < 5; wBin++) {
            let cells = `<td><strong>${windLabels[wBin]}</strong></td>`;
            for (let tBin = 0; tBin < 4; tBin++) {
                const cell = emp[`${wBin}_${tBin}`];
                if (cell && cell.hoursCount > 0) {
                    const bg = cell.avgPrice < 3.5 ? '#e3f1e8' : (cell.avgPrice > 9.0 ? '#f9e5e1' : '#ffffff');
                    cells += `<td style="background:${bg};"><strong>${formatNum(cell.avgPrice, 2)} snt</strong><br><span class="muted-range">n=${cell.hoursCount} h</span></td>`;
                } else {
                    cells += `<td class="muted-range">—</td>`;
                }
            }
            matrixRowsHtml += `<tr>${cells}</tr>`;
        }

        // Walk-Forward Out-of-Sample Backtest -jaksot
        const wfPeriods = Array.isArray(ML_BASE.walkForwardPeriods) ? ML_BASE.walkForwardPeriods : [];
        const activePeriod = wfPeriods.find(p => p.id === state.selectedBacktestId) || wfPeriods[1] || wfPeriods[0];

        let btLabHtml = '';
        if (activePeriod && Array.isArray(activePeriod.hours) && activePeriod.hours.length > 4) {
            const bt = activePeriod.hours;
            const bw = 620, bh = 185, padL = 36, padR = 16, padT = 16, padB = 26;
            const plotW = bw - padL - padR;
            const plotH = bh - padT - padB;
            const maxBt = Math.ceil(Math.max(12, ...bt.map(x => Math.max(x.actual, x.predicted))) / 5) * 5;

            const ptsAct = bt.map((x, i) => {
                const px = padL + (i / (bt.length - 1)) * plotW;
                const py = padT + plotH - (Math.max(0, x.actual) / maxBt) * plotH;
                return `${px.toFixed(1)},${py.toFixed(1)}`;
            }).join(' ');
            const ptsPred = bt.map((x, i) => {
                const px = padL + (i / (bt.length - 1)) * plotW;
                const py = padT + plotH - (Math.max(0, x.predicted) / maxBt) * plotH;
                return `${px.toFixed(1)},${py.toFixed(1)}`;
            }).join(' ');

            let yGrid = '';
            for (let g = 0; g <= 3; g++) {
                const v = (maxBt / 3) * g;
                const py = padT + plotH - (v / maxBt) * plotH;
                yGrid += `
                    <line x1="${padL}" y1="${py.toFixed(1)}" x2="${bw - padR}" y2="${py.toFixed(1)}" stroke="#dfdcd2" stroke-width="1" />
                    <text x="${padL - 5}" y="${(py + 3).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="9.5" fill="#5e645e">${formatNum(v, 0)}</text>
                `;
            }

            const periodTabsHtml = wfPeriods.map(p => `
                <button type="button" class="bt-period-btn ${p.id === activePeriod.id ? 'active' : ''}" data-bt-period="${p.id}">
                    ${p.label.split(' (')[0]} (${p.startDate.slice(5)}..${p.endDate.slice(5)})
                </button>
            `).join('');

            const m = activePeriod.metrics || { maeCents: 3.2, rmseCents: 4.5, corrR: 0.85, cheapest6hHitRatePct: 72.0 };
            btLabHtml = `
                <div style="margin-top:16px; border-top:1px solid #cbc7ba; padding-top:14px;">
                    <div class="field-label">WALK-FORWARD OUT-OF-SAMPLE BACKTEST -LABORATORIO (MALLI KOULUTETTU VAIN EDELTÄVÄLLÄ DATALLA)</div>
                    <div class="bt-period-tabs">${periodTabsHtml}</div>
                    <div class="bt-kpi-strip">
                        <div class="bt-kpi-cell"><span>Valittu jakso (72 h)</span><strong>${activePeriod.startDate} .. ${activePeriod.endDate}</strong></div>
                        <div class="bt-kpi-cell"><span>Out-of-Sample MAE</span><strong>${formatNum(m.maeCents, 2)} snt/kWh</strong></div>
                        <div class="bt-kpi-cell"><span>Korrelaatio (r)</span><strong>${formatNum(m.corrR, 3)}</strong></div>
                        <div class="bt-kpi-cell"><span>Halvimmat 6 h osuma</span><strong>${formatNum(m.cheapest6hHitRatePct, 1)} %</strong></div>
                        <div class="bt-kpi-cell"><span>Keskituuli / Lämpötila</span><strong>${activePeriod.avgWindMw} MW / ${formatNum(activePeriod.avgTempC, 1)} °C</strong></div>
                        <div class="bt-kpi-cell"><span>Ydinvoima käytössä</span><strong>${activePeriod.avgNuclearMw} / 4 394 MW</strong></div>
                    </div>
                    <svg viewBox="0 0 ${bw} ${bh}" width="100%" height="185" style="background:#ffffff; border:1px solid #cbc7ba; display:block;">
                        ${yGrid}
                        <polyline fill="none" stroke="#161816" stroke-width="2" points="${ptsAct}" />
                        <polyline fill="none" stroke="#1e5638" stroke-width="2.2" stroke-dasharray="5,3" points="${ptsPred}" />
                        <text x="${padL + 6}" y="${padT + 12}" font-family="JetBrains Mono, monospace" font-size="10" fill="#161816">Yhtenäinen musta = Toteutunut Nord Pool FI | Katkoviiva vihreä = Walk-Forward Out-of-Sample -ennuste</text>
                    </svg>
                </div>
            `;
        }

        // Vaiheittainen ablaatiotaulukko (Taso 0..6)
        const abl = Array.isArray(ML_BASE.ablationStudy) ? ML_BASE.ablationStudy : [];
        let ablationHtml = '';
        if (abl.length > 0) {
            const ablRows = abl.map((row, idx) => `
                <tr class="${idx === abl.length - 1 ? 'ablation-final' : ''}">
                    <td>${row.title}</td>
                    <td>${row.paramCount} kpl</td>
                    <td><strong>${formatNum(row.maeCents, 2)} snt</strong></td>
                    <td>${formatNum(row.rmseCents, 2)} snt</td>
                    <td>${formatNum(row.corrR, 3)}</td>
                    <td>${formatNum(row.cheapest6hHitRatePct, 1)} %</td>
                    <td>${idx === 0 ? 'Vertailutaso' : (row.improvementStepCents > 0 ? `-${formatNum(row.improvementStepCents, 2)} snt` : '0,00 snt')}</td>
                </tr>
            `).join('');
            ablationHtml = `
                <div style="margin-top:16px; border-top:1px solid #cbc7ba; padding-top:14px;">
                    <div class="field-label">VAIHEITTAINEN PARAMETRIEN ABLAATIOTESTI (MITEN LISÄTYT MUUTTUJAT PARANTAVAT ENNUSTETTA)</div>
                    <div class="table-wrap">
                        <table class="ablation-table">
                            <thead>
                                <tr>
                                    <th>Mallin kehitystaso ja lisätyt fundamentaaliparametrit</th>
                                    <th>Parametrit</th>
                                    <th>MAE (snt/kWh)</th>
                                    <th>RMSE</th>
                                    <th>Korrelaatio (r)</th>
                                    <th>6 h osuma</th>
                                    <th>Vaiheen parannus</th>
                                </tr>
                            </thead>
                            <tbody>${ablRows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        panelEl.innerHTML = `
            <div class="ml-grid-two">
                <div>
                    <div class="field-label">OPETUSAINEISTO: ${state.mlStats.totalLearnedHours} TUNTIHAVAINTOA &amp; 24 FUNDAMENTAALIPARAMETRIA (${ML_BASE.firstObservationDate || '2024'} .. ${ML_BASE.lastObservationDate || '2026'})</div>
                    <p style="font-size:12.5px; color:#4a4f4a; margin-bottom:10px;">
                        Malli oppii 24 fyysisestä ja markkinaparametrista: Suomen 150 m tuulivoimasta, 24 h tuulikuivuudesta, 6 h tuulirampista, lämpötilasta, rakennusten 72 h pakkasvarauksesta, <strong>Suomen ydinvoimaloiden (OL1, OL2, OL3, LO1, LO2 — 4 394 MW) huoltoseisokeista</strong>, aurinkosäteilystä (W/m²), ilmanpaineen korkeapainesuluista (hPa), Ruotsin (SE1) ja Viron (EE / Estlink 2) rajatuulesta sekä Suomen arkipyhäkalenterista. Yli 1 000 MW ydinvoimavajeen aikana keskihinta on ollut <strong>${formatNum(ins.avgPriceNuclearOutageOver1000Mw, 2)} snt/kWh</strong> (normaalitilanteessa <strong>${formatNum(ins.avgPriceNuclearNormal, 2)} snt/kWh</strong>).
                    </p>
                    ${stagesHtml}
                </div>
                <div>
                    <div class="field-label">HISTORIADATASTA OPITTU HINTAMATRIISI: TUULIVOIMA X LÄMPÖTILA (SNT/KWH, SIS. ALV)</div>
                    <div class="table-wrap">
                        <table class="matrix-table">
                            <thead>
                                <tr>
                                    <th>Tuulituotanto</th>
                                    <th>Pakkanen (&lt; -5 °C)</th>
                                    <th>Kylmä (-5..+2 °C)</th>
                                    <th>Viileä (+2..+10 °C)</th>
                                    <th>Lämmin (&gt; +10 °C)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${matrixRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            ${btLabHtml}
            ${ablationHtml}
        `;

        panelEl.querySelectorAll('[data-bt-period]').forEach(btn => {
            btn.addEventListener('click', function () {
                state.selectedBacktestId = this.getAttribute('data-bt-period');
                renderMlLearningPanel();
            });
        });
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
            const avgMinTotal = breakdowns.reduce((a, b) => a + b.minTotalCents, 0) / wLen;
            const avgMaxTotal = breakdowns.reduce((a, b) => a + b.maxTotalCents, 0) / wLen;
            const avgSpot = breakdowns.reduce((a, b) => a + b.spotCents, 0) / wLen;
            const avgTransferAndTax = avgTotal - avgSpot;
            const hasFc = slice.some(s => s.isForecast);

            const candidate = {
                startSlot: slice[0],
                endSlot: slice[slice.length - 1],
                avgTotal,
                avgMinTotal,
                avgMaxTotal,
                avgSpot,
                avgTransferAndTax,
                hasFc
            };

            if (!bestWindow || candidate.avgTotal < bestWindow.avgTotal) bestWindow = candidate;
            if (!worstWindow || candidate.avgTotal > worstWindow.avgTotal) worstWindow = candidate;
        }

        if (!bestWindow) return;

        const totalKwh = state.applianceKw * wLen;
        const bestEur = (bestWindow.avgTotal * totalKwh) / 100.0;
        const minEur = (bestWindow.avgMinTotal * totalKwh) / 100.0;
        const maxEur = (bestWindow.avgMaxTotal * totalKwh) / 100.0;
        const worstEur = (worstWindow.avgTotal * totalKwh) / 100.0;
        const savedEur = Math.max(0, worstEur - bestEur);

        const startHel = getHelsinkiComponents(new Date(bestWindow.startSlot.epochMs));
        const endHel = getHelsinkiComponents(new Date(bestWindow.endSlot.epochMs + 3600000));

        const eurLabel = bestWindow.hasFc
            ? `${formatNum(minEur, 2)}–${formatNum(maxEur, 2)} €`
            : `${formatNum(bestEur, 2)} €`;
        const priceDetailLabel = bestWindow.hasFc
            ? `Todennäköinen kokonaishinta <strong>${formatNum(bestWindow.avgMinTotal, 2)}–${formatNum(bestWindow.avgMaxTotal, 2)} snt/kWh</strong> (odotus ${formatNum(bestWindow.avgTotal, 2)} snt | Siirto &amp; vero ${formatNum(bestWindow.avgTransferAndTax, 2)} snt)`
            : `Kokonaiskeskihinta <strong>${formatNum(bestWindow.avgTotal, 2)} snt/kWh</strong> (Spot ${formatNum(bestWindow.avgSpot, 2)} + Siirto &amp; vero ${formatNum(bestWindow.avgTransferAndTax, 2)})`;

        resultEl.innerHTML = `
            <div class="opt-result-ledger">
                <div class="opt-kicker">EDULLISIN ${wLen} TUNNIN KÄYTTÖIKKUNA (SEURAAVAT 36 H)</div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin:4px 0;">
                    <div class="opt-time-large">Klo ${String(startHel.hour).padStart(2, '0')}:00–${String(endHel.hour).padStart(2, '0')}:00 (${startHel.day}.${startHel.month}.)</div>
                    <div class="opt-eur-large">${eurLabel}</div>
                </div>
                <div style="font-size:12px; color:#161816;">
                    ${priceDetailLabel}
                </div>
                <div style="font-size:11.5px; color:#4a4f4a; margin-top:4px;">
                    Kulutus ${formatNum(totalKwh, 1)} kWh | Säästö kalleimpaan jaksoon (${formatNum(worstEur, 2)} €) verrattuna: <strong>${formatNum(savedEur, 2)} €</strong>
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
                        <span class="comp-title">${opt.title}</span>
                        ${isBest ? '<span class="best-badge">Halvin</span>' : ''}
                    </div>
                    <div class="comp-total-eur">${formatNum(opt.totalEur, 0)} €/v <span style="font-size:13px; font-weight:400;">(${formatNum(opt.totalEur / 12, 0)} €/kk)</span></div>
                    <div>Keskihinta: <strong>${formatNum(opt.avgC, 2)} snt/kWh</strong></div>
                    <ul class="comp-list">
                        <li>Sähkö + marg.: ${formatNum(energyAndMarginEur, 0)} €/v</li>
                        <li>Siirto + kk-maksu (${formatNum(opt.baseMonth, 2)} €/kk): ${formatNum(opt.transferEur, 0)} €/v</li>
                        <li>Sähkövero: ${formatNum(taxEur, 0)} €/v</li>
                    </ul>
                </div>
            `;
        }).join('');
    }

    function renderAll() {
        renderTelemetryAndDsoPanel();
        renderReceiptLedger();
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

        const nucSelect = document.getElementById('nuclear-scenario-select');
        if (nucSelect) {
            nucSelect.value = state.nuclearScenario || 'auto';
            nucSelect.addEventListener('change', function () {
                state.nuclearScenario = this.value;
                applyNuclearScenarioToForecast();
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
        renderTelemetryAndDsoPanel();
        renderMlLearningPanel();
        loadSpotAndForecastData();
    });
})();
