import copy
import uuid

from fastapi.testclient import TestClient

from server.core import connection, create_app, password_hash
from server.verify import verify_export, verify_receipt


def setup(tmp_path):
    app = create_app(tmp_path)
    with connection(tmp_path / "aegis.sqlite") as db:
        for alias, role, tenant in (
            ("reporter", "reporter", "synthetic-team"),
            ("other", "reporter", "synthetic-team"),
            ("outsider", "reporter", "different-team"),
            ("reviewer", "reviewer", "synthetic-team"),
        ):
            db.execute(
                "INSERT INTO account(alias,password_hash,role,tenant) VALUES(?,?,?,?)",
                (alias, password_hash("demo-test-password"), role, tenant),
            )
    return app


def login(client, alias):
    response = client.post("/api/session", json={"alias": alias, "password": "demo-test-password"})
    assert response.status_code == 200
    return response.json()["csrf"]


def sample():
    return {
        "report_id": str(uuid.uuid4()), "version": 1,
        "data": {
            "election_id": "SIM-2027", "unit_id": "SIM-UNIT-01",
            "accredited": 120, "cast": 100, "valid": 97, "rejected": 3,
            "party_votes": {"A": 70, "B": 27}, "source_note": "Fictional exercise",
        },
    }


def test_receipt_replay_correction_review_and_export(tmp_path):
    app = setup(tmp_path)
    reporter = TestClient(app)
    csrf = login(reporter, "reporter")
    body = sample()
    headers = {"X-CSRF-Token": csrf}

    first = reporter.post("/api/results", json=body, headers=headers)
    assert first.status_code == 200
    assert first.json()["replayed"] is False
    repeat = reporter.post("/api/results", json=body, headers=headers)
    assert repeat.status_code == 200
    assert repeat.json()["replayed"] is True
    assert repeat.json()["receipt"] == first.json()["receipt"]

    public = reporter.get("/api/public-key/demo-local-v1").json()
    assert verify_receipt(first.json()["receipt"], public["public_key"], body)
    altered = copy.deepcopy(body)
    altered["data"]["valid"] = 98
    assert not verify_receipt(first.json()["receipt"], public["public_key"], altered)
    assert reporter.post("/api/results", json=altered, headers=headers).status_code == 409

    version_two = copy.deepcopy(body)
    version_two["version"] = 2
    version_two["data"]["source_note"] = "Corrected fictional exercise"
    assert reporter.post("/api/results", json=version_two, headers=headers).status_code == 200
    state = reporter.get(f"/api/results/{body['report_id']}/status").json()
    assert [v["version"] for v in state["versions"]] == [1, 2]
    assert state["state"] == "received"
    assert reporter.get('/api/my-results').json()['items'][0]['version'] == 2

    reviewer = TestClient(app)
    review_csrf = login(reviewer, "reviewer")
    queue = reviewer.get("/api/review").json()["items"]
    assert len(queue) == 1 and queue[0]["version"] == 2
    assert reporter.post("/api/exports", json={"report_id": body["report_id"]}, headers=headers).status_code == 403
    assert reviewer.post("/api/exports", json={"report_id": body["report_id"]},
                         headers={"X-CSRF-Token": review_csrf}).status_code == 409
    decision = reviewer.post(
        f"/api/review/{body['report_id']}/decision",
        json={"decision": "approved", "version": 2, "note": "Checked fictional values"},
        headers={"X-CSRF-Token": review_csrf},
    )
    assert decision.status_code == 200
    repeat = reviewer.post(
        f"/api/review/{body['report_id']}/decision",
        json={"decision": "needs_correction", "version": 2, "note": "Conflicting second decision"},
        headers={"X-CSRF-Token": review_csrf},
    )
    assert repeat.status_code == 409
    export = reviewer.post("/api/exports", json={"report_id": body["report_id"]},
                           headers={"X-CSRF-Token": review_csrf})
    assert export.status_code == 200
    package = export.json()
    assert "source_note" not in package["body"]["result"]
    assert verify_export(package, public["public_key"])
    package["body"]["result"]["valid"] = 1
    assert not verify_export(package, public["public_key"])


def test_permissions_csrf_and_arithmetic(tmp_path):
    app = setup(tmp_path)
    reporter = TestClient(app)
    csrf = login(reporter, "reporter")
    body = sample()
    body["data"]["cast"] = 121
    assert reporter.post("/api/results", json=body).status_code == 403
    result = reporter.post("/api/results", json=body, headers={"X-CSRF-Token": csrf})
    assert result.status_code == 200
    assert len(result.json()["flags"]) == 2
    assert reporter.get("/api/review").status_code == 403

    other = TestClient(app)
    other_csrf = login(other, "other")
    assert other.get(f"/api/results/{body['report_id']}/status").status_code == 404
    assert other.post("/api/results", json=body, headers={"X-CSRF-Token": other_csrf}).status_code == 404

    outsider = TestClient(app)
    login(outsider, "outsider")
    assert outsider.get(f"/api/results/{body['report_id']}/status").status_code == 404


def test_multiple_party_codes_survive_receipt_and_review(tmp_path):
    app = setup(tmp_path)
    reporter = TestClient(app)
    csrf = login(reporter, "reporter")
    body = sample()
    body["data"]["party_votes"] = {"APC": 50, "PDP": 27, "LP": 15, "NNPP": 5}
    result = reporter.post("/api/results", json=body, headers={"X-CSRF-Token": csrf})
    assert result.status_code == 200
    assert result.json()["flags"] == []
    public = reporter.get("/api/public-key/demo-local-v1").json()
    assert verify_receipt(result.json()["receipt"], public["public_key"], body)
    reviewer = TestClient(app)
    login(reviewer, "reviewer")
    assert reviewer.get("/api/review").json()["items"][0]["payload"]["data"]["party_votes"] == body["data"]["party_votes"]


def test_invalid_input_and_valid_low_cast(tmp_path):
    app = setup(tmp_path)
    client = TestClient(app)
    csrf = login(client, "reporter")
    body = sample()
    result = client.post("/api/results", json=body, headers={"X-CSRF-Token": csrf})
    assert result.status_code == 200
    assert result.json()["flags"] == []  # 100 cast is below 120 accredited and valid.
    bad = sample()
    bad["data"]["unit_id"] = "REAL-UNIT"
    assert client.post("/api/results", json=bad, headers={"X-CSRF-Token": csrf}).status_code == 422
    bad = sample()
    bad["data"]["valid"] = -1
    assert client.post("/api/results", json=bad, headers={"X-CSRF-Token": csrf}).status_code == 422


def test_capture_checklist_and_reporter_feedback(tmp_path):
    app = setup(tmp_path)
    reporter = TestClient(app)
    csrf = login(reporter, "reporter")
    body = sample()
    body["data"]["capture"] = {
        "copy_seen": True, "figures_compared": True, "location_checked": True,
        "recorded_at": "2026-10-27T12:00:00.000Z",
    }
    response = reporter.post("/api/results", json=body, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 200
    public = reporter.get("/api/public-key/demo-local-v1").json()
    assert verify_receipt(response.json()["receipt"], public["public_key"], body)
    reviewer = TestClient(app)
    review_csrf = login(reviewer, "reviewer")
    assert reviewer.post(
        f"/api/review/{body['report_id']}/decision",
        json={"decision": "needs_correction", "version": 1, "note": "Please recheck the copy"},
        headers={"X-CSRF-Token": review_csrf},
    ).status_code == 200
    progress = reporter.get("/api/my-results").json()["items"][0]
    assert progress["received_at"] and progress["review_created_at"]
    assert progress["review_decision"] == "needs_correction"
    assert progress["review_note"] == "Please recheck the copy"
    incomplete = sample()
    incomplete["data"]["capture"] = {**body["data"]["capture"], "figures_compared": False}
    assert reporter.post("/api/results", json=incomplete, headers={"X-CSRF-Token": csrf}).status_code == 422
