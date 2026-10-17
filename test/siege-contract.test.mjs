import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,decodeEventLog} from 'viem';
import {createRound,applyOrder,snapshot} from '../src/siege/model.mjs';
import {HOME_BY_TEAM} from '../src/siege/config.mjs';
import {compile} from '../scripts/compile-siege.mjs';
const artifactPromise=compile();
const gas={};
const unpack=value=>typeof value==='bigint'?Number(value):Array.isArray(value)?value.map(unpack):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='players'?v.map(a=>a.toLowerCase()):unpack(v)])):value;
async function setup(t,seats=1){
 const artifact=await artifactPromise,{abi,bytecode}=artifact;
 const provider=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai',time:new Date(1000000)},miner:{timestampIncrement:0,blockGasLimit:30000000},wallet:{totalAccounts:17}});t.after(()=>provider.disconnect());
 const client=createPublicClient({transport:custom(provider)}),wallet=createWalletClient({transport:custom(provider)}),accounts=await wallet.getAddresses(),host=accounts[0];
 const receipt=await client.waitForTransactionReceipt({hash:await wallet.deployContract({abi,bytecode,account:host,chain:null,gas:15000000n})});assert.equal(receipt.status,'success');gas.deploy=Number(receipt.gasUsed);const address=receipt.contractAddress;assert.equal(await client.getCode({address}),artifact.deployedBytecode);
 const read=(functionName,args=[])=>client.readContract({address,abi,functionName,args}),snap=(id=0n)=>read('getSnapshot',[id]);
 const send=async(functionName,args=[],account=host)=>{await client.simulateContract({address,abi,functionName,args,account});const r=await client.waitForTransactionReceipt({hash:await wallet.writeContract({address,abi,functionName,args,account,chain:null,gas:15000000n})});assert.equal(r.status,'success');assert.ok(r.gasUsed<15000000n);gas[functionName]=Math.max(gas[functionName]??0,Number(r.gasUsed));return decodeEventLog({abi,...r.logs[0]}).args;};
 const no=async(functionName,args=[],account=host,value=0n)=>{const before=await snap(),lobby=await read('getLobby');await assert.rejects(client.simulateContract({address,abi,functionName,args,account,value}));if(abi.find(f=>f.type==='function'&&f.name===functionName).stateMutability==='nonpayable'){const failed=await client.waitForTransactionReceipt({hash:await wallet.writeContract({address,abi,functionName,args,account,value,chain:null,gas:15000000n})});assert.equal(failed.status,'reverted');}assert.deepEqual(await snap(),before);assert.deepEqual(await read('getLobby'),lobby);};
 const at=async time=>{await provider.request({method:'evm_setTime',params:[Number(time)*1000]});await provider.request({method:'evm_mine',params:[]});};
 const players=accounts.slice(1,1+4*seats),teams=players.map((_,i)=>Math.floor(i/seats)+1);
 const configure=()=>send('configureRoster',[0n,players,teams,seats]);
 const start=async()=>{await configure();for(const player of players)await send('ready',[1n],player);return send('startRound',[0n,1n]);};
 return{artifact,abi,provider,client,wallet,accounts,host,address,read,snap,send,no,at,players,teams,start,configure};
}
function driver(h,start){
 let state=createRound({roundId:1,rosterVersion:1,seatsPerFaction:h.players.length/4,players:h.players,teams:h.teams,now:Number(start)});
 const compare=async()=>{const s=unpack(await h.snap());s.nodes=s.nodes.map(n=>({...n,units:n.units.map(u=>({kind:u>>8,hp:u&255}))}));assert.deepEqual(s,snapshot(state,s.blockTimestamp));return s;};
 const order=async(type,team,args,time)=>{await h.at(Number(start)+time);const actor=h.players[h.teams.indexOf(team)],node=type==='dispatch'?args.from:args.node;
 const input={actor,expectedRoundId:1,type,...args,...(type==='dispatch'?{fromVersion:state.nodes[node].version,toVersion:state.nodes[args.to].version}:{nodeVersion:state.nodes[node].version})};
 const params=type==='dispatch'?[1n,node,args.to,input.fromVersion,input.toVersion,args.unitIndexes]:type==='recruit'?[1n,node,input.nodeVersion,args.kind,args.count]:type==='repair'?[1n,node,input.nodeVersion,args.unitIndexes]:[1n,node,input.nodeVersion];
 const next=applyOrder(state,input,Number(start)+time),event=await h.send(type,params,actor);state=next;
 assert.equal(event.fromVersion,state.nodes[node].version);assert.equal(event.toVersion,state.nodes[type==='dispatch'?args.to:node].version);await compare();return event;};
 return{order,compare,get state(){return state;}};
}
test('EVM roster lifecycle, default empty round, nonpayable and historical roster',async t=>{
 const h=await setup(t),empty=await h.snap();assert.equal(empty.roundId,0n);assert.ok(empty.nodes.every(n=>n.units.length===0));assert.equal((await h.read('getLobby'))[2],2);await h.no('getSnapshot',[1n]);
 await h.no('configureRoster',[0n,h.players,h.teams,1],h.players[0]);await h.no('configureRoster',[0n,[h.players[0],h.players[0],...h.players.slice(2)],h.teams,1]);await h.no('configureRoster',[0n,h.players,[1,1,3,4],1]);
 await h.configure();await h.no('ready',[0n],h.players[0]);await h.no('ready',[1n],h.host);await h.no('startRound',[0n,1n]);
 for(const player of h.players)await h.send('ready',[1n],player);await h.no('startRound',[0n,1n],h.players[0]);const begun=await h.send('startRound',[0n,1n]);assert.equal(begun.endsAt-begun.startsAt,300n);assert.deepEqual((await h.read('getLobby'))[5],[false,false,false,false]);
 await h.no('configureRoster',[1n,h.players,h.teams,1]);for(const player of h.players)await h.send('ready',[1n],player);await h.no('startRound',[1n,1n]);
 await h.no('recruit',[1n,0,0,0,1],h.players[0],1n);assert.ok(h.abi.filter(x=>x.type==='function').every(x=>x.stateMutability!=='payable'));
 await h.at(begun.endsAt);const old=await h.snap(1n);await h.send('configureRoster',[1n,h.players.toReversed(),h.teams,1]);assert.deepEqual((await h.snap(1n)).players,old.players);await h.no('ready',[1n],h.players[0]);
 for(const player of h.players)await h.send('ready',[2n],player);await h.send('startRound',[1n,2n]);assert.deepEqual((await h.snap(1n)).players,old.players);assert.deepEqual((await h.snap()).players,h.players.toReversed());await h.no('getSnapshot',[3n]);
});
for(const seats of [1,2,3,4])test(`EVM ${4*seats} seats, four faction commands and shared resource/version races`,async t=>{
 const h=await setup(t,seats),begun=await h.start(),d=driver(h,begun.startsAt);await d.compare();
 for(let team=1;team<=4;team++){const node=HOME_BY_TEAM[team];await d.order('recruit',team,{node,kind:0,count:1},0);await h.no('recruit',[1n,node,0,0,1],h.players[h.teams.indexOf(team)]);}
 const destinations={1:4,2:6,3:5,4:7};for(let team=1;team<=4;team++)await d.order('dispatch',team,{from:HOME_BY_TEAM[team],to:destinations[team],unitIndexes:[0,1,2,3,4,5]},3);
 for(let team=1;team<=4;team++)assert.equal(d.state.nodes[destinations[team]].owner,team);
 await h.no('dispatch',[1n,4,8,d.state.nodes[4].version,0,[1,0]],h.players[0]);await h.no('recruit',[0n,0,d.state.nodes[0].version,0,1],h.players[0]);
});
test('EVM full legal route cuts and restores supply, combat engineering factory and end cap match model',async t=>{
 const h=await setup(t),begun=await h.start(),d=driver(h,begun.startsAt);
 // A tank clears but cannot occupy. The engineer then claims the empty old flag.
 let event=await d.order('dispatch',1,{from:0,to:4,unitIndexes:[3]},0);assert.equal(event.captured,false);assert.equal(event.returned,true);assert.equal(d.state.nodes[4].owner,0);assert.equal(d.state.nodes[4].units.length,0);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[3]},3);assert.equal(d.state.nodes[4].owner,1);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[0,1,2,3]},6);await d.order('repair',1,{node:4,unitIndexes:[4]},7);await d.order('fortify',1,{node:4},10);await h.no('fortify',[1n,4,d.state.nodes[4].version],h.players[0]);
 await d.order('dispatch',1,{from:4,to:8,unitIndexes:[1,2,3,4]},13);assert.equal(d.state.nodes[8].owner,1);await d.order('dispatch',1,{from:8,to:12,unitIndexes:d.state.nodes[8].units.map((_,i)=>i)},16);assert.equal(d.state.nodes[12].owner,1);
 await d.order('recruit',1,{node:12,kind:0,count:1},19);await h.no('recruit',[1n,12,d.state.nodes[12].version,1,1],h.players[0]);
 // Blue attacks north mine from its own base, severing the complete north route.
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[0,1,2,3,4]},22);assert.equal(d.state.nodes[4].owner,3);let s=await d.compare();assert.equal(s.nodes[12].supplied,false);assert.equal(s.scoreRates[0],0);
 await h.at(begun.startsAt+32n);s=await d.compare();const cutScore=s.scores[0];await h.no('recruit',[1n,12,d.state.nodes[12].version,0,1],h.players[0]);
 // Blue withdraws, Green recruits reinforcements then fights back along a legitimate edge.
 await d.order('dispatch',3,{from:4,to:1,unitIndexes:d.state.nodes[4].units.map((_,i)=>i)},33);
 await d.order('recruit',1,{node:0,kind:0,count:3},34);await d.order('dispatch',1,{from:0,to:4,unitIndexes:[0,1,2]},37);s=await d.compare();assert.equal(s.nodes[12].supplied,true);assert.equal(s.scores[0],cutScore);
 await h.at(begun.startsAt+47n);s=await d.compare();assert.equal(s.scores[0],cutScore+10);await h.at(begun.endsAt);s=await d.compare();await h.no('recruit',[1n,0,d.state.nodes[0].version,0,1],h.players[0]);await h.at(begun.endsAt+500n);const later=await d.compare();assert.deepEqual(later.funds,s.funds);assert.deepEqual(later.scores,s.scores);
});
test('EVM maximum armies, capacity, shared funds and same-node contention are atomic',async t=>{
 const h=await setup(t,4),begun=await h.start(),d=driver(h,begun.startsAt),blue=h.players[h.teams.indexOf(3)],green=h.players[0];
 await h.no('dispatch',[1n,0,4,0,0,[4]],green); // Pure engineers cannot skip the neutral defenders.
 await h.no('repair',[1n,0,0,[0]],green);await h.no('fortify',[1n,0,0],green);
 await h.no('dispatch',[1n,0,1,0,0,[0]],green);await h.no('dispatch',[1n,0,4,0,0,[]],green);
 await h.no('recruit',[1n,0,0,0,0],green);await h.no('recruit',[1n,0,0,0,7],green);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[0,1,2,3,4]},0);
 await d.order('dispatch',3,{from:4,to:1,unitIndexes:d.state.nodes[4].units.map((_,i)=>i)},3);
 const initialBlue=d.state.nodes[1].units.length;
 await d.order('recruit',3,{node:1,kind:0,count:6},30);
 await h.no('recruit',[1n,1,d.state.nodes[1].version,0,2],h.players[h.teams.indexOf(3)+1]);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:Array.from({length:6},(_,i)=>initialBlue+i)},33);
 // Only six newly recruited tanks leave Green's base; unselected troops stay put.
 await d.order('recruit',1,{node:0,kind:1,count:3},60);
 await h.at(begun.startsAt+63n);await h.no('recruit',[1n,0,d.state.nodes[0].version,1,1],h.players[1]);
 await d.order('recruit',3,{node:1,kind:0,count:6},90);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:Array.from({length:6},(_,i)=>initialBlue+i)},93);
 assert.equal(d.state.nodes[4].units.length,12);
 await h.no('dispatch',[1n,1,4,d.state.nodes[1].version,d.state.nodes[4].version,[0]],blue);
 await d.order('recruit',1,{node:0,kind:1,count:2},150);
 await h.no('recruit',[1n,0,d.state.nodes[0].version-1,0,1],h.players[1]);
 const tankIndexes=d.state.nodes[0].units.flatMap((u,i)=>u.kind===1?[i]:[]);assert.equal(tankIndexes.length,6);
 const hit=await d.order('dispatch',1,{from:0,to:4,unitIndexes:tankIndexes},153);
 assert.equal(hit.deployed.length,6);assert.equal(hit.captured,false);assert.equal(hit.returned,true);assert.equal(d.state.nodes[4].owner,3);assert.equal(d.state.nodes[4].units.length,0);
 await h.at(begun.startsAt+250n);await d.compare();assert.equal((await h.snap()).funds[0],100n);
 // Capped balance is consumed at the transaction time, with no old capped seconds recycled.
 assert.equal((await h.snap()).funds[2],200n);await d.order('recruit',3,{node:1,kind:1,count:1},250);assert.equal((await h.snap()).funds[2],150n);await h.at(begun.startsAt+251n);await d.compare();assert.equal((await h.snap()).funds[2],152n);
 await h.at(begun.startsAt+299n);await d.compare();
});
test('EVM simultaneous annihilation leaves old flag and city infantry defeat full-health tank',async t=>{
 const h=await setup(t),begun=await h.start(),d=driver(h,begun.startsAt);
 let event=await d.order('dispatch',1,{from:0,to:7,unitIndexes:[0,1]},0);
 assert.equal(event.captured,false);assert.equal(event.returned,false);assert.deepEqual(d.state.nodes[7].units,[]);assert.equal(d.state.nodes[7].owner,0);
 await d.order('dispatch',1,{from:0,to:7,unitIndexes:[2]},3);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[1]},6);
 await d.order('dispatch',1,{from:7,to:0,unitIndexes:[0]},6);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[2]},9);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[1]},12);
 for(const time of [13,16,19])await d.order('repair',1,{node:4,unitIndexes:[1]},time);
 assert.deepEqual(d.state.nodes[4].units[1],{kind:1,hp:30});
 event=await d.order('dispatch',1,{from:4,to:8,unitIndexes:[1]},22);
 assert.equal(event.returned,false);assert.equal(event.captured,false);assert.equal(d.state.nodes[8].owner,0);assert.deepEqual(d.state.nodes[8].units,[{kind:0,hp:2}]);
});
test('EVM city plus fortification uses aggregated integer damage and returns wounded survivors',async t=>{
 const h=await setup(t),begun=await h.start(),d=driver(h,begun.startsAt);
 await d.order('dispatch',1,{from:0,to:4,unitIndexes:[0,1,2,3,4]},0);
 await d.order('dispatch',1,{from:4,to:8,unitIndexes:[0,1,2,3,4]},3);
 await d.order('fortify',1,{node:8},6);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[0,1,2,3,4]},9);
 const event=await d.order('dispatch',3,{from:4,to:8,unitIndexes:[0,1,2,3,4]},12);
 assert.equal(event.captured,false);assert.equal(event.returned,true);assert.equal(d.state.nodes[8].fortified,false);
 assert.deepEqual(d.state.nodes[8].units,[{kind:2,hp:8}]);
 assert.deepEqual(d.state.nodes[4].units,[{kind:0,hp:8},{kind:0,hp:10},{kind:2,hp:8}]);
});
test('EVM plain two infantry lose to one tank leaving exactly nine hp',async t=>{
 const h=await setup(t),begun=await h.start(),d=driver(h,begun.startsAt);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[3]},0);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[3]},3);
 await d.order('dispatch',3,{from:1,to:4,unitIndexes:[3]},6);
 for(const time of [7,10,13])await d.order('repair',3,{node:4,unitIndexes:[1]},time);
 await d.order('dispatch',3,{from:4,to:1,unitIndexes:[0]},16);
 const event=await d.order('dispatch',1,{from:0,to:4,unitIndexes:[0,1]},17);
 assert.equal(event.captured,false);assert.equal(event.returned,false);assert.equal(d.state.nodes[4].owner,3);assert.deepEqual(d.state.nodes[4].units,[{kind:1,hp:9}]);
});
test.after(async()=>{const a=await artifactPromise;console.log('Siege gas measurements',JSON.stringify(gas));console.log('Siege bytecode bytes',JSON.stringify({deployment:(a.bytecode.length-2)/2,runtime:(a.deployedBytecode.length-2)/2}));});
