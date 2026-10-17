// Deterministic Pixel RTS rules. Time and income are whole seconds, just like the contract.
const frozenRecords = values => Object.freeze(values.map(value => Object.freeze(value)));
export const DISTRICTS = frozenRecords([
  {name:'外滩',tag:'江岸天际线',rate:1,type:'base'}, {name:'陆家嘴',tag:'金融高地',rate:1,type:'district'},
  {name:'南京路',tag:'霓虹商街',rate:2,type:'mine'}, {name:'静安寺',tag:'古寺光影',rate:1,type:'district'},
  {name:'人民广场',tag:'城市心脏',rate:3,type:'energy'}, {name:'豫园',tag:'海派花园',rate:1,type:'district'},
  {name:'徐家汇',tag:'交汇枢纽',rate:2,type:'mine'}, {name:'新天地',tag:'石库门里',rate:1,type:'district'},
  {name:'北外滩',tag:'未来港湾',rate:1,type:'base'},
]);
export const TEAMS = frozenRecords([
  {name:'未选阵营',color:'#9293a5'}, {name:'翡翠联盟',color:'#6fffc0'}, {name:'赤焰军团',color:'#ff777e'},
]);
export const UNITS = frozenRecords([
  {name:'步兵',cost:20,power:18,cooldown:2,role:'infantry'},
  {name:'坦克',cost:50,power:50,cooldown:5,role:'tank'},
  {name:'工程师',cost:35,power:35,cooldown:3,role:'engineer'},
]);
export const ABILITIES = UNITS;
export function parseDeploymentParams(params) {
  if (!params.has('contract')) return null;
  const address = params.get('contract');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)) throw new Error('分享链接的合约地址无效');
  const start = params.get('start') ?? '0';
  if (!/^\d{1,20}$/.test(start)) throw new Error('分享链接的部署区块无效');
  return {address,blockNumber:BigInt(start)};
}
export function shortAddress(value) { return value.length > 14 ? `${value.slice(0,6)}…${value.slice(-4)}` : value; }
export function winner(scores) { return scores[0]>scores[1]?1:scores[0]<scores[1]?2:3; }
export function estimatedChainTime(snapshot,nowMs=Date.now()) {
  return snapshot.chainTime + Math.max(0,Math.floor((nowMs-snapshot.loadedAt)/1000));
}
export function remainingSeconds(snapshot,nowMs=Date.now()) { return Math.max(0,snapshot.endsAt-estimatedChainTime(snapshot,nowMs)); }
const validDistrict = district => Number.isInteger(district)&&district>=0&&district<9;
export function adjacent(a,b) {
  return validDistrict(a)&&validDistrict(b)&&Math.abs(Math.floor(a/3)-Math.floor(b/3))+Math.abs(a%3-b%3)===1;
}
export function canReach(owners,team,district) {
  if (!validDistrict(district)||(team!==1&&team!==2)) return false;
  return owners[district]===team || !owners.includes(team) || owners.some((owner,index)=>owner===team&&adjacent(index,district));
}
const teamRate = (owners,team) => owners.reduce((sum,owner,index)=>sum+(owner===team?DISTRICTS[index].rate:0),0);
const projectionElapsed = (snapshot,nowMs) => Math.max(0,Math.min(snapshot.endsAt,estimatedChainTime(snapshot,nowMs))-Math.min(snapshot.endsAt,snapshot.chainTime));
export function projectedScores(snapshot,nowMs=Date.now()) {
  const elapsed=projectionElapsed(snapshot,nowMs);
  return snapshot.scores.map((score,index)=>score+elapsed*teamRate(snapshot.owners,index+1));
}
export function projectedPoints(snapshot,nowMs=Date.now()) {
  return snapshot.viewerTeam ? Math.min(200,snapshot.points+projectionElapsed(snapshot,nowMs)*snapshot.income) : 100;
}
export function totals(snapshot) {
  return {scores:[...snapshot.scores],actions:snapshot.actions.reduce((sum,n)=>sum+n,0),
    players:snapshot.entrants.reduce((sum,n)=>sum+n,0),owned:[1,2].map(team=>snapshot.owners.filter(owner=>owner===team).length)};
}
export function previewDispatch(snapshot,district,team,unit) {
  const squad=UNITS[unit],beforeOwner=snapshot.owners[district]??0,beforeDefense=snapshot.defense[district]??0;
  const result={valid:false,reason:'',afterOwner:beforeOwner,afterDefense:beforeDefense,cost:squad?.cost??0,capture:false};
  const reject=reason=>({...result,reason});
  if (!snapshot.roundId) return reject('No round');
  if (snapshot.chainTime<snapshot.startsAt) return reject('Round not started');
  if (snapshot.chainTime>=snapshot.endsAt) return reject('Round ended');
  if (!validDistrict(district)) return reject('Invalid district');
  if (team!==1&&team!==2) return reject('Invalid team');
  if (!Number.isInteger(unit)||!squad) return reject('Invalid unit');
  if (snapshot.viewerTeam&&snapshot.viewerTeam!==team) return reject('Team locked');
  if (snapshot.chainTime<snapshot.nextActionAt) return reject('Cooldown active');
  if (!canReach(snapshot.owners,team,district)) return reject('Unreachable');
  if (unit===2&&beforeOwner!==0&&beforeOwner!==team) return reject('Engineer cannot attack enemy');
  if (beforeOwner===team&&beforeDefense===100) return reject('No effect');
  if (snapshot.points<squad.cost) return reject('Insufficient points');
  if (beforeOwner===team) result.afterDefense=Math.min(100,beforeDefense+squad.power);
  else if (unit===2) {result.afterOwner=team;result.afterDefense=30;}
  else if (squad.power>=beforeDefense) {result.afterOwner=team;result.afterDefense=Math.max(10,squad.power-beforeDefense);}
  else result.afterDefense=beforeDefense-squad.power;
  return {...result,valid:true,capture:beforeOwner!==team&&result.afterOwner===team};
}
const currentSecond = () => Math.floor(Date.now()/1000);
function validTime(now) {
  if (!Number.isSafeInteger(now)||now<0) throw new Error('Time must be a nonnegative whole second');
  return now;
}
export function createBattlePractice(nowSec=currentSecond()) {
  const startsAt=validTime(nowSec),endsAt=startsAt+180;
  const nodes=DISTRICTS.map((_,index)=>({owner:index===0?1:index===8?2:0,defense:index===0||index===8?60:20,since:startsAt,accrued:[0,0],actions:0,entrants:0}));
  const player=()=>({team:0,nextActionAt:0,points:100,lastAt:0,creditedTeamYield:0});
  const human=player(),bot=player();let lastMutation=startsAt;
  const clamp=now=>Math.max(startsAt,Math.min(now,endsAt));
  function scoresAt(now) {
    const scores=[0,0],until=clamp(now);
    nodes.forEach((node,index)=>{scores[0]+=node.accrued[0];scores[1]+=node.accrued[1];if(node.owner)scores[node.owner-1]+=(until-node.since)*DISTRICTS[index].rate;});
    return scores;
  }
  function pointsAt(actor,now,scores) {
    return actor.team ? Math.min(200,actor.points+3*(clamp(now)-actor.lastAt)+scores[actor.team-1]-actor.creditedTeamYield) : 100;
  }
  function snapshotFor(actor,now) {
    validTime(now);if(now<lastMutation) throw new Error('Time cannot precede the latest action');
    const scores=scoresAt(now),owners=nodes.map(node=>node.owner);
    return {roundId:1n,startsAt,endsAt,owners,defense:nodes.map(node=>node.defense),actions:nodes.map(node=>node.actions),entrants:nodes.map(node=>node.entrants),
      scores,points:pointsAt(actor,now,scores),income:actor.team&&now<endsAt?3+teamRate(owners,actor.team):0,
      viewerTeam:actor.team,nextActionAt:actor.nextActionAt,chainTime:now,blockNumber:0n,loadedAt:now*1000};
  }
  function dispatch(actor,district,team,unit,now) {
    const snapshot=snapshotFor(actor,now),preview=previewDispatch(snapshot,district,team,unit);
    if(!preview.valid)throw new Error(preview.reason);
    const node=nodes[district],beforeOwner=node.owner,beforeDefense=node.defense;
    // Checkpoint the player's old income before changing the map. A capture has no retroactive yield.
    const pointsAfter=Math.min(200,snapshot.points-preview.cost+(preview.capture?20:0));
    if(!actor.team)node.entrants++;
    actor.team=team;actor.points=pointsAfter;actor.lastAt=now;actor.creditedTeamYield=snapshot.scores[team-1];actor.nextActionAt=now+UNITS[unit].cooldown;
    if(preview.afterOwner!==beforeOwner){
      if(beforeOwner)node.accrued[beforeOwner-1]+=(now-node.since)*DISTRICTS[district].rate;
      node.since=now;node.owner=preview.afterOwner;
    }
    node.defense=preview.afterDefense;node.actions++;lastMutation=now;
    return {roundId:1n,district,team,unit,beforeOwner,afterOwner:node.owner,beforeDefense,afterDefense:node.defense,spent:preview.cost,pointsAfter};
  }
  return {
    snapshot(now=currentSecond()) {return snapshotFor(human,now);},
    cast(district,team,unit,now=currentSecond()) {return dispatch(human,district,team,unit,now);},
    rival(now=currentSecond()) {
      validTime(now);
      if(!human.team||now<lastMutation||now<startsAt||now>=endsAt||now<bot.nextActionAt)return null;
      const team=3-human.team,snapshot=snapshotFor(bot,now);
      // Stable target ranking: contest opponents, then expand, then reinforce. High-yield nodes win ties.
      const targets=nodes.map((node,district)=>({district,priority:(node.owner===team?0:node.owner===0?10:20)+DISTRICTS[district].rate}))
        .sort((a,b)=>b.priority-a.priority||a.district-b.district);
      for(const {district} of targets){
        const node=nodes[district];
        const preference=node.owner===0?[2,1,0]:node.owner===team?[2,0,1]:node.defense<=18?[0,1]:[1,0];
        for(const unit of preference)if(previewDispatch(snapshot,district,team,unit).valid)return dispatch(bot,district,team,unit,now);
      }
      return null;
    },
  };
}
