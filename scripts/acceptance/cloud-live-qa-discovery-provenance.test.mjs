import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyExistingConcurrentPets,verifyPriorConcurrentEvidence} from './cloud-live-qa-discovery-cases.mjs';
const actors={a:{ownerAccountId:'owner-a'},b:{ownerAccountId:'owner-b'}},prior={templateId:'animal-wood-deer',numbers:['4','5'],actionIds:['action-a','action-b']};
const pets={a:[{ownerAccountId:'owner-a',petId:'pet-a',templateId:prior.templateId,globalSerial:'4'}],b:[{ownerAccountId:'owner-b',petId:'pet-b',templateId:prior.templateId,globalSerial:'5'}]};
const actions=['a','b'].map(r=>({owner:'owner-'+r,actionId:'action-'+r,petId:'pet-'+r,templateId:prior.templateId}));
test('normal exact original action readback binds both numbered instances, not just numbers',()=>{assert.equal(verifyExistingConcurrentPets(pets,actors,prior,actions).length,2);for(const field of ['petId','owner','actionId','templateId']){const changed=structuredClone(actions);changed[0][field]='wrong';assert.throws(()=>verifyExistingConcurrentPets(pets,actors,prior,changed));}assert.throws(()=>verifyExistingConcurrentPets({...pets,a:[...pets.a,...pets.a]},actors,prior,actions));});
test('bare passed JSON or another run cannot substitute sealed original bytes',()=>{assert.throws(()=>verifyPriorConcurrentEvidence(Buffer.from('{"passed":true}'),{runId:40607080843,artifactId:12783353029},'scenario',Buffer.from('{}')));assert.throws(()=>verifyPriorConcurrentEvidence(Buffer.from('{}'),{runId:1,artifactId:12783353029},'scenario',Buffer.from('{}')));});
