"""Run every SQL / Python / PySpark reference solution against the real engines.
   python3 scripts/validate.py   (after node build.mjs)"""
import json, sqlite3, sys, io, types, contextlib, traceback, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = json.load(open(os.path.join(ROOT, 'dist', 'content.json')))
base = sqlite3.connect(':memory:'); base.executescript(open(os.path.join(ROOT, 'src', 'datasets.sql')).read())

def fresh():
    c = sqlite3.connect(':memory:'); base.backup(c); return c

def run_sql(code, check=None):
    c = fresh(); cur = None
    last = None
    for stmt in split(code):
        cur = c.execute(stmt)
        if cur.description: last = ([d[0] for d in cur.description], cur.fetchall())
    if check:
        cur = c.execute(check); last = ([d[0] for d in cur.description], cur.fetchall())
    return last

def split(code):
    # naive split on ; outside quotes
    out, buf, q = [], '', None
    for ch in code:
        if q:
            buf += ch
            if ch == q: q = None
        elif ch in "'\"": q = ch; buf += ch
        elif ch == ';':
            if buf.strip(): out.append(buf)
            buf = ''
        else: buf += ch
    if buf.strip(): out.append(buf)
    return out

def runSqlForPython(q, views):
    views = json.loads(views); c = fresh()
    try:
        for n, v in views.items():
            c.execute(f'DROP TABLE IF EXISTS "{n}"')
            c.execute(f'CREATE TEMP TABLE "{n}" ({", ".join(chr(34)+x+chr(34) for x in v["cols"])})')
            c.executemany(f'INSERT INTO "{n}" VALUES ({",".join("?"*len(v["cols"]))})', v["rows"])
        last = None
        for stmt in split(q):
            cur = c.execute(stmt)
            if cur.description: last = {"cols": [d[0] for d in cur.description], "rows": cur.fetchall()}
        return json.dumps(last or {"cols": [], "rows": []})
    except Exception as e:
        return json.dumps({"error": str(e)})
js = types.ModuleType('js'); js.runSqlForPython = runSqlForPython; sys.modules['js'] = js
sys.path.insert(0, os.path.join(ROOT, 'src')); import pyspark_shim

def run_py(code, tests, spark=False):
    ns = {'__name__': '__main__'}
    if spark:
        pyspark_shim.SparkSession._active = None
        from pyspark.sql import SparkSession, functions as F, types as T
        from pyspark.sql.window import Window
        ns.update(spark=SparkSession.builder.getOrCreate(), F=F, T=T, Window=Window)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(compile(code, '<sol>', 'exec'), ns)
        if tests: exec(compile(tests, '<tests>', 'exec'), ns)
    return ns, buf.getvalue()

fails = 0; n = 0; empties = []
sets = [l for w in C['worlds'] for l in w['lessons']] + C.get('practice', []) + [{'id': 'sql50:' + k['id'], 'cards': k['questions']} for k in C.get('sql50', {}).get('concepts', [])]
if True:
    for l in sets:
        for i, c in enumerate(l['cards']):
            tag = f"{l['id']}#{i} {c['t']}"
            try:
                if c['t'] == 'sql':
                    n += 1
                    cols, rows = run_sql(c['solution'], c.get('check'))
                    if not rows: empties.append(tag + ' :: ' + c['q'][:70])
                    if c.get('starter') and 'starter_ok' in c: pass
                elif c['t'] == 'py':
                    n += 1
                    run_py(c['solution'], c['tests'])
                    # starter must fail tests (otherwise the challenge is trivial)
                    if c.get('starter'):
                        try:
                            run_py(c['starter'], c['tests']); print('WARN starter passes tests:', tag)
                        except Exception: pass
                elif c['t'] == 'spark':
                    n += 1
                    ns, out = run_py(c['solution'], c.get('tests'), spark=True)
                    r = ns.get('result')
                    if not c.get('tests'):
                        if r is None or not hasattr(r, '_cols'): raise Exception('solution has no `result` DataFrame')
                        if not r._rows: empties.append(tag + ' :: ' + c['q'][:70])
            except Exception as e:
                fails += 1
                print('FAIL', tag, '::', c.get('q', '')[:80]); print('   ', ''.join(traceback.format_exception_only(type(e), e)).strip()[:400])
print(f'checked {n} code cards, {fails} failure(s)')
for e in empties: print('EMPTY RESULT', e)
sys.exit(1 if fails else 0)
