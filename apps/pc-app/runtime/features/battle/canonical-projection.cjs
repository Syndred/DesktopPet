const {canonical}=require('../accounts/util.cjs');
const equal=(a,b)=>canonical(a)===canonical(b);
// Recognize only the old finish/sync projection: one local revision field,
// local update time and the exact five room metadata fields removed by Online.
// Economic values, combat history, participants and every other field match.
function legacyFinishedProjection(current,expected){
  if(current.some(row=>!row)||!equal(current[2],expected[2]))return false;
  const [local,report]=current,[remote,remoteReport]=expected;
  if(!['id','room_id','status'].every(key=>local[key]===remote[key])||local.revision<=remote.revision)return false;
  const body=JSON.parse(local.data_json),canonicalBody=JSON.parse(remote.data_json);
  if(body.mode!=='friend'||body.status!=='finished'||!body.room||!canonicalBody.room||body.revision!==local.revision-1||body.updatedAt!==local.updated_at||!Number.isFinite(Date.parse(body.updatedAt))||Date.parse(body.updatedAt)<Date.parse(canonicalBody.updatedAt))return false;
  const projected=structuredClone(canonicalBody);
  projected.revision=body.revision;projected.updatedAt=body.updatedAt;
  for(const key of ['revision','rules_version','core_version','authority','protocolVersion'])if(!Object.hasOwn(body.room||{},key))delete projected.room[key];
  return equal(body,projected)&&['id','session_id','ended_at'].every(key=>report[key]===remoteReport[key])&&equal(JSON.parse(report.data_json),JSON.parse(remoteReport.data_json));
}
module.exports={legacyFinishedProjection};
