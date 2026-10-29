# ResultTrail review assistant: delivery plan

Status: release 1 (offline encrypted image capture and signed declaration) deployed 29 October 2026. Reviewer field comparison, OCR and model ranking are not live.

## Product rule

The system helps a reviewer find records requiring inspection. It does not decide whether a result is authentic, identify fraud, approve a report, or publish an official outcome. Uploaded bytes are supporting evidence, not authenticated originals. A matching hash proves byte continuity within ResultTrail only.

## Delivery order and gates

### 1. Offline source-image capture and bound receipt

- Generate a stable report ID when the form is first created. Keep it in the encrypted draft.
- Accept JPEG, PNG or WebP up to 750,000 bytes. Show size/type, preview, replace and remove controls. Preserve exact selected bytes and their SHA-256; do not silently compress or strip metadata.
- Save bytes in a separate AES-GCM encrypted IndexedDB evidence store keyed by account, report ID and version. Bind the ciphertext to that key with AES-GCM additional authenticated data. Never put image bytes in localStorage or unencrypted draft JSON.
- Include `{digest, mime, size}` in the signed report payload. The Worker validates the declaration, and upload checks the byte hash, type, size and ownership against that *exact immutable version*. A declared image for a superseded version may finish uploading, but its declaration and bytes cannot be replaced. Legacy reports without a declaration continue to work, but cannot acquire an image after submission.
- Sync the report and verify its signed receipt, then query hosted image status and upload the queued original bytes if absent. An upload can succeed even when its response is lost; retry queries status and verifies the hosted digest. Identical-byte replay succeeds; conflicting bytes fail. Do not delete local image bytes after a failed upload.
- Display `saved on device`, `report received; image pending`, `image verified` and `reviewed`. Upload failure is a retry condition, not a terminal state. Receipt verification and image verification are distinct. Approval of a version declaring an image waits until the image is verified. A subsequent correction may explicitly remove the declaration.
- Reuse the existing passphrase-unlocked account vault key for evidence, with a separate versioned AES-GCM envelope, unique nonce and account/report/version authenticated metadata. A forgotten passphrase has no recovery path for unsynced records. Browser eviction, private browsing, cleared site data or lost devices can erase unsynced evidence; offline storage is not a backup.
- Keep the current correction rule: a reporter must sync the existing version before creating another version of the same report. The evidence store is keyed by account/report/version and still supports pending evidence for an older received version.
- Decode selected images before accepting them; cap dimensions, pixel count and simultaneous decode work. Reject SVG. Serve originals with private no-store and nosniff headers; explain that exact originals retain EXIF metadata.
- Allow explicit removal of the *local* image after verified upload, explaining that this does not delete hosted evidence. Images remain accessible only to their reporter and authorised reviewers.

Acceptance: attach offline, reload, unlock, sync, force image-upload failure, reconnect and retry; hosted and local SHA-256 match. Reject oversize, wrong MIME/signature, altered bytes, conflicting replay and cross-account reads. Test narrow mobile and keyboard flow. Do not deploy until the end-to-end path passes.

### 2. Reviewer evidence comparison

- Show original image beside entered totals and party rows with zoom/pan, version and digest. Keep image download behind the existing authenticated endpoint.
- Allow a reviewer to record a field-specific comparison: `not compared`, `matches`, `possible mismatch`, or `cannot read`, with a short note and image region if available. Distinguish machine suggestions from human confirmations. The reviewer can dismiss a suggestion without altering the submitted figures. Preserve actor, action, target version, timestamp and previous-event reference in an append-only audit trail; do not call this tamper-proof.
- Show material changes between immutable versions, but do not label corrections suspicious. Detect exact duplicate image hashes within the same tenant as a reconciliation prompt; distinguish legitimate shared scans or resubmissions.

Acceptance: reviewer can inspect every entered field against the attached image on desktop and mobile; every comparison is attributable and reversible through a new audit action, not silent overwrite.

### 3. Local OCR suggestion and reconciliation experiment

- Bundle pinned Tesseract.js worker, WASM core and language assets with the site; load only when the user asks. OCR runs on the device after assets are cached and sends no image to an AI service.
- Start with a supported fictional printed result-sheet layout. Crop/rotate/contrast in memory for recognition while retaining the original image unchanged. Map recognised text to field names and bounding boxes. Reject ambiguous mappings and non-integer values.
- Reporter suggestions require explicit accept/edit per field. Reviewer mismatch suggestions show both values and the highlighted source region; they do not alter or decide a record.
- Build a labelled fictional image corpus with held-out sheets, layouts, devices, blur, glare and low light. Measure field exact-match, high-confidence numeric suggestion precision, abstention, mismatch precision/recall, latency, memory and manual-entry time. Confidence is not the probability that the source is true.
- Enable the control only if high-confidence numeric suggestions achieve at least 99% precision on a sufficiently large independent untouched holdout and a small consented usability test shows no increase in accepted errors. Faster entry is secondary. Manual entry remains complete with OCR disabled. Otherwise retain manual review and publish the failures.

### 4. Review queue ranking experiment

- Stage 1: deterministic checks (arithmetic, required fields, conflicting IDs) always take precedence. Stage 2: confirmed or provisional image-entry discrepancies and duplicate/version reconciliation. Stage 3: optional statistical comparison for records with adequate peer data.
- Keep `review priority` separate from `evidence coverage`. Missing image or history is unknown, not suspicious. Show reasons, source, comparison group and abstention.
- Compare existing arithmetic/robust-peer baseline with evidence-aware ranking and an optional model challenger at a fixed reviewer budget (initially top 20%). The current Isolation Forest remains disabled.
- Label arithmetic inconsistencies, confirmed transcription discrepancies, duplicate conflicts, material changes, statistical outliers and no issue identified separately. An outlier is not automatically a substantive error. Initial ranking features may use only information available *before* review; reviewer decisions may inform later queue states but cannot leak into the initial-priority benchmark.
- Predefine critical misses (including material confirmed image-entry discrepancies and serious arithmetic inconsistencies). Report precision@K, recall@K, category-specific recall and false positives, critical misses, reviewer time and decision accuracy, and component-specific detection quality. Bootstrap uncertainty by scenario/group, run ablations, and audit performance by area and data coverage. Freeze settings before opening the final holdout.
- Gate: at least 5 percentage points of recall improvement over the baseline at the same capacity, no additional critical misses, and no material subgroup regression. A failed gate leaves the ranking off; the deterministic workflow remains usable.

### 5. Historical context research

- Audit official 2015, 2019 and 2023 material for one contest and a limited geography. Record source URL, election, geography, definitions, extraction method, licence and missingness. Do not assume comparable ward-level tables exist.
- Account for polling-unit expansion and voter redistribution before comparing years. Current registered/accredited voters are the relevant denominators; population estimates have no direct anomaly weight.
- Use history as reviewer context first. Add it to ranking only if a source-quality audit and separate evaluation show incremental value. No fixed recency weights are assumed.

## Release sequence

Release 1 is evidence integrity, release 2 human comparison, release 3 optional OCR, and release 4 evaluated ranking. Historical context remains a separate research workstream. For each release: apply backward-compatible migrations; deploy backend support disabled; test locally; enable only designated fictional demo accounts; verify production reporter/reviewer flows; monitor failures and resource use; then expand. Keep independent flags for evidence upload, OCR and ranking, with application rollback that does not require reverting a database migration. Define hosted retention, deletion and access-revocation policy before any real pilot. Update the model/system card, safety limitations, user guide and deep-dive slides when the observable product changes. No new feature is described as live until the production flow is verified.
