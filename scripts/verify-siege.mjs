import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {createPublicClient,http,getAddress,decodeFunctionData} from 'viem';
import {parseLobby,parseSnapshot} from '../src/siege/state.mjs';
import {verifyActionProof} from '../src/siege/transactions.mjs';
const artifact=JSON.parse(await readFile(new URL('../src/generated/SiegeCanvas.json',import.meta.url),'utf8'));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export async function verifySiege(client,deployment,scope='monad-testnet'){
 if(await client.getChainId()!==10143)throw Error('Wrong chain');
 const block=await client.getBlock({blockNumber:await client.getBlockNumber({cacheTime:0})});
 if(!same(await client.getCode({address:deployment.address,blockNumber:block.number}),artifact.deployedBytecode))throw Error('Runtime mismatch');
 const [lobby,raw]=await Promise.all([client.readContract({address:deployment.address,abi:artifact.abi,functionName:'getLobby',blockNumber:block.number}),client.readContract({address:deployment.address,abi:artifact.abi,functionName:'getSnapshot',args:[0n],blockNumber:block.number})]);
 const snapshot=parseSnapshot(raw,{blockNumber:block.number,timestamp:block.timestamp}),parsedLobby=parseLobby(lobby);
 const orders=[];
 if(snapshot.roundId>0n){
  const lower=block.number>99n?block.number-99n:0n;
  const logs=await client.getLogs({address:deployment.address,event:artifact.abi.find(e=>e.type==='event'&&e.name==='OrderExecuted'),args:{roundId:snapshot.roundId},fromBlock:lower>deployment.blockNumber?lower:deployment.blockNumber,toBlock:block.number,strict:true});
  for(const log of logs.slice(-24)){
   if(log.removed)continue;
   const [tx,receipt,header]=await Promise.all([client.getTransaction({hash:log.transactionHash}),client.getTransactionReceipt({hash:log.transactionHash}),client.getBlock({blockNumber:log.blockNumber})]);
   if(!same(header.hash,log.blockHash))throw Error('Noncanonical log');
   const decoded=decodeFunctionData({abi:artifact.abi,data:tx.input});
   const proof=verifyActionProof({hash:log.transactionHash,tx,receipt,abi:artifact.abi,intent:{address:deployment.address,account:tx.from,chainId:10143,functionName:decoded.functionName,args:decoded.args}});
   if(proof.eventName!=='OrderExecuted'||proof.event.roundId!==snapshot.roundId||!same(proof.blockHash,log.blockHash))throw Error('Order context mismatch');
   orders.push(proof);
  }
 }
 if(!same((await client.getBlock({blockNumber:block.number})).hash,block.hash))throw Error('Snapshot block reorganized');
 const dispatchTeams=[...new Set(orders.filter(p=>p.event.action===1).map(p=>p.event.team))];
 return {scope,chainId:10143,contract:deployment.address,runtimeMatches:true,blockNumber:block.number,blockHash:block.hash,lobby:parsedLobby,snapshot,orders,dispatchTeams,fourFactionsObserved:dispatchTeams.length===4,testnetAcceptancePassed:false,note:'Read-only bounded evidence; private-wallet multiplayer acceptance requires human review. No writes or signatures.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [address,start,output,mode]=process.argv.slice(2);
  if(!address||!/^\d+$/.test(start??'')||!output||mode&&mode!=='--local')throw Error('Usage: node scripts/verify-siege.mjs <address> <deploymentBlock> <output.json> [--local]');
  const local=mode==='--local',client=createPublicClient({transport:http(local?'http://127.0.0.1:8547':'https://testnet-rpc.monad.xyz',{timeout:15000,retryCount:1})});
  const result=await verifySiege(client,{address:getAddress(address),blockNumber:BigInt(start)},local?'local-evm':'monad-testnet');
  await writeFile(output,JSON.stringify(result,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  console.log(JSON.stringify({scope:result.scope,blockNumber:String(result.blockNumber),dispatchTeams:result.dispatchTeams,fourFactionsObserved:result.fourFactionsObserved,output}));
 }catch(error){console.error(error.shortMessage??error.message);process.exitCode=1;}
}
