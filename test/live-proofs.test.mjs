import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseFactionProofs} from '../scripts/live-proofs.mjs';
const log=(actor,team)=>({args:{actor,team}});
test('receipt selection finds opposite factions after multiple same-side actors',()=>{
 const a=log('0xAa',1),b=log('0xBb',1),c=log('0xCc',2);
 assert.deepEqual(chooseFactionProofs([a,b,c]),[a,c]);
 assert.deepEqual(chooseFactionProofs([c,a,b]),[c,a]);
});
test('proof selection never substitutes two same-side or same-address records',()=>{
 assert.equal(chooseFactionProofs([log('0xAa',1),log('0xBb',1)]).length,1);
 assert.equal(chooseFactionProofs([log('0xAa',1),log('0xaa',2)]).length,1);
 assert.deepEqual(chooseFactionProofs([]),[]);
});
