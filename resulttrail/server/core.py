"""Local, synthetic-only AegisRelay API.

The database and signing key live under instance/, never in the public source tree.
One SQLite transaction accepts each result version and its receipt together.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INSTANCE = ROOT / "instance"
COOKIE = "aegis_session"
KEY_ID = "demo-local-v1"


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    return b64(salt + hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1))


def password_ok(password: str, encoded: str) -> bool:
    try:
        stored = unb64(encoded)
        salt, expected = stored[:16], stored[16:]
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(expected, actual)
    except (ValueError, TypeError):
        return False


@contextmanager
def connection(db_path: Path) -> Iterator[sqlite3.Connection]:
    db = sqlite3.connect(db_path, timeout=10, isolation_level=None, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=FULL")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=10000")
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def init_db(db_path: Path) -> None:
    with connection(db_path) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS account (
              alias TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
              role TEXT NOT NULL CHECK(role IN ('reporter','reviewer')),
              tenant TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS session (
              token_hash TEXT PRIMARY KEY, alias TEXT NOT NULL REFERENCES account(alias),
              csrf TEXT NOT NULL, expires INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS result_version (
              tenant TEXT NOT NULL, report_id TEXT NOT NULL, version INTEGER NOT NULL,
              payload_json TEXT NOT NULL, digest TEXT NOT NULL,
              reporter TEXT NOT NULL REFERENCES account(alias),
              received_at TEXT NOT NULL, receipt_json TEXT NOT NULL,
              PRIMARY KEY(tenant,report_id,version)
            );
            CREATE TABLE IF NOT EXISTS review_action (
              id INTEGER PRIMARY KEY AUTOINCREMENT, tenant TEXT NOT NULL,
              report_id TEXT NOT NULL, version INTEGER NOT NULL,
              reviewer TEXT NOT NULL REFERENCES account(alias),
              decision TEXT NOT NULL CHECK(decision IN ('reviewed','approved','needs_correction')),
              note TEXT NOT NULL, created_at TEXT NOT NULL,
              FOREIGN KEY(tenant,report_id,version)
                REFERENCES result_version(tenant,report_id,version)
            );
            CREATE TABLE IF NOT EXISTS export_package (
              export_id TEXT PRIMARY KEY, tenant TEXT NOT NULL,
              report_id TEXT NOT NULL, version INTEGER NOT NULL,
              body_json TEXT NOT NULL, digest TEXT NOT NULL,
              signature TEXT NOT NULL, approver TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS result_reporter_idx ON result_version(reporter,report_id);
            CREATE INDEX IF NOT EXISTS review_report_idx ON review_action(tenant,report_id,version,id);
            """
        )


def load_or_create_key(path: Path) -> Ed25519PrivateKey:
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = Ed25519PrivateKey.generate()
    raw = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    path.write_bytes(raw)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return key


def sign(key: Ed25519PrivateKey, body: dict[str, Any]) -> str:
    return b64(key.sign(canonical(body)))


class CaptureChecklist(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    copy_seen: Literal[True]
    figures_compared: Literal[True]
    location_checked: Literal[True]
    recorded_at: str

    @field_validator("recorded_at")
    @classmethod
    def device_time(cls, value: str) -> str:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", value):
            raise ValueError("Use an ISO device timestamp")
        return value


class ResultData(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    election_id: str = Field(min_length=5, max_length=40)
    unit_id: str = Field(min_length=5, max_length=40)
    accredited: StrictInt = Field(ge=0, le=10000)
    cast: StrictInt = Field(ge=0, le=10000)
    valid: StrictInt = Field(ge=0, le=10000)
    rejected: StrictInt = Field(ge=0, le=10000)
    party_votes: dict[str, StrictInt] = Field(min_length=2, max_length=26)
    source_note: str = Field(max_length=200)
    state: str | None = Field(default=None, max_length=60)
    lga: str | None = Field(default=None, max_length=60)
    ward: str | None = Field(default=None, max_length=60)
    capture: CaptureChecklist | None = None

    @field_validator("election_id", "unit_id")
    @classmethod
    def fictional_code(cls, value: str) -> str:
        if not re.fullmatch(r"SIM-[A-Z0-9-]+", value):
            raise ValueError("Codes must begin with SIM-")
        return value

    @field_validator("party_votes")
    @classmethod
    def fictional_parties(cls, votes: dict[str, int]) -> dict[str, int]:
        if any(not re.fullmatch(r"[A-Z][A-Z0-9-]{0,11}", key) or val < 0 or val > 10000 for key, val in votes.items()):
            raise ValueError("Use 2-26 party codes and counts from 0 to 10000")
        return votes

    @field_validator("state", "lga", "ward")
    @classmethod
    def location_label(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 .'/&()-]{0,59}", value):
            raise ValueError("Use a short location label")
        return value


class ResultSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: uuid.UUID
    version: StrictInt = Field(ge=1, le=1000)
    data: ResultData


class LoginBody(BaseModel):
    alias: str
    password: str


class DecisionBody(BaseModel):
    decision: Literal["reviewed", "approved", "needs_correction"]
    version: StrictInt = Field(ge=1, le=1000)
    note: str = Field(min_length=2, max_length=500)


class ExportBody(BaseModel):
    report_id: uuid.UUID


def checks(data: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    if sum(data["party_votes"].values()) != data["valid"]:
        flags.append("Party totals differ from recorded valid votes; compare the source.")
    if data["valid"] + data["rejected"] != data["cast"]:
        flags.append("Valid plus rejected differs from recorded votes cast; compare the source.")
    if data["cast"] > data["accredited"]:
        flags.append("Recorded votes cast exceed accredited voters; human review required.")
    return flags


def create_app(instance_path: Path | None = None) -> FastAPI:
    instance = Path(instance_path or os.getenv("AEGIS_INSTANCE", DEFAULT_INSTANCE)).resolve()
    instance.mkdir(parents=True, exist_ok=True)
    db_path, key_path = instance / "aegis.sqlite", instance / "receipt-key.pem"
    init_db(db_path)
    key = load_or_create_key(key_path)
    public_raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    app = FastAPI(title="AegisRelay synthetic MVP", docs_url=None, redoc_url=None)
    app.state.db_path = db_path
    app.state.key = key

    def current(request: Request) -> dict[str, str]:
        token = request.cookies.get(COOKIE)
        if not token:
            raise HTTPException(401, "Sign in required")
        with connection(db_path) as db:
            row = db.execute(
                """SELECT a.alias,a.role,a.tenant,s.csrf FROM session s
                   JOIN account a ON a.alias=s.alias
                   WHERE s.token_hash=? AND s.expires>? AND a.active=1""",
                (hashlib.sha256(token.encode()).hexdigest(), int(time.time())),
            ).fetchone()
        if not row:
            raise HTTPException(401, "Session expired; queued data stays on this device")
        return dict(row)

    def write_access(request: Request, actor: dict[str, str] = Depends(current)) -> dict[str, str]:
        if not hmac.compare_digest(request.headers.get("X-CSRF-Token", ""), actor["csrf"]):
            raise HTTPException(403, "CSRF token required")
        return actor

    def role(actor: dict[str, str], expected: str) -> None:
        if actor["role"] != expected:
            raise HTTPException(403, "Role not permitted")

    def latest(db: sqlite3.Connection, actor: dict[str, str], report_id: str) -> sqlite3.Row:
        row = db.execute(
            """SELECT * FROM result_version WHERE tenant=? AND report_id=?
               ORDER BY version DESC LIMIT 1""",
            (actor["tenant"], report_id),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Result not found")
        if actor["role"] == "reporter" and row["reporter"] != actor["alias"]:
            raise HTTPException(404, "Result not found")
        return row

    @app.middleware("http")
    async def headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/api/session")
    def login(body: LoginBody, response: Response):
        with connection(db_path) as db:
            row = db.execute("SELECT * FROM account WHERE alias=? AND active=1", (body.alias,)).fetchone()
            if not row or not password_ok(body.password, row["password_hash"]):
                raise HTTPException(401, "Invalid credentials")
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
            db.execute(
                "INSERT INTO session(token_hash,alias,csrf,expires) VALUES(?,?,?,?)",
                (hashlib.sha256(token.encode()).hexdigest(), row["alias"], csrf, int(time.time()) + 8 * 3600),
            )
        response.set_cookie(
            COOKIE, token, max_age=8 * 3600, httponly=True, secure=os.getenv("AEGIS_HTTPS") == "1",
            samesite="strict", path="/",
        )
        return {"alias": row["alias"], "role": row["role"], "tenant": row["tenant"], "csrf": csrf}

    @app.get("/api/session")
    def session(actor: dict[str, str] = Depends(current)):
        return actor

    @app.delete("/api/session")
    def logout(response: Response, request: Request, actor: dict[str, str] = Depends(write_access)):
        token = request.cookies.get(COOKIE, "")
        with connection(db_path) as db:
            db.execute("DELETE FROM session WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
        response.delete_cookie(COOKIE)
        return {"ok": True}

    @app.get("/api/public-key/{key_id}")
    def public_key(key_id: str):
        if key_id != KEY_ID:
            raise HTTPException(404, "Unknown key")
        return {"key_id": KEY_ID, "algorithm": "Ed25519", "public_key": b64(public_raw)}

    @app.post("/api/results")
    def submit(body: ResultSubmission, actor: dict[str, str] = Depends(write_access)):
        role(actor, "reporter")
        payload = body.model_dump(mode="json", exclude_none=True)
        report_id = str(body.report_id)
        payload_digest = digest(payload)
        with connection(db_path) as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute(
                "SELECT digest,receipt_json,reporter FROM result_version WHERE tenant=? AND report_id=? AND version=?",
                (actor["tenant"], report_id, body.version),
            ).fetchone()
            if existing:
                if existing["reporter"] != actor["alias"]:
                    raise HTTPException(404, "Result not found")
                if existing["digest"] != payload_digest:
                    raise HTTPException(409, "This report/version already has different content")
                return {"receipt": json.loads(existing["receipt_json"]), "replayed": True}
            prev = db.execute(
                "SELECT MAX(version) AS v, MIN(reporter) AS reporter FROM result_version WHERE tenant=? AND report_id=?",
                (actor["tenant"], report_id),
            ).fetchone()
            if prev["v"] is None and body.version != 1:
                raise HTTPException(409, "First version must be 1")
            if prev["v"] is not None and (prev["reporter"] != actor["alias"] or body.version != prev["v"] + 1):
                raise HTTPException(409, "Only the original reporter can add the next version")
            received_at = utc_now()
            receipt_body = {
                "tenant": actor["tenant"], "report_id": report_id, "version": body.version,
                "digest": payload_digest, "received_at": received_at, "key_id": KEY_ID,
            }
            receipt = {"body": receipt_body, "signature": sign(key, receipt_body)}
            db.execute(
                """INSERT INTO result_version
                   (tenant,report_id,version,payload_json,digest,reporter,received_at,receipt_json)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (actor["tenant"], report_id, body.version, canonical(payload).decode(),
                 payload_digest, actor["alias"], received_at, canonical(receipt).decode()),
            )
        return {"receipt": receipt, "replayed": False, "flags": checks(payload["data"])}

    @app.get("/api/results/{report_id}/status")
    def status(report_id: uuid.UUID, actor: dict[str, str] = Depends(current)):
        with connection(db_path) as db:
            newest = latest(db, actor, str(report_id))
            rows = db.execute(
                "SELECT * FROM result_version WHERE tenant=? AND report_id=? ORDER BY version",
                (actor["tenant"], str(report_id)),
            ).fetchall()
            review = db.execute(
                """SELECT decision,note,created_at FROM review_action
                   WHERE tenant=? AND report_id=? AND version=? ORDER BY id DESC LIMIT 1""",
                (actor["tenant"], str(report_id), newest["version"]),
            ).fetchone()
        return {
            "report_id": str(report_id), "latest_version": newest["version"], "state": "reviewed" if review else "received",
            "review": dict(review) if review else None,
            "versions": [
                {"version": row["version"], "payload": json.loads(row["payload_json"]),
                 "receipt": json.loads(row["receipt_json"]),
                 "flags": checks(json.loads(row["payload_json"])["data"])} for row in rows
            ],
        }

    @app.get("/api/review")
    def review_queue(actor: dict[str, str] = Depends(current)):
        role(actor, "reviewer")
        with connection(db_path) as db:
            rows = db.execute(
                """SELECT r.* FROM result_version r JOIN
                   (SELECT report_id,MAX(version) AS v FROM result_version WHERE tenant=? GROUP BY report_id) latest
                   ON r.report_id=latest.report_id AND r.version=latest.v
                   WHERE r.tenant=? ORDER BY r.received_at DESC""",
                (actor["tenant"], actor["tenant"]),
            ).fetchall()
            items = []
            for row in rows:
                review = db.execute(
                    """SELECT decision,note,created_at FROM review_action WHERE tenant=? AND report_id=?
                       AND version=? ORDER BY id DESC LIMIT 1""",
                    (actor["tenant"], row["report_id"], row["version"]),
                ).fetchone()
                payload = json.loads(row["payload_json"])
                items.append({"report_id": row["report_id"], "version": row["version"],
                              "payload": payload, "receipt": json.loads(row["receipt_json"]),
                              "flags": checks(payload["data"]),
                              "review": dict(review) if review else None,
                              "received_at": row["received_at"], "evidence_digest": None})
        return {"items": items}

    @app.get("/api/my-results")
    def my_results(actor: dict[str, str] = Depends(current)):
        role(actor, "reporter")
        with connection(db_path) as db:
            rows = db.execute(
                """SELECT r.report_id,r.version,r.payload_json,r.digest,r.received_at,
                          (SELECT decision FROM review_action a WHERE a.tenant=r.tenant
                           AND a.report_id=r.report_id AND a.version=r.version
                           ORDER BY a.id DESC LIMIT 1) AS review_decision,
                          (SELECT note FROM review_action a WHERE a.tenant=r.tenant
                           AND a.report_id=r.report_id AND a.version=r.version
                           ORDER BY a.id DESC LIMIT 1) AS review_note,
                          (SELECT created_at FROM review_action a WHERE a.tenant=r.tenant
                           AND a.report_id=r.report_id AND a.version=r.version
                           ORDER BY a.id DESC LIMIT 1) AS review_created_at
                   FROM result_version r WHERE r.tenant=? AND r.reporter=?
                   AND r.version=(SELECT MAX(x.version) FROM result_version x
                                  WHERE x.tenant=r.tenant AND x.report_id=r.report_id)
                   ORDER BY r.received_at DESC LIMIT 100""",
                (actor["tenant"], actor["alias"]),
            ).fetchall()
        return {"items": [{"report_id": row["report_id"], "version": row["version"],
                           "unit_id": json.loads(row["payload_json"])["data"]["unit_id"],
                           "digest": row["digest"], "received_at": row["received_at"], "review_decision": row["review_decision"],
                           "review_note": row["review_note"], "review_created_at": row["review_created_at"]}
                          for row in rows]}

    @app.post("/api/review/{report_id}/decision")
    def decide(report_id: uuid.UUID, body: DecisionBody, actor: dict[str, str] = Depends(write_access)):
        role(actor, "reviewer")
        with connection(db_path) as db:
            row = latest(db, actor, str(report_id))
            if row["version"] != body.version:
                raise HTTPException(409, "A newer version needs review")
            final = db.execute(
                """SELECT 1 FROM review_action WHERE tenant=? AND report_id=? AND version=?
                   AND decision IN ('approved','needs_correction') LIMIT 1""",
                (actor["tenant"], str(report_id), row["version"]),
            ).fetchone()
            if final:
                raise HTTPException(409, "A final decision is already recorded for this version")
            db.execute(
                """INSERT INTO review_action(tenant,report_id,version,reviewer,decision,note,created_at)
                   VALUES(?,?,?,?,?,?,?)""",
                (actor["tenant"], str(report_id), row["version"], actor["alias"],
                 body.decision, body.note, utc_now()),
            )
        return {"ok": True, "version": row["version"]}

    @app.post("/api/exports")
    def make_export(body: ExportBody, actor: dict[str, str] = Depends(write_access)):
        role(actor, "reviewer")
        with connection(db_path) as db:
            db.execute("BEGIN IMMEDIATE")
            row = latest(db, actor, str(body.report_id))
            decision = db.execute(
                """SELECT decision FROM review_action WHERE tenant=? AND report_id=? AND version=?
                   ORDER BY id DESC LIMIT 1""",
                (actor["tenant"], str(body.report_id), row["version"]),
            ).fetchone()
            if not decision or decision["decision"] != "approved":
                raise HTTPException(409, "Latest version needs reviewer approval")
            payload = json.loads(row["payload_json"])
            data = payload["data"]
            selected = {key: data[key] for key in
                        ("election_id", "unit_id", "accredited", "cast", "valid", "rejected", "party_votes")}
            export_id = str(uuid.uuid4())
            export_body = {"export_id": export_id, "report_id": str(body.report_id),
                           "version": row["version"], "result": selected,
                           "receipt": json.loads(row["receipt_json"]), "notice": "SIMULATED; not an official result"}
            export_digest = digest(export_body)
            signature = sign(key, {"digest": export_digest, "key_id": KEY_ID})
            db.execute(
                """INSERT INTO export_package
                   (export_id,tenant,report_id,version,body_json,digest,signature,approver,created_at)
                   VALUES(?,?,?,?,?,?,?,?,?)""",
                (export_id, actor["tenant"], str(body.report_id), row["version"],
                 canonical(export_body).decode(), export_digest, signature, actor["alias"], utc_now()),
            )
        return {"body": export_body, "digest": export_digest, "signature": signature, "key_id": KEY_ID}

    @app.get("/api/exports/{export_id}")
    def get_export(export_id: uuid.UUID, actor: dict[str, str] = Depends(current)):
        role(actor, "reviewer")
        with connection(db_path) as db:
            row = db.execute(
                "SELECT * FROM export_package WHERE export_id=? AND tenant=?",
                (str(export_id), actor["tenant"]),
            ).fetchone()
        if not row:
            raise HTTPException(404, "Export not found")
        return {"body": json.loads(row["body_json"]), "digest": row["digest"],
                "signature": row["signature"], "key_id": KEY_ID}

    @app.get("/api/health")
    def health():
        return {"ok": True, "mode": "synthetic-only"}

    dist = ROOT / "client" / "dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")

    return app


app = create_app()
