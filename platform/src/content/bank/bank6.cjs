// Hands-on labs: multi-step problems of the kind a DE with 1-2 years of experience solves.
// Each lab combines several concepts (idempotency, late data, dedupe, quarantine, reconciliation…).
const { sql, py, spark } = require('../_h.cjs');

module.exports = {
  pipelines: [
    py({ level: 3, q: `**Lab: an incremental, idempotent load in one function.** Write «run_batch(target, batch, watermark)» where:
- «target» is a dict «{order_id: row}» (current silver state), «batch» a list of raw rows «{"event_id", "order_id", "status", "amount", "updated_at"}» (ISO strings), «watermark» the last «updated_at» already loaded (or «None»).
- Steps: (1) **validate**: rows with a missing «order_id» or a non-numeric/negative «amount» go to «quarantine» as «(event_id, reason)» with reasons «"missing order_id"» / «"bad amount"»; (2) **dedupe**: keep the row with the largest «(updated_at, event_id)» per order_id; (3) **merge**: only apply a row if it is **newer** than what the target holds for that order (compare updated_at); (4) the new watermark is the max «updated_at» among **valid** rows, but never moves backwards.
- Return «(new_target, new_watermark, report)» where report is «{"read", "quarantined", "applied", "skipped_older"}». Do not mutate inputs. Running the same batch twice must not change the result (idempotent).`,
      starter: 'def run_batch(target, batch, watermark):\n    pass\n',
      tests: `t = {1: {'order_id': 1, 'status': 'CREATED', 'amount': 10.0, 'updated_at': '2026-11-01 10:00:00', 'event_id': 1}}
b = [
  {'event_id': 2, 'order_id': 1, 'status': 'SHIPPED', 'amount': 10.0, 'updated_at': '2026-11-02 09:00:00'},
  {'event_id': 3, 'order_id': 1, 'status': 'CONFIRMED', 'amount': 10.0, 'updated_at': '2026-11-01 12:00:00'},
  {'event_id': 4, 'order_id': 2, 'status': 'CREATED', 'amount': 5.0, 'updated_at': '2026-11-02 08:00:00'},
  {'event_id': 5, 'order_id': None, 'status': 'CREATED', 'amount': 5.0, 'updated_at': '2026-11-02 08:00:00'},
  {'event_id': 6, 'order_id': 3, 'status': 'CREATED', 'amount': -1, 'updated_at': '2026-11-02 08:00:00'},
  {'event_id': 7, 'order_id': 2, 'status': 'CREATED', 'amount': 5.0, 'updated_at': '2026-11-02 08:00:00'},
]
nt, wm, rep = run_batch(t, b, '2026-11-01 10:00:00')
assert nt[1]['status'] == 'SHIPPED' and nt[2]['event_id'] == 7, nt
assert wm == '2026-11-02 09:00:00', wm
assert rep == {'read': 6, 'quarantined': [(5, 'missing order_id'), (6, 'bad amount')], 'applied': 2, 'skipped_older': 0}, rep
nt2, wm2, rep2 = run_batch(nt, b, wm)
assert nt2 == nt and wm2 == wm, 'idempotent'
assert rep2['applied'] == 0 and rep2['skipped_older'] == 2, rep2
assert t[1]['status'] == 'CREATED', 'input must not change'
old = [{'event_id': 9, 'order_id': 1, 'status': 'CREATED', 'amount': 10.0, 'updated_at': '2026-10-01 00:00:00'}]
_, wm3, rep3 = run_batch(nt, old, wm)
assert wm3 == wm and rep3['skipped_older'] == 1, 'watermark never moves backwards; older rows are not applied'`,
      solution: `def run_batch(target, batch, watermark):
    quarantine, valid = [], []
    for r in batch:
        amt = r.get('amount')
        if r.get('order_id') is None:
            quarantine.append((r['event_id'], 'missing order_id'))
        elif isinstance(amt, bool) or not isinstance(amt, (int, float)) or amt < 0:
            quarantine.append((r['event_id'], 'bad amount'))
        else:
            valid.append(r)
    latest = {}
    for r in valid:
        k = r['order_id']
        if k not in latest or (r['updated_at'], r['event_id']) > (latest[k]['updated_at'], latest[k]['event_id']):
            latest[k] = r
    new = {k: dict(v) for k, v in target.items()}
    applied = skipped = 0
    for k, r in latest.items():
        cur = new.get(k)
        if cur is None or (r['updated_at'], r['event_id']) > (cur['updated_at'], cur.get('event_id', -1)):
            new[k] = dict(r)
            applied += 1
        else:
            skipped += 1
    wm = watermark
    if valid:
        m = max(r['updated_at'] for r in valid)
        if wm is None or m > wm:
            wm = m
    return new, wm, {'read': len(batch), 'quarantined': quarantine, 'applied': applied, 'skipped_older': skipped}` }),
    py({ level: 3, q: `**Lab: a polite API extractor.** A fake API is given as «fetch(cursor)» which returns «(status, payload)»: status 200 → payload is «{"items": [...], "next": cursor_or_None}»; status 429 → payload is «{"retry_after": seconds}»; status 500 → transient error. Write «extract_all(fetch, sleep, max_retries=3)» that follows cursors from «None» until «next» is «None», **retries** 429/500 up to «max_retries» times per page (calling «sleep(retry_after)» for 429, «sleep(2 ** attempt)» for 500 with attempt starting at 0), raises «RuntimeError» when retries are exhausted, and returns the items **deduplicated by «id»** (pages can overlap), keeping the **last** seen version, in first-seen order of ids.`,
      starter: 'def extract_all(fetch, sleep, max_retries=3):\n    pass\n',
      tests: `pages = {None: [(429, {'retry_after': 5}), (200, {'items': [{'id': 1, 'v': 'a'}, {'id': 2, 'v': 'b'}], 'next': 'p2'})],
         'p2': [(500, {}), (500, {}), (200, {'items': [{'id': 2, 'v': 'b2'}, {'id': 3, 'v': 'c'}], 'next': None})]}
calls, slept = {}, []
def fetch(cur):
    i = calls.get(cur, 0); calls[cur] = i + 1
    return pages[cur][i]
out = extract_all(fetch, slept.append)
assert out == [{'id': 1, 'v': 'a'}, {'id': 2, 'v': 'b2'}, {'id': 3, 'v': 'c'}], out
assert slept == [5, 1, 2], slept
bad = {None: [(500, {})] * 10}
c2 = {}
def fetch2(cur):
    i = c2.get(cur, 0); c2[cur] = i + 1
    return bad[cur][i]
try:
    extract_all(fetch2, lambda s: None, max_retries=2); raise AssertionError('should raise')
except RuntimeError:
    pass
assert c2[None] == 3, 'one call plus 2 retries'`,
      solution: `def extract_all(fetch, sleep, max_retries=3):
    order, latest = [], {}
    cursor = None
    while True:
        attempt = 0
        while True:
            status, payload = fetch(cursor)
            if status == 200:
                break
            if attempt >= max_retries:
                raise RuntimeError(f'page {cursor!r} failed after {attempt} retries')
            if status == 429:
                sleep(payload.get('retry_after', 1))
            else:
                sleep(2 ** attempt)
            attempt += 1
        for it in payload['items']:
            if it['id'] not in latest:
                order.append(it['id'])
            latest[it['id']] = it
        cursor = payload.get('next')
        if cursor is None:
            return [latest[i] for i in order]` }),
  ],
  streaming: [
    py({ level: 3, q: `**Lab: event-time windows with a watermark.** Events arrive in **arrival order** as dicts «{"key", "ts"}» (ts in seconds). Write «process(events, size, delay)» that keeps counts per «(key, window_start)» for tumbling windows of «size» seconds. The **watermark** is «max ts seen so far − delay». After each event, any window whose end («window_start + size») is **≤ watermark** is **finalised**: emit «(key, window_start, count)» (emit in order of window_start then key) and drop its state. An event whose window is already finalised (or whose window end ≤ current watermark) is **late**: count it in «dropped» and ignore it. At the end, do **not** emit open windows. Return «(emitted, dropped)».`,
      starter: 'def process(events, size, delay):\n    pass\n',
      tests: `ev = [{'key': 'e1', 'ts': 1}, {'key': 'e1', 'ts': 4}, {'key': 'e2', 'ts': 3}, {'key': 'e1', 'ts': 12},
      {'key': 'e1', 'ts': 2}, {'key': 'e2', 'ts': 9}, {'key': 'e1', 'ts': 16}, {'key': 'e1', 'ts': 30}]
emitted, dropped = process(ev, 10, 5)
assert emitted == [('e1', 0, 3), ('e2', 0, 2), ('e1', 10, 2)], emitted
assert dropped == 0
emitted2, dropped2 = process(ev + [{'key': 'e1', 'ts': 5}], 10, 5)
assert dropped2 == 1, 'window 0-10 already finalised: late'
assert process([], 10, 5) == ([], 0)`,
      solution: `def process(events, size, delay):
    state, emitted, dropped = {}, [], 0
    max_ts = None
    finalised = set()
    for e in events:
        ws = e['ts'] - e['ts'] % size
        wm = None if max_ts is None else max_ts - delay
        if (e['key'], ws) in finalised or (wm is not None and ws + size <= wm):
            dropped += 1
            continue
        state[(e['key'], ws)] = state.get((e['key'], ws), 0) + 1
        max_ts = e['ts'] if max_ts is None else max(max_ts, e['ts'])
        wm = max_ts - delay
        done = sorted([k for k in state if k[1] + size <= wm], key=lambda k: (k[1], k[0]))
        for k in done:
            emitted.append((k[0], k[1], state.pop(k)))
            finalised.add(k)
    return emitted, dropped` }),
    py({ level: 2, q: `**Lab: consumer lag report.** Given «end_offsets» «{partition: latest_offset}» and «committed» «{partition: committed_offset}» (missing partitions mean nothing committed: treat as 0), write «lag_report(end_offsets, committed, retention_start)» returning a dict with «total_lag», «max_partition» (partition with the largest lag; smallest number on ties), and «at_risk»: sorted partitions whose committed offset is **below** «retention_start[p]» (data already deleted by retention: those records are lost).`,
      starter: 'def lag_report(end_offsets, committed, retention_start):\n    pass\n',
      tests: `end = {0: 1000, 1: 1500, 2: 800}
com = {0: 990, 1: 900}
ret = {0: 100, 1: 1000, 2: 0}
assert lag_report(end, com, ret) == {'total_lag': 10 + 600 + 800, 'max_partition': 2, 'at_risk': [1]}, lag_report(end, com, ret)
assert lag_report({0: 5}, {0: 5}, {0: 0}) == {'total_lag': 0, 'max_partition': 0, 'at_risk': []}`,
      solution: `def lag_report(end_offsets, committed, retention_start):
    lags = {p: end_offsets[p] - committed.get(p, 0) for p in end_offsets}
    maxp = min(p for p in lags if lags[p] == max(lags.values()))
    risk = sorted(p for p in end_offsets if committed.get(p, 0) < retention_start.get(p, 0))
    return {'total_lag': sum(lags.values()), 'max_partition': maxp, 'at_risk': risk}` }),
  ],
  sql: [
    sql({ level: 3, q: `**Lab: connectivity monitor with LAG.** Readings in «sensor_readings» should arrive every 5 minutes per engine. Using «LAG(ts)» per engine, return for **every** engine: «readings», «max_gap_min» (largest minutes between consecutive readings, rounded to 0 dp) and «gaps_over_5» (how many consecutive pairs are more than 5 minutes apart). Sort by «max_gap_min» descending, then «engine_id».`, tables: ['sensor_readings'],
      solution: `WITH g AS (
  SELECT engine_id, ts, (julianday(ts) - julianday(LAG(ts) OVER (PARTITION BY engine_id ORDER BY ts))) * 1440 AS gap
  FROM sensor_readings
)
SELECT engine_id,
       COUNT(*) AS readings,
       ROUND(MAX(gap), 0) AS max_gap_min,
       SUM(CASE WHEN gap > 5.01 THEN 1 ELSE 0 END) AS gaps_over_5
FROM g
GROUP BY engine_id
ORDER BY max_gap_min DESC, engine_id;`,
      hint: 'Compute the gap with LAG in a CTE (NULL for the first reading), then aggregate per engine.' }),
    sql({ level: 3, q: `**Lab: top dealers per region with ties.** Rank dealers within each region by total «claim_amount» (sum over all their claims). Return the **top 2 per region**, including ties (use «DENSE_RANK»): «region, dealer_name, total_claimed» (2 dp), «rnk». Sort by «region», «rnk», «dealer_name».`, tables: ['claims', 'dealers'],
      solution: `WITH t AS (
  SELECT d.region, d.dealer_name, ROUND(SUM(c.claim_amount), 2) AS total_claimed
  FROM claims c JOIN dealers d ON d.dealer_id = c.dealer_id
  GROUP BY d.region, d.dealer_name
), r AS (
  SELECT *, DENSE_RANK() OVER (PARTITION BY region ORDER BY total_claimed DESC) AS rnk FROM t
)
SELECT region, dealer_name, total_claimed, rnk FROM r WHERE rnk <= 2 ORDER BY region, rnk, dealer_name;`,
      hint: 'Aggregate per dealer first, then DENSE_RANK() OVER (PARTITION BY region ORDER BY total DESC), keep rnk <= 2.' }),
    sql({ level: 3, q: `**Lab: claim cycle time across systems.** A claim's cycle time is the days from «claims.submitted_at» to the **first** credit note «issued_at» for that claim. Per dealer **region**, return «claims_paid» (claims with a credit note), «avg_days» (1 dp) and «max_days» (1 dp), for claims that have a credit note. Sort by «avg_days» descending.`, tables: ['claims', 'credit_notes', 'dealers'],
      solution: `WITH first_cn AS (
  SELECT claim_id, MIN(issued_at) AS first_issued FROM credit_notes GROUP BY claim_id
)
SELECT d.region,
       COUNT(*) AS claims_paid,
       ROUND(AVG(julianday(f.first_issued) - julianday(c.submitted_at)), 1) AS avg_days,
       ROUND(MAX(julianday(f.first_issued) - julianday(c.submitted_at)), 1) AS max_days
FROM claims c
JOIN first_cn f ON f.claim_id = c.claim_id
JOIN dealers d ON d.dealer_id = c.dealer_id
GROUP BY d.region
ORDER BY avg_days DESC;`,
      hint: 'Take MIN(issued_at) per claim first (avoids fan-out from multiple notes), then join and aggregate by region.' }),
    sql({ level: 3, q: `**Lab: supplier on-time delivery (a data product metric).** From «purchase_orders» (received orders only: «received_date» not NULL) join «suppliers». Per supplier return «supplier_name», «orders», «on_time_pct» (received_date ≤ expected_date, % rounded to 1 dp) and «avg_lead_days» (received − order date, 1 dp). Only suppliers with **at least 3** received orders. Sort by «on_time_pct» ascending, then «supplier_name».`, tables: ['purchase_orders', 'suppliers'],
      solution: `SELECT s.supplier_name,
       COUNT(*) AS orders,
       ROUND(100.0 * SUM(CASE WHEN p.received_date <= p.expected_date THEN 1 ELSE 0 END) / COUNT(*), 1) AS on_time_pct,
       ROUND(AVG(julianday(p.received_date) - julianday(p.order_date)), 1) AS avg_lead_days
FROM purchase_orders p
JOIN suppliers s ON s.supplier_id = p.supplier_id
WHERE p.received_date IS NOT NULL
GROUP BY s.supplier_name
HAVING COUNT(*) >= 3
ORDER BY on_time_pct, s.supplier_name;`,
      hint: 'Filter received orders, group by supplier, SUM(CASE …) for on-time, AVG of julianday differences, HAVING COUNT(*) >= 3.' }),
  ],
  spark: [
    spark({ level: 3, q: `**Lab: silver build in PySpark.** From «raw_orders_feed»: keep the **latest** event per «order_id» (by «updated_at» desc, then «ingested_at» desc) using a «Window» and «F.row_number()», then return «order_id, status, amount, updated_at» for orders whose latest status is **not** «DELIVERED», sorted by «order_id».`, starter: `raw = spark.table("raw_orders_feed")\n\nresult = None\n`,
      solution: `from pyspark.sql import Window
raw = spark.table("raw_orders_feed")
w = Window.partitionBy("order_id").orderBy(F.col("updated_at").desc(), F.col("ingested_at").desc())
result = (raw.withColumn("rn", F.row_number().over(w))
  .filter(F.col("rn") == 1)
  .filter(F.col("status") != "DELIVERED")
  .select("order_id", "status", "amount", "updated_at")
  .orderBy("order_id"))`, hint: 'Window.partitionBy("order_id").orderBy(desc cols); row_number() == 1; then filter status.' }),
    spark({ level: 3, q: `**Lab: quarantine and reconcile in PySpark.** Claims must reference an existing dealer. Split «claims» into **good** (dealer exists) and **quarantine** (dealer missing) with joins («left_semi» / «left_anti»), then build «result» as a one-row DataFrame with «source_rows», «good_rows», «quarantined_rows» and «reconciled» (1 if source = good + quarantined else 0). Use «spark.createDataFrame([(…)], [...])» for the summary.`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`,
      solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
good = claims.join(dealers.select("dealer_id"), "dealer_id", "left_semi")
bad = claims.join(dealers.select("dealer_id"), "dealer_id", "left_anti")
s, g, q = claims.count(), good.count(), bad.count()
result = spark.createDataFrame([(s, g, q, 1 if s == g + q else 0)], ["source_rows", "good_rows", "quarantined_rows", "reconciled"])`, hint: 'left_semi keeps matches, left_anti keeps non-matches; count each and compare.' }),
    spark({ level: 3, q: `**Lab: point-in-time (SCD2) join in PySpark.** Attach to each engine the customer **segment valid on the engine's build date**: join «engines» to «dim_customer_scd2» on «customer_id» **and** «build_date between valid_from and valid_to». Return «engine_id, customer_id, build_date, segment» for engines that found a match, sorted by «engine_id».`, starter: `engines = spark.table("engines")\ndim = spark.table("dim_customer_scd2")\n\nresult = None\n`,
      solution: `engines = spark.table("engines")
dim = spark.table("dim_customer_scd2")
cond = (engines["customer_id"] == dim["customer_id"]) & (engines["build_date"] >= dim["valid_from"]) & (engines["build_date"] <= dim["valid_to"])
result = (engines.join(dim, cond, "inner")
  .select(engines["engine_id"], engines["customer_id"], engines["build_date"], dim["segment"])
  .orderBy("engine_id"))`, hint: 'Join condition combining equality on customer_id and a range on build_date.' }),
  ],
  quality: [
    py({ level: 3, q: `**Lab: schema compatibility checker.** Schemas are dicts «{field: {"type": str, "required": bool, "default": any (optional)}}». Write «check(old, new)» returning a sorted list of problem strings that make «new» **not backward compatible** (consumers on the new schema reading old data): a **new required field without a default** → «"<f>: new required field without default"»; a field whose **type changed** → «"<f>: type changed <old> -> <new>"» (widening int→long and float→double is allowed); a field that became **required** while optional before, without a default → «"<f>: became required"». Removed fields are fine for backward compatibility.`,
      starter: 'def check(old, new):\n    pass\n',
      tests: `old = {'id': {'type': 'int', 'required': True}, 'amount': {'type': 'float', 'required': True}, 'note': {'type': 'string', 'required': False}, 'legacy': {'type': 'string', 'required': False}}
new = {'id': {'type': 'long', 'required': True}, 'amount': {'type': 'string', 'required': True}, 'note': {'type': 'string', 'required': True},
       'region': {'type': 'string', 'required': True}, 'channel': {'type': 'string', 'required': True, 'default': 'dealer'}}
assert check(old, new) == ['amount: type changed float -> string', 'note: became required', 'region: new required field without default'], check(old, new)
assert check(old, old) == []`,
      solution: `WIDEN = {('int', 'long'), ('float', 'double'), ('int', 'double')}

def check(old, new):
    problems = []
    for f, spec in new.items():
        has_default = 'default' in spec
        if f not in old:
            if spec.get('required') and not has_default:
                problems.append(f'{f}: new required field without default')
            continue
        o = old[f]
        if o['type'] != spec['type'] and (o['type'], spec['type']) not in WIDEN:
            problems.append(f"{f}: type changed {o['type']} -> {spec['type']}")
        if spec.get('required') and not o.get('required') and not has_default:
            problems.append(f'{f}: became required')
    return sorted(problems)` }),
  ],
};
