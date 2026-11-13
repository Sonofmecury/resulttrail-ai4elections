# Geographic demonstration data

ResultTrail's hosted demonstration includes 36 additional, wholly invented polling-unit reports. They were added on 8 November 2026 to make the state → LGA → ward map, image evidence, OCR comparison and approved PDF export practical to demonstrate. These are **not election results**. The place names are real geographic labels; the unit codes, vote figures, result sheets, capture times and review scenarios are illustrative.

## Coverage

Each state below has three LGAs, with two different wards per LGA and one new report per ward: 6 states, 18 LGAs, 36 wards, 36 reports, and 36 attached PNG captures of generated PDF sheets.

| State | LGAs with new reports |
| --- | --- |
| Lagos | Ikeja, Alimosho, Eti Osa |
| Kano | Kano Municipal, Fagge, Dala |
| Kaduna | Kaduna North, Kaduna South, Chikun |
| Rivers | Port-Harcourt, Obio/Akpor, Eleme |
| Oyo | Ibadan North, Ibadan South West, Egbeda |
| Niger | Paikoro, Bosso, Chanchaga |

These records augment the older 15-state sample, so map counts can exceed two reports in an LGA or one in a ward. A count measures received reports, not vote totals or a prevalence of irregularities.

## Two cases to show

1. **Approved PDF:** Lagos → Ikeja → Aguda, unit `SIM-UNIT-0976E7D816C0`, report `3ff129f8-d260-46f7-a816-39e2b6a1d339`. The [fictional source sheet](demo/fictional-source-sheet.pdf) was rendered to a [PNG capture](demo/fictional-source-sheet.png) and uploaded as the report's evidence image. A reviewer approved this version. Its [downloaded approved PDF](demo/approved-result-copy.pdf) has two readable pages and embeds the exact signed JSON package and verification key. The embedded signature and receipt were independently verified with `server.verify.verify_export`.
2. **OCR mismatch:** Lagos → Ikeja → Akiode, unit `SIM-UNIT-8BC79B6BF012`, report `ad15080b-b36e-488b-a9b8-5782eed3bb68`. The entered figures say LP 35 and NNPP 19; the [fictional source sheet](demo/fictional-ocr-mismatch-sheet.pdf) and its [uploaded PNG capture](demo/fictional-ocr-mismatch-sheet.png) say LP 36 and NNPP 18. Their totals still balance, so an arithmetic check alone does not reveal this transcription difference. In the live reviewer flow, on-device OCR suggested LP 36 at 95.6% and NNPP 18 at 96%, labeling both as different figures for a person to inspect. This report remains awaiting review for a meeting demonstration; OCR made no decision and changed no submitted value.

Three more reports intentionally have party sums that differ from recorded valid votes and have correction-requested decisions. The other reports mix approved, reviewed and awaiting-review states.

## How to regenerate and seed

From `cloud/`, run `node scripts/seed-geographic-demo.mjs --dry-run` to generate all 36 local PDFs and PNG captures in the ignored `instance/geographic-demo/` directory. The renderer requires Python, ReportLab, Pillow and `pdftoppm`. It checks each PNG against the 750,000-byte evidence limit.

With the private initial reporter and reviewer credentials already in the ignored `instance/` directory, `node scripts/seed-geographic-demo.mjs --apply` submits the reports, uploads each source capture, verifies its SHA-256 digest and records the planned review decisions. Fixed IDs and content allow a repeat run to recognize previously submitted versions. The script only permits its default `https://resulttrail.ng` host for writes. Do not commit credentials or generated files from `instance/`.

The [ward-map screenshot](demo/ikeja-ward-map.png) was captured from the hosted reviewer interface after seeding. It shows the Ikeja drill-down and existing plus new reports. The source PNGs are renders of computer-generated PDFs, **not independent phone photographs**, so this demonstration does not establish real-world OCR accuracy. Human verification remains necessary.
