import {withActor,readJson,jsonResponse,createAdminClient} from '../_shared/lingjing-auth.ts';
import {createTerritoryService,territoryError,awardBattleResult} from '../_shared/garden-runtime.bundle.mjs';
Deno.serve(withActor(async(request,actor)=>{
  const body=await readJson(request);
  try{return jsonResponse({ok:true,data:await createTerritoryService({actor,worker:createAdminClient(),awardBattleResult}).handle(body)});}
  catch(error){const failure=territoryError(error);return jsonResponse(failure.body,failure.status);}
}));
