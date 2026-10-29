# ResultTrail review assistant: delivery plan

Status: implementation plan, 29 October 2026. No OCR or model ranking is live.

## Product rule

The system helps a reviewer find records requiring inspection. It does not decide whether a result is authentic, identify fraud, approve a report, or publish an official outcome. Uploaded bytes are supporting evidence, not authenticated originals. A matching hash proves byte continuity within ResultTrail only.

## Delivery order and gates

### 1. Offline source-image capture and bound receipt

- Generate a stable report ID when the form is first created. Keep it in the encrypted draft.
- Accept JPEG, PNG or WebP up to 750,000 bytes. Show size/type, preview, replace and remove controls. Preserve exact selected bytes and their SHA-256; do not silently compress or strip metadata.
- Save bytes in a separate AES-GCM encrypted IndexedDB evidence store keyed by account, report ID and version. Bind the ciphertext to that key with AES-GCM additional authenticated data. Never put image bytes in localStorage or unencrypted draft JSON.
- Include `{digest, mime, size}` in the signed report payload. The Worker validates the declaration, and upload checks the byte hash, type, size, ownership and latest version against that immutable payload. Legacy reports without a declaration continue to work, but cannot acquire an image after submission.
- Sync the report and verify its signed receipt, then upload the queued original bytes. A retry first checks hosted image status. Identical-byte replay succeeds; conflicting bytes fail. Do not delete local image bytes after a failed upload.
- Display `saved on device`, `report received; image pending`, `image verified` and `reviewed`. Approval of a version declaring an image waits until the image is verified. A subsequent correction may explicitly remove the declaration.
- Allow explicit removal of the *local* image after verified upload, explaining that this does not delete hosted evidence. Images remain accessible only to their reporter and authorised reviewers.

Acceptance: attach offline, reload, unlock, sync, force image-upload failure, reconnect and retry; hosted and local SHA-256 match. Reject oversize, wrong MIME/signature, altered bytes, conflicting replay and cross-account reads. Test narrow mobile and keyboard flow. Do not deploy until the end-to-end path passes.

### 2. Reviewer evidence comparison

- Show original image beside entered totals and party rows with zoom/pan, version and digest. Keep image download behind the existing authenticated endpoint.
- Allow a reviewer to record a field-specific comparison: `matches`, `possible mismatch`, or `cannot read`, with a short note and image region if available. The reviewer can dismiss a suggestion. Preserve decisions in an audit trail.
- Show material changes between immutable versions, but do not label corrections suspicious. Detect exact duplicate image hashes within the same tenant as a reconciliation prompt; distinguish legitimate shared scans or resubmissions.

Acceptance: reviewer can inspect every entered field against the attached image on desktop and mobile; every comparison is attributable and reversible through a new audit action, not silent overwrite.

### 3. Local OCR suggestion and reconciliation experiment

- Bundle pinned Tesseract.js worker, WASM core and language assets with the site; load only when the user asks. OCR runs on the device after assets are cached and sends no image to an AI service.
- Start with a supported fictional printed result-sheet layout. Crop/rotate/contrast in memory for recognition while retaining the original image unchanged. Map recognised text to field names and bounding boxes. Reject ambiguous mappings and non-integer values.
- Reporter suggestions require explicit accept/edit per field. Reviewer mismatch suggestions show both values and the highlighted source region; they do not alter or decide a record.
- Build a labelled fictional image corpus with held-out sheets, layouts, devices, blur, glare and low light. Measure field exact-match, high-confidence numeric suggestion precision, abstention, mismatch precision/recall, latency, memory and manual-entry time. Confidence is not the probability that the source is true.
- Enable the control only if high-confidence numeric suggestions achieve at least 99% precision on the untouched holdout and a small consented usability test shows faster entry without more accepted errors. Otherwise retain manual review and publish the failures.

### 4. Review queue ranking experiment

- Stage 1: deterministic checks (arithmetic, required fields, conflicting IDs) always take precedence. Stage 2: confirmed or provisional image-entry discrepancies and duplicate/version reconciliation. Stage 3: optional statistical comparison for records with adequate peer data.
- Keep `review priority` separate from `evidence coverage`. Missing image or history is unknown, not suspicious. Show reasons, source, comparison group and abstention.
- Compare existing arithmetic/robust-peer baseline with evidence-aware ranking and an optional model challenger at a fixed reviewer budget (initially top 20%). The current Isolation Forest remains disabled.
- Label arithmetic inconsistencies, confirmed transcription discrepancies, duplicate conflicts, material changes, statistical outliers and no issue identified separately. An outlier is not automatically a substantive error.
- Report precision@K, recall@K, critical misses, false flags, reviewer time, and component-specific detection quality. Bootstrap uncertainty by scenario/group, run ablations, and audit performance by area and data coverage. Freeze settings before opening the final holdout.
- Gate: at least 5 percentage points of recall improvement over the baseline at the same capacity, no additional critical misses, and no material subgroup regression. A failed gate leaves the ranking off; the deterministic workflow remains usable.

### 5. Historical context research

- Audit official 2015, 2019 and 2023 material for one contest and a limited geography. Record source URL, election, geography, definitions, extraction method, licence and missingness. Do not assume comparable ward-level tables exist.
- Account for polling-unit expansion and voter redistribution before comparing years. Current registered/accredited voters are the relevant denominators; population estimates have no direct anomaly weight.
- Use history as reviewer context first. Add it to ranking only if a source-quality audit and separate evaluation show incremental value. No fixed recency weights are assumed.

## Release sequence

Make each change in the public fork with migrations and a reproducible test command. Test locally, then deploy the completed feature to the hosted Worker and verify it through a reporter and reviewer browser flow. Update the model/system card, safety limitations, user guide and deep-dive slides when the observable product changes. No new feature is described as live until the production flow is verified.
