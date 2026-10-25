import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Copy a closed QA profile whose food came from the normal production growth
// proof. This is a local UI fixture, never a cloud/two-device acceptance claim.
const source=resolve('artifacts/garden/integrated-electron');
const output=resolve('artifacts/garden/roster-electron');
if(existsSync(output))throw new Error('Refuse to overwrite an existing QA profile');
const run=JSON.parse(readFileSync(resolve(source,'run.json'),'utf8'));
if(!run.rewardCycle||!run.readback)throw new Error('Complete the real growth/restart proof first');
mkdirSync(output,{recursive:true});
cpSync(resolve(source,'profile'),resolve(output,'profile'),{recursive:true});
run.phases=[];run.rosterFixture={source:'completed production-duration garden QA profile',cloudAcceptance:false};
writeFileSync(resolve(output,'run.json'),JSON.stringify(run,null,2));
console.log(JSON.stringify({output,cloudAcceptance:false}));
