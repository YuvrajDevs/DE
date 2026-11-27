const { T, mcq, tf, multi, scenario, talk, sql, py, order, match, bug } = require('./_t.cjs');

module.exports = {
  // ================================================================== Data model
  pymodel: T(`
    > **In one line:** Python variables are **names bound to objects**; assignment never copies. Whether a change through one name is visible through another depends on whether the object is **mutable**. Hashing decides what can be a dict key or set member. These rules explain the bugs that slip into data code: shared default arguments, aliasing in batches, and "my dedupe set did not dedupe".

    ## Names, objects, mutability
    - «a = [1, 2]; b = a; b.append(3)» → «a» is «[1, 2, 3]». One list, two names.
    - Immutable: int, float, str, bytes, tuple (if its items are immutable), frozenset, None. "Changing" them makes a new object.
    - Mutable: list, dict, set, most class instances, pandas DataFrames (though most pandas operations return new objects).
    - **Function arguments are passed by object reference** ("call by sharing"): a function can mutate a list you pass in, but rebinding the parameter does not affect the caller.

    ## The mutable default argument trap
    «««python
    def add_row(row, batch=[]):     # one list created at def time, shared by all calls
        batch.append(row)
        return batch
    add_row(1); add_row(2)          # -> [1, 2]  (state leaks between calls / between Airflow task runs in one worker)
    »»»
    Fix: «batch=None» then «if batch is None: batch = []». The same applies to «dict» defaults and to class-level attributes («class Cache: items = []» is shared by every instance).

    ## Copies
    - «list(x)», «x[:]», «x.copy()», «dict(d)» are **shallow**: the outer container is new, the inner objects are shared. Copying a list of dict rows and then editing a row edits the original.
    - «copy.deepcopy» copies recursively: correct but slow on large structures. In pipelines prefer building **new** rows («{**row, 'status': 'x'}») over mutating in place.
    - pandas: «df2 = df» aliases; «df[df.x > 0]['y'] = 1» may modify a temporary copy (SettingWithCopyWarning). Use «df.loc[mask, 'y'] = 1». **pandas 3.0 (January 2026) makes copy-on-write the default and only mode**: chained assignment no longer modifies the original and every derived object behaves like a copy, which removes most of this class of bug (and breaks code that relied on chained assignment working).

    ## Equality, identity, hashing
    - «==» compares values; «is» compares identity. Use «is» only for «None» (and sentinels).
    - A dict key / set member must be **hashable**: its hash must not change while it is in the container. Lists and dicts are unhashable; convert rows to «tuple(sorted(d.items()))» or a frozen dataclass to dedupe them.
    - «1 == 1.0 == True» and they hash equal: «{1: 'a', True: 'b'}» has one key. A dedupe set over mixed-type IDs merges «1» and «True».
    - «float('nan') != float('nan')»: NaN is not equal to itself, so NaN rows are never deduplicated by equality, and «x == x» is a NaN test. pandas treats NaN as missing in «drop_duplicates» (they are considered equal there), which differs from plain Python sets.
    - Dict ordering: insertion order is preserved (guaranteed since Python 3.7). Set ordering is **not**: never rely on iterating a set for deterministic output.

    ## Classes for data
    - «@dataclass(frozen=True, slots=True)» gives immutable, hashable, memory-light records with type hints; good for events and config.
    - «NamedTuple» for lightweight tuples with names.
    - **pydantic** models for validating external input (API payloads, configs, event contracts) with clear errors.
    - «__slots__» saves memory when you hold millions of small objects (but at that point, use columnar structures: Arrow, pandas, Polars).

    ## Memory model in one paragraph
    Every Python object carries overhead (an int is ~28 bytes, a small dict ~200+ bytes). A list of 10 million dict rows can take several GB where the same data in Arrow/Parquet takes tens of MB. This is the real reason data work moves to **columnar libraries** and **generators**: not style, memory.

    ## How interviewers test this
    - "What does this function return on the second call?" (mutable default)
    - "Why did my dedupe with a set of dicts fail?" (unhashable) and "with floats?" (NaN)
    - "Shallow vs deep copy?"
  `, {
    check: [
      mcq('«def f(x, acc=[]): acc.append(x); return acc». What does «f(1); f(2)» return on the second call?', ['[2]', '[1, 2]', 'An error', '[]'], 1, 'The default list is created once and shared.'),
      mcq('«rows2 = list(rows)» then «rows2[0]["status"] = "X"». What happens to rows[0]?', ['Unchanged', 'Also changed: list() is a shallow copy and the dict is shared', 'Error', 'Becomes None'], 1, 'The inner dicts are the same objects.'),
      tf('«float("nan") == float("nan")» is True.', false, 'NaN is not equal to itself.'),
      mcq('How do you deduplicate a list of dict rows with a set?', ['set(rows)', 'Convert each row to a hashable form such as tuple(sorted(row.items()))', 'Sort them', 'Use list.remove'], 1, 'Dicts are unhashable.'),
      tf('Iterating a Python set gives a deterministic order you can rely on in tests.', false, 'Sort explicitly when order matters.'),
    ],
    hands: [
      bug('This helper is called once per Airflow task in a long-lived worker. After a few runs batches contain rows from earlier runs. Find the bug.', `def collect(rows, seen=set(), out=[]):
    for r in rows:
        if r['id'] not in seen:
            seen.add(r['id'])
            out.append(r)
    return out`, 'Mutable defaults «seen=set()» and «out=[]» are created once at definition time and shared by every call in the process. Use «None» defaults and create fresh objects inside the function.', 'State leaking across calls is a classic source of "duplicates from yesterday".'),
      py({ q: '**Deduplicate dict rows** while keeping the first occurrence and the original order. Two rows are duplicates if they have the **same keys and values** (key order in the dict does not matter). Values are hashable scalars. Write «dedupe_rows(rows)».', starter: 'def dedupe_rows(rows):\n    pass\n',
        tests: `r = [{'a': 1, 'b': 2}, {'b': 2, 'a': 1}, {'a': 1, 'b': 3}, {'a': 1}]
assert dedupe_rows(r) == [{'a': 1, 'b': 2}, {'a': 1, 'b': 3}, {'a': 1}]
assert dedupe_rows([]) == []`,
        solution: `def dedupe_rows(rows):
    seen, out = set(), []
    for r in rows:
        k = tuple(sorted(r.items()))
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out` }),
    ],
  }),

  // ================================================================== Iterators and generators
  pyiter: T(`
    > **In one line:** a **generator** produces items one at a time, on demand, keeping only its current state in memory. Chaining generators gives you a **streaming pipeline** that processes a 50 GB file with a few MB of RAM. It is the single most useful Python idea for a data engineer outside of Spark.

    ## Iterables, iterators, generators
    - **Iterable:** anything you can loop over («__iter__»): list, dict, file, range.
    - **Iterator:** an object with «__next__» that remembers its position; **single pass**. Files and generators are iterators: loop twice and the second loop is empty (a common silent bug).
    - **Generator function:** a function with «yield». Calling it returns a generator; nothing runs until you iterate.
    - **Generator expression:** «(parse(l) for l in f)», the lazy cousin of a list comprehension.

    ## A streaming pipeline
    «««python
    def read_lines(path):
        with open(path, encoding='utf-8') as f:
            for line in f:              # the file object reads in buffered chunks
                yield line

    def parse(lines):
        for n, line in enumerate(lines, 1):
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                log.warning('bad line %d: %s', n, e)   # or yield to a dead-letter sink

    def valid(events):
        return (e for e in events if e.get('engine_id') is not None)

    def batched(it, size):
        batch = []
        for x in it:
            batch.append(x)
            if len(batch) == size:
                yield batch
                batch = []
        if batch:
            yield batch

    for chunk in batched(valid(parse(read_lines('telemetry.jsonl'))), 5000):
        write_to_db(chunk)              # bulk insert 5,000 at a time
    »»»
    Memory is bounded by one batch, whatever the file size. «itertools.batched» exists in Python 3.12+.

    ## itertools you should know
    «islice» (take the first n lazily), «chain» (concatenate iterables), «groupby» (consecutive groups: the input **must be sorted by the key**, otherwise you get several groups per key), «tee» (split an iterator, buffers in memory if consumers drift apart), «accumulate» (running totals), «zip_longest», «count», «pairwise» (3.10+, consecutive pairs: perfect for deltas between readings).

    ## Laziness traps
    - **Exhausted iterators:** «events = parse(...)»; «count = sum(1 for _ in events)»; «for e in events: ...» does nothing. Materialise with «list()» only when it fits, or recreate the generator.
    - **Late binding in closures:** «[lambda: i for i in range(3)]» all return 2.
    - **Resources:** a generator holding an open file or DB cursor keeps it open until exhausted or closed; use «with» inside the generator and consume fully, or wrap in «contextlib.closing».
    - **Exceptions surface at consumption time**, far from where the generator was created, which confuses stack traces. Log with context (line number, file).
    - **Generators are not parallel**: they are lazy, not concurrent.

    ## Chunked processing in libraries
    - pandas: «pd.read_csv(path, chunksize=100_000)» yields DataFrames.
    - pyarrow: «pq.ParquetFile(path).iter_batches(batch_size=…)» streams record batches by row group.
    - DB cursors: «cursor.fetchmany(10_000)» or server-side cursors (psycopg «name=» cursor) instead of «fetchall()».
    - HTTP: paginate with a generator that yields pages until the API says there are no more.

    ## Generators and pipelines at scale
    When one process with generators is not enough, the same shape (read → parse → validate → batch → write) maps onto Spark (each partition is processed by an iterator: «mapPartitions» gives you exactly this), or onto Kafka consumers (an endless iterator of messages). Thinking in streams makes that move natural.

    ## How interviewers test this
    - "Process a 20 GB CSV on a laptop with 8 GB RAM."
    - "Difference between a list comprehension and a generator expression?"
    - "Why did my second loop over the parsed events do nothing?"
    - "Implement batching / sliding window / pairwise with generators."
  `, {
    check: [
      mcq('«events = (parse(l) for l in f)». You call «len(list(events))» then loop over «events». The loop…', ['Processes all events again', 'Does nothing: the generator is exhausted', 'Raises', 'Processes half'], 1, 'Iterators are single-pass.'),
      mcq('«itertools.groupby(rows, key=dealer)» returns three groups for dealer 4. Why?', ['A bug', 'The input was not sorted by dealer; groupby groups consecutive items only', 'Dealer 4 has NULLs', 'Too many rows'], 1, 'Sort by the key first (or use a dict).'),
      tf('A generator pipeline over a 50 GB file can run in constant memory if no step collects everything into a list.', true, 'Memory is bounded by buffers and one batch.'),
      mcq('Best way to read 30 million rows from Postgres into batches in Python?', ['cursor.fetchall()', 'A server-side cursor with fetchmany(n) in a generator', 'SELECT * into a list', 'One query per row'], 1, 'Bounded memory and few round trips.'),
    ],
    hands: [
      py({ q: '**Streaming parser with dead letters.** Write a generator «parse_lines(lines, dead)» that yields parsed JSON objects from an iterable of strings. Skip blank lines. For a line that is not valid JSON, or valid JSON that is not an object, or an object missing «engine_id», append «(line_number, reason)» to the list «dead» (reasons: «"bad_json"», «"not_object"», «"missing_engine_id"»; line numbers start at 1 and count blank lines) and continue. It must be **lazy**: it must work on an infinite iterator when you only take the first items.', starter: 'import json\n\ndef parse_lines(lines, dead):\n    pass\n',
        tests: `dead = []
lines = ['{"engine_id": 1, "t": 80}', '', 'not json', '[1,2]', '{"t": 5}', '{"engine_id": 2}']
out = list(parse_lines(lines, dead))
assert out == [{'engine_id': 1, 't': 80}, {'engine_id': 2}], out
assert dead == [(3, 'bad_json'), (4, 'not_object'), (5, 'missing_engine_id')], dead
import itertools
inf = ('{"engine_id": %d}' % i for i in itertools.count())
first = list(itertools.islice(parse_lines(inf, []), 3))
assert [x['engine_id'] for x in first] == [0, 1, 2]`,
        solution: `import json

def parse_lines(lines, dead):
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            dead.append((n, 'bad_json'))
            continue
        if not isinstance(obj, dict):
            dead.append((n, 'not_object'))
            continue
        if 'engine_id' not in obj:
            dead.append((n, 'missing_engine_id'))
            continue
        yield obj` }),
      py({ q: '**Sliding-window anomaly detector over a stream.** Write a generator «spikes(readings, window, factor)» over an iterable of «(engine_id, value)» tuples. Keep, **per engine**, the last «window» values (a «collections.deque(maxlen=window)»). For each reading, if the engine already has «window» previous values and the new value is greater than «factor» × their mean, yield «(engine_id, value)». Then add the value to that engine\'s window. Memory must be O(engines × window).', starter: 'from collections import deque, defaultdict\n\ndef spikes(readings, window, factor):\n    pass\n',
        tests: `data = [(1, 10), (1, 10), (2, 5), (1, 10), (1, 31), (2, 5), (2, 5), (2, 100), (1, 12)]
assert list(spikes(data, 3, 3)) == [(1, 31), (2, 100)]
assert list(spikes([(1, 1)], 3, 2)) == []`,
        solution: `from collections import deque, defaultdict

def spikes(readings, window, factor):
    hist = defaultdict(lambda: deque(maxlen=window))
    for eid, v in readings:
        h = hist[eid]
        if len(h) == window and v > factor * (sum(h) / window):
            yield (eid, v)
        h.append(v)` }),
    ],
  }),

  // ================================================================== Concurrency
  pyconc: T(`
    > **In one line:** in CPython the **GIL** (global interpreter lock) lets only one thread execute Python bytecode at a time. So: **threads** (or **asyncio**) speed up **I/O-bound** work (API calls, downloads, DB queries), **processes** speed up **CPU-bound** pure-Python work, and **vectorised/native libraries** (NumPy, Arrow, Polars, DuckDB) beat both because they run in C and release the GIL.

    ## Choosing
    | Workload | Tool | Why |
    |---|---|---|
    | Call 2,000 REST endpoints, download 500 files from blob storage | «ThreadPoolExecutor» or «asyncio» + «aiohttp/httpx» | Waiting on the network releases the GIL |
    | Parse 200 large CSVs with pure-Python logic | «ProcessPoolExecutor» / «multiprocessing» | Each process has its own interpreter and GIL |
    | Aggregate 50 GB on one machine | DuckDB / Polars | Native, multi-threaded, columnar |
    | Aggregate 5 TB | Spark | Many machines |
    | Thousands of concurrent long-lived connections (websockets, Kafka-like clients) | asyncio | One thread, cheap coroutines |

    Python 3.13 introduced an experimental **free-threaded** build (no GIL); **Python 3.14 (October 2025) made it officially supported** (PEP 779) but still **optional**: a separate interpreter («python3.14t»), not the default, and many C-extension libraries are still catching up. Production data code and platforms (Databricks runtimes, Airflow images) still run the standard GIL build in 2026. Mention it to show you are current; do not design around it yet.

    ## Threads
    «««python
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fetch, url): url for url in urls}
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                failures.append((futures[fut], repr(e)))   # one failure must not kill the batch
    »»»
    - **Bound the concurrency** («max_workers») to respect API rate limits and DB connection limits. Unbounded fan-out is how you DDoS a partner API or exhaust a connection pool.
    - Shared mutable state needs a «Lock», or better, return values and combine in the main thread.
    - Exceptions in a thread surface only when you call «result()»: if you never call it, failures vanish silently.

    ## Processes
    - Arguments and results are **pickled** and copied between processes: passing a 2 GB DataFrame to each worker costs more than the work. Pass file paths or partition IDs; let workers read their own slice.
    - Start-up cost: spawn (default on macOS/Windows; Linux defaults to fork, moving to spawn/forkserver) re-imports your module, so guard the entry point with «if __name__ == '__main__':».
    - Forking a process that holds open DB connections or threads can corrupt them. Create connections inside the worker.

    ## asyncio
    - Cooperative: coroutines yield at «await». One blocking call (e.g. «requests.get», «time.sleep», a sync DB driver) **blocks the whole event loop**. Use async libraries or «asyncio.to_thread».
    - Limit concurrency with «asyncio.Semaphore(n)».
    - «asyncio.gather(*tasks, return_exceptions=True)» so one failure does not cancel everything silently.
    - Great for high-concurrency I/O; overkill for "call 20 APIs", where a thread pool is simpler.

    ## In data platforms
    - Airflow tasks, Spark drivers and Databricks notebooks are Python processes: the same rules apply inside them. E.g. listing 100k blobs in ADLS sequentially takes hours; with a bounded thread pool, minutes.
    - **Do not** use Python threads to parallelise work that Spark should do: if data is big, give it to the engine.
    - In PySpark, Python UDFs run in separate Python worker processes per executor core; that serialisation is why UDFs are slow (see UDFs).

    ## How interviewers test this
    - "You need to call an API for 100k IDs. How do you make it fast and safe?" (threads/async + bounded concurrency + retries with backoff + rate limit + checkpointing progress.)
    - "Why did multithreading not speed up my CSV parsing?" (CPU-bound + GIL.)
    - "What happens to an exception raised inside a ThreadPoolExecutor task?"
  `, {
    check: [
      mcq('Downloading 500 files from blob storage. Best simple speed-up?', ['ProcessPoolExecutor', 'ThreadPoolExecutor with bounded workers', 'A bigger CPU', 'Recursion'], 1, 'I/O-bound: threads release the GIL while waiting.'),
      mcq('Pure-Python CPU-heavy parsing of 200 files gets no faster with 16 threads. Why?', ['Disk is slow', 'The GIL lets one thread run Python bytecode at a time', 'Threads are broken', 'Too few files'], 1, 'Use processes, or a native library.'),
      tf('An exception raised in a ThreadPoolExecutor task is printed automatically even if you never call result().', false, 'It is stored in the future and lost if never retrieved.'),
      mcq('In asyncio code, a call to «requests.get(url)»…', ['Runs concurrently', 'Blocks the entire event loop', 'Is converted to async automatically', 'Raises'], 1, 'Use an async client or asyncio.to_thread.'),
    ],
    hands: [
      py({ q: '**Bounded concurrent fetch with per-item failures.** Write «fetch_all(ids, fetch, max_workers=8)» that calls «fetch(id)» for every id using a «ThreadPoolExecutor» and returns «(results, failures)» where «results» is a dict id → value for successes and «failures» is a dict id → the exception\'s class name, for ids whose call raised. One failure must not stop the others.', starter: 'from concurrent.futures import ThreadPoolExecutor, as_completed\n\ndef fetch_all(ids, fetch, max_workers=8):\n    pass\n',
        tests: `def f(i):
    if i % 3 == 0:
        raise TimeoutError('slow')
    if i == 4:
        raise ValueError('bad')
    return i * 10
res, fail = fetch_all(range(1, 8), f, 4)
assert res == {1: 10, 2: 20, 5: 50, 7: 70}, res
assert fail == {3: 'TimeoutError', 4: 'ValueError', 6: 'TimeoutError'}, fail`,
        solution: `from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_all(ids, fetch, max_workers=8):
    results, failures = {}, {}
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futs = {pool.submit(fetch, i): i for i in ids}
        for fut in as_completed(futs):
            i = futs[fut]
            try:
                results[i] = fut.result()
            except Exception as e:
                failures[i] = type(e).__name__
    return results, failures` }),
    ],
  }),

  // ================================================================== Errors, retries, logging
  pyerrors: T(`
    > **In one line:** production data code must **fail loudly on bugs, retry on transient faults, quarantine bad records, and always clean up**. That needs a clear split between **retryable** and **non-retryable** errors, **exponential backoff with jitter**, **structured logging with context**, and **context managers** for every resource.

    ## Classify errors before handling them
    | Kind | Examples | Action |
    |---|---|---|
    | **Transient** | Timeout, connection reset, HTTP 429/503, throttling, deadlock victim, Delta concurrent-commit conflict | Retry with backoff, bounded |
    | **Permanent input** | Malformed JSON, missing required field, schema mismatch on one record | Do **not** retry. Send the record to a dead-letter store with a reason; continue |
    | **Permanent system** | Auth failure (401/403), missing table, wrong config, a bug (KeyError in your code) | Fail the task fast and alert. Retrying wastes time and hides the bug |
    The worst anti-pattern: «except Exception: pass» (or log and continue) around a whole batch. Data silently disappears.

    ## Retry with exponential backoff and jitter
    «««python
    import random, time
    RETRYABLE = (TimeoutError, ConnectionError)

    def with_retry(fn, attempts=5, base=0.5, cap=30):
        for i in range(attempts):
            try:
                return fn()
            except RETRYABLE as e:
                if i == attempts - 1:
                    raise
                sleep = min(cap, base * 2 ** i) * random.uniform(0.5, 1.0)   # jitter
                log.warning('retry %d/%d after %s: %.1fs', i + 1, attempts, type(e).__name__, sleep)
                time.sleep(sleep)
    »»»
    - **Jitter** prevents a "thundering herd" where 200 workers retry at the same instant and knock the service over again.
    - Respect **«Retry-After»** headers on 429/503.
    - **Retries are only safe for idempotent operations.** Retrying a non-idempotent POST can create two orders: use idempotency keys.
    - Retries at several layers multiply: 3 HTTP-client retries × 3 task retries × 3 DAG retries = 27 attempts. Decide which layer owns retries.
    - Libraries: «tenacity» (decorators with stop/wait/retry conditions), «urllib3 Retry» for requests sessions.

    ## Exceptions done right
    - Catch the **narrowest** exception you can handle.
    - Re-raise with context: «raise PipelineError(f'load failed for {date}') from e» keeps the original traceback («__cause__»).
    - «finally» and context managers for cleanup; never rely on garbage collection to close files, connections or locks.
    - Custom exception hierarchy for a pipeline («RetryableError», «DataContractError») lets the orchestrator decide behaviour by type.
    - Python 3.11+ «ExceptionGroup» / «except*» for multiple failures from concurrent tasks.

    ## Context managers
    «««python
    from contextlib import contextmanager

    @contextmanager
    def staged_table(conn, name):
        tmp = f'{name}__staging'
        conn.execute(f'CREATE TABLE {tmp} AS SELECT * FROM {name} WHERE 1=0')
        try:
            yield tmp
            conn.execute(f'ALTER TABLE {tmp} RENAME TO {name}')   # publish only on success (simplified)
        finally:
            conn.execute(f'DROP TABLE IF EXISTS {tmp}')
    »»»
    The «with» block guarantees cleanup on success, exception or Ctrl-C. Files, DB connections, locks, temp directories, Spark sessions in tests: all should be context-managed.

    ## Logging that helps at 3 a.m.
    - Use the «logging» module, never «print», in pipelines: levels, handlers, and it works with Airflow/Databricks log capture.
    - Include **context** in every message: pipeline, run id / logical date, partition, batch id, counts. Structured (JSON) logs make them searchable in Log Analytics / Splunk / Datadog.
    - Log **counts at every stage** (read, valid, rejected, written): most data incidents are visible as a count mismatch before anyone notices a wrong number.
    - Use lazy formatting «log.info('rows=%d', n)» and never log secrets or PII (connection strings, tokens, customer names).
    - «log.exception('…')» inside «except» records the traceback.

    ## How interviewers test this
    - "Your API source returns 429s and occasional 500s. Write the retry logic."
    - "Which errors would you not retry?"
    - "What is wrong with «except Exception: pass»?"
    - "How do you make sure a temp table is always dropped?"
  `, {
    check: [
      multi('Which errors should normally be retried with backoff?', ['HTTP 429 Too Many Requests', 'HTTP 503', 'A KeyError in your transform code', 'Connection reset', 'HTTP 401 Unauthorized', 'A malformed JSON record'], [0, 1, 3], 'Transient faults only. Bugs, auth and bad records are not fixed by waiting.'),
      mcq('Why add random jitter to backoff?', ['To make tests flaky', 'So many clients do not retry at the same instant and overload the service again', 'It is required by HTTP', 'To reduce log size'], 1, 'Avoid the thundering herd.'),
      tf('Retrying is always safe as long as you use exponential backoff.', false, 'Only idempotent operations are safe to retry.'),
      mcq('HTTP client retries 3×, the task retries 3×, the DAG retries 3×. Worst-case attempts?', ['9', '27', '3', '6'], 1, 'Retry layers multiply. Decide which layer owns retries.'),
    ],
    hands: [
      py({ q: '**Retry with backoff, testably.** Write «retry(fn, attempts, base, retry_on, sleep)» that calls «fn()»; on an exception that is an instance of a class in the tuple «retry_on», calls «sleep(base * 2 ** i)» (i = 0, 1, …) and tries again, up to «attempts» total calls; re-raises the last exception when attempts run out. Any other exception is raised **immediately** without sleeping. Return fn\'s value on success. (No jitter here so the test is deterministic; «sleep» is injected.)', starter: 'def retry(fn, attempts, base, retry_on, sleep):\n    pass\n',
        tests: `calls, slept = [], []
def flaky():
    calls.append(1)
    if len(calls) < 3:
        raise TimeoutError()
    return 'ok'
assert retry(flaky, 5, 0.5, (TimeoutError,), slept.append) == 'ok'
assert slept == [0.5, 1.0], slept
slept.clear()
def always(): raise ConnectionError()
try:
    retry(always, 3, 1, (ConnectionError,), slept.append); assert False
except ConnectionError:
    pass
assert slept == [1, 2], slept
slept.clear()
def bug(): raise KeyError('x')
try:
    retry(bug, 5, 1, (TimeoutError,), slept.append); assert False
except KeyError:
    pass
assert slept == []`,
        solution: `def retry(fn, attempts, base, retry_on, sleep):
    for i in range(attempts):
        try:
            return fn()
        except retry_on:
            if i == attempts - 1:
                raise
            sleep(base * 2 ** i)` }),
    ],
  }),

  // ================================================================== File formats in Python
  pyio: T(`
    > **In one line:** reading and writing files correctly is most of a junior DE's real work, and most of its bugs: **encodings**, **delimiters and quoting**, **type inference**, **huge files**, **partial writes**. Know CSV's traps, prefer **JSON Lines** for events and **Parquet** (via pyarrow) for analytics, and write files **atomically**.

    ## CSV
    - Use the «csv» module (or pandas/pyarrow/DuckDB), never «line.split(',')»: quoted fields contain commas and newlines («"Pune, MH"»).
    - **Encoding:** always pass «encoding=»; Excel exports are often «utf-8-sig» (BOM makes the first column name «\\ufeffid») or «cp1252». Decide what to do on invalid bytes («errors='strict'» in pipelines so you notice).
    - **Newlines:** open with «newline=''» when using the csv module, or embedded newlines break rows.
    - **Type inference is a trap:** pandas guesses «dtype»: leading zeros vanish («00123» → 123), IDs become floats when one value is missing («NaN» forces float64), «"NA"»/«"null"» strings become NaN, dates may parse day-first or month-first. In pipelines specify «dtype=» (often «str» at bronze) and parse explicitly in silver.
    - Header drift: columns reordered or renamed by the source. Validate the header against the contract and map **by name**, not position.
    - Large CSVs: stream with the csv module or «chunksize», or let DuckDB/Polars read them in parallel.

    ## JSON and JSON Lines
    - A single JSON array file must be parsed whole (memory). **JSON Lines** (one object per line) streams, appends and splits cleanly; it is the standard for event dumps and API extracts.
    - Big integers beyond 2^53 lose precision in JavaScript and some parsers; keep IDs as strings.
    - Nested structures: flatten deliberately («pd.json_normalize», or keep as a struct/variant column in bronze and parse in silver).
    - Dates have no JSON type: agree on ISO-8601 with an offset («2026-11-27T10:15:00+05:30»).

    ## Parquet with pyarrow
    «««python
    import pyarrow as pa, pyarrow.parquet as pq
    schema = pa.schema([('engine_id', pa.int32()), ('ts', pa.timestamp('ms', tz='UTC')),
                        ('temp_c', pa.float32()), ('amount', pa.decimal128(18, 2))])
    table = pa.Table.from_pylist(rows, schema=schema)          # explicit schema: no guessing
    pq.write_table(table, 'part-0001.parquet', compression='zstd', row_group_size=128_000)

    pf = pq.ParquetFile('part-0001.parquet')
    print(pf.metadata.num_rows, pf.schema_arrow)               # read metadata only
    t = pq.read_table('data/', columns=['engine_id', 'temp_c'],
                      filters=[('engine_id', '=', 7)])         # column pruning + row-group skipping
    »»»
    - Parquet stores schema, types, min/max per row group and compression per column: reading two columns of a 200-column file reads only those two.
    - **Row group size** (typically 64-512 MB uncompressed per row group in Spark-sized files) and **file size** (aim ~128 MB-1 GB) matter for skipping and parallelism; thousands of tiny Parquet files are the "small files problem".
    - «pyarrow.dataset» reads partitioned directories (Hive style «event_date=2026-11-27/»).

    ## Atomic writes
    A process killed mid-write leaves a **half-written file** that the next step reads as valid. Pattern: write to «path + '.tmp'» (same filesystem), «flush» + «fsync», then «os.replace(tmp, path)» (atomic rename on POSIX and Windows). On object storage (S3, ADLS) there is no cheap rename of directories: write to a unique final key, then publish by writing a **manifest/_SUCCESS marker** or by committing to a table format (Delta/Iceberg), which is the real fix.

    ## Compression
    gzip CSVs are **not splittable**: one 20 GB «.csv.gz» is read by a single Spark task. Use splittable formats (Parquet with internal compression, bzip2, or many smaller gz files). zstd and snappy are the common Parquet codecs (zstd smaller, snappy faster).

    ## How interviewers test this
    - "A CSV from a supplier loads with IDs as floats and missing leading zeros. Why and fix?"
    - "Why JSON Lines over a JSON array for event dumps?"
    - "How do you make sure downstream never reads a half-written file?"
    - "Why is one task in Spark reading a whole 20 GB file?" (non-splittable gzip)
  `, {
    check: [
      mcq('pandas loads «part_no» «00123» as 123 and «dealer_id» as 4.0. Why?', ['Bug in pandas', 'Type inference: numeric parsing drops zeros; one missing value forces float', 'Encoding', 'Delimiter'], 1, 'Specify dtype=str at bronze, parse explicitly later.'),
      mcq('First column name reads as «\\ufeffid». Cause?', ['Corrupt file', 'A UTF-8 BOM: open with encoding="utf-8-sig"', 'Wrong delimiter', 'Windows newlines'], 1, 'Excel often writes a BOM.'),
      tf('A single 20 GB .csv.gz file can be split across many Spark tasks.', false, 'gzip is not splittable; one task reads it.'),
      mcq('Safest way to replace an output file on local disk?', ['Open it with "w" and write', 'Write to a temp file on the same filesystem, fsync, then os.replace', 'Delete then write', 'Append'], 1, 'Rename is atomic; readers see old or new, never half.'),
    ],
    hands: [
      py({ q: '**Robust CSV ingestion.** Write «load_csv(text, required)» that parses CSV text (header row first) with the «csv» module, keeps **all values as strings** (no type guessing), strips whitespace around header names and values, maps rows **by header name**, and returns «(rows, errors)». A row is an error if it has a different number of fields than the header (reason «"field_count"») or any required column is empty (reason «"missing:<col>"», first missing column only). Errors are «(line_no, reason)» where the header is line 1. Quoted commas and quoted newlines must work (line numbers count physical rows of the csv reader, i.e. use the reader\'s line_num **at the start of the record** is not required: number data records 2, 3, … in order).', starter: 'import csv, io\n\ndef load_csv(text, required):\n    pass\n',
        tests: `text = 'id , part_no,city\\n1,00123,"Pune, MH"\\n2,,Delhi\\n3,0007\\n4,0042,"Navi\\nMumbai"\\n'
rows, errs = load_csv(text, ['id', 'part_no'])
assert rows == [{'id': '1', 'part_no': '00123', 'city': 'Pune, MH'}, {'id': '4', 'part_no': '0042', 'city': 'Navi\\nMumbai'}], rows
assert errs == [(3, 'missing:part_no'), (4, 'field_count')], errs`,
        solution: `import csv, io

def load_csv(text, required):
    reader = csv.reader(io.StringIO(text, newline=''))
    header = [h.strip() for h in next(reader)]
    rows, errors = [], []
    for n, rec in enumerate(reader, 2):
        if len(rec) != len(header):
            errors.append((n, 'field_count'))
            continue
        row = {h: v.strip() for h, v in zip(header, rec)}
        miss = next((c for c in required if not row.get(c)), None)
        if miss:
            errors.append((n, 'missing:' + miss))
            continue
        rows.append(row)
    return rows, errors` }),
    ],
  }),
};
