// Real temporary directories only. Never invokes the live driver or lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync,symlinkSync,existsSync} from 'node:fs';
import {join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {allocateFixedCompletionDirectory} from './cloud-live-qa-completion-driver.mjs';

function fixture(t){
 const temporary=realpathSync.native(mkdtempSync(join(tmpdir(),'completion-output-test-')));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
 const repositoryRoot=join(temporary,'repository'),ciRunId='123456789',artifacts=join(repositoryRoot,'artifacts'),qa=join(artifacts,'qa'),runRoot=join(qa,'same-run-'+ciRunId),output=join(runRoot,'completion');
 mkdirSync(runRoot,{recursive:true});writeFileSync(join(runRoot,'original-lifecycle.json'),'synthetic original lifecycle');
 return {temporary,repositoryRoot,ciRunId,artifacts,qa,runRoot,output,base:join(output,'fixed-completion'),allocate:(overrides={})=>allocateFixedCompletionDirectory({repositoryRoot,output,ciRunId,...overrides})};
}
function unchanged(f){assert.equal(readFileSync(join(f.runRoot,'original-lifecycle.json'),'utf8'),'synthetic original lifecycle');assert.equal(existsSync(f.output),false);}
const linkDirectory=(target,path)=>symlinkSync(target,path,process.platform==='win32'?'junction':'dir');

test('fresh fixed completion creates exactly the missing parent and child beneath the existing run',t=>{
 const f=fixture(t);assert.equal(f.allocate(),f.base);
 for(const path of [f.output,f.base]){assert.equal(lstatSync(path).isDirectory(),true);assert.equal(lstatSync(path).isSymbolicLink(),false);assert.equal(realpathSync.native(path),path);}
 assert.deepEqual(readdirSync(f.runRoot).sort(),['completion','original-lifecycle.json']);assert.deepEqual(readdirSync(f.output),['fixed-completion']);assert.deepEqual(readdirSync(f.base),[]);
 assert.equal(readFileSync(join(f.runRoot,'original-lifecycle.json'),'utf8'),'synthetic original lifecycle');
});
test('rerun cannot reuse, erase or replace original completion evidence',t=>{
 const f=fixture(t);f.allocate();const evidence=join(f.base,'original-intent.json');writeFileSync(evidence,'synthetic original intent');
 assert.throws(()=>f.allocate(),/Do not rerun/);assert.equal(readFileSync(evidence,'utf8'),'synthetic original intent');
});
for(const kind of ['empty completion','completion file','existing base','base file'])test('refuses '+kind+' without overwriting it',t=>{
 const f=fixture(t);if(kind==='completion file')writeFileSync(f.output,'preserve completion file');else mkdirSync(f.output);
 if(kind==='existing base')mkdirSync(f.base);if(kind==='base file')writeFileSync(f.base,'preserve base file');
 assert.throws(()=>f.allocate(),/Do not rerun/);
 if(kind==='completion file')assert.equal(readFileSync(f.output,'utf8'),'preserve completion file');
 if(kind==='base file')assert.equal(readFileSync(f.base,'utf8'),'preserve base file');
});
for(const position of ['repositoryRoot','artifacts','qa','runRoot','output'])test('refuses a directory link at '+position,t=>{
 const f=fixture(t),target=join(f.temporary,'link-target');mkdirSync(target);writeFileSync(join(target,'sentinel'),'preserved');
 if(position!=='output')rmSync(f[position],{recursive:true});linkDirectory(target,f[position]);
 assert.throws(()=>f.allocate());assert.equal(lstatSync(f[position]).isSymbolicLink(),true);assert.deepEqual(readdirSync(target),['sentinel']);
});
test('refuses a dangling completion link instead of treating it as missing',t=>{
 const f=fixture(t),target=join(f.temporary,'missing-target');linkDirectory(target,f.output);
 assert.throws(()=>f.allocate(),/Do not rerun/);assert.equal(lstatSync(f.output).isSymbolicLink(),true);assert.equal(existsSync(target),false);
});
test('refuses an existing base link without following it',t=>{
 const f=fixture(t),target=join(f.temporary,'base-target');mkdirSync(target);mkdirSync(f.output);linkDirectory(target,f.base);
 assert.throws(()=>f.allocate(),/Do not rerun/);assert.equal(lstatSync(f.base).isSymbolicLink(),true);assert.deepEqual(readdirSync(target),[]);
});
test('refuses a repository path with a linked ancestor even if its final component is a directory',t=>{
 const f=fixture(t),alias=join(f.temporary,'alias');linkDirectory(f.temporary,alias);const repositoryRoot=join(alias,'repository'),output=join(repositoryRoot,'artifacts','qa','same-run-'+f.ciRunId,'completion');
 assert.throws(()=>f.allocate({repositoryRoot,output}),/Canonical completion path required/);unchanged(f);
});
for(const position of ['artifacts','qa','runRoot'])test('does not create missing '+position+' ancestors',t=>{
 const f=fixture(t);rmSync(f[position],{recursive:true});assert.throws(()=>f.allocate(),{code:'ENOENT'});assert.equal(existsSync(f[position]),false);
});
for(const position of ['artifacts','qa','runRoot'])test('refuses a file in place of '+position,t=>{
 const f=fixture(t);rmSync(f[position],{recursive:true});writeFileSync(f[position],'preserve ancestor file');assert.throws(()=>f.allocate(),/existing directory/);assert.equal(readFileSync(f[position],'utf8'),'preserve ancestor file');
});
test('refuses output from another CI run even when that run directory exists',t=>{
 const f=fixture(t),otherRun=join(f.qa,'same-run-987654321');mkdirSync(otherRun);
 assert.throws(()=>f.allocate({output:join(otherRun,'completion')}),/current fixed CI run path/);assert.deepEqual(readdirSync(otherRun),[]);unchanged(f);
 assert.throws(()=>f.allocate({ciRunId:'987654321'}),/current fixed CI run path/);unchanged(f);
});
test('refuses alternate, relative and noncanonical output paths',t=>{
 const f=fixture(t);for(const output of [f.runRoot,join(f.runRoot,'alternate'),join(f.base,'nested'),f.output+sep,f.runRoot+sep+'.'+sep+'completion',join('artifacts','qa','same-run-'+f.ciRunId,'completion')]){
  assert.throws(()=>f.allocate({output}),/current fixed CI run path/);unchanged(f);
 }
});
test('refuses noncanonical repository roots without creating directories',t=>{
 const f=fixture(t);for(const repositoryRoot of [f.repositoryRoot+sep,f.repositoryRoot+sep+'.','relative-repository']){
  assert.throws(()=>f.allocate({repositoryRoot}),/Canonical repository root required/);unchanged(f);
 }
});
test('requires an explicit numeric current CI run, never an arbitrary path or plan UUID',t=>{
 const f=fixture(t);for(const ciRunId of [undefined,null,123456789,'','../other','123/other','-1','1.5','aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']){
  assert.throws(()=>f.allocate({ciRunId}));unchanged(f);
 }
});
test('accepts only path strings, without caller filesystem or callback capabilities',t=>{
 const f=fixture(t);for(const key of ['repositoryRoot','output'])for(const value of [undefined,null,{},()=>{throw Error('must never execute');}]){assert.throws(()=>f.allocate({[key]:value}));unchanged(f);}
});
