import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const runtimePath = 'apps/pc-app/runtime';
const portable = path => path.replaceAll('\\', '/');
const forbidden = path => /(?:^|\/)(?:tests|verification|legacy|node_modules)\//.test(path)
  || /(?:\.test\.[cm]?js|\.electron\.mjs|testing-adapter\.cjs|generate-fish\.cjs)$/.test(path)
  || /\/discovery\/server-authority\.cjs$/.test(path);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function runtimeClosure(root = resolve('.')) {
  const pathFor = file => portable(relative(root, file));
  const roots = readdirSync(join(root, runtimePath, 'core')).filter(name => name.endsWith('.cjs')).map(name => `${runtimePath}/core/${name}`);
  for (const feature of readdirSync(join(root, runtimePath, 'features'))) {
    const entry = `${runtimePath}/features/${feature}/index.cjs`; if (existsSync(join(root, entry))) roots.push(entry);
  }
  // Native helpers are loaded as data by execFile, not by JavaScript import.
  const supportFiles = ['features/accounts/foreground-fullscreen.ps1', 'features/discovery/windows-location.ps1'].map(path => `${runtimePath}/${path}`);
  const queue = [...roots, ...supportFiles], files = new Map(), edges = [], external = new Set(), computed = [];
  while (queue.length) {
    const path = queue.shift(); if (files.has(path)) continue;
    if (path.startsWith('../') || isAbsolute(path) || forbidden(path)) throw new Error(`Unsupported desktop dependency: ${path}`);
    const absolute = join(root, path), bytes = readFileSync(absolute); files.set(path, { path, sha256: sha(bytes), bytes: bytes.length });
    if (!/\.[cm]?js$/.test(path)) continue;
    const ast = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const add = specifier => {
      if (!specifier.startsWith('.')) { external.add(specifier); return; }
      const target = pathFor(createRequire(absolute).resolve(specifier));
      edges.push({ from: path, specifier, to: target }); queue.push(target);
    };
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) add(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        if (node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) add(node.arguments[0].text);
        else computed.push({ from: path, expression: node.getText(ast) });
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  // This is the sole computed loader: its seven discovered feature entries are roots above.
  for (const item of computed) if (!(item.from === `${runtimePath}/core/services.cjs` && item.expression === 'require(path)')) throw new Error(`Unreviewed computed desktop import: ${item.from}: ${item.expression}`);
  return { schemaVersion: 1, policy: 'Formal core and registered feature roots; static relative require/import closure plus explicit native support files. No extension-only packaging assumptions.', roots, supportFiles,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), edges: edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`)), external: [...external].sort(), computed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const closure = runtimeClosure(); writeFileSync('apps/pc-app/dist/runtime-closure.json', JSON.stringify(closure, null, 2) + '\n');
  console.log(`Runtime closure: ${closure.files.length} files, ${closure.edges.length} edges, ${closure.files.filter(file => /\.(?:mjs|js)$/.test(file.path)).length} JS/MJS dependencies`);
}
