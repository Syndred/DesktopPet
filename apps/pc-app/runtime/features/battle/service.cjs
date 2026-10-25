const { randomUUID } = require("node:crypto");
const { BattleRuntimeService, getBattleRules, executeRound } = require("../../services/battle-runtime.cjs");
const { OnlineDuelService } = require("../../services/online-duel-service.cjs");
const { BattleStore, copy } = require("./store.cjs");
const { appearance2d } = require("./assets.cjs");
const { readQaProfile, createQaOnline, qaUser } = require('./qa-adapter.cjs');
const { presentSession, presentReport } = require('./presentation.cjs');
const { BattleCloudAuthority } = require('./cloud-authority.cjs');
const {sameCommandInput}=require('./transport-journal.cjs');

const ACTIONS = new Set(["normal_attack", "element_attack", "dodge", "ultimate"]);
const ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ELEMENT_NAMES = { metal: "金", wood: "木", earth: "土", water: "水", fire: "火" };
const fail = (code, message) => Object.assign(new Error(message), { code });
const text = (value, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw fail("INVALID_INPUT", `${name}无效`);
  return value.trim();
};

class BattleFeatureService {
  constructor(services) {
    this.services = services;
    this.store = new BattleStore(services.db);
    this.qa = readQaProfile(services);
    this.online = this.qa?.endpoint ? createQaOnline(this.qa) : services.legacy?.onlineDuelService || new OnlineDuelService();
    const cloudActor = services.get('cloudActor');
    if (!this.qa && cloudActor?.requireActor) this.online.useCloudTransport(async () => {
      const context = await cloudActor.requireActor();
      return { url: context.url, actor: context, client: context.client, invoke: context.invoke };
    });
    this.locks = new Map();
    this.cloud = new BattleCloudAuthority(services);
    this.unsubscribe = this.online.onEvent(event => {
      // Network notifications trigger a verified sync; their payload is never a settlement.
      services.events?.emit("battle:online", {
        type: event.type, at: event.at,
        roomId: event.payload?.roomId || event.payload?.room?.id || null,
        status: event.payload?.status || null
      });
    });
    this.stopSession = services.events?.on('accounts:session-changed', value => {
      const user = value?.currentUser;
      if (!user || (this.online.currentUser && this.online.currentUser.id !== (user.ownerAccountId || user.id))) this.online.setCurrentUser(null);
    });
  }

  owner(context) {
    const owner = this.verifiedOwner();
    if (!owner || (context?.ownerAccountId && owner !== context.ownerAccountId)) {
      throw fail("AUTH_REQUIRED", "请先登录当前账号");
    }
    return owner;
  }

  user(owner) {
    const accounts = this.services.get("accounts");
    const user = this.qa ? qaUser(this.services, owner, this.qa) : this.online.cloudProvider ? accounts?.privateSession?.() : accounts?.requireRuntimeUser ? accounts.requireRuntimeUser() : this.services.session.getCurrentUser();
    if (!user || (user.ownerAccountId || user.id) !== owner || (this.online.cloudProvider ? user.authKind !== 'supabase' : !user.sessionToken)) throw fail("ONLINE_LOGIN_REQUIRED", "请登录云端账号后使用好友对战");
    this.online.setCurrentUser(user);
    return user;
  }

  assertOwner(owner) {
    if (this.verifiedOwner() !== owner) throw fail("AUTH_CHANGED", "账号已切换，请重新打开对战");
  }

  verifiedOwner() {
    const accounts = this.services.get("accounts");
    return accounts?.getOwnerAccountId ? accounts.getOwnerAccountId() : this.services.session.getOwnerAccountId();
  }

  // Serialize commands per account, including ambiguous cloud responses.
  async serial(owner, task) {
    const previous = this.locks.get(owner) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => { this.assertOwner(owner); return task(); });
    this.locks.set(owner, next);
    try { return await next; }
    finally { if (this.locks.get(owner) === next) this.locks.delete(owner); }
  }

  ownedPet(owner, petId) {
    text(petId, "出战伙伴");
    const companions = this.services.get("companions");
    this.importOwnedLegacy(owner, companions);
    let pet = companions?.getPet?.(owner, petId);
    if (!pet && companions?.getOwnedPet) pet = companions.getOwnedPet({ ownerAccountId: owner, petId });
    if (!pet) {
      const legacy = this.services.legacy?.runtimeDataStore;
      const inventory = legacy?.getAuthSession?.()?.currentUser?.id === owner ? legacy.getInventorySnapshot() : null;
      pet = inventory?.pets?.find(item => item.id === petId);
    }
    if (!pet || (pet.ownerAccountId && pet.ownerAccountId !== owner)) throw fail("PET_NOT_OWNED", "当前账号没有这只伙伴");
    if (!ELEMENTS.has(pet.element)) throw fail('INVALID_ELEMENT', '伙伴五行尚未就绪');
    return {
      petId: pet.id || pet.petId, petName: typeof pet.name === "object" ? pet.name.zh : pet.name || pet.petName,
      element: pet.element, level: pet.growth?.level || pet.level || 1,
      resourceRef: appearance2d(pet), resource: { resourceId: appearance2d(pet), kind: "2d" },
      appearance2d: appearance2d(pet),
      avatar: pet.avatar
    };
  }

  pets(owner) {
    const companions = this.services.get("companions");
    this.importOwnedLegacy(owner, companions);
    const legacy = this.services.legacy?.runtimeDataStore;
    const pets = companions?.listPets?.(owner) || (legacy?.getAuthSession?.()?.currentUser?.id === owner ? legacy.getInventorySnapshot()?.pets : []) || [];
    return pets.map(pet => this.ownedPet(owner, pet.id || pet.petId));
  }

  ownedLegacy(owner) {
    // Accounts maps old local IDs to local:<id>; read only its explicitly owned archive.
    if (this.services.get("accounts") && this.services.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_legacy_data'").get()) {
      const row = this.services.db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get(owner);
      return row ? JSON.parse(row.document) : null;
    }
    const legacy = this.services.legacy?.runtimeDataStore;
    if (legacy?.getAuthSession?.()?.currentUser?.id !== owner) return null;
    return { ...legacy.getInventorySnapshot(), battleReports: legacy.listBattleReports(200) };
  }

  importOwnedLegacy(owner, companions) {
    if (!companions?.importLegacyInventory) return;
    const inventory = this.ownedLegacy(owner);
    if (inventory?.pets) companions.importLegacyInventory(owner, inventory);
  }

  overview(_payload, context) {
    const owner = this.owner(context);
    if(this.isCloud(owner)&&!this.store.latest(owner))return this.serial(owner,async()=>{
      this.user(owner);const response=await this.online.invoke('get_active_room',{});this.assertOwner(owner);
      if(response.room){await this.online.syncRoom({roomId:response.room.id,roundsLimit:50});this.assertOwner(owner);const side=response.room.host_user_id===owner?'host':'guest';await this.syncInternal(owner,this.bindRoom(owner,response.room,response.room[`${side}_pet_id`]));}
      else {const training=await this.online.invoke('get_active_training',{});this.assertOwner(owner);if(training.session)await this.saveCloudTraining(owner,training);}
      await this.refreshCloudReports(owner);return this.overviewData(owner);
    });
    return this.overviewData(owner);
  }

  overviewData(owner) {
    const current = this.store.latest(owner);
    const status = this.online.getStatus();
    const companions = this.services.get("companions");
    // Lobby-only read projection; ownedPet stays unchanged for sessions and receipts.
    const pets = this.pets(owner).map(pet => ({
      ...pet,
      displayIdentity: companions?.getDisplayIdentity?.(owner, pet.petId) || {
        roleName: '历史伙伴', instanceNumber: pet.petId, historicalNickname: pet.petName || null
      }
    }));
    return {
      pets, session: current, rules: getBattleRules(), selectedPetId: companions?.getSelections?.(owner)?.battlePetId || null,
      online: { enabled: status.enabled, configured: status.configured, available: status.available },
      reports: this.localReports(owner,{}), opponents: this.opponents()
    };
  }

  isCloud(owner) {return !this.qa&&Boolean(this.online.cloudProvider)&&this.services.get('accounts')?.privateSession?.()?.authKind==='supabase'&&this.verifiedOwner()===owner;}

  async cloudCommand(owner,type,input,invoke,inputActionId) {
    if(!this.isCloud(owner))return invoke(undefined);
    const actionId=inputActionId||this.store.pendingCommand(owner,type,input),prior=this.store.action(owner,actionId);
    if(inputActionId){if(prior&&(prior.command.type!==`cloud:${type}`||!sameCommandInput(type,prior.command.input,input)))throw fail('ACTION_CONFLICT','操作编号与原请求不一致');if(prior?.result)return prior.result;if(!prior)this.store.reserveTransport(owner,actionId,actionId,{type:`cloud:${type}`,input});}
    const result=await invoke(actionId);this.assertOwner(owner);this.store.resolve(owner,actionId,result);return result;
  }

  async saveCloudTraining(owner,response) {
    this.assertOwner(owner);const session=response.session;
    if(!session||session.mode!=='training'||session.context?.cloudUserId!==owner||session.context?.authority!=='supabase')throw fail('INVALID_CLOUD_SESSION','云端训练归属不一致');
    if(response.proof){const applied=Boolean(this.store.reward(owner,session.id)),needs=this.services.get('backups')?.adapters.get('battle')?.needsAuthorityProjection?.(owner,session.id);if(!applied||needs)await this.cloud.apply(owner,response.proof,{projectionOnly:applied});this.assertOwner(owner);return this.store.session(owner,session.id);}
    if(session.status==='abandoned')return this.services.db.transaction(()=>this.finish(owner,session,'abandoned'))();
    return this.store.save(owner,session);
  }

  rules(_payload, context) { this.owner(context); return getBattleRules(); }

  opponents() {
    const catalog = require('../resources/assets/roster-v2/catalog.json');
    return [...ELEMENTS].map(element => catalog.characters.find(character => character.element === element)).filter(Boolean).map(character => ({
      petId: `training-${character.element}`, petName: character.name, element: character.element, level: 1,
      resourceRef: character.resourceId, appearance2d: character.resourceId, resource: { resourceId: character.resourceId, kind: '2d' }
    }));
  }

  requireSession(owner, sessionId) {
    const session = sessionId ? this.store.session(owner, text(sessionId, "对战编号")) : this.store.latest(owner);
    if (!session) throw fail("BATTLE_NOT_FOUND", "未找到当前账号的对战");
    return presentSession({ ...session, rules: session.rules || getBattleRules() });
  }

  startLocal(owner, input, mode, challenge) {
    const actionId = text(input.actionId, "操作编号");
    const old = this.store.action(owner, actionId);
    if (old) {
      if (old.command.type !== `start:${mode}` || old.command.petId !== input.petId || old.command.challengeId !== challenge.id) {
        throw fail("ACTION_CONFLICT", "这个操作编号已用于另一项操作");
      }
      return this.store.session(owner, old.sessionId);
    }
    if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "请先完成或离开当前对战");
    const player = this.ownedPet(owner, input.petId);
    const opponent = copy(challenge.opponent);
    if (!opponent?.petId || !ELEMENTS.has(opponent.element)) throw fail("INVALID_OPPONENT", "挑战对象信息不完整");
    opponent.appearance2d = appearance2d(opponent);
    const engine = new BattleRuntimeService();
    const session = {
      id: `battle-${randomUUID()}`, mode, status: "active", startedAt: new Date().toISOString(),
      player, enemy: opponent, snapshot: engine.reset({ playerElement: player.element, enemyElement: opponent.element }),
      rounds: [], winner: null, pendingAction: null, historyComplete: true, rules: getBattleRules(),
      context: { ...copy(challenge), authority: this.qa ? 'simulated' : 'local', ...(this.qa ? { scenarioId: this.qa.runId } : {}), opponent: undefined }
    };
    return this.services.db.transaction(() => {
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "当前账号已有进行中的对战");
      this.selectPet({ petId: player.petId, actionId: `${actionId}:selection` }, { ownerAccountId: owner });
      this.store.reserve(owner, actionId, session.id, { type: `start:${mode}`, petId: player.petId, challengeId: challenge.id });
      const saved = this.store.save(owner, session);
      this.store.resolve(owner, actionId, saved);
      return saved;
    })();
  }

  startTraining(payload, context) {
    const owner = this.owner(context);
    if (!ELEMENTS.has(payload.enemyElement)) throw fail("INVALID_ELEMENT", "请选择训练对手的五行");
    const opponent = this.opponents().find(pet => pet.element === payload.enemyElement);
    if (!opponent) throw fail('ELEMENT_ROSTER_MISSING', `${ELEMENT_NAMES[payload.enemyElement]}系伙伴尚未就绪`);
    if(this.isCloud(owner))return this.serial(owner,async()=>{
      this.user(owner);this.ownedPet(owner,payload.petId);
      await this.selectPet({petId:payload.petId,actionId:`${text(payload.actionId,'操作编号')}:selection`},{ownerAccountId:owner});this.assertOwner(owner);
      const response=await this.cloudCommand(owner,'training-start',{petId:payload.petId,enemyElement:payload.enemyElement},actionId=>this.online.invoke('start_training',{actionId,petId:payload.petId,enemyElement:payload.enemyElement}),payload.actionId);
      const current=await this.online.invoke('get_training',{sessionId:response.session.id});return this.saveCloudTraining(owner,current);
    });
    return this.serial(owner, () => this.startLocal(owner, payload, "training", {
      id: `training:${payload.enemyElement}`,
      opponent
    }));
  }

  beginWildChallenge(input) {
    const owner = this.owner(input);
    if (this.locks.has(owner)) throw fail("BATTLE_BUSY", "对战操作正在处理中，请稍后重试");
    return this.startLocal(owner, input, "wild", input.challenge);
  }

  beginTerritoryChallenge(input) {
    const owner = this.owner(input);
    if (this.locks.has(owner)) throw fail("BATTLE_BUSY", "对战操作正在处理中，请稍后重试");
    // Only trusted main-process garden adapters can supply a defender.
    return this.startLocal(owner, input, "territory", input.challenge);
  }

  snapshot(payload, context) {
    const owner = this.owner(context);
    return this.requireSession(owner, payload.sessionId);
  }

  qaPreset(payload, context) {
    const owner = this.owner(context);
    if (!this.qa) throw fail('QA_DISABLED', '场景不可用');
    if (this.services.get('accounts')?.privateSession?.()?.provider !== 'local') throw fail('QA_ACCOUNT_REQUIRED', '需要本机场景账号');
    return this.serial(owner, async () => {
      const session = this.requireSession(owner, payload.sessionId);
      const presets = { charged: { player: { hp: 85, anger: 50 }, enemy: { hp: 100, anger: 30 } }, finisher: { player: { hp: 120, anger: 50 }, enemy: { hp: 12, anger: 0 } }, defending: { player: { hp: 12, anger: 0 }, enemy: { hp: 120, anger: 50 } } };
      if (session.status !== 'active' || session.snapshot.round !== 0 || !presets[payload.preset]) throw fail('QA_PRESET_INVALID', '仅支持未出招场景的合法前态');
      if (session.mode === 'friend') {
        const user = this.user(owner);
        session.context.qaPreset = payload.preset; this.store.save(owner, session);
        await this.online.invoke('qa_set_state', { userId: user.id, sessionToken: user.sessionToken, roomId: session.room.id, preset: payload.preset });
        return this.syncInternal(owner, session);
      }
      const engine = new BattleRuntimeService();
      engine.restore({ ...session.snapshot, player: { ...session.snapshot.player, ...presets[payload.preset].player }, enemy: { ...session.snapshot.enemy, ...presets[payload.preset].enemy } });
      session.snapshot = engine.snapshot(); session.context.qaPreset = payload.preset;
      if (payload.enemyAction != null) {
        if (!ACTIONS.has(payload.enemyAction)) throw fail('QA_PRESET_INVALID', '无效场景行动');
        session.context.qaEnemyAction = payload.enemyAction;
      }
      return this.store.save(owner, session);
    });
  }

  selectPet(payload, context) {
    const owner = this.owner(context);
    const pet = this.ownedPet(owner, payload.petId);
    const companions = this.services.get("companions");
    if (companions?.select) {
      const result = companions.select(owner, { actionId: text(payload.actionId, "操作编号"), petId: pet.petId, slot: "battlePetId" });
      if(result?.then)return result.then(value=>{this.assertOwner(owner);if(value?.ok===false)throw fail(value.code,value.message);return this.ownedPet(owner,payload.petId);});
      if (result?.ok === false) throw fail(result.code, result.message);
    }
    return pet;
  }

  applyReward(owner, session, proof = null) {
    const existing = this.store.reward(owner, session.id);
    if (existing) return this.applySeeds(owner, session, existing);
    const experience = session.winner === "player" ? 20 : 5;
    const cloudOwner = session.mode === "friend" ? session.context?.cloudUserId || owner : owner;
    const actionId = `battle:${session.room?.id || session.id}:${cloudOwner}`;
    const reward = { actionId, petId: session.player.petId, experience, applied: false };
    if (session.mode === "friend" && !proof) return { ...reward, pendingReason: session.settlementError || "等待云端确认结算" };
    if (session.mode === "friend" && (proof.owner_account_id !== cloudOwner || proof.room_id !== session.room.id ||
        proof.pet_id !== session.player.petId || proof.action_id !== actionId ||
        proof.experience !== experience || proof.won !== (session.winner === "player"))) {
      throw fail("INVALID_SETTLEMENT_PROOF", "云端结算凭据与本场对战不一致");
    }
    const companions = this.services.get("companions");
    if (!companions?.awardBattleResult && !companions?.applyGrowthInTransaction) return { ...reward, pendingReason: "等待伙伴养成服务接入" };
    const previous = companions.getPet?.(owner, session.player.petId)?.growth;
    const result = companions.awardBattleResult ? companions.awardBattleResult({
      ownerAccountId: owner, petId: session.player.petId, actionId,
      won: session.winner === "player", experience, proof
    }) : companions.applyGrowthInTransaction(owner, {
      actionId, petId: session.player.petId,
      effect: { experience, wins: session.winner === "player" ? 1 : 0 }
    });
    if (result?.then) throw fail("ASYNC_TRANSACTION_ADAPTER", "养成结算适配必须在同一事务中同步执行");
    if (!result || result.ok === false) throw fail(result?.code || "REWARD_FAILED", result?.message || "伙伴经验结算失败");
    const growth = result.data?.pet?.growth || result.pet?.growth;
    const applied = { ...reward, actionId, petId: session.player.petId, experience, applied: true,
      ...(previous ? { previousExperience: previous.experience, previousLevel: previous.level } : {}),
      ...(growth ? { currentExperience: growth.experience, currentLevel: growth.level } : {})
    };
    this.store.saveReward(owner, session, applied);
    return this.applySeeds(owner, session, applied);
  }

  applySeeds(owner, session, reward) {
    const garden = this.services.get("garden");
    if (!reward.applied || reward.seeds || !garden?.grantSeeds) return reward;
    const result = garden.grantSeeds({ ownerAccountId: owner },
      { actionId: `${reward.actionId}:seeds`, receiptId: session.id, source: "battle" },
      { ownerAccountId: owner, id: session.id, source: "battle", eligible: true });
    if (result?.then) throw fail("ASYNC_TRANSACTION_ADAPTER", "种子结算适配必须同步执行");
    if (!result || (result.ok === false && result.code !== "REWARD_ALREADY_CLAIMED")) throw fail(result?.code || "SEED_REWARD_FAILED", result?.message || "种子奖励结算失败");
    const next = { ...reward, seeds: result.code === "REWARD_ALREADY_CLAIMED" ? { alreadyClaimed: true } : result.data || result };
    this.services.db.prepare("UPDATE battle_reward_receipts SET data_json=? WHERE owner_account_id=? AND session_id=?").run(JSON.stringify(next), owner, session.id);
    return next;
  }

  finish(owner, session, status = "finished", proof = null) {
    session.endedAt ||= new Date().toISOString();
    session.status = status;
    session.pendingAction = null;
    if (status === "finished" && session.winner) session.reward = this.applyReward(owner, session, proof);
    session.reportId = session.id;
    const saved = this.store.save(owner, session);
    this.store.saveReport(owner, {
      id: session.id, sessionId: session.id, mode: session.mode, status, winner: session.winner,
      player: session.player, enemy: session.enemy, startedAt: session.startedAt, endedAt: session.endedAt,
      rounds: session.rounds, reward: session.reward || null, historyComplete: session.historyComplete,
      context: session.context, rules: session.rules || getBattleRules()
    },{protocol:session.mode==='friend'&&session.context?.authority==='supabase'&&!session.reward?.applied});
    return saved;
  }

  act(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      const actionId = text(payload.actionId, "操作编号");
      if (!ACTIONS.has(payload.action)) throw fail("INVALID_ACTION", "无效的战斗行动");
      let session = this.requireSession(owner, payload.sessionId);
      const receipt = this.store.action(owner, actionId);
      if (receipt) {
        if (receipt.sessionId !== session.id || receipt.command.action !== payload.action) throw fail("ACTION_CONFLICT", "操作编号与原行动不一致");
        if (receipt.result) return this.store.session(owner, receipt.sessionId);
      }
      if (session.status !== "active") throw fail("BATTLE_NOT_ACTIVE", "当前对战不能提交行动");
      if (payload.expectedRound != null && payload.expectedRound !== session.snapshot.round + 1 && !receipt) throw fail("ROUND_CONFLICT", "回合已更新，请先同步");
      if (session.pendingAction && session.pendingAction.actionId !== actionId) throw fail("ACTION_PENDING", "本回合行动已锁定，请等待对手或重新同步");
      if(session.mode==='training'&&session.context?.authority==='supabase') {
        this.user(owner);const roundNo=receipt?.command.roundNo||session.snapshot.round+1;
        if(!receipt)this.store.reserveTransport(owner,actionId,session.id,{action:payload.action,roundNo});
        session.pendingAction={actionId,action:payload.action,roundNo,uncertain:true};this.store.save(owner,session);
        try {const response=await this.online.invoke('training_action',{sessionId:session.id,actionId,action:payload.action,roundNo});const saved=await this.saveCloudTraining(owner,response);this.store.resolve(owner,actionId,saved);return saved;}
        catch(error){this.assertOwner(owner);throw fail('ONLINE_ACTION_UNCERTAIN',`训练结果待云端确认，请同步原回合。${friendlyError(error)}`);}
      }
      if (session.mode === "friend") return this.actOnline(owner, session, { ...payload, actionId }, receipt);
      return this.services.db.transaction(() => {
        if (!receipt) this.store.reserve(owner, actionId, session.id, { action: payload.action, roundNo: session.snapshot.round + 1 });
        const engine = new BattleRuntimeService();
        engine.restore(session.snapshot);
        const scripted = this.qa && session.context?.qaEnemyAction || this.qa?.enemyActions?.[session.mode]?.[session.snapshot.round % this.qa.enemyActions[session.mode].length];
        const result = scripted ? (() => { const roundResult = executeRound(engine.session, payload.action, scripted); return { state: engine.snapshot(), roundResult }; })() : engine.act(payload.action);
        session.snapshot = result.state;
        session.rounds.push({ ...result.roundResult, state: result.state });
        session.winner = result.roundResult.winner;
        session = session.winner ? this.finish(owner, session) : this.store.save(owner, session);
        this.store.resolve(owner, actionId, session);
        return session;
      })();
    });
  }

  async actOnline(owner, session, payload, receipt) {
    this.user(owner);
    if (this.online.getStatus().room?.id !== session.room.id) await this.online.syncRoom({ roomId: session.room.id, roundsLimit: 50 });
    this.assertOwner(owner);
    const roundNo = receipt?.command.roundNo || session.room.current_round;
    if (!receipt) (this.isCloud(owner)?this.store.reserveTransport:this.store.reserve).call(this.store,owner,payload.actionId,session.id,{action:payload.action,roundNo});
    session.pendingAction = { actionId: payload.actionId, action: payload.action, roundNo, uncertain: true };
    this.store.save(owner, session);
    try {
      await this.online.submitAction({ actionId: payload.actionId, action: payload.action, roundNo, waitForResolution: false });
      this.assertOwner(owner);
      session = this.requireSession(owner, session.id);
      if (session.pendingAction) session.pendingAction.uncertain = false;
      this.store.save(owner, session);
      return await this.syncInternal(owner, session);
    } catch (error) {
      // Keep the original action/round for recovery. Never retry as a fresh action.
      this.assertOwner(owner);
      throw fail("ONLINE_ACTION_UNCERTAIN", `行动结果待确认，请同步原回合。${friendlyError(error)}`);
    }
  }

  retryAction(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      let session = this.requireSession(owner, payload.sessionId);
      if (!session.pendingAction || session.mode !== "friend"&&session.context?.authority!=='supabase') throw fail("NO_PENDING_ACTION", "当前没有待确认的原行动");
      // Sync first: a resolved last round must never become a command for the next round.
      session = await this.syncInternal(owner, session);
      if (!session.pendingAction) return session;
      const pending = session.pendingAction;
      if(session.mode==='training') {
        this.user(owner);const response=await this.online.invoke('training_action',{sessionId:session.id,actionId:pending.actionId,action:pending.action,roundNo:pending.roundNo});const saved=await this.saveCloudTraining(owner,response);this.store.resolve(owner,pending.actionId,saved);return saved;
      }
      return this.actOnline(owner, session, pending, this.store.action(owner, pending.actionId));
    });
  }

  async search(payload, context) {
    const owner = this.owner(context); this.user(owner);
    const result = await this.online.searchAccounts({ keyword: String(payload.keyword || "").trim().slice(0, 80), limit: 20 });
    this.assertOwner(owner);
    return result.users.map(({ id, account, username }) => ({ id, account, username }));
  }

  async invitations(_payload, context) {
    const owner = this.owner(context); this.user(owner);
    const result = await this.online.listDuelRequests();
    this.assertOwner(owner);
    return { inbound: result.inbound, outbound: result.outbound };
  }

  async invite(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      this.ownedPet(owner, payload.petId);
      const targetAccount=text(payload.targetAccount,'对方账号');
      const allowResend=Boolean(payload.allowResend);
      const result = await this.cloudCommand(owner,'invite',{targetAccount,allowResend},actionId=>this.online.sendDuelRequest({ actionId, targetAccount, allowResend }));
      this.assertOwner(owner);
      if (result.ok === false) throw fail("INVITE_COOLDOWN", result.retryAfterSeconds ? `请在 ${result.retryAfterSeconds} 秒后重发` : "邀请发送失败");
      // Persist chosen combatant separately from desktop/chat selection.
      if (result.request?.id) {
        const key = `invite:${result.request.id}`;
        if (!this.store.action(owner, key)) {
          (this.isCloud(owner)?this.store.reserveTransport:this.store.reserve).call(this.store,owner,key,key,{petId:payload.petId,type:'invite'});
        }
      }
      return result.request;
    });
  }

  async cancelInvite(payload, context) {
    const owner = this.owner(context); this.user(owner);
    const requestId=text(payload.requestId,'邀请编号');
    const result = await this.cloudCommand(owner,'cancel',{requestId},actionId=>this.online.cancelDuelRequest({actionId,requestId}),`cancel:${requestId}`);
    this.assertOwner(owner);
    return result.request;
  }

  async respondInvite(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      const requestId = text(payload.requestId, "邀请编号");
      if (!["accept", "reject"].includes(payload.decision)) throw fail("INVALID_DECISION", "请选择接受或婉拒");
      const requests = await this.online.listDuelRequests();
      this.assertOwner(owner);
      const request = requests.inbound.find(item => item.id === requestId);
      if (!request) throw fail("INVITE_NOT_FOUND", "未找到发给当前账号的邀请");
      if (payload.decision === "reject") {
        const rejected = await this.cloudCommand(owner,'reject',{requestId},actionId=>this.online.respondDuelRequest({actionId,requestId,decision:'reject'}),`reject:${requestId}`);
        this.assertOwner(owner);
        return { request: rejected.request, session: null };
      }
      const key = `accept:${requestId}`,original=this.store.action(owner,key);
      if(original&&original.command.petId!==payload.petId)throw fail('PET_ROOM_MISMATCH','请使用原邀请绑定的伙伴');
      if (request.status === "accepted" && request.roomId) {
        const saved = this.store.roomSession(owner, request.roomId);
        if(saved)return {request,session:await this.syncInternal(owner,saved)};
        const synced=await this.online.syncRoom({roomId:request.roomId,roundsLimit:50});this.assertOwner(owner);
        const petId=original?.command.petId||payload.petId;
        if(original&&!original.result)this.store.resolve(owner,key,{room:synced.room});
        return {request,session:await this.syncInternal(owner,this.bindRoom(owner,synced.room,petId))};
      }
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "请先完成当前对战再接受邀请");
      const pet = this.ownedPet(owner, payload.petId);
      // Reuse a room after a lost response; do not create a second room for one acceptance.
      let pending = original?.result;
      if (!pending) {
        if(!original)(this.isCloud(owner)?this.store.reserveTransport:this.store.reserve).call(this.store,owner,key,key,{petId:payload.petId,type:'accept'});
        const created = await this.online.createRoom({ actionId:key, petId: pet.petId, requestId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element });
        this.assertOwner(owner);
        pending = { room: created.room };
        this.store.resolve(owner, key, pending);
      }
      const accepted = await this.cloudCommand(owner,'accept-confirm',{requestId,roomId:pending.room.id,roomCode:pending.room.room_code,roomStatus:pending.room.status},actionId=>this.online.respondDuelRequest({actionId,requestId,decision:'accept',roomId:pending.room.id,roomCode:pending.room.room_code,roomStatus:pending.room.status}),`accept-confirm:${requestId}`);
      this.assertOwner(owner);
      const synced = await this.online.syncRoom({ roomId: pending.room.id, roundsLimit: 50 });
      this.assertOwner(owner);
      return { request: accepted.request, session: this.bindRoom(owner, synced.room, payload.petId) };
    });
  }

  bindRoom(owner, room, petId) {
    const existing = this.store.roomSession(owner, room.id);
    if (existing) return existing;
    const player = this.ownedPet(owner, petId);
    const user = this.user(owner);
    const side = room.host_user_id === user.id ? "host" : room.guest_user_id === user.id ? "guest" : null;
    if (!side) throw fail("ROOM_FORBIDDEN", "当前账号不是房间参与者");
    const peer = side === "host" ? "guest" : "host";
    if (room[`${side}_element`] !== player.element) throw fail("PET_ROOM_MISMATCH", "该伙伴五行与房间不一致，请使用原出战伙伴");
    if (room[`${side}_pet_id`] && room[`${side}_pet_id`] !== player.petId) throw fail("PET_ROOM_MISMATCH", "请使用房间绑定的原出战伙伴");
    const session = {
      id: `online-${room.id}`, mode: "friend", status: room.status === "waiting" ? "waiting" : "active",
      startedAt: room.created_at || new Date().toISOString(), player,
      enemy: { petId: room[`${peer}_pet_id`] || room[`${peer}_user_id`] || "waiting-peer", petName: room[`${peer}_pet_name`] || "等待好友", element: room[`${peer}_element`] || "wood", level:room[`${peer}_pet_level`]||1, appearance2d: room[`${peer}_resource_id`] || appearance2d({ element: room[`${peer}_element`] }) },
      snapshot: this.online.toBattleState(), room: copy(room), side,
      rounds: [], winner: null, pendingAction: null, historyComplete: true, rules: getBattleRules(),
      context: { authority: this.qa ? 'simulated' : 'supabase', cloudUserId: user.id, ...(this.qa ? { scenarioId: this.qa.runId } : {}) }
    };
    return this.store.save(owner, session);
  }

  async createRoom(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "已有待完成的对战，请先恢复或离开");
      const pet = this.ownedPet(owner, payload.petId);
      const created = await this.cloudCommand(owner,'create',{petId:pet.petId},actionId=>this.online.createRoom({ actionId,petId: pet.petId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element }));
      this.assertOwner(owner);
      return this.bindRoom(owner, created.room, pet.petId);
    });
  }

  joinRoom(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => this.joinInternal(owner, payload));
  }

  async joinInternal(owner, payload) {
    this.user(owner);
    const active = this.store.latest(owner);
    const roomCode = text(payload.roomCode, "房间码").toUpperCase();
    if (active && active.room?.room_code !== roomCode) throw fail("BATTLE_IN_PROGRESS", "请先完成或离开当前对战");
    const petId = payload.requestId ? this.store.action(owner, `invite:${payload.requestId}`)?.command.petId || payload.petId : payload.petId;
    const pet = this.ownedPet(owner, petId);
    const joined = await this.cloudCommand(owner,'join',{roomCode,petId:pet.petId},actionId=>this.online.joinRoom({ actionId,roomCode, petId: pet.petId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element }));
    this.assertOwner(owner);
    return this.syncInternal(owner, this.bindRoom(owner, joined.room, pet.petId));
  }

  sync(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => this.syncInternal(owner, this.requireSession(owner, payload.sessionId)));
  }

  async syncInternal(owner, session) {
    if(session.mode==='training'&&session.context?.authority==='supabase') {
      this.user(owner);const response=await this.online.invoke('get_training',{sessionId:session.id});this.assertOwner(owner);
      const pending=session.pendingAction;if(pending&&response.session?.snapshot.round<pending.roundNo)response.session.pendingAction=pending;
      const saved=await this.saveCloudTraining(owner,response);if(pending&&saved.snapshot.round>=pending.roundNo)this.store.resolve(owner,pending.actionId,saved);return saved;
    }
    if (session.mode !== "friend") return session;
    this.user(owner);
    const response = await this.online.syncRoom({ roomId: session.room.id, roundsLimit: 50 });
    this.assertOwner(owner);
    session = this.requireSession(owner, session.id);
    let room = response.room;
    const rounds = new Map(session.rounds.map(round => [round.round, round]));
    let page = response.rounds || [];
    for (let pageNo = 0; pageNo < 100; pageNo++) {
      for (const round of page) {
        const mapped = this.online.mapRoundToBattleResult(round);
        rounds.set(round.round_no, { ...mapped.roundResult, state: mapped.state });
      }
      // Pagination awaits can also receive a newer room through get_room or Realtime.
      // Include its new rounds before declaring the saved history complete.
      const liveRoom = this.online.getStatus().room;
      if (liveRoom?.id === room.id) room = liveRoom;
      const last = Number(room.last_resolved_round || 0);
      let missing = 1;
      while (missing <= last && rounds.has(missing)) missing++;
      if (missing > last) break;
      const before = Math.min(last + 1, ...[...rounds.keys()].filter(number => number > missing));
      const earlier = await this.online.syncRoom({ roomId: room.id, roundsLimit: 50, beforeRound: before });
      this.assertOwner(owner);
      page = (earlier.rounds || []).filter(round => round.round_no < before && !rounds.has(round.round_no));
      if (!page.length) break;
    }
    const latestRoom = this.online.getStatus().room;
    if (latestRoom?.id === room.id) room = latestRoom;
    session.room = copy(room);
    session.snapshot = this.online.toBattleState();
    const peer = session.side === "host" ? "guest" : "host";
    session.enemy = { ...session.enemy, petId: room[`${peer}_pet_id`] || room[`${peer}_user_id`] || "waiting-peer", petName: room[`${peer}_pet_name`] || "等待好友", element: room[`${peer}_element`] || "wood", level:room[`${peer}_pet_level`]||1, appearance2d: room[`${peer}_resource_id`] || appearance2d({ element: room[`${peer}_element`] }) };
    session.rounds = [...rounds.values()].sort((a, b) => a.round - b.round);
    session.historyComplete = session.rounds.length === Number(room.last_resolved_round || 0) && session.rounds.every((round, index) => round.round === index + 1);
    const pending = session.pendingAction;
    if(response.pendingAction) {
      const own=response.pendingAction;
      if(pending&&pending.roundNo===own.roundNo&&(pending.actionId!==own.actionId||pending.action!==own.action))this.store.resolve(owner,pending.actionId,{sessionId:session.id,supersededBy:own.actionId,reason:'server-locked-original'});
      session.pendingAction={...own,uncertain:false};
      if(!this.store.action(owner,own.actionId))(this.isCloud(owner)?this.store.reserveTransport:this.store.reserve).call(this.store,owner,own.actionId,session.id,{action:own.action,roundNo:own.roundNo});
    }
    if (pending && rounds.has(pending.roundNo)) {
      session.pendingAction = null;
    }
    session.winner = room.winner_side === session.side ? "player" : room.winner_side ? "enemy" : null;
    let proof = null;
    const applied=Boolean(this.store.reward(owner,session.id)),projectionOnly=applied&&this.isCloud(owner);
    if (room.status === "finished" && session.winner && (!applied||projectionOnly)) {
      this.user(owner);
      try {
        proof = await this.online.invoke("claim_battle_settlement", { roomId: room.id, petId: session.player.petId });
        this.assertOwner(owner);
        if(this.isCloud(owner)) {await this.cloud.apply(owner,proof,{projectionOnly:Boolean(projectionOnly)});this.assertOwner(owner);const saved=this.store.session(owner,session.id);if(pending&&rounds.has(pending.roundNo))this.store.resolve(owner,pending.actionId,saved);return saved;}
      } catch (error) {
        this.assertOwner(owner);
        if(projectionOnly)throw error;
        session.settlementError = friendlyError(error);
      }
    }
    return this.services.db.transaction(() => {
      if(this.isCloud(owner)&&room.status==='finished'&&!this.store.reward(owner,session.id)){session.endedAt=room.updated_at;session.reward={actionId:`battle:${room.id}:${owner}`,petId:session.player.petId,experience:session.winner==='player'?20:5,applied:false,pendingReason:session.settlementError||'等待云端结算读回'};session.status='finished';session.reportId=session.id;const saved=this.store.save(owner,session);this.store.saveReport(owner,{id:session.id,sessionId:session.id,mode:session.mode,status:session.status,winner:session.winner,player:session.player,enemy:session.enemy,startedAt:session.startedAt,endedAt:session.endedAt,rounds:session.rounds,reward:session.reward,historyComplete:session.historyComplete,context:session.context,rules:session.rules},{protocol:true});return saved;}
      if (room.status === "finished") session = this.finish(owner, session, "finished", proof);
      else if (room.status === "abandoned") session = this.finish(owner, session, "abandoned");
      else { session.status = room.status === "waiting" ? "waiting" : "active"; session = this.store.save(owner, session); }
      if (pending && rounds.has(pending.roundNo)) this.store.resolve(owner, pending.actionId, session);
      return session;
    })();
  }

  leave(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      let session = this.requireSession(owner, payload.sessionId);
      if (["finished", "abandoned"].includes(session.status)) return session;
      if(session.mode==='training'&&session.context?.authority==='supabase') {this.user(owner);const response=await this.cloudCommand(owner,'training-leave',{sessionId:session.id},actionId=>this.online.invoke('leave_training',{sessionId:session.id,actionId}));return this.saveCloudTraining(owner,response);}
      if (session.mode === "friend") {
        this.user(owner);
        // Unlike the compatibility service's best-effort leave, require server acknowledgment.
        const result = await this.cloudCommand(owner,'leave',{roomId:session.room.id},actionId=>this.online.invoke("leave_room", { actionId, roomId: session.room.id, reason: "user_leave" }));
        this.assertOwner(owner);
        if (result.room?.status === "finished") return this.syncInternal(owner, session);
        session.room = result.room || session.room;
        await this.online.clearRoomState({ notify: true, reason: "left" });
        this.assertOwner(owner);
      }
      return this.services.db.transaction(() => this.finish(owner, session, "abandoned"))();
    });
  }

  retrySettlement(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => {
      const session = this.requireSession(owner, payload.sessionId);
      if (session.status !== "finished" || !session.winner) throw fail("BATTLE_UNFINISHED", "这场对战还没有可领取的结算");
      return session.mode === "friend" ? this.syncInternal(owner, session) : this.services.db.transaction(() => this.finish(owner, session))();
    });
  }

  listReports(payload, context) {
    const owner = this.owner(context);
    if(this.isCloud(owner))return this.refreshCloudReports(owner).then(()=>this.localReports(owner,payload));
    return this.localReports(owner,payload);
  }

  async refreshCloudReports(owner) {
    const actor=await this.services.get('cloudActor').requireActor(),remote=await actor.invoke('lingjing-save',{op:'read'});this.assertOwner(owner);
    if(!remote?.envelope)return;
    const backups=this.services.get('backups');backups.validate(remote.envelope,owner);
    const module=remote.envelope.data.modules.battle;if(!module)return;
    const adapter=backups.adapters.get('battle');
    // The cloud keeps its four-array v1 format; local v2 additionally owns a
    // transport journal. A supported local backup is not a cloud report source.
    if(module.version!==1||!adapter||!(module.version===adapter.version||adapter.versions?.includes(module.version)))throw fail('INVALID_BATTLE_BACKUP','云端战报版本不兼容');
    if(adapter.validateModule)adapter.validateModule(module,owner);
    else adapter.validate(module.data,owner);
    // Read-only cloud projections populate only the report cache. They cannot
    // award XP/seeds or overwrite an independent local companion/inventory unit.
    this.services.db.transaction(()=>{for(const row of module.data.reports)this.store.saveRawReport(owner,row,{preserveExisting:true});})();
  }

  localReports(owner,payload) {
    const reports = this.store.reports(owner, payload.limit);
    const legacy = this.ownedLegacy(owner)?.battleReports || [];
    const known = new Set(reports.map(report => report.sessionId));
    for (const report of legacy) {
      if (!known.has(report.sessionId)) reports.push({ ...report, id: `legacy:${report.id}`, legacy: true, historyComplete: false,
        endedAt: report.endedAt || report.startedAt || '',
        rounds: (report.rounds || []).map(round => ({ ...round, actions: round.actions || { player: round.playerAction, enemy: round.enemyAction } }))
      });
    }
    return reports.sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, Math.max(1, Math.min(200, Number(payload.limit) || 60))).map(presentReport);
  }

  getReport(payload, context) {
    const owner = this.owner(context);
    const report = this.store.report(owner, text(payload.reportId, "战报编号")) || this.localReports(owner,{limit:200}).find(item=>item.id===payload.reportId);
    if(!report&&this.isCloud(owner))return this.refreshCloudReports(owner).then(()=>{const saved=this.store.report(owner,payload.reportId);if(!saved)throw fail('REPORT_NOT_FOUND','未找到当前账号的战报');return presentReport(saved);});
    if (!report) throw fail("REPORT_NOT_FOUND", "未找到当前账号的战报");
    return presentReport(report);
  }

  getOutcome(input) {
    const owner = this.owner(input);
    const session = this.requireSession(owner, input.sessionId);
    return { session, won: session.status === "finished" && session.winner === "player", settled: session.status === "finished" };
  }

  context(payload, context) {
    const owner = this.owner(context), session = this.requireSession(owner, payload.sessionId);
    if (session.mode === 'wild') {
      return this.services.get('discovery')?.getBattleContext?.({ ownerAccountId: owner, sessionId: session.id }) || { returnTo: '/discovery' };
    }
    if (session.mode === 'territory') {
      return this.services.get('garden')?.getBattleContext?.({ ownerAccountId: owner, sessionId: session.id }) || { returnTo: '/garden' };
    }
    return { returnTo: session.mode === 'friend' ? '/battle/friends' : '/battle' };
  }

  settleContext(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      const session = this.requireSession(owner, payload.sessionId);
      if (session.status !== 'finished' || !session.winner || session.mode === 'wild' && session.winner !== 'player') throw fail('VICTORY_REQUIRED', session.mode === 'wild' ? '胜利后可收服' : '对战结束后可确认');
      const adapter = this.services.get(session.mode === 'wild' ? 'discovery' : session.mode === 'territory' ? 'garden' : '');
      if (!adapter?.settleBattleContext) throw fail('NO_CONTEXT_ACTION', '本场结算已自动保存');
      const result = await adapter.settleBattleContext({ ownerAccountId: owner, sessionId: session.id, actionId: text(payload.actionId, '操作编号'), name: payload.name, showOnDesktop: Boolean(payload.showOnDesktop) });
      this.assertOwner(owner);
      if (!result?.ok) throw fail(result?.code || 'CONTEXT_SETTLEMENT_FAILED', result?.message || '确认失败');
      return result.data;
    });
  }

  settleTerritoryChallenge(input) {
    const outcome = this.getOutcome(input);
    if (outcome.session.mode !== "territory" || !outcome.settled) throw fail("TERRITORY_BATTLE_UNFINISHED", "领地挑战尚未完成");
    return { ...outcome, receipt: {
      id: outcome.session.id, actionId: `territory:${outcome.session.id}`, ownerAccountId: this.owner(input),
      territoryId: outcome.session.context?.territoryId || outcome.session.context?.id,
      petId: outcome.session.player.petId, won: outcome.won, authority: outcome.session.context?.authority, verified: true
    } };
  }

  dispose() { this.unsubscribe?.(); this.stopSession?.(); }
}

function friendlyError(error) {
  const message = String(error?.message || error || "服务暂不可用");
  if (/fetch|network|timeout|Failed to send|non-2xx/i.test(message)) return "网络或联机服务暂不可用";
  if (/session|login required/i.test(message)) return "登录状态已失效，请重新登录";
  if (/Unsupported op|schema cache|function.*does not exist/i.test(message)) return "联机服务需要更新战斗恢复与结算接口";
  return message.slice(0, 200);
}
module.exports = { BattleFeatureService, friendlyError };
