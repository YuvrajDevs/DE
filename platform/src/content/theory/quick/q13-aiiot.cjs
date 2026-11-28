const { T } = require('../_t.cjs');

module.exports = {
  ml: T(`
    > **In one line:** ML builds **models that learn patterns from data** to predict or find structure. **Supervised** learns from labelled examples (will it fail: yes/no); **unsupervised** finds structure without labels (clusters, anomalies). **Training** builds the model from history; **inference** applies it to new data.

    | Type | Learns from | Engine-maker example |
    |---|---|---|
    | Classification | Labelled categories | Fail in 30 days? Fraudulent claim? |
    | Regression | Labelled numbers | Remaining useful life, repair cost |
    | Clustering | No labels | Group engines by duty cycle |
    | Anomaly detection | Mostly normal data | Unusual vibration |
    | Forecasting | Past values | Parts demand next quarter |
    | Reinforcement | Rewards | Rare in DE |
    | Deep learning / foundation models | Large data, neural nets | Image defect detection, LLMs |

    «««flow
    Business problem -> Data + labels -> Features -> Train/validate/test split -> Training -> Evaluation -> Deployment (batch or real-time inference) -> Monitoring (drift) -> Retraining
    »»»
    **DE owns most data steps:** reliable sources and labels; **training pipelines** (reproducible, point-in-time correct); **feature pipelines** (batch and streaming); **inference pipelines** (batch scoring writes predictions to tables; streaming scoring); drift monitoring of inputs; lineage from model to data versions (MLflow + Unity Catalog models). **MLOps** runs it reliably (MLflow, feature stores, model registry, CI/CD for models).

    | | Training | Inference |
    |---|---|---|
    | When | Periodically / on drift | Every prediction (nightly batch or real time) |
    | Data | Large, historical, labelled | New, unlabelled |
    | Compute | Heavy, offline | Light per prediction; latency matters |
    | DE concern | Reproducible, leakage-free sets | Same feature logic, fresh features, scalable scoring |

    **Evaluation:** train/validation/test; **time series split by time** (past → train, future → test) and by entity, never randomly. Classification: **precision** (of predicted failures, how many were real), **recall** (of real failures, how many caught), F1, ROC-AUC; with rare failures **accuracy is meaningless** (99% by always saying "no failure") → precision/recall, **lead time**, false-alarm rate (Turbofan reports detection rate and warning lead time). Regression: MAE, RMSE. **Overfitting** = great on training, poor on new data.

    **What goes wrong:** **leakage** (the classic data bug: whole-history aggregates, current dimension values joined to past rows, random splits on time series, labels derived from features); **training-serving skew** (different feature logic); **data drift** (firmware shifts readings) and **concept drift** (new models fail differently); **label quality** (warranty claims as a failure proxy miss unclaimed failures).

    **Interview:** supervised vs unsupervised; what DE provides for training vs inference; why split time series by time.
  `),

  features: T(`
    > **In one line:** **features** are model inputs (engine age, 7-day average oil pressure); the **label** is what's predicted (failed within 30 days). **Feature engineering** turns raw data into informative, correctly-timed features: mostly **SQL/Spark with strict point-in-time logic**.

    | Type | Examples |
    |---|---|
    | Static | Model, plant, horsepower, build month |
    | Window aggregates | Avg/max/std temperature over 24 h, 7 d, 30 d; fault-code counts in 7 d |
    | Trends/changes | 14-day oil-pressure slope; delta vs last week or vs the entity's baseline |
    | Ratios | High-load hours ÷ total hours |
    | Recency | Days since last service / last fault |
    | Cross-domain counts | Prior claims on this engine; fleet claims for this part |
    | Encoded categories | One-hot or target encoding of model/region |
    | Text/embeddings | Technician notes |

    ## The as-of pattern (no leakage)
    1. Define the **prediction time** per example (each engine, each day 00:00).
    2. Features from data **timestamped before** it only (window functions over past rows; SCD2 lookups as of that date).
    3. **Label** from data **after** it (failure in the next 30 days).
    4. Store a feature table keyed by (entity, timestamp); version it.
    5. Serve with **the same code** on current data (batch window functions and the streaming equivalent should share a function, with a **parity test**).

    **Feature stores** (Databricks Feature Engineering in UC, Feast, SageMaker, Vertex): one definition for training and serving, **point-in-time joins** for training sets, **online tables** for low-latency serving, lineage to models, reuse across teams. They fix **training-serving skew** (batch SQL in training vs a Python service at serving).

    **What goes wrong:** leakage (a window including the prediction day's later readings; a status updated after the failure); **late data** (features computed before late readings arrived differ from the backfilled training set); **missing values** (sensors offline → sentinel, imputation or "missing" indicators, never silent zeros); high-cardinality categories (engine_id as a feature) overfit; features too expensive to compute in time for real-time inference.

    **Interview:** building a leakage-free training set (as-of pattern); what a feature store is and why.
  `),

  genai: T(`
    > **In one line:** **generative AI** (LLMs) generates text, code or images from prompts. Trained on huge corpora, it knows nothing about your company unless you **give it your data** at question time, can be **confidently wrong** (hallucinate), and its enterprise value depends mostly on **data quality, retrieval and governance**: DE work.

    | Concept | Meaning |
    |---|---|
    | LLM | Neural net trained to predict the next token |
    | Token | ~¾ of a word; **context window** = max tokens per request; priced per token |
    | Prompt | Instructions + context + question |
    | Hallucination | Plausible but false output |
    | Grounding | Supplying trusted data (documents, query results) to answer from |
    | RAG | Retrieve relevant chunks into the prompt |
    | Fine-tuning | Training on your examples to change style/behaviour; **not** the usual way to add knowledge |
    | Embeddings | Meaning vectors for semantic search |
    | Agents / tool use | LLMs calling tools (SQL, APIs) step by step |
    | Text-to-SQL | LLM writes SQL over your schema; quality depends on metadata/semantic models |
    | Guardrails | Safety, PII, allowed-topic filters |
    | Evaluation | Test sets measuring answer quality, faithfulness, retrieval accuracy |

    ## Where DEs fit
    - **Knowledge assets:** document ingestion (PDF manuals, service bulletins, claim notes) with parsing, OCR, chunking, metadata, dedupe, PII redaction; **embedding pipelines with versioning** (re-embed when the model changes); vector indexes and refresh.
    - **Semantic models and rich descriptions** for text-to-SQL and analytics assistants (it only works with them).
    - **Governance:** PII scrubbing, access control, audit logs of prompts/answers (with privacy controls), export-control limits, model and prompt versions, cost per call, rate limits, **data residency of the model endpoint**; never send restricted data to external APIs without approval.
    - **Evaluate and monitor:** Q&A datasets, quality metrics, cost per query.
    - **LLMs inside pipelines:** classify free-text claims, extract fields from PDFs (failure descriptions → codes), summarise, with **validation, confidence thresholds and human review queues** (your Strata classifier pattern).

    **Risks:** hallucinations, stale knowledge, **prompt injection** (malicious text in documents instructing the model), data leakage through prompts, cost at scale, non-determinism, bias.

    **Interview:** using company data without training a model (RAG/grounding on governed data); DE's contribution (knowledge pipelines, metadata, governance, evaluation); reducing hallucination (grounding, retrieval quality, citations, evaluation, guardrails).
  `),

  rag: T(`
    > **In one line:** **RAG** retrieves the most relevant pieces of your content for a question and gives them to an LLM to answer from. Retrieval uses **embeddings** in a **vector index** that finds nearest vectors fast. Keeping that index clean, fresh and permission-aware is data engineering.

    «««flow
    Ingestion: Documents (PDF, HTML, tickets) -> Extract text (+OCR) -> Clean, chunk -> Enrich with metadata and permissions -> Embed each chunk -> Store vectors + text + metadata
    »»»
    «««flow
    Query: Question -> Embed -> Vector search (top-k, filtered by metadata/permissions) -> Optional re-rank -> Prompt = instructions + chunks + question -> Answer with citations
    »»»

    **Embeddings:** a model maps text to a vector (e.g. 768 or 1,536 numbers); similar meaning → close vectors (cosine similarity): "coolant leak at pump" sits near "water pump seal failure" with no shared words. **Documents and queries must use the same model**; switching models means **re-embedding everything** (cost).

    **Vector search:** exact nearest neighbour over millions is slow → **ANN** indexes (HNSW graphs, IVF) trade a little accuracy for speed. Stores: Databricks Vector Search, Azure AI Search, pgvector, Pinecone, Weaviate, Milvus, Elasticsearch/OpenSearch, MongoDB Atlas Vector Search. **Hybrid search** (BM25 keyword + vector, fused with **reciprocal rank fusion**) plus **re-ranking** fixes part numbers and codes that embeddings handle poorly (your Strata result: 100% vs 52% Hit@5).

    | Chunking choice | Trade-off |
    |---|---|
    | Size (~300-800 tokens) | Small: precise, loses context; large: context, noisier, costlier |
    | Overlap (10-20%) | Avoids cutting answers across boundaries |
    | Structure-aware | Split on headings/sections/tables, not fixed lengths |
    | Metadata per chunk | Source, section, engine model, date, version, security labels for filters and citations |

    ## Correct and safe
    - **Incremental refresh:** detect changed/deleted documents (content hash, or CDF on a documents table → embedding job → index sync; Databricks delta-sync indexes do this); re-embed only those; remove stale, deleted or access-revoked chunks.
    - **Permissions:** propagate document ACLs to chunks and filter retrieval by the user (a bot leaking restricted bulletins is a governance incident).
    - **PII/sensitive:** scrub or exclude; restrict export-controlled docs.
    - **Evaluation:** a labelled question set with expected sources/answers; measure **retrieval** (Hit@k, MRR, recall@k) separately from **generation** (faithfulness/groundedness, correctness); regression-test chunking/model changes.
    - **Monitoring:** unanswered questions, low-similarity retrievals, feedback, cost per query.

    **What goes wrong:** old/duplicate versions retrieved (version/date metadata + filters); tables and diagrams lost in PDF extraction; codes missed by pure vector search; **prompt injection** hidden in documents; re-embedding cost.

    **Interview:** RAG end to end (the two pipelines); keeping the index fresh and secure; evaluating RAG (retrieval metrics + answer quality on a labelled set).
  `),

  iot: T(`
    > **In one line:** **IoT** = physical devices (engines, generators, machines) with sensors sending **telemetry**: timestamped temperature, pressure, RPM, fault codes. This **time-series data** is high-volume, endless, noisy and late, and powers monitoring, alerts and predictive maintenance.

    «««flow
    Sensors -> ECU / edge gateway (buffer, filter, compress) -> Cellular/satellite/Wi-Fi -> IoT Hub / Event Hubs / Kafka -> Stream processing -> Lakehouse (bronze/silver/gold) + time-series store -> Dashboards, alerts, ML
    »»»
    «««json
    {"device_id": "ENG-77", "ts": "2026-11-26T10:00:05Z", "seq": 18233,
     "signals": {"coolant_temp_c": 96.4, "oil_pressure_kpa": 310, "rpm": 1450},
     "fault_codes": [], "fw": "4.2.1", "lat": 18.52, "lon": 73.85}
    »»»
    Many devices × high frequency; append-only; mostly numeric; **event time from the device clock**; **per-device sequence numbers**; metadata (firmware) that changes over time.

    ## Storage and queries
    - **Wide** (column per signal: better compression and speed, fixed signal sets) vs **long/narrow** (device, ts, signal, value: flexible, needs pivots).
    - **Partition by date, cluster by device and time** for "device X between T1 and T2".
    - **Downsampled rollups** (1-minute, 1-hour: min, max, avg, count, last) for dashboards with long retention; raw with shorter retention.
    - Operational stores: Azure Data Explorer (Kusto), InfluxDB, TimescaleDB, Cassandra/HBase; lakehouse for analytics and ML.

    | Problem | Why | Handling |
    |---|---|---|
    | Late/out-of-order | Devices buffer offline for hours/days | Event-time processing, watermarks, lookback |
    | Duplicates | Resends after reconnect | Dedupe on (device_id, seq) or (device_id, ts) |
    | Clock problems | Drift, wrong time zones, resets to 1970 | Validate ranges, keep ingest time too, apply known offsets |
    | Noise/sensor faults | Spikes, stuck values | Per-signal range, rate-of-change and **flatline** checks; flag, don't delete |
    | Gaps | Connectivity loss, engine off | Tell "no data" from "engine off" (status signals); gap-fill only explicitly |
    | Unit/schema drift | Firmware renames signals or changes units | Registry, firmware-aware mapping, contracts with device teams; keep device/firmware metadata |
    | Volume/cost | Billions of rows | Edge filtering, downsampling, tiered retention |
    | Security | Devices are attack surfaces | Per-device identity/certificates, encrypted transport |

    **Edge vs cloud:** edge filters, aggregates, compresses, runs simple rules/models locally (millisecond reactions, bandwidth savings, works and buffers offline: Azure IoT Edge, AWS Greengrass); cloud does fleet analytics, ML training, history, cross-device correlation, and should still get **enough raw data to train models**.

    **Interview:** what makes IoT data hard (table); storing telemetry for dashboards and ML (raw bronze, deduped silver by date clustered by device, gold rollups, retention tiers); "exposure to IoT" → your Turbofan project.
  `),

  predmaint: T(`
    > **In one line:** **predictive maintenance** uses telemetry, maintenance history and failure records to **predict failures before they happen**, so service is scheduled just in time: less unplanned downtime than reactive repair, less waste than fixed intervals. One of the most valuable IoT uses for an engine maker, and mostly a **data problem**.

    | Strategy | Act when | Downside |
    |---|---|---|
    | Reactive | After failure | Downtime, secondary damage, angry customers |
    | Preventive | Fixed intervals (every 500 h) | Replaces healthy parts; misses early failures |
    | Condition-based | A threshold crosses (oil pressure < X) | Crude, late warnings |
    | Predictive | A model predicts high risk soon | Needs data, labels, ML, trust |
    | Prescriptive | Recommends what and when | Most maturity |

    **Framings (choose by available labels and the action taken):** classification (fail / need component X within N days or cycles); **remaining useful life** regression (from run-to-failure data, as in NASA C-MAPSS turbofan); anomaly detection (no labels); survival analysis (time-to-failure with **censoring** for engines still running); health indices with thresholds (Turbofan).

    | Data | Use | Trap |
    |---|---|---|
    | Telemetry | Features (trends, exceedances, variability) | Volume, gaps, firmware changes |
    | Fault codes/events | Features, early-warning labels | Noisy, inconsistent |
    | Maintenance/repairs | Labels, **reset points** ("part replaced") | Free text, incomplete |
    | Warranty claims | Failure labels, costs | Only claimed failures; delays |
    | Asset master | Static features, segmentation | SCD history of configuration |
    | Operating context (duty cycle, ambient, fuel; regimes) | Features, condition normalisation | Hard to get |
    **Labels are the hardest:** define "failure" precisely, align it in time, handle censoring and maintenance resets.

    ## The DE pipeline
    1. Ingest telemetry (streaming) and service/claims (batch/CDC).
    2. Clean, dedupe, align time; conform asset IDs across systems; normalise operating conditions.
    3. Per-engine daily features with **point-in-time correctness**.
    4. Labels from repairs/claims with a defined horizon.
    5. Versioned training set; data scientists train.
    6. Daily **batch scoring** → gold risk table; alerts for high risk; scores pushed to service app/CRM (reverse ETL).
    7. Monitor data drift, prediction drift and outcomes (did flagged engines fail?): the feedback loop.

    **Measuring value:** precision (false alarms waste technician visits), recall (missed failures cost downtime), **false alarm rate per engine-month, warning lead time** (median and p10), cost of a missed failure vs an unnecessary inspection; business: unplanned downtime, warranty cost, parts inventory. **Evaluate per segment:** a global metric hides failure modes; Turbofan's FD003 fan-fault miss (56% → 100% after fault-mode-aware scoring) is the perfect example.

    **Interview:** building the data (sources, features, labels, point-in-time, scoring, monitoring); how Turbofan relates (C-MAPSS-style degradation data, streaming telemetry, health index, fault-mode-aware scoring).
  `),

  iotingest: T(`
    > **In one line:** real-time IoT ingestion receives telemetry from **thousands to millions of devices** securely and reliably, buffers it in a **scalable event hub/log**, and processes it with **streaming** jobs for alerts and storage, handling device identity, bursts, duplicates, late data and schema changes.

    «««flow
    Devices (per-device certificates, MQTT/AMQP/HTTPS) -> Azure IoT Hub (identity, routing) -> Event Hubs / Kafka (partitioned by device) -> Spark Structured Streaming / Stream Analytics -> Delta bronze + alerts + hot store (Azure Data Explorer)
    »»»
    **Azure detail:** IoT Hub gives device identity, per-device auth, cloud-to-device commands and routing, via its built-in Event Hubs-compatible endpoint or routes to Event Hubs; then Spark Structured Streaming (or Auto Loader over Capture files) → Delta; **Device Provisioning Service** onboards fleets. AWS: IoT Core → Kinesis/MSK → Flink/Spark → S3/Iceberg. Many use Kafka directly with an MQTT bridge.

    | Decision | Recommendation |
    |---|---|
    | Protocol | **MQTT** for constrained devices (lightweight, persistent sessions, QoS levels); AMQP/HTTPS where needed |
    | Identity/security | Per-device X.509 certificates or keys, registry, TLS, revocation |
    | Partition key | device_id: per-device order, even spread |
    | Capacity | Peak events/s × size + headroom for reconnection bursts; messages/s and bytes/s per IoT Hub unit/tier and per Event Hubs partition/throughput unit |
    | Format | Compact (Avro/Protobuf/compressed JSON) with schema ID and firmware version |
    | Device batching | Several readings per message: saves bandwidth and per-message cost, adds latency |
    | Hub retention | Replay window after outages (Event Hubs 1-90 days by tier; e.g. 7); Delta bronze is the long-term one |
    | Processing | Bronze unchanged (exactly-once with checkpoints) → dedupe/validate to silver; separate alerting stream |
    | Hot vs cold | Hot: seconds-latency alerts/live dashboards; cold: lakehouse analytics/ML |
    | Cloud-to-device | Commands/config (twins/shadows) on their own secure channel |

    ## Classic stream problems
    - **Reconnection bursts** (a fleet sends a day of buffered data at once): autoscaling consumers, enough partitions, backpressure, a separate catch-up lag alert.
    - **Duplicates:** dedupe by (device_id, seq) with watermark-bounded state.
    - **Late data:** event-time windows, watermark from measured buffering, very late data to batch correction.
    - **Firmware schema changes:** registry, firmware version per message, mapping tables, rescued fields.
    - **Poison messages** → DLQ.
    - **Alert storms** → dedupe alerts per device/fault with cooldowns.

    **Monitor:** devices connected vs silent, messages/s, consumer lag, end-to-end latency (device ts → table), dropped/late counts, DLQ size, per-device freshness.

    **Interview:** real-time ingestion for 100,000 engines (size it, architecture, partition key, security, hot/cold, late/duplicates, monitoring); why MQTT; 20,000 engines reconnecting at once.
  `),
};
