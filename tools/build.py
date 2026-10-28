"""Собирает public/index.html для собственного сервера из исходника портала (portal/index.html)."""
import re, shutil, pathlib, sys
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/home/claude/portal")
ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
s = (SRC / "index.html").read_text(encoding="utf-8")
server_js = (ROOT / "src" / "server-mode.js").read_text(encoding="utf-8")
k = "/* ---------- data: live portal (Claude runtime) or browser-only demo ---------- */"
assert s.count(k) == 1
s = s.replace(k, server_js + "\n" + k)
head = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Свадебный портал #СказалаДа!: каталог подрядчиков со скидками по карте, свадебный брокер и тендеры, Свадебный фестиваль 21 февраля 2027.">
<meta property="og:title" content="#СказалаДа! — свадебный портал"><meta property="og:description" content="Подрядчики вашей свадьбы со скидкой по карте. Разместите запрос — подрядчики придут сами.">
<meta property="og:image" content="/assets/festival-2027-poster.png"><meta property="og:type" content="website">
<link rel="icon" type="image/png" href="/assets/favicon.png">
<script>window.SD_SERVER=true;</script>
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
"""
(PUB / "index.html").write_text(head + s + "\n</body></html>\n", encoding="utf-8")
for f in (SRC / "assets").iterdir():
    if f.suffix.lower() in (".jpg", ".png") or f.name == "credits.json":
        shutil.copy2(f, PUB / "assets" / f.name)
print("built", (PUB / "index.html").stat().st_size, "bytes")
