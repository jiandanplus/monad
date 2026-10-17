import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createTransactionBook} from '../src/transactions.mjs';
const source=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const actionSource=ts.transpile(source.slice(source.indexOf('async function runAction('),source.indexOf('for (const n of [1, 2])\n    el(`team-${n}`).onclick')), {target:ts.ScriptTarget.ES2022});
const A='0x'+'1'.repeat(40),C='0x'+'2'.repeat(40),H='0x'+'3'.repeat(64),H2='0x'+'4'.repeat(64);
function fixture(override={}) {
 const els=new Map();const events=[];
 const ctx={busy:false,connecting:false,deployment:{address:C},selected:1,team:1,ability:0,pendingDistrict:null,lastCooldown:0,
 snapshot:{roundId:7n,chainTime:100,endsAt:280,viewerTeam:0,nextActionAt:0,points:100,owners:[1,0,0,0,0,0,0,0,2],defense:[60,20,20,20,20,20,20,20,60]},stale:'',CHAIN_ID:10143,EXPLORER:'https://example.test',UNITS:[{cooldown:2}],
 orders:createTransactionBook(null,'test'),render(){},renderOrders(){},refresh:async()=>{},getConnectedAddress:()=>A,connectWallet:async()=>true,
 estimatedChainTime:s=>s.chainTime,remainingSeconds:s=>s.endsAt-s.chainTime,projectedSnapshot:s=>s,previewDispatch:()=>({valid:true}),reasonText:s=>s,describeError:e=>e.message,
 el:id=>{if(!els.has(id))els.set(id,{replaceChildren(){},});return els.get(id);},document:{createTextNode:s=>s},link:()=>({}),shortAddress:s=>s,
 hashStatus:h=>events.push(['hash',h]),status:(s,t)=>events.push(['status',s,t]),cast:async(d,target,team,unit,onHash,round)=>{onHash(H,A);return {hash:H};},startRound:async()=>{throw Error('unexpected start')},
 readOrderReceipt:async hash=>({chainId:10143,hash,status:'success',blockNumber:'123',contract:C,account:A,kind:'dispatch',roundId:'7',district:1,team:1,unit:0}),...override};
 vm.createContext(ctx);vm.runInContext(actionSource,ctx);return {ctx,events};
}
test('production entry has no local battle, bot or practice switch',()=>{
 assert.equal(/createBattlePractice|local\.cast|local\.rival|practice-tab|overlay-practice|switchMode/.test(source),false,'Production must have no simulation entry or execution path');
});
test('one dispatch waits for its independent receipt and never mutates a battle while pending',async()=>{
 let complete,calls=0;const {ctx}=fixture({cast:async(d,target,team,unit,onHash,round)=>{calls++;assert.deepEqual([target,team,unit,round],[1,1,0,7n]);onHash(H,A);await new Promise(r=>complete=r);return{hash:H};}});
 const before=JSON.stringify(ctx.snapshot,(_,v)=>typeof v==='bigint'?String(v):v);const sending=ctx.runAction();
 await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(ctx.orders.list()[0].status,'pending');assert.equal(JSON.stringify(ctx.snapshot,(_,v)=>typeof v==='bigint'?String(v):v),before);
 await ctx.runAction();assert.equal(calls,1,'double click must not create another transaction');
 complete();await sending;assert.equal(ctx.orders.list()[0].status,'confirmed');assert.equal(ctx.orders.list()[0].blockNumber,'123');assert.equal(ctx.busy,false);
});
test('wallet rejection produces no hash and no success',async()=>{
 const {ctx,events}=fixture({cast:async()=>{throw Error('User rejected');}});await ctx.runAction();
 assert.equal(ctx.orders.list()[0].status,'not_sent');assert.equal(ctx.orders.list()[0].hash,undefined);assert.equal(events.some(e=>e[2]==='success'),false);assert.equal(ctx.snapshot.points,100);
});
test('timeout after broadcast stays unknown without automatically resending',async()=>{
 let calls=0;const {ctx,events}=fixture({cast:async(d,t,team,u,onHash)=>{calls++;onHash(H,A);throw Error('receipt timeout');}});await ctx.runAction();
 assert.equal(calls,1);assert.equal(ctx.orders.list()[0].status,'unknown');assert.equal(ctx.orders.list()[0].hash,H);assert.equal(events.some(e=>e[2]==='success'),false);
});
test('fee replacement remains one order and cancellation never becomes a victory',async()=>{
 const {ctx}=fixture({cast:async(d,t,team,u,onHash)=>{onHash(H,A);onHash(H2,A,'cancelled');throw Error('cancelled');}});await ctx.runAction();
 assert.equal(ctx.orders.list().length,1);assert.equal(ctx.orders.list()[0].status,'cancelled');assert.equal(ctx.snapshot.defense[1],20);
});
test('unexpected or reverted receipt cannot be presented as a successful order',async()=>{
 const wrong=fixture({readOrderReceipt:async hash=>({chainId:10143,hash,status:'success',blockNumber:'123',contract:C,account:A,kind:'dispatch',roundId:'7',district:8,team:1,unit:0})});await wrong.ctx.runAction();assert.equal(wrong.ctx.orders.list()[0].status,'unknown');assert.equal(wrong.events.some(e=>e[2]==='success'),false);
 const revert=fixture({readOrderReceipt:async hash=>({chainId:10143,hash,status:'reverted',blockNumber:'123',contract:C,account:A,kind:'dispatch',roundId:'7',district:1,team:1,unit:0})});await revert.ctx.runAction();assert.equal(revert.ctx.orders.list()[0].status,'reverted');assert.equal(revert.events.some(e=>e[2]==='success'),false);
});
test('wallet connection and fresh snapshot do not silently change the clicked round',async()=>{
 let sent;const f=fixture({refresh:async()=>{f.ctx.snapshot={...f.ctx.snapshot,roundId:8n};},cast:async(d,t,team,u,onHash,round)=>{sent=round;throw Error('stale round');}});await f.ctx.runAction();assert.equal(sent,7n);
});

test('late reconciliation error cannot erase a foreground confirmed receipt',async()=>{
 const {ctx}=fixture();let rejectRead;
 ctx.reconcileInFlight=false;ctx.receiptAttemptedAt=new Map();
 const id=ctx.orders.begin({chainId:10143,contract:C,account:A,kind:'dispatch',roundId:'7',district:1,team:1,unit:0});ctx.orders.submitted(id,H,A);
 ctx.readOrderReceipt=async()=>new Promise((resolve,reject)=>rejectRead=reject);
 const reconcileSource=ts.transpile(source.slice(source.indexOf('async function reconcileOrders('),source.indexOf('function render()')), {target:ts.ScriptTarget.ES2022});
 vm.runInContext(reconcileSource,ctx);const reconciling=ctx.reconcileOrders();await new Promise(r=>setImmediate(r));
 ctx.orders.settle(id,{chainId:10143,hash:H,status:'success',blockNumber:'123',contract:C,account:A,kind:'dispatch',roundId:'7',district:1,team:1,unit:0});
 rejectRead(Error('older RPC timeout'));await reconciling;assert.equal(ctx.orders.list()[0].status,'confirmed');
});

test('older deployment resolution cannot overwrite a newly completed deployment',async()=>{
 for(const fail of [false,true]) {
  const {ctx}=fixture();let done,failLoad;
  Object.assign(ctx,{deploymentLoadGeneration:0,deploymentLoading:false,deploymentError:'',activities:[],storageKey:'deploy',localStorage:{removeItem(){}},history:{replaceState(){}},resetFeedback(){},urlForDeployment:()=>'',resolveDeployment:async()=>new Promise((resolve,reject)=>{done=resolve;failLoad=reject;})});
  const finish=source.slice(source.indexOf('function finishDeployment('),source.indexOf('async function deploymentAction('));
  const loading=source.slice(source.indexOf('async function loadDeployment('),source.indexOf('async function init('));
  vm.runInContext(ts.transpile(finish+loading,{target:ts.ScriptTarget.ES2022}),ctx);
  const old=ctx.loadDeployment();await new Promise(r=>setImmediate(r));const fresh={address:'0x'+'5'.repeat(40)};ctx.finishDeployment(fresh);
  if(fail)failLoad(Error('old request failed'));else done(null);
  await old;assert.equal(ctx.deployment,fresh);assert.equal(ctx.deploymentError,'');assert.equal(ctx.deploymentLoading,false);
 }
});
