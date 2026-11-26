// Hands-on practice: simulate the systems in code (Kafka, watermarks, Airflow, MapReduce, MERGE/SCD2, transfers, PII),
// plus interview-level SQL patterns and scenarios for SQL, scale, project and interview modules.
const { mcq, tf, multi, order, sql, py, spark, scenario, talk, bug } = require('../_h.cjs');

module.exports = {
  // ------------------------------------------------------------------ streaming: hands-on simulations
  streaming: [
    py({ q: '**Kafka partitioning, by hand.** Write «partition_for(key, n)» that returns «sum of the character codes of key» mod «n». Then write «assign(keys, n)» returning a dict «{partition: [keys…]}» (keys in input order). This is how one key always lands on one partition.', starter: 'def partition_for(key, n):\n    pass\n\ndef assign(keys, n):\n    pass\n', tests: `assert partition_for('engine-1', 3) == sum(map(ord, 'engine-1')) % 3
a = assign(['e1', 'e2', 'e1', 'e3'], 2)
assert all(k in a[partition_for(k, 2)] for k in ['e1', 'e2', 'e3'])
assert a[partition_for('e1', 2)].count('e1') == 2, 'same key -> same partition every time'`, solution: `def partition_for(key, n):
    return sum(ord(c) for c in key) % n

def assign(keys, n):
    out = {}
    for k in keys:
        out.setdefault(partition_for(k, n), []).append(k)
    return out` }),
    py({ q: '**A consumer with offsets.** «messages» is a list (index = offset). Write «consume(messages, committed, process, crash_at=None)»: start at offset «committed», call «process(msg)» for each message, and **commit after processing** (return the new committed offset). If «crash_at» equals the current offset, stop **before committing it** and return the committed offset so far. Return «committed».', starter: 'def consume(messages, committed, process, crash_at=None):\n    pass\n', tests: `seen = []
c = consume(['a', 'b', 'c', 'd'], 0, seen.append, crash_at=2)
assert c == 2 and seen == ['a', 'b', 'c'], (c, seen)   # 'c' processed, crash before commit
c = consume(['a', 'b', 'c', 'd'], c, seen.append)
assert c == 4 and seen == ['a', 'b', 'c', 'c', 'd'], seen  # 'c' processed again: at-least-once`, solution: `def consume(messages, committed, process, crash_at=None):
    for offset in range(committed, len(messages)):
        process(messages[offset])
        if crash_at == offset:
            return committed
        committed = offset + 1
    return committed` }),
    py({ q: '**Exactly-once on top of at-least-once.** Write «dedupe_stream(events)»: events are dicts with «event_id»; return the events in order, **skipping any event_id already seen**. (Run it on the duplicated output of the previous exercise in your head: this is the fix.)', starter: 'def dedupe_stream(events):\n    pass\n', tests: `ev = [{'event_id': 'a'}, {'event_id': 'b'}, {'event_id': 'a'}, {'event_id': 'c'}]
assert [e['event_id'] for e in dedupe_stream(ev)] == ['a', 'b', 'c']
assert dedupe_stream([]) == []`, solution: `def dedupe_stream(events):
    seen, out = set(), []
    for e in events:
        if e['event_id'] not in seen:
            seen.add(e['event_id'])
            out.append(e)
    return out` }),
    py({ q: '**Watermarks and late data.** Events arrive in order of arrival with an event time «t» (minutes). Write «windows(events, size, watermark)»: group into tumbling windows («t // size * size» = window start), keeping a running «max_t» of event times seen. An event is **late and dropped** if «t < max_t - watermark» at the time it arrives. Return «(counts, dropped)»: a dict «{window_start: count}» and a list of dropped «t» values.', starter: 'def windows(events, size, watermark):\n    pass\n', tests: `counts, dropped = windows([{'t': 1}, {'t': 4}, {'t': 12}, {'t': 2}, {'t': 9}, {'t': 13}], 5, 5)
assert counts == {0: 2, 10: 2, 5: 1}, counts
assert dropped == [2], dropped`, solution: `def windows(events, size, watermark):
    counts, dropped, max_t = {}, [], None
    for e in events:
        t = e['t']
        if max_t is not None and t < max_t - watermark:
            dropped.append(t)
            continue
        max_t = t if max_t is None else max(max_t, t)
        w = t // size * size
        counts[w] = counts.get(w, 0) + 1
    return counts, dropped` }),
    py({ q: '**Consumer lag.** Write «lag(end_offsets, committed)»: both are dicts «{partition: offset}». Return a dict of lag per partition (end − committed, a missing committed counts as 0) and the **total** as a tuple «(per_partition, total)».', starter: 'def lag(end_offsets, committed):\n    pass\n', tests: `per, total = lag({0: 100, 1: 250, 2: 80}, {0: 100, 1: 200})
assert per == {0: 0, 1: 50, 2: 80} and total == 130, (per, total)`, solution: `def lag(end_offsets, committed):
    per = {p: end - committed.get(p, 0) for p, end in end_offsets.items()}
    return per, sum(per.values())` }),
  ],

  // ------------------------------------------------------------------ orchestration: hands-on
  orchestration: [
    py({ q: '**How a scheduler orders tasks.** Write «run_order(deps)»: «deps» maps each task to the list of tasks it depends on. Return a list of tasks in an order where every task comes after its dependencies (ties broken alphabetically). Raise «ValueError» if there is a cycle.', starter: 'def run_order(deps):\n    pass\n', tests: `deps = {'extract': [], 'bronze': ['extract'], 'silver': ['bronze'], 'gold': ['silver'], 'quality': ['gold'], 'docs': ['gold']}
order_ = run_order(deps)
assert order_ == ['extract', 'bronze', 'silver', 'gold', 'docs', 'quality'], order_
try:
    run_order({'a': ['b'], 'b': ['a']}); assert False
except ValueError:
    pass`, solution: `def run_order(deps):
    remaining = {t: set(d) for t, d in deps.items()}
    out = []
    while remaining:
        ready = sorted(t for t, d in remaining.items() if not d)
        if not ready:
            raise ValueError('cycle')
        t = ready[0]
        out.append(t)
        del remaining[t]
        for d in remaining.values():
            d.discard(t)
    return out` }),
    py({ q: '**Backfill dates.** Write «backfill_dates(start, end, done)»: «start» and «end» are ISO dates (inclusive), «done» is a set of ISO dates already processed. Return the list of dates **still to run**, oldest first. Use «datetime.date».', starter: 'from datetime import date, timedelta\n\ndef backfill_dates(start, end, done):\n    pass\n', tests: `r = backfill_dates('2026-01-30', '2026-02-02', {'2026-01-31'})
assert r == ['2026-01-30', '2026-02-01', '2026-02-02'], r
assert backfill_dates('2026-01-01', '2026-01-01', set()) == ['2026-01-01']`, solution: `from datetime import date, timedelta

def backfill_dates(start, end, done):
    d, last, out = date.fromisoformat(start), date.fromisoformat(end), []
    while d <= last:
        if d.isoformat() not in done:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out` }),
    py({ q: '**Retries with exponential backoff.** Write «backoff_schedule(retries, base, cap)» returning the wait (seconds) before each retry: «base * 2**i», never more than «cap». «backoff_schedule(5, 10, 120)» → «[10, 20, 40, 80, 120]».', starter: 'def backoff_schedule(retries, base, cap):\n    pass\n', tests: `assert backoff_schedule(5, 10, 120) == [10, 20, 40, 80, 120]
assert backoff_schedule(0, 10, 120) == []`, solution: `def backoff_schedule(retries, base, cap):
    return [min(base * 2 ** i, cap) for i in range(retries)]` }),
  ],

  // ------------------------------------------------------------------ pipelines: hands-on SQL (MERGE / SCD2 / incremental)
  pipelines: [
    sql({ q: '**Upsert (MERGE) by hand.** «orders_current» is the target. Apply the latest event per order from «raw_orders_feed»: **insert** orders that don\'t exist and **update** status/amount/updated_at for ones that do. SQLite: use «INSERT … ON CONFLICT(order_id) DO UPDATE». Then return all rows of «orders_current» ordered by «order_id».', tables: ['orders_current', 'raw_orders_feed'], solution: `INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM (
  SELECT order_id, status, amount, updated_at, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM raw_orders_feed
) WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at;
SELECT * FROM orders_current ORDER BY order_id;`, ordered: true, hint: 'Pick the latest row per order with ROW_NUMBER, then INSERT … ON CONFLICT(order_id) DO UPDATE SET col = excluded.col.' }),
    sql({ q: '**Is the upsert idempotent?** Run the same upsert as the previous question **twice** in one go, then return «COUNT(*)» and «COUNT(DISTINCT order_id)» of «orders_current» as «rows_, distinct_orders». They must be equal.', tables: ['orders_current', 'raw_orders_feed'], solution: `INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM raw_orders_feed) WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at;
INSERT INTO orders_current (order_id, status, amount, updated_at)
SELECT order_id, status, amount, updated_at FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC) AS rn FROM raw_orders_feed) WHERE rn = 1
ON CONFLICT(order_id) DO UPDATE SET status = excluded.status, amount = excluded.amount, updated_at = excluded.updated_at;
SELECT COUNT(*) AS rows_, COUNT(DISTINCT order_id) AS distinct_orders FROM orders_current;` }),
    sql({ q: '**Watermark load.** «etl_watermarks» stores the last loaded timestamp per pipeline. Return the events from «raw_orders_feed» with «updated_at» **after** the watermark of pipeline «\'orders\'»: «event_id, order_id, updated_at», oldest first.', tables: ['raw_orders_feed', 'etl_watermarks'], solution: `SELECT event_id, order_id, updated_at FROM raw_orders_feed WHERE updated_at > (SELECT last_loaded_at FROM etl_watermarks WHERE pipeline = 'orders') ORDER BY updated_at;`, ordered: true, allowEmpty: true }),
    py({ q: '**Snapshot → change data capture.** Write «diff(old, new)»: both are dicts «{key: row_hash}». Return a dict with sorted lists «inserted», «updated», «deleted». This is how a daily full snapshot becomes a change set.', starter: 'def diff(old, new):\n    pass\n', tests: `r = diff({1: 'a', 2: 'b', 3: 'c'}, {1: 'a', 2: 'B', 4: 'd'})
assert r == {'inserted': [4], 'updated': [2], 'deleted': [3]}, r`, solution: `def diff(old, new):
    return {'inserted': sorted(k for k in new if k not in old),
            'updated': sorted(k for k in new if k in old and new[k] != old[k]),
            'deleted': sorted(k for k in old if k not in new)}` }),
  ],

  // ------------------------------------------------------------------ modelling: SCD2 hands-on
  modelling: [
    py({ q: '**Apply SCD type 2.** «dim» is a list of rows «{id, city, valid_from, valid_to, current}». «changes» is «{id: new_city}». For each change where the city differs from the current row: close the current row (set «valid_to» = «today», «current» = False) and append a new row (valid_from = today, valid_to = None, current = True). New ids get a new current row. Return the updated list.', starter: 'def scd2(dim, changes, today):\n    pass\n', tests: `dim = [{'id': 1, 'city': 'Pune', 'valid_from': '2020-01-01', 'valid_to': None, 'current': True}]
out = scd2(dim, {1: 'Mumbai', 2: 'Delhi'}, '2026-01-01')
cur = {r['id']: r['city'] for r in out if r['current']}
assert cur == {1: 'Mumbai', 2: 'Delhi'}, cur
old = [r for r in out if r['id'] == 1 and not r['current']][0]
assert old['city'] == 'Pune' and old['valid_to'] == '2026-01-01'
assert len(scd2(out, {1: 'Mumbai'}, '2026-02-01')) == len(out), 'no change -> no new row'`, solution: `def scd2(dim, changes, today):
    out = [dict(r) for r in dim]
    for id_, city in changes.items():
        cur = [r for r in out if r['id'] == id_ and r['current']]
        if cur and cur[0]['city'] == city:
            continue
        if cur:
            cur[0]['valid_to'] = today
            cur[0]['current'] = False
        out.append({'id': id_, 'city': city, 'valid_from': today, 'valid_to': None, 'current': True})
    return out` }),
    sql({ q: '**Point-in-time lookup on SCD2.** Using «dim_customer_scd2», return each customer\'s **segment as of 2025-06-30**: the row where «valid_from <= \'2025-06-30\'» and («valid_to» is NULL or «valid_to > \'2025-06-30\'»). Return «customer_id, segment».', tables: ['dim_customer_scd2'], solution: `SELECT customer_id, segment FROM dim_customer_scd2 WHERE valid_from <= '2025-06-30' AND (valid_to IS NULL OR valid_to > '2025-06-30');`, allowEmpty: true }),
  ],

  // ------------------------------------------------------------------ big data: MapReduce and key design, hands-on
  bigdata: [
    py({ q: '**Write MapReduce yourself.** Implement «mapper(line)» (yield «(word, 1)» for each lower-cased word), «shuffle(pairs)» (group into «{word: [1, 1, …]}»), and «reducer(word, counts)» (return «(word, total)»). Then «word_count(lines)» returns a dict «{word: total}» using all three.', starter: 'def mapper(line):\n    pass\n\ndef shuffle(pairs):\n    pass\n\ndef reducer(word, counts):\n    pass\n\ndef word_count(lines):\n    pass\n', tests: `r = word_count(['Fuel leak', 'fuel pump', 'LEAK'])
assert r == {'fuel': 2, 'leak': 2, 'pump': 1}, r`, solution: `def mapper(line):
    for w in line.lower().split():
        yield (w, 1)

def shuffle(pairs):
    groups = {}
    for k, v in pairs:
        groups.setdefault(k, []).append(v)
    return groups

def reducer(word, counts):
    return (word, sum(counts))

def word_count(lines):
    pairs = [p for line in lines for p in mapper(line)]
    return dict(reducer(k, v) for k, v in shuffle(pairs).items())` }),
    py({ q: '**Salted row keys.** Write «row_key(device_id, ts, buckets)» returning «"{bucket:02d}|{device_id}|{ts}"» where «bucket = sum of char codes of device_id % buckets». This spreads writes across servers while keeping one device\'s rows together.', starter: 'def row_key(device_id, ts, buckets):\n    pass\n', tests: `k = row_key('dev-7', '2026-01-01T10:00', 16)
b = sum(map(ord, 'dev-7')) % 16
assert k == f'{b:02d}|dev-7|2026-01-01T10:00', k`, solution: `def row_key(device_id, ts, buckets):
    bucket = sum(ord(c) for c in device_id) % buckets
    return f"{bucket:02d}|{device_id}|{ts}"` }),
  ],

  // ------------------------------------------------------------------ cloud: transfers, hands-on
  cloud: [
    py({ q: '**Resumable chunked upload.** Write «chunks_to_upload(size, chunk, done)»: a file of «size» bytes is split into chunks of «chunk» bytes (the last may be smaller). «done» is a set of chunk indexes already uploaded. Return the list of «(index, start, end)» still to upload («end» exclusive).', starter: 'def chunks_to_upload(size, chunk, done):\n    pass\n', tests: `assert chunks_to_upload(10, 4, {0}) == [(1, 4, 8), (2, 8, 10)]
assert chunks_to_upload(8, 4, {0, 1}) == []
assert chunks_to_upload(0, 4, set()) == []`, solution: `def chunks_to_upload(size, chunk, done):
    out = []
    for i, start in enumerate(range(0, size, chunk)):
        if i not in done:
            out.append((i, start, min(start + chunk, size)))
    return out` }),
    py({ q: '**Verify a transfer.** Write «verify(local_bytes, remote_bytes)» that returns «True» only if the SHA-256 hashes match (use «hashlib»).', starter: 'import hashlib\n\ndef verify(local_bytes, remote_bytes):\n    pass\n', tests: `assert verify(b'abc', b'abc') is True
assert verify(b'abc', b'abd') is False`, solution: `import hashlib

def verify(local_bytes, remote_bytes):
    return hashlib.sha256(local_bytes).hexdigest() == hashlib.sha256(remote_bytes).hexdigest()` }),
  ],

  // ------------------------------------------------------------------ governance: PII, hands-on
  governance: [
    py({ q: '**Mask PII before sharing.** Write «mask(text)» that replaces every email with «[EMAIL]» and every 10-digit phone number (optionally written with spaces or dashes in the 3-3-4 pattern) with «[PHONE]». Use «re».', starter: 'import re\n\ndef mask(text):\n    pass\n', tests: `t = mask('Call 98765 43210? no: 987-654-3210 or 9876543210, mail a.b@x.com')
assert 'a.b@x.com' not in t and '[EMAIL]' in t, t
assert t.count('[PHONE]') == 2, t
assert mask('engine 4521 ok') == 'engine 4521 ok'`, solution: `import re

def mask(text):
    text = re.sub(r'[\\w.+-]+@[\\w-]+\\.[\\w.]+', '[EMAIL]', text)
    return re.sub(r'\\b\\d{3}[ -]?\\d{3}[ -]?\\d{4}\\b', '[PHONE]', text)` }),
    py({ q: '**Pseudonymise a key.** Write «pseudonym(customer_id, salt)» returning the first 12 hex characters of SHA-256 of «f"{salt}:{customer_id}"». Same input → same pseudonym (joins still work), but the real id isn\'t exposed.', starter: 'import hashlib\n\ndef pseudonym(customer_id, salt):\n    pass\n', tests: `a = pseudonym(42, 's1')
assert a == pseudonym(42, 's1') and len(a) == 12
assert a != pseudonym(43, 's1') and a != pseudonym(42, 's2')`, solution: `import hashlib

def pseudonym(customer_id, salt):
    return hashlib.sha256(f"{salt}:{customer_id}".encode()).hexdigest()[:12]` }),
  ],

  // ------------------------------------------------------------------ quality: hands-on SQL checks
  quality: [
    sql({ q: '**Freshness check.** For each source table, how old is its newest record? Return one row per table with «tbl, newest»: claims (submitted_at), crf (created_at), service_requests (opened_at). Use «UNION ALL».', tables: ['claims', 'crf', 'service_requests'], solution: `SELECT 'claims' AS tbl, MAX(submitted_at) AS newest FROM claims UNION ALL SELECT 'crf', MAX(created_at) FROM crf UNION ALL SELECT 'service_requests', MAX(opened_at) FROM service_requests;` }),
    sql({ q: '**Volume anomaly check.** Count claims per month and flag months whose count is **below half the average monthly count**. Return «month, n, flagged» (flagged = 1 or 0), oldest first.', tables: ['claims'], solution: `WITH m AS (SELECT strftime('%Y-%m', submitted_at) AS month, COUNT(*) AS n FROM claims GROUP BY month) SELECT month, n, CASE WHEN n < 0.5 * (SELECT AVG(n) FROM m) THEN 1 ELSE 0 END AS flagged FROM m ORDER BY month;`, ordered: true }),
  ],

  // ------------------------------------------------------------------ SQL: interview patterns and scenarios
  sql: [
    sql({ q: '**Gaps and islands.** For «engine_daily_status», find each engine\'s streaks of consecutive days when it was **not running** («is_running = 0»). Return «engine_id, streak_start, streak_end, days» for streaks of **2 or more days**.', tables: ['engine_daily_status'], solution: `WITH d AS (SELECT engine_id, day, julianday(day) - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY day) AS grp FROM engine_daily_status WHERE is_running = 0) SELECT engine_id, MIN(day) AS streak_start, MAX(day) AS streak_end, COUNT(*) AS days FROM d GROUP BY engine_id, grp HAVING COUNT(*) >= 2;`, hint: 'date minus ROW_NUMBER is constant within a run of consecutive days: group by it.', allowEmpty: true }),
    sql({ q: '**Funnel.** How many CRFs became service requests, and how many of those reached a claim? Return «crfs, with_sr, with_claim». (CRF → service_requests.crf_id; claims link via pir; count a CRF as "with claim" if any SR of it exists and the CRF status is «Converted».)', tables: ['crf', 'service_requests'], solution: `SELECT COUNT(*) AS crfs, SUM(CASE WHEN EXISTS (SELECT 1 FROM service_requests s WHERE s.crf_id = c.crf_id) THEN 1 ELSE 0 END) AS with_sr, SUM(CASE WHEN EXISTS (SELECT 1 FROM service_requests s WHERE s.crf_id = c.crf_id) AND c.status = 'Converted' THEN 1 ELSE 0 END) AS with_claim FROM crf c;` }),
    sql({ q: '**Second highest per group.** For each plant, the employee with the **second highest** salary. Return «plant_id, name, salary». (Plants with one employee return nothing.)', tables: ['employees'], solution: 'WITH r AS (SELECT plant_id, name, salary, DENSE_RANK() OVER (PARTITION BY plant_id ORDER BY salary DESC) AS rk FROM employees) SELECT plant_id, name, salary FROM r WHERE rk = 2;' }),
    sql({ q: '**Month-over-month growth %.** Monthly claim counts with growth vs the previous month as a percentage rounded to 1 decimal. Return «month, n, growth_pct», oldest first (first month has NULL growth).', tables: ['claims'], solution: `WITH m AS (SELECT strftime('%Y-%m', submitted_at) AS month, COUNT(*) AS n FROM claims GROUP BY month) SELECT month, n, ROUND(100.0 * (n - LAG(n) OVER (ORDER BY month)) / LAG(n) OVER (ORDER BY month), 1) AS growth_pct FROM m ORDER BY month;`, ordered: true }),
    sql({ q: '**Pivot.** One row per dealer with claim counts per status as columns: «dealer_id, approved, rejected, submitted, partially_approved».', tables: ['claims'], solution: `SELECT dealer_id, SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) AS submitted, SUM(CASE WHEN status = 'Partially Approved' THEN 1 ELSE 0 END) AS partially_approved FROM claims GROUP BY dealer_id;` }),
    sql({ q: '**Time between events.** For each CRF that has service requests, the hours from CRF creation to its **first** service request, rounded to 1 decimal. Return «crf_id, hours_to_first_sr».', tables: ['crf', 'service_requests'], solution: 'SELECT c.crf_id, ROUND((julianday(MIN(s.opened_at)) - julianday(c.created_at)) * 24, 1) AS hours_to_first_sr FROM crf c JOIN service_requests s ON s.crf_id = c.crf_id GROUP BY c.crf_id, c.created_at;' }),
    mcq('«SELECT COUNT(*) FROM a LEFT JOIN b ON a.id = b.a_id» returns more rows than «a» has. Why?', ['LEFT JOIN is broken', 'Some a rows match several b rows, so they are repeated', 'NULLs are counted twice', 'It never can'], 1),
    mcq('«WHERE x NOT IN (SELECT y FROM t)» returns no rows even though some x are clearly missing from t. Why?', ['A bug in SQL', 't.y contains a NULL, so NOT IN evaluates to unknown for every row; use NOT EXISTS', 'Wrong join', 'Case sensitivity'], 1),
    mcq('A LEFT JOIN with a filter on the right table in WHERE («WHERE b.status = \'A\'») behaves like:', ['A LEFT JOIN', 'An INNER JOIN: rows with no match have NULL status and are filtered out; move the condition into ON', 'A CROSS JOIN', 'A FULL JOIN'], 1),
    tf('COUNT(col) and COUNT(*) always return the same number.', false, 'COUNT(col) skips NULLs.'),
    scenario('A query got slow after the table grew', 'A dashboard query on claims took 1 s at 10k rows and 90 s at 50M rows.', [
      ['First step?', [
        ['Look at the plan: full scans, missing filters on indexed/partitioned columns, exploding joins', true, 'Measure before changing.'],
        ['Add DISTINCT', false, 'Adds work.'],
      ]],
      ['The query wraps the date column in a function in WHERE. Fix?', [
        ['Rewrite to compare the raw column with a range (submitted_at >= x AND < y) so indexes/partitions can be used', true, 'Functions on the column block pruning.'],
        ['Cache the result forever', false, 'Stale data.'],
      ]],
    ]),
    talk('*"Explain the difference between RANK, DENSE_RANK and ROW_NUMBER, with an example."*', `
      - Salaries 100, 90, 90, 80:
      - ROW_NUMBER → 1, 2, 3, 4 (always unique; pick one row per group, dedupe).
      - RANK → 1, 2, 2, 4 (ties share, gaps after).
      - DENSE_RANK → 1, 2, 2, 3 (ties share, no gaps; "second highest salary").
    `),
    talk('*"How do you find and remove duplicates in a table?"*', `
      - Find: GROUP BY the business key HAVING COUNT(*) > 1.
      - Keep one: ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC) and keep rn = 1.
      - Fix the cause: dedupe/MERGE in the pipeline and add a uniqueness check.
    `),
  ],

  // ------------------------------------------------------------------ Spark: more hands-on
  spark: [
    spark({ q: '**Running total in PySpark.** Monthly claim totals with a running total. Assign to «result» with columns «month, total, running_total», ordered by month. Use «F.date_format» for the month.', tables: ['claims'], solution: 'm = (spark.table("claims").withColumn("month", F.date_format("submitted_at", "yyyy-MM"))\n     .groupBy("month").agg(F.round(F.sum("claim_amount"), 2).alias("total")))\nw = Window.orderBy("month").rowsBetween(Window.unboundedPreceding, Window.currentRow)\nresult = m.withColumn("running_total", F.round(F.sum("total").over(w), 2)).orderBy("month")', ordered: true }),
    spark({ q: '**Anti-join in PySpark.** Dealers with **no claims**. Assign to «result» with columns «dealer_id, dealer_name». Use a «left_anti» join.', tables: ['dealers', 'claims'], solution: 'result = spark.table("dealers").join(spark.table("claims"), "dealer_id", "left_anti").select("dealer_id", "dealer_name")' }),
    spark({ q: '**Data-quality split.** From «claims», split into valid rows (claim_amount > 0 and status not null) and invalid ones. Assign to «result» a summary with columns «is_valid, n».', tables: ['claims'], solution: 'c = spark.table("claims")\nresult = (c.withColumn("is_valid", (F.col("claim_amount") > 0) & F.col("status").isNotNull())\n          .groupBy("is_valid").agg(F.count("*").alias("n")))' }),
  ],

  // ------------------------------------------------------------------ scale
  scale: [
    mcq('10 million events/day of 1 KB each. Roughly how much raw data per day?', ['10 MB', '10 GB', '10 TB', '1 PB'], 1, '10M × 1 KB = 10 GB.'),
    mcq('100 million requests/day is about how many per second on average?', ['~120', '~1,200', '~12,000', '~120,000'], 1, '100M / 86,400 ≈ 1,157/s average; plan for peaks of 3-5×.'),
    py({ q: '**Back-of-envelope sizing.** Write «sizing(events_per_day, bytes_per_event, peak_factor, mb_per_partition_per_s)» returning a dict with «avg_eps» (rounded int), «peak_eps» (int), «gb_per_day» (rounded to 1 decimal, using 1 GB = 1e9 bytes) and «partitions» (peak MB/s ÷ MB per partition per second, rounded **up**, at least 1).', starter: 'import math\n\ndef sizing(events_per_day, bytes_per_event, peak_factor, mb_per_partition_per_s):\n    pass\n', tests: `r = sizing(864_000_000, 1000, 3, 5)
assert r == {'avg_eps': 10000, 'peak_eps': 30000, 'gb_per_day': 864.0, 'partitions': 6}, r`, solution: `import math

def sizing(events_per_day, bytes_per_event, peak_factor, mb_per_partition_per_s):
    avg = events_per_day / 86400
    peak = avg * peak_factor
    peak_mb_s = peak * bytes_per_event / 1e6
    return {'avg_eps': round(avg), 'peak_eps': int(peak), 'gb_per_day': round(events_per_day * bytes_per_event / 1e9, 1),
            'partitions': max(1, math.ceil(peak_mb_s / mb_per_partition_per_s))}` }),
  ],

  // ------------------------------------------------------------------ project: drill questions
  project: [
    mcq('In Turbofan, why is the Kafka message key the engine id?', ['Faster compression', 'So all readings of one engine land on one partition and stay in order', 'Security', 'Kafka requires it'], 1),
    mcq('In Turbofan, why is the event id built with uuid5(engine + cycle) instead of a random UUID?', ['Shorter ids', 'The same reading always gets the same id, so duplicates can be detected anywhere', 'Random UUIDs are slow', 'Kafka needs it'], 1),
    mcq('Alerts silently disappeared in an early version. What was the cause?', ['Kafka lost messages', 'Spark lazily recomputed the batch after the state table was updated, so events looked already applied', 'A wrong threshold', 'The dashboard cache'], 1),
    mcq('How was exactly-once proven?', ['By reading the docs', 'kill -9 the Spark job mid-stream with chaos data, restart, and compare every id in silver with the producer manifest', 'By counting rows once', 'By unit tests only'], 1),
    mcq('Why did the first health index miss 44% of FD003 engines?', ['Too little data', 'A second fault type moves some sensors the opposite way, cancelling the score', 'A Spark bug', 'Kafka lag'], 1),
    tf('The load test found the stateful gold step was the bottleneck.', true),
    talk('*"What would you change to run Turbofan in production?"*', `
      - Separate jobs per layer; gold on its own compute with a longer trigger.
      - Multi-broker Kafka with replication 3; schema registry; alerting on lag and freshness.
      - Cloud storage + Databricks/managed Spark; CI/CD; secrets management.
      - Maintenance events that reset engine state; per-segment monitoring of alert quality.
    `),
    talk('*"What was the hardest bug and how did you find it?"*', `
      - Symptom: engines reached CRITICAL but the alerts table stayed empty, with no error.
      - Checked Delta history (no MERGE committed on alerts), ran the logic in batch (worked), so the problem was how the streaming batch executed.
      - Cause: the result was lazily recomputed after the state table changed.
      - Fix: materialise once (localCheckpoint(eager=True)), write alerts before state.
      - Lesson: silent bugs need reconciliation and tests, not just "no errors".
    `),
  ],

  // ------------------------------------------------------------------ interview: competencies from the posting
  interview: [
    talk('*Competency: System requirements.* "A stakeholder says: I need a dashboard of supplier delays. What do you do first?"', `
      - Ask what decision it drives, who uses it, how fresh it must be, and how "delay" is defined (expected vs received date? business days?).
      - Turn that into testable requirements and acceptance criteria (e.g. "matches ERP within 0.5%, refreshed by 8 am").
      - Confirm scope, track changes to requirements and their impact on the timeline.
    `),
    talk('*Competency: Problem solving.* "Tell me about a time you found the root cause of a data problem."', `
      - Situation → Task → Action → Result (STAR).
      - Show the systematic steps: reproduce, narrow down the layer, find the assignable cause, fix, prevent recurrence (test/alert).
      - Use a real example: a reconciliation at work, or a Turbofan bug.
    `),
    talk('*Competency: Customer focus.* "A business user says your numbers are wrong. How do you respond?"', `
      - Take it seriously, get a concrete example, reproduce it.
      - Reconcile against the source; explain the definition being used.
      - If it\'s a bug: fix, backfill, tell users what changed. If it\'s a definition gap: agree the definition and document it.
    `),
    talk('*Competency: Decision quality.* "Tell me about a technical decision you made and its trade-offs."', `
      - The options, the criteria (cost, simplicity, freshness, risk), what you chose and why, and what you\'d do differently.
      - Example: idempotent MERGE vs Spark state store in Turbofan, or batch vs streaming for a report.
    `),
    talk('*Competency: Collaborates / communicates.* "How do you explain a technical issue to non-technical stakeholders?"', `
      - Start with impact (which numbers, since when, decisions affected), then the fix and the timeline.
      - Avoid jargon; give a clear status and next update time.
    `),
    talk('*Competency: Values differences.* "Tell me about working with someone who approached a problem differently."', `
      - Describe the different view, what you learned from it, and how the combined approach was better.
      - Show respect and openness, not who "won".
    `),
    talk('*Competency: Solution documentation.* "How do you document a pipeline so someone else can run it?"', `
      - README: purpose, how to run, config, owners.
      - Architecture diagram, data model and grain, data contract, runbook for common failures, decision log.
      - Keep docs next to the code and update them in the same pull request.
    `),
  ],
};
