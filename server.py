import os
import sys
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlsplit

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(ROOT_DIR, "server.log")

LANG_TO_COUNTRY_DIR = {
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
    "fi": "",
}


def detect_country_dir(headers, query_string: str) -> str:
    # 1. Explicit test override ?lang=se|no|dk|ee|lv|lt|fi
    if query_string:
        qs = parse_qs(query_string)
        lang_override = (qs.get("lang") or qs.get("country") or [""])[0].strip().lower()
        if lang_override in LANG_TO_COUNTRY_DIR:
            return LANG_TO_COUNTRY_DIR[lang_override]

    # 2. Country-specific domain / TLD detection (.se, .no, .dk, .ee, .lv, .lt, .fi)
    host = (headers.get("Host") or "").split(":")[0].lower()
    for tld, cdir in (
        (".se", "se"),
        (".no", "no"),
        (".dk", "dk"),
        (".ee", "ee"),
        (".lv", "lv"),
        (".lt", "lt"),
        (".fi", ""),
    ):
        if host.endswith(tld):
            return cdir

    # 3. Browser Accept-Language detection (strictly serves the user's native country site)
    accept_lang = (headers.get("Accept-Language") or "").lower()
    for part in accept_lang.split(","):
        tag = part.split(";")[0].strip()
        if not tag:
            continue
        primary = tag.split("-")[0]
        if primary in LANG_TO_COUNTRY_DIR:
            return LANG_TO_COUNTRY_DIR[primary]

    return ""


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def translate_path(self, path):
        parsed = urlsplit(path)
        clean_path = unquote(parsed.path)

        # Serve native country site automatically on root entry based on user's language/country
        if clean_path in ("/", "/index.html"):
            cdir = detect_country_dir(self.headers, parsed.query)
            if cdir:
                candidate = os.path.join(ROOT_DIR, cdir, "index.html")
                if os.path.isfile(candidate):
                    return candidate

        full_path = super().translate_path(clean_path)

        # Support Vercel-style cleanUrls (e.g. /verkkoyhtiot/caruna -> /verkkoyhtiot/caruna.html)
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
