const { T, mcq, tf, multi, scenario, talk, sql, py, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== Reconciliation
  recon: T(`
    > **In one line:** reconciliation **proves** that data at the destination matches the source (or that two systems agree) by comparing **counts, sums, keys and hashes**, automatically, after every load. It turns "I think it's right" into "here is the evidence".

    ## Why it exists
    Pipelines fail silently: a filter drops rows, a join loses unmatched keys, a watermark gap skips records, a cast nulls values, a re-run doubles a day. Tests on the destination alone cannot see what never arrived. Only comparing with the source can. Finance, audit and regulated industries require it.

    ## Levels of reconciliation (cheap to thorough)
    | Level | What you compare | Catches | Cost |
    |---|---|---|---|
    | **Row counts** | Rows per day/partition, source vs target | Missing or duplicated loads | Very low |
    | **Control totals** | SUM of key measures (amount, qty) per partition | Value changes, partial loads, wrong signs | Low |
    | **Key sets** | Which keys exist on each side (anti-joins) | Exactly which records are missing or extra | Medium |
    | **Row hashes** | Hash of important columns per key | Silent value changes on matching keys | Higher |
    | **Distribution checks** | Counts per status/region, min/max, NULL rates | Mapping errors, code changes | Low |
    | **Cross-system business checks** | Claims approved in CRM vs credit notes in ERP | Process breaks between systems | Medium |

    ## How to do it right
    1. **Same cut-off:** compare the source *as of the extraction time* (or the extract file's control totals), not the live source at a later time.
    2. **Same scope and rules:** apply the same filters, exclusions and deduplication on both sides, or reconcile at each layer (source → bronze is "did we receive everything?"; bronze → silver is "did we keep or deliberately reject everything?").
    3. **Account for rejects:** «source = loaded + quarantined + deliberately filtered». Every row must be in exactly one bucket.
    4. **Tolerance:** exact for counts and money; small tolerance for floating-point measures; in-flight allowance for streaming.
    5. **Automate and alert:** run after each load; fail or warn by severity; keep the results table for trends and audit.
    6. **Drill down:** when totals differ, compare by day, then by key, to find the exact records.

    ## Control files
    Many enterprise file feeds include a **trailer or manifest** with row count and control totals ("1,203 rows, total 4,512,330.25"). Validate the file against it before loading; mismatch → reject the whole file (partial or corrupted transfer).

    ## Edge cases and what goes wrong
    - Comparing at different times and chasing "differences" that are just new data.
    - Timezone boundaries: source counts by local day, target by UTC day.
    - Soft-deleted rows counted on one side, excluded on the other.
    - Duplicates in the target offset by missing rows: **counts match, data is wrong**. Key-level comparison catches it; counts alone do not.
    - Floating-point sums differing in the 10th decimal: round or use DECIMAL.
    - Reconciling against a source that itself is wrong: reconciliation proves consistency, not truth.

    ## How interviewers test this
    - "How do you know your load is complete?" Counts, sums, key sets per partition with the same cut-off, rejects accounted for.
    - "Counts match but the business says numbers are wrong. How?" Duplicates offset by missing rows; value changes; key-level and hash comparison.
  `, {
    check: [
      mcq('Source has 1,000 rows; target has 1,000 rows. Can the target still be wrong?', ['No, counts match', 'Yes: e.g. 20 duplicates and 20 missing rows cancel out, or values changed on matching keys', 'Only if the source is wrong', 'Only for streaming'], 1, 'Counts are necessary, not sufficient. Compare keys and hashes for important data.'),
      mcq('After a load: source 10,000 rows, silver 9,940, quarantine 60. Is it reconciled?', ['No, 60 rows are missing', 'Yes, if the 60 quarantined rows are accounted for: source = loaded + quarantined', 'Only if quarantine is empty', 'Cannot tell'], 1, 'Every source row must be in exactly one bucket.'),
      tf('A file whose trailer says 1,203 rows but contains 1,180 should be loaded anyway and fixed later.', false, 'Reject the file: it is likely a partial or corrupted transfer.'),
    ],
    hands: [
      sql({ q: '**Daily reconciliation report.** Compare, per day of «updated_at», the number of **distinct orders** that had a status event in the raw feed («source_orders») with the number of **deduplicated events** («events_after_dedupe»: distinct (order_id, status, updated_at)) and the **duplicates removed** (raw rows minus deduplicated rows). Return «day, raw_events, events_after_dedupe, duplicates_removed», sorted by day.', tables: ['raw_orders_feed'], level: 3,
        solution: `SELECT date(updated_at) AS day,
       COUNT(*) AS raw_events,
       COUNT(DISTINCT order_id || '|' || status || '|' || updated_at) AS events_after_dedupe,
       COUNT(*) - COUNT(DISTINCT order_id || '|' || status || '|' || updated_at) AS duplicates_removed
FROM raw_orders_feed
GROUP BY date(updated_at)
ORDER BY day;`,
        hint: 'Count distinct composite keys by concatenating with a separator: order_id || \'|\' || status || \'|\' || updated_at.' }),
    ],
  }),

  // ================================================================== Schema validation
  schemaval: T(`
    > **In one line:** schema validation checks, **at the boundary**, that incoming data has the expected **columns, types, nullability and formats** before it flows further, so bad structure fails fast and visibly instead of spreading silently.

    ## What to validate
    | Check | Example |
    |---|---|
    | Required columns present | claim_id, dealer_id, claim_amount exist |
    | No unexpected columns (or capture them) | New field «warranty_type» → rescued column + notice |
    | Types / parseability | claim_amount parses as DECIMAL; submitted_at parses as timestamp |
    | Nullability | claim_id NOT NULL |
    | Formats | dealer_code matches «^D-\\d{3}$»; email pattern; ISO dates |
    | Allowed values (enums) | status ∈ {Submitted, Approved, Partially Approved, Rejected} |
    | Ranges | claim_amount ≥ 0; temperature between −50 and 200 °C |
    | File-level | Header row matches; row count matches trailer; encoding is UTF-8 |

    Strictly, the first few are **schema** checks and the rest are **data quality** checks; in practice they run together at the boundary.

    ## Where and how
    - **Ingestion (bronze → silver):** enforce an explicit schema (do not infer in production). Spark: read with a defined schema and mode; Auto Loader with schema hints and rescued data; Delta schema enforcement on write.
    - **Streaming:** schema registry rejects incompatible producers; consumers validate payloads.
    - **Tools:** Great Expectations, Soda, dbt tests, Delta constraints («CHECK (claim_amount >= 0)», «NOT NULL»), pandera, JSON Schema.

    ## What to do with failures: the three policies
    | Policy | Behaviour | Use when |
    |---|---|---|
    | **Fail fast** | Stop the load | Structural breaks: missing required column, wrong file, broken contract |
    | **Quarantine (dead-letter)** | Load good rows, route bad rows with a reason to a quarantine table, alert | Row-level issues: a few bad values |
    | **Permissive / coerce** | Set bad values to NULL and continue | Almost never for important fields: it hides problems |
    Spark read modes map to these: «FAILFAST», «DROPMALFORMED» (silently drops, dangerous), «PERMISSIVE» (nulls + «_corrupt_record» column: combine with quarantine).

    ## Edge cases and what goes wrong
    - **Inference in production** changes the schema when the data changes.
    - **PERMISSIVE without checking «_corrupt_record»** = silent NULLs.
    - **DROPMALFORMED** silently loses rows; counts no longer reconcile.
    - **Thresholds:** 1 bad row in a million → quarantine and continue; 30% bad → probably a structural change: fail. Set a rejection-rate threshold.
    - **Validation that only runs in dev.** It must run on every production load.

    ## How interviewers test this
    - "How do you handle bad records?" Explicit schema, quarantine with reason, rejection-rate threshold, alerts, fail fast on structural breaks.
    - "Spark read modes?" FAILFAST, DROPMALFORMED, PERMISSIVE and when each is acceptable.
  `, {
    check: [
      mcq('Which Spark CSV read mode silently loses malformed rows?', ['FAILFAST', 'PERMISSIVE', 'DROPMALFORMED', 'All of them'], 2, 'Use PERMISSIVE with a corrupt-record column routed to quarantine, or FAILFAST for strict feeds.'),
      mcq('0.01% of rows have an unparseable amount. Best policy?', ['Fail the whole load', 'Quarantine those rows with a reason, load the rest, alert, and fail only if the rejection rate exceeds a threshold', 'Set amounts to 0', 'Ignore it'], 1, 'Row-level problems go to quarantine; structural problems fail fast.'),
      tf('Inferring the schema on every production run is a safe way to handle changing sources.', false, 'Inference changes silently with the data. Use explicit schemas and detect drift deliberately.'),
    ],
    hands: [
      py({ q: 'Write «validate(rows)» for a claims feed. Each row is a dict. Return «(good, bad)»: «bad» items are «(row, reason)» tuples. Rules, checked **in this order** (first failure is the reason): missing or empty «claim_id» → «"missing claim_id"»; «claim_amount» not a number (int/float, not bool) → «"bad amount"»; «claim_amount < 0» → «"negative amount"»; «status» not in «{"Submitted", "Approved", "Partially Approved", "Rejected"}» → «"bad status"».', starter: 'def validate(rows):\n    pass\n',
        tests: `rows = [{'claim_id': 1, 'claim_amount': 100.0, 'status': 'Approved'},
        {'claim_id': None, 'claim_amount': 5, 'status': 'Approved'},
        {'claim_id': 3, 'claim_amount': '12', 'status': 'Approved'},
        {'claim_id': 4, 'claim_amount': -1, 'status': 'Approved'},
        {'claim_id': 5, 'claim_amount': 10, 'status': 'Pending'},
        {'claim_id': 6, 'claim_amount': True, 'status': 'Approved'},
        {'claim_id': '', 'claim_amount': 1, 'status': 'Approved'}]
good, bad = validate(rows)
assert good == [rows[0]], good
assert [r for _, r in bad] == ['missing claim_id', 'bad amount', 'negative amount', 'bad status', 'bad amount', 'missing claim_id'], bad
assert validate([]) == ([], [])`,
        solution: `STATUSES = {'Submitted', 'Approved', 'Partially Approved', 'Rejected'}

def validate(rows):
    good, bad = [], []
    for r in rows:
        amt = r.get('claim_amount')
        if r.get('claim_id') in (None, ''):
            bad.append((r, 'missing claim_id'))
        elif isinstance(amt, bool) or not isinstance(amt, (int, float)):
            bad.append((r, 'bad amount'))
        elif amt < 0:
            bad.append((r, 'negative amount'))
        elif r.get('status') not in STATUSES:
            bad.append((r, 'bad status'))
        else:
            good.append(r)
    return good, bad` }),
    ],
  }),

  // ================================================================== Data contracts
  contracts: T(`
    > **In one line:** a **data contract** is a written, versioned, **testable agreement** between a data producer and its consumers about a dataset: schema, meaning, quality, freshness, ownership and how changes happen. It moves data quality **upstream**, to where data is created.

    ## The problem it solves
    The data team is usually downstream of application teams who change their systems without knowing a pipeline depends on them. Every rename, type change or new status code breaks analytics, discovered days later by an angry stakeholder. Contracts make the dependency **explicit** and **enforced** at the producer's deploy time.

    ## What a contract contains
    «««yaml
    dataset: crm.claims_events
    version: 2.1.0
    owner: crm-platform-team (producer) / data-eng-claims (consumer contact)
    description: One event per claim state change, emitted on commit.
    schema:
      claim_id:      {type: string, required: true, unique_per: [event_id]}
      event_id:      {type: string, required: true, unique: true}
      status:        {type: string, enum: [Submitted, Approved, Partially Approved, Rejected]}
      claim_amount:  {type: decimal(12,2), required: true, min: 0, unit: INR, excludes_tax: true}
      submitted_at:  {type: timestamp, timezone: UTC}
    quality:
      - null_rate(dealer_id) < 0.1%
    freshness: events available within 5 minutes of commit (p95)
    delivery: Kafka topic claims.events.v2, Avro, keyed by claim_id
    change_policy: additive changes any time; breaking changes need a new major version and 30 days of parallel run
    pii: none
    »»»

    ## How contracts are enforced
    - **At the producer, in CI:** schema compatibility checks (schema registry rules, contract tests) fail the producer's build if they break the contract.
    - **At the boundary, at runtime:** consumers validate incoming data against the contract; violations quarantine and alert the **producer's** on-call too.
    - **Versioning:** breaking changes = new major version (new topic/table), run in parallel, consumers migrate, old version retired.
    - **Catalog:** contracts published where consumers find them.

    ## Contracts vs schemas vs SLAs
    - A **schema** is only structure. A **contract** adds semantics, quality rules, freshness, ownership and change process.
    - An **SLA** is one part of a contract (the service promise: freshness, availability).

    ## Trade-offs
    - **Pros:** fewer surprise breakages, clear ownership, faster debugging, enables data products and data mesh.
    - **Cons:** organisational effort; producers must agree to obligations; over-specifying everything slows teams. Start with the critical datasets.

    ## Edge cases and what goes wrong
    - **Contract on paper only:** not tested in CI, so it drifts from reality.
    - **Semantic changes** pass schema checks (amount now excludes tax). Contracts must document meaning, and changes in meaning are breaking.
    - **Consumer-defined contracts** the producer never agreed to have no force.
    - **Too strict enums** block legitimate new statuses; define how new values are introduced.

    ## How interviewers test this
    - "What is a data contract?" Agreement + enforcement + versioning, with an example.
    - "How would you stop upstream schema changes from breaking your pipelines?" Contracts, schema registry compatibility, CI checks on the producer side, validation and quarantine on the consumer side, lineage for impact.
  `, {
    check: [
      mcq('What makes a data contract more than a schema?', ['It is longer', 'It also covers meaning, quality rules, freshness, ownership and the change process, and is enforced', 'It uses YAML', 'It replaces tests'], 1, 'Structure is only one part of the agreement.'),
      mcq('Where is the most effective place to catch a breaking change to a contracted dataset?', ['In the dashboard a week later', 'In the producer\'s CI pipeline, before their change is deployed', 'In the monthly review', 'In the data scientist\'s notebook'], 1, 'Shift left: block the change before it reaches production.'),
      tf('A change that keeps the column name and type but changes its meaning is a breaking change.', true, 'Semantic changes silently break consumers; treat them as a new version.'),
    ],
    interview: [
      talk('Upstream teams keep breaking your pipelines with unannounced changes. What do you do?', `
        - **Short term:** schema validation at ingestion that fails or quarantines loudly; alerts that include the producing team; lineage to see impact quickly.
        - **Process:** agree **data contracts** for the critical datasets: schema, semantics, quality, freshness, owner, change policy (additive anytime, breaking = new version with a parallel run).
        - **Enforcement:** schema registry compatibility rules / contract tests in the **producer's CI**, so incompatible changes fail their build.
        - **Relationship:** shared channel, the producer's on-call gets contract-violation alerts, review of incidents together.
        - **Measure:** count of contract breaks over time; prove the improvement.`),
    ],
  }),

  // ================================================================== Data quality dimensions
  dqdims: T(`
    > **In one line:** data quality is measured along **dimensions**: **completeness, validity, accuracy, consistency, uniqueness, timeliness** (and integrity). Each needs different checks. "Good quality" means "fit for its intended use", so thresholds come from consumers.

    ## The dimensions with concrete checks
    | Dimension | Question | Example check (claims) |
    |---|---|---|
    | **Completeness** | Is everything there? | No NULL dealer_id; today's row count within ±20% of the same weekday average; every source key arrived |
    | **Validity** | Does it follow the rules/format? | status in allowed list; amount ≥ 0; dates parse; codes match pattern |
    | **Accuracy** | Does it reflect reality? | Sample matches source documents; amounts agree with ERP credit notes |
    | **Consistency** | Does it agree with itself and other systems? | approved_amount ≤ claim_amount; dealer region same in CRM and warehouse; totals equal across layers |
    | **Uniqueness** | Is each thing recorded once? | One row per claim_id |
    | **Timeliness / freshness** | Is it recent enough? | max(updated_at) within 2 hours; load finished by 06:00 |
    | **Integrity (referential)** | Do relationships hold? | Every claim's dealer exists in dim_dealer |

    ## Checks you implement, by type
    - **Rule checks (deterministic):** not null, unique, accepted values, ranges, regex, referential integrity, cross-column rules.
    - **Statistical checks (anomaly detection):** volume vs history, NULL-rate change, distribution shift (mean/percentiles of amount), new category values appearing, schema drift. These catch problems you did not think to write rules for.
    - **Reconciliation:** source vs target counts/sums.

    ## Severity and action
    | Severity | Example | Action |
    |---|---|---|
    | **Blocker** | Duplicate primary keys in gold; 0 rows loaded | Fail the pipeline; do not publish |
    | **Error** | 2% of claims with unknown dealer | Quarantine rows, publish rest, alert owner |
    | **Warning** | Volume 25% below normal on a holiday | Notify, investigate, continue |
    Tie severities to **consumer impact**: what decision breaks if this is wrong?

    ## Where checks run
    - **On ingest:** schema, validity (quarantine).
    - **After transform:** uniqueness, integrity, consistency, reconciliation.
    - **Before publish (gate):** blockers must pass ("write-audit-publish": write to staging, audit, then publish).
    - **Continuously:** freshness and volume monitors on all important tables.

    ## Measuring quality over time
    Keep check results in a table: dataset, check, pass/fail, failing rows, timestamp. Report **quality scores** per dataset; show them in the catalog next to certified products. The posting mentions **quality assurance metrics and KPIs**: this is what they mean.

    ## Edge cases and what goes wrong
    - **Tests that never fail** (thresholds too loose) give false confidence.
    - **Alert fatigue:** hundreds of warnings nobody reads. Fewer, meaningful checks with owners.
    - **Holidays and seasonality** trigger volume alerts; compare with the same weekday or use seasonal baselines.
    - **Checking only the latest batch** misses slow drift; track trends.
    - **Accuracy is hard to automate**; sample audits against source documents still matter.

    ## How interviewers test this
    - "What data quality dimensions do you know? Give a check for each." Use the table.
    - "How do you decide whether a failed check stops the pipeline?" Severity by consumer impact; quarantine vs fail; write-audit-publish.
  `, {
    check: [
      match('Match the check to its quality dimension.', [['One row per claim_id', 'Uniqueness'], ['status in the allowed list', 'Validity'], ['Data loaded within 2 hours of events', 'Timeliness'], ['Every claim\'s dealer exists in dim_dealer', 'Integrity'], ['approved_amount ≤ claim_amount', 'Consistency']], 'Different dimensions need different checks.'),
      mcq('Which check catches a problem you did not think to write a rule for?', ['NOT NULL', 'Accepted values', 'Statistical anomaly detection on volume and distributions', 'Primary key'], 2, 'Rules catch known failure modes; anomaly detection catches unknown ones.'),
      tf('"Write-audit-publish" means writing to a staging location, running quality checks, and only then publishing to consumers.', true, 'Bad data never reaches consumers if blockers fail.'),
      mcq('A volume check fires every public holiday. Best fix?', ['Delete the check', 'Compare against a seasonal baseline (same weekday, holiday calendar) or adjust thresholds by calendar', 'Ignore alerts on holidays manually', 'Make the threshold 100%'], 1, 'Reduce false positives without losing protection.'),
    ],
    hands: [
      sql({ q: '**A data quality report** for «claims» in one query. Return one row with: «total», «null_dealer» (rows with NULL dealer_id), «negative_amount» (claim_amount < 0), «approved_over_claimed» (approved_amount > claim_amount), «bad_status» (status not in the four allowed values), and «orphan_dealer» (dealer_id not found in dealers).', tables: ['claims', 'dealers'], level: 3,
        solution: `SELECT COUNT(*) AS total,
       SUM(CASE WHEN c.dealer_id IS NULL THEN 1 ELSE 0 END) AS null_dealer,
       SUM(CASE WHEN c.claim_amount < 0 THEN 1 ELSE 0 END) AS negative_amount,
       SUM(CASE WHEN c.approved_amount > c.claim_amount THEN 1 ELSE 0 END) AS approved_over_claimed,
       SUM(CASE WHEN c.status NOT IN ('Submitted', 'Approved', 'Partially Approved', 'Rejected') THEN 1 ELSE 0 END) AS bad_status,
       SUM(CASE WHEN c.dealer_id IS NOT NULL AND d.dealer_id IS NULL THEN 1 ELSE 0 END) AS orphan_dealer
FROM claims c
LEFT JOIN dealers d ON d.dealer_id = c.dealer_id;`,
        hint: 'One pass: LEFT JOIN dealers, then SUM(CASE WHEN … THEN 1 ELSE 0 END) for each check.' }),
    ],
  }),

  // ================================================================== Error handling
  errors: T(`
    > **In one line:** good error handling decides, for every kind of failure, whether to **retry, skip and quarantine, or stop**, and makes sure the failure is **visible, explained and recoverable** without corrupting data.

    ## Classify errors first
    | Class | Examples | Right response |
    |---|---|---|
    | **Transient** | Network timeout, HTTP 429/503, lock timeout, spot node lost | Retry with exponential backoff + jitter, bounded attempts |
    | **Data (row-level)** | Unparseable value, missing required field in one record | Quarantine the row with a reason, continue, alert on rate |
    | **Data (structural)** | Missing column, wrong file, contract broken, 0 rows | Fail fast, do not publish, alert owner |
    | **Configuration / code** | Bad credentials, wrong path, bug, permission denied | Fail fast (retrying will not help), alert |
    | **Resource** | Out of memory, disk full, quota exceeded | Fail, alert; fix sizing; maybe retry on a larger cluster |
    | **Upstream not ready** | File not arrived, upstream job late | Wait (sensor) with timeout, then alert |
    Retrying a permanent error just delays the alert and wastes money.

    ## Principles
    1. **Fail loudly, never silently.** A swallowed exception («except: pass») is the worst bug in data engineering.
    2. **Fail before publishing.** Partial results must never reach consumers.
    3. **Make recovery a re-run.** Idempotent steps mean the fix is "correct the cause, re-run".
    4. **Preserve evidence.** Keep the raw input, the failing rows, the error message, the run ID, the code version.
    5. **Context in alerts:** what failed, which step, which run/date, error summary, link to logs, runbook link, owner. "Job failed" is not an alert.
    6. **Bounded everything:** timeouts on calls and sensors, max retries, max rejection rate.
    7. **Clean up:** temp files, locks, half-written staging tables.

    ## Patterns
    - **try / except around external calls** with specific exception types; re-raise unknown errors.
    - **Quarantine / dead-letter tables** for bad records (with reason, raw payload, run ID).
    - **Circuit breaker:** stop calling a failing dependency for a while instead of hammering it.
    - **Checkpoints:** long jobs resume from the last completed unit.
    - **Compensation:** undo side effects of a failed multi-step process (delete staged files, revert a pointer).

    ## Edge cases and what goes wrong
    - **Error inside the error handler** (e.g. writing to quarantine fails) hides the original error. Log first.
    - **Catch-all that converts failures to empty results:** an API client returns «[]» on error; the pipeline loads zero rows "successfully".
    - **Retries on non-idempotent operations** duplicate side effects.
    - **Partial batch success** with no record of which items succeeded; re-run duplicates or skips.
    - **Timeout on commit:** unknown whether it succeeded; check before retrying.

    ## How interviewers test this
    - "Your pipeline calls a flaky API. How do you handle errors?" Classify, retry transient with backoff + jitter, fail fast on 4xx auth errors, quarantine bad payloads, alert with context, idempotent writes.
    - "What should never happen in error handling?" Silent swallowing; publishing partial results.
  `, {
    check: [
      mcq('The API returns HTTP 401 Unauthorized. Should the pipeline retry 5 times with backoff?', ['Yes, always retry', 'No: authentication errors are not transient; fail fast and alert so someone fixes credentials', 'Retry forever', 'Return an empty result'], 1, 'Retry transient errors (timeouts, 429, 503), not permanent ones.'),
      mcq('An API client wraps every call in «try: … except Exception: return []». What is the danger?', ['None', 'Failures look like "no data", so the pipeline loads zero rows and reports success', 'It is slower', 'It retries too much'], 1, 'Silent failure is the worst failure. Raise and alert.'),
      tf('A good alert includes the step, run date, error summary, a link to logs and the runbook.', true, 'Context turns an alert into an action.'),
      match('Match the error to the response.', [['HTTP 503 from a source API', 'Retry with backoff and jitter'], ['One row with an unparseable date', 'Quarantine the row and continue'], ['Required column missing from the file', 'Fail fast, do not publish'], ['Upstream file not yet arrived', 'Sensor wait with timeout, then alert']], 'Classify first, then respond.'),
    ],
    hands: [
      py({ q: 'Write «run_step(fn, retries=3)» that calls «fn()» and handles errors by class. If «fn» raises «TransientError», retry up to «retries» more times; if it still fails, raise it. Any other exception must propagate **immediately** (no retry). Return «(result, attempts)» where attempts counts calls made. (The «TransientError» class is given.)', starter: 'class TransientError(Exception):\n    pass\n\ndef run_step(fn, retries=3):\n    pass\n',
        tests: `calls = {'n': 0}
def flaky():
    calls['n'] += 1
    if calls['n'] < 3:
        raise TransientError('503')
    return 'ok'
assert run_step(flaky) == ('ok', 3)
def always():
    raise TransientError('timeout')
try:
    run_step(always, retries=2); raise AssertionError('should raise')
except TransientError:
    pass
n = {'k': 0}
def auth():
    n['k'] += 1
    raise PermissionError('401')
try:
    run_step(auth); raise AssertionError('should raise')
except PermissionError:
    pass
assert n['k'] == 1, 'permanent errors must not be retried'`,
        solution: `class TransientError(Exception):
    pass

def run_step(fn, retries=3):
    attempts = 0
    while True:
        attempts += 1
        try:
            return fn(), attempts
        except TransientError:
            if attempts > retries:
                raise` }),
    ],
  }),
};
