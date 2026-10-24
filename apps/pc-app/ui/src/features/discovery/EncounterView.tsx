import type { DiscoverySnapshot, WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import type { useDiscovery } from './use-discovery';
import { BattleScreen } from '../battle/BattleScreen';

/** Encounter owns provenance and capture; the battle feature owns all combat UI and actions. */
export function EncounterView({ encounter }: { encounter: WildEncounter; state: DiscoverySnapshot; pending: boolean; run: ReturnType<typeof useDiscovery>['run'] }) {
  return <BattleScreen sessionId={encounter.battle.battleId} returnTo="/discovery"/>;
}
