# Evidence needed to open the OCR and ranking gates

The current scripts test software plumbing only. Before enabling either feature on `resulttrail.ng`, collect a genuinely independent fictional validation set. Do not use official result sheets or personal data for this test.

## OCR holdout

1. Print or hand-create fictional sheets **outside** the corpus generator. Include different page layouts and party counts, then photograph them with several phone models in daylight, low light, blur, perspective tilt and glare. Keep the untouched originals and exact manually transcribed values. Do not train or tune the parser on these images after opening the holdout.
2. Record device model, image size, lighting condition, layout, each source value and whether the field is readable. A second person checks the labels against the sheet. Record image-level exclusions with reasons before running OCR.
3. Before opening the holdout, target at least 100 independently made and photographed sheets, at least three phone models and at least 500 high-confidence numeric proposals, spread across the conditions above. Run the proposed control and measure high-confidence numeric precision and its 95% Wilson lower bound, per-field exact match, abstention, mismatch precision/recall, latency and memory by device and condition. Count an unreadable or ambiguously mapped field as an abstention, never a correct prediction.
4. In a consented counterbalanced test, ask at least ten participants to enter the same fictional sheets manually and with optional suggestions. Compare accepted errors and completion time. The release condition is at least 99% observed precision with a 95% Wilson lower bound of at least 99% on the untouched holdout **and no increase in accepted errors**. The existing 80 rendered holdout sheets do not qualify.

## Review-priority holdout

1. Freeze the priority rules and top-20% reviewer budget. Label independently created fictional reports as arithmetic inconsistency, confirmed image-entry discrepancy, duplicate conflict, material change, statistical outlier, or no issue identified. Keep uncertain cases separate.
2. Record only features available at initial receipt for the initial-queue comparison. Reviewer comparison events may update a later queue state but cannot be used to score initial priority. Missing image/history remains unknown.
3. Have blinded reviewers inspect baseline and challenger queues. Measure recall and precision at the same budget, critical misses, category and area coverage, time and decision accuracy. Recheck important cases with adjudication. Enable only if recall rises by at least five percentage points with no extra critical misses or material subgroup regression.

Until both sets are independently collected and assessed, OCR and model ranking remain disabled. The deterministic checks and human evidence comparison remain available.
