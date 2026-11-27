const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Backfills
  backfill: T(`
    > **In one line:** a **backfill** runs a pipeline for **past** periods: to load history for a new table, fix data after a bug, apply new logic to old data, or fill gaps after an outage. Backfills are where non-idempotent, date-unaware pipelines fail, so a pipeline is only production-grade if it can be backfilled safely.

    ## When you backfill
    - **New pipeline:** load 3 years of history.
    - **Bug fix:** a transformation was wrong for 6 weeks; recompute those weeks.
    - **New column/logic:** apply it to history.
    - **Outage:** the pipeline was down 3 days; process the missed intervals.
    - **Late or corrected source data:** the source restated last month.

    ## Prerequisites (what makes a backfill safe)
    1. **Parameterised by logical date / interval** (never «now()»).
    2. **Idempotent writes** (partition overwrite / MERGE), so re-processing a period replaces it.
    3. **Reproducible inputs:** read from retained raw (bronze) or versioned snapshots, not "whatever the source has now".
    4. **Downstream awareness:** backfilling silver means gold for those periods must be rebuilt too (lineage tells you what).
    5. **Throttling:** limit concurrency (max_active_runs, pools) to protect sources and clusters.

    ## Strategies
    | Strategy | How | Pros | Cons |
    |---|---|---|---|
    | **Per-interval runs** | Orchestrator runs the normal daily job for each past day | Same code path as production; easy to resume | Slow for years of data; many runs |
    | **Bulk range job** | One job processes a whole range (e.g. a month per run) | Efficient | Separate code path to maintain; bigger failure blast radius |
    | **Rebuild-and-swap** | Build a complete new version of the table elsewhere, validate, then swap | Consumers never see half-backfilled data | Needs double storage temporarily |
    | **Replay from log** | Re-consume Kafka/bronze with new code (Kappa style) | Same streaming code | Needs retention; can be slow |

    ## A safe backfill runbook
    1. Define scope: tables, date range, reason; find downstream dependents with lineage.
    2. Communicate: consumers will see numbers change for those dates.
    3. Test on one interval in a non-prod environment; compare old vs new.
    4. Run throttled, oldest to newest (or by dependency order), monitoring cost and source load.
    5. Prefer **rebuild-and-swap** for large changes so consumers never see a mix.
    6. Reconcile after: counts/sums per period; explain the diffs.
    7. Rebuild downstream aggregates for the same periods.
    8. Record it (what, why, when, who) for audit.

    ## Edge cases and what goes wrong
    - **Mixing logic versions:** half the table computed with old logic, half with new, while the backfill runs.
    - **SCD2 dimensions and backfills:** re-running history must use the dimension version valid at the time; overwriting with "current" attributes rewrites history.
    - **Source no longer has the data** (retention expired), so bronze is the only source: another reason to keep it.
    - **Backfill competes with daily runs** on the same tables (concurrent writer conflicts); pause or coordinate.
    - **Cost spikes** from processing years at once; estimate first.
    - **Sequential dependencies:** cumulative metrics (running totals, "first seen" flags) require backfilling in order.

    ## How interviewers test this
    - "A bug corrupted 2 months of a table. How do you fix it?" Fix code, test on one day, backfill from bronze with idempotent writes (or rebuild and swap), rebuild downstream, reconcile, communicate.
    - "What makes a pipeline backfillable?"
  `, {
    check: [
      multi('What does a pipeline need to be safely backfillable?', ['Parameterised by logical date, not now()', 'Idempotent writes (overwrite/MERGE)', 'Reproducible inputs such as retained raw data', 'A larger cluster'], [0, 1, 2], 'Capacity helps speed, not safety.'),
      mcq('You backfilled silver for October. What else usually needs re-running?', ['Nothing', 'Downstream gold tables and aggregates for October (found via lineage)', 'Only bronze', 'Only November'], 1, 'Fixes must propagate to everything derived from the corrected data.'),
      tf('Rebuild-and-swap lets consumers keep reading a consistent old version until the new one is validated.', true, 'Atomic swap avoids a half-backfilled table.'),
    ],
  }),

  // ================================================================== Late data
  late: T(`
    > **In one line:** **late-arriving data** shows up after the period it belongs to has already been processed; **out-of-order data** arrives in a different order from when it happened. Both are normal in real systems, and pipelines must decide **how long to wait, where late records go, and how results get corrected**.

    ## Why data is late
    - Devices offline (engines in remote areas buffer readings for hours or days).
    - Mobile apps queue events until connectivity returns.
    - Batch exports from partners arrive the next day.
    - Retries and network delays.
    - Corrections and restatements (a claim amount fixed a week later).
    - Timezones: a record dated "yesterday" in one zone is "today" in UTC.

    ## Two kinds of late
    - **Late facts:** an event belongs to a past period (a reading from Monday arrives Thursday).
    - **Late dimensions (early-arriving facts):** a fact references a dimension member that does not exist yet (claim for a newly onboarded dealer).

    ## Strategies for late facts
    | Strategy | How | Use when |
    |---|---|---|
    | **Lookback reprocessing** | Each run reprocesses the last N days (idempotent overwrite/MERGE) | Batch; lateness mostly within N days |
    | **Partition by event time and update past partitions** | Late records land in their correct partition; affected partitions are recomputed | Lakehouse tables; downstream must follow |
    | **Watermarks (streaming)** | Wait up to X for late events, then finalise; drop or side-output older ones | Streaming aggregates |
    | **Late-data side table** | Records older than the watermark go to a table for a batch correction | Accurate final numbers with fast provisional ones |
    | **Restatement / versioned reporting** | Publish provisional numbers, then final numbers after a close period | Finance, regulated reporting |
    | **Accept as-of-arrival** | Count late records in the period they arrived | When "when we learned it" is the business view |

    ## Measuring lateness to choose the window
    Track «arrival_time − event_time» per source. If 99.9% of records arrive within 2 days, a 3-day lookback catches nearly all; monitor what still falls outside.

    ## Late dimensions
    - **Inferred members:** insert a placeholder dimension row (natural key only), link facts to it, update its attributes when the real record arrives (SCD1 on the placeholder fields).
    - **Unknown member (-1)** plus a re-keying job later.
    - **Hold facts** in a waiting table until the dimension arrives (adds latency; needs a timeout).

    ## Edge cases and what goes wrong
    - **Downstream not re-run:** silver gets the late record; the gold monthly table computed last week does not.
    - **Watermark too short:** silent drops of real data; monitor dropped-late counts.
    - **"Last updated" filters miss late events** whose event time is old but which arrived recently: incremental logic must use **arrival/ingestion time** to pick up new records, and **event time** to place them.
    - **Snapshot facts:** a late correction changes a month-end snapshot that was already published.
    - **Duplicates from lookback** if writes are not idempotent.

    ## How interviewers test this
    - "How do you handle late-arriving data in a daily batch?" Lookback window + idempotent partition overwrite + downstream recompute; measure lateness.
    - "In streaming?" Event-time windows, watermark sized from measured lateness, side output for very late data, batch correction.
    - "A fact arrives before its dimension. What do you do?" Inferred member.
  `, {
    check: [
      mcq('An incremental job picks new rows with «WHERE event_time > last_watermark». An engine buffers readings offline for 2 days. What happens to those readings?', ['They are processed normally', 'They are skipped: their event_time is older than the watermark even though they just arrived', 'They are duplicated', 'They crash the job'], 1, 'Pick new records by ingestion time; place them by event time.'),
      mcq('How should you choose a lookback window?', ['Always 1 day', 'From measured lateness (arrival time − event time) per source, e.g. covering 99.9% of records, and monitor what falls outside', 'As long as possible', 'Whatever the cluster can handle'], 1, 'Measure, then decide.'),
      tf('An inferred dimension member is a placeholder created when a fact arrives before its dimension record.', true, 'It is updated when the real dimension data arrives.'),
    ],
    hands: [
      sql({ q: '**Measure lateness** per day of event. For each «date(updated_at)», return «events», «late_over_30m» (ingested more than 30 minutes after «updated_at») and «max_delay_min» (rounded to 1 dp). Sort by day. Use «(julianday(ingested_at) - julianday(updated_at)) * 1440» for minutes.', tables: ['raw_orders_feed'], level: 2,
        solution: `SELECT date(updated_at) AS day,
       COUNT(*) AS events,
       SUM(CASE WHEN (julianday(ingested_at) - julianday(updated_at)) * 1440 > 30 THEN 1 ELSE 0 END) AS late_over_30m,
       ROUND(MAX((julianday(ingested_at) - julianday(updated_at)) * 1440), 1) AS max_delay_min
FROM raw_orders_feed
GROUP BY date(updated_at)
ORDER BY day;`,
        hint: 'GROUP BY date(updated_at); SUM(CASE …) for the late count; MAX of the delay.' }),
    ],
  }),

  // ================================================================== Observability
  observ: T(`
    > **In one line:** **data observability** means being able to tell, at any moment, whether your data and pipelines are healthy: **is it fresh, complete, valid, unchanged in shape, and where did it come from?** Monitoring tells you *that* something broke; observability helps you understand *why* and *what is affected*.

    ## The five pillars of data observability
    | Pillar | Question | Signal |
    |---|---|---|
    | **Freshness** | Is the data up to date? | Time since last successful update; max(event_time) lag |
    | **Volume** | Is the right amount there? | Row counts vs history; bytes written |
    | **Distribution** | Do values look normal? | NULL rates, ranges, means, category frequencies |
    | **Schema** | Did the structure change? | Added/removed/changed columns |
    | **Lineage** | What depends on what? | Upstream sources and downstream consumers of each table |

    Plus **pipeline** signals: run status, duration, retries, resource usage, cost, consumer lag (streaming).

    ## What to instrument in every pipeline
    - **Per run:** run ID, logical date, start/end, status, rows read/written/rejected per step, bytes, retries, code version.
    - **Per table:** last updated time, row count, partition count, quality check results.
    - **Streaming:** input rate, processing rate, batch duration, consumer lag, watermark position, state size, dropped-late count.
    - **Logs:** structured (JSON) with run ID so logs from all steps of a run can be found together.

    ## Alerting that people trust
    - Alert on **symptoms consumers feel**: freshness SLA breach, volume anomaly, failed quality gate, not every warning.
    - **Route** to an owner (dataset owner / on-call), with **context** (what, which run, impact, runbook link).
    - **Severity levels:** page for SLA-breaking issues; ticket for degradations; dashboard for trends.
    - **Avoid alert fatigue:** dedupe, group, tune thresholds, seasonal baselines.
    - **Test alerts:** an alert that cannot fire is worse than none.

    ## Tools
    Pipeline/infra: Airflow UI, Spark UI, cloud monitoring (Azure Monitor, CloudWatch), Prometheus + Grafana, Datadog. Data: dbt tests, Great Expectations, Soda, Monte Carlo, Databricks Lakehouse Monitoring, Unity Catalog lineage, OpenLineage/Marquez.

    ## Edge cases and what goes wrong
    - **Green pipelines, wrong data:** only job status is monitored.
    - **Freshness checked on load time, not data time:** the job ran on time but loaded yesterday's file again.
    - **Freshness aggregated over sources:** one source stopped, others continue; max(updated_at) looks fine. Check per source.
    - **Metrics without baselines:** "12,000 rows" means nothing without "usually 50,000 on Tuesdays".
    - **Logs without run IDs:** impossible to correlate.

    ## How interviewers test this
    - "How do you monitor a pipeline?" Run metrics + data checks (freshness, volume, distribution, schema) + lineage + alerts to owners with context.
    - "How would you detect that a source silently stopped sending data?" Per-source freshness and volume anomaly checks.
  `, {
    check: [
      match('Match the observability pillar to its signal.', [['Freshness', 'Time since the newest record'], ['Volume', 'Row count versus historical baseline'], ['Distribution', 'NULL rate and value ranges'], ['Schema', 'Columns added or removed'], ['Lineage', 'Upstream and downstream dependencies']], 'Five pillars of data observability.'),
      mcq('The pipeline ran on time and loaded 50,000 rows, but it re-loaded yesterday\'s file. Which check catches this?', ['Job status', 'Freshness on the data itself (max event time) rather than on load time', 'Row count', 'Schema check'], 1, 'Load time can be fresh while data is stale.'),
      tf('Alerting on every warning makes on-call more effective.', false, 'Alert fatigue makes people ignore alerts. Alert on consumer-impacting symptoms with context.'),
    ],
    hands: [
      sql({ q: '**Per-source freshness monitor.** Using «sensor_readings» (one row per reading), return for each «engine_id» the latest reading time «last_ts» and «hours_behind»: hours between that and the **latest reading across all engines** (rounded to 1 dp). Show only engines more than **24 hours** behind, most behind first. (An empty result means every engine is reporting.)', tables: ['sensor_readings'], level: 3, allowEmpty: true,
        solution: `WITH latest AS (SELECT engine_id, MAX(ts) AS last_ts FROM sensor_readings GROUP BY engine_id),
     global AS (SELECT MAX(ts) AS max_ts FROM sensor_readings)
SELECT l.engine_id, l.last_ts, ROUND((julianday(g.max_ts) - julianday(l.last_ts)) * 24, 1) AS hours_behind
FROM latest l CROSS JOIN global g
WHERE (julianday(g.max_ts) - julianday(l.last_ts)) * 24 > 24
ORDER BY hours_behind DESC;`,
        hint: 'MAX(ts) per engine, compare with the global MAX(ts) via CROSS JOIN, filter > 24 hours.' }),
    ],
  }),

  // ================================================================== Lineage
  lineage: T(`
    > **In one line:** **data lineage** records **where data came from and where it goes**: which sources, jobs and transformations produced a table or column, and which tables, dashboards and models consume it. It answers "what breaks if I change this?" and "why is this number wrong?".

    ## Why it matters
    - **Impact analysis:** before changing or deleting a column, see every downstream consumer.
    - **Root cause analysis:** a dashboard number is wrong; trace upstream to the job or source that changed.
    - **Compliance and privacy:** where does personal data flow? Which copies must be deleted?
    - **Trust:** consumers see a certified table's origins and checks.
    - **Cost and clean-up:** find tables with no downstream consumers.

    ## Levels of lineage
    | Level | Example |
    |---|---|
    | **Table/dataset** | silver.claims ← bronze.crm_claims; gold.claims_by_region ← silver.claims + dim_dealer |
    | **Column** | gold.approval_rate ← silver.claims.status + silver.claims.claim_id |
    | **Job/run (operational)** | Which run of which job wrote version 412 of the table, with which code version |
    | **Business** | KPI "approval rate" defined from these certified tables |

    ## How lineage is captured
    - **Parsed from code:** dbt builds lineage from «ref()»; SQL parsers read queries.
    - **Captured at runtime:** engines emit events (OpenLineage from Spark, Airflow, dbt); Unity Catalog captures lineage from queries automatically.
    - **Declared manually:** documentation, for things outside instrumented tools (Excel extracts, external feeds). Fragile.
    Runtime capture is the most complete for what actually happened.

    ## Edge cases and what goes wrong
    - **Lineage gaps:** data leaves the platform (CSV download, external tool) and lineage stops.
    - **Dynamic SQL** and Python transformations are harder to parse.
    - **Stale manual lineage** misleads.
    - **Table-level only:** you know the table is used, not which columns; impact analysis for a column change is guesswork.

    ## How interviewers test this
    - "What is lineage and why would you need it?" Impact analysis, RCA, compliance, trust.
    - "How would you find everything affected by a change to a source column?" Column-level lineage + query/access logs.
  `, {
    check: [
      mcq('You must delete a customer\'s personal data from every copy. What helps most to find them?', ['Row counts', 'Lineage (ideally column-level) plus PII tags in the catalog', 'A bigger cluster', 'Dashboards'], 1, 'Lineage shows where data flowed.'),
      tf('Lineage captured at runtime from engines (e.g. OpenLineage, Unity Catalog) tends to be more complete than manually documented lineage.', true, 'It reflects what actually ran.'),
      mcq('Table-level lineage says gold.claims_by_region uses silver.claims. You plan to drop one column of silver.claims. What do you still not know?', ['Whether gold uses that specific column: you need column-level lineage', 'Where silver lives', 'Who owns gold', 'Nothing'], 0, 'Column-level lineage makes column changes safe.'),
    ],
  }),

  // ================================================================== SLAs
  sla: T(`
    > **In one line:** a **data SLA** is a promise to consumers about data: typically **freshness** ("updated by 06:00 IST"), **completeness**, **quality** and **availability**, measured by **SLIs** against **SLO** targets, with an agreed response when it is missed.

    ## The vocabulary
    | Term | Meaning | Example |
    |---|---|---|
    | **SLI** (indicator) | What you measure | Time at which gold.claims finished updating each day |
    | **SLO** (objective) | Target for the SLI | Updated by 06:00 IST on 99% of days per quarter |
    | **SLA** (agreement) | The promise, often with consequences or escalation | Business is told; incident process if breached |
    | **Error budget** | Allowed failures within the SLO | 1% of days ≈ 1 late day per quarter |

    ## Typical data SLOs
    - **Freshness:** data no older than X (or ready by time T).
    - **Completeness:** ≥ 99.9% of source records loaded (reconciliation).
    - **Quality:** blocker checks pass; error-level issues below a threshold.
    - **Availability:** table/semantic model queryable 99.9% of business hours.
    - **Latency** for streaming: p95 end-to-end < 60 s.

    ## Setting SLAs well
    1. **Start from the consumer's need:** when do they look, what decision, what is the cost of delay.
    2. **Work backwards through dependencies:** if gold must be ready at 06:00 and the source file lands at 02:00 and processing takes 2 hours, you have 2 hours of buffer for retries and incidents.
    3. **Measure before promising:** look at historical run times (p95, not average).
    4. **Make it visible:** freshness on dashboards ("data as of 05:41").
    5. **Alert before the breach:** warn when the run is late enough that the SLA is at risk, not after.
    6. **Agree on breach handling:** who is notified, how fast, what the fallback is (show last good data with a banner).

    ## Edge cases and what goes wrong
    - **SLA on a dependency you do not control** (partner file) without a matching upstream SLA.
    - **Averages hiding tail latency:** average finish 05:00, but 10% of days 07:30.
    - **SLA met, data wrong:** freshness without quality.
    - **Too many SLAs:** everything "critical" means nothing is.

    ## How interviewers test this
    - "How would you define an SLA for a daily dashboard?" Consumer need, SLI/SLO, buffer analysis, visibility, proactive alerting, breach process.
    - "SLI vs SLO vs SLA?"
  `, {
    check: [
      match('Match the term.', [['SLI', 'The measurement, e.g. daily completion time of the table'], ['SLO', 'The target, e.g. ready by 06:00 on 99% of days'], ['SLA', 'The agreed promise with escalation if missed'], ['Error budget', 'The allowed amount of misses within the SLO']], 'Indicator, objective, agreement.'),
      mcq('When should the SLA alert fire?', ['After the deadline passes', 'When the run is late enough that the deadline is at risk, so there is time to act', 'Never', 'Every run'], 1, 'Proactive warnings give time to fix or communicate.'),
      tf('Setting the SLA from the average run time is safe.', false, 'Use tail percentiles (p95/p99) plus buffer for retries and incidents.'),
    ],
  }),

  // ================================================================== Reliability
  reliab: T(`
    > **In one line:** a reliable data platform **keeps producing correct data despite failures**: machines die, networks blip, sources misbehave, code has bugs, people make mistakes. **Fault tolerance** is surviving component failures; **reliability engineering** is designing, measuring and practising so failures are rare, small, detected fast and recovered safely.

    ## Failure is the normal case
    At scale, something is always failing: a Spark executor lost, a spot node reclaimed, an API returning 503, a Kafka broker restarting, a malformed file, a bad deploy. Reliable systems assume this and are designed to absorb it.

    ## The building blocks (all covered in their own topics)
    | Building block | Protects against |
    |---|---|
    | **Idempotent steps** | Duplicates from retries and re-runs |
    | **Retries with backoff + jitter** | Transient failures |
    | **Checkpointing** (streaming offsets + state, long-job progress) | Losing progress on crash |
    | **Replication** (storage, Kafka, databases) | Hardware loss |
    | **Atomic commits / write-audit-publish** | Partial or bad results reaching consumers |
    | **Quarantine / DLQ** | One bad record stopping everything, or vanishing |
    | **Schema validation and contracts** | Upstream changes |
    | **Data quality gates** | Wrong data being published |
    | **Retained raw data (bronze)** | Unrecoverable bugs; enables replay |
    | **Backups and versioning (time travel)** | Accidental deletes and logical corruption |
    | **Observability and alerting** | Slow detection |
    | **Runbooks and on-call** | Slow, inconsistent response |
    | **CI/CD with tests, staged rollout** | Bad deploys |
    | **Capacity headroom and autoscaling** | Load spikes |
    | **Isolation** (separate clusters/queues per workload) | One workload starving others |

    ## Measuring reliability
    - **MTTD** (mean time to detect), **MTTR** (mean time to recover), number of incidents, SLO attainment, data downtime (time data was missing/wrong/stale).
    - Track incidents and do **blameless post-mortems** with action items that prevent recurrence (the posting's "root cause and prevent recurrence").

    ## Disaster recovery
    - **RPO** (recovery point objective): how much data loss is acceptable (e.g. 15 minutes).
    - **RTO** (recovery time objective): how long until service is restored (e.g. 4 hours).
    - Options: backups in another region, cross-region replication of storage, infrastructure as code to rebuild, documented and **tested** restore procedures.

    ## Edge cases and what goes wrong
    - **Untested recovery:** backups that cannot be restored; runbooks that are out of date.
    - **Correlated failures:** all replicas in one zone; all pipelines depend on one shared service.
    - **Reliability by heroics:** one person knows how to fix things.
    - **Cascading failures:** one slow upstream causes retries everywhere, overload, more failures.

    ## How interviewers test this
    - "How do you make a pipeline fault tolerant?" Walk through the building blocks with examples.
    - "Tell me about a production incident you handled." Detection, mitigation, root cause, prevention (STAR).
    - "RPO vs RTO?"
  `, {
    check: [
      match('Match the mechanism to what it protects against.', [['Idempotent writes', 'Duplicates from re-runs'], ['Checkpointing', 'Losing streaming progress on crash'], ['Retained bronze data', 'Bugs that require reprocessing history'], ['Write-audit-publish', 'Bad data reaching consumers']], 'Reliability is layered.'),
      mcq('RPO of 15 minutes means…', ['The system must recover in 15 minutes', 'At most 15 minutes of data may be lost in a disaster', 'Backups run every 15 hours', 'Alerts fire in 15 minutes'], 1, 'RPO = acceptable data loss; RTO = acceptable downtime.'),
      tf('A backup that has never been test-restored should not be counted on.', true, 'Test restores regularly.'),
    ],
    interview: [
      talk('Tell me about a time something broke in a pipeline or report you owned. What did you do?', `
        **STAR structure, with a data-engineering lens:**
        - **Situation:** what broke and how you found out (ideally your monitoring, not a user).
        - **Task:** what was at stake (a dashboard used for decisions, a deadline).
        - **Action:** contain (stop bad data spreading, tell consumers), diagnose (trace upstream, compare with source, find the change), fix (code/config), recover (re-run/backfill idempotently, reconcile).
        - **Result:** time to recover, data restored, consumers informed.
        - **Prevention:** what check, alert, test or contract you added so it cannot recur silently. This is the part interviewers listen for.
        - Good candidate stories: the Turbofan alert bug or fan-fault story; a dashboard number that did not match the source.`, 'hr'),
    ],
  }),
};
