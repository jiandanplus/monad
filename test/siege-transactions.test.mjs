import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
const present=existsSync(new URL('../src/siege/transactions.mjs',import.meta.url));
const api=present?await import('../src/siege/transactions.mjs'):null;
const A='0x1111111111111111111111111111111111111111',C='0x2222222222222222222222222222222222222222';
const H=`0x${'ab'.repeat(32)}`;
const abi=parseAbi([
 'function dispatch(uint256 expectedRoundId,uint8 from,uint8 to,uint32 fromVersion,uint32 toVersion,uint8[] unitIndexes)',
 'event OrderExecuted(uint256 indexed roundId,address indexed actor,uint8 indexed action,uint8 from,uint8 to,uint8 team,uint32 fromVersion,uint32 toVersion,uint16 spent,bool captured,bool returned,uint16[] deployed,uint16[] survivors)'
]);
const intent=()=>({address:C,account:A,functionName:'dispatch',args:[1n,0,4,3,7,[0,2]],chainId:10143});
function proof(){return {hash:H,
 tx:{hash:H,from:A,to:C,input:encodeFunctionData({abi,...intent()}),value:0n,chainId:10143,blockNumber:9n,blockHash:H},
 receipt:{transactionHash:H,from:A,to:C,status:'success',blockNumber:9n,blockHash:H,logs:[{address:C,topics:encodeEventTopics({abi,eventName:'OrderExecuted',args:{roundId:1n,actor:A,action:1}}),data:encodeAbiParameters([{type:'uint8'},{type:'uint8'},{type:'uint8'},{type:'uint32'},{type:'uint32'},{type:'uint16'},{type:'bool'},{type:'bool'},{type:'uint16[]'},{type:'uint16[]'}],[0,4,1,4,8,0,true,false,[10,520],[10,520]])}]}
};}
test('real transaction proof module exists',()=>assert.ok(present,'missing chain proof implementation'));
test('dispatch proof matches full calldata and exact contract event',{skip:!present},()=>{
 const p=proof(),result=api.verifyActionProof({...p,intent:intent(),abi});
 assert.equal(result.hash,H);assert.equal(result.event.team,1);assert.equal(result.event.fromVersion,4);assert.equal(result.blockNumber,9n);
 for(const change of [p=>p.tx.from=C,p=>p.tx.to=A,p=>p.tx.value=1n,p=>p.tx.chainId=1,p=>p.receipt.status='reverted',p=>p.receipt.logs[0].address=A,p=>p.tx.blockHash=C]){
  const altered=proof();change(altered);assert.throws(()=>api.verifyActionProof({...altered,intent:intent(),abi}));
 }
 const other=intent();other.args=[1n,0,4,3,7,[1,2]];
 assert.throws(()=>api.verifyActionProof({...proof(),intent:other,abi}),/calldata/i);
 const mismatch=proof();mismatch.receipt.logs[0].data=encodeAbiParameters([{type:'uint8'},{type:'uint8'},{type:'uint8'},{type:'uint32'},{type:'uint32'},{type:'uint16'},{type:'bool'},{type:'bool'},{type:'uint16[]'},{type:'uint16[]'}],[0,4,1,3,8,0,true,false,[10,520],[10,520]]);
 assert.throws(()=>api.verifyActionProof({...mismatch,intent:intent(),abi}),/event/i);
 assert.throws(()=>api.verifyActionProof({...proof(),hash:`0x${'cd'.repeat(32)}`,intent:intent(),abi}),/hash/i);
 const legacy=proof();delete legacy.tx.chainId;legacy.tx.v=BigInt(10143*2+35);
 assert.equal(api.verifyActionProof({...legacy,intent:intent(),abi}).hash,H);
});
test('gate sends once, keeps unknown broadcasts locked and unlocks only resolved proof',{skip:!present},async()=>{
 const gate=api.createOrderGate();let writes=0;
 const operation=async update=>{writes++;update(H);throw new Error('RPC timeout');};
 await assert.rejects(gate.run('session',operation),/timeout/);
 assert.equal(gate.current().hash,H);assert.equal(gate.current().status,'unverified');
 await assert.rejects(gate.run('session',operation),/pending/i);assert.equal(writes,1);
 gate.resolve(H,'confirmed');assert.equal(gate.current(),null);
 await gate.run('other',async update=>{writes++;update(H);return {hash:H};});
 assert.equal(writes,2);assert.equal(gate.current(),null);
});
test('gate releases unsigned rejections but stale confirmation cannot release another order',{skip:!present},async()=>{
 const gate=api.createOrderGate();await assert.rejects(gate.run('a',async()=>{throw new Error('rejected');}),/rejected/);assert.equal(gate.current(),null);
 await assert.rejects(gate.run('b',async update=>{update(H);throw Error('unknown');}));
 assert.throws(()=>gate.resolve(`0x${'ff'.repeat(32)}`,'confirmed'),/hash/i);
 assert.equal(gate.current().hash,H);gate.resolve(H,'reverted');assert.equal(gate.current(),null);
});
test('a proven replacement can retarget only the currently tracked hash',{skip:!present},async()=>{
 const gate=api.createOrderGate(),next=`0x${'cd'.repeat(32)}`;
 await assert.rejects(gate.run('a',async update=>{update(H);throw Error('timeout');}));
 assert.equal(typeof gate.replace,'function');
 assert.throws(()=>gate.replace(next,H),/hash/i);
 gate.replace(H,next);assert.equal(gate.current().hash,next);gate.resolve(next,'cancelled');
});
