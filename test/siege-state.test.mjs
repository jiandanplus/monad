import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const present=existsSync(new URL('../src/siege/state.mjs',import.meta.url));
const api=present?await import('../src/siege/state.mjs'):null;
const empty=()=>({roundId:0n,startsAt:0n,endsAt:0n,blockTimestamp:100n,rosterVersion:0n,seatsPerFaction:2,players:[],teams:[],nodes:Array.from({length:13},()=>({owner:0,version:0,cooldownUntil:0n,fortified:false,units:[],supplied:false})),funds:[0n,0n,0n,0n],scores:[0n,0n,0n,0n],incomeRates:[0,0,0,0],scoreRates:[0,0,0,0]});
test('chain state parser exists',()=>assert.ok(present,'missing strict chain snapshot parser'));
test('round zero remains empty and accepts only the exact block timestamp',{skip:!present},()=>{
 const raw=empty(),s=api.parseSnapshot(raw,{blockNumber:4n,timestamp:100n});assert.equal(s.nodes[0].units.length,0);assert.equal(s.blockNumber,4n);
 raw.nodes[0].units=[10];assert.throws(()=>api.parseSnapshot(raw,{blockNumber:4n,timestamp:100n}));
 assert.throws(()=>api.parseSnapshot(empty(),{blockNumber:4n,timestamp:101n}));
});
test('snapshot parser decodes wounded units and independently checks supply and income',{skip:!present},async()=>{
 const {createRound,snapshot}=await import('../src/siege/model.mjs');
 const players=[1,2,3,4].map(i=>`0x${String(i).repeat(40)}`);
 const model=snapshot(createRound({roundId:1,rosterVersion:1,seatsPerFaction:1,players,teams:[1,2,3,4],now:100}),100);
 const raw={...model,roundId:1n,rosterVersion:1n,startsAt:100n,endsAt:400n,blockTimestamp:100n,nodes:model.nodes.map(n=>({...n,cooldownUntil:BigInt(n.cooldownUntil),units:n.units.map(u=>(u.kind<<8)|u.hp)}))};
 const parsed=api.parseSnapshot(raw,{blockNumber:4n,timestamp:100n});assert.equal(parsed.nodes[0].units[3].hp,30);
 for(const alter of [r=>r.nodes[0].units=[0],r=>r.nodes[0].supplied=false,r=>r.incomeRates[0]=5,r=>r.endsAt=401n,r=>r.players[1]=r.players[0],r=>delete r.nodes[3]]){
  const bad=structuredClone(raw);alter(bad);assert.throws(()=>api.parseSnapshot(bad,{blockNumber:4n,timestamp:100n}));
 }
});
