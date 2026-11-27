<!-- chapter: dashboard | 17. Dashboard, Docker image and CI -->
# 17. Dashboard, Docker image and CI

## The dashboard

### Tech box: Streamlit
- **What:** a Python library that turns a script into a web app.
- **Why here:** one file, pure Python, enough for a live fleet view. It reads the Delta tables with delta-rs, so it needs no Spark.
- **Alternatives:** Power BI / Databricks SQL dashboards (what Cummins would use in production on gold tables), Grafana (great for time-series metrics), Superset.
- **Impact:** a demo you can show in an interview in 10 seconds.

### Walkthrough: `dashboard/app.py`

**1. Loading tables safely**

{{snip:dashboard/app.py|st.set_page_config|return pd.DataFrame()}}

- `st.set_page_config(layout="wide")` must be the first Streamlit call.
- `load()` reads a Delta table into a **pandas DataFrame** with delta-rs. If the table does not exist yet, it returns an empty DataFrame so the page still renders.

**2. A live fragment**

{{snip:dashboard/app.py|@st.fragment(run_every=10)|c[4].metric}}

- Streamlit re-runs your script top to bottom on every interaction. `@st.fragment(run_every=10)` re-runs **only this function** every 10 seconds: a live panel without reloading the page.
- `st.columns(5)` creates five side-by-side slots; `.metric(label, value)` shows a big number.
- `(state.alert_level == 2).sum()` is pandas: compare a column to 2 (True/False per row), and summing counts the Trues.

**3. Charts and tables**

{{snip:dashboard/app.py|left, right = st.columns|st.bar_chart}}

- `pivot_table(index="window_start", columns="fleet", values="avg_health_index")` turns rows into one column per fleet, which `st.line_chart` draws as one line each.
- `sort_values("ewma_health", ascending=False).head(15)`: the 15 engines closest to failure.
- `.map({0: "OK", 1: "WARNING", 2: "CRITICAL"})` turns codes into labels.
- `value_counts()` counts dead letters per reason for the bar chart.

{{full:dashboard/app.py}}

```bash
streamlit run dashboard/app.py         # http://localhost:8501
```

## Option B: run everything in Docker (no Java/Python on your machine)

### Walkthrough: `Dockerfile`

{{snip:Dockerfile|FROM python|RUN pip install}}

| Line | Meaning |
|---|---|
| `FROM python:3.12-slim-bookworm` | Start from the official small Python 3.12 image on Debian 12. Pinned, so builds are repeatable |
| `RUN apt-get install ... openjdk-17-jre-headless procps` | Install Java 17 (Spark needs it) and `ps` (Spark's scripts use it). `--no-install-recommends` and deleting the apt lists keep the image small |
| `RUN ln -s ... default-java` | Creates one fixed Java path whatever the CPU architecture (Intel or Apple Silicon), so `JAVA_HOME` always works |
| `ENV JAVA_HOME=... PYTHONUNBUFFERED=1` | Tell Spark where Java is; print Python output immediately (useful for logs) |
| `WORKDIR /app` | All later commands run in `/app` |
| `COPY requirements.txt .` then `RUN pip install` | Copy only the requirements first, so Docker **caches** the slow install step and reuses it when only your code changes |

> **Docker lesson: image vs container.** An **image** is a frozen file system plus settings (built from a Dockerfile). A **container** is a running instance of an image. `docker compose` starts several containers with networking between them, from one YAML file.

{{full:Dockerfile}}
- The `app` service in `docker-compose.yml` mounts your folder, keeps Spark's downloaded jars in a volume (`ivy-cache`) and connects to Kafka at `kafka:19092` (the inside-Docker address from chapter 3).

```bash
docker compose --profile app run --rm app download
docker compose --profile app run --rm app create-topic
docker compose --profile app run --rm app stream          # in one terminal
docker compose --profile app run --rm app produce --rate 500
```

## Continuous integration (CI)

### Tech box: GitHub Actions
- **What:** GitHub runs commands on every push and pull request.
- **Why here:** every change is tested automatically; the green check on your repo is visible proof to reviewers.
- **Alternatives:** Azure DevOps Pipelines (common at enterprises like Cummins), GitLab CI, Jenkins.
- **Impact:** broken code cannot quietly reach `main`.

### Walkthrough: `.github/workflows/ci.yml`

{{snip:.github/workflows/ci.yml|name: ci|python -m pytest}}

| Line | Meaning |
|---|---|
| `on: [push, pull_request]` | Run on every push and every pull request |
| `runs-on: ubuntu-latest` | A fresh Linux virtual machine from GitHub each time |
| `actions/checkout@v4` | Download your repository into the machine |
| `actions/setup-python@v5` with `3.12` | Install Python 3.12 |
| `pip install pytest==8.3.4` | Only pytest: the unit tests need nothing else |
| `python -m pytest -q tests` | Run the tests. A failing test fails the run, and GitHub shows a red cross on the commit |

YAML lesson: indentation **is** structure in YAML (2 spaces per level, never tabs); `- uses:` items are a list of steps.

It finishes in seconds because it needs no Spark or Kafka. The Spark parity test is skipped there (`importorskip`) and is run locally. A fuller CI would add a linter (ruff) and a small Spark integration test.

**Check:** the dashboard shows your engines, and after you push to GitHub (chapter 20) the Actions tab shows a green run.

<!-- chapter: loadtest | 18. Load test and capacity plan -->
# 18. Load test and capacity plan

A pipeline that works for 50,000 events is not proof that it works for 5 million. Measure it.

### Walkthrough: `scripts/loadtest.py`

**1. Running the CLI from Python and counting silver quickly**

{{snip:scripts/loadtest.py|def cli(|return pc.sum(pc.ends_with}}

- `subprocess.run([...], check=True, capture_output=True, text=True)` runs a command, raises if it fails, and captures its output as text: scripts can drive your CLI exactly as you would.
- `silver_count` with no filter sums `num_records` from the Delta log's **add actions**: the row count of every file, read from metadata, without reading any data. Fast enough to poll every 2 seconds.

**2. Phase 1: the backlog drain**

{{snip:scripts/loadtest.py|# ---- phase 1: backlog|events/s end to end", flush=True)}}

- Produce ~450,000 events with **no rate limit** and no manifest, **then** start the stream as a separate process (`subprocess.Popen`, which does not wait).
- Poll silver until every event is there. Throughput = events ÷ total wall-clock time, cold start included. The comment explains why the first, cleverer metric was wrong (F16).

**3. Phase 2: steady state**

{{snip:scripts/loadtest.py|# ---- phase 2: steady state|latency p50}}

- For each target rate, produce for 60 seconds with fresh engine IDs (`--start-loop`), wait until silver has them all, then compute latency percentiles for exactly those engines.
- `try / finally` makes sure the stream process is stopped even if the test fails.

{{full:scripts/loadtest.py}}

Stop any running stream first, then:

```bash
python scripts/loadtest.py --loops 10 --rates 1000 3000       # ~10-15 minutes
python scripts/loadtest.py --layers bronze silver --loops 5 --out docs/loadtest-results-no-gold.json
```

**Two tests:**
1. **Backlog drain:** put ~450,000 events in Kafka, then start the pipeline cold and time how long until all are in silver. This is the maximum processing rate.
2. **Steady state:** produce at 1,000 and 3,000 events/s for 60 s each and measure end-to-end latency (event time → row in silver) and whether it keeps up.

**Results from the original 4-core machine** (yours will differ; write down your own):

| Measure | Result |
|---|---|
| Producer, one Python process | ~28,000 events/s |
| Backlog of ~453,000 events, cold start included | all in silver after ~59 s |
| Steady 3,000 events/s, all layers | keeps up; latency p50 17.8 s, p95 24.6 s |
| Steady 3,000 events/s, **without gold** | latency p50 8.2 s, p95 10.8 s |
| Gold batch duration | ~30 s (the bottleneck) |

**How the bottleneck was found:** every streaming batch is a Delta commit with a timestamp, so the gap between commits is each layer's real batch rate:

```bash
python -c "from deltalake import DeltaTable as D; [print(h['timestamp'], h['operation']) for h in D('lake/gold/engine_current_state').history(10)]"
```

Gold committed every ~30 s while bronze and silver slipped from 5 s to ~6.6 s because they shared 4 cores with gold. Running the same test without gold brought them back to 5 s: a **controlled experiment** confirming the cause.

**The production decision:** run gold as its own job with its own cores and a 30-second trigger (engine health changes once per flight, so 30 s is plenty); keep bronze and silver at 5 s.

Write `docs/capacity-plan.md` with your numbers, then a sizing for 10,000 engines: 10,000 events/s (plan 20,000 at peak), ~900 bytes each → ~9 MB/s → ~780 GB/day in Kafka, ~130 GB/day in Delta (Parquet compresses ~6×). From your measured per-core rates, estimate cores per layer with headroom, and say you would re-test on the target cluster.

A measured metric can lie: an early version reported "145 trillion events/s" because a whole backlog landed in one micro-batch and the formula divided by almost zero (F16). Always sanity-check a number against a second source.

**Check:** you have your own numbers in `docs/capacity-plan.md` and can say what the bottleneck is and how you proved it.

<!-- chapter: trouble | 19. Troubleshooting: every error you might hit -->
# 19. Troubleshooting: every error you might hit

These happened when the project was first built, or when it was rebuilt to write this guide.

| # | Symptom | Cause | Fix |
|---|---|---|---|
| F1 | `failed to connect to the docker API ... docker.sock` | Docker installed but not running | Open Docker Desktop; `docker info` must work |
| F2 | `429 Too Many Requests` pulling images | Docker Hub limit on anonymous pulls | Wait, or sign in with a free Docker account |
| F3 | Download hangs or 404 | NASA moved the link | The code uses the PHM S3 mirror; without internet the synthetic fallback runs |
| F4 | PySpark install or import fails on Python 3.13 | Spark 3.5 does not support 3.13 | Use the pinned PySpark 4.0.1 + delta-spark 4.0.0 |
| F5 | `Broker handle destroyed`, then topic does not exist | Admin client garbage-collected too early | Keep the client in a variable until `result()` |
| F6 | `argument layers: invalid choice: "['bronze', ...]"` | argparse list default with `choices` | Default applied in code, not in argparse |
| F7 | `Current batch is falling behind` | First batches are slow (JVM warm-up) | Normal at start; only a problem if it continues |
| F8 | `repos.spark-packages.org ... 403` | One jar mirror blocked | Harmless; Maven Central serves the jars |
| F9 | `ModuleNotFoundError: No module named 'pyarrow'` in gold, then the whole app stops | Spark's Python workers used the system Python | `PYSPARK_PYTHON = sys.executable` in `spark.py`; restart (checkpoints resume) |
| F10 | Engines CRITICAL but **0 alerts**, no error | Lazy recompute re-read the state table after it was updated | `localCheckpoint(eager=True)`, write alerts first |
| F11 | `fleet_health_minute` has 0 rows | Append mode writes a window only after the watermark passes it; data stopped, so the watermark stopped | Keep a slow stream running for 3+ minutes (below) |
| F12 | p99 latency of minutes | It includes the 30 s late events and any downtime | Report p50/p95/p99, explain the tail |
| F13 | Duplicates after a second producer run | Old event IDs replayed after the 10-minute dedupe window | `--start-loop N` gives new IDs per run |
| F14 | 44% of FD003 engines never alert | Fan fault cancels the compressor pattern | Fault-mode aware index (v2) |
| F15 | `ValueError: sleep length must be non-negative` | Clock read twice at high rates | Read the clock once |
| F16 | Impossible throughput numbers | Rate computed over a window inside one micro-batch | Wall-clock throughput; cross-check with Delta history |
| new | `Failed to acquire idempotence PID ... Coordinator load in progress: retrying` | Kafka just started and is still loading | Harmless; the producer retries by itself |
| new | `ERROR Inbox: Ignoring error ... RejectedExecutionException` right after a crash or stop | Spark shutting down its executors | Harmless shutdown noise |
| new | `report` seems stuck for minutes (normally ~2 s) while the stream is writing | Rare: it read the tables in the middle of busy commits | Ctrl+C and run it again |
| — | `JAVA_HOME is not set` / `UnsupportedClassVersionError` | Java missing or too old | Install Java 17 or 21 |
| — | `NoBrokersAvailable` / connection refused on 9092 | Kafka not running, or wrong address | `docker compose ps`; use `localhost:9092` outside Docker, `kafka:19092` inside |
| — | Changed code in silver/gold and the stream fails to restart | Stateful logic changed, incompatible with the old checkpoint | `python -m telemetry.cli reset`, recreate the topic, re-run (in production: new checkpoint + backfill from bronze) |

**Seeing fleet windows after the demo (F11).** Keep the stream running and send a slow trickle for about 5 minutes, so event time moves past the windows:

```bash
python -m telemetry.cli produce --rate 15 --engines 10 --start-loop 2
python -m telemetry.cli report            # fleet_minute_windows is now > 0
```

**How many alerts should I see?** Each engine raises at most one WARNING and one CRITICAL. The count grows while gold catches up; once every engine has reached failure it is 2 × engines (480 for the 240 engines of the demo). The real check is `alerts.rows == alerts.distinct`.

<!-- chapter: docs | 20. Document it and publish to GitHub -->
# 20. Document it and publish to GitHub

Good documentation is half of why this project impresses. Write these yourself, in your own words: writing them is how you make sure you understand the project.

| File | Contents |
|---|---|
| `README.md` | One-paragraph summary, the architecture sketch, **results table** (verify numbers, dead letters, alert quality, throughput), quick start commands, the command table, project layout, data source credit |
| `docs/architecture.md` | A diagram (Mermaid renders on GitHub), a "guarantee → mechanism" table (no loss: checkpoints; no partial files: Delta commits; duplicates: deterministic ID + watermark dedupe; bad data: dead-letter; ordering: key = engine_id; alerts once: MERGE on alert_id; bounded memory: watermarks + RocksDB; catch-up: maxOffsetsPerTrigger), and a table of tables with their grain |
| `docs/decisions.md` | Architecture Decision Records: one short paragraph per decision with the alternative and why it lost (Kafka, Spark + Delta, medallion, health index v2, dedupe window, dead-letter, foreachBatch + MERGE, event time, everything local, fault-mode labels) |
| `docs/build-log.md` | What you did, phase by phase, and **every failure you hit** with error, cause, fix and lesson |
| `docs/capacity-plan.md` | Your load-test numbers and sizing (chapter 18) |

**Credit the data:** NASA Prognostics Center of Excellence, *Turbofan Engine Degradation Simulation Data Set* (C-MAPSS), A. Saxena and K. Goebel (2008).

**Publish:**

```bash
git add .
git commit -m "Turbofan telemetry streaming pipeline"
```

Create an empty repository on GitHub (no README), then:

```bash
git remote add origin https://github.com/<your-username>/turbofan-telemetry.git
git branch -M main
git push -u origin main
```

Check that `data/`, `lake/` and `.venv/` are **not** in the repository (`.gitignore`), and that the Actions tab shows a green CI run.

**Optional: a project page.** The original repo also has `scripts/build_site.py` and a `site/` page (an interactive explorer of all 200 engines) published with GitHub Pages. Build it only after everything else works.

<!-- chapter: talk | 21. Explain it in an interview -->
# 21. Explain it in an interview

## The 60-second version

"I built a real-time predictive-maintenance pipeline on NASA's public turbofan dataset: 200 engines, each run until failure. A Python producer replays them as a live fleet into **Kafka**, keyed by engine so each engine stays in order. **Spark Structured Streaming** writes **Delta Lake** bronze, silver and gold tables: bronze keeps raw messages, silver validates, sends bad records to a dead-letter table with reason codes and deduplicates by a deterministic event ID, and gold keeps a smoothed health score per engine and raises each alert exactly once with MERGE. Alerts warn every engine a median of 44 cycles before failure. I tested it with duplicates, late and malformed messages and a `kill -9` in the middle, and verified against a producer manifest: 54,787 expected, 54,787 stored, zero lost, zero duplicated. A load test showed it sustains 3,000 events per second on 4 cores and that the stateful gold step is the bottleneck, which I'd split into its own job."

## The questions you will get, and where the answer is

| Question | Chapter |
|---|---|
| Why Kafka? Why key by engine? Why 6 partitions? | 3, 5, 8 |
| How exactly is exactly-once achieved, and how did you prove it? | 11, 12, 15, 16 |
| What happens if a duplicate arrives 20 minutes later? | 12 (watermark trade-off, F13) |
| Why bronze, silver and gold? | 11 |
| How does the health score work, and why EWMA? | 5, 7 |
| How did you find the FD003 problem and how do you know the fix is not overfitted? | 7 |
| Why foreachBatch + MERGE instead of built-in streaming state? | 13 |
| What was the hardest bug? | 13 (F10) |
| What is the bottleneck and how did you find it? | 18 |
| How would this run at Cummins? | below |

## How it would run at Cummins (Azure)

Devices or plant gateways → **IoT Hub / Event Hubs** (Kafka protocol, so the producer and Spark source barely change) → **Azure Databricks** jobs running the same bronze/silver/gold code → Delta tables on **ADLS Gen2** governed by **Unity Catalog** → **Power BI** or Databricks SQL dashboards, alerts to a maintenance system. Changes: managed Kafka with replication 3, Avro + schema registry instead of JSON, gold as a separate job with a 30 s trigger, OPTIMIZE for small files, monitoring of consumer lag and freshness, CI/CD with Databricks Asset Bundles.

## Be honest about what you did

Say what you built, what you measured and what you would change. If you rebuilt it from this guide, say so plainly and show you understand every decision. Strong next steps you can add yourself (and then talk about): normalise FD002/FD004 by operating condition; global dedupe with MERGE; a gold job split with its own trigger; Avro + schema registry; run it on Databricks Free Edition.

**Final check:** you can give the 60-second version without notes, and answer every question in the table.
