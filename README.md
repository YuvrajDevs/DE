# DE

Preparation for the **Cummins Data Engineer 1** role (Pune, Req ID 2435232).

## `platform/`: DE Arcade

A data engineering trainer for the Cummins DE 1 loop that runs entirely in the browser. **Theory** is the single home for concepts: 14 sections, 178 topics (SQL in depth, Python for DE, Spark performance and Delta internals, streaming state, CDC, Databricks/Unity Catalog, governance and PII among them), each with a Senior depth layer. Practice, Hands-on, Scenarios and Interview tabs are generated from the same topics, and the Job posting checklist maps every line of the posting to Theory topics. Theory content lives in `platform/src/content/theory/` (`s*.cjs` base topics, `deep/*.cjs` senior-depth addenda, interview bank, scenarios and hard labs).

Older material still in the repo:

- **16 worlds, 85 lessons, ~560 cards**: orientation → toolbox (computers, terminal, project setup, Git, logins/connections, UI tour, end-to-end platform map) → SQL foundations → advanced SQL → Python → data modelling → ETL/ELT, orchestration & monitoring → data quality, governance, data products & BI → Spark/PySpark → big data ecosystem → streaming/Kafka/IoT → Scale Lab (100M requests, 1B events, 10 TB backfills) → cloud/DevOps/deployment → system design & incidents → AI-ready data → interview room.
- **Practice hub** outside the main path: Query Gym, Python Gym, PySpark Gym, Scenario Room, Scale Lab, Concept Drills by topic, Bug Hunt, Interview Bank, Weak Spots.
- **Posting coverage** page mapping every line of the job posting to lessons and practice.
- **Real code execution**: SQL on SQLite (sql.js), Python on Pyodide, and PySpark through a teaching implementation of the DataFrame API (`src/pyspark_shim.py`) that runs on the same practice warehouse. Answers are graded against reference solutions.
- **20 interactive simulations**: clickable platform map with animated batch/stream/lineage flows, UI tour of the real tools, terminal simulator, napkin-math estimator, joins, GROUP BY, window frames, query order, Spark stages/shuffles, skew + salting, broadcast joins, Kafka partitions/consumer groups, watermarks, incremental loads and idempotency, SCD types, star schema, partition pruning, medallion layers, MapReduce, normalization.
- **Game loop**: XP and ranks, combos, stars per lesson, streaks, spaced-repetition review, a 90-second lightning round, timed mock interviews (technical, design, behavioural, full loop), a 21-day plan, two resume projects with checklists, and a glossary.
- Practice warehouse: a fictional engine maker with the CRF → SR → PIR → Claim → Credit Note warranty flow (`scripts/gen_datasets.py`).

### Build and run locally

```bash
cd platform
./scripts/fetch-vendor.sh        # downloads Pyodide + sql.js into dist/vendor (once)
node build.mjs                   # builds dist/ from src/
python3 scripts/validate.py      # runs every SQL/Python/PySpark reference solution
python3 -m http.server -d dist 8000   # then open http://localhost:8000/
```

Content lives in `platform/src/content/*.cjs` (one file per world). In content strings, `«` and `»` become backticks.

### Deploy on Vercel

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `platform`. `platform/vercel.json` already sets the build command (downloads the engines, then builds) and the output directory (`dist`).
3. Deploy. No environment variables are needed.

On Vercel, progress is saved in the browser (localStorage). Use **Settings → Copy progress backup** to move progress between devices.

## Projects

- **Turbofan Telemetry Streaming Platform**: https://github.com/YuvrajDevs/turbofan-telemetry (its own repo). A full step-by-step walkthrough is inside DE Arcade (stage "Project: Turbofan Telemetry").
