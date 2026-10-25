import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';

export interface BattleActionAttempt {sessionId:string;action:BattleActionType;actionId:string;roundNo:number}
export function reserveBattleAction(previous:BattleActionAttempt|null,sessionId:string,action:BattleActionType,roundNo:number,uuid:()=>string):BattleActionAttempt {
  return previous?.sessionId===sessionId&&previous.action===action&&previous.roundNo===roundNo
    ? previous : {sessionId,action,roundNo,actionId:uuid()};
}
export function resolvedBattleAction(attempt:BattleActionAttempt|null,session:{id:string;status:string;snapshot:{round:number}}):boolean {
  return Boolean(attempt?.sessionId===session.id&&(session.snapshot.round>=attempt.roundNo||['finished','abandoned'].includes(session.status)));
}
