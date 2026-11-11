# -*- coding: utf-8 -*-
"""
Generoi Spotpuls (https://spotpuls.app) kansainväliset kieliversiot (28 kieltä / 40 Euroopan sähköpörssialuetta)
sekä kattavan kehittäjädokumentaatiosivun (/api-docs/index.html) avoimelle REST API -rajapinnalle.
"""

import html
import json
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from global_markets_config import (
    SITE_URL,
    BIDDING_ZONES,
    MARKET_LOCALES,
    render_hreflang_tags,
    render_language_options_html,
    render_zone_options_html,
    render_open_api_section_html,
    build_market_schema_graph,
)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def build_country_page(cid: str, loc: dict) -> str:
    full_schema = build_market_schema_graph(cid)
    hreflang_html = render_hreflang_tags()
    zone_opts = render_zone_options_html(cid)
    lang_opts = render_language_options_html(cid)
    api_section_html = render_open_api_section_html(cid, prefix="/")
    loc_json = json.dumps({"countryId": cid, **loc}, ensure_ascii=False)
    canonical_url = f"{SITE_URL}{loc['path']}"

    market_links = " ".join(
        f'<a href="{m["path"]}" style="margin-right:10px;">{html.escape(m["languageLabel"])}</a>'
        for m in MARKET_LOCALES.values()
    )

    return f"""<!DOCTYPE html>
<html lang="{loc['lang']}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotpuls — {html.escape(loc['brandSubtitle'])} | spotpuls.app</title>
    <meta name="description" content="{html.escape(loc['transferLead'])}">
    <meta name="geo.region" content="{loc['geoRegion']}">
    <meta name="content-language" content="{loc['lang']}">
    <link rel="canonical" href="{canonical_url}" />
{hreflang_html}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=37">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="stylesheet" href="/styles.css?v=37">
    <script type="application/ld+json">
{json.dumps(full_schema, ensure_ascii=False, indent=2)}
    </script>
    <script>
    window.ACTIVE_COUNTRY_LOCALE = {loc_json};
    </script>
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <a href="./" class="brand-link">
                <span class="brand-title"><img src="/favicon.svg?v=37" alt="" width="24" height="24" style="vertical-align:-5px; margin-right:8px;">Spotpuls</span>
                <span class="brand-subtitle">{html.escape(loc['brandSubtitle'])}</span>
            </a>
            <div class="header-right">
                <nav class="main-nav" aria-label="Navigation">
                    <a href="./">{html.escape(loc['navChart'])}</a>
                    <a href="#tuntitaulukko">{html.escape(loc['navTable'])}</a>
                    <a href="#siirtohintalaskuri">{html.escape(loc['navTransfer'])}</a>
                    <a href="#optimoija">{html.escape(loc['navOptimizer'])}</a>
                    <a href="#avoin-api">{html.escape(loc['navApi'])}</a>
                </nav>
                <div class="header-market-controls">
                    <select id="zone-select" class="header-select" aria-label="{html.escape(loc['zoneSelectLabel'])}">
                        {zone_opts}
                    </select>
                    <select id="lang-select" class="header-select" aria-label="{html.escape(loc['langSelectLabel'])}">
                        {lang_opts}
                    </select>
                </div>
            </div>
        </div>
    </header>

    <main class="container">
        <div class="first-screen-stage">
            <section class="hero-chart-box">
                <div id="day-tabs" class="day-tabs"></div>

                <div class="panel-body" style="padding:10px 14px; border-bottom:var(--border-heavy);">
                    <div id="chart-readout-strip" class="chart-readout-strip" style="margin-bottom:8px;">
                        {html.escape(loc['hoverHint'])}
                    </div>

                    <div class="chart-legend" style="padding-top:4px;">
                        <span class="legend-item"><span class="legend-swatch" style="background:#009e3d;"></span> {html.escape(loc['tierCheap'])}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#0038ff;"></span> {html.escape(loc['tierNorm'])}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ff3b00;"></span> {html.escape(loc['tierHigh'])}</span>
                        <span class="legend-item"><span class="legend-swatch" style="background:#ffd000;"></span> {html.escape(loc['legendRange'])}</span>
                        <h1 id="chart-view-title" style="font-family:var(--mono); font-size:11.5px; font-weight:700; text-transform:uppercase; margin-left:auto;">{html.escape(loc['chartTitle'])}</h1>
                    </div>
                </div>

                <div class="scroll-down-bar" style="margin-top:0; border:none; border-bottom:var(--border-heavy);">
                    <span>{html.escape(loc['scrollDownText'])}</span>
                    <div class="scroll-down-links">
                        <a href="#tuntitaulukko">{html.escape(loc['navTable'])}</a>
                        <a href="#siirtohintalaskuri">{html.escape(loc['navTransfer'])}</a>
                        <a href="#optimoija">{html.escape(loc['navOptimizer'])}</a>
                        <a href="#avoin-api">{html.escape(loc['navApi'])}</a>
                    </div>
                </div>

                <div class="svg-chart-wrapper">
                    <button type="button" id="chart-prev-day" class="chart-edge-arrow chart-edge-prev" aria-label="Prev">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div id="chart-floating-tooltip" class="chart-floating-tooltip" aria-live="polite"></div>
                    <div id="price-chart" class="svg-chart-container" style="border:none; padding:12px 8px 6px;">
                        ...
                    </div>
                    <button type="button" id="chart-next-day" class="chart-edge-arrow chart-edge-next" aria-label="Next">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
            </section>

            <div id="first-screen-summary-strip" class="first-screen-summary-strip" aria-live="polite"></div>
        </div>

        <div class="below-fold-section">
            <section class="panel-box" id="tuntitaulukko">
                <div class="panel-head">
                    <h2>{html.escape(loc['tableHeading'])}</h2>
                </div>
                <div class="panel-body">
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>{html.escape(loc['colTime'])}</th>
                                    <th>{html.escape(loc['colSpot'])}</th>
                                    <th>{html.escape(loc['colRange'])}</th>
                                    <th>{html.escape(loc['colTotal'])}</th>
                                    <th>{html.escape(loc['colWeather'])}</th>
                                </tr>
                            </thead>
                            <tbody id="hourly-table-body">
                                <tr><td colspan="5">...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section class="instrument-strip" id="siirtohintalaskuri">
                <div class="instrument-strip-top">
                    <h2>{html.escape(loc['transferHeading'])}</h2>
                    <p>{html.escape(loc['transferLead'])}</p>
                </div>

                <div class="control-matrix">
                    <form id="postal-search-form" class="control-cell" onsubmit="return false;">
                        <label for="postal-input" class="field-label">{html.escape(loc['postalLabel'])}</label>
                        <div class="postal-input-group">
                            <input type="text" id="postal-input" class="input-control" value="{html.escape(loc['defaultPostal'])}" placeholder="{html.escape(loc['postalPlaceholder'])}">
                            <button type="submit" class="btn-primary">{html.escape(loc['setBtn'])}</button>
                        </div>
                    </form>

                    <div class="control-cell">
                        <span class="field-label">{html.escape(loc['tariffLabel'])}</span>
                        <div class="seg-group">
                            <button type="button" class="seg-btn active" data-tariff-btn="general">{html.escape(loc['tariffGeneral'])}</button>
                            <button type="button" class="seg-btn" data-tariff-btn="time">{html.escape(loc['tariffTime'])}</button>
                        </div>
                    </div>

                    <div class="control-cell">
                        <label for="margin-input" class="field-label">{html.escape(loc['marginLabel'])}</label>
                        <input type="number" id="margin-input" class="input-control" step="0.05" min="0" max="500" value="{loc.get('defaultMargin', 0.45)}">
                    </div>

                    <div class="control-cell">
                        <label for="vat-select" class="field-label">{html.escape(loc['vatLabel'])}</label>
                        <select id="vat-select" class="select-control">
                            <option value="1" selected>{html.escape(loc['vatIncl'])}</option>
                            <option value="0">{html.escape(loc['vatZero'])}</option>
                        </select>
                    </div>
                </div>

                <div id="detected-dso-banner" class="detected-dso-banner"></div>
            </section>

            <div class="desk-grid">
                <section class="panel-box">
                    <div class="panel-head">
                        <h2>{html.escape(loc['receiptNowTitle'])}</h2>
                    </div>
                    <div class="panel-body" id="receipt-ledger-body"></div>
                </section>

                <section class="panel-box" id="optimoija">
                    <div class="panel-head">
                        <h2>{html.escape(loc['navOptimizer'])}</h2>
                    </div>
                    <div class="panel-body">
                        <div class="opt-controls-row">
                            <div style="flex:1; min-width:180px;">
                                <span class="field-label">{html.escape(loc['optDurationLabel'])}</span>
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
                                <label for="appliance-kw-input" class="field-label">{html.escape(loc['optKwLabel'])}</label>
                                <input type="number" id="appliance-kw-input" class="input-control" step="0.1" min="0.1" max="50" value="11">
                            </div>
                        </div>
                        <div id="cheapest-window-result"></div>
                    </div>
                </section>
            </div>

{api_section_html}
        </div>
    </main>

    <footer class="site-footer">
        <div class="footer-inner">
            <div>
                <strong style="color:#ffffff;">Spotpuls (spotpuls.app) — {html.escape(loc['countryName'])}</strong>
                <p style="margin-top:6px; max-width:680px;">{html.escape(loc['brandSubtitle'])}</p>
            </div>
            <div class="footer-links">
                <a href="./">{html.escape(loc['navChart'])}</a>
                <a href="#avoin-api">{html.escape(loc['navApi'])}</a>
                <a href="/api-docs/">API Docs</a>
                <a href="/openapi.json">OpenAPI 3.1</a>
                <a href="/llms.txt">llms.txt</a>
            </div>
            <div style="width:100%; padding-top:12px; border-top:1px solid #2b2e28; font-size:11px; line-height:1.8;">
                <span style="color:#ffffff; margin-right:8px;">SPOT MARKETS (28 LANGUAGES / 40 ZONES):</span>
                {market_links}
            </div>
        </div>
    </footer>

    <script src="/dso_data.js"></script>
    <script src="/ml_weights.js"></script>
    <script src="/nordpool_models.js"></script>
    <script src="/app.js?v=37"></script>
</body>
</html>
"""


def build_api_docs_page() -> str:
    lang_opts = render_language_options_html("en")
    zone_rows = []
    for zcode, z in BIDDING_ZONES.items():
        json_href = f"/api/v1/prices?zone={zcode}&vat=1"
        csv_href = f"/api/v1/prices?zone={zcode}&vat=1&format=csv"
        badge_href = f"/api/v1/prices?zone={zcode}&vat=1&format=badge"
        zone_rows.append(
            f"""                            <tr>
                                <td><strong><code>{html.escape(zcode)}</code></strong></td>
                                <td>{html.escape(z['name'])}</td>
                                <td>{html.escape(z['exchange'])}</td>
                                <td><code>{html.escape(z['tz'])}</code></td>
                                <td>{z['windCapMw']} MW / {z['solarCapMw']} MW</td>
                                <td style="white-space:nowrap;">
                                    <a href="{json_href}">JSON</a> &middot;
                                    <a href="{csv_href}">CSV</a> &middot;
                                    <a href="{badge_href}">SVG Badge</a>
                                </td>
                            </tr>"""
        )

    market_links = " ".join(
        f'<a href="{m["path"]}" style="margin-right:10px;">{html.escape(m["languageLabel"])}</a>'
        for m in MARKET_LOCALES.values()
    )

    api_schema = {
        "@context": "https://schema.org",
        "@type": "WebAPI",
        "name": "Spotpuls Open Electricity Spot & 7-Day Forecast REST API",
        "url": f"{SITE_URL}/api/v1/prices",
        "documentation": f"{SITE_URL}/api-docs/",
        "description": "Free CORS-enabled REST API serving official day-ahead electricity spot prices and self-learning 7-day regional hourly forecasts for all 40 European bidding zones.",
        "provider": {"@type": "Organization", "name": "Spotpuls", "url": SITE_URL},
    }

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotpuls Open REST API — Day-Ahead Electricity Spot Prices &amp; 7-Day Forecast (40 European Zones) | spotpuls.app</title>
    <meta name="description" content="Free, zero-key, CORS-enabled REST API for live European day-ahead electricity spot prices and self-learning 7-day regional hourly forecasts across 40 bidding zones (JSON, CSV, Home Assistant, Google Sheets, SVG Badge).">
    <link rel="canonical" href="{SITE_URL}/api-docs/" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=37">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="stylesheet" href="/styles.css?v=37">
    <script type="application/ld+json">
{json.dumps(api_schema, ensure_ascii=False, indent=2)}
    </script>
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <a href="/en/" class="brand-link">
                <span class="brand-title"><img src="/favicon.svg?v=37" alt="" width="24" height="24" style="vertical-align:-5px; margin-right:8px;">Spotpuls</span>
                <span class="brand-subtitle">Open Electricity Spot &amp; 7-Day Forecast API — 40 European Bidding Zones</span>
            </a>
            <div class="header-right">
                <nav class="main-nav" aria-label="API Navigation">
                    <a href="/">FI</a>
                    <a href="/en/">Dashboard (EN)</a>
                    <a href="#endpoints">Endpoints</a>
                    <a href="#zones">40 Zones</a>
                    <a href="/openapi.json">OpenAPI 3.1</a>
                </nav>
                <div class="header-market-controls">
                    <select id="lang-select" class="header-select" aria-label="Language" onchange="if(this.value)window.location.href=this.value;">
                        {lang_opts}
                    </select>
                </div>
            </div>
        </div>
    </header>

    <main class="container" style="padding-top:24px;">
        <section class="panel-box" id="endpoints">
            <div class="panel-head">
                <h1>SPOTPULS OPEN REST API (V1) — FREE, NO API KEY, CORS *</h1>
                <a href="/openapi.json" style="color:var(--signal-yellow); font-family:var(--mono); font-size:12px; font-weight:700;">openapi.json &rarr;</a>
            </div>
            <div class="panel-body">
                <p style="font-size:14.5px; max-width:920px; margin-bottom:14px;">
                    <strong>Spotpuls (<code>https://spotpuls.app</code>)</strong> provides a free, open, CORS-enabled REST API delivering official day-ahead electricity spot prices together with a dedicated regional self-learning 7-day (168 h) hourly forecast and probability range for every European spot-electricity bidding zone (Nord Pool, EPEX SPOT, OMIE, GME, TGE, OTE, OKTE, HUPX, OPCOM, IBEX, BSP, CROPEX, HEnEx, SEMOpx).
                </p>

                <div class="api-panel-grid">
                    <div class="api-card">
                        <span class="field-label">1. HOURLY SPOT + 7-DAY FORECAST ENDPOINT</span>
                        <pre class="api-pre-block">GET https://spotpuls.app/api/v1/prices?zone=FI&amp;vat=1&amp;currency=local&amp;format=json</pre>
                        <ul style="margin:10px 0 0 18px; font-family:var(--mono); font-size:12px; line-height:1.65;">
                            <li><code>zone</code> — Bidding zone code (e.g. <code>FI</code>, <code>SE3</code>, <code>NO1</code>, <code>DK1</code>, <code>DE-LU</code>, <code>FR</code>, <code>NL</code>, <code>ES</code>, <code>IT-North</code>, <code>PL</code>, <code>GB</code>). Default: <code>FI</code>.</li>
                            <li><code>vat</code> — <code>1</code> (incl. national electricity VAT, default) or <code>0</code> (VAT 0 %).</li>
                            <li><code>currency</code> — <code>local</code> (native subunit/kWh, e.g. snt, öre, øre, ct, p, gr, Ft, Kč), <code>eur_cents</code> (EUR c/kWh), or <code>eur_mwh</code> (EUR/MWh).</li>
                            <li><code>format</code> — <code>json</code> (default), <code>csv</code> (Google Sheets / Excel), or <code>badge</code> (live embeddable SVG widget).</li>
                        </ul>
                    </div>

                    <div class="api-card">
                        <span class="field-label">2. DISCOVER ALL 40 BIDDING ZONES</span>
                        <pre class="api-pre-block">GET https://spotpuls.app/api/v1/zones
GET https://spotpuls.app/api/v1/prices?list=zones</pre>
                        <span class="field-label" style="margin-top:12px;">3. EMBEDDABLE LIVE SVG BADGE (BACKLINK WIDGET)</span>
                        <div class="api-badge-preview">
                            <img src="/api/v1/prices?zone=FI&vat=1&format=badge" alt="Spotpuls FI live badge" width="250" height="32" style="border:1px solid #111210;">
                            <img src="/api/v1/prices?zone=DE-LU&vat=1&format=badge" alt="Spotpuls DE-LU live badge" width="250" height="32" style="border:1px solid #111210;">
                        </div>
                        <pre class="api-pre-block">&lt;a href="https://spotpuls.app/?zone=FI" target="_blank" rel="noopener"&gt;
  &lt;img src="https://spotpuls.app/api/v1/prices?zone=FI&amp;vat=1&amp;format=badge" alt="Spotpuls FI spot electricity price" width="250" height="32"&gt;
&lt;/a&gt;</pre>
                    </div>
                </div>

                <div class="api-panel-grid" style="margin-top:16px;">
                    <div class="api-card">
                        <span class="field-label">JAVASCRIPT / TYPESCRIPT FETCH EXAMPLE</span>
                        <pre class="api-pre-block">const res = await fetch("https://spotpuls.app/api/v1/prices?zone=SE3&amp;vat=1");
const data = await res.json();
console.log(data.current.spotPrice, data.meta.unit);
console.log("Next 168h series:", data.series.length);</pre>
                    </div>
                    <div class="api-card">
                        <span class="field-label">PYTHON / DATA SCIENCE EXAMPLE</span>
                        <pre class="api-pre-block">import requests
r = requests.get("https://spotpuls.app/api/v1/prices", params={{"zone": "DE-LU", "vat": 1}})
payload = r.json()
for slot in payload["series"][:24]:
    print(slot["timestamp"], slot["spotPrice"], slot["isForecast"])</pre>
                    </div>
                </div>
            </div>
        </section>

        <section class="panel-box" id="zones">
            <div class="panel-head">
                <h2>ALL 40 SUPPORTED EUROPEAN BIDDING ZONES &amp; REGIONAL FORECAST MODELS</h2>
            </div>
            <div class="panel-body">
                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Zone Code</th>
                                <th>Region / Bidding Zone</th>
                                <th>Power Exchange</th>
                                <th>IANA Timezone</th>
                                <th>Wind / Solar Cap.</th>
                                <th>Live API Feeds</th>
                            </tr>
                        </thead>
                        <tbody>
{chr(10).join(zone_rows)}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    </main>

    <footer class="site-footer">
        <div class="footer-inner">
            <div>
                <strong style="color:#ffffff;">Spotpuls (spotpuls.app)</strong>
                <p style="margin-top:6px; max-width:680px;">Open European Day-Ahead Electricity Spot Price &amp; Self-Learning 7-Day Regional Forecast Platform.</p>
            </div>
            <div class="footer-links">
                <a href="/">Suomi (FI)</a>
                <a href="/en/">English (EU)</a>
                <a href="/openapi.json">OpenAPI 3.1</a>
                <a href="/.well-known/ai-plugin.json">AI Plugin</a>
                <a href="/llms.txt">llms.txt</a>
            </div>
            <div style="width:100%; padding-top:12px; border-top:1px solid #2b2e28; font-size:11px; line-height:1.8;">
                <span style="color:#ffffff; margin-right:8px;">SPOT MARKETS (28 LANGUAGES / 40 ZONES):</span>
                {market_links}
            </div>
        </div>
    </footer>
</body>
</html>
"""


def main():
    count = 0
    for cid, loc in MARKET_LOCALES.items():
        if cid == "fi":
            continue
        out_dir = os.path.join(ROOT_DIR, cid)
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "index.html")
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(build_country_page(cid, loc))
        count += 1
        print(f"[GENERATED] /{cid}/ ({loc['lang']}) -> {loc['countryName']} | Zones: {', '.join(loc['zones'])}")

    api_docs_dir = os.path.join(ROOT_DIR, "api-docs")
    os.makedirs(api_docs_dir, exist_ok=True)
    with open(os.path.join(api_docs_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_api_docs_page())
    print(f"[GENERATED] /api-docs/index.html + {count} international Spotpuls editions!")


if __name__ == "__main__":
    main()
