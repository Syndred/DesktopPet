const migrations = require("./migrations.cjs");
const { BattleFeatureService, friendlyError } = require("./service.cjs");

module.exports = {
  id: "battle", migrations,
  register(services) {
    const service = new BattleFeatureService(services);
    services.provide("battle", {
      beginWildChallenge: input => service.beginWildChallenge(input),
      beginTerritoryChallenge: input => service.beginTerritoryChallenge(input),
      getOutcome: input => service.getOutcome(input),
      settleTerritoryChallenge: input => service.settleTerritoryChallenge(input)
    });
    const commands = {};
    for (const name of ["overview", "selectPet", "startTraining", "snapshot", "act", "retryAction", "search", "invitations", "invite", "respondInvite", "cancelInvite", "createRoom", "joinRoom", "sync", "leave", "listReports", "getReport", "retrySettlement"]) {
      commands[name] = async (payload = {}, context) => {
        try { return { ok: true, data: await service[name](payload, context) }; }
        catch (error) { return { ok: false, code: error.code || "BATTLE_SERVICE_UNAVAILABLE", message: friendlyError(error) }; }
      };
    }
    return { commands, dispose: () => service.dispose() };
  }
};
