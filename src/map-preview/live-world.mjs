import {NODES,ROUTES,project,validNode,neighbors} from './world.mjs';
const MAX_HP=[10,30,8];
const EMPTY=Object.freeze({owner:0,units:Object.freeze([]),supplied:false,fortified:false});

export function copyLiveBoard(nodes){
 if(!Array.isArray(nodes)||nodes.length!==13)throw new Error('Expected 13 live nodes');
 return Array.from(nodes,n=>{
  if(!n||!Number.isInteger(n.owner)||n.owner<0||n.owner>4||typeof n.supplied!=='boolean'||typeof n.fortified!=='boolean')throw new Error('Invalid live node');
  if(!Array.isArray(n.units)||n.units.length>12)throw new Error('Invalid live unit capacity');
  return {...n,units:Array.from(n.units,u=>{
   if(!u||!Number.isInteger(u.kind)||u.kind<0||u.kind>2||!Number.isInteger(u.hp)||u.hp<1||u.hp>MAX_HP[u.kind])throw new Error('Invalid live unit');
   return {kind:u.kind,hp:u.hp};
  })};
 });
}
export function displayNode(nodes,id,live=true){
 validNode(id);
 if(nodes)return nodes[id];
 if(live)return EMPTY;
 const kinds=id<4?[0,0,0,1,2]:[0,0];
 return {owner:NODES[id].faction,units:kinds.map(kind=>({kind,hp:MAX_HP[kind]})),supplied:id<4,fortified:false};
}
export function unitOffset(index){
 if(!Number.isInteger(index)||index<0||index>=12)throw new Error('Invalid unit index');
 const col=index%4,row=Math.floor(index/4);
 return {x:64+col*42,y:18+row*43+col*7};
}
export function hitLiveUnit(nodes,x,y){
 if(!nodes)return null;
 let hit=null,nearest=Infinity;
 for(const n of NODES){const p=project(n.x,n.y);
  for(let i=0;i<nodes[n.id].units.length;i++){
   const u=nodes[n.id].units[i],o=unitOffset(i),ux=p.x+o.x,uy=p.y+o.y,w=u.kind===1?48:29;
   if(x<ux-w/2||x>ux+w/2||y<uy-36||y>uy+6)continue;
   const d=Math.hypot(x-ux,(y-uy+14)*.5);
   if(d<nearest){nearest=d;hit={node:n.id,unit:i};}
  }
 }
 return hit;
}
export function boxUnits(nodes,rect,team){
 const empty={source:null,units:[],mixed:false,truncated:false};
 if(!nodes||!Number.isInteger(team)||team<1||team>4)return empty;
 const x1=Math.min(rect.x1,rect.x2),x2=Math.max(rect.x1,rect.x2),y1=Math.min(rect.y1,rect.y2),y2=Math.max(rect.y1,rect.y2);
 const matches=[];
 for(const n of NODES){if(nodes[n.id].owner!==team)continue;const p=project(n.x,n.y),units=[];
  for(let i=0;i<nodes[n.id].units.length;i++){const o=unitOffset(i);if(p.x+o.x>=x1&&p.x+o.x<=x2&&p.y+o.y-14>=y1&&p.y+o.y-14<=y2)units.push(i);}
  if(units.length)matches.push({source:n.id,units});
 }
 if(matches.length>1)return {...empty,mixed:true};
 if(!matches.length)return empty;
 return {source:matches[0].source,units:matches[0].units.slice(0,6),mixed:false,truncated:matches[0].units.length>6};
}
export function roadPoint(from,to,progress){
 const r=ROUTES.find(r=>r.from===from&&r.to===to||r.from===to&&r.to===from);
 if(!r)return null;
 const points=(r.from===from?r.points:[...r.points].reverse()).map(p=>project(p.x,p.y));
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
 let remaining=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,progress));
 for(let i=0;i<lengths.length;i++){
  if(remaining<=lengths[i]||i===lengths.length-1){const t=lengths[i]?remaining/lengths[i]:0;return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}
  remaining-=lengths[i];
 }
 return points.at(-1);
}
export function liveTarget(nodes,from,to,team){
 validNode(from);validNode(to);
 return !!nodes&&team>=1&&team<=4&&nodes[from].owner===team&&neighbors(from).includes(to)&&(NODES[to].type!=='base'||nodes[to].owner===team);
}
