import {getAddress} from 'viem';
import {rates} from './supply.mjs';
import {HOME_BY_TEAM,UNIT_STATS} from './config.mjs';
const check=(ok,message)=>{if(!ok)throw Error(`Invalid siege state: ${message}`);};
const num=(v,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(v);check(Number.isSafeInteger(n)&&n>=0&&n<=max,'integer range');return n;};
const big=v=>{check(typeof v==='bigint'&&v>=0n,'big integer');return v;};
const dense=(v,length)=>{check(Array.isArray(v)&&v.length===length,'array length');return Array.from(v,x=>{check(x!==undefined&&x!==null,'sparse array');return x;});};
function roster(players,teams,seats,allowEmpty){
 seats=num(seats,4);check(seats>=1,'seats');
 const list=dense(players,allowEmpty&&players.length===0?0:seats*4).map(a=>{check(typeof a==='string'&&/^0x[\da-f]{40}$/i.test(a)&&!/^0x0{40}$/i.test(a),'address');return getAddress(a);});
 check(new Set(list.map(a=>a.toLowerCase())).size===list.length,'duplicate address');
 const side=dense(teams,list.length).map(t=>{t=num(t,4);check(t>=1,'team');return t;});
 if(list.length)for(let t=1;t<=4;t++)check(side.filter(x=>x===t).length===seats,'unbalanced roster');
 return {players:list,teams:side,seatsPerFaction:seats};
}
export function parseLobby(raw){
 const [host,version,seats,players,teams,readyFlags]=raw;
 check(/^0x[\da-f]{40}$/i.test(host),'host');
 const list=roster(players,teams,seats,true);
 const flags=dense(readyFlags,list.players.length);check(flags.every(x=>typeof x==='boolean'),'ready flags');
 return {host:getAddress(host),rosterVersion:big(version),...list,readyFlags:flags};
}
export function parseSnapshot(raw,block){
 check(raw&&typeof raw==='object','snapshot');
 const roundId=big(raw.roundId),startsAt=num(raw.startsAt),endsAt=num(raw.endsAt),blockTimestamp=num(raw.blockTimestamp);
 check(BigInt(blockTimestamp)===block.timestamp,'block timestamp mismatch');
 const list=roster(raw.players,raw.teams,raw.seatsPerFaction,roundId===0n);
 check(roundId===0n?startsAt===0&&endsAt===0:startsAt>0&&endsAt-startsAt===300&&blockTimestamp>=startsAt,'round duration');
 const nodes=dense(raw.nodes,13).map(n=>{
  const owner=num(n.owner,4),version=num(n.version,4294967295),cooldownUntil=num(n.cooldownUntil);
  check(typeof n.fortified==='boolean'&&typeof n.supplied==='boolean','node flags');
  check(Array.isArray(n.units)&&n.units.length<=12,'capacity');
  const units=dense(n.units,n.units.length).map(code=>{code=num(code,65535);const kind=code>>8,hp=code&255;check(kind<=2&&hp>=1&&hp<=UNIT_STATS[kind].hp,'unit');return {kind,hp};});
  return {owner,version,cooldownUntil,fortified:n.fortified,supplied:n.supplied,units};
 });
 const funds=dense(raw.funds,4).map(n=>num(n,200)),scores=dense(raw.scores,4).map(n=>num(n,1200));
 const incomeRates=dense(raw.incomeRates,4).map(n=>num(n,5)),scoreRates=dense(raw.scoreRates,4).map(n=>num(n,4));
 if(roundId===0n){check(nodes.every(n=>n.owner===0&&!n.units.length&&!n.fortified&&!n.supplied&&n.version===0&&n.cooldownUntil===0)&&[...funds,...scores,...incomeRates,...scoreRates].every(n=>n===0),'nonempty unstarted round');}
 else{
  const owners=nodes.map(n=>n.owner);
  for(let team=1;team<=4;team++){
   check(owners[HOME_BY_TEAM[team]]===team,'base owner');
   const r=rates(owners,team);check(incomeRates[team-1]===r.income&&scoreRates[team-1]===r.score,'supply rates');
   nodes.forEach((n,i)=>{if(n.owner===team)check(n.supplied===r.connected[i],'supply path');});
  }
  check(nodes.every(n=>n.owner!==0||!n.supplied),'neutral supply');
 }
 return {roundId,startsAt,endsAt,blockTimestamp,rosterVersion:big(raw.rosterVersion),...list,nodes,funds,scores,incomeRates,scoreRates,blockNumber:big(block.blockNumber),loadedAt:Date.now()};
}
