// Engineering DOM test only: actual QA-021 guidance and account UI, synthetic IPC, no native shell/cloud.
// Install jsdom separately and set JSDOM_MODULE_PATH to its resolved module directory.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { MessageChannel } from 'node:worker_threads';
import { createHash } from 'node:crypto';
const root = process.cwd(), require = createRequire(path.join(root,'package.json'));
const { build } = require('esbuild');
const { JSDOM } = require(process.env.JSDOM_MODULE_PATH || 'jsdom');
const source = 'apps/pc-app/ui/src/features/accounts/account.tsx';
const fixture = 'tests/regressions/cloud-repair/qa021-guidance.regressions.jsx';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(source);
const relatedSources = ['apps/pc-app/ui/src/features/companions/components.tsx','apps/pc-app/ui/src/features/accounts/preserved-records.tsx'];
const report = {frozenIssueStatus:'fix_prepared_awaiting_integration; nativeFixVerified=false retained',relatedSourceHashes:Object.fromEntries(relatedSources.map(file=>[file,hash(fs.readFileSync(file))])),kind:'jsdom-source-only',nativePassed:false,source,sourceSha256:hash(sourceBytes),fixtureSha256:hash(fs.readFileSync(fixture)),startedAt:new Date().toISOString()};
const channels = []; let dom;
try {
  const bundle = await build({entryPoints:[fixture],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}});
  dom = new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://fixture.invalid'});
  dom.window.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
  dom.window.MessageChannel = class extends MessageChannel {constructor(){super();channels.push(this);}};
  dom.window.structuredClone = structuredClone;
  dom.window.fetch = () => {throw Error('Network forbidden in account UI regression');};
  dom.window.eval(bundle.outputFiles[0].text);
  report.results = await dom.window.runHookRegressions();
  report.passed = report.results.filter(result=>result.passed).length;
  process.exitCode = report.results.length===4 && report.passed===4 ? 0 : 1;
} catch(error) { report.error=error.stack||String(error);process.exitCode=1; }
finally {dom?.window.close();for(const channel of channels){channel.port1.close();channel.port2.close();}report.completedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));}
