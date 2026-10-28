// Pure preparation guards. No credentials, networking, files or execution side effects.
// Boolean facts model reviewed preconditions only; NEVER treat them as a live DPAPI
// custody capability. A future runner must verify durable same-VM/run/user binding,
// candidate version/digest and <=330min lifetime through the reviewed provider.
import assert from 'node:assert/strict';
export const plannedCAccount='qa20261028c8be246d1';
export function assertCLifecyclePreconditions(stage,s){
 assert.ok(['register','release-business','password-submit','revoke-current-session','persistent-session'].includes(stage));
 assert.equal(s.accountKey,plannedCAccount);assert.equal(s.explicitUserApproval,true);assert.equal(s.auditedPackage,true);assert.equal(s.ownedSupervisorVerified,true);
 assert.equal(s.unknownOutcome,false);assert.equal(s.runBindingValid,true);
 if(stage==='register'){
  assert.equal(s.exactAccountAbsent,true);assert.equal(s.businessHoldInstalledBeforeRegister,true);assert.equal(s.businessHoldContractPassed,true);assert.equal(s.initialSecretCustodyAck,true);assert.equal(s.registrationAlreadySubmitted,false);
 }else{
  assert.equal(s.normalCloudIdentityVerified,true);assert.equal(s.exactCOwnerAuthDevice,true);
  if(stage==='release-business'){assert.equal(s.businessHoldInstalledBeforeRegister,true);assert.equal(s.rootGrantAckExact,true);assert.equal(s.protocolScenarioExact,true);assert.equal(s.noLiveNamespaceAllocation,true);assert.ok(Number.isFinite(s.now)&&Number.isFinite(s.grantExpiresAt)&&s.grantExpiresAt>s.now);}
  if(stage==='password-submit'){assert.equal(s.currentPasswordKnownInHolder,true);assert.equal(s.nextSecretCustodyAckExact,true);assert.equal(s.correctChangeAlreadySubmitted,false);assert.equal(s.uiFormIsC,true);}
  if(stage==='persistent-session'){assert.equal(s.explicitCPersistencePermission,true);assert.equal(s.exactTemporaryCProfile,true);assert.equal(s.sameVmAndRun,true);assert.equal(s.originalSafeStorageAvailable,true);assert.equal(s.normalUiRememberSession,true);assert.equal(s.tokenExportDisabled,true);assert.equal(s.cleanupDeadlineEnforced,true);assert.ok(Number.isFinite(s.lifetimeMs)&&s.lifetimeMs>0&&s.lifetimeMs<=330*60000);}
  if(stage==='revoke-current-session'){assert.equal(s.revocationApprovalExactC,true);assert.equal(s.normalAuthenticatedOwnSdk,true);assert.equal(s.currentSessionEqualsApprovedTarget,true);assert.equal(s.currentDeviceEqualsApprovedTarget,true);assert.equal(s.concurrentCLoginFrozen,true);assert.equal(s.revokeAlreadySubmitted,false);}
 }
 return true;
}
