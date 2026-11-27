const { T, mcq, tf, multi, scenario, talk, sql, py, order, match, bug } = require('./_t.cjs');

module.exports = {
  // ================================================================== DataFrame libraries
  pydf: T(`
    > **In one line:** pick the engine by **data size, latency and where the data lives**: **pandas** for small, in-memory, ecosystem-heavy work; **Polars** and **DuckDB** for fast single-machine analytics up to hundreds of GB (columnar, multi-threaded, lazy/vectorised); **PySpark** when data or throughput exceeds one machine or the platform (Databricks) is Spark. The concepts transfer; the memory models do not.

    ## Comparison
    | | pandas | Polars | DuckDB | PySpark |
    |---|---|---|---|---|
    | Execution | Eager, mostly single-threaded | Eager or **lazy** (query optimiser), multi-threaded, Rust | SQL engine in-process, vectorised, multi-threaded | Lazy, distributed over a cluster |
    | Memory | Whole frame in RAM, often 5-10× the file size | Arrow columnar, much leaner; streaming engine for larger-than-RAM | Spills to disk, larger-than-RAM OK | Distributed; spills; scales out |
    | Sweet spot | < ~1-5 GB, notebooks, ML prep, glue code | 1-100+ GB on one machine | Ad-hoc SQL on Parquet/CSV, tests, local lakehouse | 100 GB → PB, production on Databricks |
    | Index | Row index (source of many bugs) | None | None | None |
    | API style | Imperative, chained | Expression-based («pl.col») | SQL | DataFrame + SQL |

    ## Why pandas uses so much memory
    - Object dtype strings (each a Python object), copies on many operations, the index, and int64/float64 defaults. A 1 GB CSV can need 5-10 GB of RAM.
    - Mitigations: «dtype=» with «category» for low-cardinality strings, «int32/float32», the «pyarrow» backend («dtype_backend='pyarrow'»), «usecols=», chunking. Or switch engine.

    ## Vectorise, never loop
    «df.apply(lambda r: …, axis=1)» and «iterrows()» run Python per row: 100-1000× slower than a vectorised expression («df['margin'] = df.approved - df.cost», «np.where», «.str» and «.dt» accessors). The same principle in Spark is "built-in functions over UDFs".

    ## Lazy evaluation and query optimisation
    Polars «scan_parquet(...).filter(...).group_by(...).agg(...).collect()» and DuckDB SQL both see the **whole query** before running it, so they push filters and column selection into the Parquet scan, exactly like Spark. pandas cannot: «read_parquet» loads everything, then you filter.

    ## pandas gotchas that cause wrong numbers
    - **Index alignment:** adding two Series aligns on index labels, not position; mismatched indexes produce NaN.
    - «groupby» drops NaN keys by default («dropna=False» to keep them).
    - «merge» defaults to an inner join and silently fans out on duplicate keys; use «validate='many_to_one'» to make it raise.
    - Integer columns with missing values become float (use nullable «Int64»).
    - Chained assignment (fixed by copy-on-write in pandas 3).
    - «to_datetime» guessing formats; time-zone-naive vs aware comparisons raise.

    ## Moving between them
    - Arrow is the common memory format: pandas ↔ Polars ↔ DuckDB ↔ Spark (with Arrow enabled, «toPandas()» / «createDataFrame(pandas_df)») convert columnar data cheaply.
    - «toPandas()» on a big Spark DataFrame **collects everything to the driver**: the classic driver OOM. Aggregate or sample first.
    - Write the logic as SQL or as pure functions over rows/columns and you can test it with DuckDB locally and run it on Spark in production.

    ## How interviewers test this
    - "You have a 30 GB Parquet dataset and a laptop. What do you use?" (DuckDB/Polars lazy scan, not pandas.)
    - "Why is «df.apply» slow?"
    - "When would you not use Spark?" (Small data: Spark's overhead and cluster cost are not worth it.)
  `, {
    check: [
      mcq('30 GB of Parquet, one laptop with 16 GB RAM, aggregate by engine. Best choice?', ['pandas.read_parquet then groupby', 'DuckDB or Polars lazy scan with column pruning and streaming', 'Python loops', 'Excel'], 1, 'Pushdown + columnar + spill.'),
      mcq('pandas «merge» of claims to dealers suddenly returns more rows than claims. Fastest guard?', ['Use outer join', 'merge(..., validate="many_to_one") so duplicate dealer keys raise', 'Sort first', 'Reset index'], 1, 'Turn silent fan-out into an error.'),
      tf('«spark_df.toPandas()» is a safe way to inspect any DataFrame regardless of size.', false, 'It collects to the driver; limit or aggregate first.'),
      mcq('Why is «df.apply(f, axis=1)» slow?', ['It uses the GPU', 'It calls a Python function once per row', 'It sorts the data', 'It writes to disk'], 1, 'Vectorise with column expressions.'),
    ],
    interview: [
      talk('When would you choose DuckDB or Polars over Spark for a pipeline at Cummins?', `
        - **Data size and growth:** if the daily input is a few GB and will stay under ~100 GB, a single-node engine is faster to start, cheaper and simpler to test.
        - **Latency:** no cluster start-up; good for small hourly jobs, data quality checks, local development and CI tests of SQL logic.
        - **Spark when:** data exceeds a machine, many concurrent jobs share a platform, Structured Streaming is needed, or Databricks governance (Unity Catalog), Delta MERGE at scale and job orchestration are the standard.
        - **Both:** write logic in SQL or Arrow-friendly code so it can move to Spark when it grows. Don't fight the platform standard without a cost or speed reason.`),
    ],
  }),

  // ================================================================== DBs and APIs
  pydb: T(`
    > **In one line:** extracting from databases and APIs is where pipelines meet other people's systems. Do it with **parameterised queries**, **batched reads and writes**, **pooled connections**, **pagination that cannot skip or repeat rows**, **rate-limit-aware retries**, and **checkpointed progress** so a failure restarts where it stopped.

    ## Databases from Python
    - **Parameterise** every query: «cur.execute('SELECT … WHERE dealer_id = %s', (dealer_id,))». String formatting invites SQL injection and breaks on quotes («O'Brien»). Identifiers (table names) cannot be parameters: validate them against an allow-list.
    - **Batch writes:** «executemany», «COPY» (Postgres), bulk insert APIs, or write Parquet and let the warehouse load it. Row-by-row inserts over a network are 100-1000× slower (one round trip each).
    - **Batch reads:** server-side cursors / «fetchmany» / chunked pandas reads. Never «fetchall()» on unknown sizes.
    - **Transactions:** a batch load should commit once at the end (or per chunk with a recorded checkpoint), not per row.
    - **Connection pooling:** opening a connection costs a TLS handshake and authentication (tens to hundreds of ms). Reuse via a pool (SQLAlchemy engine pool, psycopg_pool). In Spark, JDBC opens one connection per partition: «numPartitions» × executors can exhaust the source DB's connection limit; cap it.
    - **Read from a replica** or a snapshot for big extracts; never run heavy analytics queries on a production OLTP primary during business hours.

    ## Spark JDBC extracts
    «spark.read.jdbc(url, table, column='claim_id', lowerBound=1, upperBound=10_000_000, numPartitions=16)» splits the range into 16 parallel queries. Pitfalls: skewed ID ranges make one partition huge; «lowerBound/upperBound» do **not** filter (rows outside go to the edge partitions); predicate pushdown depends on the driver; use «fetchsize» to avoid tiny round trips.

    ## API pagination
    | Style | Works like | Risk |
    |---|---|---|
    | Offset / page number | «?page=7&size=100» | Inserts/deletes during paging shift rows: **duplicates or missed records**; deep offsets get slow |
    | Cursor / token | «?cursor=abc» returned by the previous page | Stable; the server tracks position. Preferred |
    | Keyset (seek) | «?updated_after=…&id_after=…» sorted by (updated_at, id) | Stable and resumable; needs a unique sort key |
    | Time window | «?from=…&to=…» | Late-arriving records in closed windows; use overlap + dedupe |
    Always dedupe by the record ID at the landing stage: paging is rarely perfect.

    ## Rate limits and quotas
    - Read the limits (requests/second, per-day quotas). Throttle client-side (token bucket) rather than relying on 429s.
    - On 429/503: backoff with jitter; honour «Retry-After».
    - Concurrency × rate: 16 threads each doing 5 req/s = 80 req/s. Size the pool to the limit.

    ## Resumable extraction
    Persist progress (last cursor, last «(updated_at, id)», list of finished pages/partitions) in a state store (a control table, a file, Airflow XCom is **not** for large state). On failure, restart from the checkpoint. Combined with idempotent landing (overwrite by extract window or upsert by ID), a rerun is always safe.

    ## Secrets
    Connection strings and API keys come from a secret store (Azure Key Vault, Databricks secret scopes, Airflow connections/backends, environment injected at runtime), **never** from code or notebooks committed to Git. Rotate them; log neither.

    ## How interviewers test this
    - "Pull 50 million rows from an on-prem SQL Server into the lake every night without hurting the source."
    - "An API paginates with page numbers and records change during the extract. What goes wrong and how do you fix it?"
    - "Why is inserting row by row slow?"
  `, {
    check: [
      mcq('Offset pagination over a table that receives inserts during the extract can…', ['Never cause problems', 'Skip or duplicate records as rows shift between pages', 'Only be slow', 'Corrupt the source'], 1, 'Use cursor or keyset pagination and dedupe by ID.'),
      mcq('Spark JDBC read with numPartitions=64 on 20 executors fails the source DB with "too many connections". Why?', ['A bug in JDBC', 'Each partition opens its own connection, so up to 64 concurrent connections hit the source', 'The table is too large', 'Spark uses UDP'], 1, 'Cap numPartitions to what the source can serve.'),
      tf('In Spark JDBC reads, lowerBound and upperBound filter out rows outside the range.', false, 'They only decide the stride; out-of-range rows land in the first/last partitions.'),
      mcq('Why parameterise queries instead of formatting strings?', ['Faster typing', 'Prevents SQL injection and quoting bugs; enables plan reuse', 'Required by Python', 'It compresses data'], 1, 'Identifiers still need an allow-list.'),
    ],
    hands: [
      py({ q: '**Keyset pagination that never skips or repeats.** «fetch_page(after, limit)» returns up to «limit» records (dicts with «updated_at» and «id») sorted by «(updated_at, id)» and strictly after the tuple «after» (None = from the start). Write «extract_all(fetch_page, limit, state)» that pages until an empty page, yields records, and records progress in «state["after"]» = the «(updated_at, id)» of the last record the consumer has **finished** (i.e. update it when the consumer comes back for the next record, not before handing a record out). A crash therefore re-delivers at most the in-flight record: at-least-once, which an idempotent sink turns into exactly-once. Start from «state.get("after")».', starter: 'def extract_all(fetch_page, limit, state):\n    pass\n',
        tests: `data = sorted([{'updated_at': t, 'id': i} for i, t in [(1, '10:00'), (2, '10:00'), (3, '10:01'), (4, '10:02'), (5, '10:02'), (6, '10:03')]], key=lambda r: (r['updated_at'], r['id']))
def fetch_page(after, limit):
    rows = [r for r in data if after is None or (r['updated_at'], r['id']) > after]
    return rows[:limit]
st = {}
assert [r['id'] for r in extract_all(fetch_page, 2, st)] == [1, 2, 3, 4, 5, 6]
assert st['after'] == ('10:03', 6)
st2 = {}
g = extract_all(fetch_page, 2, st2)
first3 = [next(g)['id'] for _ in range(3)]
assert first3 == [1, 2, 3] and st2['after'] == ('10:00', 2), st2   # record 3 is still in flight
assert [r['id'] for r in extract_all(fetch_page, 4, st2)] == [3, 4, 5, 6], 'resumes, re-delivering the in-flight record'`,
        solution: `def extract_all(fetch_page, limit, state):
    after = state.get('after')
    while True:
        page = fetch_page(after, limit)
        if not page:
            return
        for r in page:
            after = (r['updated_at'], r['id'])
            yield r
            state['after'] = after` }),
    ],
  }),

  // ================================================================== Testing
  pytest: T(`
    > **In one line:** data code is tested at three levels: **unit tests** of pure transformation logic on tiny handcrafted inputs, **integration tests** that run a pipeline step against real engines (local Spark, DuckDB, a test container), and **data tests** that run on production data every load (uniqueness, nulls, ranges, reconciliation). pytest is the tool for the first two.

    ## What to unit-test
    Separate **pure logic** (parse, validate, compute health score, dedupe, SCD decision) from **I/O** (read Kafka, write Delta). Pure functions are trivially testable; I/O wrappers stay thin. This is the single best design decision for testable pipelines (Turbofan's «events.py» is pure and has unit tests; the Spark jobs call it).

    ## pytest essentials
    «««python
    import pytest
    from telemetry.events import validate

    @pytest.mark.parametrize('event, reason', [
        ({'engine_id': 1, 'cycle': 5, 'sensors': {...}}, None),
        ({'cycle': 5}, 'MISSING_FIELD'),
        ({'engine_id': 1, 'cycle': -1, 'sensors': {...}}, 'OUT_OF_RANGE'),
    ])
    def test_validate(event, reason):
        assert validate(event) == reason

    @pytest.fixture(scope='session')
    def spark():
        from pyspark.sql import SparkSession
        s = (SparkSession.builder.master('local[2]')
             .config('spark.sql.shuffle.partitions', '2')     # tiny data: avoid 200 empty tasks
             .config('spark.sql.session.timeZone', 'UTC').getOrCreate())
        yield s
        s.stop()

    def test_dedupe_keeps_latest(spark):
        df = spark.createDataFrame([(1, 'A', 1), (1, 'B', 2)], 'id int, status string, seq int')
        out = dedupe_latest(df).collect()
        assert [(r.id, r.status) for r in out] == [(1, 'B')]
    »»»
    - **Fixtures** build shared resources (Spark session, temp dirs via «tmp_path», sample data) with setup/teardown and scopes.
    - **parametrize** turns one test into many cases: the natural way to cover edge cases (NULLs, empty input, duplicates, late events, boundary values).
    - «pytest.raises(DataContractError, match='engine_id')» for expected failures.
    - «monkeypatch» / «unittest.mock» to replace clocks, network calls and environment variables. **Freeze time** for anything using «now()».
    - Markers («@pytest.mark.slow», «integration») and «-m» to run subsets in CI.

    ## Testing DataFrames
    - Compare **sorted** collected rows (Spark output order is not guaranteed), or use «pyspark.testing.assertDataFrameEqual» (Spark 3.5+) / «chispa» / «pandas.testing.assert_frame_equal» with explicit tolerance for floats.
    - Test the **schema** too (types, nullability), not just values.
    - Keep test data tiny and readable; generate edge cases explicitly rather than sampling production.
    - **Parity tests:** when the same logic exists in Python and Spark (or SQL), run both on the same input and assert equal results (Turbofan's «test_spark_parity.py»).

    ## Beyond unit tests
    | Test | Checks | Tools |
    |---|---|---|
    | Integration | A step runs end-to-end on real engines | local Spark, Testcontainers (Kafka, Postgres), DuckDB |
    | Contract | Producer/consumer agree on schema and semantics | JSON Schema/Avro + registry compatibility, pydantic |
    | Data tests | Every load: not null, unique, accepted values, relationships, freshness, volume | dbt tests, Great Expectations, Soda, Delta/DLT expectations |
    | Regression / data diff | A code change does not change outputs unexpectedly | Run old and new on the same input, diff tables (datafold-style, EXCEPT) |
    | Property-based | Invariants hold for generated inputs ("dedupe is idempotent", "output rows ≤ input rows") | «hypothesis» |
    | Performance | Runtime/throughput does not regress | load tests (Turbofan loadtest.py) |

    ## In CI
    Lint (ruff), type-check (mypy/pyright), unit tests on every PR; integration tests on merge or nightly; dbt build against a CI schema with deferred state ("slim CI": only changed models and their children).

    ## How interviewers test this
    - "How do you test a PySpark transformation?"
    - "What is the difference between a unit test and a data quality test?"
    - "Your test passes locally and fails in CI on row order. Why?"
  `, {
    check: [
      mcq('A PySpark test compares «df.collect()» to an expected list and fails randomly in CI. Most likely?', ['Spark bug', 'Row order is not guaranteed; sort or use an order-insensitive comparison', 'Too few cores', 'Time zone'], 1, 'Never depend on output order without ORDER BY.'),
      match('Match the test type.', [['Unit test', 'Pure transform on a handcrafted 5-row input'], ['Data test', 'Uniqueness of claim_id on every production load'], ['Contract test', 'Producer schema change checked against consumers'], ['Regression diff', 'Old vs new model output compared on the same input']], 'Different questions, different layers.'),
      tf('Setting «spark.sql.shuffle.partitions» to a small number in tests speeds them up.', true, 'Default 200 tasks for tiny data is pure overhead.'),
      mcq('What makes pipeline code easiest to unit-test?', ['Large notebooks', 'Separating pure transformation functions from I/O', 'Global variables', 'Using print'], 1, 'Pure functions need no cluster or mocks.'),
    ],
    hands: [
      py({ q: '**Property-style test helper.** Write «check_dedupe_properties(dedupe, inputs)» that, for every input list in «inputs», checks three properties of a dedupe function and returns a list of «(index, property)» failures: «"idempotent"» (dedupe(dedupe(x)) == dedupe(x)), «"no_growth"» (len(dedupe(x)) <= len(x)) and «"keeps_keys"» (set of «r["id"]» is the same before and after). Then the tests run it against a correct and a buggy implementation.', starter: 'def check_dedupe_properties(dedupe, inputs):\n    pass\n',
        tests: `def good(rows):
    seen, out = set(), []
    for r in rows:
        if r['id'] not in seen:
            seen.add(r['id']); out.append(r)
    return out
def bad(rows):
    return [r for r in rows if r['v'] > 0]
inputs = [[{'id': 1, 'v': 1}, {'id': 1, 'v': 2}], [], [{'id': 2, 'v': 0}, {'id': 3, 'v': 5}]]
assert check_dedupe_properties(good, inputs) == []
assert check_dedupe_properties(bad, inputs) == [(2, 'keeps_keys')], check_dedupe_properties(bad, inputs)`,
        solution: `def check_dedupe_properties(dedupe, inputs):
    fails = []
    for i, x in enumerate(inputs):
        once = dedupe(x)
        if dedupe(once) != once:
            fails.append((i, 'idempotent'))
        if len(once) > len(x):
            fails.append((i, 'no_growth'))
        if {r['id'] for r in once} != {r['id'] for r in x}:
            fails.append((i, 'keeps_keys'))
    return fails` }),
    ],
  }),

  // ================================================================== Packaging
  pypack: T(`
    > **In one line:** a pipeline is software. It needs a **reproducible environment** (pinned dependencies), a **package layout** that separates library code from entry points, **configuration outside code**, **type hints and linting** for safety, and a build artifact (wheel or container) that CI tests and the platform deploys. "Works in my notebook" is not a deliverable.

    ## Environments and dependencies
    - Isolate per project: «venv» / «uv» / «poetry» / «conda». Never install into the system Python.
    - **Pin** for applications: a lock file («uv.lock», «poetry.lock», «requirements.txt» generated with hashes by pip-tools). Ranges («pandas>=2») in an app mean today's build differs from last month's.
    - **Match the runtime:** on Databricks the cluster's runtime already has PySpark, pandas, pyarrow at specific versions; installing a different PySpark breaks things. Pin libraries to the runtime version (e.g. DBR 15.4 LTS → Spark 3.5, Python 3.11) and test against it.
    - Dependency conflicts are a top cause of "job failed after cluster restart": a library resolved to a new version overnight.

    ## Project layout
    «««
    turbofan-telemetry/
      pyproject.toml          # metadata, dependencies, tool config (ruff, mypy, pytest)
      src/telemetry/          # importable package: pure logic + thin I/O
        events.py  jobs/bronze.py  jobs/silver.py  config.py
      tests/                  # pytest
      dags/ or resources/     # orchestration definitions (Airflow DAGs, Databricks asset bundle YAML)
      Dockerfile  .github/workflows/ci.yml
    »»»
    - Notebooks are for exploration; production logic lives in modules imported by jobs (Databricks supports Python files, wheels and Asset Bundles for exactly this).
    - Build a **wheel** («python -m build») or a container image; deploy that exact artifact to dev → test → prod.

    ## Configuration
    - Environment-specific values (paths, catalogs, Kafka brokers, cluster sizes) in config files or environment variables, selected per environment; secrets from a vault.
    - Validate config at start-up (pydantic settings) and fail fast with a clear message.
    - The same code runs in dev and prod; only config differs (twelve-factor principle).

    ## Type hints and static checks
    - «def score(readings: list[Reading]) -> float:» documents and lets mypy/pyright catch whole classes of bugs before runtime (None handling, wrong argument types).
    - «ruff» (lint + format, very fast) replaces flake8/isort/black in most new projects.
    - Pre-commit hooks run them before code reaches CI.

    ## Logging, CLI, entry points
    - One CLI entry point («python -m telemetry.cli stream silver») makes jobs runnable locally, in Docker, and from the orchestrator identically.
    - Exit codes matter: an orchestrator only knows a task failed if the process exits non-zero. A script that catches everything and exits 0 hides failures.

    ## How interviewers test this
    - "How do you take a notebook to production?"
    - "Your job broke after a cluster restart with no code change. Why?" (unpinned dependency)
    - "How do you handle different configs for dev and prod?"
  `, {
    check: [
      mcq('A Databricks job fails after a cluster restart with no code change. A likely cause?', ['Cosmic rays', 'An unpinned library installed a new incompatible version', 'The notebook was renamed', 'Delta lost data'], 1, 'Pin dependencies; match the runtime.'),
      tf('A pipeline script that catches every exception and exits with code 0 lets the orchestrator detect failures.', false, 'Orchestrators rely on non-zero exit codes / raised exceptions.'),
      mcq('Where should production pipeline logic live?', ['Only in notebooks', 'In a versioned package (wheel/bundle) imported by thin job entry points', 'In the orchestrator UI', 'In a shared drive'], 1, 'Testable, reviewable, deployable.'),
    ],
  }),

  // ================================================================== Dates, times, decimals in Python
  pytime: T(`
    > **In one line:** Python has **naive** datetimes (no zone, ambiguous) and **aware** ones (with «tzinfo»). Pipelines should use aware UTC internally, convert at the edges with «zoneinfo», parse with explicit formats, and use «Decimal» for money. Most date bugs are one of: naive/aware mixing, local "now", DST arithmetic, epoch units, and float rounding.

    ## Rules
    1. **Never use «datetime.now()» or «utcnow()»** in pipeline logic. «now()» is local time of whatever machine runs it; «utcnow()» returns a *naive* datetime (deprecated in 3.12). Use «datetime.now(timezone.utc)», and better: take the **logical date** from the orchestrator so re-runs are deterministic.
    2. **Store and compute in UTC**, convert for display or for business-day logic: «ts.astimezone(ZoneInfo('Asia/Kolkata'))».
    3. **Parse explicitly:** «datetime.strptime(s, '%d/%m/%Y')» or «datetime.fromisoformat()» (3.11+ handles most ISO-8601, including 'Z'). Never guess day/month order.
    4. Comparing naive and aware datetimes raises «TypeError»; comparing two naive datetimes from different zones silently gives wrong answers.
    5. **Epochs:** «datetime.fromtimestamp(ms / 1000, tz=timezone.utc)». Check the unit (s/ms/µs/ns) with a sanity range (year between 2000 and 2100).

    ## DST and calendar arithmetic
    - «timedelta(days=1)» is 24 hours. Across a DST change in a local zone, "same time tomorrow" is 23 or 25 hours away. Do calendar arithmetic in local wall time, then convert; do duration arithmetic in UTC.
    - Local times can be **missing** (spring forward) or **ambiguous** (fall back): «fold» attribute in Python.
    - Month arithmetic is not timedelta: 31 Jan + 1 month? Use «dateutil.relativedelta» and decide the rule.
    - Week numbers: ISO weeks («isocalendar()») vs US weeks; year boundaries (2026-12-31 may belong to ISO week 1 of 2027).

    ## Decimal for money
    «Decimal('0.1') + Decimal('0.2') == Decimal('0.3')» is True; with floats it is False. Construct Decimals **from strings**, not floats («Decimal(0.1)» captures the float's binary error). Set rounding explicitly: «quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)» to match finance (Python's «round()» uses banker's rounding: «round(2.5) == 2»).

    ## How interviewers test this
    - "Why should a pipeline not call datetime.now()?" (Non-deterministic re-runs; time zone of the worker.)
    - "Convert a Kafka timestamp in ms to an IST business date."
    - "Why does round(2.5) return 2?"
  `, {
    check: [
      mcq('Why should a daily job use the orchestrator\'s logical date rather than datetime.now()?', ['It is faster', 'Re-runs and backfills process the intended date deterministically', 'now() is deprecated', 'Logical dates are always UTC midnight'], 1, 'Determinism is required for idempotent backfills.'),
      mcq('«round(2.5)» in Python returns…', ['3', '2', '2.5', 'An error'], 1, 'Banker\'s rounding (half to even). Use Decimal.quantize with ROUND_HALF_UP to match finance.'),
      tf('Decimal(0.1) == Decimal("0.1")', false, 'Decimal(0.1) captures the binary float error. Build Decimals from strings.'),
      mcq('A Kafka record timestamp is 1764230400000. What unit is it?', ['Seconds', 'Milliseconds', 'Microseconds', 'Days'], 1, '13 digits → ms since epoch (late 2025).'),
    ],
    hands: [
      py({ q: '**Business date from epoch.** Write «business_date(epoch_ms, offset_minutes, cutoff_hour)» that converts a UTC epoch in **milliseconds** to local time at a fixed UTC offset (IST is +330 minutes; in production you would use «zoneinfo» for zones with DST) and returns the business date as «"YYYY-MM-DD"». Events **before** «cutoff_hour» local time belong to the **previous** business day (a shift that starts at cutoff_hour). Raise «ValueError» if the epoch is outside years 2000-2100 (likely a wrong unit).', starter: 'from datetime import datetime, timezone, timedelta\n\ndef business_date(epoch_ms, offset_minutes, cutoff_hour):\n    pass\n',
        tests: `# 2026-11-01 20:00 UTC = 2026-11-02 01:30 IST
ms = int(datetime(2026, 11, 1, 20, 0, tzinfo=timezone.utc).timestamp() * 1000)
assert business_date(ms, 330, 0) == '2026-11-02'
assert business_date(ms, 330, 6) == '2026-11-01'
assert business_date(ms, 0, 0) == '2026-11-01'
for bad in (ms // 1000, ms * 1000):
    try:
        business_date(bad, 0, 0); assert False, bad
    except ValueError:
        pass`,
        solution: `from datetime import datetime, timezone, timedelta

def business_date(epoch_ms, offset_minutes, cutoff_hour):
    try:
        utc = datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        raise ValueError('epoch out of range')
    if not (2000 <= utc.year <= 2100):
        raise ValueError('epoch out of range: wrong unit?')
    local = utc.astimezone(timezone(timedelta(minutes=offset_minutes)))
    if local.hour < cutoff_hour:
        local -= timedelta(days=1)
    return local.date().isoformat()` }),
    ],
  }),
};
