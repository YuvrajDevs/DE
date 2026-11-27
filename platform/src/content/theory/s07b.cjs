const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Narrow vs wide
  narrowwide: T(`
    > **In one line:** a **narrow** transformation computes each output partition from **one** input partition (no data movement): filter, select, withColumn. A **wide** transformation needs data from **many** input partitions, so it **shuffles**: groupBy, join (non-broadcast), distinct, orderBy, repartition. Wide transformations define stage boundaries and most of a job's cost.

    ## Examples
    | Narrow | Wide |
    |---|---|
    | select, withColumn, filter/where | groupBy().agg(), distinct, dropDuplicates |
    | map, flatMap, explode | join (sort-merge, shuffle-hash) |
    | union (just concatenates partitions) | orderBy / sort (global) |
    | coalesce (merges locally) | repartition |
    | broadcast join (big side stays put) | window functions with PARTITION BY |
    | sample | intersect, except |

    ## Why it matters
    - Narrow chains run as one fast pipeline per partition, in memory, no network.
    - Each wide step costs disk + network + a stage barrier, and is where skew, spill and OOM happen.
    - Optimisation = **fewer and smaller wide steps**: filter/select before them, aggregate before joining, broadcast small sides, avoid unneeded sorts and repartitions.

    ## A subtle one: partial aggregation
    «groupBy().agg(sum)» does a **map-side partial aggregation** first (each task sums its own rows per key), so the shuffle moves one row per key per task, not every row. Aggregations like «collect_list» or «countDistinct» cannot shrink as much, so they shuffle more.

    ## How interviewers test this
    - "Narrow vs wide, with examples."
    - "Is union wide? Is coalesce wide?" No and no.
    - "How do you reduce the cost of wide transformations?"
  `, {
    check: [
      multi('Which are wide transformations?', ['groupBy().count()', 'withColumn()', 'join of two large tables', 'filter()', 'orderBy()'], [0, 2, 4], 'They need data from many partitions, so they shuffle.'),
      tf('union() is a wide transformation because it combines two DataFrames.', false, 'It just appends partitions; no shuffle.'),
      mcq('Why does «groupBy("dealer_id").sum("amount")» shuffle far less data than the number of input rows?', ['It does not shuffle', 'Each task pre-aggregates per key (partial aggregation) before the shuffle', 'Spark samples the data', 'The data is cached'], 1, 'Map-side combine shrinks shuffles for algebraic aggregates.'),
    ],
    hands: [
      spark({ q: `Reduce shuffle size before a join: **aggregate claims to one row per dealer first** (count as «claims», sum of «claim_amount» rounded to 2 dp as «claimed»), then join to «dealers» and return «dealer_name, region, claims, claimed», sorted by «claimed» descending.`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
per_dealer = claims.groupBy("dealer_id").agg(F.count("*").alias("claims"), F.round(F.sum("claim_amount"), 2).alias("claimed"))
result = (per_dealer.join(dealers, "dealer_id")
  .select("dealer_name", "region", "claims", "claimed")
  .orderBy(F.col("claimed").desc()))`, hint: 'groupBy("dealer_id").agg(...) first, then .join(dealers, "dealer_id").' }),
    ],
  }),

  // ================================================================== Caching
  cache: T(`
    > **In one line:** «cache()» / «persist()» keeps a DataFrame's computed partitions in executor memory (and/or disk) after the first action, so later actions **reuse** them instead of recomputing the whole lineage. Useful when the same expensive result is used several times; harmful when used by reflex.

    ## How it works
    - «df.cache()» marks the DataFrame (lazy); the **first action** computes and stores it; later actions read from the cache.
    - DataFrame «cache()» = «persist(StorageLevel.MEMORY_AND_DISK)» (partitions that do not fit in memory spill to disk).
    - Other levels: «MEMORY_ONLY», «DISK_ONLY», serialised variants, replicated («_2»).
    - «unpersist()» frees it. The Spark UI **Storage** tab shows what is cached and how much fits.
    - Cached data lives in executors: lost executors lose their cached partitions (recomputed from lineage when needed).

    ## When to cache
    - The same DataFrame feeds **several actions or branches** (e.g. written to two tables, or used in a loop).
    - It is **expensive to recompute** (big joins, heavy UDFs) and **reasonably small** relative to cluster memory.
    - Iterative algorithms (ML) over the same data.
    - Interactive exploration on a notebook.

    ## When not to
    - Used once: caching costs memory and time to materialise for no benefit.
    - Bigger than memory: spills to disk, may be slower than re-reading columnar files with pruning.
    - Before a filter: cache the smaller, filtered result instead.
    - On Databricks, the **disk cache** (automatic caching of remote Parquet/Delta files on local SSDs) often helps without explicit cache().

    ## cache vs checkpoint vs writing to a table
    | | cache/persist | checkpoint | Write to a table |
    |---|---|---|---|
    | Keeps lineage | Yes | No (truncates) | No |
    | Survives the application | No | Reliable checkpoint dir yes, but meant for the app | Yes |
    | Use | Reuse within a job | Break very long lineages | Share results across jobs/teams |

    ## Edge cases and what goes wrong
    - **Stale cache:** a cached DataFrame over a table that changed shows old data until unpersisted.
    - **Caching too much:** evicts other cached data and starves execution memory → spills and OOM.
    - **Forgetting the action:** cache() alone does nothing until something triggers computation.

    ## How interviewers test this
    - "When would you cache a DataFrame and when not?"
    - "cache vs persist?" cache = persist with the default level.
    - "cache vs checkpoint?"
  `, {
    check: [
      mcq('A DataFrame built from a heavy join is written to two different tables. What helps?', ['Nothing', 'Cache/persist it before the two writes (or write once and read the result back) so the join runs once', 'Repartition it to 1', 'Call explain()'], 1, 'Two actions on an uncached plan recompute everything.'),
      tf('Calling «df.cache()» immediately computes and stores the data.', false, 'It is lazy; the first action materialises the cache.'),
      mcq('Which breaks the lineage of a DataFrame?', ['cache()', 'persist(MEMORY_AND_DISK)', 'checkpoint()', 'filter()'], 2, 'Checkpointing saves data and forgets how it was computed.'),
    ],
  }),

  // ================================================================== Spark fault tolerance
  sparkft: T(`
    > **In one line:** Spark recovers from failures by **retrying tasks**, **recomputing lost partitions from lineage**, **re-running map stages** whose shuffle files were lost, **speculatively re-running stragglers**, and, for streaming, **restarting from checkpointed offsets and state**. It does not replicate data in memory by default; it relies on being able to recompute.

    ## Failure scenarios and what Spark does
    | Failure | Spark's response |
    |---|---|
    | A task throws (bad node, transient error) | Retries the task up to spark.task.maxFailures (4) on another executor |
    | An executor dies | Its running tasks are re-scheduled; its cached partitions are recomputed from lineage when needed; its shuffle files are lost → map tasks that produced them re-run (unless an external shuffle service/decommissioning kept them) |
    | A stage keeps failing (fetch failures) | Stage retried; after limits, job fails |
    | A task is much slower than its peers | Speculative execution (if enabled) launches a copy; first to finish wins |
    | Driver dies | Application fails (cluster mode can restart the driver with supervision; streaming resumes from checkpoint) |
    | Node with spot/preemptible instance reclaimed | Same as executor loss; graceful decommissioning migrates shuffle/cache blocks when warned |

    ## Why recomputation works
    Every DataFrame partition is defined by its lineage from **deterministic** transformations of **reliable** inputs (files in durable storage, replayable Kafka offsets). So any lost piece can be rebuilt. This breaks when:
    - inputs are not reproducible (reading a live API, a table being overwritten during the job),
    - transformations are non-deterministic (rand(), now(), order-dependent first()),
    - side effects happen inside tasks (a task that sent emails will send them again).

    ## Output commit protocol
    Retried and speculative tasks could both write output. Spark's **commit protocol** writes task output to temporary locations and commits only one attempt per task; table formats like Delta make the final job commit atomic, so readers never see partial or duplicate output from retries.

    ## Structured Streaming recovery
    - Each micro-batch's planned offsets are written to the checkpoint's offset log **before** processing; the commit log records completed batches; state store snapshots/deltas persist operator state.
    - On restart: reprocess the last planned-but-uncommitted batch with the same offsets (deterministic), then continue.
    - With an idempotent/transactional sink (Delta) → exactly-once results.

    ## How interviewers test this
    - "What happens when an executor dies mid-job?"
    - "How does Spark guarantee output is not duplicated when tasks are retried?" Commit protocol, atomic table commits.
    - "Why must transformations be deterministic?"
  `, {
    check: [
      mcq('An executor holding shuffle output dies after its map stage finished. What does Spark typically do?', ['Fail the job immediately', 'Re-run the map tasks whose shuffle output was lost, then continue', 'Ignore the missing data', 'Restart the cluster'], 1, 'Lineage lets Spark regenerate exactly what was lost.'),
      mcq('Why can a task that calls «rand()» break recomputation guarantees?', ['rand() is slow', 'A recomputed partition gets different random values than the original, so results become inconsistent', 'Spark forbids rand()', 'It uses too much memory'], 1, 'Use seeded or hash-based values when determinism matters.'),
      tf('Speculative execution launches a duplicate of a slow task and keeps the first result to finish.', true, 'The commit protocol makes sure only one attempt\'s output is committed.'),
    ],
  }),

  // ================================================================== Spark SQL and the optimiser
  sparksql: T(`
    > **In one line:** Spark SQL lets you query DataFrames and tables with SQL, and every DataFrame or SQL query goes through the **Catalyst optimiser** (analysis → logical optimisation → physical planning → code generation) and, at runtime, **Adaptive Query Execution (AQE)**, which re-plans using real statistics.

    ## The pipeline of a query
    «««flow
    SQL / DataFrame code -> Unresolved logical plan -> Analysis (resolve tables, columns, types via catalog) -> Optimised logical plan (rules) -> Physical plans (strategies, cost) -> Selected physical plan -> Whole-stage codegen -> Execution (+ AQE re-optimisation at stage boundaries)
    »»»

    ## Key Catalyst optimisations
    - **Predicate pushdown:** filters moved as early as possible, even into the file reader (Parquet row-group skipping) or the JDBC source.
    - **Column pruning (projection pushdown):** read only needed columns.
    - **Constant folding, boolean simplification, null propagation.**
    - **Partition pruning:** skip partitions from filters on partition columns; **dynamic partition pruning** uses filter results from a dimension to skip fact partitions at runtime.
    - **Join reordering** (cost-based optimiser with table statistics).
    - **Join strategy selection.**

    ## Join strategies
    | Strategy | How | When chosen |
    |---|---|---|
    | **Broadcast hash join** | Small side sent to every executor; big side not shuffled | Small side below «spark.sql.autoBroadcastJoinThreshold» (10 MB default) or with a broadcast hint |
    | **Shuffle hash join** | Both sides shuffled; hash table built on the smaller side per partition | Medium sizes, when preferred |
    | **Sort-merge join** | Both sides shuffled and sorted by key, then merged | Default for large-large equi-joins |
    | **Broadcast nested loop / cartesian** | Compare every pair | Non-equi joins without keys: dangerous on big data |

    ## Adaptive Query Execution (AQE, Spark 3+, on by default)
    At each shuffle boundary Spark looks at **actual** sizes and adapts:
    - **Coalesce shuffle partitions:** merge many small partitions into fewer reasonable ones.
    - **Switch join strategy:** turn a planned sort-merge join into a broadcast join if one side turned out small.
    - **Skew join handling:** split oversized partitions into smaller tasks.

    ## Reading «explain()»
    «df.explain("formatted")» shows the physical plan. Look for: «FileScan … PushedFilters: […]» and «ReadSchema» (pushdown and pruning working?), «BroadcastHashJoin» vs «SortMergeJoin», «Exchange» (each is a shuffle), «AdaptiveSparkPlan isFinalPlan=true» after execution.

    ## Things that block optimisation
    - Python UDFs (opaque; filters after them cannot be pushed past them).
    - Casting or wrapping partition/filter columns in functions.
    - Missing table statistics for the cost-based optimiser («ANALYZE TABLE … COMPUTE STATISTICS»).
    - Joins with non-equality conditions (nested loops).
    - Reading CSV/JSON (little pushdown) instead of Parquet/Delta.

    ## How interviewers test this
    - "How does Spark decide which join to use? How do you force a broadcast?" Threshold, statistics, AQE, «broadcast()» hint.
    - "What does AQE do?"
    - "What is predicate pushdown and how do you check it happened?"
  `, {
    check: [
      match('Match the join strategy to when it fits.', [['Broadcast hash join', 'One side is small enough to copy to every executor'], ['Sort-merge join', 'Two large tables joined on equality keys'], ['Nested loop join', 'Non-equality join conditions (dangerous at scale)']], 'Join strategy is often the biggest performance lever.'),
      mcq('Which AQE feature turns a planned sort-merge join into a broadcast join?', ['Partition coalescing', 'Dynamic join strategy switching after seeing the real size of one side', 'Skew handling', 'Codegen'], 1, 'AQE re-plans with runtime statistics at shuffle boundaries.'),
      mcq('In «explain()» output, what does each «Exchange» node usually mean?', ['A cache', 'A shuffle', 'A file write', 'A broadcast only'], 1, 'Count Exchanges to count shuffles (BroadcastExchange is a broadcast).'),
      tf('A filter applied after a Python UDF can always be pushed down below the UDF by Catalyst.', false, 'UDFs are opaque and can block pushdown and other optimisations.'),
    ],
    hands: [
      spark({ q: `Force a **broadcast join**: join «claims» to the small «dealers» table using «F.broadcast(dealers)», keep claims from the **West** region, and return «claim_id, dealer_name, claim_amount». Call «result.explain()» and look for the broadcast join in the plan.`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
result = (claims.join(F.broadcast(dealers), "dealer_id")
  .filter(F.col("region") == "West")
  .select("claim_id", "dealer_name", "claim_amount"))
result.explain()`, hint: 'claims.join(F.broadcast(dealers), "dealer_id")' }),
    ],
  }),

  // ================================================================== Structured Streaming
  sss: T(`
    > **In one line:** Spark **Structured Streaming** treats a stream as an **unbounded table** that keeps growing: you write the same DataFrame/SQL code as for batch, and Spark runs it **incrementally**, usually as **micro-batches**, with **checkpointing**, **event-time windows**, **watermarks** and **exactly-once** sinks.

    ## The model
    - Input: a source table that grows (Kafka, files arriving in a folder, Delta tables, Event Hubs).
    - Query: transformations on it (filter, join, aggregate, windows).
    - Result table: updated after each **trigger**; written to a sink in an **output mode**.

    ## The essential pieces
    | Piece | What | Options |
    |---|---|---|
    | **Source** | Where data comes from | Kafka, Event Hubs, files/Auto Loader, Delta, rate (testing) |
    | **Trigger** | When to run a micro-batch | Default (as fast as possible), «processingTime='10 seconds'», «availableNow=True» (process everything available then stop: incremental batch), continuous (experimental) |
    | **Output mode** | What gets written | **append** (only new final rows), **update** (changed rows), **complete** (whole result each time) |
    | **Checkpoint** | Offsets, commits, state | «checkpointLocation» per query, never shared |
    | **Sink** | Where results go | Delta (exactly-once), Kafka, files, «foreachBatch» (any batch writer, e.g. MERGE) |
    | **Watermark** | How late data may be | «withWatermark("event_ts", "10 minutes")» |
    | **State** | Data kept across batches | Aggregations, dedup, stream-stream joins, flatMapGroupsWithState/transformWithState |

    ## Event-time windows and watermarks
    «««python
    (readings
      .withWatermark("ts", "10 minutes")
      .groupBy(F.window("ts", "5 minutes"), "engine_id")
      .agg(F.avg("temperature_c").alias("avg_temp")))
    »»»
    - Each 5-minute window per engine is kept in state until the watermark (max event time seen − 10 min) passes its end; then it is finalised (emitted in append mode) and its state dropped.
    - Records older than the watermark are dropped (or handled separately).
    - Without a watermark, aggregation state grows forever.

    ## Common patterns
    - **Bronze ingestion:** Kafka → parse → append to Delta, with checkpoint (exactly-once).
    - **Silver upserts:** «foreachBatch» with a MERGE into Delta (dedupe within the batch first; MERGE is idempotent per batchId if designed so).
    - **Stream-static join:** enrich events with a dimension table (re-read each batch if it is a Delta table).
    - **Stream-stream join:** requires watermarks on both sides and a time-range condition to bound state.
    - **Dedup:** «dropDuplicatesWithinWatermark("event_id")».
    - **Incremental batch:** «trigger(availableNow=True)» run by a scheduler: streaming semantics, batch cost.

    ## Monitoring
    «query.lastProgress» / Streaming UI: input rows/s, processed rows/s, batch duration, **state rows and memory**, watermark, **Kafka lag** (offsets behind latest). Alert when processing rate < input rate or batch duration > trigger interval.

    ## Edge cases and what goes wrong
    - **Changing the query** (new aggregation, different keys) incompatible with the checkpoint → restart fails or state is wrong; plan migrations.
    - **Sharing a checkpoint** between two queries corrupts both.
    - **Small files** from frequent triggers: compaction/optimize, larger trigger intervals, auto-optimize.
    - **foreachBatch not idempotent** → duplicates on retry; use the batchId or MERGE.
    - **State explosion** from high-cardinality keys without watermarks.
    - **Kafka retention shorter than downtime** → data loss on restart.

    ## How interviewers test this
    - "How does Structured Streaming achieve exactly-once?"
    - "Explain watermarks and output modes."
    - "How do you upsert a stream into a Delta table?" foreachBatch + MERGE, deduped per key.
    - "availableNow trigger: why use it?"
  `, {
    check: [
      mcq('Which output mode emits only finalised rows of a windowed aggregation once the watermark passes the window end?', ['complete', 'update', 'append', 'overwrite'], 2, 'Append needs a watermark for aggregations so Spark knows when a window is final.'),
      mcq('How do you upsert (MERGE) streaming changes into a Delta table?', ['writeStream.format("delta").outputMode("update")', 'foreachBatch with a deduplicated MERGE per micro-batch', 'A plain append', 'It is impossible'], 1, 'foreachBatch gives you batch APIs such as MERGE.'),
      tf('Two streaming queries can safely share the same checkpoint location.', false, 'Each query needs its own checkpoint; sharing corrupts progress.'),
      mcq('What does «trigger(availableNow=True)» do?', ['Runs continuously forever', 'Processes all data available now (in batches) and then stops: streaming semantics with batch-style scheduling', 'Disables checkpoints', 'Only reads new files after now'], 1, 'Great for cost-efficient incremental jobs on a schedule.'),
    ],
    hands: [
      spark({ q: `Batch rehearsal of a streaming aggregation: from «sensor_readings», compute per **engine_id** and **1-hour tumbling window** of «ts» the average «temperature_c» (rounded to 1 dp) as «avg_temp» and the max as «max_temp». Use «F.window("ts", "1 hour")» and return «engine_id, window_start» (use «F.col("window").getField("start")»), «avg_temp, max_temp» for windows where «max_temp > 100», sorted by «engine_id», «window_start».`, starter: `r = spark.table("sensor_readings")\n\nresult = None\n`, solution: `r = spark.table("sensor_readings")
result = (r.groupBy("engine_id", F.window("ts", "1 hour"))
  .agg(F.round(F.avg("temperature_c"), 1).alias("avg_temp"), F.max("temperature_c").alias("max_temp"))
  .filter(F.col("max_temp") > 100)
  .select("engine_id", F.col("window").getField("start").alias("window_start"), "avg_temp", "max_temp")
  .orderBy("engine_id", "window_start"))`, hint: 'groupBy("engine_id", F.window("ts", "1 hour")).agg(...), then select F.col("window").getField("start").' }),
    ],
  }),
};
