const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Shuffle
  shuffle: T(`
    > **In one line:** a **shuffle** redistributes data across the cluster so that **all records with the same key end up on the same machine**, which group-bys, joins, distinct and window functions need. It is the most expensive thing a distributed job does: disk writes, network transfer, serialisation and a hard stage boundary.

    ## Why it is needed
    Data starts spread arbitrarily: claims for dealer 14 sit in 200 different input partitions. To compute «SUM(amount) GROUP BY dealer_id», all of dealer 14's rows must meet in one place. Moving them there is the shuffle.

    ## How it works (Spark)
    1. **Map side (shuffle write):** each task computes, for each row, the target partition («hash(key) % numShufflePartitions»), optionally pre-aggregates (partial sums per key: a **combiner**), sorts/buckets rows by target, and writes **shuffle files** to local disk.
    2. **Stage boundary:** the next stage cannot start until the map side is done.
    3. **Reduce side (shuffle read):** each task fetches its partition's blocks from **every** map task over the network, merges them and continues.
    With M map tasks and R reduce partitions, there are up to M × R blocks: 2,000 × 2,000 = 4 million network fetches.

    ## What triggers a shuffle
    | Operation | Shuffles? |
    |---|---|
    | select, filter, withColumn, map | No (narrow) |
    | groupBy / agg, distinct, dropDuplicates | Yes |
    | join (sort-merge or shuffle-hash) | Yes (both sides) |
    | **broadcast join** | No shuffle of the big side |
    | orderBy / sort (global) | Yes (range partitioning) |
    | repartition | Yes |
    | window functions with PARTITION BY | Yes |
    | coalesce | No (merges partitions locally) |

    ## How to reduce shuffle cost
    1. **Filter and select early** so less data is shuffled (the optimiser pushes down a lot, but not through everything).
    2. **Broadcast small tables** in joins (dimension tables under ~tens to hundreds of MB).
    3. **Pre-aggregate** before joining (aggregate facts to the join key first).
    4. **Avoid unnecessary repartition/orderBy**; sort only at the end if needed.
    5. **Right-size shuffle partitions** (AQE coalescing) and handle **skew** (AQE skew join, salting).
    6. **Reuse partitioning:** bucketing or storage-partitioned joins avoid shuffling on every run for repeated joins on the same key.
    7. **Use efficient formats and compression** for shuffle data (defaults are usually fine).

    ## Reading shuffle in the Spark UI
    Stage details show **Shuffle Write** and **Shuffle Read** sizes, **spill (memory/disk)**, and per-task time. Signs of trouble: shuffle sizes larger than input, large spill, a few tasks much slower than the median (skew).

    ## Edge cases and what goes wrong
    - **Shuffle spill** to disk when partitions exceed executor memory: slow, sometimes OOM. More partitions or more memory.
    - **Fetch failures** when an executor holding shuffle files dies; Spark recomputes the map stage. External shuffle service or decommissioning helps.
    - **Too many shuffle partitions** for small data: 200 tasks of 1 KB each.
    - **Local disk full** from shuffle files.

    ## How interviewers test this
    - "What is a shuffle and why is it expensive?"
    - "Which operations cause shuffles? How do you avoid one in a join?" Broadcast.
    - "Your stage shows 400 GB shuffle write for a 100 GB input. What do you check?" Exploding joins (duplicate keys), missing pre-aggregation, unnecessary repartitions.
  `, {
    check: [
      multi('Which operations cause a shuffle in Spark?', ['groupBy().agg()', 'filter()', 'join between two large tables', 'distinct()'], [0, 2, 3], 'filter is narrow: each partition is processed on its own.'),
      mcq('How do you join a 2 TB fact table to a 20 MB dimension without shuffling the fact table?', ['Repartition both sides', 'Broadcast the small dimension to every executor', 'Sort both sides', 'Coalesce to 1'], 1, 'Each executor joins its fact partitions with a local copy of the dimension.'),
      tf('A shuffle creates a stage boundary: the next stage waits for all map tasks to finish writing shuffle data.', true, 'Stages are split at shuffles.'),
    ],
  }),

  // ================================================================== Skew
  skew: T(`
    > **In one line:** **data skew** means some keys have **far more rows** than others, so after a shuffle one task gets a giant partition while the rest finish quickly. The whole stage waits for that one straggler. It is the most common reason a distributed job is slow, and adding machines does not fix it.

    ## How to recognise it
    - Spark UI: in a stage, most tasks take seconds but one or two take tens of minutes; max task input/shuffle-read size is 50-100× the median.
    - Job stuck at "199/200 tasks complete".
    - One executor out of memory while others are idle.

    ## Where it comes from
    - **Hot keys:** one dealer with 40% of claims; one engine model dominating telemetry; a default customer ID used for walk-ins.
    - **NULL or placeholder keys:** every row with a missing dealer_id (NULL, 0, "UNKNOWN") hashes to the same partition.
    - **Time skew:** one day with a huge backfill.
    - **Join amplification:** a skewed key on both sides of a join multiplies rows (10,000 × 10,000 = 100 million for one key).

    ## Fixes, from easiest to most manual
    | Fix | How | When |
    |---|---|---|
    | **Filter junk keys** | Remove or handle NULL/placeholder keys before the join | NULLs never match anyway in inner joins |
    | **Broadcast join** | Broadcast the small side so no shuffle on the key | One side is small |
    | **AQE skew join** | «spark.sql.adaptive.skewJoin.enabled» splits oversized partitions into sub-tasks and replicates the matching side | Spark 3+, sort-merge joins |
    | **Salting** | Add a random suffix (0..N-1) to the hot key on the big side; replicate the other side N times with each suffix; join on (key, salt); aggregate after | Manual control; large-large joins with hot keys |
    | **Two-phase aggregation** | Aggregate by (key, salt) first, then by key | Skewed group-bys |
    | **Isolate hot keys** | Process the top keys separately (e.g. broadcast-join them) and union with the rest | A few known giant keys |
    | **Change the key / grain** | Partition by a more even key | Design-level fix |

    ## Salting, step by step
    1. Big side: «salt = rand() * N» (integer 0..N-1); key becomes (dealer_id, salt).
    2. Small(er) side: «explode» each row into N copies with salt 0..N-1.
    3. Join on (dealer_id, salt): the hot dealer's rows are now spread over N tasks.
    4. If aggregating, aggregate by (key, salt) then by key.
    Cost: the replicated side grows N×; choose N just large enough.

    ## Edge cases and what goes wrong
    - **Adding executors** does nothing: the giant partition still runs on one core.
    - **Increasing shuffle partitions** does not split a single hot key (all its rows hash to the same partition).
    - **Salting with random values and retries:** random salt is fine for joins (the replicated side matches all salts), but for deterministic outputs prefer a hash-based salt (e.g. hash of another column mod N).
    - **Skew in window functions** (PARTITION BY a hot key) cannot be salted easily: redesign or pre-aggregate.

    ## How interviewers test this
    - "What is data skew and how do you detect it?" Spark UI task distribution.
    - "How do you fix a skewed join?" Broadcast, AQE skew join, salting, isolate hot keys, filter NULL keys.
    - "Why doesn't adding nodes or partitions fix skew?"
  `, {
    check: [
      mcq('All rows with a NULL dealer_id go to one task in a join. What is the simplest fix?', ['Add executors', 'Filter or separately handle NULL keys before the join (they never match in an inner join anyway)', 'Increase shuffle partitions', 'Use coalesce'], 1, 'NULL/placeholder keys are a classic, cheap-to-fix skew source.'),
      mcq('Why does increasing spark.sql.shuffle.partitions not fix a single hot key?', ['It does fix it', 'All rows of one key still hash to the same partition', 'Spark ignores the setting', 'It causes more skew'], 1, 'Only splitting the key itself (salting, AQE skew split) spreads it.'),
      order('Order the salting steps for a skewed join.', ['Add a salt 0..N-1 to each row of the big side', 'Replicate each row of the other side N times, one per salt value', 'Join on (key, salt)', 'Aggregate by key (if aggregating, first by key and salt)'], 'Spread the hot key over N tasks.'),
      tf('A stage where 199 tasks finish in 20 seconds and 1 task takes 30 minutes is a typical sign of skew.', true, 'Check that task\'s input size in the Spark UI.'),
    ],
    scenarios: [
      scenario('Stuck at 199 of 200', `
        A nightly job joins 3 billion sensor readings to 2 billion engine-status rows on «engine_id». It used to take 25 minutes; now it sits at "199/200 tasks" for over an hour. The Spark UI shows the last task reading 180 GB while the median task reads 400 MB. A test fleet engine «engine_id = 0» was recently configured to send data every 10 ms.`, [
        ['What is happening?', [
          ['Skew: engine 0 has vastly more rows on both sides, so one task processes a huge, multiplied join', true, 'A hot key on both sides of a join amplifies the problem.'],
          ['The cluster is too small', false, 'Other tasks finish quickly; capacity is not the issue.'],
          ['The network is slow', false, 'One task is slow because it has 450× more data.'],
        ]],
        ['What is the quickest effective fix tonight?', [
          ['Enable AQE skew join handling (or filter test engine 0 if it should not be in production analytics)', true, 'Built-in skew splitting or removing junk data are fast wins.'],
          ['Double the number of executors', false, 'The hot partition still runs on one core.'],
          ['Set shuffle partitions to 2,000', false, 'Engine 0 still hashes to one partition.'],
        ]],
        ['What is the lasting fix?', [
          ['Agree with the fleet team on test-device handling (flag/exclude), downsample high-frequency test data at ingestion, and keep AQE skew handling plus a task-skew alert', true, 'Fix the source of the skew and keep a guardrail.'],
          ['Salt every join in the platform', false, 'Over-engineering; salt only where needed.'],
          ['Run the job twice a day', false, 'Does not address skew.'],
        ]],
      ], 'Skew is a data problem first. Find the hot key, then choose: filter, broadcast, AQE, salt, or fix the source.'),
    ],
    hands: [
      py({ q: '**Salting** in miniature. Write «salted_join(big, small, hot_keys, n)»: «big» is a list of «(key, value)», «small» a dict «{key: label}». For keys in «hot_keys», the salt of the i-th big row with that key is «i % n» (deterministic); others get salt 0. Build the salted small side by replicating hot keys for salts 0..n-1 (others only salt 0). Join on «(key, salt)» and return a list of «(key, value, label)» in the order of «big». Also return «load»: a dict «{(key, salt): row_count}» for the big side, so you can see the hot key spread over n buckets. Return «(rows, load)». Big rows whose key is not in «small» are dropped (inner join).', starter: 'def salted_join(big, small, hot_keys, n):\n    pass\n',
        tests: `big = [('d14', 1), ('d14', 2), ('d14', 3), ('d9', 4), ('d14', 5), ('x', 6)]
small = {'d14': 'West', 'd9': 'North'}
rows, load = salted_join(big, small, {'d14'}, 2)
assert rows == [('d14', 1, 'West'), ('d14', 2, 'West'), ('d14', 3, 'West'), ('d9', 4, 'North'), ('d14', 5, 'West')], rows
assert load == {('d14', 0): 2, ('d14', 1): 2, ('d9', 0): 1, ('x', 0): 1}, load`,
        solution: `def salted_join(big, small, hot_keys, n):
    small_salted = {}
    for k, label in small.items():
        for s in (range(n) if k in hot_keys else [0]):
            small_salted[(k, s)] = label
    seen, rows, load = {}, [], {}
    for k, v in big:
        if k in hot_keys:
            i = seen.get(k, 0)
            seen[k] = i + 1
            salt = i % n
        else:
            salt = 0
        load[(k, salt)] = load.get((k, salt), 0) + 1
        if (k, salt) in small_salted:
            rows.append((k, v, small_salted[(k, salt)]))
    return rows, load` }),
    ],
  }),

  // ================================================================== Fault tolerance and replication
  faulttol: T(`
    > **In one line:** fault tolerance is a system's ability to **keep working correctly when parts fail**. Distributed data systems achieve it in two main ways: **keep copies** (replication) and **be able to redo work** (recomputation from lineage, retries, checkpoints, replayable logs).

    ## The two strategies
    | Strategy | How | Systems |
    |---|---|---|
    | **Redundancy (replicate data)** | Store each block/partition/row on several machines | HDFS blocks (3×), Kafka partitions (replication factor), cloud object storage, databases |
    | **Recomputation (redo work)** | Remember how data was produced and rebuild lost pieces | Spark lineage (RDD/DataFrame DAG), MapReduce task retries, replaying Kafka/bronze |
    Plus **checkpointing**: saving progress/state so recovery does not start from zero (streaming offsets and state; checkpointing long lineages).

    ## How each system tolerates failures
    - **HDFS:** if a DataNode dies, the NameNode re-replicates its blocks from surviving copies. NameNode HA (standby + journal nodes) removes the metadata single point of failure.
    - **MapReduce:** failed map/reduce tasks re-run on other nodes; map outputs are on local disk, reduce outputs in HDFS.
    - **Spark:** a lost partition is recomputed from its lineage (the chain of transformations from the source). Lost shuffle files → re-run the map stage that produced them. Failed tasks retried (up to 4 times by default). Speculative execution re-launches stragglers.
    - **Spark Structured Streaming:** offsets and state saved to a checkpoint directory each micro-batch; on restart, resumes from the last committed batch; with replayable sources and idempotent/transactional sinks this gives exactly-once results.
    - **Kafka:** partitions replicated across brokers; if a leader fails, an in-sync follower takes over; consumers resume from committed offsets.
    - **Orchestrators:** task retries; re-run failed steps; idempotent tasks make this safe.

    ## Edge cases and what goes wrong
    - **Very long lineage** (iterative jobs) makes recomputation slow; checkpoint or write intermediate results.
    - **Non-deterministic sources** (reading "the latest" from an API) cannot be recomputed identically: land data first.
    - **Checkpoint directory deleted or reused** by another query → duplicates or failures on restart.
    - **Changing a streaming query's logic** incompatibly with its checkpoint.
    - **Correlated failures:** replicas in the same rack/zone; a bad config pushed everywhere.

    ## How interviewers test this
    - "How does Spark recover from losing an executor?" Recompute lost partitions from lineage; re-run map stages for lost shuffle data; task retries.
    - "How does Structured Streaming recover after a crash?" Checkpointed offsets and state; replay from source; idempotent sink.
    - "Replication vs recomputation trade-offs?" Storage cost vs compute time.
  `, {
    check: [
      mcq('How does Spark recover a lost partition of a DataFrame?', ['From a replica on another node', 'By recomputing it from its lineage (the transformations that produced it)', 'It cannot', 'From the driver\'s memory'], 1, 'Lineage-based recomputation is Spark\'s core fault-tolerance idea.'),
      mcq('What does a Structured Streaming checkpoint directory contain?', ['Only logs', 'Source offsets processed, commits per batch, and operator state', 'The output data', 'Spark configuration only'], 1, 'Deleting or sharing it breaks recovery guarantees.'),
      tf('If your input is "whatever an API returns right now", Spark recomputation after a failure may produce different data.', true, 'Land data in durable storage first for reproducibility.'),
    ],
  }),

  // ================================================================== Throughput vs latency
  tputlat: T(`
    > **In one line:** **latency** is how long **one** item takes from start to finish; **throughput** is how **many** items the system completes per unit of time. Batching raises throughput but adds latency; tuning a data system is mostly choosing the right point between them.

    ## The intuition
    A bus vs taxis: a bus (batch) moves 60 people per trip efficiently but each waits for it to fill and stops often (higher latency, higher throughput per cost). Taxis (per-event) leave immediately (low latency) but move fewer people per unit of cost.

    ## Where the trade-off appears
    | Knob | More batching → | Less batching → |
    |---|---|---|
    | Kafka producer «linger.ms» / «batch.size» | Higher throughput, better compression, more latency | Lower latency, more requests, lower throughput |
    | Streaming trigger interval | Larger micro-batches, efficient writes, fewer files | Fresher data, more overhead, more small files |
    | Database inserts | Bulk insert of 10,000 rows | Row-by-row insert |
    | API calls | Batch endpoints | One call per record |
    | File sizes | Fewer, larger files | Many small files |

    ## Measuring
    - **Latency:** percentiles: p50, p95, p99 (tails matter more than averages).
    - **Throughput:** records/s, MB/s; also **capacity** = the maximum sustainable throughput before latency explodes.
    - **Little's law:** items in system = throughput × latency. If a stream processes 10,000 events/s and end-to-end latency is 5 s, ~50,000 events are in flight (buffers, state, lag).
    - **Backpressure / lag:** when input rate > processing throughput, queues grow and latency rises without bound. Watch consumer lag trends.

    ## Design guidance
    - Decide which matters for this workload: dashboards and ML training → throughput; alerts and user-facing features → latency.
    - Batch at the boundaries (ingestion, writes) where it is cheap; keep the latency-critical path short.
    - Provide headroom: run at 50-70% of capacity so spikes do not explode latency.

    ## How interviewers test this
    - "Throughput vs latency?" Definitions, the batching trade-off, examples.
    - "Your streaming job's latency keeps growing during the day. Why?" Input rate exceeds throughput (lag), skew, state growth, small-file writes slowing down; scale out partitions/consumers, tune batching.
  `, {
    check: [
      mcq('Increasing Kafka producer «linger.ms» from 0 to 50 usually…', ['Lowers both throughput and latency', 'Raises throughput (bigger batches, better compression) and adds up to ~50 ms latency', 'Has no effect', 'Loses messages'], 1, 'Classic batching trade-off.'),
      mcq('A stream processes 5,000 events/s with 4 s average end-to-end latency. Roughly how many events are in flight (Little\'s law)?', ['1,250', '5,000', '20,000', '200,000'], 2, 'L = λ × W = 5,000 × 4.'),
      tf('When the input rate is higher than processing throughput, consumer lag and latency keep growing.', true, 'Backpressure: scale throughput or reduce load.'),
    ],
  }),

  // ================================================================== Eventual consistency
  eventual: T(`
    > **In one line:** **eventual consistency** means that after a write, replicas may temporarily disagree, but **if no new writes happen, they all converge** to the same value. It buys availability and low latency at the cost of possibly **reading stale data** for a while.

    ## Consistency models, from strong to weak
    | Model | Guarantee | Example |
    |---|---|---|
    | **Linearizable (strong)** | Every read sees the latest committed write, as if one copy | Single-leader DB reads from leader; Spanner |
    | **Sequential / causal** | Everyone sees operations in a consistent order; cause before effect | Some distributed DBs |
    | **Read-your-writes** | You always see your own writes | Session guarantees |
    | **Monotonic reads** | Once you have seen a value, you never see an older one | Sticky sessions to one replica |
    | **Eventual** | Replicas converge eventually; no timing promise | DNS, Cassandra at consistency ONE, many caches, cross-region replication |

    ## Where data engineers meet it
    - **Read replicas and CDC:** a replica or downstream table lags the source.
    - **Caches** in front of databases/APIs.
    - **Cross-region replication** of storage or databases.
    - **Distributed NoSQL** with low consistency levels.
    - **The analytics platform itself:** the warehouse is eventually consistent with the operational systems: data appears minutes or hours later. Dashboards should show "data as of".
    - **Microservices** each owning data; integration events converge over time.

    ## Living with it
    - Know the **staleness bound** you can expect (seconds? minutes?) and monitor lag.
    - Use **idempotent, order-tolerant** processing (versions, sequence numbers, last-write-wins by version, not by arrival).
    - Reconcile periodically.
    - Choose stronger consistency where it matters (financial postings, inventory reservations), eventual where it does not (counts on a dashboard, telemetry).

    ## Conflict resolution when writes happen in several places
    - **Last-write-wins (LWW)** by timestamp: simple, but clock skew can drop real updates.
    - **Version vectors / vector clocks:** detect concurrent updates.
    - **CRDTs** (conflict-free replicated data types): counters and sets that merge automatically.
    - **Application merge rules** (e.g. union of tags, max of amounts).

    ## How interviewers test this
    - "What is eventual consistency? Where would you accept it?"
    - "A user saves a change and refreshes but sees old data. Why and how to fix?" Read from a lagging replica; read-your-writes via leader reads or session consistency.
  `, {
    check: [
      mcq('A dealer updates a claim and immediately reloads the page, which reads from an async replica, and sees the old status. Which guarantee is missing?', ['Durability', 'Read-your-writes', 'Atomicity', 'Partition tolerance'], 1, 'Route the user\'s reads to the leader for a while, or use session consistency.'),
      tf('The analytics warehouse is effectively eventually consistent with the operational systems it copies from.', true, 'That is why dashboards should show "data as of".'),
      mcq('Why is last-write-wins by wall-clock timestamp risky across machines?', ['It is too slow', 'Clock skew can make an older write look newer and silently discard a real update', 'It uses too much storage', 'It requires SQL'], 1, 'Prefer version numbers or sequence numbers where order matters.'),
    ],
  }),
};
