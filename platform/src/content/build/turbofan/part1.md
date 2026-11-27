<!-- chapter: why | 0. Why this project exists and why it is good -->
# 0. Why this project exists, and why it is a strong project

Read this before you install anything. If you can explain this page in your own words, you can explain the whole project in an interview.

## The problem in one paragraph

Cummins sells engines that run in trucks, mines, ships and generators. Modern engines are full of sensors (temperatures, pressures, speeds) and send readings over the network all the time. When an engine wears out and fails in the field, it is expensive: the truck stops, the customer loses money, a technician has to travel, and the failure may become a **warranty claim**. If you can see an engine **getting worse before it fails**, you can plan maintenance instead of reacting to a breakdown. That is called **predictive maintenance**.

To do it, a company needs a **data pipeline**: a system that takes the sensor readings as they arrive, cleans them, keeps them safely, computes an **engine health score**, and raises an **alert** early enough to act. That pipeline must be reliable: no readings lost, no readings counted twice, bad data must not break it, and it must recover if a machine crashes.

**This project builds exactly that pipeline, on real public engine data, on your laptop, for free.**

## What you will have at the end

- A **live stream** of 200 jet engines (NASA's public C-MAPSS dataset, every engine run until it failed) replayed as if the engines were flying right now.
- **Kafka** receiving the readings, **Spark Structured Streaming** processing them, **Delta Lake** tables storing them in three layers (**bronze → silver → gold**).
- A **health score** per engine and **alerts** (WARNING, then CRITICAL) that fire a median of **44 cycles (flights) before failure** for **every one** of the 200 engines.
- **Proof** that nothing is lost or duplicated even when you inject duplicates, late messages and broken messages **and kill the processing program in the middle** (`kill -9`): 54,787 expected events, 54,787 stored, 0 missing, 0 duplicates.
- A **dead-letter table** where every bad message is kept with a reason, instead of crashing the pipeline.
- A **load test** that measures how fast it is and finds the bottleneck.
- **Unit tests**, a **CI pipeline** on GitHub, a **dashboard**, and **documentation** (architecture, decisions, a failure log).

## Why this is a good project (what a reviewer sees)

Most student data projects are "read a CSV, transform it, write a CSV". They show you can use a library. They do not show you can run something in production. This project is designed to show production thinking:

| What most projects show | What this project shows | Why an interviewer cares |
|---|---|---|
| A pipeline that runs once | A pipeline that **keeps running**, survives a crash and resumes exactly where it stopped | Real pipelines fail every week. Recovery is the job. |
| "It works" | "It works, **and here is the proof**" (a manifest of every event compared with the output) | Claims are cheap. Verification is rare and convincing. |
| Clean input | Input with **duplicates, late data and garbage** injected on purpose | Real sources are dirty. Handling it is most of data engineering. |
| One script | **Layers** (bronze/silver/gold) with clear jobs | This is how Databricks lakehouses at Cummins-sized companies are organised. |
| No numbers | **Measured** throughput, latency percentiles, a found bottleneck, a capacity plan | Shows you can reason about scale with evidence. |
| No mistakes shown | **16 documented failures** with cause and fix | Shows debugging skill and honesty. |
| Random fake data | **Real NASA data**, public and verifiable | Anyone can check your results. |
| A model that "looks right" | A model **evaluated per fleet** that revealed a 44% miss on one fault type, then fixed it (56% → 100%) | Shows you check results by segment, not just on average. |

## Why it fits the Cummins Data Engineer 1 posting

| Posting line | Where this project covers it |
|---|---|
| Ingest **event-based** data | Kafka producer and consumer, partitions, keys |
| Build reliable, scalable pipelines **with monitoring and alerts** | Streaming queries, checkpoints, progress metrics, alerts table, report command |
| Monitor and troubleshoot **data quality and integrity** | Validation rules, dead-letter table with reason codes, exactly-once verification |
| **Spark, Kafka**, big data open source | Spark Structured Streaming, Kafka, Delta Lake |
| **Physical data models** and storage architecture | Bronze/silver/gold tables, partitioning, table grains |
| **Testing and troubleshooting** | 14 unit tests, a parity test, a crash test, a load test, the failure log |
| **IoT technology** | Engine telemetry, event time, late data, per-device ordering |
| **AI-ready data** | Clean per-cycle features and labels suitable for failure prediction models |
| **DevOps / CI** | Docker, GitHub Actions CI |

## Why each big choice was made (short version, details in each chapter)

- **Streaming instead of batch:** engines send data continuously and alerts are only useful if they are early. A nightly batch job would warn a day late.
- **Kafka:** the standard way companies move events between systems. It stores messages for days, so you can replay them, and it keeps each engine's readings in order. (Azure Event Hubs, which Cummins is likely to use, speaks the same Kafka protocol.)
- **Spark Structured Streaming:** the same engine data teams already use for batch on Databricks, so one skill covers both. It has checkpoints for crash recovery.
- **Delta Lake:** turns plain files into reliable tables (no half-written files, updates with MERGE, history). It is the default table format on Databricks.
- **Bronze/silver/gold:** keep the raw data untouched (so you can always rebuild), clean it once, and serve business-ready tables.
- **NASA C-MAPSS data:** real engines run until failure, public, no login, and the right domain (engines) for Cummins. Never use employer data in a personal project.
- **Everything local and free:** anyone can run it with Docker and Python, no cloud account, no cost. The same code runs on Databricks by changing paths.

## How to use this guide

1. Do the chapters **in order**. Each one ends with a **Check** step: do not continue until the check passes.
2. Every file is given **complete**. Create the file with exactly that name and content. Read the explanation under it before moving on; that is what you will be asked about.
3. Every technology has a box: **What it is, Why here, Alternatives, Advantages, Impact**. Learn those boxes; they are your interview answers.
4. When something breaks, look at the **Troubleshooting** chapter first: the same errors happened when this project was first built.
5. Type the code where you can instead of only copying it. Typing makes you read every line.

**Time needed:** about 2-3 days for a first build if you are new, plus a day to run the tests and write your own notes.

**An honest note on ownership:** after you build this yourself following the guide, you can truthfully say you built and verified it. In an interview, be ready to explain any line and any decision; if you followed a guide for parts of it, say so plainly and focus on what you understood, changed and measured yourself. Interviewers respect that far more than a claim that falls apart under questions.

<!-- chapter: words | 1. The big picture and the words you need -->
# 1. The big picture, and the words you need

## The flow, in plain words

```
NASA data file ──► Producer (Python) ──► Kafka topic ──► Spark: Bronze ──► Silver ──► Gold ──► Dashboard
 200 engines       sends one reading     a durable        raw copy       clean,       health,     charts
 run to failure    per engine per tick   queue/log        of everything  checked,     alerts,
                   (+ chaos on purpose)                                   no dupes     fleet stats
                                                           Silver ──► Dead-letter table (bad messages + reason)
```

1. A **producer** program reads the NASA file and sends one JSON message per engine reading into **Kafka**, as if 200 engines were flying right now. On purpose, it also sends some duplicates, late messages and broken messages.
2. **Spark** reads Kafka continuously in small batches every 5 seconds (**micro-batches**).
3. **Bronze** stores every message exactly as received.
4. **Silver** checks each message. Good ones are parsed into columns, de-duplicated and given a health score. Bad ones go to a **dead-letter** table with a reason.
5. **Gold** keeps one row per engine (latest health, alert level), an alerts table (each alert once), and per-minute fleet statistics.
6. A **report/verify** command proves nothing was lost or duplicated. A **dashboard** shows the fleet.

## Words you must know (one line each)

| Word | Meaning |
|---|---|
| **Event / message** | One reading from one engine for one cycle, as JSON |
| **Cycle** | One flight of the engine. Engines live 128-362 cycles in this data |
| **Producer / consumer** | A program that writes to / reads from Kafka |
| **Topic** | A named stream in Kafka (ours: `engine-telemetry`) |
| **Partition** | A topic is split into partitions so several readers work in parallel. Order is kept **inside** a partition |
| **Key** | A value attached to each message (ours: `engine_id`). Same key → same partition → that engine's readings stay in order |
| **Offset** | The position number of a message inside a partition |
| **Micro-batch** | Spark processes whatever arrived in the last few seconds as one small batch |
| **Checkpoint** | A folder where Spark records what it has processed, so after a crash it continues from there |
| **Delta table** | A folder of Parquet files plus a transaction log that makes it behave like a reliable database table |
| **Bronze / silver / gold** | Raw → clean → business-ready layers (the "medallion" pattern) |
| **Dead-letter table** | Where bad records go, with the reason, instead of being dropped or crashing the job |
| **Event time** | When the reading happened (set by the producer), as opposed to when we received it |
| **Watermark** | How long Spark waits for late events before treating a time period as complete |
| **Idempotent** | Doing it twice gives the same result as once. The key to safe retries |
| **Exactly-once** | Every event affects the result exactly one time, even with retries and crashes |
| **EWMA** | A smoothed average that gives more weight to recent values; used to smooth the noisy health score |
| **MERGE (upsert)** | Update the row if the key exists, insert if not |

## The final folder layout (you will create all of it)

```
turbofan-telemetry/
  requirements.txt  docker-compose.yml  Dockerfile  .gitignore  README.md
  telemetry/
    __init__.py  config.py  cmapss.py  events.py  admin.py  producer.py  spark.py  report.py  cli.py
    jobs/  __init__.py  bronze.py  silver.py  gold.py  run.py
  tests/  test_events.py  test_spark_parity.py
  scripts/  calibrate.py  demo.sh  loadtest.py
  dashboard/  app.py
  docs/  architecture.md  decisions.md  build-log.md  capacity-plan.md
  .github/workflows/ci.yml
  data/   lake/   (created by the programs, never committed to Git)
```

**Check:** you can explain, without looking, what bronze, silver and gold each do, and why the message key is the engine id.

<!-- chapter: setup | 2. Set up your computer -->
# 2. Set up your computer

You need five tools. Install them once.

| Tool | Version | Why |
|---|---|---|
| Git | any recent | Version control, push to GitHub |
| Python | **3.12** (3.10-3.13 work) | The language of the whole project |
| Java (JDK) | **17 or 21** | Spark runs on the Java Virtual Machine, even when you write Python |
| Docker Desktop | any recent | Runs Kafka in a container, no Kafka install needed |
| VS Code | any | Editor (any editor works) |

**Windows users:** install **WSL2 with Ubuntu** (`wsl --install` in an admin PowerShell, then restart) and run every command in this guide inside the Ubuntu terminal. Spark and shell scripts are much easier there. Install Docker Desktop on Windows and enable "Use the WSL 2 based engine".

**macOS:** install Homebrew, then `brew install git python@3.12 openjdk@17` and Docker Desktop.

**Ubuntu / WSL:**

```bash
sudo apt update && sudo apt install -y git python3.12 python3.12-venv openjdk-17-jdk
```

### Tech box: Docker
- **What it is:** a tool that runs software in isolated "containers" built from images, so it behaves the same on every machine.
- **Why here:** Kafka is a Java server with many settings. With Docker you start a correct, pinned Kafka with one command and delete it just as easily.
- **Alternatives:** installing Kafka by hand (slow, error-prone), a cloud Kafka (needs an account and money).
- **Advantages:** reproducible, no system clutter, the same file works for every reviewer.
- **Impact:** without it, "works on my machine" problems would eat days.

### Tech box: Java for a Python project
- **What it is:** Spark is written in Scala and runs on the JVM. PySpark is a Python front end that talks to that JVM.
- **Why it matters:** if Java is missing or the wrong version, Spark will not start (`JAVA_HOME is not set`, `UnsupportedClassVersionError`).
- **Rule:** Spark 4 needs Java 17 or 21.

## Check that everything works

```bash
git --version
python3 --version        # 3.12.x (3.10-3.13 fine)
java -version            # 17 or 21
docker info              # must print "Server Version". If it errors, open Docker Desktop (daemon not running)
```

## Create the project folder and a virtual environment

```bash
mkdir turbofan-telemetry && cd turbofan-telemetry
git init
python3 -m venv .venv
source .venv/bin/activate          # Windows WSL is the same. Your prompt now starts with (.venv)
mkdir -p telemetry/jobs tests scripts dashboard docs .github/workflows
touch telemetry/__init__.py telemetry/jobs/__init__.py
```

### Tech box: virtual environment (venv)
- **What:** a private folder of Python packages for this project only.
- **Why:** this project pins exact versions (Spark 4.0.1 etc.). Installing them globally can break other projects, and other projects can break this one.
- **Alternatives:** conda, poetry, uv. venv is built into Python and enough here.
- **Impact:** without it, the "Python workers use the wrong interpreter" bug (F9 in Troubleshooting) is much more likely.

## requirements.txt

Create `requirements.txt`:

{{file:requirements.txt}}

**Every line explained:**

| Package | What it does here | Why this one |
|---|---|---|
| `pyspark==4.0.1` | The stream processor | Spark 4 supports Python 3.13 and Java 17/21. Spark 3.5 does not support Python 3.13 (F4) |
| `delta-spark==4.0.0` | Delta Lake for Spark | Delta versions are built for one Spark version: 4.0.0 matches Spark 4.0 |
| `confluent-kafka==2.8.0` | Python Kafka client (producer, admin) | Built on librdkafka (C): much faster than `kafka-python` and supports the idempotent producer |
| `pandas==2.2.3`, `pyarrow==19.0.1` | Used by Spark's `applyInPandas` in gold, and by the report | pandas UDFs move data with Arrow |
| `deltalake==0.25.5` | delta-rs: reads Delta tables **without Spark** | The report, verify and dashboard start in milliseconds instead of waiting for a JVM |
| `streamlit==1.41.1` | Dashboard | A web dashboard in one Python file |
| `pytest==8.3.4` | Tests | The standard Python test runner |

**Why pin exact versions (`==`)?** So the project behaves the same next year. Spark, Delta and the Kafka connector must match each other exactly; an unpinned upgrade is the most common reason a data project stops working.

```bash
pip install -r requirements.txt
```

## .gitignore

Create `.gitignore`:

{{file:.gitignore}}

`data/` and `lake/` are created by the programs (downloaded data, Delta tables, checkpoints). They are large, machine-specific and reproducible, so they never go into Git.

**Check:** `python -c "import pyspark, delta, confluent_kafka; print(pyspark.__version__)"` prints `4.0.1`.

<!-- chapter: kafka | 3. Run Kafka with Docker -->
# 3. Run Kafka with Docker

### Tech box: Apache Kafka
- **What it is:** a distributed, durable **log** of events. Producers append messages to a topic; consumers read them at their own pace; messages stay for a retention period (ours: 7 days) whether or not they were read.
- **Why here:** engines produce a continuous stream. Kafka absorbs bursts, keeps each engine's readings in order (by key), lets several consumers read the same data, and lets you **replay** after a bug or crash.
- **Alternatives:** **Azure Event Hubs** / AWS Kinesis (managed cloud versions; Event Hubs even speaks the Kafka protocol, so this code works against it), RabbitMQ (a queue: messages are deleted once consumed, no replay), writing files to a folder (no ordering, no backpressure, slow).
- **Advantages:** replay, ordering per key, parallelism through partitions, huge throughput, industry standard.
- **Impact:** without a durable log, a crash in the processor would lose whatever was in flight, and you could not reprocess history.

### Tech box: KRaft mode
Old Kafka needed a second system, **ZooKeeper**, to manage the cluster. Since Kafka 3.3 it can manage itself with its own consensus protocol (**KRaft**), and **Kafka 4.0 removed ZooKeeper completely**. So we run one container that is both broker and controller. Simpler, and current.

Create `docker-compose.yml`:

{{file:docker-compose.yml}}

**What each important setting means:**

| Setting | Meaning |
|---|---|
| `image: apache/kafka:3.9.0` | Official Apache image, **pinned** version. Never use `latest` in a project others must reproduce |
| `KAFKA_PROCESS_ROLES: broker,controller` | One node does both jobs (KRaft, no ZooKeeper) |
| `KAFKA_LISTENERS` / `ADVERTISED_LISTENERS` | Kafka gives clients an address to reconnect to. `localhost:9092` for programs on your laptop, `kafka:19092` for programs inside Docker. Getting this wrong is the #1 "cannot connect to Kafka" problem |
| `*_REPLICATION_FACTOR: 1` | We have one broker, so internal topics can only have one copy. In production: 3 |
| `KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"` | Topics must be created on purpose (with our partition count). Prevents typos silently creating new topics |
| `KAFKA_LOG_RETENTION_HOURS: 168` | Keep messages 7 days, so you can replay |
| `healthcheck` | Docker knows when Kafka is really ready |
| `kafka-ui` | A web page to look inside Kafka (topics, partitions, messages) |
| `app`, `dashboard` with `profiles: ["app"]` | Optional: run the Python code inside Docker if you cannot install Java/Python (Option B, chapter 17). Not started by default |

```bash
docker compose up -d
docker compose ps          # tt-kafka should be "healthy" after ~20-30 s
```

Open **http://localhost:8080**: Kafka UI. There are no topics yet.

**Check:** `docker compose ps` shows `tt-kafka` healthy and Kafka UI loads in the browser.

<!-- chapter: data | 4. Get and understand the NASA data -->
# 4. Get and understand the NASA data

### Tech box: NASA C-MAPSS
- **What it is:** NASA simulated turbofan (jet) engines with a physics model called C-MAPSS. Every engine starts healthy and runs until it fails. One row = one cycle (≈ one flight): engine number, cycle number, 3 operating settings and 21 sensor readings.
- **Why here:** real engine degradation, public and free (no login), small (12 MB), widely used in predictive-maintenance research, and in Cummins' domain (engines).
- **Alternatives:** random fake data (no real signal to find, so the alerts would mean nothing), employer data (**never**: confidential), Kaggle copies (need a login).
- **Impact:** because the data is real, your "44 cycles of warning" result is a real, checkable finding.

**The four subsets:**

| Subset | Engines | Operating conditions | Fault types |
|---|---|---|---|
| **FD001** | 100 | 1 | 1 (high-pressure compressor, "HPC") |
| FD002 | 260 | 6 | 1 |
| **FD003** | 100 | 1 | 2 (HPC **and** fan) |
| FD004 | 248 | 6 | 2 |

**We use FD001 + FD003.** They run at one operating condition, so when a sensor drifts, it is because of wear. In FD002/FD004 the same sensor value means different things at different altitudes and speeds, so you would first need per-condition normalisation (a good extension later).

## The data module

Create `telemetry/cmapss.py`:

{{file:telemetry/cmapss.py}}

**Read it like this:**
- `URL`: the official NASA Prognostics Center mirror. The first link tried (on data.nasa.gov) was dead (F3). External links move: pin the source and document it.
- `download()`: downloads the zip once, extracts the inner `CMAPSSData.zip`, and writes the `.txt` files to `data/cmapss/`. It skips the download if the files already exist (safe to run twice: **idempotent**).
- `load(subset)`: turns each line of `train_FD001.txt` into a dictionary like `{"unit": 7, "cycle": 113, "s1": 518.67, ...}`.
- `synthetic()`: if the file is missing (no internet, link moved), it generates fake engines with the **same shape** and realistic drift so the project still runs. A **fallback** is good engineering for any external dependency.

It needs `config.py` for the `DATA_DIR` path. Create `telemetry/config.py` now (explained fully in chapter 5):

{{file:telemetry/config.py}}

Download the data:

```bash
python -c "from telemetry import cmapss; cmapss.download()"
ls data/cmapss            # train_FD001.txt ... train_FD004.txt, test_*, RUL_*
```

## Look at the data yourself (do this, it is where the design comes from)

```bash
python - <<'EOF'
from statistics import mean
from telemetry.cmapss import load, SENSORS
rows = load("FD001")
by = {}
for r in rows: by.setdefault(r["unit"], []).append(r)
first = [rs[0] for rs in by.values()]; last = [max(rs, key=lambda r: r["cycle"]) for rs in by.values()]
print("engines:", len(by), "| life (cycles) min/avg/max:", min(len(v) for v in by.values()), round(mean(len(v) for v in by.values())), max(len(v) for v in by.values()))
for s in SENSORS:
    a, b = mean(r[s] for r in first), mean(r[s] for r in last)
    print(f"{s:>4}  first cycle {a:10.3f}   last cycle {b:10.3f}   {'RISES' if b > a * 1.0005 else 'FALLS' if b < a * 0.9995 else 'flat'}")
EOF
```

**What you will see** (this is what the health score is built on):
- Engines live **128-362 cycles**, about 206 on average.
- **s1, s5, s6, s10, s16, s18, s19** are flat: no information, ignored.
- **s2, s3, s4, s11, s15, s17 rise** as the engine wears (temperatures and pressures go up).
- **s7, s12, s20, s21 fall**.
- **s8, s9, s13, s14** are the fan and core **speed** sensors. s9 and s14 also rise, s8 and s13 barely move. The project leaves the four speed sensors out and builds the score from the **10 temperature, pressure and flow sensors** above, which drift cleanly with wear. (Trying the speed sensors in the score is a good experiment once everything works: measure it with the calibration script in chapter 7.)

That table is the whole idea of the health score in chapter 5: measure how far the 10 drifting sensors have moved from their healthy values.

**Check:** the script prints 100 engines and you can name which sensors rise and which fall.
