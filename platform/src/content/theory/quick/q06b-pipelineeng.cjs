const { T } = require('../_t.cjs');

module.exports = {
  deps: T(`
    > **In one line:** dependencies define **what must finish (or be true) before something else starts**: task order, pipelines waiting on pipelines, data waiting on data. Making them explicit stops jobs running on incomplete inputs.

    | Kind | Example | Expressed with |
    |---|---|---|
    | Task → task | clean_claims after load_bronze | DAG edges («a >> b») |
    | Pipeline → pipeline | Gold claims waits for dealers DAG | Sensors, cross-DAG triggers, **data-aware scheduling** (Airflow Assets, Databricks table-update triggers) |
    | Data availability | ERP's daily file | File sensors, file-arrival triggers, «_SUCCESS» markers |
    | Time | Not before 01:00 | Schedule, time sensors |
    | External state | Source finished nightly close | API sensor, status table |
    | Resource | Max 5 tasks on the CRM API | Pools, concurrency limits |

    **Time-based** ("run at 02:00") guesses when data is ready: a late upstream means processing incomplete data and reporting success. **Data-aware** runs exactly when inputs are published. Prefer data-aware for internal dependencies, sensors with timeouts for external ones.

    ## Designing them well
    - **Make implicit dependencies explicit:** B reads A → B depends on A **for the same logical date**, not "A usually finishes by 3".
    - **Depend on data readiness, not job success:** A succeeding with 0 rows isn't ready → publish a readiness signal after quality checks.
    - **Publication semantics:** never read a half-written upstream → atomic commits (Delta), a "published" marker or version.
    - **"All partitions" inputs:** a gold job needing 30 plants' files must know which are missing and decide: wait, publish partial with metadata, or fail.
    - **Cross-team chains** are the fragile part (polling forever, implicit dependencies on another team's table) → dataset events, contracts with freshness SLOs, sensor timeouts with alerts. No cycles (it's a DAG).

    ## What goes wrong
    - **Sensor without timeout** waits forever holding a slot; all slots sensors = deadlock → timeouts + reschedule/deferrable mode.
    - Hidden dependency via a shared table read mid-rewrite.
    - **Backfill ordering:** backfilling A for 30 days while B's scheduled runs read half-backfilled data.
    - Fan-in with optional inputs → decide via trigger rules.

    **Interview:** not running before inputs are ready (data-aware scheduling, sensors with timeouts, readiness after quality checks, same logical date); time-based schedule with late upstream (incomplete data reported as success).
  `),

  orch: T(`
    > **In one line:** an orchestrator (Airflow, Dagster, Prefect, Azure Data Factory, Databricks Workflows) **schedules and coordinates** steps: dependency order, time or event triggers, retries, parameters, history, alerts, backfills. It decides **when and in what order**; the work runs elsewhere.

    **Why not cron:** cron runs commands at times, with no dependencies, smart retries, history UI, backfill, run dates, alerting or concurrency limits, and it fails silently.

    **Provides:** DAGs + trigger rules; schedules (cron, intervals, events/data); **run context** (logical date / data interval → reproducible runs and backfills); retries, timeouts, SLAs, alerts; concurrency (pools, max active runs, queues); run history, logs, Gantt; templating; operators for DBs, Spark, cloud, dbt.

    **Orchestrate, don't execute:** trigger heavy work in the right engine (Spark, warehouse, dbt, Databricks job) and wait. A 20 GB pandas transform inside an Airflow worker kills workers and couples compute to orchestration.

    | Tool | Model | Notes |
    |---|---|---|
    | Apache Airflow | Python DAGs, task-centric | Most used; huge provider ecosystem; managed: MWAA, Astronomer, Cloud Composer |
    | Dagster | Asset-centric | Strong typing, lineage, testing |
    | Prefect | Dynamic Python flows | Developer-friendly |
    | Azure Data Factory | Low-code pipelines/activities | Many connectors; common in Azure enterprises like Cummins |
    | Databricks Workflows/Jobs | Tasks on Databricks | Native for Databricks-only stacks, cheaper, good repair runs |
    | dbt | *Not* an orchestrator: builds SQL models in order in one run | Triggered by an orchestrator |

    **Production-grade means:** idempotent tasks keyed on logical date; retries with backoff; timeouts/SLAs; alerts; backfill support; pools protecting sources; secrets via backends; CI tests that DAGs import with no cycles. **Event-driven** (file arrived, table updated) cuts latency and wasted runs; schedules are predictable; many platforms mix: event triggers + a scheduled safety run.

    ## What goes wrong
    - Heavy processing in scheduler workers.
    - Top-level code in DAG files (DB calls at import) slows parsing of every DAG.
    - «now()» instead of the logical date → non-reproducible runs.
    - **Catchup surprise:** start_date a year ago + catchup on → 365 runs at once.
    - One giant DAG; one failure blocks everything → split by domain, link with data-aware triggers.
    - Orchestrator as single point of failure → run HA; jobs safe to re-trigger after an outage.

    **Interview:** why not cron; what runs inside Airflow workers (orchestration, not data); logical date (next topic).
  `),

  airflow: T(`
    > **In one line:** Apache Airflow defines pipelines as **Python DAGs** of **tasks**, schedules **DAG runs** for **data intervals**, and executes task instances through a **scheduler** and **executor**, with retries, backfills and a UI. The **logical date** is the part people get wrong.

    | Component | Role |
    |---|---|
    | DAG files | Python, parsed continuously |
    | Scheduler | Creates DAG runs when due; queues task instances whose dependencies are met |
    | Executor | Where tasks run: Local, Celery (worker pool), Kubernetes (pod per task: isolation, slower start) |
    | Workers | Run tasks |
    | Metadata DB | State of runs/task instances, variables, connections, XComs |
    | Webserver / API | UI: runs, logs, graph, trigger, clear, backfill |
    | Triggerer | Runs deferrable operators (async waits without a worker) |
    Managed: Astronomer, MWAA, Cloud Composer, Azure Data Factory's managed Airflow.

    ## Concepts
    - **DAG:** id, schedule, start_date, catchup, default_args (retries, retry_delay, owner, alerts).
    - **Operator → task → task instance:** template (Bash, Python, SparkSubmit, DatabricksRunNow, SQL) → in a DAG → one execution for one run. **TaskFlow** «@task» functions pass return values via XCom.
    - **XCom:** small metadata (paths, IDs, counts), **not data**; big XComs bloat the metadata DB (or use an object-storage backend).
    - **Sensors:** wait for file/partition/external task; use «mode="reschedule"» or deferrable so a waiting sensor doesn't hold a slot for hours; always a timeout.
    - **Trigger rules:** «all_success» (default), «all_done», «one_failed», «none_failed»… for cleanup and branching.
    - **Pools + priority:** cap concurrent tasks on a shared resource (a source DB tolerating 4 extracts).
    - **Connections/Variables** backed by a secrets manager; **Assets** (data-aware scheduling); **dynamic task mapping** (N tasks at runtime, one per file/table).

    ## Logical date and data interval
    A daily run with logical date **2026-11-26** covers **2026-11-26 00:00 → 2026-11-27 00:00** and **runs after the interval ends** (just after midnight on the 27th): it processes the day that just finished.
    - Use «{{ data_interval_start }}» / «{{ ds }}», never «datetime.now()», so re-runs/backfills of the 26th process exactly that day.
    - **catchup=True** + old start_date schedules every missed interval at once → set deliberately, limit with «max_active_runs».
    - **Backfill:** «airflow dags backfill -s 2026-10-01 -e 2026-10-31 dag_id» (tasks must be idempotent). **Clear** re-runs selected task instances and downstream.

    ## Best practices
    1. Idempotent, deterministic tasks keyed on the data interval.
    2. Tasks **trigger** external compute; workers stay light.
    3. **No heavy top-level code** (it runs on every parse, every few seconds; slow parsing delays every DAG).
    4. Small atomic tasks, not so tiny that scheduling dominates.
    5. Deferrable sensors with timeouts.
    6. Pools; max_active_runs during backfills.
    7. on_failure_callback alerts with context; SLAs/timeouts.
    8. Secrets in Key Vault/Secrets Manager.
    9. DAG import tests (parses, no cycles) + unit tests.
    10. DAGs in Git via CI/CD.

    **Airflow 3** (3.0 April 2025; 3.1+ added human-in-the-loop tasks, minor releases through 2026): DAG versioning, **assets** (renamed from datasets), the task execution API (tasks no longer touch the metadata DB directly), new UI, changed «logical_date» semantics for manual runs.

    ## What goes wrong
    - «start_date = datetime.now()» → never scheduled.
    - Changing a schedule with existing history → confusing intervals.
    - Zombie/stuck tasks after worker crashes (heartbeats, timeouts).
    - Schedules are UTC by default; "01:00 IST" needs a timezone-aware start_date.
    - Clearing upstream re-runs everything downstream for that run.

    **Interview:** architecture; "logical date 26th runs when?" (after the interval, early on the 27th); safe backfill (idempotent tasks on intervals, max_active_runs, pools, catchup); XCom limits.
  `),

  dbt: T(`
    > **In one line:** **dbt** lets you write transformations as **SQL SELECT models**, works out their **dependency graph**, builds them as tables/views **inside the warehouse/lakehouse**, and adds **tests, docs and lineage**: software practice for the "T" in ELT.

    **Why:** before dbt, transformations were stored procedures, scheduled scripts and views edited in place: no version control, tests, docs, explicit dependencies or ordering. dbt makes each a versioned, reviewable, testable file.

    ## How it works
    - A **model** = one SELECT in a «.sql» file. «{{ ref('stg_claims') }}» and «{{ source('crm','claims') }}» build the **DAG** (and lineage) and run order.
    - **Materialisations:** «view» (no storage, compute on read), «table» (rebuilt each run), «incremental» (merge/append/insert_overwrite with «is_incremental()» filters), «ephemeral» (inlined CTE), «snapshot» (SCD2 with check/timestamp strategy), materialized views on supporting adapters.
    - **Jinja + macros**, **packages** (dbt_utils, dbt_expectations).
    - **Tests:** generic («unique», «not_null», «accepted_values», «relationships») in YAML; singular (SQL returning failing rows); **unit tests** (dbt 1.8+: mocked inputs → expected outputs); **model contracts** (enforced types/constraints); **source freshness**. «dbt build» runs models + tests in order and skips children of a failed test.
    - **Docs/lineage:** «dbt docs generate»; **exposures** document dashboards.
    - **Targets:** dev schema per developer, prod schema, same code.
    - **Slim CI:** «dbt build --select state:modified+ --defer --state prod-artifacts» builds only changed models and children, reading unchanged parents from prod.

    | Layer | Purpose | Materialisation |
    |---|---|---|
    | staging «stg_» | 1:1 with a source: rename, cast, light cleaning | View |
    | intermediate «int_» | Reusable joins, business logic | View / ephemeral / table |
    | marts «fct_», «dim_» | Facts and dimensions per domain | Table / incremental |

    «««sql
    {{ config(materialized='incremental', unique_key='claim_id', incremental_strategy='merge') }}
    SELECT * FROM {{ ref('stg_claims') }}
    {% if is_incremental() %}
      WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }}) - INTERVAL 1 DAY  -- lookback
    {% endif %}
    »»»
    First run builds all; later runs MERGE recent changes; «--full-refresh» rebuilds when logic changes.

    **Fits:** SQL transforms, tests, docs, lineage, analytics-engineering collaboration. **Not for:** ingestion, heavy non-SQL processing, streaming, cross-system orchestration (Airflow/Dagster runs «dbt build» after ingestion). **On Databricks:** runs on a SQL warehouse, incremental merge on Delta, Unity Catalog three-level names; Python models on clusters.

    ## What goes wrong
    - **Incremental bugs:** «max(updated_at)» filter without lookback misses late rows; changed logic without full refresh leaves old rows computed the old way; schema changes need «on_schema_change».
    - Non-unique «unique_key» → MERGE fails or duplicates.
    - Expensive full rebuilds of huge tables every run.
    - Tests only on marts (errors start in staging).
    - Reading prod tables directly instead of «ref» (breaks environments and lineage); ref cycles.
    - Snapshots are SCD2 on source snapshots: missed runs miss intermediate changes.

    **Interview:** what dbt does (models, ref, DAG, materialisations, tests, docs); incremental models and pitfalls; dbt + Airflow.
  `),

  backfill: T(`
    > **In one line:** a **backfill** runs a pipeline for **past** periods: loading history, fixing a bug, applying new logic, filling an outage gap, absorbing restated source data. It's where non-idempotent, date-unaware pipelines break, so a pipeline is production-grade only if it backfills safely.

    **Prerequisites:**
    1. **Parameterised by logical date/interval** (never «now()»).
    2. **Idempotent writes** (partition overwrite/MERGE).
    3. **Reproducible inputs** from retained bronze or versioned snapshots: the source may no longer have the data (retention), another reason to keep bronze.
    4. **Downstream awareness:** backfilling silver means rebuilding gold for those periods (lineage tells you what).
    5. **Throttling** (max_active_runs, pools) to protect sources and clusters.

    | Strategy | How | Pros | Cons |
    |---|---|---|---|
    | Per-interval runs | Normal daily job for each past day | Same code path; easy resume | Slow for years |
    | Bulk range job | A month per run | Efficient | Separate code path; bigger blast radius |
    | **Rebuild-and-swap** | Build a new table version, validate, swap | Consumers never see a mix | Temporary double storage |
    | Replay from log | Re-consume Kafka/bronze with new code (Kappa) | Same streaming code | Needs retention; slow |

    ## Runbook
    1. Scope: tables, range, reason; dependents via lineage.
    2. **Announce:** numbers will change; dashboards, ML models and finance already used the old ones (keep the old version via time travel for comparison).
    3. **Test one interval** in non-prod; diff vs current; explain every difference before scaling.
    4. Run throttled, oldest → newest / dependency order, watching cost and source load.
    5. Prefer rebuild-and-swap for big changes.
    6. Reconcile after (counts/sums per period).
    7. Rebuild downstream for the same periods.
    8. Record what/why/when/who, and **which code version** produced each partition (column or table property).

    ## What goes wrong
    - **Mixed logic versions** while it runs.
    - **SCD2:** history must join the dimension version valid at the time; overwriting with "current" attributes rewrites history.
    - **Competes with daily runs** (concurrent writer conflicts) → pause/coordinate; parallel years overwhelm sources, budgets and incremental consumers (CDF readers see 2 years of "changes") → chronological chunks.
    - Cost spikes → estimate first.
    - **Cumulative metrics** (running totals, "first seen") must be backfilled in order.
    - **Streaming backfills:** a new checkpoint replaying Kafka only works within retention; beyond it, backfill bronze in batch then switch the stream over at a known offset/time.

    **Interview:** "bug corrupted 2 months" (fix code, test one day, backfill from bronze idempotently or rebuild-and-swap, rebuild downstream, reconcile, communicate); what makes a pipeline backfillable.
  `),

  late: T(`
    > **In one line:** **late-arriving** data turns up after its period was processed; **out-of-order** data arrives in a different order than it happened. Both are normal, so pipelines decide **how long to wait, where late records go, and how results get corrected**.

    **Why late:** devices offline (engines in remote areas buffer for hours/days), mobile queues, partner exports next day, retries/network, corrections (a claim fixed a week later), timezones (yesterday locally = today in UTC).

    **Two kinds:** **late facts** (Monday's reading arrives Thursday) and **late dimensions / early-arriving facts** (a claim for a dealer not yet in the dimension).

    | Strategy (late facts) | How | Use when |
    |---|---|---|
    | Lookback reprocessing | Each run redoes the last N days (idempotent overwrite/MERGE) | Batch; lateness mostly within N |
    | Event-time partitions updated | Late rows land in their real partition; recompute those | Lakehouse; downstream must follow |
    | Watermarks (streaming) | Wait up to X, then finalise; drop or side-output older | Streaming aggregates |
    | Late side table | Beyond-watermark records → table for batch correction | Fast provisional + accurate final |
    | Restatement | Provisional numbers, then final after a close | Finance, regulated |
    | As-of-arrival | Count in the period it arrived | When "when we learned it" is the business view |

    **Size the window from data:** track «arrival_time − event_time» per source; if 99.9% arrive within 2 days, a 3-day lookback catches nearly all; monitor what still falls outside. **Restatement window:** e.g. last 7 days provisional, older closed; dashboards show which periods are provisional; beyond-window records go to a "late arrivals" table, reported, and folded into periodic (monthly) restatement if needed.

    **Late dimensions:** **inferred member** (insert a placeholder row with the natural key, link facts, update its attributes SCD1-style when the real record arrives, so facts are never dropped); or unknown member (-1) + re-keying job; or hold facts in a waiting table (latency, needs timeout).

    **Partitioning choice:** by event date → late rows rewrite old partitions; by ingestion date → cheap writes, but event-date queries scan more. Common: bronze by ingestion date, silver/gold by event date.

    ## What goes wrong
    - Downstream not re-run (silver has the late row, last week's gold monthly doesn't).
    - Watermark too short → silent drops; monitor dropped-late counts.
    - **Incremental "last updated" filters miss late events:** use **arrival/ingestion time to pick up** new records and **event time to place** them.
    - A late correction changes an already-published month-end snapshot.
    - Lookback without idempotent writes → duplicates.

    **Interview:** daily batch (lookback + idempotent partition overwrite + downstream recompute; measure lateness); streaming (event-time windows, watermark from measured lateness, side output, batch correction); fact before dimension (inferred member).
  `),

  observ: T(`
    > **In one line:** **data observability** = knowing at any moment if data and pipelines are healthy: **fresh, complete, valid, unchanged in shape, and where it came from**. Monitoring says *that* something broke; observability helps explain *why* and *what's affected*.

    | Pillar | Question | Signal |
    |---|---|---|
    | Freshness | Up to date? | Time since last success; max(event_time) lag |
    | Volume | Right amount? | Row counts vs history; bytes |
    | Distribution | Values normal? | NULL rates, ranges, means, category frequencies |
    | Schema | Structure changed? | Added/removed/changed columns |
    | Lineage | What depends on what? | Upstreams and downstreams per table |
    Plus **pipeline** signals: status, duration, retries, resources, cost, consumer lag. "The job succeeded" (pipeline) says nothing about whether the data is right (data): monitor both.

    **Emit from every run** into a metrics table (the source for dashboards and alerts): run ID, logical date, start/end, status, rows read/written/rejected per stage, duration per stage, bytes, retries, code version, watermark/offset positions, freshness (max event time loaded), quality results. **Per table:** last update, rows, partitions, checks. **Streaming:** input vs processing rate, batch duration, consumer lag, watermark, state size, dropped-late count. **Logs:** structured JSON with run ID.

    ## Alerts people trust
    - On **symptoms consumers feel** (freshness SLO breach, volume anomaly, failed quality gate), not every warning.
    - **Routed to an owner** with context (table, run, impact, what changed, runbook link).
    - **Page** only SLA-breaking issues; ticket degradations; dashboard trends.
    - Dedupe/group, tune thresholds, seasonal baselines: every noisy alert erodes trust.
    - **Test alerts:** one that can't fire is worse than none.

    **Tools:** pipeline/infra: Airflow UI, Spark UI, Azure Monitor/Log Analytics, CloudWatch, Prometheus + Grafana, Datadog. Data: dbt tests, Great Expectations, Soda, Monte Carlo/Bigeye-style anomaly detection, **Databricks system tables + Lakehouse Monitoring**, Lakeflow Declarative Pipelines (DLT) expectation metrics, Unity Catalog lineage, OpenLineage/Marquez.

    ## What goes wrong
    - **Green pipelines, wrong data** (only job status watched).
    - Freshness on load time not data time: ran on time, reloaded yesterday's file.
    - **Freshness aggregated over sources:** one source stopped, max(updated_at) looks fine → check per source.
    - Metrics without baselines ("12,000 rows" vs "usually 50,000 on Tuesdays").
    - Logs without run IDs can't be correlated.

    **Interview:** monitoring a pipeline (run metrics + freshness/volume/distribution/schema + lineage + owned contextual alerts); detecting a source that silently stopped (per-source freshness + volume anomaly).
  `),

  lineage: T(`
    > **In one line:** **lineage** records **where data comes from and where it goes** (sources, jobs and transformations behind a table or column; tables, dashboards and models consuming it). It answers "what breaks if I change this?" and "why is this number wrong?".

    **Uses:** **impact analysis** before changing/deleting a column; **root cause** (walk upstream from a broken metric); **compliance/privacy** (where personal data flows, which copies to delete); **trust** (certified table's origins and checks); **cost/clean-up** (deprecate tables with no readers in 90 days, cost attribution). **Lineage + quality = blast radius:** when a source fails a check, lineage says which downstream products to mark degraded.

    | Level | Example |
    |---|---|
    | Table | gold.claims_by_region ← silver.claims + dim_dealer ← bronze.crm_claims |
    | Column | gold.approval_rate ← silver.claims.status + claim_id |
    | Run (operational) | Which run/code version wrote version 412 |
    | Business | KPI "approval rate" defined from certified tables |
    Column-level is what answers "which reports break if I change this column?" and "where does this PII field flow?"; table-level only makes column impact guesswork.

    **Capture:** **parsed from code** (dbt «ref()», SQL parsers); **runtime events** (OpenLineage from Spark, Airflow, dbt; **Unity Catalog** captures table + column lineage automatically for queries on UC tables; **Purview** scans Azure sources): most complete for what actually happened; **manual** (docs for Excel extracts, external feeds): fragile, goes stale.

    **Gaps** at boundaries tools can't see: Python reading files by path, API extracts, CSV/Excel exports, BI tools without connectors, dynamic SQL → register manually or with OpenLineage emitters.

    **Interview:** what and why (impact, RCA, compliance, trust); everything affected by a source column change (column-level lineage + query/access logs).
  `),

  sla: T(`
    > **In one line:** a **data SLA** is a promise to consumers (usually **freshness** like "updated by 06:00 IST", plus **completeness, quality, availability**), measured by **SLIs** against **SLO** targets, with an agreed response when missed.

    | Term | Meaning | Example |
    |---|---|---|
    | SLI | The measurement | Time gold.claims finished each day; minutes since last load |
    | SLO | Internal target (set **tighter** than the SLA) | By 06:00 IST on 99% of days per quarter |
    | SLA | External commitment with escalation/consequences | Business informed; incident process if breached |
    | Error budget | Allowed misses | 1% of days ≈ 1 late day/quarter; 99% over 30 days ≈ 7 h stale. Spend on deploys/maintenance; stop risky changes when exhausted |

    **Typical SLOs:** freshness (no older than X / ready by T); completeness (≥ 99.9% of source records, via reconciliation); quality (blockers pass, errors under threshold); availability (queryable 99.9% of business hours); streaming latency (p95 end-to-end < 60 s).

    ## Setting them
    1. **Start from the consumer:** when they look, what decision, cost of delay. Consumers differ: finance month-end needs correctness/completeness over speed; a fleet alert stream needs latency. One pipeline serves both only with explicit SLOs.
    2. **Work back through dependencies:** gold at 06:00, source lands 02:00, processing 2 h → 2 h buffer. **Upstreams cap your SLA**: no 06:00 promise if the extract lands at 05:50 on bad days → measure arrival distributions.
    3. **Measure first** with p95, not averages (average 05:00 can hide 10% of days at 07:30).
    4. **Show it:** "data as of 05:41" on dashboards.
    5. **Alert before the breach** (run late enough to put the SLA at risk).
    6. **Agree breach handling:** who, how fast, fallback (last good data + banner).

    ## What goes wrong
    - SLA on a partner file without a matching upstream SLA.
    - SLA met, data wrong (freshness without quality).
    - Everything "critical" = nothing is.

    **Interview:** SLA for a daily dashboard (need, SLI/SLO, buffer analysis, visibility, proactive alerts, breach process); SLI vs SLO vs SLA.
  `),

  reliab: T(`
    > **In one line:** a reliable platform **keeps producing correct data despite failures** (machines die, networks blip, sources misbehave, code has bugs, people make mistakes). **Fault tolerance** = surviving component failures; **reliability engineering** = designing, measuring and practising so failures are rare, small, detected fast and recovered safely.

    At scale something is always failing (lost executor, reclaimed spot node, 503s, broker restart, malformed file, bad deploy); design to absorb it.

    | Building block | Protects against |
    |---|---|
    | Idempotent steps | Duplicates from retries/re-runs |
    | Retries + backoff + jitter | Transient failures |
    | Checkpointing (offsets, state, job progress) | Losing progress on crash |
    | Replication (storage, Kafka, DBs) | Hardware loss |
    | Atomic commits / write-audit-publish | Partial/bad results reaching consumers |
    | Quarantine / DLQ | One bad record stopping everything or vanishing |
    | Schema validation, contracts | Upstream changes |
    | Quality gates | Wrong data published |
    | Retained raw bronze | Unrecoverable bugs (enables replay) |
    | Backups, time travel | Accidental deletes, logical corruption |
    | Observability, alerting | Slow detection |
    | Runbooks, on-call | Slow, inconsistent response |
    | CI/CD with tests, staged rollout | Bad deploys |
    | Headroom, autoscaling | Load spikes |
    | Isolation (separate clusters/queues) | One workload starving others |

    **Design for recovery, not just prevention:** immutable replayable bronze, time travel on curated tables, idempotent jobs, runbooks, tested restores. MTTR matters more than MTBF. **Change is the biggest risk** (most incidents follow deploys or upstream changes) → CI tests, data diffs on PRs, canary runs on a subset, easy rollback.

    **Measure:** **MTTD**, **MTTR**, incident count, SLO attainment, **data downtime** (time data was missing/wrong/stale). **Blameless post-mortems:** timeline, root cause, contributing factors, owned action items, and a test so it can't recur silently (the posting's "root cause and prevent recurrence").

    **Disaster recovery:** **RPO** = acceptable data loss (bronze replicated across zones/regions → near zero); **RTO** = time to serve again. Tools: cross-region backups/geo-replication, Delta deep clones, metastore/catalog backups, infrastructure as code to rebuild, **tested** restore procedures.

    **Chaos testing:** kill jobs mid-run, inject bad records, duplicate and delay messages, verify invariants. Turbofan's demo does exactly this: a strong interview story.

    ## What goes wrong
    - Untested recovery (backups that can't restore, stale runbooks).
    - Correlated failures (all replicas in one zone; everything on one shared service).
    - Reliability by heroics (one person knows the fix).
    - **Cascading failures:** one slow upstream → retries everywhere → overload → more failures.

    **Interview:** making a pipeline fault tolerant (walk the blocks with examples); an incident you handled (detect, mitigate, root cause, prevent: STAR); RPO vs RTO.
  `),
};
