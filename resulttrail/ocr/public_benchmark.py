"""Prepare third-party OCR stress tests outside the shipped application.

SROIE is fetched from its CC-BY-4.0 labelled derivative on Hugging Face.
FUNSD must be obtained separately under its own non-commercial terms.
No third-party image is committed or uploaded to ResultTrail.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "instance" / "public-ocr"
SROIE = "jsdnrs/ICDAR2019-SROIE"
SROIE_REVISION = "bffe40c26759f3376ec2b3ae9031dbba54cd587c"
CAPS = {"750kb": 750_000, "1_5mb": 1_500_000, "2mb": 2_000_000}


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=45) as response:
        return json.load(response)


def fetch_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def image_size(data: bytes) -> tuple[int, int]:
    with Image.open(BytesIO(data)) as image:
        image.verify()
    with Image.open(BytesIO(data)) as image:
        return image.size


def write_original(data: bytes, folder: Path, name: str, suffix: str) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    image = folder / f"{name}{suffix}"
    image.write_bytes(data)
    width, height = image_size(data)
    return {"path": str(image.relative_to(ROOT)).replace("\\", "/"),
            "bytes": len(data), "width": width, "height": height,
            "sha256": hashlib.sha256(data).hexdigest()}


def cap_image(original: dict, label: str, cap: int) -> dict:
    source = ROOT / original["path"]
    if original["bytes"] <= cap:
        return {**original, "changed": False, "cap_bytes": cap}
    folder = source.parent.parent / "variants"
    folder.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as loaded:
        image = loaded.convert("RGB")
    for _ in range(8):
        for quality in (95, 90, 85, 80, 75, 65, 55, 45, 35, 25):
            buffer = BytesIO()
            image.save(buffer, "JPEG", quality=quality, optimize=True)
            data = buffer.getvalue()
            if len(data) <= cap:
                target = folder / f"{source.stem}-{label}.jpg"
                target.write_bytes(data)
                return {"path": str(target.relative_to(ROOT)).replace("\\", "/"),
                        "bytes": len(data), "width": image.width, "height": image.height,
                        "sha256": hashlib.sha256(data).hexdigest(), "changed": True,
                        "cap_bytes": cap, "jpeg_quality": quality}
        image = image.resize((max(1, round(image.width * .85)), max(1, round(image.height * .85))), Image.Resampling.LANCZOS)
    raise ValueError(f"Could not fit {source} within {cap} bytes")


def variants(original: dict) -> dict:
    return {"original": {**original, "changed": False},
            **{label: cap_image(original, label, cap) for label, cap in CAPS.items()}}


def sroie(limit: int, split: str) -> dict:
    folder = ROOT / "sroie"
    rows = []
    for offset in range(0, limit, 100):
        query = urllib.parse.urlencode({"dataset": SROIE, "revision": SROIE_REVISION,
                                        "config": "default", "split": split,
                                        "offset": offset, "length": min(100, limit - offset)})
        page = fetch_json(f"https://datasets-server.huggingface.co/rows?{query}")
        for item in page["rows"]:
            row = item["row"]
            key = row["key"]
            saved = folder / "originals" / f"{key}.jpg"
            data = saved.read_bytes() if saved.exists() else fetch_bytes(row["image"]["src"])
            original = write_original(data, folder / "originals", key, ".jpg")
            words = [{"text": text, "box": box} for text, box in zip(row["words"], row["bboxes"])]
            rows.append({"id": key, "ground_truth": words, "variants": variants(original)})
    return {"dataset": "SROIE", "split": split, "source": "https://huggingface.co/datasets/jsdnrs/ICDAR2019-SROIE",
            "source_revision": SROIE_REVISION,
            "terms": "Derivative identifies CC-BY-4.0; attribute Huang et al. and jsdnrs; do not commit images.",
            "rows": rows}


def funsd(folder: Path, limit: int) -> dict:
    # The caller must obtain and accept FUNSD's own terms; this tool never downloads it.
    test = folder / "dataset" / "testing_data"
    if not test.is_dir():
        test = folder / "testing_data"
    if not (test / "images").is_dir() or not (test / "annotations").is_dir():
        raise ValueError("FUNSD root must contain dataset/testing_data/{images,annotations} or testing_data/{images,annotations}")
    output = ROOT / "funsd"
    rows = []
    for annotation in sorted((test / "annotations").glob("*.json"))[:limit]:
        image = test / "images" / f"{annotation.stem}.png"
        if not image.exists():
            raise FileNotFoundError(image)
        original = write_original(image.read_bytes(), output / "originals", annotation.stem, ".png")
        source = json.loads(annotation.read_text(encoding="utf-8"))
        words = [{"text": word["text"], "box": word["box"]}
                 for entity in source["form"] for word in entity["words"] if word["text"].strip()]
        rows.append({"id": annotation.stem, "ground_truth": words, "variants": variants(original)})
    return {"dataset": "FUNSD", "split": "official testing_data", "source": "https://guillaumejaume.github.io/FUNSD/",
            "terms": "Original terms: non-commercial research/educational use only; obtain separately and do not commit images.",
            "rows": rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="dataset", required=True)
    receipt = sub.add_parser("sroie")
    receipt.add_argument("--limit", type=int, default=30)
    receipt.add_argument("--split", choices=("train", "test"), default="test")
    form = sub.add_parser("funsd")
    form.add_argument("--root", type=Path, required=True)
    form.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 1000:
        parser.error("limit must be between 1 and 1000")
    manifest = sroie(args.limit, args.split) if args.dataset == "sroie" else funsd(args.root, args.limit)
    folder = ROOT / args.dataset
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(path), "dataset": manifest["dataset"], "images": len(manifest["rows"]),
                      "changed_at_750kb": sum(row["variants"]["750kb"]["changed"] for row in manifest["rows"])}))


if __name__ == "__main__":
    main()
