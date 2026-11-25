// Card builders. In every string, « and » are turned into backticks by the build
// («code» -> `code`, «««sql ... »»» -> ```sql ... ```), so content can live in JS template literals.
const fix = v => typeof v === 'string' ? v.replace(/«/g, '`').replace(/»/g, '`').replace(/^\n+/, '').replace(/\n\s*$/, '')
  : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v;
const dedent = s => {
  if (typeof s !== 'string') return s;
  const lines = s.replace(/^\n/, '').split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(ind)).join('\n');
};
const D = o => fix(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? dedent(v) : v])));

module.exports = {
  learn: (title, md) => D({ t: 'learn', title, md }),
  mcq: (q, opts, a, why, extra = {}) => D({ t: 'mcq', q, opts, a, why, ...extra }),
  multi: (q, opts, a, why, extra = {}) => D({ t: 'multi', q, opts, a, why, ...extra }),
  tf: (q, a, why, extra = {}) => D({ t: 'tf', q, a, why, ...extra }),
  fill: (q, a, why, extra = {}) => D({ t: 'fill', q, a, why, ...extra }),
  order: (q, items, why) => D({ t: 'order', q, items, why }),
  match: (q, pairs, why) => D({ t: 'match', q, pairs, why }),
  sql: o => D({ t: 'sql', level: 1, ...o }),
  py: o => D({ t: 'py', ...o }),
  spark: o => D({ t: 'spark', ...o }),
  scenario: (title, setup, steps, why) => D({ t: 'scenario', title, setup, steps: steps.map(s => D({ q: s[0], opts: s[1].map(o => D({ text: o[0], ok: !!o[1], fb: o[2] })) })), why }),
  talk: (q, a, tag = 'design') => D({ t: 'talk', q, a, tag }),
  viz: (kind, title, md, params = {}, why) => D({ t: 'viz', kind, title, md, params, why }),
  bug: (q, code, a, why, lang = 'python') => D({ t: 'bug', q, code, a, why, lang }),
  world: (id, title, tag, blurb, lessons) => ({ id, title, tag, blurb, lessons }),
  lesson: (id, title, mins, cards) => ({ id, title, mins, cards }),
};
