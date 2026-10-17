import {NODES,UNIT_STATS} from './config.mjs';
import {neighbors,supplied} from './supply.mjs';
import {resolveBattle} from './combat.mjs';
const check=(value,message)=>{if(!value)throw Error(message);};
export function remainingSeconds(s,now=Date.now()) {
 if(!s||!s.roundId)return null;
 return Math.max(0,Math.min(300,Math.ceil(s.endsAt-s.blockTimestamp-Math.max(0,now-s.loadedAt)/1000)));
}
export function access({snapshot:s,account,verified,stale,busy,pending,now=Date.now()}) {
 const i=s?.players.findIndex(a=>a.toLowerCase()===account?.toLowerCase())??-1,team=i<0?0:s.teams[i];
 const reason=!s||!verified?'等待有效链上快照':stale||now-s.loadedAt>15000?'快照已过期，请刷新后下令':busy||pending?'已有交易等待处理或核验':!account?'连接钱包并选择签名地址':!team?'当前地址为旁观者':!s.roundId?'尚未开局':remainingSeconds(s,now)===0?'本轮已结束':'';
 return {team,reason,allowed:!reason};
}
export function captureSelection(s,source,units=[],target=null) {
 check(Number.isInteger(source)&&source>=0&&source<13,'请选择有效来源');
 check(Array.isArray(units)&&units.length<=6&&new Set(units).size===units.length,'每次选择1至6个不同单位');
 check(units.every(i=>Number.isInteger(i)&&i>=0&&i<(s?.nodes[source].units.length??0)),'单位索引已变化');
 check(target===null||Number.isInteger(target)&&target>=0&&target<13,'目标无效');
 return {source,target,units:[...units].sort((a,b)=>a-b),roundId:s?.roundId??0n,sourceVersion:s?.nodes[source].version??-1,targetVersion:target===null?-1:s?.nodes[target].version??-1};
}
export function reconcileSelection(sel,s) {
 if(!s||sel.roundId!==s.roundId||sel.sourceVersion!==s.nodes[sel.source].version||sel.target!==null&&sel.targetVersion!==s.nodes[sel.target].version)return captureSelection(s,sel.source);
 return sel;
}
export function previewDispatch(s,sel,team) {
 check(s&&sel.target!==null,'请选择相邻目标');
 const a=s.nodes[sel.source],d=s.nodes[sel.target];
 check(a.owner===team,'只能调遣本方部队');check(neighbors(sel.source).includes(sel.target),'只能调遣到相邻道路');check(NODES[sel.target].kind!=='base'||d.owner===team,'敌方基地不可攻击');
 check(sel.units.length>=1&&sel.units.length<=6,'请选择1至6个单位');
 const attackers=sel.units.map(i=>a.units[i]);check(attackers.every(Boolean),'单位索引已变化');
 const friendly=d.owner===team;
 check(!friendly||d.units.length+attackers.length<=12,'友军节点容量最多12');
 check(friendly||!d.units.length||attackers.some(u=>u.kind!==2),'纯工程师不能进攻有守军的节点');
 const battle=friendly?{attackers,defenders:d.units,captured:false,pulses:0}:resolveBattle({attackers,defenders:d.units,city:NODES[sel.target].city,fortified:d.fortified});
 const owners=s.nodes.map(n=>n.owner),before=supplied(owners,team);owners[sel.source]=0;const after=supplied(owners,team);
 return {...battle,friendly,remaining:a.units.length-attackers.length,atRisk:before.flatMap((yes,id)=>yes&&!after[id]&&id!==sel.source?[id]:[]),returned:!friendly&&!battle.captured&&battle.attackers.length>0};
}
export function actionOrder(ctx,sel,type,options={}) {
 const permission=access(ctx);check(permission.allowed,permission.reason);
 const s=ctx.snapshot,n=s.nodes[sel.source],team=permission.team;
 check(reconcileSelection(sel,s)===sel,'来源、目标或回合已变化，请重新选择');check(n.owner===team,'只能操作本方节点');
 check(n.cooldownUntil<=s.blockTimestamp,'来源冷却中，等待链上新区块');
 let args=[s.roundId,sel.source,n.version],cost=0;
 if(type==='dispatch') {previewDispatch(s,sel,team);args=[s.roundId,sel.source,sel.target,n.version,s.nodes[sel.target].version,[...sel.units]];}
 else if(type==='recruit') {
  const {kind,count}=options;check(Number.isInteger(kind)&&kind>=0&&kind<=2&&Number.isInteger(count)&&count>=1&&count<=6,'招募数量1至6');
  check(NODES[sel.source].kind==='base'||sel.source===12&&n.supplied&&kind!==1,'仅基地可招募全部兵种；连通兵工厂仅步兵/工程师');
  check(n.units.length+count<=12,'节点容量最多12');cost=UNIT_STATS[kind].cost*count;args.push(kind,count);
 } else if(type==='fortify'||type==='repair') {
  check(n.supplied,'工程操作需要补给连接');check(n.units.some(u=>u.kind===2),'需要工程师在场');
  if(type==='fortify'){check(NODES[sel.source].kind!=='base'&&!n.fortified,'工事仅用于尚无工事的非基地');cost=20;}
  else {check(sel.units.length>=1&&sel.units.length<=3&&sel.units.every(i=>n.units[i].hp<UNIT_STATS[n.units[i].kind].hp),'请选择1至3个残血单位');cost=15;args.push([...sel.units]);}
 } else throw Error('未知行动');
 check(s.funds[team-1]>=cost,'阵营共享军费不足');return {functionName:type,args,cost,team};
}
export function parseRoster(texts,seats) {
 check(Number.isInteger(seats)&&seats>=1&&seats<=4,'每方1至4席');check(texts.length===4,'需要四个阵营名单');
 const players=[],teams=[],seen=new Set();
 texts.forEach((text,index)=>{const list=text.trim().split(/[\s,;]+/).filter(Boolean);check(list.length===seats,`每个阵营必须填写${seats}个地址`);
  for(const a of list){check(/^0x[0-9a-f]{40}$/i.test(a)&&!/^0x0{40}$/i.test(a),'名单含无效地址');check(!seen.has(a.toLowerCase()),'名单含重复地址');seen.add(a.toLowerCase());players.push(a);teams.push(index+1);}
 });return {players,teams,seatsPerFaction:seats};
}

export function acceptRead(current,request,blockNumber) {
 return !current.disposed&&!current.suspended&&current.epoch===request.epoch&&current.deployment===request.deployment&&(current.blockNumber===null||blockNumber>=current.blockNumber);
}

/** Startup discovery follows explicit room choices, independently of wallet sessions. */
export function createDeploymentSelection(){
 let generation=0;
 return {capture:()=>generation,select:()=>++generation,accepts:(ticket,disposed)=>!disposed&&ticket===generation};
}
export function acceptReport(current,request,proof){
 if(current.disposed||current.suspended||current.deployment!==request.deployment||current.epoch!==request.epoch||current.roundId!==request.roundId)return false;
 return !['OrderExecuted','RoundStarted'].includes(proof.eventName)||proof.event.roundId===current.roundId;
}
/** Clear old visual movement synchronously, then restore only the authoritative board. */
export function applySnapshot(previous,next,scene,clearReports){
 if(previous&&(next.blockNumber<previous.blockNumber||next.roundId<previous.roundId))return false;
 if(previous&&previous.roundId!==next.roundId){scene.setState(null);clearReports();}
 scene.setState(next.nodes);return true;
}
export function roomControls({busy,pending}){return {open:!busy,write:!busy&&!pending};}
