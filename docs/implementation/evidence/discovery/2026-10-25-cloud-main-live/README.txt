Production main / shared BattleScreen evidence, 2026-10-25

Accepted: actual Electron44.9.3, unified Auth and HTTPS, two real UI actions
(normal_attack and element_attack), separate same-owner device/session exact
round readback, immutable action-id conflict, UI leave -> server abandoned,
existing natural28-round victory view, original canonical captured-pet result,
one capture/memory/seed receipt, original20XP and captured0XP, SQLite cold restart.
The original natural victory and normal cloudPreview/backupRestore evidence
remain in ../2026-10-25-cloud-game-live/; no new natural victory was run.

Location for these game actions is explicitly simulated, limited by coordinator
grant cloud-discovery-03. Auth/HTTPS/NPC/engine/rewards/capture are real. These
are separate Electron profiles on one machine, not two physical devices.

Important correction: the first run's report screenshot captured the outgoing
BattleScreen during the page transition. Its whole-report-UI pass is withdrawn.
ui-actions-capture-restart-partial.json preserves the raw original record inside
an explicit passed:false wrapper; its short-action checkpoint remains usable.
Do not publish the discarded existing-cloud-report.png as report-page evidence.

Strict clean c29fb85 source/build rerun verifies original begin receipt recovery
with no location (and after original spawn expiry), server28-round report data,
then exposes a real shared renderer failure:
`Tooltip` must be used within `TooltipProvider`.
See strict-report-render-failure.json and report-tooltip-error.png.
ReportsPanel.tsx:40 renders CombatantStatus, which includes Radix Tooltip.
ReportsPanel has no enclosing TooltipProvider. Suggested minimal shared04 fix:
import TooltipProvider from the existing kit and wrap ReportsPanel's returned
layout. No style, combat rule or stored-state change is needed.03 did not edit
protected04 UI or access its worktree; the coordinator/04 owns that correction.

After the common fix is approved and merged, rerun only existing-state views:
$env:LINGJING_CLOUD_MAIN_CHECKPOINT='docs/implementation/evidence/discovery/2026-10-25-cloud-main-live/ui-actions-capture-restart-partial.json'
node apps/pc-app/runtime/features/discovery/verification/cloud-main-live.mjs
Run from this discovery worktree after npm run build:pc. It reuses the dedicated
profiles in artifacts/cloud-discovery/live-game-1792899947119. The read-only
checkpoint path requires no simulated position fixture or renewed QA grant,
and performs no new battle rounds. A duplicate confirm may add an immutable
operation receipt; it cannot add a pet, growth, memory or seed reward.

native44-final-bounded-retry.json records one final real Windows35s retry:
permission granted; native sourceos; initial2000m, drift rejection, last212m.
The original80m gate remains. No positive precise physical cloud proof is claimed.
The watch was stopped. No additional precision retry loop is planned.
Earlier actual78m physical local-os capture used Electron36.9.5 and remains
separate ../2026-10-25-native-permission-retry/ evidence.

No plaintext passwords, tokens, signer keys or raw native coordinates saved in
these committed records. Encrypted test credentials stay in ignored artifacts.
Remote schema/deployments/grants/admin settings were changed only by coordinator.
