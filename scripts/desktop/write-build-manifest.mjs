import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root=resolve('.'), load=createRequire(import.meta.url), portable=file=>relative(root,file).replaceAll('\\','/');
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
function fingerprint(paths,canonical=false){const hash=createHash('sha256');for(const file of [...paths].sort()){let bytes=readFileSync(file);if(canonical&&/\.(?:[cm]?js|tsx?|css|html|json)$/.test(file))bytes=Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n'));hash.update(portable(file)).update('\0').update(bytes).update('\0');}return hash.digest('hex');}
const code=['apps/pc-app/runtime','apps/pc-app/ui/src','packages/shared-types/src','build'].flatMap(directory=>files(resolve(directory))).filter(file=>{
 const path=portable(file);return /\.(?:[cm]?js|tsx?|css|json|png|webp|svg|ico)$/.test(path)&&!/(?:^|\/)(tests|verification|legacy|renderer|auth)\//.test(path)&&!path.includes('/assets/models/')&&!/\.(?:test|acceptance)\./.test(path)&&!/\.electron\.mjs$/.test(path)&&!/(?:verify-|smoke\.|prepare-.*fixture|write-evidence|generate-fish)/.test(path);
});
code.push(...['package.json','package-lock.json','electron.vite.config.ts','apps/pc-app/ui/index.html','apps/pc-app/ui/desktop.html','scripts/desktop/write-build-manifest.mjs','scripts/desktop/runtime-closure.mjs','scripts/release/electron-builder.pc.json','scripts/release/electron-builder.pc.cjs','config/lingjing-cloud-public.json'].map(file=>resolve(file)));
const publicConfigFile=resolve('config/lingjing-cloud-public.json'),publicBytes=readFileSync(publicConfigFile),publicConfig=JSON.parse(publicBytes);
if(Object.keys(publicConfig).some(key=>!['schemaVersion','projectRef','url','publishableKey'].includes(key))||publicConfig.schemaVersion!==1||!/^sb_publishable_/.test(publicConfig.publishableKey)||new URL(publicConfig.url).hostname!==`${publicConfig.projectRef}.supabase.co`)throw new Error('Invalid public-only cloud configuration');
const closure=JSON.parse(readFileSync(resolve('apps/pc-app/dist/runtime-closure.json'),'utf8'));
const oldStamp=resolve('apps/pc-app/dist/.build-fingerprint');if(existsSync(oldStamp))unlinkSync(oldStamp);
const built=files(resolve('apps/pc-app/dist')).filter(file=>!file.endsWith('build-manifest.json'));
const manifest={schemaVersion:2,builtAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),sourceDirtyFiles:execFileSync('git',['status','--short'],{encoding:'utf8'}).trim().split('\n').filter(Boolean),codeFingerprint:fingerprint(code),canonicalSourceFingerprint:fingerprint(code,true),canonicalPolicy:'Repository-relative paths; CRLF normalized to LF for source text only. Packaged/compiled bytes remain exact.',compiledFingerprint:fingerprint(built),codeFiles:code.length,compiledFiles:built.length,toolchain:{node:process.versions.node,electron:load('electron/package.json').version,sqlite:load('better-sqlite3/package.json').version,vite:load('vite/package.json').version,typescript:load('typescript/package.json').version,platform:process.platform,arch:process.arch},entrypoints:{main:'main/index.cjs',app:'ui/index.html',desktop:'ui/desktop.html',preload:'preload/index.cjs'}};
manifest.publicCloud={projectRef:publicConfig.projectRef,url:publicConfig.url,sha256:createHash('sha256').update(publicBytes).digest('hex'),resourcePath:'lingjing-cloud-public.json'};
manifest.packageName=JSON.parse(readFileSync(resolve('package.json'),'utf8')).name;
manifest.runtimeClosure={manifest:'runtime-closure.json',files:closure.files.length,edges:closure.edges.length,sha256:createHash('sha256').update(readFileSync(resolve('apps/pc-app/dist/runtime-closure.json'))).digest('hex')};
writeFileSync(resolve('apps/pc-app/dist/build-manifest.json'),JSON.stringify(manifest,null,2));console.log('Build provenance: '+manifest.sourceCommit.slice(0,12)+' · '+manifest.canonicalSourceFingerprint.slice(0,12));
