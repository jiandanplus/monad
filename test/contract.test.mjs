import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,decodeEventLog} from 'viem';
import {compile} from '../scripts/compile.mjs';
import * as model from '../src/model.mjs';
const artifact=compile();
async function setup(t){
 const {abi,bytecode}=await artifact;
 const p=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',time:new Date(1000000)},miner:{timestampIncrement:0},wallet:{totalAccounts:3}});t.after(()=>p.disconnect());
 const c=createPublicClient({transport:custom(p)}),w=createWalletClient({transport:custom(p)}),[a,b,fresh]=await w.getAddresses();
 const receipt=await c.waitForTransactionReceipt({hash:await w.deployContract({abi,bytecode,account:a,chain:null,gas:6000000n})});assert.equal(receipt.status,'success');const address=receipt.contractAddress;
 const read=(functionName,args=[])=>c.readContract({address,abi,functionName,args}),snap=(who=a)=>read('getSnapshot',[who]);
 const send=async(functionName,args=[],account=a)=>{await c.simulateContract({address,abi,functionName,args,account});const r=await c.waitForTransactionReceipt({hash:await w.writeContract({address,abi,functionName,args,account,chain:null,gas:2000000n})});assert.equal(r.status,'success');return decodeEventLog({abi,...r.logs[0]}).args;};
 const no=async(functionName,args=[],account=a,value=0n,reason)=>{const before=await snap(account);await assert.rejects(c.simulateContract({address,abi,functionName,args,account,value}),reason?new RegExp(reason):undefined);assert.deepEqual(await snap(account),before);};
 const at=async x=>{await p.request({method:'evm_setTime',params:[Number(x)*1000]});await p.request({method:'evm_mine',params:[]});};
 return{abi,p,c,w,a,b,fresh,address,read,snap,send,no,at};
}
test('real EVM: capture economy, rejection atomicity, late join, cap and frozen historical rounds',async t=>{
 const {abi,a,b,fresh,read,snap,send,no,at}=await setup(t);assert.equal((await snap())[0],0n);await no('cast',[0n,0,1,0],a,0n,'No round');await no('getRoundResult',[0n]);
 const begun=await send('startRound',[0n],b),start=begun.startsAt,end=begun.endsAt;assert.equal(end-start,180n);assert.equal(begun.roundId,1n);
 let s=await snap();assert.deepEqual(s[3],[1,0,0,0,0,0,0,0,2]);assert.deepEqual(s[4],[60,20,20,20,20,20,20,20,60]);assert.equal(s[8],100);assert.equal(s[9],0);
 await no('startRound',[1n],a,0n,'Round active');await no('startRound',[0n],a,0n,'Round changed');
 for(const args of [[9,1,0],[0,0,0],[0,3,0],[0,1,3]])await no('cast',[1n,...args]);
 await no('cast',[1n,8,1,1],a,0n,'Unreachable');assert.equal((await snap())[10],0);
 const capture=await send('cast',[1n,1,1,2]);assert.equal(capture.beforeOwner,0);assert.equal(capture.afterOwner,1);assert.equal(capture.afterDefense,30);assert.equal(capture.spent,35);assert.equal(capture.pointsAfter,85);
 await no('cast',[1n,3,1,0],a,0n,'Cooldown active');await at(start+3n);await no('cast',[1n,3,2,0],a,0n,'Team locked');
 await at(start+10n);s=await snap();assert.equal(s[8],135);assert.equal(s[9],5);assert.deepEqual(s[7],[20n,10n]);assert.equal((await snap(fresh))[8],100);
 const late=await send('cast',[1n,7,2,2],b);assert.equal(late.pointsAfter,85);await at(start+20n);assert.deepEqual((await snap())[7],[40n,30n]);assert.equal((await snap(b))[8],135);
 await send('cast',[1n,4,1,2]);await at(start+23n);await send('cast',[1n,5,1,2]);await at(start+26n);await no('cast',[1n,8,1,2],a,0n,'Engineer cannot attack enemy');
 await send('cast',[1n,0,1,1]);await at(start+31n);await no('cast',[1n,0,1,0],a,0n,'No effect');await no('cast',[0n,1,1,0],a,0n,'Round changed');
 await no('cast',[1n,0,1,0],fresh,0n,'No effect');assert.equal((await snap(fresh))[10],0);assert.equal((await snap(fresh))[8],100);
 await no('cast',[1n,1,1,0],a,1n);await no('startRound',[1n],a,1n);assert.ok(abi.filter(x=>x.type==='function').every(x=>x.stateMutability!=='payable'));
 await at(end-1n);assert.equal((await snap())[8],200);assert.equal((await read('getRoundResult',[1n]))[3],false);assert.equal((await send('cast',[1n,3,1,1])).pointsAfter,170);
 await at(end);await no('cast',[1n,1,1,0],a,0n,'Round ended');const ended=await snap(),result=await read('getRoundResult',[1n]);assert.equal(ended[8],180);assert.equal(ended[9],0);assert.equal(result[2],1);assert.equal(result[3],true);
 await at(end+500n);assert.equal((await snap())[8],ended[8]);assert.deepEqual((await snap())[7],ended[7]);assert.deepEqual(await read('getRoundResult',[1n]),result);
 await send('startRound',[1n]);s=await snap();assert.equal(s[0],2n);assert.equal(s[10],0);assert.equal(s[8],100);assert.equal(s[11],0n);assert.deepEqual(s[7],[0n,0n]);assert.deepEqual(s[5],Array(9).fill(0));assert.deepEqual(s[6],Array(9).fill(0));
 await no('cast',[1n,1,1,2],a,0n,'Round changed');await no('getRoundResult',[3n]);assert.deepEqual(await read('getRoundResult',[1n]),result);await at(s[2]);assert.deepEqual(await read('getRoundResult',[2n]),[180n,180n,3,true]);
});
test('real EVM: insufficient points, reinforcement anywhere and zero-owned comeback',async t=>{
 const {a,b,snap,send,no,at}=await setup(t);const {startsAt:start}=await send('startRound',[0n]);
 await send('cast',[1n,0,1,2]);await at(start+3n);await send('cast',[1n,1,1,1]);await at(start+8n);assert.equal((await snap())[8],72);
 await send('cast',[1n,1,1,1]);await at(start+13n);assert.equal((await snap())[8],47);await no('cast',[1n,3,1,1],a,0n,'Insufficient points');
 await at(start+180n);const next=await send('startRound',[1n]),s=next.startsAt;
 await send('cast',[2n,1,1,2]);await at(s+3n);await send('cast',[2n,4,1,2]);await at(s+6n);await send('cast',[2n,5,1,2]);
 await at(s+15n);let hit=await send('cast',[2n,8,1,1]);assert.equal(hit.afterOwner,2);assert.equal(hit.afterDefense,10);
 await at(s+20n);hit=await send('cast',[2n,8,1,0]);assert.equal(hit.afterOwner,1);assert.equal(hit.afterDefense,10);assert.equal((await snap(b))[3].filter(x=>x===2).length,0);
 hit=await send('cast',[2n,6,2,2],b);assert.equal(hit.afterOwner,2);assert.equal(hit.afterDefense,30);
 await at(s+22n);hit=await send('cast',[2n,0,1,0]);assert.equal(hit.afterDefense,78);await at(s+25n);await no('cast',[2n,2,2,1],b,0n,'Unreachable');
 // Old base owner retains exactly 20 seconds of yield; new owner earns only from capture.
 assert.deepEqual((await snap())[7],[140n,30n]);assert.equal((await snap(b))[8],110);
});
test('real EVM and local model agree for a timed two-faction sequence including ownership switches',async t=>{
 const {a,b,snap,send,at}=await setup(t),begun=await send('startRound',[0n]),start=Number(begun.startsAt),practice=model.createBattlePractice(start);
 const compare=async now=>{const chain=await snap(),local=practice.snapshot(now);assert.deepEqual(chain.slice(3,7),[local.owners,local.defense,local.actions,local.entrants]);assert.deepEqual(chain[7].map(Number),local.scores);assert.equal(chain[8],local.points);assert.equal(chain[9],local.income);assert.equal(chain[10],local.viewerTeam);assert.equal(Number(chain[11]),local.nextActionAt);};
 const checkEvent=(actual,expected)=>{for(const key of ['roundId','district','team','unit','beforeOwner','afterOwner','beforeDefense','afterDefense','spent','pointsAfter'])assert.equal(actual[key],expected[key],key);};
 const human=new Map([[0,[1,1,2]],[6,[4,1,2]],[15,[5,1,1]],[30,[0,1,0]],[45,[1,1,0]],[70,[3,1,2]],[100,[6,1,1]],[130,[0,1,0]],[170,[3,1,0]]]);let switches=0,botActions=0;
 for(let elapsed=0;elapsed<=180;elapsed++){const now=start+elapsed;await at(now);const args=human.get(elapsed);
 if(args&&model.previewDispatch(practice.snapshot(now),...args).valid){const expected=practice.cast(...args,now);checkEvent(await send('cast',[1n,...args],a),expected);}
 const rival=practice.rival(now);if(rival){checkEvent(await send('cast',[1n,rival.district,rival.team,rival.unit],b),rival);botActions++;if(rival.beforeOwner&&rival.beforeOwner!==rival.afterOwner)switches++;}
 await compare(now);}
 assert.ok(botActions>10);assert.ok(switches>0,'sequence exercises revenue ownership switching');
});
