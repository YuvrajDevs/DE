"""Generate the "Project: Turbofan Telemetry" stage from the REAL project source code.

Every code block in the walkthrough is pulled from the turbofan-telemetry repository, so the
lessons can never drift from the project. Re-run after changing the project:

    python3 scripts/gen_walkthrough.py /path/to/turbofan-telemetry > src/content/w14-turbofan.cjs
"""
import ast
import json
import sys
from pathlib import Path

REPO = Path(sys.argv[1] if len(sys.argv) > 1 else "../../turbofan-telemetry")
HERE = Path(__file__).resolve().parent
ENGINES = json.loads((HERE / "turbofan_engines.json").read_text())


def src(rel):
    return (REPO / rel).read_text()


def fn(rel, name):
    """Source of one top-level function/class (with decorators and comments directly above)."""
    text = src(rel)
    tree = ast.parse(text)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name == name:
            lines = text.splitlines()
            start = node.lineno - 1
            while start > 0 and lines[start - 1].strip().startswith("#"):
                start -= 1
            return "\n".join(lines[start:node.end_lineno])
    raise KeyError(f"{name} not in {rel}")


def between(rel, start, end=None):
    """Lines from the first line containing `start` up to (not incl.) the first later line containing `end`."""
    lines = src(rel).splitlines()
    i = next(k for k, l in enumerate(lines) if start in l)
    j = len(lines) if end is None else next(k for k in range(i + 1, len(lines)) if end in lines[k])
    return "\n".join(lines[i:j]).rstrip()


def code(text, lang="python"):
    return f"```{lang}\n{text}\n```"


# ---------------------------------------------------------------- card builders (same shapes as _h.cjs)
def learn(title, md): return {"t": "learn", "title": title, "md": md.strip()}
def mcq(q, opts, a, why="", **kw): return {"t": "mcq", "q": q, "opts": opts, "a": a, "why": why, **kw}
def multi(q, opts, a, why=""): return {"t": "multi", "q": q, "opts": opts, "a": a, "why": why}
def tf(q, a, why=""): return {"t": "tf", "q": q, "a": a, "why": why}
def order(q, items, why=""): return {"t": "order", "q": q, "items": items, "why": why}
def match(q, pairs, why=""): return {"t": "match", "q": q, "pairs": pairs, "why": why}
def fill(q, a, why=""): return {"t": "fill", "q": q, "a": a, "why": why}
def talk(q, a, tag="design"): return {"t": "talk", "q": q, "a": a.strip(), "tag": tag}
def bug(q, c, a, why, lang="python"): return {"t": "bug", "q": q, "code": c, "a": a, "why": why, "lang": lang}
def py(q, starter, tests, solution, hint=None): return {"t": "py", "q": q, "starter": starter, "tests": tests, "solution": solution, **({"hint": hint} if hint else {})}
def viz(kind, title, md="", params=None, why=""): return {"t": "viz", "kind": kind, "title": title, "md": md, "params": params or {}, "why": why}
def scenario(title, setup, steps, why=""):
    return {"t": "scenario", "title": title, "setup": setup, "why": why,
            "steps": [{"q": q, "opts": [{"text": o[0], "ok": bool(o[1]), "fb": o[2]} for o in opts]} for q, opts in steps]}
def lesson(id_, title, mins, cards): return {"id": id_, "title": title, "mins": mins, "cards": cards}


FAILURES = [
    dict(id="F1", kind="env", title="Docker daemon not running", when="First `docker ps` in the build environment",
         error="failed to connect to the docker API at unix:///var/run/docker.sock; ... no such file or directory",
         cause="The Docker **CLI** was installed but the **daemon** (background service that actually runs containers) wasn't started.",
         fix="Start the daemon. On a laptop: open Docker Desktop and wait for it to say 'running'. Check with `docker info`.",
         lesson="'Command exists' is not the same as 'service running'. `docker info` tells you whether the daemon is up."),
    dict(id="F2", kind="env", title="Docker Hub rate limit", when="Pulling kafka-ui and python images",
         error="429 Too Many Requests (anonymous pull limit)",
         cause="Docker Hub limits anonymous image pulls per IP address.",
         fix="Kafka's image was already pulled, so testing continued with Kafka in Docker and Python/Spark run natively. On a laptop this is rare. If it happens, wait or sign in with a free Docker account.",
         lesson="CI pipelines hit this too. Companies mirror images in a private registry."),
    dict(id="F3", kind="env", title="NASA download link dead", when="Finding the dataset",
         error="curl -I https://data.nasa.gov/docs/legacy/CMAPSSData.zip  ->  HTTP 000 (no response)",
         cause="NASA reorganised its open-data portal; old links broke.",
         fix="Used the official NASA PHM dataset mirror on S3 (HTTP 200) and added a synthetic fallback generator with the same shape.",
         lesson="External sources move. Pin the source, document it, and have a fallback."),
    dict(id="F4", kind="env", title="Python 3.13 vs PySpark 3.5", when="Choosing versions",
         error="PySpark 3.5 officially supports Python up to 3.12",
         cause="The build machine runs Python 3.13.",
         fix="Moved to PySpark 4.0.1 + delta-spark 4.0.0 (a matching pair). The Docker image uses Python 3.12 to be safe everywhere.",
         lesson="Check the compatibility matrix: Spark ↔ Delta ↔ Python ↔ Java ↔ Scala-2.13 connector jars."),
    dict(id="F5", kind="bug", title="Topic creation silently failed", when="`telemetry.cli create-topic`, first run",
         error='KafkaError{code=_DESTROY,val=-197,str="Handle is terminating: Local: Broker handle destroyed"}\nengine-telemetry does not exist',
         cause="`client().create_topics(...)` started an async request and returned a future, but nothing kept a reference to the AdminClient, so Python garbage-collected it before the request finished.",
         fix="Keep the client in a variable (`admin = client()`) until `future.result()` returns.",
         lesson="Async clients must outlive their futures."),
    dict(id="F6", kind="bug", title="CLI rejected its own default", when="`telemetry.cli stream`",
         error="telemetry stream: error: argument layers: invalid choice: \"['bronze', 'silver', 'gold']\"",
         cause="argparse with `nargs='*'`, `choices=[...]` and a **list** default validates the whole list as one choice.",
         fix="No default in argparse; apply it in code: `a.layers or ('bronze', 'silver', 'gold')`.",
         lesson="Read library edge cases; small CLI papercuts block whole runs."),
    dict(id="F7", kind="info", title="'Current batch is falling behind' warnings", when="First minute of streaming",
         error="ProcessingTimeExecutor: Current batch is falling behind. The trigger interval is 5000 milliseconds, but spent 9973 milliseconds",
         cause="First micro-batches include JVM warm-up, jar loading and table creation, so they take longer than the 5 s trigger.",
         fix="Nothing, unless it persists under normal load. Then increase the trigger, scale out, or cap batch size.",
         lesson="Distinguish warnings that describe start-up from ones that signal a capacity problem."),
    dict(id="F8", kind="info", title="Ivy 403 from repos.spark-packages.org", when="Spark downloading Kafka/Delta jars",
         error="Server access error at url https://repos.spark-packages.org/... (403 Forbidden)",
         cause="Spark's dependency resolver tries several repositories; one was blocked by the network, Maven Central worked.",
         fix="Nothing: all 14 jars resolved from Maven Central.",
         lesson="Read to the end of a log before assuming an error is fatal."),
    dict(id="F9", kind="bug", title="Python workers missing pyarrow: whole app stopped", when="First end-to-end run",
         error="org.apache.spark.api.python.PythonException: ... ModuleNotFoundError: No module named 'pyarrow'",
         cause="Spark starts **separate Python worker processes** for pandas UDFs (applyInPandas). They used the system Python (no pyarrow), not the project's virtual environment. The gold query died; `awaitAnyTermination()` then ended the app, so bronze stopped too and 1,329 late events never arrived (verify: FAIL, 1,329 missing).",
         fix="Set `PYSPARK_PYTHON`/`PYSPARK_DRIVER_PYTHON` to `sys.executable` in `get_spark()`. Restarted **without deleting anything**: checkpoints resumed every query, verify → PASS (44,913 / 0 missing / 0 duplicates).",
         lesson="Driver and workers must share the same environment (on clusters: same image on every node). One query failing stops the app: fail-fast. In production, run layers as separate jobs."),
    dict(id="F10", kind="bug", title="Alerts silently missing (lazy recomputation)", when="After fixing F9",
         error="engine_current_state: 156 CRITICAL engines\nengine_alerts: 0 rows\n(no error anywhere)",
         cause="The batch result `out` was computed from the engine_state table. The code MERGEd new **state first**, then computed alerts from `out`. Spark is lazy and `persist()` is only a hint, so Spark **recomputed** `out`, re-reading a state table that had just been updated. Every event looked already applied → zero alerts.",
         fix="`out = ....localCheckpoint(eager=True)` materialises the batch once and cuts the lineage to the state table; write alerts before state. Result: 156 WARNING + 156 CRITICAL alerts, once each.",
         lesson="Never read and write the same table in one lazy plan without materialising first. `cache()` is a performance hint, not a correctness guarantee. End-to-end verification catches what unit tests can't."),
    dict(id="F11", kind="info", title="Fleet-minute table empty", when="After the first wave",
         error="fleet_health_minute: 0 rows",
         cause="Append mode writes a window only when it is final (watermark = max event time − 2 min passes the window end). All events happened within ~1 minute, then the stream went quiet, so the watermark never moved.",
         fix="A second, slower wave of events advanced the watermark and the windows appeared. In a real fleet data never stops.",
         lesson="The watermark trade-off: completeness vs latency. `update` mode would show partial windows immediately."),
    dict(id="F12", kind="info", title="p99 latency of ~400 s", when="Report after recovery",
         error="latency_event_to_silver_ms: p50 5,833 · p95 6,371 · p99 400,926",
         cause="The 1% tail = events deliberately delayed by 30 s **plus** the minutes the app was down during F9.",
         fix="None: it is the honest number. Report p50/p95/p99 separately; never only an average.",
         lesson="Percentiles tell the story averages hide."),
    dict(id="F13", kind="design", title="Nearly re-sent old event ids", when="Planning a second producer wave",
         error="(caught before it happened) a second run would replay engines with the same ids 15 minutes later",
         cause="Silver only de-duplicates inside the 10-minute watermark, so replaying old ids later would land as duplicates.",
         fix="Added `--start-loop` so every run uses fresh engine ids (FD001-007-L1). Documented global dedupe as Milestone T4.",
         lesson="Watermark-based dedupe is time-bounded by design. For global exactly-once, MERGE on event_id (costlier) or keep longer state."),
    dict(id="F14", kind="design", title="44 of 100 FD003 engines never alerted", when="Analysing alert quality",
         error="FD001: 100/100 engines alerted · FD003: 56/100",
         cause="FD003 has a second fault mode (fan). For those engines s7, s12, s20, s21 move **up** (+14.9, +14.4, +0.6, +0.4) while the index expects them to move down, so they cancel out the rising sensors.",
         fix="Fault-mode aware index (Step 12): score the HPC and fan patterns separately, take max(HPC, 0.4 x fan). Tuned on odd engines, checked on even ones. FD003 detection 56% -> 100%, same lead times and false alarms as FD001.",
         lesson="A model calibrated on one population silently under-performs on another. Measure quality per segment."),
    dict(id="F15", kind="bug", title="Producer crash: negative sleep", when="`scripts/demo.sh` at 3,000 events/s",
         error="ValueError: sleep length must be non-negative",
         cause="Check-then-act race: `if target > time.time(): time.sleep(target - time.time())` reads the clock twice; at high rates time passes the target in between.",
         fix="Read the clock once: `delay = target - time.time(); if delay > 0: time.sleep(delay)`. Side effect noted: the crash skipped `flush()`, so 51 queued messages were lost (a try/finally would prevent it).",
         lesson="Load tests find bugs functional tests don't. Timing code must tolerate the clock moving."),
]


def build():
    L = []

    # ---------------------------------------------------------------- j1 big picture
    L.append(lesson("j1", "The big picture: what we built and why", 20, [
        learn("What this stage is", """
This stage walks through **how the Turbofan Telemetry Streaming Platform was built**, from an empty folder to a
tested, documented GitHub repository: every decision (yours and mine), the alternatives, the code (the
**real** code, pulled from the repo), every error we hit and how it was fixed. If you read it carefully and
do the exercises, you can rebuild the project from scratch and defend every line of it in an interview.

**Repo:** `github.com/YuvrajDevs/tf-telemetry` · **Project page:** `yuvrajdevs.github.io/tf-telemetry`

**One sentence:** NASA's public turbofan engine dataset (200 engines, each run until failure) is replayed as a
live fleet into **Kafka**, processed by **Spark Structured Streaming** into **Delta Lake** bronze, silver and gold tables,
and turned into **engine health scores and predictive degradation alerts**, with exactly-once delivery proven under
duplicates, late data, malformed data and a hard crash.
"""),
        viz("ttarch", "The whole project in one picture", "Send each kind of event through the real design and watch what every layer does with it."),
        learn("Results you can quote", """
| Claim | Evidence |
|---|---|
| Exactly-once under chaos **and a crash** | 57,452 messages sent (2,227 duplicates, 1,386 late, 438 malformed). `kill -9` of Spark mid-stream, restart. **54,787 expected = 54,787 in silver, 0 missing, 0 duplicates, 0 unexpected.** |
| Bad data never blocks good data | All 438 bad messages in the dead-letter table: 145 `MALFORMED_JSON`, 154 `MISSING_FIELD`, 139 `OUT_OF_RANGE` |
| Alerts are early and complete | On 100 real FD001 engines: WARNING median **44 cycles before failure** (90% at least 27 ahead), CRITICAL median **18**, **100% caught** |
| Alerts raised exactly once | 345 alerts, 345 distinct (engine × level) |
| Producer throughput | ~28,000 msgs/s unthrottled, single process |
| Detection | 100% of FD001 and FD003 engines warned before failure (FD003 was 56% before the fix in Step 12) |
"""),
        learn("Decisions at a glance", """
| Decision | Chosen | Main alternative | Why |
|---|---|---|---|
| Data | NASA C-MAPSS (public) | anything resembling employer data | confidentiality; real, verifiable, no login |
| Transport | Apache Kafka 3.9 (KRaft) | Event Hubs / Kinesis | industry standard, in the posting, free locally |
| Processing | Spark Structured Streaming 4.0 | Flink | same engine as batch PySpark; Delta integration |
| Storage | Delta Lake 4.0 | plain Parquet / Iceberg | ACID commits, MERGE, exactly-once with checkpoints |
| Layers | bronze → silver (+ dead letter) → gold | one table | replayability, quality, clear contracts |
| Dedupe | within a 10-min watermark | global MERGE | bounded state and cost (trade-off: F13) |
| Stateful gold | foreachBatch + applyInPandas + MERGE | applyInPandasWithState | state is a queryable table; logic unit-testable |
| Alert logic | health index + EWMA, calibrated | raw thresholds on one sensor | robust to noise, measured lead time |
| Proof | manifest vs silver (`verify`) | "trust me" | correctness is demonstrated, not claimed |
| Where it runs | laptop, free, no logins | cloud account | anyone can reproduce it |
"""),
        mcq("Which statement best describes the project's main engineering claim?", [
            "It predicts the exact day each engine will fail",
            "It streams engine telemetry through Kafka, Spark and Delta with exactly-once delivery proven under duplicates, late/bad data and a crash, and raises calibrated early-warning alerts",
            "It is a dashboard on a CSV file",
            "It replaces Kafka with Spark"], 1),
        order("Order the layers an event passes through.", ["Producer replays an engine cycle", "Kafka topic (partition by engine_id)", "Bronze: raw as received", "Silver: parsed, validated, deduplicated", "Gold: engine state and alerts", "Dashboard"]),
    ]))

    # ---------------------------------------------------------------- j2 environment
    L.append(lesson("j2", "Step 1: the environment, tools and versions", 25, [
        learn("What you need and why", """
| Tool | Version | Why this one | Login? |
|---|---|---|---|
| Docker Desktop | any recent | runs Kafka (and optionally the whole app) as containers | no (sign-in optional) |
| Python | 3.10-3.12 locally (3.13 used during the build) | PySpark, producer, tests | no |
| Java (JDK) | 17 or 21 | Spark runs on the JVM; PySpark talks to it | no |
| PySpark | 4.0.1 | supports Python 3.13 and Java 17/21 (F4) | no |
| delta-spark | 4.0.0 | the Delta release built for Spark 4.0 | no |
| confluent-kafka | 2.8.0 | fast C-based client, idempotent producer | no |
| deltalake (delta-rs) | 0.25.5 | read Delta tables without starting Spark | no |
| streamlit | 1.41.1 | the dashboard | no |

**Compatibility rule:** Delta releases are built for one Spark minor version, Spark's Kafka connector must match the Spark
version **and** Scala version (`spark-sql-kafka-0-10_2.13:4.0.1`), and PySpark needs a supported Python and Java.
Getting one of these wrong is the #1 cause of "it works on my machine" in Spark projects.

**Windows:** use WSL2 (Ubuntu). PySpark on native Windows needs extra binaries (winutils) and is painful.
"""),
        learn("requirements.txt: pin everything", code(src("requirements.txt"), "text") + """

Every version is **pinned** (`==`), so the project installs the same way today and in a year. Unpinned
requirements are how a working project breaks without anyone touching it."""),
        learn("docker-compose.yml: Kafka in one container", code(between("docker-compose.yml", "services:", "  kafka-ui:"), "yaml") + """

Line by line, the important parts:
- `apache/kafka:3.9.0`: the official image, **pinned**. KRaft mode, so no ZooKeeper container.
- `KAFKA_PROCESS_ROLES: broker,controller`: one node plays both roles (fine locally; production uses 3+ controllers).
- **Two listeners**: `PLAINTEXT://kafka:19092` for containers on the Docker network, `PLAINTEXT_HOST://localhost:9092` for your laptop. Kafka tells clients which address to reconnect to (**advertised listeners**), which is the most common Kafka-in-Docker pitfall.
- Replication factors set to **1** because there is one broker (production: 3).
- `KAFKA_AUTO_CREATE_TOPICS_ENABLE: false`: topics must be created deliberately with the right partition count (step 4).
- `healthcheck`: Compose knows when Kafka is actually ready, not just started."""),
        viz("terminal", "Set up the project yourself", "These are the exact commands (simulated output).", {
            "missions": [
                {"task": "Clone the repo.", "accept": r"^git\s+clone\s+\S*tf-telemetry(\.git)?$", "out": "Cloning into 'tf-telemetry'...\nReceiving objects: 100% (41/41), done.", "hint": "git clone https://github.com/YuvrajDevs/tf-telemetry.git"},
                {"task": "Enter it.", "accept": r"^cd\s+tf-telemetry/?$", "out": "", "hint": "cd tf-telemetry"},
                {"task": "Create a virtual environment `.venv`.", "accept": r"^python3?\s+-m\s+venv\s+\.venv$", "out": "", "hint": "python -m venv .venv"},
                {"task": "Activate it.", "accept": r"^(source|\.)\s+\.venv/bin/activate$", "out": "(.venv) $", "hint": "source .venv/bin/activate"},
                {"task": "Install the pinned requirements.", "accept": r"^pip3?\s+install\s+-r\s+requirements\.txt$", "out": "Successfully installed pyspark-4.0.1 delta-spark-4.0.0 confluent-kafka-2.8.0 pandas-2.2.3 pyarrow-19.0.1 deltalake-0.25.5 streamlit-1.41.1 pytest-8.3.4", "hint": "pip install -r requirements.txt"},
                {"task": "Run the unit tests.", "accept": r"^(python\s+-m\s+)?pytest(\s+-q)?(\s+tests/?)?$", "out": "..............                               [100%]\n14 passed in 9.7s", "hint": "pytest -q"},
                {"task": "Start Kafka (and Kafka UI) in the background.", "accept": r"^docker\s+compose\s+up\s+-d$|^docker-compose\s+up\s+-d$", "out": "[+] Running 2/2\n ✔ Container tt-kafka     Healthy\n ✔ Container tt-kafka-ui  Started", "hint": "docker compose up -d"},
                {"task": "Check the daemon and containers are running.", "accept": r"^docker\s+(ps|compose\s+ps)$", "out": "NAME         IMAGE                  STATUS\ntt-kafka     apache/kafka:3.9.0     Up 20 seconds (healthy)\ntt-kafka-ui  provectuslabs/kafka-ui Up 18 seconds", "why": "If this fails with 'cannot connect to the Docker daemon', Docker Desktop isn't running (F1).", "hint": "docker ps"},
            ]}),
        learn("What went wrong at this step", """
- **F1. Docker daemon not running.** `failed to connect to the docker API at unix:///var/run/docker.sock`. The CLI existed but the background service didn't. On a laptop: open Docker Desktop.
- **F2. Docker Hub rate limit.** `429 Too Many Requests` pulling images anonymously. Kafka was already pulled, so the build continued. Rare on a laptop.
- **F4. Python 3.13 vs PySpark 3.5.** Chose PySpark 4.0.1 + Delta 4.0.0 instead of downgrading Python.
"""),
        mcq("Why does the Kafka container define two listeners (kafka:19092 and localhost:9092)?", [
            "For redundancy", "Containers reach Kafka by its Docker network name, your laptop by localhost; Kafka must advertise the right address to each",
            "One is for producers, one for consumers", "Kafka requires two ports"], 1),
        mcq("You install delta-spark 3.2 with PySpark 4.0. What happens?", ["Works fine", "Version mismatch: Delta builds target a specific Spark version, expect class/method errors at startup", "Spark downgrades itself", "Delta upgrades Spark"], 1),
        tf("`docker` being installed means Docker can run containers.", False, "The daemon must be running (F1). `docker info` checks it."),
    ]))

    # ---------------------------------------------------------------- j3 data
    L.append(lesson("j3", "Step 2: finding and understanding the data", 25, [
        learn("Choosing the dataset", """
**Requirement:** real engine sensor data, public, downloadable without an account, and safe to publish.

| Option | Verdict |
|---|---|
| Random synthetic numbers | No real story. Kept only as an **offline fallback** |
| C-MAPSS on Kaggle | Needs a login |
| NASA open-data portal link | **Dead** (F3: HTTP 000) |
| **NASA PHM dataset mirror (S3)** | Chosen: official, public, 12 MB, no login |

**C-MAPSS** = Commercial Modular Aero-Propulsion System Simulation. NASA simulated turbofan engines that start
with different (unknown) manufacturing wear, then degrade until failure. One row = **one operating cycle** (≈ one flight):

`unit, cycle, op_setting_1..3, s1..s21` (space-separated, no header)

| Subset | Engines | Operating conditions | Fault modes |
|---|---|---|---|
| FD001 | 100 | 1 | 1 (high-pressure compressor) |
| FD002 | 260 | 6 | 1 |
| FD003 | 100 | 1 | 2 (compressor + fan) |
| FD004 | 248 | 6 | 2 |
"""),
        learn("cmapss.py: download and parse", code(between("telemetry/cmapss.py", "URL =", "# Baseline means")) + """

- The zip is **nested** (a zip inside a zip), so `download()` opens both in memory with `io.BytesIO`.
- `load()` falls back to `synthetic()` if the file is missing, so the project always runs.
- `DEFAULT_SUBSETS = ("FD001", "FD003")`: see the next card for why."""),
        learn("Exploring before building", """
Before writing a pipeline, I measured each sensor's mean in every engine's **first** vs **last** cycle (FD001):

| Sensor | Healthy → failure | Use |
|---|---|---|
| s1, s5, s6, s10, s16, s18, s19 | constant | **no information**: excluded |
| s2, s3, s4, s11, s15, s17 | rise (s11: 47.34 → 48.18, s4: 1402 → 1431) | degradation signal (+) |
| s7, s12, s20, s21 | fall (s12: 521.9 → 519.7) | degradation signal (−) |

Engines live **128-362 cycles** (average 206).

**Decision: FD001 + FD003 only.** They run at a single operating condition, so sensor drift = wear. In FD002/FD004
the same reading means different things at different altitudes/throttle settings; they would need per-condition
normalisation first (a possible extension).
"""),
        viz("enginechart", "Look at real engines", "Switch to the raw sensor views first (s11, s4, s7) to see how noisy one sensor is, then the health index.",
            {"engines": ENGINES, "start": "FD001-001", "task": "Look at s11 for a few engines, then the health index. Then tune the sliders until all five FD001 engines warn ≥ 20 and go critical ≥ 8 cycles before failure."}),
        mcq("Why exclude sensors s1, s5, s10, s16, s18 and s19?", ["They are broken", "They are constant across the whole life, so they carry no information about wear", "They are too noisy", "They are in Fahrenheit"], 1),
        mcq("Why not use FD002 and FD004 directly?", ["Too big", "Six operating conditions: sensor values depend on altitude/throttle, so drift doesn't mean wear without normalisation", "They have no failures", "They need a login"], 1),
        tf("C-MAPSS training data runs every engine until failure, so the last cycle of each engine is its failure point.", True, "That's what makes 'cycles before failure' (lead time) measurable."),
    ]))

    # ---------------------------------------------------------------- j4 health index
    L.append(lesson("j4", "Step 3: the health index and alert calibration", 30, [
        learn("From 10 noisy sensors to one number", """
**Health index** = average **signed z-score** of the 10 drifting sensors, using each sensor's mean and standard deviation
over every engine's first 30 (healthy) cycles as the baseline:

`hi = mean( sign_s × (value_s − μ_s) / σ_s )`  where sign = +1 for rising sensors, −1 for falling ones.

- ≈ 0 when healthy, grows as the engine wears.
- z-scores put sensors with very different units (psi, °R, rpm) on one scale.
- Averaging 10 sensors cancels much of each sensor's noise.
""" + code(between("telemetry/events.py", "# Sensors that drift", "# Physically plausible")) + code(fn("telemetry/events.py", "health_index"))),
        learn("Smoothing with EWMA, and why it suits streaming", """
A single cycle is still noisy, so state keeps an **exponentially weighted moving average**:

`ewma = α·hi + (1 − α)·ewma_previous`

- One number of state per engine, perfect for streaming (a rolling window would have to store the last N readings).
- **α** controls memory: small α = smooth but slow to react; large α = fast but noisy.
- Levels: `OK` → `WARNING` (ewma ≥ 1.5) → `CRITICAL` (ewma ≥ 2.5). Levels only **escalate** until maintenance; an alert fires once per level.
"""),
        learn("Calibrating on run-to-failure data", """
I replayed all 100 FD001 engines offline and measured the **lead time** (cycles between the alert and failure) for
different α and thresholds:

| α | WARNING / CRITICAL | WARNING lead median (p10) | CRITICAL lead median (p10) | never critical |
|---|---|---|---|---|
| 0.1 | 1.5 / 2.5 | 41 (22) | 15 (8) | 0 |
| 0.1 | 2.0 / 3.0 | 25 (15) | 6 (2) | 4 |
| **0.2** | **1.5 / 2.5** | **44 (27)** | **19 (12)** | **0** |
| 0.2 | 2.0 / 3.0 | 30 (19) | 10 (6) | 0 |
| 0.2 | 1.0 / 2.0 | 68 (38) | 30 (19) | 0 |

**Chosen α = 0.2, 1.5 / 2.5**: every engine caught, ~44 cycles of warning (time to plan maintenance), ~19 for critical.
Lower thresholds warn earlier but would also fire on healthy engines with noisy sensors (false alarms).
"""),
        learn("The state machine: advance_state()", code(fn("telemetry/events.py", "advance_state")) + """

Three properties, each tested:
1. **Order:** events are sorted by cycle before applying, so out-of-order arrival doesn't scramble the EWMA.
2. **Idempotent replay:** events with `cycle <= last_cycle` are skipped. If Spark re-runs a micro-batch after a crash, nothing changes.
3. **Alerts on escalation only:** OK→WARNING and WARNING→CRITICAL each produce exactly one alert.

This function is **pure Python**, with no Spark and no Kafka, so it is unit-tested in milliseconds **and** called from Spark in gold (step 8)."""),
        learn("The unit tests that pin this behaviour", code(between("tests/test_events.py", "def test_state_escalates", "def test_synthetic"))),
        py("Implement a simplified EWMA alert fold. `fold(his, alpha, warn, crit)` takes a list of health-index values for one engine (in cycle order) and returns a list of `(level, index)` for each escalation, where index is the 0-based position and level is 'WARNING' or 'CRITICAL'. Levels only go up.",
           "def fold(his, alpha, warn, crit):\n    pass\n",
           """assert fold([0, 0, 3, 3, 3, 3], 0.5, 1.5, 2.5) == [('WARNING', 2), ('CRITICAL', 4)], fold([0, 0, 3, 3, 3, 3], 0.5, 1.5, 2.5)
assert fold([5], 0.2, 1.5, 2.5) == [('CRITICAL', 0)]
assert fold([0, 2, 0, 0], 1.0, 1.5, 2.5) == [('WARNING', 1)], 'levels never go back down'""",
           """def fold(his, alpha, warn, crit):
    out, ewma, level = [], None, 0
    for i, hi in enumerate(his):
        ewma = hi if ewma is None else alpha * hi + (1 - alpha) * ewma
        new = 2 if ewma >= crit else 1 if ewma >= warn else 0
        new = max(new, level)
        if new > level:
            out.append(('WARNING' if new == 1 else 'CRITICAL', i))
        level = new
    return out""", hint="Keep ewma and the current level; compute the new level from ewma, never let it drop, and record when it rises."),
        mcq("What happens to alert timing if α goes from 0.2 to 0.05?", ["Alerts fire earlier", "The EWMA reacts more slowly, so alerts fire later (and smoother)", "No change", "Every engine alerts immediately"], 1),
        mcq("Why does advance_state() ignore events with cycle ≤ last_cycle?", ["To save memory", "So replaying a micro-batch after a crash (or a stale late event) can't change state twice: idempotency", "Because Kafka sends duplicates on purpose", "It is a bug"], 1),
    ]))

    # ---------------------------------------------------------------- j5 events & kafka
    L.append(lesson("j5", "Step 4: the event contract and the Kafka topic", 25, [
        learn("What one event looks like", """```json
{"schema_version": 1,
 "event_id": "6c1e5f0a-…",          // uuid5("FD001-007:113"): deterministic
 "fleet": "FD001",
 "engine_id": "FD001-007",           // also the Kafka message key
 "cycle": 113,
 "event_time": "2026-11-25T14:56:44.621Z",
 "op_settings": [0.0007, -0.0004, 100.0],
 "sensors": {"s1": 518.67, "s2": 642.15, "...": "...", "s21": 23.419}}
```
| Field choice | Why |
|---|---|
| **Deterministic** `event_id` (uuid5 of engine:cycle) | The same reading always has the same id, so duplicates are detectable anywhere downstream. A random uuid4 per send would make a re-sent event look brand new. |
| key = `engine_id` | Same key → same partition → per-engine ordering |
| `event_time` from the producer, UTC | Process by **event time** (when it happened), not arrival time |
| `schema_version` | Room to evolve the schema (Milestone T3) |
| nested `sensors` object | readable; silver flattens it into columns |
"""),
        learn("events.py: ids, events, validation", code(fn("telemetry/events.py", "event_id")) + "\n" + code(fn("telemetry/events.py", "make_event")) + "\n" + code(fn("telemetry/events.py", "validate")) + """

`validate()` mirrors the Spark silver rules exactly, so the rules are unit-tested in Python and enforced in Spark."""),
        learn("admin.py: creating the topic (and bug F5)", code(fn("telemetry/admin.py", "create_topic")) + """

- **6 partitions**: up to 6 consumers can read in parallel; enough headroom for a laptop.
- **7-day retention**: any consumer can replay a week of history (that's what makes reprocessing possible).
- `compression.type=lz4` at topic level.

**F5, the first real bug:** the original code was `fut = client().create_topics(...)`. Nothing kept a reference to the
AdminClient, so Python garbage-collected it while the request was in flight:
```text
KafkaError{code=_DESTROY,val=-197,str="Handle is terminating: Local: Broker handle destroyed"}
engine-telemetry does not exist
```
Fix: `admin = client()` keeps the client alive until `f.result()` returns."""),
        bug("This is the original create_topic. Which line causes F5?", """def create_topic(partitions=6):
    fut = client().create_topics([NewTopic(TOPIC, num_partitions=partitions, replication_factor=1)])
    for name, f in fut.items():
        f.result()
        print(f"created topic {name}")""", 2, "`client()` creates an AdminClient that nothing references after this line, so it can be destroyed before the futures resolve. Assign it to a variable first."),
        viz("terminal", "Create and inspect the topic", "", {"missions": [
            {"task": "Download the NASA data.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+download$", "out": "downloading https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+...zip ...\nextracted to data/cmapss", "hint": "python -m telemetry.cli download"},
            {"task": "Create the topic with 6 partitions.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+create-topic(\s+--partitions\s+6)?$", "out": "created topic engine-telemetry with 6 partitions, retention 168h", "hint": "python -m telemetry.cli create-topic --partitions 6"},
            {"task": "Describe it.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+describe-topic$", "out": "engine-telemetry: 6 partitions\n  partition 0 leader=1 replicas=[1]\n  ...\n  partition 5 leader=1 replicas=[1]", "hint": "python -m telemetry.cli describe-topic"},
        ]}),
        mcq("A producer re-sends a reading after a timeout. With `event_id = uuid4()` generated at send time, what happens downstream?", ["Duplicates are dropped automatically", "The re-sent copy gets a new id and looks like a different event: silver can't dedupe it", "Kafka rejects it", "Nothing"], 1),
        tf("Kafka guarantees ordering across all partitions of a topic.", False, "Only within a partition. That's why the key is engine_id."),
    ]))

    # ---------------------------------------------------------------- j6 producer
    L.append(lesson("j6", "Step 5: the producer, chaos and the manifest", 25, [
        learn("Replaying a fleet, not a file", code(fn("telemetry/producer.py", "fleet_stream")) + """

Each "tick", **every active engine emits its next cycle**, so 200 engines stream in parallel like a real fleet
(instead of engine 1's whole life, then engine 2's). `loops` replays the fleet under new engine ids; `start_loop`
makes every run's ids unique (F13)."""),
        learn("Producer settings and why", code(between("telemetry/producer.py", "    producer = Producer({", "    errors = Counter()")) + """

| Setting | Meaning |
|---|---|
| `acks=all` | the broker confirms only after all in-sync replicas have the message |
| `enable.idempotence=True` | the broker discards the producer's **own** retries (sequence numbers), so no duplicates from network retries |
| `linger.ms=20` | wait up to 20 ms to batch messages, giving much higher throughput |
| `compression.type=lz4` | smaller batches on the wire |
| `queue.buffering.max.messages` | local buffer; when full, `produce()` raises `BufferError` and the code polls until it drains (backpressure) |

Note what idempotence does **not** protect against: the application deliberately sending the same event twice
(a replay, or chaos `--dup-rate`). That's silver's job."""),
        learn("Chaos injection: testing the guarantees on purpose", code(fn("telemetry/producer.py", "_bad_event")) + """

- `--dup-rate`: send the same bytes twice (at-least-once duplicates)
- `--late-rate --late-seconds`: hold events in a heap and send them later, keeping their original `event_time`
- `--bad-rate`: truncated JSON, a missing required field, or an impossible value (s11 = −1). Bad events get a random id, so they never count as valid
- `--chaos` = 5% / 3% (30 s) / 1%

**The manifest:** every run writes `data/manifests/<run>.ids`, the ids of every valid event sent. `verify` compares it
with silver. That turns "exactly-once" from a claim into a test."""),
        learn("Bug F15: the rate limiter race", """The original rate limiter:
```python
if rate:
    target = start + stats["events"] / rate
    if target > time.time():
        time.sleep(target - time.time())   # reads the clock a SECOND time
```
At 3,000 events/s, `demo.sh` crashed with `ValueError: sleep length must be non-negative`. Between the `if` and
the `sleep`, the clock moved past `target`, so the sleep length went negative: a **check-then-act race**.
""" + code(between("telemetry/producer.py", "        if rate:", "        if stats[\"events\"] % 20000")) + """
Side effect: the crash happened before `producer.flush()`, so 51 queued messages were lost (a `try/finally` would prevent it)."""),
        bug("Which line contains the race condition?", """if rate:
    target = start + sent / rate
    if target > time.time():
        time.sleep(target - time.time())""", 4, "`time.time()` is read again after the check. If time passed `target` in between, the argument is negative. Compute the delay once."),
        viz("terminal", "Produce with chaos", "", {"missions": [
            {"task": "Send the whole fleet as fast as possible with chaos on.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+produce\s+.*--rate\s+0.*--chaos|^python3?\s+-m\s+telemetry\.cli\s+produce\s+.*--chaos.*--rate\s+0", "out": "  20,000 events in 0.8s (24,043/s)\n  40,000 events in 1.4s (28,367/s)\n{\"messages_sent\": 47578, \"valid_unique\": 44913, \"late\": 1386, \"duplicates_sent\": 2227,\n \"bad_MALFORMED_JSON\": 145, \"bad_MISSING_FIELD\": 154, \"bad_OUT_OF_RANGE\": 139}", "why": "elapsed includes waiting 30 s for the late events to be released", "hint": "python -m telemetry.cli produce --rate 0 --chaos"},
        ]}),
        mcq("Which does `enable.idempotence=true` prevent?", ["The application calling produce() twice for the same reading", "Duplicates caused by the producer's own automatic network retries", "Malformed JSON", "Late events"], 1),
        mcq("Why record a manifest of valid event ids?", ["For billing", "It is the ground truth to prove silver contains each valid event exactly once", "Kafka requires it", "To speed up Spark"], 1),
    ]))

    # ---------------------------------------------------------------- j7 spark + bronze
    L.append(lesson("j7", "Step 6: Spark session and the bronze layer", 25, [
        learn("spark.py: one function that wires everything", code(src("telemetry/spark.py")) + """

| Line | Why |
|---|---|
| `PYSPARK_PYTHON = sys.executable` | Python workers must use the same venv as the driver (fixes F9) |
| `master local[*]` | Spark on all laptop cores; change to a cluster URL and nothing else changes |
| Delta extensions + catalog | enables Delta SQL, MERGE, `DeltaTable` |
| `shuffle.partitions = 8` | default 200 is far too many for a laptop |
| `session.timeZone = UTC` | timestamps don't shift with the machine's time zone |
| RocksDB state store | keeps dedupe/window state off the JVM heap |
| `configure_spark_with_delta_pip(..., extra_packages=[KAFKA_PKG])` | downloads the Delta + Kafka connector jars from Maven on first start (~1 min, then cached) |

During that download the log shows `Server access error ... repos.spark-packages.org ... 403` (**F8**): harmless,
another repository served the jars. The first batches also log `Current batch is falling behind` (**F7**): start-up cost, not a problem."""),
        learn("bronze.py: store exactly what arrived", code(src("telemetry/jobs/bronze.py")) + """

- **Nothing is parsed or dropped.** Bronze is the replayable record: if silver has a bug, fix it and rebuild silver from bronze.
- Kafka coordinates (`partition`, `offset`, `kafka_ts`) make every row traceable to the exact message.
- `maxOffsetsPerTrigger` = **backpressure**: after an outage, catch up in capped batches instead of one giant batch that runs out of memory.
- `checkpointLocation` + Delta = exactly-once into bronze (see the next card).
- Partitioned by `ingest_date` so old bronze can be pruned or archived by date."""),
        viz("stepper", "Inside a checkpoint: how exactly-once works", "", {"steps": [
            {"title": "Plan the batch", "tag": "offsets/", "md": "Before batch 42 runs, Spark writes **`_checkpoints/bronze/offsets/42`**: 'for partitions 0-5, read from these offsets to these offsets'. The plan is now durable."},
            {"title": "Process and write", "tag": "Delta write", "md": "Spark reads exactly those offsets from Kafka and writes Parquet files into the Delta table. The files exist on disk but are **invisible** until the Delta transaction log has a commit pointing at them."},
            {"title": "Commit the data", "tag": "_delta_log/", "md": "Delta writes **`_delta_log/000…0042.json`** atomically. Now the rows are visible. The commit also records the streaming **query id + batch id 42**, so Delta can recognise a replay of the same batch."},
            {"title": "Commit the batch", "tag": "commits/", "md": "Spark writes **`_checkpoints/bronze/commits/42`**: batch 42 is done. Next it plans batch 43 from where 42 ended."},
            {"title": "Crash anywhere", "tag": "kill -9", "md": "- Crash before the Delta commit: files are invisible; on restart batch 42 is re-planned **from the same offsets** (offsets/42) and rewritten.\n- Crash after the Delta commit but before `commits/42`: on restart Spark re-runs batch 42, and **Delta sees batch id 42 for this query is already committed and skips it**.\n- Either way: no loss, no duplicates. That's what `verify` proved after `kill -9`."},
        ], "doneMsg": "Checkpoint (offsets + commits) + Delta's idempotent batch commits = exactly-once into the table."}),
        mcq("Why keep bronze unparsed?", ["Parsing is slow", "So a parsing/validation bug can be fixed and silver rebuilt from the exact messages received", "Spark can't parse JSON in bronze", "To save storage"], 1),
        mcq("What happens if you delete `lake/_checkpoints/bronze` and restart?", ["Nothing", "Bronze forgets its progress and re-reads from `startingOffsets` (earliest), re-inserting everything still in Kafka: duplicates in bronze", "Kafka deletes messages", "Delta restores it"], 1),
        tf("`maxOffsetsPerTrigger` limits how many Kafka messages one micro-batch reads.", True),
    ]))

    # ---------------------------------------------------------------- j8 silver
    L.append(lesson("j8", "Step 7: silver: validate, dead-letter, deduplicate", 25, [
        learn("Parse with an explicit schema and classify every row", code(between("telemetry/jobs/silver.py", "EVENT_SCHEMA =", "def health_expr")) + """

- `from_json` with an **explicit schema** never infers types from data: a contract, not a guess.
- Each row gets a `dlq_reason`: `MALFORMED_JSON` (couldn't parse at all), `MISSING_FIELD`, `OUT_OF_RANGE`, or NULL (valid).
- Same rules as `events.validate()`, so they're unit-tested in Python."""),
        learn("Two queries, one bronze stream", code(fn("telemetry/jobs/silver.py", "start")) + """

- **silver** keeps valid rows, flattens sensors into columns, adds `health_index` (as a Spark expression, same formula as Python), then
  `withWatermark("event_time", "10 minutes").dropDuplicatesWithinWatermark(["event_id"])`.
- **dead_letter** keeps invalid rows **with the raw payload, reason, partition and offset**, so nothing is silently dropped,
  nothing crashes the stream, and a fixed bad message can be replayed later.

**How the dedupe works:** Spark remembers every `event_id` it has seen for as long as the watermark allows
(max event time seen − 10 min), in the RocksDB state store. A second copy within that window is dropped. After that,
the id is forgotten so state doesn't grow forever. **Trade-off:** a duplicate arriving more than 10 minutes later would
get through (F13). Global dedupe = MERGE on event_id (Milestone T4)."""),
        viz("ttarch", "Send duplicates, late and bad events", "Focus on what silver and the dead-letter table do.", {"task": "Try every button. Watch the bronze vs silver counts when you send a duplicate."}),
        multi("Which rows end up in the dead-letter table?", ["Truncated JSON", "An event missing engine_id", "An event with s11 = -1", "An exact duplicate of a valid event", "A valid event 30 s late"], [0, 1, 2], "Duplicates are dropped by dedupe (they're valid); late-but-within-watermark events are accepted."),
        mcq("A valid event arrives 25 minutes late (watermark 10 minutes). What happens in silver?", ["Accepted", "Dropped as too late: dedupe state for that time has been cleared", "Sent to the dead-letter table", "Spark crashes"], 1, "Late beyond the watermark = dropped by the stateful operator. Detect it by comparing bronze vs silver counts, or raise the watermark if that lateness is normal."),
        scenario("A partner sends 5,000 malformed messages", "During a release, an upstream service starts sending events with the field `engineId` instead of `engine_id`.", [
            ("What does the pipeline do?", [("Silver classifies them MISSING_FIELD, writes them to the dead-letter table, and keeps processing every valid event", True, "Bad data is isolated, not fatal."),
                                             ("The stream crashes and stops ingesting", False, "That's exactly what the dead-letter design prevents."),
                                             ("They silently disappear", False, "They're kept with the raw payload and reason.")]),
            ("How do you notice and recover?", [("Alert on the dead-letter rate by reason; fix the contract or add a mapping; replay the dead-lettered raw payloads (or rebuild silver from bronze)", True, "Monitoring plus replayability turns an incident into a routine fix."),
                                                ("Delete the dead-letter table", False, "That's the evidence and the data.")]),
        ]),
    ]))

    # ---------------------------------------------------------------- j9 gold
    L.append(lesson("j9", "Step 8: gold: engine state, alerts, fleet health", 30, [
        learn("Stateful processing with foreachBatch + MERGE", code(fn("telemetry/jobs/gold.py", "_fold")) + "\n" + code(fn("telemetry/jobs/gold.py", "upsert_state_and_alerts")) + """

For every micro-batch of silver rows:
1. Join each engine's new events with its **previous state** (from the `engine_current_state` Delta table).
2. `groupBy("engine_id").applyInPandas(_fold)`: for each engine, run the **same pure function** as the unit tests (`advance_state`). Output: one state row + any alert rows (a `kind` column distinguishes them, because applyInPandas returns one schema).
3. **MERGE alerts** on `alert_id = engine:LEVEL`, insert-only, so an alert can't be raised twice.
4. **MERGE state** on `engine_id`, updating only if `last_cycle` moved forward, so an engine can never move backwards.

**Why not `applyInPandasWithState`?** That keeps state inside Spark's state store, invisible to dashboards. Here state is
a normal Delta table: the dashboard reads it, you can query it with SQL, and the logic is unit-testable."""),
        learn("Bug F9: the Python workers", """First end-to-end run:
```text
PythonException: ... ModuleNotFoundError: No module named 'pyarrow'
```
`applyInPandas` runs your function in **separate Python worker processes** that exchange data with the JVM through
Apache Arrow. The workers started with the **system** Python (no pyarrow), not the project venv.

**Domino effect:** the gold query died → `spark.streams.awaitAnyTermination()` returned → the app exited → **bronze stopped too** →
the 1,386 late events (sent 30 s later) never arrived → `verify`: **FAIL, 1,329 missing**.

**Fix:** `os.environ.setdefault("PYSPARK_PYTHON", sys.executable)` in `get_spark()`.

**Recovery:** restarted **without deleting anything**. Every query resumed from its checkpoint → `verify`: **PASS** (44,913 / 0 / 0 / 0).
That accidental crash became the first proof of exactly-once recovery."""),
        viz("stepper", "Bug F10, step by step: where did the alerts go?", "", {"steps": [
            {"title": "Symptom", "tag": "no error", "md": "`engine_current_state` showed **156 CRITICAL engines**, but `engine_alerts` had **0 rows**. Nothing in the logs."},
            {"title": "Check the table history", "tag": "Delta history", "md": "`DeltaTable('lake/gold/engine_alerts').history()` showed only the initial empty WRITE: **no MERGE commit ever happened**. So the alerts DataFrame was empty every time it was written. The state table had MERGE commits."},
            {"title": "Test the logic alone", "tag": "pure Python", "md": "Ran `advance_state()` on one real engine's events from silver: it returned **WARNING @152, CRITICAL @177**. The logic is correct."},
            {"title": "Test the logic in Spark (batch)", "tag": "applyInPandas", "md": "Ran the same `applyInPandas` in a plain batch job: alerts appeared (156 + 156). So the problem is **how the streaming batch executes**, not the function."},
            {"title": "The cause: laziness", "tag": "recompute", "md": "The old code:\n```python\nout = events.join(prev_state).groupBy(...).applyInPandas(_fold).persist()\nMERGE state  <- out      # 1st action: computes out, updates engine_state\nMERGE alerts <- out      # 2nd action\n```\n`out` is a **recipe** that includes *read engine_state*. `persist()` is only a hint. For the second action Spark **recomputed** `out` and re-read engine_state, which **had just been updated**. Every event now had `cycle <= last_cycle` → ignored → no alerts."},
            {"title": "The fix", "tag": "localCheckpoint", "md": "```python\nout = (...applyInPandas(_fold, OUT_SCHEMA)\n       .localCheckpoint(eager=True))   # compute NOW, cut lineage\nMERGE alerts <- out\nMERGE state  <- out\n```\n`localCheckpoint(eager=True)` materialises the batch once; later actions read the stored result, never the state table again. Result: **156 WARNING + 156 CRITICAL alerts, once each**."},
            {"title": "The lesson", "tag": "interview story", "md": "Never read and write the same table inside one lazy plan without materialising first. `cache()`/`persist()` are performance hints, not correctness guarantees. This bug passes every unit test, which is why the project has an end-to-end verification step."},
        ], "doneMsg": "That's the story to tell when an interviewer asks about a hard bug."}),
        bug("This was the original gold code. Which line makes the alerts disappear?", """out = (events.join(prev, "engine_id", "left")
       .groupBy("engine_id").applyInPandas(_fold, OUT_SCHEMA)
       .persist())
merge_state(out.filter("kind = 'state'"))
merge_alerts(out.filter("kind = 'alert'"))""", 3, "`.persist()` doesn't guarantee the cached result is reused. The second action can recompute `out` after state was updated. Use `.localCheckpoint(eager=True)` and write alerts first."),
        learn("Fleet health per minute (and why it was empty at first)", code(between("telemetry/jobs/gold.py", "    fleet = (silver.withWatermark", "    q_fleet =")) + """

1-minute **event-time** windows per fleet, 2-minute watermark, **append** mode: a window is written exactly once, when final.

**F11:** after the first wave this table had **0 rows**: not a bug. All events happened within about a minute and then the stream
went quiet, so the watermark never passed the window end. A second, slower wave moved the watermark and the windows appeared.
`update` mode would show partial windows immediately (at the cost of rewriting them)."""),
        viz("watermark", "Feel the watermark trade-off", "The same mechanism decides when fleet windows close and which late events silver accepts."),
        mcq("Why is the gold step idempotent if Spark re-runs a micro-batch?", ["Spark never re-runs batches", "State ignores cycles ≤ last_cycle and alert ids already exist (insert-only MERGE)", "Delta deletes duplicates automatically", "pandas is idempotent"], 1),
        mcq("Why does applyInPandas need pyarrow in the worker environment?", ["To draw charts", "Data moves between the JVM and Python workers as Apache Arrow batches", "To connect to Kafka", "It doesn't"], 1),
    ]))

    # ---------------------------------------------------------------- j10 running & proving
    L.append(lesson("j10", "Step 9: running it, and proving exactly-once", 25, [
        learn("run.py: all layers in one app, with a live monitor", code(fn("telemetry/jobs/run.py", "main")) + """

- Downstream layers wait for their input table to exist (`_wait_for`), so one command starts everything in the right order.
- A monitor thread prints each query's `lastProgress` every 15 s (rows, input/processed rows per second, batch duration) and appends it to `lake/_metrics/progress.jsonl`.
- `awaitAnyTermination()`: if any query fails, the app stops (fail-fast, see F9).
- Spark UI at http://localhost:4040 while it runs."""),
        learn("verify: exactly-once as a test", code(fn("telemetry/report.py", "verify")) + """

**missing** = sent but not in silver (loss) · **duplicates** = rows − distinct ids · **unexpected** = in silver but never sent as valid
(a bad event leaked through). All three must be 0."""),
        learn("scripts/demo.sh: chaos plus a hard crash", code(between("scripts/demo.sh", "echo \"== 1.", "echo \"Streaming app still"), "bash") + """

**Final run (clean slate):**
| Step | Result |
|---|---|
| Wave 1 | 47,578 messages: 44,913 valid unique, 2,227 duplicates, 1,386 late (30 s), 438 bad |
| `kill -9` after 12 s | Spark killed mid-batch, restarted 5 s later from checkpoints |
| Wave 2 | 9,874 messages from 40 new engines (`--start-loop 1`) |
| `verify` | **54,787 expected = 54,787 in silver · 0 missing · 0 duplicates · 0 unexpected → PASS** |
| Dead letter | 438 = 145 malformed + 154 missing field + 139 out of range |
| Alerts | 345 rows, 345 distinct |

**F12:** p99 latency (~400 s in the earlier run) included the deliberately late events and the downtime; p50/p95 were ~6 s.
In the final run p50 was ~33 s because of the crash catch-up with 5 queries sharing 4 cores, so it's **not** a performance
figure. Real steady-state numbers are Milestone T2."""),
        viz("terminal", "Run the demo and check the results", "", {"missions": [
            {"task": "Run the full demo script.", "accept": r"^(\./)?scripts/demo\.sh$|^bash\s+scripts/demo\.sh$", "out": "== 1. clean slate ...\n== 3. wave 1 ...\n== 4. CRASH: kill -9 the streaming app while data is flowing\n== 5. restart: checkpoints resume exactly where each query stopped\n== 6. wave 2 ...\n== 7. wait for the pipeline to drain, then verify exactly-once", "hint": "./scripts/demo.sh"},
            {"task": "Verify exactly-once.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+verify$", "out": "{\"expected_valid_events\": 54787, \"silver_rows\": 54787, \"missing\": 0,\n \"unexpected\": 0, \"duplicates\": 0, \"result\": \"PASS\"}", "hint": "python -m telemetry.cli verify"},
            {"task": "Print the pipeline report.", "accept": r"^python3?\s+-m\s+telemetry\.cli\s+report$", "out": "{\"bronze_rows\": 57452, \"silver_rows\": 54787, \"silver_duplicates\": 0,\n \"dead_letter\": {\"MALFORMED_JSON\": 145, \"MISSING_FIELD\": 154, \"OUT_OF_RANGE\": 139},\n \"alerts\": {\"rows\": 345, \"distinct\": 345}}", "hint": "python -m telemetry.cli report"},
            {"task": "Open the dashboard.", "accept": r"^streamlit\s+run\s+dashboard/app\.py", "out": "You can now view your Streamlit app in your browser.\n  Local URL: http://localhost:8501", "hint": "streamlit run dashboard/app.py"},
        ]}),
        mcq("bronze_rows = 57,452 but silver_rows = 54,787. Where did the 2,665 go?", ["Lost in the crash", "2,227 duplicates dropped by dedupe + 438 bad rows in the dead-letter table", "Late events dropped", "Spark sampling"], 1, "57,452 − 2,227 − 438 = 54,787. Being able to reconcile counts like this is exactly what interviewers probe."),
        tf("If verify reports 'missing' right after producing, the pipeline lost data.", False, "It may still be catching up (micro-batches every 5 s). Wait and re-run; the script polls for up to 5 minutes."),
    ]))

    # ---------------------------------------------------------------- j11 dashboard, docs, failures
    L.append(lesson("j11", "Step 10: dashboard, documentation and the failure log", 25, [
        learn("dashboard/app.py: reading Delta without Spark", code(fn("dashboard/app.py", "load")) + """

The dashboard uses **delta-rs** (`deltalake` package, written in Rust) to read the Delta tables directly: no JVM,
starts in a second. `@st.fragment(run_every=10)` re-renders the live section every 10 seconds. It shows engines reporting, critical/warning counts,
alerts, dead letters, fleet health per minute and the engines closest to failure."""),
        learn("The repository layout", """```text
tf-telemetry/
  telemetry/          cmapss.py · events.py · producer.py · admin.py · spark.py · report.py · cli.py
  telemetry/jobs/     bronze.py · silver.py · gold.py · run.py
  tests/              10 pure-Python unit tests (0.1 s, no Spark/Kafka)
  dashboard/app.py    Streamlit
  scripts/demo.sh     chaos + crash + verify
  docs/               architecture.md (Mermaid diagram) · build-log.md · decisions.md (ADRs) · capacity-plan.md
  MILESTONES.md       learning path, extension tasks T1-T7, interview questions
  docker-compose.yml  Kafka + Kafka UI (+ optional app container)
  Dockerfile          Python 3.12 + Java 17, for "no local installs" mode
  .github/workflows/ci.yml   runs the unit tests on every push
```
**Design rule:** pure logic (`events.py`) is separate from I/O (Kafka, Spark), so it's fast to test and reused by both
the unit tests and the gold Spark job."""),
        viz("timeline", "Every failure, in order", "Filter by type. Open each one.", {"items": FAILURES}),
        talk("Explain the project in 2 minutes, as in an interview.", """
1. **Problem:** predictive maintenance on a fleet of engines that stream sensor readings; data arrives duplicated, late and sometimes corrupt.
2. **Data:** NASA C-MAPSS, 200 engines run to failure, replayed as a live fleet (key = engine_id).
3. **Architecture:** Kafka → Spark Structured Streaming → Delta: bronze (raw + offsets), silver (validated, deduplicated within a 10-min watermark, dead-letter table for bad data), gold (per-engine state with EWMA health and escalating alerts via foreachBatch + MERGE, 1-minute fleet windows) → Streamlit.
4. **Guarantees and proof:** exactly-once via checkpoints + Delta commits + deterministic ids + idempotent MERGE. **Proved it**: 57k messages with 5% duplicates, late and bad data, `kill -9` mid-stream: 0 missing, 0 duplicates.
5. **Model:** health index calibrated on real run-to-failure data: warning a median 44 cycles before failure, 100% caught on FD001.
6. **Hardest bug:** lazy recomputation silently dropped all alerts (F10), fixed by materialising the batch.
7. **Next:** FD003 fan-fault detection (found by segment analysis), load test and capacity plan.
"""),
        talk("*\"What would you change before running this in production?\"*", """
- Run each layer as a **separate job** so a gold bug can't stop ingestion (F9 lesson); orchestrate and monitor them.
- **Kafka**: 3+ brokers, replication factor 3, `min.insync.replicas=2`, schema registry with Avro/Protobuf and compatibility rules.
- **Storage**: cloud object storage, table OPTIMIZE/compaction, retention and VACUUM policies, Unity Catalog permissions.
- **Observability**: consumer lag, batch duration, dead-letter rate by reason, freshness, alert latency, with alerting.
- **Alerts**: route to an incident/maintenance system; add maintenance-reset events; more fault types as they appear (same per-segment evaluation as Step 12).
- **CI/CD**: integration test with Kafka in CI, deploy jobs with asset bundles/Terraform; secrets in a vault.
"""),
    ]))

    # ---------------------------------------------------------------- j12 next steps
    L.append(lesson("j12", "Step 11: findings and what you build next", 20, [
        learn("F14: a second failure mode hiding in FD003", """
All 100 FD001 engines alerted, but only **56 of 100 FD003** engines did. Comparing the last cycle with each engine's
healthy baseline:

| Group | s7 | s12 | s20 | s21 | s4 |
|---|---|---|---|---|---|
| 44 missed engines | **+14.9** | **+14.4** | **+0.61** | **+0.37** | +30.9 |
| 56 caught engines | −2.6 | −2.3 | −0.54 | −0.29 | +28.1 |

For the missed (fan-fault) engines, s7/s12/s20/s21 move **up**. The index multiplies them by −1 (built for compressor
wear), so they cancel the rising sensors and the index goes **negative**. Open FD003-007 in the chart below.
"""),
        viz("enginechart", "See the fan fault", "Select FD003-007.", {"engines": ENGINES, "start": "FD003-007", "task": "Compare FD003-007 with any FD001 engine, then tune the sliders until all five FD001 engines meet the target (≥ 20 / ≥ 8 cycles)."}),
        learn("Step 12: the fix, a fault-mode aware health index", """
**1. Measure first.** `scripts/calibrate.py` replays every NASA engine through the same EWMA + thresholds as the stream
and prints: engines warned, lead times, and warnings more than 125 cycles before failure (false alarms).

**2. Find the fan signature** (end-of-life z-score vs healthy FD001, median):

| Sensor | HPC-fault engines | Fan-fault engines |
|---|---|---|
| s7, s12 | −3.9, −4.1 | **+21.9, +26.0** |
| s20, s21 | −3.6, −3.4 | **+5.0, +5.0** |
| s15 | +3.7 | **−6.6** |

**3. Compare designs with numbers:**

| Design | FD003 warned | FD003 false alarms | Verdict |
|---|---|---|---|
| v1 HPC only | 56% | 2 | misses fan faults |
| mean absolute deviation | 100% | 16 | too many false alarms, later warnings on FD001 |
| max(HPC, fan) | 100% | 11 | fan sensors move 20+ std devs, so it fires too early |
| **max(HPC, 0.4 × fan)** | **100%** | **2** | chosen |

**4. Don't fool yourself:** the 0.4 was chosen on **odd-numbered** engines and checked on the **even** ones
(50/50 caught, same lead times). Tuning and testing on the same engines would overstate how good it is.

**5. Bonus:** whichever pattern wins is the **fault type**. Silver gets `fault_mode` (HPC / FAN) and every alert carries
it. The 44 engines v1 missed are exactly the 44 labelled FAN.

**6. Keep Spark and Python identical:** silver computes the index as a Spark expression, gold and the tests use Python.
`tests/test_spark_parity.py` checks both give the same numbers.

**7. Re-run everything:** 14 tests pass; the crash demo still gives 54,787/54,787 with 0 missing and 0 duplicates;
alerts rose from 345 to 425 because the fan-fault engines now alert.
"""),
        mcq("Why was the fan weight tuned on odd-numbered engines and checked on even-numbered ones?", [
            "Odd engines have more data",
            "To check the setting works on engines it was not tuned on, so the reported result isn't flattering itself",
            "Spark processes odd partitions first",
            "It makes the code faster",
        ], 1, "This is held-out validation: the same idea as a train/test split."),
        learn("Your next milestones (from MILESTONES.md)", """
| # | Task | What you'll be able to say |
|---|---|---|
| T1 ✅ | Done (Step 12). Re-run `scripts/calibrate.py`, change `FAN_WEIGHT`, watch the table move | "I found a second failure mode by segment analysis and raised FD003 detection from 56% to 100%" |
| T2 ✅ | Done (`scripts/loadtest.py`, `docs/capacity-plan.md`). Re-run on your laptop and use your numbers | "On 4 cores it keeps up at 3,000 events/s; Delta commit history showed the stateful gold step was the bottleneck, and without it p95 latency fell from 24.6 s to 10.8 s, so gold runs as its own job" |
| T3 | Schema version 2 with a new optional field | schema evolution, backward/forward compatibility |
| T4 | Global dedupe with MERGE on event_id, cost comparison | when watermark dedupe isn't enough |
| T5 | Maintenance events that reset state | ordering and state design |
| T6 | Measure small files after a load test, run OPTIMIZE | compaction, file sizing |
| T7 | Run it on Databricks Free Edition | same code, cloud runtime |

Commit each milestone yourself with a clear message: your GitHub history is part of the story.
"""),
        talk("*\"How do you know your alerts are any good?\"*", """
- **Calibrated on ground truth:** C-MAPSS runs engines to failure, so lead time (cycles between alert and failure) is measurable.
- Swept α and thresholds and chose α = 0.2, 1.5/2.5: WARNING median 44 cycles ahead (p10 25), CRITICAL 18 (p10 11), 100% of FD001 engines caught.
- **Checked per segment:** FD003 was only 56%, traced to a second fault mode with opposite sensor directions (F14). Fixed with a fault-mode aware index tuned on half the engines and validated on the other half: 100% of both fleets, same false-alarm rate.
- Next: measure false alarms on healthy periods, and monitor detection quality over time (drift).
"""),
        talk("*\"Tell me about a time you debugged a difficult data issue.\"* (use F10)", """
- **Situation:** streaming pipeline with per-engine state; 156 engines were CRITICAL but the alerts table was empty, with no errors.
- **Task:** find why alerts were silently lost.
- **Action:** checked Delta table history (no MERGE on alerts ever committed); ran the state logic alone (correct); ran it through Spark in batch (correct); narrowed it to the streaming batch's execution. Found that the result was lazily recomputed after the state table was updated, so every event looked already applied.
- **Result:** materialised the batch with `localCheckpoint(eager=True)` and reordered the writes; 312 alerts, each once; verified end to end. **Learned:** never read and write the same table in one lazy plan; cache is a hint, not a guarantee.
"""),
    ]))
    return {"id": "turbofan", "title": "Project: Turbofan Telemetry, step by step", "tag": "build it yourself",
            "blurb": "The complete build of your streaming project: every decision, every line of real code, every error and fix, with interactive visuals of the architecture, the data, the alerts, checkpoints and the bugs.",
            "lessons": L}


if __name__ == "__main__":
    world = build()
    sys.stdout.write("// GENERATED by scripts/gen_walkthrough.py from the turbofan-telemetry repo. Do not edit by hand.\n")
    sys.stdout.write("module.exports = " + json.dumps(world, ensure_ascii=False, indent=1) + ";\n")
