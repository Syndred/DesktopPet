import { listBuiltinTemplates,createCompanionInstance,companionName,canonicalBuiltinId } from './instance.mjs';
import { applyGrowthEffect } from './growth.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys={companion_accounts:['owner_account_id'],companion_pets:['owner_account_id','pet_id'],companion_actions:['owner_account_id','action_id'],companion_legacy_archive:['owner_account_id','legacy_pet_id'],companion_interactions:['owner_account_id','pet_id'],companion_capture_receipts:['owner_account_id','battle_id','wild_pet_id']};
export const COMPANION_TABLES=Object.keys(keys);
export function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';}
export async function digest(value){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const parse=value=>{try{return JSON.parse(value);}catch{fail('INVALID_CLOUD_SAVE','伙伴存档损坏');}};
export function normalizeCompanionRows(data){for(const[name,fields]of Object.entries(keys))data.tables[name].sort((a,b)=>{const left=JSON.stringify(fields.map(key=>a[key])),right=JSON.stringify(fields.map(key=>b[key]));return left<right?-1:left>right?1:0;});return data;}
export function companionUnit(envelope,owner,now){
  if(envelope&&envelope.ownerAccountId!==owner)fail('OWNER_MISMATCH','存档属于其他账号');
  const existing=envelope?.data?.modules?.companions;let data;
  if(existing!==undefined){
    if(existing?.version!==1||existing.data?.ownerAccountId!==owner||!object(existing.data.tables)||!Array.isArray(existing.data.identityImports))fail('INVALID_CLOUD_SAVE','伙伴模块版本或归属不匹配');
    if(COMPANION_TABLES.some(name=>Object.hasOwn(envelope.data.tables||{},name)))fail('INVALID_CLOUD_SAVE','伙伴存档包含两份状态');
    data=structuredClone(existing.data);
  }else{
    const found=COMPANION_TABLES.filter(name=>Object.hasOwn(envelope?.data?.tables||{},name));
    if(found.length&&found.length!==COMPANION_TABLES.length)fail('INVALID_CLOUD_SAVE','旧伙伴存档不完整');
    data={ownerAccountId:owner,tables:Object.fromEntries(COMPANION_TABLES.map(name=>[name,found.length?structuredClone(envelope.data.tables[name].rows):[]])),identityImports:[]};
    if(!found.length)data.tables.companion_accounts.push({owner_account_id:owner,revision:0,selections_json:JSON.stringify({chatPetId:null,battlePetId:null,guardPetId:null}),legacy_imported_at:new Date(now).toISOString()});
  }
  if(Object.keys(data.tables).sort().join()!==[...COMPANION_TABLES].sort().join())fail('INVALID_CLOUD_SAVE','伙伴存档不完整');
  for(const name of COMPANION_TABLES){const seen=new Set();if(!Array.isArray(data.tables[name])||data.tables[name].some(row=>!object(row)||row.owner_account_id!==owner))fail('OWNER_MISMATCH','伙伴记录归属不匹配');for(const row of data.tables[name]){const id=JSON.stringify(keys[name].map(key=>row[key]));if(seen.has(id))fail('INVALID_CLOUD_SAVE','伙伴记录重复');seen.add(id);}}
  if(data.tables.companion_accounts.length!==1||!Number.isSafeInteger(data.tables.companion_accounts[0].revision)||data.tables.companion_accounts[0].revision<0)fail('INVALID_CLOUD_SAVE','伙伴账号版本无效');
  for(const row of data.tables.companion_pets){const pet=parse(row.data_json);if(pet.ownerAccountId!==owner||pet.petId!==row.pet_id||pet.templateId!==row.template_id||pet.revision!==row.revision||pet.createdAt!==row.created_at||pet.updatedAt!==row.updated_at)fail('INVALID_CLOUD_SAVE','伙伴实例归属或修订不一致');}
  return normalizeCompanionRows(data);
}
const fields={adopt:['actionId','templateId','name','showOnDesktop'],rename:['actionId','petId','expectedRevision','name'],desktop:['actionId','petId','expectedRevision','visible','behavior','scale','position'],select:['actionId','petId','expectedRevision','slot'],appearance:['actionId','petId','expectedRevision','resourceId'],interact:['actionId','petId','expectedRevision'],'recall-all':['actionId']};
export function validateCommand(command,input){
  if(!Object.hasOwn(fields,command)||!object(input)||Object.keys(input).some(key=>!fields[command].includes(key))||typeof input.actionId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,95}$/.test(input.actionId))fail('INVALID_INPUT','伙伴操作或操作编号无效');
  if(new TextEncoder().encode(JSON.stringify(input)).length>60*1024)fail('INVALID_INPUT','伙伴操作内容超出限制');
}
/** Only specific personal/adoption commands; no caller-supplied growth, rewards,
 * petId for adoption, raw unit, owner, schema, or inventory can be submitted.
 * @param {{uuid?:()=>string,authorizedResource?:{resourceId:string,ownerAccountId:string,kind:string}}} options
 */
export async function applyCompanionCommand(source,owner,command,input,now,options={}){
  const {uuid=()=>crypto.randomUUID(),authorizedResource}=options;
  validateCommand(command,input);if(!Number.isSafeInteger(now)||now<0||!Number.isFinite(new Date(now).getTime()))fail('INVALID_INPUT','服务端时钟无效');
  const data=companionUnit(source,owner,now),tables=data.tables,account=tables.companion_accounts[0],hash=await digest(input);
  const old=tables.companion_actions.find(row=>row.action_id===input.actionId);
  if(old){if(old.operation!==command||old.request_hash!==hash)fail('ACTION_ID_CONFLICT','操作编号已用于另一请求');return{module:{version:1,data},result:{...parse(old.result_json),duplicate:true},changed:false,requestHash:hash};}
  const selections=parse(account.selections_json),petRows=tables.companion_pets;
  if(!object(selections)||Object.keys(selections).sort().join()!==['chatPetId','battlePetId','guardPetId'].sort().join()||Object.values(selections).some(id=>id!==null&&!petRows.some(row=>row.pet_id===id)))fail('INVALID_CLOUD_SAVE','伙伴独立选择无效');
  let resultData;const timestamp=new Date(now).toISOString();
  const find=()=>{const row=petRows.find(row=>row.pet_id===input.petId);if(!row)fail('PET_NOT_FOUND','找不到这只伙伴');const pet=parse(row.data_json);if(pet.resource?.kind!=='2d')fail('RESOURCE_UNAVAILABLE','旧伙伴原档保留，当前操作使用 2D 伙伴');if(input.expectedRevision!==undefined&&input.expectedRevision!==row.revision)fail('REVISION_CONFLICT','伙伴状态已更新，请刷新');return{row,pet};};
  const store=(row,pet)=>{pet.revision++;pet.updatedAt=timestamp;if(!Number.isSafeInteger(pet.revision))fail('INVALID_CLOUD_SAVE','伙伴修订无效');Object.assign(row,{revision:pet.revision,data_json:JSON.stringify(pet),updated_at:timestamp});};
  const limitValue=source?.data?.modules?.settings?.data?.desktop?.companionLimit,limit=Number.isInteger(limitValue)&&limitValue>=1&&limitValue<=4?limitValue:3;
  if(command==='adopt'){
    const template=listBuiltinTemplates().find(item=>item.templateId===input.templateId);if(!template)fail('TEMPLATE_NOT_FOUND','找不到这个伙伴模板');
    if(input.showOnDesktop!==undefined&&typeof input.showOnDesktop!=='boolean')fail('INVALID_INPUT','桌面显示状态无效');
    const pet=createCompanionInstance({ownerAccountId:owner,template,input,source:'adoption',petId:'pet-'+uuid(),createdAt:timestamp,count:petRows.length});
    if(petRows.some(row=>row.pet_id===pet.petId))fail('PET_ID_CONFLICT','伙伴编号冲突，请重试');
    petRows.push({owner_account_id:owner,pet_id:pet.petId,template_id:pet.templateId,revision:pet.revision,data_json:JSON.stringify(pet),created_at:pet.createdAt,updated_at:pet.updatedAt});resultData={pet,selections};
  }else if(command==='recall-all'){
    const recalled=[];for(const row of petRows){const pet=parse(row.data_json);if(pet.desktop.visible){pet.desktop.visible=false;store(row,pet);recalled.push(pet.petId);}}resultData={recalled};
  }else{
    const{row,pet}=find();
    if(command==='rename'){pet.name=companionName(input.name);store(row,pet);}
    else if(command==='select'){if(!['chatPetId','battlePetId','guardPetId'].includes(input.slot))fail('INVALID_INPUT','选择用途无效');selections[input.slot]=pet.petId;account.selections_json=JSON.stringify(selections);}
    else if(command==='appearance'){
      const id=canonicalBuiltinId(input.resourceId),builtin=listBuiltinTemplates().some(item=>item.resource.resourceId===id);
      if(!builtin&&(!authorizedResource||authorizedResource.resourceId!==id||authorizedResource.ownerAccountId!==owner||authorizedResource.kind!=='2d'))fail('RESOURCE_UNAVAILABLE','此 2D 资源尚未验证归属');
      pet.resource={resourceId:id,kind:'2d'};store(row,pet);
    }else if(command==='interact'){
      const prior=tables.companion_interactions.find(row=>row.pet_id===pet.petId);
      if(prior&&now-prior.last_interacted_at<10000)fail('RATE_LIMITED','伙伴感受到你的心意了，稍等片刻再摸摸吧');
      if(prior)prior.last_interacted_at=now;else tables.companion_interactions.push({owner_account_id:owner,pet_id:pet.petId,last_interacted_at:now});
      pet.growth=applyGrowthEffect(pet.growth,{mood:2,affinity:1});store(row,pet);
    }else if(command==='desktop'){
      if(['visible','behavior','scale','position'].every(key=>input[key]===undefined))fail('INVALID_INPUT','未提供桌面修改');
      if(input.visible!==undefined){if(typeof input.visible!=='boolean')fail('INVALID_INPUT','桌面显示状态无效');pet.desktop.visible=input.visible;}
      if(input.behavior!==undefined){if(!['quiet','wander','follow','sleep'].includes(input.behavior))fail('INVALID_INPUT','行为模式无效');pet.desktop.behavior=input.behavior;}
      if(input.scale!==undefined){if(!Number.isFinite(input.scale)||input.scale<.5||input.scale>2)fail('INVALID_INPUT','外观大小需为 50%–200%');pet.desktop.scale=input.scale;}
      if(input.position!==undefined){const p=input.position;if(!object(p)||Object.keys(p).some(key=>!['x','y','displayId'].includes(key))||![p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)||p.displayId!==undefined&&p.displayId!==null&&(typeof p.displayId!=='string'||p.displayId.length>100))fail('INVALID_INPUT','桌面位置无效');pet.desktop.position={x:Math.round(p.x),y:Math.round(p.y),displayId:p.displayId||null};}store(row,pet);
    }
    resultData={pet,selections};
  }
  if((command==='adopt'&&input.showOnDesktop===true||command==='desktop'&&input.visible===true)&&petRows.filter(row=>{const pet=parse(row.data_json);return pet.resource.kind==='2d'&&pet.desktop.visible;}).length>limit)fail('COMPANION_LIMIT','桌面伙伴数量已达到账号设置上限');
  account.revision++;if(!Number.isSafeInteger(account.revision))fail('INVALID_CLOUD_SAVE','伙伴修订无效');
  const result={ok:true,data:resultData,revision:account.revision,duplicate:false};
  tables.companion_actions.push({owner_account_id:owner,action_id:input.actionId,operation:command,request_hash:hash,result_json:JSON.stringify(result),created_at:timestamp});
  return{module:{version:1,data:normalizeCompanionRows(data)},result,changed:true,requestHash:hash};
}
