#!/usr/bin/env python3
"""One-off build asset generator — NOT a runtime dependency (Pillow isn't in
requirements.txt on purpose). Produces the PWA icon set matching the design's app mark:
a #C6E82F rounded square with "TT" in dark ink. Run once; re-run only if the mark changes.

Usage: python scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (198, 232, 47)  # --primary / #C6E82F
INK = (22, 24, 28)  # --on-primary / #16181C

OUT_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "icons"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def make_icon(size: int, corner_ratio: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * corner_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    font = load_font(int(size * 0.42))
    text = "TT"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=font, fill=INK)
    return img


def make_maskable(size: int) -> Image.Image:
    """Maskable icons need the safe content inside the center ~80% — the OS may crop
    to a circle/squircle, so the bg must fill edge-to-edge with no rounding baked in."""
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    font = load_font(int(size * 0.32))
    text = "TT"
    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=font, fill=INK)
    return img


def main() -> None:
    make_icon(180, 0.22).convert("RGB").save(OUT_DIR / "apple-touch-icon.png")
    make_icon(32, 0.28).save(OUT_DIR / "favicon-32.png")
    make_icon(192, 0.22).save(OUT_DIR / "icon-192.png")
    make_icon(512, 0.22).save(OUT_DIR / "icon-512.png")
    make_maskable(192).save(OUT_DIR / "icon-192-maskable.png")
    make_maskable(512).save(OUT_DIR / "icon-512-maskable.png")
    print(f"Icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()
