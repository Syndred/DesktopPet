import catalog from '../resources/assets/roster-v2/catalog.json' with {type:'json'};
export const BASE_STATS=Object.freeze({fire:{hp:118,atk:33,def:20,spd:22},water:{hp:124,atk:28,def:24,spd:20},wood:{hp:130,atk:26,def:26,spd:18},metal:{hp:136,atk:30,def:30,spd:13},earth:{hp:142,atk:24,def:34,spd:11}});
export const copy=value=>JSON.parse(JSON.stringify(value));
export function listBuiltinTemplates(){return catalog.characters.map(({templateId,name,category,element,description,resourceId})=>({templateId,name,category,element,description,resource:{resourceId,kind:'2d'},baseStats:{...BASE_STATS[element]}}));}
export function canonicalBuiltinId(id){return Object.hasOwn(catalog.legacyAliases,id)?catalog.legacyAliases[id]:id;}
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_INPUT'});};
export function companionName(value,reject=fail){if(typeof value!=='string'||!value.trim()||[...value.trim()].length>24||/[\u0000-\u001f\u007f]/u.test(value))reject('名字需为 1–24 个字符');return value.trim();}
/** Sole instance factory for local SQLite and controlled cloud adoption/capture. */
export function createCompanionInstance({ownerAccountId,template,input,source,petId,createdAt,count},reject=fail){
  return{ownerAccountId,petId,templateId:template.templateId,name:companionName(input.name||template.name,reject),serial:source==='capture'&&input.origin?.wildSerial?String(input.origin.wildSerial):petId.slice(4,12).toUpperCase(),element:template.element,resource:copy(template.resource),source,origin:copy(input.origin||{}),growth:{level:1,experience:0,mood:60,satiety:60,affinity:0,winsTotal:0,stats:copy(template.baseStats)},desktop:{visible:Boolean(input.showOnDesktop),behavior:'quiet',scale:1,position:{x:80+(count%5)*240,y:520-Math.floor(count/5)*50,displayId:null}},revision:1,createdAt,updatedAt:createdAt};
}
