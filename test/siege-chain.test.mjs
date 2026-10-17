import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
import ganache from 'ganache';import {createPublicClient,createWalletClient,custom,defineChain} from 'viem';
import {loadSiegeChain} from './helpers/load-siege-chain.mjs';
const present=existsSync(new URL('../src/siege/chain.ts',import.meta.url));
const verifierPresent=existsSync(new URL('../scripts/verify-siege.mjs',import.meta.url));
const artifact=JSON.parse(readFileSync(new URL('../src/generated/SiegeCanvas.json',import.meta.url)));
test('live siege gateway exists',()=>assert.ok(present,'missing receipt-gated chain controller'));
test('read-only siege verification CLI exists',()=>assert.ok(verifierPresent,'missing read-only verification CLI'));
test('real EVM lobby and four-faction order pass same-block parser and receipt proofs',{skip:!present},async()=>{
 const {createSiegeController}=await loadSiegeChain();
 const provider=ganache.provider({logging:{quiet:true},chain:{chainId:10143,hardfork:'shanghai'},wallet:{totalAccounts:8},miner:{blockGasLimit:30000000}});
 try{
  const network=defineChain({id:10143,name:'Local Monad rules acceptance',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1']}}});
  const client=createPublicClient({chain:network,transport:custom(provider),pollingInterval:10});
  const wallet=createWalletClient({chain:network,transport:custom(provider)});const accounts=await wallet.getAddresses();
  const storage=new Map();const saved={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const events=new Map();let writes=0,changeAtWalletChainCheck=false,fallbackChange=false,fallbackWrites=0;
  const signing={request:args=>{
   if(args.method==='eth_chainId'&&changeAtWalletChainCheck){changeAtWalletChainCheck=false;events.get('accountsChanged')?.();}
   if(args.method==='eth_sendTransaction'&&fallbackChange){fallbackChange=false;events.get('accountsChanged')?.();return Promise.reject(Object.assign(Error('unsupported'),{code:-32601}));}
   if(args.method==='wallet_sendTransaction'){fallbackWrites++;return provider.request({...args,method:'eth_sendTransaction'});}
   if(args.method==='eth_sendTransaction')writes++;return provider.request({...args,method:args.method==='eth_requestAccounts'?'eth_accounts':args.method});
  },on:(event,cb)=>events.set(event,cb),removeListener:(event)=>events.delete(event)};
  const controller=createSiegeController({client,network,storage:saved});controller.setProvider(signing);
  await controller.connect();controller.selectAccount(accounts[0]);
  const dep=await controller.deploy(()=>{});const zero=await controller.read(dep);
  assert.equal(zero.snapshot.roundId,0n);assert.equal(zero.snapshot.nodes[0].units.length,0);
  const configure=await controller.send(dep,'configureRoster',[0n,accounts.slice(0,4),[1,2,3,4],1]);
  assert.equal(configure.proof.eventName,'RosterConfigured');
  let oldReady;
  for(const account of accounts.slice(0,4)){controller.selectAccount(account);const r=await controller.send(dep,'ready',[1n]);if(account===accounts[0])oldReady=r.proof.hash;}
  controller.selectAccount(accounts[0]);await controller.send(dep,'startRound',[0n,1n]);
  let state=await controller.read(dep);assert.equal(state.snapshot.endsAt-state.snapshot.startsAt,300);assert.deepEqual(state.snapshot.nodes.slice(0,4).map(n=>n.owner),[1,3,2,4]);
  const node=state.snapshot.nodes[0],target=state.snapshot.nodes[4];
  const result=await controller.send(dep,'dispatch',[1n,0,4,node.version,target.version,[0,1,2]],undefined,1);
  assert.equal(result.proof.eventName,'OrderExecuted');assert.equal(result.proof.event.team,1);assert.equal(result.world.snapshot.nodes[0].units.length,2);
  const recent=await controller.recent(dep,result.world);
  assert.equal(recent.some(p=>p.hash===result.proof.hash),true);
  if(verifierPresent){const {verifySiege}=await import('../scripts/verify-siege.mjs');const evidence=await verifySiege(client,dep,'local-evm');assert.equal(evidence.scope,'local-evm');assert.equal(evidence.runtimeMatches,true);assert.equal(evidence.orders.some(o=>o.hash===result.proof.hash),true);assert.equal(evidence.testnetAcceptancePassed,false);}
  assert.equal(storage.size,0);assert.equal(controller.pending(),null);
  await assert.rejects(controller.send(dep,'dispatch',[1n,0,4,node.version,target.version,[0]],undefined,1));
  controller.destroy();

  await provider.request({method:'evm_increaseTime',params:[4]});await provider.request({method:'evm_mine',params:[]});
  let changeOnEstimate=true;
  const raceClient=new Proxy(client,{get(target,name){if(name==='estimateContractGas')return async args=>{const result=await target.estimateContractGas(args);if(changeOnEstimate)events.get('accountsChanged')?.();return result;};return target[name];}});
  const race=createSiegeController({client:raceClient,network,storage:saved});race.setProvider(signing);await race.connect();race.selectAccount(accounts[0]);
  state=await race.read(dep);const before=writes;
  await assert.rejects(race.send(dep,'recruit',[1n,0,state.snapshot.nodes[0].version,0,1]),/变化/);
  assert.equal(writes,before,'account switch before signature prevents broadcast');assert.equal(race.pending(),null);race.destroy();

  const timeoutClient=new Proxy(client,{get(target,name){if(name==='waitForTransactionReceipt')return async()=>{throw Error('RPC timeout after broadcast');};return target[name];}});
  const uncertain=createSiegeController({client:timeoutClient,network,storage:saved});uncertain.setProvider(signing);await uncertain.connect();uncertain.selectAccount(accounts[0]);
  state=await uncertain.read(dep);
  const recruitArgs=[1n,0,state.snapshot.nodes[0].version,0,1];
  await assert.rejects(uncertain.send(dep,'recruit',recruitArgs),/timeout/);
  assert.equal(uncertain.pending().status,'unverified');assert.equal(storage.size,1);
  const sent=writes;await assert.rejects(uncertain.send(dep,'recruit',recruitArgs),/pending/);assert.equal(writes,sent);
  uncertain.destroy();
  const restored=createSiegeController({client,network,storage:saved});assert.equal(restored.pending().status,'unverified');
  const checked=await restored.recheck(dep);assert.equal(checked.proof.eventName,'OrderExecuted');assert.equal(restored.pending(),null);assert.equal(storage.size,0);
  restored.destroy();

  const late=createSiegeController({client,network});late.setProvider(signing);await late.connect();late.selectAccount(accounts[0]);
  const beforeLate=writes;
  await assert.rejects(late.deploy(p=>{if(p.status==='awaiting-signature')changeAtWalletChainCheck=true;}),/变化/);
  assert.equal(writes,beforeLate,'a session change inside viem chain check must block the send RPC');late.destroy();

  const fallback=createSiegeController({client,network});fallback.setProvider(signing);await fallback.connect();fallback.selectAccount(accounts[0]);
  await assert.rejects(fallback.deploy(p=>{if(p.status==='awaiting-signature')fallbackChange=true;}));
  assert.equal(fallbackWrites,0,'wallet_sendTransaction fallback must also reject changed sessions');fallback.destroy();

  let omitAnchor=false;
  const swappedClient=new Proxy(client,{get(target,name){
   if(name==='getTransaction')return async args=>{if(omitAnchor){omitAnchor=false;throw Error('original lookup temporarily unavailable');}return target.getTransaction(args);};
   if(name==='waitForTransactionReceipt')return async()=>client.getTransactionReceipt({hash:oldReady});
   return target[name];
  }});
  const swapped=createSiegeController({client:swappedClient,network,storage:saved});swapped.setProvider(signing);await swapped.connect();swapped.selectAccount(accounts[0]);
  await assert.rejects(swapped.send(dep,'ready',[1n],p=>{if(p.status==='broadcast')omitAnchor=true;}),/hash/i);
  assert.equal(swapped.pending().status,'unverified');swapped.destroy();
  const unswap=createSiegeController({client,network,storage:saved});assert.equal((await unswap.recheck(dep)).proof.eventName,'PlayerReady');unswap.destroy();

  // Mine a genuine same-nonce cancellation, then lose RPC confirmation and reload.
  await provider.request({method:'miner_stop',params:[]});
  let cancellationHash,priorCancellationRecord,originalCancelledTx;
  const replaceClient=new Proxy(client,{get(target,name){if(name==='waitForTransactionReceipt')return async params=>{
   const original=await client.getTransaction({hash:params.hash});
   originalCancelledTx=original;
   cancellationHash=await wallet.sendTransaction({account:accounts[0],to:accounts[0],value:0n,nonce:original.nonce,gas:21000n,gasPrice:100_000_000_000n+(original.maxFeePerGas??original.gasPrice)*3n});
   await provider.request({method:'miner_start',params:[1]});
   await client.waitForTransactionReceipt({hash:cancellationHash});
   priorCancellationRecord=[...storage.values()][0];
   params.onReplaced({reason:'cancelled',transaction:{hash:cancellationHash}});
   throw Error('RPC timeout after replacement');
  };return target[name];}});
  const replaced=createSiegeController({client:replaceClient,network,storage:saved});replaced.setProvider(signing);await replaced.connect();replaced.selectAccount(accounts[0]);
  await assert.rejects(replaced.send(dep,'ready',[1n]),/timeout/);assert.equal(replaced.pending().hash,cancellationHash);replaced.destroy();
  const afterCancellation=createSiegeController({client,network,storage:saved});const cancellationStates=[];
  assert.equal(await afterCancellation.recheck(dep,p=>cancellationStates.push(p.status)),null);
  assert.deepEqual(cancellationStates,['cancelled']);assert.equal(afterCancellation.pending(),null);assert.equal(storage.size,0);afterCancellation.destroy();
  storage.set('blitzcanvas:siege:pending:v1',priorCancellationRecord);
  const closedBeforeCallback=createSiegeController({client,network,storage:saved});
  assert.notEqual(closedBeforeCallback.pending().hash,cancellationHash);
  const restoredCancellationStates=[];
  assert.equal(await closedBeforeCallback.recheck(dep,p=>restoredCancellationStates.push(p.status),cancellationHash),null);
  assert.deepEqual(restoredCancellationStates,['cancelled']);assert.equal(storage.size,0);closedBeforeCallback.destroy();
  const missingAnchor=JSON.parse(priorCancellationRecord);missingAnchor.anchor=null;
  storage.set('blitzcanvas:siege:pending:v1',JSON.stringify(missingAnchor));let originalReads=0;
  const propagatedClient=new Proxy(client,{get(target,name){if(name==='getTransaction')return async args=>{if(args.hash===originalCancelledTx.hash){originalReads++;return originalCancelledTx;}return target.getTransaction(args);};return target[name];}});
  const delayedPropagation=createSiegeController({client:propagatedClient,network,storage:saved});
  assert.equal(await delayedPropagation.recheck(dep,undefined,cancellationHash),null);
  assert.equal(originalReads,1,'recheck refreshes the verified original nonce after initial propagation failure');assert.equal(delayedPropagation.pending(),null);assert.equal(storage.size,0);delayedPropagation.destroy();
 }finally{await provider.disconnect();}
});
