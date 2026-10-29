# ResultTrail synthetic MVP

**Hosted site:** [resulttrail.ng](https://resulttrail.ng). The [Workers address](https://aegisrelay-app.mukhtarabdulrazaq-18.workers.dev) remains available. The site runs independently of this laptop and stores shared records in Cloudflare D1. See the [hosted deployment guide](cloud/README.md) for accounts, deployment and backups. The Python/SQLite path below is a local development demo.

A free and open-source prototype for recording a **fictional** polling-unit result copy. A reporter can save encrypted drafts, records and a source image on a device during an outage, sign in and sync later, and verify a server-signed receipt. A reviewer can inspect arithmetic checks, the source image, field-by-field comparison notes, corrections and a geographic coverage map before making a human decision. Only a reviewer-approved version can produce a minimized signed JSON package. This is independent observer workflow research, **not an official election system**.

The illustrated [user guide](docs/USER_GUIDE.pdf) introduces the project and walks through the reporter and reviewer pathways, including the state, LGA and ward map views. It will be updated as the prototype changes.

## Run locally (Windows PowerShell)

From this `app` directory:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
cd client
npm ci
npm run build
cd ..
$env:AEGIS_DEMO = '1'
.venv\Scripts\python -m server.seed_demo
.venv\Scripts\python -m uvicorn server.core:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The fictional demo accounts are `reporter` and `reviewer`, each with password `demo-only-change-me`. Choose a separate **local queue passphrase** of at least 12 characters; it is not the account password. Keep the app on loopback only with these demo credentials. A domain and paid hosting are unnecessary.

If `py -3.13` is unavailable, use a Python 3.13 executable. Node 22 and npm 10 were used for the frontend. Build the frontend before starting the API so FastAPI serves the static PWA from the same origin. Demo files, database, sessions and signing key are generated under ignored `instance/`.

## Demo flow

Reporter party rows can be added or removed (2–26 rows). Codes such as `APC`, `PDP`, `LP` and `NNPP` are editable, and the arithmetic check sums every entered party score. Previously saved three-party drafts and corrections remain readable.

New reports include a three-step evidence checklist. Its confirmations and device-recorded save time are included in the signed report payload; the time is not an independent timestamp. Reporters can see a received/reviewed progress timeline and reviewer feedback across devices, and can remove individual encrypted local copies. The [privacy and retention note](docs/privacy-and-retention.md) explains the distinction between local removal and hosted records, reviewer-only geographic access, and current deletion limits.

The [review assistant build plan](docs/REVIEW_ASSISTANT_BUILD_PLAN.md) sets the delivery order and acceptance gates for OCR, ranking and historical research. The earlier [image and AI delivery plan](docs/AI_AND_IMAGE_PLAN.md) provides further storage detail. Offline encrypted image capture, signed image declarations, retryable upload and human field comparison are live. OCR and model ranking are not active.

The hosted reviewer account now has a Geographic Explorer with State → LGA → Ward drill-down, a hash-verified source-image preview and a signed-receipt verification control. The hosted demonstration includes 15 geographically dispersed illustrative records, including approved, pending and correction-requested states. The separate hackathon login handout is kept in the ignored `instance/hackathon-access.md` file.

1. Sign in as reporter, create/unlock the local vault, and start a report. The site generates a read-only `SIM-UNIT-…` code for each new report. Select the required state, LGA and ward, add each party abbreviation and vote figure shown on the illustrative source, then save. The status is **On this device**.
2. To demonstrate an outage, disconnect the browser network after its first online load, reload, choose **Open encrypted queue while offline**, unlock, and save a correction. The queued record survives another reload. Reconnect and sign in as reporter to select **Sync queued**. Older queued records missing a required location can be opened with **Edit queued report** before syncing.
3. The app checks the response digest and Ed25519 signature before showing **Server received**. A repeat of identical report ID/version/content returns the same receipt; changed content at that ID/version is rejected.
4. On the hosted site, optionally attach a JPEG, PNG or WebP source image of up to 750 KB in the reporter form, including while offline. Oversized or unsupported images show an error beside the picker. The original stays encrypted locally until sync. The signed report declares its hash; upload follows the verified report receipt and can be retried. This image feature is not part of the local Python backend.
5. Sign in as reviewer. Use the dashboard and state map to find reports; inspect the latest version, arithmetic checks, source note and image. Zoom the image and record `matches`, `possible mismatch`, `cannot read` or `not compared` for each field, with a note and append-only history. Compare changes between versions, then add an overall note and approve or request correction. **Approve** enables the export download.
6. The export downloads a signed minimized package and demo public key. Verify from this directory:

```powershell
.venv\Scripts\python -m server.verify PATH_TO_PACKAGE.json PATH_TO_PUBLIC_KEY.json
```

## Test and evaluation

```powershell
.venv\Scripts\python -m pytest -q
.venv\Scripts\python -m server.evaluate
```

The evaluation writes [synthetic-evaluation.json](docs/synthetic-evaluation.json). Its fixed 20% review budget produced 54/84 review-worthy cases for the peer baseline and 55/84 for peer plus Isolation Forest. Incremental recall gain was 0.0119, below the predeclared 0.05 gate. **The model is disabled in the product.** These labels and groups are entirely invented and say nothing about actual elections.

To create a consistent local demo backup, stop active write traffic and run `python -m server.backup create PATH_TO_NEW_DIRECTORY`, then `python -m server.backup verify PATH_TO_NEW_DIRECTORY`. Restore to a **new** directory with `python -m server.backup restore PATH_TO_BACKUP PATH_TO_NEW_INSTANCE`; set `AEGIS_INSTANCE` to that new directory when starting Uvicorn. The backup contains the private signing key and must be kept private. Restore verifies file hashes and every stored receipt.

## Boundaries

The app accepts only fictional figures, notes and images; it does not collect real identities or official data. Map shading shows submission coverage or arithmetic checks, never election outcomes. Arithmetic flags prompt human comparison and never assert fraud. The reporter queue and draft use passphrase-wrapped AES-GCM in IndexedDB. Browser eviction, forgotten passphrases, an unlocked or compromised device, local disk failure and server key loss remain risks. This prototype is not sized or certified for a real election. See [system card](docs/system-card.md), [geographic data attribution](docs/geodata.md) and [data sheet](docs/synthetic-data-sheet.md).

Runtime software is locally runnable without metered APIs. The frontend uses React, Vite and vite-plugin-pwa; the API uses FastAPI, SQLite and `cryptography`; the optional offline benchmark uses scikit-learn. The app source is MIT-licensed in [LICENSE](LICENSE). No account, domain, cloud service or AI API is needed to run the MVP.

## Gated review-assistant experiments

The production site keeps OCR and automated review ranking off. The [build plan](docs/REVIEW_ASSISTANT_BUILD_PLAN.md) defines the release gates. To reproduce the local experiments, run `py -3.13 ocr/generate_corpus.py`, `node --experimental-strip-types client/scripts/evaluate-ocr.mjs`, and `py -3.13 server/evaluate_review_ranking.py` from this directory after installing the documented Node and Python dependencies. Results are in [OCR evaluation](docs/ocr-evaluation.json) and [ranking evaluation](docs/review-ranking-evaluation.json). The generated images stay under ignored `instance/ocr-corpus/`.

For a local reporter UI prototype, build the client with `VITE_OCR_EXPERIMENT=true` (PowerShell: `$env:VITE_OCR_EXPERIMENT='true'; npm run build`) and run the local demo. The control reads only attached images on the device and asks the reporter to accept each figure. It supports only the fictional printed test layout. The flag is **unset** in the normal build and must not be enabled on the public site until the independent photo and usability gate passes. The [historical source audit](docs/HISTORICAL_CONTEXT_AUDIT.md) found no comparable, validated ward-level panel for the three election years; history has no ranking weight.
