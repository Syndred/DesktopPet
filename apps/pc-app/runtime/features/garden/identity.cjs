"use strict";
const { GardenError }=require('./service.cjs');
const { createGardenBackupAdapter }=require('./backup.cjs');
const stop=message=>{throw new GardenError('OWNER_MIGRATION_REQUIRED',message);};
/** Applies only Accounts' explicit, verified aliases. Never guesses by username
 * or casts runtime TEXT IDs into player_profiles UUIDs. */
function createOwnerMigration(services,garden){
  const db=services.db;
  function candidates(context){
    const accounts=services.get('accounts');if(!accounts?.identity)return [];
    const identity=accounts.identity(context.ownerAccountId);if(!identity||identity.owner_account_id!==context.ownerAccountId)return [];
    return db.prepare('SELECT * FROM account_aliases WHERE owner_account_id=? AND evidence=?').all(context.ownerAccountId,'legacy-id')
      .filter(alias=>alias.subject_id!==context.ownerAccountId&&db.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(alias.subject_id));
  }
  function migrate(context){
    for(const alias of candidates(context)){
      const source=alias.subject_id,target=context.ownerAccountId;
      const prior=db.prepare('SELECT target_owner_account_id FROM garden_identity_imports WHERE source_owner_account_id=?').get(source);
      if(prior){if(prior.target_owner_account_id!==target)stop('旧菜园已关联另一身份，原始记录已保留');continue;}
      // The old raw id can also be a cloud namespace: refuse ambiguous aliases.
      const ambiguous=db.prepare('SELECT 1 FROM account_identities WHERE subject_id=? AND provider<>?').get(source,alias.provider);
      if(ambiguous)stop('旧菜园身份存在多个来源，已保留原数据，等待统一核对');
      garden.transaction(()=>{
        const companions=services.get('companions');
        const oldPets=companions?.listPets?.(source)||[];
        let newPets=companions?.listPets?.(target)||[];
        if(oldPets.some(old=>!newPets.some(pet=>pet.petId===old.petId&&JSON.stringify(pet.growth)===JSON.stringify(old.growth)))){
          if(!companions?.migrateOwnerAlias)stop('账号归属已更新；旧菜园和伙伴已保留，等待伙伴归属迁移适配');
          const result=companions.migrateOwnerAlias({sourceOwnerAccountId:source,targetOwnerAccountId:target,provider:alias.provider,subjectId:source});
          if(result?.then||result?.ok===false)stop(result?.message||'伙伴归属迁移尚未完成');
          newPets=companions.listPets(target);
          if(oldPets.some(old=>!newPets.some(pet=>pet.petId===old.petId&&JSON.stringify(pet.growth)===JSON.stringify(old.growth))))stop('伙伴归属迁移尚未通过逐只状态读回');
        }
        const backup=createGardenBackupAdapter(db),snapshot=backup.export(source);
        const current=db.prepare('SELECT revision FROM garden_accounts WHERE owner_account_id=?').get(target);
        if(current?.revision>0)stop('新旧菜园都有独立进度，已完整保留，不能拼接库存或重复领取');
        const incoming=structuredClone(snapshot);incoming.ownerAccountId=target;
        for(const rows of Object.values(incoming.tables))for(const row of rows)row.owner_account_id=target;
        // Shared-world history remains unchanged and archived under the old id;
        // an account inventory import cannot reassign a live territory.
        delete incoming.territoryArchive;
        backup.restore(target,incoming,'replace');
        db.prepare('INSERT INTO garden_identity_imports VALUES (?,?,?,?)').run(source,target,JSON.stringify(snapshot),Date.now());
      });
    }
  }
  return {migrate,candidates};
}
module.exports={createOwnerMigration};
