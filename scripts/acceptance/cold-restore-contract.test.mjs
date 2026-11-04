import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('./cloud-native-cold-restore.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/cloud-native-cold-restore.yml',import.meta.url),'utf8');
function readbackBody(source){
  const normalized=source.replace(/\r\n?/g,'\n');
  const start=normalized.indexOf('async function assertRestored');
  const end=normalized.indexOf('\ntry{\n  await step',start);
  assert.ok(start>=0&&end>start,'Readback function boundaries must exist');
  return normalized.slice(start,end);
}
test('cold restore has mandatory disposable Windows native UI and no dialog bridge',()=>{
  assert.match(script,/const nativeDialog=true/);assert.match(script,/assert.equal\(process.env.GITHUB_ACTIONS,'true'/);
  assert.match(script,/assert.equal\(process.platform,'win32'\)/);assert.doesNotMatch(script,/async function bridge|globalThis.__backupDialogPending/);
  assert.match(script,/driveNativeFileDialog/);
});
test('same absolute profile and marker bytes retained, with no owner/provenance relabeling',()=>{
  assert.match(script,/writeFileSync\(join\(profile,MARKER\),markerBytes,\{flag:'wx'\}\)/);
  assert.match(script,/seedByteIdentical:true/);assert.match(script,/crossProfile:false/);
  assert.doesNotMatch(script,/UPDATE\s+account_identities|UPDATE\s+account_qa_profile|ownerAccountId\s*=/i);
});
test('baseline has explicit logged-out/empty/session/provider boundaries and SQLite integrity check',()=>{
  for(const token of ['assertStoppedDatabase','inspectStoppedSeed','quick_check','loginSessions:0','cloudLinks:0','conversationCredentials:0','vaultExists:false','assertEmptyBusiness'])assert.ok(script.includes(token),token);
  assert.match(script,/for\(const suffix of \['-wal','-shm'\]\)/);
});
test('source preserved separately and read back from preserved directory, with original byte hashes',()=>{
  assert.match(script,/renameSync\(profile,preserved\)/);assert.match(script,/assert.equal\(existsSync\(preserved\),false\)/);
  assert.match(script,/preservedProof.resources/);assert.match(script,/preservedSourceUnchangedAfterRestore=true/);
});
test('readback does not create additional pet selection actions',()=>{
  const readback=readbackBody(script);
  assert.doesNotMatch(readback,/\.click\(/);assert.match(readback,/aria-pressed/);
});
test('readback scope is identical for LF and Windows CRLF and rejects absent boundaries',()=>{
  const lf=script.replace(/\r\n?/g,'\n');
  assert.equal(readbackBody(lf),readbackBody(lf.replace(/\n/g,'\r\n')));
  assert.throws(()=>readbackBody('async function assertRestored(){}'),/boundaries must exist/);
});
test('old path absence and byte checks apply to imported resource only',()=>{
  assert.match(script,/sourceState.lingjing_resource_files.filter\(row=>row.resource_id===resourceId\)\)assert.equal\(existsSync/);
  assert.match(script,/resourceBytes\[row.asset_key\]/);
});
test('completion explicitly remains partial with owned process cleanup',()=>{
  for(const token of ['full98Passed:false','liveCloudExercised:false','additionalFullCasesPassed=0','full P05/R05/C12','proof.ownedProcessStopped','seedBytes=null'])assert.ok(script.includes(token),token);
});
test('workflow reuses exact audited immutable product and contains no account secret or deployment',()=>{
  assert.match(workflow,/PACKAGE_SOURCE: 735c48476d3c0efc2aab62cecc765c9ce1933adb/);
  assert.match(workflow,/run-id: 41005729685/);assert.match(workflow,/verify-portable-reuse.mjs/);
  assert.doesNotMatch(workflow,/secrets\.|environment:|supabase|deploy|package:pc:win/i);
  assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/contents: read/);
});
test('artifact scope never uploads SQLite, archives or fixture profiles',()=>{
  const artifacts=workflow.slice(workflow.indexOf('          path: |'));
  assert.doesNotMatch(artifacts,/sqlite|lingjing\.json|profile|\.bin/);
  assert.match(artifacts,/native-cold-restore\/run-\*\/evidence.json/);
});
