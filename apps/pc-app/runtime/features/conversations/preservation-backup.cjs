/* eslint-disable @typescript-eslint/no-require-imports -- Local archive adapter. */
const { checksum, transaction } = require('../accounts/util.cjs');
const { validateRecord } = require('./cloud-record-contract.mjs');
const { createConversationBackupAdapter } = require('./backup.cjs');
const fail = () => { throw Object.assign(new Error('保全记录的归属或内容无效，原备份已保留。'), { code:'CONVERSATION_PRESERVATION_INVALID' }); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 2048 && !value.includes('\0');
const keys = (value, names) => object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|');

/** Original content travels in a separate local backup module. Restoring it
 * only restores reviewable archives, never cloud caches, cursors or requests. */
function createConversationPreservationBackupAdapter(services) {
  const db=services.db, canonical=createConversationBackupAdapter(services);
  function validateArchive(document, owner) {
    if(!object(document))fail();
    if(Object.hasOwn(document,'tables')){if(!keys(document,['ownerAccountId','schema','tables']))fail();canonical.validate(document,owner);return;}
    for(const [key,record]of Object.entries(document)) {
      if(!keys(record,['collection','id','document']) || key!==JSON.stringify([record.collection,record.id]))fail();
      validateRecord(owner,record.collection,record.id,record.document);
    }
  }
  function validate(data,owner) {
    if(!keys(data,['ownerAccountId','archives','conflicts']) || data.ownerAccountId!==owner ||
      !Array.isArray(data.archives) || !Array.isArray(data.conflicts) || data.archives.length>50000 || data.conflicts.length>250000)fail();
    const archives=new Set(),conflicts=new Set();
    for(const row of data.archives) {
      if(!keys(row,['checksum','document','createdAt']) || !integer(row.createdAt) || row.checksum!==checksum(row.document) || archives.has(row.checksum))fail();
      validateArchive(row.document,owner);archives.add(row.checksum);
    }
    for(const row of data.conflicts) {
      if(!keys(row,['collection','id','local','cloud','reason','createdAt','resolvedAt','resolution']) || !text(row.id) || !text(row.reason) ||
        !integer(row.createdAt) || row.resolvedAt!==null&&!integer(row.resolvedAt) || ![null,'local','cloud'].includes(row.resolution) ||
        (row.resolvedAt===null)!==(row.resolution===null))fail();
      // A null local document is an original deletion intent. All non-null
      // documents use the same strict public-field contract as the record API.
      for(const document of [row.local,row.cloud])if(document!==null)validateRecord(owner,row.collection,row.id,document);
      if(row.local===null&&row.cloud===null) {
        let id;try{id=JSON.parse(row.id);}catch{fail();}
        if(!Array.isArray(id)||!['conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences'].includes(row.collection))fail();
      }
      const key=JSON.stringify([row.collection,row.id,row.reason]);if(conflicts.has(key))fail();conflicts.add(key);
    }
  }
  const empty=owner=>({ownerAccountId:owner,archives:[],conflicts:[]});
  return {id:'conversation-preservation',version:1,tables:['conversation_cloud_archives','conversation_cloud_conflicts'],
    export(owner) {
      const data={ownerAccountId:owner,
        archives:db.prepare('SELECT checksum,document_json,created_at FROM conversation_cloud_archives WHERE owner_account_id=? ORDER BY created_at,checksum').all(owner)
          .map(row=>({checksum:row.checksum,document:JSON.parse(row.document_json),createdAt:row.created_at})),
        conflicts:db.prepare('SELECT * FROM conversation_cloud_conflicts WHERE owner_account_id=? ORDER BY created_at,collection,record_id,reason').all(owner)
          .map(row=>({collection:row.collection,id:row.record_id,local:JSON.parse(row.local_document),cloud:row.cloud_document===null?null:JSON.parse(row.cloud_document),reason:row.reason,createdAt:row.created_at,resolvedAt:row.resolved_at,resolution:row.resolution}))};
      validate(data,owner);return data;
    },validate,
    restore(owner,data) {
      validate(data,owner);transaction(db,()=>{
        for(const row of data.archives)db.prepare('INSERT OR IGNORE INTO conversation_cloud_archives VALUES(?,?,?,?)').run(owner,row.checksum,JSON.stringify(row.document),row.createdAt);
        for(const row of data.conflicts) {
          const prior=db.prepare('SELECT local_document FROM conversation_cloud_conflicts WHERE owner_account_id=? AND collection=? AND record_id=? AND reason=?').get(owner,row.collection,row.id,row.reason);
          if(prior&&checksum(JSON.parse(prior.local_document))!==checksum(row.local))fail();
          db.prepare('INSERT OR IGNORE INTO conversation_cloud_conflicts VALUES(?,?,?,?,?,?,?,?,?)')
            .run(owner,row.collection,row.id,JSON.stringify(row.local),row.cloud===null?null:JSON.stringify(row.cloud),row.reason,row.createdAt,row.resolvedAt,row.resolution);
        }
      });
    },
    // Whole-save compatibility paths must not upload preserved originals.
    cloudModule:owner=>({version:1,data:empty(owner)})
  };
}
module.exports={createConversationPreservationBackupAdapter};
