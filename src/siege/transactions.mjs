import {encodeFunctionData,decodeEventLog} from 'viem';
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function transactionChainId(tx){
 if(tx.chainId!==undefined&&tx.chainId!==null)return Number(tx.chainId);
 if(typeof tx.v==='bigint'&&tx.v>=35n)return Number((tx.v-35n)/2n);
 return null;
}

/** A saved hash is only a lookup key; calldata, receipt and decoded event establish proof. */
export function verifyActionProof({hash,tx,receipt,intent,abi}){
 check(eq(hash,receipt.transactionHash),'Requested transaction hash mismatch');
 check(receipt.status==='success','Transaction reverted');
 check(eq(tx.hash,receipt.transactionHash)&&tx.blockNumber===receipt.blockNumber&&eq(tx.blockHash,receipt.blockHash),'Transaction block mismatch');
 check(eq(tx.from,intent.account)&&eq(receipt.from,intent.account),'Transaction signer mismatch');
 check(eq(tx.to,intent.address)&&eq(receipt.to,intent.address),'Transaction contract mismatch');
 check(tx.value===0n&&transactionChainId(tx)===intent.chainId,'Transaction network or value mismatch');
 const data=encodeFunctionData({abi,functionName:intent.functionName,args:intent.args});
 check(eq(tx.input,data),'Transaction calldata mismatch');
 const args=intent.args,name=intent.functionName;
 const events=receipt.logs.filter(l=>eq(l.address,intent.address)).flatMap(log=>{
  try{return [decodeEventLog({abi,data:log.data,topics:log.topics,strict:true})];}catch{return [];}
 });
 const action={recruit:0,dispatch:1,fortify:2,repair:3}[name];
 const match=events.filter(e=>{
  const v=e.args;
  if(action!==undefined){
   const dispatch=name==='dispatch';
   return e.eventName==='OrderExecuted'&&v.roundId===args[0]&&eq(v.actor,intent.account)&&v.action===action&&v.from===args[1]&&v.to===(dispatch?args[2]:args[1])&&v.fromVersion===(dispatch?args[3]:args[2])+1&&v.toVersion===(dispatch?args[4]:args[2])+1&&v.team>=1&&v.team<=4&&(intent.team===undefined||v.team===intent.team);
  }
  if(name==='configureRoster')return e.eventName==='RosterConfigured'&&v.rosterVersion===args[0]+1n&&v.seatsPerFaction===args[3];
  if(name==='ready')return e.eventName==='PlayerReady'&&v.rosterVersion===args[0]&&eq(v.actor,intent.account);
  if(name==='startRound')return e.eventName==='RoundStarted'&&v.roundId===args[0]+1n&&v.endsAt-v.startsAt===300n;
  return false;
 });
 check(match.length===1,'Expected contract event mismatch');
 return {hash:receipt.transactionHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,event:match[0].args,eventName:match[0].eventName};
}

/** Global per-controller lock survives timeout; only explicit receipt resolution releases broadcast work. */
export function createOrderGate(){
 let pending=null;
 return {
  current:()=>pending?{...pending}:null,
  restore(record){check(!pending,'An order is pending');check(/^0x[\da-f]{64}$/i.test(record.hash),'Invalid hash');pending={...record,status:'unverified'};},
  replace(previous,next){check(pending&&eq(pending.hash,previous),'Pending hash mismatch');check(/^0x[\da-f]{64}$/i.test(next),'Invalid hash');pending.hash=next;pending.status='unverified';},
  async run(key,operation){
   check(!pending,'An order is pending; verify its hash before sending again');
   const current={key,hash:null,status:'awaiting-signature'};pending=current;
   try{
    const result=await operation(hash=>{check(/^0x[\da-f]{64}$/i.test(hash),'Invalid hash');current.hash=hash;current.status='broadcast';});
    if(pending===current)pending=null;
    return result;
   }catch(error){
    if(pending===current){if(current.hash)current.status='unverified';else pending=null;}
    throw error;
   }
  },
  resolve(hash,status){check(pending&&eq(pending.hash,hash),'Pending hash mismatch');check(['confirmed','reverted','cancelled'].includes(status),'Unresolved receipt');pending=null;}
 };
}
