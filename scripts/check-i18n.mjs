// Verifies every locale file has exactly the same keys as en.json, and that every static t('key') used in the
// frontend exists. Run: node scripts/check-i18n.mjs  (exit code 1 on problems)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'web/src/i18n/locales');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const load = (l) => new Map(flat(JSON.parse(fs.readFileSync(path.join(dir, `${l}.json`), 'utf8'))));
const en = load('en');
let problems = 0;

// 1) Static keys used in code
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) files.push(p);
});
walk(path.join(root, 'web/src'));
const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
}
for (const k of used) if (!en.has(k)) { console.log(`missing in en: ${k}`); problems++; }

// 2) Locale parity + placeholder parity
for (const l of ['id', 'jv', 'fa']) {
  const loc = load(l);
  for (const [k, v] of en) {
    if (!loc.has(k)) { console.log(`missing in ${l}: ${k}`); problems++; continue; }
    const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    if (ph(v) !== ph(loc.get(k))) { console.log(`placeholder mismatch in ${l}: ${k}`); problems++; }
  }
  for (const k of loc.keys()) if (!en.has(k)) { console.log(`extra key in ${l}: ${k}`); problems++; }
}
console.log(problems ? `\n${problems} problem(s)` : `i18n OK — ${en.size} keys × 4 locales, ${used.size} static keys referenced in code`);
process.exit(problems ? 1 : 0);
