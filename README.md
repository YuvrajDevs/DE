# DE

Preparation for the **Cummins Data Engineer 1** role (Pune, Req ID 2435232).

## `platform/`: DE Arcade

A gamified data engineering trainer that runs entirely in the browser:

- **14 worlds, 68 lessons, ~380 cards**: SQL foundations → advanced SQL → Python → data modelling → ETL/ELT & pipelines → data quality, governance & data products → Spark/PySpark → big data ecosystem → streaming/Kafka/IoT → cloud/DevOps/Agile → system design & incidents → AI-ready data → interview room.
- **Real code execution**: SQL on SQLite (sql.js), Python on Pyodide, and PySpark through a teaching implementation of the DataFrame API (`src/pyspark_shim.py`) that runs on the same practice warehouse. Answers are graded against reference solutions.
- **16 interactive simulations**: joins, GROUP BY, window frames, query order, Spark stages/shuffles, skew + salting, broadcast joins, Kafka partitions/consumer groups, watermarks, incremental loads and idempotency, SCD types, star schema, partition pruning, medallion layers, MapReduce, normalization.
- **Game loop**: XP and ranks, combos, stars per lesson, streaks, spaced-repetition review, a 90-second lightning round, timed mock interviews (technical, design, behavioural, full loop), a 21-day plan, two resume projects with checklists, and a glossary.
- Practice warehouse: a fictional engine maker with the CRF → SR → PIR → Claim → Credit Note warranty flow (`scripts/gen_datasets.py`).

### Build and run locally

```bash
cd platform
./scripts/fetch-vendor.sh        # downloads Pyodide + sql.js into dist/vendor (once)
node build.mjs                   # builds dist/ from src/
python3 scripts/validate.py      # runs every SQL/Python/PySpark reference solution
python3 -m http.server -d dist 8000   # then open http://localhost:8000/dev.html
```

Content lives in `platform/src/content/*.cjs` (one file per world). In content strings, `«` and `»` become backticks.
