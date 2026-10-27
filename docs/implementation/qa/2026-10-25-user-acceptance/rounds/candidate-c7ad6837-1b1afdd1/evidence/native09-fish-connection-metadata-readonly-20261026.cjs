const fs=require('node:fs'),path=require('node:path');const{DatabaseSync}=require('node:sqlite');
const profile='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/6ff8e38f-9f2b-4872-8747-1fb00bd81655/local-a';
const owner='qa:f3455e84-59a1-4edb-9b77-975ff32dc45c:local-02a70478-bf19-41d6-8937-ea7c261b579f';
const fish='pet-f31270e4-7ea3-42f1-a093-ac035d846de2';
const db=new DatabaseSync(path.join(profile,'lingjing.sqlite'),{readOnly:true});let data;
try{db.exec('PRAGMA query_only=ON; BEGIN');data={
 selections:db.prepare('SELECT owner_account_id,revision,selections_json FROM companion_accounts WHERE owner_account_id=?').get(owner),
 fish:db.prepare('SELECT owner_account_id,pet_id,template_id,revision FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(owner,fish),
 fishConnection:db.prepare('SELECT scope,scope_id,provider,base_url,model,context_chars,max_output_tokens,revision,CASE WHEN encrypted_key IS NOT NULL AND encrypted_key<>\'\' THEN 1 ELSE 0 END AS has_key FROM conversation_connections WHERE owner_account_id=? AND scope=\'pet\' AND scope_id=?').get(owner,fish)||null,
 fishProfile:db.prepare('SELECT pet_id,reply_style,memory_enabled,pause_while_chatting,use_override,revision FROM conversation_profiles WHERE owner_account_id=? AND pet_id=?').get(owner,fish)||null,
 messagesByPet:db.prepare('SELECT pet_id,COUNT(*) AS count FROM conversation_messages WHERE owner_account_id=? GROUP BY pet_id ORDER BY pet_id').all(owner),
 fishMessages:db.prepare('SELECT id,action_id,role,status,error_code,attempt,length(content) AS content_length,provider,model,created_at,updated_at FROM conversation_messages WHERE owner_account_id=? AND pet_id=? ORDER BY created_at,id').all(owner,fish),
 fishMemoryCount:db.prepare('SELECT COUNT(*) AS count FROM conversation_memories WHERE owner_account_id=? AND pet_id=?').get(owner,fish).count,
 fishCredentialRecordCount:db.prepare('SELECT COUNT(*) AS count FROM conversation_credentials WHERE owner_account_id=? AND scope=\'pet\' AND scope_id=?').get(owner,fish).count,
 globalConnection:db.prepare('SELECT scope,scope_id,provider,base_url,model,context_chars,max_output_tokens,revision,CASE WHEN encrypted_key IS NOT NULL AND encrypted_key<>\'\' THEN 1 ELSE 0 END AS has_key FROM conversation_connections WHERE owner_account_id=? AND scope=\'account\' AND scope_id=\'\'').get(owner)||null
};db.exec('COMMIT');}finally{db.close();}
const report={at:new Date().toISOString(),profile,owner,fish,readOnly:true,queryOnly:true,credentialValuesRead:false,method:'Necessary non-secret metadata only; ciphertext/credential vault values never selected; has_key boolean computed inside SQLite',data};
const output=path.join(__dirname,'fish-connection-metadata-'+process.argv[2]+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...report}));
