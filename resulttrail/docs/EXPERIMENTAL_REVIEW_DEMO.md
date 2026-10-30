# Experimental OCR and review-priority demo

This branch completes an interactive, controlled demonstration of the review assistant. The public ResultTrail site is unchanged. OCR and queue priority are **experimental and unvalidated**; they never edit a received result, approve a version, or determine fraud. The existing independent photo, usability and ranking release gates still apply before general release.

## Run on this development machine

Use the existing local Worker/D1 setup described in [cloud/README.md](../cloud/README.md). From `client/`, build with both independent flags and an explicit account allowlist:

```powershell
$env:VITE_OCR_EXPERIMENT = 'true'
$env:VITE_RANKING_EXPERIMENT = 'true'
$env:VITE_EXPERIMENT_ALIASES = 'test_observer,test_reviewer'
npm ci
npm run build
```

From `cloud/`, run `npm ci`, then `npm run dev -- --local --ip 127.0.0.1 --port 8787`. Open `http://127.0.0.1:8787/`. Sign in with the separate local reporter and reviewer credentials in the ignored `instance/cloud-local-test_*-credential.json` files. Those credentials are private; do not add them to Git or place them in a shared screenshot. Each reporter browser also needs its own local vault passphrase.

The flags are compiled into the client build. Both default to off, and an unset account allowlist permits no experimental UI. For a normal build, clear the three `VITE_*` variables and run `npm run build` again. Do not deploy the flagged build to the public Worker.

## Walkthrough

1. **Reporter:** Attach a fictional result-sheet image (JPEG, PNG or WebP; current evidence cap 750 KB). The experimental OCR panel appears for an allowlisted account. Rotate, crop or adjust contrast, then select **Read processed copy**. These controls create a temporary local image; the attached original and its SHA-256 digest stay unchanged. Select each highlighted suggestion and use **Accept figure** only after checking the original. Dismiss or type any missing figures manually. Complete the evidence checklist, save the encrypted record, and sync.
2. **Interruption:** If the image upload fails after the report receipt, the report stays received and the image stays pending. Restore the connection and retry sync; the original bytes and receipt are retained. If the connection fails before report receipt, the encrypted report stays queued on the device.
3. **Reviewer:** Open **Evidence review**. The experimental queue orders deterministic arithmetic discrepancies first, then recorded human mismatches, provisional OCR differences or duplicate image bytes, corrections, and peer context. Open a report to see **Review priority** reasons separately from **Evidence coverage**. Missing images affect coverage only; they add no suspiciousness score. Peer context is omitted until at least eight comparable submissions are available.
4. On a report with a verified image, select **Read source image on this device**. The original image hash is checked before OCR. Each suggestion shows the entered and extracted figure and highlights its source region. Inspect that region, then **Confirm match**, **Mark mismatch**, **Unreadable**, or **Dismiss hint**. The action appears in the existing append-only field-comparison history. The reviewer may change a field assessment with a later audit event; prior events remain. A reporter correction requires a new result version.
5. The reviewer still makes the overall decision separately. OCR and priority do not trigger one.

The local OCR parser is intentionally narrow: it expects the fictional printed demo layout and may omit or misread figures in other images. The live provisional OCR difference is browser-local; recorded human comparisons persist in the service and affect the reviewer queue. The current peer-context rule compares submitted reports within the same election and LGA, or state when the LGA has too few peers; it is not a historical election model.

## Checks completed on the development branch

- Browser: reporter OCR suggestions and explicit acceptance; source digest retained; encrypted save; interrupted image upload with verified report receipt and successful retry.
- Browser: reviewer source verification, extracted-versus-entered figures, region highlight, confirm/dismiss/unreadable actions, and refreshed comparison history.
- Browser: offline reporter save, failed sync with queue preserved, and successful receipt after reconnecting.
- API: role isolation, immutable versions, signed receipts, image hash/replay rules, comparison history and latest mismatch counts (`python cloud/scripts/test-evidence-local.py`).
- Queue invariants: arithmetic and recorded human precedence, provisional OCR ordering, separate coverage, and missing-image neutrality (`node --experimental-strip-types client/scripts/check-review-priority.mjs`).
- TypeScript build and lint checks run locally.

The release limitations and evidence needed for broader use remain in [VALIDATION_PACKET.md](VALIDATION_PACKET.md) and [WHY_OCR_AND_RANKING_ARE_NOT_LIVE.md](WHY_OCR_AND_RANKING_ARE_NOT_LIVE.md). The 750 KB evidence cap is unchanged. Larger images can be used in isolated OCR development tests, then evaluated separately before changing the upload limit.
