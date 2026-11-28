// Build DE Arcade into dist/: one inline HTML page + content.json + engine files.
// Usage: node build.mjs        (run scripts/fetch-vendor.sh once first)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

// ---- content
const order = JSON.parse(fs.readFileSync(path.join(SRC, 'content', 'order.json'), 'utf8'));
const worlds = order.worlds.map(f => require(path.join(SRC, 'content', f)));
const plan = require(path.join(SRC, 'content', 'plan.cjs'));
const glossary = require(path.join(SRC, 'content', 'glossary.cjs'));
const projects = require(path.join(SRC, 'content', 'projects.cjs'));
const practice = require(path.join(SRC, 'content', 'practice.cjs'));
const posting = require(path.join(SRC, 'content', 'posting.cjs'));
const sql50 = require(path.join(SRC, 'content', 'sql50.cjs'));
const modules = require(path.join(SRC, 'content', 'modules.cjs'));
const theory = require(path.join(SRC, 'content', 'theory', 'syllabus.cjs'));
{ // theory content: src/content/theory/s*.cjs export { topicId: { md, check, scenarios, interview, hands } }
  const dir = path.join(SRC, 'content', 'theory');
  const byId = new Map(theory.sections.flatMap(sec => sec.topics.map(t => [t.id, t])));
  for (const f of fs.readdirSync(dir).filter(f => /^s\d.*\.cjs$/.test(f)).sort()) {
    for (const [id, body] of Object.entries(require(path.join(dir, f)))) {
      const t = byId.get(id);
      if (!t) throw new Error(`${f}: topic ${id} is not in the syllabus`);
      if (t.md) throw new Error(`${f}: topic ${id} written twice`);
      Object.assign(t, body);
    }
  }
  // senior-depth addenda: theory/deep/*.cjs export { topicId: { md, check, scenarios, interview, hands } }
  // md is appended under the topic's own text; card lists are concatenated.
  const deepDir = path.join(dir, 'deep');
  let deepN = 0;
  if (fs.existsSync(deepDir)) for (const f of fs.readdirSync(deepDir).filter(f => f.endsWith('.cjs')).sort()) {
    for (const [id, body] of Object.entries(require(path.join(deepDir, f)))) {
      const t = byId.get(id);
      if (!t) throw new Error(`deep/${f}: topic ${id} is not in the syllabus`);
      if (!t.md) throw new Error(`deep/${f}: topic ${id} has no base text to extend`);
      if (body.md) { t.md += '\n\n' + body.md; deepN++; }
      for (const k of ['check', 'scenarios', 'interview', 'hands']) if (body[k]) t[k] = (t[k] || []).concat(body[k]);
    }
  }
  console.log(`theory: ${deepN} topics extended with senior-depth addenda`);
  // condensed rewrites: theory/quick/*.cjs export { topicId: T(`md`) }; they REPLACE the topic text (base + senior addenda)
  const quickDir = path.join(dir, 'quick');
  let quickN = 0;
  if (fs.existsSync(quickDir)) for (const f of fs.readdirSync(quickDir).filter(f => f.endsWith('.cjs')).sort()) {
    for (const [id, body] of Object.entries(require(path.join(quickDir, f)))) {
      const t = byId.get(id);
      if (!t) throw new Error(`quick/${f}: topic ${id} is not in the syllabus`);
      if (t.quick) throw new Error(`quick/${f}: topic ${id} written twice`);
      t.quick = true; t.md = body.md; quickN++;
    }
  }
  console.log(`theory: ${quickN} topics use the condensed text`);
  // DE 1 versions: theory/de1/*.cjs export { topicId: { md, level } }; shown by default, full text behind a toggle
  const de1Dir = path.join(dir, 'de1');
  let de1N = 0;
  if (fs.existsSync(de1Dir)) for (const f of fs.readdirSync(de1Dir).filter(f => f.endsWith('.cjs')).sort()) {
    for (const [id, body] of Object.entries(require(path.join(de1Dir, f)))) {
      const t = byId.get(id);
      if (!t) throw new Error(`de1/${f}: topic ${id} is not in the syllabus`);
      if (t.de1) throw new Error(`de1/${f}: topic ${id} written twice`);
      t.de1 = body.md; if (body.level) t.level = body.level; de1N++;
    }
  }
  console.log(`theory: ${de1N} topics have a DE 1 version`);
  for (const t of byId.values()) {
    const id = t.id;
    {
      for (const k of ['check', 'scenarios', 'interview', 'hands']) for (const c of t[k] || []) {
        const need = { mcq: ['q', 'opts', 'a'], multi: ['q', 'opts', 'a'], tf: ['q'], sql: ['q', 'solution'], py: ['q', 'tests', 'solution'], spark: ['q', 'solution'], scenario: ['setup', 'steps'], talk: ['q', 'a'], order: ['q', 'items'], match: ['q', 'pairs'], fill: ['q', 'a'], bug: ['q', 'code', 'a'] }[c.t];
        if (!need) throw new Error(`theory ${id}: bad card type ${c.t}`);
        for (const n of need) if (c[n] === undefined) throw new Error(`theory ${id}: ${c.t} card missing ${n}`);
        if (c.t === 'mcq' && (c.a < 0 || c.a >= c.opts.length)) throw new Error(`theory ${id}: mcq answer out of range: ${c.q}`);
      }
    }
  }
  const written = [...byId.values()].filter(t => t.md).length;
  console.log(`theory: ${written}/${byId.size} topics written`);
}
{ // practice banks: src/content/bank/*.cjs export { moduleId: [cards] }
  const dir = path.join(SRC, 'content', 'bank');
  const banks = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.cjs')).sort().map(f => require(path.join(dir, f))) : [];
  for (const b of banks) for (const [mid, cards] of Object.entries(b)) {
    const mod = modules.find(m => m.id === mid);
    if (!mod) throw new Error('bank for unknown module ' + mid);
    mod.bank = (mod.bank || []).concat(cards);
  }
}
{ // every module lesson must exist, and every lesson should belong to a module
  const ids = new Set(worlds.flatMap(w => w.lessons.map(l => l.id)));
  const used = new Set(modules.flatMap(m => m.lessons));
  const missing = [...used].filter(x => !ids.has(x));
  if (missing.length) throw new Error('modules.cjs references unknown lessons: ' + missing.join(', '));
  const orphans = [...ids].filter(x => !used.has(x));
  if (orphans.length) console.warn('lessons not in any module:', orphans.join(', '));
}
const ids = new Set(); let cards = 0; const types = {};
for (const w of worlds) for (const l of w.lessons) {
  if (ids.has(l.id)) throw new Error('duplicate lesson id ' + l.id);
  ids.add(l.id);
  for (const c of l.cards) {
    cards++; types[c.t] = (types[c.t] || 0) + 1;
    const need = { mcq: ['q', 'opts', 'a'], multi: ['q', 'opts', 'a'], tf: ['q'], fill: ['q', 'a'], order: ['q', 'items'], match: ['q', 'pairs'], sql: ['q', 'solution'], py: ['q', 'tests', 'solution'], spark: ['q', 'solution'], scenario: ['setup', 'steps'], talk: ['q', 'a'], learn: ['md'], viz: ['kind'], bug: ['q', 'code', 'a'] }[c.t];
    if (!need) throw new Error(`${l.id}: unknown card type ${c.t}`);
    for (const k of need) if (c[k] === undefined) throw new Error(`${l.id}: ${c.t} card missing ${k}`);
    if (c.t === 'mcq' && (c.a < 0 || c.a >= c.opts.length)) throw new Error(`${l.id}: mcq answer out of range: ${c.q}`);
  }
}
for (const set of practice) for (const c of set.cards) { cards++; types[c.t] = (types[c.t] || 0) + 1; }
{ const tids = new Set(theory.sections.flatMap(s => s.topics.map(t => t.id)));
  for (const sec of posting) for (const it of sec.items) for (const id of it.topics) if (!tids.has(id)) throw new Error('posting: unknown theory topic ' + id); }
for (const d of plan) for (const it of d.items) if (it.lesson && !ids.has(it.lesson)) throw new Error(`plan day ${d.day}: unknown lesson ${it.lesson}`);
const bgPath = path.join(SRC, 'content', 'buildguide.json');   // generated by scripts/gen_buildguide.py
const buildguide = fs.existsSync(bgPath) ? JSON.parse(fs.readFileSync(bgPath, 'utf8')) : null;
if (buildguide) console.log(`build guide: ${buildguide.chapters.length} chapters`);
fs.writeFileSync(path.join(DIST, 'content.json'), JSON.stringify({ worlds, plan, glossary, projects, practice, posting, sql50, modules, theory, buildguide }));

// ---- syntax-check every inlined script
import vm from 'node:vm';
for (const f of ['viz.js', 'viz2.js', 'viz3.js', 'app.js', 'engine-worker.js']) new vm.Script(fs.readFileSync(path.join(SRC, f), 'utf8'), { filename: f });

// ---- page
let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
const inline = (marker, file) => { const s = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/<\/script/gi, '<\\/script'); html = html.replace(marker, () => s); };
inline('/*CSS*/', 'app.css');
inline('/*VIZ*/', 'viz.js');
inline('/*VIZ2*/', 'viz2.js');
inline('/*VIZ3*/', 'viz3.js');
inline('/*APP*/', 'app.js');
const fullDoc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>';
fs.writeFileSync(path.join(DIST, 'index.html'), fullDoc);   // standalone site (Vercel, any static host, local dev)
fs.writeFileSync(path.join(DIST, 'dev.html'), fullDoc);     // kept for old links
fs.writeFileSync(path.join(DIST, 'artifact.html'), html);   // claude.ai artifact page (the host adds the document skeleton)
for (const f of ['engine-worker.js', 'pyspark_shim.py', 'datasets.sql']) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
console.log(`built: ${worlds.length} worlds, ${ids.size} lessons, ${cards} cards`, types, `${plan.length} plan days, ${glossary.length} glossary terms`);
