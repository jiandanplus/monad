import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderGate} from '../src/siege/transactions.mjs';
import {createRound,snapshot} from '../src/siege/model.mjs';
import {captureSelection,reconcileSelection,actionOrder,previewDispatch,parseRoster,access,remainingSeconds,acceptRead,createDeploymentSelection,acceptReport,applySnapshot,roomControls} from '../src/siege/ui.mjs';
const players=Array.from({length:4},(_,i)=>`0x${String(i+1).padStart(40,'0')}`);
const board=()=>({...snapshot(createRound({roundId:1,rosterVersion:1,seatsPerFaction:1,players,teams:[1,2,3,4],now:100}),100),roundId:1n,rosterVersion:1n,blockNumber:1n,loadedAt:100000});
const context=(s=board())=>({snapshot:s,account:players[0],verified:true,stale:false,busy:false,pending:false,now:100000});
test('unknown and stale boards never authorize orders',()=>{
 assert.match(access({...context(),snapshot:null}).reason,/快照/);
 assert.match(access({...context(),stale:true}).reason,/过期/);
 assert.throws(()=>actionOrder({...context(),stale:true},captureSelection(board(),0,[0],4),'dispatch'),/过期/);
});
test('unaffected poll preserves exact selection, changed target invalidates it',()=>{
 const s=board(),sel=captureSelection(s,0,[0,2],4);
 assert.deepEqual(reconcileSelection(sel,{...s,blockNumber:2n}),sel);
 const changed=structuredClone(s);changed.nodes[4].version++;
 assert.equal(reconcileSelection(sel,changed).units.length,0);
 assert.equal(reconcileSelection(sel,changed).target,null);
 const next=structuredClone(s);next.roundId=2n;
 assert.equal(reconcileSelection(sel,next).units.length,0);
});
test('dispatch args freeze actual versions and sorted original unit indexes',()=>{
 const s=board(),sel=captureSelection(s,0,[4,1],4);
 const order=actionOrder(context(s),sel,'dispatch');
 assert.deepEqual(order.args,[1n,0,4,s.nodes[0].version,s.nodes[4].version,[1,4]]);
 s.nodes[0].version++;
 assert.throws(()=>actionOrder(context(s),sel,'dispatch'),/变化/);
});
test('spectators, pending, ended and excessive selections cannot write',()=>{
 const s=board(),sel=captureSelection(s,0,[0],4);
 for(const patch of [{account:players[3]},{pending:true},{now:400000}])assert.throws(()=>actionOrder({...context(s),...patch},sel,'dispatch'));
 assert.throws(()=>captureSelection(s,0,[0,0],4));
 assert.throws(()=>captureSelection(s,0,[0,1,2,3,4,5,6],4));
});
test('preview uses actual damaged troops and flags leaving supply bridge empty',()=>{
 const s=board();s.nodes[4]={...s.nodes[4],owner:1,supplied:true,units:[{kind:0,hp:3}]};s.nodes[8]={...s.nodes[8],owner:1,supplied:true};
 const result=previewDispatch(s,captureSelection(s,4,[0],9),1);
 assert.equal(result.remaining,0);assert.ok(result.atRisk.includes(8));assert.ok(result.attackers.every(u=>u.hp<=3));
});
test('friendly capacity, enemy base, engineer-only and factory restrictions are enforced',()=>{
 const s=board();s.nodes[4].owner=1;s.nodes[4].units=Array.from({length:12},()=>({kind:0,hp:10}));
 assert.throws(()=>actionOrder(context(s),captureSelection(s,0,[0],4),'dispatch'),/12/);
 assert.throws(()=>actionOrder(context(s),captureSelection(s,0,[4],7),'dispatch'),/工程师/);
 s.nodes[4].units=[{kind:0,hp:10}];
 assert.throws(()=>actionOrder(context(s),captureSelection(s,4,[0],1),'dispatch'),/基地/);
 s.nodes[12]={...s.nodes[12],owner:1,supplied:true,units:[]};
 assert.throws(()=>actionOrder(context(s),captureSelection(s,12,[],null),'recruit',{kind:1,count:1}),/兵工厂/);
});
test('repair selects 1..3 injured troops, costs 15 total and requires supply',()=>{
 const s=board();s.nodes[0].units[0].hp=1;s.nodes[0].units[1].hp=4;
 const sel=captureSelection(s,0,[0,1],null),o=actionOrder(context(s),sel,'repair');assert.equal(o.cost,15);assert.deepEqual(o.args,[1n,0,s.nodes[0].version,[0,1]]);
 assert.throws(()=>actionOrder(context(s),captureSelection(s,0,[2],null),'repair'),/残血/);
 s.nodes[0].supplied=false;assert.throws(()=>actionOrder(context(s),sel,'repair'),/补给/);
});
test('rosters require equal actual addresses and reject duplicates/zero',()=>{
 const r=parseRoster(players,1);assert.deepEqual(r.teams,[1,2,3,4]);
 assert.throws(()=>parseRoster([players[0],players[0],players[2],players[3]],1),/重复/);
 assert.throws(()=>parseRoster(['0x'+ '0'.repeat(40),...players.slice(1)],1));
 assert.throws(()=>parseRoster(players,2),/2/);
});
test('local clock estimate caps at 300 and reaches zero without creating state',()=>{
 const s=board();assert.equal(remainingSeconds(s,100000),300);assert.equal(remainingSeconds(s,500000),0);assert.equal(remainingSeconds(null,500000),null);
});

test('late reads cannot restore a previous deployment, wallet session, or suspended page',()=>{
 const d={address:players[0],blockNumber:1n},request={deployment:d,epoch:3};
 const current={deployment:d,epoch:3,disposed:false,suspended:false,blockNumber:10n};
 assert.equal(acceptRead(current,request,11n),true);
 for(const patch of [{deployment:{...d}},{epoch:4},{suspended:true},{disposed:true},{blockNumber:12n}])assert.equal(acceptRead({...current,...patch},request,11n),false);
});
test('fortify and recruit enforce actual shared funds, source cooldown, capacity and engineer',()=>{
 const s=board();s.nodes[4]={...s.nodes[4],owner:1,supplied:true,units:[{kind:2,hp:8}]};
 const sel=captureSelection(s,4);assert.equal(actionOrder(context(s),sel,'fortify').cost,20);
 s.funds[0]=19;assert.throws(()=>actionOrder(context(s),sel,'fortify'),/军费/);
 s.funds[0]=100;s.nodes[4].cooldownUntil=101;assert.throws(()=>actionOrder(context(s),sel,'fortify'),/冷却/);
 s.nodes[4].cooldownUntil=0;s.nodes[4].units=[];assert.throws(()=>actionOrder(context(s),sel,'fortify'),/工程师/);
 const base=captureSelection(s,0);assert.equal(actionOrder(context(s),base,'recruit',{kind:1,count:2}).cost,100);
 assert.throws(()=>actionOrder(context(s),base,'recruit',{kind:1,count:3}),/军费/);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('delayed startup deployment survives wallet changes but yields to explicit room selection',async()=>{
 const selection=createDeploymentSelection(),manifest=deferred(),activated=[];
 let walletEpoch=0;const ticket=selection.capture();
 const completion=manifest.promise.then(d=>{if(selection.accepts(ticket,false))activated.push(d);});
 walletEpoch++;walletEpoch++;manifest.resolve('A');await completion;
 assert.equal(walletEpoch,2);assert.deepEqual(activated,['A']);
 const pending=deferred(),second=selection.capture();
 const next=pending.promise.then(d=>{if(selection.accepts(second,false))activated.push(d);});
 selection.select();activated.push('B');pending.resolve('A');await next;
 assert.deepEqual(activated,['A','B']);assert.equal(selection.accepts(selection.capture(),true),false);
});
test('late recent proof completion never replays onto a different round or context',async()=>{
 const deployment={},request={deployment,epoch:1,roundId:1n};
 let current={...request,disposed:false,suspended:false};const pending=deferred(),replayed=[];
 const proof={eventName:'OrderExecuted',event:{roundId:1n},hash:'old'};
 const completion=pending.promise.then(proofs=>{for(const p of proofs)if(acceptReport(current,request,p))replayed.push(p.hash);});
 current={...current,roundId:2n};pending.resolve([proof]);await completion;assert.deepEqual(replayed,[]);
 assert.equal(acceptReport(current,{...request,roundId:2n},proof),false);
 const valid={...proof,event:{roundId:2n}};assert.equal(acceptReport(current,{...request,roundId:2n},valid),true);
 for(const patch of [{epoch:2},{suspended:true},{disposed:true},{deployment:{}}])assert.equal(acceptReport({...current,...patch},{...request,roundId:2n},valid),false);
});
test('round transition clears active replay before restoring actual board, and late confirmation cannot rewind',()=>{
 const first=board(),second={...board(),roundId:2n,blockNumber:2n};let displayed=first.nodes,replays=['old'],reports=['old'];const calls=[];
 const scene={setState(nodes){calls.push(nodes);displayed=nodes;if(nodes===null)replays=[];}};
 assert.equal(applySnapshot(first,second,scene,()=>{reports=[];}),true);
 assert.deepEqual(calls,[null,second.nodes]);assert.equal(displayed,second.nodes);assert.deepEqual(replays,[]);assert.deepEqual(reports,[]);
 calls.length=0;assert.equal(applySnapshot(second,first,scene,()=>{reports=[];}),false);assert.deepEqual(calls,[]);assert.equal(displayed,second.nodes);
});
test('pending room A permits read-only switch from B while preserving hash and write lock',async()=>{
 const gate=createOrderGate(),hash='0x'+'a'.repeat(64),intent={address:'A'};gate.restore({key:'restored',hash});
 const original=gate.current();let room='B',sent=0;
 assert.equal(roomControls({busy:false,pending:gate.current()}).open,true);
 if(roomControls({busy:false,pending:gate.current()}).open)room='A';
 assert.equal(room,'A');assert.deepEqual(gate.current(),original);assert.equal(roomControls({busy:false,pending:gate.current()}).write,false);
 assert.equal(access({...context(),pending:!!gate.current()}).allowed,false);
 await assert.rejects(gate.run('new-order',()=>{sent++;}),/pending/);assert.equal(sent,0);
 assert.equal(roomControls({busy:true,pending:gate.current()}).open,false);
 assert.equal(room,intent.address);gate.resolve(hash,'confirmed');assert.equal(gate.current(),null);
 assert.equal(roomControls({busy:false,pending:gate.current()}).write,true);
});
