export {createTerritoryService,territoryError} from '../../../infra/supabase/functions/territory-sync/handler.mjs';
export {createGardenService} from '../../../infra/supabase/functions/garden-sync/handler.mjs';
export {awardBattleResult} from '../../../apps/pc-app/runtime/features/companions/cloud-growth.mjs';
export {applyCloudCommand,emptyGarden,digest,gardenDocument} from '../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
