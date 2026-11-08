// Frontend build: esbuild (TypeScript/JSX bundling, code splitting, minification) + Tailwind CSS v4 compiler.
// Vite uses esbuild internally; this script keeps the toolchain to two dependencies and works fully offline.
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const out = path.join(web, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

// 1) JavaScript
const result = await esbuild.build({
  entryPoints: [path.join(web, 'src', 'main.tsx')],
  bundle: true, splitting: true, format: 'esm', minify: true, sourcemap: false,
  target: ['es2020', 'chrome87', 'safari15', 'firefox78'], jsx: 'automatic',
  outdir: path.join(out, 'assets'), entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]',
  loader: { '.json': 'json', '.svg': 'text' },
  metafile: true, logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint?.endsWith('main.tsx'))?.[0];

// 2) CSS — collect class candidates from source files and let Tailwind generate only what is used.
const require = createRequire(import.meta.url);
const twDir = path.dirname(require.resolve('tailwindcss/package.json'));
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.(tsx?|html)$/.test(e.name)) files.push(p);
});
walk(path.join(web, 'src'));
const candidates = new Set();
for (const f of files) for (const tok of fs.readFileSync(f, 'utf8').split(/[\s"'`{}<>;]+/)) if (tok && tok.length < 120) candidates.add(tok);

const cssEntry = fs.readFileSync(path.join(web, 'src', 'styles.css'), 'utf8');
const compiler = await compile(cssEntry, {
  base: web,
  loadStylesheet: async (id, base) => {
    const file = id === 'tailwindcss' ? path.join(twDir, 'index.css')
      : id.startsWith('tailwindcss/') ? path.join(twDir, id.slice('tailwindcss/'.length))
      : path.resolve(base, id);
    return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
  },
});
const css = compiler.build([...candidates]);
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true })).code;
const cssName = `styles-${crypto.createHash('sha1').update(cssMin).digest('hex').slice(0, 8)}.css`;
fs.writeFileSync(path.join(out, 'assets', cssName), cssMin);

// 3) HTML + static files
let html = fs.readFileSync(path.join(web, 'index.html'), 'utf8')
  .replace('<!--CSS-->', `<link rel="stylesheet" href="/assets/${cssName}">`)
  .replace('<!--JS-->', `<script type="module" src="/${path.relative(out, path.join(root, entry))}"></script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync(path.join(web, 'public'))) fs.copyFileSync(path.join(web, 'public', f), path.join(out, f));

const sizes = Object.entries(result.metafile.outputs).map(([f, o]) => `${path.basename(f)} ${(o.bytes / 1024).toFixed(1)}kB`);
console.log(`Built web → ${path.relative(root, out)}\n  ${sizes.join('\n  ')}\n  ${cssName} ${(cssMin.length / 1024).toFixed(1)}kB`);
if (watch) console.log('(watch mode not implemented — rerun after changes)');
