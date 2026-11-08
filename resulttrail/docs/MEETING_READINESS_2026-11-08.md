# ResultTrail meeting readiness - 8 November 2026

## Monday's information session

The Rise Networks invitation and [programme website](https://ai4elections.risenetworks.org/) give **Monday, 9 November 2026 at 12:00 noon WAT**. The website displays a **Join Information Session** link. The invitation describes a programme briefing and time for questions; it does not promise a project presentation slot.

## Sanity checks completed

- `https://resulttrail.ng/` and the stable Workers address returned HTTP 200. The live domain served the same versioned JavaScript and CSS filenames as this branch's fresh production build.
- The client build, lint, Worker TypeScript check, and PDF export/pagination check passed.
- Both private hackathon accounts signed in to the live service with their expected reporter and reviewer roles. They share the same workspace. The ignored `instance/hackathon-access.md` handout is present locally and matches the tested credentials; never add it to Git.
- In a live browser, the reporter account created and unlocked a device vault. The form showed an automatically generated unit code, required state/LGA/ward selectors, dynamic party rows and the source-image control. An empty form was stopped by required-field validation. A 1,082 KB image produced the visible error `Image too large (1082 KB). Maximum size is 750 KB.` No test report was submitted to the shared service.
- The reviewer dashboard loaded 28 received and 16 approved illustrative records at the time of this check. The map navigated Nigeria -> Lagos -> Ikeja and displayed ward boundaries, including Aguda.
- An approved live record downloaded a two-page PDF. It contained the signed JSON package and verification public key as attachments. The standalone verifier accepted the embedded package signature, and the signed unit code appeared on the visible PDF page.
- Reviewer OCR executed on one approved source image and returned **no high-confidence figures**. The reviewer was directed to inspect the original manually. This is a correct abstention path, not a claim of OCR accuracy.
- At a 390-pixel browser viewport, the reporter form and reviewer evidence screen had no horizontal document overflow. This is a browser viewport check, not a physical-phone usability study.
- The tracked guide is 19 PDF pages; the tracked deep-dive deck contains 32 slides. Both describe the current OCR and PDF workflow. Draft [PR #1](https://github.com/Sonofmecury/resulttrail-ai4elections/pull/1) contains the current code and these artifacts; it remains unmerged into `main`.

## If asked to show the product

1. Give the problem in one sentence: a field report needs an unambiguous path from encrypted local capture to server receipt and human review, including when connectivity is weak.
2. Open the live site and show the reporter form, generated code, required location and expandable party rows. Explain the separate device passphrase. Avoid submitting a new report unless a fictional example is ready.
3. Use the reviewer account to show the queue, Nigeria -> state -> LGA -> ward explorer, and an existing approved record with its source image and comparison controls.
4. Show optional OCR as assistance. It can suggest a figure or abstain; either way, the reviewer checks the source. Do not describe OCR as proven on photographed result sheets.
5. Download the approved PDF and explain that the **embedded JSON** is signed. The visible PDF pages themselves are not digitally signed.

Keep the private account handout separate from a screen share or public repository. The user guide and project deck are linked near the top of `README.md` on the PR branch.

## Claims and open work

ResultTrail is an independent research demonstration with illustrative records. It is not an official election result service and does not declare fraud. Automated review ranking and historical comparison are disabled. OCR has not been validated with independently photographed fictional result sheets or a consented entry study. The 750 KB upload cap, hosted retention/deletion, rate limiting and key recovery remain work for a real pilot.

## Useful questions for organisers

- Are pre-sprint prototypes allowed, and which new work must be completed during the sprint?
- Which deliverables are required at each stage: repository, live URL, video, slides or written report?
- What are the judging weights and the exact Track 5 expectations for election observation and citizen accountability?
- What datasets or result-copy examples may teams use, and what restrictions apply to official materials?
- Will teams receive technical review, testing participants or cloud credits, and when do submissions close?
