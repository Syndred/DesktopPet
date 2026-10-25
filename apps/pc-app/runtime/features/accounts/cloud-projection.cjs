const {checksum}=require('./util.cjs');
const secretKeys=new Set(['password','passwordhash','apikey','apikeys','encryptedkey','encryptedsecret','cloudproof','sessionproof','authproof','secret','secrets','secretkey','servicerole','servicerolekey',
 'authorization','credential','credentials','sessiontoken','accesstoken','refreshtoken','clientsecret','byok','byokkey','privatekey','providerkey']);
const normalize=key=>key.replace(/[^a-z0-9]/gi,'').toLowerCase();
const secretKey=key=>secretKeys.has(normalize(key))||/password|secret|credential|authorization|apikey|encryptedkey|privatekey|byok|servicerole/.test(normalize(key));
const opaqueKeys=new Set(['sourcejson','rawjson','rawdocument','rawsource','legacyjson','legacyarchive','sourcedocument']);
function authoredText(path){
 const allowed=(table,field)=>table==='conversation_messages'&&field==='content'||table==='conversation_memories'&&field==='content'||table==='conversation_profiles'&&['persona','reply_style'].includes(field);
 return path.length===8&&path.slice(0,5).join('|')==='data|modules|conversations|data|tables'&&/^\d+$/.test(path[6])&&allowed(path[5],path[7])
  ||path.length===6&&path[0]==='data'&&path[1]==='tables'&&path[3]==='rows'&&/^\d+$/.test(path[4])&&allowed(path[2],path[5]);
}
/** Local snapshots stay byte-for-byte intact. A cloud archive is explicitly a
 * safe projection, never an assertion that the original credential blob moved. */
function cloudProjection(envelope){
 const excluded=[];
 function scrub(value,path,depth=0){
  if(depth>80){excluded.push(path.join('.'));return null;}
  if(typeof value==='string'&&authoredText(path))return value;
  if(Array.isArray(value))return value.map((item,index)=>scrub(item,[...path,String(index)],depth+1));
  if(value&&typeof value==='object'){
   const clean=Object.create(null);for(const [key,item]of Object.entries(value)){
    const opaque=opaqueKeys.has(normalize(key))||/(sourcejson|rawjson|rawdocument|legacyarchive)$/.test(normalize(key));
    const empty=item===null||item===''||Array.isArray(item)&&item.length===0;
    if(secretKey(key)||opaque&&!empty){excluded.push([...path,key].join('.'));continue;}
    clean[key]=scrub(item,[...path,key],depth+1);
   }return clean;
  }
  if(typeof value==='string'&&/^\s*[[{"]/.test(value)){
   try{const parsed=JSON.parse(value);if(parsed!==value){const before=excluded.length,clean=scrub(parsed,[...path,'<json>'],depth+1);return excluded.length===before?value:JSON.stringify(clean);}}catch{}
  }
  return value;
 }
 const {checksum:sourceChecksum,...body}=envelope;
 const data={modules:{},tables:{}};
 for(const [name,record]of Object.entries(body.data.modules)){
  if(name==='legacy'){
   if(record.data!==null)excluded.push('data.modules.legacy');else data.modules[name]={version:record.version,data:null};continue;
  }
  data.modules[name]=scrub(record,['data','modules',name]);
 }
 for(const [name,record]of Object.entries(body.data.tables)){
  if(/(?:legacy|raw)_archive|(?:secret|credential|key_store)/i.test(name)||record.schema?.some(column=>secretKey(column.name)||opaqueKeys.has(normalize(column.name)))){
   if(record.rows?.length)excluded.push(`data.tables.${name}`);continue;
  }
  data.tables[name]=scrub(record,['data','tables',name]);
 }
 const projected={...body,data,excluded:[...new Set([...(body.excluded||[]),...excluded])]};
 const projectedEnvelope={...projected,checksum:checksum(projected)};
 return{envelope:projectedEnvelope,sourceChecksum,projectedChecksum:projectedEnvelope.checksum,excluded,originalCloudComplete:projectedEnvelope.checksum===sourceChecksum};
}
module.exports={cloudProjection};
