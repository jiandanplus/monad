import test from 'node:test';
import assert from 'node:assert/strict';
import {createRound,snapshot,applyOrder} from '../src/siege/model.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const i=(hp=10)=>({kind:0,hp}),t=(hp=30)=>({kind:1,hp}),e=(hp=8)=>({kind:2,hp});
const round=(seats=1)=>createRound({roundId:1,rosterVersion:1,seatsPerFaction:seats,players:Array.from({length:4*seats},(_,n)=>addr(n+1)),teams:Array.from({length:4*seats},(_,n)=>Math.floor(n/seats)+1),now:1000});
const order=(type,params={},actor=addr(1))=>({actor,expectedRoundId:1,type,...params});
const recruit=(params={})=>order('recruit',{node:0,nodeVersion:0,kind:0,count:1,...params});
const move=(params={},actor=addr(1))=>order('dispatch',{from:0,to:4,fromVersion:0,toVersion:0,unitIndexes:[0],...params},actor);
const own=(state,node,team,units=[])=>Object.assign(state.nodes[node],{owner:team,units});
const failsUnchanged=(state,cmd,now,pattern)=>{const before=structuredClone(state);assert.throws(()=>applyOrder(state,cmd,now),pattern);assert.deepEqual(state,before);};
test('round initialization is per faction, not seat count, and snapshot has exact named chain fields',()=>{
 for(const seats of [1,2,3,4]){const state=round(seats),s=snapshot(state,1000);assert.deepEqual(s.funds,[100,100,100,100]);assert.deepEqual(s.scores,[0,0,0,0]);assert.deepEqual(s.incomeRates,[1,1,1,1]);assert.deepEqual(s.scoreRates,[0,0,0,0]);assert.equal(s.nodes.length,13);assert.equal(s.startsAt,1000);assert.equal(s.endsAt,1300);assert.equal(s.blockTimestamp,1000);assert.deepEqual(s.nodes.slice(0,4).map(n=>n.owner),[1,3,2,4]);for(const n of s.nodes.slice(0,4)){assert.deepEqual(n.units,[i(),i(),i(),t(),e()]);assert.equal(n.supplied,true);}for(const n of s.nodes.slice(4)){assert.deepEqual(n.units,[i(),i()]);assert.equal(n.owner,0);assert.equal(n.supplied,false);}
 assert.deepEqual(Object.keys(s),['roundId','startsAt','endsAt','blockTimestamp','rosterVersion','seatsPerFaction','players','teams','nodes','funds','scores','incomeRates','scoreRates']);assert.deepEqual(Object.keys(s.nodes[0]),['owner','version','cooldownUntil','fortified','units','supplied']);}
});
test('round validates ids, time, roster and never aliases initialization inputs or snapshots',()=>{
 const args={roundId:1,rosterVersion:1,seatsPerFaction:1,players:[1,2,3,4].map(addr),teams:[1,2,3,4],now:1000};for(const patch of [{roundId:0},{rosterVersion:0},{now:-1},{now:1.1},{seatsPerFaction:5},{players:[addr(0),...args.players.slice(1)]},{teams:[1,1,3,4]}])assert.throws(()=>createRound({...args,...patch}));
 const s=createRound(args);args.players[0]=addr(99);args.teams[0]=2;assert.equal(s.players[0],addr(1));assert.equal(s.teams[0],1);const before=structuredClone(s);const view=snapshot(s,1010);view.nodes[0].units[0].hp=1;view.players[0]=addr(99);assert.deepEqual(s,before);assert.throws(()=>snapshot(s,999),/time/i);
});
test('economy accrues to seconds and stops at300 with cap200, including ended snapshots',()=>{const s=round();own(s,4,1);own(s,8,1);const before=structuredClone(s);const middle=snapshot(s,1010);assert.deepEqual(middle.funds,[120,110,110,110]);assert.deepEqual(middle.scores,[10,0,0,0]);const end=snapshot(s,5000);assert.deepEqual(end.funds,[200,200,200,200]);assert.deepEqual(end.scores,[300,0,0,0]);assert.equal(end.blockTimestamp,5000);assert.deepEqual(s,before);failsUnchanged(s,recruit(),1300,/ended/i);});
test('recruit spends shared funds, increments source version and enforces exactly three seconds of source cooldown',()=>{
 const s=round(2),before=structuredClone(s);const a=applyOrder(s,recruit({kind:1}),1000);assert.equal(snapshot(a,1000).funds[0],50);assert.equal(a.nodes[0].version,1);assert.equal(a.nodes[0].cooldownUntil,1003);assert.deepEqual(a.nodes[0].units.at(-1),t());assert.deepEqual(s,before);
 failsUnchanged(a,order('recruit',{node:0,nodeVersion:1,kind:0,count:1},addr(2)),1002,/cooldown/i);const b=applyOrder(a,order('recruit',{node:0,nodeVersion:1,kind:0,count:1},addr(2)),1003);assert.equal(snapshot(b,1003).funds[0],33);assert.equal(b.nodes[0].version,2);
});
test('round, actor, node, action, versions, counts and kinds reject before mutation',()=>{
 const s=round();for(const patch of [{expectedRoundId:0},{expectedRoundId:2},{actor:addr(99)},{node:13},{node:-1},{node:1},{nodeVersion:1},{nodeVersion:'0'},{kind:3},{kind:-1},{count:0},{count:7},{count:1.1},{type:'other'}])failsUnchanged(s,{...recruit(),...patch},1000);failsUnchanged(s,recruit({count:6}),1000,/fund/i);failsUnchanged(s,recruit(),999,/time/i);
});
test('only owned supplied bases and factory produce with factory excluding tanks and node capacity12',()=>{
 const s=round();own(s,4,1);failsUnchanged(s,recruit({node:4}),1000,/produc/i);own(s,12,1);failsUnchanged(s,recruit({node:12}),1000,/supply/i);own(s,8,1);failsUnchanged(s,recruit({node:12,kind:1}),1000,/factory|tank/i);const a=applyOrder(s,recruit({node:12,kind:2}),1000);assert.deepEqual(a.nodes[12].units,[e()]);assert.equal(snapshot(a,1000).funds[0],65);s.nodes[0].units=Array.from({length:12},()=>i());failsUnchanged(s,recruit(),1000,/capacity/i);
});
test('dispatch moves only selected existing units at unchanged hp with ordered array indexes',()=>{
 const s=round();own(s,4,1,[e(3)]);s.nodes[0].units=[i(4),t(19),e(2)];const a=applyOrder(s,move({unitIndexes:[0,2]}),1000);assert.deepEqual(a.nodes[0].units,[t(19)]);assert.deepEqual(a.nodes[4].units,[e(3),i(4),e(2)]);assert.equal(a.nodes[0].version,1);assert.equal(a.nodes[4].version,1);assert.equal(a.nodes[4].cooldownUntil,0);assert.equal(snapshot(a,1000).funds[0],100);
 for(const indexes of [[],[1,0],[0,0],[3],[-1],[0.5],['0'],[0,1,2,3,4,5,6]])failsUnchanged(s,move({unitIndexes:indexes}),1000,/index|select/i);
 for(const patch of [{fromVersion:1},{toVersion:1},{to:12},{to:1},{to:0},{from:1}])failsUnchanged(s,move(patch),1000);
});
test('friendly capacity, enemy base, pure engineer garrison and source cooldown are atomic failures',()=>{
 const s=round();own(s,4,1,Array.from({length:12},()=>i()));failsUnchanged(s,move(),1000,/capacity/i);own(s,4,2,[i()]);failsUnchanged(s,move({unitIndexes:[4]}),1000,/engineer|combat/i);own(s,4,1,[i()]);failsUnchanged(s,move({from:4,to:1}),1000,/base|adjacent/i);
 const moved=applyOrder(s,move(),1000);failsUnchanged(moved,move({fromVersion:1,toVersion:1}),1001,/cooldown/i);
});
test('captures settle all four old economic checkpoints first and award no instant capture bonus',()=>{
 const s=round();own(s,4,0);const a=applyOrder(s,move(),1010);assert.equal(a.nodes[4].owner,1);assert.deepEqual(a.checkpoints.map(c=>c.at),[1010,1010,1010,1010]);assert.deepEqual(snapshot(a,1010).funds,[110,110,110,110]);assert.deepEqual(snapshot(a,1020).funds,[130,120,120,120]);assert.deepEqual(a.nodes[4].units,[i()]);
});
test('supply interruption stops mine/tower earnings and reconnection resumes without backpay',()=>{
 const s=round();own(s,4,1);own(s,9,1);own(s,12,1);own(s,8,2,[e()]);
 const cut=applyOrder(s,move({from:8,to:4,unitIndexes:[0]},addr(2)),1010);assert.equal(cut.nodes[4].owner,2);assert.equal(snapshot(cut,1020).nodes[9].supplied,false);assert.deepEqual(snapshot(cut,1020).funds,[130,120,120,120]);assert.deepEqual(snapshot(cut,1020).scores,[10,0,0,0]);
 const restored=applyOrder(cut,move({toVersion:1}),1020);assert.equal(restored.nodes[4].owner,1);assert.deepEqual(snapshot(restored,1030).funds,[150,130,130,130]);assert.deepEqual(snapshot(restored,1030).scores,[20,0,0,0]);assert.deepEqual(restored.checkpoints.map(c=>c.at),[1020,1020,1020,1020]);
});
test('battle survivors return after nonselected source units with actual wounds; defender flag remains',()=>{
 const s=round();s.nodes[0].units=[t(),e(3)];own(s,4,2,[i(1)]);s.nodes[4].fortified=true;
 const a=applyOrder(s,move(),1000);assert.deepEqual(a.nodes[0].units,[e(3),t(23)]);assert.equal(a.nodes[4].owner,2);assert.deepEqual(a.nodes[4].units,[]);assert.equal(a.nodes[4].fortified,false);assert.equal(a.nodes[0].version,1);assert.equal(a.nodes[4].version,1);
 const b=applyOrder(a,move({fromVersion:1,toVersion:1,unitIndexes:[0]}),1003);assert.equal(b.nodes[4].owner,1);assert.deepEqual(b.nodes[4].units,[e(3)]);assert.deepEqual(b.nodes[0].units,[t(23)]);
});
test('simultaneous annihilation leaves original flag and empty living-unit arrays',()=>{const s=round();s.nodes[0].units=[i(4),e()];own(s,4,2,[i(4)]);const a=applyOrder(s,move(),1000);assert.deepEqual(a.nodes[0].units,[e()]);assert.deepEqual(a.nodes[4].units,[]);assert.equal(a.nodes[4].owner,2);});
test('fortification requires engineer, supply, nonbase, nonstacking; costs20 and spends cooldown',()=>{
 const s=round();own(s,4,1,[e()]);const cmd=order('fortify',{node:4,nodeVersion:0});const a=applyOrder(s,cmd,1000);assert.equal(a.nodes[4].fortified,true);assert.equal(a.nodes[4].version,1);assert.equal(a.nodes[4].cooldownUntil,1003);assert.equal(snapshot(a,1000).funds[0],80);failsUnchanged(a,{...cmd,nodeVersion:1},1003,/fortif/i);
 failsUnchanged(s,order('fortify',{node:0,nodeVersion:0}),1000,/base/i);s.nodes[4].units=[i()];failsUnchanged(s,cmd,1000,/engineer/i);own(s,12,1,[e()]);failsUnchanged(s,order('fortify',{node:12,nodeVersion:0}),1000,/supply/i);
});
test('repair costs15 once for one to three selected wounded units, restores10 capped at max and cannot revive',()=>{
 const s=round();s.nodes[0].units=[i(7),t(3),e(2),i()];const cmd=order('repair',{node:0,nodeVersion:0,unitIndexes:[0,1,2]});const a=applyOrder(s,cmd,1000);assert.deepEqual(a.nodes[0].units,[i(),t(13),e(),i()]);assert.equal(snapshot(a,1000).funds[0],85);assert.equal(a.nodes[0].version,1);assert.equal(a.nodes[0].cooldownUntil,1003);
 for(const indexes of [[],[3],[0,3],[2,0],[0,0],[0,1,2,3],[4]])failsUnchanged(s,{...cmd,unitIndexes:indexes},1000);s.nodes[0].units=[i(2)];failsUnchanged(s,{...cmd,unitIndexes:[0]},1000,/engineer/i);own(s,12,1,[i(1),e()]);failsUnchanged(s,{...cmd,node:12,unitIndexes:[0]},1000,/supply/i);
});
test('teammates spending same funds and source race cannot partially debit, recruit or use stale versions',()=>{
 const s=round(2);own(s,4,1,[e()]);own(s,8,1);own(s,12,1,[]);s.checkpoints[0].funds=50;
 const a=applyOrder(s,recruit({kind:1}),1000);assert.equal(snapshot(a,1000).funds[0],0);failsUnchanged(a,order('recruit',{node:12,nodeVersion:0,kind:0,count:1},addr(2)),1000,/fund/i);failsUnchanged(a,recruit(),1003,/version/i);
 const b=applyOrder(a,order('dispatch',{from:4,to:8,fromVersion:0,toVersion:0,unitIndexes:[0]},addr(2)),1000);assert.deepEqual(b.nodes[8].units,[e()]);failsUnchanged(b,order('dispatch',{from:4,to:8,fromVersion:0,toVersion:1,unitIndexes:[0]}),1000,/version/i);
});

test('settling capped funds before a purchase never refills the spent amount from previously elapsed time',()=>{const s=round();const a=applyOrder(s,recruit({kind:1}),1110);assert.equal(snapshot(a,1110).funds[0],150);assert.equal(snapshot(a,1111).funds[0],151);});
test('node version overflow and malformed state reject atomically with explicit errors',()=>{const s=round();s.nodes[0].version=0xffffffff;failsUnchanged(s,recruit({nodeVersion:0xffffffff}),1000,/overflow/i);s.nodes[0].version=0;s.nodes[0].units[0].hp=0;failsUnchanged(s,recruit(),1000,/hp/i);});
