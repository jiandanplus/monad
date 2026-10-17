import type {Snapshot,ActionName} from './types.ts';
export type Selection={source:number,target:number|null,units:number[],roundId:bigint,sourceVersion:number,targetVersion:number};
export type Context={snapshot:Snapshot|null,account:string|null,verified:boolean,stale:boolean,busy:boolean,pending:boolean,now?:number};
export function remainingSeconds(s:Snapshot|null,now?:number):number|null;
export function access(ctx:Context):{team:number,reason:string,allowed:boolean};
export function captureSelection(s:Snapshot|null,source:number,units?:number[],target?:number|null):Selection;
export function reconcileSelection(sel:Selection,s:Snapshot|null):Selection;
export function previewDispatch(s:Snapshot,sel:Selection,team:number):{attackers:{kind:number,hp:number}[],defenders:{kind:number,hp:number}[],captured:boolean,pulses:number,friendly:boolean,remaining:number,atRisk:number[],returned:boolean};
export function actionOrder(ctx:Context,sel:Selection,type:ActionName,options?:{kind?:number,count?:number}):{functionName:ActionName,args:any[],cost:number,team:number};
export function parseRoster(texts:string[],seats:number):{players:string[],teams:number[],seatsPerFaction:number};

export function acceptRead(current:{disposed:boolean,suspended:boolean,epoch:number,deployment:object|null,blockNumber:bigint|null},request:{epoch:number,deployment:object},blockNumber:bigint):boolean;

export function createDeploymentSelection():{capture:()=>number,select:()=>number,accepts:(ticket:number,disposed:boolean)=>boolean};
export type ReportContext={deployment:object|null,epoch:number,roundId:bigint|null};
export function acceptReport(current:ReportContext&{disposed:boolean,suspended:boolean},request:ReportContext,proof:{eventName:string,event:Record<string,any>}):boolean;
export function applySnapshot(previous:Snapshot|null,next:Snapshot,scene:{setState:(nodes:Snapshot['nodes']|null)=>void},clearReports:()=>void):boolean;
export function roomControls(state:{busy:boolean,pending:unknown}):{open:boolean,write:boolean};
