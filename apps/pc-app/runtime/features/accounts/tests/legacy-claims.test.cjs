const {test}=require('node:test');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const {prepareClaims,protectClaims}=require('../../../../../../scripts/migration/prepare-lingjing-legacy-claims.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const row={id:'original-old-owner',account:'alice',account_key:'alice',username:'原昵称',password_hash:hash('SYNTHETIC_NOT_REAL_PASSWORD'),created_at:'2020-01-02T03:04:05Z'};
function source(rows=[row],overrides={}){const bytes=Buffer.from(JSON.stringify(rows));const manifest=Buffer.from(JSON.stringify({format:'lingjing-server-export',version:1,environment:'production',
 source:{origin:'http://47.112.208.97:8000',collection:'public.runtime_accounts',instanceId:'SYNTHETIC_UNIT_FIXTURE_ONLY'},provenance:{kind:'operator-server-export',mode:'live'},
 file:{sha256:hash(bytes),byteLength:bytes.length,rowCount:rows.length},...overrides}));return{bytes,manifest};}
test('LOCAL synthetic preparation only: original owner/hash/date preserved and never marked actual migration',()=>{
 const s=source(),bundle=prepareClaims(s.bytes,s.manifest);assert.equal(bundle.claims[0].owner_id,row.id);assert.equal(bundle.claims[0].password_hash,row.password_hash);
 assert.equal(bundle.claims[0].created_at,row.created_at);assert.equal(bundle.requiresIndependentCoordinatorSourceAttestation,true);assert.equal(bundle.cloudMigrationCompleted,false);
});
test('LOCAL synthetic preparation only: reject damaged, QA, empty, comparison-project and ambiguous sources',()=>{
 const s=source();assert.throws(()=>prepareClaims(Buffer.from('[]'),s.manifest),{code:'LEGACY_EXPORT_INTEGRITY_MISMATCH'});
 for(const sample of [source([{...row,id:'qa:run:owner'}]),source([],{}),source([row],{environment:'qa'}),source([row],{source:{origin:'https://jbvrdmrkwpznbrvteive.supabase.co',collection:'public.runtime_accounts'}}),source([row,row])])assert.throws(()=>prepareClaims(sample.bytes,sample.manifest));
});
test('LOCAL synthetic preparation only: Windows DPAPI encrypted result does not contain fixture hash or owner plaintext',{skip:process.platform!=='win32'},()=>{
 const s=source(),bundle=prepareClaims(s.bytes,s.manifest),encrypted=protectClaims(bundle);assert.ok(encrypted.length>0);assert.equal(encrypted.includes(Buffer.from(row.password_hash)),false);assert.equal(encrypted.includes(Buffer.from(row.id)),false);
});
