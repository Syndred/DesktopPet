# Unified battle integration

Latest scope: training, friend rooms, wild encounters and territory challenges share one battle screen, HUD, moves, log, animation controller and actual rules. Approved board `docs/design/2026-10-24/full-ui/02-exploration-and-battle.png` is the visual reference. Wild capture and territory ownership are context-specific settlement actions. They do not define a second arena or calculate a second result.

Battle owns the public session/controller contract and shared React screen. Discovery owns encounter validation/capture; garden owns territory validation/ownership. Foundation integrates their committed delivery, checks the four actual entry paths and rejects independent combat layouts. Existing `BattleSession`/`BattleRulesProfile` and main-process `beginWildChallenge`/`beginTerritoryChallenge` remain the starting contracts; incoming battle contract updates take precedence over assumptions here. No renderer-supplied enemy or owner becomes trusted challenge data.

The full five-element roster must include metal, wood, water, fire and earth. Character identity, canonical resource, element, skill icon, action playback and report must agree. Verify all 25 element pairings, four actions and each actual element trait against the current engine. Preserve the rules and normalized battle health; concept-board example values do not change the engine.

## Foundation QA isolation

`node scripts/acceptance/create-scenario-profile.mjs` creates a **new** folder below `artifacts/qa/unified-battle` and prints its environment. It never marks an existing save as QA. Set both `LINGJING_QA_SCENARIO=unified-battle` and the returned absolute `PET_USER_DATA_DIR` to launch the scenario. The new marker `.lingjing-qa-profile.json` binds the run ID to that exact real directory.

`runtime/core/qa-scenario.cjs` validates the marker before opening saves. Unknown scenarios, copied markers and a legacy store outside the independent directory are rejected. Ordinary startup has no scenario service or scenario flag. Enabling a scenario through renderer IPC is unsupported. A QA restart reuses its own profile and run ID.

Main-only modules can read `services.get('qaScenario')` with `{id,runId,provenance:'simulated',isolated:true,profilePath,descriptor}`. This does not replace adapters by itself. Feature-specific simulated adapters must opt into this verified service and retain their real validation, state, receipts and UI path. Report exactly which transport/location authority is simulated. `app.info.scenario` exposes only the descriptor; a small titlebar flask and tooltip identify the isolated scene. No developer explanations are added to ordinary player pages.

## Delivery and acceptance

Each feature supplies source SHA, actual Electron actions, screenshots and persistent state/receipt readback. Foundation verifies integration; the main chat reviews each module and performs the final independent acceptance. Earlier six-character/portrait screenshots and portable build are historical evidence and do not pass this new four-entry scope. Live cloud availability, real two-device service and precise physical location are deferred for this round; isolated evidence must never be presented as live service success.
