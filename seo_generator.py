# -*- coding: utf-8 -*-
"""
Ohjelmallinen SEO- ja sivustogeneraattori: Sähkömittari — Nord Pool FI, oppiva 7 vrk ennustemalli ja postinumeropohjainen siirtohintalaskuri.
"""

import html
import json
import os
import re
from datetime import datetime, timezone
from dso_data import (
    DSO_COMPANIES,
    MUNICIPALITIES,
    ELECTRICITY_TAX_INCL_VAT,
    export_dso_js,
)

SITE_URL = "https://xn--shkmittari-q5a2t.fi"
SITE_NAME = "Sähkömittari — Pörssisähkö & Siirtohintalaskuri"


def slugify(text: str) -> str:
    s = (text or "").lower().strip()
    s = s.replace("ä", "a").replace("ö", "o").replace("å", "a")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "index"


def fmt_c(val: float) -> str:
    return f"{val:.2f}".replace(".", ",")


def render_header(prefix: str = "") -> str:
    return f"""    <div class="telemetry-bar">
        <div class="telemetry-inner">
            <div class="telemetry-items">
                <span class="telemetry-item"><span class="telemetry-status-dot"></span>MARKKINA-ALUE: <strong>FI (NORD POOL)</strong></span>
                <span class="telemetry-item">SPOT NYT: <strong id="tel-spot">— snt/kWh</strong></span>
                <span class="telemetry-item">SIIRTO + VERO: <strong id="tel-transfer">— snt/kWh</strong></span>
                <span class="telemetry-item">TUULIVOIMA: <strong id="tel-wind">— MW</strong></span>
            </div>
            <div>AIKAVYÖHYKE: EUROPE/HELSINKI (ALV 25,5 %)</div>
        </div>
    </div>
    <header class="site-header">
        <div class="header-inner">
            <a href="{prefix}index.html" class="brand-link">
                <span class="brand-title"><img src="{prefix}favicon.svg?v=30" alt="" width="24" height="24" style="vertical-align:-5px; margin-right:8px;">Sähkömittari.fi</span>
                <span class="brand-subtitle">Pörssisähkön spot-hinta, tarkentuva 7 vrk hintaennuste ja todellinen siirtohinta postinumerolla</span>
            </a>
            <nav class="main-nav" aria-label="Päävalikko">
                <a href="{prefix}index.html">Spot-kaavio</a>
                <a href="{prefix}index.html#tuntitaulukko">Tuntitaulukko</a>
                <a href="{prefix}index.html#siirtohintalaskuri">Siirtohintalaskuri</a>
                <a href="{prefix}index.html#optimoija">Kuorman ajoitus</a>
                <a href="{prefix}verkkoyhtiot/index.html">Jakeluverkkoyhtiöt</a>
                <a href="{prefix}paikkakunnat/index.html">Postinumerot &amp; Kunnat</a>
            </nav>
        </div>
    </header>"""


def render_footer(prefix: str = "") -> str:
    return f"""    <footer class="site-footer">
        <div class="footer-inner">
            <div>
                <strong style="color:#ffffff;">{SITE_NAME}</strong>
                <p style="margin-top:6px; max-width:580px;">
                    Tekninen pörssisähkön ja sähkönsiirron laskentatyökalu. Yhdistää Nord Pool FI -spot-tuntihinnat, Suomen tuulipuistojen (8 450 MW) ja lämpötilan historialliseen regressiomalliin sekä 33 paikallisen jakeluverkkoyhtiön siirtotariffit ja sähköveron.
                </p>
            </div>
            <div class="footer-links">
                <a href="{prefix}index.html">Etusivu</a>
                <a href="{prefix}verkkoyhtiot/index.html">Sähköverkkoyhtiöt</a>
                <a href="{prefix}paikkakunnat/index.html">Kunnat &amp; Postinumerot</a>
                <a href="{prefix}oppaat/porssisahko-ennuste-7-vrk-tuulivoima-ja-lampotila.html">Ennustemalli</a>
                <a href="{prefix}oppaat/sahkon-siirtohinta-postinumerolla-kaikki-verkkoyhtiot.html">Siirtohinnat</a>
                <a href="{prefix}oppaat/yleissiirto-yosiirto-vai-kausisiirto-vertailu.html">Siirtotuotteiden vertailu</a>
            </div>
        </div>
    </footer>"""


def render_interactive_dashboard_block(
    prefix: str,
    h1_text: str,
    lead_text: str,
    default_postal: str = "00100",
) -> str:
    return f"""        <div class="first-screen-stage">
            <section class="hero-chart-box">
                <div id="day-tabs" class="day-tabs"></div>

                <div class="panel-body" style="padding:10px 14px; border-bottom:var(--border-heavy);">
                    <div id="chart-readout-strip" class="chart-readout-strip" style="margin-bottom:8px;">
                        Vie hiiri tuntipylvään päälle nähdäksesi tunnin hinnan ja todennäköisen vaihteluvälin.
                    </div>

                    <div class="chart-legend" style="padding-top:4px;">
                        <span class="legend-item"><span class="legend-swatch" style="background:#009e3d;"></span> Edullinen (&lt; 3 snt/kWh)</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#0038ff;"></span> Normaali (3–8 snt/kWh)</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ff3b00;"></span> Korkea (&gt; 8 snt/kWh)</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ffd000;"></span> Ennusteen vaihteluväli (min–max snt/kWh)</span>
                        <h1 id="chart-view-title" style="font-family:var(--mono); font-size:11.5px; font-weight:700; text-transform:uppercase; margin-left:auto;">Pörssisähkön tuntihinta ja 7 vrk ennuste</h1>
                    </div>
                </div>

                <div class="scroll-down-bar" style="margin-top:0; border:none; border-bottom:var(--border-heavy);">
                    <span>Vieritä alas: tuntikohtainen hintataulukko, postinumeron siirtohintalaskuri ja kuorman ajoitus</span>
                    <div class="scroll-down-links">
                        <a href="#tuntitaulukko">Tuntitaulukko</a>
                        <a href="#siirtohintalaskuri">Siirtohintalaskuri</a>
                        <a href="#optimoija">Kuorman ajoitus (36 h)</a>
                    </div>
                </div>

                <div class="svg-chart-wrapper">
                    <button type="button" id="chart-prev-day" class="chart-edge-arrow chart-edge-prev" aria-label="Edellinen päivä">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div id="chart-floating-tooltip" class="chart-floating-tooltip" aria-live="polite"></div>
                    <div id="price-chart" class="svg-chart-container" style="border:none; padding:12px 8px 6px;">
                        Ladataan pörssisähkökaaviota...
                    </div>
                    <button type="button" id="chart-next-day" class="chart-edge-arrow chart-edge-next" aria-label="Seuraava päivä">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
            </section>

            <div id="first-screen-summary-strip" class="first-screen-summary-strip" aria-live="polite"></div>
        </div>

        <div class="below-fold-section">
            <section class="panel-box" id="tuntitaulukko">
                <div class="panel-head">
                    <h2>Tuntikohtainen hinta-arvio ja todennäköinen vaihteluväli</h2>
                </div>
                <div class="panel-body">
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Kellonaika</th>
                                    <th>Pörssisähkö (arvio / hinta)</th>
                                    <th>Todennäköinen vaihteluväli</th>
                                    <th>Kokonaishinta siirtoineen</th>
                                    <th>Tuulivoima ja lämpötila</th>
                                </tr>
                            </thead>
                            <tbody id="hourly-table-body">
                                <tr><td colspan="5">Haetaan tuntikohtaista hintataulukkoa...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="instrument-strip" id="siirtohintalaskuri">
                <div class="instrument-strip-top">
                    <h2 id="transfer-calc-heading">Pörssisähkön spot-hinta, 7 vrk ennuste ja siirtohintalaskuri postinumerolla</h2>
                    <p id="transfer-calc-lead">Syötä postinumerosi tai paikkakuntasi alla olevaan kenttään, niin laskuri tunnistaa automaattisesti paikallisen sähköverkkoyhtiön ja laskee sähkön todellisen kokonaishinnan.</p>
                </div>

                <div class="control-matrix">
                    <form id="postal-search-form" class="control-cell" onsubmit="return false;">
                        <label for="postal-input" class="field-label">Postinumero tai kunta</label>
                        <div class="postal-input-group">
                            <input type="text" id="postal-input" class="input-control" value="" placeholder="Syötä postinumero, esim. 00100, 33100...">
                            <button type="submit" class="btn-primary">Aseta</button>
                        </div>
                    </form>

                    <div class="control-cell">
                        <span class="field-label">Verkkoyhtiön siirtotariffi</span>
                        <div class="seg-group">
                            <button type="button" class="seg-btn active" data-tariff-btn="general">Yleissiirto</button>
                            <button type="button" class="seg-btn" data-tariff-btn="time">Yösiirto (07–22 / 22–07)</button>
                            <button type="button" class="seg-btn" data-tariff-btn="season">Kausisiirto</button>
                        </div>
                    </div>

                    <div class="control-cell">
                        <label for="margin-input" class="field-label">Myyjän marginaali (snt/kWh)</label>
                        <input type="number" id="margin-input" class="input-control" step="0.01" min="0" max="3" value="0.45">
                    </div>

                    <div class="control-cell">
                        <label for="vat-select" class="field-label">Arvonlisäverokanta</label>
                        <select id="vat-select" class="select-control">
                            <option value="1" selected>Sis. ALV 25,5 %</option>
                            <option value="0">Veroton (ALV 0 %)</option>
                        </select>
                    </div>
                </div>

                <div id="detected-dso-banner" class="detected-dso-banner">
                    Haetaan postinumeron jakeluverkkoyhtiötä...
                </div>
            </section>

            <div class="desk-grid">
                <section class="panel-box">
                    <div class="panel-head">
                        <h2>PISTORASIAHINNAN ERITTELY NYT</h2>
                    </div>
                    <div class="panel-body" id="receipt-ledger-body">
                        Lasketaan tuntihintaa...
                    </div>
                </section>

                <section class="panel-box" id="optimoija">
                    <div class="panel-head">
                        <h2>KUORMAN AJOITUSLASKURI (36 H)</h2>
                    </div>
                    <div class="panel-body">
                        <p style="font-size:12.5px; color:var(--ink-secondary); margin-bottom:10px;">
                            Etsii edullisimman yhtäjaksoisen käyttöajan yhdistämällä pörssisähkön spot-hinnan ja kello 22:00 alkavan edullisemman yösiirron.
                        </p>
                        <div class="preset-pills">
                            <button type="button" class="preset-pill" data-preset-kw="11" data-preset-hrs="4">Sähköauto 11 kW (4 h)</button>
                            <button type="button" class="preset-pill" data-preset-kw="3.6" data-preset-hrs="6">Hybridi 3,6 kW (6 h)</button>
                            <button type="button" class="preset-pill" data-preset-kw="3" data-preset-hrs="3">Varaaja 3 kW (3 h)</button>
                            <button type="button" class="preset-pill" data-preset-kw="8" data-preset-hrs="1">Kiuas 8 kW (1 h)</button>
                            <button type="button" class="preset-pill" data-preset-kw="2" data-preset-hrs="2">Pesukone 2 kW (2 h)</button>
                        </div>

                        <div class="opt-controls-row">
                            <div style="flex:1; min-width:180px;">
                                <span class="field-label">Käyttöjakson kesto</span>
                                <div class="seg-group">
                                    <button type="button" class="seg-btn" data-win-hours="1">1h</button>
                                    <button type="button" class="seg-btn" data-win-hours="2">2h</button>
                                    <button type="button" class="seg-btn active" data-win-hours="3">3h</button>
                                    <button type="button" class="seg-btn" data-win-hours="4">4h</button>
                                    <button type="button" class="seg-btn" data-win-hours="6">6h</button>
                                    <button type="button" class="seg-btn" data-win-hours="8">8h</button>
                                </div>
                            </div>
                            <div style="width:110px;">
                                <label for="appliance-kw-input" class="field-label">Teho (kW)</label>
                                <input type="number" id="appliance-kw-input" class="input-control" step="0.1" min="0.1" max="50" value="11">
                            </div>
                        </div>

                        <div id="cheapest-window-result"></div>
                    </div>
                </section>
            </div>

            <section class="panel-box" id="vuosivertailu">
                <div class="panel-head">
                    <h2>SIIRTOSOPIMUKSEN VALINTALASKURI: YLEISSIIRTO, YÖSIIRTO VAI KAUSISIIRTO POSTINUMEROLLESI</h2>
                </div>
                <div class="panel-body">
                    <div class="opt-controls-row">
                        <div style="width:240px;">
                            <label for="annual-kwh-input" class="field-label">Vuosikulutus (kWh / vuosi)</label>
                            <input type="number" id="annual-kwh-input" class="input-control" step="500" min="1000" max="60000" value="12000">
                        </div>
                        <div style="flex:1; min-width:240px;">
                            <label for="night-share-input" class="field-label">Yöajan (klo 22–07) osuus kulutuksesta: <span id="night-share-label">55 %</span></label>
                            <input type="range" id="night-share-input" style="width:100%; margin-top:8px;" min="10" max="90" step="5" value="55">
                        </div>
                    </div>
                    <div id="annual-comparison-result" class="comp-grid"></div>
                </div>
            </section>

            <section class="panel-box" id="local-dso-info-panel">
                <div class="panel-head">
                    <h2 id="local-dso-info-heading">SÄHKÖNSIIRTO JA PAIKALLINEN JAKELUVERKKOYHTIÖ</h2>
                </div>
                <div class="panel-body" id="local-dso-info-body">
                    <p>
                        Kun syötät käyttöpaikan postinumeron tai paikkakunnan yllä olevaan siirtohintalaskuriin, ohjelma hakee automaattisesti alueesi ensisijaisen jakeluverkkoyhtiön sekä voimassa olevat yleissiirron, yösiirron ja sähköveron tiedot.
                    </p>
                </div>
            </section>
        </div>"""


def build_index_page() -> str:
    dso_rows = []
    for comp in sorted(DSO_COMPANIES.values(), key=lambda x: x["general_c_kwh"]):
        slug = slugify(comp["short_name"])
        total_with_tax = comp["general_c_kwh"] + ELECTRICITY_TAX_INCL_VAT
        dso_rows.append(
            f"""                        <tr>
                            <td><a href="verkkoyhtiot/{slug}.html"><strong>{html.escape(comp["name"])}</strong></a><br><span class="muted-range">{html.escape(comp["region_desc"])}</span></td>
                            <td><strong>{fmt_c(comp["general_c_kwh"])} snt/kWh</strong></td>
                            <td>{fmt_c(comp["day_c_kwh"])} / {fmt_c(comp["night_c_kwh"])} snt/kWh</td>
                            <td>{fmt_c(comp["general_base_eur"])} €/kk</td>
                            <td><strong>{fmt_c(total_with_tax)} snt/kWh</strong> + spot</td>
                        </tr>"""
        )

    muni_pills = []
    for m in sorted(MUNICIPALITIES, key=lambda x: x["name"]):
        mslug = slugify(m["name"])
        dso_short = DSO_COMPANIES[m["primary"]]["short_name"]
        muni_pills.append(
            f'<a href="paikkakunnat/{mslug}.html" class="dir-pill"><span>{html.escape(m["name"])} ({m["postal"]})</span><span class="dir-pill-sub">{html.escape(dso_short)}</span></a>'
        )

    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": "Miten pörssisähkön 7 vuorokauden hintaennuste lasketaan?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Ennustemalli on opetettu Suomen toteutuneiden Nord Pool FI -spot-hintojen, tuulivoima-alueiden 100 metrin tuulennopeuksien ja lämpötilojen historiallisella aikasarjalla. Se päivittää painokertoimiaan jatkuvasti uusien havaintojen perusteella.",
                },
            },
            {
                "@type": "Question",
                "name": "Miten postinumero vaikuttaa pörssisähkön kokonaishintaan?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Suomessa paikallinen jakeluverkkoyhtiö määräytyy käyttöpaikan postinumeron mukaan. Todellinen kokonaishinta on pörssisähkön spot-hinta + myyjän marginaali + paikallisen sähköverkkoyhtiön siirtomaksu + sähkövero (2,83 snt/kWh sis. ALV 25,5 %).",
                },
            },
        ],
    }

    dashboard_html = render_interactive_dashboard_block(
        prefix="",
        h1_text="Pörssisähkön spot-hinta, 7 vrk ennuste ja siirtohintalaskuri postinumerolla",
        lead_text="Syötä postinumerosi laskeaksesi sähkön todellisen pistorasiahinnan (Spot + paikallinen jakeluverkko + sähkövero 2,83 snt/kWh) sekä tuulivoima- ja lämpötilahistoriasta opitun 7 vuorokauden tuntiennusteen.",
        default_postal="00100",
    )

    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sähkömittari — Pörssisähkö nyt, 7 vrk Ennuste &amp; Siirtohintalaskuri Postinumerolla</title>
    <meta name="description" content="Tarkista pörssisähkön spot-hinta tänään, huomenna ja 7 vrk hintaennuste. Syötä postinumero, niin laskuri hakee automaattisesti sähköverkkoyhtiösi siirtohinnan (Caruna, Elenia, Helen, Vantaa, Tampere, Oulu ym.) ja laskee todellisen kokonaishinnan.">
    <meta name="geo.region" content="FI">
    <meta name="content-language" content="fi-FI">
    <link rel="canonical" href="{SITE_URL}/" />
    <link rel="icon" type="image/svg+xml" href="favicon.svg?v=30">
    <link rel="icon" type="image/x-icon" href="favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
    <link rel="manifest" href="site.webmanifest">
    <link rel="stylesheet" href="styles.css?v=30">
    <script type="application/ld+json">
{json.dumps(faq_schema, ensure_ascii=False, indent=2)}
    </script>
</head>
<body>
{render_header("")}

    <main class="container">
{dashboard_html}

        <section class="panel-box">
            <div class="panel-head">
                <h2>SUOMEN SÄHKÖVERKKOYHTIÖIDEN SIIRTOHINNAT 2026 (EDULLISIMMASTA KALLEIMPAAN)</h2>
            </div>
            <div class="panel-body">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Sähköverkkoyhtiö ja toiminta-alue</th>
                                <th>Yleissiirto</th>
                                <th>Yösiirto (Päivä / Yö)</th>
                                <th>Perusmaksu (3x25A)</th>
                                <th>Siirto + Sähkövero yht.</th>
                            </tr>
                        </thead>
                        <tbody>
{chr(10).join(dso_rows)}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section class="panel-box">
            <div class="panel-head">
                <h2>MENETELMÄOPPAAT JA TAUSTA-ANALYYSI</h2>
            </div>
            <div class="panel-body">
                <div class="directory-grid">
                    <a href="oppaat/porssisahko-ennuste-7-vrk-tuulivoima-ja-lampotila.html" class="dir-pill">
                        <span>Miten 7 vrk pörssisähköennuste toimii?</span>
                    </a>
                    <a href="oppaat/sahkon-siirtohinta-postinumerolla-kaikki-verkkoyhtiot.html" class="dir-pill">
                        <span>Sähkön siirtohinta postinumerolla</span>
                    </a>
                    <a href="oppaat/yleissiirto-yosiirto-vai-kausisiirto-vertailu.html" class="dir-pill">
                        <span>Yleissiirto, yösiirto vai kausisiirto?</span>
                    </a>
                    <a href="oppaat/sahkoauton-lataus-ja-lamminvesivaraaja-porssisahkolla.html" class="dir-pill">
                        <span>Sähköauton ja varaajan optimointi</span>
                    </a>
                </div>
            </div>
        </section>
    </main>

{render_footer("")}
    <script src="dso_data.js"></script>
    <script src="ml_weights.js"></script>
    <script src="nordpool_models.js"></script>
    <script src="app.js?v=30"></script>
</body>
</html>
"""


def build_dso_page(comp: dict) -> str:
    slug = slugify(comp["short_name"])
    munis_in_dso = [
        m for m in MUNICIPALITIES if m["primary"] == comp["id"] or comp["id"] in (m.get("alt") or [])
    ]
    sample_postal = munis_in_dso[0]["postal"] if munis_in_dso else "00100"
    sample_city = munis_in_dso[0]["name"] if munis_in_dso else comp["region_desc"]
    total_fixed_gen = comp["general_c_kwh"] + ELECTRICITY_TAX_INCL_VAT
    total_fixed_night = comp["night_c_kwh"] + ELECTRICITY_TAX_INCL_VAT

    muni_links = "".join(
        f'<a href="../paikkakunnat/{slugify(m["name"])}.html" class="dir-pill"><span>{html.escape(m["name"])} ({m["postal"]})</span><span class="dir-pill-sub">{m["postal_range"]}</span></a>'
        for m in munis_in_dso
    )

    dashboard_html = render_interactive_dashboard_block(
        prefix="../",
        h1_text=f"{comp['name']} — Siirtohinta, pörssisähkön kokonaishinta ja 7 vrk ennuste",
        lead_text=f"Toiminta-alue: {comp['region_desc']}. Yleissiirto {fmt_c(comp['general_c_kwh'])} snt/kWh (veron kanssa {fmt_c(total_fixed_gen)} snt/kWh) ja yösiirron yöhinta klo 22–07 {fmt_c(comp['night_c_kwh'])} snt/kWh (veron kanssa {fmt_c(total_fixed_night)} snt/kWh).",
        default_postal=sample_postal,
    )

    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(comp['name'])} Siirtohinta 2026 &amp; Pörssisähkön Kokonaishintalaskuri</title>
    <meta name="description" content="Katso {html.escape(comp['name'])} yleissiirto ({fmt_c(comp['general_c_kwh'])} snt/kWh), yösiirto ({fmt_c(comp['day_c_kwh'])} / {fmt_c(comp['night_c_kwh'])} snt/kWh), perusmaksut ja pörssisähkön reaaliaikainen kokonaishinta sekä 7 vrk ennuste.">
    <link rel="canonical" href="{SITE_URL}/verkkoyhtiot/{slug}.html" />
    <meta name="geo.region" content="FI">
    <meta name="content-language" content="fi-FI">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg?v=30">
    <link rel="icon" type="image/x-icon" href="../favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="../apple-touch-icon.png">
    <link rel="manifest" href="../site.webmanifest">
    <link rel="stylesheet" href="../styles.css?v=30">
</head>
<body data-preset-dso="{comp['id']}" data-preset-postal="{sample_postal}" data-preset-city="{html.escape(sample_city)}">
{render_header("../")}

    <main class="container">
{dashboard_html}

        <section class="panel-box">
            <div class="panel-head">
                <h2>{html.escape(comp['name']).upper()} — SIIRTOHINNASTO JA KIINTEÄT MAKSUT (SIS. ALV 25,5 %)</h2>
            </div>
            <div class="panel-body">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Siirtotuote</th>
                                <th>Energiamaksu (snt/kWh)</th>
                                <th>Sähkövero (luokka I)</th>
                                <th>Siirto + vero yhteensä</th>
                                <th>Perusmaksu (3x25A)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Yleissiirto</strong></td>
                                <td>{fmt_c(comp['general_c_kwh'])} snt/kWh</td>
                                <td>{fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh</td>
                                <td><strong>{fmt_c(comp['general_c_kwh'] + ELECTRICITY_TAX_INCL_VAT)} snt/kWh</strong></td>
                                <td>{fmt_c(comp['general_base_eur'])} €/kk</td>
                            </tr>
                            <tr>
                                <td><strong>Yösiirto — Päivä (klo 07–22)</strong></td>
                                <td>{fmt_c(comp['day_c_kwh'])} snt/kWh</td>
                                <td>{fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh</td>
                                <td><strong>{fmt_c(comp['day_c_kwh'] + ELECTRICITY_TAX_INCL_VAT)} snt/kWh</strong></td>
                                <td>{fmt_c(comp['time_base_eur'])} €/kk</td>
                            </tr>
                            <tr>
                                <td><strong>Yösiirto — Yö (klo 22–07)</strong></td>
                                <td>{fmt_c(comp['night_c_kwh'])} snt/kWh</td>
                                <td>{fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh</td>
                                <td><strong>{fmt_c(comp['night_c_kwh'] + ELECTRICITY_TAX_INCL_VAT)} snt/kWh</strong></td>
                                <td>{fmt_c(comp['time_base_eur'])} €/kk</td>
                            </tr>
                            <tr>
                                <td><strong>Kausisiirto — Talviarkipäivä</strong></td>
                                <td>{fmt_c(comp['winter_day_c_kwh'])} snt/kWh</td>
                                <td>{fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh</td>
                                <td><strong>{fmt_c(comp['winter_day_c_kwh'] + ELECTRICITY_TAX_INCL_VAT)} snt/kWh</strong></td>
                                <td>{fmt_c(comp['season_base_eur'])} €/kk</td>
                            </tr>
                            <tr>
                                <td><strong>Kausisiirto — Muu aika</strong></td>
                                <td>{fmt_c(comp['other_c_kwh'])} snt/kWh</td>
                                <td>{fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh</td>
                                <td><strong>{fmt_c(comp['other_c_kwh'] + ELECTRICITY_TAX_INCL_VAT)} snt/kWh</strong></td>
                                <td>{fmt_c(comp['season_base_eur'])} €/kk</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </section>

        <section class="panel-box">
            <div class="panel-head">
                <h2>PAIKKAKUNNAT JA POSTINUMEROALUEET: {html.escape(comp['short_name']).upper()}</h2>
            </div>
            <div class="panel-body">
                <div class="directory-grid">
                    {muni_links or '<p>Katso kaikki kunnat paikkakuntahakemistosta.</p>'}
                </div>
            </div>
        </section>
    </main>

{render_footer("../")}
    <script src="../dso_data.js"></script>
    <script src="../ml_weights.js"></script>
    <script src="../nordpool_models.js"></script>
    <script src="../app.js?v=30"></script>
</body>
</html>
"""


def build_municipality_page(m: dict) -> str:
    mslug = slugify(m["name"])
    comp = DSO_COMPANIES[m["primary"]]
    alt_names = [DSO_COMPANIES[a]["name"] for a in (m.get("alt") or []) if a in DSO_COMPANIES]
    alt_sentence = (
        f" Kunnan reuna- tai haja-asutusalueilla verkosta vastaa osittain myös {', '.join(alt_names)}."
        if alt_names
        else ""
    )
    total_fixed = comp["general_c_kwh"] + ELECTRICITY_TAX_INCL_VAT

    dashboard_html = render_interactive_dashboard_block(
        prefix="../",
        h1_text=f"Pörssisähkö ja sähkön siirtohinta {m['name']} ({m['postal_range']})",
        lead_text=f"Paikkakunnalla {m['name']} ({m['region']}) ensisijainen jakeluverkkoyhtiö on {comp['name']}.{alt_sentence} Yleissiirron ja sähköveron kiinteä osuus on yhteensä {fmt_c(total_fixed)} snt/kWh pörssisähkön spot-hinnan päälle.",
        default_postal=m["postal"],
    )

    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pörssisähkö &amp; Sähkön Siirtohinta {html.escape(m['name'])} ({m['postal']}) | {html.escape(comp['short_name'])}</title>
    <meta name="description" content="Paljonko pörssisähkö maksaa siirtohinnan kanssa paikkakunnalla {html.escape(m['name'])} ({m['postal_range']})? Verkkoyhtiö: {html.escape(comp['name'])}, yleissiirto {fmt_c(comp['general_c_kwh'])} snt/kWh + sähkövero {fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh. Katso tuntihinnat ja 7 vrk ennuste.">
    <link rel="canonical" href="{SITE_URL}/paikkakunnat/{mslug}.html" />
    <meta name="geo.region" content="FI">
    <meta name="content-language" content="fi-FI">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg?v=30">
    <link rel="icon" type="image/x-icon" href="../favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="../apple-touch-icon.png">
    <link rel="manifest" href="../site.webmanifest">
    <link rel="stylesheet" href="../styles.css?v=30">
</head>
<body data-preset-dso="{comp['id']}" data-preset-postal="{m['postal']}" data-preset-city="{html.escape(m['name'])}">
{render_header("../")}

    <main class="container">
{dashboard_html}
    </main>

{render_footer("../")}
    <script src="../dso_data.js"></script>
    <script src="../ml_weights.js"></script>
    <script src="../nordpool_models.js"></script>
    <script src="../app.js?v=30"></script>
</body>
</html>
"""


def build_directory_page(title: str, lead: str, cards_html: str, canonical_path: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(title)} | {SITE_NAME}</title>
    <meta name="description" content="{html.escape(lead)}">
    <link rel="canonical" href="{SITE_URL}/{canonical_path}" />
    <meta name="geo.region" content="FI">
    <meta name="content-language" content="fi-FI">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg?v=30">
    <link rel="icon" type="image/x-icon" href="../favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="../apple-touch-icon.png">
    <link rel="manifest" href="../site.webmanifest">
    <link rel="stylesheet" href="../styles.css?v=30">
</head>
<body>
{render_header("../")}
    <main class="container">
        <section class="panel-box">
            <div class="panel-head">
                <h1>{html.escape(title)}</h1>
            </div>
            <div class="panel-body">
                <p style="margin-bottom:14px; color:#4a4f4a;">{html.escape(lead)}</p>
                <div class="directory-grid">
                    {cards_html}
                </div>
            </div>
        </section>
    </main>
{render_footer("../")}
</body>
</html>
"""


def build_guide_page(slug: str, title: str, meta_desc: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(title)} | {SITE_NAME}</title>
    <meta name="description" content="{html.escape(meta_desc)}">
    <link rel="canonical" href="{SITE_URL}/oppaat/{slug}.html" />
    <meta name="geo.region" content="FI">
    <meta name="content-language" content="fi-FI">
    <link rel="icon" type="image/svg+xml" href="../favicon.svg?v=30">
    <link rel="icon" type="image/x-icon" href="../favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="../apple-touch-icon.png">
    <link rel="manifest" href="../site.webmanifest">
    <link rel="stylesheet" href="../styles.css?v=30">
</head>
<body>
{render_header("../")}
    <main class="container">
        <article class="panel-box">
            <div class="panel-head">
                <h1>{html.escape(title)}</h1>
            </div>
            <div class="panel-body" style="max-width:860px; font-size:15px; line-height:1.75;">
                <p style="font-weight:600; margin-bottom:16px;">{html.escape(meta_desc)}</p>
                {body_html}
                <div style="margin-top:24px; padding-top:16px; border-top:1px solid #cbc7ba;">
                    <a href="../index.html" class="btn-primary" style="display:inline-block; text-decoration:none;">Avaa pörssisähkö- ja siirtohintalaskuri</a>
                </div>
            </div>
        </article>
    </main>
{render_footer("../")}
</body>
</html>
"""


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    export_dso_js(os.path.join(base_dir, "dso_data.js"))

    os.makedirs(os.path.join(base_dir, "verkkoyhtiot"), exist_ok=True)
    os.makedirs(os.path.join(base_dir, "paikkakunnat"), exist_ok=True)
    os.makedirs(os.path.join(base_dir, "oppaat"), exist_ok=True)

    urls = [f"{SITE_URL}/"]

    with open(os.path.join(base_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_index_page())

    dso_pills = []
    for comp in sorted(DSO_COMPANIES.values(), key=lambda x: x["name"]):
        cslug = slugify(comp["short_name"])
        out_path = os.path.join(base_dir, "verkkoyhtiot", f"{cslug}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(build_dso_page(comp))
        urls.append(f"{SITE_URL}/verkkoyhtiot/{cslug}.html")
        dso_pills.append(
            f'<a href="{cslug}.html" class="dir-pill"><span>{html.escape(comp["short_name"])}</span><span class="dir-pill-sub">{fmt_c(comp["general_c_kwh"])} snt/kWh</span></a>'
        )

    with open(os.path.join(base_dir, "verkkoyhtiot", "index.html"), "w", encoding="utf-8") as f:
        f.write(
            build_directory_page(
                "Suomen sähköverkkoyhtiöt ja siirtohinnat 2026",
                "Valitse oma paikallinen jakeluverkkoyhtiösi tarkistaaksesi yleissiirron, yösiirron ja kausisiirron hinnat sekä pörssisähkön reaaliaikaisen kokonaishinnan.",
                "\n".join(dso_pills),
                "verkkoyhtiot/index.html",
            )
        )
    urls.append(f"{SITE_URL}/verkkoyhtiot/index.html")

    muni_pills = []
    for m in sorted(MUNICIPALITIES, key=lambda x: x["name"]):
        mslug = slugify(m["name"])
        out_path = os.path.join(base_dir, "paikkakunnat", f"{mslug}.html")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(build_municipality_page(m))
        urls.append(f"{SITE_URL}/paikkakunnat/{mslug}.html")
        dso_short = DSO_COMPANIES[m["primary"]]["short_name"]
        muni_pills.append(
            f'<a href="{mslug}.html" class="dir-pill"><span>{html.escape(m["name"])} ({m["postal"]})</span><span class="dir-pill-sub">{html.escape(dso_short)}</span></a>'
        )

    with open(os.path.join(base_dir, "paikkakunnat", "index.html"), "w", encoding="utf-8") as f:
        f.write(
            build_directory_page(
                "Sähkön siirtohinta ja pörssisähkö paikkakunnittain ja postinumeroittain",
                "Valitse kuntasi tai etsi postinumerolla nähdäksesi paikallisen sähköverkkoyhtiön ja pörssisähkön kokonaishinnan.",
                "\n".join(muni_pills),
                "paikkakunnat/index.html",
            )
        )
    urls.append(f"{SITE_URL}/paikkakunnat/index.html")

    guides = [
        (
            "porssisahko-ennuste-7-vrk-tuulivoima-ja-lampotila",
            "Miten pörssisähkön 7 vuorokauden oppiva hintaennuste toimii?",
            "Katsaus siihen, miten Suomen 8 450 MW tuulivoimakapasiteetti, 100 metrin tuulennopeudet ja pakkasasteet määräävät tulevien päivien pörssisähkön hinnan.",
            """<p style="margin-bottom:14px;">Nord Pool julkaisee seuraavan vuorokauden viralliset tuntihinnat päivittäin vasta noin kello 13.45–14.00 Suomen aikaa. Sähköauton latausta, varaavaa lämmitystä tai lämminvesivaraajan ajoitusta suunnittelevalle pelkkä huomisen hinta ei usein riitä.</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Tuulivoima on Suomen pörssisähkön suurin yksittäinen hinnanmuodostaja</h2>
            <p style="margin-bottom:14px;">Suomen asennettu tuulivoimakapasiteetti on kasvanut yli 8 450 megawattiin. Kun Pohjanmaan, Pohjois-Pohjanmaan (Kalajoki, Pyhäjoki, Raahe) ja Perämeren rannikon tuulipuistoissa 100 metrin napakorkeuden tuulennopeus nousee yli 9–11 m/s, tuulivoima kattaa suuren osan Suomen sähkönkulutuksesta ja painaa spot-hinnan usein lähelle nollaa.</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Lämpötilan ja kulutusprofiilin yhteisvaikutus</h2>
            <p style="margin-bottom:14px;">Kun lämpötila laskee Suomessa pakkasen puolelle, sähkölämmityksen ja lämpöpumppujen kulutus kasvaa sadoilla megawateilla jokaista pakkasastetta kohden. Oppiva Ridge-regressiomallimme on koulutettu kahden vuoden toteutuneilla Nord Pool FI -tuntihinnoilla, 100 metrin tuulennopeuksilla ja lämpötiloilla, ja se päivittää painokertoimiaan jatkuvasti uusien havaintojen saapuessa.</p>""",
        ),
        (
            "sahkon-siirtohinta-postinumerolla-kaikki-verkkoyhtiot",
            "Sähkön siirtohinta postinumerolla — miksi asuinpaikka ratkaisee puolet sähkölaskusta?",
            "Suomessa toimii yli 70 paikallista sähköverkkoyhtiötä. Katso miten postinumero määrää jakeluverkkoyhtiösi ja kuinka suuri ero kaupunkien ja maaseutuverkkojen välillä on.",
            """<p style="margin-bottom:14px;">Sähkölasku koostuu Suomessa kolmesta osasta: myyjältä ostettavasta sähköenergiasta (esim. pörssisähkö + marginaali), paikallisen sähköverkkoyhtiön perimästä sähkönsiirrosta sekä valtion sähköverosta (2,8275 snt/kWh sis. ALV 25,5 %).</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Kaupunkiverkko vs. haja-asutusalueen verkko</h2>
            <p style="margin-bottom:14px;">Tiheästi rakennetuissa kaupungeissa (kuten Helsinki, Espoo, Vantaa, Tampere, Turku, Oulu ja Seinäjoki) yhtä asiakasta kohden tarvitaan vain vähän sähköverkkoa, jolloin yleissiirron hinta on tyypillisesti 3,4–4,1 snt/kWh ja perusmaksu 5–15 €/kk. Laajoilla haja-asutus- ja järvialueilla (esim. Järvi-Suomen Energia, Savon Voima, PKS, Kajave, Elenia ja Caruna Oy) verkkoa on kymmeniä metrejä asukasta kohden, jolloin siirtohinta on 5,0–5,7 snt/kWh ja perusmaksu 25–32 €/kk.</p>""",
        ),
        (
            "yleissiirto-yosiirto-vai-kausisiirto-vertailu",
            "Yleissiirto, yösiirto vai kausisiirto — mikä kannattaa pörssisähkön rinnalla?",
            "Vaikka sähköverkkoyhtiötä ei voi kilpailuttaa, siirtotuotteen voi valita. Näin lasket, säästääkö yösiirto tai kausisiirto rahaa sähkölämmittäjälle ja sähköautoilijalle.",
            """<p style="margin-bottom:14px;">Moni pörssisähkön käyttäjä kohdistaa kulutustaan automaattisesti kello 22:00–07:00 välisille yötunneille, koska spot-hinta on silloin edullisimmillaan. Tällöin myös sähkönsiirrossa <strong>yösiirto (aikasiirto)</strong> tai <strong>kausisiirto</strong> tulee usein yleissiirtoa halvemmaksi.</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Nyrkkisääntö siirtotuotteen valintaan</h2>
            <p style="margin-bottom:14px;">Jos vuosikulutuksesi on alle 6 000 kWh (esim. kerrostalo tai kaukolämmitteinen rivitalo ilman sähköautoa), <strong>Yleissiirto</strong> on lähes aina edullisin pienemmän kuukausittaisen perusmaksun ansiosta. Jos vuosikulutuksesi ylittää 10 000–12 000 kWh ja pystyt ohjaamaan lämminvesivaraajan, lämmityksen tai sähköauton latauksen kello 22:00 jälkeiseen yöaikaan, <strong>Yösiirto</strong> säästää tyypillisesti 80–250 euroa vuodessa.</p>""",
        ),
        (
            "sahkoauton-lataus-ja-lamminvesivaraaja-porssisahkolla",
            "Sähköauton lataus ja lämminvesivaraaja: miksi pelkkä spot-hinta voi hämätä?",
            "Jos lataat sähköautoa klo 20–22 pelkän spot-hinnan perusteella, saatat maksaa päiväsiirrosta turhaan. Näin optimoit latauksen todellisella kokonaishinnalla.",
            """<p style="margin-bottom:14px;">Yösiirtoa tai kausisiirtoa käyttävässä taloudessa siirtohinta putoaa kello 22:00 tyypillisesti 1,5–2,6 snt/kWh. Jos pörssisähkön spot-hinta on esimerkiksi kello 21:00 2,0 snt/kWh ja kello 22:00 2,8 snt/kWh, pelkkää spot-hintaa seuraava automaatio luulee kello 21:00 tuntia halvemmaksi, vaikka todellinen kokonaishinta siirron kanssa on kello 22:00 jälkeen selvästi edullisempi.</p>""",
        ),
    ]

    for gslug, gtitle, gdesc, gbody in guides:
        with open(os.path.join(base_dir, "oppaat", f"{gslug}.html"), "w", encoding="utf-8") as f:
            f.write(build_guide_page(gslug, gtitle, gdesc, gbody))
        urls.append(f"{SITE_URL}/oppaat/{gslug}.html")

    for cid in ["se", "no", "dk", "ee", "lv", "lt"]:
        urls.append(f"{SITE_URL}/{cid}/")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sitemap_items = "\n".join(
        f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today_str}</lastmod>\n  </url>" for u in urls
    )
    with open(os.path.join(base_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(
            f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{sitemap_items}\n</urlset>\n'
        )

    print(f"Generated {len(urls)} pages in {base_dir}!")


if __name__ == "__main__":
    main()
