import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('deployed SQL settlement expression preserves exact authoritative battle and rejects altered identity/state',async()=>{
  // Execute the actual migration expression in PostgreSQL. Spatial behavior
  // remains a separate real PostGIS check; no spatial types/functions are faked.
  const sql=await readFile('infra/supabase/migrations/20261025034225_lingjing_territory_receipt_operator.sql','utf8');
  const expression=sql.slice(sql.indexOf("if p_payload#>>'{result,data,territoryId}'")+3,sql.indexOf("then raise exception 'INVALID_SETTLEMENT_PROOF'"));
  const db=new PGlite();try{
    const battle={id:'server-session',snapshot:{player:{hp:0},enemy:{hp:80}},rounds:[{round:1,winner:'enemy'}]},payload={result:{data:{territoryId:'original-region',petId:'original-pet',won:false}},settledBattle:{...battle,reward:{experience:5}}};
    const query=`select ${expression} invalid from (select $1::jsonb p_payload,'enemy'::text winner) args cross join (select 'original-region'::text id) region cross join (select 'original-pet'::text pet_id,$2::jsonb battle_json) challenge`;
    assert.equal((await db.query(query,[payload,battle])).rows[0].invalid,false);
    const altered=structuredClone(payload);altered.settledBattle.snapshot.enemy.hp=0;assert.equal((await db.query(query,[altered,battle])).rows[0].invalid,true);
    altered.settledBattle=payload.settledBattle;altered.result.data.petId='foreign-pet';assert.equal((await db.query(query,[altered,battle])).rows[0].invalid,true);
  }finally{await db.close();}
});
