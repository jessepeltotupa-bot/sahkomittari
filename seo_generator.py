# -*- coding: utf-8 -*-
"""
Ohjelmallinen SEO- ja sivustogeneraattori: Pörssisähkö, 7 vrk hintaennuste ja postinumeropohjainen siirtohintalaskuri.
Luo:
- dso_data.js
- index.html
- verkkoyhtiot/index.html + jokaisen jakeluverkkoyhtiön oma laskurisivu (verkkoyhtiot/<slug>.html)
- paikkakunnat/index.html + jokaisen Suomen kunnan oma postinumero- ja siirtohintasivu (paikkakunnat/<slug>.html)
- oppaat/*.html
- sitemap.xml, robots.txt, llms.txt, vercel.json
"""

import html
import json
import os
import re
from datetime import datetime
from dso_data import (
    DSO_COMPANIES,
    MUNICIPALITIES,
    ELECTRICITY_TAX_INCL_VAT,
    ELECTRICITY_TAX_VAT0,
    export_dso_js,
)

SITE_URL = "https://porssisahko-ennuste.vercel.app"
SITE_NAME = "Pörssisähkö & Siirtohintalaskuri"


def slugify(text: str) -> str:
    s = (text or "").lower().strip()
    s = s.replace("ä", "a").replace("ö", "o").replace("å", "a")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "index"


def fmt_c(val: float) -> str:
    return f"{val:.2f}".replace(".", ",")


def render_header(prefix: str = "") -> str:
    return f"""    <header class="site-header">
        <div class="header-inner">
            <a href="{prefix}index.html" class="brand-link">
                <span class="brand-title">Pörssisähkö &amp; Siirtohintalaskuri</span>
                <span class="brand-subtitle">Reaaliaikainen spot-hinta, 7 vrk tuulivoimaennuste ja todellinen kokonaishinta postinumerolla</span>
            </a>
            <nav class="main-nav" aria-label="Päävalikko">
                <a href="{prefix}index.html">Spot &amp; Ennuste</a>
                <a href="{prefix}index.html#optimoija">Halvimmat tunnit</a>
                <a href="{prefix}index.html#vuosivertailu">Yleissiirto vs. Yösiirto</a>
                <a href="{prefix}verkkoyhtiot/index.html">Sähköverkkoyhtiöt</a>
                <a href="{prefix}paikkakunnat/index.html">Kunnat &amp; Postinumerot</a>
            </nav>
        </div>
    </header>"""


def render_footer(prefix: str = "") -> str:
    return f"""    <footer class="site-footer">
        <div class="footer-inner">
            <div>
                <strong>{SITE_NAME}</strong>
                <p style="margin-top:6px; color:#b7c6bd; max-width:540px;">
                    Palvelu yhdistää Nord Pool FI -pörssisähkön spot-hinnat, Suomen tuulipuistojen ja lämpötilojen 7 vuorokauden ennustemallin sekä kaikkien Suomen jakeluverkkoyhtiöiden siirtohinnat ja sähköveron.
                </p>
            </div>
            <div class="footer-links">
                <a href="{prefix}index.html">Etusivu</a>
                <a href="{prefix}verkkoyhtiot/index.html">Sähköverkkoyhtiöt</a>
                <a href="{prefix}paikkakunnat/index.html">Paikkakunnat</a>
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
    return f"""        <section class="hero-card">
            <h1>{html.escape(h1_text)}</h1>
            <p class="hero-lead">{html.escape(lead_text)}</p>

            <div class="postal-control-bar">
                <div class="postal-grid">
                    <form id="postal-search-form" onsubmit="return false;">
                        <label for="postal-input" class="field-label">Postinumero tai paikkakunta</label>
                        <div class="postal-input-group">
                            <input type="text" id="postal-input" class="input-control" value="{html.escape(default_postal)}" placeholder="Esim. 00100, 33100, 60100 tai Oulu">
                            <button type="submit" class="btn-primary">Hae siirtohinta</button>
                        </div>
                    </form>

                    <div>
                        <span class="field-label">Valitse siirtotuote</span>
                        <div class="seg-group">
                            <button type="button" class="seg-btn active" data-tariff-btn="general">Yleissiirto</button>
                            <button type="button" class="seg-btn" data-tariff-btn="time">Yösiirto (07–22 / 22–07)</button>
                            <button type="button" class="seg-btn" data-tariff-btn="season">Kausisiirto</button>
                        </div>
                    </div>

                    <div>
                        <label for="margin-input" class="field-label">Myyjän marginaali (snt/kWh)</label>
                        <input type="number" id="margin-input" class="input-control" step="0.01" min="0" max="3" value="0.45">
                    </div>

                    <div>
                        <label for="vat-select" class="field-label">Arvonlisävero</label>
                        <select id="vat-select" class="select-control">
                            <option value="1" selected>Sis. ALV 25,5 %</option>
                            <option value="0">Veroton (ALV 0 %)</option>
                        </select>
                    </div>
                </div>
            </div>

            <div id="detected-dso-banner" class="detected-dso-banner">
                Haetaan postinumeron verkkoyhtiötä...
            </div>
        </section>

        <section class="kpi-grid" aria-label="Hintayhteenveto">
            <div class="kpi-card highlight">
                <div class="kpi-label">Kokonaishinta juuri nyt (sis. siirto + vero)</div>
                <div class="kpi-value" id="kpi-now-total">— snt/kWh</div>
                <div class="kpi-sub" id="kpi-now-breakdown">Lasketaan tuntikohtaista kokonaishintaa...</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Pelkkä pörssisähkön spot-hinta nyt</div>
                <div class="kpi-value" id="kpi-now-spot">— snt/kWh</div>
                <div class="kpi-sub">Nord Pool FI tuntihinta</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Päivän edullisin tunti (kokonaishinta)</div>
                <div class="kpi-value" id="kpi-today-min">— snt/kWh</div>
                <div class="kpi-sub" id="kpi-today-min-sub">—</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label" id="kpi-tomorrow-title">Huomisen hintaennuste</div>
                <div class="kpi-value" id="kpi-tomorrow-avg">— snt/kWh</div>
                <div class="kpi-sub" id="kpi-tomorrow-sub">—</div>
            </div>
        </section>

        <section class="section-card">
            <div class="section-header-row">
                <h2 id="chart-view-title">Pörssisähkön tuntihinnat, siirtohinta ja 7 vrk ennuste</h2>
                <div class="seg-group" style="min-width:290px;">
                    <button type="button" class="seg-btn active" data-mode-btn="total">Kokonaishinta (Spot + Siirto + Vero)</button>
                    <button type="button" class="seg-btn" data-mode-btn="spot">Pelkkä Spot-hinta</button>
                </div>
            </div>

            <div id="day-tabs" class="day-tabs"></div>

            <div class="chart-legend">
                <span class="legend-item"><span class="legend-swatch" style="background:#2b7a4b;"></span> Edullinen spot (&lt; 3 snt/kWh)</span>
                <span class="legend-item"><span class="legend-swatch" style="background:#2b5b84;"></span> Normaali spot (3–8 snt/kWh)</span>
                <span class="legend-item"><span class="legend-swatch" style="background:#b5452a;"></span> Korkea spot (&gt; 8 snt/kWh)</span>
                <span class="legend-item"><span class="legend-swatch" style="background:#94a398;"></span> Paikallinen siirtohinta + sähkövero + marginaali</span>
                <span class="legend-item"><span class="legend-swatch" style="background:#4c6ef5;"></span> Ennustetunti (tuulivoima + lämpötila)</span>
            </div>

            <div id="price-chart" class="price-chart-box">
                Ladataan pörssisähkön hintoja ja 7 vuorokauden tuulivoimaennustetta...
            </div>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Aikajakso</th>
                            <th>Tyyppi</th>
                            <th>Spot-hinta</th>
                            <th>Siirto + Sähkövero + Marg.</th>
                            <th>Kokonaishinta yhteensä</th>
                            <th>Tuulivoima / Sää</th>
                        </tr>
                    </thead>
                    <tbody id="hourly-table-body">
                        <tr><td colspan="6">Ladataan tuntitietoja...</td></tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="section-card" id="optimoija">
            <h2>Halvimmat peräkkäiset tunnit kokonaishinnalla (huomioi myös yösiirron klo 22 jälkeen)</h2>
            <p class="hero-lead" style="margin-top:6px;">
                Pelkän spot-hinnan tuijottaminen voi johtaa väärään latausaikaan, jos käytössäsi on yösiirto tai kausisiirto: kello 22:00 alkava edullisempi yösiirto laskee siirtohintaa tyypillisesti 1,5–2,6 snt/kWh. Tämä laskuri etsii aidosti halvimman jakson yhdistämällä spot-hinnan ja postinumerosi siirtohinnan.
            </p>

            <div class="preset-pills">
                <button type="button" class="preset-pill" data-preset-kw="11" data-preset-hrs="4">Sähköauton lataus (11 kW, 4 h)</button>
                <button type="button" class="preset-pill" data-preset-kw="3.6" data-preset-hrs="6">Hybridin lataus (3,6 kW, 6 h)</button>
                <button type="button" class="preset-pill" data-preset-kw="3" data-preset-hrs="3">Lämminvesivaraaja (3 kW, 3 h)</button>
                <button type="button" class="preset-pill" data-preset-kw="8" data-preset-hrs="1">Sähkökiuas (8 kW, 1 h)</button>
                <button type="button" class="preset-pill" data-preset-kw="2" data-preset-hrs="2">Pyykin- tai astianpesukone (2 kW, 2 h)</button>
            </div>

            <div class="opt-controls-row">
                <div style="flex:1; min-width:240px;">
                    <span class="field-label">Tarvittava yhtäjaksoinen kesto</span>
                    <div class="seg-group">
                        <button type="button" class="seg-btn" data-win-hours="1">1 h</button>
                        <button type="button" class="seg-btn" data-win-hours="2">2 h</button>
                        <button type="button" class="seg-btn active" data-win-hours="3">3 h</button>
                        <button type="button" class="seg-btn" data-win-hours="4">4 h</button>
                        <button type="button" class="seg-btn" data-win-hours="6">6 h</button>
                        <button type="button" class="seg-btn" data-win-hours="8">8 h</button>
                    </div>
                </div>
                <div style="width:200px;">
                    <label for="appliance-kw-input" class="field-label">Laitteen teho (kW)</label>
                    <input type="number" id="appliance-kw-input" class="input-control" step="0.1" min="0.1" max="50" value="11">
                </div>
            </div>

            <div id="cheapest-window-result"></div>
        </section>

        <section class="section-card" id="vuosivertailu">
            <h2>Yleissiirto, Yösiirto vai Kausisiirto? Vuosikustannuslaskuri postinumerollesi</h2>
            <p class="hero-lead" style="margin-top:6px;">
                Vaikka et voi kilpailuttaa paikallista sähköverkkoyhtiötäsi, voit vaihtaa verkkoyhtiön sisällä siirtotuotetta (Yleissiirto, Yösiirto tai Kausisiirto). Syötä vuosikulutuksesi ja arvioitu yöajan (klo 22–07) kulutusosuus nähdäksesi, mikä siirtotuote on postinumerossasi edullisin.
            </p>

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
        </section>"""


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
                    "text": "Ennustemalli yhdistää Suomen keskeisten tuulivoima-alueiden (Kalajoki-Pyhäjoki, Pohjanmaan rannikko, Etelä-Pohjanmaa ja Perämeri) 100 metrin korkeuden tuulennopeusennusteet, kulutuskeskusten lämpötilaennusteet (lämmitystarveluku) sekä arkipäivien ja viikonloppujen tuntikulutusprofiilin kalibroituna tuoreimpiin Nord Pool -toteumiin.",
                },
            },
            {
                "@type": "Question",
                "name": "Miten postinumero vaikuttaa pörssisähkön kokonaishintaan?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Suomessa sähkönsiirto on paikallinen luonnollinen monopoli, joka määräytyy käyttöpaikan postinumeron ja kunnan mukaan. Pistorasiasta tulevan sähkön kokonaishinta on pörssisähkön spot-hinta + myyjän marginaali + paikallisen sähköverkkoyhtiön siirtohinta + sähkövero (2,83 snt/kWh sis. ALV 25,5 %).",
                },
            },
        ],
    }

    dashboard_html = render_interactive_dashboard_block(
        prefix="",
        h1_text="Pörssisähkö nyt, 7 vrk hintaennuste ja siirtohintalaskuri postinumerolla",
        lead_text="Syötä postinumerosi nähdäksesi pörssisähkön todellisen kokonaishinnan (Spot + paikallisen sähköverkkoyhtiön siirtohinta + sähkövero 2,83 snt/kWh) sekä tuulivoima- ja lämpötilaennusteeseen perustuvan 7 vuorokauden hintaennusteen.",
        default_postal="00100",
    )

    return f"""<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pörssisähkö nyt, 7 vrk Ennuste &amp; Siirtohintalaskuri Postinumerolla | Todellinen Kokonaishinta</title>
    <meta name="description" content="Tarkista pörssisähkön spot-hinta tänään, huomenna ja 7 vrk hintaennuste. Syötä postinumero, niin laskuri hakee automaattisesti sähköverkkoyhtiösi siirtohinnan (Caruna, Elenia, Helen, Vantaa, Tampere, Oulu ym.) ja laskee todellisen kokonaishinnan.">
    <link rel="canonical" href="{SITE_URL}/" />
    <link rel="stylesheet" href="styles.css">
    <script type="application/ld+json">
{json.dumps(faq_schema, ensure_ascii=False, indent=2)}
    </script>
</head>
<body>
{render_header("")}

    <main class="container">
{dashboard_html}

        <section class="section-card">
            <h2>Suomen sähköverkkoyhtiöiden siirtohinnat 2026 (edullisimmasta kalleimpaan)</h2>
            <p class="hero-lead" style="margin-top:6px;">
                Alla olevassa taulukossa on vertailtu Suomen jakeluverkkoyhtiöiden yleissiirron ja yösiirron energiamaksuja (sis. ALV 25,5 %) sekä kiinteää siirto-osuutta sähköveron ({fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh) kanssa. Klikkaa verkkoyhtiön nimeä avataksesi kyseisen yhtiön oman laskurin.
            </p>
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
        </section>

        <section class="section-card">
            <h2>Paikkakunta- ja postinumerokohtaiset pörssisähkö- ja siirtohintasivut</h2>
            <p class="hero-lead" style="margin-top:6px;">
                Valitse paikkakuntasi alta tarkistaaksesi suoraan alueesi verkkoyhtiön siirtohinnat ja pörssisähkön kokonaishinnan:
            </p>
            <div class="directory-grid">
                {chr(10).join(muni_pills)}
            </div>
        </section>

        <section class="section-card">
            <h2>Oppaat pörssisähkön ennustamiseen ja siirtohinnan optimointiin</h2>
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
        </section>
    </main>

{render_footer("")}
    <script src="dso_data.js"></script>
    <script src="app.js"></script>
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
        lead_text=f"{comp['name']} toimii alueella: {comp['region_desc']}. Yhtiön yleissiirtohinta on {fmt_c(comp['general_c_kwh'])} snt/kWh (yhdessä sähköveron kanssa {fmt_c(total_fixed_gen)} snt/kWh) ja yösiirron yöhinta klo 22–07 on {fmt_c(comp['night_c_kwh'])} snt/kWh (veron kanssa {fmt_c(total_fixed_night)} snt/kWh).",
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
    <link rel="stylesheet" href="../styles.css">
</head>
<body data-preset-dso="{comp['id']}" data-preset-postal="{sample_postal}" data-preset-city="{html.escape(sample_city)}">
{render_header("../")}

    <main class="container">
{dashboard_html}

        <section class="section-card">
            <h2>{html.escape(comp['name'])} — Siirtohinnasto ja kiinteät maksut (sis. ALV 25,5 %)</h2>
            <div class="table-wrap" style="margin-top:12px;">
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
        </section>

        <section class="section-card">
            <h2>Paikkakunnat ja postinumeroalueet: {html.escape(comp['short_name'])}</h2>
            <div class="directory-grid">
                {muni_links or '<p>Katso kaikki kunnat paikkakuntahakemistosta.</p>'}
            </div>
        </section>
    </main>

{render_footer("../")}
    <script src="../dso_data.js"></script>
    <script src="../app.js"></script>
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
        lead_text=f"Paikkakunnalla {m['name']} ({m['region']}) ensisijainen paikallinen sähköverkkoyhtiö on {comp['name']}.{alt_sentence} Yleissiirron ja sähköveron kiinteä osuus on yhteensä {fmt_c(total_fixed)} snt/kWh pörssisähkön spot-hinnan päälle.",
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
    <link rel="stylesheet" href="../styles.css">
</head>
<body data-preset-dso="{comp['id']}" data-preset-postal="{m['postal']}" data-preset-city="{html.escape(m['name'])}">
{render_header("../")}

    <main class="container">
{dashboard_html}

        <section class="section-card">
            <h2>Sähkönsiirto ja verkkoyhtiö paikkakunnalla {html.escape(m['name'])}</h2>
            <p style="margin-top:8px;">
                Kun asut paikkakunnalla <strong>{html.escape(m['name'])}</strong> (postinumeroalue <code>{m['postal_range']}</code>, maakunta {html.escape(m['region'])}), paikallisesta jakeluverkosta vastaa ensisijaisesti <a href="../verkkoyhtiot/{slugify(comp['short_name'])}.html"><strong>{html.escape(comp['name'])}</strong></a>.{alt_sentence}
            </p>
            <ul style="margin:12px 0 0 20px;">
                <li><strong>Yleissiirto ({html.escape(comp['short_name'])}):</strong> {fmt_c(comp['general_c_kwh'])} snt/kWh (perusmaksu {fmt_c(comp['general_base_eur'])} €/kk)</li>
                <li><strong>Yösiirto / Aikasiirto:</strong> Päivä klo 07–22 {fmt_c(comp['day_c_kwh'])} snt/kWh, Yö klo 22–07 {fmt_c(comp['night_c_kwh'])} snt/kWh (perusmaksu {fmt_c(comp['time_base_eur'])} €/kk)</li>
                <li><strong>Valtion sähkövero ja huoltovarmuusmaksu:</strong> {fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh (sis. ALV 25,5 %)</li>
            </ul>
        </section>
    </main>

{render_footer("../")}
    <script src="../dso_data.js"></script>
    <script src="../app.js"></script>
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
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
{render_header("../")}
    <main class="container">
        <section class="section-card">
            <h1>{html.escape(title)}</h1>
            <p class="hero-lead" style="margin-top:8px;">{html.escape(lead)}</p>
            <div class="directory-grid">
                {cards_html}
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
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
{render_header("../")}
    <main class="container">
        <article class="section-card">
            <h1 style="font-family:Georgia,serif; font-size:30px; color:#163022; margin-bottom:12px;">{html.escape(title)}</h1>
            <p class="hero-lead">{html.escape(meta_desc)}</p>
            <div style="font-size:15.5px; line-height:1.75; color:#18201b;">
                {body_html}
            </div>
            <div style="margin-top:24px; padding-top:16px; border-top:1px solid #d6d2c6;">
                <a href="../index.html" class="btn-primary" style="display:inline-block; text-decoration:none;">Avaa pörssisähkö- ja siirtohintalaskuri</a>
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

    # 1. Etusivu
    with open(os.path.join(base_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_index_page())

    # 2. Verkkoyhtiösivut
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

    # 3. Paikkakuntasivut
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

    # 4. Oppaat
    guides = [
        (
            "porssisahko-ennuste-7-vrk-tuulivoima-ja-lampotila",
            "Miten pörssisähkön 7 vuorokauden hintaennuste toimii?",
            "Opas siihen, miten Suomen yli 8 400 MW tuulivoimakapasiteetti, 100 metrin tuulennopeudet ja pakkasasteet määräävät tulevien päivien pörssisähkön hinnan.",
            """<p style="margin-bottom:14px;">Nord Pool julkaisee seuraavan vuorokauden viralliset tuntihinnat päivittäin vasta noin kello 13.45–14.00 Suomen aikaa. Sähköauton latausta, varaavaa lämmitystä tai viikonlopun saunomista suunnittelevalle pelkkä huomisen hinta ei kuitenkaan usein riitä.</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Tuulivoima on Suomen pörssisähkön suurin yksittäinen hinnanmuodostaja</h2>
            <p style="margin-bottom:14px;">Suomen asennettu tuulivoimakapasiteetti on kasvanut yli 8 400 megawattiin. Kun Pohjanmaan, Pohjois-Pohjanmaan (Kalajoki, Pyhäjoki, Raahe) ja Lapin rannikon tuulipuistoissa 100 metrin napakorkeuden tuulennopeus nousee yli 9–11 m/s, tuulivoima kattaa suuren osan Suomen sähkönkulutuksesta ja painaa spot-hinnan usein lähelle nollaa.</p>
            <h2 style="margin:18px 0 8px; font-family:Georgia,serif;">Lämpötilan ja kulutusprofiilin yhteisvaikutus</h2>
            <p style="margin-bottom:14px;">Kun lämpötila laskee Suomessa pakkasen puolelle, sähkölämmityksen ja lämpöpumppujen kulutus kasvaa sadoilla megawateilla jokaista pakkasastetta kohden. Ennustemallimme yhdistää 100 metrin tuulennopeusennusteet, aluepainotetun lämpötilan sekä arkipäivien ja viikonloppujen kulutusprofiilin, ja kalibroi hintatason automaattisesti viimeisimpiin toteutuneisiin Nord Pool -tunteihin.</p>""",
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

    # 5. Sitemap, robots.txt, llms.txt, vercel.json
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    sitemap_items = "\n".join(
        f"  <url>\n    <loc>{u}</loc>\n    <lastmod>{today_str}</lastmod>\n  </url>" for u in urls
    )
    with open(os.path.join(base_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(
            f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{sitemap_items}\n</urlset>\n'
        )

    with open(os.path.join(base_dir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")

    with open(os.path.join(base_dir, "llms.txt"), "w", encoding="utf-8") as f:
        f.write(
            f"""# {SITE_NAME}
> Reaaliaikainen Suomen pörssisähkön spot-hintaseuranta, 7 vuorokauden tuulivoima- ja lämpötilaennuste sekä postinumeropohjainen sähkönsiirto- ja kokonaishintalaskuri.

## Keskeiset ominaisuudet
- Viralliset Nord Pool FI -spot-hinnat ja 7 vrk (168 h) tuntikohtainen hintaennuste (`/api/spot-and-forecast`)
- Postinumerohaku, joka tunnistaa automaattisesti paikallisen sähköverkkoyhtiön (30+ verkkoyhtiötä ja 134+ Suomen kuntaa)
- Todellinen tuntikohtainen kokonaishinta: Spot + Myyjän marginaali + Paikallinen siirtohinta (Yleissiirto, Yösiirto tai Kausisiirto) + Sähkövero ({fmt_c(ELECTRICITY_TAX_INCL_VAT)} snt/kWh sis. ALV 25,5 %)
- Halvimmat peräkkäiset tunnit -optimoija kokonaishinnalla (huomioi klo 22:00 alkavan yösiirron)
"""
        )

    with open(os.path.join(base_dir, "vercel.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "version": 2,
                "cleanUrls": False,
                "headers": [
                    {
                        "source": "/api/(.*)",
                        "headers": [
                            {"key": "Cache-Control", "value": "public, s-maxage=600, stale-while-revalidate=1800"}
                        ],
                    }
                ],
            },
            f,
            indent=2,
        )

    with open(os.path.join(base_dir, "package.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "name": "porssisahko-ennuste-siirtohintalaskuri",
                "version": "1.0.0",
                "private": True,
                "type": "module",
            },
            f,
            indent=2,
        )

    print(f"Generated {len(urls)} pages in {base_dir}!")


if __name__ == "__main__":
    main()
