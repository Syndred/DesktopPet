import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Artifact-format unit fixtures are deliberately not executable smoke evidence.
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'lingjing-release-format-')), releases=join(root,'releases'), state=join(root,'state');
 for(const version of ['previous','candidate']){const directory=join(releases,version);mkdirSync(directory,{recursive:true});const bytes=Buffer.from('format-only-fixture:'+version);writeFileSync(join(directory,'fixture.exe'),bytes);writeFileSync(join(directory,'manifest.json'),JSON.stringify({schemaVersion:2,version,executable:{file:'fixture.exe',sha256:createHash('sha256').update(bytes).digest('hex')}}));}
 const run=(script:string,args:string[]=[])=>execFileSync(process.execPath,['scripts/release/'+script,...args],{cwd:process.cwd(),env:{...process.env,RELEASES_DIR:releases,STATE_DIR:state},encoding:'utf8'});
 return {root,releases,state,run};
}
describe('verified desktop release selection',()=>{
 it('selects an existing verified EXE and launch resolver follows that exact release',()=>{const f=fixture();f.run('rollback-release.mjs',['--target=candidate']);f.run('rollback-release.mjs',['--target=previous']);const current=JSON.parse(readFileSync(join(f.state,'current.json'),'utf8'));expect(current.version).toBe('previous');expect(current.rollback).toBe(true);const launch=JSON.parse(f.run('launch-release.mjs',['--verify-only']));expect(launch.executable).toBe(join(f.releases,'previous','fixture.exe'));expect(launch.passed).toBe(true);});
 it('refuses tampered bytes before changing the selected release',()=>{const f=fixture();f.run('rollback-release.mjs',['--target=previous']);const before=readFileSync(join(f.state,'current.json'),'utf8');writeFileSync(join(f.releases,'candidate','fixture.exe'),'tampered');expect(()=>f.run('rollback-release.mjs',['--target=candidate'])).toThrow();expect(readFileSync(join(f.state,'current.json'),'utf8')).toBe(before);});
 it('rejects traversal versions and unverified legacy manifests without producing a pointer',()=>{const f=fixture();expect(()=>f.run('rollback-release.mjs',['--target=../../other'])).toThrow();writeFileSync(join(f.releases,'candidate','manifest.json'),JSON.stringify({version:'candidate'}));expect(()=>f.run('rollback-release.mjs',['--target=candidate'])).toThrow();expect(existsSync(join(f.state,'current.json'))).toBe(false);});
});
