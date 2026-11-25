const { learn, mcq, tf, multi, fill, match, order, py, bug, viz, world, lesson } = require('./_h.cjs');

module.exports = world('python', 'Python for Data Engineering', 'core',
  'The Python a DE uses every day: collections, comprehensions, grouping, parsing JSON/CSV, generators for big files, API pagination with retries, and clean testable pipeline code.',
  [
    lesson('p1', 'Core types and collections', 18, [
      learn('The four collections', `
        | Type | Literal | Ordered | Mutable | Duplicates | Lookup | Use for |
        |---|---|---|---|---|---|---|
        | «list» | «[1, 2]» | yes | yes | yes | O(n) | sequences, batches |
        | «tuple» | «(1, 2)» | yes | no | yes | O(n) | fixed records, dict keys |
        | «dict» | «{'k': 1}» | insertion | yes | keys unique | **O(1)** | lookups, grouping, JSON |
        | «set» | «{1, 2}» | no | yes | no | **O(1)** | dedup, membership |

        «x in some_list» scans the whole list. «x in some_set» is a hash lookup. On a million IDs that's the difference between seconds and hours.

        Useful built-ins: «len, sorted(x, key=…, reverse=True), sum, min, max, enumerate, zip, any, all».
        From «collections»: «Counter» (frequency), «defaultdict(list)» (grouping), «deque» (queues).
      `),
      mcq('What does this print?', ['[1, 2, 3]', '[1, 2, 3, 4]', '[4]', 'Error'], 1, 'Both names point to the **same** list object. Mutating through «b» changes «a». Copy with «a.copy()» or «list(a)».', { code: 'a = [1, 2, 3]\nb = a\nb.append(4)\nprint(a)', lang: 'python' }),
      mcq('Fastest way to check whether 50,000 incoming claim IDs already exist among 2 million loaded IDs?', ['Loop over a list of loaded IDs for each incoming ID', 'Put loaded IDs in a set, then test membership', 'Sort both lists and compare positions', 'Use a regex'], 1, 'A set makes each membership test O(1): ~50k lookups instead of 50k × 2M comparisons.'),
      mcq(`What does «sorted(rows, key=lambda r: r['amount'], reverse=True)[:3]» return?`, ['The 3 rows with the smallest amount', 'The 3 rows with the largest amount', 'The amounts only', 'An error, since dicts can\'t be sorted'], 1, 'sorted with a key function and reverse=True gives descending order. Slicing takes the first 3 (top-N).'),
      py({ q: 'Write «unique_in_order(ids)» that removes duplicates from a list **but keeps the first-seen order**. Example: «[3, 1, 3, 2, 1]» → «[3, 1, 2]».', starter: 'def unique_in_order(ids):\n    # your code\n    pass\n', tests: `assert unique_in_order([3, 1, 3, 2, 1]) == [3, 1, 2], unique_in_order([3, 1, 3, 2, 1])
assert unique_in_order([]) == []
assert unique_in_order(['a', 'a']) == ['a']`, solution: `def unique_in_order(ids):
    seen = set()
    out = []
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out`, hint: 'Track a set of seen values; append to the output only the first time. (dict.fromkeys(ids) also preserves order!)' }),
      py({ q: 'Write «top_issue(issues)» that returns the most frequent issue type from a list of strings, using «collections.Counter».', starter: 'from collections import Counter\n\ndef top_issue(issues):\n    pass\n', tests: `assert top_issue(['Fuel Leak', 'Overheating', 'Fuel Leak']) == 'Fuel Leak'
assert top_issue(['A']) == 'A'`, solution: `from collections import Counter

def top_issue(issues):
    return Counter(issues).most_common(1)[0][0]` }),
    ]),
    lesson('p2', 'Functions, comprehensions, grouping', 20, [
      learn('Comprehensions and grouping', `
        «««python
        amounts = [r['amount'] for r in rows if r['status'] == 'Approved']    # list comprehension
        by_id   = {r['claim_id']: r for r in rows}                             # dict comprehension (index)
        dealers = {r['dealer_id'] for r in rows}                               # set comprehension

        from collections import defaultdict
        groups = defaultdict(list)                  # GROUP BY in Python
        for r in rows:
            groups[r['dealer_id']].append(r['amount'])
        totals = {k: sum(v) for k, v in groups.items()}
        »»»
        **Functions**: give them one job, clear inputs and outputs, no hidden global state. Pure functions are easy to test.

        Watch out for the **mutable default argument** trap: «def f(x, acc=[])» creates one list shared across *all* calls. Use «acc=None» and create it inside.
      `),
      py({ q: 'Write «totals_by_dealer(rows)» returning a dict «{dealer_id: total_amount}» from a list of dicts with keys «dealer_id» and «amount». Skip rows whose amount is «None».', starter: 'def totals_by_dealer(rows):\n    pass\n', tests: `rows = [{'dealer_id': 1, 'amount': 100}, {'dealer_id': 2, 'amount': 50}, {'dealer_id': 1, 'amount': None}, {'dealer_id': 1, 'amount': 25}]
assert totals_by_dealer(rows) == {1: 125, 2: 50}, totals_by_dealer(rows)
assert totals_by_dealer([]) == {}`, solution: `from collections import defaultdict

def totals_by_dealer(rows):
    out = defaultdict(int)
    for r in rows:
        if r['amount'] is not None:
            out[r['dealer_id']] += r['amount']
    return dict(out)` }),
      py({ q: 'Write «flatten(nested)» that flattens arbitrarily nested lists: «[1, [2, [3, 4]], 5]» → «[1, 2, 3, 4, 5]».', starter: 'def flatten(nested):\n    pass\n', tests: `assert flatten([1, [2, [3, 4]], 5]) == [1, 2, 3, 4, 5]
assert flatten([]) == []
assert flatten([[[]]]) == []`, solution: `def flatten(nested):
    out = []
    for x in nested:
        if isinstance(x, list):
            out.extend(flatten(x))
        else:
            out.append(x)
    return out`, hint: 'Recursion: if the item is a list, extend with flatten(item).' }),
      py({ q: 'Write «latest_per_key(events, key, ts)» that returns a dict «{key_value: event}» keeping only the event with the greatest timestamp per key (the Python twin of ROW_NUMBER dedup).', starter: 'def latest_per_key(events, key, ts):\n    pass\n', tests: `ev = [{'order_id': 1, 'status': 'CREATED', 'at': '09:00'}, {'order_id': 1, 'status': 'SHIPPED', 'at': '11:00'}, {'order_id': 2, 'status': 'CREATED', 'at': '10:00'}, {'order_id': 1, 'status': 'CONFIRMED', 'at': '10:00'}]
r = latest_per_key(ev, 'order_id', 'at')
assert r[1]['status'] == 'SHIPPED', r
assert r[2]['status'] == 'CREATED'
assert len(r) == 2`, solution: `def latest_per_key(events, key, ts):
    best = {}
    for e in events:
        k = e[key]
        if k not in best or e[ts] > best[k][ts]:
            best[k] = e
    return best` }),
      bug('This helper collects bad rows per batch, but every call returns errors from earlier batches too. Which line causes it?', `def validate(batch, errors=[]):
    for row in batch:
        if row.get("amount") is None:
            errors.append(row)
    return errors`, 1, 'Default arguments are evaluated **once** at definition time, so the same list is shared by every call. Use «errors=None» and «errors = [] if errors is None else errors».'),
      mcq('What is «[x * 2 for x in range(5) if x % 2 == 0]»?', ['[0, 4, 8]', '[0, 2, 4, 6, 8]', '[2, 6]', '[0, 1, 2, 3, 4]'], 0, 'Even x in 0..4 are 0, 2, 4, doubled to 0, 4, 8.'),
    ]),
    lesson('p3', 'Files, JSON, CSV and errors', 20, [
      learn('Parsing data and handling failure', `
        «««python
        import json, csv, io
        rec = json.loads('{"claimId": "C-1", "amt": "124500.00"}')   # str -> dict
        text = json.dumps(rec, indent=2)                              # dict -> str

        with open('claims.csv', newline='') as f:        # 'with' always closes the file
            for row in csv.DictReader(f):                # each row is a dict
                ...

        try:
            amount = float(row['amt'])
        except (ValueError, KeyError) as e:
            log.warning("bad row %s: %s", row, e)        # quarantine, don't crash the whole batch
            bad_rows.append(row)
        else:
            good_rows.append({**row, 'amt': amount})
        finally:
            ...                                          # always runs
        »»»
        **Pipeline rule:** a bad record should be **quarantined and reported**, not silently dropped and not allowed to kill a million good records. Catch *specific* exceptions; a bare «except:» hides real bugs.
      `),
      py({ q: 'Write «parse_claims(lines)». Each line is a JSON string with «claimId» and «amt» (a string that may contain commas, like «"1,24,500.50"»). Return a tuple «(good, bad)»: «good» is a list of dicts «{`claim_id`: str, `amount`: float}»; lines that are not valid JSON or have a non-numeric amount go to «bad» (keep the original line).', starter: 'import json\n\ndef parse_claims(lines):\n    good, bad = [], []\n    # your code\n    return good, bad\n', tests: `lines = ['{"claimId": "C-1", "amt": "1,24,500.50"}', 'not json', '{"claimId": "C-2", "amt": "abc"}', '{"claimId": "C-3", "amt": "99"}']
good, bad = parse_claims(lines)
assert good == [{'claim_id': 'C-1', 'amount': 124500.5}, {'claim_id': 'C-3', 'amount': 99.0}], good
assert bad == ['not json', '{"claimId": "C-2", "amt": "abc"}'], bad`, solution: `import json

def parse_claims(lines):
    good, bad = [], []
    for line in lines:
        try:
            rec = json.loads(line)
            amount = float(str(rec['amt']).replace(',', ''))
        except (json.JSONDecodeError, KeyError, ValueError):
            bad.append(line)
            continue
        good.append({'claim_id': rec['claimId'], 'amount': amount})
    return good, bad`, hint: 'try: json.loads + float(amt.replace(",", "")) / except (json.JSONDecodeError, KeyError, ValueError).' }),
      py({ q: 'Write «csv_to_records(text)» that parses CSV text with a header row into a list of dicts using the «csv» module, converting the «qty» column to «int». Empty «qty» becomes «None».', starter: 'import csv, io\n\ndef csv_to_records(text):\n    pass\n', tests: `t = "part,qty\\nOil Filter,20\\nTurbo,\\nPump,5\\n"
assert csv_to_records(t) == [{'part': 'Oil Filter', 'qty': 20}, {'part': 'Turbo', 'qty': None}, {'part': 'Pump', 'qty': 5}], csv_to_records(t)`, solution: `import csv, io

def csv_to_records(text):
    out = []
    for row in csv.DictReader(io.StringIO(text)):
        row['qty'] = int(row['qty']) if row['qty'] else None
        out.append(row)
    return out` }),
      py({ q: 'Nested JSON → flat rows: write «flatten_order(order)». An order looks like «{`id`: 7, `dealer`: {`id`: 3, `region`: `West`}, `lines`: [{`part`: `Pump`, `qty`: 2}, ...]}». Return one dict per line: «{`order_id`, `dealer_id`, `region`, `part`, `qty`}». (This is what «explode» does in Spark.)', starter: 'def flatten_order(order):\n    pass\n', tests: `o = {'id': 7, 'dealer': {'id': 3, 'region': 'West'}, 'lines': [{'part': 'Pump', 'qty': 2}, {'part': 'Seal', 'qty': 10}]}
r = flatten_order(o)
assert r == [{'order_id': 7, 'dealer_id': 3, 'region': 'West', 'part': 'Pump', 'qty': 2}, {'order_id': 7, 'dealer_id': 3, 'region': 'West', 'part': 'Seal', 'qty': 10}], r
assert flatten_order({'id': 1, 'dealer': {'id': 1, 'region': 'N'}, 'lines': []}) == []`, solution: `def flatten_order(order):
    return [
        {'order_id': order['id'], 'dealer_id': order['dealer']['id'], 'region': order['dealer']['region'],
         'part': ln['part'], 'qty': ln['qty']}
        for ln in order['lines']
    ]` }),
      mcq('Why use «with open(path) as f:» instead of «f = open(path)»?', ['It is faster', 'The file is closed automatically, even if an exception is raised', 'It reads the whole file into memory', 'It locks the file for other users'], 1, '«with» is a context manager: cleanup is guaranteed. The same pattern applies to database connections and locks.'),
    ]),
    lesson('p4', 'Generators and big files', 15, [
      learn('Stream, don\'t load', `
        A 20 GB log file doesn't fit in memory. **Generators** produce one item at a time:

        «««python
        def read_lines(path):
            with open(path) as f:
                for line in f:          # file objects are lazy iterators already
                    yield line.rstrip('\\n')

        def batched(iterable, size):
            batch = []
            for item in iterable:
                batch.append(item)
                if len(batch) == size:
                    yield batch
                    batch = []
            if batch:
                yield batch             # don't forget the last partial batch!

        for chunk in batched(read_lines('telemetry.log'), 10_000):
            load_to_warehouse(chunk)    # constant memory, bulk inserts
        »»»
        - «yield» pauses the function and resumes on the next request: **lazy evaluation**, the same idea as Spark transformations.
        - Generator expressions: «sum(len(l) for l in lines)» (parentheses, no list built).
        - Pandas equivalent: «pd.read_csv(path, chunksize=100_000)».
      `),
      py({ q: 'Implement the generator «batched(iterable, size)» that yields lists of at most «size» items, **including the final partial batch**.', starter: 'def batched(iterable, size):\n    pass\n', tests: `assert list(batched(range(7), 3)) == [[0, 1, 2], [3, 4, 5], [6]]
assert list(batched([], 3)) == []
import types
assert isinstance(batched([1], 1), types.GeneratorType), 'use yield'`, solution: `def batched(iterable, size):
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch` }),
      tf('A generator can be iterated over twice and gives the same items again.', false, 'Generators are single-use. Once exhausted they yield nothing. Recreate it, or materialize to a list if you really need two passes.'),
      mcq(`Memory use of «total = sum(r['amount'] for r in read_records(path))» for a 50 GB file?`, ['About 50 GB', 'Roughly constant: one record at a time', 'Twice the file size', 'It depends on the number of CPU cores'], 1, 'A generator expression feeds sum() one value at a time.'),
    ]),
    lesson('p5', 'APIs: pagination, retries, rate limits', 20, [
      learn('Ingesting from REST APIs', `
        «««python
        import time, requests

        def fetch_all(url, token, page_size=200):
            page, rows = 1, []
            while True:
                resp = get_with_retry(url, params={'page': page, 'page_size': page_size},
                                      headers={'Authorization': f'Bearer {token}'})
                data = resp.json()
                rows.extend(data['items'])
                if not data.get('next_page'):        # stop condition!
                    return rows
                page += 1

        def get_with_retry(url, retries=5, **kw):
            for attempt in range(retries):
                r = requests.get(url, timeout=30, **kw)
                if r.status_code == 429 or r.status_code >= 500:   # throttled / server error: retry
                    time.sleep(min(60, 2 ** attempt))               # exponential backoff
                    continue
                r.raise_for_status()                                # 4xx: our bug, fail loudly
                return r
            raise RuntimeError(f'gave up after {retries} attempts: {url}')
        »»»
        - Pagination styles: **page number**, **offset/limit**, **cursor/next token** (best for changing data).
        - Retry only **transient** errors (timeouts, 429, 5xx). Never blindly retry 400/401/403.
        - Add jitter to backoff so 50 workers don't retry at the same instant.
        - Secrets come from a vault or environment variables, **never hard-coded**.
        - For incremental pulls use «updated_since=<watermark>».
      `),
      py({ q: 'Implement «fetch_all(get_page)». «get_page(cursor)» returns a dict «{`items`: [...], `next`: cursor_or_None}». Start with cursor «None» and collect all items until «next» is «None».', starter: 'def fetch_all(get_page):\n    pass\n', tests: `pages = {None: {'items': [1, 2], 'next': 'b'}, 'b': {'items': [3], 'next': 'c'}, 'c': {'items': [], 'next': None}}
calls = []
def fake(cursor):
    calls.append(cursor)
    return pages[cursor]
assert fetch_all(fake) == [1, 2, 3]
assert calls == [None, 'b', 'c'], calls`, solution: `def fetch_all(get_page):
    items, cursor = [], None
    while True:
        page = get_page(cursor)
        items.extend(page['items'])
        cursor = page['next']
        if cursor is None:
            return items` }),
      py({ q: 'Implement «with_retry(fn, retries, sleep)». Call «fn()». If it raises «TransientError», wait «sleep(2 ** attempt)» (attempt starts at 0) and retry, up to «retries» attempts in total; then re-raise. Any **other** exception must propagate immediately without retrying.', starter: 'class TransientError(Exception):\n    pass\n\ndef with_retry(fn, retries, sleep):\n    pass\n', tests: `waits = []
state = {'n': 0}
def flaky():
    state['n'] += 1
    if state['n'] < 3:
        raise TransientError('429')
    return 'ok'
assert with_retry(flaky, 5, waits.append) == 'ok'
assert waits == [1, 2], waits
def always():
    raise TransientError('down')
waits.clear()
try:
    with_retry(always, 3, waits.append); assert False, 'should raise'
except TransientError:
    pass
assert waits == [1, 2], 'no sleep after the last attempt: ' + str(waits)
def bad():
    raise ValueError('400 bad request')
try:
    with_retry(bad, 5, waits.append); assert False
except ValueError:
    pass`, solution: `class TransientError(Exception):
    pass

def with_retry(fn, retries, sleep):
    for attempt in range(retries):
        try:
            return fn()
        except TransientError:
            if attempt == retries - 1:
                raise
            sleep(2 ** attempt)`, hint: 'Loop over attempts; return on success; on TransientError re-raise if it was the last attempt, else sleep(2 ** attempt).' }),
      multi('Which responses should an ingestion job retry automatically?', ['429 Too Many Requests', '503 Service Unavailable', 'Connection timeout', '401 Unauthorized', '400 Bad Request'], [0, 1, 2], '401/400 mean your request or credentials are wrong. Retrying just hammers the API. Fail and alert.'),
    ]),
    lesson('p6', 'Pipeline-grade Python', 15, [
      learn('Code that survives production', `
        - **Logging, not print**: «log = logging.getLogger(__name__); log.info("loaded %d rows", n)». Levels and timestamps go to central logs.
        - **Config outside code**: env vars or YAML for paths, dates, credentials references. The same code runs in dev and prod.
        - **Type hints + dataclasses** make records explicit:
        «««python
        from dataclasses import dataclass
        @dataclass(frozen=True)
        class Claim:
            claim_id: int
            dealer_id: int
            amount: float
        »»»
        - **Tests** with «pytest»: unit-test pure transformation functions with small inputs, including edge cases (empty input, NULLs, duplicates).
        - **Idempotent entry point**: «run(date)» processes exactly one logical date and can be re-run safely.
        - Virtual environments / «requirements.txt» / Docker pin dependencies.
      `),
      py({ q: 'Write a pure function «age_bucket(days)» returning «`0-7`», «`8-15`», «`16-30`» or «`30+`» (boundaries inclusive on the upper end: 7 → «`0-7`», 30 → «`16-30`»). Raise «ValueError» for negative input. The tests cover edges.', starter: 'def age_bucket(days):\n    pass\n', tests: `assert age_bucket(0) == '0-7'
assert age_bucket(7) == '0-7'
assert age_bucket(8) == '8-15'
assert age_bucket(15) == '8-15'
assert age_bucket(30) == '16-30'
assert age_bucket(31) == '30+'
try:
    age_bucket(-1); assert False, 'negative should raise'
except ValueError:
    pass`, solution: `def age_bucket(days):
    if days < 0:
        raise ValueError('days must be >= 0')
    if days <= 7:
        return '0-7'
    if days <= 15:
        return '8-15'
    if days <= 30:
        return '16-30'
    return '30+'` }),
      mcq('Which is the best place for the database password used by a pipeline?', ['Hard-coded in the script', 'In the Git repo in config.yaml', 'A secret manager / key vault, injected at runtime', 'In a comment for the next engineer'], 2, 'Secrets in code end up in Git history forever. Use AWS Secrets Manager, Azure Key Vault, Databricks secrets, etc.'),
      tf('A transformation function that reads «datetime.now()» internally is easy to unit-test and re-run for past dates.', false, 'Hidden time dependency breaks reproducibility and backfills. Pass the logical run date in as a parameter.'),
    ]),
    lesson('p7', 'pandas essentials', 15, [
      learn('pandas in one screen', `
        pandas is the single-machine DataFrame library. It's great up to a few GB; beyond that you move to Spark (or Polars/DuckDB).
        «««python
        import pandas as pd
        df = pd.read_csv('claims.csv', parse_dates=['submitted_at'])
        df.head(); df.info(); df.describe()
        df[df['status'] == 'Approved']                         # filter
        df[['claim_id', 'amount']]                             # select
        df['month'] = df['submitted_at'].dt.to_period('M')     # derive
        df.groupby('dealer_id')['amount'].agg(['count', 'sum'])  # group
        df.merge(dealers, on='dealer_id', how='left')          # join
        df.drop_duplicates(subset=['claim_id'], keep='last')   # dedup
        df['amount'].fillna(0)                                 # nulls
        df.pivot_table(index='dealer_id', columns='status', values='claim_id', aggfunc='count')
        df.to_parquet('claims.parquet', index=False)
        »»»
        | SQL | pandas | PySpark |
        |---|---|---|
        | WHERE | «df[cond]» | «df.filter(cond)» |
        | GROUP BY | «groupby().agg()» | «groupBy().agg()» |
        | JOIN | «merge(how=)» | «join(how=)» |
        | ROW_NUMBER | «groupby().cumcount()» / «rank()» | «row_number().over(w)» |
      `),
      mcq(`pandas «df.merge(d, on='dealer_id', how='left')» is equivalent to…`, ['INNER JOIN', 'LEFT JOIN', 'UNION', 'CROSS JOIN'], 1),
      mcq('Your laptop pandas job runs out of memory on a 40 GB CSV. Best next step?', ['Buy more RAM', 'Process in chunks or move to Spark / DuckDB, and convert the source to Parquet', 'Convert to JSON', 'Use more for loops'], 1, 'Chunking or a distributed / out-of-core engine. Columnar Parquet also shrinks the data 5-10×.'),
      tf('pandas operations are lazy, like Spark transformations.', false, 'pandas is eager: each line executes immediately. Spark (and Polars lazy mode) build a plan and execute on an action.'),
    ]),
  ]);
