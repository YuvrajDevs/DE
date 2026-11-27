const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== ETL vs ELT
  etlelt: T(`
    > **In one line:** **ETL** = extract, **transform outside** the destination, then load the finished result. **ELT** = extract, **load raw** into the destination, then transform **inside** it using its own compute (usually SQL). The difference is *where* and *when* the transformation happens, and that changes cost, flexibility, governance and failure handling.

    ## The problem it solves
    Data from sources is never ready to use: wrong types, duplicates, codes instead of names, spread across systems. It must be transformed somewhere. The question is where.

    ## Why ETL came first
    In the 1990s-2000s warehouses were expensive, fixed-size appliances. Storage and compute inside them were precious, so you did **not** load raw junk into them. A separate ETL server (Informatica, SSIS, DataStage, Talend) extracted data, transformed it in its own engine, and loaded only clean, modelled rows.

    ## Why ELT took over
    Cloud warehouses and lakehouses changed the economics:
    - Storage became cheap (object storage), so keeping raw data costs little.
    - Compute became elastic and massively parallel: the warehouse itself is the most powerful transformation engine you have.
    - SQL-based tools (dbt) made in-warehouse transformations versioned, tested and documented.
    So: load raw first (fast, simple, nothing lost), transform with SQL inside the platform, and keep the raw for replay.

    ## How each works
    «««flow
    ETL: Source -> Extract -> Transform (separate engine) -> Load clean -> Warehouse
    »»»
    «««flow
    ELT: Source -> Extract -> Load raw -> Warehouse/Lakehouse -> Transform in place (SQL, dbt, Spark) -> Clean models
    »»»

    ## Side by side
    | | ETL | ELT |
    |---|---|---|
    | Where transforms run | Separate ETL engine or Spark cluster | Inside the warehouse/lakehouse |
    | Raw data in destination | No (only clean) | Yes |
    | Re-transform after a logic change | Re-extract from source (if still available) | Re-run SQL on raw already loaded |
    | Time to first data | Slower (build transforms first) | Faster (load first, model later) |
    | Sensitive data | Can be masked/removed **before** it lands | Lands raw, must be protected inside |
    | Who can build transforms | ETL specialists | Anyone who knows SQL (analytics engineers) |
    | Cost driver | ETL licences and servers | Warehouse compute |
    | Typical tools | Informatica, SSIS, DataStage, Talend, custom Python/Spark | Fivetran/Airbyte + dbt + Snowflake/BigQuery/Databricks |

    ## When to choose ETL
    - **Data must not land raw** in the destination: personal or regulated data that must be masked, filtered or encrypted first; export-controlled data.
    - **Heavy non-SQL processing:** parsing binary files, images, complex Python logic, ML scoring, before it is useful.
    - **Destination is weak or expensive** for transformation (an operational database, an older appliance, a SaaS app as target: "reverse ETL").
    - **Huge raw volume that is mostly noise**: filter at the edge (e.g. downsample sensor data) to avoid paying to store and scan it.

    ## When to choose ELT
    - Modern cloud warehouse or lakehouse with elastic compute.
    - Requirements change often; you want raw history to re-model.
    - Transformations are mostly relational (joins, aggregations, dedupe), which SQL does well.
    - You want analysts and analytics engineers to own business logic in version-controlled SQL.

    ## The real answer: most companies use both
    In a lakehouse the line blurs. A typical flow is **EtLT**: extract, a *light* transform (mask PII, fix encoding, add metadata), load to bronze, then heavy transforms inside the platform with Spark or SQL. Saying "it is a spectrum and here is where I would draw the line, and why" is the senior answer.

    ## Edge cases and what goes wrong
    - **ELT cost surprises:** every dbt run scans full raw tables because models are not incremental; the warehouse bill doubles. Fix: incremental models, partition pruning, clustering.
    - **Raw PII in ELT:** analysts get access to the raw schema "temporarily". Fix: restrict raw layers, mask in staging models, tag PII columns.
    - **ETL logic hidden in a GUI tool:** nobody can diff or test it; the person who built it left. Fix: version control and documented mappings.
    - **Source no longer has the history:** with ETL you threw away raw; a logic bug means you cannot rebuild last year. ELT's raw retention protects you.
    - **Transformation in two places:** half the logic in the ETL tool, half in warehouse views. Debugging becomes archaeology. Pick a clear boundary.

    ## At scale
    - ELT on billions of rows needs **incremental** transformations (process new partitions only, MERGE changes) and good layout (partitioning, clustering).
    - ETL at scale moves to distributed engines (Spark) rather than single ETL servers, which is really "ELT into the lake, then Spark transforms": the categories merge.
    - Cost governance becomes a design input: who pays for transformation compute, and how do you stop runaway queries?

    ## How interviewers test this
    - "ETL or ELT, which is better?" Never pick one blindly. Explain where the transform runs, then the deciding factors: compliance, transformation type, platform compute, change frequency, team skills.
    - "Why did the industry move to ELT?" Cheap storage, elastic MPP compute, SQL tooling like dbt, keeping raw for replay.
    - "Where would you mask PII?" As early as possible: in the light transform before landing, or in the first staging layer with raw access tightly restricted.
  `, {
    check: [
      mcq('Personal data must be masked **before** it is stored anywhere in the analytics platform. Which approach fits?', ['Pure ELT: load raw, mask later in a view', 'ETL (or a light transform before load): mask in the extraction step, then load', 'Load raw and trust permissions', 'It does not matter'], 1, 'If the requirement is "never land raw", the transformation must happen before the load.'),
      mcq('What made ELT practical at scale?', ['Faster laptops', 'Cheap object storage plus elastic, massively parallel compute inside cloud warehouses and lakehouses, and SQL tooling like dbt', 'The end of SQL', 'Smaller data volumes'], 1, 'Economics changed: storing raw became cheap and the destination became the strongest compute.'),
      tf('With ELT, a bug in business logic found three months later can usually be fixed by re-running transformations over raw data already in the platform.', true, 'Raw retention is one of ELT\'s biggest advantages.'),
      multi('Which are risks specific to ELT?', ['Raw sensitive data sitting in the warehouse', 'Rising compute bills from repeatedly transforming full raw tables', 'Losing raw history', 'Business logic scattered across many SQL models without tests'], [0, 1, 3], 'Losing raw history is an ETL risk; ELT keeps raw by design.'),
    ],
    scenarios: [
      scenario('The warehouse bill', `
        Since the team moved to ELT with dbt, the monthly warehouse bill has tripled. 40 dbt models run every hour. Most rebuild their whole table from the raw layer each run. Raw tables hold 3 years of data.`, [
        ['What is the main cause?', [
          ['Full rebuilds: every hourly run rescans 3 years of raw data to change a few hours of it', true, 'Classic ELT cost trap.'],
          ['dbt is an expensive tool', false, 'dbt itself is not where the compute bill comes from; queries are.'],
          ['There are too many columns', false, 'Not the main driver here.'],
        ]],
        ['What is the best fix?', [
          ['Make large models incremental (process only new/changed partitions with MERGE), partition raw by date, and run only what changed', true, 'Cost now scales with change, not with history.'],
          ['Go back to ETL', false, 'Throws away the benefits; the problem is design, not the pattern.'],
          ['Run everything daily instead of hourly', false, 'Cuts cost but may break freshness needs, and still rescans everything.'],
        ]],
        ['What guardrail keeps it under control?', [
          ['Per-model cost/runtime monitoring, query timeouts, and a resource monitor/budget alert on the warehouse', true, 'You cannot manage what you do not measure.'],
          ['Ask engineers to be careful', false, 'Not a control.'],
          ['Give everyone the largest warehouse size', false, 'Makes it worse.'],
        ]],
      ], 'ELT moves the compute bill into the warehouse. Incremental models and cost monitoring are part of the design.'),
    ],
    interview: [
      talk('ETL vs ELT: explain the difference and when you would choose each.', `
        - **Difference:** where the transformation runs. ETL transforms in a separate engine and loads only finished data. ELT loads raw first and transforms inside the warehouse/lakehouse with its compute.
        - **Why ELT won by default:** cheap storage, elastic MPP compute, dbt-style versioned SQL, raw kept for replay, faster onboarding.
        - **Choose ETL (or a light pre-load transform) when:** data must not land raw (PII, export-controlled), processing is not SQL-shaped (files, images, ML scoring), the destination cannot transform efficiently, or raw volume is mostly noise worth filtering at the edge.
        - **Watch-outs for ELT:** compute cost (use incremental models), raw PII exposure (restrict and mask early), logic sprawl (tests, docs).
        - **Reality:** most platforms are hybrid (EtLT); the skill is choosing the boundary consciously.`),
    ],
    hands: [
      sql({ q: 'An **ELT** transformation done in SQL inside the warehouse: from the raw feed, count how many **distinct orders were created per day**. Use the date part of «updated_at» on «CREATED» events, and do not let duplicate deliveries inflate the count. Return «day, orders_created» sorted by «day».', tables: ['raw_orders_feed'], level: 1,
        solution: `SELECT date(updated_at) AS day, COUNT(DISTINCT order_id) AS orders_created
FROM raw_orders_feed
WHERE status = 'CREATED'
GROUP BY date(updated_at)
ORDER BY day;`,
        hint: 'Filter status = \'CREATED\', group by date(updated_at), and count DISTINCT order_id so duplicate events do not count twice.' }),
    ],
  }),

  // ================================================================== Batch vs stream
  batchstream: T(`
    > **In one line:** **batch** processing collects data and processes it in chunks on a schedule (every hour, every night). **Stream** processing handles each event (or tiny group of events) continuously as it arrives. Batch optimises for simplicity, completeness and cost; streaming optimises for low latency.

    ## The problem it solves
    Finance's monthly report does not care if a claim appears 6 hours late. An engine overheating does: a warning 6 hours late is useless. Different questions tolerate different delays, and the delay you need decides how you process.

    ## Batch: how it works
    - Data accumulates in a source or landing zone.
    - A scheduled job (or a trigger when a file lands) reads a **bounded** chunk: "all claims updated yesterday".
    - It processes the whole chunk, writes results, and stops.
    - Because the input is complete and fixed, the logic is simple: sort, join, aggregate across the whole day; re-run the same chunk to get the same answer.

    ## Streaming: how it works
    - Events flow continuously into a log such as Kafka (topics split into partitions, each event with an offset).
    - A stream processor (Spark Structured Streaming, Flink, Kafka Streams) reads them **as they arrive**, often in micro-batches of a few seconds or event by event.
    - Input is **unbounded**: there is no "end of the day" to wait for, so the processor must decide **when** a result is final.
    - It keeps **state** between events (running counts, open windows, last value per key), checkpoints that state and its read position so it can recover after a crash without losing or double-counting.

    ## The concepts streaming forces on you
    | Concept | Meaning | Why it matters |
    |---|---|---|
    | **Event time vs processing time** | When it happened vs when the system saw it | A reading from 10:00 can arrive at 10:07 (network, buffering). Aggregating by processing time puts it in the wrong window. |
    | **Windows** | Group events by time: tumbling (fixed, non-overlapping), sliding (overlapping), session (gaps of inactivity) | "Average temperature per engine per 5 minutes" needs a window. |
    | **Watermark** | "I assume no events older than X will still arrive" | Lets the engine close windows and drop state. Too short drops late data; too long uses memory and delays results. |
    | **Late data** | Events older than the watermark | Dropped, sent to a side output, or handled by a batch correction. |
    | **State** | Data the processor remembers between events | Must be bounded (watermarks, timeouts) or memory grows forever. |
    | **Checkpointing** | Saving offsets and state durably | Enables recovery after failure. |
    | **Delivery semantics** | At-most-once, at-least-once, exactly-once | Decides whether a crash loses or duplicates events. |
    | **Backpressure** | Input arrives faster than processing | Lag grows; the system must slow intake or scale out. |

    ## Side by side
    | | Batch | Streaming |
    |---|---|---|
    | Input | Bounded (a day, a file) | Unbounded |
    | Latency | Minutes to hours | Milliseconds to seconds |
    | Complexity | Lower | Higher (state, time, ordering, recovery) |
    | Correctness with late data | Easy (wait, then process) | Needs watermarks and policies |
    | Cost | Run then stop; cheap | Always-on compute |
    | Reprocessing | Re-run the chunk | Replay the log or backfill from storage |
    | Debugging | Re-run with the same input | Harder; input keeps moving |
    | Typical tools | Spark, SQL/dbt, Airflow | Kafka + Spark Structured Streaming / Flink / Kafka Streams |

    ## Micro-batch vs true streaming
    - **Micro-batch** (Spark Structured Streaming default): process whatever arrived in the last N seconds as a small batch. Latency of roughly seconds; simpler and high-throughput.
    - **Continuous / per-event** (Flink, Kafka Streams): process each event immediately; latency in milliseconds; more complex state handling.
    Most data-engineering use cases are fine with seconds.

    ## When to choose which
    Ask: **what happens if the data is X minutes late?**
    - Nothing bad for hours → **batch**. Most reporting, finance, monthly KPIs, model training.
    - Money or safety lost within minutes → **streaming**. Fraud checks, overheating alerts, live operations, stock levels for online ordering.
    - In between (15-60 minutes is fine) → **frequent small batches** or incremental processing; far cheaper and simpler than streaming.
    A common senior insight: **teams over-choose streaming**. "Real-time dashboard" requests often mean "updated every 15 minutes", which a micro-batch or hourly incremental job serves at a fraction of the cost.

    ## Streaming and batch together
    Real platforms mix them: sensor events stream into bronze in near real time and drive alerts; silver/gold aggregates are recomputed in batch (or incrementally) and corrected for late data; ML training reads the batch tables. Lakehouse tables (Delta/Iceberg) can be a streaming sink and a batch source at the same time.

    ## Edge cases and what goes wrong
    - **Duplicates on retry:** a consumer processes events, crashes before committing its offset, restarts and reprocesses them. Without idempotent sinks or exactly-once, counts inflate.
    - **Out-of-order events** per key: an "engine stopped" event arrives before "engine started". Order is guaranteed only within a Kafka partition, so key by engine.
    - **Unbounded state:** a stream deduplicates by event_id with no watermark; state grows until the job crashes days later.
    - **Watermark too strict:** a dealer's app buffers events offline; they arrive 2 hours late and are silently dropped. Monitor the dropped-late count.
    - **Batch midnight bugs:** a nightly batch processes "yesterday" but events still arriving after midnight for yesterday are missed. Reprocess a lookback window (e.g. last 3 days) idempotently.
    - **Reprocessing a stream:** a logic bug means you must recompute history. If Kafka keeps only 7 days, you replay from the bronze table instead. Keep bronze.

    ## At scale
    - Batch scales by parallelism and partition pruning; cost grows with data scanned.
    - Streaming scales by partitions: Kafka topic partitions cap consumer parallelism (one consumer per partition per group). Choosing partition counts and keys is a capacity decision.
    - Always-on streaming clusters cost money 24/7; batch clusters can shut down.

    ## How interviewers test this
    - "When would you use streaming?" Answer with the business cost of delay, then mention the extra complexity you take on (state, late data, exactly-once).
    - "What is a watermark?" Define it, explain the trade-off (late data vs memory and latency).
    - "How do you handle late data in batch?" Lookback window, idempotent overwrite of affected partitions.
  `, {
    check: [
      mcq('A sensor reading has «ts = 10:00:05» but reaches the processor at 10:06:40. Which time should a "5-minute average temperature" window use?', ['Processing time, because it is when we saw it', 'Event time, because the reading belongs to 10:00-10:05', 'Whichever is later', 'Neither: drop the reading'], 1, 'Analytics about the engine\'s behaviour must use when it happened. A watermark decides how long to wait for such late readings.'),
      mcq('What does a watermark of 10 minutes trade off?', ['Accuracy vs SQL syntax', 'Waiting longer for late events (more complete, more state, later results) vs closing windows sooner (less memory, faster, may drop late data)', 'Batch vs streaming', 'Kafka vs Spark'], 1, 'Every watermark choice is this trade-off.'),
      tf('A dashboard that must be "real-time" always needs a streaming pipeline.', false, 'Ask what delay is acceptable. "Every 15 minutes" is usually met far more cheaply with frequent incremental batches.'),
      mcq('A streaming job deduplicates by «event_id» with no watermark or time limit. What happens over weeks?', ['Nothing', 'State grows without bound until memory runs out', 'Duplicates increase', 'Latency drops'], 1, 'Streaming state must be bounded, usually with a watermark.'),
      match('Match the window type.', [['Tumbling', 'Fixed, non-overlapping: 10:00-10:05, 10:05-10:10'], ['Sliding', 'Fixed length, overlapping: 5-minute windows every 1 minute'], ['Session', 'Closes after a gap of inactivity']], 'Choose the window to match the question.'),
    ],
    scenarios: [
      scenario('The "real-time" request', `
        The service manager wants a "real-time dashboard" of open service requests per region. You find out they look at it twice a day in team meetings, and the source CRM updates are fine to see within 15 minutes.`, [
        ['What do you propose?', [
          ['An incremental batch job every 15 minutes feeding the dashboard, with "data as of" shown', true, 'Meets the real need at a fraction of the cost and complexity of streaming.'],
          ['Kafka plus a streaming job with sub-second latency', false, 'Over-engineering: always-on cost and complexity for no business gain.'],
          ['A nightly batch', false, 'Too slow for a meeting at 14:00 about the morning\'s requests.'],
        ]],
        ['Six months later they add "alert technicians within 1 minute when a critical engine fault code arrives". Now?', [
          ['Stream that specific event flow (fault codes) to an alerting job; keep the dashboard on 15-minute batches', true, 'Use streaming only where the latency need is real.'],
          ['Convert every pipeline to streaming', false, 'Most of them still do not need it.'],
          ['Run the batch every minute', false, 'Fragile and wasteful for a per-event alert.'],
        ]],
        ['What must the alert stream handle?', [
          ['Duplicates (do not page twice), out-of-order events per engine, and recovery after a crash without missing alerts', true, 'Idempotent alerting, keyed partitions, checkpointing.'],
          ['Only speed', false, 'A fast alert that fires twice or misses events after a restart will be ignored.'],
          ['Nothing special', false, 'Streaming always brings these concerns.'],
        ]],
      ], 'Choose latency from business impact. Mixing batch and streaming is normal.'),
    ],
    interview: [
      talk('Batch vs streaming: how do you decide, and what extra problems does streaming bring?', `
        - **Decide by the cost of delay:** if data being an hour late changes nothing, batch. If minutes cost money or safety, stream. In between, frequent incremental batches.
        - **Streaming brings:** unbounded input, event time vs processing time, windows, watermarks and late data, state management and its size, checkpointing and recovery, delivery semantics (duplicates or loss on failure), ordering only per partition, backpressure and lag, always-on cost, harder debugging and reprocessing.
        - **How I handle them:** key by entity for ordering, event-time windows with a watermark sized from measured lateness, idempotent or transactional sinks (MERGE or Delta with checkpoints) for exactly-once results, bounded state, lag and dropped-late metrics with alerts, bronze retained for replay.
        - **Example:** Turbofan project: Kafka → Spark Structured Streaming → Delta, with checkpoints, deduplication and a proof that killing the job mid-stream causes no duplicates.`),
    ],
    hands: [
      py({ q: 'Write «tumbling_counts(events, size)» that counts events per **tumbling window** of «size» seconds using **event time**. Each event is a dict with «ts» (seconds, int). Return a dict «{window_start: count}» where «window_start = ts - ts % size». Events can arrive **out of order**; the result must not depend on arrival order.', starter: 'def tumbling_counts(events, size):\n    pass\n',
        tests: `ev = [{'ts': 12}, {'ts': 3}, {'ts': 9}, {'ts': 10}, {'ts': 25}, {'ts': 0}]
assert tumbling_counts(ev, 10) == {0: 3, 10: 2, 20: 1}, tumbling_counts(ev, 10)
assert tumbling_counts(list(reversed(ev)), 10) == {0: 3, 10: 2, 20: 1}
assert tumbling_counts([], 5) == {}
assert tumbling_counts([{'ts': 59}, {'ts': 60}], 60) == {0: 1, 60: 1}`,
        solution: `def tumbling_counts(events, size):
    out = {}
    for e in events:
        start = e['ts'] - e['ts'] % size
        out[start] = out.get(start, 0) + 1
    return out` }),
    ],
  }),

  // ================================================================== Real-time vs near-real-time
  realtime: T(`
    > **In one line:** "real-time" is a **latency promise**, not a technology. **Hard real-time** means milliseconds with guarantees (machine control). **Real-time** in data usually means sub-second to a few seconds. **Near-real-time** means seconds to minutes. Most business "real-time" requests are really near-real-time, and the gap between them is worth a lot of money and complexity.

    ## The problem it solves
    People say "real-time" to mean anything from "this second" to "today". If you build to the wrong meaning you either fail the business or burn money on infrastructure nobody needed. A data engineer's job is to turn the word into a **number**: "data visible within N seconds/minutes of the event, P% of the time".

    ## The latency ladder
    | Class | Typical latency | Examples | Typical approach |
    |---|---|---|---|
    | Hard real-time | Microseconds-milliseconds, guaranteed | Engine control unit, braking | Embedded systems, not data platforms |
    | Real-time (soft) | < 1 s | Fraud check at payment, live recommendations | Stream processing, in-memory stores |
    | Near-real-time | Seconds to ~15 min | Fleet monitoring dashboard, alerting on fault codes, stock levels | Streaming micro-batches, frequent incremental loads, CDC |
    | Frequent batch | 15 min to hours | Operational reports, service backlog | Scheduled incremental jobs |
    | Daily batch | Next morning | Finance, KPIs, model training | Nightly pipelines |

    ## Where latency comes from (end to end)
    The number that matters is **end-to-end latency**: from the moment something happens to the moment a person or system can act on it. Every hop adds delay:
    «««flow
    Event happens -> Device buffers/sends -> Network -> Ingest (Kafka) -> Processing (micro-batch interval, windows, watermark) -> Write to table -> Query/dashboard refresh -> Human notices
    »»»
    - A streaming job with 2-second micro-batches feeding a dashboard that refreshes every 10 minutes is a **10-minute** system.
    - A 5-minute window plus a 10-minute watermark means aggregates finalise about 15 minutes after the window starts.
    - Devices that buffer offline add hours for some events no matter how fast the pipeline is.
    So measure and design the **whole path**, not one component.

    ## How to measure it
    Carry timestamps through the pipeline: «event_ts» (at source), «ingested_ts» (arrival), «processed_ts» (written). Then:
    - **Freshness** = now − max(event_ts) in the table: "how old is the newest data?"
    - **Lag per record** = processed_ts − event_ts; report p50, p95, p99, not the average (a few slow records hide in an average).
    - **Consumer lag** in Kafka = latest offset − committed offset: how far behind the processor is.
    Express the requirement as an SLO: "95% of readings visible in the dashboard within 60 s of the event".

    ## Cost and complexity rise steeply as latency falls
    - Going from daily to hourly: same tools, more runs. Cheap.
    - Hourly to 5 minutes: incremental processing, CDC, more orchestration overhead. Moderate.
    - 5 minutes to seconds: streaming infrastructure, always-on compute, state, exactly-once concerns, on-call for 24/7 systems. Expensive.
    - Seconds to milliseconds: specialised in-memory systems, careful engineering of every hop. Very expensive.
    Every step down the ladder should be justified by **what the business can do with fresher data**.

    ## Trade-offs: freshness vs correctness vs cost
    - **Freshness vs completeness:** the faster you publish, the more likely late events are missing. Near-real-time numbers are often **provisional** and later corrected by batch. Label them.
    - **Freshness vs consistency:** a live dashboard may show orders before their invoices arrive, so ratios temporarily look wrong.
    - **Freshness vs cost:** always-on clusters, more frequent small writes (small files to compact), more monitoring.

    ## Edge cases and what goes wrong
    - **Clock skew:** device clocks are wrong (time zone not set, battery reset to 1970). Event-time logic puts readings in impossible windows. Validate timestamps against a sane range; keep ingest time too.
    - **Average latency looks fine, tail is terrible:** p50 = 3 s, p99 = 20 min because one partition is skewed. Watch percentiles per partition.
    - **"Real-time" dashboards on a warehouse with caching:** the BI tool caches for an hour; the pipeline's speed is wasted.
    - **Alert storms:** a near-real-time alert fires on every reading above a threshold; one hot engine pages someone 600 times an hour. Add deduplication and cooldowns.
    - **Freshness checks that lie:** "max(ingested_ts) is recent" passes even when one source stopped and the others continue. Check freshness **per source / per partition**.

    ## In a real company pipeline
    Apex Engines' telemetry:
    - Readings stream from engines to Kafka; a Spark Structured Streaming job writes them to a bronze Delta table every 10 s (near-real-time).
    - A fault-code stream raises alerts within ~30 s end-to-end, with deduplication per engine and fault.
    - The fleet dashboard reads a silver table refreshed every minute and shows "data as of".
    - Daily batch recomputes gold health scores including late readings: the authoritative numbers.

    ## How interviewers test this
    - "The business wants real-time data. What do you ask?" What decision is made with it, how fast must it happen, what is the cost of being late by 1 min/15 min/1 h, who watches it, what volume, what accuracy is acceptable for provisional numbers.
    - "How would you measure latency?" End-to-end, with timestamps at each hop, as percentiles and freshness per source.
  `, {
    check: [
      mcq('A streaming job writes every 2 seconds. The BI dashboard on top refreshes every 10 minutes. What is the effective end-to-end latency for a user?', ['2 seconds', 'Up to about 10 minutes', '12 seconds', 'It depends on Kafka only'], 1, 'End-to-end latency is set by the slowest hop.'),
      mcq('Which is the best way to state a latency requirement?', ['"Real-time"', '"As fast as possible"', '"95% of readings visible in the dashboard within 60 seconds of the event"', '"Using Kafka"'], 2, 'A measurable SLO with a percentile can be built, tested and monitored.'),
      tf('Reporting the average processing lag is enough to know whether a near-real-time pipeline meets its target.', false, 'Averages hide the tail. Use p95/p99, and check per source or partition.'),
      multi('Which are usually true as you push latency from hourly to seconds?', ['Infrastructure must run all the time', 'Numbers may be provisional and corrected later', 'Small-file and state management problems appear', 'The pipeline becomes simpler'], [0, 1, 2], 'Lower latency almost always costs more and adds complexity.'),
    ],
    interview: [
      talk('A stakeholder asks for real-time data. How do you respond?', `
        - Turn the word into a number: "What decision will you make with it, and how soon after the event must you see it? What happens if it is 1 minute, 15 minutes or 1 hour late?"
        - Clarify accuracy: are provisional numbers acceptable, corrected later?
        - Propose the cheapest design that meets it: often 5-15 minute incremental loads; streaming only for paths with a true seconds-level need (alerts).
        - Define an SLO (p95 end-to-end latency, freshness per source) and how it is monitored and shown ("data as of" on the dashboard).
        - Mention cost and support: streaming is always-on and needs on-call.`),
    ],
    hands: [
      sql({ q: 'Measure **ingestion lag** on the raw feed: the minutes between «updated_at» (when the change happened) and «ingested_at» (when the pipeline received it). Return «avg_lag_min» (rounded to 1 dp), «max_lag_min» (rounded to 1 dp) and «late_events»: how many events took **more than 30 minutes**. Tip: in SQLite, «(julianday(a) - julianday(b)) * 1440» gives minutes.', tables: ['raw_orders_feed'], level: 2,
        solution: `SELECT ROUND(AVG((julianday(ingested_at) - julianday(updated_at)) * 1440), 1) AS avg_lag_min,
       ROUND(MAX((julianday(ingested_at) - julianday(updated_at)) * 1440), 1) AS max_lag_min,
       SUM(CASE WHEN (julianday(ingested_at) - julianday(updated_at)) * 1440 > 30 THEN 1 ELSE 0 END) AS late_events
FROM raw_orders_feed;`,
        hint: 'Compute the lag expression once in your head, then wrap it in AVG, MAX and SUM(CASE WHEN … > 30 THEN 1 ELSE 0 END).' }),
    ],
  }),
};
