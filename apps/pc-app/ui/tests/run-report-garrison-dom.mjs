// Actual ReportsPanel/TerritoryPage DOM tests; controlled useGarden state and child rendering boundaries; no native/cloud/visual proof.
// Use an already-installed jsdom via JSDOM_MODULE_PATH; this runner never installs dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { MessageChannel } from 'node:worker_threads';
import { createHash } from 'node:crypto';
const root = process.cwd(), require = createRequire(path.join(root,'package.json'));
const { build } = require('esbuild');
const { JSDOM } = require(process.env.JSDOM_MODULE_PATH || 'jsdom');
const baseline = process.argv.includes('--baseline'); // Compare exact HEAD components without writing product files.
const source = 'apps/pc-app/ui/src/features/battle/ReportsPanel.tsx';
const fixture = 'apps/pc-app/ui/tests/report-garrison.regressions.jsx';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = baseline ? execFileSync('git',['show',`HEAD:${source}`]) : fs.readFileSync(source);
const report = {kind:'jsdom-source-only',nativePassed:false,baseline,source,sourceSha256:hash(sourceBytes),fixtureSha256:hash(fs.readFileSync(fixture)),startedAt:new Date().toISOString(),boundary:'Actual ReportsPanel/TerritoryPage and battle route hook; controlled useGarden state and child map/BattleArena rendering, not native/visual/cloud',baselineScope:baseline?'HEAD ReportsPanel and garden/index only; new route hook remains current':'current source'};
report.sourceHashes=Object.fromEntries(['apps/pc-app/ui/src/features/battle/ReportsPanel.tsx','apps/pc-app/ui/src/features/battle/index.tsx','apps/pc-app/ui/src/features/battle/route-id.ts','apps/pc-app/ui/src/features/garden/index.tsx',fixture].map(file=>[file,hash(fs.readFileSync(file))]));
const channels = []; let dom;
try {
  const bundle = await build({entryPoints:[fixture],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty','.png':'dataurl','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'offline-render-boundaries',setup(b){if(baseline)b.onLoad({filter:/features\/(battle\/ReportsPanel|garden\/index)\.tsx$/},args=>({contents:execFileSync('git',['show',`HEAD:${path.relative(root,args.path)}`],{encoding:'utf8'}),loader:'tsx'}));b.onLoad({filter:/features\/garden\/use-garden\.ts$/},()=>({contents:'export const useGarden=()=>window.gardenFixture;',loader:'js'}));b.onLoad({filter:/features\/garden\/TerritoryMap\.tsx$/},()=>({contents:'export const TerritoryMap=()=>null;',loader:'js'}));b.onLoad({filter:/features\/battle\/BattleArena\.tsx$/},()=>({contents:'export const BattlePortrait=()=>null;export const CombatantStatus=()=>null;export const battleActionAnimation=()=>null;',loader:'js'}));}}]});
  dom = new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://fixture.invalid'});
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  dom.window.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  dom.window.MessageChannel = class extends MessageChannel {constructor(){super();channels.push(this);}};
  dom.window.structuredClone = structuredClone;
  dom.window.fetch = () => {throw Error('Network forbidden in report/garrison regression');};
  dom.window.eval(bundle.outputFiles[0].text);
  report.results = await dom.window.runHookRegressions();
  report.passed = report.results.filter(result=>result.passed).length;
  process.exitCode = report.results.length===9 && report.passed===9 ? 0 : 1;
} catch(error) { report.error=error.stack||String(error);process.exitCode=1; }
finally {dom?.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}report.completedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));}
