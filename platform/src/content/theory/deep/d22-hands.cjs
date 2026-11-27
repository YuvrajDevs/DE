// Hard hands-on: interview-grade SQL on the practice warehouse and multi-step Python labs.
const { sql, py } = require('../_t.cjs');

module.exports = {
  // ---------------------------------------------------------------- SQL, hard
  aggdeep: { hands: [
    sql({ q: '**Supplier scorecard.** From «purchase_orders» joined to «suppliers», per supplier return «supplier_name», «orders», «open_orders» (received_date NULL), «on_time_pct» = received on or before expected_date / **received** orders × 100 (1 dp), «avg_days_late» = average of (received − expected) in days over **late** received orders only (1 dp, NULL if none), and «rank_on_time» = DENSE_RANK by on_time_pct descending. Sort by «rank_on_time», then «supplier_name».', tables: ['purchase_orders', 'suppliers'], level: 3,
      solution: `WITH s AS (
  SELECT sp.supplier_name,
         COUNT(*) AS orders,
         SUM(CASE WHEN po.received_date IS NULL THEN 1 ELSE 0 END) AS open_orders,
         ROUND(100.0 * SUM(CASE WHEN po.received_date <= po.expected_date THEN 1 ELSE 0 END)
               / NULLIF(SUM(CASE WHEN po.received_date IS NOT NULL THEN 1 ELSE 0 END), 0), 1) AS on_time_pct,
         ROUND(AVG(CASE WHEN po.received_date > po.expected_date
                        THEN julianday(po.received_date) - julianday(po.expected_date) END), 1) AS avg_days_late
  FROM purchase_orders po JOIN suppliers sp ON sp.supplier_id = po.supplier_id
  GROUP BY sp.supplier_id, sp.supplier_name
)
SELECT *, DENSE_RANK() OVER (ORDER BY on_time_pct DESC) AS rank_on_time
FROM s ORDER BY rank_on_time, supplier_name`, hint: 'Denominator = received orders only; AVG over a CASE without ELSE averages only late orders.' }),
    sql({ q: '**Semi-additive inventory.** «inventory» has snapshots per plant, part and date. For each «plant_id» and **month** of snapshot_date, take each part\'s **last snapshot in that month** and sum those quantities. Return «plant_id, month (YYYY-MM), parts, qty_month_end» sorted by plant, month. Never sum across dates.', tables: ['inventory'], level: 3,
      solution: `WITH r AS (
  SELECT plant_id, part_id, substr(snapshot_date, 1, 7) AS month, qty_on_hand,
         ROW_NUMBER() OVER (PARTITION BY plant_id, part_id, substr(snapshot_date, 1, 7) ORDER BY snapshot_date DESC) AS rn
  FROM inventory
)
SELECT plant_id, month, COUNT(*) AS parts, SUM(qty_on_hand) AS qty_month_end
FROM r WHERE rn = 1
GROUP BY plant_id, month
ORDER BY plant_id, month` }),
  ] },
  windows: { hands: [
    sql({ q: '**Pareto of failure codes.** Join «pir» → «claims» (claims.pir_id) and sum «claim_amount» per «failure_code». Return «failure_code, claim_value» (2 dp), «cum_pct» = running share of total value in descending order of value (1 dp), and «in_top_80» = 1 if the code is needed to reach 80% of value (i.e. the running share **before** this code is below 80), else 0. Sort by claim_value descending.', tables: ['pir', 'claims'], level: 3,
      solution: `WITH v AS (
  SELECT p.failure_code, SUM(c.claim_amount) AS val
  FROM pir p JOIN claims c ON c.pir_id = p.pir_id
  GROUP BY p.failure_code
), r AS (
  SELECT failure_code, val,
         SUM(val) OVER (ORDER BY val DESC, failure_code ROWS UNBOUNDED PRECEDING) AS cum,
         SUM(val) OVER () AS total
  FROM v
)
SELECT failure_code, ROUND(val, 2) AS claim_value,
       ROUND(100.0 * cum / total, 1) AS cum_pct,
       CASE WHEN 100.0 * (cum - val) / total < 80 THEN 1 ELSE 0 END AS in_top_80
FROM r ORDER BY val DESC, failure_code`, hint: 'Running SUM with an explicit ROWS frame and a tie-breaker; total with SUM() OVER ().' }),
    sql({ q: '**Month-over-month with a calendar spine.** Count claims per month of «submitted_at» for every month from 2026-01 to 2026-12 (months with no claims show 0), plus «prev_month» claims and «mom_change» (claims − prev; NULL for the first month). Return «month, claims, prev_month, mom_change» sorted by month.', tables: ['claims'], level: 3,
      solution: `WITH RECURSIVE m(d) AS (
  SELECT '2026-01-01' UNION ALL SELECT date(d, '+1 month') FROM m WHERE d < '2026-12-01'
), c AS (
  SELECT substr(submitted_at, 1, 7) AS month, COUNT(*) AS n FROM claims GROUP BY 1
), s AS (
  SELECT substr(m.d, 1, 7) AS month, COALESCE(c.n, 0) AS claims FROM m LEFT JOIN c ON c.month = substr(m.d, 1, 7)
)
SELECT month, claims, LAG(claims) OVER (ORDER BY month) AS prev_month,
       claims - LAG(claims) OVER (ORDER BY month) AS mom_change
FROM s ORDER BY month` }),
  ] },
  patterns: { hands: [
    sql({ q: '**Repeat failures.** An engine has a **repeat failure** when it gets a PIR with the **same failure_code** as one of its earlier PIRs within **180 days**. Chain «pir → service_requests → crf» to get the engine. Return «engine_id, failure_code, first_pir_at, repeat_pir_at, days_between» (rounded to 0 dp) for each repeat (comparing each PIR with the previous PIR of the same engine and code), sorted by engine_id, repeat_pir_at.', tables: ['pir', 'service_requests', 'crf'], level: 3,
      solution: `WITH e AS (
  SELECT f.engine_id, p.failure_code, p.created_at,
         LAG(p.created_at) OVER (PARTITION BY f.engine_id, p.failure_code ORDER BY p.created_at, p.pir_id) AS prev_at
  FROM pir p JOIN service_requests s ON s.sr_id = p.sr_id JOIN crf f ON f.crf_id = s.crf_id
)
SELECT engine_id, failure_code, prev_at AS first_pir_at, created_at AS repeat_pir_at,
       ROUND(julianday(created_at) - julianday(prev_at), 0) AS days_between
FROM e
WHERE prev_at IS NOT NULL AND julianday(created_at) - julianday(prev_at) <= 180
ORDER BY engine_id, repeat_pir_at` }),
    sql({ q: '**Overheat incidents (islands).** In «sensor_readings», a reading is hot when «temperature_c > 90». Group **consecutive** hot readings per engine (ordered by ts) into incidents. Return «engine_id, incident_start, incident_end, readings, max_temp» for incidents of **2 or more** readings, sorted by engine_id, incident_start.', tables: ['sensor_readings'], level: 3,
      solution: `WITH f AS (
  SELECT engine_id, ts, temperature_c, reading_id,
         CASE WHEN temperature_c > 90 THEN 1 ELSE 0 END AS hot
  FROM sensor_readings
), g AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY ts, reading_id)
          - ROW_NUMBER() OVER (PARTITION BY engine_id, hot ORDER BY ts, reading_id) AS grp
  FROM f
)
SELECT engine_id, MIN(ts) AS incident_start, MAX(ts) AS incident_end, COUNT(*) AS readings, MAX(temperature_c) AS max_temp
FROM g WHERE hot = 1
GROUP BY engine_id, grp
HAVING COUNT(*) >= 2
ORDER BY engine_id, incident_start`, hint: 'Difference of two row numbers (all rows vs rows of the same hot flag) is constant within a run.' }),
    sql({ q: '**Technician double-booking.** Find pairs of **closed** service requests assigned to the same technician whose open intervals overlap ([opened_at, closed_at)). Return «technician_id, sr_a, sr_b, overlap_hours» (rounded to 1 dp; sr_a < sr_b), only overlaps longer than 24 hours, sorted by overlap_hours descending, then sr_a, sr_b. Limit 15.', tables: ['service_requests'], level: 3,
      solution: `SELECT a.technician_id, a.sr_id AS sr_a, b.sr_id AS sr_b,
       ROUND((julianday(MIN(a.closed_at, b.closed_at)) - julianday(MAX(a.opened_at, b.opened_at))) * 24, 1) AS overlap_hours
FROM service_requests a
JOIN service_requests b
  ON a.technician_id = b.technician_id AND a.sr_id < b.sr_id
 AND a.opened_at < b.closed_at AND b.opened_at < a.closed_at
WHERE a.closed_at IS NOT NULL AND b.closed_at IS NOT NULL
  AND (julianday(MIN(a.closed_at, b.closed_at)) - julianday(MAX(a.opened_at, b.opened_at))) * 24 > 24
ORDER BY overlap_hours DESC, sr_a, sr_b
LIMIT 15`, hint: 'Intervals overlap when a.start < b.end AND b.start < a.end; overlap = min(ends) − max(starts). SQLite\'s scalar MIN/MAX take several arguments.' }),
  ] },
  recon: { hands: [
    sql({ q: '**Integrity sweep of the warranty chain.** Return one row per check with «check_name, failing_rows»: «sr_without_crf» (service_requests whose crf_id is not in crf), «pir_without_sr», «claim_without_pir», «credit_note_without_claim», «credit_note_over_claim» (credit note amount greater than the claim\'s approved_amount, NULL approved counts as failing), «claim_before_pir» (claim submitted_at earlier than its PIR created_at). Sort by check_name.', tables: ['crf', 'service_requests', 'pir', 'claims', 'credit_notes'], level: 3,
      solution: `SELECT 'claim_before_pir' AS check_name, COUNT(*) AS failing_rows
FROM claims c JOIN pir p ON p.pir_id = c.pir_id WHERE c.submitted_at < p.created_at
UNION ALL
SELECT 'claim_without_pir', COUNT(*) FROM claims c WHERE NOT EXISTS (SELECT 1 FROM pir p WHERE p.pir_id = c.pir_id)
UNION ALL
SELECT 'credit_note_over_claim', COUNT(*) FROM credit_notes n JOIN claims c ON c.claim_id = n.claim_id
WHERE c.approved_amount IS NULL OR n.amount > c.approved_amount
UNION ALL
SELECT 'credit_note_without_claim', COUNT(*) FROM credit_notes n WHERE NOT EXISTS (SELECT 1 FROM claims c WHERE c.claim_id = n.claim_id)
UNION ALL
SELECT 'pir_without_sr', COUNT(*) FROM pir p WHERE NOT EXISTS (SELECT 1 FROM service_requests s WHERE s.sr_id = p.sr_id)
UNION ALL
SELECT 'sr_without_crf', COUNT(*) FROM service_requests s WHERE NOT EXISTS (SELECT 1 FROM crf f WHERE f.crf_id = s.crf_id)
ORDER BY check_name` }),
    sql({ q: '**Source vs target reconciliation.** Treat the latest event per order in «raw_orders_feed» (by updated_at, then event_id) as the source truth and «orders_current» as the target. FULL-compare them (emulate FULL OUTER JOIN with UNION) and return «order_id, source_status, target_status, result» where result is «only_in_source», «only_in_target», «status_mismatch» or «match». Sort by order_id.', tables: ['raw_orders_feed', 'orders_current'], level: 3,
      solution: `WITH src AS (
  SELECT order_id, status FROM (
    SELECT order_id, status, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, event_id DESC) AS rn
    FROM raw_orders_feed) WHERE rn = 1
), j AS (
  SELECT s.order_id, s.status AS source_status, t.status AS target_status
  FROM src s LEFT JOIN orders_current t ON t.order_id = s.order_id
  UNION
  SELECT t.order_id, s.status, t.status
  FROM orders_current t LEFT JOIN src s ON s.order_id = t.order_id
)
SELECT order_id, source_status, target_status,
       CASE WHEN target_status IS NULL THEN 'only_in_source'
            WHEN source_status IS NULL THEN 'only_in_target'
            WHEN source_status <> target_status THEN 'status_mismatch'
            ELSE 'match' END AS result
FROM j ORDER BY order_id` }),
  ] },
  ctes: { hands: [
    sql({ q: '**Cost of each manager\'s organisation.** Using a recursive CTE over «employees», return for every employee who manages at least one person: «emp_id, name, reports_total» (all direct and indirect reports) and «org_salary» (sum of salaries of all those reports, excluding the manager). Sort by org_salary descending, then emp_id.', tables: ['employees'], level: 3,
      solution: `WITH RECURSIVE tree(manager_id, emp_id) AS (
  SELECT manager_id, emp_id FROM employees WHERE manager_id IS NOT NULL
  UNION ALL
  SELECT t.manager_id, e.emp_id FROM tree t JOIN employees e ON e.manager_id = t.emp_id
)
SELECT m.emp_id, m.name, COUNT(*) AS reports_total, SUM(r.salary) AS org_salary
FROM tree t
JOIN employees m ON m.emp_id = t.manager_id
JOIN employees r ON r.emp_id = t.emp_id
GROUP BY m.emp_id, m.name
ORDER BY org_salary DESC, m.emp_id`, hint: 'Build (ancestor, descendant) pairs: start from direct edges, extend downward.' }),
  ] },
  facts: { hands: [
    sql({ q: '**Accumulating snapshot.** Build one row per CRF with milestone timestamps: «crf_id, crf_at, first_sr_at, first_pir_at, first_claim_at, first_credit_at» (earliest of each along the chain crf → service_requests → pir → claims → credit_notes; NULL if not reached) and «days_crf_to_credit» (rounded to 1 dp). Only CRFs that reached a claim. Sort by crf_id.', tables: ['crf', 'service_requests', 'pir', 'claims', 'credit_notes'], level: 3,
      solution: `SELECT f.crf_id, f.created_at AS crf_at,
       MIN(s.opened_at) AS first_sr_at,
       MIN(p.created_at) AS first_pir_at,
       MIN(c.submitted_at) AS first_claim_at,
       MIN(n.issued_at) AS first_credit_at,
       ROUND(julianday(MIN(n.issued_at)) - julianday(f.created_at), 1) AS days_crf_to_credit
FROM crf f
JOIN service_requests s ON s.crf_id = f.crf_id
JOIN pir p ON p.sr_id = s.sr_id
JOIN claims c ON c.pir_id = p.pir_id
LEFT JOIN credit_notes n ON n.claim_id = c.claim_id
GROUP BY f.crf_id, f.created_at
ORDER BY f.crf_id` }),
  ] },
  dedupe: { hands: [
    sql({ q: '**Defect share within model.** Join «quality_defects» to «engines». Per «model» and «stage», return «defects», «critical» (severity Critical) and «share_of_model_pct» = this stage\'s defects / all defects of that model × 100 (1 dp). Also «stage_rank» = rank of the stage by defects within the model (RANK, highest first). Sort by model, stage_rank, stage.', tables: ['quality_defects', 'engines'], level: 2,
      solution: `WITH x AS (
  SELECT e.model, d.stage, COUNT(*) AS defects,
         SUM(CASE WHEN d.severity = 'Critical' THEN 1 ELSE 0 END) AS critical
  FROM quality_defects d JOIN engines e ON e.engine_id = d.engine_id
  GROUP BY e.model, d.stage
)
SELECT model, stage, defects, critical,
       ROUND(100.0 * defects / SUM(defects) OVER (PARTITION BY model), 1) AS share_of_model_pct,
       RANK() OVER (PARTITION BY model ORDER BY defects DESC) AS stage_rank
FROM x ORDER BY model, stage_rank, stage` }),
  ] },

  // ---------------------------------------------------------------- Python labs, multi-step
  cdc: { hands: [
    py({ q: '**CDC apply engine.** Implement «apply_cdc(state, events)». «state» maps key → «{"row": dict, "lsn": int, "deleted": bool}» (tombstones are kept). «events» are dicts «{"op": "c"|"u"|"d"|"r", "key", "lsn", "after": dict|None}» in **any order** and may contain **duplicates and replays**. Rules: process events sorted by lsn; ignore an event whose lsn ≤ the stored lsn for that key; «c/u/r» set the row to «after» and deleted False; «d» marks deleted True (row None). Return a new state (do not mutate the input) and also write «live(state)» returning «{key: row}» for non-deleted keys. A late update older than a delete must not resurrect the row.', starter: 'def apply_cdc(state, events):\n    pass\n\ndef live(state):\n    pass\n',
      tests: `ev = [
 {'op': 'c', 'key': 1, 'lsn': 10, 'after': {'s': 'NEW'}},
 {'op': 'u', 'key': 1, 'lsn': 30, 'after': {'s': 'APPROVED'}},
 {'op': 'u', 'key': 1, 'lsn': 20, 'after': {'s': 'REVIEW'}},
 {'op': 'c', 'key': 2, 'lsn': 15, 'after': {'s': 'NEW'}},
 {'op': 'd', 'key': 2, 'lsn': 40, 'after': None},
 {'op': 'u', 'key': 2, 'lsn': 35, 'after': {'s': 'LATE'}},
 {'op': 'u', 'key': 1, 'lsn': 30, 'after': {'s': 'APPROVED'}}]
s = apply_cdc({}, ev)
assert live(s) == {1: {'s': 'APPROVED'}}, live(s)
assert s[2]['deleted'] is True and s[2]['lsn'] == 40
s2 = apply_cdc(s, ev)
assert s2 == s, 'replay is a no-op'
s3 = apply_cdc(s, [{'op': 'u', 'key': 2, 'lsn': 38, 'after': {'s': 'ZOMBIE'}}])
assert 2 not in live(s3), 'no resurrection'
s4 = apply_cdc(s, [{'op': 'c', 'key': 2, 'lsn': 50, 'after': {'s': 'REOPENED'}}])
assert live(s4)[2] == {'s': 'REOPENED'}
assert apply_cdc({}, []) == {}`,
      solution: `def apply_cdc(state, events):
    out = {k: dict(v) for k, v in state.items()}
    for e in sorted(events, key=lambda e: e['lsn']):
        cur = out.get(e['key'])
        if cur is not None and e['lsn'] <= cur['lsn']:
            continue
        if e['op'] == 'd':
            out[e['key']] = {'row': None, 'lsn': e['lsn'], 'deleted': True}
        else:
            out[e['key']] = {'row': e['after'], 'lsn': e['lsn'], 'deleted': False}
    return out

def live(state):
    return {k: v['row'] for k, v in state.items() if not v['deleted']}` }),
  ] },
  statefulstream: { hands: [
    py({ q: '**Micro-batch engine with a watermark.** Write «run(batches, window_s, delay_s)». Each batch is a list of «(event_ts_seconds, engine_id)». Count events per «(window_start, engine_id)» with tumbling windows of «window_s». After **each** batch: watermark = max event ts seen so far − delay_s (never decreasing; start at −infinity); events whose ts < the watermark **at the start of that batch** are dropped (count them); windows whose end (start + window_s) ≤ the new watermark are **emitted once** (append mode) and removed from state. Return «(emitted, dropped, state_left)» where emitted is a list of «(window_start, engine_id, count)» in emission order (sorted within a batch), dropped is an int and state_left is the number of open windows at the end.', starter: 'def run(batches, window_s, delay_s):\n    pass\n',
      tests: `b = [[(0, 'A'), (5, 'A'), (12, 'B')],
     [(31, 'A'), (8, 'A')],
     [(3, 'A'), (45, 'B'), (29, 'B')],
     [(70, 'A')]]
emitted, dropped, left = run(b, 10, 15)
assert emitted == [(0, 'A', 3), (10, 'B', 1), (20, 'B', 1), (30, 'A', 1), (40, 'B', 1)], emitted
assert dropped == 1, dropped   # (3, 'A') arrived after the watermark reached 16
assert left == 1, left         # only (70, 'A') is still open`,
      solution: `def run(batches, window_s, delay_s):
    wm = float('-inf'); max_ts = float('-inf')
    state, emitted, dropped = {}, [], 0
    for batch in batches:
        start_wm = wm
        for ts, eid in batch:
            if ts < start_wm:
                dropped += 1
                continue
            k = (ts - ts % window_s, eid)
            state[k] = state.get(k, 0) + 1
            max_ts = max(max_ts, ts)
        wm = max(wm, max_ts - delay_s)
        done = sorted(k for k in state if k[0] + window_s <= wm)
        for k in done:
            emitted.append((k[0], k[1], state.pop(k)))
    return emitted, dropped, len(state)` }),
  ] },
  observ: { hands: [
    py({ q: '**Volume anomaly detector.** Write «volume_alerts(history, today, k=3.0, min_days=4)». «history» maps «"YYYY-MM-DD"» → row count for past days; «today» is «(date, count)». Compare today only with past days of the **same weekday** (use «datetime.date.fromisoformat(d).weekday()»). If fewer than «min_days» such days, return «"insufficient_history"». Otherwise compute their mean and population standard deviation; return «"low"» if count < mean − k·sd, «"high"» if count > mean + k·sd, else «"ok"». If sd is 0, any count different from the mean is low/high.', starter: 'from datetime import date\nimport statistics\n\ndef volume_alerts(history, today, k=3.0, min_days=4):\n    pass\n',
      tests: `h = {'2026-10-26': 1000, '2026-11-02': 1040, '2026-11-09': 980, '2026-11-16': 1010, '2026-11-17': 50, '2026-11-18': 99999}
assert volume_alerts(h, ('2026-11-23', 1005)) == 'ok'
assert volume_alerts(h, ('2026-11-23', 400)) == 'low'
assert volume_alerts(h, ('2026-11-23', 5000)) == 'high'
assert volume_alerts(h, ('2026-11-24', 50)) == 'insufficient_history'
flat = {'2026-10-26': 7, '2026-11-02': 7, '2026-11-09': 7, '2026-11-16': 7}
assert volume_alerts(flat, ('2026-11-23', 7)) == 'ok' and volume_alerts(flat, ('2026-11-23', 8)) == 'high'`,
      solution: `from datetime import date
import statistics

def volume_alerts(history, today, k=3.0, min_days=4):
    d, n = today
    wd = date.fromisoformat(d).weekday()
    same = [v for day, v in history.items() if date.fromisoformat(day).weekday() == wd and day < d]
    if len(same) < min_days:
        return 'insufficient_history'
    mean = statistics.fmean(same)
    sd = statistics.pstdev(same)
    if n < mean - k * sd:
        return 'low'
    if n > mean + k * sd:
        return 'high'
    return 'ok'` }),
  ] },
  contracts: { hands: [
    py({ q: '**Data contract validator.** A contract is a dict column → spec with keys «type» («"int"|"float"|"str"»), «required» (bool), optional «min»/«max» (numbers) and optional «allowed» (list). Write «validate(rows, contract)» returning «(good, bad)» where bad is a list of «(index, column, reason)» for the **first** violation of each bad row, checking columns in contract order. Reasons: «"missing"» (required and key absent or None), «"type"» (bool is **not** an int; ints are acceptable for float), «"range"», «"not_allowed"», and «"unexpected:<col>"» for columns not in the contract (checked after contract columns). Optional columns may be None.', starter: 'def validate(rows, contract):\n    pass\n',
      tests: `c = {'engine_id': {'type': 'int', 'required': True, 'min': 1},
     'temp_c': {'type': 'float', 'required': True, 'min': -40, 'max': 150},
     'status': {'type': 'str', 'required': False, 'allowed': ['RUN', 'IDLE']}}
rows = [{'engine_id': 1, 'temp_c': 80, 'status': 'RUN'},
        {'engine_id': True, 'temp_c': 80.5},
        {'engine_id': 2, 'temp_c': 151.0},
        {'engine_id': 3, 'temp_c': 20.0, 'status': 'OFF'},
        {'temp_c': 10.0},
        {'engine_id': 4, 'temp_c': 1.5, 'status': None, 'rpm': 900},
        {'engine_id': 5, 'temp_c': 2.5, 'status': None}]
good, bad = validate(rows, c)
assert good == [rows[0], rows[6]], good
assert bad == [(1, 'engine_id', 'type'), (2, 'temp_c', 'range'), (3, 'status', 'not_allowed'),
               (4, 'engine_id', 'missing'), (5, 'rpm', 'unexpected:rpm')], bad`,
      solution: `def validate(rows, contract):
    py_types = {'int': (int,), 'float': (int, float), 'str': (str,)}
    good, bad = [], []
    for i, r in enumerate(rows):
        err = None
        for col, spec in contract.items():
            v = r.get(col)
            if v is None:
                if spec.get('required'):
                    err = (i, col, 'missing'); break
                continue
            if isinstance(v, bool) or not isinstance(v, py_types[spec['type']]):
                err = (i, col, 'type'); break
            if ('min' in spec and v < spec['min']) or ('max' in spec and v > spec['max']):
                err = (i, col, 'range'); break
            if 'allowed' in spec and v not in spec['allowed']:
                err = (i, col, 'not_allowed'); break
        if err is None:
            extra = [k for k in r if k not in contract]
            if extra:
                err = (i, extra[0], 'unexpected:' + extra[0])
        (bad.append(err) if err else good.append(r))
    return good, bad` }),
  ] },
  backfill: { hands: [
    py({ q: '**Backfill planner.** Write «plan_backfill(start, end, chunk_days, done, max_parallel)» that splits the inclusive date range [start, end] («YYYY-MM-DD») into consecutive chunks of «chunk_days» (the last may be shorter), **skips chunks whose every day is in the set «done»**, and returns a list of **waves** (lists of «(chunk_start, chunk_end)»), each wave at most «max_parallel» chunks, in chronological order.', starter: 'from datetime import date, timedelta\n\ndef plan_backfill(start, end, chunk_days, done, max_parallel):\n    pass\n',
      tests: `done = {'2026-01-0%d' % d for d in range(1, 8)}
w = plan_backfill('2026-01-01', '2026-01-31', 7, done, 2)
assert w == [[('2026-01-08', '2026-01-14'), ('2026-01-15', '2026-01-21')],
             [('2026-01-22', '2026-01-28'), ('2026-01-29', '2026-01-31')]], w
assert plan_backfill('2026-02-01', '2026-02-01', 7, set(), 3) == [[('2026-02-01', '2026-02-01')]]
assert plan_backfill('2026-01-01', '2026-01-07', 7, done, 2) == []`,
      solution: `from datetime import date, timedelta

def plan_backfill(start, end, chunk_days, done, max_parallel):
    s, e = date.fromisoformat(start), date.fromisoformat(end)
    chunks = []
    while s <= e:
        ce = min(e, s + timedelta(days=chunk_days - 1))
        days = {(s + timedelta(days=i)).isoformat() for i in range((ce - s).days + 1)}
        if not days <= done:
            chunks.append((s.isoformat(), ce.isoformat()))
        s = ce + timedelta(days=1)
    return [chunks[i:i + max_parallel] for i in range(0, len(chunks), max_parallel)]` }),
  ] },
  lineage: { hands: [
    py({ q: '**Impact analysis on a lineage graph.** «edges» is a list of «(upstream, downstream)» table names. Write «impacted(edges, changed)» returning the **sorted** list of all tables downstream of «changed» (direct and indirect, excluding changed itself), and «build_order(edges)» returning a valid topological order (ties broken alphabetically, i.e. Kahn\'s algorithm with a sorted ready list); raise «ValueError("cycle")» if the graph has a cycle.', starter: 'def impacted(edges, changed):\n    pass\n\ndef build_order(edges):\n    pass\n',
      tests: `e = [('bronze.claims', 'silver.claims'), ('silver.claims', 'gold.claims_daily'), ('silver.dealers', 'gold.claims_daily'),
     ('gold.claims_daily', 'bi.dashboard'), ('silver.claims', 'ml.features')]
assert impacted(e, 'silver.claims') == ['bi.dashboard', 'gold.claims_daily', 'ml.features']
assert impacted(e, 'bi.dashboard') == []
assert build_order(e) == ['bronze.claims', 'silver.claims', 'ml.features', 'silver.dealers', 'gold.claims_daily', 'bi.dashboard'], build_order(e)
try:
    build_order(e + [('bi.dashboard', 'silver.claims')]); assert False
except ValueError as ex:
    assert 'cycle' in str(ex)`,
      solution: `from collections import defaultdict

def impacted(edges, changed):
    down = defaultdict(list)
    for u, d in edges:
        down[u].append(d)
    seen, stack = set(), [changed]
    while stack:
        for d in down[stack.pop()]:
            if d not in seen:
                seen.add(d); stack.append(d)
    seen.discard(changed)
    return sorted(seen)

def build_order(edges):
    down, indeg, nodes = defaultdict(list), defaultdict(int), set()
    for u, d in edges:
        down[u].append(d); indeg[d] += 1; nodes |= {u, d}
    ready = sorted(n for n in nodes if indeg[n] == 0)
    out = []
    while ready:
        n = ready.pop(0)
        out.append(n)
        for d in down[n]:
            indeg[d] -= 1
            if indeg[d] == 0:
                ready.append(d)
        ready.sort()
    if len(out) != len(nodes):
        raise ValueError('cycle')
    return out` }),
  ] },
};
