const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const { ResourcesService } = require('../service.cjs');
const { migrations } = require('../repository.cjs');
const { parseCharacterFile, resolveAction } = require('../parser.cjs');
const { ROOT, catalog, registerRoster, listRosterTemplates, canonicalResourceId } = require('../roster.cjs');
let directory, db, service;
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lingjing-roster-'));
  db = new Database(path.join(directory,'test.sqlite')); db.pragma('foreign_keys=ON');
  for (const migration of migrations) db.exec(migration.sql);
  service = new ResourcesService({ db, storageRoot:path.join(directory,'managed') }); await service.seed();
});
after(async () => { db?.close(); if (directory?.startsWith(os.tmpdir())) await fs.rm(directory,{recursive:true,force:true}); });

test('eight distinct generated PNGs cover all elements with 16 bounded Pixi frames and dedicated poses', async () => {
  const sources = JSON.parse(await fs.readFile(path.join(ROOT,'source-record.json'),'utf8'));
  assert.deepEqual(catalog.characters.map(c=>c.name),['鱼丸','小蓝','饭团','焰柴','礼帽喵','小狐','青芽','岩团']);
  assert.equal(new Set(catalog.characters.map(c=>c.resourceId)).size,8);
  assert.equal(new Set(sources.characters.map(c=>c.sha256)).size,8);
  assert.deepEqual([...new Set(catalog.characters.map(c=>c.element))].sort(),['earth','fire','metal','water','wood']);
  for (const character of catalog.characters) {
    const parsed = await parseCharacterFile(path.join(ROOT,character.manifest)), resource=parsed.resource;
    const source = sources.characters.find(c=>c.id===character.id);
    const actual = createHash('sha256').update(await fs.readFile(path.join(ROOT,source.file))).digest('hex');
    assert.equal(actual,source.sha256); assert.equal(source.bitmapBytesUnchanged,true);
    assert.equal(Object.keys(resource.atlas.frames).length,16); assert.equal(new Set(source.uniqueFramePixelHashes).size,16);
    for (const frame of Object.values(resource.atlas.frames)) {
      assert.deepEqual(frame.sourceSize,{w:512,h:512});
      assert.equal(frame.spriteSourceSize.y+frame.spriteSourceSize.h,435);
      assert(frame.frame.x>=0 && frame.frame.y>=0 && frame.frame.x+frame.frame.w<=source.actualImageSize[0] && frame.frame.y+frame.frame.h<=source.actualImageSize[1]);
    }
    assert.equal(resource.calibration.desktop.anchorY,435/512);
    for (const action of catalog.actionConvention) {
      const resolved=resolveAction(resource,action); assert.equal(resolved.fallback,false,`${character.id}/${action}`);
      assert.equal(resolved.clip.name,action);
    }
    for (const [action,expected] of Object.entries({wave:[4,5],eat:[6,7],attack:[8,9],hit:[10],skill:[11,12]})) {
      const frames=resolveAction(resource,action).clip.frameNames;
      for (const index of expected) assert(frames.includes(`frame_${index}`),`${character.id}/${action}/${index}`);
      if (action!=='wave') assert(frames.every(name=>!['frame_4','frame_5'].includes(name)));
    }
    assert.equal(resolveAction(resource,'attack').clip.loop,false);
    assert.equal(resolveAction(resource,'hit').clip.loop,false);
    assert.equal(resolveAction(resource,'skill').clip.loop,false);
    assert.equal(resolveAction(resource,'walk').clip.loop,true);
  }
});

test('registration adds canonical resources without deleting old bytes, preferences or import receipts',async()=>{
  const legacy='builtin:lingjing-yuwan-v1', old=await service.get('owner',legacy);
  const oldManifest=path.resolve(__dirname,'../../../assets/illustrations/yuwan-character-v1.json');
  const sourceBefore=await fs.readFile(oldManifest);
  const calibration=structuredClone(old.calibration); calibration.desktop.scale=1.24;
  await service.save('owner',{resourceId:legacy,expectedRevision:0,calibration,actions:old.actions});
  const imported=await service.importFile('owner',oldManifest);
  const rawResource=db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(legacy);
  const rawPreference=db.prepare('SELECT * FROM lingjing_resource_preferences WHERE resource_id=?').get(legacy);
  const receipts=db.prepare('SELECT * FROM lingjing_resource_imports').all();
  await registerRoster(service); await registerRoster(service);
  assert.deepEqual(db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(legacy),rawResource);
  assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_preferences WHERE resource_id=?').get(legacy),rawPreference);
  assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_imports').all(),receipts);
  assert.deepEqual(await fs.readFile(oldManifest),sourceBefore);
  assert.equal((await service.get('owner',imported.resource.id)).id,imported.resource.id);
  const visible=await service.list('owner');
  assert.equal(visible.filter(r=>r.origin==='builtin').length,8);
  assert.deepEqual(visible.filter(r=>r.origin==='builtin').map(r=>r.name),catalog.characters.map(c=>c.name));
  assert.equal(visible.filter(r=>r.id===legacy).length,0);
  assert(visible.every(r=>r.availability==='ready'));
  assert.equal(canonicalResourceId(imported.resource.id),imported.resource.id);
});

test('templates, legacy aliases, desktop and battle all resolve the same canonical appearance',async()=>{
  const templates=listRosterTemplates(); assert.equal(templates.length,8);
  assert.equal(new Set(templates.map(t=>t.resource.resourceId)).size,8);
  for (const template of templates) {
    const id=template.resource.resourceId, pet={petId:`pet-${template.templateId}`,ownerAccountId:'owner',resource:template.resource,desktop:{behavior:'quiet'}};
    const desktop=await service.resolveForPet('owner',pet);
    const battle=await service.resolve('owner',{resourceId:id,petId:pet.petId,context:'battle',action:'attack'});
    assert.equal(desktop.resource.id,id); assert.equal(battle.resource.id,id); assert.equal(desktop.resource.contentHash,battle.resource.contentHash);
    assert.equal(desktop.resource.element,template.element); assert.equal(battle.resource.element,template.element);
    assert.equal(battle.fallback,false); assert.equal(battle.clip.name,'attack'); assert.equal(template.resource.kind,'2d');
    assert.equal(service.getRecord('owner',id).id,id);
  }
  for(const [previous,next] of Object.entries(catalog.legacyAliases)) {
    const pet={petId:'retained-instance',ownerAccountId:'owner',resource:{resourceId:previous,kind:'2d'},desktop:{behavior:'quiet'}};
    const display=await service.resolveForPet('owner',pet), hit=await service.resolve('owner',{resourceId:previous,petId:pet.petId,context:'battle',action:'hit'});
    assert.equal(display.resource.id,next); assert.equal(hit.resource.id,next); assert.equal(hit.clip.name,'hit');
    assert.equal(pet.resource.resourceId,previous,'Historical instance references are read through, not rewritten');
  }
});

test('Git LF/CRLF changes relocate registered packs without replacing canonical rows or preferences',async()=>{
  const installation=path.join(directory,'crlf-installation');
  const before=db.prepare("SELECT * FROM lingjing_resources WHERE resource_id LIKE 'builtin:%'").all();
  for(const entry of catalog.characters) {
    const destination=path.join(installation,entry.id); await fs.mkdir(destination,{recursive:true});
    const descriptor=await fs.readFile(path.join(ROOT,entry.manifest),'utf8');
    await fs.writeFile(path.join(destination,'character.json'),descriptor.replace(/\r?\n/g,'\r\n'));
    await fs.copyFile(path.join(ROOT,entry.id,'sprites.png'),path.join(destination,'sprites.png'));
  }
  await registerRoster(service,installation);
  assert.deepEqual(db.prepare("SELECT * FROM lingjing_resources WHERE resource_id LIKE 'builtin:%'").all(),before);
  for(const entry of catalog.characters)assert.equal((await service.get('owner',entry.resourceId)).availability,'ready');
});

test('standard atlas per-clip FPS and loop metadata rejects invalid values before import',async()=>{
  const original=JSON.parse(await fs.readFile(path.join(ROOT,'yuwan/character.json'),'utf8'));
  const folder=path.join(directory,'invalid'); await fs.mkdir(folder);
  await fs.copyFile(path.join(ROOT,'yuwan/sprites.png'),path.join(folder,'sprites.png'));
  const file=path.join(folder,'character.json');
  for(const settings of [{fps:0},{fps:61},{loop:'true'}]) {
    const invalid=structuredClone(original); invalid.character.clips.attack=settings;
    await fs.writeFile(file,JSON.stringify(invalid));
    await assert.rejects(parseCharacterFile(file),error=>error.code==='INVALID_CLIPS');
  }
  const invalidElement=structuredClone(original); invalidElement.character.element='ice';
  await fs.writeFile(file,JSON.stringify(invalidElement));
  await assert.rejects(parseCharacterFile(file),error=>error.code==='INVALID_ELEMENT');
});
