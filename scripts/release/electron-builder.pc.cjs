const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const config = require('./electron-builder.pc.json');
const closure = JSON.parse(readFileSync('apps/pc-app/dist/runtime-closure.json', 'utf8'));
if (closure.schemaVersion !== 1 || !closure.files.length) throw new Error('Build the current desktop runtime closure first.');
for (const file of closure.files) {
  if (file.path.includes('..') || !/^(?:apps\/pc-app\/runtime|src)\//.test(file.path)) throw new Error(`Invalid runtime file: ${file.path}`);
  const digest = createHash('sha256').update(readFileSync(file.path)).digest('hex');
  if (digest !== file.sha256) throw new Error(`Runtime changed since build: ${file.path}`);
}
module.exports = { ...config, files: [...closure.files.map(file => file.path), ...config.files] };
