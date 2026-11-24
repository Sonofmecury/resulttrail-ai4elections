"""Render clearly fictional source sheets and PNG captures for the geographic demo."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "instance" / "geographic-demo"
OUT.mkdir(parents=True, exist_ok=True)
POPPLER = shutil.which("pdftoppm")
if not POPPLER:
    raise SystemExit("pdftoppm is required to capture the generated PDF sheets")


def draw_sheet(row: dict) -> dict:
    index = row["index"]
    data = row["source_data"]
    stem = f"source-{index:02d}"
    pdf = OUT / f"{stem}.pdf"
    png = OUT / f"{stem}.png"
    width, height = A4
    paper = canvas.Canvas(str(pdf), pagesize=A4, pageCompression=1)
    paper.setTitle(f"Fictional ResultTrail source sheet {data['unit_id']}")
    paper.setAuthor("ResultTrail demonstration")
    paper.setFillColor(colors.HexColor("#006747"))
    paper.rect(0, height - 95, width, 95, stroke=0, fill=1)
    paper.setFillColor(colors.white)
    paper.setFont("Helvetica-Bold", 23)
    paper.drawString(43, height - 51, "Illustrative result copy")
    paper.setFont("Helvetica", 10)
    paper.drawString(44, height - 72, "RESULTTRAIL DEMONSTRATION  /  NOT AN OFFICIAL ELECTION FORM")
    paper.setFillColor(colors.HexColor("#193d30"))
    paper.setFont("Helvetica-Bold", 12)
    paper.drawString(44, height - 128, data["unit_id"])
    paper.setFont("Helvetica", 11)
    paper.drawString(44, height - 150, f"{data['state']}  /  {data['lga']}  /  {data['ward']}")
    paper.setStrokeColor(colors.HexColor("#c7ded0"))
    paper.line(44, height - 169, width - 44, height - 169)

    rows = [
        ("Accredited", data["accredited"]),
        ("Votes cast", data["cast"]),
        ("Valid votes", data["valid"]),
        ("Rejected", data["rejected"]),
        *[(f"Party {code}", votes) for code, votes in data["party_votes"].items()],
    ]
    y = height - 215
    for label, value in rows:
        paper.setFont("Helvetica", 18)
        paper.setFillColor(colors.HexColor("#193d30"))
        # One label and one integer per line match the deliberately narrow OCR parser.
        paper.drawString(52, y, f"{label}  {value}")
        paper.setStrokeColor(colors.HexColor("#e1ece4"))
        paper.line(47, y - 13, width - 47, y - 13)
        y -= 49
    paper.setFont("Helvetica", 9)
    paper.setFillColor(colors.HexColor("#5f796b"))
    paper.drawString(44, 61, "Invented figures for testing the ResultTrail capture and review workflow")
    paper.drawString(44, 46, "A rendered capture of this PDF is the attached source image; no real votes are represented.")
    paper.save()

    subprocess.run(
        [POPPLER, "-f", "1", "-l", "1", "-singlefile", "-r", "145", "-png", str(pdf), str(OUT / stem)],
        check=True,
        capture_output=True,
    )
    with Image.open(png) as image:
        image.verify()
    size = png.stat().st_size
    if size > 750_000:
        raise ValueError(f"{png.name} is {size} bytes, exceeding the 750 KB evidence cap")
    return {"index": index, "pdf": str(pdf), "png": str(png), "size": size}


items = json.load(sys.stdin)
print(json.dumps([draw_sheet(row) for row in items]))
