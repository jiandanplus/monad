import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const file=new URL('../src/chain.ts',import.meta.url);
test('wallet integration exists',()=>assert.ok(existsSync(file),'wallet implementation missing'));
if(existsSync(file)){
 const chain=await import(file);
 test('missing wallet gives an actionable error without a cached address',async()=>{
  globalThis.window={};await assert.rejects(chain.connect(),/钱包/);assert.equal(chain.getConnectedAddress(),null);
 });
 test('rejected account request leaves no cached signing identity',async()=>{
  globalThis.window={ethereum:{request:async()=>{throw Object.assign(new Error('rejected'),{code:4001});}}};
  await assert.rejects(chain.connect());assert.equal(chain.getConnectedAddress(),null);
 });
 test('provider that stays on wrong chain cannot be used for signing',async()=>{
  const calls=[];
  globalThis.window={ethereum:{request:async({method})=>{
   calls.push(method);if(method==='eth_requestAccounts')return ['0x'+'11'.repeat(20)];
   if(method==='eth_chainId')return '0x1';return null;
  }}};
  await assert.rejects(chain.connect(),/Monad|网络/);assert.equal(chain.getConnectedAddress(),null);
  assert.ok(!calls.includes('eth_sendTransaction'));
 });
 test('provider errors render helpful text without raw RPC internals',()=>{
  assert.match(chain.describeError(Object.assign(new Error('user rejected'),{code:4001})),/取消|拒绝/);
  assert.match(chain.describeError(new Error('insufficient funds for gas')),/测试币|余额/);
  assert.match(chain.describeError(new Error('Insufficient points')),/指挥点/);
  assert.match(chain.describeError(new Error('Engineer cannot attack enemy')),/工程师/);
  assert.match(chain.describeError(new Error('Unreachable')),/相邻/);
 });
 test('deployment speed-up persists replacement hash, and cancellation never activates a canvas',async()=>{
  const {readFile}=await import('node:fs/promises');
  const artifact=JSON.parse(await readFile(new URL('../src/generated/BlitzCanvas.json',import.meta.url),'utf8'));
  const original=chain.publicClient.waitForTransactionReceipt,originalCode=chain.publicClient.getCode;
  const first='0x'+'11'.repeat(32),replacement='0x'+'22'.repeat(32),address='0x'+'33'.repeat(20),seen=[];
  try{
   chain.publicClient.getCode=async()=>artifact.deployedBytecode;
   chain.publicClient.waitForTransactionReceipt=async(options)=>{
    options.onReplaced?.({reason:'repriced',transaction:{hash:replacement}});
    return {status:'success',contractAddress:address,to:null,blockNumber:10n};
   };
   const d=await chain.recoverDeployment(first,h=>seen.push(h));
   assert.equal(d.address.toLowerCase(),address);assert.deepEqual(seen,[replacement]);
   chain.publicClient.waitForTransactionReceipt=async(options)=>{
    options.onReplaced?.({reason:'cancelled',transaction:{hash:replacement}});
    return {status:'success',contractAddress:address,to:null,blockNumber:10n};
   };
   await assert.rejects(chain.recoverDeployment(first),/取消|替换/);
  }finally{chain.publicClient.waitForTransactionReceipt=original;chain.publicClient.getCode=originalCode;}
 });
 test('explicit account switch requests permissions before reading selected identity and never sends',async()=>{
  const calls=[];const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20);let authorized=a;
  const original=chain.publicClient.getBalance;chain.publicClient.getBalance=async()=>0n;
  globalThis.window={ethereum:{request:async({method,params})=>{calls.push(method);if(method==='wallet_requestPermissions'){assert.deepEqual(params,[{eth_accounts:{}}]);authorized=b;return[{parentCapability:'eth_accounts'}];}if(method==='eth_requestAccounts')return[authorized];if(method==='eth_chainId')return'0x279f';throw Error('Unexpected RPC '+method);}}};
  try{const result=await chain.connect(true);assert.equal(result.address.toLowerCase(),b);assert.deepEqual(calls,['wallet_requestPermissions','eth_requestAccounts','eth_chainId']);assert.equal(chain.getConnectedAddress().toLowerCase(),b);}finally{chain.publicClient.getBalance=original;}
 });
 test('rejected or unsupported account switch cannot silently reuse a prior identity',async()=>{
  for(const code of [4001,4200]){
   const calls=[];globalThis.window={ethereum:{request:async({method})=>{calls.push(method);if(method==='wallet_requestPermissions')throw Object.assign(Error('permission unavailable'),{code});if(method==='eth_requestAccounts')return['0x'+'11'.repeat(20)];if(method==='eth_chainId')return'0x279f';throw Error('Unexpected RPC');}}};
   await assert.rejects(chain.connect(true));assert.equal(chain.getConnectedAddress(),null);assert.deepEqual(calls,['wallet_requestPermissions']);
  }
 });

 test('explicitly selected authorized signer is independent of provider address order',async()=>{
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20);const original=chain.publicClient.getBalance;chain.publicClient.getBalance=async()=>0n;
  globalThis.window={ethereum:{request:async({method})=>{if(method==='eth_requestAccounts')return[a,b];if(method==='eth_chainId')return'0x279f';throw Error('Unexpected send');}}};
  try{await chain.connect();assert.deepEqual(chain.getAuthorizedAccounts().map(a=>a.toLowerCase()),[a,b]);chain.selectAccount(b);assert.equal((await chain.connect()).address.toLowerCase(),b);assert.equal(chain.getConnectedAddress().toLowerCase(),b);}finally{chain.publicClient.getBalance=original;}
 });
 test('a selected signer removed from wallet authorization fails instead of substituting first address',async()=>{
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20);let accounts=[a,b];const calls=[];const original=chain.publicClient.getBalance;chain.publicClient.getBalance=async()=>0n;
  globalThis.window={ethereum:{request:async({method})=>{calls.push(method);if(method==='eth_requestAccounts')return accounts;if(method==='eth_chainId')return'0x279f';throw Error('Unexpected send');}}};
  try{await chain.connect();chain.selectAccount(b);accounts=[a];await assert.rejects(chain.connect(),/授权|账户/);assert.equal(chain.getConnectedAddress(),null);assert.equal(calls.includes('eth_sendTransaction'),false);assert.throws(()=>chain.selectAccount('0x'+'33'.repeat(20)),/授权/);}finally{chain.publicClient.getBalance=original;}
 });

 test('real write path passes explicitly authorized second account to wallet transaction',async()=>{
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),hash='0x'+'44'.repeat(32),address='0x'+'55'.repeat(20);let sent,callbackAccount;
  const original={};for(const key of ['getBalance','getCode','simulateContract','estimateContractGas','waitForTransactionReceipt'])original[key]=chain.publicClient[key];
  const artifact=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../src/generated/BlitzCanvas.json',import.meta.url),'utf8'));
  Object.assign(chain.publicClient,{getBalance:async()=>0n,getCode:async()=>artifact.deployedBytecode,simulateContract:async request=>({request}),estimateContractGas:async()=>100000n,waitForTransactionReceipt:async()=>({status:'success',transactionHash:hash,blockNumber:3n})});
  globalThis.window={ethereum:{request:async({method,params})=>{if(method==='eth_requestAccounts')return[a,b];if(method==='eth_chainId')return'0x279f';if(method==='eth_sendTransaction'){sent=params[0];return hash;}throw Error('Unexpected '+method);}}};
  try{await chain.connect();chain.selectAccount(b);await chain.connect();const result=await chain.cast({address,blockNumber:1n},7,2,0,(h,sender)=>{assert.equal(h,hash);callbackAccount=sender;},1n);assert.equal(sent.from.toLowerCase(),b);assert.equal(callbackAccount.toLowerCase(),b);assert.equal(result.hash,hash);}finally{Object.assign(chain.publicClient,original);}
 });

 test('account event during identity read or gas estimation never substitutes first signer or sends',async()=>{
  for(const changeAt of ['identity','gas']) {
   const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),address='0x'+'66'.repeat(20);let sent=false,change=false;const listeners={};
   const original={};for(const key of ['getBalance','getCode','simulateContract','estimateContractGas'])original[key]=chain.publicClient[key];
   const artifact=JSON.parse(await(await import('node:fs/promises')).readFile(new URL('../src/generated/BlitzCanvas.json',import.meta.url),'utf8'));
   Object.assign(chain.publicClient,{getBalance:async()=>0n,getCode:async()=>artifact.deployedBytecode,simulateContract:async request=>({request}),estimateContractGas:async()=>{if(changeAt==='gas')listeners.accountsChanged?.();return 100000n;}});
   const provider={on:(name,cb)=>listeners[name]=cb,removeListener(){},request:async({method})=>{if(method==='eth_requestAccounts'){if(change&&changeAt==='identity'){listeners.accountsChanged?.();return[a];}return[a,b];}if(method==='eth_chainId')return'0x279f';if(method==='eth_sendTransaction'){sent=true;throw Error('Must not send');}throw Error('Unexpected '+method);}};
   globalThis.window={ethereum:provider};
   try{await chain.connect();chain.selectAccount(b);change=true;await assert.rejects(chain.cast({address,blockNumber:1n},7,2,0,()=>{},1n),/账户|网络|变化/);assert.equal(sent,false);assert.equal(chain.getConnectedAddress(),null);}finally{Object.assign(chain.publicClient,original);}
  }
 });

}
