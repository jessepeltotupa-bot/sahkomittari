import json
import os
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlsplit

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(ROOT_DIR, "server.log")

LANG_TO_COUNTRY_DIR = {
    "fi": "",
    "en": "en",
    "sv": "se",
    "se": "se",
    "no": "no",
    "nb": "no",
    "nn": "no",
    "da": "dk",
    "dk": "dk",
    "et": "ee",
    "ee": "ee",
    "lv": "lv",
    "lt": "lt",
    "de": "de",
    "at": "at",
    "ch": "ch",
    "nl": "nl",
    "be": "be",
    "fr": "fr",
    "gb": "gb",
    "ie": "ie",
    "es": "es",
    "pt": "pt",
    "it": "it",
    "pl": "pl",
    "cs": "cz",
    "cz": "cz",
    "sk": "sk",
    "hu": "hu",
    "ro": "ro",
    "bg": "bg",
    "sl": "si",
    "si": "si",
    "hr": "hr",
    "el": "gr",
    "gr": "gr",
}


def detect_country_dir(headers, query_string: str) -> str:
    if query_string:
        qs = parse_qs(query_string)
        lang_override = (qs.get("lang") or qs.get("country") or [""])[0].strip().lower()
        if lang_override in LANG_TO_COUNTRY_DIR:
            return LANG_TO_COUNTRY_DIR[lang_override]

    accept_lang = (headers.get("Accept-Language") or "").lower()
    for part in accept_lang.split(","):
        tag = part.split(";")[0].strip()
        if not tag:
            continue
        if tag in ("de-at",):
            return "at"
        if tag in ("de-ch", "fr-ch", "it-ch"):
            return "ch"
        if tag in ("nl-be", "fr-be"):
            return "be"
        if tag in ("en-gb",):
            return "gb"
        if tag in ("en-ie",):
            return "ie"
        primary = tag.split("-")[0]
        if primary in LANG_TO_COUNTRY_DIR:
            return LANG_TO_COUNTRY_DIR[primary]

    return ""


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path in ("/api/v1/prices", "/api/v1/zones", "/api/spot-and-forecast"):
            qs = parse_qs(parsed.query)
            qmap = {k: v[0] for k, v in qs.items() if v}
            if parsed.path == "/api/v1/zones":
                qmap["list"] = "zones"
            node_code = (
                "import('./api/v1/prices.js').then(m => {"
                f"const q = {json.dumps(qmap)};"
                "const hdrs = {}; let code = 200;"
                "const res = {"
                "  setHeader(k,v){ hdrs[k]=v; },"
                "  status(c){ code=c; return this; },"
                "  send(b){ process.stdout.write(JSON.stringify({code, hdrs, body: String(b)})); },"
                "  json(o){ hdrs['Content-Type']='application/json; charset=utf-8'; process.stdout.write(JSON.stringify({code, hdrs, body: JSON.stringify(o)})); },"
                "  end(){ process.stdout.write(JSON.stringify({code, hdrs, body: ''})); }"
                "};"
                "m.default({method:'GET', query:q}, res);"
                "});"
            )
            try:
                proc = subprocess.run(
                    ["node", "-e", node_code],
                    cwd=ROOT_DIR,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=18,
                )
                out = json.loads(proc.stdout)
                self.send_response(out.get("code", 200))
                for hk, hv in (out.get("hdrs") or {}).items():
                    self.send_header(hk, hv)
                body_bytes = (out.get("body") or "").encode("utf-8")
                self.send_header("Content-Length", str(len(body_bytes)))
                self.end_headers()
                self.wfile.write(body_bytes)
                return
            except Exception as exc:
                err_bytes = json.dumps({"error": str(exc)}).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(err_bytes)))
                self.end_headers()
                self.wfile.write(err_bytes)
                return
        super().do_GET()

    def translate_path(self, path):
        parsed = urlsplit(path)
        clean_path = unquote(parsed.path)

        if clean_path in ("/", "/index.html"):
            cdir = detect_country_dir(self.headers, parsed.query)
            if cdir:
                candidate = os.path.join(ROOT_DIR, cdir, "index.html")
                if os.path.isfile(candidate):
                    return candidate

        full_path = super().translate_path(clean_path)

        if not os.path.exists(full_path) and not clean_path.endswith(".html"):
            html_candidate = full_path + ".html"
            if os.path.isfile(html_candidate):
                return html_candidate

        return full_path

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Vary", "Accept-Language, Host")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format, *args):
        try:
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write("%s - - [%s] %s\n" % (
                    self.address_string(),
                    self.log_date_time_string(),
                    format % args,
                ))
        except Exception:
            pass


def run_on_port(port: int):
    while True:
        try:
            server = ThreadingHTTPServer(("0.0.0.0", port), CleanUrlHandler)
            server.serve_forever()
        except Exception:
            import time
            time.sleep(1)


if __name__ == "__main__":
    for extra_port in (8001,):
        t = threading.Thread(target=run_on_port, args=(extra_port,), daemon=True)
        t.start()
    run_on_port(8080)
