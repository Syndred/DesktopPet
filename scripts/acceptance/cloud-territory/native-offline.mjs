import assert from 'node:assert/strict';

/** Actual Node fetch sockets fail before HTTPS while only one isolated Electron
 * process uses a loopback CONNECT proxy. It destroys sockets and serves no API
 * response. The other real client remains online; restart restores the normal
 * dispatcher. This is scoped transport fault injection, not a host-wide outage. */
export async function inspectOfflineRecovery({a,b,evidence,save,pass,invoke,snapshot,launch,login,capture}) {
  assert.ok(evidence.backendPassed&&evidence.visualPassed,'Finish the original native flow first');
  const state=evidence.offline||={phase:'preparing',passed:false,plotId:'plot-5',cropType:'tomato'};
  evidence.passed=false;save();
  const pending=async model=>model.page.evaluate(owner=>JSON.parse(localStorage.getItem(`lingjing:garden:pending:v1:${owner}`)||'null'),state.ownerAccountId);
  const journal=async model=>model.app.evaluate(async(_electron,actionId)=>{
    await new Promise(resolve=>setImmediate(resolve));
    return globalThis.__accountsCloudAcceptanceServices.db.prepare('select action_id,wire_input_json,request_hash,status from garden_cloud_requests where action_id=?').get(actionId);
  },state.input.actionId);
  const originalRequest=(row)=>{assert.ok(row);assert.equal(row.wire_input_json,state.journal.wire_input_json);assert.equal(row.request_hash,state.journal.request_hash);};

  if(!state.input){
    const before=await snapshot(a);state.before||=before;state.ownerAccountId=before.ownerAccountId;state.originalPid=a.pid;save();
    assert.deepEqual(before.items,state.before.items);assert.deepEqual(before.plots,state.before.plots);assert.deepEqual(before.pets,state.before.pets);
    assert.equal(before.plots.find(p=>p.plotId===state.plotId).cropType,null);
    assert.ok(before.items.find(i=>i.id==='seed:tomato').quantity>0);
    await a.page.bringToFront();await a.page.evaluate(()=>{location.hash='#/garden/plots';});
    await a.page.locator('.garden-plots button').nth(4).waitFor();
    const saved=await pending(a);
    if(saved){
      assert.ok(state.transportFault?.connections>0,'Preserve any unrelated pending operation');
      assert.equal(saved.command,'plant');assert.equal(saved.input.plotId,state.plotId);assert.equal(saved.input.cropType,state.cropType);assert.equal(saved.input.expectedRevision,before.revision);
    }else{
      await a.page.locator('.garden-plots button').nth(4).click();
      await a.page.locator('.garden-seeds button').filter({hasText:'番茄'}).click();
      const transport=await a.app.evaluate(async()=>{
        const load=globalThis.__accountsCloudAcceptanceRequire,{ProxyAgent,getGlobalDispatcher,setGlobalDispatcher}=load('undici');
        const remote=globalThis.__accountsCloudAcceptanceServices.get('accounts').remote;
        const state={connections:0,errors:[],dispatcher:getGlobalDispatcher()};
        const server=load('node:net').createServer(socket=>{state.connections++;socket.destroy();});
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
        state.server=server;state.proxy=new ProxyAgent(`http://127.0.0.1:${server.address().port}`);
        globalThis.__gardenOfflineTransport=state;setGlobalDispatcher(state.proxy);
        const original=remote.fetcher;
        remote.fetcher=async(...args)=>{
          try{return await original(...args);}catch(error){state.errors.push({name:error.name,causeCode:error.cause?.code||null,causeName:error.cause?.name||null});throw error;}
        };
        // Prove that the real transport is blocked before allowing any UI write.
        let reachedHttp=false;
        try{await remote.fetcher(remote.config.url+'/functions/v1/garden-sync',{method:'POST',headers:{apikey:remote.config.key,Authorization:`Bearer ${remote.active.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({op:'snapshot'}),signal:AbortSignal.timeout(8000)});reachedHttp=true;}catch{}
        return{reachedHttp,connections:state.connections,errors:state.errors,method:'real loopback TCP CONNECT proxy destroys sockets; per-process undici dispatcher',scope:'one isolated Electron process; no host network setting changed'};
      });
      state.transportFault=transport;save();assert.equal(transport.reachedHttp,false);assert.ok(transport.connections>0&&transport.errors.length>0);
      await a.page.getByRole('button',{name:'播种',exact:true}).click();
      await a.page.locator('.garden-notice-pending').waitFor();
      await a.page.locator('.garden-notice-error').filter({hasText:'云端回复尚未确认'}).waitFor();
    }
    const original=await pending(a);assert.ok(original);state.input=original.input;state.ownerAccountId=original.owner;state.journal=await journal(a);
    assert.equal(state.journal.status,'pending');state.phase='offline-pending';save();
    const peer=await snapshot(b);assert.deepEqual(peer.items,before.items);assert.deepEqual(peer.pets,before.pets);assert.deepEqual(peer.plots,before.plots);assert.equal(peer.revision,before.revision);
    state.peerUnchangedWhileOffline=true;
    state.transportFault=await a.app.evaluate(()=>{const s=globalThis.__gardenOfflineTransport;return s?{connections:s.connections,errors:s.errors,method:'real loopback TCP CONNECT proxy destroys sockets; per-process undici dispatcher',scope:'one isolated Electron process; no host network setting changed'}:null;})||state.transportFault;
    save();await capture(a,'cloud-garden-offline-pending',true);
  }

  let resumed=a;
  if(a.pid===state.originalPid){await a.app.close();a.closed=true;resumed=await launch(0);await login(resumed);}
  assert.notEqual(resumed.pid,state.originalPid);state.restartedPid=resumed.pid;save();
  await resumed.page.bringToFront();await resumed.page.evaluate(()=>{location.hash='#/garden/plots';});
  await resumed.page.locator('.garden-plots button').nth(4).waitFor();
  let row=await journal(resumed);originalRequest(row);
  if(row.status==='pending'){
    assert.deepEqual((await pending(resumed)).input,state.input);
    await resumed.page.locator('.garden-notice-pending').waitFor();state.uiRetryClicked=true;save();
    await resumed.page.locator('.garden-notice-pending button').click();
    await resumed.page.locator('.garden-notice:not(.garden-notice-error)').filter({hasText:'原操作已确认保存'}).waitFor();
    row=await journal(resumed);originalRequest(row);assert.equal(row.status,'committed');
  }else{assert.equal(row.status,'committed');assert.equal(state.uiRetryClicked,true);}
  const after=await snapshot(resumed),peer=await snapshot(b),before=state.before;
  assert.equal(after.revision,before.revision+1);assert.equal(after.plots.find(p=>p.plotId===state.plotId).cropType,state.cropType);
  assert.deepEqual(after.plots.filter(p=>p.plotId!==state.plotId),before.plots.filter(p=>p.plotId!==state.plotId));
  for(const item of after.items)assert.equal(item.quantity,before.items.find(i=>i.id===item.id).quantity-(item.id==='seed:tomato'?1:0));
  assert.deepEqual(after.pets,before.pets);assert.deepEqual(after.items,peer.items);assert.deepEqual(after.pets,peer.pets);assert.deepEqual(after.plots,peer.plots);assert.equal(await pending(resumed),null);
  const repeat=await invoke(b,'garden','plant',state.input,false);assert.equal(repeat.ok,true);assert.equal(repeat.replayed,true);
  const repeated=await snapshot(b);assert.equal(repeated.revision,after.revision);assert.deepEqual(repeated.items,after.items);assert.deepEqual(repeated.pets,after.pets);assert.deepEqual(repeated.plots,after.plots);
  await capture(resumed,'cloud-garden-offline-recovered',true);
  state.phase='passed';state.passed=true;state.completedAt=new Date().toISOString();state.exactWireAndHashAfterRestart=true;state.originalRetryButtonConfirmed=true;state.finalJournalStatus=row.status;state.peerReadback=true;state.noDuplicateDebit=true;state.petsUnchanged=true;state.localStoragePendingCleared=true;state.revisionBefore=before.revision;state.revisionAfter=after.revision;
  evidence.final={...evidence.final,items:after.items,pets:after.pets,plots:after.plots};
  if(evidence.failure){evidence.resolvedIncidents||=[];evidence.resolvedIncidents.push(evidence.failure);delete evidence.failure;}
  evidence.passed=true;save();
  pass('actual per-process TCP connection failure, persisted UI operation, real restart and original retry commit once',{originalPid:state.originalPid,restartedPid:state.restartedPid,actionId:state.input.actionId,connections:state.transportFault.connections,transportErrors:state.transportFault.errors,revisionBefore:before.revision,revisionAfter:after.revision});
}
