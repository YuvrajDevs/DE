/* Code engine for DE Arcade. Runs in a Web Worker so a runaway query or an
 * infinite loop never freezes the page (the page kills and restarts the worker).
 *   SQL      -> sql.js (SQLite compiled to WebAssembly)
 *   Python   -> Pyodide (CPython compiled to WebAssembly), loaded on first use
 *   PySpark  -> pyspark_shim.py running inside Pyodide, with spark.sql() bridged to SQLite
 */
const BASE = self.location.href.replace(/[^/]*$/, '');
let SQL = null, baseBytes = null, pyodide = null, pyReady = null;

async function initSql() {
  if (SQL) return;
  importScripts(BASE + 'vendor/sql/sql-wasm.js');
  SQL = await self.initSqlJs({ locateFile: f => BASE + 'vendor/sql/' + f });
  const ddl = await (await fetch(BASE + 'datasets.sql')).text();
  const db = new SQL.Database();
  db.exec(ddl);
  baseBytes = db.export();
  db.close();
}

function freshDb() { return new SQL.Database(baseBytes); }

function execAll(db, code) {
  // Returns the LAST statement that produced columns (like a SQL console).
  const res = db.exec(code);
  const withCols = res.filter(r => r.columns && r.columns.length);
  const last = withCols[withCols.length - 1];
  return last ? { cols: last.columns, rows: last.values } : { cols: [], rows: [], note: 'Statement executed. No rows returned.' };
}

function runSql(code, check) {
  const db = freshDb();
  try {
    let out = execAll(db, code);
    if (check) out = execAll(db, check);
    return out;
  } finally { db.close(); }
}

// spark.sql() / spark.table() bridge, called from Python
self.runSqlForPython = (query, viewsJson) => {
  const db = freshDb();
  try {
    const views = JSON.parse(viewsJson || '{}');
    for (const [name, v] of Object.entries(views)) {
      const q = s => '"' + String(s).replace(/"/g, '""') + '"';
      db.run(`DROP TABLE IF EXISTS ${q(name)}`);
      db.run(`CREATE TEMP TABLE ${q(name)} (${v.cols.map(q).join(', ')})`);
      if (v.rows.length) {
        const stmt = db.prepare(`INSERT INTO ${q(name)} VALUES (${v.cols.map(() => '?').join(',')})`);
        for (const r of v.rows) stmt.run(r);
        stmt.free();
      }
    }
    const res = execAll(db, query);
    return JSON.stringify(res);
  } catch (e) {
    return JSON.stringify({ error: String(e.message || e) });
  } finally { db.close(); }
};

async function initPy() {
  if (pyReady) return pyReady;
  pyReady = (async () => {
    await initSql();
    importScripts(BASE + 'vendor/py/pyodide.js');
    pyodide = await self.loadPyodide({ indexURL: BASE + 'vendor/py/' });
    const shim = await (await fetch(BASE + 'pyspark_shim.py')).text();
    pyodide.FS.writeFile('/home/pyodide/pyspark_shim.py', shim);
    pyodide.runPython(RUNNER);
  })();
  return pyReady;
}

const RUNNER = String.raw`
import sys, io, json, traceback, datetime, math
sys.path.insert(0, '/home/pyodide')
import pyspark_shim

def _norm(v):
    if isinstance(v, datetime.datetime): return v.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(v, datetime.date): return v.isoformat()
    if isinstance(v, bool): return 1 if v else 0
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)): return None
    if isinstance(v, (list, tuple)): return json.dumps([_norm(x) for x in v])
    if isinstance(v, dict): return json.dumps({k: _norm(x) for k, x in v.items()}, sort_keys=True)
    return v

def _fmt_exc(e):
    tb = traceback.extract_tb(e.__traceback__)
    mine = [f for f in tb if f.filename in ('<your code>', '<tests>')]
    lines = []
    for f in mine:
        where = 'your code' if f.filename == '<your code>' else 'test'
        lines.append(f'  {where}, line {f.lineno}: {f.line or ""}'.rstrip())
    msg = f'{type(e).__name__}: {e}'
    return ('\n'.join(lines) + '\n' if lines else '') + msg

def __run(code, tests, mode):
    buf = io.StringIO(); old = sys.stdout; sys.stdout = buf
    ns = {'__name__': '__main__'}
    out = {'ok': True}
    try:
        if mode == 'spark':
            pyspark_shim.SparkSession._active = None
            from pyspark.sql import SparkSession, functions as F, types as T
            from pyspark.sql.window import Window
            ns.update(spark=SparkSession.builder.getOrCreate(), F=F, T=T, Window=Window, SparkSession=SparkSession)
        exec(compile(code, '<your code>', 'exec'), ns)
        if tests:
            exec(compile(tests, '<tests>', 'exec'), ns)
        if mode == 'spark':
            r = ns.get('result')
            if r is not None and hasattr(r, '_cols'):
                out['cols'] = list(r._cols)
                out['rows'] = [[_norm(x.get(c)) for c in r._cols] for x in r._rows[:2000]]
                out['total'] = len(r._rows)
            elif r is not None:
                out['value'] = repr(r)
    except AssertionError as e:
        out['ok'] = False
        out['error'] = 'Test failed: ' + (str(e) or 'an assertion did not hold') + '\n' + _fmt_exc(e).split('\n')[0]
        out['failed_test'] = True
    except SyntaxError as e:
        out['ok'] = False
        out['error'] = f'SyntaxError on line {e.lineno}: {e.msg}\n  {(e.text or "").rstrip()}'
    except BaseException as e:
        out['ok'] = False
        out['error'] = _fmt_exc(e)
    finally:
        sys.stdout = old
    out['stdout'] = buf.getvalue()[-20000:]
    return json.dumps(out, default=str)
`;

async function runPython(code, tests, mode) {
  await initPy();
  pyodide.globals.set('__code', code);
  pyodide.globals.set('__tests', tests || '');
  pyodide.globals.set('__mode', mode);
  return JSON.parse(pyodide.runPython('__run(__code, __tests, __mode)'));
}

self.onmessage = async (ev) => {
  const { id, op } = ev.data;
  const t0 = performance.now();
  try {
    let result;
    if (op === 'init-sql') { await initSql(); result = { ok: true }; }
    else if (op === 'init-py') { await initPy(); result = { ok: true }; }
    else if (op === 'sql') {
      await initSql();
      const { code, solution, check } = ev.data;
      let user, err = null;
      try { user = runSql(code, check); } catch (e) { err = String(e.message || e); }
      result = { ok: !err, error: err, user };
      if (solution != null && !err) {
        try { result.expected = runSql(solution, check); } catch (e) { result.solutionError = String(e.message || e); }
      }
    } else if (op === 'schema') {
      await initSql();
      const db = freshDb();
      const tables = execAll(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").rows.map(r => r[0]);
      const out = tables.map(t => ({
        name: t,
        cols: db.exec(`PRAGMA table_info("${t}")`)[0].values.map(v => [v[1], v[2]]),
        count: db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0],
      }));
      db.close();
      result = { ok: true, tables: out };
    } else if (op === 'py' || op === 'spark') {
      const { code, tests, solution } = ev.data;
      result = await runPython(code, tests, op);
      if (op === 'spark' && solution != null && result.ok) {
        result.expected = await runPython(solution, '', 'spark');
      }
    } else throw new Error('unknown op ' + op);
    result.ms = Math.round(performance.now() - t0);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, result: { ok: false, error: String(e && e.message || e), engineError: true } });
  }
};
