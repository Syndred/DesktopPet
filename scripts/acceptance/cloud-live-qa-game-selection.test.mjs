import test from 'node:test';
import assert from 'node:assert/strict';
import {battleSelectionReady} from './cloud-live-qa-game-cases.mjs';
const label='木鹿 · 编号 0001 ·',base=()=>({enabled:true,label:label+' Lv.1 · 木',overview:{pets:[{petId:'a'},{petId:'b'}],selectedPetId:null}});
test('legitimate actual first-pet UI default does not require fictitious persistence',()=>assert.equal(battleSelectionReady(base(),'a',label),true));
test('same first-pet default cannot authorize a different pet or missing actual label',()=>{assert.equal(battleSelectionReady(base(),'b',label),false);assert.equal(battleSelectionReady({...base(),label:'其他 · 编号 0002 ·'},'a',label),false);});
test('nondefault target needs matching persisted selection and ended busy state',()=>{const value=base();value.overview.selectedPetId='b';assert.equal(battleSelectionReady(value,'a',label),false);value.overview.selectedPetId='a';assert.equal(battleSelectionReady(value,'a',label),true);value.enabled=false;assert.equal(battleSelectionReady(value,'a',label),false);});
test('a target absent from the actual owner roster never passes',()=>{const value=base();value.overview.pets=[];value.overview.selectedPetId='a';assert.equal(battleSelectionReady(value,'a',label),false);});
