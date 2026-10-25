import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { authenticode } from './authenticode.mjs';
const file = process.argv.find(arg => arg.startsWith('--executable='))?.slice(13);
assert.ok(file, 'Pass --executable=<portable.exe>');
const signature = authenticode(resolve(file));
if (process.argv.includes('--require-signed')) assert.equal(signature.signed, true, `Valid Authenticode signature required: ${signature.status}`);
else assert.ok(['Valid', 'NotSigned'].includes(signature.status), `Authenticode verification failed: ${signature.status}`);
console.log(JSON.stringify(signature));
