// Deliberately excludes messages, ACLs, paths and all successful payload data.
const brands=new WeakMap();
const actions=new Set('init seal restore claim readback receipt cleanup bind-holder bind-supervisor register-owned registry business-deadline request-stop inspect-intent destroy-ciphertext'.split(' '));
const stages=new Set('bootstrap root-item-read root-acl-read root-acl-protected acl-owner-check acl-rules-count acl-rule-rights-check file-explicit-security-create load-system-security acl-framework-api-contract read-synthetic-stdin canonical-temp-root init-create-directory init-directory-security init-set-owner init-protect-dacl init-create-rules init-apply-acl'.split(' '));
const types=new Set(['System.Management.Automation.CommandNotFoundException','System.Management.Automation.RuntimeException','System.Management.Automation.MethodInvocationException','System.Management.Automation.ParameterBindingException','System.UnauthorizedAccessException','System.Security.Cryptography.CryptographicException','System.IO.IOException','OTHER']);
const reasons=new Set(['timeout','output-limit','stdin-error','child-error','child-exit','invalid-response','ps-rejected']);
export function createVaultIoFailure({action,reason,exitCode,signal,timedOut,response}){
 const known=response?.ok===false&&response?.error==='AUTHORIZED_VAULT_REJECTED';
 const projection=Object.freeze({action:actions.has(action)?action:'OTHER',reason:reasons.has(reason)?reason:'OTHER',exitCode:Number.isInteger(exitCode)&&exitCode>=-2147483648&&exitCode<=2147483647?exitCode:null,signal:['SIGTERM','SIGKILL','SIGINT','SIGABRT'].includes(signal)?signal:null,timedOut:timedOut===true,psStage:known&&stages.has(response.stage)?response.stage:null,psExceptionType:known&&types.has(response.exceptionType)?response.exceptionType:null});
 const error=Object.assign(Error('AUTHORIZED_VAULT_IO_FAILED'),{code:'AUTHORIZED_VAULT_IO_FAILED'});brands.set(error,projection);return error;
}
export function getVaultIoDiagnostic(error){return brands.get(error)??null;}
