const { T, mcq, tf, multi, scenario, talk, sql, py, spark, order, match } = require('./_t.cjs');

module.exports = {
  // ================================================================== IoT and telemetry
  iot: T(`
    > **In one line:** **IoT** (Internet of Things) means physical devices (engines, generators, factory machines) with sensors that send **telemetry**: streams of timestamped measurements like temperature, pressure, RPM and fault codes. This **time-series data** is high-volume, never-ending, noisy and late, and it powers monitoring, alerts and predictive maintenance.

    ## The IoT data path
    «««flow
    Sensors -> Engine control unit / edge gateway (buffer, filter, compress) -> Cellular/satellite/Wi-Fi -> Cloud IoT ingestion (IoT Hub / Event Hubs / Kafka) -> Stream processing -> Lakehouse (bronze/silver/gold) + time-series store -> Dashboards, alerts, ML
    »»»

    ## What telemetry looks like
    «««json
    {"device_id": "ENG-77", "ts": "2026-11-26T10:00:05Z", "seq": 18233,
     "signals": {"coolant_temp_c": 96.4, "oil_pressure_kpa": 310, "rpm": 1450},
     "fault_codes": [], "fw": "4.2.1", "lat": 18.52, "lon": 73.85}
    »»»
    Characteristics: **many devices × high frequency**; **append-only**; mostly **numeric**; **event time** set by the device clock; **sequence numbers** per device; metadata (firmware) that changes over time.

    ## Time-series data: how it is stored and queried
    - **Wide** (one column per signal) vs **long/narrow** (device, ts, signal_name, value) formats: wide is efficient for fixed signal sets; long handles varying signals but needs pivots.
    - **Partition by date, cluster/sort by device and time** for "device X between T1 and T2" queries.
    - **Downsampling/rollups:** per-minute, per-hour aggregates (min, max, avg, count, last) for dashboards and long retention.
    - **Specialised stores** for operational time-series: Azure Data Explorer (Kusto), InfluxDB, TimescaleDB, Cassandra/HBase; lakehouse for analytics and ML.

    ## The hard problems
    | Problem | Why | Handling |
    |---|---|---|
    | **Late and out-of-order data** | Devices buffer offline for hours/days | Event-time processing, watermarks, lookback reprocessing |
    | **Duplicates** | Devices retry sends | Dedupe on (device_id, seq) or (device_id, ts) |
    | **Clock problems** | Wrong device clocks, time zones, resets to 1970 | Validate ranges, keep ingest time too, correct with offsets when known |
    | **Noise and outliers** | Sensor glitches, spikes | Range checks, smoothing, flags instead of deletion |
    | **Gaps** | Connectivity loss, device off | Distinguish "no data" from "engine off" (status signals), gap-fill only explicitly |
    | **Unit and schema drift** | Firmware updates change units or signal names | Schema registry, firmware-aware mapping, contracts with device teams |
    | **Volume and cost** | Billions of rows | Edge filtering, downsampling, tiered retention |
    | **Security** | Devices are attack surfaces | Per-device identity/certificates, encrypted transport |

    ## Edge vs cloud processing
    - **Edge:** filter, aggregate, compress, run simple rules or models locally (react in milliseconds, save bandwidth, work offline). Azure IoT Edge, AWS Greengrass.
    - **Cloud:** fleet-wide analytics, ML training, history, cross-device correlation.

    ## How interviewers test this
    - "What makes IoT data hard to process?" The table above.
    - "How would you store engine telemetry for both dashboards and ML?" Raw bronze, deduped silver partitioned by date and clustered by device, rollups in gold, retention tiers.
    - The posting lists "Exposure to IoT technology": connect it to your Turbofan project.
  `, {
    check: [
      multi('Which are typical IoT telemetry problems?', ['Late, out-of-order data from buffered devices', 'Duplicate sends from retries', 'Device clock errors', 'Too few rows to analyse'], [0, 1, 2], 'Volume is usually too high, not too low.'),
      mcq('How should you deduplicate device telemetry that may be re-sent?', ['By temperature value', 'By (device_id, sequence number) or (device_id, event timestamp)', 'By ingestion time', 'You cannot'], 1, 'A per-device sequence number is the most reliable key.'),
      tf('A missing reading always means the engine was switched off.', false, 'It could be a connectivity gap; use status signals to tell them apart.'),
    ],
    hands: [
      sql({ q: '**Downsample telemetry** for a dashboard: hourly rollups per engine from «sensor_readings» with «hour» («strftime(\'%Y-%m-%d %H:00\', ts)»), «readings», «avg_temp» (1 dp), «min_oil» (min «oil_pressure_kpa»), «max_rpm». Return only **engine_id 1 and 2**, sorted by «engine_id», «hour».', tables: ['sensor_readings'], level: 2,
        solution: `SELECT engine_id, strftime('%Y-%m-%d %H:00', ts) AS hour, COUNT(*) AS readings,
       ROUND(AVG(temperature_c), 1) AS avg_temp, MIN(oil_pressure_kpa) AS min_oil, MAX(rpm) AS max_rpm
FROM sensor_readings
WHERE engine_id IN (1, 2)
GROUP BY engine_id, strftime('%Y-%m-%d %H:00', ts)
ORDER BY engine_id, hour;`,
        hint: 'GROUP BY engine_id and the hour string; aggregate with COUNT, AVG, MIN, MAX.' }),
    ],
  }),

  // ================================================================== Predictive maintenance
  predmaint: T(`
    > **In one line:** **predictive maintenance** uses telemetry, maintenance history and failure records to **predict failures before they happen**, so service is scheduled just in time: less unplanned downtime than reactive repair, less waste than fixed-interval maintenance. It is one of the most valuable IoT use cases for an engine maker, and it is mostly a **data problem**.

    ## Maintenance strategies
    | Strategy | When you act | Downside |
    |---|---|---|
    | **Reactive** | After failure | Downtime, secondary damage, angry customers |
    | **Preventive (scheduled)** | Fixed intervals (every 500 h) | Replaces healthy parts; still misses early failures |
    | **Condition-based** | When a measured condition crosses a threshold (oil pressure < X) | Thresholds are crude, late warnings |
    | **Predictive** | When a model predicts high failure risk soon | Needs data, labels, ML and trust |
    | **Prescriptive** | Recommends what to do and when | Most data and process maturity |

    ## Typical ML framings
    - **Classification:** "will this engine fail (or need component X) in the next N days?"
    - **Regression:** **remaining useful life (RUL)** in hours/cycles (the NASA turbofan dataset framing).
    - **Anomaly detection:** unusual behaviour without failure labels.
    - **Survival analysis:** time-to-failure with censoring (engines that have not failed yet).

    ## The data you need (and its traps)
    | Data | Use | Trap |
    |---|---|---|
    | Telemetry | Features (trends, exceedances, variability) | Volume, gaps, firmware changes |
    | Fault codes / events | Features and early-warning labels | Noisy, inconsistent codes |
    | Maintenance and repair records | Labels, reset points ("part replaced") | Free text, incomplete |
    | Warranty claims | Failure labels and costs | Only failures that were claimed; delays |
    | Asset master (model, build date, plant, configuration) | Static features, segmentation | SCD history of configuration changes |
    | Operating context (duty cycle, ambient temperature, fuel) | Features | Hard to get |
    Labels are often the hardest: defining "failure" precisely, aligning it in time, handling engines still running (censoring) and maintenance that "resets" components.

    ## The data engineering pipeline
    1. Ingest telemetry (streaming) and service/claims data (batch/CDC).
    2. Clean, dedupe, align time; conform asset IDs across systems.
    3. Build per-engine daily features (windows, trends) with **point-in-time correctness**.
    4. Build labels from repairs/claims with a defined horizon.
    5. Training set (features + labels) versioned; model trained by data scientists.
    6. Daily **batch scoring** writes risk scores to a gold table; **alerts** for high risk; scores pushed to the service app/CRM (reverse ETL).
    7. Monitor: data drift, prediction drift, outcomes (did predicted engines fail?), feedback loop.

    ## Measuring value
    Precision matters (false alarms send technicians for nothing), recall matters (missed failures cost downtime); business metrics: unplanned downtime reduced, warranty cost, parts inventory.

    ## How interviewers test this
    - "How would you build the data for predictive maintenance?" Sources, features, labels, point-in-time, scoring, monitoring.
    - "Your Turbofan project: how does it relate?" NASA C-MAPSS-style turbofan degradation data, streaming telemetry, health index, fault-mode-aware scoring.
  `, {
    check: [
      order('Order maintenance strategies from least to most data-driven.', ['Reactive (fix after failure)', 'Preventive (fixed schedule)', 'Condition-based (thresholds)', 'Predictive (model forecasts failure)', 'Prescriptive (recommends actions)'], 'Each step needs more data maturity.'),
      mcq('What is often the hardest data problem in predictive maintenance?', ['Storing telemetry', 'Defining and aligning reliable failure labels (and handling engines that have not failed yet)', 'Choosing a dashboard tool', 'Writing SQL'], 1, 'Labels decide what the model learns.'),
      tf('Warranty claims are a perfect failure label because every failure results in a claim.', false, 'Claims miss out-of-warranty and unclaimed failures, and arrive with delays.'),
    ],
    interview: [
      talk('Design the data pipeline for predicting engine failures from telemetry.', `
        - **Sources:** telemetry stream (IoT Hub/Event Hubs/Kafka), repair orders and claims (CDC/batch), asset master (SCD2), fault codes.
        - **Bronze/silver:** streaming ingestion with checkpoints; dedupe on (engine, seq); event-time handling and late data; conformed engine IDs.
        - **Features (gold):** daily per-engine aggregates over 1/7/30-day windows (means, max, exceedance counts, trends, variability), days since last service, configuration attributes as of date; **point-in-time correct**.
        - **Labels:** failure of a component class within N days, from repairs/claims; censoring handled; maintenance resets.
        - **Training:** versioned training sets (Delta time travel), split by time.
        - **Scoring:** daily batch scoring to «gold.engine_risk_daily»; alerts above threshold with cooldown; push scores to the service app.
        - **Monitoring:** feature drift, data quality, prediction vs outcome tracking, retraining triggers.
        - **Governance:** owners, lineage from telemetry to model, access controls.`),
    ],
  }),

  // ================================================================== Real-time IoT ingestion
  iotingest: T(`
    > **In one line:** real-time IoT ingestion receives telemetry from **thousands to millions of devices**, securely and reliably, buffers it in a **scalable event hub/log**, and processes it with **streaming** jobs for alerts and storage, while handling device identity, bursts, duplicates, late data and schema changes.

    ## Reference architecture (Azure flavour)
    «««flow
    Devices (per-device certificates, MQTT/AMQP/HTTPS) -> Azure IoT Hub (device identity, routing) -> Event Hubs / Kafka (partitioned by device) -> Spark Structured Streaming / Stream Analytics -> Delta bronze + alerts + hot store (Azure Data Explorer)
    »»»
    AWS: IoT Core → Kinesis/MSK → Flink/Spark → S3/Iceberg. Many companies also use Kafka directly with an MQTT bridge.

    ## Key design decisions
    | Decision | Recommendation |
    |---|---|
    | **Protocol** | MQTT for constrained devices (lightweight, persistent sessions, QoS levels); AMQP/HTTPS where needed |
    | **Device identity & security** | Per-device X.509 certificates or keys, device registry, TLS, revocation |
    | **Partition key** | device_id: per-device order and even spread |
    | **Partitions / throughput units** | Size from peak events/s × size with headroom; plan for reconnection bursts |
    | **Message format** | Compact (Avro/Protobuf/compressed JSON) with schema IDs and firmware version |
    | **Batching on device** | Send small batches to save bandwidth (adds latency) |
    | **Retention in the hub** | Long enough to replay after downstream outages (e.g. 7 days) |
    | **Processing** | Stream to bronze unchanged (exactly-once with checkpoints), then dedupe/validate to silver; separate alerting stream |
    | **Hot vs cold paths** | Hot: seconds-latency alerts and live dashboards; cold: lakehouse for analytics and ML |
    | **Device-to-cloud vs cloud-to-device** | Commands/config back to devices (twins/shadows) need their own secure channel |

    ## Handling the classic IoT stream problems
    - **Reconnection bursts:** a fleet comes back online and sends a day of buffered data at once: autoscaling consumers, enough partitions, backpressure, separate "catch-up" lag alert.
    - **Duplicates:** dedupe by (device_id, seq) with watermark-bounded state.
    - **Late data:** event-time windows; watermark sized from measured buffering; late data to batch correction.
    - **Schema changes from firmware:** schema registry, firmware version in each message, mapping tables, rescued fields.
    - **Poison messages:** malformed payloads → DLQ.
    - **Alert storms:** dedupe alerts per device/fault with cooldowns.

    ## Monitoring
    Devices connected/silent, messages per second, consumer lag, end-to-end latency (device ts → table), dropped/late counts, DLQ size, per-device freshness.

    ## How interviewers test this
    - "Design real-time ingestion for 100,000 engines." Size it, the architecture, partition key, security, hot/cold paths, late/duplicate handling, monitoring.
    - "Why MQTT for devices?"
    - "What happens when 20,000 engines reconnect at once?"
  `, {
    check: [
      mcq('Which partition key keeps each engine\'s telemetry in order and spreads load?', ['Timestamp', 'device_id', 'Random', 'Signal name'], 1, 'Per-device ordering and good distribution.'),
      mcq('20,000 engines reconnect after a network outage and upload buffered data. What protects the pipeline?', ['Nothing is needed', 'Enough partitions and consumer capacity, autoscaling, backpressure, retention for replay, and event-time handling for the late data', 'Deleting old data', 'Rejecting late messages'], 1, 'Plan for bursts, not averages.'),
      tf('MQTT is popular for constrained IoT devices because it is lightweight and supports persistent sessions and QoS levels.', true, 'It fits unreliable, low-bandwidth links.'),
    ],
  }),
};
