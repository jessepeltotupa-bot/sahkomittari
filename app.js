// Spotpuls (https://spotpuls.app) — 40 European bidding zones, self-learning regional 7-day forecast & postal grid tariff calculator
(function () {
    const ACTIVE_LOC = window.ACTIVE_COUNTRY_LOCALE || null;
    const COUNTRY_ID = ACTIVE_LOC ? ACTIVE_LOC.countryId : 'fi';
    const GLOBAL_MODELS = window.SPOTPULS_GLOBAL_MODELS || null;
    const ALL_ZONES = (GLOBAL_MODELS && GLOBAL_MODELS.zones) || {};
    const COUNTRY_MODEL = (window.NORDPOOL_COUNTRY_MODELS && window.NORDPOOL_COUNTRY_MODELS.countries && window.NORDPOOL_COUNTRY_MODELS.countries[COUNTRY_ID]) || null;

    const UNIT_LABEL = ACTIVE_LOC ? ACTIVE_LOC.unit : 'snt/kWh';
    const UNIT_SHORT = UNIT_LABEL.split('/')[0];
    const CURRENCY_MAJOR = ACTIVE_LOC ? (ACTIVE_LOC.currencyMajor || '€') : '€';
    const SUBUNITS_PER_MAJOR = ACTIVE_LOC ? (ACTIVE_LOC.subunitsPerMajor || 100) : 100;
    const APPROX_PREFIX = ACTIVE_LOC ? ACTIVE_LOC.approxPrefix : 'noin ';
    const RANGE_LABEL = ACTIVE_LOC ? ACTIVE_LOC.rangePrefix : 'Vaihteluväli';
    const FIXED_LABEL = ACTIVE_LOC ? ACTIVE_LOC.fixedText : 'Julkaistu kiinteä hinta';
    const FX_SCALE = ACTIVE_LOC ? (ACTIVE_LOC.fxFromEurCents || (COUNTRY_MODEL ? (COUNTRY_MODEL.fxFromEurCents || 1.0) : 1.0)) : 1.0;
    const ACTIVE_COUNTRY_ID = COUNTRY_ID.toUpperCase();

    const PROB_LABEL = (ACTIVE_LOC && ACTIVE_LOC.probLabel) || 'Todennäköisyys';
    const PRED_WAS_LABEL = (ACTIVE_LOC && ACTIVE_LOC.predWasLabel) || 'Ohjelman ennuste oli';
    const PRED_SHORT_LABEL = (ACTIVE_LOC && ACTIVE_LOC.predShortLabel) || 'Ennuste oli';
    const PUB_SHORT_TPL = (ACTIVE_LOC && ACTIVE_LOC.pubShortTpl) || 'Julk. {date} klo {time}';
    const PUB_FULL_TPL = (ACTIVE_LOC && ACTIVE_LOC.pubFullTpl) || 'Hinta julkaistaan: {date} klo {time}';
    const WEEKDAYS_SHORT = (ACTIVE_LOC && Array.isArray(ACTIVE_LOC.weekdaysShort) && ACTIVE_LOC.weekdaysShort.length === 7)
        ? ACTIVE_LOC.weekdaysShort
        : ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
    const TODAY_WORD = (ACTIVE_LOC && ACTIVE_LOC.todayWord) || 'Tänään';
    const TOMORROW_WORD = (ACTIVE_LOC && ACTIVE_LOC.tomorrowWord) || 'Huomenna';
    const AT_CLOCK_WORD = (ACTIVE_LOC && ACTIVE_LOC.atClockWord !== undefined) ? ACTIVE_LOC.atClockWord : 'klo';
    const SUM_NOW_TITLE = (ACTIVE_LOC && ACTIVE_LOC.sumNowTitle) || 'KULUVAN TUNNIN SÄHKÖHINTA';
    const SUM_MIN_TITLE = (ACTIVE_LOC && ACTIVE_LOC.sumMinTitle) || 'PÄIVÄN HALVIN HINTA';
    const SUM_MAX_TITLE = (ACTIVE_LOC && ACTIVE_LOC.sumMaxTitle) || 'PÄIVÄN KALLEIN HINTA';
    const TIER_BASIS_INTRO = (ACTIVE_LOC && ACTIVE_LOC.tierBasisIntro) || 'Hintataso (30 pv keskihinnan perusteella';
    const TIER_CHEAP = (ACTIVE_LOC && ACTIVE_LOC.tierCheap) || 'Edullinen';
    const TIER_NORM = (ACTIVE_LOC && ACTIVE_LOC.tierNorm) || 'Normaali';
    const TIER_HIGH = (ACTIVE_LOC && ACTIVE_LOC.tierHigh) || 'Korkea';
    const DSO_NETWORK_KICKER = (ACTIVE_LOC && ACTIVE_LOC.dsoNetworkKicker) || 'JAKELUVERKKO';
    const RECEIPT_NOW_TITLE = (ACTIVE_LOC && ACTIVE_LOC.receiptNowTitle) || 'PISTORASIAHINTA NYT';
    const RECEIPT_SPOT_ROW = (ACTIVE_LOC && ACTIVE_LOC.receiptSpotRow) || 'Spot-hinta';
    const RECEIPT_MARGIN_ROW = (ACTIVE_LOC && ACTIVE_LOC.receiptMarginRow) || 'Myyjän marginaali';
    const RECEIPT_TAX_ROW = (ACTIVE_LOC && ACTIVE_LOC.receiptTaxRow) || 'Sähkövero';
    const RECEIPT_TOTAL_ROW = (ACTIVE_LOC && ACTIVE_LOC.receiptTotalRow) || 'KOKONAISHINTA YHTEENSÄ';
    const RECEIPT_CHEAPEST_TODAY = (ACTIVE_LOC && ACTIVE_LOC.receiptCheapestToday) || 'Päivän halvin tunti tänään';
    const RECEIPT_AVG_TODAY = (ACTIVE_LOC && ACTIVE_LOC.receiptAvgToday) || 'Tämän päivän keskihinta (kok.)';
    const RECEIPT_AVG_TOMORROW = (ACTIVE_LOC && ACTIVE_LOC.receiptAvgTomorrow) || 'Huomisen keskihinta (kok.)';
    const EXPECT_WORD = (ACTIVE_LOC && ACTIVE_LOC.expectWord) || 'odotus';
    const OPT_BEST_WINDOW_TPL = (ACTIVE_LOC && ACTIVE_LOC.optBestWindowTpl) || 'EDULLISIN {h} TUNNIN KÄYTTÖIKKUNA (SEURAAVAT 36 H)';
    const OPT_PROB_TOTAL_LABEL = (ACTIVE_LOC && ACTIVE_LOC.optProbTotalLabel) || 'Todennäköinen kokonaishinta';
    const OPT_AVG_TOTAL_LABEL = (ACTIVE_LOC && ACTIVE_LOC.optAvgTotalLabel) || 'Kokonaiskeskihinta';
    const OPT_TRANSFER_TAX_LABEL = (ACTIVE_LOC && ACTIVE_LOC.optTransferTaxLabel) || 'Siirto & vero';
    const OPT_CONSUMPTION_LABEL = (ACTIVE_LOC && ACTIVE_LOC.optConsumptionLabel) || 'Kulutus';
    const OPT_SAVED_LABEL = (ACTIVE_LOC && ACTIVE_LOC.optSavedLabel) || 'Säästö kalleimpaan jaksoon verrattuna';
    const API_COPY_BTN = (ACTIVE_LOC && ACTIVE_LOC.apiCopyBtn) || 'Kopioi URL';
    const API_COPIED_BTN = (ACTIVE_LOC && ACTIVE_LOC.apiCopiedBtn) || 'Kopioitu!';

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
        const vatR = ACTIVE_LOC.vatRate || (COUNTRY_MODEL ? COUNTRY_MODEL.vatRate : 1.25);
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

    let urlZoneOverride = null;
    try {
        const sp = new URLSearchParams(window.location.search || '');
        const zParam = (sp.get('zone') || sp.get('bzn') || '').trim();
        if (zParam && ALL_ZONES[zParam]) {
            urlZoneOverride = zParam;
        }
    } catch (_) {}

    const defaultZoneForMarket = (ACTIVE_LOC && ACTIVE_LOC.defaultZone)
        || (COUNTRY_MODEL && COUNTRY_MODEL.defaultZone)
        || 'FI';
    const savedZone = localStorage.getItem(storagePrefix + 'zone');
    const initialZone = urlZoneOverride
        || (savedZone && ALL_ZONES[savedZone] ? savedZone : null)
        || defaultZoneForMarket;

    const defaultMarginStr = ACTIVE_LOC && ACTIVE_LOC.defaultMargin !== undefined
        ? String(ACTIVE_LOC.defaultMargin)
        : (FX_SCALE > 3 ? '4.50' : '0.45');

    const state = {
        activeZone: initialZone,
        hasUserPostal: localStorage.getItem(storagePrefix + 'has_user_postal') === '1',
        postalCode: localStorage.getItem(storagePrefix + 'postal') || (ACTIVE_LOC ? ACTIVE_LOC.defaultPostal : '00100'),
        cityName: localStorage.getItem(storagePrefix + 'city') || (ACTIVE_LOC ? ACTIVE_LOC.defaultCity : 'Helsinki'),
        dsoId: localStorage.getItem(storagePrefix + 'dso') || (ACTIVE_LOC ? defaultDsoKey : 'helen'),
        altDsoIds: [],
        tariffType: localStorage.getItem(storagePrefix + 'tariff') || 'general',
        marginCents: parseFloat(localStorage.getItem(storagePrefix + 'margin') || defaultMarginStr),
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

    function getActiveZoneConfig() {
        return ALL_ZONES[state.activeZone] || ALL_ZONES[defaultZoneForMarket] || ALL_ZONES['FI'] || {
            code: state.activeZone || 'FI',
            bzn: state.activeZone || 'FI',
            exchange: 'Nord Pool',
            tz: 'Europe/Helsinki',
            pubHour: 13,
            pubMin: 45,
            baseSpotEurCentsVat0: 5.2,
            windCapMw: 8450,
            solarCapMw: 1250,
            nuclearCapMw: 4394
        };
    }

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
        const wdStr = WEEKDAYS_SHORT[wdIdx] || '';
        const dateStr = `${wdStr} ${pubDay}.${pubMonth}.`;
        const zcfg = getActiveZoneConfig();
        const ph = zcfg.pubHour !== undefined ? zcfg.pubHour : 13;
        const pm = zcfg.pubMin !== undefined ? zcfg.pubMin : 45;
        const clockTime = `${String(ph).padStart(2, '0')}:${String(pm).padStart(2, '0')}`;
        const tpl = shortForm ? PUB_SHORT_TPL : PUB_FULL_TPL;
        return tpl.replace('{date}', dateStr).replace('{time}', clockTime);
    }

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
            localStorage.setItem(storagePrefix + 'zone', state.activeZone);
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
        const base30dInclVat = (state.rolling30dMeanInclVat && state.rolling30dMeanInclVat > 0.2)
            ? state.rolling30dMeanInclVat
            : 5.60;
        const isNo4 = state.activeZone === 'NO4';
        const vatFactor = (state.includeVat && !isNo4) ? 1.0 : (1.0 / (DSO_DATA.vatRate || 1.255));
        const avg30d = Number((base30dInclVat * vatFactor * FX_SCALE).toFixed(2));
        const cheapThresh = Number(Math.max(0.25 * FX_SCALE, avg30d * 0.75).toFixed(2));
        const highThresh = Number(Math.max(cheapThresh + 0.60 * FX_SCALE, avg30d * 1.25).toFixed(2));
        return { avg30d, cheapThresh, highThresh };
    }

    function formatNum(val, decimals = 2) {
        if (val === null || val === undefined || isNaN(val)) return '—';
        const useDot = ['en', 'gb', 'ie', 'ch'].includes(COUNTRY_ID);
        const s = Number(val).toFixed(decimals);
        return useDot ? s : s.replace('.', ',');
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
        const zoneCode = state.activeZone || (dso && dso.zone) || defaultZoneForMarket;
        const isNo4VatExempt = zoneCode === 'NO4';
        const vatDivider = (state.includeVat && !isNo4VatExempt) ? 1.0 : DSO_DATA.vatRate;
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

        if (slot.isZoneNative && slot.spotVat0EurCents !== undefined) {
            const vatMult = (state.includeVat && !isNo4VatExempt) ? DSO_DATA.vatRate : 1.0;
            const scale = FX_SCALE * vatMult;
            const spotCents = slot.spotVat0EurCents * scale;
            const minSpotCents = (slot.minVat0EurCents !== undefined ? slot.minVat0EurCents : slot.spotVat0EurCents) * scale;
            const maxSpotCents = (slot.maxVat0EurCents !== undefined ? slot.maxVat0EurCents : slot.spotVat0EurCents) * scale;
            const predictedSpotCents = (slot.predVat0EurCents !== undefined ? slot.predVat0EurCents : slot.spotVat0EurCents) * scale;
            const predictedMinSpotCents = (slot.predMinVat0EurCents !== undefined ? slot.predMinVat0EurCents : predictedSpotCents / scale) * scale;
            const predictedMaxSpotCents = (slot.predMaxVat0EurCents !== undefined ? slot.predMaxVat0EurCents : predictedSpotCents / scale) * scale;
            return {
                spotCents,
                minSpotCents,
                maxSpotCents,
                predictedSpotCents,
                predictedMinSpotCents,
                predictedMaxSpotCents,
                predictedTotalCents: predictedSpotCents + fixedAdd,
                marginCents,
                transferCents,
                transferLabel,
                isNightRate,
                taxCents,
                totalCents: spotCents + fixedAdd,
                minTotalCents: minSpotCents + fixedAdd,
                maxTotalCents: maxSpotCents + fixedAdd
            };
        }

        const zoneCfg = (COUNTRY_MODEL && COUNTRY_MODEL.zones && COUNTRY_MODEL.zones[zoneCode]) || { spotScale: 1.0 };
        const zoneMult = FX_SCALE * (zoneCfg.spotScale || 1.0);
        const baseSpotIncl = slot.priceInclVat * zoneMult;
        const baseSpotVat0 = (slot.priceInclVat / 1.255) * zoneMult;
        const spotCents = (state.includeVat && !isNo4VatExempt) ? baseSpotIncl : baseSpotVat0;
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

    const tzFmtCache = new Map();
    const helsinkiComponentsCache = new Map();

    function getZoneFormatter(tzName) {
        const tz = tzName || 'Europe/Helsinki';
        let fmt = tzFmtCache.get(tz);
        if (!fmt) {
            try {
                fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: tz,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    weekday: 'short',
                    hour12: false
                });
            } catch (_) {
                fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Europe/Helsinki',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    weekday: 'short',
                    hour12: false
                });
            }
            tzFmtCache.set(tz, fmt);
        }
        return fmt;
    }

    function getHelsinkiComponents(dateObj, explicitTz) {
        const ms = typeof dateObj === 'number' ? dateObj : dateObj.getTime();
        const hourBucket = Math.floor(ms / 3600000) * 3600000;
        const tz = explicitTz || getActiveZoneConfig().tz || 'Europe/Helsinki';
        const cacheKey = `${tz}_${hourBucket}`;
        const cached = helsinkiComponentsCache.get(cacheKey);
        if (cached) return cached;

        const parts = getZoneFormatter(tz).formatToParts(new Date(hourBucket));
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
        helsinkiComponentsCache.set(cacheKey, res);
        return res;
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

    const easterUtcCache = new Map();
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

    function getDayTypeIndex(dateKey, isWeekend, isSat, isFinland = false) {
        const isHol = isPublicHolidayDateKey(dateKey, isFinland);
        if ((isWeekend && !isSat) || (isHol && !isSat)) return 2;
        if (isSat) return 1;
        return 0;
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
        const isFreeDay = obs.isWeekend || isPublicHolidayDateKey(obs.dateKey || '', true);
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

        return Math.max(-3.30, lin + hAdj + gAdj + extraNucPremium);
    }

    function toFiLogPrice(yCents, shift = 3.5) {
        return Math.log(Math.max(0.20, Number(yCents) + shift));
    }

    function fromFiLogPrice(zVal, shift = 3.5) {
        return Math.max(-3.30, Math.exp(Math.max(-1.61, Math.min(4.85, Number(zVal)))) - shift);
    }

    function getEstlink2OnlineStatus(dateKey) {
        if (dateKey && dateKey >= '2024-01-26' && dateKey <= '2024-09-07') return 0.0;
        if (dateKey && dateKey >= '2024-12-25' && dateKey <= '2025-07-15') return 0.0;
        return 1.0;
    }

    function computePhysicalResidualLoadGw(obs) {
        const temp = Number(obs.tempC ?? 4.0);
        const t72 = Number(obs.rolling72hTempC ?? temp);
        const effTemp = 0.65 * temp + 0.35 * t72;
        const heatingMw = Math.max(0.0, 14.0 - effTemp) * 185.0 + Math.max(0.0, -5.0 - effTemp) * 95.0;
        const h = Number(obs.hour ?? 12);
        const dti = obs.dayType !== undefined
            ? obs.dayType
            : getDayTypeIndex(obs.dateKey || '', Boolean(obs.isWeekend), Boolean(obs.isSat), true);
        const isFree = dti > 0;
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
        const solarMw = Number(obs.solarMw ?? radiationToSolarMw(obs.solarRadWm2, obs.month || 1, h));
        const nucDef = Number(obs.nuclearDeficitMw ?? getScenarioNuclearDeficitMw(obs.dateKey || ''));
        const nucMw = FINLAND_NUCLEAR_MAX_MW - nucDef;
        const seCf = windSpeedToCapacityFactor(obs.seWindSpeed ?? 6.5);
        const eeCf = windSpeedToCapacityFactor(obs.eeWindSpeed ?? 6.5);
        const el2 = obs.estlink2Online !== undefined ? Number(obs.estlink2Online) : getEstlink2OnlineStatus(obs.dateKey || '');
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
        const dti = obs.dayType !== undefined
            ? obs.dayType
            : getDayTypeIndex(obs.dateKey || '', Boolean(obs.isWeekend), Boolean(obs.isSat), true);
        const isFree = dti > 0 ? 1.0 : 0.0;
        const isSat = dti === 1 ? 1.0 : 0.0;
        const isSunHol = dti === 2 ? 1.0 : 0.0;
        const rl = obs.resLoadGw !== undefined ? Number(obs.resLoadGw) : computePhysicalResidualLoadGw(obs);
        const hdd = Math.max(0.0, 12.0 - tempC) / 20.0;
        const rollingHdd = Math.max(0.0, 10.0 - t72) / 20.0;
        const solarMw = Number(obs.solarMw ?? radiationToSolarMw(obs.solarRadWm2, obs.month || 1, h));
        const solarRatio = solarMw / FINLAND_SOLAR_MAX_MW;
        const nucDef = Number(obs.nuclearDeficitMw ?? getScenarioNuclearDeficitMw(obs.dateKey || '')) / 2000.0;
        const seCf = windSpeedToCapacityFactor(obs.seWindSpeed ?? 6.5);
        const eeCf = windSpeedToCapacityFactor(obs.eeWindSpeed ?? 6.5);
        const el2 = obs.estlink2Online !== undefined ? Number(obs.estlink2Online) : getEstlink2OnlineStatus(obs.dateKey || '');
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
                isSat,
                isSunHol,
                nucDef,
                seCf * (1.0 - 0.5 * wRatio),
                (0.65 + 0.35 * el2) * Math.max(0.0, 0.45 - eeCf) * ((h >= 7 && h <= 21) ? 1.0 : 0.35),
                Math.max(0.0, 0.32 - w24Ratio) * 2.0
            ]
        };
    }

    function predictFiLogFundamental(obs, ens) {
        const ex = extractFiLogMeritFeatures21(obs);
        const wLog = ens.wLog || [];
        let zf = 0.0;
        for (let i = 0; i < wLog.length && i < ex.feats.length; i++) {
            zf += wLog[i] * ex.feats[i];
        }
        const hrAdj = ens.dayTypeHourLogAdj?.[ex.dti]?.[obs.hour] || 0.0;
        return { zFund: zf + hrAdj, ex };
    }

    function predictFiLogMeritEnsemble(obs, ens, arCtx, learnedModelFallback, prevAvgFallback) {
        if (!ens || !Array.isArray(ens.wLog) || ens.wLog.length < 21) {
            return predictWithLearnedModel(obs, learnedModelFallback || ML_BASE.model, prevAvgFallback);
        }
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
        const arTerm = (
            wZar[0] * zanom24
            + wZar[1] * zanom7d
            + wZar[2] * zlag24
            + wZar[3] * zlag168
        ) * damp;

        const nucDefMw = Number(obs.nuclearDeficitMw ?? getScenarioNuclearDeficitMw(obs.dateKey || ''));
        const xt = [
            ex.wRatio,
            ex.w12Ratio,
            ex.rl,
            Number(obs.tempC ?? 4.0),
            Number(obs.rolling72hTempC ?? obs.tempC ?? 4.0),
            Number(obs.hour ?? 12),
            Number(ex.dti),
            ex.solarMw,
            nucDefMw,
            ex.seCf,
            ex.eeCf,
            zanom24 * decay,
            zanom7d * decay,
            Number(obs.month ?? 1)
        ];
        const treeSum = evalCompactTrees(ens.trees, xt);
        const zp = zFund + arTerm + treeSum + Number(ens.medShift || 0.0);
        const baseCents = fromFiLogPrice(zp, shift);

        const scenDefMw = getScenarioNuclearDeficitMw(obs.dateKey || '');
        const baseDefMw = Number(obs.baseNuclearDeficitMw ?? nucDefMw);
        const extraDefMw = Math.max(0, scenDefMw - baseDefMw);
        const extraNucPremium = extraDefMw > 0
            ? (extraDefMw / 1000.0) * (1.25 + 3.40 * Math.max(0, 0.65 - ex.wRatio)) * (ex.dti > 0 ? 0.65 : 1.0)
            : 0.0;
        return Math.max(-3.30, baseCents + extraNucPremium);
    }

    function runBrowserOnlineLearning(officialHourlyMap, weatherMap) {
        const obsStorageKey = storagePrefix + 'ps_online_obs_v2';
        const errLedgerKey = storagePrefix + 'ps_verified_errors_v1';
        const preConfirmKey = storagePrefix + 'preconfirm_v3';

        let storedObs = {};
        let verifiedLedger = {};
        let preConfirmSnapshot = {};
        try {
            const raw = localStorage.getItem(obsStorageKey);
            if (raw) storedObs = JSON.parse(raw) || {};
        } catch (_) {}
        try {
            const rawErr = localStorage.getItem(errLedgerKey);
            if (rawErr) verifiedLedger = JSON.parse(rawErr) || {};
        } catch (_) {}
        try {
            const rawPre = localStorage.getItem(preConfirmKey);
            if (rawPre) preConfirmSnapshot = JSON.parse(rawPre) || {};
        } catch (_) {}

        for (const [hMs, spotObj] of officialHourlyMap.entries()) {
            if (weatherMap.has(hMs)) {
                const w = weatherMap.get(hMs);
                storedObs[hMs] = {
                    epochMs: Number(hMs),
                    priceInclVat: spotObj.priceInclVat,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarRadWm2: w.solarRadWm2 || 0,
                    pressureHpa: w.pressureHpa || 1013,
                    seWindSpeed: w.seWindSpeed || w.windSpeed100m || 6.5,
                    eeWindSpeed: w.eeWindSpeed || w.windSpeed100m || 6.5,
                    rolling24hWindMw: w.rolling24hWindMw || w.windMw,
                    windRamp6hMw: w.windRamp6hMw || 0,
                    rolling72hTempC: w.rolling72hTempC !== undefined ? w.rolling72hTempC : w.tempC
                };
                const pre = preConfirmSnapshot[hMs];
                if (pre && pre.wasForecast && typeof pre.estInclVat === 'number') {
                    verifiedLedger[hMs] = {
                        epochMs: Number(hMs),
                        predicted: pre.estInclVat,
                        minIncl: pre.minIncl,
                        maxIncl: pre.maxIncl,
                        actual: spotObj.priceInclVat,
                        error: Number((spotObj.priceInclVat - pre.estInclVat).toFixed(3)),
                        inRange: spotObj.priceInclVat >= (pre.minIncl - 0.05) && spotObj.priceInclVat <= (pre.maxIncl + 0.05)
                    };
                }
            }
        }

        const sortedKeys = Object.keys(storedObs).map(Number).sort((a, b) => a - b);
        const trimmedKeys = sortedKeys.slice(-1000);
        const nextStore = {};
        for (const k of trimmedKeys) nextStore[k] = storedObs[k];
        try {
            localStorage.setItem(obsStorageKey, JSON.stringify(nextStore));
        } catch (_) {}

        const verKeys = Object.keys(verifiedLedger).map(Number).sort((a, b) => a - b).slice(-720);
        const nextVer = {};
        for (const k of verKeys) nextVer[k] = verifiedLedger[k];
        try {
            localStorage.setItem(errLedgerKey, JSON.stringify(nextVer));
        } catch (_) {}

        const activeModel = JSON.parse(JSON.stringify(ML_BASE.model));
        if (!Array.isArray(activeModel.weekdayHourAdj)) activeModel.weekdayHourAdj = new Array(24).fill(0);
        if (!Array.isArray(activeModel.weekendHourAdj)) activeModel.weekendHourAdj = new Array(24).fill(0);
        if (!activeModel.windTempGridAdj) activeModel.windTempGridAdj = {};

        const latestMs = trimmedKeys.length > 0 ? trimmedKeys[trimmedKeys.length - 1] : Date.now();
        let preLearnErrSum = 0.0;
        let postLearnErrSum = 0.0;
        let count = 0;

        // Moniparametrinen NLMS-verkko-oppiminen (Normalized Least Mean Squares) + tunti- ja sääluokkakohtainen virheenkorjaus:
        // Kun ohjelma saa uusia toteutuneita hintoja, se vertaa ennustettaan toteumaan ja korjaa 24 muuttujan painoja,
        // tuntiprofiilia sekä tuuli x lämpötila -matriisia suoraan havaittujen ennustevirheiden perusteella.
        for (const k of trimmedKeys) {
            const item = nextStore[k];
            const hel = getHelsinkiComponents(item.epochMs);
            let pastSum = 0, pastCnt = 0;
            for (let lag = 24; lag <= 48; lag++) {
                const prev = nextStore[item.epochMs - lag * 3600000];
                if (prev) {
                    pastSum += prev.priceInclVat;
                    pastCnt++;
                }
            }
            const prevAvg = pastCnt > 0 ? (pastSum / pastCnt) : 5.5;
            const lag24Prev = nextStore[item.epochMs - 24 * 3600000];
            const lag24Same = lag24Prev ? lag24Prev.priceInclVat : prevAvg;

            const obsObj = {
                epochMs: item.epochMs,
                dateKey: hel.dateKey,
                month: hel.month,
                hour: hel.hour,
                isWeekend: hel.isWeekend,
                windMw: item.windMw,
                windSpeed100m: item.windSpeed100m || 6.5,
                rolling24hWindMw: item.rolling24hWindMw || item.windMw,
                windRamp6hMw: item.windRamp6hMw || 0,
                tempC: item.tempC,
                rolling72hTempC: item.rolling72hTempC !== undefined ? item.rolling72hTempC : item.tempC,
                solarRadWm2: item.solarRadWm2 || 0,
                pressureHpa: item.pressureHpa || 1013,
                seWindSpeed: item.seWindSpeed || 6.5,
                eeWindSpeed: item.eeWindSpeed || 6.5,
                lag24hSameHour: lag24Same,
                prev24hMean: prevAvg,
                prev7dMean: prevAvg
            };

            const basePred = predictWithLearnedModel(obsObj, ML_BASE.model, prevAvg);
            const adaptivePred = predictWithLearnedModel(obsObj, activeModel, prevAvg);
            const rawErr = item.priceInclVat - adaptivePred;
            const err = Math.max(-10.0, Math.min(10.0, rawErr));

            preLearnErrSum += Math.abs(item.priceInclVat - basePred);
            postLearnErrSum += Math.abs(rawErr);
            count++;

            const ageHours = Math.max(0.0, (latestMs - item.epochMs) / 3600000);
            const recencyW = Math.exp(-ageHours / 180.0);
            const verItem = nextVer[item.epochMs];
            const verifiedErrMag = verItem ? Math.abs(verItem.error) : Math.abs(err);
            const hardBoost = 1.0 + Math.min(1.6, verifiedErrMag / 2.5);

            const x = extractFeatures(obsObj, prevAvg);
            let normSq = 1.0;
            for (let j = 0; j < x.length; j++) normSq += x[j] * x[j];
            const nlmsStep = (0.014 * recencyW * hardBoost * err) / normSq;

            for (let j = 0; j < x.length && j < activeModel.weights.length; j++) {
                activeModel.weights[j] += nlmsStep * x[j];
            }
            // Fysikaaliset etumerkkirajoitteet: aurinkovoima ei nosta hintaa, ydinvoimavaje ei laske hintaa
            if (activeModel.weights[15] > 0) activeModel.weights[15] = 0;
            if (activeModel.weights[16] < 0) activeModel.weights[16] = 0.25;
            if (activeModel.weights[17] < 0) activeModel.weights[17] = 0.80;

            const hAlpha = 0.045 * recencyW * hardBoost;
            if (hel.isWeekend) {
                activeModel.weekendHourAdj[hel.hour] = Number(((1.0 - hAlpha) * activeModel.weekendHourAdj[hel.hour] + hAlpha * (activeModel.weekendHourAdj[hel.hour] + err * 0.45)).toFixed(4));
            } else {
                activeModel.weekdayHourAdj[hel.hour] = Number(((1.0 - hAlpha) * activeModel.weekdayHourAdj[hel.hour] + hAlpha * (activeModel.weekdayHourAdj[hel.hour] + err * 0.45)).toFixed(4));
            }

            const wBin = Math.min(4, Math.floor((item.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
            const tBin = item.tempC < -5 ? 0 : (item.tempC < 2 ? 1 : (item.tempC < 10 ? 2 : 3));
            const gKey = `${wBin}_${tBin}`;
            const curG = activeModel.windTempGridAdj[gKey] || 0.0;
            const gAlpha = 0.035 * recencyW * hardBoost;
            activeModel.windTempGridAdj[gKey] = Number(((1.0 - gAlpha) * curG + gAlpha * (curG + err * 0.40)).toFixed(4));
        }

        for (let j = 0; j < activeModel.weights.length; j++) {
            activeModel.weights[j] = Number(activeModel.weights[j].toFixed(5));
        }

        state.mlStats.activeModel = activeModel;
        state.mlStats.onlineNewHours = count;
        state.mlStats.totalLearnedHours = (ML_BASE.totalObservations || 17500) + count;
        if (count >= 12) {
            state.mlStats.liveMaeCents = Number((postLearnErrSum / count).toFixed(2));
            state.mlStats.baseMaeCents = Number((preLearnErrSum / count).toFixed(2));
        }
        state.mlStats.verifiedCount = verKeys.length;
        return activeModel;
    }

    const NORDIC_BALTIC_SPOT_ZONES = new Set([
        'FI', 'SE1', 'SE2', 'SE3', 'SE4',
        'NO1', 'NO2', 'NO3', 'NO4', 'NO5',
        'DK1', 'DK2', 'EE', 'LV', 'LT'
    ]);

    function extractRegionalFeatures(obs, zcfg, prevVat0 = 6.5) {
        const windCap = Math.max(100, zcfg.windCapMw || 3000);
        const solarCap = Math.max(50, zcfg.solarCapMw || 1000);
        const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / windCap));
        const tempC = obs.tempC;
        const hour = obs.hour;
        const isFreeDay = obs.isWeekend || isPublicHolidayDateKey(obs.dateKey || '', false);
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
        const prev24 = (prevVat0 !== null && !isNaN(prevVat0)) ? prevVat0 : (zcfg.baseSpotEurCentsVat0 || 6.5);
        const arLevel = (Math.min(25.0, prev24) / 10.0) * windMemoryDamping;

        const isHeatingSeason = [10, 11, 12, 1, 2, 3, 4].includes(obs.month) ? 1.0 : 0.0;
        const heatingPeak = isHeatingSeason * (!isFreeDay && ((hour >= 7 && hour <= 10) || (hour >= 16 && hour <= 21)) ? 1.0 : 0.0) * (1.0 - wRatio);

        const t72 = obs.rolling72hTempC !== undefined ? obs.rolling72hTempC : tempC;
        const rolling72hHdd = Math.max(0.0, 10.0 - t72) / 20.0;

        const solarRatio = Math.max(0.0, Math.min(0.90, (obs.solarMw || 0) / solarCap));
        const w24Ratio = Math.max(0.01, Math.min(0.95, (obs.rolling24hWindMw || obs.windMw) / windCap));
        const rolling24hLowWind = Math.max(0.0, 0.35 - w24Ratio) * 2.0;
        const windRampDrop = Math.max(0.0, -(obs.windRamp6hMw || 0.0)) / Math.max(250.0, windCap * 0.30);

        const borderCf = windSpeedToCapacityFactor(obs.borderWindSpeed !== undefined ? obs.borderWindSpeed : 6.5);
        const importRelief = borderCf * (1.0 - wRatio * 0.5);
        const exportPull = Math.max(0.0, 0.45 - borderCf) * (hour >= 7 && hour <= 21 ? 1.0 : 0.3);

        const pressHpa = obs.pressureHpa !== undefined ? obs.pressureHpa : 1013.0;
        const blockingHigh = Math.max(0.0, (pressHpa - 1018.0) / 25.0) * isHeatingSeason;

        const lag24Same = Math.min(30.0, obs.lag24hSameHour !== undefined ? obs.lag24hSameHour : prev24);
        const arComposite = ((0.55 * lag24Same + 0.45 * prev24) / 10.0) * windMemoryDamping;

        return [
            1.0, wRatio, wRatio * wRatio, lowWindScarcity, hdd, severeCold,
            morningPeak, eveningPeak, nightTrough, isFree, calmColdInter,
            arLevel, isHeatingSeason, heatingPeak, rolling72hHdd, solarRatio,
            0.0, 0.0, rolling24hLowWind, windRampDrop, importRelief,
            exportPull, blockingHigh, arComposite
        ];
    }

    function predictRegionalVat0(obs, zModel, zcfg, prevVat0) {
        const windCap = Math.max(100, zcfg.windCapMw || 3000);
        const x = extractRegionalFeatures(obs, zcfg, prevVat0);
        let lin = 0.0;
        const wArr = (zModel && Array.isArray(zModel.weights)) ? zModel.weights : [6.5, -8.0, 1.5, 2.2, 1.2, 1.8, 2.1, 1.9, -1.8, -1.4, 2.0, 0.3, 1.2, 1.4, -1.5, -4.5, 0, 0, -2.0, -0.7, -0.7, 1.2, 1.3, 3.0];
        for (let i = 0; i < x.length && i < wArr.length; i++) {
            lin += wArr[i] * x[i];
        }
        const wRatio = Math.max(0.01, Math.min(0.95, obs.windMw / windCap));
        const hRaw = obs.isWeekend
            ? (zModel.weekendHourAdj?.[obs.hour] || 0.0)
            : (zModel.weekdayHourAdj?.[obs.hour] || 0.0);
        const hScale = hRaw > 0 ? Math.max(0.22, 1.15 - 0.85 * wRatio) : 1.0;
        const wBin = Math.min(4, Math.floor(wRatio * 5));
        const tBin = obs.tempC < -5 ? 0 : (obs.tempC < 5 ? 1 : (obs.tempC < 18 ? 2 : 3));
        const gAdj = zModel.windTempGridAdj?.[`${wBin}_${tBin}`] || 0.0;
        const coolingAdj = Math.max(0.0, obs.tempC - 21.0) * (zcfg.heatSens || 0.15) * (obs.hour >= 11 && obs.hour <= 21 ? 0.42 : 0.15);
        return Math.max(-2.80, lin + hRaw * hScale + gAdj + coolingAdj);
    }

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
        const dti = obs.dayType !== undefined
            ? obs.dayType
            : getDayTypeIndex(obs.dateKey || '', Boolean(obs.isWeekend), Boolean(obs.isSat), zcfg.code === 'FI');
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
        for (let i = 0; i < wLog.length && i < ex.feats.length; i++) {
            zf += wLog[i] * ex.feats[i];
        }
        const hrAdj = lm.dayTypeHourLogAdj?.[ex.dti]?.[obs.hour] || 0.0;
        return { zFund: zf + hrAdj, ex };
    }

    function predictZoneLogMeritVat0(obs, zModel, zcfg, arCtx, prevVat0Fallback) {
        const lm = zModel?.logMeritModel;
        if (!lm || !Array.isArray(lm.wLog) || lm.wLog.length < 15) {
            return predictRegionalVat0(obs, zModel, zcfg, prevVat0Fallback);
        }
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
        const arTerm = (
            wZar[0] * zanom24
            + wZar[1] * zanom7d
            + wZar[2] * zlag24
            + wZar[3] * zlag168
        ) * damp;

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

    async function fetchRegionalZoneWithOnlineML(zoneCode) {
        const now = new Date();
        const zcfg = getActiveZoneConfig();
        const windCap = Math.max(100, zcfg.windCapMw || 3000);
        const solarCap = Math.max(50, zcfg.solarCapMw || 1000);
        const nuclearCap = zcfg.nuclearCapMw || 0;
        const baseVat0 = zcfg.baseSpotEurCentsVat0 || ((zcfg.baseEurMwh || 65.0) / 10.0);
        const minuteCacheBust = Math.floor(Date.now() / 60000);

        const coords = (Array.isArray(zcfg.coords) && zcfg.coords.length >= 3)
            ? zcfg.coords
            : [
                { lat: 54.18, lon: 7.89 },
                { lat: 52.85, lon: 9.85 },
                { lat: 50.11, lon: 8.68 },
                { lat: 55.47, lon: 8.45 }
            ];
        const lats = coords.map(c => c.lat).join(',');
        const lons = coords.map(c => c.lon).join(',');
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=14&forecast_days=8&timezone=UTC`;

        const apiUrl = `/api/v1/prices?zone=${encodeURIComponent(zoneCode)}&vat=0&currency=eur_cents&_t=${minuteCacheBust}`;

        let directMarketPromise = Promise.resolve(null);
        if (NORDIC_BALTIC_SPOT_ZONES.has(zoneCode)) {
            directMarketPromise = fetch(`https://api.spot-hinta.fi/TodayAndDayForward?region=${encodeURIComponent(zoneCode)}&_t=${minuteCacheBust}`, { cache: 'no-store' }).catch(() => null);
        } else if (zoneCode === 'DE-LU' || zoneCode === 'AT') {
            const host = zoneCode === 'AT' ? 'api.awattar.at' : 'api.awattar.de';
            const sMs = Date.now() - 8 * 86400000;
            const eMs = Date.now() + 2 * 86400000;
            directMarketPromise = fetch(`https://${host}/v1/marketdata?start=${sMs}&end=${eMs}`, { cache: 'no-store' }).catch(() => null);
        } else if (zoneCode === 'ES' || zoneCode === 'PT') {
            const sIso = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 16);
            const eIso = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16);
            directMarketPromise = fetch(`https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${sIso}&end_date=${eIso}&time_trunc=hour`, { cache: 'no-store' }).catch(() => null);
        } else if (zoneCode === 'GB') {
            directMarketPromise = fetch('https://api.octopus.energy/v1/products/AGILE-24-10-01/electricity-tariffs/E-1R-AGILE-24-10-01-C/standard-unit-rates/?page_size=240', { cache: 'no-store' }).catch(() => null);
        }

        const [apiResp, directResp, weatherResp] = await Promise.all([
            fetch(apiUrl, { cache: 'no-store' }).catch(() => null),
            directMarketPromise,
            fetch(weatherUrl).catch(() => null)
        ]);

        const officialVat0Map = new Map();

        try {
            if (apiResp && apiResp.ok) {
                const apiJson = await apiResp.json();
                const apiRows = Array.isArray(apiJson?.series) ? apiJson.series : (Array.isArray(apiJson?.hourly) ? apiJson.hourly : []);
                if (apiRows.length > 0) {
                    for (const row of apiRows) {
                        const pVal = row?.spotPrice ?? row?.price;
                        if (row && !row.isForecast && typeof pVal === 'number') {
                            const hMs = Math.floor((row.epochMs || Date.parse(row.timestamp)) / 3600000) * 3600000;
                            if (!isNaN(hMs)) officialVat0Map.set(hMs, Number(pVal));
                        }
                    }
                }
            }
        } catch (_) {}

        try {
            if (directResp && directResp.ok) {
                const dj = await directResp.json();
                if (NORDIC_BALTIC_SPOT_ZONES.has(zoneCode) && Array.isArray(dj)) {
                    const buckets = new Map();
                    for (const it of dj) {
                        if (!it || !it.DateTime || it.PriceNoTax === undefined) continue;
                        const hMs = Math.floor(Date.parse(it.DateTime) / 3600000) * 3600000;
                        const cVat0 = Number(it.PriceNoTax) * 100.0;
                        if (!isNaN(hMs) && !isNaN(cVat0)) {
                            if (!buckets.has(hMs)) buckets.set(hMs, []);
                            buckets.get(hMs).push(cVat0);
                        }
                    }
                    for (const [hMs, arr] of buckets.entries()) {
                        officialVat0Map.set(hMs, Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)));
                    }
                } else if ((zoneCode === 'DE-LU' || zoneCode === 'AT') && dj && Array.isArray(dj.data)) {
                    for (const it of dj.data) {
                        if (!it || it.start_timestamp === undefined || it.marketprice === undefined) continue;
                        const hMs = Math.floor(Number(it.start_timestamp) / 3600000) * 3600000;
                        officialVat0Map.set(hMs, Number((Number(it.marketprice) / 10.0).toFixed(3)));
                    }
                } else if ((zoneCode === 'ES' || zoneCode === 'PT') && dj && Array.isArray(dj.included)) {
                    const spotInd = dj.included.find(x => String(x.id) === '1001') || dj.included[0];
                    const vals = spotInd?.attributes?.values || [];
                    for (const v of vals) {
                        const hMs = Math.floor(Date.parse(v.datetime) / 3600000) * 3600000;
                        const cVat0 = Number(v.value) / 10.0;
                        if (!isNaN(hMs) && !isNaN(cVat0)) officialVat0Map.set(hMs, Number(cVat0.toFixed(3)));
                    }
                } else if (zoneCode === 'GB' && dj && Array.isArray(dj.results)) {
                    const buckets = new Map();
                    for (const r of dj.results) {
                        const hMs = Math.floor(Date.parse(r.valid_from) / 3600000) * 3600000;
                        if (isNaN(hMs)) continue;
                        const ukComp = getHelsinkiComponents(hMs, 'Europe/London');
                        const peakAdder = (ukComp.hour >= 16 && ukComp.hour < 19) ? 12.0 : 0.0;
                        const wholesalePence = Math.max(-5.0, (Number(r.value_exc_vat) - peakAdder) / 2.0);
                        const estWholesaleEurCents = wholesalePence / 0.84;
                        if (!isNaN(estWholesaleEurCents)) {
                            if (!buckets.has(hMs)) buckets.set(hMs, []);
                            buckets.get(hMs).push(estWholesaleEurCents);
                        }
                    }
                    for (const [hMs, arr] of buckets.entries()) {
                        if (!officialVat0Map.has(hMs)) {
                            officialVat0Map.set(hMs, Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)));
                        }
                    }
                }
            }
        } catch (_) {}

        const weatherMap = new Map();
        try {
            if (weatherResp && weatherResp.ok) {
                const dw = await weatherResp.json();
                const locs = Array.isArray(dw) ? dw : [dw];
                if (locs.length >= 1 && locs[0].hourly && Array.isArray(locs[0].hourly.time)) {
                    const times = locs[0].hourly.time;
                    const l0 = locs[0];
                    const l1 = locs[1] || l0;
                    const l2 = locs[2] || l0;
                    const l3 = locs[3] || l0;
                    for (let i = 0; i < times.length; i++) {
                        const tMs = Date.parse(times[i] + ':00Z');
                        const w1 = l0.hourly.wind_speed_100m?.[i] ?? 6.2;
                        const w2 = l1.hourly.wind_speed_100m?.[i] ?? 6.0;
                        const w3 = l2.hourly.wind_speed_100m?.[i] ?? 5.5;
                        const weightedWind = w1 * 0.50 + w2 * 0.35 + w3 * 0.15;
                        const windMw = Math.round(windCap * windSpeedToCapacityFactor(weightedWind));
                        const tLoad = l2.hourly.temperature_2m?.[i] ?? 8.0;
                        const tW1 = l0.hourly.temperature_2m?.[i] ?? tLoad;
                        const weightedTemp = Number((tLoad * 0.70 + tW1 * 0.30).toFixed(1));
                        const radLoad = l2.hourly.shortwave_radiation?.[i] ?? 0;
                        const rad2 = l1.hourly.shortwave_radiation?.[i] ?? radLoad;
                        const solarRadWm2 = Number((radLoad * 0.60 + rad2 * 0.40).toFixed(1));
                        const solarCf = Math.max(0.0, Math.min(0.82, (solarRadWm2 / 820.0) * 0.80));
                        const solarMw = Math.round(solarCap * solarCf);
                        const pressureHpa = l2.hourly.surface_pressure?.[i] ?? 1013.0;
                        const borderWindSpeed = l3.hourly.wind_speed_100m?.[i] ?? weightedWind;
                        weatherMap.set(tMs, {
                            windSpeed100m: Number(weightedWind.toFixed(1)),
                            windMw,
                            solarMw,
                            tempC: weightedTemp,
                            solarRadWm2,
                            pressureHpa,
                            borderWindSpeed
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

        // Per-zone browser online learning & pre-confirmation tracking
        const zObsKey = `ps_z_${zoneCode}_obs_v1`;
        const zPreKey = `ps_z_${zoneCode}_pre_v1`;
        let zObsStore = {};
        let zPreStore = {};
        try {
            const r1 = localStorage.getItem(zObsKey);
            if (r1) zObsStore = JSON.parse(r1) || {};
            const r2 = localStorage.getItem(zPreKey);
            if (r2) zPreStore = JSON.parse(r2) || {};
        } catch (_) {}

        for (const [hMs, vat0Val] of officialVat0Map.entries()) {
            const w = weatherMap.get(hMs);
            if (w) {
                zObsStore[hMs] = {
                    epochMs: Number(hMs),
                    vat0: vat0Val,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    solarMw: w.solarMw,
                    tempC: w.tempC,
                    rolling24hWindMw: w.rolling24hWindMw,
                    windRamp6hMw: w.windRamp6hMw,
                    rolling72hTempC: w.rolling72hTempC,
                    pressureHpa: w.pressureHpa,
                    borderWindSpeed: w.borderWindSpeed
                };
            }
        }

        const obsKeys = Object.keys(zObsStore).map(Number).sort((a, b) => a - b).slice(-720);
        const nextZObs = {};
        let sumObsVat0 = 0;
        for (const k of obsKeys) {
            nextZObs[k] = zObsStore[k];
            sumObsVat0 += zObsStore[k].vat0;
        }
        try { localStorage.setItem(zObsKey, JSON.stringify(nextZObs)); } catch (_) {}

        let meanVat0 = baseVat0;
        if (obsKeys.length >= 18) {
            meanVat0 = sumObsVat0 / obsKeys.length;
        } else if (officialVat0Map.size >= 12) {
            let s = 0;
            for (const v of officialVat0Map.values()) s += v;
            meanVat0 = s / officialVat0Map.size;
        }
        state.rolling30dMeanInclVat = Number((Math.max(0.8, meanVat0) * (DSO_DATA.vatRate || 1.25)).toFixed(2));

        const baseZModel = zcfg.modelVat0EurCents || {
            weights: [baseVat0 * 1.35, -9.5, 1.5, 2.5, 1.2, 1.8, 2.2, 2.0, -2.0, -1.5, 2.0, 0.3, 1.2, 1.4, -1.5, -5.0, 0, 0, -2.0, -0.7, -0.7, 1.3, 1.3, 3.0],
            weekdayHourAdj: new Array(24).fill(0),
            weekendHourAdj: new Array(24).fill(0),
            windTempGridAdj: {}
        };
        const zLearned = JSON.parse(JSON.stringify(baseZModel));
        if (!zLearned.windTempGridAdj) zLearned.windTempGridAdj = {};
        if (!Array.isArray(zLearned.weekdayHourAdj)) zLearned.weekdayHourAdj = new Array(24).fill(0);
        if (!Array.isArray(zLearned.weekendHourAdj)) zLearned.weekendHourAdj = new Array(24).fill(0);

        const latestObsMs = obsKeys.length > 0 ? obsKeys[obsKeys.length - 1] : Date.now();
        const lmZone = zLearned.logMeritModel;
        const zResByMs = new Map();
        const zHourBias = [new Array(24).fill(0.0), new Array(24).fill(0.0), new Array(24).fill(0.0)];
        const kernelHist = [];

        for (const k of obsKeys) {
            const it = nextZObs[k];
            const zc = getHelsinkiComponents(it.epochMs, zcfg.tz);
            const dti = getDayTypeIndex(zc.dateKey, zc.isWeekend, zc.isSat, zoneCode === 'FI');
            const prev24It = nextZObs[it.epochMs - 24 * 3600000];
            const prevVat0 = prev24It ? prev24It.vat0 : meanVat0;
            const obsObj = {
                ...it,
                dateKey: zc.dateKey,
                month: zc.month,
                hour: zc.hour,
                isWeekend: zc.isWeekend,
                isSat: zc.isSat,
                dayType: dti,
                lag24hSameHour: prevVat0
            };
            if (lmZone && Array.isArray(lmZone.wLog) && lmZone.wLog.length >= 15) {
                const { zFund } = predictZoneLogFundamental(obsObj, lmZone, zcfg);
                zResByMs.set(it.epochMs, toZoneLogVat0(it.vat0, lmZone.shift || 3.0) - zFund);
            }
            const pred = predictRegionalVat0(obsObj, zLearned, zcfg, prevVat0);
            const err = Math.max(-9.0, Math.min(9.0, it.vat0 - pred));
            const recency = Math.exp(-Math.max(0, (latestObsMs - it.epochMs) / 3600000) / 180.0);
            const x = extractRegionalFeatures(obsObj, zcfg, prevVat0);
            let normSq = 1.0;
            for (let j = 0; j < x.length; j++) normSq += x[j] * x[j];
            const step = (0.015 * recency * err) / normSq;
            for (let j = 0; j < x.length && j < zLearned.weights.length; j++) {
                zLearned.weights[j] += step * x[j];
            }
            if (zLearned.weights[15] > 0) zLearned.weights[15] = 0;
            const hArr = zc.isWeekend ? zLearned.weekendHourAdj : zLearned.weekdayHourAdj;
            hArr[zc.hour] = Number((hArr[zc.hour] + 0.03 * recency * err).toFixed(4));
            kernelHist.push({
                ms: it.epochMs,
                wind: it.windSpeed100m || 6.2,
                solar: it.solarMw || 0,
                hour: zc.hour,
                temp: it.tempC || 8.0,
                dti,
                vat0: it.vat0
            });
        }
        state.mlStats.totalLearnedHours = (lmZone?.empiricalHours || 2238) + obsKeys.length;

        function getZoneArContext(targetMs, latestConfMs) {
            let s24 = 0, c24 = 0, s7d = 0, c7d = 0;
            for (let h = 0; h < 168; h++) {
                const rv = zResByMs.get(latestConfMs - h * 3600000);
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
            const zlag24 = zResByMs.get(lagMs) ?? zanom24;
            const zlag168 = zResByMs.get(targetMs - 168 * 3600000) ?? zanom7d;
            return { zanom24, zanom7d, zlag24, zlag168 };
        }

        // Calibrate 14-day local hour residual EMA for the Log-Merit + 16-tree ensemble
        if (lmZone && obsKeys.length >= 24) {
            const calStart = Math.max(24, obsKeys.length - 336);
            for (let idx = calStart; idx < obsKeys.length; idx++) {
                const ms = obsKeys[idx];
                const it = nextZObs[ms];
                const zc = getHelsinkiComponents(ms, zcfg.tz);
                const dti = getDayTypeIndex(zc.dateKey, zc.isWeekend, zc.isSat, zoneCode === 'FI');
                const arH = getZoneArContext(ms, ms - 24 * 3600000);
                const pLogM = predictZoneLogMeritVat0(
                    { ...it, dateKey: zc.dateKey, month: zc.month, hour: zc.hour, isWeekend: zc.isWeekend, isSat: zc.isSat, dayType: dti },
                    zLearned,
                    zcfg,
                    { ...arH, hoursAhead: 18 },
                    meanVat0
                );
                const res = Math.max(-8.0, Math.min(8.0, it.vat0 - pLogM));
                zHourBias[dti][zc.hour] = 0.86 * zHourBias[dti][zc.hour] + 0.14 * res;
            }
        }

        function regionalKernelPredict(targetMs, wCand, targetHour, targetDti) {
            let num = 0, numSq = 0, den = 0;
            const cutoff = targetMs - 12 * 3600000;
            for (let i = 0; i < kernelHist.length; i++) {
                const h = kernelHist[i];
                if (h.ms > cutoff) break;
                const dWind = ((wCand.windSpeed100m || 6.2) - h.wind) / 1.35;
                const dSol = ((wCand.solarMw || 0) - h.solar) / Math.max(120, solarCap * 0.25);
                const hrDiff = Math.abs(targetHour - h.hour);
                const dHr = Math.min(hrDiff, 24 - hrDiff) / 1.9;
                const dTemp = ((wCand.tempC || 8.0) - h.temp) / 4.8;
                const dWk = (targetDti === h.dti) ? 0.0 : ((targetDti > 0 && h.dti > 0) ? 0.55 : 1.30);
                const ageD = Math.max(0, (targetMs - h.ms) / 86400000);
                const wt = Math.exp(-0.5 * (dWind * dWind + dSol * dSol + dHr * dHr + dTemp * dTemp + dWk * dWk) - ageD / 12.0);
                num += wt * h.vat0;
                numSq += wt * h.vat0 * h.vat0;
                den += wt;
            }
            if (den <= 1e-5) return { est: null, weightSum: 0, localStd: 0.8 };
            const mean = num / den;
            return { est: mean, weightSum: den, localStd: Math.sqrt(Math.max(0, numSq / den - mean * mean)) };
        }

        const currentHourMs = Math.floor(now.getTime() / 3600000) * 3600000;
        const nowZ = getHelsinkiComponents(currentHourMs, zcfg.tz);
        const startSeriesMs = currentHourMs - nowZ.hour * 3600000;
        const minKeepMs = currentHourMs - 168 * 3600000;
        for (const k of Object.keys(zPreStore)) {
            if (Number(k) < minKeepMs) delete zPreStore[k];
        }

        const rollingVat0ByMs = new Map();
        for (const [k, v] of officialVat0Map.entries()) rollingVat0ByMs.set(k, v);
        for (const k of obsKeys) {
            if (!rollingVat0ByMs.has(k)) rollingVat0ByMs.set(k, nextZObs[k].vat0);
        }
        const sortedConfMs = Array.from(zResByMs.keys()).sort((a, b) => a - b);
        const latestConfirmedZoneMs = sortedConfMs.length > 0 ? sortedConfMs[sortedConfMs.length - 1] : currentHourMs;

        const series = [];
        for (let i = 0; i < 192; i++) {
            const hMs = startSeriesMs + i * 3600000;
            const zc = getHelsinkiComponents(hMs, zcfg.tz);
            const dti = getDayTypeIndex(zc.dateKey, zc.isWeekend, zc.isSat, zoneCode === 'FI');
            const w = weatherMap.get(hMs) || {
                windSpeed100m: 6.2,
                windMw: Math.round(windCap * 0.28),
                solarMw: 0,
                tempC: 8.0,
                solarRadWm2: 0,
                pressureHpa: 1013,
                borderWindSpeed: 6.2,
                rolling24hWindMw: Math.round(windCap * 0.28),
                windRamp6hMw: 0,
                rolling72hTempC: 8.0
            };

            let pastSum = 0, pastCnt = 0;
            for (let lag = 24; lag <= 72; lag++) {
                const pVal = rollingVat0ByMs.get(hMs - lag * 3600000);
                if (pVal !== undefined) {
                    pastSum += pVal;
                    pastCnt++;
                }
            }
            const prevAvg = pastCnt > 0 ? (pastSum / pastCnt) : meanVat0;
            const lag24Val = rollingVat0ByMs.get(hMs - 24 * 3600000) ?? prevAvg;

            const obsObj = {
                epochMs: hMs,
                dateKey: zc.dateKey,
                month: zc.month,
                hour: zc.hour,
                isWeekend: zc.isWeekend,
                isSat: zc.isSat,
                dayType: dti,
                ...w,
                lag24hSameHour: lag24Val
            };

            const hoursAhead = Math.max(1, (hMs - currentHourMs) / 3600000);
            const arCtx = { ...getZoneArContext(hMs, Math.min(latestConfirmedZoneMs, hMs - 3600000)), hoursAhead };
            const hasLogMerit = Boolean(lmZone && Array.isArray(lmZone.wLog) && lmZone.wLog.length >= 15);
            const ensVat0 = predictZoneLogMeritVat0(obsObj, zLearned, zcfg, arCtx, prevAvg);
            const kp = regionalKernelPredict(hMs, w, zc.hour, dti);
            const kAlpha = kp.est !== null
                ? (hasLogMerit ? Math.min(0.24, kp.weightSum / (kp.weightSum + 3.0)) : Math.min(0.75, kp.weightSum / (kp.weightSum + 0.30)))
                : 0.0;
            const blendedVat0 = kp.est !== null ? (kAlpha * kp.est + (1.0 - kAlpha) * ensVat0) : ensVat0;
            const biasDecay = Math.exp(-Math.max(0, hoursAhead) / 144.0);
            const estVat0 = Number(Math.max(-2.82, blendedVat0 + zHourBias[dti][zc.hour] * 0.45 * biasDecay).toFixed(3));

            const horizonFrac = Math.min(1.0, Math.max(0.0, hoursAhead / 168.0));
            const horizonCurve = Math.pow(horizonFrac, 1.30);
            const dWind = 0.30 + horizonCurve * 0.75;
            const dTemp = 0.30 + horizonCurve * 0.80;

            const wHigh = Math.round(windCap * windSpeedToCapacityFactor((w.windSpeed100m || 6.2) + dWind));
            const wLow = Math.round(windCap * windSpeedToCapacityFactor(Math.max(1.2, (w.windSpeed100m || 6.2) - dWind)));
            const estOpt = predictZoneLogMeritVat0({ ...obsObj, windMw: wHigh, tempC: w.tempC + dTemp }, zLearned, zcfg, arCtx, prevAvg);
            const estPess = predictZoneLogMeritVat0({ ...obsObj, windMw: wLow, tempC: w.tempC - dTemp }, zLearned, zcfg, arCtx, prevAvg);
            const weatherHalf = Math.abs(estPess - estOpt) * 0.42;
            const priceMag = Math.max(1.8, Math.abs(estVat0));
            const baseSpread = Math.max(0.22, priceMag * (0.08 + 0.11 * horizonCurve));
            const halfSpread = Math.max(baseSpread, Math.min(Math.max(0.85, priceMag * 0.28 + 0.5), Math.hypot(weatherHalf, baseSpread)));

            const minVat0 = Number(Math.max(-2.82, estVat0 - halfSpread * 0.92).toFixed(3));
            const maxVat0 = Number(Math.max(estVat0 + 0.10, estVat0 + halfSpread * 1.08).toFixed(3));

            const officialVat0 = officialVat0Map.get(hMs);
            if (officialVat0 !== undefined) {
                const savedPred = zPreStore[hMs];
                const predEst = (savedPred && typeof savedPred.estVat0 === 'number') ? savedPred.estVat0 : estVat0;
                const predMin = (savedPred && typeof savedPred.minVat0 === 'number') ? savedPred.minVat0 : minVat0;
                const predMax = (savedPred && typeof savedPred.maxVat0 === 'number') ? savedPred.maxVat0 : maxVat0;
                if (!savedPred) {
                    zPreStore[hMs] = { estVat0: predEst, minVat0: predMin, maxVat0: predMax, wasForecast: false };
                }
                series.push({
                    isZoneNative: true,
                    zone: zoneCode,
                    timestamp: new Date(hMs).toISOString(),
                    epochMs: hMs,
                    dateKey: zc.dateKey,
                    hour: zc.hour,
                    isWeekend: zc.isWeekend,
                    isSat: zc.isSat,
                    month: zc.month,
                    isForecast: false,
                    spotVat0EurCents: officialVat0,
                    minVat0EurCents: officialVat0,
                    maxVat0EurCents: officialVat0,
                    predVat0EurCents: predEst,
                    predMinVat0EurCents: predMin,
                    predMaxVat0EurCents: predMax,
                    priceInclVat: Number((officialVat0 * 1.255).toFixed(2)),
                    priceVat0: officialVat0,
                    probabilityPct: 100,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw: w.solarMw,
                    nuclearMw: nuclearCap
                });
            } else {
                rollingVat0ByMs.set(hMs, estVat0);
                zPreStore[hMs] = { estVat0, minVat0, maxVat0, wasForecast: true };
                const horizonProb = 92.0 - (hoursAhead / 168.0) * 23.0;
                const probabilityPct = Math.max(62, Math.min(94, Math.round(horizonProb + (zc.hour <= 5 ? 2 : 0))));
                series.push({
                    isZoneNative: true,
                    zone: zoneCode,
                    timestamp: new Date(hMs).toISOString(),
                    epochMs: hMs,
                    dateKey: zc.dateKey,
                    hour: zc.hour,
                    isWeekend: zc.isWeekend,
                    isSat: zc.isSat,
                    month: zc.month,
                    isForecast: true,
                    spotVat0EurCents: estVat0,
                    minVat0EurCents: minVat0,
                    maxVat0EurCents: maxVat0,
                    predVat0EurCents: estVat0,
                    predMinVat0EurCents: minVat0,
                    predMaxVat0EurCents: maxVat0,
                    priceInclVat: Number((estVat0 * 1.255).toFixed(2)),
                    priceVat0: estVat0,
                    probabilityPct,
                    windMw: w.windMw,
                    windSpeed100m: w.windSpeed100m,
                    tempC: w.tempC,
                    solarMw: w.solarMw,
                    nuclearMw: nuclearCap
                });
            }
        }

        try { localStorage.setItem(zPreKey, JSON.stringify(zPreStore)); } catch (_) {}
        return { generatedAt: new Date().toISOString(), zone: zoneCode, series };
    }

    async function fetchClientSideWithOnlineML() {
        if (state.activeZone && state.activeZone !== 'FI') {
            return fetchRegionalZoneWithOnlineML(state.activeZone);
        }
        const now = new Date();
        // Haetaan viimeisen 30 vuorokauden (720 h) toteutuneet tuntihinnat ja säädata rinnakkain (Promise.all)
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 720 * 3600000).toISOString();
        const officialHourlyMap = new Map();
        const weatherMap = new Map();

        // Lisätään minuuttitason cache-buster (_t), jotta sahkotin.fi:n Cloudflare-reunavälimuisti
        // (Cache-Control: public, max-age=300, immutable) ei koskaan palauta vanhaa klo 13:00 vastausta klo 13:45 jälkeen.
        const minuteCacheBust = Math.floor(Date.now() / 60000);
        const pricesUrl = `https://sahkotin.fi/prices?fix&vat&start=${encodeURIComponent(startHourIso)}&_t=${minuteCacheBust}`;
        const spotHintaUrl = `https://api.spot-hinta.fi/TodayAndDayForward?_t=${minuteCacheBust}`;
        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17,63.82,59.43&longitude=23.95,21.34,22.58,24.94,20.26,24.75&hourly=temperature_2m,wind_speed_100m,shortwave_radiation,surface_pressure&wind_speed_unit=ms&past_days=14&forecast_days=8&timezone=UTC';

        const [pricesResp, spotHintaResp, weatherResp] = await Promise.all([
            fetch(pricesUrl, { cache: 'no-store' }).catch(() => null),
            fetch(spotHintaUrl, { cache: 'no-store' }).catch(() => null),
            fetch(weatherUrl).catch(() => null)
        ]);

        try {
            if (spotHintaResp && spotHintaResp.ok) {
                const shList = await spotHintaResp.json();
                if (Array.isArray(shList)) {
                    const shBuckets = new Map();
                    for (const item of shList) {
                        if (!item || !item.DateTime || item.PriceWithTax === undefined) continue;
                        const hMs = Math.floor(new Date(item.DateTime).getTime() / 3600000) * 3600000;
                        const valCents = Number(item.PriceWithTax) * 100.0;
                        if (!isNaN(valCents)) {
                            if (!shBuckets.has(hMs)) shBuckets.set(hMs, []);
                            shBuckets.get(hMs).push(valCents);
                        }
                    }
                    for (const [hMs, arr] of shBuckets.entries()) {
                        const avgCents = arr.reduce((a, b) => a + b, 0) / arr.length;
                        officialHourlyMap.set(hMs, {
                            priceInclVat: Number(avgCents.toFixed(3)),
                            priceVat0: Number((avgCents / 1.255).toFixed(3))
                        });
                    }
                }
            }
        } catch (_) {}

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

        const fiLogEns = ML_BASE.model?.logMeritEnsemble || null;
        const hasFiLogEns = Boolean(fiLogEns && Array.isArray(fiLogEns.wLog) && fiLogEns.wLog.length >= 21);
        const fiResByMs = new Map();
        const sortedOfficialMs = Array.from(officialHourlyMap.keys()).sort((a, b) => a - b);
        const kernelHistory = [];

        for (let idx = 0; idx < sortedOfficialMs.length; idx++) {
            const prevMs = sortedOfficialMs[idx];
            const pw = weatherMap.get(prevMs);
            if (!pw) continue;
            const pHel = getHelsinkiComponents(prevMs);
            const dti = getDayTypeIndex(pHel.dateKey, pHel.isWeekend, pHel.isSat, true);
            const pVal = officialHourlyMap.get(prevMs).priceInclVat;
            if (hasFiLogEns) {
                const { zFund } = predictFiLogFundamental({
                    epochMs: prevMs,
                    dateKey: pHel.dateKey,
                    month: pHel.month,
                    hour: pHel.hour,
                    isWeekend: pHel.isWeekend,
                    isSat: pHel.isSat,
                    dayType: dti,
                    ...pw,
                    solarMw: radiationToSolarMw(pw.solarRadWm2, pHel.month, pHel.hour),
                    nuclearDeficitMw: getScenarioNuclearDeficitMw(pHel.dateKey)
                }, fiLogEns);
                fiResByMs.set(prevMs, toFiLogPrice(pVal, fiLogEns.shift || 3.5) - zFund);
            }
            kernelHistory.push({
                ms: prevMs,
                wind: pw.windSpeed100m || 6.5,
                seWind: pw.seWindSpeed || pw.windSpeed100m || 6.5,
                hour: pHel.hour,
                temp: pw.tempC || 4.0,
                dti,
                isWeekend: pHel.isWeekend,
                price: pVal
            });
        }

        function getFiArContext(targetMs, latestConfMs) {
            let s24 = 0.0, c24 = 0, s7d = 0.0, c7d = 0;
            for (let h = 0; h < 168; h++) {
                const rv = fiResByMs.get(latestConfMs - h * 3600000);
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
            const zlag24 = fiResByMs.get(lagMs) ?? zanom24;
            const zlag168 = fiResByMs.get(targetMs - 168 * 3600000) ?? zanom7d;
            return { zanom24, zanom7d, zlag24, zlag168 };
        }

        function kernelPredictHour(targetMs, wCand, targetHour, targetDti) {
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
                const dWind = (cWind - h.wind) / 1.15;
                const dSe = (cSe - h.seWind) / 2.50;
                const hrDiff = Math.abs(targetHour - h.hour);
                const dHr = Math.min(hrDiff, 24 - hrDiff) / 1.85;
                const dTemp = (cTemp - h.temp) / 4.50;
                const dWknd = (targetDti === h.dti) ? 0.0 : ((targetDti > 0 && h.dti > 0) ? 0.55 : 1.30);
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

        // Yhdistelmämallin (Log-Merit Ridge + 45 puun Hist-GBDT + sääpuhdistettu log-AR + Analog Kernel)
        // jäännösvirheoppiminen viimeisen 14 vrk (336 h) toteutuneista tunneista.
        const ensHourBias = [new Array(24).fill(0.0), new Array(24).fill(0.0), new Array(24).fill(0.0)];
        const ensRegimeBias = {};
        const recentCalibrationIdxStart = Math.max(24, kernelHistory.length - 336);
        let ensPreErrSum = 0.0, ensPostErrSum = 0.0, ensCalCount = 0;
        const absRelErrors = [];

        for (let idx = recentCalibrationIdxStart; idx < kernelHistory.length; idx++) {
            const hItem = kernelHistory[idx];
            const wHist = weatherMap.get(hItem.ms);
            if (!wHist) continue;
            const helHist = getHelsinkiComponents(hItem.ms);
            const dtiHist = getDayTypeIndex(helHist.dateKey, helHist.isWeekend, helHist.isSat, true);
            const kpHist = kernelPredictHour(hItem.ms, wHist, helHist.hour, dtiHist);
            const prev24Val = kernelHistory[Math.max(0, idx - 24)].price;
            const obsHist = {
                epochMs: hItem.ms,
                dateKey: helHist.dateKey,
                month: helHist.month,
                hour: helHist.hour,
                isWeekend: helHist.isWeekend,
                isSat: helHist.isSat,
                dayType: dtiHist,
                ...wHist,
                solarMw: radiationToSolarMw(wHist.solarRadWm2, helHist.month, helHist.hour),
                nuclearDeficitMw: getScenarioNuclearDeficitMw(helHist.dateKey),
                baseNuclearDeficitMw: getScenarioNuclearDeficitMw(helHist.dateKey),
                lag24hSameHour: prev24Val,
                prev24hMean: prev24Val,
                prev7dMean: prev24Val
            };
            const arHist = { ...getFiArContext(hItem.ms, hItem.ms - 24 * 3600000), hoursAhead: 18 };
            const ensBaseHist = predictFiLogMeritEnsemble(obsHist, fiLogEns, arHist, learnedModel, prev24Val);
            const kAlpha = kpHist.est !== null
                ? (hasFiLogEns ? Math.min(0.24, kpHist.weightSum / (kpHist.weightSum + 3.2)) : Math.min(0.82, kpHist.weightSum / (kpHist.weightSum + 0.20)))
                : 0.0;
            const rawEns = kpHist.est !== null ? (kAlpha * kpHist.est + (1.0 - kAlpha) * ensBaseHist) : ensBaseHist;

            const wBinH = Math.min(4, Math.floor((wHist.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
            const tBinH = wHist.tempC < -5 ? 0 : (wHist.tempC < 2 ? 1 : (wHist.tempC < 10 ? 2 : 3));
            const rKeyH = `${wBinH}_${tBinH}`;

            const curBias = ensHourBias[dtiHist][helHist.hour] * 0.55 + (ensRegimeBias[rKeyH] || 0.0) * 0.45;
            const correctedEns = Math.max(-3.30, rawEns + curBias);

            ensPreErrSum += Math.abs(hItem.price - rawEns);
            ensPostErrSum += Math.abs(hItem.price - correctedEns);
            ensCalCount++;

            const resid = Math.max(-8.0, Math.min(8.0, hItem.price - rawEns));
            ensHourBias[dtiHist][helHist.hour] = 0.85 * ensHourBias[dtiHist][helHist.hour] + 0.15 * resid;
            ensRegimeBias[rKeyH] = 0.87 * (ensRegimeBias[rKeyH] || 0.0) + 0.13 * resid;
            absRelErrors.push(Math.abs(hItem.price - correctedEns) / Math.max(1.8, Math.abs(correctedEns)));
        }

        let conformalScale = 1.0;
        if (absRelErrors.length >= 24) {
            absRelErrors.sort((a, b) => a - b);
            const q80 = absRelErrors[Math.min(absRelErrors.length - 1, Math.floor(absRelErrors.length * 0.80))];
            conformalScale = Math.max(0.82, Math.min(1.22, q80 / 0.18));
        }

        state.mlStats.errorLearning = {
            calibratedHours: ensCalCount,
            preCorrectionMae: ensCalCount > 0 ? Number((ensPreErrSum / ensCalCount).toFixed(2)) : (ML_BASE.errorLearning?.preCorrectionMae14d || 1.45),
            postCorrectionMae: ensCalCount > 0 ? Number((ensPostErrSum / ensCalCount).toFixed(2)) : (ML_BASE.errorLearning?.postCorrectionMae14d || 1.18),
            weekdayPeakAdj: Number((ensHourBias[0][8] * 0.5 + ensHourBias[0][18] * 0.5).toFixed(2)),
            nightAdj: Number(((ensHourBias[0][2] + ensHourBias[0][3]) * 0.5).toFixed(2)),
            conformalScale: Number(conformalScale.toFixed(2))
        };

        const latestConfirmedFiMs = sortedOfficialMs.length > 0 ? sortedOfficialMs[sortedOfficialMs.length - 1] : currentHourMs;

        for (let i = 0; i < 192; i++) {
            const hMs = startSeriesMs + i * 3600000;
            const w = weatherMap.get(hMs) || {
                windSpeed100m: 6.5, windMw: 2400, wind12hSmoothMw: 2400, tempC: 4.0, solarRadWm2: 0,
                pressureHpa: 1013, seWindSpeed: 6.5, eeWindSpeed: 6.5,
                rolling24hWindMw: 2400, windRamp6hMw: 0, rolling72hTempC: 4.0
            };
            const official = officialHourlyMap.get(hMs);
            const hel = getHelsinkiComponents(new Date(hMs));
            const dtiCur = getDayTypeIndex(hel.dateKey, hel.isWeekend, hel.isSat, true);
            const solarMw = radiationToSolarMw(w.solarRadWm2, hel.month, hel.hour);
            const baseDefMw = getScenarioNuclearDeficitMw(hel.dateKey);
            const nuclearMw = FINLAND_NUCLEAR_MAX_MW - baseDefMw;

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
                isSat: hel.isSat,
                dayType: dtiCur,
                ...w,
                solarMw,
                nuclearDeficitMw: baseDefMw,
                baseNuclearDeficitMw: baseDefMw,
                lag24hSameHour: lag24Same,
                prev24hMean: prevAvg,
                prev7dMean: prevAvg
            };

            const hoursAhead = Math.max(1, (hMs - currentHourMs) / 3600000);
            const arCtxCur = { ...getFiArContext(hMs, Math.min(latestConfirmedFiMs, hMs - 3600000)), hoursAhead };
            const ensEst = predictFiLogMeritEnsemble(obsObj, fiLogEns, arCtxCur, learnedModel, prevAvg);
            const kpMain = kernelPredictHour(hMs, w, hel.hour, dtiCur);
            const kernelAlpha = kpMain.est !== null
                ? (hasFiLogEns ? Math.min(0.24, kpMain.weightSum / (kpMain.weightSum + 3.2)) : Math.min(0.82, kpMain.weightSum / (kpMain.weightSum + 0.20)))
                : 0.0;
            const baseRawEst = kpMain.est !== null
                ? (kernelAlpha * kpMain.est + (1.0 - kernelAlpha) * ensEst)
                : ensEst;
            const wBinCur = Math.min(4, Math.floor((w.windMw / FINLAND_INSTALLED_WIND_MW) * 5));
            const tBinCur = w.tempC < -5 ? 0 : (w.tempC < 2 ? 1 : (w.tempC < 10 ? 2 : 3));
            const rKeyCur = `${wBinCur}_${tBinCur}`;
            const hoursAheadForBias = Math.max(0, (hMs - currentHourMs) / 3600000);
            const biasDecay = Math.exp(-hoursAheadForBias / 144.0);
            const learnedResidualBias = (ensHourBias[dtiCur][hel.hour] * 0.50 + (ensRegimeBias[rKeyCur] || 0.0) * 0.40) * biasDecay;
            const rawEst = Math.max(-3.30, baseRawEst + learnedResidualBias);

            const horizonFrac = Math.min(1.0, Math.max(0.0, hoursAhead / 168.0));
            const horizonCurve = Math.pow(horizonFrac, 1.35);
            const deltaWindMs = 0.28 + horizonCurve * 0.65;
            const deltaTempC = 0.25 + horizonCurve * 0.70;

            const wOpt = { ...w, windSpeed100m: (w.windSpeed100m || 6.5) + deltaWindMs, tempC: w.tempC + deltaTempC };
            const wPess = { ...w, windSpeed100m: Math.max(1.5, (w.windSpeed100m || 6.5) - deltaWindMs), tempC: w.tempC - deltaTempC };
            const windHighMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(wOpt.windSpeed100m));
            const windLowMw = Math.round(FINLAND_INSTALLED_WIND_MW * windSpeedToCapacityFactor(wPess.windSpeed100m));

            const ensOpt = predictFiLogMeritEnsemble({
                ...obsObj,
                windMw: windHighMw,
                wind12hSmoothMw: Math.round((obsObj.wind12hSmoothMw || w.windMw) * 0.5 + windHighMw * 0.5),
                rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.5 + windHighMw * 0.5),
                tempC: wOpt.tempC
            }, fiLogEns, arCtxCur, learnedModel, prevAvg);
            const kpOpt = kernelPredictHour(hMs, wOpt, hel.hour, dtiCur);
            const estOptimistic = kpOpt.est !== null
                ? (kernelAlpha * kpOpt.est + (1.0 - kernelAlpha) * ensOpt)
                : ensOpt;

            const ensPess = predictFiLogMeritEnsemble({
                ...obsObj,
                windMw: windLowMw,
                wind12hSmoothMw: Math.round((obsObj.wind12hSmoothMw || w.windMw) * 0.5 + windLowMw * 0.5),
                rolling24hWindMw: Math.round((obsObj.rolling24hWindMw || w.windMw) * 0.5 + windLowMw * 0.5),
                tempC: wPess.tempC
            }, fiLogEns, arCtxCur, learnedModel, prevAvg);
            const kpPess = kernelPredictHour(hMs, wPess, hel.hour, dtiCur);
            const estPessimistic = kpPess.est !== null
                ? (kernelAlpha * kpPess.est + (1.0 - kernelAlpha) * ensPess)
                : ensPess;

            const estInclVat = Number(Math.max(-3.30, rawEst).toFixed(2));
            const priceMag = Math.max(1.8, Math.abs(estInclVat));
            const weatherHalfSpread = Math.abs(estPessimistic - estOptimistic) * 0.40;
            const regimeHalfSpread = Math.min(priceMag * 0.18, (kpMain.localStd || 0.30) * (0.24 + 0.22 * horizonCurve));
            const rawHalfSpread = Math.hypot(weatherHalfSpread, regimeHalfSpread) * conformalScale;
            const minHalfSpread = Math.max(0.22, priceMag * (0.07 + 0.08 * horizonCurve));
            const maxHalfSpread = Math.max(0.75, priceMag * (0.18 + 0.16 * horizonCurve));
            const halfSpread = Math.max(minHalfSpread, Math.min(maxHalfSpread, rawHalfSpread));

            const minIncl = Number(Math.max(-3.30, estInclVat - halfSpread * 0.92).toFixed(2));
            const maxIncl = Number(Math.max(estInclVat + 0.10, estInclVat + halfSpread * 1.08).toFixed(2));

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
            const nextIncl = Number(Math.max(-3.30, s.basePriceInclVat + extraPremium).toFixed(2));
            const spread = Math.max(0.95, Math.abs(nextIncl) * 0.32 + 0.8);
            s.priceInclVat = nextIncl;
            s.priceVat0 = Number((nextIncl / 1.255).toFixed(2));
            s.minInclVat = Number(Math.max(-3.30, nextIncl - spread).toFixed(2));
            s.maxInclVat = Number((nextIncl + spread * 1.15).toFixed(2));
        }
    }

    function applySeriesDataAndRender(data) {
        if (!data || !Array.isArray(data.series) || data.series.length === 0) return;
        state.series = data.series;
        state.generatedAt = data.generatedAt;
        if (typeof data.rolling30dMeanInclVat === 'number' && data.rolling30dMeanInclVat > 0.2) {
            state.rolling30dMeanInclVat = data.rolling30dMeanInclVat;
        }

        const todayHel = getHelsinkiComponents(Date.now());
        const byDate = new Map();
        for (const item of state.series) {
            if (item.dateKey < todayHel.dateKey) continue;
            if (!byDate.has(item.dateKey)) byDate.set(item.dateKey, []);
            byDate.get(item.dateKey).push(item);
        }

        const daysList = [];
        let idx = 0;
        for (const [dateKey, items] of byDate.entries()) {
            if (items.length < 18 && idx > 0) continue;
            items.sort((a, b) => a.hour - b.hour);
            const parts = dateKey.split('-');
            const dt = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0));
            const wdName = WEEKDAYS_SHORT[dt.getUTCDay()] || 'Ma';
            const dayNum = parseInt(parts[2], 10);
            const monthNum = parseInt(parts[1], 10);
            const hasForecast = items.some(x => x.isForecast);
            const allForecast = items.every(x => x.isForecast);

            let label = `${wdName} ${dayNum}.${monthNum}.`;
            if (idx === 0) label = `${TODAY_WORD} (${wdName} ${dayNum}.${monthNum}.)`;
            else if (idx === 1) label = `${TOMORROW_WORD} (${wdName} ${dayNum}.${monthNum}.)`;

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
        const fastCacheKey = `${storagePrefix}fast_z_${state.activeZone || 'FI'}_v5`;
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
        const zoneSelEl = document.getElementById('zone-select');
        if (zoneSelEl && state.activeZone && zoneSelEl.value !== state.activeZone) {
            if (Array.from(zoneSelEl.options).some(o => o.value === state.activeZone)) {
                zoneSelEl.value = state.activeZone;
            }
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const curSlot = state.series.find(s => s.epochMs === nowHourMs) || state.series[0];
        if (curSlot) {
            const br = calculateHourBreakdown(curSlot);
            const tSpot = document.getElementById('tel-spot');
            const tTrans = document.getElementById('tel-transfer');
            const tWind = document.getElementById('tel-wind');
            const tHours = document.getElementById('tel-hours');
            if (tSpot) tSpot.textContent = `${formatNum(br.spotCents, 2)} ${UNIT_LABEL}`;
            if (tTrans) tTrans.textContent = `${formatNum(br.transferCents + br.taxCents, 2)} ${UNIT_LABEL} (${dso.short_name})`;
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
            if (!ACTIVE_LOC && state.altDsoIds && state.altDsoIds.length > 0) {
                const btns = state.altDsoIds
                    .filter(id => DSO_DATA.companies[id])
                    .map(id => `<button type="button" class="alt-dso-btn" data-dso="${id}">Vaihda: ${DSO_DATA.companies[id].short_name}</button>`)
                    .join(' ');
                if (btns) {
                    altHtml = `<div class="alt-dso-row">Kunnan reuna-alueella toimii myös toinen verkkoyhtiö: ${btns}</div>`;
                }
            }

            const tGenWord = ACTIVE_LOC ? ACTIVE_LOC.tariffGeneral : 'Yleissiirto';
            const tNightWord = ACTIVE_LOC ? (ACTIVE_LOC.tariffTime || ACTIVE_LOC.tariffGeneral) : 'Yösiirto';
            const dsoSubHtml = ACTIVE_LOC
                ? `${tGenWord}: ${genC} ${UNIT_LABEL} | ${tNightWord}: 07–22 ${dayC} / 22–07 ${nightC} ${UNIT_LABEL} | ${RECEIPT_TAX_ROW}: ${taxC} ${UNIT_LABEL}`
                : `Yleissiirto ${genC} snt/kWh (${formatNum(dso.general_base_eur, 2)} €/kk) | Yösiirto päivä ${dayC} / yö ${nightC} snt/kWh | Sähkövero ${taxC} snt/kWh`;

            detectedEl.innerHTML = `
                <div class="dso-summary-main">
                    <div>
                        <span class="dso-kicker">${DSO_NETWORK_KICKER} [${state.postalCode} ${(state.cityName || '').toUpperCase()} · ${state.activeZone}]</span>
                        <span class="dso-title">${dso.name}</span>
                        <div class="dso-sub">${dsoSubHtml}</div>
                    </div>
                    <div class="dso-manual-select-wrap">
                        <select id="dso-select" class="select-control" aria-label="${DSO_NETWORK_KICKER}">
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
                    const chosen = DSO_DATA.companies[state.dsoId];
                    const nextZone = chosen && chosen.zone ? chosen.zone : null;
                    const zoneChanged = nextZone && nextZone !== state.activeZone;
                    if (zoneChanged) {
                        state.activeZone = nextZone;
                    }
                    saveSettings();
                    if (zoneChanged) {
                        loadSpotAndForecastData();
                    } else {
                        renderAll();
                    }
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
        const atPrefix = AT_CLOCK_WORD ? `${AT_CLOCK_WORD} ` : '';

        const todayObj = state.daysList[0];
        let minText = '—', avgText = '—';
        if (todayObj && todayObj.items.length > 0) {
            const enr = todayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const minItem = enr.reduce((a, b) => (b.br.totalCents < a.br.totalCents ? b : a), enr[0]);
            const avgTot = enr.reduce((a, b) => a + b.br.totalCents, 0) / enr.length;
            minText = `${atPrefix}${String(minItem.slot.hour).padStart(2, '0')}:00 (${formatNum(minItem.br.totalCents, 2)} ${UNIT_SHORT})`;
            avgText = `${formatNum(avgTot, 2)} ${UNIT_LABEL}`;
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
                tomText = `<strong>${formatNum(avgMinT, 1)}–${formatNum(avgMaxT, 1)} ${UNIT_LABEL}</strong> (${EXPECT_WORD} ${formatNum(avgT, 2)})<br><span style="font-size:11px; color:#4a4f4a;">${pubStr}</span>`;
            } else {
                tomText = `${formatNum(avgT, 2)} ${UNIT_LABEL} (${PRED_SHORT_LABEL.toLowerCase()} ${formatNum(avgPredT, 2)})`;
            }
        }

        const activeZCfg = getActiveZoneConfig();
        const exchName = activeZCfg.exchange || 'Day-Ahead';

        container.innerHTML = `
            <div class="receipt-ledger">
                <div class="receipt-big-total">
                    <div>
                        <div class="field-label" style="margin:0;">${RECEIPT_NOW_TITLE} (${String(currentSlot.hour).padStart(2, '0')}:00 · ${state.activeZone})</div>
                        <div style="font-size:11.5px; color:#4a4f4a;">${dso.short_name} (${state.postalCode})</div>
                    </div>
                    <div class="receipt-big-num">${formatNum(curBreak.totalCents, 2)} <span style="font-size:13px; font-weight:600;">${UNIT_LABEL}</span></div>
                </div>

                <div class="receipt-row">
                    <span>${exchName} ${state.activeZone} (${RECEIPT_SPOT_ROW})</span>
                    <strong>${formatNum(curBreak.spotCents, 2)} ${UNIT_LABEL} <span style="font-weight:400; font-size:11.5px; color:#4a4f4a;">(${PRED_SHORT_LABEL.toLowerCase()} ${formatNum(curBreak.predictedSpotCents, 2)})</span></strong>
                </div>
                <div class="receipt-row">
                    <span>${RECEIPT_MARGIN_ROW}</span>
                    <span>${formatNum(curBreak.marginCents, 2)} ${UNIT_LABEL}</span>
                </div>
                <div class="receipt-row">
                    <span>${curBreak.transferLabel} (${dso.short_name})</span>
                    <span>${formatNum(curBreak.transferCents, 2)} ${UNIT_LABEL}</span>
                </div>
                <div class="receipt-row">
                    <span>${RECEIPT_TAX_ROW}</span>
                    <span>${formatNum(curBreak.taxCents, 2)} ${UNIT_LABEL}</span>
                </div>
                <div class="receipt-row total-row">
                    <span>${RECEIPT_TOTAL_ROW}</span>
                    <span>${formatNum(curBreak.totalCents, 2)} ${UNIT_LABEL}</span>
                </div>

                <div style="margin-top:14px; padding-top:10px; border-top:1px solid #cbc7ba;">
                    <div class="receipt-row">
                        <span>${RECEIPT_CHEAPEST_TODAY}</span>
                        <strong>${minText}</strong>
                    </div>
                    <div class="receipt-row">
                        <span>${RECEIPT_AVG_TODAY}</span>
                        <span>${avgText}</span>
                    </div>
                    <div class="receipt-row">
                        <span>${RECEIPT_AVG_TOMORROW}</span>
                        <span>${tomText}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function getViewportWidth() {
        if (typeof window === 'undefined') return 1280;
        const docW = (typeof document !== 'undefined' && document.documentElement && document.documentElement.clientWidth) || 0;
        const winW = window.innerWidth || 0;
        return (docW > 0 && winW > 0) ? Math.min(docW, winW) : (docW || winW || 1280);
    }

    function isMobileViewport() {
        return getViewportWidth() <= 768;
    }

    // Tarkka vektoripohjainen SVG-mittarikaavio (Pelkkä pörssisähkön spot-hinta + Todennäköinen vaihteluväli)
    function buildSvgChart(enrichedItems, isWeekView) {
        const isMobile = isMobileViewport();
        const chartBox = typeof document !== 'undefined' ? document.getElementById('price-chart') : null;
        let innerBoxW = 0;
        if (chartBox && typeof window !== 'undefined' && window.getComputedStyle) {
            const rectW = chartBox.getBoundingClientRect ? chartBox.getBoundingClientRect().width : chartBox.clientWidth;
            if (rectW > 120) {
                const cs = window.getComputedStyle(chartBox);
                const padH = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
                innerBoxW = rectW - padH;
            }
        }
        const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 900;
        const W = isMobile
            ? (innerBoxW > 180 ? Math.round(innerBoxW) : Math.max(260, getViewportWidth() - 52))
            : (innerBoxW > 420 ? Math.round(innerBoxW) : 1180);
        const H = isMobile
            ? Math.max(400, Math.min(480, Math.round(vh * 0.56)))
            : Math.max(320, Math.min(520, Math.round(vh - 295)));

        const n = Math.max(1, enrichedItems.length);
        const highVals = enrichedItems.map(x => x.slot.isForecast ? x.br.maxSpotCents : x.br.spotCents);
        const lowVals = enrichedItems.map(x => x.slot.isForecast ? x.br.minSpotCents : x.br.spotCents);
        const rawPeak = Math.max(...highVals, 0);
        const rawLow = Math.min(...lowVals, 0);
        const targetTop = Math.max(4 * FX_SCALE, rawPeak * 1.08);
        const targetSpan = targetTop + (rawLow < 0 ? Math.abs(rawLow) * 1.08 : 0);
        const maxDesiredSteps = H >= 340 ? 8 : 6;
        const roughStep = targetSpan / (H >= 340 ? 6.8 : 5.2);
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(0.1, roughStep))));
        const residual = roughStep / mag;
        let niceUnit;
        if (residual <= 1.15) niceUnit = 1;
        else if (residual <= 2.15) niceUnit = 2;
        else if (residual <= 2.6 && mag >= 10) niceUnit = 2.5;
        else if (residual <= 5.2) niceUnit = 5;
        else niceUnit = 10;
        let tickStep = Math.max(1, Math.round(niceUnit * mag));
        let posSteps = Math.max(rawLow < 0 ? 2 : 4, Math.ceil(targetTop / tickStep));
        let negSteps = rawLow < 0 ? Math.max(1, Math.ceil((Math.abs(rawLow) * 1.08) / tickStep)) : 0;
        while (posSteps + negSteps > maxDesiredSteps) {
            if (tickStep === 1) tickStep = 2;
            else if (tickStep === 2) tickStep = 5;
            else if (tickStep === 5) tickStep = 10;
            else tickStep = tickStep * 2;
            posSteps = Math.max(rawLow < 0 ? 2 : 4, Math.ceil(targetTop / tickStep));
            negSteps = rawLow < 0 ? Math.max(1, Math.ceil((Math.abs(rawLow) * 1.08) / tickStep)) : 0;
        }
        const maxPrice = tickStep * posSteps;
        const minPrice = -tickStep * negSteps;
        const priceSpan = Math.max(1, maxPrice - minPrice);
        const { cheapThresh, highThresh } = getDynamicPriceThresholds();

        const maxYChars = Math.max(String(Math.round(maxPrice)).length, String(Math.round(minPrice)).length);
        const padL = isMobile
            ? Math.max(40, maxYChars * 9 + 20)
            : Math.max(66, (maxYChars + UNIT_SHORT.length + 1) * 8.5 + 18);
        const padR = isMobile ? 8 : 16;
        const padT = isMobile ? 28 : 22;
        const padB = isMobile ? 34 : 36;
        const plotW = Math.max(120, W - padL - padR);
        const plotH = Math.max(120, H - padT - padB);

        const yForPrice = (c) => padT + plotH - Math.max(0, Math.min(1, (c - minPrice) / priceSpan)) * plotH;
        const yZero = yForPrice(0);
        const yAxisBottom = padT + plotH;
        const colW = plotW / n;

        let svg = `<svg class="responsive-price-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block; width:100%; height:${H}px; font-family:'IBM Plex Mono', monospace;">`;
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

        // Vasen mittariasteikko: sävytetty asteikkokisko, yksikkötunniste, pystyakseli ja asteikkoviivat
        svg += `<rect x="0" y="0" width="${padL}" height="${yAxisBottom}" fill="#f1f2ec" />`;
        if (isMobile) {
            svg += `<text x="4" y="14" text-anchor="start" font-size="10.5" font-weight="700" fill="#383a34">${UNIT_LABEL}</text>`;
        }

        const totalSteps = posSteps + negSteps;
        if (totalSteps <= 6) {
            for (let s = 0; s < totalSteps; s++) {
                const midVal = minPrice + tickStep * (s + 0.5);
                const yMid = yForPrice(midVal);
                svg += `<line x1="${padL}" y1="${yMid.toFixed(1)}" x2="${W - padR}" y2="${yMid.toFixed(1)}" stroke="#ebece5" stroke-width="1" />`;
                svg += `<line x1="${(padL - 3.2).toFixed(1)}" y1="${yMid.toFixed(1)}" x2="${padL}" y2="${yMid.toFixed(1)}" stroke="#686b62" stroke-width="1.1" />`;
            }
        }
        for (let s = 0; s <= totalSteps; s++) {
            const pVal = minPrice + tickStep * s;
            const y = yForPrice(pVal);
            const isZeroLine = Math.abs(pVal) < 1e-6;
            const isBottomAxis = s === 0;
            const yLabel = isMobile ? `${Math.round(pVal)}` : `${Math.round(pVal)} ${UNIT_SHORT}`;
            svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${(isZeroLine || isBottomAxis) ? '#111210' : '#c5c7bd'}" stroke-width="${isZeroLine ? '1.6' : (isBottomAxis ? '1.4' : '1')}" stroke-dasharray="${(isZeroLine || isBottomAxis) ? 'none' : '2,2'}" />`;
            svg += `<line x1="${(padL - 5.5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${padL}" y2="${y.toFixed(1)}" stroke="#111210" stroke-width="1.6" />`;
            svg += `<text x="${padL - 8}" y="${(y + 4.8).toFixed(1)}" text-anchor="end" font-size="14" font-weight="700" fill="#111210">${yLabel}</text>`;
        }
        svg += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${yAxisBottom}" stroke="#111210" stroke-width="1.6" />`;

        const nowMsExact = Date.now();
        const nowHourMs = Math.floor(nowMsExact / 3600000) * 3600000;
        let currentHourCursorSvg = '';
        let currentHourFrameSvg = '';
        let activeBarFramesSvg = '';
        let hoverHitSlotsSvg = '';

        // Pylväät (pelkkä pörssisähkön spot-hinta + ennusteen todennäköinen vaihteluväli)
        for (let i = 0; i < n; i++) {
            const xObj = enrichedItems[i];
            const x0 = padL + i * colW;
            const barW = Math.max(2.0, colW * (isWeekView ? 0.88 : 0.82));
            const barX = x0 + (colW - barW) / 2;

            const spotVal = xObj.br.spotCents;
            const ySpot = yForPrice(spotVal);
            const barTopY = spotVal >= 0 ? ySpot : yZero;
            const hSpot = Math.max(2.0, Math.abs(yZero - ySpot));
            const isCurrentHour = xObj.slot.epochMs === nowHourMs;

            let spotFill = spotVal < cheapThresh ? '#009e3d' : (spotVal < highThresh ? '#0038ff' : '#ff3b00');
            if (xObj.slot.isForecast) {
                spotFill = spotVal < cheapThresh
                    ? 'url(#forecastHatchCheap)'
                    : (spotVal < highThresh ? 'url(#forecastHatchNorm)' : 'url(#forecastHatchHigh)');
            }

            // Ennustetunnin todennäköinen vaihteluväli-varjostus (min-max) kapeampana keskipalkkina
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

            // Aktiivisen/osoitetun tunnin pystysuora korostuspalkki
            svg += `<rect class="svg-slot-hl" data-hl-idx="${i}" x="${x0.toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="#ffd000" fill-opacity="0" stroke="#111210" stroke-width="0" stroke-dasharray="3,2" pointer-events="none" />`;

            // Varsinainen spot-pylväs
            svg += `<rect class="svg-bar-rect${isCurrentHour ? ' is-current-bar' : ''}" data-bar-idx="${i}" x="${barX.toFixed(1)}" y="${barTopY.toFixed(1)}" width="${barW.toFixed(1)}" height="${hSpot.toFixed(1)}" fill="${spotFill}" stroke="#111210" stroke-width="${isWeekView ? '0.6' : '1.1'}" />`;

            // Siro, koko pylvään täydeltä 360° kiertävä kehys piirretään kaikkien pylväiden päälle silmukan jälkeen,
            // jottei seuraavan tunnin pylväs peitä oikeaa reunaa
            const frameInset = isWeekView ? 0.5 : 0.8;
            const fx = (barX - frameInset).toFixed(1);
            const fy = (barTopY - frameInset).toFixed(1);
            const fw = (barW + frameInset * 2).toFixed(1);
            const fh = (hSpot + frameInset * 2).toFixed(1);

            activeBarFramesSvg += `
                <g class="svg-bar-hl" data-bar-hl-idx="${i}" opacity="0" pointer-events="none">
                    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#111210" stroke-width="${isMobile ? '2.8' : '3.2'}" />
                    <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#ff3b00" stroke-width="${isMobile ? '1.6' : '1.9'}" />
                </g>
            `;

            if (isCurrentHour) {
                currentHourFrameSvg = `
                    <g class="svg-current-hour-frame" pointer-events="none">
                        <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#111210" stroke-width="${isMobile ? '2.8' : '3.2'}" />
                        <rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="#ffd000" stroke-width="${isMobile ? '1.5' : '1.8'}" />
                    </g>
                `;
                const minuteFrac = Math.max(0.12, Math.min(0.88, (nowMsExact - nowHourMs) / 3600000));
                const nowX = (barX + barW * minuteFrac).toFixed(1);
                const nowXNum = parseFloat(nowX);
                const lineEndY = Math.max(padT, barTopY - 3).toFixed(1);
                currentHourCursorSvg = `
                    <g pointer-events="none">
                        ${parseFloat(lineEndY) > padT + 2 ? `<line x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${lineEndY}" stroke="#ffffff" stroke-width="2.6" stroke-dasharray="4,3" /><line x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${lineEndY}" stroke="#111210" stroke-width="1.4" stroke-dasharray="4,3" />` : ''}
                        <polygon points="${(nowXNum - 4.5).toFixed(1)},${padT - 9} ${(nowXNum + 4.5).toFixed(1)},${padT - 9} ${nowX},${padT - 1.5}" fill="#111210" stroke="#ffd000" stroke-width="1.2" />
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

            // Aikaleimat ala-akselille (selkeät suuremmat tuntinumerot + asteikkoviivat)
            if (isWeekView) {
                if (xObj.slot.hour === 0) {
                    svg += `<line x1="${x0.toFixed(1)}" y1="${padT}" x2="${x0.toFixed(1)}" y2="${yAxisBottom}" stroke="#111210" stroke-width="1" stroke-dasharray="3,3" />`;
                    svg += `<text x="${(x0 + 3).toFixed(1)}" y="${H - (isMobile ? 8 : 9)}" font-size="${isMobile ? '12.5' : '13.5'}" font-weight="700" fill="#111210">${xObj.slot.dayShort || ''}</text>`;
                }
            } else {
                const cx = x0 + colW / 2;
                const showAllHours = colW >= 21.5 && n <= 25;
                const showHourTick = showAllHours ? true : (i % 2 === 0);
                const tickLen = showHourTick ? 5.5 : 3;
                svg += `<line x1="${cx.toFixed(1)}" y1="${yAxisBottom.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(yAxisBottom + tickLen).toFixed(1)}" stroke="#111210" stroke-width="${showHourTick ? '1.6' : '1'}" />`;
                if (showHourTick) {
                    const hourFontPx = isMobile ? '14' : (W >= 960 ? '14.5' : '13.5');
                    svg += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="${hourFontPx}" font-weight="700" fill="#111210">${String(xObj.slot.hour).padStart(2, '0')}</text>`;
                }
            }

            // Näkymätön kosketus-/hover-alue tarkkaa lukemaa varten
            hoverHitSlotsSvg += `<rect class="svg-hover-slot" data-slot-idx="${i}" data-x-pct="${(((x0 + colW / 2) / W) * 100).toFixed(2)}" x="${x0.toFixed(1)}" y="${padT}" width="${colW.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:crosshair;" />`;
        }

        svg += currentHourFrameSvg;
        svg += activeBarFramesSvg;
        svg += currentHourCursorSvg;
        svg += hoverHitSlotsSvg;

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
                if (typeof this.blur === 'function') this.blur();
                if (!hasPrev) return;
                const ft = document.getElementById('chart-floating-tooltip');
                if (ft) ft.classList.remove('visible');
                state.selectedDayIndex = targetPrevIdx;
                renderDayTabsAndChart();
            };
        }

        if (nextBtn) {
            const hasNext = state.selectedDayIndex === -1 ? state.daysList.length > 0 : state.selectedDayIndex < maxDayIdx;
            nextBtn.disabled = !hasNext;
            const targetNextIdx = state.selectedDayIndex === -1 ? 0 : state.selectedDayIndex + 1;
            nextBtn.onclick = function () {
                if (typeof this.blur === 'function') this.blur();
                if (!hasNext) return;
                const ft = document.getElementById('chart-floating-tooltip');
                if (ft) ft.classList.remove('visible');
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
            const lblNow = SUM_NOW_TITLE;
            const lblMin = SUM_MIN_TITLE;
            const lblMax = SUM_MAX_TITLE;
            const lblAt = AT_CLOCK_WORD ? `${AT_CLOCK_WORD} ` : '';
            const nowMs = Math.floor(Date.now() / 3600000) * 3600000;
            const currentSlotRaw = state.series.find(s => s.epochMs === nowMs) || state.series[0];
            const currentBr = currentSlotRaw ? calculateHourBreakdown(currentSlotRaw) : activeItems[0].br;
            const curH = currentSlotRaw ? currentSlotRaw.hour : activeItems[0].slot.hour;
            const curWindow = `${lblAt}${String(curH).padStart(2, '0')}:00–${String((curH + 1) % 24).padStart(2, '0')}:00`;

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
                    <span class="summary-metric-kicker">${lblNow} (${state.activeZone})</span>
                    <div class="summary-metric-value">${formatNum(currentBr.spotCents, 2)} <span style="font-size:15px;">${UNIT_LABEL}</span></div>
                    <span class="summary-metric-sub">${curWindow}${curPredSub}</span>
                </div>
                <div class="summary-metric-col">
                    <span class="summary-metric-kicker">${lblMin} (${minObj.slot.dayShort || ''})</span>
                    <div class="summary-metric-value" style="color:#008a36;">${minValText.replace(UNIT_LABEL, `<span style="font-size:15px;">${UNIT_LABEL}</span>`)}</div>
                    <span class="summary-metric-sub">${minDayPrefix}${lblAt}${String(minH).padStart(2, '0')}:00–${String((minH + 1) % 24).padStart(2, '0')}:00${minRangeSub}</span>
                </div>
                <div class="summary-metric-col">
                    <span class="summary-metric-kicker">${lblMax} (${maxObj.slot.dayShort || ''})</span>
                    <div class="summary-metric-value" style="color:#d92b00;">${maxValText.replace(UNIT_LABEL, `<span style="font-size:15px;">${UNIT_LABEL}</span>`)}</div>
                    <span class="summary-metric-sub">${maxDayPrefix}${lblAt}${String(maxH).padStart(2, '0')}:00–${String((maxH + 1) % 24).padStart(2, '0')}:00${maxRangeSub}</span>
                </div>
            `;
        }

        function updateReadout(xObj, isPinned = false) {
            if (!xObj || !readoutEl) return;
            const dayPrefix = xObj.slot.dayShort ? `${xObj.slot.dayShort} ` : '';
            const timeRange = `${String(xObj.slot.hour).padStart(2, '0')}:00–${String((xObj.slot.hour + 1) % 24).padStart(2, '0')}:00`;
            const probPct = xObj.slot.probabilityPct !== undefined ? xObj.slot.probabilityPct : (xObj.slot.isForecast ? 82 : 100);

            if (isMobileViewport()) {
                readoutEl.classList.toggle('is-pinned', Boolean(isPinned));
                readoutEl.dataset.pinnedEpoch = isPinned ? String(xObj.slot.epochMs) : '';
                const resetBtnHtml = isPinned
                    ? `<button type="button" class="readout-m-reset" aria-label="Palauta kuluva tunti">×</button>`
                    : '';
                if (xObj.slot.isForecast) {
                    const pubShort = getPricePublishTimeText(xObj.slot.dateKey, true);
                    readoutEl.innerHTML = `
                        <div class="readout-m-row1">
                            <span class="readout-m-time">${dayPrefix}${timeRange}</span>
                            <span class="readout-m-right">
                                <span class="readout-m-price">${APPROX_PREFIX}${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</span>
                                ${resetBtnHtml}
                            </span>
                        </div>
                        <div class="readout-m-row2">${RANGE_LABEL}: <strong>${formatNum(xObj.br.minSpotCents, 2)}–${formatNum(xObj.br.maxSpotCents, 2)} ${UNIT_SHORT}</strong> (${probPct} %) · ${pubShort}</div>
                    `;
                } else {
                    readoutEl.innerHTML = `
                        <div class="readout-m-row1">
                            <span class="readout-m-time">${dayPrefix}${timeRange}</span>
                            <span class="readout-m-right">
                                <span class="readout-m-price">${formatNum(xObj.br.spotCents, 2)} ${UNIT_LABEL}</span>
                                ${resetBtnHtml}
                            </span>
                        </div>
                        <div class="readout-m-row2">${FIXED_LABEL} · ${PRED_SHORT_LABEL}: <strong>${formatNum(xObj.br.predictedSpotCents, 2)} ${UNIT_SHORT}</strong> (${formatNum(xObj.br.predictedMinSpotCents, 2)}–${formatNum(xObj.br.predictedMaxSpotCents, 2)})</div>
                    `;
                }
                const resetBtn = readoutEl.querySelector('.readout-m-reset');
                if (resetBtn) {
                    resetBtn.onclick = function (ev) {
                        ev.stopPropagation();
                        clearChartSlotHighlight();
                        updateReadout(defaultReadoutItem, false);
                    };
                }
                return;
            }

            readoutEl.classList.remove('is-pinned');
            readoutEl.dataset.pinnedEpoch = '';
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

        function showFloatingTooltipAt(xObj, clientX, clientY) {
            if (!floatingTooltip || !xObj) return;
            if (isMobileViewport()) {
                // Mobiilissa tunnin tiedot näytetään suoraan kaavion yläpuolisessa kiinteässä lukemapaneelissa,
                // jotta kelluva laatikko ei koskaan peitä kaavion hintahuippuja
                floatingTooltip.classList.remove('visible');
                floatingTooltip.dataset.activeEpoch = '';
                return;
            }
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

        function clearChartSlotHighlight() {
            const svgEl = chartContainer.querySelector('.responsive-price-svg');
            if (svgEl) svgEl.classList.remove('has-active-slot');
            chartContainer.querySelectorAll('.svg-slot-hl.is-active').forEach(el => {
                el.classList.remove('is-active');
                el.setAttribute('fill-opacity', '0');
                el.setAttribute('stroke-width', '0');
            });
            chartContainer.querySelectorAll('.svg-bar-rect.is-active-slot-bar').forEach(el => {
                el.classList.remove('is-active-slot-bar');
            });
            chartContainer.querySelectorAll('.svg-bar-hl.is-active').forEach(el => {
                el.classList.remove('is-active');
                el.setAttribute('opacity', '0');
            });
        }

        function highlightChartSlot(idx) {
            clearChartSlotHighlight();
            const svgEl = chartContainer.querySelector('.responsive-price-svg');
            if (svgEl) svgEl.classList.add('has-active-slot');
            const slotHl = chartContainer.querySelector(`.svg-slot-hl[data-hl-idx="${idx}"]`);
            if (slotHl) {
                slotHl.classList.add('is-active');
                slotHl.setAttribute('fill-opacity', '0.22');
                slotHl.setAttribute('stroke-width', '1');
            }
            const barEl = chartContainer.querySelector(`.svg-bar-rect[data-bar-idx="${idx}"]`);
            if (barEl) {
                barEl.classList.add('is-active-slot-bar');
            }
            const barHl = chartContainer.querySelector(`.svg-bar-hl[data-bar-hl-idx="${idx}"]`);
            if (barHl) {
                barHl.classList.add('is-active');
                barHl.setAttribute('opacity', '1');
            }
        }

        if (floatingTooltip) {
            floatingTooltip.classList.remove('visible');
            floatingTooltip.onclick = function () {
                this.classList.remove('visible');
                this.dataset.activeEpoch = '';
                clearChartSlotHighlight();
            };
        }

        const nowHourMs = Math.floor(Date.now() / 3600000) * 3600000;
        const defaultReadoutItem = activeItems.find(x => x.slot.epochMs === nowHourMs) || activeItems[0];
        updateReadout(defaultReadoutItem, false);

        let hoverDwellTimer = null;
        let lastMouseX = 0;
        let lastMouseY = 0;

        chartContainer.querySelectorAll('.svg-hover-slot').forEach(rect => {
            const scheduleTooltipOnStill = function (evt) {
                if (isMobileViewport()) return;
                const i = parseInt(this.getAttribute('data-slot-idx'), 10);
                const item = activeItems[i];
                if (!item) return;

                updateReadout(item, false);
                highlightChartSlot(i);

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
                    highlightChartSlot(i);
                    showFloatingTooltipAt(item, lastMouseX, lastMouseY);
                }, 260);
            };

            rect.addEventListener('mouseenter', scheduleTooltipOnStill);
            rect.addEventListener('mousemove', scheduleTooltipOnStill);
            rect.addEventListener('mouseleave', function () {
                if (isMobileViewport()) return;
                if (hoverDwellTimer) {
                    clearTimeout(hoverDwellTimer);
                    hoverDwellTimer = null;
                }
                if (floatingTooltip) floatingTooltip.classList.remove('visible');
                clearChartSlotHighlight();
            });
            rect.addEventListener('click', function (evt) {
                if (chartContainer.dataset.lastSwipeTs && Date.now() - parseInt(chartContainer.dataset.lastSwipeTs, 10) < 400) {
                    return;
                }
                const i = parseInt(this.getAttribute('data-slot-idx'), 10);
                const item = activeItems[i];
                if (!item) return;

                if (isMobileViewport()) {
                    if (readoutEl && readoutEl.dataset.pinnedEpoch === String(item.slot.epochMs)) {
                        clearChartSlotHighlight();
                        updateReadout(defaultReadoutItem, false);
                        return;
                    }
                    highlightChartSlot(i);
                    updateReadout(item, true);
                    return;
                }

                updateReadout(item, false);
                highlightChartSlot(i);
                showFloatingTooltipAt(item, evt.clientX || lastMouseX, evt.clientY || lastMouseY);
            });
        });

        if (!chartContainer.dataset.swipeBound) {
            chartContainer.dataset.swipeBound = '1';
            let touchStartX = 0;
            let touchStartY = 0;
            let touchMoved = false;

            chartContainer.addEventListener('touchstart', function (e) {
                if (!e.touches || e.touches.length !== 1) return;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchMoved = false;
            }, { passive: true });

            chartContainer.addEventListener('touchmove', function (e) {
                if (!e.touches || e.touches.length !== 1) return;
                const dx = e.touches[0].clientX - touchStartX;
                const dy = e.touches[0].clientY - touchStartY;
                if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
                    touchMoved = true;
                }
            }, { passive: true });

            chartContainer.addEventListener('touchend', function (e) {
                if (!touchMoved || !e.changedTouches || e.changedTouches.length !== 1) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    chartContainer.dataset.lastSwipeTs = String(Date.now());
                    const ft = document.getElementById('chart-floating-tooltip');
                    if (ft) ft.classList.remove('visible');
                    if (dx < 0) {
                        const nb = document.getElementById('chart-next-day');
                        if (nb && !nb.disabled) nb.click();
                    } else {
                        const pb = document.getElementById('chart-prev-day');
                        if (pb && !pb.disabled) pb.click();
                    }
                }
            }, { passive: true });
        }

        chartContainer.addEventListener('mouseleave', function () {
            if (hoverDwellTimer) {
                clearTimeout(hoverDwellTimer);
                hoverDwellTimer = null;
            }
            if (floatingTooltip) floatingTooltip.classList.remove('visible');
            if (!isMobileViewport()) clearChartSlotHighlight();
        });

        // Tuntikohtainen hintataulukko ja 30 vrk liukuvan keskiarvon mukaiset hintarajat
        const maxDayScale = Math.max(15 * FX_SCALE, ...activeItems.map(x => x.slot.isForecast ? x.br.maxSpotCents : x.br.spotCents));
        const { avg30d, cheapThresh, highThresh } = getDynamicPriceThresholds();

        // Päivitetään ylälaidan värikoodiselitteeseen dynaamiset 30 vrk liukuvan keskiarvon rajat
        const legendEl = document.querySelector('.chart-legend');
        const legendItems = document.querySelectorAll('.chart-legend .legend-item');
        if (legendItems.length >= 3) {
            const wIntro = TIER_BASIS_INTRO;
            const wCheap = TIER_CHEAP;
            const wNorm = TIER_NORM;
            const wHigh = TIER_HIGH;
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
        const activeDsoObj = getActiveDso();
        const activeDsoLabel = activeDsoObj ? activeDsoObj.short_name : '';
        const totalHeaderTh = document.querySelector('#tuntitaulukko thead th:nth-child(4)');
        if (totalHeaderTh && activeDsoLabel) {
            if (!totalHeaderTh.dataset.baseLabel) {
                totalHeaderTh.dataset.baseLabel = totalHeaderTh.textContent.trim();
            }
            const baseLabel = totalHeaderTh.dataset.baseLabel || 'Kokonaishinta siirtoineen';
            totalHeaderTh.innerHTML = `${baseLabel}<span style="display:block; font-size:10.5px; font-weight:600; color:#4a4f4a; text-transform:none; letter-spacing:0; margin-top:1px;">(${activeDsoLabel})</span>`;
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

            const dsoSubLabel = activeDsoLabel ? `<span class="muted-range" style="display:block; font-size:11px; margin-top:1px;">(${activeDsoLabel})</span>` : '';
            const totalHtml = x.slot.isForecast
                ? `${APPROX_PREFIX}${formatNum(x.br.totalCents, 2)} ${UNIT_LABEL} <span class="muted-range">(${formatNum(x.br.minTotalCents, 1)}–${formatNum(x.br.maxTotalCents, 1)} ${UNIT_SHORT})</span>${dsoSubLabel}`
                : `${formatNum(x.br.totalCents, 2)} ${UNIT_LABEL}${dsoSubLabel}`;

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

        const elStats = state.mlStats.errorLearning || {
            calibratedHours: ML_BASE.errorLearning?.verifiedHoursCount || 336,
            preCorrectionMae: ML_BASE.errorLearning?.preCorrectionMae14d || 1.48,
            postCorrectionMae: ML_BASE.errorLearning?.postCorrectionMae14d || 1.19,
            weekdayPeakAdj: 0.0,
            nightAdj: 0.0,
            conformalScale: 1.0
        };
        const errGainPct = elStats.preCorrectionMae > 0.05
            ? Math.max(0, ((elStats.preCorrectionMae - elStats.postCorrectionMae) / elStats.preCorrectionMae) * 100.0)
            : 0.0;
        const peakAdjStr = `${elStats.weekdayPeakAdj >= 0 ? '+' : ''}${formatNum(elStats.weekdayPeakAdj, 2)} ${UNIT_SHORT}`;
        const nightAdjStr = `${elStats.nightAdj >= 0 ? '+' : ''}${formatNum(elStats.nightAdj, 2)} ${UNIT_SHORT}`;

        const errorLearningBannerHtml = `
            <div style="margin-bottom:16px; padding:12px 14px; background:#f4f3ec; border:2px solid #111210;">
                <div class="field-label" style="margin-bottom:6px;">JATKUVA VIRHEISTÄ OPPIMINEN (ONLINE NLMS &amp; JÄÄNNÖSVIRHEKORJAUS)</div>
                <p style="font-size:12.5px; color:#2b2e2b; margin:0 0 10px 0;">
                    Ohjelma tallentaa jokaisen tekemänsä tuntiennusteen ennen Nord Pool -hintojen julkaisua ja vertaa sitä toteutuneeseen hintaan heti, kun uudet hinnat saapuvat. Havaituista poikkeamista malli päivittää automaattisesti 24 muuttujan painokertoimet (NLMS-gradienttioppiminen), kellonaikaprofiilin sekä tuuli×lämpötila-jäännösvirhematriisin.
                </p>
                <div class="bt-kpi-strip" style="margin-bottom:0;">
                    <div class="bt-kpi-cell"><span>Verifioidut tunnit (14 vrk)</span><strong>${elStats.calibratedHours} h</strong></div>
                    <div class="bt-kpi-cell"><span>Virhe ennen itsekorjausta</span><strong>${formatNum(elStats.preCorrectionMae, 2)} ${UNIT_LABEL}</strong></div>
                    <div class="bt-kpi-cell"><span>Virhe oppimisen jälkeen</span><strong style="color:#008a36;">${formatNum(elStats.postCorrectionMae, 2)} ${UNIT_LABEL} (-${formatNum(errGainPct, 1)} %)</strong></div>
                    <div class="bt-kpi-cell"><span>Opittu kulutushuippukorjaus</span><strong>${peakAdjStr}</strong></div>
                    <div class="bt-kpi-cell"><span>Opittu yötuntikorjaus</span><strong>${nightAdjStr}</strong></div>
                    <div class="bt-kpi-cell"><span>Vaihteluvälin kalibrointi</span><strong>${formatNum(elStats.conformalScale, 2)}x</strong></div>
                </div>
            </div>
        `;

        panelEl.innerHTML = `
            ${errorLearningBannerHtml}
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

        const subDiv = SUBUNITS_PER_MAJOR || 100.0;
        const totalKwh = state.applianceKw * wLen;
        const bestMaj = (bestWindow.avgTotal * totalKwh) / subDiv;
        const minMaj = (bestWindow.avgMinTotal * totalKwh) / subDiv;
        const maxMaj = (bestWindow.avgMaxTotal * totalKwh) / subDiv;
        const worstMaj = (worstWindow.avgTotal * totalKwh) / subDiv;
        const savedMaj = Math.max(0, worstMaj - bestMaj);

        const startHel = getHelsinkiComponents(new Date(bestWindow.startSlot.epochMs));
        const endHel = getHelsinkiComponents(new Date(bestWindow.endSlot.epochMs + 3600000));

        const eurLabel = bestWindow.hasFc
            ? `${formatNum(minMaj, 2)}–${formatNum(maxMaj, 2)} ${CURRENCY_MAJOR}`
            : `${formatNum(bestMaj, 2)} ${CURRENCY_MAJOR}`;
        const priceDetailLabel = bestWindow.hasFc
            ? `${OPT_PROB_TOTAL_LABEL} <strong>${formatNum(bestWindow.avgMinTotal, 2)}–${formatNum(bestWindow.avgMaxTotal, 2)} ${UNIT_LABEL}</strong> (${EXPECT_WORD} ${formatNum(bestWindow.avgTotal, 2)} ${UNIT_SHORT} | ${OPT_TRANSFER_TAX_LABEL} ${formatNum(bestWindow.avgTransferAndTax, 2)} ${UNIT_SHORT})<br><span style="font-size:11px; color:#4a4f4a;">${getPricePublishTimeText(bestWindow.endSlot.dateKey, false)}</span>`
            : `${OPT_AVG_TOTAL_LABEL} <strong>${formatNum(bestWindow.avgTotal, 2)} ${UNIT_LABEL}</strong> (Spot ${formatNum(bestWindow.avgSpot, 2)} + ${OPT_TRANSFER_TAX_LABEL} ${formatNum(bestWindow.avgTransferAndTax, 2)})`;

        const winKicker = OPT_BEST_WINDOW_TPL.replace('{h}', String(wLen));
        const atPrefix = AT_CLOCK_WORD ? `${AT_CLOCK_WORD} ` : '';

        resultEl.innerHTML = `
            <div class="opt-result-ledger">
                <div class="opt-kicker">${winKicker}</div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin:4px 0;">
                    <div class="opt-time-large">${atPrefix}${String(startHel.hour).padStart(2, '0')}:00–${String(endHel.hour).padStart(2, '0')}:00 (${startHel.day}.${startHel.month}.)</div>
                    <div class="opt-eur-large">${eurLabel}</div>
                </div>
                <div style="font-size:12px; color:#161816;">
                    ${priceDetailLabel}
                </div>
                <div style="font-size:11.5px; color:#4a4f4a; margin-top:4px;">
                    ${OPT_CONSUMPTION_LABEL} ${formatNum(totalKwh, 1)} kWh | ${OPT_SAVED_LABEL} (${formatNum(worstMaj, 2)} ${CURRENCY_MAJOR}): <strong>${formatNum(savedMaj, 2)} ${CURRENCY_MAJOR}</strong>
                </div>
            </div>
        `;
    }

    function renderAnnualTransferComparison() {
        const dso = getActiveDso();
        const container = document.getElementById('annual-comparison-result');
        if (!container || !dso) return;

        const subDiv = SUBUNITS_PER_MAJOR || 100.0;
        const kwh = Math.max(500, state.annualKwh);
        const nightShare = Math.max(0, Math.min(100, state.nightSharePct)) / 100.0;
        const dayShare = 1.0 - nightShare;

        const heatingWeight = Math.max(0.0, Math.min(1.0, (kwh - 2500) / 15500));
        const winterShare = 0.44 + 0.18 * heatingWeight;
        const shoulderShare = 0.31 - 0.06 * heatingWeight;
        const summerShare = 1.0 - winterShare - shoulderShare;

        const winterAvgSpot = 7.65 * FX_SCALE;
        const shoulderAvgSpot = 4.85 * FX_SCALE;
        const summerAvgSpot = 3.45 * FX_SCALE;
        const seasonalBaseSpot = winterShare * winterAvgSpot + shoulderShare * shoulderAvgSpot + summerShare * summerAvgSpot;
        const profileFactor = 1.12 * dayShare + 0.84 * nightShare;

        const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
        const avgSpot = seasonalBaseSpot * profileFactor * vatFactor;
        const taxC = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;
        const marginC = state.marginCents * vatFactor;

        const energyAndMarginMaj = ((avgSpot + marginC) * kwh) / subDiv;
        const taxMaj = (taxC * kwh) / subDiv;

        const genAvgC = dso.general_c_kwh * vatFactor;
        const genTransferMaj = (genAvgC * kwh) / subDiv + (dso.general_base_eur * vatFactor * 12);
        const genTotalMaj = energyAndMarginMaj + taxMaj + genTransferMaj;

        const timeAvgC = (dso.day_c_kwh * dayShare + dso.night_c_kwh * nightShare) * vatFactor;
        const timeTransferMaj = (timeAvgC * kwh) / subDiv + (dso.time_base_eur * vatFactor * 12);
        const timeTotalMaj = energyAndMarginMaj + taxMaj + timeTransferMaj;

        const winterDayShare = Math.max(0.10, dayShare * winterShare);
        const otherSeasonShare = 1.0 - winterDayShare;
        const seasonAvgC = (dso.winter_day_c_kwh * winterDayShare + dso.other_c_kwh * otherSeasonShare) * vatFactor;
        const seasonTransferMaj = (seasonAvgC * kwh) / subDiv + (dso.season_base_eur * vatFactor * 12);
        const seasonTotalMaj = energyAndMarginMaj + taxMaj + seasonTransferMaj;

        const tGenTitle = ACTIVE_LOC ? ACTIVE_LOC.tariffGeneral : 'Yleissiirto';
        const tNightTitle = ACTIVE_LOC ? (ACTIVE_LOC.tariffTime || '07–22 / 22–07') : 'Yösiirto / Aikasiirto';
        const tSeasonTitle = ACTIVE_LOC ? (ACTIVE_LOC.tariffSeason || '07–22 / 22–07') : 'Kausisiirto';

        const options = [
            { id: 'general', title: tGenTitle, transferEur: genTransferMaj, totalEur: genTotalMaj, transferC: genAvgC, avgC: avgSpot + marginC + genAvgC + taxC },
            { id: 'time', title: tNightTitle, transferEur: timeTransferMaj, totalEur: timeTotalMaj, transferC: timeAvgC, avgC: avgSpot + marginC + timeAvgC + taxC },
            { id: 'season', title: tSeasonTitle, transferEur: seasonTransferMaj, totalEur: seasonTotalMaj, transferC: seasonAvgC, avgC: avgSpot + marginC + seasonAvgC + taxC }
        ];

        const cheapest = options.reduce((a, b) => (b.totalEur < a.totalEur ? b : a), options[0]);

        container.innerHTML = options.map(opt => {
            const isBest = opt.id === cheapest.id;
            return `
                <div class="comp-card ${isBest ? 'best-choice' : ''}">
                    <div class="comp-card-header">
                        <span class="comp-title">${opt.title}</span>
                        ${isBest ? `<span style="font-size:11px; font-weight:700; color:#ff3b00; text-transform:uppercase;">● ${TIER_CHEAP}</span>` : ''}
                    </div>
                    <div class="comp-total-eur">~${formatNum(opt.totalEur, 0)} ${CURRENCY_MAJOR}/a <span style="font-size:13px; font-weight:400;">(${formatNum(opt.totalEur / 12, 0)} ${CURRENCY_MAJOR}/m)</span></div>
                    <div><strong>~${formatNum(opt.avgC, 2)} ${UNIT_LABEL}</strong></div>
                    <ul class="comp-list">
                        <li>Spot + margin: ~${formatNum(energyAndMarginMaj, 0)} ${CURRENCY_MAJOR}</li>
                        <li>${DSO_NETWORK_KICKER}: ${formatNum(opt.transferEur, 0)} ${CURRENCY_MAJOR}</li>
                        <li>${RECEIPT_TAX_ROW}: ${formatNum(taxMaj, 0)} ${CURRENCY_MAJOR}</li>
                    </ul>
                </div>
            `;
        }).join('');
    }

    function updateOpenApiPanel() {
        const z = encodeURIComponent(state.activeZone || 'FI');
        const vatFlag = state.includeVat ? '1' : '0';
        const jsonUrl = `https://spotpuls.app/api/v1/prices?zone=${z}&vat=${vatFlag}`;
        const csvUrl = `https://spotpuls.app/api/v1/prices?zone=${z}&vat=${vatFlag}&format=csv`;
        const badgeUrl = `https://spotpuls.app/api/v1/prices?zone=${z}&vat=${vatFlag}&format=badge`;
        const marketPath = COUNTRY_ID === 'fi' ? '/' : `/${COUNTRY_ID}/`;
        const backlinkUrl = `https://spotpuls.app${marketPath}?zone=${z}`;

        const jsonEl = document.getElementById('api-json-url');
        if (jsonEl) jsonEl.textContent = jsonUrl;

        const csvEl = document.getElementById('api-csv-url');
        if (csvEl) csvEl.textContent = `=IMPORTDATA("${csvUrl}")`;

        const badgeImg = document.getElementById('api-badge-img');
        if (badgeImg && badgeImg.getAttribute('data-zone') !== `${z}_${vatFlag}`) {
            badgeImg.setAttribute('data-zone', `${z}_${vatFlag}`);
            badgeImg.src = `/api/v1/prices?zone=${z}&vat=${vatFlag}&format=badge`;
        }

        const embedEl = document.getElementById('api-embed-code');
        if (embedEl) {
            embedEl.textContent = `<a href="${backlinkUrl}" target="_blank" rel="noopener"><img src="${badgeUrl}" alt="Spotpuls ${state.activeZone} spot electricity price & 7-day forecast" width="250" height="32"></a>`;
        }

        const haEl = document.getElementById('api-ha-yaml');
        if (haEl) {
            haEl.textContent =
`rest:
  - resource: "${jsonUrl}"
    scan_interval: 900
    sensor:
      - name: "Spotpuls ${state.activeZone} Current Spot"
        value_template: "{{ value_json.current.spotPrice }}"
        unit_of_measurement: "${UNIT_LABEL}"
        json_attributes_path: "$.summary"
        json_attributes:
          - todayMin
          - todayMax
          - rolling30dAvg`;
        }
    }

    function renderAll() {
        renderTelemetryAndDsoPanel();
        renderReceiptLedger();
        renderDayTabsAndChart();
        renderMlLearningPanel();
        renderCheapestWindowCalculator();
        renderAnnualTransferComparison();
        updateOpenApiPanel();
    }

    function bindEvents() {
        const zoneSelect = document.getElementById('zone-select');
        if (zoneSelect) {
            if (state.activeZone && Array.from(zoneSelect.options).some(o => o.value === state.activeZone)) {
                zoneSelect.value = state.activeZone;
            }
            zoneSelect.addEventListener('change', function () {
                const nextZ = this.value;
                if (!nextZ || nextZ === state.activeZone) return;
                state.activeZone = nextZ;
                const matchingDso = Object.values(DSO_DATA.companies).find(c => c.zone === nextZ);
                if (matchingDso) {
                    state.dsoId = matchingDso.id;
                }
                saveSettings();
                try {
                    const u = new URL(window.location.href);
                    u.searchParams.set('zone', nextZ);
                    window.history.replaceState({}, '', u.toString());
                } catch (_) {}
                updateOpenApiPanel();
                loadSpotAndForecastData();
            });
        }

        const langSelect = document.getElementById('lang-select');
        if (langSelect) {
            langSelect.addEventListener('change', function () {
                if (this.value) {
                    window.location.href = this.value;
                }
            });
        }

        document.querySelectorAll('[data-copy-target]').forEach(btn => {
            btn.addEventListener('click', function () {
                const targetId = this.getAttribute('data-copy-target');
                const targetEl = targetId ? document.getElementById(targetId) : null;
                if (!targetEl) return;
                const txt = targetEl.textContent || '';
                const origLabel = this.getAttribute('data-orig-label') || this.textContent;
                this.setAttribute('data-orig-label', origLabel);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(txt).then(() => {
                        this.textContent = API_COPIED_BTN;
                        setTimeout(() => { this.textContent = origLabel; }, 1800);
                    }).catch(() => {});
                }
            });
        });

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
                const chosenDso = DSO_DATA.companies[state.dsoId];
                const nextZone = chosenDso && chosenDso.zone ? chosenDso.zone : null;
                const zoneChanged = nextZone && nextZone !== state.activeZone;
                if (zoneChanged) {
                    state.activeZone = nextZone;
                }
                saveSettings();
                if (zoneChanged) {
                    loadSpotAndForecastData();
                } else {
                    renderAll();
                }
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
                if (!v || /^\d{4,5}$/.test(v)) {
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
                if (!isNaN(v) && v >= 0 && v <= 500) {
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
        updateOpenApiPanel();
        loadSpotAndForecastData();

        let lastIsMobile = isMobileViewport();
        let lastResizeW = getViewportWidth() || 0;
        let lastResizeH = window.innerHeight || 0;
        let resizeDebounceTimer = null;
        window.addEventListener('resize', function () {
            const nowIsMobile = isMobileViewport();
            const curW = getViewportWidth() || 0;
            const curH = window.innerHeight || 0;
            const modeChanged = nowIsMobile !== lastIsMobile;
            const widthChanged = Math.abs(curW - lastResizeW) > 14;
            const desktopHeightChanged = !nowIsMobile && Math.abs(curH - lastResizeH) > 20;
            if (modeChanged || widthChanged || desktopHeightChanged) {
                lastIsMobile = nowIsMobile;
                lastResizeW = curW;
                lastResizeH = curH;
                if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
                resizeDebounceTimer = setTimeout(function () {
                    renderDayTabsAndChart();
                }, modeChanged ? 0 : 100);
            }
        });

        function scheduleNextTopOfHourFetch() {
            const nowMs = Date.now();
            const msToNextHour = 3600000 - (nowMs % 3600000) + 4000;
            setTimeout(function () {
                loadSpotAndForecastData();
                scheduleNextTopOfHourFetch();
            }, msToNextHour);
        }
        scheduleNextTopOfHourFetch();

        function isTomorrowConfirmedInSeries(seriesArr) {
            if (!Array.isArray(seriesArr) || seriesArr.length === 0) return false;
            const curHourMs = Math.floor(Date.now() / 3600000) * 3600000;
            const curHel = getHelsinkiComponents(curHourMs);
            const tomorrowNoonMs = curHourMs + (36 - curHel.hour) * 3600000;
            const tomDateKey = getHelsinkiComponents(tomorrowNoonMs).dateKey;
            let confirmedCnt = 0;
            for (const s of seriesArr) {
                if (s.dateKey === tomDateKey && !s.isForecast) confirmedCnt++;
            }
            return confirmedCnt >= 20;
        }

        function isAfterDailyPublishTime() {
            const zcfg = getActiveZoneConfig();
            const pubH = zcfg.pubHour !== undefined ? zcfg.pubHour : 13;
            const pubM = zcfg.pubMin !== undefined ? zcfg.pubMin : 45;
            const now = new Date();
            const fmtMin = new Intl.DateTimeFormat('en-GB', {
                timeZone: zcfg.tz || 'Europe/Helsinki',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const parts = fmtMin.formatToParts(now);
            const map = {};
            for (const p of parts) map[p.type] = p.value;
            const h = parseInt(map.hour, 10) % 24;
            const m = parseInt(map.minute, 10);
            return h > pubH || (h === pubH && m >= pubM);
        }

        function scheduleTwiceDailyRefinement() {
            const zcfg = getActiveZoneConfig();
            const pubH = zcfg.pubHour !== undefined ? zcfg.pubHour : 13;
            const pubM = zcfg.pubMin !== undefined ? zcfg.pubMin : 45;
            const now = new Date();
            const fmtMin = new Intl.DateTimeFormat('en-GB', {
                timeZone: zcfg.tz || 'Europe/Helsinki',
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

            const tNight = 1 * 3600 + 45 * 60 + 5;
            const tPub = pubH * 3600 + pubM * 60 + 5;

            let secUntilNext;
            if (curSecOfDay < tNight) {
                secUntilNext = tNight - curSecOfDay;
            } else if (curSecOfDay < tPub) {
                secUntilNext = tPub - curSecOfDay;
            } else {
                secUntilNext = (24 * 3600 - curSecOfDay) + tNight;
            }

            setTimeout(async function () {
                await loadSpotAndForecastData();
                scheduleTwiceDailyRefinement();
            }, Math.max(5000, secUntilNext * 1000));
        }
        scheduleTwiceDailyRefinement();

        setInterval(function () {
            if (isAfterDailyPublishTime() && !isTomorrowConfirmedInSeries(state.series)) {
                loadSpotAndForecastData();
                return;
            }
            const lastGenMs = state.generatedAt ? Date.parse(state.generatedAt) : 0;
            const ageMin = (Date.now() - lastGenMs) / 60000;
            if (ageMin >= 15) {
                loadSpotAndForecastData();
            } else if (state.series && state.series.length > 0) {
                renderDayTabsAndChart();
            }
        }, 45000);

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') {
                if (isAfterDailyPublishTime() && !isTomorrowConfirmedInSeries(state.series)) {
                    loadSpotAndForecastData();
                    return;
                }
                const lastGenMs = state.generatedAt ? Date.parse(state.generatedAt) : 0;
                if (Date.now() - lastGenMs >= 600000) {
                    loadSpotAndForecastData();
                } else {
                    renderDayTabsAndChart();
                }
            }
        });
    });
})();
