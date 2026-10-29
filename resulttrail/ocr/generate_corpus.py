"""Generate labelled fictional printed copies for a reproducible OCR experiment.

These are computer-rendered sheets, not photographed or official result forms.
The holdout uses different fonts/layouts and is never used to tune the parser.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SEED = 20261030
ROOT = Path(__file__).resolve().parents[1] / "instance" / "ocr-corpus"
FONTS = [Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/calibri.ttf"), Path("C:/Windows/Fonts/consola.ttf")]


def font(index: int, size: int):
    path = FONTS[index]
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def make_sheet(rng: random.Random, index: int, split: str) -> dict:
    accredited = rng.randint(80, 600)
    cast = rng.randint(round(accredited * .3), accredited)
    rejected = rng.randint(0, min(12, cast))
    valid = cast - rejected
    a = rng.randint(0, valid)
    b = rng.randint(0, valid - a)
    values = {"accredited": accredited, "cast": cast, "valid": valid, "rejected": rejected,
              "party:A": a, "party:B": b, "party:C": valid - a - b}
    layout = 0 if split == "development" else 1 + index % 2
    font_index = 0 if split == "development" else 1 + index % 2
    size = 26 if layout == 0 else 24 if layout == 1 else 27
    image = Image.new("RGB", (760, 820), "#fffdf7")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 760, 106), fill="#006747")
    draw.text((38, 29), "ResultTrail / ILLUSTRATIVE COPY", font=font(font_index, 28), fill="white")
    draw.text((38, 123), "FICTIONAL DATA - NOT AN OFFICIAL RESULT", font=font(font_index, 17), fill="#476750")
    labels = [("Accredited", "accredited"), ("Votes cast", "cast"), ("Valid votes", "valid"),
              ("Rejected", "rejected"), ("Party A", "party:A"), ("Party B", "party:B"), ("Party C", "party:C")]
    y = 211 if layout != 2 else 205
    value_x = 395 if layout != 2 else 515
    for label, key in labels:
        draw.text((56 if layout != 1 else 89, y), label, font=font(font_index, size), fill="#17392b")
        draw.text((value_x, y), str(values[key]), font=font(font_index, size), fill="#17392b")
        draw.line((43, y + 40, 711, y + 40), fill="#e2ece4", width=1)
        y += 75 if layout == 2 else 70
    condition = "clean" if index % 5 == 0 else ["rotated", "blur", "low_light", "glare"][index % 4]
    if condition == "rotated":
        image = image.rotate(rng.choice([-2, 2]), resample=Image.Resampling.BICUBIC, fillcolor="#fffdf7")
    elif condition == "blur":
        image = image.filter(ImageFilter.GaussianBlur(.55 if split == "development" else .8))
    elif condition == "low_light":
        image = Image.blend(image, Image.new("RGB", image.size, "#25332b"), .16)
    elif condition == "glare":
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        ImageDraw.Draw(overlay).ellipse((440, 200, 730, 650), fill=(255, 255, 255, 53))
        image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    name = f"{split}-{index:03}.png"
    image.save(ROOT / name, optimize=True)
    return {"file": name, "split": split, "layout": layout, "condition": condition, "values": values}


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    rows = [make_sheet(rng, i, split) for split, count in (("development", 20), ("holdout", 80)) for i in range(count)]
    (ROOT / "manifest.json").write_text(json.dumps({"seed": SEED, "rows": rows}, indent=2), encoding="utf-8")
    print(f"Generated {len(rows)} fictional copies in {ROOT}")


if __name__ == "__main__":
    main()
