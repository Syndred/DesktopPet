const {checksum}=require('./util.cjs');
const secretKeys=new Set(['password','passwordhash','apikey','apikeys','encryptedkey','encryptedsecret','proof','proofhash','secret','secrets','secretkey','servicerole','servicerolekey',
 'authorization','credential','credentials','sessiontoken','accesstoken','refreshtoken','clientsecret','byok','byokkey','privatekey','providerkey']);
const normalize=key=>key.replace(/[^a-z0-9]/gi,'').toLowerCase();
const secretKey=key=>secretKeys.has(normalize(key))||/password|secret|credential|authorization|apikey|encryptedkey|privatekey|byok|servicerole/.test(normalize(key));
const opaqueKeys=new Set(['sourcejson','rawjson','rawdocument','rawsource','legacyjson','legacyarchive','sourcedocument']);
/** Local snapshots stay byte-for-byte intact. A cloud archive is explicitly a
 * safe projection, never an assertion that the original credential blob moved. */
function cloudProjection(envelope){
 const excluded=[];
 function scrub(value,path,depth=0){
  if(depth>80){excluded.push(path);return null;}
  if(Array.isArray(value))return value.map((item,index)=>scrub(item,`${path}[${index}]`,depth+1));
  if(value&&typeof value==='object'){
   const clean=Object.create(null);for(const [key,item]of Object.entries(value)){
    if(secretKey(key)||opaqueKeys.has(normalize(key))){excluded.push(`${path}.${key}`);continue;}
    clean[key]=scrub(item,`${path}.${key}`,depth+1);
   }return clean;
  }
  if(typeof value==='string'&&/^\s*[[{"]/.test(value)){
   try{const parsed=JSON.parse(value);if(parsed!==value){const before=excluded.length,clean=scrub(parsed,`${path}:json`,depth+1);return excluded.length===before?value:JSON.stringify(clean);}}catch{}
  }
  return value;
 }
 const {checksum:sourceChecksum,...body}=envelope;
 const data={modules:{},tables:{}};
 for(const [name,record]of Object.entries(body.data.modules)){
  if(name==='legacy'){if(record.data!==null)excluded.push('data.modules.legacy');continue;}
  data.modules[name]=scrub(record,`data.modules.${name}`);
 }
 for(const [name,record]of Object.entries(body.data.tables)){
  if(/(?:legacy|raw)_archive|(?:secret|credential|key_store)/i.test(name)||record.schema?.some(column=>secretKey(column.name)||opaqueKeys.has(normalize(column.name)))){
   if(record.rows?.length)excluded.push(`data.tables.${name}`);continue;
  }
  data.tables[name]=scrub(record,`data.tables.${name}`);
 }
 const projected={...body,data,excluded:[...new Set([...(body.excluded||[]),...excluded])]};
 const projectedEnvelope={...projected,checksum:checksum(projected)};
 return{envelope:projectedEnvelope,sourceChecksum,projectedChecksum:projectedEnvelope.checksum,excluded,originalCloudComplete:excluded.length===0};
}
module.exports={cloudProjection};
