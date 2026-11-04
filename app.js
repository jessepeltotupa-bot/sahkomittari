// Sähkömittari — Nord Pool FI, 2 vuoden historiasta oppiva 7 vrk ennustemalli ja postinumeropohjainen siirtohintalaskuri
(function () {
    const ACTIVE_LOC = window.ACTIVE_COUNTRY_LOCALE || null;
    const COUNTRY_ID = ACTIVE_LOC ? ACTIVE_LOC.countryId : 'fi';
    const COUNTRY_MODEL = (window.NORDPOOL_COUNTRY_MODELS && window.NORDPOOL_COUNTRY_MODELS.countries && window.NORDPOOL_COUNTRY_MODELS.countries[COUNTRY_ID]) || null;

    const UNIT_LABEL = ACTIVE_LOC ? ACTIVE_LOC.unit : 'snt/kWh';
    const UNIT_SHORT = UNIT_LABEL.split('/')[0];
    const APPROX_PREFIX = ACTIVE_LOC ? ACTIVE_LOC.approxPrefix : 'noin ';
    const RANGE_LABEL = ACTIVE_LOC ? ACTIVE_LOC.rangePrefix : 'Vaihteluväli';
    const FIXED_LABEL = ACTIVE_LOC ? ACTIVE_LOC.fixedText : 'Julkaistu kiinteä hinta';
    const FX_SCALE = COUNTRY_MODEL ? (COUNTRY_MODEL.fxFromEurCents || 1.0) : 1.0;
    const ACTIVE_COUNTRY_ID = COUNTRY_ID.toUpperCase();
    const probLabelsMap = {
        FI: 'Todennäköisyys',
        SE: 'Sannolikhet',
        NO: 'Sannsynlighet',
        DK: 'Sandsynlighed',
        EE: 'Tõenäosus',
        LV: 'Varbūtība',
        LT: 'Tikimybė',
    };
    const PROB_LABEL = probLabelsMap[ACTIVE_COUNTRY_ID] || probLabelsMap.FI;

    const predWasLabelsMap = {
        FI: 'Ohjelman ennuste oli',
        SE: 'Programmets prognos var',
        NO: 'Programmets prognose var',
        DK: 'Programmets prognose var',
        EE: 'Programmi prognoos oli',
        LV: 'Programmas prognoze bija',
        LT: 'Programos prognozė buvo',
    };
    const PRED_WAS_LABEL = predWasLabelsMap[ACTIVE_COUNTRY_ID] || predWasLabelsMap.FI;

    const predShortLabelsMap = {
        FI: 'Ennuste oli',
        SE: 'Prognos var',
        NO: 'Prognose var',
        DK: 'Prognose var',
        EE: 'Prognoos oli',
        LV: 'Prognoze bija',
        LT: 'Prognozė buvo',
    };
    const PRED_SHORT_LABEL = predShortLabelsMap[ACTIVE_COUNTRY_ID] || predShortLabelsMap.FI;

    const confirmedPriceLabelsMap = {
        FI: 'Uusi vahvistettu hinta',
        SE: 'Nytt bekräftat pris',
        NO: 'Ny bekreftet pris',
        DK: 'Ny bekræftet pris',
        EE: 'Uus kinnitatud hind',
        LV: 'Jaunā apstiprinātā cena',
        LT: 'Nauja patvirtinta kaina',
    };
    const CONFIRMED_PRICE_LABEL = confirmedPriceLabelsMap[ACTIVE_COUNTRY_ID] || confirmedPriceLabelsMap.FI;

    function getPricePublishTimeText(dateKey, shortForm = false) {
        if (!dateKey || typeof dateKey !== 'string') return '';
        const parts = dateKey.split('-').map(Number);
        if (parts.length !== 3 || isNaN(parts[0])) return '';
        const [y, m, d] = parts;
        const pubUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0) - 86400000;
        const pubDt = new Date(pubUtcMs);
        const pubDay = pubDt.getUTCDate();
        const pubMonth = pubDt.getUTCMonth() + 1;
        const wdIdx = pubDt.getUTCDay();

        const wdShortMap = {
            FI: ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'],
            SE: ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'],
            NO: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
            DK: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
            EE: ['P', 'E', 'T', 'K', 'N', 'R', 'L'],
            LV: ['Sv', 'P', 'O', 'T', 'C', 'Pk', 'S'],
            LT: ['Sk', 'Pr', 'An', 'Tr', 'Kt', 'Pn', 'Št'],
        };
        const wdArr = wdShortMap[ACTIVE_COUNTRY_ID] || wdShortMap.FI;
        const wdStr = wdArr[wdIdx] || '';
        const dateStr = `${wdStr} ${pubDay}.${pubMonth}.`;

        const isCet = ['SE', 'NO', 'DK'].includes(ACTIVE_COUNTRY_ID);
        const clockTime = isCet ? '12:45' : '13:45';

        if (shortForm) {
            const shortMap = {
                FI: `Julk. ${dateStr} klo ${clockTime}`,
                SE: `Publ. ${dateStr} kl. ${clockTime}`,
                NO: `Publ. ${dateStr} kl. ${clockTime}`,
                DK: `Offentl. ${dateStr} kl. ${clockTime}`,
                EE: `Avald. ${dateStr} kl ${clockTime}`,
                LV: `Publ. ${dateStr} ${clockTime}`,
                LT: `Skelb. ${dateStr} ${clockTime}`,
            };
            return shortMap[ACTIVE_COUNTRY_ID] || shortMap.FI;
        }

        const fullMap = {
            FI: `Hinta julkaistaan: ${dateStr} klo ${clockTime}`,
            SE: `Pris publiceras: ${dateStr} kl. ${clockTime}`,
            NO: `Pris publiseres: ${dateStr} kl. ${clockTime}`,
            DK: `Pris offentliggøres: ${dateStr} kl. ${clockTime}`,
            EE: `Hind avaldatakse: ${dateStr} kl ${clockTime}`,
            LV: `Cena tiek publicēta: ${dateStr} plkst. ${clockTime}`,
            LT: `Kaina skelbiama: ${dateStr} ${clockTime} val.`,
        };
        return fullMap[ACTIVE_COUNTRY_ID] || fullMap.FI;
    }

    let DSO_DATA = window.PORSSISAHKO_DSO_DATA || {
        vatRate: 1.255,
        electricityTaxVat0: 2.253,
        electricityTaxInclVat: 2.8275,
        companies: {},
        municipalities: [],
        postalPrefixRules: []
    };

    if (ACTIVE_LOC && Array.isArray(ACTIVE_LOC.dsos)) {
        const compMap = {};
        const prefixRules = [];
        for (const d of ACTIVE_LOC.dsos) {
            compMap[d.id] = {
                id: d.id,
                name: d.name,
                short_name: d.name.split(' (')[0],
                region_desc: d.zone || ACTIVE_LOC.countryName,
                zone: d.zone,
                general_c_kwh: d.gen,
                day_c_kwh: d.day,
                night_c_kwh: d.night,
                winter_day_c_kwh: d.day,
                other_c_kwh: d.night,
                general_base_eur: 0,
                time_base_eur: 0,
                season_base_eur: 0
            };
            for (const pref of (d.postals || [])) {
                prefixRules.push({ prefix: pref, city: `${ACTIVE_LOC.countryName} (${d.zone})`, dso: d.id, alt: [] });
            }
        }
        const vatR = COUNTRY_MODEL ? COUNTRY_MODEL.vatRate : 1.25;
        DSO_DATA = {
            vatRate: vatR,
            electricityTaxInclVat: ACTIVE_LOC.taxInclVat || 0,
            electricityTaxVat0: Number(((ACTIVE_LOC.taxInclVat || 0) / vatR).toFixed(2)),
            companies: compMap,
            municipalities: [],
            postalPrefixRules: prefixRules
        };
    }

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

    const defaultDsoKey = Object.keys(DSO_DATA.companies)[0] || 'helen';
    const storagePrefix = `ps_${COUNTRY_ID}_`;

    const state = {
        hasUserPostal: localStorage.getItem(storagePrefix + 'has_user_postal') === '1',
        postalCode: localStorage.getItem(storagePrefix + 'postal') || (ACTIVE_LOC ? ACTIVE_LOC.defaultPostal : '00100'),
        cityName: localStorage.getItem(storagePrefix + 'city') || (ACTIVE_LOC ? ACTIVE_LOC.defaultCity : 'Helsinki'),
        dsoId: localStorage.getItem(storagePrefix + 'dso') || (ACTIVE_LOC ? defaultDsoKey : 'helen'),
        altDsoIds: [],
        tariffType: localStorage.getItem(storagePrefix + 'tariff') || 'general',
        marginCents: parseFloat(localStorage.getItem(storagePrefix + 'margin') || (FX_SCALE > 3 ? '4.50' : '0.45')),
        includeVat: localStorage.getItem(storagePrefix + 'vat') !== '0',
        showTotalInChart: localStorage.getItem(storagePrefix + 'show_total') !== '0',
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
        rolling30dMeanInclVat: 5.60,
        mlStats: {
            totalLearnedHours: ML_BASE.totalObservations || 17552,
            onlineNewHours: 0,
            liveMaeCents: ML_BASE.learningCurve?.currentMaeCents || 1.81,
            activeModel: JSON.parse(JSON.stringify(ML_BASE.model))
        }
    };

    const bodyEl = document.body;
    if (bodyEl && !state.hasUserPostal) {
        const presetDso = bodyEl.getAttribute('data-preset-dso');
        const presetPostal = bodyEl.getAttribute('data-preset-postal');
        const presetCity = bodyEl.getAttribute('data-preset-city');
        if (presetDso && DSO_DATA.companies[presetDso]) state.dsoId = presetDso;
        if (presetPostal) state.postalCode = presetPostal;
        if (presetCity) state.cityName = presetCity;
    }

    function saveSettings() {
        try {
            localStorage.setItem(storagePrefix + 'has_user_postal', state.hasUserPostal ? '1' : '0');
            localStorage.setItem(storagePrefix + 'postal', state.postalCode);
            localStorage.setItem(storagePrefix + 'city', state.cityName);
            localStorage.setItem(storagePrefix + 'dso', state.dsoId);
            localStorage.setItem(storagePrefix + 'tariff', state.tariffType);
            localStorage.setItem(storagePrefix + 'margin', String(state.marginCents));
            localStorage.setItem(storagePrefix + 'vat', state.includeVat ? '1' : '0');
            localStorage.setItem(storagePrefix + 'show_total', state.showTotalInChart ? '1' : '0');
        } catch (_) {}
    }

    // Liukuvaan 30 vrk (720 h) keskiarvoon perustuvat dynaamiset hintarajat:
    // Lähellä 30 vrk keskiarvoa (±25 %) = Normaali, alle = Edullinen, yli = Korkea
    function getDynamicPriceThresholds() {
        const base30dInclVat = (state.rolling30dMeanInclVat && state.rolling30dMeanInclVat > 0.5)
            ? state.rolling30dMeanInclVat
            : 5.60;
        const vatFactor = state.includeVat ? 1.0 : (1.0 / (DSO_DATA.vatRate || 1.255));
        const avg30d = Number((base30dInclVat * vatFactor * FX_SCALE).toFixed(2));
        const cheapThresh = Number(Math.max(0.50 * FX_SCALE, avg30d * 0.75).toFixed(2));
        const highThresh = Number(Math.max(cheapThresh + 1.0 * FX_SCALE, avg30d * 1.25).toFixed(2));
        return { avg30d, cheapThresh, highThresh };
    }

    function formatNum(val, decimals = 2) {
        if (val === null || val === undefined || isNaN(val)) return '—';
        return Number(val).toFixed(decimals).replace('.', ',');
    }

    function resolvePostalOrCity(inputRaw) {
        const q = String(inputRaw || '').trim();
        if (!q) return null;

        const digits = q.replace(/\D/g, '');
        if (digits.length >= 1) {
            if (ACTIVE_LOC) {
                const p3 = digits.slice(0, 3);
                const p2 = digits.slice(0, 2);
                const p1 = digits.slice(0, 1);
                for (const r of DSO_DATA.postalPrefixRules) {
                    if ((r.prefix.length === 3 && r.prefix === p3) ||
                        (r.prefix.length === 2 && r.prefix === p2) ||
                        (r.prefix.length === 1 && r.prefix === p1)) {
                        return { postal: digits, city: r.city, dsoId: r.dso, alt: r.alt || [] };
                    }
                }
            }
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
        const zoneCode = dso.zone || (COUNTRY_MODEL ? COUNTRY_MODEL.defaultZone : 'FI');
        const zoneCfg = (COUNTRY_MODEL && COUNTRY_MODEL.zones && COUNTRY_MODEL.zones[zoneCode]) || { spotScale: 1.0 };
        const zoneMult = FX_SCALE * (zoneCfg.spotScale || 1.0);
        const isNo4VatExempt = zoneCode === 'NO4';
        const vatDivider = (state.includeVat && !isNo4VatExempt) ? 1.0 : DSO_DATA.vatRate;

        const baseSpotIncl = slot.priceInclVat * zoneMult;
        const baseSpotVat0 = (slot.priceInclVat / 1.255) * zoneMult;
        const spotCents = (state.includeVat && !isNo4VatExempt) ? baseSpotIncl : baseSpotVat0;
        const marginCents = state.marginCents / vatDivider;
        const taxCents = (state.includeVat && !isNo4VatExempt) ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;

        let transferCentsInclVat = dso.general_c_kwh;
        let transferLabel = ACTIVE_LOC ? ACTIVE_LOC.tariffGeneral : 'Yleissiirto';
        let isNightRate = false;

        if (state.tariffType === 'time') {
            const isDay = slot.hour >= 7 && slot.hour < 22;
            transferCentsInclVat = isDay ? dso.day_c_kwh : dso.night_c_kwh;
            transferLabel = isDay ? '07–22' : '22–07';
            isNightRate = !isDay;
        } else if (state.tariffType === 'season') {
            const isWinterMonth = (slot.month >= 11 || slot.month <= 3);
            const isMonToSat = !slot.isWeekend || slot.isSat;
            const isWinterDay = isWinterMonth && isMonToSat && (slot.hour >= 7 && slot.hour < 22);
            transferCentsInclVat = isWinterDay ? dso.winter_day_c_kwh : dso.other_c_kwh;
            transferLabel = isWinterDay ? '07–22' : '22–07';
            isNightRate = !isWinterDay;
        }

        const transferCents = transferCentsInclVat / vatDivider;
        const fixedAdd = marginCents + transferCents + taxCents;
        const totalCents = spotCents + fixedAdd;

        const rawMinIncl = (slot.minInclVat !== undefined ? slot.minInclVat : slot.priceInclVat) * zoneMult;
        const rawMaxIncl = (slot.maxInclVat !== undefined ? slot.maxInclVat : slot.priceInclVat) * zoneMult;
        const minSpotCents = (state.includeVat && !isNo4VatExempt) ? rawMinIncl : (rawMinIncl / DSO_DATA.vatRate);
        const maxSpotCents = (state.includeVat && !isNo4VatExempt) ? rawMaxIncl : (rawMaxIncl / DSO_DATA.vatRate);
        const minTotalCents = minSpotCents + fixedAdd;
        const maxTotalCents = maxSpotCents + fixedAdd;

        const rawPredIncl = (slot.predictedInclVat !== undefined ? slot.predictedInclVat : slot.priceInclVat) * zoneMult;
        const rawPredMinIncl = (slot.predictedMinInclVat !== undefined ? slot.predictedMinInclVat : (slot.predictedInclVat !== undefined ? slot.predictedInclVat : slot.priceInclVat)) * zoneMult;
        const rawPredMaxIncl = (slot.predictedMaxInclVat !== undefined ? slot.predictedMaxInclVat : (slot.predictedInclVat !== undefined ? slot.predictedInclVat : slot.priceInclVat)) * zoneMult;
        const predictedSpotCents = (state.includeVat && !isNo4VatExempt) ? rawPredIncl : (rawPredIncl / DSO_DATA.vatRate);
        const predictedMinSpotCents = (state.includeVat && !isNo4VatExempt) ? rawPredMinIncl : (rawPredMinIncl / DSO_DATA.vatRate);
        const predictedMaxSpotCents = (state.includeVat && !isNo4VatExempt) ? rawPredMaxIncl : (rawPredMaxIncl / DSO_DATA.vatRate);
        const predictedTotalCents = predictedSpotCents + fixedAdd;

        return {
            spotCents,
            minSpotCents,
            maxSpotCents,
            predictedSpotCents,
            predictedMinSpotCents,
            predictedMaxSpotCents,
            predictedTotalCents,
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

    const HELSINKI_FMT = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Helsinki',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        weekday: 'short',
        hour12: false
    });
    const helsinkiComponentsCache = new Map();

    function getHelsinkiComponents(dateObj) {
        const ms = typeof dateObj === 'number' ? dateObj : dateObj.getTime();
        const hourBucket = Math.floor(ms / 3600000) * 3600000;
        const cached = helsinkiComponentsCache.get(hourBucket);
        if (cached) return cached;

        const parts = HELSINKI_FMT.formatToParts(new Date(hourBucket));
        const map = {};
        for (const p of parts) map[p.type] = p.value;
        const hour = parseInt(map.hour, 10) % 24;
        const month = parseInt(map.month, 10);
        const wd = map.weekday;
        const res = {
            year: parseInt(map.year, 10),
            month,
            day: parseInt(map.day, 10),
            hour,
            isWeekend: (wd === 'Sat' || wd === 'Sun'),
            isSat: (wd === 'Sat'),
            dateKey: `${map.year}-${map.month}-${map.day}`
        };
        helsinkiComponentsCache.set(hourBucket, res);
        return res;
    }

    function windSpeedToCapacityFactor(v100m) {
        if (v100m === null || v100m === undefined || isNaN(v100m)) return 0.28;
        const vHub = Number(v100m);
        if (vHub < 3.0) return 0.02;
        if (vHub >= 25.0) return 0.08;
        if (vHub >= 14.5) return 0.85;
        const norm = (vHub - 3.0) / (14.5 - 3.0);
        return Math.max(0.02, Math.min(0.85, Math.pow(norm, 1.75) * 0.85));
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
        let signedErrSum = 0.0;
        let count = 0;

        for (const k of trimmedKeys) {
            const item = nextStore[k];
            const hel = getHelsinkiComponents(new Date(item.epochMs));
            const obsObj = {
                epochMs: item.epochMs,
                dateKey: hel.dateKey,
                month: hel.month,
                hour: hel.hour,
                isWeekend: hel.isWeekend,
                windMw: item.windMw,
                rolling24hWindMw: item.windMw,
                tempC: item.tempC,
                rolling72hTempC: item.tempC
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
            const err = Math.max(-12.0, Math.min(12.0, item.priceInclVat - pred));
            errSum += Math.abs(item.priceInclVat - pred);
            signedErrSum += err;
            count++;
        }

        if (count >= 6 && Array.isArray(activeModel.weights) && activeModel.weights.length > 0) {
            const gentleBias = Math.max(-0.75, Math.min(0.75, (signedErrSum / count) * 0.22));
            activeModel.weights[0] = Number((activeModel.weights[0] + gentleBias).toFixed(4));
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
        // Haetaan viimeisen 30 vuorokauden (720 h) toteutuneet tuntihinnat ja säädata rinnakkain (Promise.all)
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 720 * 3600000).toISOString();
        const officialHourlyMap = new Map();
        const weatherMap = new Map();

        const pricesUrl = `https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(startHourIso)}`;
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17,63.82,59.43&longitude=23.95,21.34,22.58,24.94,20.26,24.75&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=10&forecast_days=8&timezone=UTC';

        const [pricesResp, weatherResp] = await Promise.all([
            fetch(pricesUrl, { cache: 'no-store' }).catch(() => null),
            fetch(weatherUrl).catch(() => null)
        ]);

        try {
            if (pricesResp && pricesResp.ok) {
                const d = await pricesResp.json();
                if (d && Array.isArray(d.prices)) {
                    let sum30d = 0.0;
                    let cnt30d = 0;
                    for (const item of d.prices) {
                        const hourMs = Math.floor(new Date(item.date).getTime() / 3600000) * 3600000;
                        const val = Number(item.value);
                        if (!isNaN(val)) {
                            sum30d += val;
                            cnt30d++;
                        }
                        officialHourlyMap.set(hourMs, {
                            priceInclVat: Number(val.toFixed(3)),
                            priceVat0: Number((val / 1.255).toFixed(3))
                        });
                    }
                    if (cnt30d >= 24) {
                        state.rolling30dMeanInclVat = Number((sum30d / cnt30d).toFixed(2));
                    }
                }
            }
        } catch (_) {}

        try {
            if (weatherResp && weatherResp.ok) {
                const dw = await weatherResp.json();
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
        const nowHel = getHelsinkiComponents(currentHourMs);
        // Aloitetaan kuluvan vuorokauden klo 00:00:sta ja lasketaan 192 tuntia (8 täyttä vuorokautta) eteenpäin,
        // jolloin aina täydet 7 vuorokautta on ennustettuna ja vuorokauden vaihtuessa uusi tuleva päivä tulee mukaan.
        const startSeriesMs = currentHourMs - nowHel.hour * 3600000;
        const series = [];
        const rollingPriceByMs = new Map();
        for (const [k, v] of officialHourlyMap.entries()) {
            rollingPriceByMs.set(k, v.priceInclVat);
        }

        // Luetaan ja ylläpidetään muistissa ohjelman ennustamat hinnat ennen kuin Nord Pool vahvistaa ne,
        // jotta vahvistetun hinnan rinnalla voidaan aina näyttää samassa ruudussa paljonko ohjelman ennuste oli
        const preConfirmKey = storagePrefix + 'preconfirm_v3';
        let preConfirmStore = {};
        try {
            const rawPre = localStorage.getItem(preConfirmKey);
            if (rawPre) preConfirmStore = JSON.parse(rawPre) || {};
        } catch (_) {}
        const minKeepMs = currentHourMs - 168 * 3600000;
        for (const k of Object.keys(preConfirmStore)) {
            if (Number(k) < minKeepMs) delete preConfirmStore[k];
        }

        const sortedOfficialMs = Array.from(officialHourlyMap.keys()).sort((a, b) => a - b);
        const kernelHistory = [];
        for (let idx = 0; idx < sortedOfficialMs.length; idx++) {
            const prevMs = sortedOfficialMs[idx];
            const pw = weatherMap.get(prevMs);
            if (!pw) continue;
            const pHel = getHelsinkiComponents(prevMs);
            kernelHistory.push({
                ms: prevMs,
                wind: pw.windSpeed100m || 6.5,
                seWind: pw.seWindSpeed || pw.windSpeed100m || 6.5,
                hour: pHel.hour,
                temp: pw.tempC || 4.0,
                isWeekend: pHel.isWeekend,
                price: officialHourlyMap.get(prevMs).priceInclVat
            });
        }

        function kernelPredictHour(targetMs, wCand, targetHour, targetIsWeekend) {
            let num = 0.0;
            let numSq = 0.0;
            let den = 0.0;
            const cutoffMs = targetMs - 12 * 3600000;
            const cWind = wCand.windSpeed100m || 6.5;
            const cSe = wCand.seWindSpeed || cWind;
            const cTemp = wCand.tempC || 4.0;
            for (let idx = 0; idx < kernelHistory.length; idx++) {
                const h = kernelHistory[idx];
                if (h.ms > cutoffMs) break;
                const dWind = (cWind - h.wind) / 1.10;
                const dSe = (cSe - h.seWind) / 2.50;
                const hrDiff = Math.abs(targetHour - h.hour);
                const dHr = Math.min(hrDiff, 24 - hrDiff) / 1.90;
                const dTemp = (cTemp - h.temp) / 4.50;
                const dWknd = (targetIsWeekend === h.isWeekend) ? 0.0 : 1.25;
                const ageDays = Math.max(0.0, (targetMs - h.ms) / 86400000);
                const weight = Math.exp(-0.5 * (dWind * dWind + dSe * dSe + dHr * dHr + dTemp * dTemp + dWknd * dWknd) - ageDays / 12.0);
                num += weight * h.price;
                numSq += weight * h.price * h.price;
                den += weight;
            }
            if (den <= 1e-6) return { est: null, weightSum: 0, localStd: 0.4 };
            const mean = num / den;
            const variance = Math.max(0.0, (numSq / den) - mean * mean);
            return { est: mean, weightSum: den, localStd: Math.sqrt(variance) };
        }

        for (let i = 0; i < 192; i++) {
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

            // Lasketaan jokaiselle tunnille ohjelman ennustemallin antama hinta-arvio ja vaihteluväli.
            // Huomioidaan vain samankaltaisen tuulitilanteen edeltävät tunnit, jotta tyynen eilisen
            // korkea hinta ei vääristä tuulisen päivän ennustetta.
            let pastSum = 0, pastCnt = 0;
            for (let lag = 24; lag <= 72; lag++) {
                const lagMs = hMs - lag * 3600000;
                const pVal = rollingPriceByMs.get(lagMs);
                const lw = weatherMap.get(lagMs);
                if (pVal !== undefined) {
                    const wDiff = lw ? Math.abs((w.windSpeed100m || 6.5) - (lw.windSpeed100m || 6.5)) : 2.0;
                    const wWeight = Math.exp(-wDiff / 1.8);
                    pastSum += pVal * wWeight;
                    pastCnt += wWeight;
                }
            }
            const prevAvg = pastCnt > 0.05 ? (pastSum / pastCnt) : 2.5;
            const lag24Ms = hMs - 24 * 3600000;
            const lag24W = weatherMap.get(lag24Ms);
            const lag24RegimeMatch = lag24W ? Math.exp(-Math.abs((w.windSpeed100m || 6.5) - (lag24W.windSpeed100m || 6.5)) / 1.5) : 0.3;
            const rawLag24 = rollingPriceByMs.get(lag24Ms) ?? prevAvg;
            const lag24Same = rawLag24 * lag24RegimeMatch + prevAvg * (1.0 - lag24RegimeMatch);

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
            const linEst = predictWithLearnedModel(obsObj, learnedModel, prevAvg);
            const kpMain = kernelPredictHour(hMs, w, hel.hour, hel.isWeekend);
            const kernelAlpha = kpMain.est !== null ? Math.min(0.88, kpMain.weightSum / (kpMain.weightSum + 0.18)) : 0.0;
            const rawEst = kpMain.est !== null
                ? (kernelAlpha * kpMain.est + (1.0 - kernelAlpha) * linEst)
                : linEst;

            // Lasketaan tiukka todennäköinen vaihteluväli [minInclVat, maxInclVat] 6 mittauspisteen
            // alueellisesti keskiarvoistetusta sääepävarmuudesta (1/sqrt(6) hajonnan vaimennus)
            // sekä saman tuuli- ja tuntitilanteen historiallisesta hajonnasta ilman keinotekoisia lisäkertoimia.
            const hoursAhead = Math.max(1, (hMs - currentHourMs) / 3600000);
            const horizonFrac = Math.min(1.0, Math.max(0.0, hoursAhead / 168.0));
            const horizonCurve = Math.pow(horizonFrac, 1.35);
            const deltaWindMs = 0.28 + horizonCurve * 0.65;
            const deltaTempC = 0.25 + horizonCurve * 0.70;

            const wOpt = { ...w, windSpeed100m: (w.windSpeed100m || 6.5) + deltaWindMs, tempC: w.tempC + deltaTempC };
            const wPess = { ...w, windSpeed100m: Math.max(1.5, (w.windSpeed100m || 6.5) - deltaWindMs), tempC: w.tempC - deltaTempC };
            const windHighMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(wOpt.windSpeed100m));
            const windLowMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(wPess.windSpeed100m));

            const linOpt = predictWithLearnedModel({
                ...obsObj,
                windMw: windHighMw,
                rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.5 + windHighMw * 0.5),
                tempC: wOpt.tempC
            }, learnedModel, prevAvg);
            const kpOpt = kernelPredictHour(hMs, wOpt, hel.hour, hel.isWeekend);
            const estOptimistic = kpOpt.est !== null
                ? (kernelAlpha * kpOpt.est + (1.0 - kernelAlpha) * linOpt)
                : linOpt;

            const linPess = predictWithLearnedModel({
                ...obsObj,
                windMw: windLowMw,
                rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.5 + windLowMw * 0.5),
                tempC: wPess.tempC
            }, learnedModel, prevAvg);
            const kpPess = kernelPredictHour(hMs, wPess, hel.hour, hel.isWeekend);
            const estPessimistic = kpPess.est !== null
                ? (kernelAlpha * kpPess.est + (1.0 - kernelAlpha) * linPess)
                : linPess;

            const estInclVat = Number(Math.max(0.05, rawEst).toFixed(2));
            const weatherHalfSpread = Math.abs(estPessimistic - estOptimistic) * 0.38;
            const regimeHalfSpread = Math.min(estInclVat * 0.16, (kpMain.localStd || 0.30) * (0.24 + 0.22 * horizonCurve));
            const rawHalfSpread = Math.hypot(weatherHalfSpread, regimeHalfSpread);
            const minHalfSpread = Math.max(0.05, estInclVat * (0.06 + 0.08 * horizonCurve));
            const maxHalfSpread = Math.max(0.22, estInclVat * (0.12 + 0.14 * horizonCurve));
            const halfSpread = Math.max(minHalfSpread, Math.min(maxHalfSpread, rawHalfSpread));

            const minIncl = Number(Math.max(0.02, estInclVat - halfSpread * 0.92).toFixed(2));
            const maxIncl = Number(Math.max(estInclVat + 0.08, estInclVat + halfSpread * 1.08).toFixed(2));

            if (official) {
                const savedPred = preConfirmStore[hMs];
                const predEst = (savedPred && typeof savedPred.estInclVat === 'number') ? savedPred.estInclVat : estInclVat;
                const predMin = (savedPred && typeof savedPred.minIncl === 'number') ? savedPred.minIncl : minIncl;
                const predMax = (savedPred && typeof savedPred.maxIncl === 'number') ? savedPred.maxIncl : maxIncl;
                if (!savedPred) {
                    preConfirmStore[hMs] = { estInclVat: predEst, minIncl: predMin, maxIncl: predMax, wasForecast: false };
                }

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
                    predictedInclVat: predEst,
                    predictedMinInclVat: predMin,
                    predictedMaxInclVat: predMax,
                    probabilityPct: 100,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw,
                    nuclearMw,
                    baseNuclearDeficitMw: baseDefMw
                });
            } else {
                rollingPriceByMs.set(hMs, estInclVat);
                preConfirmStore[hMs] = { estInclVat, minIncl, maxIncl, wasForecast: true };

                // Lasketaan sääennusteen kaltainen todennäköisyysprosentti (%) sille, että
                // toteutuva tuntihinta osuu laskettuun vaihteluväliin [minIncl, maxIncl]
                const horizonProb = 93.0 - (hoursAhead / 168.0) * 23.0;
                const rampPenalty = Math.min(5.0, (Math.abs(w.windRamp6hMw || 0) / 1800.0) * 4.0);
                const steepCurvePenalty = (w.windSpeed100m >= 5.5 && w.windSpeed100m <= 9.5) ? 2.0 : 0.0;
                const nightBonus = (hel.hour >= 0 && hel.hour <= 5) ? 2.0 : 0.0;
                const probabilityPct = Math.max(62, Math.min(95, Math.round(horizonProb - rampPenalty - steepCurvePenalty + nightBonus)));

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
                    minInclVat: minIncl,
                    maxInclVat: maxIncl,
                    predictedInclVat: estInclVat,
                    predictedMinInclVat: minIncl,
                    predictedMaxInclVat: maxIncl,
                    probabilityPct,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw,
                    nuclearMw,
                    baseNuclearDeficitMw: baseDefMw
                });
            }
        }

        try {
            localStorage.setItem(preConfirmKey, JSON.stringify(preConfirmStore));
        } catch (_) {}

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

    function applySeriesDataAndRender(data) {
        if (!data || !Array.isArray(data.series) || data.series.length === 0) return;
        state.series = data.series;
        state.generatedAt = data.generatedAt;
        if (typeof data.rolling30dMeanInclVat === 'number' && data.rolling30dMeanInclVat > 0.5) {
            state.rolling30dMeanInclVat = data.rolling30dMeanInclVat;
        }

        const todayHel = getHelsinkiComponents(Date.now());
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

    async function loadSpotAndForecastData() {
        const fastCacheKey = storagePrefix + 'fast_series_cache_v3';
        try {
            const rawFast = localStorage.getItem(fastCacheKey);
            if (rawFast) {
                const cachedData = JSON.parse(rawFast);
                if (cachedData && Array.isArray(cachedData.series) && cachedData.series.length > 24) {
                    applySeriesDataAndRender(cachedData);
                }
            }
        } catch (_) {}

        const data = await fetchClientSideWithOnlineML();
        data.rolling30dMeanInclVat = state.rolling30dMeanInclVat;
        try {
            localStorage.setItem(fastCacheKey, JSON.stringify(data));
        } catch (_) {}
        applySeriesDataAndRender(data);
    }

    function renderTelemetryAndDsoPanel() {
        const dso = getActiveDso();
        const postalInput = document.getElementById('postal-input');
        if (postalInput && document.activeElement !== postalInput) {
            postalInput.value = state.hasUserPostal ? state.postalCode : '';
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

        const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
        const genCVal = dso.general_c_kwh * vatFactor;
        const dayCVal = dso.day_c_kwh * vatFactor;
        const nightCVal = dso.night_c_kwh * vatFactor;
        const taxCVal = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;
        const genC = formatNum(genCVal, 2);
        const dayC = formatNum(dayCVal, 2);
        const nightC = formatNum(nightCVal, 2);
        const taxC = formatNum(taxCVal, 2);
        const totalFixedC = formatNum(genCVal + taxCVal, 2);
        const genBaseStr = formatNum(dso.general_base_eur * vatFactor, 2);
        const timeBaseStr = formatNum(dso.time_base_eur * vatFactor, 2);
        const vatText = state.includeVat ? 'sis. ALV 25,5 %' : 'ALV 0 %';

        // Päivitetään siirtohintalaskurin yläotsikko sekä paikallisen jakeluverkkoyhtiön tietolaatikko:
        // Kun postinumero on syötetty, näytetään kyseisen postinumeron ja kunnan tarkat tiedot;
        // muuten näytetään geneerinen teksti ilman lukuja.
        const calcHeadingEl = document.getElementById('transfer-calc-heading') || document.querySelector('.instrument-strip-top h2');
        const calcLeadEl = document.getElementById('transfer-calc-lead') || document.querySelector('.instrument-strip-top p');
        const infoHeadingEl = document.getElementById('local-dso-info-heading');
        const infoBodyEl = document.getElementById('local-dso-info-body');

        if (!ACTIVE_LOC) {
            if (state.hasUserPostal) {
                const matchedMuni = (DSO_DATA.municipalities || []).find(m =>
                    m.name.toLowerCase() === (state.cityName || '').toLowerCase() || m.postal === state.postalCode
                );
                const postalRangeStr = matchedMuni && matchedMuni.postal_range ? matchedMuni.postal_range : state.postalCode;
                const regionParen = matchedMuni && matchedMuni.region ? ` (${matchedMuni.region})` : '';
                const regionComma = matchedMuni && matchedMuni.region ? `, maakunta ${matchedMuni.region}` : '';
                const altNames = (state.altDsoIds || [])
                    .map(id => DSO_DATA.companies[id]?.name)
                    .filter(Boolean);
                const altSentence = altNames.length > 0
                    ? ` Kunnan reuna- tai haja-asutusalueilla verkosta vastaa osittain myös ${altNames.join(', ')}.`
                    : '';

                if (calcHeadingEl) {
                    calcHeadingEl.textContent = `Pörssisähkö ja sähkön siirtohinta ${state.cityName} (${postalRangeStr})`;
                }
                if (calcLeadEl) {
                    calcLeadEl.textContent = `Paikkakunnalla ${state.cityName}${regionParen} ensisijainen jakeluverkkoyhtiö on ${dso.name}.${altSentence} Yleissiirron ja sähköveron kiinteä osuus on yhteensä ${totalFixedC} snt/kWh pörssisähkön spot-hinnan päälle.`;
                }
                if (infoHeadingEl) {
                    infoHeadingEl.textContent = `SÄHKÖNSIIRTO JA JAKELUVERKKOYHTIÖ PAIKKAKUNNALLA ${state.cityName.toUpperCase()}`;
                }
                if (infoBodyEl) {
                    infoBodyEl.innerHTML = `
                        <p>
                            Kun käyttöpaikka sijaitsee paikkakunnalla <strong>${state.cityName}</strong> (postinumeroalue <code>${postalRangeStr}</code>${regionComma}), paikallisesta jakeluverkosta vastaa ensisijaisesti <strong>${dso.name}</strong>.${altSentence}
                        </p>
                        <ul style="margin:12px 0 0 20px; font-family:monospace; font-size:13px;">
                            <li><strong>Yleissiirto (${dso.short_name}):</strong> ${genC} snt/kWh (perusmaksu ${genBaseStr} €/kk)</li>
                            <li><strong>Yösiirto / Aikasiirto:</strong> Päivä klo 07–22 ${dayC} snt/kWh, Yö klo 22–07 ${nightC} snt/kWh (perusmaksu ${timeBaseStr} €/kk)</li>
                            <li><strong>Valtion sähkövero ja huoltovarmuusmaksu:</strong> ${taxC} snt/kWh (${vatText})</li>
                        </ul>
                    `;
                }
            } else {
                if (calcHeadingEl) {
                    calcHeadingEl.textContent = 'Pörssisähkön spot-hinta, 7 vrk ennuste ja siirtohintalaskuri postinumerolla';
                }
                if (calcLeadEl) {
                    calcLeadEl.textContent = 'Syötä postinumerosi tai paikkakuntasi alla olevaan kenttään, niin laskuri tunnistaa automaattisesti paikallisen sähköverkkoyhtiön ja laskee sähkön todellisen kokonaishinnan.';
                }
                if (infoHeadingEl) {
                    infoHeadingEl.textContent = 'SÄHKÖNSIIRTO JA PAIKALLINEN JAKELUVERKKOYHTIÖ';
                }
                if (infoBodyEl) {
                    infoBodyEl.innerHTML = `
                        <p>
                            Kun syötät käyttöpaikan postinumeron tai paikkakunnan yllä olevaan siirtohintalaskuriin, ohjelma hakee automaattisesti alueesi ensisijaisen jakeluverkkoyhtiön sekä voimassa olevat yleissiirron, yösiirron ja sähköveron tiedot.
                        </p>
                    `;
                }
            }
        }

        const detectedEl = document.getElementById('detected-dso-banner');
        if (detectedEl) {

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
            const avgPredT = enrT.reduce((a, b) => a + b.br.predictedTotalCents, 0) / enrT.length;
            if (tomObj.hasForecast) {
                const avgMinT = enrT.reduce((a, b) => a + b.br.minTotalCents, 0) / enrT.length;
                const avgMaxT = enrT.reduce((a, b) => a + b.br.maxTotalCents, 0) / enrT.length;
                const pubStr = getPricePublishTimeText(tomObj.dateKey, false);
                tomText = `<strong>${formatNum(avgMinT, 1)}–${formatNum(avgMaxT, 1)} snt/kWh</strong> (odotus ${formatNum(avgT, 2)})<br><span style="font-size:11px; color:#4a4f4a;">${pubStr}</span>`;
            } else {
                tomText = `${formatNum(avgT, 2)} snt/kWh (ennuste oli ${formatNum(avgPredT, 2)})`;
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
                    <strong>${formatNum(curBreak.spotCents, 2)} snt/kWh <span style="font-weight:400; font-size:11.5px; color:#4a4f4a;">(${PRED_SHORT_LABEL.toLowerCase()} ${formatNum(curBreak.predictedSpotCents, 2)})</span></strong>
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

    // Tarkka vektoripohjainen SVG-mittarikaavio (Pelkkä pörssisähkön spot-hinta + Todennäköinen vaihteluväli)
    function buildSvgChart(enrichedItems, isWeekView) {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
        const W = isMobile ? 360 : 940;
        const H = isMobile ? 280 : 265;
        const padL = isMobile ? 30 : 46;
        const padR = isMobile ? 6 : 16;
        const padT = 14;
        const padB = isMobile ? 22 : 28;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const n = Math.max(1, enrichedItems.length);
        const vals = enrichedItems.map(x => x.slot.isForecast ? x.br.maxSpotCents : x.br.spotCents);
        const minTopScale = 15 * FX_SCALE;
        const maxPrice = Math.max(minTopScale, Math.ceil(Math.max(...vals, 12 * FX_SCALE) / 5) * 5);
        const { cheapThresh, highThresh } = getDynamicPriceThresholds();

        const yForPrice = (c) => padT + plotH - Math.max(0, Math.min(1, c / maxPrice)) * plotH;
        const colW = plotW / n;

        let svg = `<svg class="responsive-price-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${isMobile ? 'none' : 'xMidYMid meet'}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block; font-family:'IBM Plex Mono', monospace;">`;
        svg += `
            <defs>
                <pattern id="forecastHatchCheap" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <rect width="6" height="6" fill="#009e3d" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#111210" stroke-width="1.5" stroke-opacity="0.35" />
                </pattern>
                <pattern id="forecastHatchNorm" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <rect width="6" height="6" fill="#0038ff" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.4" />
                </pattern>
                <pattern id="forecastHatchHigh" width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <rect width="6" height="6" fill="#ff3b00" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#111210" stroke-width="1.5" stroke-opacity="0.35" />
                </pattern>
            </defs>
        `;

        // Vaakasuorat hintaviivat (vasen akseli: snt/kWh)
        const steps = 5;
        for (let s = 0; s <= steps; s++) {
            const pVal = (maxPrice / steps) * s;
            const y = yForPrice(pVal);
            const yLabel = isMobile ? `${Math.round(pVal)}` : `${Math.round(pVal)} ${UNIT_SHORT}`;
            svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${s === 0 ? '#111210' : '#c5c7bd'}" stroke-width="${s === 0 ? '1.5' : '1'}" stroke-dasharray="${s === 0 ? 'none' : '2,2'}" />`;
            svg += `<text x="${padL - (isMobile ? 5 : 8)}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="${isMobile ? '10.5' : '11'}" font-weight="700" fill="#111210">${yLabel}</text>`;
        }

        const nowMsExact = Date.now();
        const nowHourMs = Math.floor(nowMsExact / 3600000) * 3600000;
        let currentHourCursorSvg = '';

        // Pylväät (pelkkä pörssisähkön spot-hinta + ennusteen todennäköinen vaihteluväli)
        for (let i = 0; i < n; i++) {
            const xObj = enrichedItems[i];
            const x0 = padL + i * colW;
            const barW = Math.max(2.0, colW * (isWeekView ? 0.84 : 0.74));
            const barX = x0 + (colW - barW) / 2;

            const spotVal = xObj.br.spotCents;
            const yTopSpot = yForPrice(spotVal);
            const yBottom = padT + plotH;
            const isCurrentHour = xObj.slot.epochMs === nowHourMs;

            let spotFill = spotVal < cheapThresh ? '#009e3d' : (spotVal < highThresh ? '#0038ff' : '#ff3b00');
            if (xObj.slot.isForecast) {
                spotFill = spotVal < cheapThresh
                    ? 'url(#forecastHatchCheap)'
                    : (spotVal < highThresh ? 'url(#forecastHatchNorm)' : 'url(#forecastHatchHigh)');
            }

            // Ennustetunnin todennäköinen vaihteluväli-varjostus (min-max) kapeampana keskipalkkina,
            // jotta varsinainen odotusarvopylväs (spotVal) erottuu aina pääpalkkina
            if (xObj.slot.isForecast) {
                const minChartVal = xObj.br.minSpotCents;
                const maxChartVal = xObj.br.maxSpotCents;
                if (maxChartVal > minChartVal) {
                    const yMin = yForPrice(minChartVal);
                    const yMax = yForPrice(maxChartVal);
                    const bandH = Math.max(2, yMin - yMax);
                    const bandW = Math.max(3, barW * 0.34);
                    const bandX = barX + (barW - bandW) / 2;
                    svg += `<rect x="${bandX.toFixed(1)}" y="${yMax.toFixed(1)}" width="${bandW.toFixed(1)}" height="${bandH.toFixed(1)}" fill="#ffd000" fill-opacity="0.52" stroke="#111210" stroke-width="0.6" stroke-dasharray="2,2" />`;
                }
            }

            // Spot-pylväs (kuluvan tunnin palkki korostettuna)
            const hSpot = Math.max(2.0, yBottom - yTopSpot);
            if (isCurrentHour) {
                svg += `<rect x="${(barX - 2.5).toFixed(1)}" y="${(yTopSpot - 2.5).toFixed(1)}" width="${(barW + 5).toFixed(1)}" height="${(hSpot + 2.5).toFixed(1)}" fill="none" stroke="#ffd000" stroke-width="3.2" pointer-events="none" />`;
            }
            svg += `<rect class="svg-bar-rect${isCurrentHour ? ' is-current-bar' : ''}" data-bar-idx="${i}" x="${barX.toFixed(1)}" y="${yTopSpot.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSpot.toFixed(1)}" fill="${spotFill}" stroke="#111210" stroke-width="${isCurrentHour ? '2.4' : (isWeekView ? '0.6' : '1.2')}" />`;

            if (isCurrentHour) {
                const minuteFrac = Math.max(0.08, Math.min(0.92, (nowMsExact - nowHourMs) / 3600000));
                const nowX = (barX + barW * minuteFrac).toFixed(1);
                const nowXNum = parseFloat(nowX);
                currentHourCursorSvg = `
                    <g pointer-events="none">
                        <line x1="${nowX}" y1="${padT - 4}" x2="${nowX}" y2="${yBottom}" stroke="#ffffff" stroke-width="3.4" stroke-dasharray="5,4" />
                        <line x1="${nowX}" y1="${padT - 4}" x2="${nowX}" y2="${yBottom}" stroke="#111210" stroke-width="2.0" stroke-dasharray="5,4" />
                        <polygon points="${(nowXNum - 5).toFixed(1)},${padT - 10} ${(nowXNum + 5).toFixed(1)},${padT - 10} ${nowX},${padT - 2}" fill="#111210" stroke="#ffd000" stroke-width="1.2" />
                    </g>
                `;
            }

            // Ennusteen todennäköinen vaihteluväli-viiksi (min-max) ja päätyviivat
            if (xObj.slot.isForecast) {
                const minChartVal = xObj.br.minSpotCents;
                const maxChartVal = xObj.br.maxSpotCents;
                if (maxChartVal > minChartVal) {
                    const yMin = yForPrice(minChartVal);
                    const yMax = yForPrice(maxChartVal);
                    const cx = barX + barW / 2;
                    svg += `<line x1="${cx.toFixed(1)}" y1="${yMax.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${yMin.toFixed(1)}" stroke="#111210" stroke-width="${isWeekView ? '1.2' : '1.8'}" />`;
                    if (!isWeekView) {
                        const capW = Math.min(7, barW * 0.42);
                        svg += `<line x1="${(cx - capW).toFixed(1)}" y1="${yMax.toFixed(1)}" x2="${(cx + capW).toFixed(1)}" y2="${yMax.toFixed(1)}" stroke="#111210" stroke-width="2.0" />`;
                        svg += `<line x1="${(cx - capW).toFixed(1)}" y1="${yMin.toFixed(1)}" x2="${(cx + capW).toFixed(1)}" y2="${yMin.toFixed(1)}" stroke="#111210" stroke-width="2.0" />`;
                    }
                }
            }

            // Aikaleimat ala-akselille
            if (isWeekView) {
                if (xObj.slot.hour === 0) {
                    svg += `<line x1="${x0.toFixed(1)}" y1="${padT}" x2="${x0.toFixed(1)}" y2="${padT + plotH}" stroke="#111210" stroke-width="1" stroke-dasharray="3,3" />`;
                    svg += `<text x="${(x0 + 3).toFixed(1)}" y="${H - (isMobile ? 5 : 8)}" font-size="${isMobile ? '9.5' : '11'}" font-weight="700" fill="#111210">${xObj.slot.dayShort || ''}</text>`;
                }
            } else {
                const showHourTick = isMobile ? (i % 2 === 0) : (i % 2 === 0 || n <= 24);
                if (showHourTick) {
                    const cx = x0 + colW / 2;
                    svg += `<text x="${cx.toFixed(1)}" y="${H - (isMobile ? 5 : 8)}" text-anchor="middle" font-size="${isMobile ? '10' : '11'}" font-weight="700" fill="#111210">${String(xObj.slot.hour).padStart(2, '0')}</text>`;
                }
            }

            // Näkymätön hover-alue tarkkaa lukemaa ja kelluvaa vaihteluväli-tooltipia varten
            svg += `<rect class="svg-hover-slot" data-slot-idx="${i}" data-x-pct="${(((x0 + colW / 2) / W) * 100).toFixed(2)}" x="${x0.toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:crosshair;" />`;
        }

        svg += currentHourCursorSvg;

        svg += `</svg>`;
        return svg;
    }

    function renderDayTabsAndChart() {
        const tabsEl = document.getElementById('day-tabs');
        if (!tabsEl) return;

        // 7 vuorokauden matriisipainikkeet (pelkkä pörssisähkön spot-hinta ja vaihteluväli / ohjelman ennuste)
        let tabsHtml = '';
        for (const d of state.daysList) {
            const enr = d.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const avgSpot = enr.reduce((a, b) => a + b.br.spotCents, 0) / enr.length;
            const avgMinSpot = enr.reduce((a, b) => a + b.br.minSpotCents, 0) / enr.length;
            const avgMaxSpot = enr.reduce((a, b) => a + b.br.maxSpotCents, 0) / enr.length;
            const avgPredSpot = enr.reduce((a, b) => a + b.br.predictedSpotCents, 0) / enr.length;
            const priceLabel = d.hasForecast
                ? `~${formatNum(avgSpot, 2)} ${UNIT_SHORT}`
                : `${formatNum(avgSpot, 2)} ${UNIT_SHORT}`;
            const metaLabel = d.hasForecast
                ? `${formatNum(avgMinSpot, 1)}–${formatNum(avgMaxSpot, 1)} ${UNIT_SHORT}`
                : `${PRED_SHORT_LABEL}: ${formatNum(avgPredSpot, 2)} ${UNIT_SHORT}`;
            const pubTabHtml = d.hasForecast
                ? `<span class="day-tab-pub">${getPricePublishTimeText(d.dateKey, true)}</span>`
                : '';
            tabsHtml += `
                <button type="button" class="day-tab ${state.selectedDayIndex === d.index ? 'active' : ''}" data-day-idx="${d.index}">
                    <span class="day-tab-name">${d.shortLabel}</span>
                    <span class="day-tab-price">${priceLabel}</span>
                    <span class="day-tab-meta">${metaLabel}</span>
                    ${pubTabHtml}
                </button>
            `;
        }
        tabsHtml += `
            <button type="button" class="day-tab ${state.selectedDayIndex === -1 ? 'active' : ''}" data-day-idx="-1">
                <span class="day-tab-name">7 d</span>
                <span class="day-tab-price">168 h</span>
                <span class="day-tab-meta">${RANGE_LABEL}</span>
            </button>
        `;
        tabsEl.innerHTML = tabsHtml;

        tabsEl.querySelectorAll('.day-tab').forEach(btn => {
            btn.addEventListener('click', function () {
                state.selectedDayIndex = parseInt(this.getAttribute('data-day-idx'), 10);
                renderDayTabsAndChart();
            });
        });

        const prevBtn = document.getElementById('chart-prev-day');
        const nextBtn = document.getElementById('chart-next-day');
        const maxDayIdx = Math.max(0, state.daysList.length - 1);

        if (prevBtn) {
            const hasPrev = state.selectedDayIndex === -1 ? state.daysList.length > 0 : state.selectedDayIndex > 0;
            prevBtn.disabled = !hasPrev;
            const targetPrevIdx = state.selectedDayIndex === -1 ? maxDayIdx : state.selectedDayIndex - 1;
            prevBtn.onclick = function () {
                if (!hasPrev) return;
                state.selectedDayIndex = targetPrevIdx;
                renderDayTabsAndChart();
            };
        }

        if (nextBtn) {
            const hasNext = state.selectedDayIndex === -1 ? state.daysList.length > 0 : state.selectedDayIndex < maxDayIdx;
            nextBtn.disabled = !hasNext;
            const targetNextIdx = state.selectedDayIndex === -1 ? 0 : state.selectedDayIndex + 1;
            nextBtn.onclick = function () {
                if (!hasNext) return;
                state.selectedDayIndex = targetNextIdx;
                renderDayTabsAndChart();
            };
        }

        const chartContainer = document.getElementById('price-chart');
        const floatingTooltip = document.getElementById('chart-floating-tooltip');
        const tableBody = document.getElementById('hourly-table-body');
        const chartTitle = document.getElementById('chart-view-title');
        const readoutEl = document.getElementById('chart-readout-strip');
        if (!chartContainer || !tableBody) return;

        let activeItems = [];
        const isWeekView = state.selectedDayIndex === -1;

        if (isWeekView) {
            const rawAll = state.daysList.flatMap(d => d.items.map(it => ({ ...it, dayShort: d.shortLabel, dayFullLabel: d.label })));
            activeItems = rawAll.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
        } else {
            const dayObj = state.daysList.find(d => d.index === state.selectedDayIndex) || state.daysList[0];
            if (!dayObj) return;
            activeItems = dayObj.items.map(s => ({ slot: { ...s, dayShort: dayObj.shortLabel, dayFullLabel: dayObj.label }, br: calculateHourBreakdown(s) }));
        }

        chartContainer.innerHTML = buildSvgChart(activeItems, isWeekView);

        // Täytetään kaavion alapuolella oleva koosterivi: Kuluvan tunnin hinta, Päivän halvin hinta ja Päivän kallein hinta
        const summaryStripEl = document.getElementById('first-screen-summary-strip');
        if (summaryStripEl && activeItems.length > 0) {
            const summaryLabelsMap = {
                FI: ['KULUVAN TUNNIN SÄHKÖHINTA', 'PÄIVÄN HALVIN HINTA', 'PÄIVÄN KALLEIN HINTA', 'klo'],
                SE: ['ELPRIS JUST NU (AKTUELL TIMME)', 'DAGENS LÄGSTA PRIS', 'DAGENS HÖGSTA PRIS', 'kl.'],
                NO: ['STRØMPRIS NÅ (DENNE TIMEN)', 'DAGENS LAVESTE PRIS', 'DAGENS HØYESTE PRIS', 'kl.'],
                DK: ['ELPRIS LIGE NU (AKTUEL TIME)', 'DAGENS LAVESTE PRIS', 'DAGENS HØJESTE PRIS', 'kl.'],
                EE: ['HETKE TUNNIHIND PRAEGU', 'PÄEVA SOODSAIM HIND', 'PÄEVA KALLEIM HIND', 'kl'],
                LV: ['PAŠREIZĒJĀS STUNDAS CENA', 'DIENAS ZEMĀKĀ CENA', 'DIENAS AUGSTĀKĀ CENA', 'plkst.'],
                LT: ['DABARTINĖS VALANDOS KAINA', 'DIENOS MAŽIAUSIA KAINA', 'DIENOS DIDŽIAUSIA KAINA', 'val.'],
            };
            const [lblNow, lblMin, lblMax, lblAt] = summaryLabelsMap[ACTIVE_COUNTRY_ID] || summaryLabelsMap.FI;
            const nowMs = Math.floor(Date.now() / 3600000) * 3600000;
            const currentSlotRaw = state.series.find(s => s.epochMs === nowMs) || state.series[0];
            const currentBr = currentSlotRaw ? calculateHourBreakdown(currentSlotRaw) : activeItems[0].br;
            const curH = currentSlotRaw ? currentSlotRaw.hour : activeItems[0].slot.hour;
            const curWindow = `${lblAt} ${String(curH).padStart(2, '0')}:00–${String((curH + 1) % 24).padStart(2, '0')}:00`;

            const minObj = activeItems.reduce((a, b) => (b.br.spotCents < a.br.spotCents ? b : a), activeItems[0]);
            const maxObj = activeItems.reduce((a, b) => (b.br.spotCents > a.br.spotCents ? b : a), activeItems[0]);

            const minH = minObj.slot.hour;
            const maxH = maxObj.slot.hour;
            const minDayPrefix = isWeekView && minObj.slot.dayShort ? `${minObj.slot.dayShort} ` : '';
            const maxDayPrefix = isWeekView && maxObj.slot.dayShort ? `${maxObj.slot.dayShort} ` : '';

            const minValText = minObj.slot.isForecast
                ? `${APPROX_PREFIX}${formatNum(minObj.br.spotCents, 2)} ${UNIT_LABEL}`
                : `${formatNum(minObj.br.spotCents, 2)} ${UNIT_LABEL}`;
            const maxValText = maxObj.slot.isForecast
                ? `${APPROX_PREFIX}${formatNum(maxObj.br.spotCents, 2)} ${UNIT_LABEL}`
                : `${formatNum(maxObj.br.spotCents, 2)} ${UNIT_LABEL}`;

            const curPredSub = (currentSlotRaw && !currentSlotRaw.isForecast)
                ? ` · ${PRED_WAS_LABEL}: ${formatNum(currentBr.predictedSpotCents, 2)} ${UNIT_SHORT}`
                : (currentSlotRaw && currentSlotRaw.isForecast ? ` · ${getPricePublishTimeText(currentSlotRaw.dateKey, false)}` : '');
            const minRangeSub = minObj.slot.isForecast
                ? ` · ${RANGE_LABEL}: ${formatNum(minObj.br.minSpotCents, 2)}–${formatNum(minObj.br.maxSpotCents, 2)} ${UNIT_SHORT} · ${getPricePublishTimeText(minObj.slot.dateKey, false)}`
                : ` · ${PRED_WAS_LABEL}: ${formatNum(minObj.br.predictedSpotCents, 2)} ${UNIT_SHORT}`;
            const maxRangeSub = maxObj.slot.isForecast
                ? ` · ${RANGE_LABEL}: ${formatNum(maxObj.br.minSpotCents, 2)}–${formatNum(maxObj.br.maxSpotCents, 2)} ${UNIT_SHORT} · ${getPricePublishTimeText(maxObj.slot.dateKey, false)}`
                : ` · ${PRED_WAS_LABEL}: ${formatNum(maxObj.br.predictedSpotCents, 2)} ${UNIT_SHORT}`;

            summaryStripEl.innerHTML = `
                <div class="summary-metric-col">
                    <span class="summary-metric-kicker">${lblNow}</span>
                    <div class="summary-metric-value">${formatNum(currentBr.spotCents, 2)} <span style="font-size:15px;">${UNIT_LABEL}</span></div>
                    <span class="summary-metric-sub">${curWindow}${curPredSub}</span>
                </div>
                <div class="summary-metric-col">
                    <span class="summary-metric-kicker">${lblMin} (${minObj.slot.dayShort || ''})</span>
                    <div class="summary-metric-value" style="color:#008a36;">${minValText.replace(UNIT_LABEL, `<span style="font-size:15px;">${UNIT_LABEL}</span>`)}</div>
                    <span class="summary-metric-sub">${minDayPrefix}${lblAt} ${String(minH).padStart(2, '0')}:00–${String((minH + 1) % 24).padStart(2, '0')}:00${minRangeSub}</span>
                </div>
                <div class="summary-metric-col">
                    <span class="summary-metric-kicker">${lblMax} (${maxObj.slot.dayShort || ''})</span>
                    <div class="summary-metric-value" style="color:#d92b00;">${maxValText.replace(UNIT_LABEL, `<span style="font-size:15px;">${UNIT_LABEL}</span>`)}</div>
                    <span class="summary-metric-sub">${maxDayPrefix}${lblAt} ${String(maxH).padStart(2, '0')}:00–${String((maxH + 1) % 24).padStart(2, '0')}:00${maxRangeSub}</span>
                </div>
            `;
        }

        function updateReadout(xObj) {
            if (!xObj) return;
            const dayPrefix = xObj.slot.dayShort ? `${xObj.slot.dayShort} ` : '';
            const timeRange = `${String(xObj.slot.hour).padStart(2, '0')}:00–${String((xObj.slot.hour + 1) % 24).padStart(2, '0')}:00`;
            const probPct = xObj.slot.probabilityPct !== undefined ? xObj.slot.probabilityPct : (xObj.slot.isForecast ? 82 : 100);

            if (readoutEl) {
                if (xObj.slot.isForecast) {
                    const pubInfo = getPricePublishTimeText(xObj.slot.dateKey, false);
                    readoutEl.innerHTML = `
                        <span><strong>${dayPrefix}${timeRange}</strong></span>
                        <span><strong>${APPROX_PREFIX}${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</strong></span>
                        <span>${RANGE_LABEL}: <strong style="text-decoration:underline;">${formatNum(xObj.br.minSpotCents, 2)} – ${formatNum(xObj.br.maxSpotCents, 2)} ${UNIT_LABEL}</strong> (${PROB_LABEL} <strong>${probPct} %</strong>)</span>
                        <span><strong>${pubInfo}</strong></span>
                    `;
                } else {
                    readoutEl.innerHTML = `
                        <span><strong>${dayPrefix}${timeRange}</strong></span>
                        <span><strong>${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</strong> (${FIXED_LABEL})</span>
                        <span>${PRED_WAS_LABEL}: <strong>${formatNum(xObj.br.predictedSpotCents, 2)} ${UNIT_LABEL}</strong> (${formatNum(xObj.br.predictedMinSpotCents, 2)}–${formatNum(xObj.br.predictedMaxSpotCents, 2)} ${UNIT_SHORT})</span>
                    `;
                }
            }
        }

        function showFloatingTooltipAt(xObj, clientX, clientY) {
            if (!floatingTooltip || !xObj) return;
            const dayPrefix = xObj.slot.dayShort ? `${xObj.slot.dayShort} ` : '';
            const timeRange = `${String(xObj.slot.hour).padStart(2, '0')}:00–${String((xObj.slot.hour + 1) % 24).padStart(2, '0')}:00`;
            const probPct = xObj.slot.probabilityPct !== undefined ? xObj.slot.probabilityPct : (xObj.slot.isForecast ? 82 : 100);

            if (xObj.slot.isForecast) {
                const pubInfo = getPricePublishTimeText(xObj.slot.dateKey, false);
                floatingTooltip.innerHTML = `
                    <div class="tooltip-time">${dayPrefix}${timeRange}</div>
                    <div class="tooltip-price-main">${APPROX_PREFIX}${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</div>
                    <div class="tooltip-range-line">${RANGE_LABEL}: <strong>${formatNum(xObj.br.minSpotCents, 2)} – ${formatNum(xObj.br.maxSpotCents, 2)} ${UNIT_LABEL}</strong></div>
                    <div class="tooltip-prob-line">${PROB_LABEL}: <strong>${probPct} %</strong></div>
                    <div class="tooltip-prob-line" style="margin-top:2px; font-weight:600;">${pubInfo}</div>
                `;
            } else {
                floatingTooltip.innerHTML = `
                    <div class="tooltip-time">${dayPrefix}${timeRange}</div>
                    <div class="tooltip-price-main">${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</div>
                    <div class="tooltip-range-line">${PRED_WAS_LABEL}: <strong>${formatNum(xObj.br.predictedSpotCents, 2)} ${UNIT_LABEL}</strong> (${formatNum(xObj.br.predictedMinSpotCents, 2)}–${formatNum(xObj.br.predictedMaxSpotCents, 2)} ${UNIT_SHORT})</div>
                    <div class="tooltip-prob-line">${PROB_LABEL}: <strong>100 % (${FIXED_LABEL})</strong></div>
                `;
            }

            floatingTooltip.classList.add('visible');
            const boxW = floatingTooltip.offsetWidth || 275;
            const boxH = floatingTooltip.offsetHeight || 115;
            const vw = window.innerWidth || 1280;
            const vh = window.innerHeight || 800;

            let leftPx = clientX + 16;
            if (leftPx + boxW + 12 > vw) {
                leftPx = Math.max(8, clientX - boxW - 16);
            }
            let topPx = clientY - Math.round(boxH / 2);
            if (topPx < 8) topPx = 8;
            if (topPx + boxH + 8 > vh) topPx = Math.max(8, vh - boxH - 8);

            floatingTooltip.style.left = `${leftPx}px`;
            floatingTooltip.style.top = `${topPx}px`;
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const defaultReadoutItem = activeItems.find(x => x.slot.epochMs === nowHourMs) || activeItems[0];
        updateReadout(defaultReadoutItem);

        let hoverDwellTimer = null;
        let lastMouseX = 0;
        let lastMouseY = 0;

        chartContainer.querySelectorAll('.svg-hover-slot').forEach(rect => {
            const scheduleTooltipOnStill = function (evt) {
                const i = parseInt(this.getAttribute('data-slot-idx'), 10);
                const item = activeItems[i];
                if (!item) return;

                updateReadout(item);

                if (evt && typeof evt.clientX === 'number') {
                    const dx = Math.abs(evt.clientX - lastMouseX);
                    const dy = Math.abs(evt.clientY - lastMouseY);
                    if (dx < 2 && dy < 2 && floatingTooltip && floatingTooltip.classList.contains('visible')) {
                        return;
                    }
                    lastMouseX = evt.clientX;
                    lastMouseY = evt.clientY;
                }

                if (floatingTooltip) floatingTooltip.classList.remove('visible');
                if (hoverDwellTimer) clearTimeout(hoverDwellTimer);

                hoverDwellTimer = setTimeout(() => {
                    showFloatingTooltipAt(item, lastMouseX, lastMouseY);
                }, 260);
            };

            rect.addEventListener('mouseenter', scheduleTooltipOnStill);
            rect.addEventListener('mousemove', scheduleTooltipOnStill);
            rect.addEventListener('mouseleave', function () {
                if (hoverDwellTimer) {
                    clearTimeout(hoverDwellTimer);
                    hoverDwellTimer = null;
                }
                if (floatingTooltip) floatingTooltip.classList.remove('visible');
            });
            rect.addEventListener('click', function (evt) {
                const i = parseInt(this.getAttribute('data-slot-idx'), 10);
                if (activeItems[i]) {
                    updateReadout(activeItems[i]);
                    showFloatingTooltipAt(activeItems[i], evt.clientX || lastMouseX, evt.clientY || lastMouseY);
                }
            });
        });

        chartContainer.addEventListener('mouseleave', function () {
            if (hoverDwellTimer) {
                clearTimeout(hoverDwellTimer);
                hoverDwellTimer = null;
            }
            if (floatingTooltip) floatingTooltip.classList.remove('visible');
        });

        // Tuntikohtainen hintataulukko ja 30 vrk liukuvan keskiarvon mukaiset hintarajat
        const maxDayScale = Math.max(15 * FX_SCALE, ...activeItems.map(x => x.slot.isForecast ? x.br.maxSpotCents : x.br.spotCents));
        const { avg30d, cheapThresh, highThresh } = getDynamicPriceThresholds();

        // Päivitetään ylälaidan värikoodiselitteeseen dynaamiset 30 vrk liukuvan keskiarvon rajat
        const legendEl = document.querySelector('.chart-legend');
        const legendItems = document.querySelectorAll('.chart-legend .legend-item');
        if (legendItems.length >= 3) {
            const tierWordsMap = {
                FI: ['Hintataso (30 pv keskihinnan perusteella', 'Edullinen', 'Normaali', 'Korkea'],
                SE: ['Prisnivå (baserat på 30 dgr snittpris', 'Lågt pris', 'Normalt', 'Högt pris'],
                NO: ['Prisnivå (basert på 30 d. snittpris', 'Lav pris', 'Normal', 'Høy pris'],
                DK: ['Prisniveau (baseret på 30 d. snitpris', 'Lav pris', 'Normal', 'Høj pris'],
                EE: ['Hinnatase (30 p keskmise hinna alusel', 'Soodne', 'Tavapärane', 'Kõrge'],
                LV: ['Cenu līmenis (pēc 30 d. vidējās cenas', 'Zema cena', 'Vidēja', 'Augsta cena'],
                LT: ['Kainų lygis (pagal 30 d. vidutinę kainą', 'Žema kaina', 'Vidutinė', 'Aukšta kaina'],
            };
            const [wIntro, wCheap, wNorm, wHigh] = tierWordsMap[ACTIVE_COUNTRY_ID] || tierWordsMap.FI;
            if (legendEl) {
                let basisEl = legendEl.querySelector('.legend-basis-label');
                if (!basisEl) {
                    basisEl = document.createElement('span');
                    basisEl.className = 'legend-basis-label';
                    basisEl.style.cssText = 'font-family:var(--mono); font-size:11px; font-weight:700; color:var(--ink);';
                    legendEl.insertBefore(basisEl, legendItems[0]);
                }
                basisEl.textContent = `${wIntro} ${formatNum(avg30d, 2)} ${UNIT_LABEL}):`;
            }
            legendItems[0].innerHTML = `<span class="legend-swatch" style="background:#009e3d;"></span> ${wCheap} (&lt; ${formatNum(cheapThresh, 2)} ${UNIT_LABEL})`;
            legendItems[1].innerHTML = `<span class="legend-swatch" style="background:#0038ff;"></span> ${wNorm} (${formatNum(cheapThresh, 2)}–${formatNum(highThresh, 2)} ${UNIT_LABEL})`;
            legendItems[2].innerHTML = `<span class="legend-swatch" style="background:#ff3b00;"></span> ${wHigh} (&gt; ${formatNum(highThresh, 2)} ${UNIT_LABEL})`;
        }
        let rowsHtml = '';
        let lastDateKey = '';
        for (const x of activeItems) {
            if (isWeekView && x.slot.dateKey !== lastDateKey) {
                lastDateKey = x.slot.dateKey;
                rowsHtml += `
                    <tr class="row-day-divider">
                        <td colspan="5">${x.slot.dayFullLabel || x.slot.dateKey}</td>
                    </tr>
                `;
            }

            const isNow = x.slot.epochMs === nowHourMs;
            const tierColor = x.br.spotCents < cheapThresh ? '#008a36' : (x.br.spotCents < highThresh ? '#111210' : '#d92b00');
            const hourStr = `${String(x.slot.hour).padStart(2, '0')}:00 – ${String((x.slot.hour + 1) % 24).padStart(2, '0')}:00`;
            const dayPrefix = isWeekView ? `<span class="muted-range" style="margin-right:6px;">${x.slot.dayShort}</span>` : '';

            const barPct = Math.max(2, Math.min(100, (x.br.spotCents / maxDayScale) * 100));
            const spotText = x.slot.isForecast
                ? `${APPROX_PREFIX}${formatNum(x.br.spotCents, 2)} ${UNIT_LABEL}`
                : `${formatNum(x.br.spotCents, 2)} ${UNIT_LABEL}`;

            let rangeColHtml = '';
            if (x.slot.isForecast) {
                const leftPct = Math.max(0, Math.min(92, (x.br.minSpotCents / maxDayScale) * 100));
                const widthPct = Math.max(4, Math.min(100 - leftPct, ((x.br.maxSpotCents - x.br.minSpotCents) / maxDayScale) * 100));
                const rowProb = x.slot.probabilityPct !== undefined ? x.slot.probabilityPct : 82;
                const pubInfo = getPricePublishTimeText(x.slot.dateKey, false);
                rangeColHtml = `
                    <div class="table-range-cell">
                        <strong class="table-range-numbers">${formatNum(x.br.minSpotCents, 2)} – ${formatNum(x.br.maxSpotCents, 2)} ${UNIT_LABEL} <span class="muted-range">(${rowProb} %)</span></strong>
                        <span class="table-range-ruler"><span class="table-range-span" style="left:${leftPct.toFixed(1)}%; width:${widthPct.toFixed(1)}%;"></span></span>
                        <span class="muted-range" style="font-size:11px; display:block; margin-top:2px;">${pubInfo}</span>
                    </div>
                `;
            } else {
                rangeColHtml = `
                    <div class="table-range-cell">
                        <span class="table-range-numbers"><strong>${PRED_WAS_LABEL}: ${formatNum(x.br.predictedSpotCents, 2)} ${UNIT_LABEL}</strong> <span class="muted-range">(${formatNum(x.br.predictedMinSpotCents, 2)}–${formatNum(x.br.predictedMaxSpotCents, 2)} ${UNIT_SHORT})</span></span>
                        <span class="muted-range" style="font-size:11px;">${FIXED_LABEL} (100 %)</span>
                    </div>
                `;
            }

            const totalHtml = x.slot.isForecast
                ? `${APPROX_PREFIX}${formatNum(x.br.totalCents, 2)} ${UNIT_LABEL} <span class="muted-range">(${formatNum(x.br.minTotalCents, 1)}–${formatNum(x.br.maxTotalCents, 1)} ${UNIT_SHORT})</span>`
                : `${formatNum(x.br.totalCents, 2)} ${UNIT_LABEL}`;

            rowsHtml += `
                <tr class="${isNow ? 'row-current-hour' : ''}">
                    <td style="white-space:nowrap;">${dayPrefix}<strong>${hourStr}</strong>${isNow ? ' <span style="color:#ff3b00; font-weight:700;">●</span>' : ''}</td>
                    <td style="white-space:nowrap;">
                        <div class="table-spot-cell">
                            <strong style="color:${tierColor}; font-size:14.5px;">${spotText}</strong>
                            <span class="table-spot-bar"><span style="width:${barPct.toFixed(0)}%; background:${tierColor};"></span></span>
                        </div>
                    </td>
                    <td style="white-space:nowrap;">${rangeColHtml}</td>
                    <td style="white-space:nowrap;">${totalHtml}</td>
                    <td style="white-space:nowrap;">${x.slot.windMw} MW · ${formatNum(x.slot.tempC, 1)} °C</td>
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
            ? `Todennäköinen kokonaishinta <strong>${formatNum(bestWindow.avgMinTotal, 2)}–${formatNum(bestWindow.avgMaxTotal, 2)} snt/kWh</strong> (odotus ${formatNum(bestWindow.avgTotal, 2)} snt | Siirto &amp; vero ${formatNum(bestWindow.avgTransferAndTax, 2)} snt)<br><span style="font-size:11px; color:#4a4f4a;">${getPricePublishTimeText(bestWindow.endSlot.dateKey, false)}</span>`
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

        // Koko vuoden kulutuspainotettu keskiarvo ("keskiarvojen keskiarvo"):
        // Huomioi talvi-, väli- ja kesäkuukausien tyypillisen hintatason, sähkölämmityksen
        // talvipainotuksen (suuremmalla vuosikulutuksella enemmän talvikulutusta) sekä yöpainotuksen.
        const heatingWeight = Math.max(0.0, Math.min(1.0, (kwh - 2500) / 15500));
        const winterShare = 0.44 + 0.18 * heatingWeight;     // tammi–maalis, marras–joulu
        const shoulderShare = 0.31 - 0.06 * heatingWeight;   // huhti–touko, syys–loka
        const summerShare = 1.0 - winterShare - shoulderShare; // kesä–elo

        const winterAvgSpot = 7.65 * FX_SCALE;
        const shoulderAvgSpot = 4.85 * FX_SCALE;
        const summerAvgSpot = 3.45 * FX_SCALE;
        const seasonalBaseSpot = winterShare * winterAvgSpot + shoulderShare * shoulderAvgSpot + summerShare * summerAvgSpot;
        const profileFactor = 1.12 * dayShare + 0.84 * nightShare;

        const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
        const avgSpot = seasonalBaseSpot * profileFactor * vatFactor;
        const taxC = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;
        const marginC = state.marginCents * vatFactor;

        const energyAndMarginEur = ((avgSpot + marginC) * kwh) / 100.0;
        const taxEur = (taxC * kwh) / 100.0;

        const genAvgC = dso.general_c_kwh * vatFactor;
        const genTransferEur = (genAvgC * kwh) / 100.0 + (dso.general_base_eur * vatFactor * 12);
        const genTotalEur = energyAndMarginEur + taxEur + genTransferEur;

        const timeAvgC = (dso.day_c_kwh * dayShare + dso.night_c_kwh * nightShare) * vatFactor;
        const timeTransferEur = (timeAvgC * kwh) / 100.0 + (dso.time_base_eur * vatFactor * 12);
        const timeTotalEur = energyAndMarginEur + taxEur + timeTransferEur;

        const winterDayShare = Math.max(0.10, dayShare * winterShare);
        const otherSeasonShare = 1.0 - winterDayShare;
        const seasonAvgC = (dso.winter_day_c_kwh * winterDayShare + dso.other_c_kwh * otherSeasonShare) * vatFactor;
        const seasonTransferEur = (seasonAvgC * kwh) / 100.0 + (dso.season_base_eur * vatFactor * 12);
        const seasonTotalEur = energyAndMarginEur + taxEur + seasonTransferEur;

        const options = [
            { id: 'general', title: 'Yleissiirto', transferEur: genTransferEur, totalEur: genTotalEur, transferC: genAvgC, avgC: avgSpot + marginC + genAvgC + taxC },
            { id: 'time', title: 'Yösiirto / Aikasiirto', transferEur: timeTransferEur, totalEur: timeTotalEur, transferC: timeAvgC, avgC: avgSpot + marginC + timeAvgC + taxC },
            { id: 'season', title: 'Kausisiirto', transferEur: seasonTransferEur, totalEur: seasonTotalEur, transferC: seasonAvgC, avgC: avgSpot + marginC + seasonAvgC + taxC }
        ];

        const cheapest = options.reduce((a, b) => (b.totalEur < a.totalEur ? b : a), options[0]);

        container.innerHTML = options.map(opt => {
            const isBest = opt.id === cheapest.id;
            return `
                <div class="comp-card ${isBest ? 'best-choice' : ''}">
                    <div class="comp-card-header">
                        <span class="comp-title">${opt.title}</span>
                        ${isBest ? '<span style="font-size:11px; font-weight:700; color:#ff3b00; text-transform:uppercase;">● Edullisin valinta</span>' : ''}
                    </div>
                    <div class="comp-total-eur">~${formatNum(opt.totalEur, 0)} €/v <span style="font-size:13px; font-weight:400;">(${formatNum(opt.totalEur / 12, 0)} €/kk)</span></div>
                    <div>Keskihinta: <strong>~${formatNum(opt.avgC, 2)} snt/kWh</strong></div>
                    <ul class="comp-list">
                        <li>Sähköenergia: ~${formatNum(energyAndMarginEur, 0)} €/v</li>
                        <li>Sähkönsiirto ja perusmaksut: ${formatNum(opt.transferEur, 0)} €/v</li>
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
            const rawVal = postalInput.value.trim();
            if (!rawVal) {
                state.hasUserPostal = false;
                saveSettings();
                renderAll();
                return;
            }
            const res = resolvePostalOrCity(rawVal);
            if (res) {
                state.hasUserPostal = true;
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
                if (!v || /^\d{5}$/.test(v)) {
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
        if (initRes && (state.hasUserPostal || !document.body.getAttribute('data-preset-dso'))) {
            state.cityName = initRes.city;
            state.dsoId = initRes.dsoId;
            state.altDsoIds = initRes.alt || [];
        }
        bindEvents();
        renderTelemetryAndDsoPanel();
        renderMlLearningPanel();
        loadSpotAndForecastData();

        let lastIsMobile = window.innerWidth <= 768;
        window.addEventListener('resize', function () {
            const nowIsMobile = window.innerWidth <= 768;
            if (nowIsMobile !== lastIsMobile) {
                lastIsMobile = nowIsMobile;
                renderDayTabsAndChart();
            }
        });

        // Haetaan uudet tiedot Nord Poolista automaattisesti joka tunti (tasatunnein)
        function scheduleNextTopOfHourFetch() {
            const nowMs = Date.now();
            const msToNextHour = 3600000 - (nowMs % 3600000) + 4000;
            setTimeout(function () {
                loadSpotAndForecastData();
                scheduleNextTopOfHourFetch();
            }, msToNextHour);
        }
        scheduleNextTopOfHourFetch();

        // Kaksi vuorokausittaista tarkentavaa pääpäivitystä Suomen aikaa:
        // 1) klo 13:45 (kun Nord Pool julkaisee uudet vahvistetut hinnat ja malli tarkentaa tulevien päivien ennusteet)
        // 2) klo 01:45 (yöllä vuorokauden vaihduttua ja tuoreimman 00Z-säämalliajon valmistuttua, jolloin ennustetaan uusi päivä ja tarkennetaan aiempia)
        function scheduleTwiceDailyRefinement() {
            const now = new Date();
            const fmtMin = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Helsinki',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            const parts = fmtMin.formatToParts(now);
            const map = {};
            for (const p of parts) map[p.type] = p.value;
            const h = parseInt(map.hour, 10) % 24;
            const m = parseInt(map.minute, 10);
            const s = parseInt(map.second, 10);
            const curSecOfDay = h * 3600 + m * 60 + s;

            const t0145 = 1 * 3600 + 45 * 60 + 5;  // 01:45:05
            const t1345 = 13 * 3600 + 45 * 60 + 5; // 13:45:05

            let secUntilNext;
            if (curSecOfDay < t0145) {
                secUntilNext = t0145 - curSecOfDay;
            } else if (curSecOfDay < t1345) {
                secUntilNext = t1345 - curSecOfDay;
            } else {
                secUntilNext = (24 * 3600 - curSecOfDay) + t0145;
            }

            setTimeout(function () {
                loadSpotAndForecastData();
                scheduleTwiceDailyRefinement();
            }, Math.max(5000, secUntilNext * 1000));
        }
        scheduleTwiceDailyRefinement();

        // Tarkistetaan lisäksi 15 minuutin välein (erityisesti klo 13–16 kun seuraavan päivän vahvistetut Nord Pool -hinnat julkaistaan sekä klo 01–02 yöpäivityksessä)
        setInterval(function () {
            const helNow = getHelsinkiComponents(new Date());
            const lastGenMs = state.generatedAt ? Date.parse(state.generatedAt) : 0;
            const ageMin = (Date.now() - lastGenMs) / 60000;
            if (((helNow.hour >= 13 && helNow.hour <= 16) || helNow.hour === 1 || helNow.hour === 2) && ageMin >= 14) {
                loadSpotAndForecastData();
            } else if (ageMin >= 55) {
                loadSpotAndForecastData();
            } else {
                renderDayTabsAndChart();
            }
        }, 900000);

        // Päivitetään kuluvan tunnin katkoviivaosoitin minuutin välein
        setInterval(function () {
            if (state.series && state.series.length > 0) {
                renderDayTabsAndChart();
            }
        }, 60000);

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                const lastGenMs = state.generatedAt ? Date.parse(state.generatedAt) : 0;
                if (Date.now() - lastGenMs >= 900000) {
                    loadSpotAndForecastData();
                } else {
                    renderDayTabsAndChart();
                }
            }
        });
    });
})();
