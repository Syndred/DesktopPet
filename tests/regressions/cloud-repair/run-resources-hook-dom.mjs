// Engineering DOM test only: existing actual resource hook, synthetic IPC, no native shell/cloud.
// Install jsdom separately and set JSDOM_MODULE_PATH to its resolved module directory.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { MessageChannel } from 'node:worker_threads';
import { createHash } from 'node:crypto';
const root = process.cwd(), require = createRequire(path.join(root,'package.json'));
const { build } = require('esbuild');
const { JSDOM } = require(process.env.JSDOM_MODULE_PATH || 'jsdom');
const baseline = false; // Existing inherited regression suite, current source only.
const source = 'apps/pc-app/ui/src/features/resources/useResources.ts';
const fixture = 'apps/pc-app/ui/tests/resources-hook.regressions.jsx';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = baseline ? execFileSync('git',['show',`HEAD:${source}`]) : fs.readFileSync(source);
const report = {kind:'jsdom-source-only',nativePassed:false,baseline,source,sourceSha256:hash(sourceBytes),fixtureSha256:hash(fs.readFileSync(fixture)),startedAt:new Date().toISOString()};
const channels = []; let dom;
try {
  const bundle = await build({entryPoints:[fixture],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},plugins:baseline?[{name:'baseline-settings',setup(builder){builder.onLoad({filter:/features\/conversations\/settings-page\.tsx$/},()=>({contents:sourceBytes.toString(),loader:'tsx'}));}}]:[]});
  dom = new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://fixture.invalid'});
  dom.window.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  dom.window.MessageChannel = class extends MessageChannel {constructor(){super();channels.push(this);}};
  dom.window.structuredClone = structuredClone;
  dom.window.fetch = () => {throw Error('Network forbidden in conversation settings regression');};
  dom.window.eval(bundle.outputFiles[0].text);
  report.results = await dom.window.runHookRegressions();
  report.passed = report.results.filter(result=>result.passed).length;
  process.exitCode = report.results.length===22 && report.passed===22 ? 0 : 1;
} catch(error) { report.error=error.stack||String(error);process.exitCode=1; }
finally {dom?.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}report.completedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));}
