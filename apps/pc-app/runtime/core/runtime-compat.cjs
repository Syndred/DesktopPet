const { join } = require('node:path');
const { RuntimeDataStore } = require('../services/runtime-data-store.cjs');
const { MapRuntimeService } = require('../services/map-runtime.cjs');
const { OnlineDuelService } = require('../services/online-duel-service.cjs');

/** Data/protocol compatibility capabilities; no legacy windows, preload or IPC. */
function createRuntimeCompatibility({ userData, legacyDataFile = join(userData, 'pet-runtime-data.json') }) {
  const runtimeDataStore = new RuntimeDataStore({ filePath: legacyDataFile, sessionFilePath: join(userData, 'pet-auth-session.json'), readOnly: true });
  const mapService = new MapRuntimeService({ providerId: 'tencent' });
  const onlineDuelService = new OnlineDuelService();
  return {
    runtimeDataStore, mapService, onlineDuelService,
    dispose() {
      mapService.dispose();
      // Releasing this client's subscription must not abandon a recoverable room.
      void onlineDuelService.client?.removeAllChannels?.();
    }
  };
}
module.exports = { createRuntimeCompatibility };
