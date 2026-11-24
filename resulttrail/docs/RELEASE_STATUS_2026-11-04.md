# ResultTrail release status - 4 November 2026

## What is implemented

- The reviewer image-comparison form uses the workbench's IBM Plex Sans typography, soft cards, rounded controls and a compact responsive layout.
- A reviewer can download an approved result copy as a PDF. The PDF shows the minimized figures and evidence metadata, and embeds the exact signed export JSON plus public verification key as attachments. The PDF page content is not itself digitally signed. Verification applies to the embedded data; compare the visible figures against it before relying on a redistributed copy.
- Optional OCR is available to signed-in reporters with an attached image and to reviewers with a verified source image. It runs in the browser with pinned same-origin Tesseract assets. Reporter suggestions require individual acceptance; reviewer hints require visual inspection and a human action. Neither path changes an already submitted figure automatically. The parser accepts printed `Party CODE` labels of up to 12 characters, including multi-letter codes.
- Automated review ranking and historical comparisons remain disabled.

## Checks completed for this update

- The client production build, lint and Worker TypeScript checks passed.
- A generated PDF rendered legibly on both pages. Its two embedded attachments were byte-for-byte equal to the source JSON files.
- On the isolated hosted preview, a fresh fictional reporter submission was approved by a reviewer, exported, and its Ed25519 package and receipt signatures verified with the existing standalone verifier. The browser downloaded a PDF for that approved record; both embedded attachments were present, its package signature verified, and the visible unit code matched the signed package.
- The preview reviewer page displayed the refreshed comparison layout and OCR control. OCR read the existing fictional sheet and showed two deliberately different party figures for human inspection. At a 390-pixel viewport, the page had no horizontal overflow after OCR ran.
- A parser check covered `Party APC`, `Party NNPP`, and abstention when the same party appears twice.

## What these checks do not establish

The 80 rendered-sheet OCR holdout produced 480 correct suggestions among 480 proposals. The separate receipt benchmark produced 535 correct and 19 wrong high-confidence numeric proposals. Neither measures accuracy on independently photographed fictional result sheets. No physical-phone test across varied cameras, lighting, glare, blur, perspective and handwriting has been completed, and no consented manual-versus-OCR entry study has shown that accepted errors stay flat. The [validation packet](VALIDATION_PACKET.md) still defines those gates. OCR is offered only as explicit assistance in the fictional demonstration and must not be described as a reliable result reader.

The PDF has not been independently certified as a digital signature format. The exact signed JSON inside it is the verification target. The 750 KB evidence cap also remains; moving to 2 MB requires changing the D1 image storage design, as explained in [the prior acceptance record](ACCEPTANCE_STATUS_2026-11-01.md).

## Competition priorities

1. Collect and label independently photographed **fictional** sheets, run the frozen OCR evaluation, and publish errors and abstentions by image condition. This is the largest evidence gap for an AI claim.
2. Run an observed task test with several first-time users on ordinary phones, including at least one slow connection and interrupted upload. Measure completion, mistakes and recovery. Include a screen-reader and keyboard pass.
3. Record the requested short walkthrough video: reporter capture, offline save and sync, reviewer comparison, OCR hint checked against the image, approval and PDF verification. Show a deliberate OCR error or abstention rather than only a perfect case.
4. Finish hosted retention/deletion, rate limiting and key-recovery procedures before any real pilot. Keep synthetic-only data until there is formal approval and a security review.

The core demonstration is functional. These validation and presentation tasks are more likely to improve a judged submission than adding another speculative model or map layer. No placement can be guaranteed.
