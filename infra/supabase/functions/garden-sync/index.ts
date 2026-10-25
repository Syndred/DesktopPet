import {withActor,readJson,jsonResponse,createAdminClient} from '../_shared/lingjing-auth.ts';
import {createGardenService,territoryError} from '../_shared/garden-runtime.bundle.mjs';
Deno.serve(withActor(async(request,actor)=>{
  const body=await readJson(request);
  try{return jsonResponse({ok:true,data:await createGardenService({actor,worker:createAdminClient()}).handle(body)});}
  catch(error){const failure=territoryError(error);return jsonResponse(failure.body,failure.status);}
}));
