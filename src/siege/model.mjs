// Deterministic specification/preview model; never a fallback for contract reads or writes.
import {NODES,ROUND_SECONDS,UNIT_STATS} from './config.mjs';
import {neighbors,rates} from './supply.mjs';
import {resolveBattle} from './combat.mjs';
import {createLobby,configureRoster} from './roster.mjs';

const clone = value => structuredClone(value);
const integer = (value,min,max,label) => { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}`); };
const uint = (value,label) => integer(value,0,Number.MAX_SAFE_INTEGER,label);
function validTime(state,now) {
  uint(now,'time');
  if (now < state.startsAt || state.checkpoints.some(checkpoint => now < checkpoint.at)) throw new Error('Time precedes checkpoint');
}
function validateState(state) {
  if (!state || !Array.isArray(state.nodes) || state.nodes.length !== 13 || !Array.isArray(state.checkpoints) || state.checkpoints.length !== 4) throw new Error('Invalid round state');
  integer(state.roundId,1,Number.MAX_SAFE_INTEGER,'round id');
  uint(state.startsAt,'start time');uint(state.endsAt,'end time');
  if(state.endsAt-state.startsAt!==ROUND_SECONDS)throw new Error('Invalid round duration');
  for(const node of state.nodes) {
    integer(node.owner,0,4,'owner');integer(node.version,0,0xffffffff,'node version');uint(node.cooldownUntil,'cooldown');
    if(typeof node.fortified!=='boolean' || !Array.isArray(node.units) || node.units.length>12)throw new Error('Invalid node');
    for(const unit of node.units){if(!unit)throw new Error('Invalid unit');integer(unit.kind,0,2,'unit kind');integer(unit.hp,1,UNIT_STATS[unit.kind].hp,'unit hp');}
  }
  for(const point of state.checkpoints) { integer(point.at,state.startsAt,state.endsAt,'checkpoint time');integer(point.funds,0,200,'funds');uint(point.score,'score'); }
}
function settle(state,now) {
  const at=Math.min(now,state.endsAt),owners=state.nodes.map(node=>node.owner);
  state.checkpoints=state.checkpoints.map((point,index)=>{const rate=rates(owners,index+1),elapsed=at-point.at;return {at,funds:Math.min(200,point.funds+rate.income*elapsed),score:point.score+rate.score*elapsed};});
}
export function createRound({roundId,rosterVersion,seatsPerFaction,players,teams,now}) {
  integer(roundId,1,Number.MAX_SAFE_INTEGER,'round id');integer(rosterVersion,1,Number.MAX_SAFE_INTEGER,'roster version');integer(now,0,Number.MAX_SAFE_INTEGER-ROUND_SECONDS,'time');
  const lobby=configureRoster(createLobby(players?.[0],seatsPerFaction),{actor:players?.[0],expectedVersion:0,players,teams,seatsPerFaction,active:false});
  return {roundId,startsAt:now,endsAt:now+ROUND_SECONDS,rosterVersion,seatsPerFaction,players:lobby.players,teams:lobby.teams,
    nodes:NODES.map(node=>({owner:node.baseTeam,version:0,cooldownUntil:0,fortified:false,units:(node.kind==='base'?[0,0,0,1,2]:[0,0]).map(kind=>({kind,hp:UNIT_STATS[kind].hp}))})),
    checkpoints:Array.from({length:4},()=>({at:now,funds:100,score:0}))};
}
export function snapshot(state,now) {
  validateState(state);validTime(state,now);const current=clone(state);settle(current,now);const factionRates=[1,2,3,4].map(team=>rates(current.nodes.map(node=>node.owner),team));
  return {roundId:current.roundId,startsAt:current.startsAt,endsAt:current.endsAt,blockTimestamp:now,rosterVersion:current.rosterVersion,seatsPerFaction:current.seatsPerFaction,
    players:current.players,teams:current.teams,nodes:current.nodes.map((node,index)=>({...node,supplied:node.owner>0 && factionRates[node.owner-1].connected[index]})),
    funds:current.checkpoints.map(point=>point.funds),scores:current.checkpoints.map(point=>point.score),incomeRates:factionRates.map(rate=>rate.income),scoreRates:factionRates.map(rate=>rate.score)};
}
function selection(units,indexes,max) {
  if(!Array.isArray(indexes) || indexes.length<1 || indexes.length>max)throw new Error('Invalid unit index selection');
  let previous=-1;
  for(const index of indexes){integer(index,0,units.length-1,'unit index');if(index<=previous)throw new Error('Unit indexes must strictly increase');previous=index;}
  return indexes.map(index=>units[index]);
}
function bump(node) {if(node.version===0xffffffff)throw new Error('Node version overflow');node.version++;}
function spend(state,team,amount) {if(state.checkpoints[team-1].funds<amount)throw new Error('Insufficient funds');state.checkpoints[team-1].funds-=amount;}
export function applyOrder(state,order,now) {
  validateState(state);validTime(state,now);
  if(now>=state.endsAt)throw new Error('Round ended');
  if(!order || !Number.isSafeInteger(order.expectedRoundId) || order.expectedRoundId!==state.roundId)throw new Error('Stale round id');
  if(typeof order.actor!=='string')throw new Error('Invalid actor');
  const actor=state.players.indexOf(order.actor.toLowerCase());if(actor<0)throw new Error('Actor not in roster');const team=state.teams[actor];
  if(!['recruit','dispatch','fortify','repair'].includes(order.type))throw new Error('Invalid order type');
  const from=order.type==='dispatch'?order.from:order.node;integer(from,0,12,'node');const source=state.nodes[from];
  const version=order.type==='dispatch'?order.fromVersion:order.nodeVersion;integer(version,0,0xffffffff,'node version');
  if(source.version!==version)throw new Error('Stale source node version');if(source.owner!==team)throw new Error('Source is not owned');if(now<source.cooldownUntil)throw new Error('Source cooldown active');
  // Work only on a clone. Any validation error discards settlement and all partial changes.
  const next=clone(state);settle(next,now);const node=next.nodes[from];
  if(order.type==='dispatch') {
    integer(order.to,0,12,'destination node');integer(order.toVersion,0,0xffffffff,'destination version');const target=next.nodes[order.to];
    if(target.version!==order.toVersion)throw new Error('Stale destination node version');
    if(!neighbors(from).includes(order.to))throw new Error('Destination not adjacent');
    if(NODES[order.to].kind==='base' && target.owner!==team)throw new Error('Enemy base cannot be attacked');
    const deployed=selection(node.units,order.unitIndexes,6),chosen=new Set(order.unitIndexes),remaining=node.units.filter((_,index)=>!chosen.has(index));
    if(target.owner===team){if(target.units.length+deployed.length>12)throw new Error('Friendly capacity exceeded');node.units=remaining;target.units.push(...deployed);}
    else {
      const result=resolveBattle({attackers:deployed,defenders:target.units,city:NODES[order.to].city,fortified:target.fortified});
      node.units=remaining;target.units=result.defenders;target.fortified=false;
      if(result.captured){target.owner=team;target.units=result.attackers;}else node.units.push(...result.attackers);
    }
    bump(target);
  } else {
    const connected=rates(next.nodes.map(n=>n.owner),team).connected;
    if(order.type==='recruit') {
      if(!['base','factory'].includes(NODES[from].kind))throw new Error('Node is not a production point');
      if(!connected[from])throw new Error('No supply connection');integer(order.kind,0,2,'kind');integer(order.count,1,6,'count');
      if(NODES[from].kind==='factory' && order.kind===1)throw new Error('Factory cannot recruit tanks');if(node.units.length+order.count>12)throw new Error('Node capacity exceeded');
      spend(next,team,UNIT_STATS[order.kind].cost*order.count);for(let count=0;count<order.count;count++)node.units.push({kind:order.kind,hp:UNIT_STATS[order.kind].hp});
    } else {
      if(!connected[from])throw new Error('No supply connection');if(!node.units.some(unit=>unit.kind===2))throw new Error('Engineer required');
      if(order.type==='fortify') {if(NODES[from].kind==='base')throw new Error('Cannot fortify a base');if(node.fortified)throw new Error('Already fortified');spend(next,team,20);node.fortified=true;}
      else {const selected=selection(node.units,order.unitIndexes,3);if(selected.some(unit=>unit.hp>=UNIT_STATS[unit.kind].hp))throw new Error('Repair requires wounded units');spend(next,team,15);for(const unit of selected)unit.hp=Math.min(UNIT_STATS[unit.kind].hp,unit.hp+10);}
    }
  }
  bump(node);node.cooldownUntil=now+3;return next;
}
