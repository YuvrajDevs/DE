const { T } = require('../_t.cjs');
const C = md => ({ ...T(md), level: 'core' });
const A = md => ({ ...T(md), level: 'aware' });

module.exports = {
  transactions: C(`
    > **In one line:** a **transaction** groups several database changes so that **either all of them happen or none of them do**. **ACID** names the four guarantees that make transactions safe: Atomicity, Consistency, Isolation and Durability.

    ## Why transactions are needed

    Approving a warranty claim takes three steps:
    1. Set the claim status to Approved.
    2. Create a credit note for the dealer.
    3. Reduce the dealer's balance.

    Without a transaction, two things can go wrong:
    - **The server crashes after step 1.** The claim says Approved, but there is no credit note. The data no longer adds up.
    - **Two clerks approve the same claim at once.** Two credit notes are created and the dealer is paid twice.

    A transaction wraps the three steps together: all of them succeed, or the database undoes all of them. It also stops two people's changes from interfering with each other.

    ## ACID, one letter at a time

    **Atomicity: all or nothing.** If any step fails, everything is undone (this is called a **rollback**).

    **Consistency: the rules always hold.** A transaction can't leave the data breaking a rule, such as "amount can't be negative" or "every claim must have a real dealer". If it would, it's rejected.

    **Isolation: no one sees half-finished work.** While a transaction is running, other users don't see its partial changes. Each transaction behaves as if it were running alone.

    **Durability: saved means saved.** Once the database says "committed", the change survives a crash or power cut. *How?* The change is written to a log on disk before the database confirms it.

    **Interview trap:** the C in ACID (rules hold) is **not** the same as the C in CAP (every copy of the data shows the latest value). Same word, different meaning.

    ## What can go wrong when transactions run at the same time

    If transactions aren't isolated enough, these problems can happen:
    - **Dirty read:** you read someone's change before they commit it, and then they cancel it. You used data that never really existed.
    - **Non-repeatable read:** you read the same row twice in one transaction and get different values, because someone changed it in between.
    - **Lost update:** two people both read a balance of 500, both add 100, and both save 600. One addition is lost; the balance should be 700.

    Databases offer **isolation levels**, which are settings for how strictly transactions are kept apart. Stricter is safer but slower. Most databases (PostgreSQL, SQL Server) default to **read committed**, which prevents dirty reads but still allows the other problems. The strictest level, **serializable**, makes transactions behave as if they ran one at a time.

    ## How readers and writers avoid waiting for each other

    Many databases keep **several versions of a row**. When someone updates a row, a new version is created, and readers keep seeing the old version until the update is committed. So readers don't have to wait for writers. (This technique is called MVCC.) Delta Lake works the same way with whole tables: every write creates a new **version** of the table, and readers keep using the version they started with.

    ## Transactions in data engineering

    - **Replacing a day of data in a database.** If you run "delete the day" and then "insert the day" separately, a report running in between sees an empty day. Put both inside **one transaction**.
    - **In a lakehouse (Delta Lake).** Every write is one all-or-nothing **commit**, and readers always see a complete version of the table. If two jobs write at the same time and clash, one fails and must retry.
      - **One level deeper:** each commit covers **one table**. If a job updates a claims table and then a summary table, a reader might briefly see the first updated but not the second.
    - **Across different systems** (a database plus Kafka, for example), one transaction isn't possible. A common solution is the **outbox pattern**: save the business change and a "message to send" row in the **same database transaction**, then a separate process publishes that row to Kafka.

    ## Common mistakes

    - **Two runs of a job reading the same "last processed" value** and both processing the same data. Make sure only one run can work at a time, or lock the row.
    - **Long transactions on a production database** (for example a 2-hour extract) block other work and slow everything down.
    - **Retrying after a timeout without checking.** The first attempt might actually have succeeded, so a retry can create duplicates. Make writes safe to repeat.

    ## Interview answers

    - **"Explain ACID."** "Atomicity: all steps happen or none do. Consistency: data rules always hold. Isolation: transactions don't see each other's unfinished work. Durability: committed changes survive crashes. For example, approving a claim, creating the credit note and updating the balance must happen together."
    - **"What's a lost update?"** "Two transactions read the same value, both change it, and the second save overwrites the first, so one change disappears."
    - **"How does Delta Lake give ACID?"** "Each write is an all-or-nothing commit to a transaction log, and readers always see a complete version of the table."
  `),

  replication: A(`
    > **In one line:** replication means keeping **copies of the same data on several machines**, so the data survives a machine failure, the system stays available, and reads can be spread across machines. The tricky part is that copies can fall slightly behind.

    ## The usual setup: one leader, several followers

    - One machine is the **leader** (also called the primary). **All writes go to it.**
    - The leader sends every change to the other machines, the **followers** (also called replicas), which apply the changes in the same order.
    - Followers can answer **read** queries, which takes load off the leader.
    - If the leader dies, a follower is promoted to become the new leader. This is called **failover**.

    ## Synchronous vs asynchronous

    - **Synchronous:** a write is confirmed only after the followers have saved it too. Nothing is lost if the leader crashes, but writes are slower.
    - **Asynchronous:** a write is confirmed as soon as the leader saves it. Writes are faster, but if the leader crashes, the last few changes that hadn't reached the followers are lost.

    *Why not always choose synchronous?* Because every write would have to wait for the slowest follower.

    ## Replication lag: why a copy can be behind

    Followers are usually slightly behind the leader. This delay is called **replication lag**. Effects you may notice:
    - You save something, then read it from a follower, and your change seems missing.
    - A dashboard reading from a follower shows slightly old numbers.

    **Why a data engineer cares:** pipelines often pull data from a follower to avoid loading the main database. That's good practice, but **record how far the follower had got** when you read it, so the next incremental pull continues from the right point and nothing is missed.

    ## Where you'll see replication

    - **PostgreSQL and MySQL:** leader and followers, fed from the database's change log. The same log feeds CDC tools.
    - **Kafka:** each partition has a leader and followers. The setting acks=all means a message is confirmed only after the in-sync followers have it too, so a single broker failure doesn't lose it.
    - **Hadoop HDFS:** every block of data is stored on 3 machines.
    - **Cloud storage (S3, ADLS):** copies are kept automatically.

    ## Replication is not a backup

    If someone runs DELETE without a WHERE clause, the delete is copied to every follower within milliseconds, and every copy is empty. **Replication protects against machines failing. Backups and time travel protect against mistakes.** You need both.

    ## Common mistakes

    - **Treating replicas as backups.** They aren't, as explained above.
    - **Reading from a lagging follower** and missing recent rows.
    - **Kafka with acks=1:** a message is confirmed once only the leader has it. If the leader dies before the followers copy it, the message is lost.

    ## Interview answers

    - **"What is replication and why use it?"** "Keeping copies of data on several machines, for availability, durability and spreading reads. Usually one leader takes writes and followers copy them."
    - **"Sync vs async replication?"** "Synchronous waits for followers, so nothing is lost but writes are slower. Asynchronous is faster, but recent changes can be lost if the leader crashes."
    - **"Is replication a backup?"** "No. A bad delete replicates instantly. Backups and time travel protect against mistakes."
  `),

  dbpartition: C(`
    > **In one line:** partitioning means **splitting a big table into smaller pieces** by a rule, usually by date. Queries can then **skip the pieces they don't need**, old data can be removed instantly, and each daily load can safely replace just its own piece.

    ## The idea

    Imagine an events table with 3 years of data, partitioned by date. In a data lake, each day becomes its own folder:
    «««text
    events/event_date=2026-11-25/...files...
    events/event_date=2026-11-26/...files...
    events/event_date=2026-11-27/...files...
    »»»
    A query with WHERE event_date = '2026-11-26' reads **one folder** out of about 1,000. Skipping the others like this is called **partition pruning**.

    **"Partition" has three meanings, so be clear which one you mean:**
    1. Splitting a table into pieces for skipping and management (this topic).
    2. Splitting data across machines, usually called **sharding** (Cassandra, Kafka).
    3. In Spark, a partition is just one chunk of data that one task processes.

    ## Ways to split

    - **By range:** date ranges or ID ranges. Best for time-based data. This is the most common.
    - **By list:** explicit values, such as region = 'West'.
    - **By hash:** a scrambled key decides the piece, which spreads data evenly. Used mostly for sharding across machines.

    ## What partitioning gives you

    - **Faster queries:** whole partitions are skipped.
    - **Easy deletion of old data:** removing last year means dropping 365 partitions, which takes seconds, instead of running a slow DELETE over billions of rows.
    - **Safe re-runs:** each daily job **overwrites only its own day's partition**. If the job runs twice, the day is simply replaced, so there are no duplicates. (Running a job twice and getting the same result is called **idempotency**; see Pipeline engineering.)
    - **Parallel work:** different workers can process different partitions.

    ## How to choose the partition column

    1. **Pick a column people filter on.** Usually the date.
    2. **It must have a small number of distinct values.** Date is good: 365 values a year. engine_id with 100,000 values is bad, because it would create 100,000 tiny folders.
    3. **Keep partitions reasonably big,** roughly 1 GB or more each in a lakehouse. *Why?* Thousands of tiny files are slower to manage than to read.
    4. **Use a value that doesn't change.** Partitioning by status would force rows to move between partitions whenever the status changes.

    **For other columns people filter on** (like engine_id), don't add more partition columns. Use **clustering** (Z-order or liquid clustering on Databricks), which stores similar values close together inside files so they can be skipped. Databricks even recommends not partitioning tables smaller than about 1 TB, and clustering them instead.

    ## Common mistakes

    - **Over-partitioning:** partitioning by date **and** engine_id creates millions of tiny folders, and queries get slower, not faster.
    - **Filtering on a calculation instead of the partition column.** If the table is partitioned by event_date but the query says WHERE year(event_ts) = 2026, nothing is skipped. Filter on event_date itself.
    - **Late data:** records that arrive days late belong in old partitions. A daily job should also re-process the last few days (a **lookback window**), or it will miss them.
    - **Mixing time zones:** a partition by local date and one by UTC date split the day at different hours. Be consistent.

    ## Interview answers

    - **"What is partitioning and why use it?"** "Splitting a table into pieces, usually by date, so queries skip irrelevant pieces, old data can be dropped quickly, and daily loads can overwrite just their own piece."
    - **"How would you partition a large events table?"** "By event date, and then cluster by the column people filter on most, such as engine_id. I wouldn't partition by a column with many distinct values."
    - **"What is partition pruning?"** "The engine skips partitions that can't match the query's filter, without reading them."
  `),

  scaling: A(`
    > **In one line:** **vertical scaling** (scaling up) means moving to a **bigger machine**. **Horizontal scaling** (scaling out) means adding **more machines**. Scaling up is simple but has a limit. Scaling out has almost no limit but makes the system more complex.

    ## Side by side

    **Vertical (scale up):** move from 8 CPU cores to 64, or from 32 GB of memory to 512 GB.
    - Good: no code changes, and simple to run.
    - Bad: big machines are very expensive, there is a maximum size, and if that one machine fails, everything stops.
    - Typical: app databases, single-machine tools like pandas or DuckDB.

    **Horizontal (scale out):** add machines and split the work or data between them.
    - Good: grows almost without limit, uses cheap standard machines, and survives individual machine failures.
    - Bad: the machines must coordinate and send data to each other over the network, which adds complexity and can become the bottleneck.
    - Typical: Spark clusters, Kafka, Cassandra, cloud warehouses.

    ## Why adding machines doesn't always help

    - **Some work can't be split.** If 10% of a job must run step by step on one machine, the whole job can never be more than 10 times faster, however many machines you add. (This is called Amdahl's law.)
    - **Machines need to talk.** Jobs that move a lot of data between machines (for example big joins in Spark) can get slower when you add too many machines.
    - **Uneven data (skew).** If one task gets most of the data, it still runs on one machine. The other 99 finish quickly and wait for it.

    ## Reads are easy to scale, writes are hard

    - **More reads:** add read-only copies (replicas) or a cache.
    - **More writes:** you must split the data across machines (sharding) or use a distributed database, which is much harder.
    - **Heavy reports:** move them off the app database and into a warehouse or lakehouse.

    ## Before adding machines, do less work

    Most slow jobs are slow because they do too much work:
    - **read less:** skip partitions, select only needed columns, filter early;
    - **process less:** handle only new or changed data (incremental loads);
    - **fix uneven data** (skew).

    **Measure first, then scale.**

    ## Elasticity in the cloud

    In the cloud, a cluster can grow for the nightly batch and shrink afterwards, so you only pay for what you use. This is called **autoscaling**.

    ## Interview answers

    - **"Vertical vs horizontal scaling?"** "Vertical means a bigger machine: simple, but limited and a single point of failure. Horizontal means more machines: nearly unlimited, but the machines must coordinate and the network becomes a cost."
    - **"A Spark job is slow. Do you just add nodes?"** "Not first. I check for skew, how much data it reads, and large shuffles, and fix those. Then I scale if it's still needed."
  `),

  schema: C(`
    > **In one line:** a **schema** is the agreed structure of a dataset: the column names, their types, whether they can be empty, and what each column means. **Schema evolution** is changing that structure **without breaking** the systems that write or read the data. Many pipeline failures come from a source changing its schema without warning.

    ## Two approaches

    - **Schema-on-write:** the structure is checked when data is **written**, and bad data is rejected straight away. Relational databases and Delta tables work this way. It is safer.
    - **Schema-on-read:** data is stored exactly as it arrives (for example raw JSON files), and the structure is applied when someone **reads** it. It is flexible, but every reader has to handle every variation.

    **Common practice:** keep raw data as it arrives (the bronze layer), so nothing is lost, and enforce the schema from the cleaned layer onwards (silver and gold), so the data is trustworthy.

    ## Which changes are safe?

    | Change | Is it safe? |
    |---|---|
    | Add a new optional column | Usually safe |
    | Remove a column | Breaks anyone who reads it |
    | Rename a column | Breaks everyone (it's really a remove plus an add) |
    | Make a type bigger (INT to BIGINT) | Usually safe |
    | Change a type (number to text) | Fails or corrupts data |
    | Change the **meaning** (amount now excludes tax) | **Dangerous and silent:** no error, but numbers shift |
    | Change the **grain** (one row per claim becomes one row per claim line) | **Dangerous and silent:** totals get double-counted |

    **Why are meaning and grain changes the worst?** Because nothing fails. The pipeline runs green, and the reports are quietly wrong.

    ## How tools help

    - **Delta Lake enforces the schema:** a write with unexpected columns or types is rejected. You can allow new columns deliberately with the mergeSchema option.
    - **Kafka schema registry:** producers register their message schema, and the registry **rejects incompatible changes**. A change that would have broken consumers in production becomes a failed deployment instead.
      - **Backward compatible** means new readers can read old data (for example, adding a field with a default). Upgrade the readers first.
      - **Forward compatible** means old readers can read new data. Upgrade the producers first.
    - **Databricks Auto Loader** puts unexpected fields into a special _rescued_data column, instead of failing or silently losing them.

    ## A safe way to make breaking changes: expand, migrate, contract

    1. **Expand:** add the new column alongside the old one.
    2. **Migrate:** fill in the new column for old data, and move every consumer over. Use **lineage** (a map of who reads which table) to find them.
    3. **Contract:** remove the old column only after an announced date.

    Never rename or delete a column on a shared table in one step.

    ## Common mistakes

    - **A renamed source column silently becomes empty.** Your pipeline reads the old name, gets NULL, and still reports success. Add schema checks that fail loudly.
    - **Automatic type guessing.** If types are guessed from the data, one file may say amount is a number and another that it's text. Define the schema explicitly in production.
    - **INSERT … SELECT * matches columns by position, not by name.** If the column order changes, values land in the wrong columns. List the columns by name.

    ## Interview answers

    - **"A source system renames a column. What happens and what should happen?"** "Without checks, the old column comes through as NULL and the job still succeeds, which is dangerous. Schema validation should catch it and alert, and then we roll out the change with expand, migrate, contract."
    - **"Schema-on-read vs schema-on-write?"** "On-write checks the structure when data is saved, which is safer. On-read applies it when data is read, which is more flexible. I keep raw data as-is and enforce the schema from the cleaned layer onwards."
    - **"Backward vs forward compatibility?"** "Backward: new readers can read old data, so upgrade consumers first. Forward: old readers can read new data, so upgrade producers first."
  `),

  fileformats: C(`
    > **In one line:** a file format decides how data is laid out in a file: as text or binary, by row or by column, with or without a schema. The right format can make the same query many times faster and cheaper. As a rule: **CSV/JSON for exchanging data, Avro for streaming, Parquet (inside Delta tables) for analysis.**

    ## The main formats

    **CSV (comma-separated values).** Plain text that anyone can open in Excel.
    - Good: simple and supported everywhere.
    - Bad: no data types (everything is text), large files, and many parsing traps: commas inside values, quotes, line breaks inside fields, different character encodings.

    **JSON / JSON Lines.** Text that supports nested data.
    - Good: flexible, standard for APIs and events.
    - Bad: every record repeats every field name, so files are big; parsing is slow; and types can vary between records (amount is a number in one record and text in another).
    - **JSON Lines** (one JSON object per line) is better for data than one giant JSON array, because it can be split and processed in parallel.

    **Avro.** A compact binary format that stores data row by row and carries its schema.
    - Good: small, fast to write one record at a time, and handles schema changes well.
    - Used for: **Kafka messages** and streaming.

    **Parquet.** A binary format that stores data **column by column** (see the Row vs column topic).
    - Good: reads only the needed columns, compresses very well, skips chunks using min/max values, and stores its own schema.
    - Bad: you can't edit a file in place; changing data means rewriting files.
    - Used for: **analytics and data lakes**. It's the most important format for a data engineer.

    **ORC.** Similar to Parquet, mainly used in older Hadoop/Hive systems.

    **Delta Lake and Iceberg are not file formats.** They are **table formats**: a layer on top of Parquet files that adds a transaction log, schema enforcement, safe updates and time travel (reading older versions).

    | | CSV | JSON | Avro | Parquet |
    |---|---|---|---|---|
    | Layout | Rows, text | Rows, text | Rows, binary | Columns, binary |
    | Has a schema? | No | Weak | Yes | Yes |
    | Size | Large | Large | Small | Smallest |
    | Best for | Exchanging files | APIs, events, raw data | Kafka, streaming | Analytics |

    ## "Splittable": why one big gzip file is slow

    Spark is fast because many workers each read a different piece of a file at the same time. A plain CSV file can be split, because a worker can start in the middle and find the next line. **A gzip-compressed CSV can't be split**, because gzip must be decompressed from the very beginning. So a single 50 GB .csv.gz file is read by **one worker** while the rest of the cluster sits idle.

    **Fixes:** split it into many smaller files, or convert it to Parquet. (Parquet and Avro can always be split, whatever compression they use.)

    ## The usual pipeline

    «««flow
    Source sends CSV/JSON -> Raw copy kept as received (bronze) -> Converted to Parquet/Delta with a fixed schema (silver) -> Business tables (gold)
    »»»

    ## Common mistakes

    - **Letting Spark guess the CSV schema in production.** The guess can change when the data changes. Always define the schema, delimiter, quote character, encoding, header and date format explicitly.
    - **Ambiguous dates:** is 03/04 the 3rd of April or the 4th of March? Always state the date format.
    - **Many small Parquet files** slow everything down. Compact them into fewer, larger files.

    ## Interview answers

    - **"Why Parquet for analytics?"** "It stores data by column, so queries read only the columns they need. It compresses well, stores min/max statistics so chunks can be skipped, and carries its own schema."
    - **"Parquet vs Avro?"** "Parquet is columnar and best for analytical reads. Avro is row-based and best for streaming and writing one record at a time, like Kafka messages."
    - **"A 40 GB .csv.gz file is processed by only one core. Why?"** "Gzip files can't be split, so only one worker can read it. I'd split it into smaller files or convert it to Parquet."
  `),

  compression: A(`
    > **In one line:** compression makes data **smaller**, so it costs less to store and is faster to read and send. It uses a little CPU time but saves much more time on reading from disk and moving data over the network.

    ## Why compression makes things faster

    In data processing, the slow part is usually **reading data from storage and moving it over the network**, not the CPU. Computers decompress data faster than disks and networks can deliver it. So if 100 GB compresses to 15 GB, there is 85% less to read, and the job runs faster. On cloud services that charge per byte scanned (like BigQuery), the bill shrinks too.

    ## Two layers of compression in Parquet

    **Layer 1: encodings, which use patterns inside each column.**
    - **Dictionary:** repeated words are stored once and replaced by small numbers (Approved = 0, Rejected = 1).
    - **Run-length:** a run of identical values is stored as "value × count" ("West × 10,000").
    - **Delta:** each value is stored as the difference from the previous one, so timestamps one second apart become +1, +1, +1.

    *Why sort data before writing?* Sorting puts equal values next to each other, which makes these encodings far more effective.

    **Layer 2: a general compression method (codec).**

    | Codec | Size | Speed | Typical use |
    |---|---|---|---|
    | Snappy | Medium | Very fast | Spark's long-time default for Parquet |
    | ZSTD | Small | Fast | The modern balanced choice |
    | GZIP | Small | Slow | Text files and archives |
    | LZ4 | Medium | Fastest | Kafka, real-time |

    ## The gzip splitting trap

    A whole text file compressed with gzip (like data.csv.gz) **can't be split**, so only one worker can read it. Parquet is different: it compresses each small piece separately, so **a Parquet file can always be split, whatever codec it uses**.

    ## Common mistakes

    - **One giant gzip file** makes a whole cluster wait on one worker.
    - **Encrypting before compressing:** encrypted data looks random and won't compress. Compress first, then encrypt.
    - **Forgetting data grows in memory:** a 1 GB compressed file may need 10 GB of memory once decompressed.

    ## Interview answers

    - **"Why does compression speed things up?"** "Jobs are usually limited by reading and moving data, not by CPU. Compression means fewer bytes to read, and decompressing is cheap."
    - **"Snappy vs GZIP vs ZSTD?"** "Snappy is fast with medium compression; GZIP compresses well but is slow; ZSTD gives good compression at good speed, so it's a strong default."
    - **"Is a Snappy-compressed Parquet file splittable?"** "Yes. Parquet compresses each chunk separately, so it can still be split."
  `),
};
