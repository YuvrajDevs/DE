const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Replication
  replication: T(`
    > **In one line:** replication keeps **copies of the same data on several machines** so the system survives failures (availability, durability) and can serve more reads (scale). The hard part is keeping the copies in agreement, and knowing how far behind each copy is.

    ## The problem it solves
    One database server will eventually fail: disk, power, a bad patch. If it holds the only copy, you lose data and the business stops. Also, one server can only answer so many reads. Copies on other machines solve both, and create a new problem: copies can disagree.

    ## How it works
    ### Leader-follower (primary-replica): the most common
    - All writes go to the **leader**. The leader records changes in its log (WAL/binlog) and ships them to **followers**, which apply them in order.
    - Reads can go to followers (read replicas) to spread load.
    - If the leader dies, a follower is **promoted** (failover).

    ### Synchronous vs asynchronous
    | | Synchronous | Asynchronous |
    |---|---|---|
    | Commit returns when | Follower(s) confirmed the write | Leader wrote locally |
    | Data loss on leader crash | None (for confirmed followers) | Possible: last changes not yet shipped |
    | Write latency | Higher (waits for network) | Lower |
    | Availability | A slow follower slows/blocks writes | Unaffected by followers |
    Common compromise: **semi-synchronous**: wait for at least one follower, others async.

    ### Multi-leader and leaderless
    - **Multi-leader:** several nodes accept writes (e.g. one per region) and sync with each other. Low local latency; **write conflicts** must be resolved (last-write-wins, merge rules).
    - **Leaderless** (Dynamo-style: Cassandra, DynamoDB): clients write to several replicas; reads ask several and take the newest. **Quorums**: with N replicas, write to W and read from R; if **W + R > N**, a read overlaps at least one replica with the latest write. Example: N=3, W=2, R=2.
    - **Consensus-based** (Raft/Paxos: etcd, CockroachDB, Kafka's KRaft controller, Spanner): a majority agrees on each write; strong consistency with automatic failover.

    ## Replication lag and its anomalies
    Async followers are behind by milliseconds to minutes. Anomalies:
    - **Read-your-own-writes failure:** user saves, then reads from a lagging replica and sees old data.
    - **Monotonic reads failure:** two reads hit different replicas; data appears to go back in time.
    - **Stale reports:** a dashboard on a replica shows "current" numbers 20 minutes old during peak load.
    Measure lag (seconds behind leader) and decide which reads may use replicas.

    ## Replication in data systems you will use
    | System | Replication |
    |---|---|
    | PostgreSQL / MySQL | Leader-follower via WAL/binlog streaming; logical replication feeds CDC |
    | HDFS | Each block stored on 3 DataNodes (default replication factor 3), rack-aware |
    | Kafka | Each partition has a leader and followers; **in-sync replicas (ISR)**; «acks=all» + «min.insync.replicas=2» for durability |
    | Cassandra / DynamoDB | Leaderless, tunable consistency per request |
    | Cloud object storage | Replicated within a region automatically; cross-region replication optional |

    ## Replication is not backup
    Replication copies **everything**, including mistakes: «DELETE FROM claims» without a WHERE is replicated to every follower in milliseconds. Backups (point-in-time snapshots kept separately) and time travel/versioning protect against logical errors; replication protects against hardware failure.

    ## Edge cases and what goes wrong
    - **Split brain:** a network partition makes two nodes both think they are leader; both accept writes; data diverges. Prevented by consensus/quorum and fencing.
    - **Failover data loss:** async follower promoted while missing the last seconds of writes; those writes are gone (and IDs may be reused).
    - **CDC from a replica** may lag; CDC slots on the primary can fill the disk if the consumer stops (PostgreSQL replication slots retain WAL).
    - **Kafka with «acks=1»:** the leader acknowledges, crashes before followers copy; the message is lost.
    - **Cross-region replication cost and latency** surprise teams on their cloud bill.

    ## How interviewers test this
    - "Sync vs async replication trade-offs?" Durability vs latency vs availability.
    - "What is replication lag and how does it affect a pipeline that reads from a replica?" Stale or inconsistent extracts; watermark gaps; measure and account for it.
    - "Is replication a backup?" No: it copies mistakes.
    - "W + R > N?" Quorum overlap gives read-after-write.
  `, {
    check: [
      mcq('A pipeline extracts from an async read replica that is 10 minutes behind, using «updated_at > last_watermark» and setting the watermark to «now()». What risk appears?', ['None', 'Rows committed on the primary in the last 10 minutes are not yet on the replica, and the watermark moves past them, so they are skipped', 'Duplicate rows', 'The replica crashes'], 1, 'Set the watermark from the data you actually read (max updated_at seen), and/or use an overlap window.'),
      mcq('Leaderless store, N = 3 replicas. Which setting guarantees a read sees the latest acknowledged write?', ['W=1, R=1', 'W=2, R=2', 'W=1, R=2', 'W=1, R=1 with retries'], 1, 'W + R > N (2 + 2 > 3) guarantees overlap with at least one up-to-date replica.'),
      tf('Replication protects you from an accidental «DELETE» without a WHERE clause.', false, 'The delete is replicated too. Backups and versioning protect against logical mistakes.'),
      mcq('Which Kafka producer setting is most durable?', ['acks=0', 'acks=1', 'acks=all with min.insync.replicas=2', 'acks=1 with retries=0'], 2, 'The leader waits for all in-sync replicas (at least 2) before acknowledging.'),
    ],
    interview: [
      talk('Explain leader-follower replication and the trade-off between synchronous and asynchronous modes.', `
        - Writes go to the leader, which logs changes and streams them to followers that apply them in order; followers serve reads and can be promoted on failure.
        - **Synchronous:** commit waits for follower confirmation: no data loss on leader failure, higher latency, and a slow follower hurts writes.
        - **Asynchronous:** commit after local write: low latency, but recent writes can be lost on failover, and followers lag (stale reads, read-your-writes issues).
        - **Semi-sync** as a compromise. Consensus systems (Raft) commit on a majority.
        - For pipelines: know replica lag before extracting from a replica; replication is not backup; CDC uses the same log.`),
    ],
  }),

  // ================================================================== Partitioning
  dbpartition: T(`
    > **In one line:** partitioning **splits one large table into smaller pieces** by a rule (date, region, hash of a key) so queries can **skip pieces they do not need**, maintenance can work **piece by piece**, and data can be **spread across machines**. Choosing the partition key is one of the most consequential design decisions in data engineering.

    ## Two meanings you must separate
    1. **Partitioning within one system for pruning and management:** e.g. a claims table partitioned by month; a lakehouse table stored in «/event_date=2026-11-26/» folders.
    2. **Partitioning across machines (sharding)** for scale: rows distributed to nodes by hash of a key (Cassandra, Kafka topics, distributed SQL).
    Spark also uses "partition" for a chunk of data processed by one task in memory. Same word, three related ideas: always say which one you mean.

    ## The strategies
    | Strategy | Rule | Good for | Risk |
    |---|---|---|---|
    | **Range** | Value ranges (dates, IDs) | Time-based queries, dropping old data | Hot latest partition (all writes go to "today") |
    | **List** | Explicit values (region = West) | Known categories | Uneven sizes |
    | **Hash** | hash(key) mod N | Even spread of writes and data | Range queries hit all partitions; changing N reshuffles (use consistent hashing) |
    | **Composite** | Range then hash (month, then hash(engine_id)) | Time queries + even spread | Complexity |

    ## Why partition (the benefits)
    - **Partition pruning:** «WHERE event_date = '2026-11-26'» reads one partition out of 1,000.
    - **Cheap lifecycle:** dropping an old partition is instant, unlike «DELETE … WHERE date < …» on billions of rows.
    - **Idempotent loads:** overwrite exactly one partition per run (insert overwrite / replaceWhere).
    - **Parallelism:** different partitions processed by different workers or nodes.
    - **Maintenance:** compact, vacuum, re-index, back up partition by partition.

    ## Choosing a partition key (the rules that matter)
    1. **Filter on it often.** Partition by the column most queries filter on, usually a date.
    2. **Low-to-moderate cardinality** for folder-style (Hive-style) partitioning: dates yes, «engine_id» with 100,000 values no (too many tiny partitions).
    3. **Target size:** aim for partitions of roughly 1 GB+ in lakehouses (and files of ~128 MB-1 GB). Thousands of tiny partitions are worse than none.
    4. **Stable values:** a column that changes after the row is written (status) is a bad partition key: the row would have to move.
    5. **Match the load pattern:** daily loads → daily partitions make idempotent overwrite easy.
    6. For **sharding**, pick a high-cardinality key that spreads load evenly and keeps related data together (engine_id).

    ## In the lakehouse
    - Hive-style folders: «/claims/submitted_date=2026-11-26/part-000.parquet». Engines prune by folder.
    - Beyond the partition column, use **clustering / Z-order / liquid clustering** on other filter columns (engine_id, dealer_id) to make file statistics effective, instead of adding more partition columns.
    - Iceberg's **hidden partitioning** stores a transform (day(ts)) so users filter on «ts» and still get pruning; partition schemes can evolve without rewriting data.
    - Databricks recommends not partitioning small tables at all (under ~1 TB) and relying on clustering.

    ## Edge cases and what goes wrong
    - **Over-partitioning:** partition by date *and* engine_id → millions of folders of tiny files; listing and planning take longer than reading.
    - **Filter on a function of the partition column:** «WHERE year(event_ts) = 2026» may not prune if the partition column is «event_date»; filter on the partition column directly.
    - **Skewed partitions:** one region holds 70% of data; its partition becomes the bottleneck.
    - **Late data writes into old partitions:** a "daily overwrite" must also handle the old days late data touches (lookback window).
    - **Timezone of the partition date:** partitioning on local date vs UTC date splits a day differently; be consistent.
    - **Hot partition in time-range sharding:** all of today's writes land on one shard.

    ## How interviewers test this
    - "How would you partition a 5 TB events table?" By event date (daily), cluster by the common filter key, target file sizes, compaction; avoid high-cardinality partition columns.
    - "What is partition pruning?" Skipping partitions using the filter, at planning time.
    - "Range vs hash partitioning?" Query locality vs even distribution; hot spots.
  `, {
    check: [
      mcq('A lakehouse table of 400 GB is partitioned by «event_date» **and** «engine_id» (80,000 engines). Queries became slow. Why?', ['Too few files', 'Over-partitioning: millions of tiny partitions and files, so planning and opening files dominate', 'Parquet is slow', 'The date column is wrong'], 1, 'Partition by date only (or not at all at this size) and cluster/Z-order by engine_id.'),
      mcq('Which column is the worst partition key?', ['event_date', 'region (5 values, stable)', 'status (changes over the life of each order)', 'load_date'], 2, 'A changing value would force rows to move between partitions.'),
      tf('Dropping an old date partition is usually much cheaper than DELETE … WHERE date < X on a huge table.', true, 'It is a metadata operation instead of rewriting or scanning data.'),
      mcq('Hash partitioning by engine_id across 12 nodes is good for…', ['Range scans over time across all engines', 'Spreading writes and data evenly, and keeping each engine\'s data together', 'Dropping old data', 'Queries that do not filter by engine'], 1, 'Hash spreads load; time ranges then touch every node.'),
    ],
    hands: [
      py({ q: 'Write «prune(partitions, start, end)» that simulates **partition pruning**: «partitions» is a list of folder names like «"event_date=2026-11-24"». Return the folders whose date is between «start» and «end» (ISO strings, **inclusive**), sorted. Ignore malformed folder names (anything not exactly «event_date=YYYY-MM-DD»).', starter: 'def prune(partitions, start, end):\n    pass\n',
        tests: `ps = ['event_date=2026-11-26', 'event_date=2026-11-24', '_delta_log', 'event_date=2026-11-25', 'event_date=bad', 'event_date=2026-11-27']
assert prune(ps, '2026-11-25', '2026-11-26') == ['event_date=2026-11-25', 'event_date=2026-11-26'], prune(ps, '2026-11-25', '2026-11-26')
assert prune(ps, '2026-12-01', '2026-12-31') == []
assert prune([], '2026-01-01', '2026-12-31') == []`,
        solution: `import re

def prune(partitions, start, end):
    out = []
    for p in partitions:
        m = re.fullmatch(r'event_date=(\\d{4}-\\d{2}-\\d{2})', p)
        if m and start <= m.group(1) <= end:
            out.append(p)
    return sorted(out)` }),
    ],
  }),

  // ================================================================== Scaling
  scaling: T(`
    > **In one line:** **vertical scaling (scale up)** means a bigger machine: more CPU, RAM, faster disks. **Horizontal scaling (scale out)** means more machines sharing the work. Up is simple but has a ceiling and a single point of failure; out is nearly unlimited but brings the problems of distributed systems.

    ## Vertical scaling
    - **How:** move to a larger instance (8 → 64 cores, 32 GB → 512 GB RAM).
    - **Pros:** no code changes; strong consistency stays easy; one machine to operate.
    - **Cons:** price grows faster than capacity at the top end; a hard ceiling; downtime to resize (often); one machine = one failure domain.
    - **Typical:** relational OLTP databases, single-node analytics (DuckDB, pandas), many pipelines that are simply not that big.

    ## Horizontal scaling
    - **How:** split data and work across nodes: partitioning/sharding, distributed processing (Spark), replicated stateless services behind a load balancer, Kafka partitions consumed by a group.
    - **Pros:** near-linear capacity growth; commodity hardware; fault tolerance (lose a node, keep running); elastic in the cloud.
    - **Cons:** network becomes the bottleneck (shuffles), coordination and consistency are hard, partial failures, more to operate and debug; some work does not parallelise.

    ## The laws behind it
    - **Amdahl's law:** if 10% of a job is sequential, no number of machines makes it more than 10× faster. Find and remove the sequential parts (single-threaded driver work, one big final sort, one giant key).
    - **Coordination costs:** more nodes means more communication; adding nodes to a shuffle-heavy job can make it slower.
    - **Stateless scales easily, stateful does not:** adding web servers is easy; adding database nodes means moving data.

    ## Scaling dimensions in data engineering
    | Bottleneck | Scale-up fix | Scale-out fix |
    |---|---|---|
    | Query CPU | Bigger warehouse size | More clusters / MPP nodes |
    | Concurrency (many dashboard users) | Bigger box | Multi-cluster warehouses, replicas, caching |
    | Storage | Bigger disks | Object storage (already scale-out) |
    | Stream throughput | Faster consumer | More Kafka partitions + more consumers |
    | Spark job | Bigger executors (memory) | More executors, more partitions |
    | OLTP writes | Bigger primary | Sharding, distributed SQL |

    ## Elasticity in the cloud
    The cloud adds **elasticity**: scale out for the nightly batch, scale back in afterwards. Autoscaling clusters, serverless warehouses, auto-suspend. The design goal shifts from "buy enough for peak" to "pay for what you use", but autoscaling has limits (startup time, minimums, quotas) and can run up bills when a bad query triggers scale-out.

    ## Before you scale anything
    Often the fix is **doing less work**, not more machines:
    - Read less: partition pruning, column projection, filtering early.
    - Process less: incremental instead of full recompute.
    - Move less: broadcast small tables instead of shuffling big ones; avoid unnecessary repartitions.
    - Fix skew: one huge key can make a 200-node job wait for 1 task.
    A senior engineer profiles first, then scales.

    ## Edge cases and what goes wrong
    - **Scaling out a skewed job:** 199 tasks finish in 1 minute, 1 task takes 40 minutes; more nodes change nothing.
    - **Driver bottleneck:** collecting results to the Spark driver or a single-threaded Python step caps the whole pipeline.
    - **Too many small partitions** after scaling out: overhead per task exceeds work.
    - **Shared bottleneck:** 50 parallel workers hit one source API with a rate limit, or one database. The downstream system becomes the limit.
    - **Hot keys in sharded stores** defeat horizontal scaling.

    ## How interviewers test this
    - "Vertical vs horizontal scaling with pros and cons."
    - "Your Spark job is slow. Would you add more nodes?" Only after checking skew, shuffles, small files, sequential parts and data read.
    - "How does Kafka scale consumers?" Partitions: at most one consumer per partition per group, so partitions cap parallelism.
  `, {
    check: [
      mcq('A job is 20% sequential. What is the best possible speed-up with unlimited machines?', ['Unlimited', '20×', '5×', '2×'], 2, 'Amdahl: 1 / 0.2 = 5×. Remove sequential parts to go further.'),
      mcq('A 200-executor Spark job spends 40 minutes waiting on one task that processes a giant key. Adding 200 more executors will…', ['Halve the time', 'Do almost nothing: the bottleneck is skew, not capacity', 'Make it fail', 'Fix the skew'], 1, 'Fix skew (salting, AQE skew join, broadcast) before adding capacity.'),
      tf('A Kafka topic with 6 partitions can be consumed in parallel by at most 6 consumers in the same consumer group.', true, 'Partitions are the unit of consumer parallelism.'),
      multi('Which are typical costs of horizontal scaling?', ['Network shuffles', 'Harder consistency and coordination', 'Partial failures to handle', 'A hard ceiling on machine size'], [0, 1, 2], 'A hard ceiling is the vertical-scaling limit.'),
    ],
    interview: [
      talk('A nightly Spark pipeline now takes 6 hours instead of 2 as data grew. What do you do?', `
        - **Measure first:** Spark UI: which stage dominates; shuffle size; task time distribution (skew?); spill to disk; number and size of input files; GC time.
        - **Do less work:** incremental processing instead of full recompute; partition pruning; select only needed columns; filter early.
        - **Fix the shape:** broadcast small dimension tables; handle skew (AQE skew join, salting); right-size shuffle partitions (AQE coalescing); compact small files.
        - **Then scale:** more executors or bigger memory per executor where it helps; autoscaling for the window.
        - **Prove it:** compare runtime and cost before/after; add runtime trend alerts so creep is caught early.`),
    ],
  }),

  // ================================================================== Schema and schema evolution
  schema: T(`
    > **In one line:** a **schema** is the agreed structure of data: field names, types, nullability, keys and meaning. **Schema evolution** is how that structure changes over time **without breaking** producers or consumers. Most real pipeline outages trace back to an unmanaged schema change.

    ## Schema-on-write vs schema-on-read
    - **Schema-on-write:** data must match the schema when written; bad data is rejected early (relational tables, Delta with schema enforcement, Avro with a registry). Safer, less flexible.
    - **Schema-on-read:** store anything, apply structure when reading (raw JSON in a lake). Flexible, but every reader must cope with every variation, and errors appear late.
    Modern practice: **schema-on-read for raw landing (bronze), schema-on-write from silver onward.**

    ## Kinds of change and how dangerous each is
    | Change | Example | Risk |
    |---|---|---|
    | Add optional column | «warranty_type» added | Usually safe (additive) |
    | Add required column | New NOT NULL field | Breaks old producers |
    | Remove column | «legacy_code» dropped | Breaks consumers that read it |
    | Rename column | «sub_dt» → «submitted_at» | Breaks everyone (it is remove + add) |
    | Widen type | INT → BIGINT, FLOAT → DOUBLE | Usually safe |
    | Narrow / change type | STRING → INT, DECIMAL(12,2) → DECIMAL(10,2) | Can fail or truncate |
    | Change meaning | amount now excludes tax | Silent: nothing errors, numbers shift |
    | Change grain | one row per claim → per claim line | Silent double counting |
    | Change nullability | Column now nullable | Downstream NOT NULL assumptions break |

    ## Compatibility (the schema-registry vocabulary)
    Used with Avro/Protobuf/JSON Schema in Kafka (Confluent Schema Registry):
    - **Backward compatible:** consumers using the **new** schema can read data written with the **old** schema (e.g. add a field **with a default**). Upgrade consumers first.
    - **Forward compatible:** consumers using the **old** schema can read data written with the **new** schema (e.g. add a field old readers ignore; remove an optional field). Upgrade producers first.
    - **Full compatible:** both.
    - **Transitive:** compatible with all previous versions, not just the last.
    The registry rejects producers that try to publish an incompatible schema, which turns an outage into a failed deploy.

    ## Schema evolution in lakehouse tables
    - **Delta Lake:** enforcement by default (writes with unexpected columns fail). «mergeSchema» allows adding columns; «overwriteSchema» replaces it. **Column mapping** enables rename/drop without rewriting files.
    - **Iceberg:** tracks columns by **ID**, not name, so add, drop, rename and reorder are safe metadata operations; also partition evolution.
    - **Auto Loader / rescued data column:** unexpected fields or type mismatches go into a «_rescued_data» column instead of failing or disappearing.

    ## A safe process for changes
    1. **Classify** the change: additive, breaking, or semantic.
    2. **Additive:** deploy, document, let consumers adopt.
    3. **Breaking:** **expand → migrate → contract**: add the new column/version alongside the old, backfill it, move consumers (using lineage to find them), then remove the old after a deprecation date.
    4. **Semantic:** treat as breaking: new column name or new version, announcement.
    5. **Automate:** contract tests in CI for producers, schema checks at ingestion, alerts on drift.

    ## Edge cases and what goes wrong
    - **Silent NULLs:** a column renamed at source; your select by name returns NULL (in permissive readers) and the job is green.
    - **Type drift in JSON:** a field is sometimes a number, sometimes a string; schema inference picks one per file, so files disagree.
    - **Schema inference on a sample:** the first 1,000 records lack a rare field; the inferred schema drops it for all.
    - **Column order dependence:** «INSERT INTO t SELECT *» maps by position; a reordered source writes values into the wrong columns. Map by name.
    - **CSV headers changed** while code uses positions.
    - **Old files, new schema:** reading years of Parquet files with different schemas needs schema merging or a table format.
    - **Downstream caches:** BI extracts with fixed schemas fail after an upstream change.

    ## How interviewers test this
    - "A source added a column / renamed a column. What happens to your pipeline and what should happen?"
    - "Backward vs forward compatibility?" Who can read what; which side to upgrade first.
    - "How do you roll out a breaking change?" Expand, migrate, contract; versioning; lineage; communication.
  `, {
    check: [
      mcq('You add an optional field with a default value to an Avro schema. Which compatibility does this give?', ['None', 'Backward: new-schema consumers can still read old data (the default fills the missing field)', 'Only forward', 'It breaks all consumers'], 1, 'Adding a field with a default is the classic backward-compatible change.'),
      mcq('Your pipeline runs «INSERT INTO silver SELECT * FROM bronze_view». The source reorders two columns of the same type. What happens?', ['An error', 'Values silently land in the wrong columns because the insert maps by position', 'Nothing', 'Spark fixes it'], 1, 'Select and insert by explicit column names.'),
      order('Order the steps of a safe breaking change (rename «sub_dt» to «submitted_at»).', ['Add «submitted_at» alongside «sub_dt»', 'Backfill «submitted_at» for history', 'Find consumers via lineage and migrate them', 'Announce a deprecation date for «sub_dt»', 'Remove «sub_dt» after the date'], 'Expand → migrate → contract.'),
      tf('In Iceberg, renaming a column is a metadata operation because columns are tracked by ID.', true, 'Name-based formats need rewrites or features such as Delta column mapping.'),
    ],
    scenarios: [
      scenario('The Monday NULLs', `
        On Monday the silver «service_requests» table shows «priority = NULL» for every new row. The job is green. Bronze JSON shows a field «priority_level» and no «priority». The source team deployed on Sunday.`, [
        ['What happened?', [
          ['The source renamed the field; your permissive reader selects a missing field as NULL without failing', true, 'Silent breakage from a rename.'],
          ['Priorities were removed from the CRM', false, 'Bronze shows the data under a new name.'],
          ['Spark lost the data', false, 'The data is in bronze.'],
        ]],
        ['Immediate action?', [
          ['Map «priority_level» to «priority» (accept either), reprocess Monday from bronze, verify NULL rate returns to normal, inform consumers', true, 'Repair from raw and keep consumers informed.'],
          ['Wait for the source to rename it back', false, 'Your consumers suffer meanwhile; you can fix it on your side.'],
          ['Fill NULLs with "Medium"', false, 'Inventing data.'],
        ]],
        ['How do you stop the next one being silent?', [
          ['Schema check at ingestion that fails or alerts on missing required fields, plus a data contract and CI contract tests with the source team', true, 'Make breaking changes loud and early.'],
          ['Infer the schema every run', false, 'Inference adapts silently: the opposite of what you want for required fields.'],
          ['Read every field as string', false, 'Hides problems further.'],
        ]],
      ], 'Required fields must be checked explicitly; permissive readers turn renames into silent NULLs.'),
    ],
  }),
};
