// Practice bank: extra items used only by the Practice hub (and spaced review once attempted).
const { mcq, tf, multi, match, order, sql, py, spark, scenario, talk, bug, fill } = require('./_h.cjs');
const set = (id, topic, cards) => ({ id, topic, cards: cards.map(c => ({ topic, ...c })) });

module.exports = [
  set('bq1', 'sql1', [
    sql({ q: `Dealers that have **never** received a claim. Return «dealer_id, dealer_name».`, tables: ['dealers', 'claims'], solution: `SELECT d.dealer_id, d.dealer_name FROM dealers d WHERE NOT EXISTS (SELECT 1 FROM claims c WHERE c.dealer_id = d.dealer_id);`, hint: 'NOT EXISTS or LEFT JOIN … IS NULL.' }),
    sql({ q: `Engines per plant, **including plants with zero engines**. Return «plant_name, engines».`, tables: ['plants', 'engines'], solution: `SELECT p.plant_name, COUNT(e.engine_id) AS engines FROM plants p LEFT JOIN engines e ON e.plant_id = p.plant_id GROUP BY p.plant_name;`, hint: 'LEFT JOIN from plants and COUNT(e.engine_id), not COUNT(*).' }),
    sql({ q: `Top 3 customers by number of CRFs. Return «customer_name, crfs», highest first (ties broken by name).`, tables: ['crf', 'customers'], solution: `SELECT cu.customer_name, COUNT(*) AS crfs FROM crf c JOIN customers cu ON cu.customer_id = c.customer_id GROUP BY cu.customer_name ORDER BY crfs DESC, cu.customer_name LIMIT 3;`, ordered: true }),
    sql({ q: `For each customer: first CRF date, last CRF date and number of CRFs. Return «customer_id, first_crf, last_crf, crfs» (dates as «date(created_at)»).`, tables: ['crf'], solution: `SELECT customer_id, MIN(date(created_at)) AS first_crf, MAX(date(created_at)) AS last_crf, COUNT(*) AS crfs FROM crf GROUP BY customer_id;` }),
    sql({ q: `CRFs created on a **weekend** (Saturday or Sunday). Return «crf_id, created_at». Hint: «strftime('%w', d)» gives 0 = Sunday … 6 = Saturday.`, tables: ['crf'], solution: `SELECT crf_id, created_at FROM crf WHERE strftime('%w', created_at) IN ('0', '6');` }),
    sql({ q: `Hourly pattern: number of CRFs created per **hour of day**. Return «hour, crfs» in hour order.`, tables: ['crf'], solution: `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS crfs FROM crf GROUP BY hour ORDER BY hour;`, ordered: true }),
    sql({ q: `Conversion by dealer: % of each dealer's CRFs with status «'Converted'» (1 decimal). Return «dealer_id, crfs, converted_pct».`, tables: ['crf'], solution: `SELECT dealer_id, COUNT(*) AS crfs, ROUND(100.0 * SUM(CASE WHEN status = 'Converted' THEN 1 ELSE 0 END) / COUNT(*), 1) AS converted_pct FROM crf GROUP BY dealer_id;` }),
    sql({ q: `Engines with a **Field**-stage quality defect but **no CRF at all**. Return distinct «engine_id».`, tables: ['quality_defects', 'crf'], solution: `SELECT DISTINCT q.engine_id FROM quality_defects q WHERE q.stage = 'Field' AND NOT EXISTS (SELECT 1 FROM crf c WHERE c.engine_id = q.engine_id);`, level: 2 }),
  ]),
  set('bq2', 'sql2', [
    sql({ q: `Second-highest «claim_amount» overall (one value). Use DENSE_RANK or ORDER BY … LIMIT/OFFSET.`, tables: ['claims'], solution: `SELECT claim_amount FROM (SELECT claim_amount, DENSE_RANK() OVER (ORDER BY claim_amount DESC) AS r FROM claims) WHERE r = 2;`, level: 2 }),
    sql({ q: `Running count of CRFs per customer over time: return «crf_id, customer_id, created_at, nth» where «nth» is 1 for the customer's first CRF, 2 for the second, etc.`, tables: ['crf'], solution: `SELECT crf_id, customer_id, created_at, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at, crf_id) AS nth FROM crf;`, level: 2 }),
    sql({ q: `Average days between consecutive CRFs **per engine**, only engines with at least 4 CRFs. Return «engine_id, avg_gap_days» (1 decimal).`, tables: ['crf'], solution: `WITH g AS (
  SELECT engine_id, julianday(created_at) - julianday(LAG(created_at) OVER (PARTITION BY engine_id ORDER BY created_at)) AS gap FROM crf
)
SELECT engine_id, ROUND(AVG(gap), 1) AS avg_gap_days FROM g GROUP BY engine_id HAVING COUNT(*) >= 4;`, level: 3, hint: 'LAG in a CTE, then AVG(gap) and HAVING COUNT(*) >= 4 (COUNT(*) counts CRFs, including the first with a NULL gap).' }),
    sql({ q: `Parts with **more defects than the average part**. Return «part_id, defects».`, tables: ['quality_defects'], solution: `WITH d AS (SELECT part_id, COUNT(*) AS defects FROM quality_defects GROUP BY part_id)
SELECT part_id, defects FROM d WHERE defects > (SELECT AVG(defects) FROM d);`, level: 2 }),
    sql({ q: `Semi-additive measure: total «qty_on_hand» per plant **on the latest snapshot date only** (do not sum across dates). Return «plant_id, qty».`, tables: ['inventory'], solution: `SELECT plant_id, SUM(qty_on_hand) AS qty FROM inventory WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM inventory) GROUP BY plant_id;`, level: 2 }),
    sql({ q: `Inventory movement at **plant 1**: for each part present in both the 2026-09-30 and 2026-10-31 snapshots, return «part_id, sep_qty, oct_qty, change».`, tables: ['inventory'], solution: `SELECT s.part_id, s.qty_on_hand AS sep_qty, o.qty_on_hand AS oct_qty, o.qty_on_hand - s.qty_on_hand AS change
FROM inventory s JOIN inventory o ON o.part_id = s.part_id AND o.plant_id = s.plant_id
WHERE s.plant_id = 1 AND s.snapshot_date = '2026-09-30' AND o.snapshot_date = '2026-10-31';`, level: 2 }),
    sql({ q: `Highest total PO value («qty * unit_price») supplier **per supplier country**. Return «country, supplier_name, po_value» (2 decimals).`, tables: ['purchase_orders', 'suppliers'], solution: `WITH v AS (
  SELECT s.country, s.supplier_name, SUM(p.qty * p.unit_price) AS po_value,
         RANK() OVER (PARTITION BY s.country ORDER BY SUM(p.qty * p.unit_price) DESC) AS r
  FROM purchase_orders p JOIN suppliers s ON s.supplier_id = p.supplier_id
  GROUP BY s.country, s.supplier_name
)
SELECT country, supplier_name, ROUND(po_value, 2) FROM v WHERE r = 1;`, level: 3 }),
    sql({ q: `Employees who earn **more than their manager**. Return «employee, manager».`, tables: ['employees'], solution: `SELECT e.name AS employee, m.name AS manager FROM employees e JOIN employees m ON m.emp_id = e.manager_id WHERE e.salary > m.salary;`, level: 2 }),
    sql({ q: `Highest-paid employee **per plant**. Return «plant_id, name, salary».`, tables: ['employees'], solution: `SELECT plant_id, name, salary FROM (SELECT plant_id, name, salary, RANK() OVER (PARTITION BY plant_id ORDER BY salary DESC) AS r FROM employees) WHERE r = 1;`, level: 2 }),
    sql({ q: `**Pareto**: dealers by total claim amount (desc) with the cumulative share of all claim amount (1 decimal). Return «dealer_id, total, cum_pct» in that order.`, tables: ['claims'], solution: `WITH t AS (SELECT dealer_id, SUM(claim_amount) AS total FROM claims GROUP BY dealer_id)
SELECT dealer_id, ROUND(total, 2) AS total,
       ROUND(100.0 * SUM(total) OVER (ORDER BY total DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) / SUM(total) OVER (), 1) AS cum_pct
FROM t ORDER BY total DESC;`, ordered: true, level: 3 }),
    sql({ q: `Service requests that took **longer than the average for their priority**. Return «sr_id, priority, days» (1 decimal), closed SRs only.`, tables: ['service_requests'], solution: `WITH d AS (SELECT sr_id, priority, julianday(closed_at) - julianday(opened_at) AS days FROM service_requests WHERE closed_at IS NOT NULL)
SELECT sr_id, priority, ROUND(days, 1) FROM d WHERE days > (SELECT AVG(days) FROM d x WHERE x.priority = d.priority);`, level: 2 }),
    sql({ q: `Gaps & islands on telemetry: per engine, the **longest run of consecutive readings above 85°C**. Return «engine_id, longest_run» for engines with at least one such reading.`, tables: ['sensor_readings'], solution: `WITH r AS (
  SELECT engine_id, ts, temperature_c > 85 AS hot,
         ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY ts) AS rn
  FROM sensor_readings
), h AS (
  SELECT engine_id, rn - ROW_NUMBER() OVER (PARTITION BY engine_id ORDER BY ts) AS grp FROM r WHERE hot = 1
)
SELECT engine_id, MAX(n) AS longest_run FROM (SELECT engine_id, grp, COUNT(*) AS n FROM h GROUP BY engine_id, grp) GROUP BY engine_id;`, level: 3, hint: 'Number all readings, then number only the hot ones; the difference is constant inside a streak.' }),
    sql({ q: `Reconciliation: credit notes whose «amount» does not equal the claim's «approved_amount». Return «claim_id, approved_amount, cn_amount».`, tables: ['claims', 'credit_notes'], solution: `SELECT c.claim_id, c.approved_amount, n.amount AS cn_amount FROM claims c JOIN credit_notes n ON n.claim_id = c.claim_id WHERE ABS(COALESCE(c.approved_amount, 0) - n.amount) > 0.005;`, level: 2 }),
    sql({ q: `Rank dealers by **approval rate** (Approved + Partially Approved ÷ all claims) among dealers with at least 8 claims. Return «dealer_id, approval_rate» (2 decimals) and «rnk» using RANK.`, tables: ['claims'], solution: `WITH a AS (
  SELECT dealer_id, 1.0 * SUM(CASE WHEN status IN ('Approved', 'Partially Approved') THEN 1 ELSE 0 END) / COUNT(*) AS rate
  FROM claims GROUP BY dealer_id HAVING COUNT(*) >= 8
)
SELECT dealer_id, ROUND(rate, 2) AS approval_rate, RANK() OVER (ORDER BY rate DESC) AS rnk FROM a;`, level: 3 }),
    sql({ q: `Monthly **cohort**: for customers grouped by the month of their first CRF, count customers per cohort month. Return «cohort_month, customers».`, tables: ['crf'], solution: `SELECT cohort_month, COUNT(*) AS customers FROM (
  SELECT customer_id, strftime('%Y-%m', MIN(created_at)) AS cohort_month FROM crf GROUP BY customer_id
) GROUP BY cohort_month;`, level: 2 }),
  ]),
  set('bpy', 'python', [
    py({ q: `Write «word_counts(notes)» returning a dict of lowercase word → count across a list of technician notes. Split on non-letters.`, starter: 'import re\n\ndef word_counts(notes):\n    pass\n', tests: `r = word_counts(["Oil leak near pump.", "oil LEAK again!"])
assert r == {'oil': 2, 'leak': 2, 'near': 1, 'pump': 1, 'again': 1}, r`, solution: `import re
from collections import Counter

def word_counts(notes):
    c = Counter()
    for n in notes:
        c.update(w for w in re.split(r'[^a-zA-Z]+', n.lower()) if w)
    return dict(c)` }),
    py({ q: `Write «merge_sorted(a, b)» that merges two already-sorted lists into one sorted list **without calling sort()** (the merge step of merge sort, and of a sort-merge join).`, starter: 'def merge_sorted(a, b):\n    pass\n', tests: `assert merge_sorted([1, 4, 9], [2, 3, 10, 11]) == [1, 2, 3, 4, 9, 10, 11]
assert merge_sorted([], [1]) == [1]
assert merge_sorted([5], []) == [5]`, solution: `def merge_sorted(a, b):
    i = j = 0
    out = []
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            out.append(a[i]); i += 1
        else:
            out.append(b[j]); j += 1
    return out + a[i:] + b[j:]` }),
    py({ q: `Write «validate(records, schema)». «schema» maps field → type (e.g. «{'claim_id': int, 'amount': float}»). Return a list of error strings like «"row 1: amount expected float, got str"» and «"row 2: missing claim_id"». Ints are acceptable for float fields.`, starter: 'def validate(records, schema):\n    pass\n', tests: `schema = {'claim_id': int, 'amount': float}
recs = [{'claim_id': 1, 'amount': 10}, {'claim_id': 2, 'amount': '5'}, {'amount': 1.5}]
assert validate(recs, schema) == ['row 1: amount expected float, got str', 'row 2: missing claim_id'], validate(recs, schema)`, solution: `def validate(records, schema):
    errors = []
    for i, r in enumerate(records):
        for field, typ in schema.items():
            if field not in r:
                errors.append(f'row {i}: missing {field}')
                continue
            v = r[field]
            ok = isinstance(v, typ) or (typ is float and isinstance(v, int) and not isinstance(v, bool))
            if not ok:
                errors.append(f'row {i}: {field} expected {typ.__name__}, got {type(v).__name__}')
    return errors` }),
    py({ q: `Write a generator «moving_avg(values, k)» yielding the average of each window of the last «k» values once at least «k» have been seen.`, starter: 'def moving_avg(values, k):\n    pass\n', tests: `assert list(moving_avg([1, 2, 3, 4, 5], 3)) == [2.0, 3.0, 4.0]
assert list(moving_avg([1], 2)) == []`, solution: `from collections import deque

def moving_avg(values, k):
    win = deque(maxlen=k)
    total = 0
    for v in values:
        if len(win) == k:
            total -= win[0]
        win.append(v)
        total += v
        if len(win) == k:
            yield total / k` }),
    py({ q: `Stateful dedupe across batches: write a class «Deduper» with method «process(batch)» that returns only events whose «event_id» has not been seen in **any earlier or the current** batch (keep the first occurrence).`, starter: 'class Deduper:\n    def process(self, batch):\n        pass\n', tests: `d = Deduper()
assert [e['event_id'] for e in d.process([{'event_id': 1}, {'event_id': 2}, {'event_id': 1}])] == [1, 2]
assert [e['event_id'] for e in d.process([{'event_id': 2}, {'event_id': 3}])] == [3]`, solution: `class Deduper:
    def __init__(self):
        self.seen = set()

    def process(self, batch):
        out = []
        for e in batch:
            if e['event_id'] not in self.seen:
                self.seen.add(e['event_id'])
                out.append(e)
        return out` }),
    py({ q: `Parse log lines like «2026-11-25 02:14:07 ERROR claims_daily build_silver: AnalysisException ...» into dicts «{'ts', 'level', 'dag', 'task', 'msg'}». Skip lines that don't match. Write «parse_logs(lines)».`, starter: 'import re\n\ndef parse_logs(lines):\n    pass\n', tests: `lines = ['2026-11-25 02:14:07 ERROR claims_daily build_silver: AnalysisException: cannot resolve', 'garbage', '2026-11-25 02:00:01 INFO claims_daily extract: started']
r = parse_logs(lines)
assert len(r) == 2
assert r[0] == {'ts': '2026-11-25 02:14:07', 'level': 'ERROR', 'dag': 'claims_daily', 'task': 'build_silver', 'msg': 'AnalysisException: cannot resolve'}, r[0]`, solution: `import re

PAT = re.compile(r'^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) (\\w+) (\\S+) (\\S+): (.*)$')

def parse_logs(lines):
    out = []
    for ln in lines:
        m = PAT.match(ln)
        if m:
            ts, level, dag, task, msg = m.groups()
            out.append({'ts': ts, 'level': level, 'dag': dag, 'task': task, 'msg': msg})
    return out` }),
    py({ q: `SLA breaches: given rows «(sr_id, opened_at, closed_at)» with ISO timestamps (closed may be «None»), and «now», return the sr_ids open or resolved for **more than «hours»** hours. Write «breaches(rows, hours, now)».`, starter: 'from datetime import datetime\n\ndef breaches(rows, hours, now):\n    pass\n', tests: `rows = [(1, '2026-11-20 08:00:00', '2026-11-20 20:00:00'), (2, '2026-11-24 08:00:00', None), (3, '2026-11-20 08:00:00', '2026-11-22 09:00:00')]
assert breaches(rows, 24, '2026-11-25 09:00:00') == [2, 3]`, solution: `from datetime import datetime

def breaches(rows, hours, now):
    f = '%Y-%m-%d %H:%M:%S'
    now_dt = datetime.strptime(now, f)
    out = []
    for sr_id, opened, closed in rows:
        end = datetime.strptime(closed, f) if closed else now_dt
        if (end - datetime.strptime(opened, f)).total_seconds() > hours * 3600:
            out.append(sr_id)
    return out` }),
    py({ q: `Classic interview warm-up: «first_unique(s)» returns the first character that appears exactly once, or «None».`, starter: 'def first_unique(s):\n    pass\n', tests: `assert first_unique('leetcode') == 'l'
assert first_unique('aabb') is None
assert first_unique('aabcb') == 'c'`, solution: `from collections import Counter

def first_unique(s):
    c = Counter(s)
    for ch in s:
        if c[ch] == 1:
            return ch
    return None` }),
    py({ q: `Group anagrams: «group_anagrams(words)» returns a list of groups (each group sorted, groups sorted by first word).`, starter: 'def group_anagrams(words):\n    pass\n', tests: `assert group_anagrams(['pump', 'seal', 'ales', 'leas', 'mupp']) == [['ales', 'leas', 'seal'], ['mupp', 'pump']]`, solution: `from collections import defaultdict

def group_anagrams(words):
    g = defaultdict(list)
    for w in words:
        g[''.join(sorted(w))].append(w)
    return sorted((sorted(v) for v in g.values()), key=lambda grp: grp[0])` }),
  ]),
  set('bsp', 'spark', [
    spark({ q: `Customers with **no CRF**: use a «left_anti» join of «customers» to «crf». Return «customer_id, customer_name».`, starter: `customers = spark.table("customers")\ncrf = spark.table("crf")\n\nresult = None\n`, solution: `customers = spark.table("customers")
crf = spark.table("crf")
result = customers.join(crf, "customer_id", "left_anti").select("customer_id", "customer_name")` }),
    spark({ q: `CRFs per customer **segment** per month («yyyy-MM» of created_at). Columns: «segment, month, crfs».`, starter: `crf = spark.table("crf")\ncustomers = spark.table("customers")\n\nresult = None\n`, solution: `crf = spark.table("crf")
customers = spark.table("customers")
result = (crf.join(customers, "customer_id")
  .withColumn("month", F.date_format(F.to_timestamp("created_at"), "yyyy-MM"))
  .groupBy("segment", "month").agg(F.count("*").alias("crfs")))` }),
    spark({ q: `Latest inventory snapshot per (plant_id, part_id) using a window «max(snapshot_date)». Return «plant_id, part_id, qty_on_hand» from the latest snapshot of each pair.`, starter: `inv = spark.table("inventory")\n\nresult = None\n`, solution: `inv = spark.table("inventory")
w = Window.partitionBy("plant_id", "part_id")
result = (inv.withColumn("latest", F.max("snapshot_date").over(w))
  .filter(F.col("snapshot_date") == F.col("latest"))
  .select("plant_id", "part_id", "qty_on_hand"))` }),
    spark({ q: `Explode: a CRF note lists parts replaced as a comma-separated string. Count how often each part was replaced. Columns: «part, times».`, starter: `rows = [(1, "Oil Filter,Turbocharger"), (2, "Oil Filter"), (3, "Fuel Pump,Oil Filter,Seal Kit")]\nnotes = spark.createDataFrame(rows, ["crf_id", "parts"])\n\nresult = None\n`, solution: `rows = [(1, "Oil Filter,Turbocharger"), (2, "Oil Filter"), (3, "Fuel Pump,Oil Filter,Seal Kit")]
notes = spark.createDataFrame(rows, ["crf_id", "parts"])
result = (notes.select(F.explode(F.split("parts", ",")).alias("part"))
  .groupBy("part").agg(F.count("*").alias("times")))` }),
    spark({ q: `Running total of «claim_amount» per dealer ordered by «submitted_at» (rows frame). Columns: «dealer_id, claim_id, running_total» (2 decimals).`, starter: `claims = spark.table("claims")\n\nresult = None\n`, solution: `claims = spark.table("claims")
w = Window.partitionBy("dealer_id").orderBy("submitted_at", "claim_id").rowsBetween(Window.unboundedPreceding, Window.currentRow)
result = claims.select("dealer_id", "claim_id", F.round(F.sum("claim_amount").over(w), 2).alias("running_total"))` }),
    spark({ q: `Two plant extracts have the same columns in a different order. Combine them correctly with «unionByName» and count rows per plant. Columns: «plant, n».`, starter: `a = spark.createDataFrame([("Pune", "P1", 5), ("Pune", "P2", 2)], ["plant", "part", "qty"])\nb = spark.createDataFrame([("P1", 7, "Columbus")], ["part", "qty", "plant"])\n\nresult = None\n`, solution: `a = spark.createDataFrame([("Pune", "P1", 5), ("Pune", "P2", 2)], ["plant", "part", "qty"])
b = spark.createDataFrame([("P1", 7, "Columbus")], ["part", "qty", "plant"])
result = a.unionByName(b).groupBy("plant").agg(F.count("*").alias("n"))` }),
    spark({ q: `Impute missing temperatures: replace NULL «temperature_c» with that **engine's average** temperature (window avg), rounded to 1. Return «reading_id, engine_id, temp_filled» for the readings that were NULL.`, starter: `r = spark.table("sensor_readings")\n\nresult = None\n`, solution: `r = spark.table("sensor_readings")
w = Window.partitionBy("engine_id")
result = (r.withColumn("avg_t", F.avg("temperature_c").over(w))
  .filter(F.col("temperature_c").isNull())
  .select("reading_id", "engine_id", F.round("avg_t", 1).alias("temp_filled")))` }),
    spark({ q: `Using the SCD2 dimension: join **current** rows of «dim_customer_scd2» («is_current = 1») to CRF counts per customer. Columns: «customer_id, segment, crfs».`, starter: `dim = spark.table("dim_customer_scd2")\ncrf = spark.table("crf")\n\nresult = None\n`, solution: `dim = spark.table("dim_customer_scd2")
crf = spark.table("crf")
counts = crf.groupBy("customer_id").agg(F.count("*").alias("crfs"))
result = dim.filter(F.col("is_current") == 1).join(counts, "customer_id").select("customer_id", "segment", "crfs")` }),
  ]),
  set('bsc', 'design', [
    scenario('The Monday spike', `Every Monday the weekend backlog of dealer claims (3× normal volume) makes the 06:00 SLA slip to 09:30.`, [
      ['Most sustainable fix?', [
        ['Autoscale the job cluster on Mondays (or always, with a max), and process incrementally through the weekend so Monday has less backlog', true, 'Spread the work over time and let compute follow volume.'],
        ['Move the SLA to 10:00 permanently', false, 'Fix the system, not the promise, unless the business agrees.'],
        ['Drop weekend claims', false, 'Data loss.'],
      ]],
      ['How do you confirm it worked?', [
        ['Track run duration and completion time per weekday against the SLA, with an alert if it trends up', true, 'Measure the outcome you promised.'],
        ['Ask users if it feels faster', false, 'Anecdotes are not monitoring.'],
      ]],
    ]),
    scenario('PII found in the gold layer', `An analyst notices customer **phone numbers** in a gold table that 400 people can query.`, [
      ['First action?', [
        ['Restrict access immediately (revoke broad SELECT or apply a masking policy), then inform the data owner/privacy team', true, 'Contain first, then investigate. It is a potential privacy incident.'],
        ['Delete the table', false, 'Destroys evidence and breaks consumers. Contain with access controls.'],
        ['Wait until the next sprint', false, 'No.'],
      ]],
      ['Root-cause fix?', [
        ['Tag PII columns in the catalog, apply tag-based masking, drop/hash phone at silver unless a use case needs it, and add a PII scan to CI/quality checks', true, 'Prevent by design: minimise, tag, mask, detect.'],
        ['Tell analysts not to look at that column', false, 'Not a control.'],
      ]],
    ]),
    scenario('Two dashboards, two numbers', `Finance's dashboard shows **₹4.2 Cr** approved warranty for October; Service shows **₹3.9 Cr**. Both use gold tables.`, [
      ['Likely cause?', [
        ['Different metric definitions (approved vs credited, date basis, partial approvals) implemented separately in each dashboard', true, 'Metric drift comes from duplicated logic.'],
        ['Spark randomness', false, 'Spark is deterministic for the same input and logic.'],
      ]],
      ['Lasting fix?', [
        ['Agree one definition with both owners, implement it once in the semantic layer/gold metric, document it in the catalog, and point both dashboards at it', true, 'One governed definition, reused everywhere: that is the semantic-layer job.'],
        ['Average the two numbers', false, 'No.'],
      ]],
    ]),
    scenario('Source sends a full file instead of a delta', `The supplier portal usually sends daily **changes** (~20k rows). Today it sent a **full extract** (14M rows) under the same file name.`, [
      ['What protects you?', [
        ['A volume check that flags a 700× jump before publishing, and a MERGE-based load that stays correct even if a full file arrives', true, 'Volume anomaly detection plus idempotent MERGE turns this into a slow run, not a corrupt table.'],
        ['Appending blindly', false, 'You would insert 14M duplicates.'],
      ]],
      ['After loading safely, what else?', [
        ['Tell the source team, and agree in the data contract how full vs delta files are signalled (file naming / manifest)', true, 'Make the interface explicit so it can\'t happen silently again.'],
        ['Nothing', false, 'It will happen again.'],
      ]],
    ]),
    scenario('Kafka consumer lag keeps growing', `The telemetry lake-loader group has **6 consumers** on a **6-partition** topic. Lag grows ~2M messages/hour since a fleet expansion doubled traffic.`, [
      ['Why doesn\'t adding consumers help?', [
        ['Parallelism is capped by partitions: a 7th consumer would sit idle', true, 'One consumer per partition per group is the maximum.'],
        ['Consumers are too fast', false, 'They are too slow.'],
      ]],
      ['Best fix?', [
        ['Increase partitions (e.g. to 24) and scale consumers; also check per-message processing cost and batch writes', true, 'More partitions allow more parallel consumers. Note: key→partition mapping changes for new data.'],
        ['Reduce retention', false, 'That deletes unread data.'],
      ]],
    ]),
  ]),
  set('bbug', 'mixed', [
    bug('Counts per dealer look too low. Which line?', `SELECT d.dealer_name, COUNT(c.claim_id) AS claims
FROM dealers d
LEFT JOIN claims c ON c.dealer_id = d.dealer_id
WHERE c.status = 'Approved'
GROUP BY d.dealer_name;`, 4, `The WHERE on the right table removes dealers with no approved claims (NULL status), turning the LEFT JOIN into INNER. Move «c.status = 'Approved'» into the ON clause.`, 'sql'),
    bug('This incremental load misses rows that arrive during the run. Which line?', `wm = read_watermark("orders")
rows = extract(since=wm)
save_watermark("orders", datetime.now())
load(rows)`, 3, 'The watermark is set to "now" (not the max loaded updated_at) and before the load commits. Rows updated between extract and now are skipped forever. Save «max(updated_at)» of the loaded rows, after a successful load.'),
    bug('The window gives a running total, but the business wanted each claim\'s share of the dealer total. Which line?', `w = Window.partitionBy("dealer_id").orderBy("submitted_at")
claims = claims.withColumn("dealer_total", F.sum("claim_amount").over(w))
claims = claims.withColumn("share", F.col("claim_amount") / F.col("dealer_total"))`, 1, 'With orderBy, the default frame is "unbounded preceding to current row", which is a running total. For the full partition total, drop the orderBy: «Window.partitionBy("dealer_id")».'),
    bug('This retry helper hammers the API during an outage. Which line?', `def get(url):
    for attempt in range(10):
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            return r.json()
        time.sleep(1)
    raise RuntimeError("failed")`, 6, 'A fixed 1-second sleep retries 10× in 10 s from every worker at once. Use exponential backoff with jitter, and don\'t retry 4xx errors other than 429.'),
    bug('This dedupe keeps random versions. Which line?', `w = Window.partitionBy("order_id")
latest = (feed.withColumn("rn", F.row_number().over(w))
              .filter("rn = 1"))`, 1, 'row_number needs an ORDER BY to be meaningful: «Window.partitionBy("order_id").orderBy(F.desc("updated_at"), F.desc("ingested_at"))».'),
    bug('Writing gold creates 40,000 tiny files per day. Which line is the main cause?', `df = spark.table("silver.telemetry").filter(F.col("dt") == run_date)
df = df.repartition(200, "engine_id")
(df.write.mode("overwrite")
   .partitionBy("dt", "engine_id")
   .parquet("/lake/gold/telemetry"))`, 4, 'Partitioning folders by engine_id (high cardinality) creates one folder per engine per day, with files inside each. Partition by dt only, and cluster/Z-order by engine_id.'),
  ]),
  set('bcon', 'mixed', [
    mcq('The posting lists **Accumulo**. What is it?', ['A BI tool', 'A wide-column NoSQL store (like HBase) with cell-level security labels', 'A Python library', 'A Kafka connector'], 1, 'Apache Accumulo is BigTable-style storage with per-cell visibility labels. Useful where access must be controlled at a very fine level.', { topic: 'bigdata' }),
    mcq('Which statement about **HBase** is true?', ['It is a relational warehouse', 'It provides random, real-time read/write access by row key on top of HDFS', 'It only stores CSV', 'It replaces Kafka'], 1, '', { topic: 'bigdata' }),
    mcq('"Implements data governance processes for managing metadata, access, **retention**". Which is a retention control?', ['A GRANT statement', 'A lifecycle rule that moves files to archive after 1 year and deletes after 7', 'A star schema', 'A Spark UI'], 1, '', { topic: 'quality' }),
    mcq('"Develops **physical** data models". Which decision is physical (not logical)?', ['Customer has many CRFs', 'A claim has an amount', 'Partition fct_claims by claim_month and Z-order by dealer_key, stored as Delta', 'Dealer is an entity'], 2, '', { topic: 'model' }),
    mcq('Which is a **conceptual** model artefact?', ['CREATE TABLE statements', 'An entity-relationship sketch: Customer — raises — CRF — leads to — Claim', 'Parquet file sizes', 'Index definitions'], 1, '', { topic: 'model' }),
    mcq('"Event-based sources" in the posting most likely means…', ['Excel files', 'Streams of events such as Kafka/Event Hubs topics, webhooks or CDC change events', 'Monthly PDFs', 'Calendar invites'], 1, '', { topic: 'stream' }),
    mcq('"Unstructured" sources include…', ['A Postgres table', 'PDF manuals, technician free-text notes, images', 'A Parquet table', 'A star schema'], 1, '', { topic: 'ai' }),
    mcq('In Kanban, a **WIP limit** means…', ['A sprint length', 'A maximum number of items allowed in a stage at once, to keep flow moving', 'A story point budget', 'The number of developers'], 1, '', { topic: 'cloud' }),
    mcq('"Clustered compute cloud-based implementation" refers to…', ['Running code on one laptop', 'Running distributed workloads on a managed cluster in the cloud (Databricks, EMR, Synapse Spark, HDInsight)', 'Using Excel online', 'GitHub Codespaces'], 1, '', { topic: 'cloud' }),
    mcq('"Quality Assurance Metrics" (a posting competency) for a data product could be…', ['Number of meetings', '% of runs meeting the freshness SLA, DQ test pass rate, defects found after release, reconciliation variance', 'Lines of code', 'Number of dashboards'], 1, '', { topic: 'quality' }),
    mcq('"Solution Validation Testing" for a new gold table mostly means…', ['Checking the code compiles', 'Validating it meets requirements: reconciliation with source, business UAT, edge cases, performance', 'Writing documentation', 'Choosing colours'], 1, '', { topic: 'cloud' }),
    mcq('Why might a role "require licensing for compliance with **export controls**"?', ['Because of the salary', 'Some engineering/technical data is legally controlled by country, so access depends on regulations and licences', 'Because Spark is American', 'It is a formality only'], 1, '', { topic: 'quality' }),
    mcq('Data-as-a-Product: which is the best signal a data product is "discoverable"?', ['It is in someone\'s notebook', 'It is registered in the catalog with a clear name, description, owner and search tags', 'It has a long table name', 'It is in a shared drive'], 1, '', { topic: 'quality' }),
    mcq('"Certified data product" typically requires…', ['Only a nice name', 'Documented definitions, owner, tests passing, SLA, approved review and governed access', 'Being the newest table', 'Over 1M rows'], 1, '', { topic: 'quality' }),
    mcq('Preparing **AI-ready** data most directly involves…', ['Adding colours', 'Clean, well-described, point-in-time correct, governed datasets plus semantic definitions and curated knowledge assets', 'Deleting metadata', 'Exporting to Excel'], 1, '', { topic: 'ai' }),
    mcq('A semantic model in the posting\'s sense is closest to…', ['A Python class', 'Governed business definitions of metrics and relationships reused by BI and AI', 'A Kafka topic', 'A Docker image'], 1, '', { topic: 'ai' }),
    mcq('Which is NOT typically a responsibility of a DE1?', ['Building and testing pipelines from a design', 'Monitoring and fixing data quality issues', 'Setting company-wide data strategy alone', 'Documenting datasets'], 2, '', { topic: 'interview' }),
    mcq('"Large file movement for a cloud-based environment": the best way to move 500 GB nightly is…', ['Single-stream upload', 'Parallel multipart transfer with checksums and atomic publish', 'Email attachments', 'Printing'], 1, '', { topic: 'cloud' }),
    mcq('IoT data usually arrives as…', ['Monthly batches only', 'High-frequency time-series events, sometimes late or out of order', 'Excel files', 'Images only'], 1, '', { topic: 'stream' }),
    mcq('Which SQL clause filters **after** aggregation?', ['WHERE', 'HAVING', 'ON', 'LIMIT'], 1, '', { topic: 'sql1' }),
    mcq('What does «COALESCE(a, b, c)» return?', ['The sum', 'The first non-NULL argument', 'The last argument', 'NULL always'], 1, '', { topic: 'sql1' }),
    mcq('Which join returns only left rows that have a match, without duplicating them?', ['INNER', 'LEFT', 'SEMI (EXISTS)', 'FULL'], 2, '', { topic: 'sql1' }),
    mcq('ROWS vs RANGE frame: with duplicate ORDER BY values, RANGE…', ['Ignores ties', 'Treats tied rows as peers in the same frame', 'Errors', 'Sorts randomly'], 1, '', { topic: 'sql2' }),
    mcq('In Python, which is O(1) on average?', ['x in list', 'x in set', 'list.index(x)', 'sorted(list)'], 1, '', { topic: 'python' }),
    mcq('What does «yield» do?', ['Ends the program', 'Turns a function into a generator that produces values lazily', 'Raises an error', 'Imports a module'], 1, '', { topic: 'python' }),
    mcq('Which file format is splittable and columnar?', ['gzip CSV', 'Parquet', 'JSON lines (gzip)', 'XLSX'], 1, '', { topic: 'pipes' }),
    mcq('Grain of a fact table means…', ['Its file size', 'What exactly one row represents', 'Its number of columns', 'Its partition key'], 1, '', { topic: 'model' }),
    mcq('Which Spark config sets partitions after a shuffle?', ['spark.executor.memory', 'spark.sql.shuffle.partitions', 'spark.driver.cores', 'spark.app.name'], 1, '', { topic: 'spark' }),
    mcq('Broadcast join is chosen automatically when the smaller side is below…', ['spark.sql.autoBroadcastJoinThreshold', 'spark.sql.shuffle.partitions', 'spark.default.parallelism', 'spark.memory.fraction'], 0, '', { topic: 'spark' }),
    mcq('Kafka consumer offsets are stored…', ['In the producer', 'Per consumer group (in an internal Kafka topic)', 'In HDFS', 'Nowhere'], 1, '', { topic: 'stream' }),
    mcq('The CAP theorem\'s "P" stands for…', ['Performance', 'Partition tolerance', 'Persistence', 'Parallelism'], 1, '', { topic: 'bigdata' }),
    mcq('Which Airflow feature waits for a file to land before continuing?', ['XCom', 'Sensor', 'Pool', 'Variable'], 1, '', { topic: 'pipes' }),
    mcq('dbt «unique» and «not_null» are examples of…', ['Materializations', 'Data tests', 'Sources', 'Macros'], 1, '', { topic: 'pipes' }),
    mcq('Lineage helps most with…', ['Faster CPUs', 'Impact and root-cause analysis', 'Lower salaries', 'Compression'], 1, '', { topic: 'quality' }),
    mcq('100 million rows/day is about how many rows per second on average?', ['~120', '~1,200', '~12,000', '~120,000'], 1, '', { topic: 'scale' }),
    mcq('Why add **jitter** to retry backoff?', ['To make logs prettier', 'So many clients don\'t retry at exactly the same instant (thundering herd)', 'To slow down Spark', 'It is required by HTTP'], 1, '', { topic: 'scale' }),
    mcq('A dead-letter queue is for…', ['Deleted users', 'Messages that repeatedly fail processing, kept for inspection without blocking the stream', 'Old Kafka versions', 'Backups'], 1, '', { topic: 'scale' }),
    tf('Hadoop MapReduce writes intermediate results to disk between steps.', true, '', { topic: 'bigdata' }),
    tf('A Delta table can be read as plain Parquet files, but you would miss uncommitted/removed-file information from the transaction log.', true, '', { topic: 'bigdata' }),
    tf('Snowflake and Databricks both separate storage and compute.', true, '', { topic: 'cloud' }),
    tf('An SCD Type 1 dimension preserves history.', false, '', { topic: 'model' }),
    tf('A schema registry helps producers and consumers agree on message formats.', true, '', { topic: 'stream' }),
    tf('It is fine to store secrets in a Git repo if the repo is private.', false, 'Private repos get cloned, forked and leaked. Use a vault.', { topic: 'tools' }),
    match('Match the posting competency to an example behaviour.', [
      ['Customer focus', 'Clarifying what decision a dashboard supports before building it'],
      ['Decision quality', 'Choosing a reversible v1 with documented risks'],
      ['Solution documentation', 'A runbook and catalog docs for a new pipeline'],
      ['Values differences', 'Adapting communication for US and India colleagues'],
    ], '', ),
    match('Match the storage engine named in the posting.', [
      ['Data lake', 'Files on object storage'], ['HBase', 'Row-key random access on HDFS'], ['Cassandra', 'High-throughput writes, partition + clustering keys'], ['DynamoDB', 'Serverless key-value on AWS'],
    ]),
    order('Order a typical batch data-product pipeline.', ['Ingest from source', 'Land raw (bronze)', 'Validate and clean (silver)', 'Model and aggregate (gold)', 'Publish to catalog and consumers', 'Monitor and alert']),
    fill('What is the default value of «spark.sql.shuffle.partitions»?', ['200'], 'AQE may coalesce them at runtime.', { topic: 'spark' }),
    fill('Name the Spark function used to keep the latest row per key with a window: «F.______()».', ['row_number', 'row_number()'], '', { topic: 'spark' }),
  ]),
  set('btalk', 'interview', [
    talk('*"What is the difference between a data lake, a warehouse and a lakehouse?"*', `
      - **Lake**: cheap object storage with files of any format; flexible, schema-on-read; risk of a swamp without governance.
      - **Warehouse**: structured tables, SQL, managed storage, strong governance and performance; less flexible for raw/unstructured data.
      - **Lakehouse**: lake storage + open table format (Delta/Iceberg) adding ACID, schema enforcement, time travel and warehouse-grade SQL on the same files.
      - Mention when you'd use each, and that most enterprises combine them.
    `, 'design'),
    talk('*"Explain how Spark executes a job."*', `
      - Your code builds a **logical plan** lazily; on an **action**, Catalyst optimises it into a **physical plan**.
      - The plan is split into **stages** at shuffle boundaries (wide transformations); each stage has one **task per partition**.
      - The **driver** schedules tasks on **executors**; narrow ops are pipelined within a stage; shuffle data is written and read between stages.
      - AQE can re-plan at runtime. Results are returned or written.
    `, 'design'),
    talk('*"How do you ensure data quality in a pipeline?"*', `
      - Define expectations with consumers (contract): schema, rules, SLA.
      - Tests at each layer: schema, nulls, uniqueness, referential integrity, ranges, accepted values, freshness, volume, reconciliation with source.
      - Severity: block, warn or quarantine. Never silently drop.
      - Monitoring and alerts; lineage for root cause; incident process; publish quality metrics in the catalog.
      - Your example: SOQL reconciliation of CRM Analytics KPIs, now automated.
    `, 'design'),
    talk('*"How would you design an incremental load for a table with 500M rows?"*', `
      - Identify change detection: CDC, reliable updated_at, or snapshot diff.
      - Extract only changes since the watermark (with a small overlap); land in bronze.
      - Dedupe changes to one row per key (latest), then MERGE into the target on the business key; handle deletes (soft delete).
      - Advance the watermark only after a successful commit; make the run idempotent.
      - Partition/cluster the target for MERGE efficiency; periodic full reconciliation; monitoring.
    `, 'design'),
    talk('*"Tell me about a time you made a mistake."*', `
      - Pick a real, moderate mistake (e.g. a dashboard metric that double-counted because of a join, found by a stakeholder).
      - Own it, show the fix (root cause, corrected logic, validation), the communication, and the **prevention** (a validation step you now always run).
      - End with what you learned. Never blame others, never pick something trivial or catastrophic.
    `, 'hr'),
    talk('*"Where do you see yourself in 3 years?"*', `
      - Growing from DE1 to owning production data products end to end; deeper in Spark/streaming/cloud architecture; mentoring newer engineers.
      - Connected to the team: domain expertise in supply chain/quality/warranty data, and building AI-ready data products.
      - Keep it ambitious but anchored in this role.
    `, 'hr'),
    talk('*"Why should we hire you over a fresh graduate with strong Spark projects?"*', `
      - You bring **production context**: real enterprise data, real stakeholders, sign-offs, validation discipline, and Cummins domain familiarity (service, warranty, claims flows).
      - You have the **engineering foundations** too: SQL, Python, PySpark, data modelling, plus your projects.
      - You ramp faster: you already know the business processes and the data's quirks.
      - Be confident, not dismissive of graduates.
    `, 'hr'),
    talk('*"How would you explain a data pipeline to a non-technical manager?"*', `
      - Analogy: a water treatment plant. Raw water from sources (systems) is collected (ingestion), filtered and cleaned (quality checks, silver), treated to a standard (modelling, gold), and piped to homes (dashboards, apps). Sensors monitor quality and flow (monitoring/alerts).
      - Tie to their outcome: "it means your claims dashboard is correct and ready at 6 AM every day."
    `, 'hr'),
  ]),
];
