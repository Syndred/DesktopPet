import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertNativeChooserCapability,compareResource,inspectEmbeddedResource} from './cloud-live-qa-restore-completion-cases.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('native capability missing or local marker route fails closed',()=>{assert.throws(()=>assertNativeChooserCapability(null));assert.throws(()=>assertNativeChooserCapability({protocol:'local-qa'}));});
test('resource comparison rejects replacement owner/ID/bytes and simulated cloud receipt',()=>{
 const a={owner:'account:a',resourceId:'r',contentHash:'h',files:[{key:'a.json',sha256:'j',bytes:2},{key:'a.png',sha256:'p',bytes:3}],imports:[],actions:{sleep:'sleep_seated'},calibration:{desktop:{scale:1.06}},managedWithinProfile:true,preferenceState:{cloudRevision:1,document:{scale:1.06}}};assert.equal(compareResource(a,structuredClone(a)),true);
 for(const patch of [{owner:'account:b'},{resourceId:'different'},{managedWithinProfile:false},{files:[]},{actions:{sleep:'sleep'}}])assert.throws(()=>compareResource(a,{...a,...patch}));
 const cloud={...a,downloads:[{status:'verified',dataMode:'live',authorityRegistered:1}],receipts:[{direction:'download',dataMode:'live',authorityRevision:2,authorityChecksum:'a'.repeat(64)}]};assert.equal(compareResource(a,cloud,{cloud:true}),true);assert.throws(()=>compareResource(a,{...cloud,downloads:[{status:'verified',dataMode:'simulated',authorityRegistered:1}]},{cloud:true}));
});
test('embedded resource validates original file and aggregate digests, rejects reference-only module',()=>{
 const raw=Buffer.from('{}'),sum=createHash('sha256').update('a.json').update('\0').update(raw).digest('hex');const e={data:{modules:{'character-resources':{version:1,data:{ownerAccountId:'account:a',resources:[{row:{resource_id:'r',owner_account_id:'account:a',content_hash:sum},files:[{key:'a.json',bytes:raw.toString('base64'),sha256:hash(raw)}]}],imports:[],preferences:[]}}}}};
 assert.equal(inspectEmbeddedResource(e,'r','account:a').files[0].sha256,hash(raw));assert.throws(()=>inspectEmbeddedResource(e,'r','account:b'));e.data.modules['character-resources'].data.resources[0].files[0].bytes=Buffer.from('changed').toString('base64');assert.throws(()=>inspectEmbeddedResource(e,'r','account:a'));e.data.modules['character-resources'].version=2;assert.throws(()=>inspectEmbeddedResource(e,'r','account:a'));
});
