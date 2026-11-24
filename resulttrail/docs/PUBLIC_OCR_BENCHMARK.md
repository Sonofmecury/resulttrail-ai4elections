# Public-document OCR and image-size benchmark

This is a **local research tool**, not a training pipeline or a production OCR release. It measures high-confidence numeric OCR on scanned forms and receipts. Those documents are different from Nigerian result copies, so the result cannot open ResultTrail's task-specific OCR gate on its own. No third-party image is sent to ResultTrail or committed to Git.

## Datasets and terms

| Dataset | Use here | Source and access |
| --- | --- | --- |
| SROIE | Printed receipt numeric recognition and file-size stress test | The [jsdnrs derivative](https://github.com/jsdnrs/ICDAR2019-SROIE) describes 987 receipts, bounding boxes and transcriptions and labels its distribution [CC BY 4.0](https://github.com/jsdnrs/ICDAR2019-SROIE/blob/main/NOTICE). The script fetches selected **test** rows from that derivative's [Hugging Face dataset](https://huggingface.co/datasets/jsdnrs/ICDAR2019-SROIE) at pinned revision `bffe40c26759f3376ec2b3ae9031dbba54cd587c`, attributes Huang et al. and jsdnrs, and stores files only under ignored `instance/public-ocr/`. |
| FUNSD | Noisy scanned-form numeric recognition | The [original dataset](https://guillaumejaume.github.io/FUNSD/) has 199 annotated forms. Its [terms](https://guillaumejaume.github.io/FUNSD/work/) restrict use to non-commercial research/education and require the downloader to accept them. This repository does not download or redistribute FUNSD. After obtaining it under those terms, point the adapter at the extracted folder. |
| IAM handwriting | Optional later abstention stress test | The [official site](https://fki.tic.heia-fr.ch/databases/iam-handwriting-database) requires registration and limits use to non-commercial research. It is not included in this automated run. |

## Reproduce

From `resulttrail/`, with the pinned client dependencies and Python requirements installed:

```powershell
cd client
npm ci
npm run build
cd ..
py -3.13 ocr/public_benchmark.py sroie --limit 100 --split test
node client/scripts/evaluate-public-ocr.mjs sroie
```

For FUNSD, obtain and extract the original dataset yourself, then run:

```powershell
py -3.13 ocr/public_benchmark.py funsd --root C:\path\to\extracted --limit 50
node client/scripts/evaluate-public-ocr.mjs funsd
```

The preparer writes manifests and untouched originals under ignored `instance/public-ocr/{sroie,funsd}/`. It also creates variants capped at **750,000**, **1,500,000** and **2,000,000** bytes. If an original already fits a cap, that tier points to the exact original bytes; it is not re-encoded. If it exceeds the cap, the tool makes a JPEG derivative by reducing quality and, only if needed, dimensions. The manifest records original and derivative hashes, sizes, dimensions and whether bytes changed. The production evidence-upload limit stays at 750,000 bytes.

The evaluator runs the same pinned Tesseract.js worker used in the OCR prototype. It selects annotated regions consisting solely of numbers, matches high-confidence OCR tokens spatially, and reports exact numeric matches, wrong suggestions, abstentions, mean bytes and p95 OCR latency by size tier. It does **not** evaluate key-value relationships, party labels, source authenticity, handwriting, or a reporter accepting a suggestion. If every original fits 750 KB, the three caps do not create an informative image-quality comparison; the report says so through `changed_images: 0`.

The SROIE preparer reuses locally downloaded originals on later runs. `--limit` selects the first N items of the published test split, so a larger run may overwrite the local manifest and reported JSON but does not change source images. The report includes the count of unique original-image hashes; repeated images in the derivative are not independent examples.

## First local result, 30 October 2026

The reproducible [SROIE evaluation JSON](public-ocr-sroie-evaluation.json) covers the first 100 test rows (98 unique original-image hashes). It found 1,454 annotated numeric-only regions. OCR made 554 high-confidence proposals in those regions: **535 exact, 19 wrong**, giving **96.57% precision among proposals** and **36.80% exact coverage of all regions**; 900 regions received no high-confidence proposal. These are region-matching measurements on receipts, not ResultTrail field-extraction accuracy. The spatial matching and annotation granularity may also contribute to abstentions.

Only **one** of the 100 originals exceeded 750,000 bytes. Its 750 KB derivative did not change the aggregate correct, wrong or abstention counts. The 1.5 MB and 2 MB tiers changed no image. This sample provides **no sound basis to raise the production upload limit**. A future size decision needs multiple high-resolution, independently photographed fictional result sheets whose source values are checked before compression.

## Decision rule

These data can reveal general OCR and compression failures and guide a later upload-size experiment. They cannot replace the independent photographed fictional result-sheet holdout or the consented manual-versus-assisted entry study in [VALIDATION_PACKET.md](VALIDATION_PACKET.md). Do not enable production OCR, increase the upload cap, or claim election-result accuracy from this benchmark alone.
