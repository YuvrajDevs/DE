const { T } = require('../_t.cjs');

module.exports = {
  pymodel: T(`
    > **In one line:** Python variables are **names pointing at objects**; assignment never copies. Whether a change through one name shows through another depends on **mutability**; **hashing** decides what can be a dict key or set member. These rules explain shared-default bugs, aliasing in batches and "my dedupe set didn't dedupe".

    ## Names, objects, mutability
    - «a = [1, 2]; b = a; b.append(3)» → «a» is «[1, 2, 3]»: one list, two names.
    - **Immutable:** int, float, str, bytes, tuple (if its items are immutable), frozenset, None ("changing" makes a new object). **Mutable:** list, dict, set, most class instances, DataFrames.
    - Arguments are passed **by object reference**: a function can mutate your list, but rebinding the parameter doesn't affect the caller.

    **Mutable default trap:**
    «««python
    def add_row(row, batch=[]):   # ONE list, created at def time, shared by every call
        batch.append(row); return batch
    add_row(1); add_row(2)        # -> [1, 2]: state leaks between calls / Airflow runs in one worker
    »»»
    Fix: «batch=None» then «if batch is None: batch = []». Same for dict defaults and class attributes («class Cache: items = []» is shared by all instances).

    **Copies:** «list(x)», «x[:]», «x.copy()», «dict(d)» are **shallow**: new outer container, shared inner objects (edit a copied row → original changes). «copy.deepcopy» is correct but slow; in pipelines build **new** rows («{**row, 'status': 'x'}»). pandas: «df2 = df» aliases; «df[df.x > 0]['y'] = 1» may edit a temporary copy (SettingWithCopyWarning) → «df.loc[mask, 'y'] = 1». **pandas 3.0 (Jan 2026)** makes copy-on-write the only mode: chained assignment never edits the original (removes this bug class; breaks code that relied on it).

    ## Equality, identity, hashing
    - «==» compares values, «is» identity: use «is» only for None and sentinels.
    - Dict keys/set members must be **hashable** (hash can't change while inside). Lists/dicts aren't → dedupe rows via «tuple(sorted(d.items()))» or frozen dataclasses.
    - «1 == 1.0 == True» and they hash equal: «{1: 'a', True: 'b'}» has one key, so mixed-type ID sets merge 1 and True.
    - **NaN ≠ NaN**: NaN rows never dedupe by equality («x == x» is a NaN test); but pandas «drop_duplicates» treats NaNs as equal.
    - Dicts keep insertion order (3.7+); **sets don't**: sort for deterministic output.

    **Data classes:** «@dataclass(frozen=True, slots=True)» = immutable, hashable, lean records (events, config); «NamedTuple» for light named tuples; **pydantic** to validate external input (API payloads, configs, event contracts) with clear errors; «__slots__» saves memory for millions of objects (but at that scale, go columnar).

    **Memory:** an int is ~28 bytes, a small dict 200+ bytes, so 10M dict rows can take several GB where Arrow/Parquet takes tens of MB. That's the real reason data work uses **columnar libraries and generators**.

    **Interview:** second call of a mutable-default function; dedupe set of dicts (unhashable) or floats (NaN); shallow vs deep copy.
  `),

  pyiter: T(`
    > **In one line:** a **generator** yields items one at a time on demand, holding only its current state. Chained generators form a **streaming pipeline** that processes a 50 GB file with a few MB of RAM: the most useful Python idea for a DE outside Spark.

    - **Iterable:** can be looped (list, dict, file, range). **Iterator:** has «__next__», remembers position, **single pass** (loop a file/generator twice and the second loop is empty: a silent bug).
    - **Generator function** uses «yield»; nothing runs until iterated. **Generator expression** «(parse(l) for l in f)» = lazy list comprehension.

    «««python
    def read_lines(path):
        with open(path, encoding='utf-8') as f:
            for line in f: yield line                  # file reads in buffered chunks
    def parse(lines):
        for n, line in enumerate(lines, 1):
            try: yield json.loads(line)
            except json.JSONDecodeError as e: log.warning('bad line %d: %s', n, e)  # or dead-letter it
    def batched(it, size):
        batch = []
        for x in it:
            batch.append(x)
            if len(batch) == size: yield batch; batch = []
        if batch: yield batch
    for chunk in batched(parse(read_lines('telemetry.jsonl')), 5000):
        write_to_db(chunk)                             # bulk insert; memory = one batch
    »»»
    («itertools.batched» exists from Python 3.12.)

    **itertools:** «islice» (first n lazily), «chain» (concatenate), «groupby» (**consecutive** groups only: sort by the key first or you get several groups per key), «tee» (split an iterator; buffers if consumers drift), «accumulate» (running totals), «zip_longest», «count», «pairwise» (3.10+, consecutive pairs: deltas between readings).

    ## Laziness traps
    - **Exhausted iterators:** counting the events consumes them; the next loop does nothing → «list()» only if it fits, or recreate.
    - **Late binding:** «[lambda: i for i in range(3)]» all return 2.
    - **Resources** (files, cursors) stay open until the generator is exhausted/closed → «with» inside it and consume fully, or «contextlib.closing».
    - **Exceptions appear at consumption**, far from creation → log context (file, line number).
    - Generators are **lazy, not parallel**.

    **Chunked reads in libraries:** pandas «read_csv(chunksize=100_000)»; pyarrow «ParquetFile(path).iter_batches()» by row group; DB «fetchmany(10_000)» or server-side cursors (psycopg «name=») instead of «fetchall()»; HTTP pages from a generator until the API says done.

    **At scale** the same shape (read → parse → validate → batch → write) maps onto Spark («mapPartitions» hands you an iterator per partition) and Kafka consumers (an endless iterator).

    **Interview:** 20 GB CSV on an 8 GB laptop; list comprehension vs generator expression; why the second loop did nothing; implement batching / sliding window / pairwise with generators.
  `),

  pyconc: T(`
    > **In one line:** CPython's **GIL** lets one thread run Python bytecode at a time. So **threads/asyncio** speed up **I/O-bound** work (APIs, downloads, DB calls), **processes** speed up **CPU-bound** pure Python, and **native vectorised libraries** (NumPy, Arrow, Polars, DuckDB) beat both because they run in C and release the GIL.

    | Workload | Tool | Why |
    |---|---|---|
    | 2,000 API calls, 500 blob downloads | ThreadPoolExecutor or asyncio + aiohttp/httpx | Network waits release the GIL |
    | Parse 200 CSVs with pure-Python logic | ProcessPoolExecutor / multiprocessing | Each process has its own GIL |
    | Aggregate 50 GB on one machine | DuckDB / Polars | Native, multi-threaded, columnar |
    | Aggregate 5 TB | Spark | Many machines |
    | Thousands of long-lived connections | asyncio | One thread, cheap coroutines |
    **Current state:** Python 3.13 added an experimental free-threaded (no-GIL) build; **3.14 (Oct 2025) made it officially supported but optional** (separate «python3.14t», C extensions catching up). Production platforms (Databricks, Airflow images) still use the GIL build: mention it, don't design around it.

    **Threads:**
    «««python
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fetch, url): url for url in urls}
        for fut in as_completed(futures):
            try: results.append(fut.result())
            except Exception as e: failures.append((futures[fut], repr(e)))  # one failure doesn't kill the batch
    »»»
    - **Bound concurrency** to API rate limits and DB connection limits (unbounded fan-out DDoSes partners and exhausts pools).
    - Shared mutable state needs a Lock; better, return values and combine in the main thread.
    - Thread exceptions surface **only when you call «result()»**; otherwise they vanish.

    **Processes:** arguments/results are **pickled and copied** (sending a 2 GB DataFrame costs more than the work) → pass paths or partition IDs. Spawn start (macOS/Windows default; Linux moving from fork to spawn/forkserver) re-imports your module → guard with «if __name__ == '__main__':». Forking with open DB connections/threads corrupts them → connect inside workers.

    **asyncio:** cooperative; one blocking call («requests.get», «time.sleep», sync DB driver) **blocks the whole loop** → async libraries or «asyncio.to_thread». Limit with «asyncio.Semaphore(n)»; «gather(..., return_exceptions=True)» so one failure doesn't silently cancel the rest. Great for very high I/O concurrency; overkill for 20 calls (use threads).

    **In platforms:** Airflow tasks, Spark drivers and notebooks are Python processes with the same rules (listing 100k ADLS blobs: hours sequentially, minutes with a bounded thread pool). Don't use threads for work Spark should do. PySpark Python UDFs run in separate Python worker processes, and that serialisation is why they're slow.

    **Interview:** API for 100k IDs → threads/async + bounded concurrency + backoff + rate limit + checkpointed progress; threads didn't speed CSV parsing → CPU-bound + GIL; exceptions in executor tasks → stored in the future until «result()».
  `),

  pyerrors: T(`
    > **In one line:** production code must **fail loudly on bugs, retry transient faults, quarantine bad records and always clean up**: classify errors, use **exponential backoff with jitter**, **log with context**, and **context managers** for resources.

    | Kind | Examples | Action |
    |---|---|---|
    | **Transient** | Timeout, connection reset, HTTP 429/503, throttling, deadlock victim, Delta concurrent-commit conflict | Retry with bounded backoff |
    | **Bad input** | Malformed JSON, missing field, one record's schema mismatch | **Don't retry**: dead-letter with a reason, continue |
    | **Permanent system** | 401/403, missing table, bad config, a bug (KeyError) | Fail fast and alert (retrying hides the bug) |
    Worst anti-pattern: «except Exception: pass» (or log-and-continue) around a whole batch: data silently disappears.

    «««python
    def with_retry(fn, attempts=5, base=0.5, cap=30):
        for i in range(attempts):
            try: return fn()
            except (TimeoutError, ConnectionError) as e:
                if i == attempts - 1: raise
                sleep = min(cap, base * 2 ** i) * random.uniform(0.5, 1.0)   # exponential + jitter
                log.warning('retry %d/%d after %s: %.1fs', i + 1, attempts, type(e).__name__, sleep)
                time.sleep(sleep)
    »»»
    - **Jitter** stops 200 workers retrying in the same instant (thundering herd). Honour **Retry-After** on 429/503.
    - **Only retry idempotent operations**; a retried POST can create two orders → idempotency keys.
    - **Retry layers multiply** (3 client × 3 task × 3 DAG = 27 attempts) → pick the owning layer.
    - Libraries: «tenacity», urllib3 «Retry».

    **Exceptions:** catch the narrowest; re-raise with context («raise PipelineError(...) from e» keeps «__cause__»); cleanup in «finally» or context managers, never via garbage collection; a custom hierarchy («RetryableError», «DataContractError») lets orchestrators react by type; 3.11+ «ExceptionGroup»/«except*» for concurrent failures.

    **Context managers** guarantee cleanup on success, error or Ctrl-C (files, connections, locks, temp dirs, test Spark sessions):
    «««python
    @contextmanager
    def staged_table(conn, name):
        tmp = f'{name}__staging'
        conn.execute(f'CREATE TABLE {tmp} AS SELECT * FROM {name} WHERE 1=0')
        try:
            yield tmp
            conn.execute(f'ALTER TABLE {tmp} RENAME TO {name}')   # publish only on success
        finally:
            conn.execute(f'DROP TABLE IF EXISTS {tmp}')
    »»»

    **Logging that helps at 3 a.m.:** «logging», never «print» (levels, handlers, Airflow/Databricks capture); context in every line (pipeline, run id/logical date, partition, batch, counts); structured JSON for Log Analytics/Splunk/Datadog; **counts at every stage** (read, valid, rejected, written: mismatches reveal incidents early); lazy formatting («log.info('rows=%d', n)»); never log secrets or PII; «log.exception» inside except records the traceback.

    **Interview:** retry logic for 429s and 500s; which errors not to retry; what's wrong with «except Exception: pass»; guaranteeing a temp table is dropped.
  `),

  pyio: T(`
    > **In one line:** file handling is much of junior DE work and its bugs: **encodings, quoting, type inference, huge files, partial writes**. Know CSV's traps, use **JSON Lines** for events and **Parquet** (pyarrow) for analytics, and write **atomically**.

    ## CSV
    - Use the «csv» module (or pandas/pyarrow/DuckDB), never «split(',')»: quoted fields contain commas and newlines («"Pune, MH"»).
    - **Encoding:** always set it; Excel exports are often «utf-8-sig» (the BOM turns the first header into «\\ufeffid») or «cp1252»; use «errors='strict'» in pipelines so you notice bad bytes.
    - Open with «newline=''» for the csv module, or embedded newlines break rows.
    - **Inference traps (pandas):** leading zeros vanish («00123» → 123); one missing value turns IDs into floats; «"NA"»/«"null"» become NaN; dates parse day- or month-first. → «dtype=str» at bronze, parse explicitly in silver.
    - **Header drift:** validate headers against the contract, map **by name**.
    - Large files: stream with the csv module or «chunksize», or DuckDB/Polars in parallel.

    ## JSON / JSON Lines
    A JSON array must be parsed whole; **JSON Lines** streams, appends and splits (standard for event dumps and API extracts). Integers over 2^53 lose precision in JavaScript/some parsers → IDs as strings. Flatten nesting deliberately («pd.json_normalize», or a struct/variant column in bronze parsed in silver). JSON has no date type → ISO-8601 with offset («2026-11-27T10:15:00+05:30»).

    ## Parquet with pyarrow
    «««python
    schema = pa.schema([('engine_id', pa.int32()), ('ts', pa.timestamp('ms', tz='UTC')),
                        ('temp_c', pa.float32()), ('amount', pa.decimal128(18, 2))])
    pq.write_table(pa.Table.from_pylist(rows, schema=schema), 'part-0001.parquet',
                   compression='zstd', row_group_size=128_000)          # explicit schema, no guessing
    pq.ParquetFile('part-0001.parquet').metadata                        # metadata only
    pq.read_table('data/', columns=['engine_id', 'temp_c'],
                  filters=[('engine_id', '=', 7)])                      # column pruning + row-group skipping
    »»»
    Parquet stores schema, types, per-row-group min/max and per-column compression, so reading 2 of 200 columns reads only those 2. **Row groups** (typically 64-512 MB uncompressed in Spark-sized files) and **file sizes** (~128 MB-1 GB) drive skipping and parallelism; thousands of tiny files = small-files problem. «pyarrow.dataset» reads Hive-partitioned folders («event_date=2026-11-27/»).

    **Atomic writes:** a killed process leaves a half-written file the next step reads as valid. Locally: write «path.tmp» on the same filesystem, flush + fsync, then «os.replace(tmp, path)» (atomic). Object storage has no cheap directory rename → unique final keys plus a manifest/«_SUCCESS» marker, or (the real fix) commit through a table format (Delta/Iceberg).

    **Compression:** a gzip CSV isn't splittable (one 20 GB «.csv.gz» = one Spark task) → Parquet with internal compression, bzip2, or many smaller gz files. Parquet codecs: zstd (smaller), snappy (faster).

    **Interview:** IDs as floats and lost leading zeros (inference); JSON Lines vs array; never reading half-written files; one task reading a 20 GB file (gzip).
  `),

  pydf: T(`
    > **In one line:** choose by **data size, latency and where data lives**: **pandas** for small in-memory work, **Polars/DuckDB** for fast single-machine analytics up to hundreds of GB, **PySpark** beyond one machine or on Databricks. Concepts transfer; memory models don't.

    | | pandas | Polars | DuckDB | PySpark |
    |---|---|---|---|---|
    | Execution | Eager, mostly single-threaded | Eager or **lazy** with optimiser, multi-threaded (Rust) | In-process vectorised SQL engine | Lazy, distributed |
    | Memory | Whole frame in RAM, often 5-10× file size | Arrow columnar, lean; streaming for > RAM | Spills to disk | Distributed, spills, scales out |
    | Sweet spot | < ~1-5 GB, notebooks, ML prep, glue | 1-100+ GB | Ad-hoc SQL on Parquet/CSV, tests, local lakehouse | 100 GB → PB, Databricks production |
    | Index | Row index (bug source) | None | None | None |
    | Style | Imperative, chained | Expressions («pl.col») | SQL | DataFrame + SQL |

    **Why pandas is memory-hungry:** object-dtype strings (a Python object each), copies, the index, 64-bit defaults (1 GB CSV → 5-10 GB RAM). Mitigate with «category» dtypes, int32/float32, the pyarrow backend («dtype_backend='pyarrow'»), «usecols», chunking, or switch engines.

    **Vectorise, never loop:** «apply(axis=1)» and «iterrows()» run Python per row (100-1000× slower than «df['margin'] = df.approved - df.cost», «np.where», «.str»/«.dt»). Spark's equivalent rule: built-ins over UDFs.

    **Laziness:** Polars «scan_parquet(...).filter(...).group_by(...).agg(...).collect()» and DuckDB see the whole query, so they push filters/columns into the Parquet scan like Spark; pandas «read_parquet» loads everything first.

    ## pandas gotchas that produce wrong numbers
    - **Index alignment:** Series add by label, not position; mismatches → NaN.
    - «groupby» drops NaN keys by default («dropna=False»).
    - «merge» is inner by default and silently fans out on duplicate keys → «validate='many_to_one'» raises instead.
    - Integers with missing values become float → nullable «Int64».
    - **pandas 3.0:** default «str» dtype (Arrow-backed if pyarrow installed) instead of object, so «dtype == object» checks for text break; copy-on-write only (fixes chained assignment). Upgrade via 2.3 with future flags and no warnings.
    - «to_datetime» guesses formats; naive vs aware comparisons raise.

    **Moving between them:** Arrow is the common format (pandas ↔ Polars ↔ DuckDB ↔ Spark with Arrow on: cheap conversion). **«toPandas()» collects everything to the driver** (classic driver OOM) → aggregate/sample first. Write logic as SQL or pure functions to test in DuckDB locally and run on Spark in production.

    **Interview:** 30 GB Parquet on a laptop → DuckDB/Polars lazy scan; why «apply» is slow; when not Spark (small data: overhead and cluster cost aren't worth it).
  `),

  pydb: T(`
    > **In one line:** extraction is where pipelines meet other people's systems: **parameterised queries, batched reads/writes, pooled connections, pagination that can't skip or repeat, rate-limit-aware retries, checkpointed progress**.

    ## Databases from Python
    - **Parameterise:** «cur.execute('… WHERE dealer_id = %s', (dealer_id,))». String formatting invites SQL injection and breaks on quotes («O'Brien»). Table names can't be parameters → allow-list them.
    - **Batch writes:** «executemany», Postgres «COPY», bulk APIs, or write Parquet for the warehouse to load. Row-by-row over a network is 100-1000× slower (a round trip each).
    - **Batch reads:** server-side cursors, «fetchmany», chunked reads; never «fetchall()» on unknown sizes.
    - **Commit** once per load (or per chunk with a recorded checkpoint), not per row.
    - **Pool connections** (each new one costs TLS + auth, tens-hundreds of ms): SQLAlchemy pool, psycopg_pool.
    - Big extracts from a **replica or snapshot**, never heavy queries on a production primary in business hours.

    **Spark JDBC:** «read.jdbc(url, table, column='claim_id', lowerBound=1, upperBound=10_000_000, numPartitions=16)» runs 16 parallel range queries. Each partition is a **connection** (numPartitions × executors can exhaust the source's limit: cap it). Skewed ID ranges make one huge partition. **lowerBound/upperBound don't filter** (out-of-range rows land in edge partitions). Pushdown depends on the driver; set «fetchsize».

    | Pagination | How | Risk |
    |---|---|---|
    | Offset/page | «?page=7&size=100» | Inserts/deletes shift rows → **duplicates or missed records**; deep offsets slow |
    | Cursor/token | «?cursor=abc» from the last page | Stable (server tracks position): preferred |
    | Keyset | «?updated_after=…&id_after=…» sorted by (updated_at, id) | Stable, resumable; needs a unique sort key |
    | Time window | «?from=…&to=…» | Late records in closed windows → overlap + dedupe |
    Always dedupe by record ID on landing: paging is rarely perfect.

    **Rate limits:** read the limits; throttle client-side (token bucket) rather than waiting for 429s; backoff with jitter and honour Retry-After; size concurrency to the limit (16 threads × 5 req/s = 80 req/s).

    **Resumable extraction:** persist progress (last cursor, last (updated_at, id), finished pages/partitions) in a control table or file (**not** Airflow XCom for large state); restart from it after failure. With idempotent landing (overwrite the window or upsert by ID), re-runs are always safe.

    **Secrets** from a store (Key Vault, Databricks secret scopes, Airflow connections/backends, runtime env), never in code or committed notebooks; rotate; never log.

    **Interview:** 50M rows nightly from SQL Server without hurting it; offset pagination during changes (fix: cursor/keyset + dedupe); why row-by-row inserts are slow.
  `),

  pytest: T(`
    > **In one line:** test data code at three levels: **unit** (pure logic on tiny handmade inputs), **integration** (a step against real engines: local Spark, DuckDB, containers) and **data tests** (every production load: uniqueness, nulls, ranges, reconciliation). pytest covers the first two.

    **Design for testing:** separate **pure logic** (parse, validate, health score, dedupe, SCD decisions) from **I/O** (Kafka, Delta). Pure functions are trivial to test; keep I/O wrappers thin (Turbofan's «events.py» is pure and unit-tested; Spark jobs call it).

    «««python
    @pytest.mark.parametrize('event, reason', [
        ({'engine_id': 1, 'cycle': 5, 'sensors': {...}}, None),
        ({'cycle': 5}, 'MISSING_FIELD')])
    def test_validate(event, reason):
        assert validate(event) == reason

    @pytest.fixture(scope='session')
    def spark():
        s = (SparkSession.builder.master('local[2]')
             .config('spark.sql.shuffle.partitions', '2')       # tiny data: avoid 200 empty tasks
             .config('spark.sql.session.timeZone', 'UTC').getOrCreate())
        yield s; s.stop()
    »»»
    - **Fixtures:** shared resources with setup/teardown and scopes (Spark session, «tmp_path», sample data).
    - **parametrize:** one test, many cases, ideal for edge cases (NULLs, empty input, duplicates, late events, boundaries).
    - «pytest.raises(DataContractError, match='engine_id')» for expected failures.
    - «monkeypatch»/«unittest.mock» replace clocks, network, env vars; **freeze time** for anything using «now()».
    - Markers («slow», «integration») + «-m» to run subsets in CI.

    **Testing DataFrames:** compare **sorted** rows (Spark order isn't guaranteed) or «assertDataFrameEqual» (Spark 3.5+), chispa, «pandas.testing.assert_frame_equal» with float tolerance; test the **schema** (types, nullability); keep data tiny, write edge cases explicitly; **parity tests** when logic exists twice (Python and Spark: Turbofan's «test_spark_parity.py»).

    | Test | Checks | Tools |
    |---|---|---|
    | Integration | Step runs end to end | Local Spark, Testcontainers (Kafka, Postgres), DuckDB |
    | Contract | Producer/consumer agree on schema and meaning | JSON Schema/Avro + registry, pydantic |
    | Data tests | Every load: not null, unique, accepted values, relationships, freshness, volume | dbt tests, Great Expectations, Soda, Delta/DLT expectations |
    | Regression / data diff | Code change doesn't change outputs unexpectedly | Old vs new on the same input, table diff (EXCEPT, datafold-style) |
    | Property-based | Invariants on generated inputs (dedupe idempotent, rows out ≤ rows in) | hypothesis |
    | Performance | No runtime regression | Load tests |

    **CI:** lint (ruff), type-check (mypy/pyright), unit tests on every PR; integration on merge or nightly; dbt build in a CI schema with **slim CI** (only changed models and children, deferring to prod state).

    **Interview:** testing a PySpark transform; unit vs data quality tests; test passes locally, fails in CI on row order (sort or order-insensitive compare).
  `),

  pypack: T(`
    > **In one line:** a pipeline is software: **reproducible environment** (pinned dependencies), **package layout** separating library code from entry points, **config outside code**, **types and linting**, and one build artifact (wheel/container) that CI tests and the platform deploys. "Works in my notebook" isn't a deliverable.

    **Environments:** one per project (venv, uv, poetry, conda), never system Python. **Pin** applications with a lock file (uv.lock, poetry.lock, pip-tools «requirements.txt» with hashes); ranges («pandas>=2») mean today's build differs from last month's. **Match the runtime:** Databricks runtimes ship PySpark, pandas, pyarrow at set versions (installing another PySpark breaks things); pin to it (Runtime 18 → Spark 4.1, JDK 21 default; 15.4 LTS → Spark 3.5) and test against the same runtime in CI. Unpinned libraries resolving to new versions overnight are a top cause of "failed after cluster restart, no code change".

    «««text
    turbofan-telemetry/
      pyproject.toml        # metadata, dependencies, ruff/mypy/pytest config
      src/telemetry/        # importable package: pure logic + thin I/O
      tests/                # pytest
      dags/ or resources/   # Airflow DAGs / Databricks Asset Bundle YAML
      Dockerfile  .github/workflows/ci.yml
    »»»
    Notebooks are for exploration; production logic lives in modules imported by jobs (Databricks supports files, wheels and **Asset Bundles**). Build a wheel («python -m build») or image once, deploy **the same artifact** dev → test → prod.

    **Config:** environment values (paths, catalogs, brokers, cluster sizes) in config files or env vars per environment; secrets from a vault; validate at start-up (pydantic settings) and fail fast; same code everywhere (twelve-factor).

    **Types and checks:** «def score(readings: list[Reading]) -> float:» documents and lets mypy/pyright catch None and type bugs before runtime; **ruff** (fast lint + format) replaces flake8/isort/black; pre-commit runs them before CI.

    **Entry points:** one CLI («python -m telemetry.cli stream silver») runs identically locally, in Docker and from the orchestrator. **Exit codes matter:** orchestrators only see failure if the process exits non-zero; catch-everything-and-exit-0 hides failures.

    **Interview:** notebook to production (package, tests, artifact, config, CI/CD); broke after restart with no code change (unpinned dependency); dev vs prod config.
  `),

  pytime: T(`
    > **In one line:** Python has **naive** datetimes (no zone, ambiguous) and **aware** ones (with tzinfo). Use aware UTC internally, convert at the edges with «zoneinfo», parse with explicit formats, and use «Decimal» for money. Most bugs: naive/aware mixing, local "now", DST arithmetic, epoch units, float rounding.

    ## Rules
    1. **No «datetime.now()» or «utcnow()» in pipeline logic:** now() is the worker's local time; utcnow() returns a *naive* value (deprecated in 3.12). Use «datetime.now(timezone.utc)», and better, the orchestrator's **logical date** so re-runs are deterministic.
    2. **Store and compute in UTC**; convert for display or business-day logic («ts.astimezone(ZoneInfo('Asia/Kolkata'))»).
    3. **Parse explicitly:** «strptime(s, '%d/%m/%Y')» or «fromisoformat()» (3.11+ handles most ISO-8601 incl. 'Z'); never guess day/month order.
    4. Naive vs aware comparisons raise TypeError; two naive values from different zones compare **silently wrong**.
    5. **Epochs:** «datetime.fromtimestamp(ms / 1000, tz=timezone.utc)»; check the unit (s/ms/µs/ns) with a sanity range (year 2000-2100).

    **DST and calendars:** «timedelta(days=1)» is 24 hours, but across a DST change "same time tomorrow" is 23 or 25 hours away → calendar maths in local wall time then convert; duration maths in UTC. Local times can be **missing** (spring forward) or **ambiguous** (fall back: the «fold» attribute). Months aren't timedeltas (31 Jan + 1 month?) → «dateutil.relativedelta» with a decided rule. ISO weeks («isocalendar()») differ from US weeks; 2026-12-31 may be in ISO week 1 of 2027.

    **Decimal for money:** «Decimal('0.1') + Decimal('0.2') == Decimal('0.3')» is True (floats: False). Build Decimals **from strings** («Decimal(0.1)» keeps the float's binary error). Set rounding explicitly: «quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)» matches finance; Python's «round()» is banker's rounding («round(2.5) == 2»).

    **Interview:** why not «datetime.now()» (non-deterministic re-runs, worker zone); Kafka ms timestamp → IST business date; why «round(2.5)» is 2.
  `),
};
