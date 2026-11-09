"""Package the standalone game and prepare the same game for tablet downloads."""
from base64 import b64encode
from hashlib import sha256
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent
site = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else root.parent / "sites" / "pollen-table" / "dist"
site.mkdir(parents=True, exist_ok=True)
offline = root / "花粉擂台-v5.0-五族花道离线版.html"
guide = root / "花粉擂台·游戏企划.html"
bundle = root / "花粉擂台-v5.0-五族花道离线包.zip"
with ZipFile(bundle, "w", ZIP_DEFLATED) as package:
    for page in (offline, guide):
        # A stable timestamp keeps identical releases byte-for-byte identical.
        package.writestr(ZipInfo(page.name), page.read_bytes(), compress_type=ZIP_DEFLATED)
(site / "pollen-table-v5.zip").write_bytes(bundle.read_bytes())
guide_page = guide.read_text(encoding="utf-8").replace('href="' + offline.name + '"','href="./"')
(site / "guide.html").write_text(guide_page,encoding="utf-8")

game = offline.read_text(encoding="utf-8")
download_js = (root / "tablet-download.js").read_text(encoding="utf-8")
worker = (root / "tablet-sw.js").read_text(encoding="utf-8")
hosted = game
images = ["meadow-cinema.webp", "cine-cast.webp", *[f"campaign-{tribe}.webp" for tribe in ("ant", "bee", "beetle", "spider", "butterfly")]]
for name in images:
    image = (root / name).read_bytes()
    embedded = 'url("data:image/webp;base64,' + b64encode(image).decode("ascii") + '")'
    if hosted.count(embedded) != 1:
        raise ValueError(f"Rebuild the standalone game with exactly one CSS reference to {name}")
    hosted = hosted.replace(embedded, f'url("./{name}")', 1)
    (site / name).write_bytes(image)
music_name = "petit-pollen.mp3"
music = (root / music_name).read_bytes()
music_url = "data:audio/mpeg;base64," + b64encode(music).decode("ascii")
if hosted.count(music_url) != 1:
    raise ValueError("Rebuild the offline game with its complete recorded soundtrack")
hosted = hosted.replace(music_url, music_name, 1)
(site / music_name).write_bytes(music)
head = """<link rel="manifest" href="./manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="花粉擂台">
<link rel="apple-touch-icon" sizes="180x180" href="./icon-180.png">
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<style>
.transfer{display:none;text-align:center;font:600 14px/1.5 system-ui,sans-serif;color:#fff6da;background:#253c30;border-top:1px solid #61735d;margin:0 auto;padding:10px 14px max(14px,env(safe-area-inset-bottom))}
body:has(.mode-home) .transfer{display:block}
.transfer :is(a,button){font:inherit;display:inline-flex;min-height:44px;align-items:center;padding:0 12px;border:1px solid #e1cf9f;border-radius:16px;margin:3px;color:#263d2e;background:#fff3d4;text-decoration:none}
.transfer :is(a,button):focus-visible{outline:3px solid #ffd35e;outline-offset:2px}
.transfer [hidden]{display:none}.transfer output{display:block}
</style>"""
tools = """<aside class="transfer" aria-label="离线选项">
<button id="install-game" type="button">添加到主屏幕</button>
<button id="cache-game" type="button">保存到本机，断网玩</button>
<a href="./pollen-table-v5.zip" download="花粉擂台-v5.0-五族花道离线包.zip">下载离线包 · v5</a>
<a href="./guide.html#teams">五族图鉴与胜率</a>
<output id="offline-status" aria-live="polite"></output>
<output id="install-status" aria-live="polite"></output></aside>"""
hosted = hosted.replace("</head>", head + "</head>", 1)
hosted = hosted.replace("</body>", tools + "<script>" + download_js + "</script></body>", 1)
manifest = {"id": "./", "name": "花粉擂台 · 平板双人版", "short_name": "花粉擂台",
            "start_url": "./", "scope": "./", "display": "standalone", "lang": "zh-CN",
            "background_color": "#20382c", "theme_color": "#20382c",
            "icons": [{"src": f"./icon-{size}.png", "sizes": f"{size}x{size}", "type": "image/png", "purpose": "any maskable"} for size in (192, 512)]}
for size in (180, 192, 512):
    name = f"icon-{size}.png"
    (site / name).write_bytes((root / "app-icons" / name).read_bytes())
(site / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
(site / "icon.svg").write_bytes((root / "app-icons" / "icon.svg").read_bytes())

# Hash every file the worker installs, including the original image bytes and app icons.
digest = sha256((hosted + worker + guide_page).encode("utf-8"))
for name in (*images, music_name, "pollen-table-v5.zip", "manifest.webmanifest", "icon.svg",
             "icon-180.png", "icon-192.png", "icon-512.png"):
    digest.update((site / name).read_bytes())
revision = digest.hexdigest()[:16]
cache = "pollen-table-" + revision
hosted = hosted.replace('<html lang="zh-CN"', f'<html data-pollen-cache="{cache}" lang="zh-CN"', 1)
assert f'data-pollen-cache="{cache}"' in hosted
(site / "index.html").write_text(hosted, encoding="utf-8")
(site / "offline-sw.js").write_text(worker.replace("RELEASE_HASH", revision), encoding="utf-8")
