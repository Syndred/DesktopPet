import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
execFileSync(process.execPath,['scripts/battle/build-core.mjs','--check'],{stdio:'inherit'});
console.log(JSON.stringify({source:'infra/supabase/functions/_shared/battle-core.js',sha256:createHash('sha256').update(readFileSync('infra/supabase/functions/_shared/battle-core.js','utf8').replaceAll('\r\n','\n')).digest('hex'),extraEdgeRuleCopy:false}));
