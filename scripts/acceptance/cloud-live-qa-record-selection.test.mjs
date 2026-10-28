import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecordCaseSelection} from './cloud-live-qa-record-cases.mjs';
test('fixed remaining-case selection rejects empty, unknown, duplicates and reordered stories',()=>{
 assert.deepEqual(validateRecordCaseSelection(['S05','P05-repeat-original-memory-restore']),['S05','P05-repeat-original-memory-restore']);
 for(const value of [[],['unknown'],['S05','S05'],['S05','S03'],null,'S05'])assert.throws(()=>validateRecordCaseSelection(value));
});
