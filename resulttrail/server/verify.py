"""Independent receipt/export verifier for synthetic demonstration packages."""

import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .core import canonical, digest, unb64


def verify_receipt(receipt: dict, public_key_b64: str, payload: dict | None = None) -> bool:
    try:
        key = Ed25519PublicKey.from_public_bytes(unb64(public_key_b64))
        key.verify(unb64(receipt["signature"]), canonical(receipt["body"]))
        if payload is not None and digest(payload) != receipt["body"]["digest"]:
            return False
        return True
    except (ValueError, KeyError, TypeError):
        return False
    except Exception:
        return False


def verify_export(package: dict, public_key_b64: str) -> bool:
    try:
        if digest(package["body"]) != package["digest"]:
            return False
        key = Ed25519PublicKey.from_public_bytes(unb64(public_key_b64))
        key.verify(unb64(package["signature"]), canonical({"digest": package["digest"], "key_id": package["key_id"]}))
        return verify_receipt(package["body"]["receipt"], public_key_b64)
    except (ValueError, KeyError, TypeError):
        return False
    except Exception:
        return False


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python -m server.verify PACKAGE.json PUBLIC_KEY.json")
    package = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    public = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    ok = verify_export(package, public["public_key"])
    print("VALID" if ok else "INVALID")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
