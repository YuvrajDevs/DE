/* DE Arcade - simulations part 3: project walkthrough visuals (Turbofan Telemetry). */
(() => {
'use strict';
const V = window.DEVIZ;
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
const goal = (h, t) => h('div', { class: 'goal' }, h('span', { class: 'goal-k' }, 'GOAL'), h('span', null, t));
const mdi = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

// ------------------------------------------------------------------ STEPPER (generic step-by-step explainer)
V.stepper = function (root, p, { h, md, done }) {
  const steps = p.steps || []; let i = 0;
  const lane = h('div', { class: 'med-lane' }); const body = h('div', { class: 'stepper-body md' });
  const prev = h('button', { class: 'btn small', onclick: () => go(i - 1) }, '◂ Back');
  const next = h('button', { class: 'btn small primary', onclick: () => go(i + 1) }, 'Next ▸');
  const go = k => {
    i = Math.max(0, Math.min(steps.length - 1, k));
    lane.replaceChildren(...steps.map((s, j) => h('button', { class: 'med-step' + (j === i ? ' on' : '') + (j < i ? ' past' : ''), onclick: () => go(j) }, h('b', null, `${j + 1}. ${s.title}`), s.tag ? h('small', null, s.tag) : null)));
    body.innerHTML = md(steps[i].md);
    prev.disabled = i === 0; next.disabled = i === steps.length - 1;
    if (i === steps.length - 1) done(p.doneMsg);
  };
  root.append(p.task ? goal(h, p.task) : null, lane, body, h('div', { class: 'row' }, prev, next));
  go(0);
};

// ------------------------------------------------------------------ FAILURE TIMELINE
V.timeline = function (root, p, { h, md, done }) {
  const items = p.items || []; const opened = new Set(); let filter = 'all';
  const list = h('div', { class: 'tl' });
  const kinds = { env: 'Environment', bug: 'Bug in our code', design: 'Design / data finding', info: 'Not a bug' };
  const draw = () => {
    list.replaceChildren(...items.filter(it => filter === 'all' || it.kind === filter).map(it => {
      const d = h('details', { class: 'tl-item k-' + it.kind });
      d.addEventListener('toggle', () => { if (d.open) { opened.add(it.id); if (opened.size === items.length) done('You have reviewed every failure. These are your best interview stories.'); } });
      d.append(h('summary', null, h('span', { class: 'tl-id' }, it.id), h('span', { class: 'tl-t' }, it.title), h('span', { class: 'tl-k' }, kinds[it.kind] || it.kind)),
        h('div', { class: 'tl-body md', html: md(
          (it.when ? `**When:** ${it.when}\n\n` : '') +
          (it.error ? '**Error / symptom**\n```text\n' + it.error + '\n```\n' : '') +
          `**Cause:** ${it.cause}\n\n**Fix:** ${it.fix}\n\n> **Lesson:** ${it.lesson}`) }));
      return d;
    }));
  };
  root.append(goal(h, p.task || 'Open every failure. For each, be able to say: symptom, cause, fix, lesson.'),
    h('div', { class: 'seg' }, ...[['all', 'All'], ['bug', 'Our bugs'], ['env', 'Environment'], ['design', 'Findings'], ['info', 'Not a bug']].map(([k, t]) => {
      const b = h('button', { class: k === filter ? 'on' : '', onclick: () => { filter = k; [...b.parentNode.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, t); return b; })),
    list);
  draw();
};

// ------------------------------------------------------------------ ENGINE CHART (real C-MAPSS health index + live recalibration)
V.enginechart = function (root, p, { h, done }) {
  const data = p.engines || {}; const names = Object.keys(data);
  let eng = p.start || names[0], alpha = 0.2, warn = 1.5, crit = 2.5, view = 'hi', touched = false;
  const W = 760, H = 300, L = 46, R = 14, T = 14, B = 34;
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ec-svg', role: 'img', 'aria-label': 'Engine health chart' });
  const stats = h('div', { class: 'ec-stats' }); const note = h('div', { class: 'vnote' });
  const fold = (hi) => { let e = null; const ew = []; let wAt = null, cAt = null; hi.forEach((x, k) => { e = e === null ? x : alpha * x + (1 - alpha) * e; ew.push(e); if (wAt === null && e >= warn) wAt = k + 1; if (cAt === null && e >= crit) cAt = k + 1; }); return { ew, wAt, cAt }; };
  const draw = () => {
    svg.replaceChildren();
    const d = data[eng]; const n = d.hi.length;
    const series = view === 'hi' ? d.hi : d[view];
    const { ew, wAt, cAt } = fold(d.hi);
    let lo, hiV;
    if (view === 'hi') { lo = Math.min(-2, ...ew, ...series.map(x => Math.max(x, -8))); hiV = Math.max(4, ...series.map(x => Math.min(x, 9))); }
    else { lo = Math.min(...series); hiV = Math.max(...series); const pad = (hiV - lo) * 0.1 || 1; lo -= pad; hiV += pad; }
    const X = c => L + (c - 1) / Math.max(1, n - 1) * (W - L - R); const Y = v => T + (1 - (Math.max(lo, Math.min(hiV, v)) - lo) / (hiV - lo)) * (H - T - B);
    for (let k = 0; k <= 4; k++) { const v = lo + (hiV - lo) * k / 4; svg.append(S('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'ec-grid' })); const t = S('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'ec-ax' }); t.textContent = v.toFixed(view === 'hi' ? 1 : 1); svg.append(t); }
    [1, Math.round(n / 2), n].forEach(c => { const t = S('text', { x: X(c), y: H - 12, 'text-anchor': 'middle', class: 'ec-ax' }); t.textContent = c; svg.append(t); });
    const xl = S('text', { x: (L + W - R) / 2, y: H - 1, 'text-anchor': 'middle', class: 'ec-ax' }); xl.textContent = 'cycle (flight) → failure at the last cycle'; svg.append(xl);
    const path = arr => arr.map((v, k) => `${k ? 'L' : 'M'}${X(k + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    svg.append(S('path', { d: path(series), class: 'ec-raw' }));
    if (view === 'hi') {
      svg.append(S('line', { x1: L, x2: W - R, y1: Y(warn), y2: Y(warn), class: 'ec-warn' }));
      svg.append(S('line', { x1: L, x2: W - R, y1: Y(crit), y2: Y(crit), class: 'ec-crit' }));
      svg.append(S('path', { d: path(ew), class: 'ec-ewma' }));
      [[wAt, 'ec-mw', 'WARNING'], [cAt, 'ec-mc', 'CRITICAL']].forEach(([c, cls, lab]) => { if (!c) return; svg.append(S('line', { x1: X(c), x2: X(c), y1: T, y2: H - B, class: cls })); const t = S('text', { x: X(c) - 4, y: T + 12, 'text-anchor': 'end', class: 'ec-lab ' + cls }); t.textContent = `${lab} @${c}`; svg.append(t); });
    }
    svg.append(S('line', { x1: X(n), x2: X(n), y1: T, y2: H - B, class: 'ec-fail' }));
    // stats across all FD001 engines
    const rows = names.map(nm => { const r = fold(data[nm].hi); const len = data[nm].hi.length; return [nm, len, r.wAt ? len - r.wAt : null, r.cAt ? len - r.cAt : null]; });
    stats.replaceChildren(h('table', { class: 'vt' }, h('thead', null, h('tr', null, ['engine', 'life (cycles)', 'WARNING lead', 'CRITICAL lead'].map(c => h('th', null, c)))),
      h('tbody', null, rows.map(r => h('tr', { class: r[0] === eng ? 'cur' : '' }, r.map((v, k) => h('td', { class: v === null ? 'null' : '' }, v === null ? 'missed' : (k >= 2 ? v + ' cycles before failure' : v))))))));
    const fd1 = rows.filter(r => r[0].startsWith('FD001'));
    const okAll = fd1.every(r => r[2] !== null && r[3] !== null && r[2] >= 20 && r[3] >= 8);
    note.innerHTML = view !== 'hi' ? `Raw sensor <b>${view}</b> over the engine's life. Notice the noise: that's why the project combines 10 sensors into one index and smooths it.`
      : (eng.startsWith('FD003') ? '<b>FD003-007 is a fan-fault engine.</b> Its sensors s7/s12/s20/s21 move <b>up</b> instead of down, so the index (built for compressor wear) goes <b>negative</b> and never alerts. This is build-log F14 and your Milestone T1.'
        : `Faint line = raw health index each cycle; bold line = EWMA (α=${alpha}). Dashed lines = thresholds. Red line = failure. ${okAll ? '<b>All 5 FD001 engines warn ≥ 20 and go critical ≥ 8 cycles before failure.</b>' : 'Some engine warns too late (or never).'} Lower α = smoother but slower; lower thresholds = earlier but more false alarms.`);
    if (touched && okAll && view === 'hi') done('This is the same method the project used to choose α=0.2, WARNING 1.5, CRITICAL 2.5, measured on all 100 FD001 engines instead of 5.');
  };
  const sl = (label, min, max, step, val, set) => { const id = 'ec' + Math.random().toString(36).slice(2, 7); const out = h('b', { class: 'tabnum' }, String(val)); const inp = h('input', { type: 'range', id, min, max, step, value: val }); inp.addEventListener('input', () => { set(+inp.value); out.textContent = inp.value; touched = true; draw(); }); return h('label', { class: 'slider', for: id }, h('span', null, label), inp, out); };
  const engSeg = h('div', { class: 'seg' }, ...names.map(nm => { const b = h('button', { class: nm === eng ? 'on' : '', onclick: () => { eng = nm; [...engSeg.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, nm); return b; }));
  const viewSeg = h('div', { class: 'seg' }, ...[['hi', 'Health index'], ['s11', 's11 pressure'], ['s4', 's4 temperature'], ['s7', 's7 pressure']].map(([k, t]) => { const b = h('button', { class: k === view ? 'on' : '', onclick: () => { view = k; [...viewSeg.children].forEach(x => x.classList.toggle('on', x === b)); draw(); } }, t); return b; }));
  root.append(goal(h, p.task || 'Move the sliders. Find settings where all five FD001 engines warn at least 20 cycles and go critical at least 8 cycles before failure.'),
    engSeg, viewSeg, h('div', { class: 'ec-wrap' }, svg),
    h('div', { class: 'legend' }, h('span', { class: 'lg ec1' }, 'raw index / sensor'), h('span', { class: 'lg ec2' }, 'EWMA'), h('span', { class: 'lg ec3' }, 'warning'), h('span', { class: 'lg ec4' }, 'critical / failure')),
    sl('EWMA α', 0.05, 0.6, 0.05, alpha, v => alpha = v), sl('WARNING at', 0.5, 3, 0.1, warn, v => warn = v), sl('CRITICAL at', 1, 4.5, 0.1, crit, v => crit = v),
    note, stats);
  draw();
};

// ------------------------------------------------------------------ PROJECT MAP (what happens to each kind of event)
V.ttarch = function (root, p, { h, done }) {
  const W = 970, H = 330;
  const N = {
    prod: [70, 150, 'Producer', 'replays NASA engines'], kafka: [235, 150, 'Kafka', '6 partitions'],
    bronze: [400, 150, 'Bronze', 'raw + offsets'], silver: [570, 90, 'Silver', 'valid · deduped'], dlq: [570, 230, 'Dead letter', 'bad + reason'],
    state: [740, 50, 'Engine state', 'EWMA · level'], alerts: [740, 140, 'Alerts', 'once per level'], fleet: [740, 230, 'Fleet minute', 'event-time windows'],
    dash: [890, 140, 'Dashboard', 'Streamlit'],
  };
  const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pm-svg', role: 'img', 'aria-label': 'Turbofan project architecture' });
  const E = [['prod', 'kafka'], ['kafka', 'bronze'], ['bronze', 'silver'], ['bronze', 'dlq'], ['silver', 'state'], ['silver', 'alerts'], ['silver', 'fleet'], ['state', 'dash'], ['alerts', 'dash'], ['fleet', 'dash'], ['dlq', 'dash']];
  const edge = {};
  E.forEach(([a, b]) => { const A = N[a], B2 = N[b]; const mx = (A[0] + B2[0]) / 2; const pth = S('path', { d: `M${A[0]} ${A[1]} C ${mx} ${A[1]}, ${mx} ${B2[1]}, ${B2[0]} ${B2[1]}`, class: 'pm-edge' }); svg.append(pth); edge[a + '>' + b] = pth; });
  const nodeEl = {}; const counts = { sent: 0, bronze: 0, silver: 0, dlq: 0, dups: 0, alerts: 0 };
  Object.entries(N).forEach(([id, [x, y, t, s]]) => {
    const g = S('g', { class: 'pm-node' }); g.append(S('rect', { x: x - 68, y: y - 22, width: 136, height: 44, rx: 9 }));
    const a = S('text', { x, y: y - 3, 'text-anchor': 'middle', class: 'pm-t' }); a.textContent = t; const b = S('text', { x, y: y + 12, 'text-anchor': 'middle', class: 'pm-s' }); b.textContent = s;
    const c = S('text', { x: x + 62, y: y - 26, 'text-anchor': 'end', class: 'pm-count' }); g.append(a, b, c); svg.append(g); nodeEl[id] = { g, c };
  });
  const dots = S('g'); svg.append(dots);
  const panel = h('div', { class: 'pm-panel' }); const tried = new Set();
  const setCounts = () => { nodeEl.prod.c.textContent = counts.sent ? `sent ${counts.sent}` : ''; nodeEl.bronze.c.textContent = counts.bronze ? `${counts.bronze} rows` : ''; nodeEl.silver.c.textContent = counts.silver ? `${counts.silver} rows` : ''; nodeEl.dlq.c.textContent = counts.dlq ? `${counts.dlq} rows` : ''; nodeEl.alerts.c.textContent = counts.alerts ? `${counts.alerts}` : ''; };
  const fly = (route, cls) => new Promise(res => {
    const segs = route.slice(1).map((b, k) => edge[route[k] + '>' + b]);
    const dot = S('circle', { r: 7, class: 'tt-dot ' + cls }); dots.append(dot);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let k = 0; const step = () => {
      if (k >= segs.length) { setTimeout(() => { dot.remove(); res(); }, 250); return; }
      const pth = segs[k]; const len = pth.getTotalLength(); const t0 = performance.now(); const dur = reduce ? 1 : 650;
      const frame = now => { const t = Math.min(1, (now - t0) / dur); const pt = pth.getPointAtLength(t * len); dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); if (t < 1) requestAnimationFrame(frame); else { k++; step(); } };
      requestAnimationFrame(frame);
    }; step();
  });
  const say = (title, lines) => { panel.innerHTML = `<h3>${mdi(title)}</h3><ol class="tt-ol">${lines.map(l => `<li>${mdi(l)}</li>`).join('')}</ol>`; };
  const run = async (kind) => {
    tried.add(kind);
    if (tried.size >= 5) setTimeout(() => done('You can now explain every path through the pipeline, including the crash.'), 2500);
    Object.values(nodeEl).forEach(n => n.g.classList.remove('crash'));
    if (kind === 'normal') {
      counts.sent++; say('A normal reading (engine FD001-007, cycle 113)', ['Producer builds JSON with a **deterministic** `event_id = uuid5("FD001-007:113")`, key `FD001-007` → always the same Kafka partition.', 'Kafka appends it to partition 3 at offset 18,402. It is **kept for 7 days** whether read or not.', 'Bronze micro-batch (every 5 s) writes it **as received** plus `partition`, `offset`, `kafka_ts`, `ingest_ts`. The checkpoint records "partition 3 read up to 18,402".', 'Silver parses it, checks fields and ranges (all fine), computes the **health index** and keeps it (first time this event_id is seen).', 'Gold folds it into the engine\'s state: EWMA updated, level unchanged → state row MERGEd; fleet-minute window gets +1 event.', 'Dashboard reads the Delta tables every 10 s.']);
      await fly(['prod', 'kafka', 'bronze'], 'ok'); counts.bronze++; setCounts(); await fly(['bronze', 'silver'], 'ok'); counts.silver++; setCounts(); await Promise.all([fly(['silver', 'state', 'dash'], 'ok'), fly(['silver', 'fleet'], 'ok')]);
    } else if (kind === 'dup') {
      counts.sent += 2; say('A duplicate delivery (the same event sent twice)', ['A retry or replay sends the **same bytes** again: same `event_id`.', 'Kafka stores **both** copies (it doesn\'t deduplicate content).', 'Bronze stores **both** rows: bronze is a faithful record of what arrived.', 'Silver: `dropDuplicatesWithinWatermark(["event_id"])` remembers ids seen in the last 10 minutes (RocksDB state) → **second copy dropped**.', 'Result: 2 bronze rows, **1 silver row**. `verify` proves this at scale: 2,227 duplicates sent, 0 in silver.']);
      await Promise.all([fly(['prod', 'kafka', 'bronze'], 'ok'), new Promise(r => setTimeout(r, 300)).then(() => fly(['prod', 'kafka', 'bronze'], 'dup'))]); counts.bronze += 2; setCounts();
      await Promise.all([fly(['bronze', 'silver'], 'ok'), fly(['bronze', 'silver'], 'dup')]); counts.silver++; counts.dups++; setCounts();
    } else if (kind === 'late') {
      counts.sent++; say('A late event (stamped 08:50, arrives 30 s later)', ['The engine lost connectivity; the event keeps its **event_time** 08:50:00 but reaches Kafka 30 s late.', 'Bronze stores it normally (bronze doesn\'t care about time).', 'Silver: the watermark is "max event_time seen − 10 min". 30 s late is well inside it, so it is **accepted** and still deduplicated correctly.', 'Fleet-minute: it lands in the **08:50 window** (event time), not the window of its arrival. That window only closes once the watermark passes 08:52 (2-min watermark on that query).', 'If it had been **> 10 min late**, silver would drop it (state already forgotten). That is the trade-off you choose with the watermark.']);
      await fly(['prod', 'kafka', 'bronze'], 'late'); counts.bronze++; setCounts(); await fly(['bronze', 'silver'], 'late'); counts.silver++; setCounts(); await fly(['silver', 'fleet'], 'late');
    } else if (kind === 'bad') {
      counts.sent++; say('A malformed message (truncated JSON)', ['The producer\'s chaos mode sends `{"schema_version":1,"event_id":"6c1…` (cut off).', 'Kafka and bronze store it anyway, as raw text: **bronze never rejects**.', 'Silver\'s `from_json` returns nulls → classified `MALFORMED_JSON`.', 'The **dead-letter query** writes it with the raw payload, reason, partition and offset. The silver query skips it.', 'Nothing crashes. 1 poison message can\'t stop millions of good ones, and someone can inspect and replay it later.']);
      await fly(['prod', 'kafka', 'bronze'], 'bad'); counts.bronze++; setCounts(); await fly(['bronze', 'dlq', 'dash'], 'bad'); counts.dlq++; setCounts();
    } else if (kind === 'crash') {
      say('kill -9 the Spark app in the middle of a batch', ['Spark was writing micro-batch 42 of bronze: it read offsets 18,402-19,100 but **had not committed** yet.', 'Process killed: no graceful shutdown. Delta never saw a commit for batch 42, so **no partial files are visible** (atomic commits).', 'Restart: each query reads its **checkpoint**: "offsets log says batch 42 = 18,402-19,100; commit log has no entry for 42" → it **re-runs batch 42** with exactly the same offsets.', 'Silver/gold do the same from their own checkpoints. Re-processed rows are idempotent: Delta streaming sink skips already-committed batch ids, silver dedupes, gold ignores cycles ≤ last_cycle and alert ids already present.', 'Measured in the project: after `kill -9`, **54,787 expected = 54,787 in silver, 0 missing, 0 duplicates**.']);
      ['bronze', 'silver', 'dlq', 'state', 'alerts', 'fleet'].forEach(k => nodeEl[k].g.classList.add('crash'));
      await new Promise(r => setTimeout(r, 1400));
      Object.values(nodeEl).forEach(n => n.g.classList.remove('crash'));
      await fly(['kafka', 'bronze', 'silver', 'state'], 'ok');
    }
  };
  root.append(goal(h, p.task || 'Send each kind of event and trigger a crash. Read what happens at every step.'),
    h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: () => run('normal') }, '▶ Normal reading'), h('button', { class: 'btn small', onclick: () => run('dup') }, '⧉ Duplicate'),
      h('button', { class: 'btn small', onclick: () => run('late') }, '⏱ Late event'), h('button', { class: 'btn small', onclick: () => run('bad') }, '✗ Malformed'), h('button', { class: 'btn small bad', onclick: () => run('crash') }, '⚡ kill -9 + restart')),
    h('div', { class: 'pm-wrap' }, svg),
    h('div', { class: 'legend' }, h('span', { class: 'lg tt-ok' }, 'normal'), h('span', { class: 'lg tt-dup' }, 'duplicate'), h('span', { class: 'lg tt-late' }, 'late'), h('span', { class: 'lg tt-bad' }, 'malformed')),
    panel);
  say('Pick an event above', ['Each button sends one message through the real design of the project and explains every step.']);
};
})();
