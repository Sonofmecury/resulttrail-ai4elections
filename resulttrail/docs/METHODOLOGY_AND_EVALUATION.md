# Methodology and evaluation — current state

## Approach

The client stores drafts and queued report versions in an encrypted local vault. A reporter can submit an immutable version after reconnecting. The backend stores a canonical payload digest and returns a signed receipt; the browser verifies both before showing delivery. Review decisions and notes are returned to the reporter. Source images are stored as original bytes with a SHA-256 digest. Reviewer arithmetic checks flag discrepancies for human comparison only. The exact implementation and commands are in the [project README](../README.md) and [system card](system-card.md).

## Data and reproducibility

The web demonstration uses fictional records. The optional model benchmark uses an independently generated fictional 540-row training set and 300-row holdout, with fixed seed `20261026`. Run `python -m server.evaluate` from `resulttrail/` to reproduce [the JSON report](synthetic-evaluation.json). The [data sheet](DATASHEET.md) describes the cases and limitations.

## Evidence available now

- Five local API tests cover receipt replay, correction, role and tenant access, review, export, input validation, capture checks and reporter feedback. Run `python -m pytest -q` with the development requirements installed.
- The React client builds with `npm ci && npm run build`; the Worker type-checks with `npm ci && npm run check` in its own directory.
- The hosted `/api/health` endpoint returned HTTP 200 after the 27 October 2026 deployment. The unauthenticated `/api/my-results` endpoint returned HTTP 401. A live browser sign-in showed the checklist counter and Records privacy text.
- The optional Isolation Forest ranking failed the predeclared 0.05 incremental-recall gate (observed 0.0119) and is disabled. [Evaluation result](synthetic-evaluation.json).

## Failure cases and work remaining

Browser storage eviction, forgotten passphrases, a compromised device, misleading photos, inaccurate self-attested device time, and shared account credentials remain risks. No independent field, screen-reader, load or penetration test has been completed. Report completeness and time-to-file usability metrics need consented participant testing; no such measurements are claimed yet. Hosted deletion currently requires operator action. See [safety and limitations](SAFETY_AND_LIMITATIONS.md).
