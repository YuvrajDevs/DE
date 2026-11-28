const { T } = require('../_t.cjs');

module.exports = {
  transactions: T(`
    > **In one line:** a **transaction** groups several database changes so that **either all of them happen or none of them do**. **ACID** is the set of four guarantees (Atomicity, Consistency, Isolation, Durability) that keep transactions safe when many users work at once and when servers crash.

    ## Why transactions are needed

    Approving a warranty claim takes three steps:
    1. Set the claim's status to Approved.
    2. Insert a credit note for the dealer.
    3. Reduce the dealer's outstanding balance.

    Two things can go wrong:
    - **The server crashes after step 1.** The claim says Approved, but no credit note exists. The data is now inconsistent.
    - **Two clerks approve the same claim at the same moment.** Two credit notes are created and the dealer is paid twice.

    A transaction wraps the three steps together: they all succeed, or the database undoes them all. It also stops two people's changes from interfering with each other.

    ## The four ACID guarantees

    **Atomicity (all or nothing).** If any step fails, every step is undone (rolled back). The database achieves this using its write-ahead log, a record of every change written before the data itself is changed.

    **Consistency (rules always hold).** A transaction can only move the database from one valid state to another. Constraints such as "amount must not be negative" or "every claim must point to an existing dealer" are checked, and a transaction that would break them is rejected.

    **Isolation (no peeking at unfinished work).** While one transaction is in progress, other users don't see its half-done changes. Each transaction behaves (to a configurable degree) as if it were running alone. This is done with locks or MVCC (explained below).

    **Durability (saved means saved).** Once the database says "committed", the change survives a crash or power cut, because the log was written to disk before the commit was confirmed.

    **A common interview trap:** the C in ACID (constraints are respected) is **not** the C in the CAP theorem (every copy of the data returns the latest value). They share a word but mean different things.

    ## Isolation problems ("anomalies")

    When transactions run at the same time, certain errors can occur if isolation is weak:

    - **Dirty read:** you read a change another transaction hasn't committed yet, and then it gets cancelled. You acted on data that never really existed.
    - **Non-repeatable read:** you read the same row twice in one transaction and get different values, because someone else changed it in between.
    - **Phantom read:** you run the same query twice and the second time new rows appear, because someone else inserted them.
    - **Lost update:** two transactions both read a value, both change it, and both save. The second save overwrites the first, so one change is lost. Example: two people add 100 to a balance of 500; both read 500 and both write 600, so the balance ends at 600 instead of 700.
    - **Write skew:** two transactions each check a rule and then change *different* rows, and together they break the rule. Example: a rule says at least one engineer must be on call. Two on-call engineers each check "is someone else on call? yes" and both go off duty at the same time.

    ## Isolation levels

    Databases offer levels that prevent more or fewer of these problems. Stricter levels are safer but slower.

    | Level | What it prevents | What can still happen |
    |---|---|---|
    | Read uncommitted | Almost nothing | Dirty reads and everything else |
    | **Read committed** (the default in PostgreSQL, SQL Server and Oracle) | Dirty reads | Non-repeatable reads, phantoms, lost updates |
    | Repeatable read / snapshot | Also non-repeatable reads (snapshot also prevents phantoms) | Write skew |
    | Serializable | Everything: results are as if transactions ran one at a time | It's slower, and some transactions are cancelled and must be retried |

    ## MVCC: how readers and writers avoid blocking each other

    MVCC stands for **multi-version concurrency control**. When a row is updated, the database doesn't overwrite it. It writes a **new version**, labelled with the ID of the transaction that made it. A reader sees the versions that were committed when its own transaction started (a consistent "snapshot"). So **readers never wait for writers**, and writers never wait for readers. Old versions that nobody needs any more are cleaned up later (Postgres calls this VACUUM).

    Lakehouse table formats such as Delta Lake work the same way with whole files: every write creates a new version of the table, and readers keep using the version they started with.

    ## Transactions in data engineering

    - **Loading into a relational database.** If you replace one day of data with "delete the day, then insert the day", wrap both in one transaction. Otherwise a report running in between sees an empty day.
    - **In a lakehouse (Delta, Iceberg).** Every write is one atomic commit to the table's log, readers see consistent snapshots, and concurrent writers use **optimistic concurrency**: each writes freely, and at commit time the system checks for conflicts. If two writers conflict, one fails and retries. **Atomicity covers one table only.** If you update a fact table and then its summary table, that is two separate commits, and a reader can briefly see one updated without the other. Publish both together (for example by switching a view after both finish), unless the platform supports multi-table transactions.
    - **Streaming with exactly-once results.** Save the output and the stream position (offsets) in one atomic step, or write in a way that is safe to repeat (idempotent).
    - **Across different systems** (a database plus Kafka plus an API), a single transaction is impractical. The old approach, **two-phase commit**, is slow and fragile. Modern designs use:
      - the **outbox pattern:** write the business change and an "event to publish" row in the same database transaction, then let CDC publish that row to Kafka;
      - **idempotent consumers**, which can safely process the same message twice;
      - **sagas:** a series of local transactions, each with a "compensating" undo step if a later step fails.

    ## What goes wrong

    - **Read-modify-write races.** Two pipeline runs both read the same watermark ("last processed time"), and both process the same data. Prevent it with SELECT … FOR UPDATE (which locks the row), a version check, or by having a single scheduler run the job.
    - **Long transactions** hold locks, block cleanup of old row versions, block table changes, and delay replication. Never keep a 2-hour extract transaction open on a production database.
    - **Autocommit mode** commits each statement separately. If statement 3 of 5 fails, statements 1 and 2 are already saved, leaving partial changes.
    - **Assuming several lakehouse tables update together.** They don't; each table commits separately.
    - **Retrying after a timeout.** The first attempt may actually have succeeded, so a blind retry can duplicate data. Use idempotency keys: a unique ID per operation, so a repeat is recognised and ignored.

    ## Interview answers

    - **"Explain ACID."** "Atomicity: all steps happen or none do. Consistency: constraints always hold. Isolation: concurrent transactions don't see each other's unfinished work. Durability: once committed, a change survives crashes. For example, approving a claim, creating the credit note and updating the balance must happen together."
    - **"What's the default isolation level and what can still go wrong?"** "Usually read committed. It prevents dirty reads, but non-repeatable reads, phantoms and lost updates can still happen."
    - **"How does Delta Lake provide ACID?"** "Each write is an atomic commit to a transaction log, readers see consistent snapshots, and concurrent writers use optimistic concurrency, which detects conflicts at commit time."
    - **"How do you update a database and publish to Kafka reliably?"** "With the outbox pattern: write the event into an outbox table in the same transaction, then publish it through CDC, with consumers that tolerate duplicates."
  `),

  replication: T(`
    > **In one line:** replication means keeping **copies of the same data on several machines**, so the data survives machine failures, the system stays available, and reads can be spread across machines. The hard part is keeping the copies in agreement and knowing how far behind each copy is.

    ## The most common setup: leader and followers

    - One machine is the **leader** (also called primary). **All writes go to it.**
    - The leader sends its change log (the write-ahead log, or binlog in MySQL) to the other machines, called **followers** (or replicas). Each follower replays the changes in the same order.
    - Followers can answer **read** queries, which takes load off the leader.
    - If the leader dies, a follower is **promoted** to become the new leader. This is called **failover**.

    ## Synchronous vs asynchronous replication

    | | Synchronous | Asynchronous |
    |---|---|---|
    | When a write is confirmed | After the followers have also saved it | As soon as the leader has saved it |
    | If the leader crashes | Nothing is lost (followers have it) | The last few changes not yet sent are lost |
    | Write speed | Slower (waits for followers) | Faster |
    | If a follower is slow | Writes slow down or stop | No effect on writes |

    A common middle ground is **semi-synchronous**: wait for one follower, not all of them.

    ## Other replication designs

    - **Multi-leader:** several machines accept writes, for example one per region, so writes are fast locally. But two regions can change the same record at the same time, creating a **conflict**, so you need a rule to resolve it, such as "the latest write wins" or a custom merge.
    - **Leaderless** (Cassandra, DynamoDB): the client writes to several copies and reads from several copies, then takes the newest value. This uses a **quorum** rule: with N copies, if each write waits for W copies and each read asks R copies, and **W + R is greater than N**, then every read overlaps at least one copy that has the latest write. For example, with 3 copies, writing to 2 and reading from 2 guarantees you see the latest value.
    - **Consensus** (the Raft and Paxos algorithms, used by etcd, CockroachDB, Kafka's KRaft and Google Spanner): a majority of machines must agree on each write. This gives strong correctness and automatic failover.
    - **Physical replication** copies the database's raw disk pages, so both sides must run the same database version. **Logical replication** streams row-level changes ("row 9001 updated"), which works across versions and for selected tables. Logical replication is also what **CDC** tools such as Debezium use.

    ## Problems caused by replication lag

    Followers are usually slightly behind the leader. This delay is called **replication lag**, and it causes visible problems:
    - **Read-your-own-write fails:** you save a change on the leader, then read from a follower that hasn't received it, and your change seems to have vanished.
    - **Time appears to go backwards:** two reads hit two different followers, and the second one is further behind, so newer data seems to disappear.
    - **"Current" dashboards are stale** if they read from a lagging follower.

    Measure the lag and decide which reads may use followers. Extracting data from an asynchronous follower is fine, but **record exactly how far that follower had got** (its log position or time), so your next incremental extract continues from the right place.

    | System | How it replicates |
    |---|---|
    | PostgreSQL, MySQL | Leader-follower using the WAL/binlog; logical replication feeds CDC |
    | HDFS (Hadoop) | Each block stored on 3 machines, placed on different racks |
    | Kafka | Each partition has a leader and followers; the in-sync followers are called the **ISR**; acks=all plus min.insync.replicas=2 means a write is confirmed only once at least 2 copies have it |
    | Cassandra, DynamoDB | Leaderless; you choose how many copies to wait for on each request |
    | Cloud object storage (S3, ADLS) | Copies within a region are automatic; copying to another region is optional |

    ## Replication is not a backup

    If someone runs DELETE without a WHERE clause, the delete is **replicated to every copy within milliseconds**, and every copy is now empty. Replication protects against **hardware failure**. **Backups and time travel** (the ability to read an older version of a table) protect against **human or software mistakes**. You need both.

    ## What goes wrong

    - **Split brain.** A network fault makes two machines both believe they are the leader. Both accept writes, and the data diverges. Prevent it with consensus/quorum rules and **fencing**, which blocks the old leader from writing.
    - **Asynchronous failover loses data.** The last few seconds of writes on the old leader never reached the new one, and auto-generated IDs may even be reused.
    - **CDC from a lagging follower is also behind.**
    - **Unused replication slots fill the disk.** In Postgres, a CDC connector reads changes through a "replication slot". If the connector stops, the database keeps all the log files it hasn't consumed, until the disk fills and the production database stops.
    - **After failover, the CDC position may not exist on the new leader**, so CDC must take a fresh snapshot (or the platform must also fail over the slot).
    - **Kafka with acks=1** confirms a write once only the leader has it. If the leader dies before followers copy it, the message is lost.
    - **Copying across regions** adds cost and latency that teams don't expect.

    ## Interview answers

    - **"Synchronous vs asynchronous replication?"** "Synchronous waits for followers, so no data is lost on failover, but writes are slower and a slow follower holds things up. Asynchronous is faster, but the last unsent changes can be lost if the leader crashes."
    - **"Risks of extracting from a read replica?"** "The replica may be behind, so the data can be stale and incremental extracts can miss rows. I record the replica's position and monitor lag."
    - **"Is replication a backup?"** "No. A bad delete replicates instantly. Backups and time travel protect against mistakes; replication protects against hardware failure."
    - **"What does W + R > N mean?"** "If writes wait for W copies and reads check R copies out of N, and W + R is more than N, every read sees at least one copy with the latest write."
  `),

  dbpartition: T(`
    > **In one line:** partitioning means **splitting a large table into smaller pieces** using a rule, such as by date, region or a hash of a key. Queries can then **skip the pieces they don't need**, maintenance can work **one piece at a time**, and data can be **spread across machines**. Choosing the partition key is an important design decision that is hard to change later.

    ## "Partition" means three different things

    People use the word in three ways, so say which one you mean:
    1. **Inside one system**, for skipping data and easier management. Example: a table split by month, or lake folders such as /event_date=2026-11-26/.
    2. **Across machines**, usually called **sharding**. Example: Cassandra spreading engines across nodes, or a Kafka topic split into partitions.
    3. **In Spark**, a partition is simply one chunk of data processed by one task.

    ## Ways to partition

    | Strategy | How rows are assigned | Good for | Risk |
    |---|---|---|---|
    | Range | By value ranges, such as dates or ID ranges | Time-based queries; dropping old data | All new data lands in the latest partition, which can overload it |
    | List | By explicit values, such as region = 'West' | Known categories | Pieces can be very uneven in size |
    | Hash | hash(key) mod N (a scrambled key decides the piece) | Spreading data evenly | A date-range query must check every piece; changing N reshuffles everything unless you use consistent hashing |
    | Composite | First by range (date), then by hash within each range | Time queries plus an even spread | More complex |

    ## What partitioning gives you

    - **Pruning (skipping data).** A query with WHERE event_date = '2026-11-26' on a table partitioned by date reads 1 of 1,000 partitions instead of all of them.
    - **Instant deletion of old data.** Deleting a year means dropping 365 partitions, which takes seconds, instead of running a huge DELETE.
    - **Safe re-runs.** Each daily run **overwrites exactly its own day's partition** (INSERT OVERWRITE or Delta's replaceWhere). Running it twice gives the same result, with no duplicates.
    - **Parallel work,** because different workers can process different partitions.
    - **Maintenance per piece,** such as compacting or reindexing one partition at a time.

    ## How to choose a partition key

    1. Pick a column that **queries filter on**. This is usually the date.
    2. For folder-style partitions, use a column with a **small or moderate number of distinct values**. Date is good. engine_id with 100,000 values is bad, because it creates 100,000 tiny folders.
    3. Aim for partitions of **at least about 1 GB** in a lakehouse, with files of roughly 128 MB to 1 GB. Thousands of tiny partitions are worse than no partitions.
    4. Use **values that don't change**. Partitioning by status would force rows to move between partitions every time the status changes.
    5. **Match how data is loaded.** Daily loads suggest daily partitions.
    6. **Sharding is different:** there you want many distinct values that spread evenly and keep related data together, such as engine_id. A shard key is nearly impossible to change later.

    ## In a lakehouse

    - Lakes use **Hive-style folders** (/event_date=2026-11-26/), and the engine skips folders based on the path.
    - For other columns people filter on, **don't add more partition columns**. Use **clustering, Z-order or liquid clustering**, which store similar values close together inside files so they can be skipped.
    - **Iceberg hidden partitioning** stores a rule such as "partition by day(ts)". People filter on ts as normal and Iceberg still skips data. The partition scheme can also be changed later without rewriting old data.
    - Databricks advises **not partitioning tables smaller than about 1 TB**. Use clustering instead.

    ## What goes wrong

    - **Over-partitioning.** Partitioning by date and engine_id creates millions of folders full of tiny files, and planning the query takes longer than reading the data.
    - **Filtering on a function of the partition column.** If the table is partitioned by event_date but the query says WHERE year(event_ts) = 2026, nothing is skipped. Filter on the partition column itself.
    - **Uneven (skewed) partitions,** for example one region holding 70% of the data.
    - **Late-arriving data** belongs in old partitions. A daily overwrite must also re-process the last few days (a **lookback window**), or late rows are missed.
    - **Mixing local and UTC dates** splits days differently. Be consistent.
    - **Sharding by time range** sends all of today's writes to one machine.

    ## Interview answers

    - **"How would you partition a 5 TB events table?"** "By event date, daily, then cluster by the column people filter on most, such as engine_id. I'd keep file sizes healthy with compaction and avoid partitioning on any high-cardinality column."
    - **"What is partition pruning?"** "The engine skips partitions that can't match the filter before reading any data."
    - **"Range vs hash partitioning?"** "Range keeps related values together, which is good for time queries, but new data concentrates in one piece. Hash spreads data evenly, but range queries must touch every piece."
  `),

  scaling: T(`
    > **In one line:** **vertical scaling** (scaling up) means using a **bigger machine**. **Horizontal scaling** (scaling out) means using **more machines**. Scaling up is simple but has a ceiling and is a single point of failure. Scaling out is nearly unlimited but brings the problems of distributed systems.

    ## Side by side

    | | Vertical (scale up) | Horizontal (scale out) |
    |---|---|---|
    | How | Move to a bigger machine, e.g. from 8 to 64 CPU cores and from 32 GB to 512 GB of memory | Split the data across machines (sharding), spread work across a cluster (Spark), add more copies of a service behind a load balancer, or add consumers in a Kafka consumer group |
    | Advantages | No code changes; correctness stays simple; only one machine to run | Grows almost without limit; uses cheap standard machines; survives machine failures; cloud can add or remove machines on demand |
    | Disadvantages | The biggest machines are very expensive; there is a hard upper limit; resizing may need downtime; one failure stops everything | Network and data-shuffling become bottlenecks; machines must coordinate; some machines fail while others keep going; harder to operate; not every task can be split |
    | Typical use | App databases; DuckDB or pandas on one machine; most moderate pipelines | Big data processing, streaming, large serving systems |

    ## The rules behind scaling

    - **Amdahl's law:** if 10% of a job must run step by step (it can't be split), then no cluster can make the whole job more than 10 times faster. Find and remove those sequential parts, such as work done only on the Spark driver, one final sort, or one giant key.
    - **Coordination costs:** more machines means more communication. Adding machines to a job that moves lots of data between them can actually make it **slower**.
    - **Stateless parts scale easily; stateful parts don't.** A web service that keeps no data can simply be copied. Adding a database node means moving data onto it.
    - **Reads are easy to scale; writes are hard.** Reads scale with read copies and caches. Writes need sharding or a distributed database. Heavy analytics scale best by moving them off the app database entirely.

    ## What to scale for which bottleneck

    | Bottleneck | Scale up | Scale out |
    |---|---|---|
    | Slow query (CPU) | A bigger warehouse size | More nodes or clusters |
    | Too many dashboard users at once | A bigger machine | Multi-cluster warehouses, read copies, caching |
    | Streaming can't keep up | A faster consumer | More Kafka partitions and more consumers |
    | Slow Spark job | Bigger executors (worker processes) | More executors and partitions |
    | Too many writes on an app database | A bigger primary server | Sharding, or a distributed SQL database |

    For databases, scaling up first is often the right call. Note that PostgreSQL also has a **connection limit**, because each connection uses a whole process. Use a connection pooler such as PgBouncer, and limit how many parallel connections a Spark job opens.

    **Elasticity** means the cloud adds machines for the nightly batch and removes them afterwards (autoscaling, serverless, auto-suspend). The limits are machine start-up time, minimum sizes, account quotas, and badly written queries that trigger expensive scale-out.

    ## Do less work before adding machines

    Most slow jobs are slow because they do unnecessary work. Before scaling:
    - **Read less:** skip partitions, select only the needed columns, filter early.
    - **Process less:** handle only new or changed data (incremental processing).
    - **Move less:** broadcast small tables in joins instead of shuffling big ones, and avoid unneeded repartitioning.
    - **Fix skew:** uneven data where one task gets far more work than the others.

    **Measure first, then scale.**

    ## What goes wrong

    - **Scaling out a skewed job.** 199 tasks finish in 1 minute and 1 task takes 40 minutes. More machines don't help, because that one task still runs on one machine.
    - **Driver bottleneck.** Collecting data to the Spark driver, or single-threaded Python code, doesn't use the cluster at all.
    - **Too many tiny partitions:** the overhead of managing tasks exceeds the actual work.
    - **A shared bottleneck:** 50 workers all calling one rate-limited API or one database just hit that limit faster.
    - **Hot keys in sharded stores:** one popular key overloads one shard however many shards you add.

    ## Interview answers

    - **"Vertical vs horizontal scaling?"** "Vertical means a bigger machine: simple, but limited and a single point of failure. Horizontal means more machines: nearly unlimited, but it needs data splitting, coordination and handling of partial failures."
    - **"A Spark job is slow. Do you add nodes?"** "Not first. I check for skew, large shuffles, small files, work stuck on the driver, and how much data it reads. Then I scale if it's still needed."
    - **"How do you scale Kafka consumers?"** "Add consumers to the consumer group, up to the number of partitions, because each partition is read by only one consumer in a group. Beyond that, you need more partitions."
  `),

  schema: T(`
    > **In one line:** a **schema** is the agreed structure of data: the column names, their types, whether they can be empty, the keys, and what each column means. **Schema evolution** is changing that structure **without breaking** the systems that write or read the data. Most pipeline outages trace back to a schema change that nobody managed.

    ## Schema-on-write vs schema-on-read

    - **Schema-on-write:** the structure is checked **when data is written**, and bad data is rejected immediately. Relational databases, Delta tables and Kafka with a schema registry work this way. It is safer, but less flexible.
    - **Schema-on-read:** data is stored as it arrives (for example raw JSON files in a lake), and the structure is applied **when someone reads it**. It is flexible, but every reader must cope with every variation, and errors appear late.

    **Common practice:** schema-on-read for the raw (bronze) layer, so nothing is lost, and schema-on-write from the cleaned (silver) layer onwards, so data is trustworthy.

    ## Which changes are safe?

    | Change | Risk |
    |---|---|
    | Add an optional column | Usually safe |
    | Add a required column | Breaks old producers that don't send it |
    | Remove a column | Breaks anyone reading that column |
    | Rename a column | Breaks everyone; it's really a remove plus an add |
    | Widen a type (INT to BIGINT, FLOAT to DOUBLE) | Usually safe |
    | Narrow or change a type | Fails, or cuts off data |
    | Change the meaning (amount now excludes tax) | **Silent danger:** nothing errors, but numbers shift |
    | Change the grain (one row per claim becomes one row per claim line) | **Silent danger:** totals get double-counted |
    | Change whether a column may be empty | Breaks code that assumed it is never empty |

    The silent changes are the worst, because no error is raised; the numbers are simply wrong.

    ## Compatibility rules in Kafka schema registries

    In streaming, producers write messages with a schema (in Avro, Protobuf or JSON Schema format), and a **schema registry** stores every version and checks each new one:
    - **Backward compatible:** consumers using the **new** schema can read data written with the **old** one. Typical example: adding a field with a default value. **Upgrade consumers first.**
    - **Forward compatible:** consumers using the **old** schema can read data written with the **new** one. Typical example: adding a field old readers simply ignore, or removing an optional field. **Upgrade producers first.**
    - **Full:** both directions work.
    - **Transitive:** compatible with **all** previous versions, not just the latest one.

    The registry **rejects a producer that tries to publish an incompatible schema**. What would have been a production outage becomes a failed deployment.

    ## Schema changes in a lakehouse

    - **Delta Lake enforces the schema by default:** a write with unexpected columns or types is rejected.
      - The mergeSchema option allows adding new columns; overwriteSchema replaces the schema entirely.
      - **Column mapping** allows renaming or dropping columns without rewriting data files.
      - **Type widening** allows safe promotions such as INT to BIGINT.
      - Enabling newer table features can stop older readers from opening the table, so check who reads it first.
    - **Iceberg** tracks each column by an internal ID rather than by name, so adding, dropping, renaming and reordering columns only change metadata. It also allows changing the partition scheme.
    - **Databricks Auto Loader** puts unexpected fields and values with the wrong type into a special **_rescued_data** column, instead of failing or silently losing them.

    ## A safe process for changing a schema

    1. **Classify the change:** additive (adding something), breaking (removing, renaming, changing types) or semantic (changing meaning).
    2. **Additive changes:** deploy, then document.
    3. **Breaking changes: expand, migrate, contract.**
       - **Expand:** add the new column alongside the old one.
       - **Migrate:** fill the new column for old data (backfill), then move every consumer over. Use **lineage** (a map of who reads what) to find them.
       - **Contract:** remove the old column after an announced date.
       - Never rename or drop a column on a shared table in one step.
    4. **Semantic changes:** treat them as breaking. Give the column a new name or the dataset a new version, and announce it.
    5. **Automate the checks:** contract tests in the producer's CI, schema checks at ingestion, and alerts when the schema drifts.

    By layer: bronze tolerates changes, silver evolves deliberately under agreed contracts, and gold changes only through versioned releases.

    ## What goes wrong

    - **A renamed source column quietly becomes empty.** The pipeline reads the column by its old name, a lenient reader returns NULL, and the job still reports success.
    - **JSON type drift.** When types are guessed (inferred) from each file, one file says amount is a number and another says it's text.
    - **Inference from a sample** misses a rare field that only appears later.
    - **INSERT … SELECT * matches columns by position, not name.** If the column order changes, values land in the wrong columns. Match columns by name.
    - **CSV header changes** break code that reads columns by position.
    - **Years of Parquet files with different schemas** must be merged when read together, or managed by a table format.
    - **BI extracts with a fixed schema break** when a column changes.

    ## Interview answers

    - **"A source adds or renames a column. What happens, and what should happen?"** "An added optional column should be absorbed automatically or flagged. A rename should be caught by schema checks rather than turning silently into NULLs, and then rolled out with expand-migrate-contract."
    - **"Backward vs forward compatibility?"** "Backward means new readers can read old data, so consumers upgrade first. Forward means old readers can read new data, so producers upgrade first."
    - **"How do you roll out a breaking schema change?"** "Expand, migrate, contract: add the new structure alongside the old, backfill, move consumers found through lineage, then remove the old structure after a deprecation date, with clear communication."
  `),

  fileformats: T(`
    > **In one line:** a file format decides how the bytes are laid out: text or binary, by row or by column, with or without a schema, splittable or not, compressible or not. The right format can make the same query **10 to 100 times cheaper**. As a rule: **CSV/JSON for exchanging data, Avro for streaming, Parquet (inside Delta or Iceberg) for analysis.**

    ## The main formats compared

    | | CSV | JSON (Lines) | Avro | Parquet | ORC |
    |---|---|---|---|---|---|
    | Layout | Rows, plain text | Rows, plain text | Rows, binary | Columns | Columns |
    | Stores types/schema? | No | Only implied, weak | Yes, and it can evolve | Yes, in the file footer | Yes |
    | Nested data? | No | Yes | Yes | Yes | Yes |
    | Compression | Poor | Poor | Good | Excellent | Excellent |
    | Can be split for parallel reading? | Only if uncompressed or bzip2 | Only JSON Lines | Yes | Yes | Yes |
    | Best for | Exchanging with partners, small exports | APIs, events, raw landing | Kafka, streaming, lots of writes | Analytics on stored data | Hive-based systems |

    ## Each format in plain words

    **CSV (comma-separated values).** Readable by anyone and supported everywhere. But it stores no types (everything is text), and it has many parsing traps: commas inside values, quotes, line breaks inside fields, different text encodings. It is also large and slow to process.

    **JSON.** Flexible and supports nested data. But it repeats every field name in every record, so files are large; parsing is slow; and types can drift (amount is a number in one record and text in another). **JSON Lines** (one JSON object per line) is the better variant for data, because a file can be split and read in a stream.

    **Avro.** A compact binary row format that carries its schema (in the file header or via a schema registry) and handles schema changes well, using default values and aliases. It isn't human-readable and is poor for analytical scans. It is the usual choice for Kafka messages.

    **Parquet.** A columnar format (see the row vs column topic). A file is split into row groups, then column chunks, then pages, with min/max statistics and compression. It lets queries read only the needed columns and skip chunks, and it supports nested data. Its weaknesses: writing row by row is expensive, files can't be edited (updating means rewriting), and safe transactions need a table format on top. Two practical tips: store timestamps as INT64 (the older INT96 type is legacy), and very wide tables with thousands of columns make the footer and query planning slow.

    **ORC.** Similar to Parquet, with built-in indexes and bloom filters. Popular in Hive and Presto systems.

    **Table formats are not file formats.** Delta Lake, Iceberg and Hudi are a **metadata layer on top of Parquet files**: a log of changes, the schema, snapshots and statistics. They add transactions, time travel and schema enforcement.

    **VARIANT** (in Spark 4, Databricks and Iceberg v3) is a newer column type that stores semi-structured JSON efficiently in binary form, with frequently used fields pulled out for speed. It sits between storing JSON as plain text and forcing it into rigid columns.

    ## Why "splittable" matters

    Engines like Spark go fast by giving each worker a different piece of a file. Uncompressed CSV and JSON Lines can be split, because a worker can start in the middle and find the next line break. **A GZIP-compressed CSV cannot be split**: gzip must be decompressed from the very beginning. So a single 50 GB .csv.gz file is read by **one worker** while the rest of the cluster sits idle. The fixes are to split it into many smaller files, use bzip2 (splittable but slow), or convert it to Parquet. Parquet, Avro and ORC are splittable with any compression. One giant JSON array (as opposed to JSON Lines) is not splittable.

    ## The usual pipeline

    «««flow
    Source export (CSV/JSON) -> Raw copy exactly as received (bronze) -> Parquet/Delta with an enforced schema (silver) -> Business tables in Delta (gold) -> Exports in whatever format the consumer needs
    »»»
    Kafka messages are usually Avro (or Protobuf, or JSON with a registry).

    ## What goes wrong

    - **CSV parsing traps:** commas inside quoted values, line breaks inside fields, escape characters, trailing delimiters, mixed line endings, invisible byte-order marks (BOMs), non-UTF-8 text, thousands separators ("1,250.00"), and ambiguous dates (is 03/04 the 3rd of April or the 4th of March?). **Always specify** the delimiter, quote character, escape character, encoding, header and date format, and give an **explicit schema**. Never rely on automatic guessing (inference) in production.
    - **Inference from a sample** breaks when later rows look different.
    - **Parquet files that disagree on a type** (INT in one, DOUBLE in another) or on decimal precision.
    - **Timestamp mismatches:** INT96 vs INT64, UTC vs local time, milliseconds vs microseconds.
    - **Many small Parquet files** slow everything down, so compact them.

    ## Interview answers

    - **"Why Parquet?"** "It's columnar, so queries read only the columns they need. It compresses well, stores min/max statistics for skipping, is splittable, and carries its schema."
    - **"Parquet vs Avro?"** "Parquet is columnar and best for analytical reads. Avro is row-based and best for streaming and record-by-record writes, with strong schema evolution."
    - **"A 40 GB .csv.gz file is processed by one core. Why?"** "GZIP isn't splittable, so only one worker can read it. I'd split it into smaller files or convert it to Parquet."
  `),

  compression: T(`
    > **In one line:** compression reduces the number of bytes you **store, read and send over the network**, trading a little CPU work for much less disk and network work. Columnar formats compress in two layers: **encodings**, which exploit patterns within a column, then a general **codec** (Snappy, ZSTD or GZIP) that squeezes the result further.

    ## Why compression makes things faster, not slower

    In data systems the slow part is usually **reading from storage and moving data over the network**, not the CPU. A modern CPU decompresses data faster than disks and networks can deliver it. Compressing 100 GB down to 15 GB means 85% less data to read and move. On engines that charge per byte scanned, such as BigQuery, the bill also shrinks.

    ## Layer 1: encodings (inside each column)

    | Encoding | How it works | Example |
    |---|---|---|
    | Dictionary | Each distinct value is stored once, and the column becomes a list of small numbers pointing to them | status: Approved = 0, Rejected = 1 |
    | Run-length (RLE) | A run of identical values is stored as "value × count" | "West × 10,000" instead of writing West 10,000 times |
    | Delta | Stores the difference from the previous value instead of the full value | Timestamps one second apart become +1, +1, +1 |
    | Bit-packing | Uses only as many bits as the numbers need | Values from 0 to 7 need 3 bits, not 32 |

    Parquet applies these automatically for each column chunk. **Sorting data by low-variety columns (like region or status) before writing** makes them far more effective, because equal values end up next to each other. The encodings usually do most of the work.

    ## Layer 2: codecs (general compression)

    | Codec | How small | How fast | Typical use |
    |---|---|---|---|
    | Snappy | Moderate | Very fast | Spark's long-time default for Parquet; frequently read data |
    | **ZSTD** | High | Fast, and adjustable | The modern balanced default |
    | LZ4 | Moderate | Fastest | Kafka, real-time systems |
    | GZIP | High | Slow | Text files and archives; a whole gzip file **can't be split** |
    | bzip2 | High | Very slow | Rare archival text; can be split |

    **Inside Parquet, ORC and Avro, the codec compresses each small page or block separately,** so these files **remain splittable whatever codec you use**. The splitting problem only applies to text files compressed as one whole file, such as one big .csv.gz.

    ## Choosing

    - **Frequently read ("hot") data:** Snappy or a low ZSTD level.
    - **Rarely read ("cold") or archive data:** a high ZSTD level or GZIP. You pay the CPU cost once and save storage forever.
    - **Kafka:** LZ4 or ZSTD, with batching. Bigger batches compress better.
    - **Text files for exchange:** GZIP, split into parts of about 256 MB.

    **Trade-off:** compressing costs CPU when writing, but makes every later read smaller and faster. That is worth it for data read many times. Data that is already compressed (images, video, encrypted data) won't shrink further.

    ## What goes wrong

    - **One giant gzip file** turns a 100-core cluster into a single core, because it can't be split.
    - **Tiny files** compress poorly, because there's too little data to find patterns. Fix file sizes first.
    - **Encrypting before compressing** makes data incompressible, because encrypted bytes look random. Compress first, then encrypt. (Parquet's built-in "modular encryption" does this correctly.)
    - **Random unique strings** such as UUIDs and hashes barely compress. Store them in binary form, or ask whether you need them.
    - **Compressed size isn't memory size.** A 1 GB compressed file may expand to 10 GB in memory, so size Spark executors for the decompressed data.

    ## Interview answers

    - **"Snappy vs GZIP vs ZSTD?"** "Snappy is very fast with moderate compression. GZIP compresses well but is slow, and whole gzip files can't be split. ZSTD gives near-GZIP compression at near-Snappy speed, so it's the modern balanced choice."
    - **"Why does compression make queries faster?"** "Queries are usually limited by reading and moving data, not by CPU. Compression means fewer bytes to read, and decompression is cheap."
    - **"Is a Snappy-compressed Parquet file splittable?"** "Yes. Parquet compresses each page within each row group separately, so the file can still be split by row group."
  `),
};
