# Data sheet — ResultTrail fictional demonstration and benchmark

## Motivation and composition

The project uses fictional result copies to demonstrate evidence handling without processing real electoral data. The hosted demonstration has 15 curated geographic records. The separate evaluation generator produces 540 fictional training rows and a frozen 300-row holdout. The holdout includes 180 ordinary cases, 36 valid extremes, 36 injected arithmetic mistakes and 48 context-dependent cases; 84 are labelled review-worthy by the generator. Party labels and unit identifiers are invented. No person-level records are intentionally collected for the demonstration.

## Creation, use and limits

The data was generated locally by project scripts, not gathered from an election. Geographic names and boundary assets are used for interface context; [geodata attribution](geodata.md) documents their source and limits. The benchmark generator seed is `20261026`; [generator notes](synthetic-data-sheet.md) and [evaluation JSON](synthetic-evaluation.json) provide the split, features, hash and results. These datasets are suitable for software checks and a controlled demo. They must not be used to infer actual turnout, integrity, party support or risk in a real place.

## Distribution and maintenance

The project code is MIT-licensed. The application database and credentials are excluded from this repository. Project owners maintain the fictional examples and can replace them with new fictional cases. The hosted database currently has no automatic retention period; see [privacy and retention](privacy-and-retention.md). Synthetic distribution is simplistic and has not been validated for language, disability or regional fairness.
