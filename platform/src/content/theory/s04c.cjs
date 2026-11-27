const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Retries
  retries: T(`
    > **In one line:** retries automatically repeat an operation that failed for a **temporary** reason. Done right (bounded, with **exponential backoff and jitter**, only on **idempotent** operations) they absorb most everyday failures. Done wrong they duplicate data, hide real errors and knock over struggling systems.

    ## Why they exist
    In distributed systems, transient failures are normal: a node restarts, a network blip, an API rate-limits you, a lock times out, a spot instance is reclaimed. Most succeed on a second attempt seconds later. Without retries, every blip pages a human at 3 a.m.

    ## The anatomy of a good retry policy
    - **What to retry:** timeouts, connection resets, HTTP 429/500/502/503/504, deadlocks, throttling exceptions. **Not** 400/401/403/404, validation errors, bugs.
    - **How many times:** bounded (e.g. 3-5), or a total time budget.
    - **How long to wait:** **exponential backoff**: 1 s, 2 s, 4 s, 8 s… capped (e.g. 60 s). Gives the dependency time to recover.
    - **Jitter:** add randomness (e.g. sleep a random amount between 0 and the backoff). Without it, 500 clients that failed together retry together, in synchronised waves (the **thundering herd**).
    - **Respect server hints:** «Retry-After» headers on 429/503.
    - **Idempotency:** only retry operations that are safe to repeat, or pass an idempotency key.
    - **Observability:** log each retry with attempt number and reason; alert when retry rates rise (a sign of a degrading dependency).

    ## Retry layers in a data platform
    | Layer | Example |
    |---|---|
    | Client call | HTTP client retries a 503 with backoff |
    | Task | Airflow task «retries=3, retry_delay=5 min, retry_exponential_backoff=True» |
    | Job | Spark retries failed tasks (spark.task.maxFailures = 4) and lost stages |
    | Pipeline | Re-run from the failed step after a fix |
    | Streaming | Restart from checkpoint; Kafka consumer re-reads from last committed offset |
    Beware **retry multiplication**: 3 client retries × 3 task retries × 4 Spark attempts = up to 36 attempts against a struggling source.

    ## Edge cases and what goes wrong
    - **Retrying non-idempotent writes** → duplicates.
    - **Retry storms** amplify an outage: everyone retries, the dependency never recovers. Backoff, jitter, circuit breakers, concurrency limits (Airflow pools).
    - **Long retries hide failures:** a task retries for 6 hours before anyone knows. Alert on first retry for critical paths, or cap total time.
    - **Retrying after partial success** of a batch: re-processing the whole batch must be idempotent, or track per-item success.
    - **Retrying a timeout** whose operation actually succeeded.

    ## How interviewers test this
    - "How would you configure retries for a flaky API?" Transient-only, exponential backoff with jitter and a cap, Retry-After, bounded attempts, idempotent requests, metrics.
    - "What is the thundering herd problem?"
  `, {
    check: [
      mcq('Why add jitter to exponential backoff?', ['To make retries faster', 'To spread retries out so many clients that failed together do not retry in synchronised waves', 'To log better', 'It is required by HTTP'], 1, 'Synchronised retries (thundering herd) can keep a dependency down.'),
      multi('Which errors are usually worth retrying?', ['HTTP 503 Service Unavailable', 'HTTP 429 Too Many Requests (respect Retry-After)', 'Connection timeout', 'HTTP 400 Bad Request'], [0, 1, 2], '400 means your request is wrong; repeating it will not help.'),
      tf('Stacking client retries, task retries and job retries can multiply attempts against a struggling source.', true, 'Coordinate retry layers and cap total attempts.'),
    ],
    hands: [
      py({ q: 'Write «backoff_schedule(attempts, base=1.0, cap=30.0)» returning the list of **maximum** wait times (seconds) before each retry with exponential backoff: «base × 2^i» for i = 0..attempts-1, each capped at «cap». Then write «with_jitter(schedule, rnd)» that returns «[rnd() * w for w in schedule]» ("full jitter"), where «rnd» returns a float in [0, 1).', starter: 'def backoff_schedule(attempts, base=1.0, cap=30.0):\n    pass\n\ndef with_jitter(schedule, rnd):\n    pass\n',
        tests: `assert backoff_schedule(5) == [1.0, 2.0, 4.0, 8.0, 16.0]
assert backoff_schedule(7) == [1.0, 2.0, 4.0, 8.0, 16.0, 30.0, 30.0]
assert backoff_schedule(3, base=0.5) == [0.5, 1.0, 2.0]
assert backoff_schedule(0) == []
assert with_jitter([1.0, 2.0, 4.0], lambda: 0.5) == [0.5, 1.0, 2.0]
assert with_jitter([], lambda: 0.3) == []`,
        solution: `def backoff_schedule(attempts, base=1.0, cap=30.0):
    return [min(cap, base * 2 ** i) for i in range(attempts)]

def with_jitter(schedule, rnd):
    return [rnd() * w for w in schedule]` }),
    ],
  }),

  // ================================================================== Dead-letter queues
  dlq: T(`
    > **In one line:** a **dead-letter queue (DLQ)** (or quarantine table) is where records that **cannot be processed** go, with the reason, instead of either **crashing the pipeline** or being **silently dropped**. Good records keep flowing; bad ones are kept, visible and replayable.

    ## The problem it solves
    One malformed event among a million shouldn't stop the stream (a "poison pill" that crashes the consumer on every restart), and it shouldn't vanish either (data loss nobody sees). A DLQ isolates it.

    ## How it works
    «««flow
    Input -> Validate / process -> OK? -> Target table
    »»»
    and on failure: «→ DLQ (record + error + metadata)». A DLQ entry contains:
    - the **original payload** (raw, unchanged), so it can be replayed;
    - the **error** (type, message, failing rule);
    - **metadata**: source, topic/partition/offset or file name and line, pipeline version, run ID, timestamp, attempt count.

    ## Implementations
    - **Kafka:** a separate topic (e.g. «claims.events.dlq»). Kafka Connect supports «errors.deadletterqueue.topic.name»; consumers produce failed records there.
    - **Lakehouse batch:** a quarantine Delta table per dataset («silver.claims_quarantine»).
    - **Cloud messaging:** SQS, Service Bus and Pub/Sub have built-in dead-letter queues after N delivery attempts.

    ## The DLQ lifecycle (where teams fail)
    A DLQ is useless if nobody looks at it. You need:
    1. **Monitoring:** DLQ size and inflow rate with alerts (a spike = upstream change or a bug you just deployed).
    2. **Triage:** classify reasons; dashboards by error type.
    3. **Fix:** correct the code, the mapping or get the source fixed.
    4. **Replay:** re-process DLQ records through the fixed pipeline, idempotently, and mark them resolved.
    5. **Retention and governance:** DLQs hold raw data, sometimes PII; apply the same access rules and retention.

    ## Retry topics vs DLQ
    For transient failures (dependency down), route to **retry topics with delays** (retry-1m, retry-10m) before the DLQ; only permanently failing records reach the DLQ.

    ## Edge cases and what goes wrong
    - **DLQ as a black hole:** thousands of records, no alerts, discovered at year-end close.
    - **Order-sensitive data:** sending one CDC event to the DLQ and applying later ones for the same key breaks ordering. For ordered streams, you may need to block that key (or partition) until resolved.
    - **Replaying without idempotency** duplicates records already processed in a partial attempt.
    - **Losing the original payload** by storing only the parsed (failed) version.
    - **Systemic failures** (every record fails because of a schema change) flood the DLQ; better to fail fast when the rejection rate exceeds a threshold.

    ## How interviewers test this
    - "How do you handle poison messages in Kafka?" Catch, send to DLQ with context, commit the offset, monitor, fix and replay.
    - "Why not just drop bad records?" Silent data loss; audit; you cannot fix what you cannot see.
  `, {
    check: [
      mcq('A malformed message makes your consumer crash; it restarts from the same offset and crashes again. This is…', ['Backpressure', 'A poison pill; handle it by routing the record to a DLQ and committing past it', 'Normal behaviour', 'A watermark issue'], 1, 'Without a DLQ, one bad message stops the whole partition.'),
      multi('What should a DLQ record contain?', ['The original raw payload', 'The error type and message', 'Source position (topic/partition/offset or file/line) and run ID', 'Only a count of failures'], [0, 1, 2], 'Enough to understand, fix and replay.'),
      tf('A DLQ that nobody monitors is effectively silent data loss.', true, 'Alert on size and inflow; triage and replay.'),
      mcq('Every record suddenly fails after a source schema change. Best behaviour?', ['Send millions of records to the DLQ and continue', 'Fail fast when the rejection rate exceeds a threshold and alert, because this is structural', 'Drop them', 'Retry forever'], 1, 'DLQs are for exceptions, not systemic breaks.'),
    ],
  }),

  // ================================================================== Dependencies
  deps: T(`
    > **In one line:** pipeline dependencies define **what must finish (or be true) before something else may start**: task order inside a pipeline, pipelines waiting for other pipelines, and data waiting for data. Getting them explicit is what stops jobs from running on incomplete inputs.

    ## Kinds of dependencies
    | Kind | Example | How it is expressed |
    |---|---|---|
    | **Task → task (same DAG)** | clean_claims after load_bronze | DAG edges («a >> b») |
    | **Pipeline → pipeline** | Gold claims DAG waits for the dealers DAG | Sensors, cross-DAG triggers, data-aware scheduling (Airflow Datasets/Assets) |
    | **Data availability** | Wait for the ERP's daily file | File sensors, event triggers, «_SUCCESS» markers |
    | **Time** | Not before 01:00 (source batch window) | Schedule, time sensors |
    | **External system state** | Source finished its nightly close | API sensor, status table |
    | **Resource** | Max 5 tasks hitting the CRM API at once | Pools, concurrency limits |

    ## Time-based vs data-based scheduling
    - **Time-based ("run at 02:00"):** simple, but guesses when data is ready. If upstream is late, you process incomplete data and report success.
    - **Data-aware ("run when the upstream table is updated for this date"):** runs exactly when inputs are ready; no guessing; requires upstreams to publish completion.
    Prefer data-aware triggers for internal dependencies, sensors with timeouts for external ones.

    ## Designing dependencies well
    - **Make implicit dependencies explicit:** if job B reads table A, B must depend on A's completion for the same logical date, not on "A usually finishes by 3".
    - **Depend on data readiness, not job success alone:** A succeeded with 0 rows is not "ready". Publish a readiness signal after quality checks pass.
    - **Same logical date:** B for 2026-11-26 depends on A for 2026-11-26.
    - **Avoid deep chains across teams** without contracts; one late upstream delays everything (critical path).
    - **No cycles:** a DAG by definition.

    ## Edge cases and what goes wrong
    - **Sensor without timeout** waits forever, holding a worker slot ("sensor deadlock" when all slots are sensors). Use timeouts and reschedule mode / deferrable sensors.
    - **Hidden dependency via a shared table:** a report reads a table that is mid-rewrite.
    - **Backfill ordering:** backfilling A for 30 days while B's scheduled runs read half-backfilled data.
    - **Fan-in waiting on optional inputs:** decide whether B runs if one of five sources is missing (trigger rules).

    ## How interviewers test this
    - "How do you make sure a job does not run before its input data is ready?" Data-aware scheduling, sensors with timeouts, readiness markers after quality checks, same logical date.
    - "What happens with a time-based schedule when upstream is late?"
  `, {
    check: [
      mcq('Job B is scheduled at 03:00 because job A "usually finishes by 02:30". A finishes at 04:10 tonight. What happens?', ['B waits automatically', 'B processes incomplete or yesterday\'s data and may report success', 'A is cancelled', 'Nothing'], 1, 'Time-based guesses fail silently. Use data-aware dependencies.'),
      tf('A sensor without a timeout can hold a worker slot indefinitely.', true, 'Set timeouts and use reschedule/deferrable mode.'),
      mcq('What should "upstream is ready" mean?', ['The upstream job process exited', 'The upstream data for the same logical date was written and passed its quality checks', 'It is after 02:00', 'The cluster is idle'], 1, 'Success with zero rows is not readiness.'),
    ],
  }),

  // ================================================================== Orchestration
  orch: T(`
    > **In one line:** an orchestrator (Airflow, Dagster, Prefect, Azure Data Factory, Databricks Workflows) **schedules and coordinates** pipeline steps: runs them in dependency order, on time or on events, with retries, parameters, history, alerts and backfills. It decides **when and in what order**; the work itself runs elsewhere.

    ## Why not cron?
    Cron runs commands at times. It does not know dependencies, does not retry intelligently, has no run history UI, no backfill, no passing of run dates, no alerting, no concurrency limits, and fails silently. Orchestrators add all of this.

    ## What an orchestrator provides
    - **DAGs** of tasks with dependencies and trigger rules.
    - **Scheduling:** cron-like, intervals, event/data-driven triggers.
    - **Run context:** the logical date / data interval passed to tasks, enabling reproducible runs and **backfills**.
    - **Retries, timeouts, SLAs/alerts.**
    - **Concurrency control:** pools, max active runs, queues.
    - **Observability:** run history, task logs, durations, Gantt views.
    - **Parameterisation and templating** (dates, environments).
    - **Integration operators** for databases, Spark, cloud services, dbt.

    ## Orchestrate, don't execute
    The orchestrator should **trigger** heavy work in the right engine (Spark cluster, warehouse, dbt, Databricks job) and wait for it, not process big data inside its own workers. Running a 20 GB pandas transform inside an Airflow worker kills the scheduler's workers and couples compute to orchestration.

    ## The landscape
    | Tool | Model | Notes |
    |---|---|---|
    | **Apache Airflow** | Python DAGs, task-centric | Most widely used; huge operator ecosystem; managed: MWAA, Astronomer, Cloud Composer |
    | **Dagster** | Asset-centric (tables are first-class) | Strong lineage, types, testing |
    | **Prefect** | Python flows, dynamic | Developer-friendly |
    | **Azure Data Factory** | Low-code pipelines + activities | Strong for Azure ingestion; used in many enterprises |
    | **Databricks Workflows / Jobs** | Tasks on Databricks | Good when everything runs on Databricks |
    | **dbt** | Not an orchestrator: it builds SQL models in dependency order inside one run | Usually triggered by an orchestrator |

    ## Edge cases and what goes wrong
    - **Heavy processing in the scheduler's workers.**
    - **Top-level code in DAG files** (database calls at import time) slowing the scheduler that parses files every few seconds.
    - **Using «now()» instead of the logical date** → non-reproducible runs.
    - **Catchup surprises:** deploying a DAG with a start_date a year ago and catchup on → 365 runs start at once.
    - **One giant DAG** for everything; a failure anywhere blocks everything. Split by domain with data-aware links.
    - **Orchestrator as single point of failure:** run it highly available; jobs should be safe to re-trigger after an outage.

    ## How interviewers test this
    - "Why use an orchestrator rather than cron?"
    - "What should run inside Airflow workers and what shouldn't?"
    - "What is the logical date and why does it matter?" (Airflow in depth next.)
  `, {
    check: [
      mcq('Where should a 200 GB transformation run when orchestrated by Airflow?', ['Inside the Airflow worker with pandas', 'On a processing engine (Spark/Databricks/warehouse) that Airflow triggers and monitors', 'On the scheduler', 'On a laptop'], 1, 'Orchestrate, do not execute heavy work in the orchestrator.'),
      multi('What does an orchestrator add over cron?', ['Dependencies between tasks', 'Retries, timeouts and alerts', 'Run history and backfills with logical dates', 'Faster SQL'], [0, 1, 2], 'Execution speed comes from the engines it triggers.'),
      tf('dbt is a full replacement for an orchestrator like Airflow.', false, 'dbt orders and runs SQL models within a run; scheduling, cross-system dependencies and sensors usually come from an orchestrator.'),
    ],
  }),

  // ================================================================== Airflow in depth
  airflow: T(`
    > **In one line:** Apache Airflow defines pipelines as **Python DAGs** of **tasks** (operators), schedules **DAG runs** for **data intervals**, and executes task instances through a **scheduler** and **executor**, with retries, backfills and a UI. Knowing its execution model (especially the **logical date**) is essential for correct pipelines.

    ## Architecture
    | Component | Role |
    |---|---|
    | **DAG files** | Python files defining DAGs (parsed continuously) |
    | **Scheduler** | Parses DAGs, creates DAG runs when due, queues task instances whose dependencies are met |
    | **Executor** | Decides where tasks run: Local, Celery (worker pool), Kubernetes (pod per task) |
    | **Workers** | Execute tasks |
    | **Metadata database** | State of every DAG run and task instance, variables, connections, XComs |
    | **Webserver / API** | UI: runs, logs, graph, trigger, clear, backfill |
    | **Triggerer** | Runs deferrable operators (async waits without holding a worker) |

    ## Core concepts
    - **DAG:** id, schedule, start_date, catchup, default_args (retries, retry_delay, owner, email/alerts).
    - **Operator → Task → Task instance:** an operator is a template (BashOperator, PythonOperator, SparkSubmitOperator, DatabricksRunNowOperator, SQL operators); a task is an operator in a DAG; a task instance is one execution for one run.
    - **TaskFlow API:** «@task»-decorated Python functions; return values passed via XCom.
    - **XCom:** small messages between tasks (IDs, paths, counts). **Not** for data: pass references, not DataFrames.
    - **Sensors:** wait for a condition (file, table partition, external task); use «mode="reschedule"» or deferrable versions.
    - **Trigger rules:** «all_success» (default), «all_done», «one_failed», «none_failed»… for cleanup and branching.
    - **Pools:** cap concurrent tasks on a shared resource (e.g. 4 slots for the CRM API).
    - **Connections and Variables:** credentials and config stored centrally (backed by a secrets manager).
    - **Datasets / Assets (data-aware scheduling):** a DAG runs when the datasets it consumes are updated by producer tasks.
    - **Dynamic task mapping:** create N tasks at runtime (one per file/table).

    ## The logical date and data interval (the most misunderstood part)
    A daily DAG run with logical date **2026-11-26** covers the **data interval 2026-11-26 00:00 → 2026-11-27 00:00** and **runs after the interval ends** (shortly after midnight on the 27th). The run processes the day that just finished.
    - Use «{{ data_interval_start }}» / «{{ ds }}» in queries, never «datetime.now()».
    - Then a **re-run** or **backfill** of 2026-11-26 processes exactly the same day, and results are reproducible.
    - **catchup=True** + an old start_date schedules every missed interval.
    - **Backfill:** «airflow dags backfill -s 2026-10-01 -e 2026-10-31 dag_id» runs historical intervals; tasks must be idempotent.
    - **Clear:** re-running selected task instances (and downstream) for a run.

    ## Best practices
    1. Idempotent, deterministic tasks keyed by the data interval.
    2. Tasks that **trigger** external compute; keep workers light.
    3. No heavy top-level code in DAG files (slows parsing for every DAG).
    4. Small, atomic tasks (re-run one piece), but not so tiny that scheduling overhead dominates.
    5. Sensors in reschedule/deferrable mode with timeouts.
    6. Pools for shared resources; «max_active_runs» to limit parallel runs of a DAG during backfills.
    7. Alerts (on_failure_callback) with context; SLAs/timeouts.
    8. Secrets in a backend (Key Vault, Secrets Manager), not in code or plain Variables.
    9. Tests: DAG import test (no cycles, parses), unit tests for task logic.
    10. Version DAGs in Git; deploy through CI/CD.

    ## Edge cases and what goes wrong
    - **«start_date = datetime.now()»** (dynamic start date) → the scheduler never schedules runs.
    - **Changing a DAG's schedule** with existing history creates confusing intervals.
    - **XCom with large data** bloats the metadata DB.
    - **Zombie / stuck tasks** after worker crashes; heartbeats and timeouts handle them.
    - **Timezones:** schedules are in UTC by default; "01:00 IST" needs an explicit timezone-aware start_date.
    - **Clearing upstream tasks** re-runs everything downstream for that run, by design: know what you are clearing.

    ## How interviewers test this
    - "Explain Airflow's architecture." Scheduler, executor, workers, metadata DB, webserver, triggerer.
    - "What is the logical date? A daily run with logical date 26th runs when?" After the interval ends, early on the 27th.
    - "How do you backfill safely?" Idempotent tasks on data intervals, max_active_runs, pools, catchup understanding.
    - "XCom: what is it and what should it not be used for?"
  `, {
    check: [
      mcq('A daily DAG run with logical date 2026-11-26 normally starts…', ['At 00:00 on 2026-11-26', 'Just after the data interval ends, i.e. early on 2026-11-27, processing 2026-11-26', 'At noon on 2026-11-26', 'Whenever the worker is free'], 1, 'Airflow runs a schedule interval after it closes.'),
      mcq('Which is the right way to pass a 2 GB DataFrame between two Airflow tasks?', ['XCom', 'Write it to storage (e.g. a Delta table or Parquet path) and pass the path/table name via XCom', 'A Variable', 'Email'], 1, 'XCom is for small metadata; data goes to storage.'),
      tf('Setting «start_date=datetime.now()» is a good way to make a DAG start immediately.', false, 'A moving start date prevents the scheduler from ever scheduling a run. Use a fixed past date (with catchup off if needed).'),
      mcq('Five tasks call a CRM API that allows only 4 concurrent requests. Which Airflow feature limits them?', ['XCom', 'A pool with 4 slots', 'A sensor', 'Trigger rules'], 1, 'Pools cap concurrency on shared resources across DAGs.'),
      match('Match the Airflow component to its job.', [['Scheduler', 'Decides which task instances are ready and queues them'], ['Executor', 'Decides where/how tasks run (Celery, Kubernetes…)'], ['Metadata DB', 'Stores the state of runs and tasks'], ['Triggerer', 'Runs deferrable async waits without holding worker slots']], 'Know the moving parts.'),
    ],
    scenarios: [
      scenario('The backfill that melted the source', `
        You deploy a new daily DAG with «start_date=2025-11-27», «catchup=True», and no limits. Within minutes, 365 DAG runs start, each running an extraction query on the production ERP database. The ERP team calls: their system is unusable.`, [
        ['What caused this?', [
          ['catchup=True with a start date a year ago scheduled every missed daily interval at once, with no run or concurrency limits', true, 'Catchup is powerful and dangerous.'],
          ['The ERP database is too small', false, 'It was fine until 365 parallel extracts hit it.'],
          ['Airflow has a bug', false, 'It did exactly what the DAG said.'],
        ]],
        ['Immediate action?', [
          ['Pause the DAG, mark/clear the queued runs, confirm the ERP recovers', true, 'Stop the damage first.'],
          ['Wait for it to finish', false, 'The ERP is down for the business.'],
          ['Delete the Airflow metadata database', false, 'Destroys history for all DAGs.'],
        ]],
        ['How do you run the historical load properly?', [
          ['catchup=False for normal scheduling, then a controlled backfill with max_active_runs=2 and a pool limiting ERP queries, ideally from a replica, off-peak', true, 'History loads must be throttled.'],
          ['Run all 365 days in one giant query', false, 'Even heavier on the source, and not idempotent per day.'],
          ['Skip history', false, 'The business needs it.'],
        ]],
      ], 'Catchup, max_active_runs and pools are safety controls, not optional extras.'),
    ],
    hands: [
      py({ q: 'Airflow-style **data intervals**. Write «data_interval(logical_date)» for a **daily** schedule returning «(start, end)» ISO dates, and «missed_runs(start_date, last_run, today)» returning the list of logical dates (ISO strings) that catchup would schedule: every day after «last_run» (or from «start_date» if «last_run» is None) whose interval has **fully ended** by «today» (interval end ≤ today).', starter: 'from datetime import date, timedelta\n\ndef data_interval(logical_date):\n    pass\n\ndef missed_runs(start_date, last_run, today):\n    pass\n',
        tests: `assert data_interval('2026-11-26') == ('2026-11-26', '2026-11-27')
assert missed_runs('2026-11-20', '2026-11-23', '2026-11-27') == ['2026-11-24', '2026-11-25', '2026-11-26']
assert missed_runs('2026-11-25', None, '2026-11-27') == ['2026-11-25', '2026-11-26']
assert missed_runs('2026-11-27', None, '2026-11-27') == [], 'interval for the 27th has not ended yet'`,
        solution: `from datetime import date, timedelta

def data_interval(logical_date):
    d = date.fromisoformat(logical_date)
    return d.isoformat(), (d + timedelta(days=1)).isoformat()

def missed_runs(start_date, last_run, today):
    d = date.fromisoformat(last_run) + timedelta(days=1) if last_run else date.fromisoformat(start_date)
    t = date.fromisoformat(today)
    out = []
    while d + timedelta(days=1) <= t:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out` }),
    ],
  }),

  // ================================================================== dbt
  dbt: T(`
    > **In one line:** **dbt** (data build tool) lets you write transformations as **SQL SELECT models** in files; it works out their **dependency graph**, builds them as tables/views **inside the warehouse/lakehouse**, and adds **tests, documentation and lineage**, bringing software engineering practice to the "T" in ELT.

    ## The problem it solves
    Before dbt, warehouse transformations were stored procedures, scheduled SQL scripts and views edited in place: no version control, no tests, no documentation, hidden dependencies, manual ordering. dbt makes each transformation a versioned file with explicit references, so the whole layer becomes a testable, reviewable codebase.

    ## How it works
    - A **model** is a «.sql» file containing one SELECT. «models/silver/claims.sql».
    - Models reference each other with «{{ ref('stg_claims') }}» and raw tables with «{{ source('crm', 'claims') }}». From these, dbt builds the **DAG** and runs models in order.
    - **Materialisations** decide what is built: «view», «table», «incremental» (only process new/changed rows and merge them), «ephemeral» (inlined CTE), «snapshot» (SCD2 history).
    - **Jinja** templating and **macros** for reusable SQL; **packages** (dbt_utils, dbt_expectations).
    - **Tests:** generic («unique», «not_null», «accepted_values», «relationships») declared in YAML, plus custom SQL tests (a query that returns failing rows). «dbt build» runs models and tests in DAG order and stops downstream models when an upstream test fails.
    - **Docs and lineage:** «dbt docs generate» produces a site with column docs and a lineage graph.
    - **Environments / targets:** dev schema per developer, prod schema; same code.
    - **Selectors:** «dbt build --select state:modified+» builds only changed models and their children (slim CI).

    ## The standard layering
    | Layer | Purpose | Materialisation |
    |---|---|---|
    | **staging** («stg_») | One model per source table: rename, cast, light cleaning; 1:1 with source | View |
    | **intermediate** («int_») | Reusable joins and business logic | View/ephemeral/table |
    | **marts** («fct_», «dim_») | Facts and dimensions for consumers | Table/incremental |

    ## Incremental models in a sentence
    «««sql
    {{ config(materialized='incremental', unique_key='claim_id', incremental_strategy='merge') }}
    SELECT * FROM {{ ref('stg_claims') }}
    {% if is_incremental() %}
      WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }}) - INTERVAL 1 DAY  -- lookback
    {% endif %}
    »»»
    First run builds everything; later runs MERGE only recent changes. «--full-refresh» rebuilds when logic changes.

    ## Where dbt fits
    - **Good at:** SQL transformations in the warehouse/lakehouse, testing, docs, lineage, analytics engineering collaboration.
    - **Not for:** ingestion (use connectors/Spark), heavy non-SQL processing, streaming, orchestration of cross-system workflows (use Airflow/Dagster to run «dbt build» after ingestion).

    ## Edge cases and what goes wrong
    - **Incremental model logic bugs:** a filter that misses late updates; no lookback; changed logic without a full refresh leaves old rows computed the old way.
    - **Non-unique «unique_key»** makes merges fail or duplicate.
    - **Expensive full rebuilds** of huge tables every run (cost).
    - **Tests only on marts:** errors originate in staging; test early.
    - **Ref cycles** or reading production tables directly instead of «ref» (breaks environments and lineage).
    - **Snapshot misuse:** dbt snapshots are SCD2 on source snapshots; missed runs miss intermediate changes.

    ## How interviewers test this
    - "What does dbt do?" T of ELT; models, ref, DAG, materialisations, tests, docs.
    - "How do incremental models work and what can go wrong?"
    - "How do dbt and Airflow work together?"
  `, {
    check: [
      mcq('How does dbt know the order to build models?', ['Alphabetical order', 'From the «ref()» and «source()» calls in each model, which form a dependency DAG', 'From a YAML list you maintain by hand', 'Random'], 1, 'ref() is both a dependency declaration and an environment-aware table name.'),
      mcq('You changed the business logic of an incremental model. What must you do so old rows use the new logic?', ['Nothing', 'Run a full refresh (or backfill the affected range) because incremental runs only process new rows', 'Add a test', 'Rename the model'], 1, 'Otherwise the table mixes old and new logic.'),
      match('Match the dbt materialisation.', [['view', 'Saved query, computed at read time'], ['table', 'Rebuilt fully each run'], ['incremental', 'Only new/changed rows merged in each run'], ['snapshot', 'SCD2 history of a source table']], 'Choose by size, freshness and history needs.'),
      tf('dbt is the right tool to ingest data from a REST API.', false, 'dbt transforms data already in the warehouse; use connectors, Spark or scripts for ingestion.'),
    ],
  }),
};
