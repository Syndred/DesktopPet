"use strict";
const { createHash } = require('node:crypto');
const seedAction = (source, receiptId) => `seeds:${source}:${createHash('sha256').update(receiptId).digest('hex')}`;

/** Reconcile durable, already settled main-process receipts, never renderer claims.
 * A crash between battle settlement and this step is repaired on next garden open.
 */
async function reconcileSeeds(services, garden, context) {
  const owner = context.ownerAccountId;
  const eligible = [];
  const battle = services.get('battle');
  if (battle?.getOutcome) {
    const reports = await services.invoke('battle', 'listReports', { limit: 200 });
    if (services.session.getOwnerAccountId() !== owner) return;
    if (reports.ok && Array.isArray(reports.data)) {
      for (const report of reports.data) {
        if (report.legacy || report.status !== 'finished' || report.reward?.applied !== true) continue;
        try {
          const outcome = battle.getOutcome({ ownerAccountId: owner, sessionId: report.sessionId });
          if (outcome?.settled && outcome.session?.reward?.applied === true) eligible.push({ source: 'battle', receiptId: report.sessionId });
        } catch { /* A stale legacy report is not a verified reward receipt. */ }
      }
    }
  }
  const discovery = services.get('discovery');
  const captures = discovery?.repo?.captures?.(owner) || [];
  for (const capture of captures) {
    if (!['local-os', 'cloud'].includes(capture.validation) || capture.ownerAccountId !== owner) continue;
    const encounter = discovery.repo.get(owner, capture.encounterId);
    if (encounter?.status === 'captured' && encounter.capturePetId === capture.petId && encounter.battle?.finished && encounter.battle?.winner === 'player') eligible.push({ source: 'exploration', receiptId: capture.encounterId });
  }
  for (const receipt of eligible) {
    if (services.session.getOwnerAccountId() !== owner) return;
    if (services.db.prepare('SELECT 1 FROM garden_reward_receipts WHERE owner_account_id=? AND source=? AND receipt_id=?').get(owner, receipt.source, receipt.receiptId)) continue;
    const result = garden.grantSeeds(context, { ...receipt, actionId: seedAction(receipt.source, receipt.receiptId) }, { id: receipt.receiptId, source: receipt.source, ownerAccountId: owner, eligible: true });
    if (!result.ok && result.code !== 'REWARD_ALREADY_CLAIMED') throw Object.assign(new Error(result.message), { code: result.code });
  }
}
module.exports = { reconcileSeeds, seedAction };
