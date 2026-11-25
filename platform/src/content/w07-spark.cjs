const { learn, mcq, tf, multi, fill, match, order, spark, viz, bug, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('spark', 'Spark and PySpark', 'interview core',
  'Distributed processing from first principles: cluster architecture, lazy evaluation, DataFrames, joins, windows, partitions, shuffles, skew, caching, AQE and writing data. The PySpark code runs for real here.',
  [
    lesson('k1', 'Why Spark, and how a cluster works', 18, [
      viz('mapreduce', 'Before Spark: MapReduce', 'Spark generalises this pattern. Step through it once and the rest of the world makes sense.'),
      learn('Spark architecture', `
        One machine can't process 5 TB in reasonable time. Spark splits data into **partitions** and processes them in parallel across a cluster, **in memory** where possible (MapReduce wrote to disk after every step).

        | Component | Role |
        |---|---|
        | **Driver** | runs your program, builds the plan (DAG), schedules tasks, collects results |
        | **Cluster manager** | allocates machines: YARN, Kubernetes, Databricks, standalone |
        | **Executors** | JVM processes on worker nodes that run tasks and cache data |
        | **Task** | the work for **one partition** in one stage. One task = one core |
        | **Stage** | tasks that run without moving data between machines |
        | **Job** | everything triggered by one action |

        **Parallelism = number of cores**: 10 executors × 4 cores = 40 tasks at a time. 400 partitions → 10 waves.

        APIs: **DataFrame/SQL** (what you'll use, optimised by the Catalyst optimizer and Tungsten engine), RDD (low-level, rarely needed), Structured Streaming, MLlib. PySpark is the Python API over the same JVM engine. Python DataFrame code runs as fast as Scala unless you use Python UDFs.
      `),
      match('Match the Spark component to its job.', [
        ['Driver', 'Builds the DAG and schedules tasks'],
        ['Executor', 'Runs tasks and caches data on a worker'],
        ['Task', 'Processes one partition'],
        ['Cluster manager', 'Allocates resources (YARN, K8s)'],
      ]),
      mcq('A cluster has 5 executors with 4 cores each. A stage has 100 partitions. How many tasks run at the same time?', ['5', '20', '100', '4'], 1, '5 × 4 = 20 concurrent tasks; 100 partitions take 5 waves.'),
      tf('«df.collect()» on a 200 GB DataFrame is a safe way to inspect it.', false, 'collect() pulls every row to the driver: out-of-memory. Use show(), limit(), take(n), or write the output.'),
      mcq('Why is Spark usually much faster than classic Hadoop MapReduce for multi-step jobs?', ['It uses Python', 'It keeps intermediate data in memory and optimises the whole DAG instead of writing to disk after every map/reduce', 'It has no shuffle', 'It runs on one machine'], 1),
    ]),
    lesson('k2', 'Lazy evaluation and the DAG', 18, [
      viz('sparkdag', 'Build a job, count the stages', 'Add transformations and an action. Narrow operations pipeline together. Wide ones force a shuffle and a new stage.', { stages: 3 }),
      learn('Transformations vs actions', `
        **Transformations** return a new DataFrame and are **lazy**: nothing runs, Spark just extends the plan.
        «select, filter/where, withColumn, join, groupBy().agg, orderBy, distinct, union, repartition»

        **Actions** trigger execution and return a result or write data.
        «show, count, collect, take, first, write.…, foreach, toPandas»

        **Narrow** transformation: each output partition depends on one input partition. No data movement («filter, select, withColumn, union, coalesce», broadcast join).
        **Wide** transformation: output partitions need data from many input partitions, so a **shuffle** across the network is needed («groupBy, join» (sort-merge), «distinct, orderBy, repartition, window functions»).

        Laziness lets Catalyst optimise the **whole** plan: push filters down to the Parquet scan, prune unused columns, reorder joins, pick broadcast joins. Inspect it with «df.explain()».

        Each action re-runs the plan from the source unless you «cache()».
      `),
      multi('Which are **actions**?', ['df.count()', 'df.filter(...)', 'df.write.parquet(path)', 'df.groupBy("x").agg(...)', 'df.show()'], [0, 2, 4]),
      multi('Which transformations cause a **shuffle**?', ['groupBy().agg()', 'filter()', 'orderBy()', 'withColumn()', 'distinct()'], [0, 2, 4]),
      spark({ q: `Your first job. Read «spark.table('claims')», keep only status «'Approved'», select «claim_id, dealer_id, claim_amount», and assign it to «result». Call «result.explain()» to see the plan.`, starter: `claims = spark.table("claims")\n\nresult = claims  # your transformations\nresult.explain()\n`, solution: `claims = spark.table("claims")
result = claims.filter(F.col("status") == "Approved").select("claim_id", "dealer_id", "claim_amount")
result.explain()` }),
      mcq('You run «df2 = df.filter(...).withColumn(...)» and it returns instantly on 1 TB. Why?', ['Spark is very fast', 'Nothing executed yet: transformations are lazy until an action', 'The data was cached', 'The filter removed everything'], 1),
    ]),
    lesson('k3', 'DataFrame API essentials', 25, [
      learn('The everyday API', `
        «««python
        from pyspark.sql import functions as F
        claims = spark.table("claims")                        # or spark.read.parquet("s3://.../claims")

        (claims
          .select("claim_id", "dealer_id", "claim_amount", "status")
          .filter((F.col("status") == "Approved") & (F.col("claim_amount") > 50000))
          .withColumn("amount_lakh", F.round(F.col("claim_amount") / 100000, 2))
          .withColumn("band", F.when(F.col("claim_amount") >= 200000, "High")
                               .when(F.col("claim_amount") >= 50000, "Medium")
                               .otherwise("Low"))
          .withColumnRenamed("dealer_id", "dealer")
          .orderBy(F.desc("claim_amount"))
          .show(5))
        »»»
        - Combine conditions with «&», «|», «~» and **parentheses** (Python operator precedence!).
        - «F.col("x")», «df.x» and «df["x"]» all reference columns. Wrap literals in «F.lit()» when they must be columns.
        - Nulls: «F.col("x").isNull()», «F.coalesce(a, b)», «df.fillna({"x": 0})», «df.dropna(subset=["x"])».
        - Strings: «F.upper, F.trim, F.concat_ws, F.regexp_replace, F.substring».
        - Dates: «F.to_date, F.date_format(c, "yyyy-MM"), F.datediff(end, start), F.year, F.date_trunc("month", c)».
        - Cast: «F.col("qty").cast("int")».
      `),
      spark({ q: `From «engines», return engines with «horsepower >= 500» built in **2025** or later, with a new column «label» = serial_no + " / " + model (use «F.concat_ws»). Columns: «engine_id, label, horsepower».`, starter: `engines = spark.table("engines")\n\nresult = engines\n`, solution: `engines = spark.table("engines")
result = (engines
  .filter((F.col("horsepower") >= 500) & (F.year(F.to_date("build_date")) >= 2025))
  .select("engine_id", F.concat_ws(" / ", "serial_no", "model").alias("label"), "horsepower"))`, hint: 'F.year(F.to_date("build_date")) >= 2025, combined with & and parentheses.' }),
      spark({ q: `Ageing buckets in PySpark: for every service request compute «days_open» = days between «opened_at» and «closed_at» (use «F.lit("2026-11-25")» if closed_at is null) and a «bucket»: «"0-7"», «"8-15"», «"16+"». Return «sr_id, days_open, bucket».`, starter: `sr = spark.table("service_requests")\n\nresult = sr\n`, solution: `sr = spark.table("service_requests")
end = F.coalesce(F.to_date("closed_at"), F.to_date(F.lit("2026-11-25")))
days = F.datediff(end, F.to_date("opened_at"))
result = (sr.select("sr_id", days.alias("days_open"))
  .withColumn("bucket", F.when(F.col("days_open") <= 7, "0-7").when(F.col("days_open") <= 15, "8-15").otherwise("16+")))`, hint: 'F.datediff(F.coalesce(F.to_date("closed_at"), F.to_date(F.lit("2026-11-25"))), F.to_date("opened_at"))' }),
      spark({ q: `Clean a messy batch: build a DataFrame from the given rows, then trim and upper-case «dealer», convert «amt» strings like «"1,24,500"» to double (remove commas), and drop rows where amount is null. Return «claim_id, dealer, amount».`, starter: `rows = [("C1", " pune power ", "1,24,500"), ("C2", "Delhi Diesel", None), ("C3", "mumbai engine care ", "88,000.50")]\nraw = spark.createDataFrame(rows, ["claim_id", "dealer", "amt"])\n\nresult = raw\n`, solution: `rows = [("C1", " pune power ", "1,24,500"), ("C2", "Delhi Diesel", None), ("C3", "mumbai engine care ", "88,000.50")]
raw = spark.createDataFrame(rows, ["claim_id", "dealer", "amt"])
result = (raw
  .withColumn("dealer", F.upper(F.trim("dealer")))
  .withColumn("amount", F.regexp_replace("amt", ",", "").cast("double"))
  .dropna(subset=["amount"])
  .select("claim_id", "dealer", "amount"))` }),
      bug('This filter raises an error. Which line?', `claims = spark.table("claims")
big = claims.filter(F.col("claim_amount") > 100000 & F.col("status") == "Approved")
big.show()`, 2, 'Python evaluates «&» before «>» and «==». Wrap each condition in parentheses: «(F.col("claim_amount") > 100000) & (F.col("status") == "Approved")».'),
      mcq('What is the difference between «df.select("a")» and «df.withColumn("b", ...)»?', ['None', 'select returns only the listed columns; withColumn keeps all columns and adds/replaces one', 'withColumn is an action', 'select is slower'], 1),
    ]),
    lesson('k4', 'Aggregations and joins', 25, [
      learn('groupBy and join', `
        «««python
        (claims.groupBy("dealer_id")
               .agg(F.count("*").alias("claims"),
                    F.sum("claim_amount").alias("claimed"),
                    F.avg("claim_amount").alias("avg_claim"),
                    F.countDistinct("pir_id").alias("pirs"),
                    F.sum(F.when(F.col("status") == "Approved", 1).otherwise(0)).alias("approved")))

        claims.join(dealers, on="dealer_id", how="left")                 # same-named key
        claims.join(dealers, claims.dealer_id == dealers.dealer_id)      # expression: both columns kept
        claims.join(F.broadcast(dealers), "dealer_id")                   # broadcast hint
        crf.join(service_requests, "crf_id", "left_anti")                # CRFs without an SR
        »»»
        Join types: «inner, left, right, full, left_semi, left_anti, cross».
        Pivot: «df.groupBy("dealer_id").pivot("status").count()».
      `),
      spark({ q: `Per dealer **region**: number of claims and total approved amount (null → 0), rounded to 2 decimals. Join «claims» to «dealers». Columns: «region, claims, approved».`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
result = (claims.join(dealers, "dealer_id")
  .groupBy("region")
  .agg(F.count("*").alias("claims"), F.round(F.sum(F.coalesce("approved_amount", F.lit(0))), 2).alias("approved")))` }),
      spark({ q: `Anti join: CRFs with status «"Converted"» that have no service request should not exist. Instead, find **closed service requests without a PIR** using «left_anti». Return «sr_id, closed_at».`, starter: `sr = spark.table("service_requests")\npir = spark.table("pir")\n\nresult = None\n`, solution: `sr = spark.table("service_requests")
pir = spark.table("pir")
result = (sr.filter(F.col("status") == "Closed")
  .join(pir.select("sr_id"), "sr_id", "left_anti")
  .select("sr_id", "closed_at"))` }),
      spark({ q: `Pivot: per «dealer_id», count claims per status using «groupBy().pivot()», with statuses «["Approved", "Partially Approved", "Rejected", "Submitted"]». Fill missing counts with 0.`, starter: `claims = spark.table("claims")\n\nresult = None\n`, solution: `claims = spark.table("claims")
result = (claims.groupBy("dealer_id")
  .pivot("status", ["Approved", "Partially Approved", "Rejected", "Submitted"])
  .count()
  .fillna(0))` }),
      spark({ q: `Supplier delivery performance: join «purchase_orders» with «suppliers», keep received POs, and compute per «supplier_name» the average delay in days («received_date - expected_date», 1 decimal) and the number of late POs (delay > 0). Columns: «supplier_name, avg_delay, late_pos».`, starter: `po = spark.table("purchase_orders")\nsup = spark.table("suppliers")\n\nresult = None\n`, solution: `po = spark.table("purchase_orders")
sup = spark.table("suppliers")
delay = F.datediff(F.to_date("received_date"), F.to_date("expected_date"))
result = (po.filter(F.col("received_date").isNotNull())
  .join(sup, "supplier_id")
  .withColumn("delay", delay)
  .groupBy("supplier_name")
  .agg(F.round(F.avg("delay"), 1).alias("avg_delay"), F.sum(F.when(F.col("delay") > 0, 1).otherwise(0)).alias("late_pos")))` }),
      mcq('«claims.join(dealers, claims.dealer_id == dealers.dealer_id)» and then «.select("dealer_id")» raises «AMBIGUOUS_REFERENCE». Fix?', ['Join with on="dealer_id" (a USING join keeps one column), or select claims.dealer_id explicitly', 'Use a cross join', 'Cast dealer_id to string', 'Call collect() first'], 0),
    ]),
    lesson('k5', 'Window functions in PySpark', 20, [
      learn('Window specs', `
        «««python
        from pyspark.sql.window import Window
        w = Window.partitionBy("dealer_id").orderBy(F.col("claim_amount").desc())
        claims.withColumn("rn", F.row_number().over(w)).filter("rn <= 3")      # top 3 per dealer

        w2 = Window.partitionBy("engine_id").orderBy("ts")
        readings.withColumn("prev", F.lag("temperature_c").over(w2))
        readings.withColumn("ma3", F.avg("temperature_c").over(w2.rowsBetween(-2, 0)))
        claims.withColumn("dealer_total", F.sum("claim_amount").over(Window.partitionBy("dealer_id")))
        »»»
        Same semantics as SQL. A window **requires a shuffle** by the partition keys. A window with no «partitionBy» moves **all data to one partition**: Spark warns you, and on big data it is a disaster.
      `),
      spark({ q: `Latest status per order with «row_number»: from «raw_orders_feed», keep one row per «order_id» with the greatest «updated_at» (tiebreak: greatest «ingested_at»). Return «order_id, status, updated_at».`, starter: `feed = spark.table("raw_orders_feed")\n\nresult = None\n`, solution: `feed = spark.table("raw_orders_feed")
w = Window.partitionBy("order_id").orderBy(F.col("updated_at").desc(), F.col("ingested_at").desc())
result = (feed.withColumn("rn", F.row_number().over(w))
  .filter(F.col("rn") == 1)
  .select("order_id", "status", "updated_at"))` }),
      spark({ q: `Temperature spikes: per engine ordered by «ts», compute «prev_temp» with «lag» and keep readings where «temperature_c - prev_temp > 8». Return «engine_id, ts, temperature_c, prev_temp».`, starter: `r = spark.table("sensor_readings")\n\nresult = None\n`, solution: `r = spark.table("sensor_readings")
w = Window.partitionBy("engine_id").orderBy("ts")
result = (r.withColumn("prev_temp", F.lag("temperature_c").over(w))
  .filter(F.col("temperature_c") - F.col("prev_temp") > 8)
  .select("engine_id", "ts", "temperature_c", "prev_temp"))` }),
      spark({ q: `Each dealer's share of its own claims: add «dealer_total» (sum of claim_amount over the dealer) and «share_pct» = claim_amount / dealer_total × 100 (2 decimals). Return «claim_id, dealer_id, share_pct».`, starter: `claims = spark.table("claims")\n\nresult = None\n`, solution: `claims = spark.table("claims")
w = Window.partitionBy("dealer_id")
result = (claims.withColumn("dealer_total", F.sum("claim_amount").over(w))
  .withColumn("share_pct", F.round(F.col("claim_amount") / F.col("dealer_total") * 100, 2))
  .select("claim_id", "dealer_id", "share_pct"))` }),
      tf('«Window.orderBy("ts")» without «partitionBy» processes all rows in a single partition.', true, 'Fine for 1,000 rows, catastrophic for 1 billion. Always partition windows by a key when you can.'),
    ]),
    lesson('k6', 'Partitions, shuffles and join strategies', 20, [
      viz('broadcastjoin', 'Shuffle or broadcast?'),
      learn('Controlling data movement', `
        **Partitions** are the unit of parallelism. Reading files gives roughly one partition per ~128 MB split. After a shuffle, Spark uses «spark.sql.shuffle.partitions» (default **200**). AQE can coalesce these at runtime.

        - «repartition(n)» / «repartition("dealer_id")»: full shuffle, evenly redistributes. Use it to increase parallelism or co-locate by key.
        - «coalesce(n)»: merges partitions **without** a full shuffle. Use it to **reduce** output files before writing.

        **Join strategies**
        | Strategy | When | Cost |
        |---|---|---|
        | Broadcast hash join | one side small (< «autoBroadcastJoinThreshold», 10 MB by default; raise carefully) | small side copied to all executors, big side never moves |
        | Sort-merge join | both sides large | shuffle + sort both sides by key |
        | Shuffle hash join | medium side fits per-partition hash | shuffle both, no sort |

        Tuning order: filter early, select fewer columns, pre-aggregate before joins, broadcast small dims, fix skew, right-size partitions (~100–200 MB each), then cluster size.
      `),
      mcq('You need 16 output files instead of 200 after a groupBy, with minimal extra cost. Use…', ['repartition(16)', 'coalesce(16)', 'collect()', 'cache()'], 1, 'coalesce merges existing partitions without a full shuffle. repartition(16) would shuffle everything again (but gives evenly sized files).'),
      mcq('fact_claims is 800 GB, dim_dealer is 2 MB. The plan shows SortMergeJoin with both sides shuffled. What do you do?', ['Increase executors', 'Broadcast dim_dealer', 'Repartition fact to 1', 'Convert to CSV'], 1),
      tf('Increasing «spark.sql.shuffle.partitions» always makes jobs faster.', false, 'Too many partitions = tiny tasks with scheduling overhead and many small output files. Too few = huge tasks that spill to disk. Aim for ~100–200 MB per partition (AQE helps).'),
      spark({ q: `Use a broadcast join explicitly: join «claims» with «F.broadcast(dealers)» on «dealer_id», then count claims per «city». Call «result.explain()» and find «BroadcastHashJoin». Return «city, claims».`, starter: `claims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = None\n`, solution: `claims = spark.table("claims")
dealers = spark.table("dealers")
result = claims.join(F.broadcast(dealers), "dealer_id").groupBy("city").agg(F.count("*").alias("claims"))
result.explain()` }),
    ]),
    lesson('k7', 'Skew, caching, AQE and tuning', 20, [
      viz('skew', 'Tame a skewed join'),
      learn('When one task takes forever', `
        **Skew**: a few keys hold most rows (one mega-dealer, NULL keys, a default "UNKNOWN" engine). Their partition becomes one huge task while 199 others finish in seconds. Symptom in the Spark UI: one task at 45 min, median 20 s.

        Fixes:
        1. **AQE skew join** («spark.sql.adaptive.enabled=true», «skewJoin.enabled=true»): Spark 3 splits skewed partitions automatically. Try this first.
        2. **Broadcast** the other side if it is small.
        3. **Salting**: add a random 0..N-1 «salt» to the skewed side's key and replicate the other side N times, then join on (key, salt).
        4. Handle **NULL / default keys** separately (they all hash to one partition).

        **Caching**: «df.cache()» / «persist(StorageLevel.MEMORY_AND_DISK)» keeps a DataFrame after its first action. Worth it when the **same** DataFrame feeds several actions/branches. Useless for single-use data, and it wastes memory. «unpersist()» when done.

        **AQE (Adaptive Query Execution)** re-optimises at runtime using real statistics: coalesces small shuffle partitions, switches sort-merge to broadcast when a side turns out small, splits skewed partitions.

        **Spark UI**: Jobs → Stages → Tasks (look at max vs median duration, shuffle read/write, spill). **SQL tab** shows the physical plan with row counts.

        **Memory errors**: executor OOM → too-large partitions or skew (more partitions, fix skew), driver OOM → «collect()»/huge broadcast.
      `),
      mcq('Spark UI: 199 tasks finish in ~30 s, one runs for 40 minutes. Most likely cause?', ['Too few executors', 'Data skew on the join/group key', 'Slow network', 'Python is slow'], 1),
      mcq('When is «df.cache()» a good idea?', ['Always, on every DataFrame', 'When the same expensive DataFrame is reused by several actions', 'Before writing a DataFrame once', 'On the raw input before a single filter'], 1),
      scenario('Nightly Spark job blew its SLA', `The **fact_claims** build normally takes 25 minutes. Last night it ran 3 h 40 min and finished after the 06:00 SLA. Data volume grew 8%.`, [
        ['Where do you look first?', [
          ['Spark UI for last night\'s run: which stage got slow, and how task durations are distributed', true, 'Find the slow stage and check whether it is uniform slowness or a few straggler tasks.'],
          ['Double the cluster size immediately', false, 'An 8% volume increase doesn\'t explain 9× runtime. Throwing money at it hides the cause.'],
          ['Rewrite the job in Scala', false, 'Language isn\'t the issue.'],
        ]],
        ['One join stage has one task reading 60 GB while others read 300 MB. The join key is «dealer_id» and a new mega-dealer started sending claims. Fix?', [
          ['Enable AQE skew join handling, and if needed salt the skewed key or broadcast the dealer dimension', true, 'Classic skew. AQE splits the hot partition. Broadcasting the small dim avoids shuffling the fact at all.'],
          ['Set shuffle partitions to 1', false, 'That makes everything one task.'],
          ['Filter out the mega-dealer\'s claims', false, 'Dropping data to hit an SLA is a correctness incident.'],
        ]],
        ['How do you stop this surprising you again?', [
          ['Alert on job duration vs baseline and on partition size skew, and keep the fix in the code (not a one-off config)', true, 'Monitor runtime and data shape, not just success/failure.'],
          ['Check manually every morning', false, 'Doesn\'t scale and fails when you\'re on leave.'],
        ]],
      ]),
    ]),
    lesson('k8', 'Spark SQL, UDFs and writing data', 20, [
      learn('SQL, UDFs and writes', `
        «««python
        claims.createOrReplaceTempView("claims_v")
        spark.sql("SELECT dealer_id, COUNT(*) n FROM claims_v GROUP BY dealer_id")   # same engine, same plan

        # UDF: last resort. Python UDFs serialise rows to Python, slow and opaque to Catalyst
        @F.udf("string")
        def failure_system(code):
            return code.split("-")[1] if code else None
        # prefer built-ins: F.split("failure_code", "-").getItem(1)

        (df.write
           .mode("overwrite")                 # or append / errorifexists / ignore
           .partitionBy("claim_month")        # folder per value -> pruning
           .format("delta")                   # parquet / delta / csv / json
           .save("/lake/gold/fct_claims"))
        # Delta: overwrite only one partition idempotently
        df.write.format("delta").mode("overwrite").option("replaceWhere", "claim_month = '2026-11'").save(path)
        »»»
        Prefer, in order: built-in functions → SQL expressions → pandas UDFs (vectorised, Arrow) → plain Python UDFs.
      `),
      spark({ q: `Use Spark SQL: register «claims» as temp view «c» and «dealers» as «d», then with «spark.sql» return per «region» the number of claims with status «'Rejected'». Columns: «region, rejected».`, starter: `spark.table("claims").createOrReplaceTempView("c")\nspark.table("dealers").createOrReplaceTempView("d")\n\nresult = spark.sql("""\n  SELECT ...\n""")\n`, solution: `spark.table("claims").createOrReplaceTempView("c")
spark.table("dealers").createOrReplaceTempView("d")
result = spark.sql("""
  SELECT d.region, COUNT(*) AS rejected
  FROM c JOIN d ON d.dealer_id = c.dealer_id
  WHERE c.status = 'Rejected'
  GROUP BY d.region
""")` }),
      spark({ q: `Replace a UDF with built-ins: from «pir», extract the system from «failure_code» (e.g. «FC-COOL-01» → «COOL») using «F.split(...).getItem(1)», then count PIRs per system. Columns: «system, pirs».`, starter: `pir = spark.table("pir")\n\nresult = None\n`, solution: `pir = spark.table("pir")
result = (pir.withColumn("system", F.split("failure_code", "-").getItem(1))
  .groupBy("system").agg(F.count("*").alias("pirs")))` }),
      spark({ q: `Write a partitioned dataset: take «claims», add «claim_month» = «date_format(submitted_at, "yyyy-MM")», write it with «mode("overwrite").partitionBy("claim_month").parquet("/lake/silver/claims")» (simulated here), then read it back with «spark.read.parquet» and count claims per month. Columns: «claim_month, n».`, starter: `claims = spark.table("claims")\n\n# write, then read back\nresult = None\n`, solution: `claims = spark.table("claims")
out = claims.withColumn("claim_month", F.date_format(F.to_timestamp("submitted_at"), "yyyy-MM"))
out.write.mode("overwrite").partitionBy("claim_month").parquet("/lake/silver/claims")
result = spark.read.parquet("/lake/silver/claims").groupBy("claim_month").agg(F.count("*").alias("n"))` }),
      mcq('Why are plain Python UDFs slow in PySpark?', ['They run on the driver only', 'Each row is serialised from the JVM to a Python worker and back, and Catalyst can\'t optimise inside them', 'They are interpreted twice', 'They disable partitioning'], 1),
      bug('This daily job is supposed to replace only today\'s partition but it wiped the whole table. Which line?', `daily = claims.filter(F.col("claim_date") == run_date)
(daily.write
   .format("delta")
   .mode("overwrite")
   .save("/lake/gold/fct_claims"))`, 4, `A plain overwrite replaces the entire table. Use «.option("replaceWhere", f"claim_date = '{run_date}'")» (Delta) or dynamic partition overwrite («spark.sql.sources.partitionOverwriteMode=dynamic»).`),
    ]),
  ]);
