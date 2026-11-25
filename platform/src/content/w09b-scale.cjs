const { learn, mcq, tf, multi, match, order, viz, scenario, talk, world, lesson } = require('./_h.cjs');

module.exports = world('scale', 'Scale Lab: 100 million and beyond', 'gap closer',
  'Back-of-envelope sizing and the "what if it is 100 million requests / 1 billion events / 10 TB" questions, worked end to end with numbers, architecture choices and failure handling.',
  [
    lesson('x1', 'Numbers every data engineer should know', 18, [
      learn('Your sizing cheat sheet', `
        **Time:** 1 day = 86,400 s ≈ **10⁵ s**. So *X per day ÷ 100,000 ≈ X per second (average)*. Peaks are often **3-10× the average**.

        | Quantity | Rough number |
        |---|---|
        | 1 million/day | ≈ 12 per second |
        | 100 million/day | ≈ 1,200/s average, plan for ~5,000-10,000/s peak |
        | 1 billion/day | ≈ 12,000/s average |
        | A JSON event | 0.2-2 KB |
        | CSV → Parquet (compressed) | 5-10× smaller |
        | Spark partition target | 100-200 MB |
        | One Spark core | ~roughly tens of MB/s of simple transforms (varies hugely) |
        | One Kafka partition | ~10 MB/s write is a comfortable planning number |
        | S3/ADLS single-stream upload | ~50-100 MB/s; parallelise for more |
        | 1 Gbps network | ≈ 125 MB/s ≈ 10 TB/day max |

        **Method:** rate × size = throughput; throughput × time = volume; volume ÷ partition size = partitions; partitions ÷ cores = waves. Round aggressively and state your assumptions out loud: interviewers care about the reasoning, not the decimals.
      `),
      viz('napkin', 'Warm-up estimates', '', {
        questions: [
          { q: '**100 million** events per day. Average events per **second**?', unit: 'events/s', answer: 1157, why: '100,000,000 ÷ 86,400 ≈ 1,157/s. Plan for peaks of ~5-10×.', hint: '100e6 / 86400' },
          { q: 'Each event is **1 KB**. Raw volume per **day** in GB?', unit: 'GB/day', answer: 100, why: '100M × 1 KB = 100 GB/day raw (~10-20 GB as Parquet).', hint: '100e6 * 1e3 / 1e9' },
          { q: 'Keep **1 year** of that raw data. How many **TB**?', unit: 'TB', answer: 36.5, why: '100 GB × 365 ≈ 36.5 TB raw. That is why you compress, partition and tier old data.', hint: '100 * 365 / 1000' },
          { q: 'A daily Spark job reads one day as **Parquet at 15 GB**. With 128 MB partitions, how many tasks?', unit: 'tasks', answer: 117, why: '15,000 MB ÷ 128 MB ≈ 117 tasks. With 40 cores that is ~3 waves.', hint: '15000 / 128' },
        ],
      }),
      mcq('An API returns 2 KB per call and you must make 5 million calls per day. Daily data volume?', ['10 MB', '10 GB', '10 TB', '1 GB'], 1, '5 × 10⁶ × 2 × 10³ B = 10¹⁰ B = 10 GB.'),
      tf('When sizing, it is fine to round 86,400 seconds/day to 100,000.', true, 'Within 15%, and it makes mental math fast. Say "roughly".'),
    ]),
    lesson('x2', 'Ingesting 100 million API requests a day', 22, [
      learn('Case: pulling from a high-volume API', `
        *"A dealer telematics API must be called 100 million times a day (one call per engine-reading batch). How would you build ingestion?"*

        **1. Numbers:** ~1,200 calls/s average, peaks of ~6,000/s. At 1 KB/response that's ~100 GB/day raw.

        **2. The API is the bottleneck.** Ask: rate limit? Bulk/batch endpoint? Webhooks or a stream instead of polling? *Prefer push (events/webhooks into Kafka) or bulk exports over 100M individual pulls.* The best answer often removes the problem.

        **3. If you must poll:**
        - Partition the work: split engine IDs into N shards. Run N concurrent async workers (Python «asyncio»/«aiohttp», or a Spark job doing «mapPartitions» with a session per partition).
        - Respect rate limits with a **token bucket** per API key; exponential backoff with jitter on 429/5xx.
        - **Idempotent keys**: request id = (engine_id, window); landing writes are keyed so retries don't duplicate.
        - **Checkpoint progress** (which shards/windows are done) so a crash resumes, not restarts.
        - Write responses in **micro-batches** (e.g. every 60 s or 50 MB) as compressed files or into Kafka. Never one file per call (100M tiny files).

        **4. Landing:** Kafka topic (keyed by engine) → bronze Delta; or batch files → bronze, partitioned by ingest date/hour.

        **5. Observability:** calls/s, error rate by status code, retry counts, rate-limit headroom, lag vs schedule, dead-letter of permanently failing IDs.

        **6. Scale out:** more shards/workers until you hit the API limit, then negotiate a bulk endpoint.
      `),
      viz('napkin', 'Size it', '', {
        facts: 'API limit: **2,000 requests/second** per API key. Each worker handles **50 requests/second** (network-bound). 100 M calls must finish within **24 hours**.',
        questions: [
          { q: 'Minimum average rate needed (requests/s)?', unit: 'req/s', answer: 1157, why: '100M ÷ 86,400 ≈ 1,160/s, which fits under the 2,000/s limit, but only ~58% headroom.', hint: '100e6/86400' },
          { q: 'How many workers to reach that rate?', unit: 'workers', answer: 24, tol: 0.3, why: '1,160 ÷ 50 ≈ 23-24 workers. Add ~30% for retries and peaks → ~30.', hint: '1157/50' },
          { q: 'If you must finish in **8 hours** instead, what rate is needed?', unit: 'req/s', answer: 3472, why: '100M ÷ 28,800 s ≈ 3,470/s: **above the 2,000/s limit**. You need more API keys, a bulk endpoint, or a longer window. Say this out loud in the interview.', hint: '100e6 / (8*3600)' },
        ],
      }),
      scenario('The API starts throttling at 9 AM', `Your 100M/day ingestion runs 30 workers. At 09:00, 40% of calls return **429 Too Many Requests** and lag is growing.`, [
        ['Immediate action?', [
          ['Back off: exponential backoff with jitter and reduce concurrency to stay under the limit; failed calls are retried, not dropped', true, 'Hammering a throttling API makes it worse and can get your key blocked.'],
          ['Double the workers', false, 'More pressure on a rate-limited API means more 429s.'],
          ['Skip failed calls', false, 'Silent data loss.'],
        ]],
        ['Lag will still miss the daily SLA. Structural fix?', [
          ['Ask for a bulk/export endpoint or event push (webhooks/stream), or additional rate-limit quota; meanwhile prioritise critical engines', true, 'Change the interface when the call volume itself is the problem.'],
          ['Cache responses forever', false, 'Telemetry changes; stale data is wrong data.'],
        ]],
        ['How do you prove no data was lost after the incident?', [
          ['Reconcile: expected (engine, window) keys vs landed keys, and re-request the gaps idempotently', true, 'Completeness checks against an expected key set turn "probably fine" into proof.'],
          ['Assume it caught up', false, 'Hope is not a control.'],
        ]],
      ]),
      talk('Answer out loud: *"How would you handle 100 million requests a day?"*', `
        1. **Clarify**: requests *to us* (serving) or *by us* to an API (ingestion)? Latency needs? Payload size? Peaks?
        2. **Numbers**: 100M/day ≈ 1,200/s average, plan for 5-10k/s peak; × payload = GB/day.
        3. **Decouple with a queue/log** (Kafka/Event Hubs): producers write at their pace, consumers scale horizontally by partitions; absorbs spikes (backpressure).
        4. **Horizontal scaling**: stateless workers, partition by key, autoscale on lag.
        5. **Idempotency + retries** with backoff, dead-letter queue for poison messages, exactly-once *effect* via keyed upserts.
        6. **Batching** writes (micro-batches to Delta/Parquet, avoid small files), partition by date/hour.
        7. **Rate limits/quotas** if calling an external API, plus bulk/push alternatives.
        8. **Observability**: throughput, error rates, lag, p95 latency, alerting; **capacity tests** at 2× peak.
        9. **Cost**: right-size, autoscale, compress, tier storage.
      `),
    ]),
    lesson('x3', 'One billion events a day, streaming', 20, [
      viz('napkin', 'Size the stream', '', {
        facts: '**1 billion** telemetry events/day, **500 bytes** each, peak = **4×** average. Plan **10 MB/s** per Kafka partition. Keep **7 days** in Kafka with replication factor **3**.',
        questions: [
          { q: 'Average events per second?', unit: 'events/s', answer: 11574, why: '10⁹ ÷ 86,400 ≈ 11,600/s.', hint: '1e9/86400' },
          { q: 'Peak throughput in MB/s?', unit: 'MB/s', answer: 23, tol: 0.3, why: '11,600 × 4 × 500 B ≈ 23 MB/s peak.', hint: '11574*4*500/1e6' },
          { q: 'Minimum partitions for peak (at 10 MB/s each)? Round up.', unit: 'partitions', answer: 3, tol: 0.34, why: '23 ÷ 10 ≈ 3, but you would pick **12-24** for consumer parallelism and headroom. Partitions also cap how many consumers can work in parallel.', hint: '23/10' },
          { q: 'Kafka disk for 7 days × replication 3, in TB?', unit: 'TB', answer: 10.5, why: '0.5 TB/day × 7 × 3 ≈ 10.5 TB (before compression).', hint: '1e9*500/1e12 * 7 * 3' },
        ],
      }),
      learn('Architecture for 1B events/day', `
        «««flow
        Devices -> IoT gateway -> Kafka (24 partitions, key=engine_id, RF=3) -> Structured Streaming (hot path: alerts) -> Delta bronze (cold path) -> silver/gold batch + streaming aggregates
        »»»
        - **Partitioning**: key by engine for ordering; enough partitions for peak and for consumer parallelism; watch hot keys.
        - **Consumers scale** up to the partition count. Autoscale on lag.
        - **Write path**: micro-batches every 30-60 s into Delta, partitioned by date (and hour if needed), clustered by engine_id; compaction job hourly to fix small files.
        - **State**: windowed aggregations with watermarks to bound memory.
        - **Backpressure**: limit «maxOffsetsPerTrigger» so a backlog after an outage doesn't overload the cluster.
        - **Exactly-once effect**: checkpoints + transactional Delta sink + dedupe on event_id within the watermark.
        - **Replay**: Kafka retention + bronze lets you rebuild silver/gold after a bug.
      `),
      mcq('After a 3-hour outage, the streaming job restarts and tries to process 3 hours of backlog in one micro-batch, then crashes. Fix?', ['Delete the backlog', 'Cap input per trigger (maxOffsetsPerTrigger) so it catches up in controlled batches, and scale out temporarily', 'Reduce partitions', 'Switch to at-most-once'], 1),
      multi('Good choices for a 1B events/day lake sink:', ['Micro-batches of 30-60 s into Delta', 'One file per event', 'Partition by event date, cluster by engine_id', 'Hourly compaction (OPTIMIZE)', 'Partition by event_id'], [0, 2, 3]),
    ]),
    lesson('x4', 'Huge batch: big joins, dedup and backfills', 22, [
      learn('Patterns for very large batch jobs', `
        **Join 500M fact rows × 50M customers (both large)**
        - Filter and **project early** (only needed columns, only needed dates).
        - **Pre-aggregate** the fact if the output is aggregated anyway.
        - Sort-merge join is expected; ensure **even keys** (check skew, handle NULL keys separately), size shuffle partitions so each is ~100-200 MB (e.g. 2 TB shuffle → ~10-20k partitions; let AQE coalesce).
        - If customers can be reduced to the active subset (< a few hundred MB), **broadcast** it.
        - **Bucketing / clustering** both tables by customer_id for repeated joins avoids reshuffling every run.

        **Deduplicate 2 billion rows**
        - «dropDuplicates(["event_id"])» = a shuffle of 2B rows. Fine on a cluster, but do it **incrementally**: dedupe only new data against recent keys (window of N days) with MERGE … WHEN NOT MATCHED INSERT.
        - Keep "latest per key" with row_number when versions differ.

        **Backfill 3 years / 10 TB after a logic fix**
        - Parameterised, **idempotent** job per partition (day/month); run partitions in parallel batches (e.g. 30 days at a time); track progress in a control table; resume on failure.
        - Write to a **new table/version**, validate (counts, sums vs old), then swap atomically; consumers never see half a backfill.
        - Throttle so production jobs keep their capacity; estimate cost first.
      `),
      scenario('A 10 TB backfill', `A bug in currency conversion affected **3 years** of the finance claims mart (~10 TB). You must fix history without disrupting daily loads.`, [
        ['How do you structure the backfill?', [
          ['Idempotent job per month, run in controlled parallel batches with a progress/control table, writing to a new version of the table', true, 'Restartable, parallel, isolated from the live table.'],
          ['One giant job over 3 years', false, 'Hours of work lost if it fails at 95%, and it starves other jobs.'],
          ['Patch rows with UPDATE statements by hand', false, 'Untestable and unrepeatable.'],
        ]],
        ['How do you release it?', [
          ['Validate (row counts equal, amounts change only where currency was affected), then swap atomically and notify Finance with a change summary', true, 'Validate, swap, communicate. Restatements of finance data need sign-off.'],
          ['Overwrite partition by partition in the live table during business hours', false, 'Consumers see a mix of old and new numbers.'],
        ]],
      ]),
      scenario('Join of two huge tables keeps failing', `A nightly join of «telemetry_daily» (800M rows) with «engine_service_history» (120M rows) fails with executor out-of-memory after 2 hours.`, [
        ['First diagnostic step?', [
          ['Spark UI: check task size distribution and spills in the join stage for skew or oversized partitions', true, 'OOM in a join is usually skew or too-big partitions.'],
          ['Add more memory per executor immediately', false, 'May mask skew and multiply cost.'],
        ]],
        ['One engine_id = 0 ("unknown") has 90M rows. Fix?', [
          ['Handle the NULL/unknown key separately (filter it out of the join, process it on its own), then enable AQE skew handling', true, 'Default and NULL keys are the most common skew source.'],
          ['Repartition everything to 1 partition', false, 'That would kill parallelism.'],
        ]],
      ]),
      mcq('Best way to deduplicate a 2-billion-row event table that grows by 50M rows/day?', ['Full dropDuplicates over all 2B rows every night', 'Incremental: MERGE new events into the target on event_id, only comparing against a recent window of partitions', 'DISTINCT in every dashboard query', 'Ignore duplicates'], 1),
    ]),
    lesson('x5', 'Serving at scale', 18, [
      learn('Making big data fast to query', `
        *"Dashboards over 50 TB must answer in under 5 seconds for 500 users."*
        - **Pre-aggregate** into gold summary tables / materialized views at the grain dashboards need (daily × dealer × model is millions of rows, not billions).
        - **Partition + cluster** gold tables on common filters (date, region, model); data skipping makes scans tiny.
        - **Semantic model / BI caching** (Power BI import or aggregations, result caches in the warehouse).
        - **Concurrency**: SQL warehouses autoscale clusters for many users; separate ETL compute from BI compute so nightly loads don't slow dashboards.
        - **Real-time views** for 1M devices: keep a **current-state table** (latest reading per device) updated by streaming MERGE or a key-value store (Cassandra/DynamoDB/Redis) for point lookups. Don't scan history for "latest".
        - **APIs**: serve from a low-latency store, not by running Spark per request.
      `),
      mcq('A dashboard on raw 50 TB telemetry takes 3 minutes. Best fix?', ['A bigger warehouse only', 'Build gold aggregate tables at the dashboard grain, partitioned/clustered on its filters', 'Export to Excel', 'Add more charts'], 1),
      mcq('An app needs the latest status of any of 1 million engines in under 50 ms. Where should it read from?', ['A Spark job scanning the telemetry history', 'A current-state key-value store or table keyed by engine_id, kept up to date by the stream', 'The raw bronze files', 'Power BI'], 1),
      tf('Separating ETL compute from BI/serving compute prevents nightly loads from slowing user queries.', true),
      talk('*"Design analytics on 1 million connected engines sending data every 10 seconds."*', `
        - Numbers: 100k events/s ≈ 8.6B/day; at 300 B ≈ 2.6 TB/day raw → ~300-500 GB/day as Parquet.
        - Ingest: IoT gateway → Kafka/Event Hubs, ~64+ partitions keyed by engine_id.
        - Hot path: streaming job for alerts and a **current-state** table/KV store.
        - Cold path: bronze Delta (partition by date/hour), silver cleaned, gold aggregates (engine-hour, engine-day, fleet-day).
        - Serving: pre-aggregated gold to the warehouse for BI; KV store for apps; features for ML.
        - Ops: lag, freshness, cost per TB, compaction, retention tiers (hot 30 days, cool 1 year, archive after).
      `),
    ]),
    lesson('x6', 'Reliability under load', 15, [
      learn('Failure modes that only show up at scale', `
        | Problem | Symptom | Remedy |
        |---|---|---|
        | **Backpressure** | queues/lag grow, memory climbs | buffer in Kafka, cap batch sizes, autoscale consumers |
        | **Poison messages** | one bad record crashes the job repeatedly | catch per record, route to a **dead-letter queue**, alert |
        | **Thundering herd** | all retries hit at once after an outage | exponential backoff **with jitter** |
        | **Partial failure** | half the partitions written | atomic commits (Delta), write-then-swap, idempotent reruns |
        | **Hot keys** | one partition/consumer overloaded | better key, salting, split hot keys |
        | **Small files** | slow reads, metadata overload | micro-batch sizing, compaction |
        | **Schema drift** | new/renamed fields break parsing | schema registry, contracts, rescue columns |
        | **Cost blow-up** | bill doubles | quotas, autoscaling limits, tagging, alerts |

        Design principle: **assume every component fails**. Make each step retryable, idempotent, observable, and isolated so one failure doesn't cascade.
      `),
      match('Match the problem to the remedy.', [
        ['Poison message crashes consumer', 'Dead-letter queue'],
        ['Retries all fire at the same moment', 'Backoff with jitter'],
        ['Job dies halfway through writing', 'Atomic commit + idempotent rerun'],
        ['One key overloads a partition', 'Salting / better partition key'],
      ]),
      scenario('One record keeps killing the stream', `The telemetry stream crashed and restarted 40 times overnight. Each time it fails on the same offset with a JSON parse error.`, [
        ['What\'s happening?', [
          ['A poison message: a malformed record that fails on every retry, so the job never moves past it', true, 'Restarts replay from the checkpoint, so the same bad record kills it again.'],
          ['Kafka is down', false, 'It reads fine up to that offset.'],
        ]],
        ['Fix?', [
          ['Parse defensively (from_json with a schema → nulls for bad rows / try-except), route failures to a dead-letter table with the raw payload, alert, continue', true, 'One bad record must never stop millions of good ones.'],
          ['Manually skip the offset every time', false, 'Doesn\'t scale and loses visibility.'],
        ]],
      ]),
    ]),
  ]);
