import {
  createPublicClient,createWalletClient,custom,defineChain,http,
  getAddress,hexToBytes,parseAbiItem,formatEther,decodeFunctionData,
  type Address,type Hex,type Abi,type EIP1193Provider
} from 'viem';
import artifact from './generated/BlitzCanvas.json' with {type:'json'};
import {parseDeploymentParams} from './model.mjs';
import {createWalletRegistry,type Provider} from './wallets.ts';

export const CHAIN_ID=10143;
export const EXPLORER='https://testnet.monadscan.com';
const RPC='https://testnet-rpc.monad.xyz';
const chain=defineChain({id:CHAIN_ID,name:'Monad Testnet',nativeCurrency:{name:'Test MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[RPC]}},blockExplorers:{default:{name:'Monadscan',url:EXPLORER}},testnet:true});
export const publicClient=createPublicClient({chain,transport:http(RPC,{timeout:15000,retryCount:1}),pollingInterval:1500});
const abi=artifact.abi as Abi;
const squadEvent=parseAbiItem('event SquadDeployed(uint256 indexed roundId, uint8 indexed district, address indexed actor, uint8 team, uint8 unit, uint8 beforeOwner, uint8 afterOwner, uint16 beforeDefense, uint16 afterDefense, uint16 spent, uint16 pointsAfter)');
export type Deployment={address:Address,blockNumber:bigint};
export type Snapshot={roundId:bigint,startsAt:number,endsAt:number,owners:number[],defense:number[],actions:number[],entrants:number[],scores:number[],points:number,income:number,viewerTeam:number,nextActionAt:number,chainTime:number,blockNumber:bigint,loadedAt:number};
export type Activity={roundId:bigint,district:number,actor:Address,team:number,unit:number,beforeOwner:number,afterOwner:number,beforeDefense:number,afterDefense:number,spent:number,pointsAfter:number,hash:Hex};
let connectedAddress:Address|null=null;
let authorizedAccounts:Address[]=[], preferredAccount:Address|null=null, preferredProvider:Provider|null=null, walletSession=0;
let registry:ReturnType<typeof createWalletRegistry>|null=null;
let registryWindow:unknown=null,attached:Provider|null=null;
const walletListeners=new Set<()=>void>();
function walletEvent(){walletSession++;connectedAddress=null;authorizedAccounts=[];preferredAccount=null;preferredProvider=null;for(const cb of walletListeners)cb();}
function bindSelected(){
  let next:Provider|null=null;try{next=registry?.provider()??null;}catch{/* Selection may be empty. */}
  if(next===attached)return;
  if(attached)for(const event of ['accountsChanged','chainChanged','disconnect'])attached.removeListener?.(event,walletEvent);
  attached=next;
  if(attached)for(const event of ['accountsChanged','chainChanged','disconnect'])attached.on?.(event,walletEvent);
  walletEvent();
}
function wallets(){
  if(!registry||registryWindow!==window){
    registry?.destroy();registryWindow=window;
    registry=createWalletRegistry(window as unknown as Parameters<typeof createWalletRegistry>[0]);
    registry.subscribe(bindSelected);bindSelected();
  }
  return registry;
}
function provider(){const p=wallets().provider();bindSelected();return p;}
export function listWallets(){return wallets().list();}
export function selectedWalletId(){return wallets().selectedId();}
export function selectWallet(id:string){wallets().select(id);connectedAddress=null;bindSelected();}
export function onWalletsChanged(cb:()=>void){return wallets().subscribe(cb);}
export function getConnectedAddress(){return connectedAddress;}
export function getAuthorizedAccounts(){return [...authorizedAccounts];}
export function getPreferredAccount(){return preferredAccount??connectedAddress;}
export function selectAccount(address:string){
  const p=provider(), account=getAddress(address);
  if(!authorizedAccounts.some(a=>a.toLowerCase()===account.toLowerCase()))throw new Error('该账户尚未授权给当前网站，请先在钱包授权。');
  walletSession++;preferredAccount=account;preferredProvider=p;connectedAddress=null;
  for(const cb of walletListeners)cb();
}
export function onWalletChanged(cb:()=>void){
  wallets();walletListeners.add(cb);return ()=>{walletListeners.delete(cb);};
}
async function signingClient(){
  connectedAddress=null;
  const p=provider(), session=walletSession, intended=preferredProvider===p?preferredAccount:null;
  const checkSession=()=>{if(provider()!==p||walletSession!==session)throw new Error('钱包账户或网络在操作期间发生变化，请重新连接并确认签名账户。');};
  const wallet=createWalletClient({chain,transport:custom(p)});
  const accounts=(await wallet.requestAddresses()).map(a=>getAddress(a));
  checkSession();
  authorizedAccounts=[...accounts];
  const explicit=intended;
  const account=explicit?accounts.find(a=>a.toLowerCase()===explicit.toLowerCase()):accounts[0];
  if(!account)throw new Error(explicit?'所选账户已不在钱包授权列表，请重新授权或选择账户。':'钱包没有返回账户，请重新连接。');
  let id=await wallet.getChainId();
  if(id!==CHAIN_ID){
    try{await wallet.switchChain({id:CHAIN_ID});}
    catch(error){
      const e=error as {code?:number,cause?:{code?:number}};
      if(e.code===4902||e.cause?.code===4902){await wallet.addChain({chain});await wallet.switchChain({id:CHAIN_ID});}
      else throw error;
    }
    id=await wallet.getChainId();
  }
  if(id!==CHAIN_ID)throw new Error('请切换到 Monad Testnet（10143）后重试。');
  checkSession();
  connectedAddress=getAddress(account);
  return {wallet,account:connectedAddress,checkSession};
}
export async function connect(changeAccount=false){
  if(changeAccount){
    connectedAddress=null;authorizedAccounts=[];preferredAccount=null;preferredProvider=null;
    const p=provider();
    try{await p.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});}
    catch(error){
      const code=(error as {code?:number}).code;
      if(code===4200||code===-32601)throw new Error('此钱包不支持网页重新选择账户。请在钱包的网站连接权限中选择目标地址，再重新连接。');
      throw error;
    }
    if(provider()!==p)throw new Error('钱包选择已变化，请重新选择账户。');
  }
  const {account,checkSession}=await signingClient();
  let balance='—';
  try{balance=Number(formatEther(await publicClient.getBalance({address:account}))).toFixed(4);}catch{/* Connection does not depend on a balance read. */}
  checkSession();
  return {address:account,balance};
}
const verified=new Set<string>();
async function verifyContract(d:Deployment){
  if(verified.has(d.address.toLowerCase()))return;
  const code=await publicClient.getCode({address:d.address});
  if(!code||code.toLowerCase()!==artifact.deployedBytecode.toLowerCase())throw new Error('该地址不是当前像素据点战版本的合约。旧版街区/画布需要重新部署，或检查网络和地址。');
  verified.add(d.address.toLowerCase());
}
export async function resolveDeployment():Promise<Deployment|null>{
  let d=parseDeploymentParams(new URLSearchParams(window.location.search)) as Deployment|null;
  if(!d){
    const response=await fetch('/deployment.json',{cache:'no-store'});
    if(!response.ok)throw new Error('无法读取项目配置，请刷新重试。');
    const config=await response.json();
    if(!config.address)return null;
    if(config.chainId!==CHAIN_ID)throw new Error('项目配置不是 Monad Testnet。');
    d=parseDeploymentParams(new URLSearchParams({contract:String(config.address),start:String(config.blockNumber??0)})) as Deployment;
  }
  d={address:getAddress(d.address),blockNumber:d.blockNumber};
  await verifyContract(d);return d;
}
export async function getSnapshot(d:Deployment):Promise<Snapshot>{
  await verifyContract(d);
  const blockNumber=await publicClient.getBlockNumber({cacheTime:0});
  const viewer=connectedAddress??'0x0000000000000000000000000000000000000000';
  const [roundId,startsAt,endsAt,owners,defense,actions,entrants,rawScores,points,income,viewerTeam,nextActionAt,chainTime]=await publicClient.readContract({address:d.address,abi,functionName:'getSnapshot',args:[viewer],blockNumber}) as [bigint,bigint,bigint,readonly number[],readonly number[],readonly number[],readonly number[],readonly bigint[],number,number,number,bigint,bigint];
  const scores=rawScores.map(Number);
  const nine=(values:readonly number[])=>values.length===9;
  if(!nine(owners)||owners.some(n=>![0,1,2].includes(n))||!nine(defense)||defense.some(n=>!Number.isInteger(n)||n<0||n>100)||!nine(actions)||!nine(entrants)||scores.length!==2||scores.some(n=>!Number.isSafeInteger(n)||n<0)||!Number.isInteger(points)||points<0||points>200||!Number.isInteger(income)||income<0||income>16||![0,1,2].includes(viewerTeam))throw new Error('合约返回了无效据点战快照，已停止更新。');
  return {roundId,startsAt:Number(startsAt),endsAt:Number(endsAt),owners:[...owners],defense:[...defense],actions:[...actions],entrants:[...entrants],scores,points,income,viewerTeam,nextActionAt:Number(nextActionAt),chainTime:Number(chainTime),blockNumber,loadedAt:Date.now()};
}
export async function getActivity(d:Deployment,toBlock:bigint,roundId:bigint):Promise<Activity[]>{
  // Bounded recent history, not a claim to recover all historical events.
  const fromBlock=toBlock>99n?toBlock-99n:0n;
  if(fromBlock>d.blockNumber&&fromBlock>toBlock||d.blockNumber>toBlock)return [];
  const logs=await publicClient.getLogs({address:d.address,event:squadEvent,args:{roundId},fromBlock:fromBlock>d.blockNumber?fromBlock:d.blockNumber,toBlock,strict:true});
  return logs.filter(l=>l.transactionHash).reverse().slice(0,12).map(l=>({roundId:l.args.roundId,district:Number(l.args.district),actor:l.args.actor,team:Number(l.args.team),unit:Number(l.args.unit),beforeOwner:Number(l.args.beforeOwner),afterOwner:Number(l.args.afterOwner),beforeDefense:Number(l.args.beforeDefense),afterDefense:Number(l.args.afterDefense),spent:Number(l.args.spent),pointsAfter:Number(l.args.pointsAfter),hash:l.transactionHash!}));
}
export function urlForDeployment(d:Deployment){
  const url=new URL(window.location.origin+window.location.pathname);
  url.searchParams.set('contract',getAddress(d.address));url.searchParams.set('start',d.blockNumber.toString());return url.toString();
}
export type OrderHashCallback=(hash:Hex,account?:Address,replacement?:'repriced'|'cancelled'|'replaced')=>void;
async function sendGameAction(d:Deployment,functionName:'cast'|'startRound',args:readonly unknown[],onHash:OrderHashCallback){
  await verifyContract(d);
  const {wallet,account,checkSession}=await signingClient();
  const {request}=await publicClient.simulateContract({address:d.address,abi,functionName,args,account});
  const gas=await publicClient.estimateContractGas({address:d.address,abi,functionName,args,account});
  checkSession();
  const hash=await wallet.writeContract({...request,gas:gas*12n/10n,chain,account});onHash(hash,account);
  let cancelled=false;
  const receipt=await publicClient.waitForTransactionReceipt({hash,timeout:120000,confirmations:1,onReplaced:r=>{onHash(r.transaction.hash,account,r.reason);if(r.reason!=='repriced')cancelled=true;}});
  if(cancelled)throw new Error('交易已被钱包替换或取消，请查看交易记录。');
  if(receipt.status!=='success')throw new Error('操作执行失败，没有更新战场。请刷新后重试。');
  return {hash:receipt.transactionHash,blockNumber:receipt.blockNumber};
}
export async function cast(d:Deployment,district:number,team:number,unit:number,onHash:OrderHashCallback,expectedRoundId:bigint){
  if(!Number.isInteger(district)||district<0||district>8||![1,2].includes(team)||![0,1,2].includes(unit))throw new Error('请选择有效据点、阵营和兵种。');
  return sendGameAction(d,'cast',[expectedRoundId,district,team,unit],onHash);
}
export async function startRound(d:Deployment,onHash:OrderHashCallback,expectedCurrentRoundId:bigint){
  return sendGameAction(d,'startRound',[expectedCurrentRoundId],onHash);
}
/** Reads receipt + actual calldata; a local record alone never proves a game order. */
export async function readOrderReceipt(hash:Hex):Promise<Record<string,any>|null>{
  let receipt;
  try{receipt=await publicClient.getTransactionReceipt({hash});}
  catch(error){if((error as {name?:string}).name==='TransactionReceiptNotFoundError')return null;throw error;}
  const tx=await publicClient.getTransaction({hash:receipt.transactionHash});
  const decoded=decodeFunctionData({abi:artifact.abi,data:tx.input});
  const args=decoded.args as readonly unknown[];
  if(decoded.functionName!=='cast'&&decoded.functionName!=='startRound')throw new Error('回执不是据点战调遣或开局交易。');
  return {chainId:CHAIN_ID,hash:receipt.transactionHash,status:receipt.status,blockNumber:receipt.blockNumber,contract:tx.to,account:tx.from,kind:decoded.functionName==='cast'?'dispatch':'startRound',roundId:String(args[0]),...(decoded.functionName==='cast'?{district:Number(args[1]),team:Number(args[2]),unit:Number(args[3])}:{})};
}
export async function deployCanvas(onHash:(hash:Hex)=>void):Promise<Deployment>{
  const {wallet,account,checkSession}=await signingClient();
  const gas=await publicClient.estimateGas({account,data:artifact.bytecode as Hex});
  checkSession();
  const hash=await wallet.deployContract({abi,bytecode:artifact.bytecode as Hex,account,chain,gas:gas*12n/10n});onHash(hash);
  return recoverDeployment(hash,onHash);
}
export async function recoverDeployment(hash:Hex,onHash?:(hash:Hex)=>void):Promise<Deployment>{
  if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error('部署交易哈希无效。');
  let cancelled=false;
  const receipt=await publicClient.waitForTransactionReceipt({hash,timeout:120000,confirmations:1,onReplaced:r=>{
    if(r.reason==='repriced')onHash?.(r.transaction.hash);
    else cancelled=true;
  }});
  if(cancelled)throw new Error('部署交易已被取消或替换，请检查钱包中的最终交易哈希后恢复。');
  if(receipt.status!=='success'||!receipt.contractAddress||receipt.to!==null)throw new Error('这笔交易没有成功创建合约。');
  const d={address:getAddress(receipt.contractAddress),blockNumber:receipt.blockNumber};await verifyContract(d);return d;
}
export function describeError(error:unknown):string{
  const e=error as {code?:number,message?:string,shortMessage?:string,cause?:{code?:number}};
  const msg=e?.shortMessage??e?.message??String(error);
  if(e?.code===4001||e?.cause?.code===4001||/reject|denied/i.test(msg))return '你取消了钱包请求。战场没有因此改变，可以重新操作。';
  if(/insufficient funds|exceeds.*balance/i.test(msg))return '测试币余额不足，请先领取 Monad Testnet 测试币用于 gas。';
  if(/timeout|timed out/i.test(msg))return '网络确认超时。若已有交易哈希，请先查看交易结果，避免重复发送。';
  if(/rate limit|429/i.test(msg))return '测试网 RPC 暂时限流，稍后会重试。';
  if(/Round changed/i.test(msg))return '回合已经切换，这笔操作未作用于新一局。请刷新战场再出招。';
  if(/Round ended|No round|Round active/i.test(msg))return '回合状态已变化，请刷新并检查是否需要开始新一局。';
  if(/Cooldown active/i.test(msg))return '兵种还在链上冷却中，稍等片刻再出兵。';
  if(/Team locked/i.test(msg))return '本局阵营已固定，请使用已加入的阵营。';
  if(/No effect/i.test(msg))return '该据点驻军已满，换个据点继续。';
  if(/Insufficient points/i.test(msg))return '指挥点不足，请等待恢复或占领更多产出据点。';
  if(/Unreachable/i.test(msg))return '需要先占领一个与目标上下左右相邻的据点。';
  if(/Engineer cannot attack enemy/i.test(msg))return '工程师只能接管中立据点或增援友军，请换用步兵或坦克攻击敌军。';
  if(/unsupported.*(chain|network)|unknown.*(chain|network)|不支持.*网络|未知网络/i.test(msg))return '当前钱包未启用或不支持 Monad Testnet（10143）。Backpack 可先检查偏好设置中的开发者模式和测试网；也可在钱包选择器中选择支持自定义 EVM 网络的钱包。';
  if(/fetch|network|HTTP request failed/i.test(msg))return '暂时无法连接测试网，已保留上次确认的战场，请稍后重试。';
  return msg.split('\n')[0].slice(0,220);
}
