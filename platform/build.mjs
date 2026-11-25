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
for (const d of plan) for (const it of d.items) if (it.lesson && !ids.has(it.lesson)) throw new Error(`plan day ${d.day}: unknown lesson ${it.lesson}`);
fs.writeFileSync(path.join(DIST, 'content.json'), JSON.stringify({ worlds, plan, glossary, projects }));

// ---- page
let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
const inline = (marker, file) => { const s = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/<\/script/gi, '<\\/script'); html = html.replace(marker, () => s); };
inline('/*CSS*/', 'app.css');
inline('/*VIZ*/', 'viz.js');
inline('/*APP*/', 'app.js');
fs.writeFileSync(path.join(DIST, 'index.html'), html);   // published page (the Artifact tool adds the document skeleton)
fs.writeFileSync(path.join(DIST, 'dev.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + html + '</body></html>');  // local dev
for (const f of ['engine-worker.js', 'pyspark_shim.py', 'datasets.sql']) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
console.log(`built: ${worlds.length} worlds, ${ids.size} lessons, ${cards} cards`, types, `${plan.length} plan days, ${glossary.length} glossary terms`);
