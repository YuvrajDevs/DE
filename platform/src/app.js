/* DE Arcade - app shell. Plain JS, no framework. */
(() => {
'use strict';

// ------------------------------------------------------------------ utils
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// Never render "null": drop empty children everywhere.
for (const P of [Element.prototype, DocumentFragment.prototype]) for (const m of ['append', 'replaceChildren']) {
  const orig = P[m]; P[m] = function (...k) { return orig.apply(this, k.filter(x => x != null && x !== false)); };
}
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNum = s => Math.floor(new Date(s + 'T00:00:00').getTime() / 86400000);
const norm = s => String(s).trim().toLowerCase().replace(/[`'"]/g, '').replace(/\s+/g, ' ').replace(/[.;]+$/, '');

// ------------------------------------------------------------------ highlighting (small, SQL + Python)
const KW = {
  sql: /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|HAVING|JOIN|LEFT|RIGHT|FULL|OUTER|INNER|CROSS|ON|AS|WITH|RECURSIVE|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|EXISTS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|INDEX|DROP|ALTER|PRIMARY|KEY|OVER|PARTITION|ROWS|RANGE|PRECEDING|FOLLOWING|CURRENT|ROW|UNBOUNDED|LIMIT|OFFSET|DESC|ASC|COALESCE|CAST|MERGE|USING|MATCHED|CONFLICT|DO|NOTHING|EXCEPT|INTERSECT|QUALIFY|FILTER|TRUE|FALSE)\b/gi,
  python: /\b(def|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|class|try|except|finally|raise|with|yield|lambda|pass|break|continue|global|assert|async|await|del)\b/g,
};
function highlight(code, lang) {
  lang = (lang || '').toLowerCase();
  if (lang === 'pyspark' || lang === 'py') lang = 'python';
  if (!KW[lang]) return esc(code);
  const com = lang === 'sql' ? /--[^\n]*/ : /#[^\n]*/;
  const re = new RegExp(`(${com.source})|('(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*")|(\\b\\d+(?:\\.\\d+)?\\b)`, 'g');
  let out = '', last = 0, m;
  const kwify = s => esc(s).replace(KW[lang], '<span class="hl-kw">$1</span>').replace(/\b([A-Za-z_]\w*)(?=\()/g, '<span class="hl-fn">$1</span>');
  while ((m = re.exec(code))) {
    out += kwify(code.slice(last, m.index));
    if (m[1]) out += `<span class="hl-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="hl-str">${esc(m[2])}</span>`;
    else out += `<span class="hl-num">${esc(m[3])}</span>`;
    last = re.lastIndex;
  }
  return out + kwify(code.slice(last));
}

// ------------------------------------------------------------------ markdown
function md(src) {
  if (!src) return '';
  // custom ```flow blocks: "A -> B -> C"
  src = src.replace(/```flow\n([\s\S]*?)```/g, (_, body) => {
    const parts = body.trim().split(/\s*->\s*/);
    return '<div class="flow">' + parts.map(p => `<span>${esc(p)}</span>`).join('<i>→</i>') + '</div>';
  });
  let html;
  if (window.marked) {
    const r = new window.marked.Renderer();
    r.code = (code, lang) => {
      if (typeof code === 'object') { lang = code.lang; code = code.text; }
      return `<pre><code>${highlight(code, lang)}</code></pre>`;
    };
    r.table = function (header, body) {
      if (typeof header === 'object' && header.header) {
        const head = '<tr>' + header.header.map(c => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('') + '</tr>';
        const rows = header.rows.map(row => '<tr>' + row.map(c => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('') + '</tr>').join('');
        return `<div class="tbl-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
      }
      return `<div class="tbl-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
    };
    html = window.marked.parse(src, { renderer: r, gfm: true, breaks: false });
  } else {
    html = src.split(/\n{2,}/).map(p => p.startsWith('```') ? `<pre><code>${esc(p.replace(/```\w*\n?/g, ''))}</code></pre>` : `<p>${esc(p).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')}</p>`).join('');
  }
  return html;
}
const mdInline = s => md(s).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');

// ------------------------------------------------------------------ content
let C = null;          // content
const IDX = {};        // lessonId -> {world, lesson, wi, li}
const ITEMS = {};      // itemId -> {card, lessonId}
const GRADABLE = new Set(['mcq', 'multi', 'tf', 'fill', 'order', 'match', 'sql', 'py', 'spark', 'scenario', 'talk', 'bug']);

function indexContent() {
  C.worlds.forEach((w, wi) => w.lessons.forEach((l, li) => {
    IDX[l.id] = { world: w, lesson: l, wi, li };
    l.cards.forEach((c, ci) => {
      c._id = c.id ? `${l.id}:${c.id}` : `${l.id}:${ci}`;
      c._lesson = l.id;
      c._topic = c.topic || w.id;
      if (GRADABLE.has(c.t)) ITEMS[c._id] = c;
    });
  }));
  ((C.sql50 && C.sql50.concepts) || []).forEach(k => k.questions.forEach((c, qi) => {
    c._id = `sql50:${k.id}:${qi}`;
    c._lesson = 'sql50';
    c._topic = 'sql';
    c._concept = k;
    ITEMS[c._id] = c;
  }));
  (C.practice || []).forEach(set => set.cards.forEach((c, ci) => {
    c._id = `${set.id}:${ci}`;
    c._lesson = set.id;
    c._topic = c.topic || set.topic || 'practice';
    c._bank = true;
    if (GRADABLE.has(c.t)) ITEMS[c._id] = c;
  }));
}

// ------------------------------------------------------------------ state + persistence
const RANKS = [
  [0, 'Data Intern'], [400, 'Pipeline Apprentice'], [1200, 'Junior Data Engineer'], [2600, 'Data Engineer I'],
  [4500, 'DE I · Interview Ready'], [7000, 'Data Engineer II Track'], [10000, 'Senior Track'], [14000, 'Platform Architect'],
];
const LS_KEY = 'de-arcade-v1';
let S = null;
function blankState() {
  return { v: 1, xp: 0, startDate: todayStr(), streak: { count: 0, last: null }, days: {}, lessons: {}, items: {}, speedBest: 0, mocks: [], updatedAt: 0 };
}
function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* storage unavailable */ }
  return null;
}
const Sync = {
  db: null, uid: null, ref: null, writing: false, dirty: false, timer: null, status: 'local',
  async init() {
    if (!window.claude || !window.claude.use) return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return;
      const uid = await user.id();
      if (!uid) return;
      this.db = db; this.uid = uid;
      this.ref = db.doc(`data/users/${uid}/progress`);
      const snap = await Promise.race([this.ref.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))]);
      if (snap.exists) {
        const remote = JSON.parse(snap.data().json || 'null');
        if (remote && (remote.updatedAt || 0) > (S.updatedAt || 0)) { S = remote; saveLocal(); render(); toast('Progress synced from your account'); }
        else if ((S.updatedAt || 0) > (remote?.updatedAt || 0)) this.schedule(10);
      } else if (S.xp > 0) this.schedule(10);
      this.status = 'synced';
      updateHud();
    } catch (e) { this.status = 'local'; }
  },
  schedule(ms = 2500) {
    if (!this.ref) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
  },
  async flush() {
    if (!this.ref || this.writing || !this.dirty) return;
    this.writing = true; this.dirty = false;
    try { await this.ref.set({ json: JSON.stringify(S), updatedAt: S.updatedAt }); this.status = 'synced'; }
    catch (e) { this.status = e && e.code === 'quota_exceeded' ? 'full' : 'local'; }
    this.writing = false;
    if (this.dirty) this.schedule(1500);
    updateHud();
  },
};
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function save() { S.updatedAt = Date.now(); saveLocal(); Sync.schedule(); }

function rankOf(xp) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const [lo, name] = RANKS[i], hi = RANKS[i + 1] ? RANKS[i + 1][0] : lo + 5000;
  return { i, name, lo, hi, next: RANKS[i + 1] ? RANKS[i + 1][1] : null, pct: Math.min(100, ((xp - lo) / (hi - lo)) * 100) };
}
function touchStreak() {
  const t = todayStr();
  if (S.streak.last === t) return;
  const gap = S.streak.last ? dayNum(t) - dayNum(S.streak.last) : 99;
  S.streak.count = gap === 1 ? S.streak.count + 1 : 1;
  S.streak.last = t;
}
function addXp(n, el) {
  if (!n) return;
  S.xp += n;
  const t = todayStr();
  S.days[t] = (S.days[t] || 0) + n;
  touchStreak();
  save();
  updateHud();
  if (el) {
    const r = el.getBoundingClientRect();
    const pop = h('div', { class: 'xp-pop', style: { left: (r.left + r.width / 2 - 20) + 'px', top: (r.top - 10) + 'px' } }, `+${n} XP`);
    document.body.append(pop); setTimeout(() => pop.remove(), 1000);
  }
}
const BOX_DAYS = [0, 1, 3, 7, 14, 30];
function recordItem(id, correct) {
  const it = S.items[id] || { b: 0, due: 0, c: 0, w: 0 };
  if (correct) { it.c++; it.b = Math.min(5, it.b + 1); } else { it.w++; it.b = 0; }
  it.due = dayNum(todayStr()) + BOX_DAYS[it.b];
  it.seen = 1;
  S.items[id] = it;
}
function dueItems() {
  const t = dayNum(todayStr());
  return Object.entries(S.items).filter(([id, it]) => ITEMS[id] && it.due <= t && (it.w > 0 || it.b < 5)).sort((a, b) => a[1].b - b[1].b || a[1].due - b[1].due).map(([id]) => ITEMS[id]);
}
function lessonStars(id) { return (S.lessons[id] && S.lessons[id].stars) || 0; }

// ------------------------------------------------------------------ engine client
const Engine = {
  w: null, seq: 0, pending: new Map(), sql: 'idle', py: 'idle', failed: false,
  start() {
    try {
      this.w = new Worker('engine-worker.js');
      this.w.onmessage = ev => { const p = this.pending.get(ev.data.id); if (p) { this.pending.delete(ev.data.id); clearTimeout(p.t); p.res(ev.data.result); } };
      this.w.onerror = () => { this.fail('The code engine could not start in this browser.'); };
    } catch (e) { this.fail('Web Workers are blocked here.'); }
  },
  fail(msg) { this.failed = true; this.sql = this.py = 'error'; this.failMsg = msg; for (const p of this.pending.values()) p.res({ ok: false, error: msg, engineError: true }); this.pending.clear(); updateHud(); },
  restart() { try { this.w && this.w.terminate(); } catch (e) { /* ignore */ } this.w = null; this.py = 'idle'; this.sql = 'idle'; this.start(); this.warmSql(); },
  call(msg, timeout) {
    if (!this.w) this.start();
    if (this.failed && !this.w) return Promise.resolve({ ok: false, error: this.failMsg, engineError: true });
    const id = ++this.seq;
    return new Promise(res => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        res({ ok: false, error: `Stopped after ${Math.round(timeout / 1000)}s. Check for an infinite loop or a huge cross join. The engine was restarted.` });
        this.restart();
      }, timeout);
      this.pending.set(id, { res, t });
      this.w.postMessage({ id, ...msg });
    });
  },
  warmSql() {
    if (this.sql === 'ready') return Promise.resolve(true);
    if (this._sqlP && this.sql === 'loading') return this._sqlP;
    this.sql = 'loading'; updateHud();
    this._sqlP = this.call({ op: 'init-sql' }, 60000).then(r => { this.sql = r.ok ? 'ready' : 'error'; if (!r.ok) this.failMsg = r.error; updateHud(); return r.ok; });
    return this._sqlP;
  },
  async warmPy() {
    if (this.py === 'ready') return true;
    if (this.py === 'loading') return this._pyP;
    this.py = 'loading'; updateHud();
    this._pyP = this.call({ op: 'init-py' }, 180000).then(r => { this.py = r.ok ? 'ready' : 'error'; if (!r.ok) this.failMsg = r.error; updateHud(); return r.ok; });
    return this._pyP;
  },
  async run(kind, payload) {
    if (kind === 'sql') { await this.warmSql(); return this.call({ op: 'sql', ...payload }, 12000); }
    const ok = await this.warmPy();
    if (!ok) return { ok: false, error: this.failMsg || 'Python engine failed to load', engineError: true };
    return this.call({ op: kind, ...payload }, 20000);
  },
  _schema: null,
  async schema() { if (this._schema) return this._schema; await this.warmSql(); const r = await this.call({ op: 'schema' }, 15000); if (r.ok) this._schema = r.tables; return this._schema || []; },
};

function cellNorm(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.length < 16) return Math.round(parseFloat(v) * 100) / 100;
  return v;
}
function compareResults(user, exp, ordered) {
  if (!exp) return { pass: false, msg: 'No expected result to compare against.' };
  if (!user || !user.cols) return { pass: false, msg: 'Your code did not produce a result set.' };
  if (user.cols.length !== exp.cols.length) return { pass: false, msg: `Expected ${exp.cols.length} column(s) (${exp.cols.join(', ')}), you returned ${user.cols.length} (${user.cols.join(', ')}).` };
  const U = user.rows.map(r => r.map(cellNorm)), E = exp.rows.map(r => r.map(cellNorm));
  if (U.length !== E.length) return { pass: false, msg: `Expected ${E.length} row(s), you returned ${U.length}.` };
  const key = r => JSON.stringify(r);
  if (ordered) {
    for (let i = 0; i < E.length; i++) if (key(U[i]) !== key(E[i])) return { pass: false, msg: `Row ${i + 1} differs (order matters here). Expected ${key(E[i])}, got ${key(U[i])}.` };
    return { pass: true };
  }
  const count = new Map(); E.forEach(r => count.set(key(r), (count.get(key(r)) || 0) + 1));
  for (const r of U) { const k = key(r); if (!count.get(k)) return { pass: false, msg: `This row is not in the expected output: ${k}` }; count.set(k, count.get(k) - 1); }
  return { pass: true };
}
function resultTable(res, limit = 200) {
  if (!res || !res.cols || !res.cols.length) return h('div', { class: 'muted' }, res && res.note ? res.note : 'No rows.');
  const rows = res.rows.slice(0, limit);
  return h('div', null,
    h('div', { class: 'res-wrap' }, h('table', { class: 'res' },
      h('thead', null, h('tr', null, res.cols.map(c => h('th', null, c)))),
      h('tbody', null, rows.map(r => h('tr', null, r.map(v => v === null ? h('td', { class: 'null' }, 'NULL') : h('td', null, String(v)))))))),
    h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, `${res.total ?? res.rows.length} row(s)${res.rows.length > limit ? `, showing ${limit}` : ''}`));
}

// ------------------------------------------------------------------ toast / hud
let toastT;
function toast(msg) { $('.toast')?.remove(); const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600); }
function updateHud() {
  const hud = $('#hud'); if (!hud || !S) return;
  const r = rankOf(S.xp);
  const es = Engine.failed ? 'error' : (Engine.py === 'loading' || Engine.sql === 'loading') ? 'loading' : (Engine.sql === 'ready' ? 'ready' : 'idle');
    const streak = S.streak.last && dayNum(todayStr()) - dayNum(S.streak.last) <= 1 ? S.streak.count : 0;
  hud.replaceChildren(
    es === 'loading' ? h('span', { class: 'chip engine', 'data-s': es }, h('i', { class: 'dot' }), 'Getting code ready…') : null,
    es === 'error' ? h('span', { class: 'chip engine', 'data-s': es, title: Engine.failMsg || '' }, h('i', { class: 'dot' }), 'Code runner off') : null,
    h('span', { class: 'chip streak', title: 'Days in a row you have practised' }, `${streak}-day streak`),
    h('span', { class: 'chip xp tabnum', title: r.name }, `${S.xp.toLocaleString()} XP`),
  );
}

// ------------------------------------------------------------------ router
const routes = {};
let current = null;
function go(hash) { location.hash = hash; }
function render() {
  const raw = (location.hash || '#home').slice(1);
  const [name, ...rest] = raw.split('-');
  const arg = rest.join('-');
  const view = routes[name] ? name : 'home';
  if (current && current.cleanup) current.cleanup();
  current = null;
  const section = { map: 'modules', module: 'modules', mpractice: 'modules', lesson: 'modules', world: 'modules', review: 'practice', sql50: 'practice', speed: 'practice', interview: 'practice', arena: 'practice', projects: 'more', posting: 'more', glossary: 'more', settings: 'more' }[view] || view;
  $$('.nav a, .tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.r === section ? 'page' : 'false'));
  const main = $('main');
  main.replaceChildren();
  current = routes[view](main, arg) || null;
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ views: home
function nextLesson() {
  for (const w of C.worlds) for (const l of w.lessons) if (!S.lessons[l.id]) return l;
  return null;
}
function planDay() { return Math.max(1, dayNum(todayStr()) - dayNum(S.startDate) + 1); }
function missionFor(day) { return C.plan.find(d => d.day === day) || null; }
function missionDone(item) {
  if (item.lesson) return !!S.lessons[item.lesson];
  return false;
}
routes.home = (main) => {
  const r = rankOf(S.xp);
  const nl = nextLesson();
  const day = Math.min(planDay(), C.plan.length);
  const m = missionFor(day);
  const due = dueItems().length;
  const totalLessons = C.worlds.reduce((a, w) => a + w.lessons.length, 0);
  const doneLessons = Object.keys(S.lessons).filter(k => IDX[k]).length;
  main.append(
    h('section', { class: 'hero' },
      h('div', null,
        h('div', { class: 'eyebrow' }, `Your level: ${r.i + 1} of ${RANKS.length}`),
        h('h1', null, r.name),
        h('div', { class: 'rankline' },
          h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': Math.round(r.pct), 'aria-label': 'Progress to next level' }, h('i', { style: { width: r.pct + '%' } })),
          h('span', { class: 'muted tabnum', style: { fontSize: '13px' } }, `${doneLessons} of ${totalLessons} lessons done`))),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        nl ? h('a', { class: 'btn primary big', href: `#lesson-${nl.id}` }, 'Continue: ', nl.title) : h('a', { class: 'btn primary big', href: '#interview' }, 'Do a mock interview'))),
    h('section', { class: 'panel', style: { marginTop: '16px' } },
      h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, `Today (day ${day} of ${C.plan.length})`), h('span', { class: 'spacer' }), h('a', { href: '#plan', class: 'btn small ghost' }, 'See all days')),
      m ? h('p', { class: 'muted', style: { margin: '6px 0 12px' } }, m.focus) : null,
      m ? h('div', { class: 'mission' }, m.items.map(it => {
        const done = missionDone(it);
        const L = it.lesson && IDX[it.lesson];
        return h('a', { class: 'mission-item' + (done ? ' done' : ''), href: it.lesson ? `#lesson-${it.lesson}` : it.href },
          h('span', { class: 'tick' }, done ? '✓' : ''),
          h('span', null, h('span', { class: 't' }, L ? L.lesson.title : it.title), h('small', null, L ? `about ${L.lesson.mins || 15} min` : it.note || '')));
      })) : h('p', null, 'You finished the plan. Keep going with review and mock interviews.')),
    h('div', { class: 'big-actions' },
      h('a', { href: '#review' }, h('b', null, 'Review'), h('span', null, due ? `${due} question(s) you missed are due` : 'Nothing to review today')),
      h('a', { href: '#practice' }, h('b', null, 'Practice'), h('span', null, 'SQL, Python, PySpark, problems, quizzes')),
      h('a', { href: '#interview' }, h('b', null, 'Mock interview'), h('span', null, 'A timed practice interview'))),
  );
};

// ------------------------------------------------------------------ views: map
routes.map = (main) => {
  LAST_MODULE = null;
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'From zero to job-ready, in order'), h('h2', null, 'Learn')),
    h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Go top to bottom. The highlighted lesson is your next one.')));
  const nl = nextLesson();
  main.append(h('div', { class: 'worlds' }, C.worlds.map((w, wi) => {
    const done = w.lessons.filter(l => S.lessons[l.id]).length;
    return h('section', { class: 'world', id: `w-${w.id}` },
      h('div', { class: 'world-no' }, h('span', null, 'STAGE'), h('b', null, String(wi).padStart(2, '0'))),
      h('div', { style: { minWidth: 0 } },
        h('h3', null, w.title, w.tag ? h('span', { class: 'tagline' }, w.tag) : null),
        h('p', { class: 'blurb' }, w.blurb),
        h('div', { class: 'wprog' }, h('div', { class: 'meter accent' }, h('i', { style: { width: (100 * done / w.lessons.length) + '%' } })), `${done}/${w.lessons.length} cleared`),
        h('div', { class: 'lessons' }, w.lessons.map((l, li) => {
          const st = lessonStars(l.id);
          return h('a', { class: 'lesson-pill' + (st ? ' done' : '') + (nl && nl.id === l.id ? ' next' : ''), href: `#lesson-${l.id}` },
            h('span', { class: 'ln' }, `${wi}.${li + 1}`), l.title, st ? h('span', { class: 'stars' }, '★'.repeat(st) + '☆'.repeat(3 - st)) : null);
        }))));
  })));
};

// ------------------------------------------------------------------ player
function Player(main, cards, opts) {
  // opts: {title, lessonId, mode: 'lesson'|'review'|'interview'|'speed', onDone(summary)}
  const queue = cards.map(c => ({ c, retry: false }));
  const firstTry = new Map();
  let pos = 0, combo = 0, xpEarned = 0, answered = 0, correctFirst = 0;
  const startedAt = Date.now();
  let timerEl = null, timerInt = null;
  const head = h('div', { class: 'player-head' },
    h('a', { class: 'btn small ghost', href: opts.exitHref || '#map', 'aria-label': 'Leave' }, '✕'),
    h('div', { class: 'meter accent', style: { flex: 1 } }, h('i', { style: { width: '0%' } })),
    opts.timeLimit ? (timerEl = h('span', { class: 'timer tabnum' }, '')) : null,
    h('span', { class: 'combo', 'aria-live': 'polite' }, ''));
  const stage = h('div');
  const root = h('div', { class: 'player' }, h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, opts.title), head, stage);
  main.append(root);
  if (opts.timeLimit) {
    const end = startedAt + opts.timeLimit * 1000;
    const tick = () => { const left = Math.max(0, end - Date.now()); timerEl.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if (!left) { clearInterval(timerInt); finish(true); } };
    tick(); timerInt = setInterval(tick, 500);
  }
  function setProgress() {
    $('.meter i', head).style.width = (100 * pos / queue.length) + '%';
    $('.combo', head).textContent = combo >= 3 ? `COMBO ×${combo}` : '';
  }
  function graded(card, correct, el, base) {
    const isFirst = !firstTry.has(card._id);
    if (isFirst) {
      firstTry.set(card._id, correct);
      answered++;
      if (correct) correctFirst++;
      if (opts.mode !== 'speed') recordItem(card._id, correct);
    }
    if (correct) {
      combo++;
      const mult = combo >= 5 ? 2 : combo >= 3 ? 1.5 : 1;
      const gain = Math.round((isFirst ? base : Math.ceil(base / 3)) * mult);
      xpEarned += gain; addXp(gain, el);
    } else {
      combo = 0;
      if (opts.mode === 'lesson' || opts.mode === 'review') {
        if (!['sql', 'py', 'spark', 'talk', 'scenario'].includes(card.t) && !queue.slice(pos + 1).some(q => q.c === card)) queue.push({ c: card, retry: true });
      }
    }
    save();
    setProgress();
  }
  function next() { pos++; setProgress(); show(); }
  function show() {
    if (pos >= queue.length) return finish(false);
    const { c, retry } = queue[pos];
    stage.replaceChildren(renderCard(c, { graded, next, retry, mode: opts.mode }));
    const f = $('input, textarea, .opt', stage); if (f && c.t !== 'learn' && window.innerWidth > 820) f.focus({ preventScroll: true });
  }
  function finish(timedOut) {
    clearInterval(timerInt);
    const acc = answered ? correctFirst / answered : 1;
    const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;
    const summary = { stars, acc, xp: xpEarned, answered, correctFirst, secs: Math.round((Date.now() - startedAt) / 1000), timedOut };
    if (opts.lessonId) {
      const prev = S.lessons[opts.lessonId];
      const bonus = prev ? 0 : 20;
      if (bonus) { xpEarned += bonus; addXp(bonus); summary.xp = xpEarned; }
      S.lessons[opts.lessonId] = { stars: Math.max(stars, prev ? prev.stars : 0), at: todayStr() };
      save();
    }
    if (opts.onDone) opts.onDone(summary, stage);
    else stage.replaceChildren(doneScreen(summary, opts));
    $('.meter i', head).style.width = '100%';
  }
  setProgress(); show();
  return { cleanup() { clearInterval(timerInt); } };
}
function doneScreen(s, opts) {
  const L = opts.lessonId && IDX[opts.lessonId];
  let nextHref = '#map', nextLabel = 'Back to map';
  if (L) {
    const flat = C.worlds.flatMap(w => w.lessons);
    const i = flat.findIndex(l => l.id === opts.lessonId);
    if (flat[i + 1]) { nextHref = `#lesson-${flat[i + 1].id}`; nextLabel = 'Next: ' + flat[i + 1].title; }
  }
  return h('div', { class: 'card done-screen' },
    h('div', { class: 'big-stars', 'aria-label': `${s.stars} stars` }, '★'.repeat(s.stars) + '☆'.repeat(3 - s.stars)),
    h('h2', null, s.timedOut ? 'Time!' : s.stars === 3 ? 'Clean run.' : s.stars === 2 ? 'Solid. Missed items go to review.' : 'Done. Review will bring the misses back.'),
    h('div', { class: 'kv' },
      h('div', null, h('b', null, `+${s.xp}`), h('span', null, 'XP earned')),
      h('div', null, h('b', null, `${Math.round(s.acc * 100)}%`), h('span', null, 'first-try accuracy')),
      h('div', null, h('b', null, `${Math.floor(s.secs / 60)}:${String(s.secs % 60).padStart(2, '0')}`), h('span', null, 'time'))),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('a', { class: 'btn', href: '#map' }, 'Map'),
      opts.lessonId ? h('a', { class: 'btn', href: `#lesson-${opts.lessonId}`, onclick: () => setTimeout(render, 0) }, 'Replay') : null,
      h('a', { class: 'btn primary', href: nextHref }, nextLabel)));
}

// ------------------------------------------------------------------ card renderers
const KIND = { learn: 'Read', mcq: 'Pick one', multi: 'Pick all that are true', tf: 'True or false', fill: 'Type the answer', order: 'Put in order', match: 'Match the pairs', sql: 'Write SQL', py: 'Write Python', spark: 'Write PySpark', scenario: 'Real-world problem', talk: 'Practise answering out loud', viz: 'Try it yourself', bug: 'Find the bug' };
function renderCard(c, ctx) {
  const card = h('article', { class: 'card' });
  const kindLine = h('div', { class: 'eyebrow kind' }, KIND[c.t] || c.t, ctx.retry ? ' · second try' : '');
  const foot = h('div', { class: 'player-foot' });
  const fb = h('div');
  card.append(kindLine);
  const R = renderers[c.t];
  if (!R) { card.append(h('p', null, 'Unknown card type ' + c.t)); foot.append(h('button', { class: 'btn primary', onclick: ctx.next }, 'Continue')); card.append(foot); return card; }
  R(card, c, ctx, fb, foot);
  card.append(fb, foot);
  return card;
}
function feedback(fb, ok, title, why) {
  fb.replaceChildren(h('div', { class: 'feedback ' + (ok ? 'ok' : 'bad'), role: 'status' },
    h('div', { class: 'fh' }, title),
    why ? h('div', { class: 'md', html: md(why) }) : null));
}
function continueBtn(foot, ctx, label = 'Continue') {
  const b = h('button', { class: 'btn primary', onclick: ctx.next }, label);
  foot.replaceChildren(b); b.focus({ preventScroll: true });
  return b;
}

// ------------------------------------------------------------------ jargon: tap a word to see its plain meaning
let GLOSS_RE = null, GLOSS_MAP = null;
function glossIndex() {
  if (GLOSS_RE || !C || !C.glossary) return;
  GLOSS_MAP = new Map();
  for (const g of C.glossary) {
    const paren = g.term.indexOf(' (');
    const keys = [];
    if (paren < 0) keys.push(g.term);
    else {
      const k = g.term.slice(0, paren);
      if (/[A-Z]{2}/.test(k) || /\s/.test(k)) keys.push(k);   // acronyms or multi-word names only
      keys.push(g.term);
    }
    for (const k of keys) if (k.length >= 3 && !GLOSS_MAP.has(k.toLowerCase())) GLOSS_MAP.set(k.toLowerCase(), g);
  }
  const keys = [...GLOSS_MAP.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  GLOSS_RE = new RegExp('(^|[^A-Za-z0-9_./-])(' + keys.join('|') + ')(?![A-Za-z0-9_/-]|\\.[A-Za-z])', 'i');
}
function linkGlossary(root, max = 8) {
  glossIndex(); if (!GLOSS_RE) return root;
  const seen = new Set(); let n = 0;
  const walk = (node) => {
    for (const ch of [...node.childNodes]) {
      if (n >= max) return;
      if (ch.nodeType === 1) { if (!/^(CODE|PRE|A|BUTTON|TH|H1|H2|H3)$/.test(ch.tagName) && !ch.classList.contains('flow')) walk(ch); continue; }
      if (ch.nodeType !== 3) continue;
      let text = ch.nodeValue, m, frag = null;
      while (n < max && (m = GLOSS_RE.exec(text))) {
        const word = m[2], g = GLOSS_MAP.get(word.toLowerCase()), start = m.index + m[1].length;
        if (seen.has(g.term)) { frag = frag || document.createDocumentFragment(); frag.append(text.slice(0, start + word.length)); text = text.slice(start + word.length); continue; }
        seen.add(g.term); n++;
        frag = frag || document.createDocumentFragment();
        frag.append(text.slice(0, start), h('button', { type: 'button', class: 'gl', 'data-term': g.term, title: 'Tap for the meaning' }, word));
        text = text.slice(start + word.length);
      }
      if (frag) { frag.append(text); ch.replaceWith(frag); }
    }
  };
  walk(root);
  return root;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.gl');
  document.querySelectorAll('.gl-pop').forEach(p => p.remove());
  if (!b) return;
  const g = C.glossary.find(x => x.term === b.dataset.term); if (!g) return;
  const pop = h('div', { class: 'gl-pop', role: 'dialog' }, h('b', null, g.term), h('div', { class: 'md', html: md(g.def) }));
  document.body.append(pop);
  const r = b.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 32);
  pop.style.width = w + 'px';
  pop.style.left = Math.max(16, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 16)) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.gl-pop').forEach(p => p.remove()); });

const LETTERS = 'ABCDEFGH';
const renderers = {
  learn(card, c, ctx, fb, foot) {
    if (c.title) card.append(h('h2', null, c.title));
    card.append(linkGlossary(h('div', { class: 'md', html: md(c.md) })));
    foot.append(h('button', { class: 'btn primary', onclick: () => { addXp(2); ctx.next(); } }, 'Got it'));
  },
  viz(card, c, ctx, fb, foot) {
    if (c.title) card.append(h('h2', null, c.title));
    if (c.md) card.append(linkGlossary(h('div', { class: 'md', html: md(c.md) }), 4));
    const stage = h('div', { class: 'viz' });
    card.append(stage);
    let reached = false;
    const skip = h('button', { class: 'btn small ghost', onclick: ctx.next }, 'Skip');
    const cont = h('button', { class: 'btn primary', disabled: true, onclick: ctx.next }, 'Continue');
    foot.append(skip, cont);
    const api = { h, md, done: (msg) => {
      if (reached) return; reached = true;
      addXp(15, stage);
      skip.remove(); cont.disabled = false;
      feedback(fb, true, 'Goal reached', (msg ? msg + '\n\n' : '') + (c.why || ''));
    } };
    const fn = window.DEVIZ && window.DEVIZ[c.kind];
    if (!fn) { stage.append(h('p', { class: 'muted' }, 'Simulation unavailable.')); cont.disabled = false; return; }
    try { fn(stage, c.params || {}, api); } catch (e) { stage.append(h('pre', { class: 'console err' }, String(e))); cont.disabled = false; }
  },
  bug(card, c, ctx, fb, foot) {
    card.append(h('div', { class: 'q md', html: md(c.q) }));
    const lines = c.code.split('\n');
    const box = h('div', { class: 'bug-code', role: 'list' });
    let locked = false;
    lines.forEach((ln, i) => box.append(h('button', { class: 'bug-line', role: 'listitem', 'data-i': i, onclick: (e) => {
      if (locked) return; locked = true;
      const ok = [].concat(c.a).includes(i + 1);
      $$('.bug-line', box).forEach(b => { b.disabled = true; if ([].concat(c.a).includes(+b.dataset.i + 1)) b.classList.add('right'); });
      if (!ok) e.currentTarget.classList.add('wrong');
      ctx.graded(c, ok, e.currentTarget, 12);
      feedback(fb, ok, ok ? 'Bug found' : `The bug is on line ${[].concat(c.a).join(', ')}`, c.why);
      continueBtn(foot, ctx);
    } }, h('span', { class: 'bn' }, String(i + 1)), h('code', { html: highlight(ln || ' ', c.lang || 'python') }))));
    card.append(box);
    card.append(h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '8px' } }, 'Tap the line that is wrong.'));
  },
  mcq(card, c, ctx, fb, foot) { choice(card, c, ctx, fb, foot, false); },
  multi(card, c, ctx, fb, foot) { choice(card, c, ctx, fb, foot, true); },
  tf(card, c, ctx, fb, foot) {
    choice(card, { ...c, opts: ['True', 'False'], a: c.a ? 0 : 1, _noShuffle: true }, ctx, fb, foot, false);
  },
  fill(card, c, ctx, fb, foot) {
    card.append(h('div', { class: 'q md', html: md(c.q) }));
    const inp = h('input', { class: 'input mono', id: 'fill-' + c._id.replace(/\W/g, '_'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Type your answer' });
    card.append(inp);
    const check = () => {
      const v = norm(inp.value);
      if (!v) return;
      const answers = [].concat(c.a);
      const ok = answers.some(a => norm(a) === v || (c.loose && v.includes(norm(a))));
      inp.disabled = true;
      ctx.graded(c, ok, inp, 10);
      feedback(fb, ok, ok ? 'Correct' : `Answer: ${answers[0]}`, c.why);
      continueBtn(foot, ctx);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!inp.disabled) check(); else ctx.next(); } });
    foot.append(h('button', { class: 'btn primary', onclick: check }, 'Check'));
  },
  order(card, c, ctx, fb, foot) {
    card.append(h('div', { class: 'q md', html: md(c.q) }));
    const built = h('div', { class: 'order-built', 'aria-label': 'Your order' });
    const pool = h('div', { class: 'order-pool' });
    const picked = [];
    let items = shuffle(c.items.map((t, i) => ({ t, i })));
    if (items.every((x, k) => x.i === k) && items.length > 1) items = items.reverse();
    const draw = () => {
      built.replaceChildren(...(picked.length ? picked.map((x, k) => h('button', { class: 'tok', onclick: () => { picked.splice(k, 1); draw(); } }, h('span', { class: 'n' }, k + 1), h('span', { html: mdInline(x.t) }))) : [h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Tap the steps below in the right order')]));
      pool.replaceChildren(...items.filter(x => !picked.includes(x)).map(x => h('button', { class: 'tok', onclick: () => { picked.push(x); draw(); } }, h('span', { html: mdInline(x.t) }))));
    };
    draw();
    card.append(built, pool);
    foot.append(h('button', { class: 'btn primary', onclick: () => {
      if (picked.length !== c.items.length) { toast('Place every step first'); return; }
      const ok = picked.every((x, k) => x.i === k);
      $$('button', built).concat($$('button', pool)).forEach(b => b.disabled = true);
      ctx.graded(c, ok, built, 10);
      feedback(fb, ok, ok ? 'Correct order' : 'Not quite. Correct order:', (ok ? '' : c.items.map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n\n') + (c.why || ''));
      continueBtn(foot, ctx);
    } }, 'Check'));
  },
  match(card, c, ctx, fb, foot) {
    card.append(h('div', { class: 'q md', html: md(c.q) }));
    const left = c.pairs.map((p, i) => ({ t: p[0], i })), right = shuffle(c.pairs.map((p, i) => ({ t: p[1], i })));
    let selL = null; const done = new Map(); let mistakes = 0;
    const grid = h('div', { class: 'match-grid' });
    const draw = () => {
      grid.replaceChildren(
        h('div', { class: 'opts' }, left.map(x => h('button', { class: 'opt' + (selL === x ? ' sel' : '') + (done.has(x.i) ? ' right' : ''), disabled: done.has(x.i), onclick: () => { selL = x; draw(); } }, h('span', { html: mdInline(x.t) })))),
        h('div', { class: 'opts' }, right.map(x => h('button', { class: 'opt' + ([...done.values()].includes(x.i) ? ' right' : ''), disabled: [...done.values()].includes(x.i), onclick: (e) => {
          if (!selL) { toast('Pick a term on the left first'); return; }
          if (selL.i === x.i) { done.set(selL.i, x.i); selL = null; draw(); if (done.size === left.length) { const ok = mistakes <= 1; ctx.graded(c, ok, grid, 10); feedback(fb, ok, ok ? 'All matched' : `Matched, with ${mistakes} slip(s)`, c.why); continueBtn(foot, ctx); } }
          else { mistakes++; e.currentTarget.classList.add('wrong'); setTimeout(draw, 350); }
        } }, h('span', { html: mdInline(x.t) })))));
    };
    draw(); card.append(grid);
  },
  sql(card, c, ctx, fb, foot) { codeCard(card, c, ctx, fb, foot, 'sql'); },
  py(card, c, ctx, fb, foot) { codeCard(card, c, ctx, fb, foot, 'py'); },
  spark(card, c, ctx, fb, foot) { codeCard(card, c, ctx, fb, foot, 'spark'); },
  scenario(card, c, ctx, fb, foot) {
    card.append(h('h2', null, c.title || 'Incident'), h('div', { class: 'md', html: md(c.setup) }));
    const area = h('div'); card.append(area);
    let step = 0, slips = 0;
    const showStep = () => {
      const s = c.steps[step];
      const opts = s.opts.map((o, i) => ({ ...o, i }));
      const box = h('div', { class: 'opts', style: { marginTop: '12px' } });
      area.append(h('div', { class: 'q md', style: { marginTop: '14px' }, html: md(`**Step ${step + 1}/${c.steps.length}.** ${s.q}`) }), box);
      const note = h('div'); area.append(note);
      shuffle(opts).forEach((o, k) => box.append(h('button', { class: 'opt', onclick: (e) => {
        const b = e.currentTarget;
        if (o.ok) {
          b.classList.add('right'); $$('button', box).forEach(x => x.disabled = true);
          note.replaceChildren(h('div', { class: 'feedback ok' }, h('div', { class: 'md', html: md(o.fb || 'Right call.') })));
          step++;
          if (step < c.steps.length) { const nb = h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: () => { nb.remove(); showStep(); } }, 'Next step'); note.append(nb); }
          else { const ok = slips === 0; ctx.graded(c, ok, box, 25); feedback(fb, ok, ok ? 'Incident resolved, no missteps' : `Resolved after ${slips} misstep(s)`, c.why); continueBtn(foot, ctx); }
        } else {
          slips++; b.classList.add('wrong'); b.disabled = true;
          note.replaceChildren(h('div', { class: 'feedback bad' }, h('div', { class: 'md', html: md(o.fb || 'That makes it worse. Try another move.') })));
        }
      } }, h('span', { class: 'k' }, LETTERS[k]), h('span', { html: mdInline(o.text) }))));
    };
    showStep();
  },
  talk(card, c, ctx, fb, foot) {
    card.append(h('div', { class: 'q md', html: md(c.q) }));
    const ta = h('textarea', { class: 'input', id: 'talk-' + c._id.replace(/\W/g, '_'), rows: 5, placeholder: 'Answer out loud first, then jot your key points here (optional).' });
    card.append(ta);
    const reveal = h('button', { class: 'btn primary', onclick: () => {
      reveal.remove();
      card.insertBefore(h('div', { class: 'feedback', style: { background: 'var(--bg)' } }, h('div', { class: 'fh' }, 'Model answer'), h('div', { class: 'md talk-ref', html: md(c.a) })), fb);
      foot.replaceChildren(h('span', { class: 'muted', style: { fontSize: '13px' } }, 'How did you do?'),
        h('button', { class: 'btn bad small', onclick: (e) => { ctx.graded(c, false, e.currentTarget, 15); ctx.next(); } }, 'Missed key points'),
        h('button', { class: 'btn small', onclick: (e) => { ctx.graded(c, false, e.currentTarget, 15); ctx.next(); } }, 'Partly'),
        h('button', { class: 'btn ok small', onclick: (e) => { ctx.graded(c, true, e.currentTarget, 15); ctx.next(); } }, 'Nailed it'));
    } }, 'Show model answer');
    foot.append(reveal);
  },
};
function choice(card, c, ctx, fb, foot, multi) {
  card.append(h('div', { class: 'q md', html: md(c.q) }));
  if (c.code) card.append(h('div', { class: 'md', html: md('```' + (c.lang || '') + '\n' + c.code + '\n```') }));
  const order = c._noShuffle || c.keep ? c.opts.map((t, i) => ({ t, i })) : shuffle(c.opts.map((t, i) => ({ t, i })));
  const sel = new Set();
  const box = h('div', { class: 'opts', role: multi ? 'group' : 'radiogroup' });
  let locked = false;
  const correctSet = new Set([].concat(c.a));
  const submit = () => {
    if (locked || !sel.size) return;
    locked = true;
    const ok = sel.size === correctSet.size && [...sel].every(i => correctSet.has(i));
    $$('.opt', box).forEach(b => { const i = +b.dataset.i; b.disabled = true; if (correctSet.has(i)) b.classList.add('right'); else if (sel.has(i)) b.classList.add('wrong'); });
    ctx.graded(c, ok, box, ctx.mode === 'speed' ? 5 : 10);
    if (ctx.mode === 'speed') { setTimeout(ctx.next, ok ? 350 : 1100); return; }
    feedback(fb, ok, ok ? 'Correct' : 'Not quite', c.why);
    continueBtn(foot, ctx);
  };
  order.forEach((o, k) => box.append(h('button', { class: 'opt', 'data-i': o.i, onclick: (e) => {
    if (locked) return;
    if (multi) { sel.has(o.i) ? sel.delete(o.i) : sel.add(o.i); e.currentTarget.classList.toggle('sel'); }
    else { sel.clear(); sel.add(o.i); submit(); }
  } }, h('span', { class: 'k' }, LETTERS[k]), h('span', { html: mdInline(o.t) }))));
  card.append(box);
  if (multi) foot.append(h('button', { class: 'btn primary', onclick: submit }, 'Check'));
  card._keys = (e) => {
    if (locked) return;
    const k = 'abcdefgh'.indexOf(e.key.toLowerCase());
    if (k >= 0 && k < order.length) $$('.opt', box)[k].click();
  };
}
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const card = $('.card'); if (card && card._keys) card._keys(e);
});

async function schemaChips(tables) {
  const wrap = h('div', { class: 'schema' });
  Engine.schema().then(all => {
    const want = tables && tables.length ? all.filter(t => tables.includes(t.name)) : [];
    wrap.replaceChildren(...want.map(t => h('details', null, h('summary', null, `${t.name} (${t.count})`),
      h('div', { class: 'cols' }, t.cols.map(([n, ty], i) => [i ? ', ' : '', h('b', null, n), ' ', ty.toLowerCase()])))));
  });
  return wrap;
}
function editor(id, value, lang, onRun) {
  const ta = h('textarea', { class: 'editor', id, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Code editor' });
  ta.value = value || '';
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(520, Math.max(170, ta.scrollHeight + 4)) + 'px'; };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.setRangeText('    ', s, en, 'end');
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const s = ta.selectionStart; const line = ta.value.slice(0, s).split('\n').pop();
      const ind = (line.match(/^\s*/) || [''])[0] + (/:\s*$/.test(line) && lang !== 'sql' ? '    ' : '');
      if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); fit(); }
    }
  });
  setTimeout(fit, 0);
  return ta;
}
async function codeCard(card, c, ctx, fb, foot, kind) {
  const label = { sql: 'SQL · SQLite dialect', py: 'Python 3.12', spark: 'PySpark 3.5 API · spark, F, Window, T preloaded' }[kind];
  card.append(h('div', { class: 'q md', html: md(c.q) }));
  if (c.tables) card.append(await schemaChips(c.tables));
  const draftKey = 'draft:' + c._id;
  let draft = null; try { draft = sessionStorage.getItem(draftKey); } catch (e) { /* ignore */ }
  const out = h('div', { class: 'out', 'aria-live': 'polite' });
  let attempts = 0, solved = false, gaveUp = false;
  const runBtn = h('button', { class: 'btn small', onclick: () => go_(false) }, '▶ Run');
  const ta = editor('ed-' + c._id.replace(/\W/g, '_'), draft || c.starter || '', kind, () => go_(false));
  ta.addEventListener('input', () => { try { sessionStorage.setItem(draftKey, ta.value); } catch (e) { /* ignore */ } });
  const bar = h('div', { class: 'editor-bar' }, h('span', { class: 'muted' }, label), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, 'Ctrl/⌘+Enter runs'), runBtn);
  card.append(h('div', { class: 'editor-wrap' }, bar, ta), out);
  const hintBtn = c.hint ? h('button', { class: 'btn small ghost', onclick: () => { hintBtn.remove(); out.prepend(h('div', { class: 'notice', style: { marginBottom: '10px' } }, h('span', { html: mdInline('**Hint:** ' + c.hint) }))); } }, 'Hint') : null;
  const solBtn = h('button', { class: 'btn small ghost', onclick: () => {
    if (!solved) { gaveUp = true; ctx.graded(c, false, solBtn, 30); }
    out.append(h('div', { class: 'md', html: md('**Reference solution**\n```' + (kind === 'sql' ? 'sql' : 'python') + '\n' + c.solution + '\n```' + (c.why ? '\n' + c.why : '')) }));
    solBtn.remove(); continueBtn(foot, ctx);
  } }, 'Show solution');
  const submitBtn = h('button', { class: 'btn primary', onclick: () => go_(true) }, 'Submit');
  foot.append(hintBtn, solBtn, h('span', { class: 'spacer' }), submitBtn);

  async function go_(submit) {
    runBtn.disabled = submitBtn.disabled = true;
    out.replaceChildren(h('div', { class: 'muted' }, Engine.py !== 'ready' && kind !== 'sql' ? 'Starting Python (first run downloads ~14 MB, then it is cached)…' : 'Running…'));
    const payload = { code: ta.value };
    if (kind === 'sql') { payload.check = c.check; if (submit) payload.solution = c.solution; }
    if (kind === 'py') payload.tests = submit ? c.tests : '';
    if (kind === 'spark' && submit && !c.tests) payload.solution = c.solution;
    if (kind === 'spark' && submit && c.tests) payload.tests = c.tests;
    const r = await Engine.run(kind, payload);
    runBtn.disabled = submitBtn.disabled = false;
    out.replaceChildren();
    if (r.engineError) {
      out.append(h('div', { class: 'feedback bad' }, h('div', { class: 'fh' }, 'Code engine unavailable'), h('div', null, `${r.error}. You can still compare your code with the reference solution and grade yourself.`)));
      foot.replaceChildren(h('button', { class: 'btn small', onclick: () => { out.append(h('div', { class: 'md', html: md('```\n' + c.solution + '\n```') })); } }, 'Show solution'),
        h('button', { class: 'btn bad small', onclick: (e) => { ctx.graded(c, false, e.currentTarget, 30); ctx.next(); } }, 'Mine was off'),
        h('button', { class: 'btn ok small', onclick: (e) => { ctx.graded(c, true, e.currentTarget, 30); ctx.next(); } }, 'Mine matched'));
      return;
    }
    if (r.stdout) out.append(h('pre', { class: 'console' }, r.stdout));
    if (!r.ok) out.append(h('pre', { class: 'console err' }, r.error));
    const shown = kind === 'sql' ? r.user : (r.cols ? { cols: r.cols, rows: r.rows, total: r.total } : null);
    if (r.ok && shown) out.append(resultTable(shown));
    if (r.ok && kind === 'py' && !submit && !r.stdout) out.append(h('div', { class: 'muted' }, `Ran in ${r.ms} ms. No output. Use print() to inspect, or Submit to run the tests.`));
    if (!submit) return;
    attempts++;
    let pass = false, msg = '';
    if (!r.ok) { msg = r.failed_test ? 'A test failed.' : 'Your code raised an error.'; }
    else if (kind === 'sql') { const cmp = compareResults(r.user, r.expected, c.ordered); pass = cmp.pass; msg = cmp.msg; if (r.solutionError) msg = 'Reference solution failed: ' + r.solutionError; }
    else if (kind === 'py') { pass = true; }
    else if (kind === 'spark') {
      if (c.tests) pass = true;
      else if (!r.cols) { msg = 'Assign your final DataFrame to a variable named `result`.'; }
      else { const cmp = compareResults({ cols: r.cols, rows: r.rows }, r.expected && r.expected.cols ? { cols: r.expected.cols, rows: r.expected.rows } : null, c.ordered); pass = cmp.pass; msg = cmp.msg; }
    }
    if (pass) {
      if (ctx.solved) ctx.solved(c);
      if (!solved) { solved = true; if (!gaveUp) ctx.graded(c, attempts === 1, submitBtn, 30); }
      if (attempts > 1 && !gaveUp) { /* counted as a later success: recordItem saw the first failure */ }
      feedback(fb, true, attempts === 1 ? 'Passed on the first try' : `Passed (attempt ${attempts})`, c.why);
      continueBtn(foot, ctx);
    } else {
      if (attempts === 1 && !gaveUp) ctx.graded(c, false, submitBtn, 30);
      feedback(fb, false, 'Not yet', msg + (attempts >= 2 && c.hint ? '' : ''));
    }
  }
}


// ------------------------------------------------------------------ view: SQL in 50 (free navigation)
function sql50Steps() {
  const steps = [];
  ((C.sql50 && C.sql50.concepts) || []).forEach((k, ki) => {
    steps.push({ kind: 'learn', k, ki, id: `sql50:${k.id}:learn` });
    k.questions.forEach((c, qi) => steps.push({ kind: 'q', k, ki, qi, c, id: c._id }));
  });
  return steps;
}
routes.sql50 = (main, arg) => {
  S.sql50 = S.sql50 || {};
  const steps = sql50Steps();
  if (!steps.length) { main.append(h('p', null, 'SQL in 50 is not available.')); return; }
  let i = Math.min(Math.max(parseInt(arg, 10) || 0, 0), steps.length - 1);
  const qSteps = steps.filter(x => x.kind === 'q');
  const mark = st => st.kind === 'learn' ? (S.sql50[st.id] ? 'seen' : '') : (S.sql50[st.id] || '');
  const icon = m => m === 'ok' ? '✓' : m === 'tried' ? '•' : m === 'seen' ? '✓' : '';
  const go = n => { location.hash = `#sql50-${n}`; };

  const solvedCount = () => qSteps.filter(x => S.sql50[x.id] === 'ok').length;
  const counter = h('span', { class: 'muted' });
  const list = h('ol', { class: 's50-list' });
  function drawList() {
    counter.textContent = `${solvedCount()} of ${qSteps.length} solved`;
    list.replaceChildren(...steps.map((st, n) => {
      const m = mark(st);
      const label = st.kind === 'learn' ? `${st.ki + 1}. ${st.k.title}` : `Query ${st.qi + 1}`;
      return h('li', { class: 's50-item ' + st.kind + (n === i ? ' cur' : '') },
        h('a', { href: `#sql50-${n}`, 'aria-current': n === i ? 'step' : null },
          h('span', { class: 's50-mark ' + m, 'aria-hidden': 'true' }, icon(m)), label,
          m === 'ok' ? h('span', { class: 'sr-only' }, ' (solved)') : m === 'tried' ? h('span', { class: 'sr-only' }, ' (tried)') : null));
    }));
  }
  const st = steps[i];
  const pane = h('div', { class: 's50-pane' });
  const nav = h('div', { class: 's50-nav' },
    h('button', { class: 'btn', disabled: i === 0, onclick: () => go(i - 1) }, '← Previous'),
    h('span', { class: 'muted' }, `Step ${i + 1} of ${steps.length}`),
    h('button', { class: 'btn' + (st.kind === 'learn' ? ' primary' : ''), disabled: i === steps.length - 1, onclick: () => go(i + 1) }, st.kind === 'learn' ? 'Try it →' : 'Next →'));
  if (st.kind === 'learn') {
    if (!S.sql50[st.id]) { S.sql50[st.id] = 'seen'; save(); }
    pane.append(h('article', { class: 'card' },
      h('div', { class: 'eyebrow kind' }, `Concept ${st.ki + 1} of ${C.sql50.concepts.length}`),
      h('h2', null, st.k.title),
      linkGlossary(h('div', { class: 'md', html: md(st.k.md) })),
      h('p', { class: 'muted', style: { marginTop: '14px' } }, `Next: ${st.k.questions.length} practice queries. The second one is there in case the first didn't work out.`)));
  } else {
    const ctx = {
      mode: 'lesson', retry: false,
      graded: (card, correct) => {
        recordItem(card._id, correct);
        if (correct) { S.sql50[card._id] = 'ok'; addXp(10); }
        else if (S.sql50[card._id] !== 'ok') S.sql50[card._id] = 'tried';
        save(); drawList();
      },
      solved: (card) => { S.sql50[card._id] = 'ok'; save(); drawList(); },
      next: () => go(Math.min(i + 1, steps.length - 1)),
    };
    pane.append(h('div', { class: 'eyebrow', style: { marginBottom: '6px' } }, `${st.ki + 1}. ${st.k.title} · query ${st.qi + 1} of ${st.k.questions.length}`),
      renderCard(st.c, ctx),
      h('p', { class: 'muted', style: { fontSize: '13px' } }, 'Stuck? ', h('a', { href: `#sql50-${steps.findIndex(x => x.kind === 'learn' && x.k === st.k)}` }, 'Read the explainer again'), '.'));
  }
  drawList();
  const listPanel = h('details', { class: 's50-side panel', open: window.innerWidth > 900 ? true : null },
    h('summary', null, h('b', null, 'All steps'), ' ', counter), list);
  main.append(
    h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'Practice'), h('h2', null, 'SQL in 50')),
      h('a', { class: 'btn small ghost', href: '#practice' }, 'Back to practice')),
    h('p', { class: 'muted', style: { marginTop: '-6px' } }, C.sql50.blurb),
    h('div', { class: 's50' }, listPanel, h('div', null, pane, nav)));
  const cur = $('.s50-item.cur', list); if (cur && window.innerWidth > 900) cur.scrollIntoView({ block: 'nearest' });
};


// ------------------------------------------------------------------ views: modules (learn by skill, any order)
let LAST_MODULE = null;
const modLessons = m => m.lessons.map(id => IDX[id]).filter(Boolean);
const modCards = m => modLessons(m).flatMap(L => L.lesson.cards).filter(c => GRADABLE.has(c.t) && c._id);
function modProgress(m) {
  const ls = modLessons(m), done = ls.filter(L => S.lessons[L.lesson.id]).length;
  S.checks = S.checks || {};
  const total = m.de1.length, ticked = m.de1.filter((_, i) => S.checks[`${m.id}:de1:${i}`]).length;
  return { done, total: ls.length, de1: ticked, de1Total: total };
}
const DEPTH = { 'hands-on': ['Hands-on', 'You must be able to do this yourself'], conceptual: ['Conceptual', 'Explain it clearly and know when to use it'] };
routes.modules = (main) => {
  LAST_MODULE = null;
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } },
    h('div', null, h('div', { class: 'eyebrow' }, 'Learn by skill, in any order'), h('h2', null, 'Modules')),
    h('a', { class: 'btn small ghost', href: '#map' }, 'Full course in order')));
  main.append(h('p', { class: 'muted', style: { marginTop: '-4px', maxWidth: '760px' } },
    'Each module covers one skill, tool or concept: lessons, practice, a checklist of what the DE 1 posting expects, and a "Beyond DE 1" checklist. Open any module, any time.'));
  const groups = [...new Set(C.modules.map(m => m.group))];
  for (const g of groups) {
    main.append(h('h3', { class: 'mod-group' }, g));
    main.append(h('div', { class: 'mods' }, C.modules.filter(m => m.group === g).map(m => {
      const p = modProgress(m);
      return h('a', { class: 'mod-card', href: `#module-${m.id}` },
        h('div', { class: 'mod-top' }, h('span', { class: 'badge ' + m.depth }, DEPTH[m.depth][0]), h('span', { class: 'muted small' }, `${p.done}/${p.total} lessons`)),
        h('b', null, m.title),
        h('span', { class: 'muted small' }, m.why),
        h('div', { class: 'meter accent' }, h('i', { style: { width: (p.total ? 100 * p.done / p.total : 0) + '%' } })),
        h('span', { class: 'muted small' }, `DE 1 checklist: ${p.de1}/${p.de1Total}`));
    })));
  }
};
routes.module = (main, id) => {
  const m = (C.modules || []).find(x => x.id === id);
  if (!m) { main.append(h('p', null, 'Module not found. ', h('a', { href: '#modules' }, 'All modules'))); return; }
  LAST_MODULE = m.id;
  S.checks = S.checks || {};
  const p = modProgress(m);
  const checklist = (key, items) => h('ul', { class: 'checks' }, items.map((t, i) => {
    const k = `${m.id}:${key}:${i}`;
    const box = h('input', { type: 'checkbox', id: 'ck-' + k.replace(/\W/g, '_'), checked: S.checks[k] ? true : null, onchange: e => { S.checks[k] = e.target.checked; save(); } });
    return h('li', null, box, h('label', { for: box.id }, t));
  }));
  const cards = modCards(m);
  const tried = cards.filter(c => S.items[c._id]).length;
  main.append(
    h('a', { class: 'btn small ghost', href: '#modules', style: { marginBottom: '10px' } }, '← All modules'),
    h('div', { class: 'section-head', style: { marginTop: 0 } },
      h('div', null, h('div', { class: 'eyebrow' }, m.group), h('h2', null, m.title)),
      h('span', { class: 'badge big ' + m.depth, title: DEPTH[m.depth][1] }, DEPTH[m.depth][0])),
    h('p', { class: 'muted', style: { marginTop: '-4px', maxWidth: '760px' } }, m.why, ' ', h('i', null, DEPTH[m.depth][1] + '.')),
    h('div', { class: 'grid cols-2 mod-grid' },
      h('section', { class: 'panel' },
        h('h3', null, 'Lessons ', h('span', { class: 'muted small' }, `${p.done}/${p.total} done · any order`)),
        h('div', { class: 'lessons' }, modLessons(m).map((L, n) => {
          const st = lessonStars(L.lesson.id);
          return h('a', { class: 'lesson-pill' + (st ? ' done' : ''), href: `#lesson-${L.lesson.id}` },
            h('span', { class: 'ln' }, String(n + 1)), L.lesson.title, L.world.id === 'beyond' ? h('span', { class: 'badge beyond' }, 'Beyond DE 1') : null,
            st ? h('span', { class: 'stars' }, '★'.repeat(st) + '☆'.repeat(3 - st)) : null);
        })),
        h('h3', { style: { marginTop: '18px' } }, 'Practice'),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } },
          cards.length ? h('a', { class: 'btn primary', href: `#mpractice-${m.id}` }, `Practise this module (${tried}/${cards.length} tried)`) : null,
          ...(m.practice || []).map(x => h('a', { class: 'btn', href: x.href }, x.label)))),
      h('section', { class: 'panel' },
        h('h3', null, 'DE 1 bar ', h('span', { class: 'muted small' }, 'tick what you can do without notes')),
        checklist('de1', m.de1),
        h('h3', { style: { marginTop: '18px' } }, 'Beyond DE 1 ', h('span', { class: 'muted small' }, 'what makes you stronger than the posting')),
        checklist('beyond', m.beyond))));
};
routes.mpractice = (main, id) => {
  const m = (C.modules || []).find(x => x.id === id);
  if (!m) { location.hash = '#modules'; return; }
  LAST_MODULE = m.id;
  const score = c => { const it = S.items[c._id]; return !it ? 0 : it.w > 0 && it.b < 3 ? 1 : 2 + it.b; };
  const cards = shuffle(modCards(m)).sort((a, b) => score(a) - score(b)).slice(0, 12);
  if (!cards.length) { main.append(h('div', { class: 'card done-screen' }, h('h2', null, 'No practice questions in this module yet'), h('a', { class: 'btn primary', href: `#module-${m.id}` }, 'Back to module'))); return; }
  return Player(main, cards, { title: `${m.title} · practice (new and missed first)`, mode: 'review', exitHref: `#module-${m.id}` });
};

// ------------------------------------------------------------------ views: lesson / world
routes.lesson = (main, id) => {
  const L = IDX[id];
  if (!L) { main.append(h('p', null, 'Lesson not found. ', h('a', { href: '#map' }, 'Back to map'))); return; }
  return Player(main, L.lesson.cards, { title: `${L.world.title} · ${L.lesson.title}`, lessonId: id, mode: 'lesson', exitHref: LAST_MODULE ? `#module-${LAST_MODULE}` : `#map` });
};

// ------------------------------------------------------------------ views: review / speed / interview
routes.review = (main) => {
  const due = dueItems().slice(0, 25);
  if (!due.length) {
    main.append(h('div', { class: 'card done-screen' }, h('h2', null, 'Nothing due'), h('p', { class: 'muted' }, 'Items you miss come back here on a 1 → 3 → 7 → 14 → 30-day schedule. Clear more lessons to fill the queue.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn primary', href: '#speed' }, 'Lightning round'), h('a', { class: 'btn', href: '#map' }, 'Map'))));
    return;
  }
  return Player(main, due, { title: `Spaced review · ${due.length} item(s)`, mode: 'review', exitHref: '#home' });
};
routes.speed = (main) => {
  const seen = new Set(Object.keys(S.lessons));
  let pool = Object.values(ITEMS).filter(c => (c.t === 'mcq' || c.t === 'tf') && !c.noSpeed);
  const seenPool = pool.filter(c => seen.has(c._lesson));
  if (seenPool.length >= 25) pool = seenPool;
  const cards = shuffle(pool).slice(0, 40);
  let score = 0;
  return Player(main, cards, { title: 'Lightning round · 90 seconds', mode: 'speed', timeLimit: 90, exitHref: '#home', onDone: (s, stage) => {
    score = s.correctFirst;
    const best = score > S.speedBest; if (best) { S.speedBest = score; save(); }
    stage.replaceChildren(h('div', { class: 'card done-screen' }, h('div', { class: 'eyebrow' }, 'Lightning round'), h('h2', null, `${score} correct`), h('p', { class: 'muted' }, best ? 'New personal best.' : `Personal best: ${S.speedBest}`),
      h('div', { class: 'kv' }, h('div', null, h('b', null, s.answered), h('span', null, 'answered')), h('div', null, h('b', null, `${Math.round(s.acc * 100)}%`), h('span', null, 'accuracy')), h('div', null, h('b', null, `+${s.xp}`), h('span', null, 'XP'))),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn', href: '#home' }, 'Home'), h('button', { class: 'btn primary', onclick: render }, 'Again'))));
  } });
};
routes.interview = (main, arg) => {
  if (!arg) {
    const past = S.mocks.slice(-5).reverse();
    main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'Data Engineer 1 · Pune'), h('h2', null, 'Mock interview'))),
      h('div', { class: 'grid cols-2' },
        h('section', { class: 'panel' }, h('h2', null, 'Pick a round'),
          h('div', { class: 'mission' },
            [['technical', 'Technical screen · 35 min', '2 SQL, 1 PySpark, 1 Python, 6 concept questions, 1 incident scenario.'],
             ['design', 'Design + scenarios · 30 min', '3 system design talk-throughs, 3 incident scenarios, 4 concept questions.'],
             ['hr', 'Managerial + behavioural · 20 min', 'Your story, competencies from the job posting, Cummins-specific questions.'],
             ['full', 'Full loop · 60 min', 'Everything above, compressed.']].map(([k, t, d]) =>
              h('a', { class: 'mission-item', href: `#interview-${k}` }, h('span', { class: 'tick' }, '◎'), h('span', null, h('span', { class: 't' }, t), h('small', null, d)))))),
        h('section', { class: 'panel' }, h('h2', null, 'History'),
          past.length ? h('div', { class: 'mission' }, past.map(m => h('div', { class: 'mission-item' }, h('span', { class: 'tick' }, m.pct >= 70 ? '✓' : '·'), h('span', null, h('span', { class: 't' }, `${m.kind} · ${m.pct}%`), h('small', null, m.date))))) : h('p', { class: 'muted' }, 'No mock rounds yet. Hints are hidden and the clock runs. Aim for 70%+.'))));
    return;
  }
  const all = Object.values(ITEMS);
  const pick = (pred, n) => shuffle(all.filter(pred)).slice(0, n);
  const concept = c => c.t === 'mcq' || c.t === 'multi';
  const sets = {
    technical: () => [...pick(c => c.t === 'sql' && c.level >= 2, 2), ...pick(c => c.t === 'spark', 1), ...pick(c => c.t === 'py', 1), ...pick(concept, 6), ...pick(c => c.t === 'scenario', 1)],
    design: () => [...pick(c => c.t === 'talk' && c.tag === 'design', 3), ...pick(c => c.t === 'scenario', 3), ...pick(concept, 4)],
    hr: () => [...pick(c => c.t === 'talk' && c.tag === 'hr', 7)],
    full: () => [...pick(c => c.t === 'sql' && c.level >= 2, 2), ...pick(c => c.t === 'spark', 1), ...pick(concept, 5), ...pick(c => c.t === 'scenario', 2), ...pick(c => c.t === 'talk' && c.tag === 'design', 2), ...pick(c => c.t === 'talk' && c.tag === 'hr', 3)],
  };
  const limits = { technical: 35 * 60, design: 30 * 60, hr: 20 * 60, full: 60 * 60 };
  const cards = (sets[arg] || sets.technical)().map(c => ({ ...c, hint: null }));
  return Player(main, cards, { title: `Mock interview · ${arg}`, mode: 'interview', timeLimit: limits[arg] || 1800, exitHref: '#interview', onDone: (s, stage) => {
    const pct = Math.round(s.acc * 100);
    S.mocks.push({ kind: arg, pct, date: todayStr() }); save();
    stage.replaceChildren(h('div', { class: 'card done-screen' }, h('div', { class: 'eyebrow' }, 'Mock interview'), h('h2', null, `${pct}%`),
      h('p', { class: 'muted' }, pct >= 80 ? 'Strong round. Keep it sharp with reviews.' : pct >= 60 ? 'Close. Missed items are now in your review queue.' : 'Keep drilling. Every miss is queued for review.'),
      h('div', { class: 'kv' }, h('div', null, h('b', null, `${s.correctFirst}/${s.answered}`), h('span', null, 'correct')), h('div', null, h('b', null, `${Math.floor(s.secs / 60)}m`), h('span', null, 'time')), h('div', null, h('b', null, `+${s.xp}`), h('span', null, 'XP'))),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn', href: '#interview' }, 'Rounds'), h('a', { class: 'btn primary', href: '#review' }, 'Review misses'))));
  } });
};


// ------------------------------------------------------------------ views: practice hub
const TOPIC_NAMES = { beyond: 'Beyond DE 1', orient: 'Orientation', tools: 'Toolbox', sql1: 'SQL basics', sql2: 'Advanced SQL', python: 'Python', model: 'Modelling', pipes: 'Pipelines', quality: 'Quality & governance', spark: 'Spark', bigdata: 'Big data', stream: 'Streaming', cloud: 'Cloud & DevOps', scale: 'Scale', design: 'Design', ai: 'AI-ready data', interview: 'Interview' };
const GYMS = [
  ['sql', 'SQL practice', 'Write queries, easy to hard.', c => c.t === 'sql'],
  ['python', 'Python practice', 'Small coding problems with automatic checks.', c => c.t === 'py'],
  ['pyspark', 'PySpark practice', 'Spark DataFrame problems.', c => c.t === 'spark'],
  ['scenarios', 'Real-world problems', 'Something broke at work: what do you do?', c => c.t === 'scenario'],
  ['scale', 'Big numbers', '"How would you handle 100 million…" questions.', c => c._topic === 'scale'],
  ['concepts', 'Quick quizzes', 'Short questions on every topic.', c => ['mcq', 'tf', 'multi', 'match', 'order', 'fill'].includes(c.t)],
  ['bugs', 'Find the bug', 'Spot the broken line of code.', c => c.t === 'bug'],
  ['interview', 'Interview questions', 'Answer out loud, then compare with a model answer.', c => c.t === 'talk'],
  ['weak', 'My weak spots', 'Only the questions you got wrong.', c => S.items[c._id] && S.items[c._id].w > 0 && S.items[c._id].b < 3],
];
routes.practice = (main, arg) => {
  const all = Object.values(ITEMS);
  if (!arg) {
    const due = dueItems().length;
    main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('h2', null, 'Practice')),
      h('div', { class: 'big-actions', style: { marginBottom: '18px' } },
        h('a', { href: '#sql50', class: 'feature' }, h('b', null, 'SQL in 50'), h('span', null, `Zero to interview level: 25 concepts, 50 queries. ${Object.values(S.sql50 || {}).filter(v => v === 'ok').length} solved`)),
        h('a', { href: '#review' }, h('b', null, 'Review'), h('span', null, due ? `${due} question(s) you missed are due` : 'Nothing due today')),
        h('a', { href: '#speed' }, h('b', null, '90-second quiz'), h('span', null, `Answer as many as you can. Best: ${S.speedBest}`)),
        h('a', { href: '#interview' }, h('b', null, 'Mock interview'), h('span', null, 'A timed practice interview')),
        h('a', { href: '#arena' }, h('b', null, 'Free coding space'), h('span', null, 'Try any SQL, Python or PySpark'))),
      h('div', { class: 'section-head' }, h('h2', null, 'Practice sets'), h('span', { class: 'muted', style: { fontSize: '13px' } }, 'New and missed questions come first.')));
    main.append(h('div', { class: 'hub' }, GYMS.map(([k, t, d, f]) => {
      const items = all.filter(f); const seen = items.filter(c => S.items[c._id]).length;
      return h('a', { href: `#practice-${k}` }, h('span', { class: 'n' }, `${seen} of ${items.length} tried`), h('b', null, t), h('span', { class: 'muted', style: { fontSize: '13px' } }, d), h('div', { class: 'bar' }, h('i', { style: { width: (items.length ? 100 * seen / items.length : 0) + '%' } })));
    })));
    main.append(h('div', { class: 'section-head' }, h('h2', null, 'Quick quizzes by topic')),
      h('div', { class: 'lessons' }, Object.entries(TOPIC_NAMES).map(([k, t]) => {
        const n = all.filter(c => c._topic === k && ['mcq', 'tf', 'multi', 'match', 'order', 'fill'].includes(c.t)).length;
        return n ? h('a', { class: 'lesson-pill', href: `#practice-concepts-${k}` }, t, h('span', { class: 'ln' }, String(n))) : null;
      })));
    return;
  }
  const [kind, topic] = arg.split('-');
  const gym = GYMS.find(g => g[0] === kind) || GYMS[0];
  let pool = all.filter(gym[3]);
  if (topic) pool = pool.filter(c => c._topic === topic);
  const score = c => { const it = S.items[c._id]; return !it ? 0 : it.w > 0 && it.b < 3 ? 1 : 2 + it.b; };
  const size = ['sql', 'python', 'pyspark', 'scenarios'].includes(kind) ? 6 : kind === 'interview' ? 5 : 12;
  const cards = shuffle(pool).sort((a, b) => score(a) - score(b)).slice(0, size);
  if (!cards.length) { main.append(h('div', { class: 'card done-screen' }, h('h2', null, 'Nothing here yet'), h('p', { class: 'muted' }, kind === 'weak' ? 'No weak spots. Everything you missed has been mastered.' : 'No items match.'), h('a', { class: 'btn primary', href: '#practice' }, 'Practice hub'))); return; }
  return Player(main, cards, { title: `${gym[1]}${topic ? ' · ' + (TOPIC_NAMES[topic] || topic) : ''} · ${cards.length} of ${pool.length}`, mode: 'review', exitHref: '#practice', onDone: (s2, stage) => {
    stage.replaceChildren(h('div', { class: 'card done-screen' }, h('div', { class: 'eyebrow' }, gym[1]), h('h2', null, `${s2.correctFirst}/${s2.answered} first try`),
      h('div', { class: 'kv' }, h('div', null, h('b', null, `+${s2.xp}`), h('span', null, 'XP')), h('div', null, h('b', null, `${Math.round(s2.acc * 100)}%`), h('span', null, 'accuracy')), h('div', null, h('b', null, `${pool.filter(c => S.items[c._id]).length}/${pool.length}`), h('span', null, 'attempted'))),
      h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn', href: '#practice' }, 'Hub'), h('button', { class: 'btn primary', onclick: render }, 'Another set'))));
  } });
};

// ------------------------------------------------------------------ views: posting coverage
routes.posting = (main) => {
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'Cummins · Data Engineer 1 · Pune · ReqID 2435232'), h('h2', null, 'Posting coverage')),
    h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Every line of the job posting, mapped to the lessons and practice that cover it.')));
  C.posting.forEach(sec => {
    main.append(h('div', { class: 'week-label' }, sec.section));
    main.append(h('div', { class: 'grid', style: { gap: '8px' } }, sec.items.map(it => {
      const ls = it.lessons.filter(id => IDX[id]);
      const done = ls.filter(id => S.lessons[id]).length;
      return h('div', { class: 'cov-row' },
        h('div', { style: { minWidth: 0 } }, h('div', { html: mdInline(it.text) }), it.note ? h('div', { class: 'muted', style: { fontSize: '13px' } }, it.note) : null,
          h('div', { class: 'lessons' }, ls.map(id => h('a', { class: 'lesson-pill' + (S.lessons[id] ? ' done' : ''), href: `#lesson-${id}` }, IDX[id].lesson.title)),
            (it.practice || []).map(pk => h('a', { class: 'lesson-pill', href: `#practice-${pk}` }, '◎ ', (GYMS.find(g => g[0] === pk.split('-')[0]) || ['', pk])[1] + (pk.includes('-') ? ' · ' + (TOPIC_NAMES[pk.split('-')[1]] || '') : ''))))),
        h('span', { class: 'pct' }, ls.length ? `${done}/${ls.length}` : '—'));
    })));
  });
};

// ------------------------------------------------------------------ views: arena
const ARENA_SAMPLES = {
  sql: `-- The practice warehouse: Apex Engines (fictional)\n-- Warranty flow: crf -> service_requests -> pir -> claims -> credit_notes\nSELECT c.status,\n       COUNT(*)                      AS claims,\n       ROUND(SUM(c.claim_amount), 2) AS claimed,\n       ROUND(SUM(c.approved_amount), 2) AS approved\nFROM claims c\nGROUP BY c.status\nORDER BY claims DESC;`,
  py: `# Plain Python 3. print() shows output.\nfrom collections import Counter\nevents = ["CREATED", "CONFIRMED", "CREATED", "SHIPPED", "CREATED"]\nprint(Counter(events).most_common(2))`,
  spark: `# spark, F, Window and T are preloaded. Assign a DataFrame to \`result\` to see it as a table.\nclaims = spark.table("claims")\ndealers = spark.table("dealers")\n\nresult = (claims.join(F.broadcast(dealers), "dealer_id")\n          .groupBy("region")\n          .agg(F.count("*").alias("claims"), F.round(F.sum("approved_amount"), 2).alias("approved"))\n          .orderBy(F.desc("approved")))\nresult.explain()`,
};
routes.arena = (main) => {
  let tab = 'sql';
  try { tab = localStorage.getItem('de-arena-tab') || 'sql'; } catch (e) { /* ignore */ }
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div');
  const schemaBox = h('div', { class: 'panel' }, h('h2', null, 'Warehouse tables'), h('div', { class: 'muted' }, 'Loading…'));
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'Free practice'), h('h2', null, 'Arena'))),
    h('div', { class: 'grid cols-2' }, h('section', { class: 'panel' }, tabs, body), schemaBox));
  const draw = () => {
    tabs.replaceChildren(...[['sql', 'SQL'], ['py', 'Python'], ['spark', 'PySpark']].map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(tab === k), onclick: () => { tab = k; try { localStorage.setItem('de-arena-tab', k); } catch (e) { /* ignore */ } draw(); } }, t)));
    let saved = null; try { saved = localStorage.getItem('de-arena-' + tab); } catch (e) { /* ignore */ }
    const out = h('div', { class: 'out' });
    const run = async () => {
      out.replaceChildren(h('div', { class: 'muted' }, 'Running…'));
      const r = await Engine.run(tab, { code: ta.value });
      out.replaceChildren();
      if (r.stdout) out.append(h('pre', { class: 'console' }, r.stdout));
      if (!r.ok) out.append(h('pre', { class: 'console err' }, r.error));
      const shown = tab === 'sql' ? r.user : (r.cols ? { cols: r.cols, rows: r.rows, total: r.total } : null);
      if (r.ok && shown) out.append(resultTable(shown, 500));
      if (r.ok) out.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, `${r.ms} ms`));
    };
    const ta = editor('arena-' + tab, saved || ARENA_SAMPLES[tab], tab, run);
    ta.addEventListener('input', () => { try { localStorage.setItem('de-arena-' + tab, ta.value); } catch (e) { /* ignore */ } });
    body.replaceChildren(h('div', { class: 'editor-wrap' }, h('div', { class: 'editor-bar' }, h('span', { class: 'muted' }, { sql: 'SQLite dialect · every run starts from a fresh copy', py: 'Python 3.12', spark: 'PySpark API' }[tab]), h('span', { class: 'spacer' }),
      h('button', { class: 'btn small ghost', onclick: () => { ta.value = ARENA_SAMPLES[tab]; ta.dispatchEvent(new Event('input')); } }, 'Reset'),
      h('button', { class: 'btn small primary', onclick: run }, '▶ Run')), ta), out);
  };
  draw();
  Engine.schema().then(tables => {
    schemaBox.replaceChildren(h('h2', null, 'Warehouse tables'),
      h('p', { class: 'muted', style: { marginTop: 0, fontSize: '13px' } }, 'Fictional engine maker. Warranty flow: crf → service_requests → pir → claims → credit_notes. Click a table to see its columns.'),
      h('div', { class: 'schema' }, tables.map(t => h('details', null, h('summary', null, `${t.name} (${t.count})`), h('div', { class: 'cols' }, t.cols.map(([n, ty], i) => [i ? ', ' : '', h('b', null, n), ' ', ty.toLowerCase()]))))));
  });
};

// ------------------------------------------------------------------ views: plan / glossary / settings
routes.plan = (main) => {
  const day = planDay();
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, `Started ${S.startDate} · today is day ${day}`), h('h2', null, '21-day plan')),
    h('div', { class: 'row' }, h('span', { class: 'muted', style: { fontSize: '13px' } }, '2–3 hours a day. Interview-critical topics first.'),
      h('button', { class: 'btn small', onclick: () => { S.startDate = todayStr(); save(); render(); toast('Plan restarted from today'); } }, 'Restart plan today'))));
  let week = 0;
  const list = h('div', { class: 'plan-days' });
  C.plan.forEach(d => {
    const w = Math.ceil(d.day / 7);
    if (w !== week) { week = w; list.append(h('div', { class: 'week-label' }, `Week ${w} · ${['', 'Foundations at speed', 'Engines and pipelines', 'Production, design, interview'][w] || ''}`)); }
    const done = d.items.filter(missionDone).length, lessonsN = d.items.filter(i => i.lesson).length;
    list.append(h('div', { class: 'plan-day' + (d.day === day ? ' today' : '') },
      h('div', { class: 'dn' }, `D${d.day}`, h('small', null, `${done}/${lessonsN} done`)),
      h('div', { style: { minWidth: 0 } }, h('b', null, d.title), h('p', { class: 'muted', style: { margin: '2px 0 8px' } }, d.focus),
        h('div', { class: 'lessons' }, d.items.map(it => {
          if (it.lesson) { const L = IDX[it.lesson]; if (!L) return null; const st = lessonStars(it.lesson); return h('a', { class: 'lesson-pill' + (st ? ' done' : ''), href: `#lesson-${it.lesson}` }, L.lesson.title, st ? h('span', { class: 'stars' }, '★'.repeat(st)) : null); }
          return h('a', { class: 'lesson-pill', href: it.href }, it.title);
        })))));
  });
  main.append(list);
};
routes.more = (main) => {
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('h2', null, 'More')),
    h('div', { class: 'big-actions' },
      h('a', { href: '#projects' }, h('b', null, 'Resume projects'), h('span', null, 'Two projects to build, step by step')),
      h('a', { href: '#posting' }, h('b', null, 'Job posting checklist'), h('span', null, 'Every line of the Cummins posting and where you learn it')),
      h('a', { href: '#glossary' }, h('b', null, 'Word list'), h('span', null, 'Plain-English meaning of every term')),
      h('a', { href: '#arena' }, h('b', null, 'Free coding space'), h('span', null, 'Try any SQL, Python or PySpark')),
      h('a', { href: '#settings' }, h('b', null, 'Settings'), h('span', null, 'Back up or reset your progress'))));
};
routes.glossary = (main) => {
  const q = h('input', { class: 'input', id: 'gloss-q', placeholder: 'Search 150+ terms: idempotency, SCD2, watermark, skew…', autocomplete: 'off' });
  const list = h('div', { class: 'gloss' });
  const draw = () => {
    const s = norm(q.value);
    list.replaceChildren(...C.glossary.filter(g => !s || norm(g.term + ' ' + g.def).includes(s)).map(g => h('div', { class: 'gloss-item' }, h('b', null, g.term), h('div', { class: 'md', html: md(g.def) }))));
  };
  q.addEventListener('input', draw);
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('h2', null, 'Glossary')), q, h('div', { style: { height: '12px' } }), list);
  draw();
};
routes.settings = (main) => {
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('h2', null, 'Settings')),
    h('section', { class: 'panel grid' },
      h('div', null, h('b', null, 'Progress storage: '), Sync.ref ? 'saved to your account (syncs across devices)' : 'this browser only'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { const blob = JSON.stringify(S); navigator.clipboard?.writeText(blob).then(() => toast('Progress copied to clipboard'), () => toast('Copy blocked: select the text below')); exportBox.value = blob; } }, 'Copy progress backup'),
        h('button', { class: 'btn', onclick: () => { try { const v = JSON.parse(exportBox.value); if (typeof v.xp !== 'number') throw 0; S = v; save(); toast('Progress restored'); } catch (e) { toast('That backup could not be read'); } } }, 'Restore from text below')),
      (() => { exportBox = h('textarea', { class: 'input mono', id: 'backup', rows: 4, placeholder: 'Backup JSON appears here. Paste one to restore.' }); return exportBox; })(),
      h('div', { class: 'row' }, h('button', { class: 'btn bad', onclick: (e) => {
        const b = e.currentTarget;
        if (b.dataset.armed) { S = blankState(); save(); render(); toast('Progress reset'); }
        else { b.dataset.armed = '1'; b.textContent = 'Tap again to erase all progress'; }
      } }, 'Reset all progress'))));
};
let exportBox = null;
routes.projects = (main) => {
  S.projects = S.projects || {};
  main.append(h('div', { class: 'section-head', style: { marginTop: 0 } }, h('div', null, h('div', { class: 'eyebrow' }, 'Build on the side · each step +25 XP'), h('h2', null, 'Resume projects')),
    h('span', { class: 'muted', style: { fontSize: '13px' } }, 'Two flagship projects mapped to the posting. Build them in your own GitHub repo.')));
  main.append(h('div', { class: 'grid' }, C.projects.map(p => {
    const done = S.projects[p.id] || [];
    const n = p.steps.filter((_, i) => done[i]).length;
    const list = h('div', { class: 'mission' }, p.steps.map((st, i) => {
      const item = h('button', { class: 'mission-item' + (done[i] ? ' done' : ''), style: { textAlign: 'left', cursor: 'pointer', width: '100%', font: 'inherit' }, onclick: (e) => {
        const arr = S.projects[p.id] = S.projects[p.id] || [];
        arr[i] = !arr[i];
        if (arr[i]) addXp(25, e.currentTarget); else save();
        render();
      } }, h('span', { class: 'tick' }, done[i] ? '✓' : String(i + 1)), h('span', { class: 't', style: { fontWeight: 500 } }, st));
      return item;
    }));
    const bullet = h('p', { class: 'mono', style: { fontSize: '13px', margin: '0', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px' } }, p.resume);
    return h('section', { class: 'panel' },
      h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, p.title), h('span', { class: 'tagline' }, p.tag), h('span', { class: 'spacer' }), h('span', { class: 'muted tabnum' }, `${n}/${p.steps.length}`)),
      h('div', { class: 'meter accent', style: { margin: '10px 0' } }, h('i', { style: { width: (100 * n / p.steps.length) + '%' } })),
      h('p', null, p.pitch),
      h('div', { class: 'badge-list', style: { margin: '0 0 12px' } }, p.stack.map(t => h('span', { class: 'badge on' }, t))),
      list,
      h('div', { class: 'row', style: { margin: '14px 0 6px' } }, h('b', null, 'Resume bullet'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => { navigator.clipboard?.writeText(p.resume).then(() => toast('Copied'), () => toast('Copy blocked: select the text')); } }, 'Copy')),
      bullet);
  })));
};

// ------------------------------------------------------------------ boot
function shell() {
  const navItems = [['home', 'Home'], ['modules', 'Learn'], ['practice', 'Practice'], ['plan', 'Plan'], ['more', 'More']];
  const icons = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="M4 6h5l3 4h8M4 18h5l3-4"/><circle cx="4" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="10" r="2"/>',
    modules: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    review: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
    arena: '<path d="M4 6l6 6-6 6M12 18h8"/>',
    interview: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    practice: '<path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]}</svg>`;
  document.body.prepend(
    h('header', { class: 'topbar' }, h('div', { class: 'topbar-in' },
      h('a', { class: 'brand', href: '#home' }, h('span', { class: 'brand-mark' }, 'DE'), 'DE Arcade'),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, navItems.map(([r, t]) => h('a', { href: '#' + r, 'data-r': r }, t))),
      h('div', { class: 'hud', id: 'hud' }))),
  );
  document.body.append(h('nav', { class: 'tabbar', 'aria-label': 'Main' }, navItems.map(([r, t]) => h('a', { href: '#' + r, 'data-r': r, html: svg(r) + `<span>${t}</span>` }))));
}

async function boot() {
  shell();
  S = loadLocal() || blankState();
  updateHud();
  try {
    const res = await fetch('content.json');
    C = await res.json();
  } catch (e) {
    $('main').replaceChildren(h('div', { class: 'card' }, h('h2', null, 'Could not load lessons'), h('p', null, 'The lesson file did not load. Reload the page to try again.')));
    return;
  }
  indexContent();
  window.addEventListener('hashchange', render);
  render();
  Engine.start();
  Engine.warmSql();
  Sync.init();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Sync.flush(); });
}
if (/[?&]selftest\b/.test(location.search)) window.__DE = { renderCard, Engine, compareResults, getC: () => C, ITEMS };
boot();
})();
