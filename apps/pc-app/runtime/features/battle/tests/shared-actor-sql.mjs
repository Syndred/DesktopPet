import {readdirSync,readFileSync} from 'node:fs';
const directory='infra/supabase/migrations';
/** Execute08's published SQL source, never a test-specific auth approximation. */
export async function loadSharedActorGuard(db) {
  const identity=readFileSync(`${directory}/20261025021620_lingjing_identity_actor_contract.sql`,'utf8');
  await db.exec(identity);
  await db.exec(readFileSync(`${directory}/20261025024615_lingjing_protected_save_cas.sql`,'utf8'));
  await db.exec(readFileSync(`${directory}/20261025032327_lingjing_session_revocation_ledger.sql`,'utf8'));
  const sources=readdirSync(directory).filter(name=>name.endsWith('.sql')).map(name=>({name,sql:readFileSync(`${directory}/${name}`,'utf8')}));
  const guard=sources.find(value=>/create\s+(?:or\s+replace\s+)?function\s+lingjing_private\.assert_service_actor\s*\(/i.test(value.sql));
  if(!guard)throw new Error('Consume the approved08 assert_service_actor migration before running battle SQL acceptance');
  await db.exec(guard.sql);return guard.name;
}
