// Pörssisähkö, 7 vrk hintaennuste ja postinumeropohjainen siirtohintalaskuri
(function () {
    const DSO_DATA = window.PORSSISAHKO_DSO_DATA || {
        vatRate: 1.255,
        electricityTaxVat0: 2.253,
        electricityTaxInclVat: 2.8275,
        companies: {},
        municipalities: [],
        postalPrefixRules: []
    };

    const FINLAND_INSTALLED_WIND_MW = 8450;

    const state = {
        postalCode: localStorage.getItem('ps_postal') || '00100',
        cityName: localStorage.getItem('ps_city') || 'Helsinki',
        dsoId: localStorage.getItem('ps_dso') || 'helen',
        altDsoIds: [],
        tariffType: localStorage.getItem('ps_tariff') || 'general', // 'general' | 'time' | 'season'
        marginCents: parseFloat(localStorage.getItem('ps_margin') || '0.45'),
        includeVat: localStorage.getItem('ps_vat') !== '0',
        showTotalInChart: localStorage.getItem('ps_show_total') !== '0',
        selectedDayIndex: 0, // 0 = Tänään, 1 = Huomenna, 2..6 = Ennustepäivät, -1 = 7 vrk yleiskatsaus
        windowHours: 3,
        applianceKw: 11.0,
        annualKwh: 12000,
        nightSharePct: 55,
        series: [],
        daysList: [],
        generatedAt: null
    };

    // Jos sivu on tietyn verkkoyhtiön tai paikkakunnan alasivu, asetetaan oletus sivun attribuuteista
    const bodyEl = document.body;
    if (bodyEl) {
        const presetDso = bodyEl.getAttribute('data-preset-dso');
        const presetPostal = bodyEl.getAttribute('data-preset-postal');
        const presetCity = bodyEl.getAttribute('data-preset-city');
        if (presetDso && DSO_DATA.companies[presetDso]) {
            state.dsoId = presetDso;
        }
        if (presetPostal) {
            state.postalCode = presetPostal;
        }
        if (presetCity) {
            state.cityName = presetCity;
        }
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

    // Tunnistaa postinumeron (tai paikkakunnan nimen) perusteella kunnan ja sähköverkkoyhtiön
    function resolvePostalOrCity(inputRaw) {
        const q = String(inputRaw || '').trim();
        if (!q) return null;

        // 1. Jos syöte alkaa numeroilla (postinumero)
        const digits = q.replace(/\D/g, '');
        if (digits.length >= 2) {
            const p5 = digits.padEnd(5, '0').slice(0, 5);
            // Tarkista ensin kunnat, joissa tarkka postinumero tai postinumeroväli täsmää
            for (const m of DSO_DATA.municipalities) {
                if (m.postal === p5) {
                    return { postal: p5, city: m.name, dsoId: m.primary, alt: m.alt || [] };
                }
            }
            // Tarkista 3-numeroiset ja 2-numeroiset säännöt järjestyksessä
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

        // 2. Jos syöte on paikkakunnan tai verkkoyhtiön nimi
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

    // Laskee yksittäisen tunnin hintaerittelyn (snt/kWh)
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

    // Selainpuolen suora varahaku + ennustelaskenta, jos /api/spot-and-forecast ei ole käytettävissä (esim. paikallinen esikatselu)
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

    function computeRawForecastPriceInclVat(hourMs, weather) {
        const hel = getHelsinkiComponents(new Date(hourMs));
        const w = weather || { windSpeed100m: 6.5, windMw: 2400, tempC: 4.0 };
        const windRatio = w.windMw / FINLAND_INSTALLED_WIND_MW;
        const heatingDegrees = Math.max(0, 12.0 - w.tempC);
        const coldPenalty = heatingDegrees * 0.32 + Math.max(0, -5.0 - w.tempC) * 0.55;
        const baseThermalAndHydro = 7.40 + coldPenalty;
        const windDiscount = Math.pow(windRatio / 0.35, 1.25) * 4.80;
        const dailyBase = Math.max(0.45, baseThermalAndHydro - windDiscount);
        const hourProfile = hel.isWeekend ? WEEKEND_HOURLY_FACTORS[hel.hour] : WEEKDAY_HOURLY_FACTORS[hel.hour];
        const peakCompression = windRatio > 0.52 ? 0.55 : (windRatio < 0.16 ? 1.30 : 1.0);
        const adjustedFactor = 1.0 + (hourProfile - 1.0) * peakCompression;
        return Math.max(0.15, dailyBase * adjustedFactor);
    }

    async function fetchClientSideFallback() {
        const now = new Date();
        const startHourIso = new Date(Math.floor(now.getTime() / 3600000) * 3600000 - 24 * 3600000).toISOString();
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

        const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=64.26,62.47,62.73,60.17&longitude=23.95,21.34,22.58,24.94&hourly=temperature_2m,wind_speed_100m,wind_speed_10m&wind_speed_unit=ms&past_days=1&forecast_days=7&timezone=UTC';
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

        let observedSum = 0, modelSum = 0, calCount = 0;
        for (const [hourMs, spotObj] of officialHourlyMap.entries()) {
            if (weatherMap.has(hourMs) && spotObj.priceInclVat >= 0) {
                observedSum += spotObj.priceInclVat;
                modelSum += computeRawForecastPriceInclVat(hourMs, weatherMap.get(hourMs));
                calCount++;
            }
        }
        let calibrationOffset = 0.0;
        if (calCount >= 12 && modelSum > 0) {
            calibrationOffset = Math.max(-3.5, Math.min(4.5, ((observedSum / calCount) - (modelSum / calCount)) * 0.55));
        }

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
            }
        } catch (_) {}

        if (!data || !Array.isArray(data.series) || data.series.length === 0) {
            data = await fetchClientSideFallback();
        }

        state.series = data.series || [];
        state.generatedAt = data.generatedAt;

        // Ryhmitellään vuorokausiin Suomen ajan (dateKey) mukaan alkaen tästä päivästä
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
            if (items.length < 18 && idx > 0) continue; // ohita vajaa viimeinen häntäpäivä
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

        // Päivitetään siirtotuotevalitsimen aktiivinen tila
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

        // Tämän päivän tilastot
        const todayObj = state.daysList[0];
        if (todayObj && todayObj.items.length > 0) {
            const enriched = todayObj.items.map(s => ({ slot: s, br: calculateHourBreakdown(s) }));
            const minByTotal = enriched.reduce((a, b) => (b.br.totalCents < a.br.totalCents ? b : a), enriched[0]);
            const maxByTotal = enriched.reduce((a, b) => (b.br.totalCents > a.br.totalCents ? b : a), enriched[0]);
            const avgSpot = enriched.reduce((s, x) => s + x.br.spotCents, 0) / enriched.length;
            const avgTotal = enriched.reduce((s, x) => s + x.br.totalCents, 0) / enriched.length;

            const elMin = document.getElementById('kpi-today-min');
            const elMinSub = document.getElementById('kpi-today-min-sub');
            if (elMin) elMin.textContent = `${formatNum(minByTotal.br.totalCents, 2)} snt/kWh`;
            if (elMinSub) elMinSub.textContent = `Klo ${String(minByTotal.slot.hour).padStart(2, '0')}:00 (Spot ${formatNum(minByTotal.br.spotCents, 2)} snt/kWh)`;

            const elAvg = document.getElementById('kpi-today-avg');
            const elAvgSub = document.getElementById('kpi-today-avg-sub');
            if (elAvg) elAvg.textContent = `${formatNum(avgTotal, 2)} snt/kWh`;
            if (elAvgSub) elAvgSub.textContent = `Spot-keskiarvo ${formatNum(avgSpot, 2)} snt/kWh | Kallein klo ${String(maxByTotal.slot.hour).padStart(2, '0')}:00 (${formatNum(maxByTotal.br.totalCents, 2)} snt)`;
        }

        // Huomisen / 5 vrk ennusteen tilasto
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
                elTomTitle.textContent = tomorrowObj.allForecast ? 'Huomisen hintaennuste' : 'Huomisen vahvistettu hinta';
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
            const badge = d.allForecast ? '<span class="tab-tag forecast">Ennuste</span>' : '<span class="tab-tag official">Virallinen</span>';
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

        // Jos 7 vrk yleiskatsaus on valittuna, näytetään päiväkohtainen yhteenveto + 7 vrk tuntipalkit
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

            // Taulukossa näytetään 7 vuorokauden päiväkohtaiset keskiarvot, min/max, tuulivoima ja lämpötila
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
                        <td><span class="status-pill ${d.allForecast ? 'forecast' : 'official'}">${d.allForecast ? 'Ennuste (tuuli + sää)' : 'Virallinen Nord Pool'}</span></td>
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

        // Yksittäisen vuorokauden 24 tunnin tarkka pylväskaavio
        const dayObj = state.daysList.find(d => d.index === state.selectedDayIndex) || state.daysList[0];
        if (!dayObj) return;

        if (chartTitle) {
            chartTitle.textContent = `${dayObj.label} — ${dayObj.allForecast ? 'Ennustettu tuntihinta (perustuu tuulivoima- ja lämpötilaennusteeseen)' : 'Vahvistettu tuntihinta ja siirtoerittely'}`;
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

        // Tuntikohtainen taulukko
        let rowsHtml = '';
        for (const x of enriched) {
            const isNow = x.slot.epochMs === nowHourMs;
            const rangeText = x.slot.isForecast
                ? `<span class="muted-range">(${formatNum(x.slot.minInclVat, 1)}–${formatNum(x.slot.maxInclVat, 1)})</span>`
                : '';
            rowsHtml += `
                <tr class="${isNow ? 'row-current-hour' : ''}">
                    <td><strong>Klo ${String(x.slot.hour).padStart(2, '0')}:00–${String((x.slot.hour + 1) % 24).padStart(2, '0')}:00</strong> ${isNow ? '<span class="now-badge">Nyt</span>' : ''}</td>
                    <td><span class="status-pill ${x.slot.isForecast ? 'forecast' : 'official'}">${x.slot.isForecast ? 'Ennuste' : 'Virallinen'}</span></td>
                    <td><strong>${formatNum(x.br.spotCents, 2)} snt/kWh</strong> ${rangeText}</td>
                    <td>${formatNum(x.br.transferCents + x.br.taxCents + x.br.marginCents, 2)} snt/kWh <span class="muted-range">(${x.br.transferLabel})</span></td>
                    <td><strong>${formatNum(x.br.totalCents, 2)} snt/kWh</strong></td>
                    <td>${x.slot.windMw} MW / ${formatNum(x.slot.tempC, 1)} °C</td>
                </tr>
            `;
        }
        tableBody.innerHTML = rowsHtml;
    }

    // Halvimmat peräkkäiset tunnit -laskuri (huomioi sekä spot-hinnan että yösiirron tippumisen klo 22:00!)
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
                avgTransferAndTax,
                hasForecast: slice.some(s => s.isForecast)
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

    // Vuosikulutus- ja siirtotuotevertailu (Yleissiirto vs. Yösiirto vs. Kausisiirto postinumeron verkkoyhtiöllä)
    function renderAnnualTransferComparison() {
        const dso = getActiveDso();
        const container = document.getElementById('annual-comparison-result');
        if (!container || !dso) return;

        const kwh = Math.max(500, state.annualKwh);
        const nightShare = Math.max(0, Math.min(100, state.nightSharePct)) / 100.0;
        const dayShare = 1.0 - nightShare;

        // Keskimääräinen spot-hinta sarjasta
        const avgSpot = state.series.length > 0
            ? state.series.reduce((a, b) => a + (state.includeVat ? b.priceInclVat : b.priceVat0), 0) / state.series.length
            : 5.20;
        const taxC = state.includeVat ? DSO_DATA.electricityTaxInclVat : DSO_DATA.electricityTaxVat0;
        const vatFactor = state.includeVat ? 1.0 : (1.0 / DSO_DATA.vatRate);
        const marginC = state.marginCents * vatFactor;

        const energyAndMarginEur = ((avgSpot + marginC) * kwh) / 100.0;
        const taxEur = (taxC * kwh) / 100.0;

        // 1. Yleissiirto
        const genTransferEur = ((dso.general_c_kwh * vatFactor) * kwh) / 100.0 + (dso.general_base_eur * vatFactor * 12);
        const genTotalEur = energyAndMarginEur + taxEur + genTransferEur;

        // 2. Yö-/aikasiirto
        const timeAvgC = (dso.day_c_kwh * dayShare + dso.night_c_kwh * nightShare) * vatFactor;
        const timeTransferEur = (timeAvgC * kwh) / 100.0 + (dso.time_base_eur * vatFactor * 12);
        const timeTotalEur = energyAndMarginEur + taxEur + timeTransferEur;

        // 3. Kausisiirto (talviarkipäivän osuus on tyypillisesti n. 70 % päiväkulutuksesta talvikuukausina = n. 32 % vuosikulutuksesta, tai riippuu yöosuudesta)
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
        // Alustetaan postinumeron oletustiedot
        const initRes = resolvePostalOrCity(state.postalCode);
        if (initRes && !document.body.getAttribute('data-preset-dso')) {
            state.cityName = initRes.city;
            state.dsoId = initRes.dsoId;
            state.altDsoIds = initRes.alt || [];
        }
        bindEvents();
        renderDsoPanel();
        loadSpotAndForecastData();
    });
})();
