# ResultTrail system card — 27 October 2026

## Summary and intended use

ResultTrail is an offline-capable result-copy evidence workflow for a controlled, fictional demonstration. A reporter saves an encrypted local draft, confirms a short evidence checklist, syncs a version, verifies a signed receipt, and sees human review feedback. Reviewers inspect evidence and make a recorded decision. It does not authenticate paper copies, declare results, detect fraud, or connect to live electoral systems.

## Technology and data

The React PWA uses IndexedDB with passphrase-wrapped AES-GCM for local drafts and queued records. The hosted backend is a Cloudflare Worker with D1, role and tenant checks, Ed25519 receipts, SHA-256 digests, image-byte hashes, and immutable report versions. The local development backend is FastAPI with SQLite. The controlled demo uses fictional records. See [the data sheet](DATASHEET.md) and [full system card](system-card.md).

## AI status and evaluation

No model is active in the product. An optional Isolation Forest ranking was tested on a generated fictional holdout of 300 rows. At a fixed 60-case review budget, a robust peer baseline recalled 54 of 84 review-worthy cases and the model combination recalled 55 of 84. The 0.0119 incremental recall gain missed the predeclared 0.05 gate. The model therefore remains disabled. The benchmark does not support claims about real electoral accuracy. See [evaluation results](synthetic-evaluation.json) and [generator notes](synthetic-data-sheet.md).

## Oversight, errors and limits

Arithmetic discrepancies are prompts for human comparison, never accusations. Reviewers may approve, request correction, or mark reviewed; corrections create a new version. Device capture time is self-attested and can be wrong. Source photos can contain misleading or identifying content; their hash only establishes byte identity after upload. Offline drafts may be lost through browser eviction or a forgotten passphrase. The app has not undergone independent security, accessibility or field validation. See [safety and limitations](SAFETY_AND_LIMITATIONS.md).

## Maintenance

This is a demonstration maintained by the ResultTrail project owner. The repo README provides setup and verification commands. No retraining or automated production monitoring is in place.
