# Why the remaining review-assistant features are not live

**ResultTrail status, 30 October 2026.** The public site still provides encrypted offline report capture, image attachment and verification, deterministic arithmetic checks, a reviewer evidence workbench, human field comparisons, and the geographic explorer. Optional OCR suggestions and automated review-queue ranking are **not enabled**. The code and experiments for them are in [draft PR #1](https://github.com/Sonofmecury/resulttrail-ai4elections/pull/1). This document explains what was built, what is still missing, and why a promising benchmark number did not justify deployment.

## The central difficulty

This is an election-related evidence workflow. A wrong number suggested by OCR can make a report *less* accurate if a reporter accepts it. A ranking system can cause a reviewer to miss an important report by placing it below the available review capacity. A convincing demonstration with invented data is useful for testing code, but it cannot establish either of those real-world error rates. The [review-assistant build plan](REVIEW_ASSISTANT_BUILD_PLAN.md) therefore set release gates before these experiments. The missing evidence requires independently made and photographed fictional sheets and human evaluation; generating more sheets with the same code would not fill that gap.

The restriction is about the **strength of the evidence**, not API cost. The OCR prototype uses free, locally bundled Tesseract.js assets. The current ranking research uses local Python and open-source libraries. Neither needs paid model tokens to run.

## 1. OCR: working prototype, unproven accuracy

### What exists

- A pinned Tesseract.js worker, core and English language file can be served from ResultTrail's own origin and loaded when requested. A browser test confirmed the worker read a fictional printed sheet without an external OCR service.
- A deliberately narrow parser recognises the supported printed labels, rejects non-integer or ambiguous fields, and returns suggested values with confidence scores and text boxes. The reporter prototype lets someone accept or dismiss each figure individually. It never fills a field automatically and never changes the generated `SIM-UNIT` record code.
- The prototype is behind the build flag `VITE_OCR_EXPERIMENT=true`. Normal production builds omit its control. The original attached image is preserved; OCR reads a local copy in memory.

### What the measured result actually means

The [OCR evaluation](ocr-evaluation.json) used 80 computer-rendered holdout sheets with 560 known numeric fields. It proposed 480 high-confidence numbers, all 480 matching the labels. That is 100% **observed precision among the proposed fields** and 85.7% field coverage; the remaining 14.3% were abstentions. Its 95% Wilson lower bound for precision is approximately 99.2%, but that interval is conditional on this narrow rendered-sheet experiment. A separate probe deliberately changed one entered value on every fourth sheet and found 19 of 20 differences. Those probes do not establish accuracy on photos or genuine human mistakes.

The sheets were rendered by one generator. Although the holdout varied font, layout, rotation, blur, low light and glare, these effects were digitally applied, with very clean printed labels and a limited party format. The parser was designed for that format. It has not faced actual phone cameras, perspective distortion, shadows, handwriting, folds, compression, unfamiliar layouts, overlapping stamps, more party rows, or ambiguous source copies. A 100% score here must not be presented as a 100% field accuracy claim.

### Remaining engineering and evidence work

The reporter control is a prototype, not a complete OCR release. The reviewer-side provisional mismatch display and source-region highlight specified in the plan are not implemented. Image preprocessing, cropping and rotation controls are also not complete. The browser worker ran on a development machine; low-end phone latency, memory and offline-after-cache behaviour have not been measured. The source-image cap of 750 KB may also limit the readability of some photos; changing that limit would require a separate storage and upload assessment.

Before release, the team needs an untouched corpus of independently made *fictional* sheets photographed on several phones and conditions, with independently checked field labels. It also needs a consented, counterbalanced test comparing manual entry with optional OCR suggestions. Faster entry is only a benefit if accepted errors do not rise. The [validation packet](VALIDATION_PACKET.md) sets the minimum collection and pass criteria. Until that evidence exists, the flag stays off.

## 2. Review ranking: a simulation is not a validated queue

### What exists

The live reviewer workbench already exposes deterministic arithmetic prompts, image evidence, exact-byte duplicate counts and human comparison actions. These are inspection aids, not fraud findings. The older Isolation Forest experiment improved recall by only 1.19 percentage points over its robust-peer baseline, below the predeclared five-point threshold, and stayed off.

The new [ranking evaluation](review-ranking-evaluation.json) generated 900 fictional reports, fixed the reviewer budget at the top 20% (180 reports), and compared arithmetic-plus-peer ranking with an evidence-aware challenger. In that simulation, recall rose from 34.52% to 39.52%, exactly five percentage points. The simulation also counted 72 fewer critical misses. Its generator-conditional bootstrap interval for the recall gain was 1.91 to 7.14 percentage points, so even this invented-data result is not uniformly above the target.

### Why that is not a release result

The important mismatch signal in the challenger was **simulated**. It was not produced by a validated OCR component on real independent photos. Labels and observable cues came from the same fictional scenario generator; its choices can make a particular scoring rule look effective. There are no independently adjudicated reviewer labels, no measurement of review time or decision accuracy, and no external check that the ranking helps across areas and image-coverage groups. The numerical five-point gain is a software smoke test, not evidence of field performance.

There is also a timing trap: a reviewer's confirmed image mismatch is known **after** inspection. It cannot be used to claim that the initial queue would have found the same report. An initial-priority evaluation may use only information available at receipt. Later human actions can update queue state, but that is a separate question. Similarly, an absent image or historical comparison is unknown; treating absence as suspicious would bias the queue against reports with poor connectivity or incomplete coverage. An exact duplicate image hash can also be a legitimate shared scan or resubmission, so it prompts reconciliation rather than an adverse conclusion.

No production ranking endpoint, model score, or automated queue reordering was activated. The release still needs a frozen comparison against independently labelled fictional reports at the same top-20% budget, blinded reviewers, category and area audits, no extra critical misses, and a measured gain of at least five percentage points without a material subgroup regression. The deterministic and human-review workflow remains available meanwhile.

## 3. Historical elections: no validated ward-level trend panel

The proposed historical feature would compare current submissions with 2015, 2019 and 2023 presidential-result patterns. The [source audit](HISTORICAL_CONTEXT_AUDIT.md) found official material, but not a verified, consistently structured Lagos ward-level panel across those elections. The 2015 summary inspected has state rows; the 2019 presidential declaration gives national totals; the 2023 report's presidential annex gives national totals. Some older PDF links were unavailable on direct fetch, and extraction, transcription checks, licence and missingness have not been resolved. It would be misleading to fill absent ward values by inference.

Even if all historical rows were obtained, direct polling-unit trends would need a geography crosswalk. [INEC's 2023 report](https://inecnigeria.org/wp-content/uploads/2024/02/2023-GENERAL-ELECTION-REPORT-1.pdf) describes the 2021 conversion of 56,872 voting points into polling units, taking the national count from 119,974 to 176,846, followed by voter registration and transfers into the new units. Party lists, electoral procedures and denominator definitions also differ across years. A large year-to-year change can therefore reflect changed boundaries, voter distribution or reporting definitions. General population estimates are not a direct vote-count anomaly denominator.

Historical data has **zero weight** in the current ranking and is not shown on the map. It can become reviewer context after original source files, geographic crosswalks, definitions, missingness and reuse rights are checked. It should affect ranking only if a separate evaluation demonstrates incremental value.

## What would let us finish

| Workstream | Evidence or work needed | Current disposition |
| --- | --- | --- |
| OCR | Independent photographed fictional holdout; verified labels; varied devices and layouts; low-end phone and offline checks; consented manual-vs-suggestion entry test; reviewer mismatch UI | Prototype stays behind build flag |
| Queue ranking | Validated pre-review signals; independent adjudicated labels; fixed-budget baseline comparison; reviewer time and decision accuracy; critical-miss and subgroup audit | Deterministic checks and human queue stay live; challenger stays off |
| Historical context | Stable original official sources; audited extraction, licence and missingness; comparable geography and denominator crosswalk; separate value test | No historical score or map layer |

The next external input is a set of independently photographed **fictional** sheets with checked ground-truth figures and people willing to do the consented entry/review study. Those cannot be supplied by rerunning our generator. Once available, the prototype can be completed, evaluated against the frozen gates, and enabled only if the results support it.
