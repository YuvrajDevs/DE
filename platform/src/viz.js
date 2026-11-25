/* DE Arcade - interactive visual simulations ("viz" cards).
 * Each sim: VIZ[kind](root, params, api) where api = { h, md, done(message) }.
 * A sim has a goal; reaching it calls api.done(), which awards XP in the player.
 */
window.DEVIZ = (() => {
'use strict';
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = v => v === null || v === undefined ? 'NULL' : String(v);
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

function table(h, cols, rows, opts = {}) {
  return h('div', { class: 'vt-wrap' }, h('table', { class: 'vt' },
    h('thead', null, h('tr', null, cols.map(c => h('th', null, c)))),
    h('tbody', null, rows.map((r, i) => h('tr', { class: (opts.rowClass && opts.rowClass(r, i)) || '', style: opts.rowStyle ? opts.rowStyle(r, i) : null, 'data-i': i },
      r.map(v => h('td', { class: v === null ? 'null' : '' }, fmt(v))))))));
}
function seg(h, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  const draw = () => wrap.replaceChildren(...options.map(([k, label]) => h('button', { role: 'radio', 'aria-checked': String(k === value), class: k === value ? 'on' : '', onclick: () => { value = k; draw(); onChange(k); } }, label)));
  draw();
  return wrap;
}
function slider(h, label, min, max, value, onInput, step = 1) {
  const out = h('b', { class: 'tabnum' }, String(value));
  const id = 'sl-' + Math.random().toString(36).slice(2, 8);
  const inp = h('input', { type: 'range', id, min, max, step, value });
  inp.addEventListener('input', () => { out.textContent = inp.value; onInput(+inp.value); });
  return h('label', { class: 'slider', for: id }, h('span', null, label), inp, out);
}
const goalLine = (h, text) => h('div', { class: 'goal' }, h('span', { class: 'goal-k' }, 'GOAL'), h('span', null, text));

// ------------------------------------------------------------------ JOIN
function join(root, p, { h, done }) {
  const A = [[1, 'a1'], [2, 'a2'], [3, 'a3'], [null, 'a_null']];
  const B = [[2, 'b2'], [3, 'b3'], [3, 'b3_dup'], [4, 'b4'], [null, 'b_null']];
  const target = p.target || null;
  let how = 'inner';
  const res = h('div'); const vis = h('div', { class: 'join-vis' });
  const explain = {
    inner: 'Only pairs whose keys are equal. Key 3 matches twice on the right, so a3 appears **twice** (joins multiply rows). NULL never equals NULL.',
    left: 'Every left row survives. Unmatched left rows get NULLs for the right side (a1, a_null).',
    right: 'Mirror of LEFT: every right row survives (b4, b_null get NULL left columns).',
    full: 'LEFT + RIGHT: every row from both sides, matched where possible.',
    semi: 'LEFT SEMI (WHERE EXISTS): left rows that have at least one match, **never duplicated**, right columns not returned.',
    anti: 'LEFT ANTI (NOT EXISTS): left rows with **no** match. The classic "find orphans" join. Note a_null: NULL keys never match, so it is an orphan.',
    cross: 'Every left row × every right row: 4 × 5 = 20 rows. Accidental cross joins are a classic cause of exploding pipelines.',
  };
  const md = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const draw = () => {
    const pairs = [];
    A.forEach((a, i) => B.forEach((b, j) => { if (how === 'cross' || (a[0] !== null && a[0] === b[0])) pairs.push([i, j]); }));
    const lm = new Set(pairs.map(x => x[0])), rm = new Set(pairs.map(x => x[1]));
    let rows = [];
    if (how === 'semi') rows = A.filter((a, i) => lm.has(i)).map(a => [a[0], a[1]]);
    else if (how === 'anti') rows = A.filter((a, i) => !lm.has(i)).map(a => [a[0], a[1]]);
    else {
      rows = pairs.map(([i, j]) => [A[i][0], A[i][1], B[j][0], B[j][1]]);
      if (how === 'left' || how === 'full') A.forEach((a, i) => { if (!lm.has(i)) rows.push([a[0], a[1], null, null]); });
      if (how === 'right' || how === 'full') B.forEach((b, j) => { if (!rm.has(j)) rows.push([null, null, b[0], b[1]]); });
    }
    // drawing: two columns of rows with SVG links
    const rowH = 30, W = 360, H = Math.max(A.length, B.length) * rowH + 10;
    const leftKeep = i => how === 'cross' || lm.has(i) || how === 'left' || how === 'full' || (how === 'anti' && !lm.has(i));
    const rightKeep = j => how !== 'semi' && how !== 'anti' && (rm.has(j) || how === 'right' || how === 'full' || how === 'cross');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'join-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Join links between table A and table B');
    const box = (x, y, label, on, side) => {
      const g = document.createElementNS(svgNS, 'g');
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 110); r.setAttribute('height', rowH - 8); r.setAttribute('rx', 5);
      r.setAttribute('class', on ? 'jbox on' : 'jbox');
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', x + 10); t.setAttribute('y', y + 16); t.setAttribute('class', 'jtxt'); t.textContent = label;
      g.append(r, t); svg.append(g);
    };
    A.forEach((a, i) => box(10, 5 + i * rowH, `${fmt(a[0])} · ${a[1]}`, leftKeep(i), 'L'));
    B.forEach((b, j) => box(W - 120, 5 + j * rowH, `${fmt(b[0])} · ${b[1]}`, rightKeep(j), 'R'));
    if (how !== 'cross') pairs.forEach(([i, j]) => {
      const l = document.createElementNS(svgNS, 'path');
      const y1 = 5 + i * rowH + (rowH - 8) / 2, y2 = 5 + j * rowH + (rowH - 8) / 2;
      l.setAttribute('d', `M120 ${y1} C ${W / 2} ${y1}, ${W / 2} ${y2}, ${W - 120} ${y2}`);
      l.setAttribute('class', 'jlink'); svg.append(l);
    });
    else { const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', W / 2); t.setAttribute('y', H / 2); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'jtxt big'); t.textContent = '4 × 5 = 20 pairs'; svg.append(t); }
    vis.replaceChildren(h('div', { class: 'join-heads' }, h('b', null, 'A (left)'), h('b', null, 'B (right)')), svg);
    const cols = how === 'semi' || how === 'anti' ? ['a.id', 'a.val'] : ['a.id', 'a.val', 'b.id', 'b.val'];
    res.replaceChildren(h('div', { class: 'vnote', html: md(explain[how]) }), h('div', { class: 'muted small' }, `Result: ${rows.length} row(s)`), table(h, cols, rows));
    if (target && how === target) done(`That's the ${target.toUpperCase()} join.`);
  };
  root.append(
    target ? goalLine(h, p.task) : null,
    seg(h, [['inner', 'INNER'], ['left', 'LEFT'], ['right', 'RIGHT'], ['full', 'FULL'], ['semi', 'SEMI'], ['anti', 'ANTI'], ['cross', 'CROSS']], how, k => { how = k; draw(); }),
    h('div', { class: 'viz-split' }, vis, res));
  draw();
  if (!target) done();
}

// ------------------------------------------------------------------ GROUP BY buckets
function groupby(root, p, { h, done }) {
  const rows = [['East', 120], ['West', 300], ['East', 80], ['North', 50], ['West', 100], ['East', null], ['North', 410], ['West', 60]];
  let agg = 'SUM', having = 0, grouped = false;
  const stage = h('div', { class: 'gb-stage' });
  const sqlBox = h('pre', { class: 'viz-sql' });
  const fns = { COUNT: v => v.filter(x => x !== null).length, 'COUNT(*)': v => v.length, SUM: v => v.filter(x => x !== null).reduce((a, b) => a + b, 0), AVG: v => { const n = v.filter(x => x !== null); return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length * 10) / 10 : null; }, MAX: v => Math.max(...v.filter(x => x !== null)) };
  const regionColor = { East: COLORS[0], West: COLORS[1], North: COLORS[2] };
  const draw = () => {
    sqlBox.textContent = `SELECT region, ${agg === 'COUNT(*)' ? 'COUNT(*)' : agg + '(amount)'} AS v\nFROM sales\nGROUP BY region${having ? `\nHAVING ${agg === 'COUNT(*)' ? 'COUNT(*)' : agg + '(amount)'} > ${having}` : ''};`;
    if (!grouped) {
      stage.replaceChildren(h('div', { class: 'gb-raw' }, rows.map(r => h('span', { class: 'gb-chip', style: { '--c': regionColor[r[0]] } }, `${r[0]} · ${fmt(r[1])}`))));
      return;
    }
    const groups = {};
    rows.forEach(r => (groups[r[0]] = groups[r[0]] || []).push(r[1]));
    stage.replaceChildren(h('div', { class: 'gb-bins' }, Object.entries(groups).map(([k, vals]) => {
      const v = fns[agg](vals); const kept = v !== null && v > having;
      return h('div', { class: 'gb-bin' + (kept ? '' : ' cut'), style: { '--c': regionColor[k] } },
        h('div', { class: 'gb-k' }, k),
        h('div', { class: 'gb-items' }, vals.map(x => h('span', { class: 'gb-chip', style: { '--c': regionColor[k] } }, fmt(x)))),
        h('div', { class: 'gb-v tabnum' }, `${agg} = ${fmt(v)}`),
        kept ? null : h('div', { class: 'gb-cut' }, 'removed by HAVING'));
    })));
  };
  const btn = h('button', { class: 'btn small primary', onclick: () => { grouped = !grouped; btn.textContent = grouped ? 'Ungroup' : 'Run GROUP BY'; draw(); if (grouped) done('Rows were split into one bucket per key, then each bucket collapsed to one row.'); } }, 'Run GROUP BY');
  root.append(goalLine(h, p.task || 'Run the GROUP BY, then try each aggregate and a HAVING threshold. Watch how NULL is ignored by COUNT(amount) but counted by COUNT(*).'),
    h('div', { class: 'row' }, seg(h, Object.keys(fns).map(k => [k, k]), agg, k => { agg = k; draw(); }), btn),
    slider(h, 'HAVING value >', 0, 500, 0, v => { having = v; draw(); }, 10),
    sqlBox, stage);
  draw();
}

// ------------------------------------------------------------------ WINDOW functions stepper
function windowfn(root, p, { h, done }) {
  const data = [['D1', '2026-01-03', 500], ['D1', '2026-01-09', 300], ['D1', '2026-01-15', 300], ['D1', '2026-02-02', 900], ['D2', '2026-01-05', 200], ['D2', '2026-01-20', 700], ['D2', '2026-02-11', 700]];
  let fn = 'ROW_NUMBER', partition = true, frame = 'default', step = -1;
  const out = h('div'); const sql = h('pre', { class: 'viz-sql' }); const note = h('div', { class: 'vnote' });
  const fnSql = () => ({ ROW_NUMBER: 'ROW_NUMBER()', RANK: 'RANK()', DENSE_RANK: 'DENSE_RANK()', 'SUM running': 'SUM(amount)', 'LAG': 'LAG(amount)', 'AVG 2-row': 'AVG(amount)' }[fn]);
  const compute = () => {
    const parts = {};
    data.forEach((r, i) => { const k = partition ? r[0] : 'all'; (parts[k] = parts[k] || []).push(i); });
    const val = new Array(data.length).fill(null), frames = new Array(data.length).fill(null);
    const byAmt = fn === 'ROW_NUMBER' || fn === 'RANK' || fn === 'DENSE_RANK';
    for (const idxs of Object.values(parts)) {
      const ord = [...idxs].sort((a, b) => byAmt ? data[b][2] - data[a][2] || (data[a][1] < data[b][1] ? -1 : 1) : (data[a][1] < data[b][1] ? -1 : 1));
      let rank = 0, dense = 0;
      ord.forEach((ri, k) => {
        const prev = k ? ord[k - 1] : null;
        const tie = prev !== null && data[prev][2] === data[ri][2];
        if (!tie) { rank = k + 1; dense++; }
        if (fn === 'ROW_NUMBER') val[ri] = k + 1;
        if (fn === 'RANK') val[ri] = rank;
        if (fn === 'DENSE_RANK') val[ri] = dense;
        if (fn === 'LAG') { val[ri] = k ? data[ord[k - 1]][2] : null; frames[ri] = k ? [ord[k - 1]] : []; }
        if (fn === 'SUM running') { const fr = ord.slice(0, k + 1); val[ri] = fr.reduce((a, j) => a + data[j][2], 0); frames[ri] = fr; }
        if (fn === 'AVG 2-row') { const fr = ord.slice(Math.max(0, k - 1), k + 1); val[ri] = fr.reduce((a, j) => a + data[j][2], 0) / fr.length; frames[ri] = fr; }
        if (!frames[ri]) frames[ri] = [ri];
      });
    }
    return { val, frames, order: Object.values(parts) };
  };
  const draw = () => {
    const orderBy = ['ROW_NUMBER', 'RANK', 'DENSE_RANK'].includes(fn) ? 'amount DESC' : 'claim_date';
    const fr = fn === 'AVG 2-row' ? ' ROWS BETWEEN 1 PRECEDING AND CURRENT ROW' : '';
    sql.textContent = `SELECT dealer, claim_date, amount,\n       ${fnSql()} OVER (${partition ? 'PARTITION BY dealer ' : ''}ORDER BY ${orderBy}${fr}) AS w\nFROM claims;`;
    const { val, frames } = compute();
    const cur = step >= 0 ? step : null;
    out.replaceChildren(table(h, ['dealer', 'claim_date', 'amount', 'w'], data.map((r, i) => [r[0], r[1], r[2], i <= step ? (typeof val[i] === 'number' && !Number.isInteger(val[i]) ? Math.round(val[i] * 10) / 10 : val[i]) : '…']), {
      rowClass: (r, i) => [i === cur ? 'cur' : '', cur !== null && frames[cur] && frames[cur].includes(i) && i !== cur ? 'inframe' : '', partition && data[i][0] === 'D2' ? 'p2' : ''].join(' '),
    }));
    const notes = {
      ROW_NUMBER: 'Unique 1, 2, 3… per partition even on ties (D1 has two 300s: one gets 2, the other 3, arbitrarily unless you add a tiebreaker). Use it for **dedup / latest record**.',
      RANK: 'Ties share a rank and leave a **gap** after (1, 2, 2, 4).',
      DENSE_RANK: 'Ties share a rank with **no gap** (1, 2, 2, 3). Use for "Nth highest distinct value".',
      'SUM running': 'With ORDER BY and no frame, the default frame is RANGE UNBOUNDED PRECEDING → CURRENT ROW, so it is a running total. The highlighted rows are the frame for the current row.',
      LAG: 'LAG looks one row back inside the partition (first row gets NULL). Great for deltas: amount - LAG(amount).',
      'AVG 2-row': 'An explicit ROWS frame: the current row and 1 before it. A moving average.',
    };
    note.innerHTML = notes[fn].replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') + (partition ? '' : ' <b>Partition is off</b>: the whole table is one window.');
  };
  const stepBtn = h('button', { class: 'btn small primary', onclick: () => { step = Math.min(data.length - 1, step + 1); draw(); if (step === data.length - 1) done('Window computed. Rows were kept, unlike GROUP BY.'); } }, 'Step ▸');
  root.append(goalLine(h, p.task || 'Pick a function and step through every row. Highlighted rows are the window frame the engine looks at for the current row.'),
    seg(h, ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'SUM running', 'LAG', 'AVG 2-row'].map(k => [k, k]), fn, k => { fn = k; step = -1; draw(); }),
    h('div', { class: 'row' }, h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', checked: true, id: 'wpart' }); c.addEventListener('change', () => { partition = c.checked; step = -1; draw(); }); return c; })(), ' PARTITION BY dealer'),
      h('span', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => { step = data.length - 1; draw(); done(); } }, 'Fill all'), stepBtn),
    sql, out, note);
  draw();
}

// ------------------------------------------------------------------ Logical query order game
function queryorder(root, p, { h, done }) {
  const clauses = [
    ['FROM claims c JOIN dealers d ON …', 'FROM / JOIN', 'Build the working set: 97 claims × matching dealer → 97 rows.', 97],
    ['WHERE c.status <> \'Rejected\'', 'WHERE', 'Row filter BEFORE grouping. Cannot use aggregates or SELECT aliases here.', 75],
    ['GROUP BY d.region', 'GROUP BY', 'Collapse into one row per region.', 4],
    ['HAVING SUM(c.claim_amount) > 1e6', 'HAVING', 'Filter groups (aggregates allowed).', 3],
    ['SELECT d.region, SUM(…) AS total, RANK() OVER (…)', 'SELECT (+ window)', 'Compute output columns. Window functions run here, after grouping.', 3],
    ['DISTINCT', 'DISTINCT', 'Remove duplicate output rows.', 3],
    ['ORDER BY total DESC', 'ORDER BY', 'Sort. This is the first clause that can see SELECT aliases.', 3],
    ['LIMIT 2', 'LIMIT', 'Cut to the first N rows.', 2],
  ];
  const picked = [];
  const pool = h('div', { class: 'qo-pool' }); const lane = h('div', { class: 'qo-lane' }); const msg = h('div', { class: 'vnote' });
  const shuffled = shuffle(clauses.map((c, i) => ({ c, i })));
  const draw = () => {
    lane.replaceChildren(...picked.map((x, k) => h('div', { class: 'qo-step' }, h('span', { class: 'qo-n' }, k + 1), h('div', null, h('b', null, x.c[1]), h('div', { class: 'muted small' }, x.c[2])), h('span', { class: 'qo-rows tabnum' }, `${x.c[3]} rows`))));
    pool.replaceChildren(...shuffled.filter(x => !picked.includes(x)).map(x => h('button', { class: 'tok mono', onclick: () => {
      if (x.i === picked.length) { picked.push(x); msg.textContent = ''; draw(); if (picked.length === clauses.length) done('That is the logical processing order. Engines may physically reorder for speed (e.g. predicate pushdown), but results must match this order.'); }
      else { msg.textContent = `Not yet: "${x.c[1]}" runs later. What does the engine need first?`; }
    } }, x.c[0])));
  };
  root.append(goalLine(h, p.task || 'Click the clauses in the order the database logically evaluates them. Watch the row count change at each step.'), pool, msg, lane);
  draw();
}

// ------------------------------------------------------------------ Spark DAG / stages builder
function sparkdag(root, p, { h, done }) {
  const OPS = {
    'read parquet': { wide: false, src: true }, filter: { wide: false }, select: { wide: false }, withColumn: { wide: false },
    'join (broadcast)': { wide: false }, groupBy: { wide: true }, 'join (sort-merge)': { wide: true }, orderBy: { wide: true }, distinct: { wide: true },
    'repartition(8)': { wide: true }, 'coalesce(2)': { wide: false }, write: { wide: false, action: true }, 'count()': { wide: false, action: true },
  };
  let ops = ['read parquet'];
  const canvas = h('div', { class: 'dag' }); const info = h('div', { class: 'vnote' });
  const target = p.stages || 3;
  const draw = () => {
    const stages = [[]];
    ops.forEach(o => { if (OPS[o].wide) stages.push([]); stages[stages.length - 1].push(o); });
    const hasAction = ops.some(o => OPS[o].action);
    canvas.replaceChildren(...stages.flatMap((s, i) => [
      i ? h('div', { class: 'dag-shuffle' }, h('span', null, 'SHUFFLE'), h('small', null, 'data moves across the network, written to disk, new stage')) : null,
      h('div', { class: 'dag-stage' }, h('div', { class: 'dag-sh' }, `Stage ${i}`, h('small', null, `${i === 0 ? 8 : 200} tasks`)), h('div', { class: 'dag-ops' }, s.map(o => h('span', { class: 'dag-op' + (OPS[o].action ? ' act' : '') + (OPS[o].wide ? ' wide' : '') }, o))),
        h('div', { class: 'dag-tasks' }, Array.from({ length: i === 0 ? 8 : 12 }, (_, k) => h('i', { style: { animationDelay: (k * 60) + 'ms' } })))),
    ]).filter(Boolean));
    info.innerHTML = hasAction
      ? `Job submitted by the action. <b>${stages.length} stage(s)</b>, ${stages.length - 1} shuffle(s). Narrow transformations (filter, select, withColumn, broadcast join, coalesce) are <b>pipelined</b> inside one stage; wide ones (groupBy, sort-merge join, orderBy, distinct, repartition) end a stage.`
      : `Nothing has run yet: transformations are <b>lazy</b>. Spark is only building a plan. Add an action (write or count()) to trigger a job.`;
    if (hasAction && stages.length === target) done(`Built a ${target}-stage job.`);
  };
  root.append(goalLine(h, p.task || `Build a pipeline that ends in an action and runs as exactly ${target} stages.`),
    h('div', { class: 'dag-palette' }, Object.keys(OPS).filter(o => o !== 'read parquet').map(o => h('button', { class: 'tok mono' + (OPS[o].wide ? ' wide' : ''), onclick: () => { if (ops.some(x => OPS[x].action)) { ops = ops.filter(x => !OPS[x].action); } ops.push(o); draw(); } }, o)),
      h('button', { class: 'btn small ghost', onclick: () => { ops = ['read parquet']; draw(); } }, 'Clear')),
    h('div', { class: 'legend' }, h('span', { class: 'lg narrow' }, 'narrow'), h('span', { class: 'lg wide' }, 'wide (shuffle)'), h('span', { class: 'lg act' }, 'action')),
    canvas, info);
  draw();
}

// ------------------------------------------------------------------ Skew + salting
function skew(root, p, { h, done }) {
  const keys = { 'Pune Power Services': 620, 'Mumbai Engine Care': 70, 'Delhi Diesel Hub': 60, 'Chennai Torque Point': 55, 'Kolkata Engine Works': 50, 'Hyderabad Gen Serve': 48, 'Ahmedabad Motive': 52, 'Lucknow Service Bay': 45 };
  const P = 8; let salt = 1, aqe = false;
  const bars = h('div', { class: 'skew-bars' }); const stat = h('div', { class: 'vnote' }); const code = h('pre', { class: 'viz-sql' });
  const hash = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  const draw = () => {
    const parts = new Array(P).fill(0);
    Object.entries(keys).forEach(([k, n]) => {
      if (salt === 1) parts[hash(k) % P] += n;
      else for (let s = 0; s < salt; s++) parts[hash(k + '#' + s) % P] += n / salt;
    });
    if (aqe) { const avg = parts.reduce((a, b) => a + b, 0) / P; for (let i = 0; i < P; i++) if (parts[i] > 2.5 * avg) { const extra = parts[i] - avg * 1.6; parts[i] -= extra; const j = parts.indexOf(Math.min(...parts)); parts[j] += extra; } }
    const mx = Math.max(...parts), avg = parts.reduce((a, b) => a + b, 0) / P;
    bars.replaceChildren(...parts.map((n, i) => h('div', { class: 'skew-col' }, h('div', { class: 'skew-bar' + (n === mx && mx > 2 * avg ? ' hot' : ''), style: { height: (100 * n / Math.max(mx, 1)) + '%' } }), h('span', { class: 'tabnum' }, Math.round(n)), h('small', null, `task ${i}`))));
    const ratio = mx / avg;
    stat.innerHTML = `Stage time = slowest task. Max/avg = <b>${ratio.toFixed(2)}×</b>. ${ratio > 2 ? 'One task is doing most of the work while the other executors sit idle: <b>skew</b>.' : 'Work is balanced across tasks.'}`;
    code.textContent = salt === 1 ? `claims.join(dealers, "dealer_id")   # hot key: Pune Power Services` :
      `# salt the big side, explode the small side\nclaims_s  = claims.withColumn("salt", (F.rand()*${salt}).cast("int"))\ndealers_s = dealers.withColumn("salt", F.explode(F.array(*[F.lit(i) for i in range(${salt})])))\nclaims_s.join(dealers_s, ["dealer_id", "salt"])`;
    if (ratio < 2) done('Skew tamed. The hot key is spread over several tasks.');
  };
  root.append(goalLine(h, p.task || 'One dealer has ~60% of all claims. Get max/avg task size under 2× using salting or AQE skew handling.'),
    slider(h, 'Salt buckets', 1, 8, 1, v => { salt = v; draw(); }),
    h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', id: 'aqe' }); c.addEventListener('change', () => { aqe = c.checked; draw(); }); return c; })(), ' spark.sql.adaptive.skewJoin.enabled (AQE splits skewed partitions)'),
    bars, stat, code);
  draw();
}

// ------------------------------------------------------------------ Broadcast vs shuffle cost
function broadcastjoin(root, p, { h, done }) {
  let big = 500, small = 8, strat = 'smj', execs = 10;
  const out = h('div', { class: 'bj' }); const note = h('div', { class: 'vnote' });
  const draw = () => {
    const smj = big + small; // both sides shuffled once
    const bhj = small * execs; // small side copied to every executor
    const cost = strat === 'smj' ? smj : bhj;
    const best = Math.min(smj, bhj) === cost;
    const oom = strat === 'bhj' && small > 1024;
    out.replaceChildren(
      h('div', { class: 'bj-row' }, h('span', null, 'Sort-merge join network'), h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, 100 * smj / Math.max(smj, bhj)) + '%' } })), h('b', { class: 'tabnum' }, `${smj} MB`)),
      h('div', { class: 'bj-row' }, h('span', null, 'Broadcast join network'), h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, 100 * bhj / Math.max(smj, bhj)) + '%' } })), h('b', { class: 'tabnum' }, `${bhj} MB`)));
    note.innerHTML = oom ? '<b>Driver/executor OOM risk:</b> a broadcast side must fit in memory on every executor. Keep broadcasts small (default auto threshold 10 MB, commonly raised to a few hundred MB).'
      : strat === 'smj' ? 'Sort-merge: both tables are hash-partitioned by the key (shuffle) and sorted, then merged. Scales to any size but pays a shuffle of the big table.'
      : 'Broadcast hash join: the small table is copied to every executor once. The big table never moves, so there is <b>no shuffle of the big side</b>.';
    if (best && !oom && big >= 200 && small <= 50 && strat === 'bhj') done('Broadcast the small dimension: the big fact table never shuffles.');
  };
  root.append(goalLine(h, p.task || 'Fact table 500 MB, dealers dimension 8 MB, 10 executors. Pick the strategy with the least network traffic, then push the small side past 1 GB and see why broadcast stops being safe.'),
    slider(h, 'Big table (MB)', 50, 5000, big, v => { big = v; draw(); }, 50),
    slider(h, 'Small table (MB)', 1, 2000, small, v => { small = v; draw(); }),
    seg(h, [['smj', 'Sort-merge (shuffle)'], ['bhj', 'Broadcast hash']], strat, k => { strat = k; draw(); }), out, note);
  draw();
}

// ------------------------------------------------------------------ Kafka partitions & consumer groups
function kafka(root, p, { h, done }) {
  let parts = 3, consumers = 2, offsets = [], lag = [], keyed = true;
  const keys = ['engine-7', 'engine-12', 'engine-3', 'engine-7', 'engine-21', 'engine-12', 'engine-3', 'engine-7'];
  const view = h('div', { class: 'kf' }); const note = h('div', { class: 'vnote' });
  let rr = 0;
  const reset = () => { offsets = Array.from({ length: parts }, () => []); lag = new Array(parts).fill(0); };
  reset();
  const hash = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
  const assign = () => { const a = Array.from({ length: consumers }, () => []); for (let i = 0; i < parts; i++) a[i % consumers].push(i); return a; };
  const draw = () => {
    const a = assign();
    const idle = a.filter(x => !x.length).length;
    view.replaceChildren(
      h('div', { class: 'kf-col' }, h('div', { class: 'kf-h' }, 'Producer'), h('button', { class: 'btn small primary', onclick: () => produce(1) }, 'Send event'), h('button', { class: 'btn small', onclick: () => produce(8) }, 'Send 8'),
        h('label', { class: 'check' }, (() => { const c = h('input', { type: 'checkbox', checked: keyed, id: 'kkey' }); c.addEventListener('change', () => { keyed = c.checked; }); return c; })(), ' key = engine_id')),
      h('div', { class: 'kf-col grow' }, h('div', { class: 'kf-h' }, `Topic engine-telemetry · ${parts} partitions`),
        ...offsets.map((log, i) => h('div', { class: 'kf-part' }, h('span', { class: 'kf-pn' }, `P${i}`), h('div', { class: 'kf-log' }, log.slice(-14).map((m, k) => h('span', { class: 'kf-msg' + (k + Math.max(0, log.length - 14) < log.length - lag[i] ? ' read' : ''), title: m }, m.replace('engine-', 'e')))), h('span', { class: 'kf-lag tabnum' }, `lag ${lag[i]}`)))),
      h('div', { class: 'kf-col' }, h('div', { class: 'kf-h' }, `Consumer group · ${consumers}`), ...a.map((ps, c) => h('div', { class: 'kf-cons' + (ps.length ? '' : ' idle') }, `C${c}`, h('small', null, ps.length ? ps.map(x => 'P' + x).join(', ') : 'idle'))),
        h('button', { class: 'btn small', onclick: () => { lag = lag.map(() => 0); draw(); check(); } }, 'Consume (commit offsets)')));
    note.innerHTML = `${idle ? `<b>${idle} idle consumer(s)</b>: a partition is read by at most one consumer in a group, so consumers beyond the partition count do nothing. ` : ''}` +
      (keyed ? 'With a key, the same engine always lands in the same partition: <b>ordering per engine is preserved</b>.' : 'Without a key, events are spread round-robin: balanced, but <b>no ordering guarantee per engine</b>.');
  };
  const produce = (n) => {
    for (let i = 0; i < n; i++) { const k = keys[(rr++) % keys.length]; const pi = keyed ? hash(k) % parts : rr % parts; offsets[pi].push(k); lag[pi]++; }
    draw();
  };
  const check = () => { const a = assign(); if (a.every(x => x.length) && consumers === parts && lag.every(x => x === 0) && offsets.some(x => x.length)) done('Every partition has exactly one consumer and lag is zero. Max parallelism = partition count.'); };
  root.append(goalLine(h, p.task || 'Send some events, then size the consumer group so no consumer is idle and every partition is read. Consume until lag is 0.'),
    h('div', { class: 'row' }, slider(h, 'Partitions', 1, 6, parts, v => { parts = v; reset(); draw(); }), slider(h, 'Consumers', 1, 8, consumers, v => { consumers = v; draw(); check(); })),
    view, note);
  draw();
}

// ------------------------------------------------------------------ Watermark & late data
function watermark(root, p, { h, done }) {
  // [event minute, arrival minute]
  const ev = [[1, 1], [3, 4], [6, 6], [9, 10], [4, 12], [12, 13], [14, 14], [11, 16], [18, 19], [7, 22], [21, 22], [25, 26]];
  let delay = 0;
  const view = h('div', { class: 'wm' }); const note = h('div', { class: 'vnote' });
  const draw = () => {
    let maxEv = -Infinity; const rows = [];
    ev.forEach(([e, a]) => {
      const wmBefore = maxEv - delay;
      const winStart = Math.floor(e / 10) * 10;
      const dropped = winStart + 10 <= wmBefore; // window already finalized
      rows.push({ e, a, dropped, wm: wmBefore });
      maxEv = Math.max(maxEv, e);
    });
    const counts = {}; rows.forEach(r => { if (!r.dropped) { const w = Math.floor(r.e / 10) * 10; counts[w] = (counts[w] || 0) + 1; } });
    view.replaceChildren(
      h('div', { class: 'wm-track' }, rows.map(r => h('div', { class: 'wm-ev' + (r.dropped ? ' drop' : '') + (r.a - r.e > 2 ? ' late' : ''), style: { left: (r.e / 30 * 100) + '%', top: (r.a / 30 * 100) + '%' }, title: `event ${r.e}m, arrived ${r.a}m` }))),
      h('div', { class: 'wm-axes muted small' }, 'x = event time (when it happened) · y = arrival time · dashed boxes = 10-min tumbling windows'),
      h('div', { class: 'wm-wins' }, [0, 10, 20].map(w => h('div', { class: 'wm-win' }, h('b', null, `[${w}, ${w + 10})`), h('span', { class: 'tabnum' }, `${counts[w] || 0} event(s)`)))));
    const dropped = rows.filter(r => r.dropped).length;
    note.innerHTML = `Watermark = max event time seen − <b>${delay} min</b>. A window is finalized once the watermark passes its end; events for a finalized window are <b>dropped</b> (red). ${dropped} dropped. Bigger delay = more late data accepted, but more state held in memory and later results.`;
    const extreme = rows.find(r => r.e === 7 && r.a === 22);
    if (dropped === 1 && extreme && extreme.dropped) done('Late-but-reasonable events kept; the one 15-minute straggler dropped. That is the trade-off a watermark encodes.');
  };
  root.append(goalLine(h, p.task || 'Find the smallest watermark delay that keeps every event except the extreme straggler (happened at minute 7, arrived at minute 22).'),
    slider(h, 'withWatermark delay (min)', 0, 20, 0, v => { delay = v; draw(); }),
    view, note,
    h('pre', { class: 'viz-sql' }, 'events.withWatermark("event_time", "<delay> minutes")\n      .groupBy(F.window("event_time", "10 minutes"))\n      .count()'));
  draw();
}

// ------------------------------------------------------------------ Incremental load & idempotency
function incremental(root, p, { h, done }) {
  const source = [
    { id: 1001, status: 'CREATED', ts: '09:00' }, { id: 1002, status: 'CONFIRMED', ts: '09:20' },
    { id: 1003, status: 'CREATED', ts: '10:05' }, { id: 1001, status: 'SHIPPED', ts: '10:40' }, { id: 1004, status: 'CREATED', ts: '11:10' },
  ];
  let target = [], wm = '00:00', mode = 'append', runs = 0;
  const tv = h('div'); const log = h('div', { class: 'vnote' }); const sv = h('div');
  const run = () => {
    runs++;
    let batch = mode === 'full-append' ? source : source.filter(r => r.ts > wm);
    if (mode === 'append' || mode === 'full-append') target = target.concat(batch.map(r => ({ ...r })));
    if (mode === 'merge') {
      for (const r of batch) { const i = target.findIndex(t => t.id === r.id); if (i >= 0) { if (target[i].ts < r.ts) target[i] = { ...r }; } else target.push({ ...r }); }
    }
    if (mode !== 'full-append' && batch.length) wm = batch.map(r => r.ts).sort().pop();
    draw(`Run #${runs}: read ${batch.length} row(s)` + (mode === 'full-append' ? ' (everything, every time)' : ` with ts > watermark`) + `. Watermark now ${wm}.`);
  };
  const draw = (msg) => {
    sv.replaceChildren(h('div', { class: 'muted small' }, 'source (orders, latest change last)'), table(h, ['order_id', 'status', 'updated_at'], source.map(r => [r.id, r.status, r.ts])));
    const dupIds = target.map(r => r.id).filter((x, i, a) => a.indexOf(x) !== i);
    tv.replaceChildren(h('div', { class: 'muted small' }, `target (${target.length} rows)`), table(h, ['order_id', 'status', 'updated_at'], target.map(r => [r.id, r.status, r.ts]), { rowClass: r => dupIds.includes(r[0]) ? 'dup' : '' }));
    const correct = target.length === 4 && !dupIds.length && target.find(r => r.id === 1001)?.status === 'SHIPPED';
    log.innerHTML = (msg ? msg + '<br>' : '') + (dupIds.length ? `<b>Duplicates for ${[...new Set(dupIds)].join(', ')}</b>. Re-running is not safe: this pipeline is <b>not idempotent</b>.` : correct ? `Target = one current row per order. Run it again: with MERGE + watermark nothing changes. That is <b>idempotent</b>.` : 'Target incomplete.');
    if (correct && runs >= 2 && mode === 'merge') done('Incremental + MERGE: correct and safe to re-run.');
  };
  root.append(goalLine(h, p.task || 'Get the target to exactly one current row per order (1001 must be SHIPPED), and prove it by running the pipeline at least twice with no duplicates.'),
    seg(h, [['full-append', 'Full reload, append'], ['append', 'Incremental, append'], ['merge', 'Incremental, MERGE (upsert)']], mode, k => { mode = k; }),
    h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: run }, '▶ Run pipeline'), h('button', { class: 'btn small ghost', onclick: () => { target = []; wm = '00:00'; runs = 0; draw('Target truncated, watermark reset.'); } }, 'Reset target')),
    h('div', { class: 'viz-split' }, sv, tv), log);
  draw();
}

// ------------------------------------------------------------------ SCD types
function scd(root, p, { h, done }) {
  const base = [[1, 12, 'Bhima Cranes', 'West', '2025-03-01', '9999-12-31', 'Y']];
  let type = '1';
  const out = h('div'); const note = h('div', { class: 'vnote' });
  const draw = () => {
    let cols = ['sk', 'customer_id', 'name', 'region', 'valid_from', 'valid_to', 'current'], rows;
    if (type === '0') { rows = base; note.innerHTML = '<b>Type 0 (retain original):</b> the attribute never changes. Use for things like original signup date.'; }
    if (type === '1') { rows = [[1, 12, 'Bhima Cranes', 'North', '2025-03-01', '9999-12-31', 'Y']]; note.innerHTML = '<b>Type 1 (overwrite):</b> history lost. Old claims now report under North. Fine for typo fixes, wrong for regional performance history.'; }
    if (type === '2') { rows = [[1, 12, 'Bhima Cranes', 'West', '2025-03-01', '2026-11-30', 'N'], [2, 12, 'Bhima Cranes', 'North', '2026-12-01', '9999-12-31', 'Y']]; note.innerHTML = '<b>Type 2 (new row):</b> close the old version, insert a new one with a new <b>surrogate key</b>. Facts loaded before Dec 1 point to sk=1 (West), later facts to sk=2 (North). Full history, point-in-time correct.'; }
    if (type === '3') { cols = ['sk', 'customer_id', 'name', 'region', 'previous_region']; rows = [[1, 12, 'Bhima Cranes', 'North', 'West']]; note.innerHTML = '<b>Type 3 (previous column):</b> keeps only one prior value. Cheap, limited history.'; }
    out.replaceChildren(table(h, cols, rows, { rowClass: r => r[6] === 'Y' || type === '3' || type === '1' ? 'cur' : '' }));
    if (type === '2') done('Type 2 keeps full history with validity ranges.');
  };
  root.append(h('div', { class: 'notice' }, 'Change event: customer 12 (Bhima Cranes) moves from West to North on 2026-12-01.'),
    goalLine(h, p.task || 'Apply each SCD type and find the one that lets last quarter\'s claims still report under West.'),
    seg(h, [['0', 'Type 0'], ['1', 'Type 1'], ['2', 'Type 2'], ['3', 'Type 3']], type, k => { type = k; draw(); }), out, note);
  draw();
}

// ------------------------------------------------------------------ Star schema explorer
function star(root, p, { h, done }) {
  const dims = {
    dim_date: ['date_key', 'date', 'month', 'quarter', 'fiscal_year', 'is_holiday'],
    dim_dealer: ['dealer_key', 'dealer_id', 'dealer_name', 'region', 'city'],
    dim_engine: ['engine_key', 'serial_no', 'model', 'horsepower', 'plant_name'],
    dim_customer: ['customer_key', 'customer_id', 'segment', 'region', 'valid_from', 'valid_to'],
    dim_failure: ['failure_key', 'failure_code', 'system', 'root_cause'],
  };
  const fact = ['claim_key', 'date_key', 'dealer_key', 'engine_key', 'customer_key', 'failure_key', 'claim_amount', 'approved_amount', 'days_to_approve'];
  const seen = new Set(); const info = h('div', { class: 'vnote' });
  const W = 520, H = 330, cx = W / 2, cy = H / 2;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'star-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Star schema with fact_claims at the centre');
  const names = Object.keys(dims);
  const pos = names.map((n, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / names.length; return [cx + Math.cos(a) * 190, cy + Math.sin(a) * 120]; });
  names.forEach((n, i) => { const l = document.createElementNS(svgNS, 'line'); l.setAttribute('x1', cx); l.setAttribute('y1', cy); l.setAttribute('x2', pos[i][0]); l.setAttribute('y2', pos[i][1]); l.setAttribute('class', 'st-line'); svg.append(l); });
  const node = (x, y, label, cls, onclick) => {
    const g = document.createElementNS(svgNS, 'g'); g.setAttribute('class', 'st-node ' + cls); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
    const r = document.createElementNS(svgNS, 'rect'); const w = label.length * 8 + 26; r.setAttribute('x', x - w / 2); r.setAttribute('y', y - 16); r.setAttribute('width', w); r.setAttribute('height', 32); r.setAttribute('rx', 7);
    const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', x); t.setAttribute('y', y + 5); t.setAttribute('text-anchor', 'middle'); t.textContent = label;
    g.append(r, t); g.addEventListener('click', onclick); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(); } }); svg.append(g); return g;
  };
  node(cx, cy, 'fact_claims', 'fact', () => { info.innerHTML = `<b>fact_claims</b> · grain: <b>one row per warranty claim</b>.<br>Foreign keys: ${fact.slice(1, 6).join(', ')}<br>Measures (numbers you aggregate): claim_amount, approved_amount, days_to_approve`; });
  names.forEach((n, i) => node(pos[i][0], pos[i][1], n, 'dim', () => {
    seen.add(n);
    info.innerHTML = `<b>${n}</b> · descriptive context you filter and group by.<br>Columns: ${dims[n].join(', ')}<br><span class="muted">${seen.size}/${names.length} dimensions explored</span>`;
    if (seen.size === names.length) done('A star: one fact table of measures at a declared grain, surrounded by denormalized dimensions. Queries = join fact to a few dims, filter, group.');
  }));
  root.append(goalLine(h, p.task || 'Click the fact table, then every dimension. Note which columns are keys, which are measures and which are attributes.'), h('div', { class: 'star-wrap' }, svg), info);
}

// ------------------------------------------------------------------ Partition pruning
function pruning(root, p, { h, done }) {
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
  const regions = ['North', 'South', 'East', 'West'];
  let layout = 'month', filter = 'month';
  const grid = h('div', { class: 'pr-grid' }); const note = h('div', { class: 'vnote' }); const sql = h('pre', { class: 'viz-sql' });
  const draw = () => {
    const files = layout === 'none' ? Array.from({ length: 48 }, (_, i) => ({ m: months[i % 12], r: regions[i % 4], path: `part-${String(i).padStart(5, '0')}.parquet` }))
      : layout === 'month' ? months.flatMap(m => regions.map(r => ({ m, r, path: `claim_month=${m}/part-${r[0]}.parquet` })))
      : months.flatMap(m => regions.map(r => ({ m, r, path: `region=${r}/claim_month=${m}/part.parquet` })));
    const want = f => filter === 'month' ? f.m === '2026-10' : filter === 'region' ? f.r === 'West' : f.m === '2026-10' && f.r === 'West';
    const scanned = f => layout === 'none' ? true : layout === 'month' ? (filter === 'region' ? true : f.m === '2026-10') : (filter === 'month' ? f.m === '2026-10' : filter === 'region' ? f.r === 'West' : want(f));
    const n = files.filter(scanned).length;
    grid.replaceChildren(...files.map(f => h('span', { class: 'pr-file' + (scanned(f) ? ' scan' : '') + (want(f) ? ' hit' : ''), title: f.path })));
    sql.textContent = `SELECT SUM(claim_amount) FROM lake.claims\nWHERE ${filter === 'month' ? "claim_month = '2026-10'" : filter === 'region' ? "region = 'West'" : "claim_month = '2026-10' AND region = 'West'"};\n-- layout: ${layout === 'none' ? 'no partitioning' : layout === 'month' ? 'partitionBy("claim_month")' : 'partitionBy("region", "claim_month")'}`;
    note.innerHTML = `Files scanned: <b>${n}/${files.length}</b> (${Math.round(100 * n / files.length)}%). ${layout === 'none' ? 'Without partitions every file is opened (Parquet min/max stats can still skip some row groups).' : n === files.length ? 'The filter is not on a partition column, so <b>no pruning</b>.' : 'The engine skips whole folders whose partition value cannot match: <b>partition pruning</b>.'} Partition on columns you filter by often, with low-to-medium cardinality; never on IDs (millions of tiny files).`;
    if (n <= 4 && layout !== 'none') done('Pruned to just the folders that can match.');
  };
  root.append(goalLine(h, p.task || 'Pick a partition layout and a query so the engine opens at most 4 of the 48 files.'),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Layout'), seg(h, [['none', 'None'], ['month', 'By month'], ['both', 'By region, month']], layout, k => { layout = k; draw(); })),
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Filter'), seg(h, [['month', 'month = 2026-10'], ['region', 'region = West'], ['both', 'both']], filter, k => { filter = k; draw(); })),
    sql, grid, h('div', { class: 'legend' }, h('span', { class: 'lg scan' }, 'scanned'), h('span', { class: 'lg skip' }, 'skipped'), h('span', { class: 'lg hit' }, 'contains matching rows')), note);
  draw();
}

// ------------------------------------------------------------------ Medallion walkthrough
function medallion(root, p, { h, done }) {
  const steps = [
    ['Source', 'Dealer portal API (JSON, at-least-once delivery)', '{"claimId":"C-0097","dealer":" pune power services ","amt":"1,24,500.00","submitted":"25/11/2026 14:02","status":"approved"}\n{"claimId":"C-0097","dealer":" pune power services ","amt":"1,24,500.00","submitted":"25/11/2026 14:02","status":"approved"}', 'Raw events can be duplicated, badly typed, inconsistently formatted.'],
    ['Bronze', 'Raw, append-only, as received + ingestion metadata', 'claim_raw  | _ingested_at        | _source_file\n{"claimId":"C-0097",...} | 2026-11-25 14:05:11 | portal/2026-11-25/batch-031.json\n{"claimId":"C-0097",...} | 2026-11-25 14:05:12 | portal/2026-11-25/batch-031.json', 'Keep everything so you can replay. Never fix data here, so a bug downstream can always be reprocessed from bronze.'],
    ['Silver', 'Cleaned, typed, deduplicated, conformed', 'claim_id | dealer_id | claim_amount | submitted_at        | status\nC-0097   | 1         | 124500.00    | 2026-11-25 14:02:00 | Approved', 'Parse types, trim and standardize, map dealer name → dealer_id, dedupe on claim_id (keep latest), apply data quality checks and quarantine failures.'],
    ['Gold', 'Business-ready data products / marts', 'region | month   | claims | approved_amount | approval_rate\nWest   | 2026-11 | 31     | 2,112,348.44    | 0.74', 'Aggregated, modelled (star schema), documented and owned. What dashboards, analysts and GenAI apps consume. A certified data product.'],
  ];
  let i = 0;
  const view = h('div');
  const draw = () => {
    const [name, sub, sample, why] = steps[i];
    view.replaceChildren(
      h('div', { class: 'med-lane' }, steps.map((s, k) => h('button', { class: 'med-step' + (k === i ? ' on' : '') + (k < i ? ' past' : ''), onclick: () => { i = k; draw(); } }, h('b', null, s[0]), h('small', null, s[1])))),
      h('pre', { class: 'viz-sql' }, sample), h('div', { class: 'vnote' }, why));
    if (i === steps.length - 1) done('Bronze keeps history, silver makes it trustworthy, gold makes it useful.');
  };
  root.append(goalLine(h, p.task || 'Follow one warranty claim from the source system to a gold data product.'), view,
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { i = Math.max(0, i - 1); draw(); } }, '◂ Back'), h('button', { class: 'btn small primary', onclick: () => { i = Math.min(steps.length - 1, i + 1); draw(); } }, 'Next layer ▸')));
  draw();
}

// ------------------------------------------------------------------ MapReduce word count
function mapreduce(root, p, { h, done }) {
  const lines = ['oil leak oil', 'leak noise', 'oil noise noise'];
  const phases = ['Input splits', 'Map → (word, 1)', 'Shuffle & sort by key', 'Reduce → sum'];
  let ph = 0; const view = h('div', { class: 'mr' });
  const mapped = lines.map(l => l.split(' ').map(w => [w, 1]));
  const keys = [...new Set(lines.join(' ').split(' '))].sort();
  const draw = () => {
    const cols = [];
    cols.push(h('div', { class: 'mr-col' }, h('div', { class: 'kf-h' }, 'Splits'), lines.map((l, i) => h('div', { class: 'mr-box' }, h('small', null, `split ${i}`), l))));
    if (ph >= 1) cols.push(h('div', { class: 'mr-col' }, h('div', { class: 'kf-h' }, 'Mappers'), mapped.map((m, i) => h('div', { class: 'mr-box' }, h('small', null, `map ${i}`), m.map(([w]) => h('span', { class: 'mr-kv', style: { '--c': COLORS[keys.indexOf(w)] } }, `(${w},1)`))))));
    if (ph >= 2) cols.push(h('div', { class: 'mr-col' }, h('div', { class: 'kf-h' }, 'Shuffle (group by key)'), keys.map((k, i) => h('div', { class: 'mr-box' }, h('small', null, `reducer ${i % 2}`), h('span', { class: 'mr-kv', style: { '--c': COLORS[i] } }, `${k} → [${mapped.flat().filter(x => x[0] === k).map(() => 1).join(', ')}]`)))));
    if (ph >= 3) cols.push(h('div', { class: 'mr-col' }, h('div', { class: 'kf-h' }, 'Output'), keys.map((k, i) => h('div', { class: 'mr-box' }, h('span', { class: 'mr-kv', style: { '--c': COLORS[i] } }, `${k}: ${mapped.flat().filter(x => x[0] === k).length}`)))));
    view.replaceChildren(...cols);
    if (ph === 3) done('Map runs in parallel where the data lives; shuffle moves all values for a key to one reducer; reduce aggregates. Spark generalizes this with in-memory stages.');
  };
  root.append(goalLine(h, p.task || 'Step through a word count over defect notes.'),
    h('div', { class: 'row' }, h('span', { class: 'eyebrow' }, phases[0]), h('span', { class: 'spacer' }), h('button', { class: 'btn small primary', onclick: () => { ph = Math.min(3, ph + 1); lab.textContent = phases[ph]; draw(); } }, 'Next phase ▸')),
    view);
  const lab = $$first(root, '.eyebrow'); lab.textContent = phases[0];
  draw();
}
function $$first(root, s) { return root.querySelector(s); }

// ------------------------------------------------------------------ Normalization
function normalize(root, p, { h, done }) {
  const steps = [
    ['Unnormalized', 'One wide sheet, repeating groups', ['crf_id', 'customer', 'customer_region', 'parts_used'], [[501, 'Sahyadri Infra', 'West', 'Oil Filter, Turbocharger'], [502, 'Sahyadri Infra', 'West', 'Fuel Pump']], 'A list inside a cell ("Oil Filter, Turbocharger") breaks atomicity. You cannot index, join or count parts reliably.'],
    ['1NF', 'Atomic values, one fact per row', ['crf_id', 'customer', 'customer_region', 'part'], [[501, 'Sahyadri Infra', 'West', 'Oil Filter'], [501, 'Sahyadri Infra', 'West', 'Turbocharger'], [502, 'Sahyadri Infra', 'West', 'Fuel Pump']], 'Now customer data repeats on every row: update anomalies (change region in one row, forget the others).'],
    ['2NF / 3NF', 'Every non-key column depends on the key, the whole key, and nothing but the key', ['table', 'columns'], [['customers', 'customer_id PK, name, region'], ['crf', 'crf_id PK, customer_id FK, created_at'], ['crf_parts', 'crf_id FK, part_id FK (composite PK)'], ['parts', 'part_id PK, part_name']], 'Each fact stored once. Great for OLTP writes (Salesforce objects look like this). Analytics then joins them back, or denormalizes into a star schema.'],
  ];
  let i = 0; const view = h('div');
  const draw = () => {
    const [n, sub, cols, rows, why] = steps[i];
    view.replaceChildren(h('div', { class: 'med-lane' }, steps.map((s, k) => h('button', { class: 'med-step' + (k === i ? ' on' : '') + (k < i ? ' past' : ''), onclick: () => { i = k; draw(); } }, h('b', null, s[0]), h('small', null, s[1])))), table(h, cols, rows), h('div', { class: 'vnote' }, why));
    if (i === steps.length - 1) done();
  };
  root.append(goalLine(h, 'Normalize a messy CRF sheet step by step.'), view, h('button', { class: 'btn small primary', onclick: () => { i = Math.min(steps.length - 1, i + 1); draw(); } }, 'Normalize further ▸'));
  draw();
}

return { join, groupby, windowfn, queryorder, sparkdag, skew, broadcastjoin, kafka, watermark, incremental, scd, star, pruning, medallion, mapreduce, normalize };
})();
