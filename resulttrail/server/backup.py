"""Consistent local demo backup and read-only restoration check."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path

from cryptography.hazmat.primitives import serialization

from .core import DEFAULT_INSTANCE
from .verify import verify_receipt


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(folder: Path) -> int:
    key = serialization.load_pem_private_key((folder / "receipt-key.pem").read_bytes(), password=None)
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    import base64
    public_b64 = base64.urlsafe_b64encode(public).decode().rstrip("=")
    with sqlite3.connect(folder / "aegis.sqlite") as db:
        rows = db.execute("SELECT payload_json,receipt_json FROM result_version").fetchall()
    for payload, receipt in rows:
        if not verify_receipt(json.loads(receipt), public_b64, json.loads(payload)):
            raise ValueError("Receipt inventory failed verification")
    return len(rows)


def backup(source: Path, target: Path) -> dict:
    if target.exists():
        raise FileExistsError("Backup target must be a new directory")
    target.mkdir(parents=True)
    with sqlite3.connect(source / "aegis.sqlite") as current, sqlite3.connect(target / "aegis.sqlite") as copy:
        current.backup(copy)
    shutil.copy2(source / "receipt-key.pem", target / "receipt-key.pem")
    manifest = {"kind": "AegisRelay synthetic backup", "results": inventory(target),
                "sha256": {name: sha(target / name) for name in ("aegis.sqlite", "receipt-key.pem")}}
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def verify(folder: Path) -> dict:
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    for name, expected in manifest["sha256"].items():
        if sha(folder / name) != expected:
            raise ValueError(f"Backup file changed: {name}")
    count = inventory(folder)
    if count != manifest["results"]:
        raise ValueError("Receipt inventory count changed")
    return manifest


def restore(source: Path, target: Path) -> dict:
    manifest = verify(source)
    if target.exists():
        raise FileExistsError("Restore target must be a new directory")
    target.mkdir(parents=True)
    for name in ("aegis.sqlite", "receipt-key.pem"):
        shutil.copy2(source / name, target / name)
    if inventory(target) != manifest["results"]:
        raise ValueError("Restored receipt inventory differs")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("create", "verify", "restore"))
    parser.add_argument("directory", type=Path)
    parser.add_argument("target", type=Path, nargs="?")
    args = parser.parse_args()
    if args.action == "restore":
        if args.target is None:
            parser.error("restore requires a new target directory")
        result = restore(args.directory, args.target)
    else:
        if args.target is not None:
            parser.error("target is only used with restore")
        result = backup(DEFAULT_INSTANCE, args.directory) if args.action == "create" else verify(args.directory)
    print(f"VALID backup: {result['results']} received versions")


if __name__ == "__main__":
    main()
