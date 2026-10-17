import {createPublicClient,createWalletClient,custom,defineChain,http,getAddress,encodeFunctionData,decodeFunctionData,type Address,type Hex,type Abi} from 'viem';
import artifact from '../generated/SiegeCanvas.json' with {type:'json'};
import type {Provider} from '../wallets.ts';
import type {Deployment,Intent,World,ActionName,Confirmed} from './types.ts';
import {parseLobby,parseSnapshot} from './state.mjs';
import {createOrderGate,verifyActionProof,transactionChainId} from './transactions.mjs';

export const CHAIN_ID=10143;
export const EXPLORER='https://testnet.monadscan.com';
export const monad=defineChain({id:CHAIN_ID,name:'Monad Testnet',nativeCurrency:{name:'Test MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:['https://testnet-rpc.monad.xyz']}},blockExplorers:{default:{name:'Monadscan',url:EXPLORER}},testnet:true});
export const publicClient=createPublicClient({chain:monad,transport:http(undefined,{timeout:15000,retryCount:1}),pollingInterval:1500});
const abi=artifact.abi as Abi;
const key='blitzcanvas:siege:pending:v1';
const eq=(a:string|undefined|null,b:string|undefined|null)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const check=(v:unknown,msg:string)=>{if(!v)throw Error(msg);};
const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?{$bigint:x.toString()}:x);
const deserialize=(v:string)=>JSON.parse(v,(_,x)=>x&&typeof x==='object'&&Object.keys(x).length===1&&typeof x.$bigint==='string'&&/^\d+$/.test(x.$bigint)?BigInt(x.$bigint):x);
export type Progress={status:'awaiting-signature'|'broadcast'|'confirmed'|'unverified'|'reverted'|'cancelled',hash?:Hex,message?:string};
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

/** The injectable client supports real local-EVM acceptance. Production uses only the fixed Monad RPC. */
export function createSiegeController(options:{client?:any,network?:typeof monad,storage?:StoragePort,onWalletChange?:()=>void}={}){
 const client=options.client??publicClient,network=options.network??monad;
 const gate=createOrderGate();let provider:Provider|null=null,session=0,account:Address|null=null,accounts:Address[]=[];
 let pendingIntent:Intent|null=null,disposed=false,anchor:{hash:Hex,nonce:number}|null=null,deployAccount:Address|null=null,originHash:Hex|null=null;
 function persist(hash:Hex,intent:Intent){pendingIntent=intent;try{options.storage?.setItem(key,serialize({hash,intent,anchor,originHash}));}catch{/* Hash remains in the live controller even if storage is unavailable. */}}
 function clear(){pendingIntent=null;anchor=null;deployAccount=null;originHash=null;try{options.storage?.removeItem(key);}catch{/* Storage can be disabled. */}}
 try{
  const saved=options.storage?.getItem(key);
  if(saved){const record=deserialize(saved);
   originHash=record.originHash??record.anchor?.hash??record.hash;
   if(record.kind==='deploy'){deployAccount=getAddress(record.account);anchor=record.anchor??null;gate.restore({key:'deploy',hash:record.hash});}
   else{check(record.intent.chainId===CHAIN_ID,'Wrong saved network');getAddress(record.intent.address);getAddress(record.intent.account);encodeFunctionData({abi,functionName:record.intent.functionName,args:record.intent.args});gate.restore({key:'restored',hash:record.hash});pendingIntent=record.intent;anchor=record.anchor??null;}
  }
 }catch{try{options.storage?.removeItem(key);}catch{/* Malformed saved records never authorize a transaction. */}}
 const changed=()=>{session++;account=null;accounts=[];options.onWalletChange?.();};
 function setProvider(next:Provider|null){
  if(next===provider)return;
  for(const event of ['accountsChanged','chainChanged','disconnect'])provider?.removeListener?.(event,changed);
  provider=next;
  for(const event of ['accountsChanged','chainChanged','disconnect'])provider?.on?.(event,changed);
  changed();
 }
 async function connect(){
  check(!disposed&&provider,'请选择浏览器钱包。');const p=provider!,s=session;
  const wallet=createWalletClient({chain:network,transport:custom(p)});
  const result=(await wallet.requestAddresses()).map(a=>getAddress(a));
  check(provider===p&&s===session,'钱包在连接期间变化，请重连。');
  check(await wallet.getChainId()===CHAIN_ID,'请先在钱包切换到 Monad Testnet（10143）。');
  check(provider===p&&s===session,'钱包在连接期间变化，请重连。');
  check(result.length,'钱包没有授权账户。');accounts=result;account=result.length===1?result[0]:null;
  return [...accounts];
 }
 function selectAccount(address:Address){check(accounts.some(a=>eq(a,address)),'请先授权这个账户。');session++;account=getAddress(address);options.onWalletChange?.();}
 async function signer(){
  check(!disposed&&provider&&account,'请连接钱包并明确选择签名账户。');
  const p=provider!,s=session,actor=account!;
  const valid=()=>check(!disposed&&p===provider&&s===session&&eq(actor,account),'账户或网络已变化；请重新连接后核验当前交易。');
  const guarded={request:((args:any)=>{
   if(['eth_sendTransaction','wallet_sendTransaction','eth_signTransaction','eth_sendRawTransaction','wallet_sendCalls'].includes(args.method))valid();
   return p.request(args);
  }) as Provider['request']};
  const wallet=createWalletClient({chain:network,transport:custom(guarded)});
  const verify=async()=>{
   valid();const [list,id]=await Promise.all([wallet.getAddresses(),wallet.getChainId()]);valid();
   check(id===CHAIN_ID&&list.some(a=>eq(a,actor)),'钱包网络或授权账户已变化。');
  };
  await verify();return {wallet,actor,verify,valid};
 }
 async function chainBlock(blockNumber?:bigint){
  check(await client.getChainId()===CHAIN_ID,'读端网络不是 Monad Testnet。');
  const n=blockNumber??await client.getBlockNumber({cacheTime:0});
  const block=await client.getBlock({blockNumber:n});check(block.number===n&&block.hash,'区块尚未确认。');return block;
 }
 async function verifyCode(d:Deployment,blockNumber:bigint){
  const code=await client.getCode({address:d.address,blockNumber});
  check(eq(code,artifact.deployedBytecode),'目标地址不匹配四阵营 SiegeCanvas 合约，请检查网络与部署链接。');
 }
 async function read(d:Deployment,at?:bigint,roundId=0n):Promise<World>{
  const block=await chainBlock(at);check(block.number>=d.blockNumber,'部署区块晚于当前读取区块。');await verifyCode(d,block.number);
  const [lobby,raw]=await Promise.all([
   client.readContract({address:d.address,abi,functionName:'getLobby',blockNumber:block.number}),
   client.readContract({address:d.address,abi,functionName:'getSnapshot',args:[roundId],blockNumber:block.number})
  ]);
  const result={lobby:parseLobby(lobby),snapshot:parseSnapshot(raw,{blockNumber:block.number,timestamp:block.timestamp})};
  // A reorganization between independent reads must not produce a mixed authoritative board.
  const final=await client.getBlock({blockNumber:block.number});check(eq(final.hash,block.hash),'读取时发生区块重组，请刷新。');return result;
 }
 async function verifyReceipt(d:Deployment,intent:Intent,hash:Hex):Promise<{proof:Confirmed,world:World}>{
  const receipt=await client.getTransactionReceipt({hash}),tx=await client.getTransaction({hash:receipt.transactionHash});
  const proof=verifyActionProof({hash,tx,receipt,intent,abi});
  const world=await read(d,receipt.blockNumber);
  const block=await client.getBlock({blockNumber:receipt.blockNumber});check(eq(proof.blockHash,block.hash),'交易区块已重组，等待重新核验。');
  return {proof,world};
 }
 const proofCache=new Map<string,Confirmed>();
 async function recent(d:Deployment,world:World):Promise<Confirmed[]>{
  const toBlock=world.snapshot.blockNumber;
  if(world.snapshot.roundId===0n||toBlock<d.blockNumber)return [];
  const event=artifact.abi.find(e=>e.type==='event'&&e.name==='OrderExecuted');
  const lower=toBlock>99n?toBlock-99n:0n,fromBlock=lower>d.blockNumber?lower:d.blockNumber;
  const logs=await client.getLogs({address:d.address,event,args:{roundId:world.snapshot.roundId},fromBlock,toBlock,strict:true});
  const found:Confirmed[]=[];
  // Bounded recent activity, never presented as an exhaustive historical index.
  for(const log of logs.slice(-6).reverse()){
   if(!log.transactionHash||log.removed||log.blockNumber>toBlock)continue;
   const cacheKey=`${d.address.toLowerCase()}:${log.transactionHash}:${log.blockHash}`;
   let proof=proofCache.get(cacheKey);
   if(!proof){
    const tx=await client.getTransaction({hash:log.transactionHash});
    const decoded=decodeFunctionData({abi,data:tx.input});
    if(!['recruit','dispatch','fortify','repair'].includes(decoded.functionName))continue;
    const intent:Intent={address:d.address,account:tx.from,functionName:decoded.functionName as ActionName,args:decoded.args??[],chainId:CHAIN_ID};
    const result=await verifyReceipt(d,intent,log.transactionHash);proof=result.proof;
    check(eq(proof.blockHash,log.blockHash)&&proof.event.roundId===world.snapshot.roundId,'近期事件区块或回合不匹配。');
    proofCache.set(cacheKey,proof);if(proofCache.size>60)proofCache.delete(proofCache.keys().next().value!);
   }
   found.push(proof);
  }
  return found.reverse();
 }
 async function cancelledReplacement(intent:Intent,hash:Hex){
  if(!anchor||eq(hash,anchor.hash))return false;
  const [receipt,tx]=await Promise.all([client.getTransactionReceipt({hash}),client.getTransaction({hash})]);
  const expected=encodeFunctionData({abi,functionName:intent.functionName,args:intent.args});
  const block=await chainBlock(receipt.blockNumber);
  check(eq(hash,receipt.transactionHash)&&eq(tx.hash,receipt.transactionHash),'替换交易哈希不匹配。');
  check(eq(tx.from,intent.account)&&eq(receipt.from,tx.from)&&eq(receipt.to,tx.to),'替换交易账户或目标不匹配。');
  check(tx.nonce===anchor.nonce&&transactionChainId(tx)===CHAIN_ID,'替换交易nonce或网络不匹配。');
  check(eq(receipt.blockHash,tx.blockHash)&&eq(block.hash,receipt.blockHash),'替换交易区块不匹配。');
  return !eq(tx.to,intent.address)||!eq(tx.input,expected)||tx.value!==0n;
 }
 async function refreshAnchor(intent:Intent){
  if(anchor||!originHash)return;
  try{
   const original=await client.getTransaction({hash:originHash});
   check(eq(original.hash,originHash)&&eq(original.from,intent.account)&&eq(original.to,intent.address)&&eq(original.input,encodeFunctionData({abi,functionName:intent.functionName,args:intent.args}))&&original.value===0n&&transactionChainId(original)===CHAIN_ID,'Original transaction mismatch');
   anchor={hash:originHash,nonce:original.nonce};const tracked=gate.current()?.hash;if(tracked)persist(tracked,intent);
  }catch{/* A missing original remains unknown; a replacement hash alone never supplies its nonce. */}
 }
 async function send(d:Deployment,functionName:ActionName,args:readonly any[],progress?:(p:Progress)=>void,team?:number){
  const frozenArgs=structuredClone(args),deployment={...d};
  return gate.run(`${d.address}:${functionName}`,async update=>{
   const {wallet,actor,verify,valid}=await signer();
   d=deployment;const intent:Intent={address:d.address,account:actor,functionName,args:frozenArgs,chainId:CHAIN_ID,team};
   // Simulation uses a fresh consistent board, then contract versions enforce races at execution.
   await read(d);await verify();
   const simulation=await client.simulateContract({address:d.address,abi,functionName,args:intent.args,account:actor});
   const estimate=await client.estimateContractGas({address:d.address,abi,functionName,args:intent.args,account:actor});
   await verify();progress?.({status:'awaiting-signature'});
   const hash=await wallet.writeContract({...simulation.request,account:actor,chain:network,gas:estimate*12n/10n});
   anchor=null;originHash=hash;
   update(hash);persist(hash,intent);progress?.({status:'broadcast',hash});
   try{
    await refreshAnchor(intent);
    const receipt=await client.waitForTransactionReceipt({hash,timeout:90000,confirmations:1,onReplaced:(r:any)=>{update(r.transaction.hash);persist(r.transaction.hash,intent);progress?.({status:'broadcast',hash:r.transaction.hash,message:`钱包替换：${r.reason}，正在核验完整指令。`});}});
    check(eq(receipt.transactionHash,gate.current()?.hash),'Requested transaction hash mismatch');
    if(await cancelledReplacement(intent,receipt.transactionHash)){gate.resolve(receipt.transactionHash,'cancelled');clear();progress?.({status:'cancelled',hash:receipt.transactionHash});throw Error('原指令已被另一笔交易取消或替换；请刷新战场后重新选择。');}
    const result=await verifyReceipt(d,intent,receipt.transactionHash);valid();clear();progress?.({status:'confirmed',hash:result.proof.hash});return result;
   }catch(error){if(gate.current())progress?.({status:'unverified',hash:gate.current()?.hash??hash,message:describeError(error)});throw error;}
  });
 }
 async function recheck(d:Deployment,progress?:(p:Progress)=>void,finalHash?:Hex){
  const pending=gate.current();check(pending?.hash&&pendingIntent,'没有待核验交易。');
  check(eq(d.address,pendingIntent!.address),'待核验交易属于另一个合约。');
  const intent=pendingIntent!;
  await refreshAnchor(intent);
  if(finalHash&&!eq(finalHash,pending!.hash)){
   check(/^0x[\da-f]{64}$/i.test(finalHash)&&anchor,'无法确认原交易nonce；请在钱包检查原交易详情，等待原哈希可查询后重试。');
   // Also validates a repriced transaction with unchanged calldata before adopting its hash.
   await cancelledReplacement(intent,finalHash);
   gate.replace(pending!.hash!,finalHash);persist(finalHash,intent);
  }
  const hash=gate.current()!.hash!;
  if(await cancelledReplacement(intent,hash)){gate.resolve(hash,'cancelled');clear();progress?.({status:'cancelled',hash});return null;}
  const receipt=await client.getTransactionReceipt({hash});const tx=await client.getTransaction({hash});
  check(eq(receipt.transactionHash,hash)&&eq(tx.hash,hash),'Requested transaction hash mismatch');
  check(eq(tx.from,intent.account)&&eq(tx.to,intent.address)&&eq(tx.input,encodeFunctionData({abi,functionName:intent.functionName,args:intent.args}))&&transactionChainId(tx)===CHAIN_ID&&tx.value===0n,'待核验交易内容与原指令不符，请查看浏览器交易详情。');
  if(receipt.status==='reverted'){
   const block=await chainBlock(receipt.blockNumber);
   check(eq(receipt.transactionHash,tx.hash)&&eq(receipt.from,tx.from)&&eq(receipt.to,tx.to)&&eq(receipt.blockHash,tx.blockHash)&&eq(block.hash,receipt.blockHash),'回退交易的区块或签名者不匹配。');
   gate.resolve(hash,'reverted');clear();progress?.({status:'reverted',hash});return null;
  }
  const result=await verifyReceipt(d,intent,hash);gate.resolve(hash,'confirmed');clear();progress?.({status:'confirmed',hash});return result;
 }
 async function recover(hash:Hex,expectedAccount?:Address):Promise<Deployment>{
  check(/^0x[\da-f]{64}$/i.test(hash),'请输入完整部署交易哈希。');
  await chainBlock();const receipt=await client.waitForTransactionReceipt({hash,timeout:90000,confirmations:1});
  const tx=await client.getTransaction({hash:receipt.transactionHash});
  check(eq(receipt.transactionHash,hash)&&eq(tx.hash,hash),'Requested deployment hash mismatch');
  const block=await chainBlock(receipt.blockNumber);
  check(eq(block.hash,receipt.blockHash)&&eq(tx.blockHash,receipt.blockHash)&&eq(tx.from,receipt.from)&&(tx.to===null&&receipt.to===null||eq(tx.to,receipt.to)),'部署回执区块或签名者不匹配。');
  const pending=gate.current();
  const matchesPending=pending?.key==='deploy'&&eq(tx.from,deployAccount)&&(eq(pending.hash,hash)||anchor&&tx.nonce===anchor.nonce);
  if(matchesPending&&(receipt.status==='reverted'||tx.to!==null||!eq(tx.input,artifact.bytecode)||tx.value!==0n)){
   gate.resolve(pending!.hash!,receipt.status==='reverted'?'reverted':'cancelled');clear();throw Error('部署交易已回退、取消或被替换；可以重新部署。');
  }
  check(receipt.status==='success'&&receipt.contractAddress&&receipt.to===null&&tx.to===null&&tx.value===0n&&transactionChainId(tx)===CHAIN_ID&&eq(tx.input,artifact.bytecode),'这笔交易没有成功部署当前版本合约。');
  check(eq(tx.from,receipt.from)&&(!expectedAccount||eq(tx.from,expectedAccount))&&eq(tx.blockHash,receipt.blockHash),'部署者或区块不匹配。');
  const d={address:getAddress(receipt.contractAddress!),blockNumber:receipt.blockNumber};await verifyCode(d,receipt.blockNumber);await read(d,receipt.blockNumber);
  if(matchesPending){gate.resolve(pending!.hash!,'confirmed');clear();}
  return d;
 }
 async function deploy(progress:(p:Progress)=>void):Promise<Deployment>{
  return gate.run('deploy',async update=>{
   const {wallet,actor,verify,valid}=await signer();await chainBlock();const gas=await client.estimateGas({account:actor,data:artifact.bytecode as Hex});await verify();progress({status:'awaiting-signature'});
   const hash=await wallet.deployContract({abi,bytecode:artifact.bytecode as Hex,account:actor,chain:network,gas:gas*12n/10n});update(hash);
   deployAccount=actor;anchor=null;
   const saveDeploy=()=>{try{options.storage?.setItem(key,serialize({kind:'deploy',hash,account:actor,anchor}));}catch{/* Recovery remains available with the displayed public hash. */}};
   saveDeploy();
   progress({status:'broadcast',hash});
   try{const original=await client.getTransaction({hash});if(eq(original.hash,hash)&&eq(original.from,actor)&&original.to===null&&eq(original.input,artifact.bytecode)&&transactionChainId(original)===CHAIN_ID&&original.value===0n){anchor={hash,nonce:original.nonce};saveDeploy();}}catch{/* Unknown nonce requires an exact final deployment hash. */}
   try{const d=await recover(hash,actor);valid();progress({status:'confirmed',hash});return d;}catch(error){progress({status:'unverified',hash,message:'请保留部署哈希，用恢复部署核验。'});throw error;}
  });
 }
 return {setProvider,connect,selectAccount,read,send,recheck,recover,deploy,recent,
  account:()=>account,accounts:()=>[...accounts],pending:()=>gate.current(),
  destroy(){disposed=true;setProvider(null);}
 };
}

export function parseDeployment(params:URLSearchParams):Deployment|null{
 const address=params.get('contract'),start=params.get('start');
 if(!address&&!start)return null;
 check(address&&/^0x[\da-f]{40}$/i.test(address)&&!/^0x0{40}$/i.test(address),'合约地址无效。');
 check(start&&/^\d+$/.test(start)&&start.length<=30,'部署区块无效。');return {address:getAddress(address!),blockNumber:BigInt(start!)};
}
export async function resolveDeployment(params=new URLSearchParams(location.search)){
 const direct=parseDeployment(params);if(direct)return direct;
 const response=await fetch('/siege-deployment.json',{cache:'no-store'});check(response.ok,'新版部署配置读取失败。');const config=await response.json();
 check(config.chainId===CHAIN_ID,'新版配置网络无效。');if(!config.address)return null;
 return parseDeployment(new URLSearchParams({contract:config.address,start:String(config.blockNumber)}));
}
export function urlForDeployment(d:Deployment){const url=new URL('/siege',location.origin);url.searchParams.set('contract',d.address);url.searchParams.set('start',d.blockNumber.toString());return url.toString();}
export function describeError(error:unknown){
 const e=error as {code?:number,shortMessage?:string,message?:string,cause?:{code?:number}};const message=e?.shortMessage??e?.message??String(error);
 if(e?.code===4001||e?.cause?.code===4001||/reject|denied/i.test(message))return '已拒绝钱包签名，尚未广播的操作不会改变战场。';
 if(/insufficient funds/i.test(message))return '测试 MON 不足以支付 gas，请领取测试币。';
 if(/timeout|not found|timed out/i.test(message))return '交易状态暂未核验；保留哈希，点击重新核验，避免重复发送。';
 return message.split('\n')[0].slice(0,260);
}
