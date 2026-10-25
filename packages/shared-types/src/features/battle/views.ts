import type { CompanionDisplayIdentity } from '../companions/index.js';
import type { BattleParticipant, BattleReport, BattleSession } from './index.js';

/** Main IPC read projections only; never accepted as battle command input. */
export interface BattleParticipantView extends BattleParticipant {
  readonly displayIdentity: CompanionDisplayIdentity;
  readonly displayKind: 'instance' | 'practice' | 'guardian' | 'waiting';
}
export type BattleSessionView = Omit<BattleSession, 'player' | 'enemy'> & { player: BattleParticipantView; enemy: BattleParticipantView };
export type BattleReportView = Omit<BattleReport, 'player' | 'enemy'> & { player: BattleParticipantView; enemy: BattleParticipantView };
