import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync('infra/supabase/migrations/20261025015911_preserve_comparisontext_before_lingjing.sql','utf8');
// Local actual PostgreSQL guard tests. Original production relocation/hash
// acceptance is recorded separately; this does not restore a source backup.
test('clean database skips only the one-time unrelated-project preservation operation',async()=>{
  const db=new PGlite();try{await db.exec(sql);const r=await db.query("select to_regnamespace('comparisontext_archive_20261025') as archive");assert.equal(r.rows[0].archive,null);}finally{await db.close();}
});
test('partial original source stops before moving, exposing or deleting any original row',async()=>{
  const db=new PGlite();try{await db.exec('create table public."user"(id text);insert into public."user" values (\'original-row\')');await assert.rejects(db.exec(sql),/Partial original comparisontext source/);assert.deepEqual((await db.query('select * from public."user"')).rows,[{id:'original-row'}]);assert.equal((await db.query("select to_regnamespace('comparisontext_archive_20261025') as archive")).rows[0].archive,null);}finally{await db.close();}
});
test('existing private archive is never silently reprocessed by replay adaptation',async()=>{
  const db=new PGlite();try{await db.exec('create schema comparisontext_archive_20261025;create table comparisontext_archive_20261025.original(id text);insert into comparisontext_archive_20261025.original values (\'kept\')');await assert.rejects(db.exec(sql),/Archive schema already exists/);assert.deepEqual((await db.query('select * from comparisontext_archive_20261025.original')).rows,[{id:'kept'}]);}finally{await db.close();}
});
