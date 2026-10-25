const migrations = require("./migrations.cjs");
const { BattleFeatureService, friendlyError } = require("./service.cjs");
const { createBattleBackupAdapter } = require("./backup.cjs");
const { registerBattleArt } = require("./assets.cjs");
const { getBattleRules } = require('../../services/battle-runtime.cjs');
const { presentSession } = require('./presentation.cjs');

module.exports = {
  id: "battle", migrations,
  register(services) {
    const service = new BattleFeatureService(services);
    const artReady = registerBattleArt(services);
    void artReady.catch(() => {});
    const removeBackup = services.get("backups")?.register(createBattleBackupAdapter(services.db));
    services.provide("battle", {
      getRules: getBattleRules,
      beginWildChallenge: input => service.beginWildChallenge(input),
      beginTerritoryChallenge: input => service.beginTerritoryChallenge(input),
      getOutcome: input => service.getOutcome(input),
      settleTerritoryChallenge: input => service.settleTerritoryChallenge(input)
    });
    const commands = {};
    const names = ["overview", "rules", "context", "settleContext", "selectPet", "startTraining", "snapshot", "act", "retryAction", "search", "invitations", "invite", "respondInvite", "cancelInvite", "createRoom", "joinRoom", "sync", "leave", "listReports", "getReport", "retrySettlement"];
    if (service.qa) names.push('qaPreset');
    for (const name of names) {
      commands[name] = async (payload = {}, context) => {
        try {
          await artReady;
          // Cloud territory sessions use the same screen/presenter. Their
          // commands stay on the authoritative backend and never run local
          // finish/applyReward. Other modes retain their existing adapters.
          const external=services.get('garden')?.cloudBattles;
          let data = external?.owns(payload,context)?await external.invoke(name,payload,context):await service[name](payload, context);
          if (data?.snapshot) data = presentSession(data);
          else if (data?.session) data = { ...data, session: presentSession(data.session) };
          return { ok: true, data };
        }
        catch (error) { return { ok: false, code: error.code || "BATTLE_SERVICE_UNAVAILABLE", message: friendlyError(error) }; }
      };
    }
    return { commands, dispose: () => { removeBackup?.(); service.dispose(); } };
  }
};
