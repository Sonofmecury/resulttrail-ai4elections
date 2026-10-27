"""Draw clearly illustrative source copies for the hackathon seed records."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

output = Path(__file__).resolve().parents[2] / "instance"
output.mkdir(exist_ok=True)
rows = json.load(sys.stdin)
font_path = Path("C:/Windows/Fonts/arial.ttf")
title_font = ImageFont.truetype(str(font_path), 34) if font_path.exists() else ImageFont.load_default()
body_font = ImageFont.truetype(str(font_path), 25) if font_path.exists() else ImageFont.load_default()
small_font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()

for row in rows:
    data = row["data"]
    image = Image.new("RGB", (720, 840), "#fffdf8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 720, 115), fill="#006747")
    draw.text((42, 31), "ResultTrail source copy", font=title_font, fill="white")
    draw.text((42, 137), "ILLUSTRATIVE · NOT AN OFFICIAL RESULT FORM", font=small_font, fill="#a36c20")
    draw.line((42, 183, 678, 183), fill="#b6cfbd", width=2)
    lines = [
        ("Unit code", data["unit_id"]), ("State", data["state"]),
        ("LGA / Ward", f"{data['lga']} / {data['ward']}"),
        ("Accredited", str(data["accredited"])), ("Votes cast", str(data["cast"])),
        ("Valid votes", str(data["valid"])), ("Rejected", str(data["rejected"])),
        ("Party A", str(data["party_votes"]["A"])),
        ("Party B", str(data["party_votes"]["B"])),
        ("Party C", str(data["party_votes"]["C"])),
    ]
    y = 216
    for label, value in lines:
        draw.text((46, y), label, font=body_font, fill="#315641")
        draw.text((300, y), value, font=body_font, fill="#18382d")
        draw.line((42, y + 43, 678, y + 43), fill="#e2eae2", width=1)
        y += 55
    draw.text((44, 782), "Prepared for a controlled ResultTrail demonstration", font=small_font, fill="#799080")
    image.save(output / f"hackathon-source-{row['index']}.png", optimize=True)
