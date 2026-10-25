import type { BattleParticipant } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleParticipantView } from '../../../../../../packages/shared-types/src/features/battle/views';
import { petName } from './presentation';
import './identity.css';

export function ParticipantNumber({ pet, label }: { pet: BattleParticipant; label?: string }) {
  const view = pet as Partial<BattleParticipantView>;
  if (pet.petId === 'waiting-peer' || view.displayKind === 'waiting') return null;
  return <span className="battle-identity-number" title={view.displayIdentity?.historicalNickname ? `历史昵称：${view.displayIdentity.historicalNickname}` : undefined}>
    {view.displayKind === 'practice' ? '陪练' : view.displayKind === 'guardian' ? '守卫' : `${label || '编号'} ${view.displayIdentity?.instanceNumber || '待同步'}`}
  </span>;
}

export function ParticipantIdentity({ pet }: { pet: BattleParticipant }) {
  return <div className="battle-participant-identity"><strong>{petName(pet)}</strong><ParticipantNumber pet={pet}/></div>;
}
