import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom} from 'viem';
import artifact from '../src/generated/BlitzCanvas.json' with {type:'json'};
import * as adapter from '../src/chain.ts';

test('production pixel adapter decodes ownership, economy, score and squad events',async t=>{
 const p=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'},miner:{timestampIncrement:0},wallet:{totalAccounts:2}});
 const client=createPublicClient({transport:custom(p)}),wallet=createWalletClient({transport:custom(p)});
 const [a,b]=await wallet.getAddresses();
 const receipt=await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,account:a,chain:null,gas:3000000n})});
 const deployment={address:receipt.contractAddress,blockNumber:receipt.blockNumber};
 const originals={};
 for(const name of ['getCode','getBlockNumber','readContract','getLogs','getTransactionReceipt','getTransaction']){originals[name]=adapter.publicClient[name];adapter.publicClient[name]=client[name];}
 t.after(async()=>{for(const name of Object.keys(originals))adapter.publicClient[name]=originals[name];await p.disconnect();});
 const send=async(functionName,args,account=a)=>{
  const r=await client.waitForTransactionReceipt({hash:await wallet.writeContract({address:deployment.address,abi:artifact.abi,functionName,args,account,chain:null,gas:1000000n})});
  assert.equal(r.status,'success');
  return r;
 };
 const empty=await adapter.getSnapshot(deployment);assert.equal(empty.roundId,0n);assert.equal(empty.owners.length,9);assert.equal(empty.points,100);
 await send('startRound',[0n]);const first=await send('cast',[1n,1,1,2],a);await send('cast',[1n,7,2,1],b);
 assert.equal(typeof adapter.readOrderReceipt,'function','Missing verified real-order receipt reader');
 const proof=await adapter.readOrderReceipt(first.transactionHash);
 assert.equal(proof.status,'success');assert.equal(proof.kind,'dispatch');assert.equal(proof.roundId,'1');assert.equal(proof.district,1);assert.equal(proof.unit,2);assert.equal(proof.team,1);assert.equal(proof.account.toLowerCase(),a.toLowerCase());assert.equal(proof.contract.toLowerCase(),deployment.address.toLowerCase());
 assert.equal(await adapter.readOrderReceipt('0x'+'f'.repeat(64)),null);
 const state=await adapter.getSnapshot(deployment);
 assert.equal(state.roundId,1n);assert.equal(state.endsAt-state.startsAt,180);
 assert.equal(state.owners[1],1);assert.equal(state.defense[1],30);assert.equal(state.owners[7],2);assert.equal(state.defense[7],30);
 assert.equal(state.actions.reduce((s,n)=>s+n),2);assert.equal(state.entrants.reduce((s,n)=>s+n),2);assert.equal(state.viewerTeam,0);
 assert.equal(state.points,100);assert.equal(state.income,0);assert.equal(state.scores.length,2);assert.ok(state.scores.every(Number.isSafeInteger));
 const logs=await adapter.getActivity(deployment,state.blockNumber,1n);
 assert.equal(logs.length,2);assert.equal(logs[0].district,7);assert.equal(logs[0].team,2);assert.equal(logs[0].unit,1);
 assert.equal(logs[0].beforeOwner,0);assert.equal(logs[0].afterOwner,2);assert.equal(logs[0].beforeDefense,20);assert.equal(logs[0].afterDefense,30);
 assert.equal(logs[0].spent,50);assert.equal(logs[0].pointsAfter,70);
 assert.deepEqual(await adapter.getActivity(deployment,state.blockNumber,2n),[]);
 await p.request({method:'evm_increaseTime',params:[10]});await p.request({method:'evm_mine',params:[]});
 const accrued=await adapter.getSnapshot(deployment);const elapsed=accrued.chainTime-state.chainTime;
 assert.equal(accrued.scores[0]-state.scores[0],elapsed*2);assert.equal(accrued.scores[1]-state.scores[1],elapsed*2);
 await assert.rejects(adapter.cast(deployment,1,1,3,()=>{},1n),/兵种|有效/);
});
