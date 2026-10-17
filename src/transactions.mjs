const ADDRESS=/^0x[0-9a-fA-F]{40}$/, HASH=/^0x[0-9a-fA-F]{64}$/, INTEGER=/^\d{1,30}$/;
const STATES=new Set(['signing','pending','confirmed','reverted','cancelled','not_sent','unknown']);
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const copy=r=>({...r,hashes:[...r.hashes]});
function contextOK(r){return r&&r.chainId===10143&&ADDRESS.test(r.contract)&&ADDRESS.test(r.account)&&INTEGER.test(String(r.roundId))&&(['dispatch','startRound'].includes(r.kind))&&(r.kind==='startRound'||Number.isInteger(r.district)&&r.district>=0&&r.district<9&&[1,2].includes(r.team)&&[0,1,2].includes(r.unit));}
function storedOK(r){return contextOK(r)&&typeof r.id==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(r.id)&&STATES.has(r.status)&&Number.isFinite(r.createdAt)&&Number.isFinite(r.updatedAt)&&Array.isArray(r.hashes)&&r.hashes.length<=8&&r.hashes.every(h=>HASH.test(h))&&(!r.hash||HASH.test(r.hash)&&r.hashes.includes(r.hash));}
/** Local records are navigation hints. Only a matching chain receipt may confirm them. */
export function createTransactionBook(storage,key,now=Date.now){
 let records=[];
 const persist=()=>{try{storage?.setItem(key,JSON.stringify(records));}catch{/* Storage may be unavailable; sending does not depend on it. */}};
 try{const raw=storage?.getItem(key);if(raw&&raw.length<=250000){const parsed=JSON.parse(raw);if(Array.isArray(parsed)){const ids=new Set();records=parsed.filter(r=>storedOK(r)&&!ids.has(r.id)&&ids.add(r.id)).slice(0,50).map(r=>({...copy(r),status:'unknown',timingObserved:false,error:r.hash?'重新核验链上回执':'页面中断且未记录哈希，请检查钱包；不会自动重发',updatedAt:now()}));}}}catch{/* Ignore malformed/unavailable storage. */}
 const find=id=>{const r=records.find(r=>r.id===id);if(!r)throw Error('Unknown order');return r;};
 const update=(r,patch)=>{Object.assign(r,patch,{updatedAt:now()});persist();return copy(r);};
 return {
  begin(context){if(!contextOK(context))throw Error('Invalid real order context');const at=now();const id=globalThis.crypto?.randomUUID?.()??`${at}-${Math.random().toString(36).slice(2)}`;const r={id,kind:context.kind,chainId:10143,contract:context.contract,account:context.account,roundId:String(context.roundId),...(context.kind==='dispatch'?{district:context.district,team:context.team,unit:context.unit}:{}),status:'signing',timingObserved:true,createdAt:at,updatedAt:at,hashes:[]};records.unshift(r);records=records.slice(0,50);persist();return id;},
  submitted(id,hash,account,replacement){const r=find(id);if(!HASH.test(hash)||!ADDRESS.test(account))throw Error('Invalid submitted transaction');const all=r.hashes.includes(hash)?r.hashes:[...r.hashes,hash];const hashes=all.length>8?[all[0],...all.slice(-7)]:all;return update(r,{hash,hashes,account,submittedAt:r.submittedAt??now(),status:replacement&&replacement!=='repriced'?'cancelled':'pending',error:replacement&&replacement!=='repriced'?'原指令已取消或被其他交易替换':''});},
  settle(id,receipt){const r=find(id);if(!receipt||!r.hashes.includes(receipt.hash)||receipt.chainId!==r.chainId||!same(receipt.contract,r.contract)||!same(receipt.account,r.account)||receipt.kind!==r.kind||String(receipt.roundId)!==r.roundId||(r.kind==='dispatch'&&(receipt.district!==r.district||receipt.team!==r.team||receipt.unit!==r.unit))||!['success','reverted'].includes(receipt.status)||!INTEGER.test(String(receipt.blockNumber)))throw Error('Receipt does not match order');return update(r,{hash:receipt.hash,status:receipt.status==='success'?'confirmed':'reverted',blockNumber:String(receipt.blockNumber),confirmedAt:r.confirmedAt??now(),receiptCheckedAt:now(),error:receipt.status==='reverted'?'链上执行回退，未产生战果':''});},
  unknown(id,message){return update(find(id),{status:'unknown',error:String(message??'回执状态未知').slice(0,240)});},
  notSent(id,message){const r=find(id);if(r.hash)throw Error('Order has a broadcast hash; reconcile instead');return update(r,{status:'not_sent',error:String(message??'未发送').slice(0,240)});},
  list(scope={}){return records.filter(r=>(scope.chainId===undefined||r.chainId===scope.chainId)&&(!scope.contract||same(r.contract,scope.contract))&&(!scope.account||same(r.account,scope.account))).map(copy);}
 };
}
