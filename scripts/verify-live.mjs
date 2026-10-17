// Read-only Testnet acceptance. Never requests wallet keys or broadcasts transactions.
import {writeFile,readFile} from 'node:fs/promises';
import {createPublicClient,http,getAddress,parseAbiItem} from 'viem';
import {chooseFactionProofs} from './live-proofs.mjs';
const [addressArg,blockArg,outputArg]=process.argv.slice(2);
if(!addressArg||!/^\d+$/.test(blockArg??''))throw new Error('Usage: node scripts/verify-live.mjs <contract-address> <deployment-block> [evidence-output.json]');
const address=getAddress(addressArg),deploymentBlock=BigInt(blockArg);
const artifact=JSON.parse(await readFile(new URL('../src/generated/BlitzCanvas.json',import.meta.url),'utf8'));
const client=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{timeout:15000,retryCount:1})});
const chainId=await client.getChainId();if(chainId!==10143)throw new Error('Wrong chain');
const code=await client.getCode({address});if(code?.toLowerCase()!==artifact.deployedBytecode.toLowerCase())throw new Error('Runtime bytecode does not match source artifact');
const blockNumber=await client.getBlockNumber();
const [roundId,startsAt,endsAt,owners,defense,actions,entrants,scores]=await client.readContract({address,abi:artifact.abi,functionName:'getSnapshot',args:['0x0000000000000000000000000000000000000000'],blockNumber});
if(owners.length!==9||owners.some(c=>c>2)||defense.length!==9||defense.some(c=>c>100)||scores.length!==2)throw new Error('Invalid pixel battle snapshot');
const event=parseAbiItem('event SquadDeployed(uint256 indexed roundId, uint8 indexed district, address indexed actor, uint8 team, uint8 unit, uint8 beforeOwner, uint8 afterOwner, uint16 beforeDefense, uint16 afterDefense, uint16 spent, uint16 pointsAfter)');
// Bound the total scan. Long-lived battles retain authoritative counters but may need explicit receipt hashes for older orders.
const from=blockNumber>999n&&blockNumber-999n>deploymentBlock?blockNumber-999n:deploymentBlock;
let logs=[];
for(let start=from;start<=blockNumber;start+=100n){
 const end=start+99n>blockNumber?blockNumber:start+99n;
 logs.push(...await client.getLogs({address,event,args:{roundId},fromBlock:start,toBlock:end,strict:true}));
}
const proofs=[];
for(const log of chooseFactionProofs(logs)){
 const receipt=await client.getTransactionReceipt({hash:log.transactionHash});
 if(receipt.status!=='success'||receipt.to?.toLowerCase()!==address.toLowerCase())throw new Error('Squad receipt mismatch');
 proofs.push({address:log.args.actor,hash:log.transactionHash,blockNumber:receipt.blockNumber,district:log.args.district,team:log.args.team,unit:log.args.unit,beforeOwner:log.args.beforeOwner,afterOwner:log.args.afterOwner,spent:log.args.spent,status:receipt.status});
}
const result=roundId>0n?await client.readContract({address,abi:artifact.abi,functionName:'getRoundResult',args:[roundId],blockNumber}):null;
const evidence={checkedAt:new Date().toISOString(),chainId,address,deploymentBlock,blockNumber,bytecodeMatches:true,roundId,startsAt,endsAt,owners,defense,actions,entrants,scores,result,recentScan:{fromBlock:from,toBlock:blockNumber},twoWalletReceiptProofs:proofs,twoWalletAcceptancePassed:proofs.length>=2&&new Set(proofs.map(p=>p.team)).size===2};
const json=JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
if(outputArg)await writeFile(outputArg,json);console.log(json);
if(!evidence.twoWalletAcceptancePassed)process.exitCode=2;
