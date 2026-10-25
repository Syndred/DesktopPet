const confirmedSerial=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)?value:undefined;
// Number metadata belongs only to verified read views, never backup intents.
function withoutGlobalSerials(value){
  if(Array.isArray(value))return value.map(withoutGlobalSerials);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='globalSerial').map(([key,item])=>[key,withoutGlobalSerials(item)]));
}
module.exports={confirmedSerial,withoutGlobalSerials};
