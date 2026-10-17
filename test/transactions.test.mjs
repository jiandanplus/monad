import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const path=new URL('../src/transactions.mjs',import.meta.url);
test('real order journal module exists',()=>assert.ok(existsSync(path),'Missing receipt-backed order journal'));
if(existsSync(path)){
const {createTransactionBook}=await import(path);
const contract='0x'+'1'.repeat(40),account='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),reprice='0x'+'b'.repeat(64);
const context={chainId:10143,contract,account,kind:'dispatch',roundId:'1',district:1,team:1,unit:2};
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
const receipt=(h=hash)=>({...context,hash:h,status:'success',blockNumber:100n});
test('each order is separate, scoped, pending is never confirmed, repricing keeps one order',()=>{
 const s=storage();let now=100;const b=createTransactionBook(s,'test',()=>now);
 const id=b.begin(context);assert.equal(b.list(context)[0].status,'signing');
 now=110;b.submitted(id,hash,account);assert.equal(b.list(context)[0].status,'pending');
 now=120;b.submitted(id,reprice,account,'repriced');assert.equal(b.list(context).length,1);assert.equal(b.list(context)[0].hash,reprice);assert.deepEqual(b.list(context)[0].hashes,[hash,reprice]);
 now=150;b.settle(id,receipt(reprice));const r=b.list(context)[0];assert.equal(r.status,'confirmed');assert.equal(r.blockNumber,'100');assert.equal(r.confirmedAt,150);assert.equal(r.submittedAt,110);
 b.begin({...context,unit:0});assert.equal(b.list(context).length,2);assert.equal(b.list({...context,account:other}).length,0);assert.equal(b.list({...context,contract:other}).length,0);
});
test('successful unrelated receipt cannot confirm an order',()=>{
 const b=createTransactionBook(storage(),'test');const id=b.begin(context);b.submitted(id,hash,account);
 for(const patch of [{account:other},{contract:other},{roundId:'2'},{district:7},{team:2},{unit:0},{kind:'startRound'},{hash:reprice},{chainId:1}])assert.throws(()=>b.settle(id,{...receipt(),...patch}),/match|匹配/);
 assert.equal(b.list(context)[0].status,'pending');
});
test('revert, rejection, cancellation and unknown do not become successful',()=>{
 const b=createTransactionBook(storage(),'test');let id=b.begin(context);b.notSent(id,'rejected');assert.equal(b.list(context)[0].status,'not_sent');
 id=b.begin(context);b.submitted(id,hash,account);b.unknown(id,'timeout');assert.equal(b.list(context)[0].status,'unknown');b.settle(id,{...receipt(),status:'reverted'});assert.equal(b.list(context)[0].status,'reverted');
 id=b.begin(context);b.submitted(id,hash,account);b.submitted(id,reprice,account,'cancelled');assert.equal(b.list(context)[0].status,'cancelled');
});
test('reload revalidates stored terminal receipts and never replays signing',()=>{
 const s=storage(),b=createTransactionBook(s,'test');const id=b.begin(context);b.submitted(id,hash,account);b.settle(id,receipt());b.begin(context);
 const reopened=createTransactionBook(s,'test');assert.equal(reopened.list(context).length,2);assert.ok(reopened.list(context).every(r=>r.status==='unknown'));assert.equal(reopened.list(context).filter(r=>r.hash).length,1);
});
test('untrusted persisted data is validated, bounded and copied on read',()=>{
 const s=storage();s.setItem('bad','not-json');assert.deepEqual(createTransactionBook(s,'bad').list(context),[]);
 const b=createTransactionBook(s,'ok');assert.throws(()=>b.begin({...context,contract:'javascript:bad'}));assert.throws(()=>b.begin({...context,unit:3}));assert.throws(()=>b.begin({...context,roundId:'-1'}));
 for(let i=0;i<60;i++)b.begin(context);assert.equal(b.list(context).length,50);const r=b.list(context);r[0].status='confirmed';assert.equal(b.list(context)[0].status,'signing');
 const parsed=JSON.parse(s.getItem('ok'));assert.ok(Array.isArray(parsed));parsed.push({...parsed[0],contract:'javascript:alert(1)'});s.setItem('ok',JSON.stringify(parsed));assert.equal(createTransactionBook(s,'ok').list(context).length,50);
});
test('storage denied does not block real transactions or lose in-memory state',()=>{
 const s={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};const b=createTransactionBook(s,'test');const id=b.begin(context);b.submitted(id,hash,account);b.settle(id,receipt());assert.equal(b.list(context)[0].status,'confirmed');
});
}

test('restored local timing is never a measured confirmation latency',async()=>{
 const {createTransactionBook}=await import('../src/transactions.mjs');
 const record={id:'stored',chainId:10143,contract:'0x'+'1'.repeat(40),account:'0x'+'2'.repeat(40),kind:'startRound',roundId:'1',status:'confirmed',createdAt:1,updatedAt:2,hash:'0x'+'3'.repeat(64),hashes:['0x'+'3'.repeat(64)],submittedAt:1,confirmedAt:100,timingObserved:true};
 const book=createTransactionBook({getItem:()=>JSON.stringify([record])},'test');
 const restored=book.list()[0];assert.equal(restored.status,'unknown');assert.equal(restored.timingObserved,false);
 book.settle(restored.id,{chainId:10143,contract:record.contract,account:record.account,kind:'startRound',roundId:'1',hash:record.hash,status:'success',blockNumber:'5'});
 assert.equal(book.list()[0].timingObserved,false);
});

test('bounded replacements always retain original and current transaction hashes',async()=>{
 const {createTransactionBook}=await import('../src/transactions.mjs');const book=createTransactionBook(null,'test');
 const account='0x'+'2'.repeat(40);const id=book.begin({chainId:10143,contract:'0x'+'1'.repeat(40),account,kind:'startRound',roundId:'1'});
 const hashes=Array.from({length:12},(_,i)=>'0x'+String(i+1).padStart(64,'0'));
 for(const hash of hashes)book.submitted(id,hash,account,'repriced');
 const record=book.list()[0];assert.equal(record.hashes.length,8);assert.equal(record.hashes[0],hashes[0]);assert.equal(record.hash,hashes.at(-1));assert.equal(record.hashes.at(-1),hashes.at(-1));
});
