import type {Abi,Address,Hex} from 'viem';
export type ActionIntent={address:Address,account:Address,functionName:string,args:readonly any[],chainId:number,team?:number};
export function transactionChainId(tx:any):number|null;
export function verifyActionProof(input:{hash:Hex,tx:any,receipt:any,intent:ActionIntent,abi:Abi}):{hash:Hex,blockNumber:bigint,blockHash:Hex,event:Record<string,any>,eventName:string};
export function createOrderGate():{
 current():{key:string,hash:Hex|null,status:string}|null;
 restore(record:{key:string,hash:Hex}):void;
 replace(previous:Hex,next:Hex):void;
 run<T>(key:string,operation:(update:(hash:Hex)=>void)=>Promise<T>):Promise<T>;
 resolve(hash:Hex,status:'confirmed'|'reverted'|'cancelled'):void;
};
