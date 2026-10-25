const {test}=require('node:test');
const assert=require('node:assert/strict');
const {presentRules,presentSession,presentReport}=require('../presentation.cjs');
const {BattleFeatureService}=require('../service.cjs');

test('same-version legacy session and report gain missing display metadata without changing stored gameplay',()=>{
  const rules=Object.freeze({id:'five-elements-standard-v1',label:'旧存档展示名',vitalPolicy:'normalized',maxHp:120,maxAnger:100,companionStatsApplied:false,
    baseDamage:{normal_attack:10,element_attack:12,dodge:0,ultimate:20},ultimateAnger:50,ultimateCost:50,ultimateHeal:19,dodgeMaxCost:20});
  const snapshot={round:1,player:{id:'player',element:'metal',hp:71,maxHp:120,anger:34,freeDodgeUsed:true,statuses:[]},enemy:{id:'enemy',element:'wood',hp:0,maxHp:120,anger:18,statuses:[]}};
  const round={round:1,actions:{player:'normal_attack',enemy:'dodge'},directDamage:{player:0,enemy:0},damageTaken:{player:0,enemy:0},notes:[],state:snapshot};
  const stored={id:'old-session',mode:'training',status:'finished',winner:'player',rules,snapshot,rounds:[round],player:{petId:'old-pet',element:'metal'},enemy:{petId:'old-foe',element:'wood'},reward:{actionId:'old-receipt',experience:20,applied:true}};
  const before=structuredClone(stored),session=presentSession(stored),report=presentReport(stored);
  for(const projected of [session,report]){
    assert.equal(projected.rules.elementEffects.metal.label,'易伤');assert.equal(projected.rules.advantage.metal,'wood');
    const {advantage,elementEffects,...savedValues}=projected.rules;assert.deepEqual(savedValues,rules);
    assert.deepEqual(projected.snapshot,snapshot);assert.deepEqual(projected.reward,stored.reward);
    assert.deepEqual(projected.rounds.map(({visualEvents,...value})=>value),stored.rounds);
  }
  // Exercise both real service read methods; no engine or store write is available.
  const service=Object.assign(Object.create(BattleFeatureService.prototype),{owner:()=> 'owner',isCloud:()=>false,store:{report:()=>stored,reports:()=>[stored]},ownedLegacy:()=>null});
  const detail=BattleFeatureService.prototype.getReport.call(service,{reportId:'old-session'},{});
  const list=BattleFeatureService.prototype.listReports.call(service,{},{});
  assert.equal(detail.rules.elementEffects.metal.label,'易伤');assert.equal(list[0].rules.advantage.metal,'wood');
  assert.deepEqual(stored,before);
  const unknown={...rules,id:'historical-other-version'};assert.equal(presentRules(unknown),unknown);
});
