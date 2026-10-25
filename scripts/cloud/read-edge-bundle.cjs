const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Deployment transport only. Does not deploy or execute application source.
const root = fs.realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const name = process.argv[2];
if (!/^[a-z][a-z0-9-]{1,62}$/.test(name || '')) throw new Error('Provide a valid Edge Function name');
const entry = path.join(root, 'infra', 'supabase', 'functions', name, 'index.ts');
const files = new Map(), external = new Set(), warnings = new Set();
const extensions = ['.ts', '.mts', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.lock'];
const portable = file => path.relative(root, file).split(path.sep).join('/');

function withinRoot(file) {
  const real = fs.realpathSync(file);
  const relative = path.relative(root, real);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Dependency escapes repository');
  return real;
}
function resolveLocal(parent, specifier) {
  const base = path.resolve(path.dirname(parent), specifier);
  for (const file of [base, ...extensions.map(ext => base + ext), ...extensions.map(ext => path.join(base, 'index' + ext))]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return withinRoot(file);
  }
  throw new Error(`Missing relative import: ${portable(parent)} -> ${specifier}`);
}
function collect(file) {
  file = withinRoot(file);
  const relative = portable(file);
  if (files.has(relative)) return;
  if (!extensions.includes(path.extname(file))) throw new Error(`Unexpected deployment file type: ${relative}`);
  if (fs.statSync(file).size > 1024 * 1024) throw new Error(`Unexpectedly large source dependency: ${relative}`);
  const content = fs.readFileSync(file, 'utf8');
  files.set(relative, content);
  if (['.json', '.jsonc', '.lock'].includes(path.extname(file))) return;
  if (/\b(?:require|import)\s*\(\s*[^'"\s]/.test(content)) warnings.add(`Review computed module paths in ${relative}`);
  const imports = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\brequire\s*\(|\bimport\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of content.matchAll(imports)) {
    const specifier = match[1];
    if (specifier.startsWith('.')) collect(resolveLocal(file, specifier));
    else {
      if (/^(?:electron(?:\/|$)|better-sqlite3(?:\/|$)|node:sqlite$)/.test(specifier)) throw new Error(`Desktop-only dependency in Edge graph: ${relative} -> ${specifier}`);
      external.add(specifier);
      if (/^(?:node:)?fs(?:\/|$)/.test(specifier)) warnings.add(`Review filesystem use in ${relative}; source files are not a deployed user-data directory`);
    }
  }
}
collect(entry);
for (let directory = path.dirname(entry); directory.startsWith(root); directory = path.dirname(directory)) {
  for (const config of ['deno.json', 'deno.jsonc', 'deno.lock']) {
    const file = path.join(directory, config);
    if (fs.existsSync(file)) collect(file);
  }
  if (directory === root) break;
}
const uploaded = [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => ({ name, content }));
const paths = uploaded.map(file => file.name);
const tracked = new Set(execFileSync('git', ['ls-files', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/));
if (paths.some(file => !tracked.has(file))) throw new Error('Commit every reviewed dependency before preparing a deployment');
if (execFileSync('git', ['status', '--porcelain', '--', ...paths], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Deployment graph has uncommitted changes');
const digest = createHash('sha256');
for (const file of uploaded) digest.update(file.name).update('\0').update(file.content).update('\0');
const manifest = { function: name, entrypoint: portable(entry), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: digest.digest('hex'), files: uploaded.map(file => ({ name: file.name, bytes: Buffer.byteLength(file.content) })),
  external: [...external].sort(), warnings: [...warnings] };
console.log(JSON.stringify(process.argv.includes('--json') ? { manifest, files: uploaded } : manifest));
