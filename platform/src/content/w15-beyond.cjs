// "Beyond DE 1": depth past the junior bar. Each lesson belongs to a module (see modules.cjs).
const { learn, mcq, tf, multi, match, order, py, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('beyond', 'Beyond DE 1', 'depth past the junior bar',
  'Topics that separate a strong DE 1 from the rest: reading Spark plans, running Kafka and Airflow in production, advanced modelling, testing pipelines, schema evolution and cost.',
  [
    // ------------------------------------------------------------------ Spark
    lesson('y1', 'Spark: reading query plans and running Delta Lake', 25, [
      learn('Read the plan before you tune', `
        «df.explain()» prints how Spark will run your query. Read it **bottom-up**: data is read at the bottom, results come out at the top.

        | In the plan | Means | Watch for |
        |---|---|---|
        | «FileScan parquet … PushedFilters» | reading files, filters pushed into the scan | filters missing here = reading too much |
        | «PartitionFilters» | whole folders skipped | empty when you filter on a partition column = no pruning |
        | «Exchange hashpartitioning» | a **shuffle** (data moves between machines) | every Exchange costs network + disk |
        | «BroadcastHashJoin» | small table copied to every executor | good for small dimension tables |
        | «SortMergeJoin» | both sides shuffled and sorted | normal for big-big joins |

        **Typical fixes:** filter and select columns early, broadcast small tables («F.broadcast(dim)»), partition by what you filter on, avoid «collect()» on big data.
      `),
      learn('Delta Lake operations you will be asked about', `
        | Operation | What it does | When |
        |---|---|---|
        | «MERGE INTO» | update + insert (+ delete) in one atomic step | incremental loads, CDC, SCD |
        | «OPTIMIZE» | compacts many small files into fewer big ones | after streaming or frequent small writes |
        | «ZORDER BY (col)» / liquid clustering | co-locates similar values in files | columns you filter on that aren't partitions |
        | «VACUUM» | deletes files no longer referenced | storage cost; removes old versions for time travel |
        | «DESCRIBE HISTORY» | every commit: who, what, row counts | debugging, audits |
        | «VERSION AS OF n» | time travel: read the table as it was | recover from a bad load |

        **The small-files problem:** streaming every 5 seconds creates thousands of tiny files; each file costs a read. Compact on a schedule.
        **A MERGE rewrites every file holding a matched row.** Many scattered small changes can rewrite the whole table (real example: build-log Phase 11 of the NHTSA project).
      `),
      mcq('The plan shows «Exchange hashpartitioning(customer_id)» before a join. What is happening?', ['A filter on customer_id', 'Data is being shuffled across the cluster by customer_id so matching keys meet', 'A broadcast join', 'Files are being compacted'], 1),
      mcq('You filter a table on «event_date», which is its partition column, but the plan shows «PartitionFilters: []». Most likely cause?', ['Delta is broken', 'The filter wraps the column in a function or compares to the wrong type, so Spark cannot prune partitions', 'Partitioning only works on numbers', 'You need to call cache()'], 1, 'E.g. «to_date(event_date) = …» or comparing a string to a date. Filter on the raw partition column.'),
      match('Match the problem to the Delta operation.', [['Thousands of tiny files slow every read', 'OPTIMIZE'], ['A bad load overwrote yesterday\'s data', 'Time travel (VERSION AS OF)'], ['Apply inserts and updates atomically', 'MERGE'], ['Storage keeps growing with old versions', 'VACUUM']]),
      scenario('A join job got 10x slower', 'A daily job joins a 2-billion-row fact table to a 50,000-row dimension. It used to take 8 minutes; today it took 80.', [
        ['What do you check first?', [
          ['The plan and the Spark UI: did the join switch from broadcast to sort-merge, and is one task much slower than the others (skew)?', true, 'Plan + stage timeline tell you where time went before you change anything.'],
          ['Double the cluster size', false, 'Expensive and may not help if one skewed key is the problem.'],
        ]],
        ['The dimension grew past the broadcast threshold, so Spark stopped broadcasting. Fix?', [
          ['Broadcast it explicitly with F.broadcast(dim), since 50k rows easily fit in memory', true, 'Or raise spark.sql.autoBroadcastJoinThreshold deliberately.'],
          ['Repartition the fact table to 10,000 partitions', false, 'More shuffle, not less.'],
        ]],
      ]),
    ]),
    // ------------------------------------------------------------------ Kafka
    lesson('y2', 'Kafka in production: lag, rebalancing, schemas, retention', 25, [
      learn('What breaks in real Kafka systems', `
        - **Consumer lag** = latest offset in the partition − offset the consumer group has committed. Growing lag means consumers can't keep up. It's the #1 metric to alert on.
        - **Rebalancing:** when a consumer joins, leaves or is too slow to poll («max.poll.interval.ms»), the group stops and reassigns partitions. Frequent rebalances = stalls. Causes: slow processing per batch, crashes, autoscaling flapping.
        - **Parallelism is capped by partitions:** a group can have at most one active consumer per partition. 6 partitions → at most 6 consumers doing work.
        - **Ordering is per partition only.** Same key → same partition → ordered. Changing the partition count changes which partition a key goes to.
        - **Poison messages:** one record that always fails can block a partition forever. Send it to a dead-letter topic after N retries.
      `),
      learn('Retention, compaction and schemas', `
        | Setting | Meaning | Use for |
        |---|---|---|
        | «retention.ms» | delete messages older than X | event streams (replay window) |
        | «cleanup.policy=compact» | keep only the **latest value per key** | state/changelog topics (e.g. latest engine status) |

        **Schema registry + Avro/Protobuf:** producers register a schema; consumers fetch it by id. Compatibility rules stop breaking changes:
        - **Backward compatible:** new consumers can read old data (e.g. adding a field **with a default**).
        - **Forward compatible:** old consumers can read new data.
        - Removing a required field or changing a type breaks consumers.

        **Sizing partitions:** aim for each partition to handle a comfortable throughput (often ~5-10 MB/s), then add headroom for consumer parallelism and growth. Too many partitions cost broker memory and recovery time.
      `),
      mcq('Lag on one partition keeps growing; the other 5 are near zero. Most likely?', ['The broker is down', 'A hot key: one key gets far more traffic, and it all lands in one partition', 'Retention is too short', 'The topic needs compaction'], 1),
      mcq('Your group has 6 partitions. You scale to 10 consumers. What happens?', ['Throughput rises ~66%', '6 consumers get partitions, 4 sit idle', 'Kafka creates 4 more partitions', 'Rebalancing fails'], 1),
      tf('Adding a new optional field with a default value to an Avro schema is backward compatible.', true, 'New readers fill the default for old records.'),
      multi('Which are good reasons to use a compacted topic?', ['Keep the latest status of each engine', 'Store every sensor reading for 7 days of replay', 'A changelog to rebuild a lookup table', 'Audit trail of every change'], [0, 2], 'Compaction keeps the last value per key; it is not for full history.'),
      scenario('Consumers keep rebalancing', 'A consumer group rebalances every few minutes and throughput collapses. Each poll returns 500 records and processing calls a slow external API.', [
        ['Why are they rebalancing?', [
          ['Processing 500 records takes longer than max.poll.interval.ms, so Kafka thinks the consumer died', true, 'The group kicks it out, reassigns, and it repeats.'],
          ['The topic has too many partitions', false, 'Not the cause here.'],
        ]],
        ['Best fix?', [
          ['Smaller batches (max.poll.records) and/or make the API calls async and bounded, plus alert on lag', true, 'Keep each poll loop well inside the interval.'],
          ['Set max.poll.interval.ms to 24 hours', false, 'Hides real failures: a dead consumer would hold partitions for a day.'],
        ]],
      ]),
    ]),
    // ------------------------------------------------------------------ Airflow
    lesson('y3', 'Airflow in production: idempotent tasks, backfills, sensors, SLAs', 25, [
      learn('Rules for production DAGs', `
        1. **Tasks are idempotent:** running a task twice for the same logical date gives the same result (overwrite that date's partition, MERGE on keys; never blind appends).
        2. **Use the logical date** («{{ ds }}», «data_interval_start/end»), never «now()». A re-run of last Tuesday must process last Tuesday.
        3. **Airflow orchestrates, it doesn't compute:** heavy work runs in Spark/SQL/containers; Airflow triggers and watches.
        4. **XCom is for small metadata** (a path, a count), never datasets.
        5. **Retries for transient errors** (network), with backoff; «retries=0» for data-quality gates (a bad file won't fix itself).
      `),
      learn('Backfills, sensors, SLAs and dynamic tasks', `
        | Feature | Use |
        |---|---|
        | «catchup=True» / «airflow dags backfill -s … -e …» | run past dates (only safe if tasks are idempotent and use the logical date) |
        | «max_active_runs=1» | when runs must happen in order (e.g. applying daily snapshots) |
        | Sensors («deferrable=True» / reschedule mode) | wait for a file or upstream table without holding a worker slot |
        | Pools | limit concurrency on a shared resource (e.g. 2 Spark jobs at a time) |
        | SLAs / on_failure_callback | alert when a run is late or fails |
        | Dynamic task mapping («.expand()») | one task per item discovered at runtime (e.g. per file) |
        | Datasets / data-aware scheduling | run a DAG when an upstream table is updated, not on a clock |
      `),
      mcq('A task does «INSERT INTO sales SELECT * FROM staging» every run. You re-run yesterday after a failure. Result?', ['Correct data', 'Duplicate rows for yesterday', 'Airflow blocks the re-run', 'The table is dropped'], 1, 'Make it idempotent: delete/overwrite that date\'s partition first, or MERGE on a key.'),
      mcq('A sensor waits up to 6 hours for a partner file and you have only 16 worker slots. Best setting?', ['poke mode with a 1-second interval', 'Deferrable sensor (or reschedule mode) so it frees the slot while waiting', 'Remove the sensor and hope the file is there', 'Increase retries to 100'], 1),
      order('Put a safe backfill in order.', ['Confirm every task is idempotent and uses the logical date', 'Check downstream consumers can handle reprocessed data', 'Backfill a small date range and verify row counts', 'Run the full range with limited concurrency (max_active_runs / pools)', 'Reconcile totals against the source']),
      talk('*"How do you design an Airflow DAG so it is safe to re-run?"*', `
        - Each task is idempotent for its logical date: overwrite the date's partition or MERGE on keys.
        - Everything is parameterised by the logical date, nothing uses now().
        - Heavy compute runs outside Airflow; XCom only carries small metadata.
        - Retries with backoff for transient errors; quality gates fail fast without retries.
        - Backfills are tested on a small range first, run with limited concurrency, and reconciled.
      `),
    ]),
    // ------------------------------------------------------------------ Modelling
    lesson('y4', 'Advanced modelling: Data Vault, one big table, snapshots, bridges', 25, [
      learn('Beyond the basic star schema', `
        | Pattern | What it is | Good for | Cost |
        |---|---|---|---|
        | **Star schema** | facts + dimensions | BI, most analytics | needs modelling up front |
        | **One Big Table (OBT)** | everything pre-joined into one wide table | dashboards, ML features, simple tools | duplication; hard to change dimensions |
        | **Data Vault** | hubs (keys), links (relationships), satellites (attributes over time) | many changing sources, full auditability | many joins; usually a raw layer *under* a star |
        | **Periodic snapshot fact** | one row per entity per period (e.g. inventory per day) | balances, levels | grows with entities × days |
        | **Accumulating snapshot** | one row per process, a date per milestone | pipelines like order → ship → deliver | rows are updated |
        | **Bridge table** | resolves many-to-many (e.g. a claim with many parts) | correct counts without double counting | one more join |
      `),
      learn('Physical design choices', `
        - **Grain first.** State it in one sentence: "one row per claim per component".
        - **Partition** big tables by what queries filter on most (usually a date), with partitions large enough (hundreds of MB+). Over-partitioning creates small files.
        - **Cluster / Z-order** by high-cardinality filter columns (customer_id, engine_id).
        - **Surrogate keys:** sequences, or hashes of the natural key (stable across rebuilds).
        - **Late-arriving dimensions:** insert an "unknown/placeholder" dimension row and update it when the real data arrives, so facts never get lost.
      `),
      mcq('A claim can involve several parts, and you need "total claim amount by part category" without double counting. What do you add?', ['A bigger fact table', 'A bridge table between claims and parts (with an allocation weight if amounts are split)', 'An OBT', 'An index'], 1),
      match('Match the need to the pattern.', [['Dozens of sources, full history, auditors ask who changed what', 'Data Vault'], ['A dashboard tool that cannot do joins', 'One Big Table'], ['Stock level per plant per day', 'Periodic snapshot fact'], ['Track a claim from submission to credit note', 'Accumulating snapshot']]),
      tf('Partitioning a 50 GB table by customer_id (2 million customers) is a good idea.', false, 'Millions of tiny partitions = small-files problem. Partition by date; cluster by customer_id.'),
    ]),
    // ------------------------------------------------------------------ Testing (hands-on Python)
    lesson('y5', 'Testing pipelines: unit tests, data tests and reconciliation', 25, [
      learn('Three layers of tests', `
        | Layer | Tests | Example |
        |---|---|---|
        | **Unit tests** | pure transformation functions, fast, no database | "dedupe keeps the latest record per key" |
        | **Data tests / contracts** | the data itself, on every run | "order_id unique", "amount ≥ 0", "no NULL keys" |
        | **Reconciliation** | source vs target after a load | row counts and sums match, nothing missing, nothing extra |

        Write transformations as **small pure functions** (input → output, no side effects): they can be unit-tested in milliseconds. Keep Spark/IO at the edges.
        Use small, hand-made inputs that contain the edge cases: duplicates, NULLs, late records, empty input.
      `),
      py({ q: 'Write «latest_per_key(rows)»: rows are dicts with «key», «ts» and «value». Return **one row per key, the one with the largest «ts»**, as a list sorted by key. If two rows tie on ts, keep the one that appears **last**.', starter: 'def latest_per_key(rows):\n    pass\n', tests: `rows = [{'key': 'b', 'ts': 1, 'value': 'x'}, {'key': 'a', 'ts': 5, 'value': 'old'}, {'key': 'a', 'ts': 7, 'value': 'new'}, {'key': 'b', 'ts': 1, 'value': 'y'}]
out = latest_per_key(rows)
assert [r['key'] for r in out] == ['a', 'b'], out
assert out[0]['value'] == 'new', out
assert out[1]['value'] == 'y', 'tie on ts: keep the last one'
assert latest_per_key([]) == []`, solution: `def latest_per_key(rows):
    best = {}
    for r in rows:
        k = r['key']
        if k not in best or r['ts'] >= best[k]['ts']:
            best[k] = r
    return [best[k] for k in sorted(best)]` }),
      py({ q: 'Write «reconcile(source_ids, target_ids)» that returns a dict with «missing» (in source, not in target), «extra» (in target, not in source) and «duplicates» (ids that appear more than once in target). Each value is a **sorted list**.', starter: 'def reconcile(source_ids, target_ids):\n    pass\n', tests: `r = reconcile([1, 2, 3, 4], [2, 3, 3, 5])
assert r == {'missing': [1, 4], 'extra': [5], 'duplicates': [3]}, r
assert reconcile([], []) == {'missing': [], 'extra': [], 'duplicates': []}`, solution: `from collections import Counter

def reconcile(source_ids, target_ids):
    s, t = set(source_ids), set(target_ids)
    counts = Counter(target_ids)
    return {'missing': sorted(s - t), 'extra': sorted(t - s),
            'duplicates': sorted(k for k, n in counts.items() if n > 1)}` }),
      multi('Which belong in a unit test of a transformation function?', ['A duplicate record', 'A NULL in the key', 'An empty input', 'A connection to the production database'], [0, 1, 2], 'Unit tests stay fast and isolated: no real databases.'),
      tf('If all unit tests pass, the pipeline can\'t load bad data.', false, 'Unit tests check your code; data tests and reconciliation check the data that arrives at runtime.'),
    ]),
    // ------------------------------------------------------------------ Schema evolution and contracts
    lesson('y6', 'Schema evolution and breaking changes', 20, [
      learn('When the source changes', `
        Sources change: a column is added, renamed, its type changes, or it disappears. A strong data engineer plans for it.

        | Change | Usually safe? | Handling |
        |---|---|---|
        | New nullable column | yes | add it (Delta «mergeSchema»), older rows are NULL |
        | Column removed | no | contract violation: alert, keep the column NULL, talk to the producer |
        | Type widened (int → bigint) | mostly | allowed if every consumer handles it |
        | Type changed (string → int) | no | quarantine bad rows, fix upstream |
        | Column renamed | no | treat as remove + add; map it explicitly |

        **Defences:** a data contract agreed with the producer, schema checks at ingestion (fail or quarantine, never guess), raw bronze kept so you can re-process, and versioned schemas («schema_version» in events).
      `),
      mcq('An upstream team renames «amount» to «total_amount» without warning. Your pipeline uses schema auto-merge. What happens?', ['Nothing, auto-merge maps it', 'A new total_amount column appears and amount becomes NULL for new rows: reports silently drop to zero', 'The job fails immediately', 'Spark renames it back'], 1, 'Auto-merge hides breaking changes. Contracts + explicit checks catch them.'),
      tf('Keeping raw (bronze) data unchanged lets you re-process after fixing a schema-mapping bug.', true),
      order('Put the response to a breaking schema change in order.', ['Detect it (contract check fails, alert fires)', 'Stop or quarantine affected loads so bad data doesn\'t spread', 'Agree the fix with the producer team', 'Update the mapping and contract version', 'Re-process from bronze and reconcile']),
    ]),
    // ------------------------------------------------------------------ Cost and cloud performance
    lesson('y7', 'Cost and performance in the cloud', 20, [
      learn('Where the money goes', `
        - **Compute** is usually the biggest bill: clusters left running, oversized clusters, jobs that shuffle more than needed.
        - **Storage** is cheap per GB but grows forever: old versions, duplicate copies, no retention policy.
        - **Data movement**: egress between regions/clouds costs money; keep compute next to data.

        | Lever | Effect |
        |---|---|
        | Auto-terminate idle clusters, job clusters instead of always-on | stops paying for idle time |
        | Autoscaling with a sensible max | pay for peaks only |
        | Spot / preemptible workers for retry-safe batch jobs | large discounts; can be interrupted |
        | Columnar formats, partition pruning, compaction | read less data = less compute |
        | Incremental instead of full reloads | process only what changed |
        | Storage tiers (hot → cool → archive) + retention | cheaper old data |
      `),
      mcq('A nightly job runs on an always-on 20-node cluster for 40 minutes a day. Biggest saving?', ['Bigger nodes', 'A job cluster that starts for the run and terminates after, with autoscaling', 'More partitions', 'Converting Parquet to CSV'], 1),
      tf('Spot instances are a good fit for idempotent, retry-safe batch jobs.', true, 'If a node is reclaimed, the task retries; idempotency keeps the result correct.'),
      talk('*"Our data platform bill doubled. How would you investigate?"*', `
        - Break the bill down by service and job (tags/cost reports): find the top 3 contributors first.
        - Check compute: idle clusters, oversized or always-on clusters, jobs whose runtime grew.
        - Check jobs: full reloads that could be incremental, missing partition pruning, small files, heavy shuffles.
        - Check storage: retention/VACUUM, duplicate copies, old snapshots.
        - Fix the biggest items, add budgets and alerts, and track cost per pipeline going forward.
      `),
    ]),
  ]);
