import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reserveBattleAction,resolvedBattleAction} from './action-intent.ts';
test('an interrupted original move retains its ID until that same round resolves; the next same move gets a new ID',()=>{
  let issued=0;const uuid=()=>`real-intent-${++issued}`;
  const original=reserveBattleAction(null,'original-session','normal_attack',1,uuid);
  assert.equal(reserveBattleAction(original,'original-session','normal_attack',1,uuid),original);assert.equal(issued,1);
  assert.equal(resolvedBattleAction(original,{id:'original-session',status:'active',snapshot:{round:0}}),false);
  assert.equal(resolvedBattleAction(original,{id:'original-session',status:'active',snapshot:{round:1}}),true);
  const next=reserveBattleAction(original,'original-session','normal_attack',2,uuid);
  assert.notEqual(next.actionId,original.actionId);assert.equal(next.roundNo,2);assert.equal(issued,2);
});
test('a receipt from another session cannot be reused or cleared by the wrong session',()=>{
  const old={sessionId:'first',action:'normal_attack',roundNo:7,actionId:'original'};
  assert.equal(resolvedBattleAction(old,{id:'second',status:'finished',snapshot:{round:50}}),false);
  const fresh=reserveBattleAction(old,'second','normal_attack',7,()=> 'new-session-action');assert.equal(fresh.actionId,'new-session-action');
});
