const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {BattleStore}=require('../store.cjs');
const migrations=require('../migrations.cjs');
const tables=['battle_action_receipts','battle_sessions','battle_transport_journal'];

test('optional BattleStore inspects metadata only for every absent/partial schema and never creates or queries battle tables',()=>{
  for(let mask=0;mask<7;mask++){
    const db=new DatabaseSync(':memory:'),queries=[];
    try{
      for(const [index,table]of tables.entries())if(mask&(1<<index))db.exec(`CREATE TABLE ${table}(unrelated TEXT); INSERT INTO ${table} VALUES('preserved');`);
      const before=db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
      const lazy={prepare(sql){queries.push(sql);return db.prepare(sql);}};
      const store=new BattleStore(lazy);assert.equal(store.db,lazy);assert.equal(queries.length,1);assert.ok(queries.every(sql=>sql.includes('FROM sqlite_master')));
      assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),before);
    }finally{db.close();}
  }
});

test('later normal battle registration runs migration002 and preserves/migrates the original durable request',()=>{
  const db=new DatabaseSync(':memory:');try{
    new BattleStore(db);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master").get().n,0);
    db.exec(migrations[0].sql);db.prepare('INSERT INTO battle_action_receipts(owner_account_id,action_id,session_id,command_json,result_json) VALUES(?,?,?,?,NULL)').run('owner','original-start','original-start','{"type":"cloud:training-start","input":{"petId":"original-pet","enemyElement":"fire"}}');
    const original=db.prepare('SELECT * FROM battle_action_receipts').all();new BattleStore(db);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='battle_transport_journal'").get().n,0);
    db.exec(migrations[1].sql);migrations[1].up(db);const store=new BattleStore(db);assert.equal(store.action('owner','original-start').result,null);assert.equal(db.prepare('SELECT count(*) n FROM battle_transport_journal').get().n,1);assert.deepEqual(db.prepare('SELECT * FROM battle_action_receipts').all(),original);
  }finally{db.close();}
});
