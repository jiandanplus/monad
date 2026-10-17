import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBattle} from '../src/siege/combat.mjs';
const i=(hp=10)=>({kind:0,hp}), t=(hp=30)=>({kind:1,hp}), e=(hp=8)=>({kind:2,hp});
const fight=(attackers,defenders,city=false,fortified=false)=>resolveBattle({attackers,defenders,city,fortified});
test('plain two infantry lose to tank at 9 hp with simultaneous pulses',()=>{
 const result=fight([i(),i()],[t()]); assert.deepEqual(result.attackers,[]);assert.deepEqual(result.defenders,[t(9)]);assert.equal(result.captured,false);assert.equal(result.pulses,2);
 assert.deepEqual(result.trace[0].attackers,[i(8)]); assert.deepEqual(result.trace[0].defenders,[t(16)]);
});
test('city defending infantry double antiarmor damage and leave one infantry at 2 hp',()=>{ const r=fight([t()],[i(),i()],true);assert.deepEqual(r.attackers,[]);assert.deepEqual(r.defenders,[i(2)]);assert.equal(r.captured,false);assert.equal(r.pulses,2); });
test('simultaneous deaths retain flag and tanks clear but cannot occupy',()=>{
 const draw=fight([i(4)],[i(4)]);assert.deepEqual(draw.attackers,[]);assert.deepEqual(draw.defenders,[]);assert.equal(draw.captured,false);
 const tanks=fight([t()],[i(1)]); assert.deepEqual(tanks.attackers,[t(23)]);assert.deepEqual(tanks.defenders,[]);assert.equal(tanks.captured,false);
 assert.equal(fight([t(),e()],[i(1)]).captured,true);
});
test('engineer claims empty target but pure engineers cannot attack garrison',()=>{ assert.equal(fight([e()],[]).captured,true);assert.equal(fight([e()],[]).pulses,0); assert.throws(()=>fight([e()],[e()]),/combat|engineer/i); });
test('damage aggregates by selected kind before city and fortification floors',()=>{
 // Two tanks aggregate 24; floor(24*.75)=18 then floor(18*.8)=14.
 const r=fight([t(),t()],[i(),i(),i()],true,true);assert.deepEqual(r.trace[0].defenders,[i(6),i()]);
 // With city+fortification a single 12-damage tank hits for seven per pulse.
 const single=fight([t()],[i()],true,true);assert.deepEqual(single.trace[0].defenders,[i(3)]);
});
test('priority targets tanks before infantry, wounded first, index breaks ties and damage never crosses kinds',()=>{
 const r=fight([i()],[i(),t(3),t(10),e()]);assert.deepEqual(r.trace[0].defenders,[i(),t(6),e()]);
 const equal=fight([i()],[i(5),i(5),e()]); assert.deepEqual(equal.trace[0].defenders,[i(1),i(5),e()]);
 const overflow=fight([t()],[i(1),e()]);assert.deepEqual(overflow.trace[0].defenders,[e()]);
});
test('battle has at most three pulses, preserves inputs and validates all units and options',()=>{
 const attackers=[i(),t(),e()],defenders=[t(),e()];const input={attackers,defenders,city:true,fortified:true};const before=structuredClone(input); const r=resolveBattle(input);assert.deepEqual(input,before);assert(r.pulses<=3);for(const u of [...r.attackers,...r.defenders])assert(u.hp>0);
 for(const bad of [{kind:0,hp:0},{kind:1,hp:31},{kind:3,hp:1},{kind:0,hp:1.5},null]) assert.throws(()=>fight([bad],[]));
 assert.throws(()=>fight([],[]));assert.throws(()=>fight(Array(7).fill(i()),[]));assert.throws(()=>fight([i()],Array(13).fill(i())));assert.throws(()=>fight([i()],[],1));assert.throws(()=>fight([i()],[],false,'yes'));
});
test('battle rejects sparse attackers at every permitted unit position',()=>{
 assert.throws(()=>fight(Array(1),[]),/Invalid units/);
 for(let index=0;index<6;index++){
  const attackers=Array.from({length:6},()=>i());delete attackers[index];
  assert.throws(()=>fight(attackers,[]),/Invalid units/);
 }
});
test('battle rejects sparse defenders at every permitted unit position',()=>{
 assert.throws(()=>fight([i()],Array(1)),/Invalid units/);
 for(let index=0;index<12;index++){
  const defenders=Array.from({length:12},()=>i());delete defenders[index];
  assert.throws(()=>fight([i()],defenders),/Invalid units/);
 }
});
