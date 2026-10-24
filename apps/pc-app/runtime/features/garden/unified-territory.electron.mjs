import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID,createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root=resolve('.'),phase=process.argv[2]||'prepare',output=resolve(process.env.GARDEN_UNIFIED_OUTPUT||'artifacts/garden/unified-battle-v2');
mkdirSync(output,{recursive:true});
const file=join(output,'evidence.json');
const proof=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{at:new Date().toISOString(),profileGate:'namespaced-v2',mode:'simulated location; actual Electron, public battle kernel, SQLite and restart with explicit QA login',scenarios:{},checks:[],errors:[]};
assert.equal(proof.profileGate,'namespaced-v2','Preserve earlier QA profiles and select a fresh v2 output directory');
const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
const stable=session=>({id:session.id,mode:session.mode,status:session.status,snapshot:session.snapshot,playerId:session.player.petId,enemyId:session.enemy.petId,rounds:session.rounds.map(round=>({round:round.round,actions:round.actions,state:round.state}))});
const source=()=>({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--short','--','apps/pc-app/runtime/features/garden','apps/pc-app/ui/src/features/garden','packages/shared-types/src/features/garden'],{encoding:'utf8'}).trim(),hashes:Object.fromEntries(['apps/pc-app/dist/main/index.cjs','apps/pc-app/dist/ui/index.html','apps/pc-app/runtime/features/garden/index.cjs','apps/pc-app/runtime/features/garden/territories.cjs','apps/pc-app/runtime/features/garden/qa-location.cjs'].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))});
const portraitsReady=page=>page.waitForFunction(()=>{const portraits=[...document.querySelectorAll('.garden-pet-picker .cp-portrait')];return portraits.length>0&&portraits.every(portrait=>portrait.querySelector('.resource-stage[data-status="ready"],.cp-sheet-thumbnail,.resource-portrait'));});
async function open(scenario){
  const env={...process.env,PET_USER_DATA_DIR:scenario.profilePath,...(scenario.env||{})};delete env.ELECTRON_RUN_AS_NODE;delete env.PET_RUNTIME_DATA_FILE;
  if(!scenario.env)delete env.LINGJING_QA_SCENARIO;
  const app=await electron.launch({args:[root],cwd:root,env});
  const page=await app.firstWindow();page.on('pageerror',error=>proof.errors.push(error.message));
  await page.waitForFunction(()=>Boolean(window.lingjing));
  const invoke=async(feature,command,payload={})=>{const result=await page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert.equal(result.ok,true,JSON.stringify(result));return result;};
  const garden=()=>invoke('garden','snapshot');
  const route=async path=>{await page.evaluate(path=>{location.hash=path;},path);await page.waitForFunction(path=>location.hash===`#${path}`,path);};
  const session=id=>invoke('battle','snapshot',{sessionId:id}).then(result=>result.data);
  const act=async(id,action)=>{const before=await session(id);await page.locator(`.battle-move.${action}`).click();await page.waitForFunction(async({id,round})=>{const result=await window.lingjing.invoke('battle','snapshot',{sessionId:id});return result.ok&&(result.data.status!=='active'||result.data.snapshot.round>round);},{id,round:before.snapshot.round});return session(id);};
  return {app,page,invoke,garden,route,session,act};
}
async function register(current,scenario,label){
  const existing=await current.invoke('accounts','session');
  if(!existing.data.currentUser){
    const privateFile=join(scenario.profilePath,'.garden-qa-login.json');
    if(existsSync(privateFile))await current.invoke('accounts','login',{...JSON.parse(readFileSync(privateFile,'utf8')),provider:'local',rememberSession:false});
    else{
      const password=`Qa-${randomUUID()}!`,account=`qa_garden_${label}_${Date.now()}`;
      writeFileSync(privateFile,JSON.stringify({account,password}),{flag:'wx'});
      await current.invoke('accounts','register',{provider:'local',account,username:`领地演练·${label}`,password,confirmPassword:password,rememberSession:false});
    }
  }
  await current.page.getByRole('navigation',{name:'主导航'}).waitFor();
  scenario.owner=(await current.invoke('accounts','session')).data.currentUser.id;
  if(scenario.env){assert.ok(scenario.owner.startsWith(`qa:${scenario.runId}:`));assert.equal((await current.invoke('accounts','session')).data.dataMode,'simulated');}
}
let current;
try{
  if(phase==='prepare'){
    for(const label of ['win','loss']){
      const scenario=proof.scenarios[label]||=JSON.parse(execFileSync(process.execPath,['scripts/acceptance/create-scenario-profile.mjs'],{cwd:root,encoding:'utf8'}));save();
      if(scenario.prepared)continue;
      current=await open(scenario);await register(current,scenario,label);
      assert.equal((await current.invoke('app','info')).data.scenario.provenance,'simulated');
      await current.page.getByRole('button',{name:'隔离验收场景',exact:true}).waitFor();
      const templates=(await current.invoke('companions','list')).data.templates;
      for(const templateId of ['big-fish-gentle','animal-hat-cat','animal-shiba'])await current.invoke('companions','adopt',{actionId:`unified:adopt:${templateId}`,templateId,name:templates.find(template=>template.templateId===templateId).name,showOnDesktop:false});
      const before=await current.garden();assert.equal(before.data.scenario.mode,'simulated');
      scenario.plantInput||={actionId:'unified:personal-plot',expectedRevision:before.revision,sessionOwnerAccountId:scenario.owner,plotId:'plot-1',cropType:'carrot'};save();
      const planted=await current.invoke('garden','plant',scenario.plantInput);assert.equal(planted.ok,true);
      scenario.personalCrop=(await current.garden()).data.plots[0];
      await current.route('/garden');await current.page.getByRole('button',{name:'查看演练领地',exact:true}).click();
      await current.page.getByRole('status').filter({hasText:'附近领地已更新'}).waitFor();
      const located=await current.garden(),territory=located.data.territories.find(value=>value.provenance==='simulated-geographic');assert.ok(territory);
      scenario.territoryId=territory.id;scenario.before=located;scenario.prepared=true;scenario.preparationSource=source();save();
      await current.page.screenshot({path:join(output,`${label}-territory-entry.png`),fullPage:true});
      await current.app.close();current=null;
    }
    proof.checks.push('Two fresh foundation-validated QA profiles preserve actual planted crops; simulated location creates only run-scoped territories');
  }else if(phase==='visual'){
    const scenario=proof.scenarios.win;assert.ok(scenario?.prepared);current=await open(scenario);await register(current,scenario,'win');
    await current.page.emulateMedia({reducedMotion:'reduce'});await current.page.waitForFunction(()=>document.documentElement.dataset.motion==='reduced');
    const window=await current.app.browserWindow(current.page),measurements=[];
    for(const [width,height]of [[1280,844],[1440,900]]){
      await window.evaluate((window,size)=>window.setContentSize(size.width,size.height),{width,height});await current.route('/inventory');await portraitsReady(current.page);
      const metrics=await current.page.evaluate(()=>{
        const rect=element=>element.getBoundingClientRect().toJSON(),cards=[...document.querySelectorAll('.garden-item')].map(element=>({box:rect(element),art:rect(element.querySelector('.garden-item-art'))}));
        const overlap=cards.some((left,index)=>cards.slice(index+1).some(right=>Math.min(left.box.right,right.box.right)-Math.max(left.box.left,right.box.left)>1&&Math.min(left.box.bottom,right.box.bottom)-Math.max(left.box.top,right.box.top)>1));
        const title=getComputedStyle(document.querySelector('.garden-heading h1'));
        return {viewport:{width:innerWidth,height:innerHeight},title:{size:title.fontSize,weight:title.fontWeight},cards,overlap,pets:[...document.querySelectorAll('.garden-pet')].map(element=>({height:element.getBoundingClientRect().height,scrollHeight:element.scrollHeight}))};
      });
      assert.equal(metrics.overlap,false);assert.equal(metrics.title.size,'28px');assert.equal(metrics.title.weight,'700');assert.ok(metrics.cards.every(card=>card.art.top>=card.box.top&&card.art.bottom<=card.box.bottom));assert.ok(metrics.pets.every(pet=>pet.scrollHeight<=pet.height+1));measurements.push(metrics);
      await current.page.screenshot({path:join(output,`A04-${width}x${height}-inventory.png`),fullPage:true});
    }
    await current.route('/garden');await portraitsReady(current.page);await current.page.locator('.garden-shared-map [data-map-ready="true"]').waitFor();await current.page.screenshot({path:join(output,'territory-entry-ready.png'),fullPage:true});
    proof.visual={source:source(),measurements,actorsActuallyReady:true,mapEngine:'shared MapLibre',qaMapViewportOnly:true};
    await current.app.close();current=null;
    const ordinary={profilePath:join(output,'ordinary-profile')};current=await open(ordinary);await register(current,ordinary,'ordinary');
    assert.equal((await current.invoke('app','info')).data.scenario,undefined);assert.equal(await current.page.getByRole('button',{name:'隔离验收场景',exact:true}).count(),0);
    const before=await current.garden();assert.equal(before.data.scenario,undefined);
    const rejected=await current.page.evaluate(input=>window.lingjing.invoke('garden','territoryLocate',input),{actionId:'ordinary-no-simulation',sessionOwnerAccountId:ordinary.owner,expectedRevision:before.revision});assert.equal(rejected.code,'REAL_LOCATION_REQUIRED');
    const after=await current.garden();assert.deepEqual(after.data.items,before.data.items);assert.equal(after.revision,before.revision);proof.ordinaryProfile={noScenario:true,realLocationStillRequired:true,exactInventoryAndRevision:true};
    await current.app.close();current=null;proof.checks.push('Actual 1280/1440 A04 cards and decoded actors pass; ordinary profile has no QA marker/adapter and cannot use simulated territory location');
  }else if(phase==='verify'){
    proof.verificationSource=source();
    for(const label of ['win','loss']){
      const scenario=proof.scenarios[label];assert.ok(scenario?.prepared);assert.ok(!scenario.completed,'Read the saved result before replaying a completed scenario');
      current=await open(scenario);await register(current,scenario,label);
      let snap=await current.garden();
      const roster=(await current.invoke('companions','list')).data.templates;
      const wood=roster.find(template=>template.element==='wood');assert.ok(wood?.resource?.resourceId,'Consume the shared wood character before accepting this territory scenario');
      const chosen=(await current.invoke('companions','list')).data.pets.find(pet=>pet.templateId===(label==='win'?'animal-hat-cat':'big-fish-gentle'));assert.ok(chosen);
      if(!scenario.sessionId){
        await current.route('/garden');await current.page.getByRole('button',{name:`${chosen.name} Lv.`,exact:false}).click();await current.page.getByRole('button',{name:'发起领地挑战',exact:true}).click();
        await current.page.waitForFunction(()=>location.hash.startsWith('#/battle/session/'));
        snap=await current.garden();scenario.sessionId=snap.data.territoryChallenges.find(value=>value.territoryId===scenario.territoryId).sessionId;save();
      }
      await current.route(`/battle/session/${encodeURIComponent(scenario.sessionId)}`);
      const shared=current.page.locator(`[data-battle-screen="shared-v1"][data-session-id="${scenario.sessionId}"]`);await shared.waitFor();
      let session=await current.session(scenario.sessionId);assert.equal(session.enemy.element,'wood');assert.equal(session.enemy.resource?.resourceId||session.enemy.appearance2d,wood.resource.resourceId);
      assert.equal(session.context.authority,'simulated');assert.equal(session.context.scenarioId,scenario.runId);
      assert.equal(await shared.locator('.battle-stage').count(),1);assert.equal(await shared.locator('.battle-moves').count(),1);
      if(!scenario.resume){
        session=await current.act(session.id,'normal_attack');assert.equal(session.status,'active');scenario.resume=stable(session);save();
        await current.route('/garden');const link=current.page.getByRole('link',{name:'继续挑战',exact:true});assert.equal(await link.getAttribute('href'),`#/battle/session/${encodeURIComponent(session.id)}`);await link.click();await shared.waitFor();assert.deepEqual(stable(await current.session(session.id)),scenario.resume);
        await current.app.close();current=null;
        current=await open(scenario);await register(current,scenario,label);await current.route('/garden');await current.page.getByRole('link',{name:'继续挑战',exact:true}).click();await current.page.locator(`[data-battle-screen="shared-v1"][data-session-id="${scenario.sessionId}"]`).waitFor();
        assert.deepEqual(stable(await current.session(scenario.sessionId)),scenario.resume);scenario.restartRecovered=true;save();
      }
      session=await current.session(scenario.sessionId);const rules=(await current.invoke('battle','rules')).data;
      for(let index=0;index<150&&session.status==='active';index++){
        const actor=session.snapshot.player;
        const action=label==='win'?(actor.anger>=rules.ultimateAnger?'ultimate':'element_attack'):(!actor.freeDodgeUsed||actor.anger>0?'dodge':'element_attack');
        session=await current.act(session.id,action);
      }
      assert.equal(session.status,'finished');assert.equal(session.winner,label==='win'?'player':'enemy');scenario.session=session;save();
      await current.page.screenshot({path:join(output,`${label}-shared-result.png`),fullPage:true});
      const context=(await current.invoke('battle','context',{sessionId:session.id})).data;
      assert.equal(context.action,'territory');
      await current.page.getByRole('button',{name:label==='win'?'占领':'确认结果',exact:true}).click();
      await current.page.waitForFunction(()=>location.hash==='#/garden');
      const after=await current.garden(),territory=after.data.territories.find(value=>value.id===scenario.territoryId);
      assert.equal(territory.ownerAccountId,label==='win'?scenario.owner:null);assert.deepEqual(after.data.plots[0],scenario.personalCrop);
      const seedCount=data=>data.items.filter(item=>item.category==='seed').reduce((total,item)=>total+item.quantity,0);
      assert.equal(seedCount(after.data)-seedCount(scenario.before.data),2);
      scenario.after=after;scenario.pets=(await current.invoke('companions','list')).data;scenario.completed=true;save();
      await current.page.screenshot({path:join(output,`${label}-confirmed-territory.png`),fullPage:true});
      await current.app.close();current=null;
      const db=new DatabaseSync(join(scenario.profilePath,'lingjing.sqlite'),{readOnly:true});
      const outbox=db.prepare("SELECT payload_json FROM garden_outbox WHERE owner_account_id=? AND json_extract(payload_json,'$.kind')='territorySettle'").all(scenario.owner).map(row=>JSON.parse(row.payload_json)).find(value=>value.input.sessionId===scenario.sessionId);assert.ok(outbox);
      scenario.confirmInput=outbox.input;
      assert.equal(db.prepare('SELECT COUNT(*) n FROM garden_reward_receipts WHERE owner_account_id=? AND source=? AND receipt_id=?').get(scenario.owner,'battle',scenario.sessionId).n,1);db.close();save();
      current=await open(scenario);await register(current,scenario,label);
      const beforeReplay=await current.garden(),replayed=await current.invoke('garden','territorySettle',scenario.confirmInput);assert.equal(replayed.replayed,true);
      const reread=await current.garden();assert.deepEqual(reread.data.items,beforeReplay.data.items);assert.deepEqual(reread.data.territories,beforeReplay.data.territories);assert.equal(reread.revision,beforeReplay.revision);assert.deepEqual((await current.invoke('companions','list')).data,scenario.pets);
      scenario.exactRestartAndReplay=true;save();await current.app.close();current=null;
    }
    proof.checks.push('Both outcomes use the same shared battle screen; exact session route/page/restart recovery, public context confirmation and one seed receipt; repeat confirmation preserves all state');
    assert.deepEqual(proof.errors,[]);proof.passed=true;
  }else throw new Error('Use prepare, visual or verify');
  delete proof.failure;save();console.log(JSON.stringify({phase,evidence:file,passed:proof.passed||false,checks:proof.checks}));
}catch(error){proof.failure=String(error);save();throw error;}
finally{if(current)await current.app.close();}
