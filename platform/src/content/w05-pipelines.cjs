const { learn, mcq, tf, multi, fill, match, order, sql, py, viz, bug, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('pipes', 'ETL/ELT and Pipelines', 'required skill',
  'How data actually moves: batch architecture, incremental loads, CDC, idempotency, backfills, orchestration with Airflow, dbt, file formats and partitioning.',
  [
    lesson('e1', 'ETL vs ELT and batch architecture', 15, [
      learn('Two ways to move data', `
        **ETL**: Extract → Transform (on a separate engine) → Load the finished result. Classic with Informatica/SSIS; still used when data must be cleaned or masked *before* it lands.

        **ELT**: Extract → Load raw → Transform inside the warehouse/lakehouse with SQL (dbt, Spark SQL). The modern default: raw data is preserved, transformations are versioned SQL, and compute scales.

        A typical batch pipeline:
        «««flow
        Extract (API / JDBC / files) -> Land raw (bronze) -> Validate -> Transform (silver) -> Model (gold) -> Publish + notify
        »»»
        Each step should be **idempotent**, **observable** (logs, row counts, durations) and **restartable** from the failed step.
      `),
      order('Order the steps of a nightly ELT pipeline for dealer claims.', ['Extract yesterday\'s claims from the dealer portal API', 'Land the raw JSON in the bronze zone', 'Run schema and quality checks on the batch', 'Clean, dedupe and type into silver', 'Rebuild the gold claims mart', 'Publish and notify consumers / refresh the dashboard']),
      mcq('Why is ELT usually preferred on cloud platforms?', ['Transformations run where data lives on elastic compute, and raw data stays available for reprocessing', 'It needs no SQL', 'It avoids storing data', 'It is always cheaper than doing nothing'], 0),
      tf('In ETL, sensitive columns can be masked before the data ever lands in the analytics platform.', true, 'One legitimate reason to keep a T before the L: PII minimisation at ingestion.'),
    ]),
    lesson('e2', 'Incremental loads and CDC', 20, [
      viz('incremental', 'Run the pipeline yourself', 'Three strategies. Run each a few times and watch what happens to the target.'),
      learn('Full vs incremental, and change data capture', `
        **Full load**: re-read everything each run. Simple, correct, expensive. Fine for small dimensions.

        **Incremental load**: read only what changed since the last successful run.
        - **High-watermark**: store «max(updated_at)» loaded; next run reads «updated_at > watermark». Needs a reliable, indexed modified timestamp. Misses hard deletes.
        - **CDC (change data capture)**: read the database's transaction log (Debezium, Oracle GoldenGate, SQL Server CDC, Salesforce Change Data Capture events). Captures inserts, updates **and deletes** in order, with low source load.
        - **Snapshot diff**: compare today's full extract with yesterday's (hash per row). Works anywhere, costs more.

        Then **apply** the changes with MERGE/UPSERT keyed on the business key. Deletes become soft deletes («is_deleted = 1») or real deletes.

        **Watermark safety:** update the watermark only **after** the load commits. Use a small overlap («updated_at > watermark - 10 minutes») to catch late-committing transactions, and rely on the idempotent MERGE to absorb the re-read rows.
      `),
      mcq('Your source table has no «updated_at» column and rows are sometimes deleted. Best way to capture changes?', ['High-watermark on the primary key', 'Log-based CDC from the database transaction log', 'Full reload and append', 'Ask users to email changes'], 1, 'CDC sees updates and deletes without needing a timestamp column, with minimal load on the source.'),
      mcq('When should the pipeline advance its watermark?', ['Before extracting', 'After extraction, before loading', 'After the load has committed successfully', 'Never'], 2, 'If the load fails after the watermark moved, those rows are silently skipped forever.'),
      sql({ q: `Snapshot-diff CDC: «orders_current» is yesterday's target. Using the latest status per order from «raw_orders_feed», classify each order as «'INSERT'» (not in target), «'UPDATE'» (in target with a different status) or «'SAME'». Return «order_id, change_type».`, tables: ['raw_orders_feed', 'orders_current'], solution: `WITH latest AS (
  SELECT order_id, status FROM (
    SELECT order_id, status, ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY updated_at DESC, ingested_at DESC) AS rn
    FROM raw_orders_feed) WHERE rn = 1
)
SELECT l.order_id,
       CASE WHEN t.order_id IS NULL THEN 'INSERT'
            WHEN t.status <> l.status THEN 'UPDATE'
            ELSE 'SAME' END AS change_type
FROM latest l LEFT JOIN orders_current t ON t.order_id = l.order_id;`, level: 3 }),
    ]),
    lesson('e3', 'Idempotency, backfills, late data', 18, [
      learn('Making pipelines safe to re-run', `
        **Idempotent** = running the job once or five times with the same input gives the same result. Retries, backfills and reruns after failures all depend on it.

        Techniques:
        - **Overwrite a partition**: the job for «2026-11-24» deletes and rewrites exactly that day's partition («INSERT OVERWRITE … PARTITION (dt='2026-11-24')», or Delta «replaceWhere»).
        - **MERGE on a business key** instead of INSERT.
        - **Deterministic logic**: no «now()» inside transforms. Pass the logical date. Stable tiebreakers in ROW_NUMBER.
        - **Exactly-once sinks**: transactional table formats (Delta/Iceberg) commit atomically. No half-written outputs.

        **Backfill**: re-running history (a new column, a logic fix). Parameterise by date, run in parallel within limits, and confirm downstream consumers expect it.

        **Late-arriving data**: records that show up after their period was processed. Options: reprocess a trailing window (last 3 days every run), MERGE late rows in, or route them to a correction process. For **late-arriving dimensions** (a claim for a dealer not yet in «dim_dealer»), insert an "unknown/inferred" member and update it when the dealer arrives.
      `),
      mcq('A daily job appends yesterday\'s claims to «fact_claims». It failed halfway on Tuesday and was re-run. What is the likely problem?', ['Nothing', 'Duplicates from the first partial run', 'Missing dimensions', 'Wrong time zone'], 1, 'Append + partial failure + rerun = duplicates. Overwrite the day\'s partition or MERGE instead.'),
      multi('Which make a pipeline idempotent?', ['INSERT OVERWRITE of the processed date partition', 'MERGE keyed on claim_id', 'Appending with a fresh UUID per run', 'Using datetime.now() to decide which day to load', 'Atomic commits with Delta/Iceberg'], [0, 1, 4]),
      scenario('Late claims broke the monthly report', `Finance closed **October**. On 4 November, 300 October claims arrive late from a dealer whose integration was down. Your monthly gold table for October was built on 1 November and is append-only.`, [
        ['What is the root design problem?', [
          ['The October build was a one-shot append, so late data has nowhere to go', true, 'Periods must be re-computable: reprocess the affected partition.'],
          ['The dealer should never be late', false, 'Late data always happens. Design for it.'],
          ['The dashboard caches too long', false, 'Caching is not the cause.'],
        ]],
        ['How do you fix October now?', [
          ['Re-run the October build as an idempotent partition overwrite (or MERGE the late claims), then notify Finance with the delta', true, 'Recompute deterministically and communicate restatements: a data product has consumers who must know.'],
          ['Insert the 300 rows manually into the gold table', false, 'Manual hot-fixes bypass logic and tests and create silent drift.'],
          ['Put them into November instead', false, 'That misstates both months.'],
        ]],
        ['How do you prevent it next time?', [
          ['Reprocess a trailing window (e.g. last 7 days) every run, monitor freshness per source, and alert when a source goes quiet', true, 'Trailing-window reprocessing + per-source freshness checks catch late and missing feeds.'],
          ['Build the report later in the month', false, 'Only moves the problem.'],
        ]],
      ]),
    ]),
    lesson('e4', 'Orchestration with Airflow', 20, [
      learn('DAGs, tasks, schedules', `
        An **orchestrator** runs tasks in dependency order on a schedule, retries failures, and shows what ran. Airflow is the most common (also ADF, Databricks Workflows, Dagster, Prefect).

        «««python
        from airflow import DAG
        from airflow.operators.python import PythonOperator
        from datetime import datetime, timedelta

        with DAG(
            dag_id="claims_daily",
            schedule="0 2 * * *",                 # 02:00 every day
            start_date=datetime(2026, 1, 1),
            catchup=False,                        # don't auto-run every missed day since start_date
            default_args={"retries": 3, "retry_delay": timedelta(minutes=5)},
        ) as dag:
            extract = PythonOperator(task_id="extract", python_callable=extract_claims,
                                     op_kwargs={"ds": "{{ ds }}"})   # logical date, templated
            validate = PythonOperator(task_id="validate", python_callable=run_checks)
            transform = PythonOperator(task_id="transform", python_callable=build_silver)
            publish = PythonOperator(task_id="publish", python_callable=build_gold)
            extract >> validate >> transform >> publish
        »»»
        Key ideas:
        - **DAG** = directed acyclic graph of tasks. «>>» sets dependencies.
        - **Logical date («ds»)**: the period being processed, not "now". This is how backfills work: «airflow dags backfill -s 2026-10-01 -e 2026-10-31».
        - **Sensors** wait for a condition (file landed, upstream DAG done).
        - **XCom** passes *small* metadata between tasks. Never pass datasets through XCom: write them to storage.
        - Airflow **orchestrates**. Heavy work runs elsewhere (Spark, warehouse).
      `),
      order('Arrange the tasks in dependency order.', ['wait_for_portal_file (sensor)', 'load_to_bronze', 'quality_checks', 'transform_silver', 'build_gold_mart', 'notify_slack']),
      mcq('What does «catchup=True» do with «start_date» one year ago and a daily schedule?', ['Runs only today', 'Schedules a run for every missed day since start_date', 'Ignores the schedule', 'Deletes old runs'], 1, 'Often surprising in production: 365 runs fire at once. Set catchup=False unless you want a backfill.'),
      mcq('Where should a 3 GB intermediate dataset go between two Airflow tasks?', ['XCom', 'Object storage or a table, passing only its path via XCom', 'An environment variable', 'The Airflow metadata database'], 1),
      tf('A task that uses «{{ ds }}» can be backfilled for any past date and produce that date\'s data.', true, 'Templated logical dates make tasks parameterised and reproducible. That is the core of safe backfills.'),
      bug('This DAG keeps running the same task in a loop. Which line is wrong?', `with DAG("claims", schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False) as dag:
    extract = PythonOperator(task_id="extract", python_callable=extract_fn)
    clean = PythonOperator(task_id="clean", python_callable=clean_fn)
    load = PythonOperator(task_id="load", python_callable=load_fn)
    extract >> clean >> load
    load >> extract`, 6, 'A DAG must be **acyclic**. «load >> extract» creates a cycle; Airflow refuses to parse it. Cross-run dependencies are handled by schedules or sensors, not cycles.'),
      py({ q: 'Mini-orchestrator: write «run_order(deps)» that returns a valid execution order (topological sort) for a dict «{task: [upstream tasks]}». Raise «ValueError» if there is a cycle.', starter: 'def run_order(deps):\n    pass\n', tests: `deps = {'extract': [], 'validate': ['extract'], 'transform': ['validate'], 'dim': ['extract'], 'publish': ['transform', 'dim']}
o = run_order(deps)
assert sorted(o) == sorted(deps), o
pos = {t: i for i, t in enumerate(o)}
for t, ups in deps.items():
    for u in ups:
        assert pos[u] < pos[t], f'{u} must run before {t}: {o}'
try:
    run_order({'a': ['b'], 'b': ['a']}); assert False, 'cycle not detected'
except ValueError:
    pass`, solution: `def run_order(deps):
    indeg = {t: len(ups) for t, ups in deps.items()}
    children = {t: [] for t in deps}
    for t, ups in deps.items():
        for u in ups:
            children[u].append(t)
    ready = [t for t, d in indeg.items() if d == 0]
    order = []
    while ready:
        t = ready.pop(0)
        order.append(t)
        for c in children[t]:
            indeg[c] -= 1
            if indeg[c] == 0:
                ready.append(c)
    if len(order) != len(deps):
        raise ValueError('cycle detected')
    return order`, hint: 'Kahn\'s algorithm: count unmet upstreams per task; repeatedly run tasks with zero; if some never reach zero, there is a cycle.' }),
    ]),
    lesson('e5', 'dbt and transformation layers', 15, [
      learn('dbt: SQL as software', `
        **dbt** turns SQL «SELECT» files into tables/views in your warehouse, with software practices around them.

        «««sql
        -- models/silver/stg_claims.sql
        select cast(claim_id as int) as claim_id, dealer_id, cast(submitted_at as timestamp) as submitted_at,
               claim_amount, approved_amount, lower(status) as status
        from {{ source('portal', 'claims_raw') }}

        -- models/gold/fct_claims.sql   (incremental model)
        {{ config(materialized='incremental', unique_key='claim_id') }}
        select c.*, d.dealer_key
        from {{ ref('stg_claims') }} c
        join {{ ref('dim_dealer') }} d using (dealer_id)
        {% if is_incremental() %}
          where c.submitted_at > (select max(submitted_at) from {{ this }})
        {% endif %}
        »»»
        «««yaml
        # models/gold/schema.yml: tests + docs live next to the model
        models:
          - name: fct_claims
            description: One row per warranty claim.
            columns:
              - name: claim_id
                tests: [unique, not_null]
              - name: dealer_key
                tests:
                  - relationships: {to: ref('dim_dealer'), field: dealer_key}
        »»»
        - «ref()» builds the dependency graph and **lineage** automatically.
        - Materializations: view, table, incremental, snapshot (= SCD2 for you).
        - «dbt test», «dbt docs generate» (catalog + lineage graph), CI on pull requests.
      `),
      match('Match the dbt feature to what it gives you.', [
        ['ref()', 'Dependency graph and lineage'],
        ['tests: [unique, not_null]', 'Automated data quality checks'],
        ['materialized=\'incremental\'', 'Process only new/changed rows'],
        ['dbt snapshot', 'SCD Type 2 history'],
      ]),
      mcq(`Why use «{{ ref('stg_claims') }}» instead of hard-coding «analytics.stg_claims»?`, ['It is shorter', 'dbt resolves the right schema per environment and records the dependency for build order and lineage', 'It makes the query faster', 'It encrypts the table'], 1),
    ]),
    lesson('e6', 'File formats, compression, partitioning', 18, [
      viz('pruning', 'Partition pruning game'),
      learn('Choosing a storage format', `
        | Format | Layout | Schema | Best for |
        |---|---|---|---|
        | CSV | row, text | none (all strings) | exchange with humans/legacy, small files |
        | JSON | row, text, nested | self-describing, loose | APIs, semi-structured events |
        | **Parquet** | **columnar**, binary | embedded, typed | analytics on lake/lakehouse: the default |
        | ORC | columnar | embedded | Hive ecosystems |
        | **Avro** | row, binary | schema (with evolution rules) | Kafka messages, write-heavy streaming |
        | Delta / Iceberg / Hudi | Parquet + transaction log | enforced + evolvable | ACID tables, MERGE, time travel |

        **Parquet wins analytics** because: column pruning (read 3 of 80 columns), predicate pushdown via row-group min/max stats, strong compression (dictionary + run-length + Snappy/ZSTD), types preserved.

        **Compression:** Snappy (fast, splittable within Parquet), ZSTD (better ratio), GZIP (good ratio, but a gzipped CSV is **not splittable**: one task must read the whole file).

        **Small-files problem:** 100,000 × 50 KB files kill performance (listing, task overhead). Aim for ~128 MB–1 GB files. Compact regularly («OPTIMIZE», «coalesce» before write).

        **Schema evolution:** adding a nullable column is safe. Renaming or retyping breaks readers. Table formats and Avro have explicit evolution rules.
      `),
      mcq('A query reads 3 columns out of 120 in a 2 TB table. Which format scans the least data?', ['CSV', 'JSON', 'Parquet', 'Gzipped CSV'], 2),
      mcq('Why is a single 40 GB «.csv.gz» file slow to process in Spark?', ['Gzip can\'t be decompressed', 'Gzip isn\'t splittable, so one task reads the whole file serially', 'CSV has no header', 'Spark doesn\'t support CSV'], 1),
      mcq('A nightly job writes 20,000 tiny Parquet files per day. What is the fix?', ['Switch to CSV', 'Reduce output partitions (coalesce/repartition) and run compaction/OPTIMIZE', 'Partition by claim_id', 'Write JSON'], 1),
      match('Match the format to its sweet spot.', [
        ['Parquet', 'Columnar analytics on the lake'],
        ['Avro', 'Kafka messages with schema registry'],
        ['JSON', 'API payloads, nested events'],
        ['Delta Lake', 'ACID MERGE and time travel on Parquet'],
      ]),
    ]),
  ]);
