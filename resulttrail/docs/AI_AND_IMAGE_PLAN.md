# ResultTrail: image and AI delivery plan

**Decision (27 October 2026):** Complete offline image capture and evidence binding first. Then evaluate optional, on-device OCR as a transcription aid. Keep the current anomaly-ranking model disabled. This keeps the work centred on Track 5 evidence hygiene (5C), offline reporting (5A), and the reporter feedback loop (5E). OCR also touches Track 2's document-intelligence example; it must not become an authoritative result reader.

## Current baseline

- The hosted site accepts one JPEG, PNG or WebP source image of at most 750 KB **after** a report version has been received. The browser and Worker compare SHA-256 digests. D1 stores the bytes and signed image metadata. A reviewer can inspect the image; the reporter cannot yet capture and queue it offline.
- The reporter's result form and unsent records already use an AES-GCM encrypted IndexedDB vault. Report receipts are Ed25519-signed. The image digest is signed separately after upload, but is not currently part of the original result payload/receipt.
- A fictional Isolation Forest benchmark missed its predeclared improvement gate; no AI model is active in the product.

## Milestone 1 — offline image capture

1. Put **Attach source image** in the report form. Support camera capture and file selection, preview, replace, and remove. State the 750 KB limit before selection; show exact file size and type. Do not silently resize or re-encode a file described as an original.
2. Generate the report ID when a new form starts and persist it with the encrypted draft. Encrypt the selected image bytes in a separate IndexedDB evidence store under alias/report ID/version. Calculate SHA-256 immediately and display the short digest. A queued image must survive reload and network loss just as the form does.
3. Add the expected image digest, type and byte count to the signed report payload. During sync, send the report first and verify its receipt, then upload the exact queued bytes. The Worker accepts an image only when its digest and metadata match that payload and the same reporter/version owns it. A repeat upload of identical bytes is safe; different bytes conflict.
4. Show distinct states: **saved on device**, **report received; image pending**, **image verified**, and **reviewed**. If a declared image is pending, reviewer approval waits for it or for a new report version that removes the declaration. On a retry, query server status before discarding local bytes. Keep failed uploads in the encrypted queue.
5. Add a reporter image preview and explicit local-image removal after verified upload. Explain that local removal does not erase the hosted copy. Keep image access limited to the owning reporter and authorised project reviewers; never add exact polling-unit photos to a public map.

**Acceptance:** a reporter can attach a fictional photo while offline, reload, reconnect, sync both report and image, and see matching hashes. A forced failure between the two uploads leaves the image queued and recovers without duplicate or mismatched evidence. Another account cannot read or attach the image. Tests cover oversized, wrong-type, altered-byte, replay and deletion cases. The UI works on a narrow mobile screen and with keyboard controls.

## Milestone 2 — image handling and storage decision

The current 750 KB D1 route is enough for a controlled demo, but it may reject unprocessed camera files. Measure actual demo-phone file sizes and D1 use before changing storage. If the cap blocks normal use, move image bytes to a private R2 Standard bucket and keep only digest, owner, version, size and object key in D1. R2 has a monthly free allowance, but enabling it requires an R2 subscription and usage above the allowance is billed; add usage alerts and an app-side upload cap before migration. Maintain the same authenticated Worker route and hash checks. Never expose a public bucket URL.

EXIF and other embedded metadata can disclose information. For the fictional demo, allow only fictional images and tell reporters what is retained. Before any real-world pilot, define a policy for metadata scanning and either reject risky originals or create a clearly labelled sanitised derivative. A derivative must have its **own** hash and must never be described as the original bytes.

## Milestone 3 — optional on-device OCR prototype

1. Prototype with a pinned open-source Tesseract.js worker. Serve the worker, WebAssembly core and English language data from ResultTrail's own static assets, so recognition can run after the assets have been cached and without a paid AI API. Load the OCR bundle only when the reporter chooses **Suggest figures from image**; measure download size and memory on a low-end Android device.
2. Use OCR to propose the unit code, totals and party rows from a fictional result-copy image. Show the image beside each proposed value. The reporter must explicitly accept or edit every suggestion; OCR never saves, syncs, approves or declares a result. Unknown or ambiguous fields remain blank. Deterministic arithmetic checks still run on the human-confirmed values.
3. Build a labelled test set of fictional result-copy images: multiple layouts, handwriting/print conditions, glare, blur, rotation and low light. Keep photographed sheets and layouts out of the development set. Record field-level exact-match, high-confidence suggestion precision, blank/abstention rate, complete-form accuracy, processing time and memory. Run a small consented usability comparison against manual entry.
4. Ship the OCR control only if a held-out evaluation shows it reduces entry time **without increasing incorrect accepted figures**, and high-confidence displayed numeric suggestions reach at least 99% precision. Otherwise keep the manual form and image workflow; publish the failure cases. The confidence value is an aid to abstention, not a calibrated probability of electoral truth.

**Acceptance:** OCR works with the network disconnected after its assets are cached; it does not send image bytes to an external AI service; no OCR value enters the report without reporter confirmation. The model/system card includes test-set construction, per-condition results and examples of failure.

## Sequence and cost

| Order | Deliverable | Main dependency | Recurring cost at demo scale |
|---|---|---|---|
| 1 | Encrypted offline image queue and bound receipt | Existing IndexedDB, Worker and D1 | Current Cloudflare free allowances |
| 2 | Mobile image usability and storage measurement | Milestone 1 | None beyond current hosting |
| 3 | Optional OCR prototype and evaluation | Labelled fictional images | No AI API fee; static asset bandwidth/size applies |
| 4 | R2 migration only if D1 cap blocks normal images | R2 subscription and billing controls | Free within R2 Standard allowance; overages billed |

No new live electoral data, institution access or real observer identities are needed for development. A real pilot requires authorisation, safeguarding, metadata/retention policy, security and accessibility review, and a fresh field evaluation.

## References

- [Official Track 5 technical brief](https://github.com/Rise-Networks-AI-Labs/-AI4Elections-Hackathon/blob/main/docs/01_technical_briefs/track5_election_observation_accountability.md)
- [Tesseract.js browser API and local asset paths](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)
- [Cloudflare R2 pricing and free allowance](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 subscription setup](https://developers.cloudflare.com/r2/get-started/)
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
