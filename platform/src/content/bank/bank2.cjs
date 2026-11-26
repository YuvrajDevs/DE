// Practice banks: streaming, modelling, python, spark.
const { mcq, tf, multi, order, match, sql, py, spark, scenario, talk, bug } = require('../_h.cjs');

module.exports = {
  // ================================================================== STREAMING / KAFKA / IoT
  streaming: [
    mcq('Messages for one engine must be processed in order. What do you use as the Kafka message key?', ['A random UUID', 'The engine id', 'The timestamp', 'No key'], 1, 'Same key → same partition → order preserved for that engine.'),
    mcq('A topic has 3 partitions; a consumer group has 1 consumer. Then you add 2 more consumers. What happens?', ['Nothing changes', 'A rebalance gives each consumer one partition, so throughput can roughly triple', 'Messages are duplicated to all 3', 'Kafka adds partitions'], 1),
    mcq('Your consumer processes a message, crashes before committing the offset, then restarts. What happens to that message?', ['It is lost', 'It is processed again (at-least-once)', 'Kafka skips it', 'It goes to a DLQ automatically'], 1, 'So processing must be idempotent (dedupe by event id).'),
    mcq('What does a watermark of 10 minutes do in Spark Structured Streaming?', ['Delays all output by 10 minutes', 'Says how late an event may arrive and still be counted; state older than that can be dropped', 'Sets the trigger interval', 'Limits throughput'], 1),
    mcq('An event arrives 3 hours late with a watermark of 10 minutes. In an append-mode window aggregation it is:', ['Added to its window', 'Dropped, because its window has already been finalised', 'Added to the current window', 'Stored in a DLQ automatically'], 1, 'Decide deliberately: longer watermark (more state) or a batch correction job.'),
    tf('Exactly-once end-to-end needs a replayable source, checkpointing and an idempotent or transactional sink.', true),
    tf('Increasing a topic\'s partition count keeps every key on the same partition as before.', false, 'Key → partition is hash(key) mod N; changing N moves keys. Plan partitions up front.'),
    match('Match the term to its meaning.', [['Offset', 'Position of a message in a partition'], ['Consumer group', 'Consumers sharing the work of a topic'], ['Consumer lag', 'How far consumers are behind the newest message'], ['Dead-letter topic', 'Where messages that keep failing are sent']]),
    multi('Which belong in a streaming pipeline\'s checkpoint folder?', ['Which offsets were processed', 'State for aggregations / dedupe', 'The final output data', 'Commit logs for batches'], [0, 1, 3], 'Output goes to the sink; the checkpoint tracks progress and state.'),
    order('Put the path of one IoT reading in order.', ['Device sends the reading', 'Producer publishes to Kafka with key = device id', 'Stream job reads, parses and validates (bad → dead-letter)', 'Deduplicate by event id within a watermark', 'Write to a Delta table and update aggregates/alerts']),
    mcq('You delete the checkpoint folder of a running stream and restart it. What happens?', ['Nothing', 'It forgets its progress: it re-reads from the configured starting offset, which may duplicate or skip data', 'It resumes normally', 'Kafka deletes the topic'], 1),
    mcq('Event time vs processing time: an order placed 23:59 arrives at 00:03. Which day should it count in?', ['The day it arrived (processing time)', 'The day it was placed (event time)', 'Both', 'Neither'], 1),
    scenario('Consumer lag keeps growing', 'Lag on the sensor topic grows all day and alerts fire. CPU on consumers is at 95%.', [
      ['First move?', [
        ['Check whether lag is on all partitions or one, and what each consumer spends time on', true, 'All partitions → under-provisioned; one → hot key or a stuck consumer.'],
        ['Delete old messages to reduce lag', false, 'You lose data and fix nothing.'],
      ]],
      ['Lag is spread across all partitions. Fix?', [
        ['Scale consumers up to the partition count (and add partitions for future headroom), or make processing cheaper per message', true, 'Parallelism is capped by partitions.'],
        ['Increase retention', false, 'Buys time only.'],
      ]],
    ]),
    scenario('Duplicates after a crash', 'After a consumer crashed and restarted, a dashboard shows some alerts twice.', [
      ['Why?', [
        ['At-least-once delivery: messages processed before the crash but not committed were processed again', true, 'Expected behaviour; the sink must handle it.'],
        ['Kafka is corrupt', false, 'Kafka worked as designed.'],
      ]],
      ['Robust fix?', [
        ['Deterministic event ids + idempotent writes (MERGE on id, or dedupe within a watermark)', true, 'This is how exactly-once is achieved in practice.'],
        ['Commit offsets before processing', false, 'Then a crash loses messages (at-most-once).'],
      ]],
    ]),
    scenario('One poison message stops everything', 'A stream stopped processing an hour ago. Logs show the same parse error repeating for one message.', [
      ['What is happening?', [
        ['The job retries one malformed message forever and can\'t move past it', true, 'Classic poison pill.'],
        ['Kafka is down', false, 'Kafka is fine.'],
      ]],
      ['Fix?', [
        ['Route messages that fail parsing to a dead-letter table/topic with the error, and keep processing the rest; alert on DLQ volume', true, 'One bad message must never block millions of good ones.'],
        ['Delete the topic', false, 'Destroys data.'],
      ]],
    ]),
    scenario('Late sensor data after a network outage', 'A site lost connectivity for 6 hours; its devices then sent 6 hours of buffered readings at once.', [
      ['With a 10-minute watermark, what happens to those readings in your 1-minute window aggregates?', [
        ['Most are too late for their windows and are dropped from those aggregates', true, 'The raw events can still land in bronze/silver.'],
        ['They\'re all counted', false, 'Not past the watermark.'],
      ]],
      ['Best way to get correct historical aggregates?', [
        ['Keep raw events in bronze and run a batch correction (recompute the affected windows) after outages', true, 'Lambda-style correction: stream for speed, batch for completeness.'],
        ['Set the watermark to 1 week permanently', false, 'Huge state and slow output for a rare event.'],
      ]],
    ]),
    bug('This consumer loses messages when it crashes. Click the line that causes it.', `for msg in consumer:
    consumer.commit()
    event = parse(msg.value)
    write_to_db(event)`, [2], 'Committing **before** processing: if the process dies after commit, the message is never processed (at-most-once). Process and write first, then commit.'),
    talk('*"Explain how you achieved exactly-once in your project."*', `
      - Kafka is replayable; Spark checkpoints record processed offsets and state.
      - Each event has a deterministic id (uuid5 of engine + cycle), so a re-sent event is recognisable.
      - Silver deduplicates on that id within a watermark; gold uses an idempotent MERGE.
      - Delta commits are atomic, so a batch is fully written or not at all.
      - Proof: killed the job with kill -9 mid-stream with chaos data, then compared every id in silver with the producer manifest: 0 missing, 0 duplicated.
    `),
    talk('*"How would you design a pipeline for 10,000 IoT devices sending a reading every second?"*', `
      - ~10k events/s, plan for 2× peaks; ~1 KB each → ~10 MB/s, ~800 GB/day raw.
      - Kafka (or Event Hubs) with enough partitions for consumer parallelism (e.g. 24-48), key = device id.
      - Stream processing: validate, dead-letter bad events, dedupe by event id, watermark for late data.
      - Bronze raw, silver clean, gold aggregates/alerts; compaction for small files; retention policies.
      - Monitor lag, throughput, DLQ volume, freshness; batch correction for long outages.
    `),
    talk('*"Batch or streaming: how do you decide?"*', `
      - Ask how fresh the data must be for the decision it drives. Hours → batch; seconds/minutes → streaming.
      - Streaming costs more to build and run (state, monitoring, late data).
      - Many use cases need micro-batch (every 5-15 minutes) rather than true streaming.
    `),
  ],

  // ================================================================== DATA MODELLING
  modelling: [
    mcq('A fact table stores one row per order line. A report sums «order_shipping_fee» (an order-level value repeated on each line). Result?', ['Correct', 'Shipping is over-counted: multiplied by the number of lines', 'Under-counted', 'NULL'], 1, 'Mixed grain. Keep order-level measures in an order-level fact, or allocate them across lines.'),
    mcq('Which is a **degenerate dimension**?', ['A dimension with no rows', 'An identifier like order_number kept in the fact table with no dimension table of its own', 'A broken dimension', 'A dimension updated daily'], 1),
    mcq('A customer moves from Pune to Mumbai. Reports must show past sales under Pune. Which SCD type?', ['Type 1 (overwrite)', 'Type 2 (new row with valid_from / valid_to)', 'No SCD', 'Type 0'], 1),
    mcq('In an SCD2 dimension, how does a fact row find the right version?', ['By natural key only', 'By the surrogate key captured at load time (or natural key + event date between valid_from and valid_to)', 'Randomly', 'By the latest version always'], 1),
    tf('A good surrogate key carries business meaning (e.g. region code + number).', false, 'Surrogate keys are meaningless and stable; business meaning belongs in attributes.'),
    tf('Snowflaking (normalising dimensions) usually makes BI queries simpler.', false, 'More joins; stars are usually preferred for analytics.'),
    match('Match the fact type.', [['Every sale as it happens', 'Transaction fact'], ['Inventory level per day', 'Periodic snapshot'], ['A claim\'s submitted, approved, paid dates in one row', 'Accumulating snapshot'], ['Which promotions applied, no measures', 'Factless fact']]),
    multi('Which are additive measures (safe to sum across every dimension)?', ['Sales amount', 'Quantity sold', 'Account balance (across time)', 'Unit price', 'Discount percentage'], [0, 1], 'Balances are semi-additive (not across time); prices and percentages are non-additive.'),
    sql({ q: 'Star-schema query: total **claim amount per dealer region**. Join «claims» to «dealers». Return «region, total» (rounded to 2 decimals), biggest first.', tables: ['claims', 'dealers'], solution: 'SELECT d.region, ROUND(SUM(c.claim_amount), 2) AS total FROM claims c JOIN dealers d ON d.dealer_id = c.dealer_id GROUP BY d.region ORDER BY total DESC;', ordered: true }),
    sql({ q: 'Grain check: is «claims» really one row per claim? Return the number of rows and the number of distinct «claim_id»s as «row_count, distinct_claims».', tables: ['claims'], solution: 'SELECT COUNT(*) AS row_count, COUNT(DISTINCT claim_id) AS distinct_claims FROM claims;' }),
    sql({ q: 'SCD2 lookup: «dim_customer_scd2» keeps history. Return the **current** row for each customer (where «is_current» = 1): «customer_id, segment».', tables: ['dim_customer_scd2'], solution: 'SELECT customer_id, segment FROM dim_customer_scd2 WHERE is_current = 1;' }),
    order('Put dimensional design steps in order (Kimball).', ['Pick the business process (e.g. warranty claims)', 'Declare the grain (one row per claim)', 'Identify the dimensions (dealer, date, product, customer)', 'Identify the facts (amounts, counts)']),
    scenario('Revenue doesn\'t match finance', 'Your star-schema revenue is 4% higher than finance\'s number.', [
      ['Most common modelling causes?', [
        ['A join that fans out (one-to-many with a dimension that has duplicates), or a measure summed at the wrong grain', true, 'Fan-out joins and mixed grain are the classic over-count bugs.'],
        ['Rounding', false, 'Rarely 4%.'],
      ]],
      ['The product dimension has 2 current rows for some products after a failed SCD2 update. Fix?', [
        ['Repair the dimension so each key has exactly one current row, and add a uniqueness test on (natural key, is_current)', true, 'Fix the data and guard the invariant.'],
        ['Use MAX() in the report', false, 'Hides it.'],
      ]],
    ]),
    scenario('Facts arrive before their dimension', 'Claims arrive for a dealer that isn\'t in the dealer dimension yet (it arrives tomorrow).', [
      ['What do you do with today\'s claims?', [
        ['Load them pointing at a placeholder/"unknown" dealer row (or an inferred member), and update when the dealer arrives', true, 'Late-arriving dimension handling: never drop facts.'],
        ['Drop the claims', false, 'Data loss.'],
      ]],
    ]),
    bug('This SCD2 update sometimes leaves two "current" rows for a customer. Click the problem line.', `UPDATE dim_customer SET is_current = 0, valid_to = :today
WHERE customer_id IN (SELECT customer_id FROM changes);
INSERT INTO dim_customer SELECT *, :today, NULL, 1 FROM changes;
-- runs as two separate jobs on different schedules`, [4], 'The close (UPDATE) and the insert must run together atomically (one transaction / one MERGE). Run separately, a failure between them leaves two current rows or none.', 'sql'),
    talk('*"How do you choose the grain of a fact table?"*', `
      - Start from the business process and the questions it must answer.
      - Choose the most detailed (atomic) grain you can get: you can always aggregate up, never down.
      - Write it as one sentence ("one row per claim per component") and keep every measure true at that grain.
      - Measures at a different grain go into their own fact table.
    `),
    talk('*"Star schema vs one big table vs Data Vault?"*', `
      - **Star:** facts + dimensions; the default for analytics and BI.
      - **One big table:** pre-joined and wide; simple for dashboards and ML, but duplicated and hard to change.
      - **Data Vault:** hubs, links, satellites; great for many changing sources and auditability, usually as a raw layer under stars.
    `),
  ],

  // ================================================================== PYTHON
  python: [
    mcq('What does this print? «x = [1, 2]; y = x; y.append(3); print(x)»', ['[1, 2]', '[1, 2, 3]', 'Error', '[3]'], 1, 'y and x point to the same list.'),
    mcq('Why is «def add(item, items=[])» a bug?', ['Syntax error', 'The default list is created once and shared between calls, so items pile up', 'It\'s slow', 'Nothing'], 1, 'Use items=None, then items = items or [].'),
    mcq('Reading a 40 GB CSV in Python. Best approach?', ['f.read() into one string', 'Iterate line by line (or in chunks) with a generator', 'Load into a list first', 'Convert to JSON first'], 1),
    tf('A dict lookup by key is about as fast for 10 million keys as for 10.', true, 'Average O(1) hashing.'),
    tf('«except Exception: pass» is a good way to make a pipeline robust.', false, 'It hides failures; catch specific errors, log them, and decide (retry, quarantine, fail).'),
    mcq('An API returns HTTP 429. What should a client do?', ['Retry immediately in a tight loop', 'Back off (respect Retry-After), then retry', 'Give up forever', 'Switch to HTTP'], 1),
    match('Match the tool to the job.', [['Count occurrences', 'collections.Counter'], ['Group into lists by key', 'collections.defaultdict(list)'], ['Process a huge file lazily', 'Generator / yield'], ['Read a CSV into dicts', 'csv.DictReader']]),
    py({ q: 'Write «chunks(items, size)» that yields lists of at most «size» items. «list(chunks([1,2,3,4,5], 2))» → «[[1,2],[3,4],[5]]».', starter: 'def chunks(items, size):\n    pass\n', tests: `assert list(chunks([1, 2, 3, 4, 5], 2)) == [[1, 2], [3, 4], [5]]
assert list(chunks([], 3)) == []
assert list(chunks([1, 2], 5)) == [[1, 2]]`, solution: `def chunks(items, size):
    batch = []
    for x in items:
        batch.append(x)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch` }),
    py({ q: 'Write «parse_lines(lines)» for JSON-lines input: return a tuple «(good, bad)» where «good» is the list of parsed dicts and «bad» is the list of line numbers (1-based) that are not valid JSON objects.', starter: 'import json\n\ndef parse_lines(lines):\n    pass\n', tests: `good, bad = parse_lines(['{"a": 1}', 'oops', '{"b": 2}', '[1, 2]'])
assert good == [{'a': 1}, {'b': 2}], good
assert bad == [2, 4], bad`, solution: `import json

def parse_lines(lines):
    good, bad = [], []
    for n, line in enumerate(lines, 1):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            bad.append(n)
            continue
        if isinstance(obj, dict):
            good.append(obj)
        else:
            bad.append(n)
    return good, bad` }),
    py({ q: 'Write «retry(fn, attempts)» that calls «fn()» up to «attempts» times and returns its result; if every attempt raises, re-raise the last exception. (No sleeping needed here.)', starter: 'def retry(fn, attempts):\n    pass\n', tests: `calls = {'n': 0}
def flaky():
    calls['n'] += 1
    if calls['n'] < 3:
        raise ValueError('boom')
    return 'ok'
assert retry(flaky, 5) == 'ok' and calls['n'] == 3
try:
    retry(lambda: 1 / 0, 2)
    assert False, 'should raise'
except ZeroDivisionError:
    pass`, solution: `def retry(fn, attempts):
    last = None
    for _ in range(attempts):
        try:
            return fn()
        except Exception as e:
            last = e
    raise last` }),
    py({ q: 'Write «flatten(d)» that flattens nested dicts with dotted keys: «{"a": 1, "b": {"c": 2, "d": {"e": 3}}}» → «{"a": 1, "b.c": 2, "b.d.e": 3}».', starter: 'def flatten(d, prefix=""):\n    pass\n', tests: `assert flatten({'a': 1, 'b': {'c': 2, 'd': {'e': 3}}}) == {'a': 1, 'b.c': 2, 'b.d.e': 3}
assert flatten({}) == {}`, solution: `def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        else:
            out[key] = v
    return out` }),
    scenario('The script runs out of memory', 'A Python job that reads a daily file worked for months, then started crashing with MemoryError as files grew to 20 GB.', [
      ['Cause?', [
        ['It loads the whole file into memory at once', true, 'Fine for small files, fatal for big ones.'],
        ['Python has a 20 GB limit', false, 'No such limit.'],
      ]],
      ['Fix?', [
        ['Stream it: process line by line or in chunks with generators, or move the job to Spark if it needs joins/aggregations at scale', true, 'Constant memory regardless of file size.'],
        ['Buy more RAM every month', false, 'Doesn\'t scale.'],
      ]],
    ]),
    scenario('An API extract is missing pages', 'An extract from a paginated API returns 4,000 records but the API says total = 5,200.', [
      ['Likely bug?', [
        ['Pagination stops early (e.g. stops on a short page, or the next-page token is ignored), or records shift between pages while reading', true, 'Classic pagination bugs.'],
        ['The API is lying', false, 'Check your loop first.'],
      ]],
      ['Robust approach?', [
        ['Follow the next-page cursor until it\'s empty, retry failed pages with backoff, and compare the final count with the API\'s total', true, 'Cursor + retries + reconciliation.'],
        ['Request page size 1,000,000', false, 'Usually rejected and fragile.'],
      ]],
    ]),
    bug('This function is called once per file. After a few files, results contain rows from earlier files. Click the cause.', `def clean(rows, seen=set()):
    out = []
    for r in rows:
        if r["id"] not in seen:
            seen.add(r["id"])
            out.append(r)
    return out`, [1], 'The default «seen=set()» is created once and shared across calls. Use «seen=None» and create a new set inside.'),
    talk('*"How do you write production-quality Python for pipelines?"*', `
      - Small pure functions for transformations, unit-tested.
      - Config and secrets from the environment, not hard-coded.
      - Logging instead of print; specific exception handling; retries with backoff for network calls.
      - Stream big files; idempotent outputs; type hints and linting in CI.
    `),
  ],

  // ================================================================== SPARK
  spark: [
    mcq('Which of these triggers a Spark job to actually run?', ['filter()', 'withColumn()', 'count()', 'select()'], 2, 'Transformations are lazy; actions (count, show, write, collect) run them.'),
    mcq('You call «df.collect()» on a 500 GB DataFrame. What happens?', ['It\'s fast', 'All data is pulled to the driver, which runs out of memory', 'It writes to disk', 'It samples 1%'], 1),
    mcq('Which operation causes a shuffle?', ['filter', 'select', 'groupBy().agg()', 'withColumn'], 2, 'Wide transformations (groupBy, join, distinct, repartition) move data between executors.'),
    mcq('One task takes 40 minutes while the other 199 take 30 seconds. Most likely?', ['Too few executors', 'Data skew: one key holds far more rows than the rest', 'A bad network', 'Not enough partitions overall'], 1, 'Fixes: salting the hot key, AQE skew join, or handling the hot key separately.'),
    mcq('coalesce(10) vs repartition(10)?', ['Same', 'coalesce reduces partitions without a full shuffle; repartition does a full shuffle and can increase or balance them', 'repartition is always cheaper', 'coalesce increases partitions'], 1),
    tf('A Python UDF is usually slower than an equivalent built-in Spark function.', true, 'Rows must be serialised to Python and back; built-ins run in the JVM optimiser.'),
    tf('cache() makes every DataFrame faster.', false, 'Only helps when reused several times; otherwise it wastes memory.'),
    match('Match the problem to the fix.', [['Small dimension joined to a huge fact', 'Broadcast join'], ['One giant key dominates a join', 'Salting / AQE skew handling'], ['Thousands of tiny output files', 'Coalesce before writing / compaction'], ['Same DataFrame reused in 5 actions', 'Cache / persist']]),
    multi('Why might a Spark job spill to disk?', ['Partitions too large for executor memory', 'A wide aggregation with many keys', 'Too much caching', 'Using filter()'], [0, 1, 2]),
    spark({ q: 'From «claims», count claims **per status**, sorted by count descending. Assign the result to «result» with columns «status, n».', tables: ['claims'], starter: 'df = spark.table("claims")\nresult = ', solution: 'df = spark.table("claims")\nresult = df.groupBy("status").agg(F.count("*").alias("n")).orderBy(F.desc("n"))', ordered: true }),
    spark({ q: 'Latest event per order: from «raw_orders_feed», keep only the row with the newest «updated_at» for each «order_id». Assign to «result» with columns «order_id, status, amount».', tables: ['raw_orders_feed'], solution: 'w = Window.partitionBy("order_id").orderBy(F.desc("updated_at"))\nresult = (spark.table("raw_orders_feed").withColumn("rn", F.row_number().over(w))\n          .filter("rn = 1").select("order_id", "status", "amount"))' }),
    spark({ q: 'Join «claims» to «dealers» and compute the **average claim amount per region** (rounded to 2 decimals). Assign to «result» with columns «region, avg_amount».', tables: ['claims', 'dealers'], solution: 'c = spark.table("claims")\nd = spark.table("dealers")\nresult = (c.join(d, "dealer_id").groupBy("region")\n          .agg(F.round(F.avg("claim_amount"), 2).alias("avg_amount")))' }),
    scenario('Executor out of memory', 'A Spark job fails with "ExecutorLostFailure ... OutOfMemoryError" during a join.', [
      ['What do you check?', [
        ['The Spark UI: which stage fails, partition sizes, skew in task input sizes, and whether a large table is being broadcast', true, 'Find where memory blows up before changing settings.'],
        ['Increase driver memory', false, 'It\'s the executors failing.'],
      ]],
      ['A few tasks read 20× more data than others (skew on customer_id). Fix?', [
        ['Enable AQE skew join, or salt the hot keys, or handle the hot keys separately', true, 'Spread the hot key over many tasks.'],
        ['Use collect() and join in Python', false, 'Moves the problem to the driver.'],
      ]],
    ]),
    scenario('The job is slow and the plan shows a huge scan', 'A query on a 3-year table that filters to one day takes 20 minutes.', [
      ['What does the plan probably show?', [
        ['No partition pruning: it scans all files because the filter doesn\'t match the partition column (or wraps it in a function)', true, 'Check PartitionFilters in explain().'],
        ['A broadcast join', false, 'Not the issue.'],
      ]],
      ['Fix?', [
        ['Filter directly on the partition column with the right type (and partition by date if it isn\'t)', true, 'Read one day, not three years.'],
        ['Add more executors', false, 'Reads three years faster, still wasteful.'],
      ]],
    ]),
    bug('This job is slow on a big table. Click the line that should go.', `df = spark.read.parquet("s3://lake/events/")
rows = df.collect()
cleaned = [r for r in rows if r["amount"] > 0]
spark.createDataFrame(cleaned).write.parquet("s3://lake/clean/")`, [2], '«collect()» pulls everything to the driver and loses parallelism. Use «df.filter(F.col("amount") > 0).write.parquet(...)».'),
    talk('*"How do you tune a slow Spark job?"*', `
      - Look first: Spark UI (stages, task times, shuffle sizes, spill) and explain() (pruning, join types).
      - Read less: partition pruning, column pruning, filter early, columnar formats.
      - Shuffle less: broadcast small tables, avoid unnecessary distinct/repartition.
      - Fix skew: AQE, salting, separate hot keys.
      - Right-size partitions (~100-200 MB) and output files; cache only reused data.
    `),
    talk('*"Explain lazy evaluation."*', `
      - Transformations build a plan (a DAG) without running anything.
      - An action (count, write, collect) makes Spark optimise the whole plan and run it.
      - Benefit: the optimiser can push filters down, prune columns, and combine steps.
      - Catch: an action re-runs the plan each time unless you cache or write intermediate results.
    `),
  ],
};
