import { resolve } from 'node:path';
import { selectRelease } from './release-store.mjs';
const target=process.argv.find(arg=>arg.startsWith('--target='))?.slice(9)||process.env.ROLLBACK_TARGET;
if(!target)throw new Error('Pass --target=<verified-version>');
const selected=await selectRelease({releasesDirectory:resolve(process.env.RELEASES_DIR||'releases'),stateDirectory:resolve(process.env.STATE_DIR||'release-state'),version:target,rollback:true});
console.log(JSON.stringify({...selected,next:'npm run release:launch',scope:'Verified EXE selection. User data and cloud schemas are not modified.'}));
