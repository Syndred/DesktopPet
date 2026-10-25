import type { WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import { BattleScreen } from '../battle/BattleScreen';

/** This route retains the exploration location lease. The battle module owns
 * the screen, controller, animation and contextual capture settlement. */
export function EncounterView({ encounter }: { encounter: WildEncounter }) {
  return <BattleScreen sessionId={encounter.battle.battleId} returnTo="/discovery"/>;
}
