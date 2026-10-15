#!/usr/bin/env python3
"""Generate StellarGive brand assets (icon, apple-icon, OG/twitter cards).

Reproducible from source — run from frontend/ root:
    python3 scripts/gen-brand-assets.py

Writes:
    src/app/icon.png           512x512 favicon tile
    src/app/apple-icon.png     180x180 iOS home-screen tile
    src/app/opengraph-image.png 1200x630 default social card
    src/app/twitter-image.png   1200x630 default social card (same art)
"""
from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "src" / "app"
APP.mkdir(parents=True, exist_ok=True)

# Brand tokens (src/app/globals.css)
PRIMARY = (37, 99, 235)        # --primary 221.2 83.2% 53.3% (blue-600)
PRIMARY_DARK = (30, 58, 138)   # blue-900 edge
SKY = (147, 197, 253)          # blue-300
SLATE_950 = (2, 6, 23)         # dark --background
SLATE_800 = (30, 41, 59)
SLATE_400 = (148, 163, 184)    # muted text
WHITE = (255, 255, 255)

FONT_DIR = Path("/usr/share/fonts/truetype/lato")
LIB_DIR = Path("/usr/share/fonts/truetype/liberation")


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    name = {"black": "Lato-Black", "bold": "Lato-Bold", "regular": "Lato-Regular"}[weight]
    path = FONT_DIR / f"{name}.ttf"
    if not path.exists():
        path = LIB_DIR / "LiberationSans-Regular.ttf" if weight == "regular" else LIB_DIR / "LiberationSans-Bold.ttf"
    return ImageFont.truetype(str(path), size)


MARK_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="0.55" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="118" fill="url(#tile)"/>
  <path fill="#ffffff" d="M256 392 C 162 312 100 254 100 194 C 100 142 140 106 188 106 C 218 106 244 122 256 146 C 268 122 294 106 324 106 C 372 106 412 142 412 194 C 412 254 350 312 256 392 Z"/>
  <path fill="#ffffff" d="M 348 128 l 10 26 26 10 -26 10 -10 26 -10 -26 -26 -10 26 -10 Z"/>
  <circle cx="402" cy="332" r="7" fill="#93c5fd"/>
</svg>"""


def rasterize_svg(svg: str, width: int, height: int) -> Image.Image:
    """Rasterize an SVG string via cairosvg if available, else a fallback tile."""
    try:
        import cairosvg

        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=width, output_height=height)
        img = Image.open(__import__("io").BytesIO(png)).convert("RGBA")
        return img
    except Exception as exc:  # pragma: no cover - dev box dependency
        print(f"  ! cairosvg unavailable ({exc}); drawing geometric fallback", file=sys.stderr)
        return fallback_tile(width, height)


def fallback_tile(width: int, height: int) -> Image.Image:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(width * 0.23)
    d.rounded_rectangle([0, 0, width - 1, height - 1], radius=r, fill=(37, 99, 235, 255))
    cx, cy = width / 2, height / 2
    s = width / 512
    heart = [
        (256 * s, 392 * s), (162 * s, 312 * s), (100 * s, 254 * s), (100 * s, 194 * s),
        (100 * s, 142 * s), (140 * s, 106 * s), (188 * s, 106 * s), (218 * s, 106 * s),
        (244 * s, 122 * s), (256 * s, 146 * s), (268 * s, 122 * s), (294 * s, 106 * s),
        (324 * s, 106 * s), (372 * s, 106 * s), (412 * s, 142 * s), (412 * s, 194 * s),
        (412 * s, 254 * s), (350 * s, 312 * s),
    ]
    d.polygon(heart, fill=(255, 255, 255, 255))
    return img


def four_point_star(d: ImageDraw.ImageDraw, cx: float, cy: float, r_outer: float, r_inner: float, color):
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        r = r_outer if i % 2 == 0 else r_inner
        pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
    d.polygon(pts, fill=color)


def radial_glow(size: tuple[int, int], center: tuple[int, int], radius: int, color: tuple[int, int, int], alpha: int) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=color + (alpha,),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.45))
    return layer


def make_card() -> Image.Image:
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), SLATE_950 + (255,))
    img.alpha_composite(radial_glow((W, H), (330, 315), 560, PRIMARY, 38))
    img.alpha_composite(radial_glow((W, H), (980, 90), 420, SKY, 22))

    d = ImageDraw.Draw(img)

    # Brand tile + wordmark
    tile = rasterize_svg(MARK_SVG, 120, 120)
    img.alpha_composite(tile, (100, 84))
    d.text((244, 96), "stellarGive", font=font("bold", 54), fill=WHITE)
    d.text((246, 160), "RELIEF GRANT PLATFORM", font=font("bold", 20), fill=SKY)

    # Headline
    d.text((100, 252), "Relief grants,", font=font("black", 84), fill=WHITE)
    d.text((100, 352), "powered by Stellar", font=font("black", 84), fill=WHITE)
    d.text((102, 470), "A decentralized donation platform built on Stellar.", font=font("regular", 33), fill=SLATE_400)

    # URL pill
    pill_w, pill_h = 340, 58
    px, py = 100, 545
    d.rounded_rectangle([px, py, px + pill_w, py + pill_h], radius=29, fill=SLATE_800 + (255,), outline=(51, 65, 85, 255), width=2)
    tw = d.textlength("stellargive.org", font=font("bold", 26))
    tx = px + (pill_w - tw) / 2
    ty = py + (pill_h - 36) / 2
    d.text((tx, ty), "stellargive.org", font=font("bold", 26), fill=WHITE)

    # Decorative sparks
    four_point_star(d, 1010, 470, 22, 9, (147, 197, 253, 130))
    four_point_star(d, 1110, 150, 13, 5, (147, 197, 253, 90))
    d.ellipse([1064, 300, 1080, 316], fill=(255, 255, 255, 70))

    return img.convert("RGB")


def main() -> None:
    # Icon files
    icon = rasterize_svg(MARK_SVG, 512, 512).convert("RGB")
    apple = rasterize_svg(MARK_SVG, 180, 180).convert("RGB")
    icon.save(APP / "icon.png")
    apple.save(APP / "apple-icon.png")
    print(f"  wrote {APP / 'icon.png'} ({icon.size})")
    print(f"  wrote {APP / 'apple-icon.png'} ({apple.size})")

    # Social cards
    card = make_card()
    card.save(APP / "opengraph-image.png")
    card.save(APP / "twitter-image.png")
    print(f"  wrote {APP / 'opengraph-image.png'} ({card.size})")
    print(f"  wrote {APP / 'twitter-image.png'} ({card.size})")


if __name__ == "__main__":
    main()
