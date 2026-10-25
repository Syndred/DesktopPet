import {build} from 'esbuild';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source='apps/pc-app/runtime/services/battle-runtime.cjs';
const output='infra/supabase/functions/_shared/battle-core.generated.mjs';
const sourceSha256=createHash('sha256').update(readFileSync(source)).digest('hex');
mkdirSync(dirname(output),{recursive:true});
await build({entryPoints:[resolve(source)],outfile:output,bundle:true,format:'esm',platform:'neutral',target:'es2022',legalComments:'none',
  banner:{js:`// GENERATED from ${source}; sha256=${sourceSha256}. Do not edit rules here.`}});
const outputSha256=createHash('sha256').update(readFileSync(output)).digest('hex');
writeFileSync('infra/supabase/functions/_shared/battle-core.provenance.json',JSON.stringify({source,sourceSha256,output,outputSha256,policy:'Single canonical rule source; deployment bundle only. Rebuild and run parity checks after authority changes.'},null,2)+'\n');
console.log(JSON.stringify({source,sourceSha256,output,outputSha256}));
