import { withActor, createAdminClient } from '../_shared/lingjing-auth.ts';
import { createBattleHandler } from './handler.ts';
import { createBattleAuthority } from './authority.ts';

const admin=createAdminClient();
Deno.serve(withActor(createBattleHandler({admin,...createBattleAuthority(admin)})));
