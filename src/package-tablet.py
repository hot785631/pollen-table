"""Package the standalone game and prepare the same game for tablet downloads."""
from hashlib import sha256
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent
site = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else root.parent / "sites" / "pollen-table" / "dist"
site.mkdir(parents=True, exist_ok=True)
offline = root / "花粉擂台-v5.0-五族花道离线版.html"
guide = root / "花粉擂台·游戏企划.html"
bundle = root / "花粉擂台-v5.0-五族花道离线包.zip"
with ZipFile(bundle, "w", ZIP_DEFLATED) as package:
    package.write(offline, arcname=offline.name)
    package.write(guide, arcname=guide.name)
(site / "pollen-table-v5.zip").write_bytes(bundle.read_bytes())
guide_page = guide.read_text(encoding="utf-8").replace('href="' + offline.name + '"','href="./"')
(site / "guide.html").write_text(guide_page,encoding="utf-8")

game = offline.read_text(encoding="utf-8")
download_js = (root / "tablet-download.js").read_text(encoding="utf-8")
worker = (root / "tablet-sw.js").read_text(encoding="utf-8")
revision = sha256((game + download_js + worker + guide_page).encode()).hexdigest()[:16]
cache = "pollen-table-" + revision
head = """<link rel="manifest" href="./manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="花粉擂台">
<link rel="apple-touch-icon" sizes="180x180" href="./icon-180.png">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<style>
.transfer{display:none;text-align:center;font:600 14px/1.5 system-ui,sans-serif;color:#345842;margin:0 auto;padding:0 14px 16px}
body:has(.mode-home) .transfer{display:block}
.transfer :is(a,button){font:inherit;display:inline-flex;min-height:44px;align-items:center;padding:0 12px;border:1px solid #91a48c;border-radius:16px;margin:3px;color:#294f38;background:#fff8e6;text-decoration:none}
.transfer [hidden]{display:none}.transfer output{display:block}
</style>"""
tools = """<aside class="transfer" aria-label="离线选项">
<button id="install-game" type="button">添加到主屏幕</button>
<button id="cache-game" type="button">保存到本机，断网玩</button>
<a href="./pollen-table-v5.zip" download="花粉擂台-v5.0-五族花道离线包.zip">下载离线包 · v5</a>
<a href="./guide.html#teams">五族图鉴与胜率</a>
<output id="offline-status" aria-live="polite"></output>
<output id="install-status" aria-live="polite"></output></aside>"""
hosted = game.replace('<html lang="zh-CN"', f'<html data-pollen-cache="{cache}" lang="zh-CN"', 1)
hosted = hosted.replace("</head>", head + "</head>", 1)
hosted = hosted.replace("</body>", tools + "<script>" + download_js + "</script></body>", 1)
assert f'data-pollen-cache="{cache}"' in hosted
(site / "index.html").write_text(hosted, encoding="utf-8")
(site / "offline-sw.js").write_text(worker.replace("RELEASE_HASH", revision), encoding="utf-8")
manifest = {"id": "./", "name": "花粉擂台 · 平板双人版", "short_name": "花粉擂台",
            "start_url": "./", "scope": "./", "display": "standalone", "lang": "zh-CN",
            "background_color": "#f8f2dc", "theme_color": "#f8f2dc",
            "icons": [{"src": f"./icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any maskable"} for size in (192, 512)]}
for size in (180, 192, 512):
    name = f"icon-{size}.png"
    (site / name).write_bytes((root / "app-icons" / name).read_bytes())
(site / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
icon = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="28" fill="#2b614f"/><g fill="#ecce82" stroke="#3a4434" stroke-width="3"><ellipse cx="60" cy="40" rx="9" ry="15" /><ellipse cx="60" cy="69" rx="22" ry="27" fill="#c68052"/><path d="M60 45v47M40 58l-13-5m12 17-13 2m16 10-12 10m48-34 13-5m-12 17 13 2m-17 10 12 10" stroke="#392c23" fill="none" stroke-linecap="round"/><path d="M58 33v-9l-5-5 7 3 7-3-5 6v8Z"/></g></svg>"""
(site / "icon.svg").write_text(icon, encoding="utf-8")
