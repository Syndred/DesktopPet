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
    for (const name of ["overview", "rules", "context", "settleContext", "qaPreset", "selectPet", "startTraining", "snapshot", "act", "retryAction", "search", "invitations", "invite", "respondInvite", "cancelInvite", "createRoom", "joinRoom", "sync", "leave", "listReports", "getReport", "retrySettlement"]) {
      commands[name] = async (payload = {}, context) => {
        try {
          await artReady; let data = await service[name](payload, context);
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
