// Practice banks: pipelines, orchestration, quality, devops.
// Each module: edge-case concept questions, "something broke" scenarios, bug hunts, interview talk-throughs, hands-on code.
const { mcq, tf, multi, order, match, sql, py, scenario, talk, bug } = require('../_h.cjs');

module.exports = {
  // ================================================================== ETL/ELT PIPELINES
  pipelines: [
    mcq('An incremental load uses «WHERE updated_at > last_watermark». A source row is updated but its «updated_at» is not changed by the app. What happens?', ['It is loaded next run', 'The change is never picked up: the watermark only sees rows whose timestamp moved', 'The pipeline fails', 'Spark detects it automatically'], 1, 'Watermarks trust the source timestamp. If the source doesn\'t maintain it, use CDC (logs) or periodic full compares.'),
    mcq('Your watermark is the max «updated_at» you loaded. Two rows commit in the source with the **same** timestamp, one just after your extract ran. Next run uses «>» . Result?', ['Both loaded', 'The late row with the equal timestamp is skipped forever', 'Duplicates', 'Nothing'], 1, 'Use «>=» with dedupe on the key, or a small overlap window, or a monotonically increasing id.'),
    mcq('A daily full reload truncates the target, then inserts. The insert fails halfway. What do users see?', ['Yesterday\'s data', 'A half-empty table until someone fixes it', 'An error message', 'The old data from a backup'], 1, 'Load into a staging table and swap (or use an atomic overwrite / transaction) so readers never see a partial table.'),
    mcq('Which design makes a daily load safe to re-run?', ['INSERT the day\'s rows', 'Overwrite the day\'s partition, or MERGE on a business key', 'Append and dedupe once a month', 'Use a bigger cluster'], 1),
    multi('Which are signs a pipeline needs CDC (change data capture) rather than a timestamp watermark?', ['Rows are hard-deleted in the source', 'Updates don\'t touch updated_at', 'You need every intermediate change, not just the latest', 'The table has 50 rows'], [0, 1, 2], 'Watermarks can\'t see deletes or untracked updates; CDC reads the change log.'),
    tf('Late-arriving data can be handled by reprocessing a small trailing window (e.g. the last 3 days) on every run.', true, 'Common and simple, as long as the load is idempotent.'),
    tf('Parquet is a good format for a file that a person will open in Excel.', false, 'Parquet is columnar and binary: great for engines, not for humans. Export CSV for people.'),
    match('Match the file format to its best use.', [['Analytics on a few columns of a huge table', 'Parquet'], ['Row-by-row event exchange with a schema', 'Avro'], ['Small config or API payload', 'JSON'], ['Hand-off to a spreadsheet user', 'CSV']]),
    mcq('A table is partitioned by «event_date». Most queries filter on «customer_id» only. Effect?', ['Fast queries', 'Every query scans all partitions: no pruning helps', 'Errors', 'Data loss'], 1, 'Partition on what you filter by most; cluster/Z-order on other high-cardinality filters.'),
    mcq('A job writes 10,000 files of 50 KB each per day. The main problem this creates?', ['Too little data', 'Small files: slow listing and reading, high overhead per file', 'Higher accuracy', 'Nothing'], 1, 'Aim for files in the ~100 MB to 1 GB range; compact regularly.'),
    order('Put a robust batch load in order.', ['Extract the new or changed data (by watermark or CDC)', 'Land it raw (bronze), untouched', 'Validate and clean; quarantine bad rows', 'Load into the target with MERGE or partition overwrite', 'Reconcile counts and sums, then advance the watermark']),
    tf('You should advance the watermark before the load has been verified.', false, 'If the load fails after you advanced it, those rows are skipped forever. Advance only after success.'),
    scenario('Yesterday\'s numbers doubled', 'A dashboard shows yesterday\'s sales exactly 2x higher than expected. The load ran twice because the scheduler retried after a timeout.', [
      ['What is the root cause?', [
        ['The load appends rows, so a retry inserted yesterday\'s data again: it isn\'t idempotent', true, 'Retries are normal; the load must tolerate them.'],
        ['The source system doubled its sales', false, 'Check: the duplication lines up exactly with the retry.'],
      ]],
      ['Immediate fix for the data?', [
        ['Delete yesterday\'s partition in the target and reload it once, then reconcile against the source', true, 'Rebuild the affected slice, then verify.'],
        ['Divide yesterday\'s numbers by 2 in the dashboard', false, 'A hack that hides the problem and breaks the next time.'],
      ]],
      ['Permanent fix?', [
        ['Make the load overwrite the date\'s partition (or MERGE on order_id), and add a uniqueness check that fails the run on duplicates', true, 'Idempotency + a test that would have caught it.'],
        ['Turn off retries', false, 'Then real transient failures lose data.'],
      ]],
    ]),
    scenario('Rows are missing after an incremental load', 'Finance says 200 orders from Monday are missing in the warehouse. The pipeline uses an updated_at watermark and ran successfully.', [
      ['Where do you look first?', [
        ['Compare source vs target for Monday by order_id to see exactly which rows are missing, then check their updated_at values', true, 'Pin down the missing set before guessing.'],
        ['Re-run everything from scratch', false, 'Might fix it but you won\'t know why, and it may happen again.'],
      ]],
      ['The missing rows have updated_at earlier than the watermark: they were committed late by a long-running source transaction. Fix?', [
        ['Use an overlap window (reload the last N hours with dedupe on the key) or switch to CDC from the transaction log', true, 'Late commits are a classic watermark gap.'],
        ['Move the watermark back by a year', false, 'Massive reprocessing for no reason.'],
      ]],
    ]),
    scenario('An API source changes overnight', 'A pipeline ingests a partner API. Today the job succeeded but the target has 0 new rows.', [
      ['What do you suspect?', [
        ['The API changed (field names, pagination or auth) and the code silently parsed nothing', true, '"Succeeded with 0 rows" is a classic silent failure.'],
        ['There were no sales today', false, 'Possible, but verify; this is exactly what volume alerts are for.'],
      ]],
      ['What would have caught this automatically?', [
        ['A volume check that alerts when row count drops far below the usual range, plus schema checks on the response', true, 'Monitor volume and schema, not just job success.'],
        ['A longer timeout', false, 'Not related.'],
      ]],
    ]),
    scenario('A pipeline is getting slower every week', 'A daily job took 10 minutes in January and 2 hours now. Data volume grew only 20%.', [
      ['Most likely causes?', [
        ['It reprocesses everything instead of only new data, and/or small files keep accumulating', true, 'Runtime that grows much faster than daily volume usually means full scans or file buildup.'],
        ['The servers got older', false, 'Hardware doesn\'t slow down like that.'],
      ]],
      ['Fix?', [
        ['Make it incremental, prune partitions, compact small files, and track runtime as a metric with an alert', true, 'Fix the work done, then watch it.'],
        ['Run it less often', false, 'Moves the problem.'],
      ]],
    ]),
    scenario('Two sources disagree', 'The CRM says 1,040 customers in India; the warehouse says 1,012.', [
      ['How do you reconcile?', [
        ['Compare at key level (customer_id) to list missing, extra and different rows, then check filters, dedupe rules and load timing', true, 'Counts tell you there\'s a gap; key-level diffs tell you what it is.'],
        ['Pick the bigger number', false, 'Not a reconciliation.'],
      ]],
      ['The 28 missing customers have country "india" (lower case). Fix?', [
        ['Standardise case/whitespace in silver, add a validity check on country codes, and backfill', true, 'Clean at the right layer, add a test, fix history.'],
        ['Tell the CRM team to fix their data and do nothing', false, 'Report it too, but make the pipeline robust.'],
      ]],
    ]),
    bug('This incremental load is meant to be safe to re-run. Click the line that breaks it.', `def load(day):
    rows = extract(day)
    write_watermark(day)          # remember progress
    target.insert(rows)           # append to target`, [3], 'The watermark is advanced **before** the data is safely written: if the insert fails, this day is skipped forever (and the append duplicates on retry). Write idempotently (overwrite partition / MERGE), verify, then advance the watermark.'),
    py({ q: 'Write «incremental(rows, watermark)» that returns the rows with «updated_at > watermark», plus the **new watermark** (the max «updated_at» of the returned rows, or the old watermark if none). Return a tuple «(rows, new_watermark)». Timestamps are ISO strings.', starter: 'def incremental(rows, watermark):\n    pass\n', tests: `rows = [{'id': 1, 'updated_at': '2026-01-01T10:00'}, {'id': 2, 'updated_at': '2026-01-02T09:00'}, {'id': 3, 'updated_at': '2026-01-01T08:00'}]
r, w = incremental(rows, '2026-01-01T09:00')
assert [x['id'] for x in r] == [1, 2], r
assert w == '2026-01-02T09:00', w
assert incremental([], 'X') == ([], 'X')`, solution: `def incremental(rows, watermark):
    new = [r for r in rows if r['updated_at'] > watermark]
    return new, max([r['updated_at'] for r in new], default=watermark)` }),
    talk('*"How do you make a pipeline idempotent?"*', `
      - Same input + same run date → same output, however many times it runs.
      - Write with **overwrite of the run\'s partition** or **MERGE on a business key**, never blind appends.
      - Parameterise by the logical/run date, not "now".
      - Advance watermarks only after the write is verified.
      - Add a uniqueness test so duplicates fail the run instead of reaching users.
    `),
    talk('*"Walk me through how you would design a daily batch pipeline from a relational source."*', `
      - Extract incrementally (watermark or CDC); land raw in bronze with load metadata.
      - Silver: types, cleaning, dedupe, quarantine invalid rows with a reason.
      - Gold: modelled tables (facts/dimensions) via MERGE or partition overwrite.
      - Orchestrate with retries; make every step idempotent; backfills by date.
      - Monitor freshness, volume, failures and data-quality checks; alert owners.
    `),
    talk('*"What would you monitor on a production pipeline?"*', `
      - **Freshness:** when did data last land vs the SLA.
      - **Volume:** row counts vs normal range (catches silent zero-row runs).
      - **Quality:** contract checks (nulls, uniqueness, ranges, referential integrity).
      - **Runtime and cost:** trends, not just failures.
      - **Failures and retries**, with alerts routed to an owner and a runbook.
    `),
  ],

  // ================================================================== ORCHESTRATION
  orchestration: [
    mcq('A DAG uses «datetime.now()» to pick which day to load. You re-run last Tuesday\'s failed run today. What loads?', ['Last Tuesday', 'Today\'s data, so Tuesday stays missing', 'Both', 'Nothing'], 1, 'Use the logical date ({{ ds }} / data_interval_start).'),
    mcq('«catchup=True», «start_date» = 1 Jan, and you deploy the DAG on 1 March. What happens?', ['Only today runs', 'Airflow schedules a run for every missed interval since 1 Jan', 'Nothing until tomorrow', 'An error'], 1, 'Set catchup=False unless you really want the backfill.'),
    mcq('A task passes a 2 GB DataFrame to the next task through XCom. Problem?', ['None', 'XCom is stored in the metadata database: big payloads bloat or break it. Pass a file path instead.', 'It is faster', 'XCom encrypts it'], 1),
    mcq('Which belongs in an Airflow task?', ['A loop over 50 million rows in Python on the scheduler', 'Triggering a Spark job / SQL statement and checking its result', 'Storing the result dataset in XCom', 'Calling time.sleep(3600) to wait for a file'], 1),
    tf('Tasks in a DAG can run in any order unless dependencies say otherwise.', true),
    tf('A data-quality gate task should usually have retries=5.', false, 'Bad data won\'t fix itself; fail fast and alert. Retries are for transient errors.'),
    multi('Which make a DAG safe to backfill?', ['Tasks overwrite or MERGE by logical date', 'Uses {{ ds }} instead of now()', 'Appends to a single shared table', 'Limited concurrency (max_active_runs) where order matters'], [0, 1, 3]),
    match('Match the Airflow feature to its use.', [['Wait for a partner file without holding a worker', 'Deferrable sensor'], ['Only 2 Spark jobs at a time', 'Pool'], ['One task per file found at runtime', 'Dynamic task mapping'], ['Alert when a run is late', 'SLA / callback']]),
    mcq('In dbt, what does «ref(\'stg_orders\')» give you that a hard-coded table name doesn\'t?', ['Faster SQL', 'Dependency order (lineage) and environment-aware table names', 'Encryption', 'Automatic indexes'], 1),
    mcq('A dbt model is «materialized=\'incremental\'». On a full refresh, what happens?', ['Only new rows load', 'The table is rebuilt from scratch', 'Nothing', 'It deletes the source'], 1),
    order('Put an Airflow DAG run in order for a daily load.', ['Sensor waits for the source file for the logical date', 'Load raw into bronze', 'Transform to silver and gold', 'Run the data-quality gate', 'Publish / notify downstream']),
    tf('Changing a DAG\'s schedule or start_date can create unexpected backfill runs.', true, 'Airflow compares intervals to history; review before deploying.'),
    scenario('The DAG ran but the table is empty', 'The DAG shows all green for today, but the gold table has no rows for today.', [
      ['First thing to check?', [
        ['Which logical date the tasks used and whether the source had data for that date; green only means no task raised an error', true, 'Success ≠ correctness.'],
        ['Restart the scheduler', false, 'Nothing is wrong with the scheduler.'],
      ]],
      ['The extract queried the wrong date (now() instead of ds). Prevent it next time?', [
        ['Use the logical date everywhere and add a row-count check that fails the DAG on zero rows', true, 'Fix + guard.'],
        ['Run the DAG manually every morning', false, 'Doesn\'t scale.'],
      ]],
    ]),
    scenario('Backfill caused duplicates', 'You backfilled 30 days. Downstream reports now show doubled values for those days.', [
      ['Why?', [
        ['The tasks append instead of overwriting the date\'s data, so re-running added a second copy', true, 'Non-idempotent tasks + backfill = duplicates.'],
        ['Airflow ran each day twice by mistake', false, 'Possible, but the root cause is that a re-run isn\'t safe.'],
      ]],
      ['How to repair and prevent?', [
        ['Rebuild the 30 days with partition overwrite/MERGE, reconcile, and only allow backfills on idempotent DAGs', true, 'Repair and make it impossible to repeat.'],
        ['Delete the reports', false, 'No.'],
      ]],
    ]),
    scenario('Everything is queued, nothing runs', 'Dozens of task instances sit in "queued" for an hour.', [
      ['Likely cause?', [
        ['All worker slots or a pool are occupied, often by sensors in poke mode waiting for files', true, 'Long-running pokers starve everything else.'],
        ['The DAG file has a typo', false, 'That would fail to parse, not queue.'],
      ]],
      ['Fix?', [
        ['Switch sensors to deferrable/reschedule mode, size pools, and alert on queue time', true, 'Free slots while waiting.'],
        ['Add more DAGs', false, 'Makes it worse.'],
      ]],
    ]),
    bug('This DAG is dangerous to backfill. Click the line that causes it.', `with DAG("sales", start_date=datetime(2026, 1, 1), schedule="@daily", catchup=True):
    load = BashOperator(task_id="load",
        bash_command="python load.py --date $(date +%F)")`, [3], '«$(date +%F)» is the server\'s current date, so every backfilled run loads **today**. Use «--date {{ ds }}» (the logical date).'),
    talk('*"What is the difference between Airflow and dbt?"*', `
      - **Airflow** orchestrates: schedules, dependencies across systems, retries, backfills, alerts. It doesn\'t do the heavy compute itself.
      - **dbt** transforms inside the warehouse with SQL: models, dependencies via ref(), tests and docs.
      - Common setup: Airflow triggers ingestion jobs, then runs dbt, then quality checks and notifications.
    `),
    talk('*"A partner sends a file at an unpredictable time between 1 and 6 am. How do you schedule the load?"*', `
      - A deferrable sensor (or event trigger, e.g. storage event) waits for the file for the logical date, with a timeout.
      - On arrival: validate it (schema, row count, checksum), then load idempotently.
      - Alert if it hasn\'t arrived by the SLA time; don\'t hold worker slots while waiting.
    `),
  ],

  // ================================================================== DATA QUALITY
  quality: [
    match('Match the check to the quality dimension.', [['order_id never NULL', 'Completeness'], ['order_id appears once', 'Uniqueness'], ['amount ≥ 0', 'Validity'], ['Data landed within 2 hours', 'Timeliness'], ['Every order\'s customer exists in customers', 'Consistency / referential integrity']]),
    mcq('A check "row count > 0" passes, but half the rows are missing. What would have caught it?', ['Nothing could', 'A volume check against the normal range (e.g. within ±30% of the 7-day average) or reconciliation with the source', 'A NULL check', 'A bigger cluster'], 1),
    mcq('Bad rows arrive. Which option is usually best for a shared pipeline?', ['Fail the whole run on any bad row', 'Silently drop them', 'Quarantine them with a reason, load the good rows, and alert if the bad share crosses a threshold', 'Fix them by guessing values'], 2),
    tf('A data contract is an agreement with the data producer about schema, meaning and quality, checked automatically.', true),
    tf('If every test passes, the data is correct.', false, 'Tests only cover what you thought of. Add reconciliation and monitoring for the unknowns.'),
    mcq('NULLs in «discount» mean "no discount". You compute «AVG(discount)». What goes wrong?', ['Nothing', 'AVG ignores NULLs, so the average is only over discounted orders, and looks too high', 'It errors', 'It returns NULL'], 1, 'COALESCE(discount, 0) if NULL truly means zero.'),
    sql({ q: 'Data-quality check: find **duplicate claim ids** in «claims» (ids appearing more than once). Return «claim_id, n». (A healthy table returns zero rows: here it should return nothing too, but write the check.)', tables: ['claims'], solution: 'SELECT claim_id, COUNT(*) AS n FROM claims GROUP BY claim_id HAVING COUNT(*) > 1;', allowEmpty: true }),
    sql({ q: 'Referential-integrity check: credit notes whose «claim_id» does **not exist** in «claims». Return «cn_id, claim_id».', tables: ['credit_notes', 'claims'], solution: 'SELECT cn.cn_id, cn.claim_id FROM credit_notes cn LEFT JOIN claims c ON c.claim_id = cn.claim_id WHERE c.claim_id IS NULL;', allowEmpty: true }),
    sql({ q: 'Validity check: claims where «approved_amount» is **greater than** «claim_amount» (you can\'t approve more than claimed). Return «claim_id, claim_amount, approved_amount».', tables: ['claims'], solution: 'SELECT claim_id, claim_amount, approved_amount FROM claims WHERE approved_amount > claim_amount;', allowEmpty: true }),
    sql({ q: 'Completeness check: for each column of «service_requests» that can be missing, count NULLs: return one row with «missing_closed_at» and «missing_technician».', tables: ['service_requests'], solution: 'SELECT SUM(CASE WHEN closed_at IS NULL THEN 1 ELSE 0 END) AS missing_closed_at, SUM(CASE WHEN technician_id IS NULL THEN 1 ELSE 0 END) AS missing_technician FROM service_requests;' }),
    py({ q: 'Write «validate(row)» returning a list of problems for an order dict: «"missing id"» if «id» is falsy, «"negative amount"» if «amount» < 0, «"bad currency"» if «currency» not in {"INR","USD","EUR"}. Empty list = valid.', starter: 'def validate(row):\n    pass\n', tests: `assert validate({'id': 1, 'amount': 10, 'currency': 'INR'}) == []
assert validate({'id': None, 'amount': -1, 'currency': 'XYZ'}) == ['missing id', 'negative amount', 'bad currency']
assert validate({'id': 2, 'amount': 0, 'currency': 'USD'}) == []`, solution: `def validate(row):
    problems = []
    if not row.get('id'):
        problems.append('missing id')
    if row.get('amount') is not None and row['amount'] < 0:
        problems.append('negative amount')
    if row.get('currency') not in {'INR', 'USD', 'EUR'}:
        problems.append('bad currency')
    return problems` }),
    multi('Which belong in data observability monitoring?', ['Freshness', 'Volume', 'Schema changes', 'Distribution shifts (e.g. a column suddenly 40% NULL)', 'The colour of the dashboard'], [0, 1, 2, 3]),
    scenario('A KPI dropped 40% overnight', 'The "claims approved" KPI fell 40% today. Business is asking if something happened in the field.', [
      ['First step?', [
        ['Check the pipeline before the business: freshness, volume and quality checks for today\'s load', true, 'Rule out a data problem before anyone makes decisions on it.'],
        ['Email leadership that approvals collapsed', false, 'If it\'s a data issue, you\'ve caused panic.'],
      ]],
      ['Today\'s file has 40% of rows with status NULL after a source change. Action?', [
        ['Flag the dashboard as unreliable, quarantine/hold the load, notify the source owner, and backfill once fixed', true, 'Protect consumers, fix at the source, repair history.'],
        ['Treat NULL as Rejected', false, 'Guessing changes the business numbers.'],
      ]],
    ]),
    scenario('Duplicates appeared downstream', 'Customer counts in a report are 3% too high since last week.', [
      ['How do you find the cause?', [
        ['Check uniqueness of the customer key at each layer (bronze → silver → gold) to find where duplicates first appear', true, 'Trace the layer where the defect is introduced.'],
        ['Add DISTINCT in the report', false, 'Hides it; the next report will be wrong too.'],
      ]],
      ['They first appear after a join with a new address table that has 2 rows for some customers. Fix?', [
        ['Pick one address per customer (e.g. latest, ROW_NUMBER) before joining, and add a uniqueness test on the output', true, 'Fix the grain of the join input, then test.'],
        ['Delete the address table', false, 'Loses needed data.'],
      ]],
    ]),
    scenario('Silent schema change', 'A source team changed «amount» from rupees to paise (×100). No error occurred.', [
      ['What catches this?', [
        ['Distribution checks: mean/median/max of amount jumping 100× against history', true, 'Schema checks pass; only value monitoring sees it.'],
        ['A NOT NULL check', false, 'Values aren\'t null.'],
      ]],
      ['Long-term protection?', [
        ['A data contract with the producer that includes units, plus anomaly alerts on key metrics', true, 'Agreements + monitoring.'],
        ['Stop using the source', false, 'Not realistic.'],
      ]],
    ]),
    talk('*"Tell me about how you handle data quality."*', `
      - Define checks per table from the contract: completeness, uniqueness, validity, referential integrity, freshness.
      - Run them on every load; severity decides: block the run, or quarantine and warn.
      - Reconcile source vs target (counts, sums, key-level diffs).
      - Monitor volumes and distributions for issues no rule anticipated.
      - When something breaks: find the layer where it starts, fix the root cause, backfill, add a test so it can\'t recur.
      - Use your real example (e.g. reconciling dashboard numbers against Salesforce with SOQL).
    `),
    talk('*"What is the difference between data quality checks and unit tests?"*', `
      - **Unit tests** check your code with fixed, hand-made inputs, at build time.
      - **Data quality checks** check the real data at run time, every load.
      - You need both: perfect code can still receive bad data.
    `),
  ],

  // ================================================================== DEVOPS
  devops: [
    mcq('You committed a password to a public GitHub repo, then deleted it in the next commit. Is it safe?', ['Yes, it\'s deleted', 'No: it\'s still in the git history. Rotate the password immediately, then clean history.', 'Yes if the repo is small', 'Only if you force-push'], 1),
    mcq('What does a CI pipeline typically do on every pull request?', ['Deploys to production', 'Runs linting and tests, and blocks the merge if they fail', 'Deletes old branches', 'Backs up the database'], 1),
    mcq('Why run a pipeline in a Docker container?', ['It makes Python faster', 'Same OS, libraries and versions everywhere: "works on my machine" problems go away', 'It encrypts the data', 'It replaces Airflow'], 1),
    tf('A Docker image and a running container are the same thing.', false, 'An image is the template; a container is a running instance of it.'),
    mcq('Two people edited the same lines and git reports a merge conflict. What do you do?', ['Delete the other person\'s branch', 'Open the file, keep the correct combination of both changes, remove the conflict markers, test, commit', 'Force-push your version', 'Revert everything'], 1),
    order('Put a typical change workflow in order.', ['Create a branch from main', 'Make the change and add tests', 'Push and open a pull request', 'CI runs tests; a teammate reviews', 'Merge; CD deploys to dev, then test, then prod']),
    match('Match the term to its meaning.', [['Infrastructure as code (Terraform)', 'Servers and storage defined in versioned files'], ['CI', 'Automatically build and test every change'], ['CD', 'Automatically release tested changes'], ['Rollback', 'Return to the last good version']]),
    multi('What should NOT be inside a Docker image or git repo?', ['Passwords and API keys', 'The application code', 'requirements.txt', 'Production data dumps'], [0, 3], 'Secrets come from a secret store at run time; data never goes in images.'),
    tf('Environment-specific settings (database host per env) should come from configuration or environment variables, not be hard-coded.', true),
    scenario('Deployment broke production', 'A new version of a pipeline was deployed and tonight\'s run failed for all tables.', [
      ['Immediate action?', [
        ['Roll back to the previous version so tonight\'s data still lands, then investigate', true, 'Restore service first.'],
        ['Debug in production while the data is late', false, 'Users wait while you investigate.'],
      ]],
      ['The bug was a renamed config key that dev and test didn\'t use. Prevent it next time?', [
        ['Same config structure in every environment, validated at start-up, plus a smoke test after deploy', true, 'Catch config drift before the run.'],
        ['Deploy only on Fridays', false, 'Worse, if anything.'],
      ]],
    ]),
    scenario('CI is green but the code is broken', 'CI passed, the change was merged, and the pipeline crashed on real data.', [
      ['Why can this happen?', [
        ['Tests didn\'t cover the case (e.g. NULLs or empty files) that real data contained', true, 'CI only proves what the tests check.'],
        ['CI is useless', false, 'It caught nothing here because no test covered the case.'],
      ]],
      ['Best follow-up?', [
        ['Add a test with the failing input, fix the code, and add a data check for that case at run time', true, 'Every production bug becomes a test.'],
        ['Disable CI', false, 'No.'],
      ]],
    ]),
    bug('Click the line in this Dockerfile that is a security problem.', `FROM python:3.12
COPY . /app
ENV DB_PASSWORD=Sup3rSecret!
RUN pip install -r /app/requirements.txt
CMD ["python", "/app/run.py"]`, [3], 'The password is baked into the image: anyone who can pull the image can read it. Pass secrets at run time from a secret store.', 'bash'),
    talk('*"How would you automate the deployment of a data pipeline?"*', `
      - Code, tests and infrastructure definitions live in git.
      - CI on every pull request: lint, unit tests, data-contract checks on samples.
      - On merge: build a versioned artifact (Docker image / package), deploy to dev, run smoke tests, promote to test, then prod.
      - Config and secrets per environment from a secret store.
      - Rollback = redeploy the previous version; monitor the first runs after release.
    `),
    talk('*"What does Agile/DevOps mean to you in data work?"*', `
      - Small, frequent changes instead of big releases; each one reviewed and tested.
      - Automate what repeats: tests, deployments, data checks.
      - Measure (failures, freshness, lead time) and improve in each sprint.
      - Use your real team practice (standups, sprints, reviews at your job) as the example.
    `),
  ],
};
