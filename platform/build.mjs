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
for (const sec of posting) for (const it of sec.items) for (const id of it.lessons) if (!ids.has(id)) throw new Error('posting: unknown lesson ' + id);
for (const d of plan) for (const it of d.items) if (it.lesson && !ids.has(it.lesson)) throw new Error(`plan day ${d.day}: unknown lesson ${it.lesson}`);
fs.writeFileSync(path.join(DIST, 'content.json'), JSON.stringify({ worlds, plan, glossary, projects, practice, posting, sql50 }));

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
