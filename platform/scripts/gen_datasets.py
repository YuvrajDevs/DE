"""Generate the practice database (SQLite dialect) used by every SQL and PySpark
challenge. Deterministic: same seed -> same data, so expected answers never drift.

Fictional company: "Apex Engines" - builds diesel engines in 4 plants, sells via
dealers, collects sensor telemetry, and runs a warranty flow:
    CRF (customer request form) -> SR (service request) -> PIR (product incident
    report) -> Claim -> Credit Note

Run:  python3 scripts/gen_datasets.py > src/datasets.sql
"""
import random
from datetime import date, datetime, timedelta

R = random.Random(42)
out = []


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(round(v, 2)) if isinstance(v, float) else str(v)
    return "'" + str(v).replace("'", "''") + "'"


def table(name, ddl, rows):
    out.append(f"CREATE TABLE {name} ({ddl});")
    cols = [c.strip().split()[0] for c in ddl.split(",") if not c.strip().upper().startswith(("PRIMARY", "FOREIGN"))]
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        vals = ",".join("(" + ",".join(q(v) for v in r) + ")" for r in chunk)
        out.append(f"INSERT INTO {name} ({','.join(cols)}) VALUES {vals};")


def d(s):
    return date.fromisoformat(s)


def rand_date(a, b):
    a, b = d(a), d(b)
    return a + timedelta(days=R.randint(0, (b - a).days))


# ---------------- plants ----------------
plants = [
    (1, "Pune Engine Plant", "Pune", "India", "2008-03-14"),
    (2, "Columbus Assembly", "Columbus", "USA", "1995-06-01"),
    (3, "Darlington Works", "Darlington", "UK", "2001-09-20"),
    (4, "Jamestown Plant", "Jamestown", "USA", "1999-11-05"),
]
table("plants", "plant_id INTEGER PRIMARY KEY, plant_name TEXT, city TEXT, country TEXT, opened_date TEXT", plants)

# ---------------- customers ----------------
segs = ["Construction", "Mining", "Power Gen", "Marine", "Trucking", "Agriculture"]
regions = ["North", "South", "East", "West"]
cnames = ["Sahyadri Infra", "Deccan Logistics", "Konkan Marine", "Vidarbha Mining", "Narmada Power", "Indus Haulage",
          "Ganga Agro", "Malabar Shipping", "Thar Constructions", "Nilgiri Estates", "Ajanta Builders", "Coromandel Gensets",
          "Satpura Earthmovers", "Godavari Fleet", "Kaveri Farms", "Brahmaputra Ports", "Aravalli Quarries", "Chambal Transport",
          "Tapti Energy", "Sabarmati Movers", "Hooghly Dredging", "Mahanadi Coal Haul", "Krishna Agritech", "Western Ghats Infra",
          "Rann Salt Works", "Palk Bay Fisheries", "Shivalik Power", "Bhima Cranes", "Pench Logistics", "Konark Marine"]
customers = []
for i, n in enumerate(cnames, start=1):
    customers.append((i, n, R.choice(segs), R.choice(regions), "India" if i <= 24 else R.choice(["UAE", "Sri Lanka", "Bangladesh"])))
customers.append((31, "Dormant Gensets Ltd", "Power Gen", "East", "India"))  # edge case: customer with no CRFs
table("customers", "customer_id INTEGER PRIMARY KEY, customer_name TEXT, segment TEXT, region TEXT, country TEXT", customers)

# ---------------- dealers ----------------
dnames = [("Pune Power Services", "West", "Pune"), ("Mumbai Engine Care", "West", "Mumbai"), ("Delhi Diesel Hub", "North", "Delhi"),
          ("Chennai Torque Point", "South", "Chennai"), ("Kolkata Engine Works", "East", "Kolkata"), ("Hyderabad Gen Serve", "South", "Hyderabad"),
          ("Ahmedabad Motive", "West", "Ahmedabad"), ("Lucknow Service Bay", "North", "Lucknow"), ("Bhubaneswar Drives", "East", "Bhubaneswar"),
          ("Kochi Marine Engines", "South", "Kochi")]
dealers = [(i, n, r, c) for i, (n, r, c) in enumerate(dnames, start=1)]
dealers.append((11, "Nagpur Engine Point", "West", "Nagpur"))  # edge case: dealer with no claims
table("dealers", "dealer_id INTEGER PRIMARY KEY, dealer_name TEXT, region TEXT, city TEXT", dealers)

# ---------------- engines ----------------
models = [("X15", 565), ("X12", 500), ("L9", 380), ("B6.7", 325), ("QSK60", 2700), ("ISX", 450)]
engines = []
for i in range(1, 121):
    m, hp = R.choice(models)
    bd = rand_date("2023-01-01", "2026-06-30")
    engines.append((i, f"APX{100000 + i * 37}", m, R.choice([1, 1, 2, 3, 4]), bd.isoformat(), R.randint(1, 30), hp))
table("engines", "engine_id INTEGER PRIMARY KEY, serial_no TEXT, model TEXT, plant_id INTEGER, build_date TEXT, customer_id INTEGER, horsepower INTEGER", engines)

# ---------------- suppliers & parts ----------------
suppliers = [(1, "Bharat Forge Components", "India", 4.6), (2, "Rane Precision", "India", 4.1), (3, "Bosch Fuel Systems", "Germany", 4.8),
             (4, "Tata AutoComp", "India", 3.9), (5, "Mahle Filters", "Germany", 4.4), (6, "Sundram Fasteners", "India", 4.0),
             (7, "Garrett Turbo", "USA", 4.5), (8, "Lumax Electricals", "India", 3.5)]
table("suppliers", "supplier_id INTEGER PRIMARY KEY, supplier_name TEXT, country TEXT, rating REAL", suppliers)
parts_list = [("Turbocharger", "Air", 7), ("Fuel Injector", "Fuel", 3), ("Oil Filter", "Filtration", 5), ("Air Filter", "Filtration", 5),
              ("Crankshaft", "Core", 1), ("Piston Ring Set", "Core", 2), ("Water Pump", "Cooling", 4), ("Radiator Hose", "Cooling", 6),
              ("ECM Module", "Electronics", 8), ("Alternator", "Electronics", 8), ("Cylinder Head Gasket", "Core", 6), ("Fuel Pump", "Fuel", 3),
              ("Starter Motor", "Electronics", 4), ("EGR Valve", "Air", 2), ("Thermostat", "Cooling", 6), ("Injector Seal Kit", "Fuel", 2)]
parts = []
for i, (n, c, s) in enumerate(parts_list, start=1):
    parts.append((i, n, c, round(R.uniform(400, 45000), 2), s))
table("parts", "part_id INTEGER PRIMARY KEY, part_name TEXT, category TEXT, unit_cost REAL, supplier_id INTEGER", parts)

# ---------------- purchase orders ----------------
pos = []
for i in range(1, 181):
    p = R.choice(parts)
    od = rand_date("2025-07-01", "2026-10-31")
    exp = od + timedelta(days=R.choice([14, 21, 30]))
    rec = None if R.random() < 0.12 else exp + timedelta(days=R.randint(-5, 20))
    pos.append((i, p[4], p[0], R.choice([10, 20, 25, 50, 100, 200]), od.isoformat(), exp.isoformat(), rec.isoformat() if rec else None,
                round(p[3] * R.uniform(0.9, 1.1), 2)))
table("purchase_orders", "po_id INTEGER PRIMARY KEY, supplier_id INTEGER, part_id INTEGER, qty INTEGER, order_date TEXT, expected_date TEXT, received_date TEXT, unit_price REAL", pos)

# ---------------- inventory snapshots (periodic snapshot fact) ----------------
inv = []
for snap in ["2026-08-31", "2026-09-30", "2026-10-31"]:
    for pl in (1, 2, 3, 4):
        for p in parts:
            if R.random() < 0.8:
                inv.append((pl, p[0], snap, R.randint(0, 400)))
table("inventory", "plant_id INTEGER, part_id INTEGER, snapshot_date TEXT, qty_on_hand INTEGER", inv)

# ---------------- employees (self-join / recursive) ----------------
emps = [
    (1, "Anita Rao", "Plant Director", None, 1, "2012-04-01", 4800000),
    (2, "Vikram Joshi", "Data Platform Lead", 1, 1, "2016-07-11", 3600000),
    (3, "Meera Kulkarni", "Quality Manager", 1, 1, "2014-02-17", 3100000),
    (4, "Rohan Deshmukh", "Data Engineer II", 2, 1, "2021-08-02", 1850000),
    (5, "Sneha Patil", "Data Engineer I", 2, 1, "2024-06-03", 1050000),
    (6, "Arjun Nair", "Data Engineer I", 2, 1, "2025-01-13", 980000),
    (7, "Kavya Iyer", "Analytics Engineer", 2, 1, "2023-03-20", 1250000),
    (8, "Farhan Shaikh", "Quality Engineer", 3, 1, "2022-09-05", 1150000),
    (9, "Pooja Gokhale", "Quality Engineer", 3, 1, "2023-11-27", 1080000),
    (10, "Neel Bhatt", "Data Engineer Intern", 4, 1, "2026-06-01", 360000),
    (11, "Tom Becker", "Plant Director", None, 2, "2010-01-04", 15500000),
    (12, "Sarah Lin", "Data Engineer III", 11, 2, "2019-05-06", 11800000),
    (13, "Mike Ortiz", "Service Technician", 11, 2, "2018-03-12", 6100000),
    (14, "Priya Menon", "Service Technician", 11, 2, "2020-10-19", 5900000),
    (15, "Ravi Kulkarni", "Principal Data Architect", 11, 2, "2015-08-17", 16200000),  # edge case: earns more than manager
]
table("employees", "emp_id INTEGER PRIMARY KEY, name TEXT, role TEXT, manager_id INTEGER, plant_id INTEGER, hire_date TEXT, salary INTEGER", emps)
techs = [13, 14, 8, 9]

# ---------------- warranty flow: CRF -> SR -> PIR -> Claim -> Credit Note ----------------
issue_types = ["Overheating", "Low Oil Pressure", "Fuel Leak", "Starting Failure", "Excess Smoke", "Noise/Vibration", "Electrical Fault"]
failure_codes = {"Overheating": "FC-COOL-01", "Low Oil Pressure": "FC-LUBE-02", "Fuel Leak": "FC-FUEL-03", "Starting Failure": "FC-ELEC-04",
                 "Excess Smoke": "FC-AIR-05", "Noise/Vibration": "FC-CORE-06", "Electrical Fault": "FC-ELEC-07"}
root_causes = ["Supplier part defect", "Assembly error", "Customer misuse", "Design issue", "Wear and tear"]
crf, srs, pirs, claims, cns = [], [], [], [], []
sr_id = pir_id = claim_id = cn_id = 0
for i in range(1, 301):
    e = R.choice(engines)
    created = datetime.combine(rand_date("2026-01-05", "2026-11-10"), datetime.min.time()) + timedelta(hours=R.randint(7, 19), minutes=R.randint(0, 59))
    it = R.choice(issue_types)
    stage = R.random()
    status = "Converted" if stage < 0.82 else R.choice(["Open", "Rejected"])
    crf.append((i, e[5], R.randint(1, 10), e[0], created.strftime("%Y-%m-%d %H:%M:%S"), it, status))
    if status != "Converted":
        continue
    sr_id += 1
    opened = created + timedelta(hours=R.randint(1, 72))
    closed = None if R.random() < 0.15 else opened + timedelta(days=R.randint(1, 25), hours=R.randint(0, 20))
    srs.append((sr_id, i, opened.strftime("%Y-%m-%d %H:%M:%S"), closed.strftime("%Y-%m-%d %H:%M:%S") if closed else None,
                R.choice(["P1", "P2", "P2", "P3", "P3", "P3"]), "Closed" if closed else R.choice(["In Progress", "Awaiting Parts"]), R.choice(techs)))
    if closed is None or R.random() < 0.25:
        continue
    pir_id += 1
    pc = closed + timedelta(hours=R.randint(2, 96))
    rc = R.choice(root_causes)
    pirs.append((pir_id, sr_id, pc.strftime("%Y-%m-%d %H:%M:%S"), failure_codes[it], rc, R.choice(["Approved", "Approved", "Approved", "Under Review"])))
    if pirs[-1][5] != "Approved" or rc == "Customer misuse":
        continue
    claim_id += 1
    sub = pc + timedelta(days=R.randint(0, 10))
    amt = round(R.uniform(8000, 260000), 2)
    st = R.choice(["Approved", "Approved", "Approved", "Partially Approved", "Rejected", "Submitted"])
    appr = amt if st == "Approved" else (round(amt * R.uniform(0.4, 0.9), 2) if st == "Partially Approved" else (0 if st == "Rejected" else None))
    claims.append((claim_id, pir_id, crf[-1][2], sub.strftime("%Y-%m-%d %H:%M:%S"), amt, appr, st))
    if st in ("Approved", "Partially Approved") and R.random() < 0.85:
        cn_id += 1
        cns.append((cn_id, claim_id, (sub + timedelta(days=R.randint(3, 30))).strftime("%Y-%m-%d"), appr))
table("crf", "crf_id INTEGER PRIMARY KEY, customer_id INTEGER, dealer_id INTEGER, engine_id INTEGER, created_at TEXT, issue_type TEXT, status TEXT", crf)
table("service_requests", "sr_id INTEGER PRIMARY KEY, crf_id INTEGER, opened_at TEXT, closed_at TEXT, priority TEXT, status TEXT, technician_id INTEGER", srs)
table("pir", "pir_id INTEGER PRIMARY KEY, sr_id INTEGER, created_at TEXT, failure_code TEXT, root_cause TEXT, status TEXT", pirs)
table("claims", "claim_id INTEGER PRIMARY KEY, pir_id INTEGER, dealer_id INTEGER, submitted_at TEXT, claim_amount REAL, approved_amount REAL, status TEXT", claims)
cns[4] = (cns[4][0], cns[4][1], cns[4][2], round(cns[4][3] * 0.9, 2))  # edge case: credit note short-paid
table("credit_notes", "cn_id INTEGER PRIMARY KEY, claim_id INTEGER, issued_at TEXT, amount REAL", cns)

# ---------------- quality defects ----------------
defects = []
for i in range(1, 161):
    e = R.choice(engines)
    p = R.choice(parts)
    defects.append((i, e[0], p[0], rand_date("2026-01-01", "2026-11-15").isoformat(), R.choice(["Incoming", "Assembly", "End of Line Test", "Field"]),
                    R.choice(["Minor", "Minor", "Major", "Critical"])))
table("quality_defects", "defect_id INTEGER PRIMARY KEY, engine_id INTEGER, part_id INTEGER, detected_at TEXT, stage TEXT, severity TEXT", defects)

# ---------------- sensor readings (IoT telemetry) ----------------
readings = []
rid = 0
for e in engines[:20]:
    base_t = R.uniform(78, 88)
    t0 = datetime(2026, 11, 20, 8, 0, 0)
    for k in range(24):
        rid += 1
        ts = t0 + timedelta(minutes=5 * k)
        temp = round(base_t + R.uniform(-3, 3) + (14 if (e[0] % 7 == 0 and 10 <= k <= 14) else 0), 1)
        press = round(R.uniform(250, 420) - (120 if (e[0] % 9 == 0 and k > 18) else 0), 1)
        temp_v = None if R.random() < 0.02 else temp
        readings.append((rid, e[0], ts.strftime("%Y-%m-%d %H:%M:%S"), temp_v, press, R.randint(1200, 2100)))
table("sensor_readings", "reading_id INTEGER PRIMARY KEY, engine_id INTEGER, ts TEXT, temperature_c REAL, oil_pressure_kpa REAL, rpm INTEGER", readings)

# ---------------- engine daily status (gaps & islands) ----------------
eds = []
for e in engines[:6]:
    day = d("2026-11-01")
    for k in range(20):
        eds.append((e[0], (day + timedelta(days=k)).isoformat(), 1 if R.random() < 0.7 else 0))
table("engine_daily_status", "engine_id INTEGER, day TEXT, is_running INTEGER", eds)

# ---------------- raw feed with duplicates (dedup / CDC / incremental) ----------------
feed = []
fid = 0
for oid in range(1001, 1041):
    t = datetime(2026, 11, 1, 9, 0) + timedelta(hours=R.randint(0, 200))
    statuses = ["CREATED", "CONFIRMED", "SHIPPED", "DELIVERED"]
    n = R.randint(1, 4)
    amt = round(R.uniform(5000, 90000), 2)
    for s in statuses[:n]:
        fid += 1
        feed.append((fid, oid, s, amt, t.strftime("%Y-%m-%d %H:%M:%S"), (t + timedelta(minutes=R.randint(1, 30))).strftime("%Y-%m-%d %H:%M:%S")))
        if R.random() < 0.2:  # exact duplicate delivery (at-least-once)
            fid += 1
            feed.append((fid, oid, s, amt, t.strftime("%Y-%m-%d %H:%M:%S"), (t + timedelta(minutes=R.randint(31, 90))).strftime("%Y-%m-%d %H:%M:%S")))
        t += timedelta(hours=R.randint(2, 30))
table("raw_orders_feed", "event_id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT, amount REAL, updated_at TEXT, ingested_at TEXT", feed)

# target table for incremental / MERGE exercises
table("orders_current", "order_id INTEGER PRIMARY KEY, status TEXT, amount REAL, updated_at TEXT",
      [(1001, "CREATED", 12000.0, "2026-11-01 09:00:00"), (1002, "CONFIRMED", 45500.5, "2026-11-02 10:00:00")])
table("etl_watermarks", "pipeline TEXT PRIMARY KEY, last_loaded_at TEXT", [("orders", "2026-11-05 00:00:00")])

# ---------------- SCD type 2 customer dimension ----------------
scd = [
    (1, 3, "Marine", "South", "2024-01-01", "2025-06-30", 0),
    (2, 3, "Power Gen", "South", "2025-07-01", "9999-12-31", 1),
    (3, 7, "Agriculture", "North", "2024-01-01", "9999-12-31", 1),
    (4, 12, "Power Gen", "East", "2024-01-01", "2025-02-28", 0),
    (5, 12, "Power Gen", "West", "2025-03-01", "2026-04-30", 0),
    (6, 12, "Construction", "West", "2026-05-01", "9999-12-31", 1),
    (7, 18, "Trucking", "North", "2024-01-01", "9999-12-31", 1),
]
table("dim_customer_scd2", "customer_sk INTEGER PRIMARY KEY, customer_id INTEGER, segment TEXT, region TEXT, valid_from TEXT, valid_to TEXT, is_current INTEGER", scd)

# ---------------- small toy tables for teaching joins / nulls ----------------
table("toy_a", "id INTEGER, val TEXT", [(1, "a1"), (2, "a2"), (3, "a3"), (None, "a_null")])
table("toy_b", "id INTEGER, val TEXT", [(2, "b2"), (3, "b3"), (3, "b3_dup"), (4, "b4"), (None, "b_null")])

print("\n".join(out))
