import { withActor, createAdminClient } from '../_shared/lingjing-auth.ts';
import { createBattleHandler, createBattleAuthority } from './runtime.generated.mjs';

const admin=createAdminClient();
Deno.serve(withActor(createBattleHandler({admin,...createBattleAuthority(admin)})));
