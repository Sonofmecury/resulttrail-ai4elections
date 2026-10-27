# Fictional benchmark data sheet

`server/evaluate.py` generates an independent, team-authored fictional corpus. It does not download, copy or transform real election results. Party labels A/B and three region labels are invented. Seed `20261026` and the generator version `aegisrelay-fictional-v1` are recorded in the JSON report with a SHA-256 hash of the frozen holdout rows.

Training has 540 clean simulated rows, 180 per invented region. The holdout has 300 rows: 180 ordinary, 36 valid normal extremes, 36 injected arithmetic mistakes and 48 arithmetically valid contextual cases. Review-worthy labels are assigned solely by the generator to the last two scenario families. The “critical” label applies to arithmetic mistakes for gate comparison; it is not a real-world severity assessment.

Features are relative accredited count, turnout ratio, rejected fraction and fictional party A share. Baseline A ranks arithmetic errors; B adds median/MAD peer deviation; C adds Isolation Forest outlier score while keeping arithmetic errors first. The same 60-of-300 review capacity is used for each method. Counts, precision, recall and critical misses are in [synthetic-evaluation.json](synthetic-evaluation.json). The holdout is not used to fit the model or peer ranges.

This evaluation is suitable for checking code wiring and a predeclared gate, not for claiming electoral accuracy. The generator assumptions make its labels easy to learn and cannot represent field distribution shifts, transcription workflows, local politics or adversarial behavior. No claim about real fraud detection is supported.
