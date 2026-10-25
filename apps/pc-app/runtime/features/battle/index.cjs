const migrations = require("./migrations.cjs");
const { BattleFeatureService, friendlyError } = require("./service.cjs");
const { createBattleBackupAdapter } = require("./backup.cjs");
const { registerBattleArt } = require("./assets.cjs");
const { getBattleRules } = require('../../services/battle-runtime.cjs');
const { presentSession } = require('./presentation.cjs');
const { createBattleDisplayViews } = require('./display-views.cjs');

module.exports = {
  id: "battle", migrations,
  register(services) {
    const service = new BattleFeatureService(services);
    const displayViews = createBattleDisplayViews({ services, online: service.online, prepareOnline: owner => service.user(owner) });
    // Trusted domain authorities supply already committed sessions. The shared
    // commands/renderer/presenter remain unchanged; no local reward resolver is
    // called for an externally owned session.
    const contextAuthorities = new Map();
    const externalFor = payload => [...contextAuthorities.values()].find(api =>
      typeof payload?.sessionId === 'string' && api.handlesSession(payload.sessionId) ||
      typeof payload?.reportId === 'string' && api.handlesReport?.(payload.reportId));
    const artReady = registerBattleArt(services);
    void artReady.catch(() => {});
    const removeBackup = services.get("backups")?.register(createBattleBackupAdapter(services.db));
    services.provide("battle", {
      getRules: getBattleRules,
      get supportsCloudWild() { return contextAuthorities.has('discovery'); },
      registerContextAuthority(id, api) {
        if (!['discovery','garden'].includes(id) || typeof api?.handlesSession !== 'function' || typeof api?.command !== 'function' || typeof api?.getOutcome !== 'function') throw Object.assign(new Error('领域对战接口无效'),{code:'CONTEXT_AUTHORITY_INVALID'});
        if (contextAuthorities.has(id)) throw Object.assign(new Error('领域对战接口已经注册'),{code:'CONTEXT_AUTHORITY_DUPLICATE'});
        contextAuthorities.set(id,api);return () => contextAuthorities.delete(id);
      },
      beginWildChallenge: input => service.beginWildChallenge(input),
      beginTerritoryChallenge: input => service.beginTerritoryChallenge(input),
      getOutcome: input => {const external=externalFor(input);return external ? external.getOutcome(input) : service.getOutcome(input);},
      settleTerritoryChallenge: input => service.settleTerritoryChallenge(input)
    });
    const commands = {};
    const names = ["overview", "rules", "context", "settleContext", "selectPet", "startTraining", "snapshot", "act", "retryAction", "search", "invitations", "invite", "respondInvite", "cancelInvite", "createRoom", "joinRoom", "sync", "leave", "listReports", "getReport", "retrySettlement"];
    if (service.qa) names.push('qaPreset');
    for (const name of names) {
      commands[name] = async (payload = {}, context) => {
        try {
          await artReady;
          const external=externalFor(payload);
          // Cloud territory sessions use the same screen/presenter. Their
          // commands stay on the authoritative backend and never run local
          // finish/applyReward. Other modes retain their existing adapters.
          const territory=services.get('garden')?.cloudBattles;
          let data = external ? await external.command(name,payload,context) : territory?.owns(payload,context) ? await territory.invoke(name,payload,context) : await service[name](payload, context);
          if(name==='listReports'||name==='overview'){
            const additional=[];for(const api of contextAuthorities.values())if(api.listReports)additional.push(...await api.listReports(context.ownerAccountId));
            const existing=name==='listReports'?data:data.reports||[],merged=[...new Map([...existing,...additional].map(report=>[report.id,report])).values()].sort((a,b)=>String(b.endedAt||'').localeCompare(String(a.endedAt||''))).slice(0,Math.max(1,Math.min(200,Number(payload.limit)||60)));
            data=name==='listReports'?merged:{...data,reports:merged};
          }
          if (data?.snapshot) data = presentSession(data);
          else if (data?.session) data = { ...data, session: presentSession(data.session) };
          return { ok: true, data: await displayViews.project(data, context.ownerAccountId) };
        }
        catch (error) { return { ok: false, code: error.code || "BATTLE_SERVICE_UNAVAILABLE", message: friendlyError(error) }; }
      };
    }
    return { commands, dispose: () => { displayViews.dispose(); contextAuthorities.clear(); removeBackup?.(); service.dispose(); } };
  }
};
