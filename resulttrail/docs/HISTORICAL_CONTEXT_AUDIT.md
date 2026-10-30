# Historical election context: source audit

Audited 30 October 2026. Scope: presidential contest, Lagos as the proposed geographic pilot. This is a source-quality audit, not a historical anomaly model or a dataset used by the app.

| Election | Official material examined | Available grain and definitions | Extraction and missingness | Reuse status |
| --- | --- | --- | --- | --- |
| 2015 | [INEC presidential summary](https://inecnigeria.org/wp-content/uploads/2019/02/summary-of-results.pdf) | State rows, including Lagos; registered and accredited voters, party votes, valid, rejected, cast. | Search-index text/table inspection. No verified Lagos ward, LGA or polling-unit table in this source. The old PDF URL may be unavailable from the current site, so original bytes and row-level transcription need independent verification before importing. | No explicit machine-readable data licence identified; do not redistribute a derived bulk dataset yet. |
| 2019 | [INEC presidential declaration](https://www.inecnigeria.org/wp-content/uploads/2024/05/2019-GE-PRESIDENTIAL-ELECTION-RESULTS.pdf) and [2019 general election report](https://inecnigeria.org/wp-content/uploads/2020/11/REPORT-OF-THE-2019-GENERAL-ELECTION.pdf) | Declaration is national party totals; report lists a presidential annex. | Search-index inspection. No verified Lagos ward-level breakdown. The report PDF returned 404 on direct fetch during this audit, so its annex cannot be treated as an extracted dataset. | Licence and stable source bytes not yet verified. |
| 2023 | [INEC general election report](https://inecnigeria.org/wp-content/uploads/2024/02/2023-GENERAL-ELECTION-REPORT-1.pdf) | Presidential annex supplies national totals; report also discusses geographic result summaries and IReV image uploads. | Search-index inspection. No extracted, independently checked Lagos ward result table. An IReV upload count is not a vote count. | Licence and stable source bytes not yet verified. |

INEC describes presidential collation as polling unit → registration area/ward → LGA → state → national in its [collation explanation](https://wp1.inecnigeria.org/collation-and-declaration-of-results/). This process does not mean a public, consistently structured ward-level dataset is available for each year.

## Comparability decision

The [2023 INEC report](https://inecnigeria.org/wp-content/uploads/2024/02/2023-GENERAL-ELECTION-REPORT-1.pdf) says 56,872 voting points were converted to polling units in 2021, changing the national count from 119,974 to 176,846; voters were subsequently registered or transferred into new units. A raw polling-unit trend across 2015/2019/2023 would therefore mix boundary and denominator changes with any voting change. Party lists, turnout denominators and electoral procedures also differ. Population is not an anomaly denominator. For a current report, compare against its current registered/accredited figures and source copy first.

**Result:** No historical values are loaded into ResultTrail and history has zero ranking weight. A future contextual panel needs original official bytes, documented extraction with spot checks, stable geography crosswalks, comparable contest/party definitions, verified reuse rights, and an independent evaluation of incremental reviewer value. Until then the map remains current submission coverage only.
