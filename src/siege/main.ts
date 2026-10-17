import './style.css';
import {MapScene} from '../map-preview/scene';
import {bindPageLifecycle} from '../map-preview/lifecycle.mjs';
import {FACTIONS,NODES as MAP_NODES} from '../map-preview/world.mjs';
import {UNIT_STATS,HOME_BY_TEAM} from './config.mjs';
import {neighbors} from './supply.mjs';
import {createWalletRegistry,type Provider} from '../wallets';
import {createSiegeController,resolveDeployment,parseDeployment,urlForDeployment,describeError,EXPLORER,CHAIN_ID,type Progress} from './chain';
import {captureSelection,reconcileSelection,actionOrder,previewDispatch,parseRoster,access,remainingSeconds,acceptRead,createDeploymentSelection,acceptReport,applySnapshot,roomControls} from './ui.mjs';
import type {ActionName,World,Deployment,Confirmed} from './types';
import type {Address,Hex} from 'viem';
const app=document.querySelector<HTMLDivElement>('#siege-app')!;
// This template contains only trusted local literals. All external strings use textContent.
app.innerHTML=`<header class="command-header"><a class="wordmark" href="./siege.html"><span class="brand-mark">断</span><span>断线争城<small>FOUR FACTIONS / LIVE OPERATIONS</small></span></a><div class="network"><i></i> MONAD TESTNET <span>10143</span></div><nav><a href="./map.html">地图预览</a><a href="./index.html">旧版入口 ↗</a></nav></header>
<div class="match-bar"><div><span class="eyebrow">四方边境 · 300 秒据点攻防</span><h1>守住连接，争夺战场。</h1></div><div class="round-clock"><span id="round-label">等待房间</span><strong id="clock">05:00</strong><small>剩余时间 · 本地估算</small></div><div class="chain-read"><strong id="chain-status">正在查找合约…</strong><span id="block-label">尚无链上快照</span><button id="refresh">刷新快照</button></div></div>
<section id="rankings" class="rankings" aria-label="四方排行榜"></section>
<main class="command-layout"><section class="battlefield" aria-label="实时等距战场"><div class="field-top"><span class="eyebrow">TACTICAL FIELD / 013</span><span id="board-state">等待已验证快照 · 无示例驻军</span></div><canvas id="battle-canvas" tabindex="0" aria-label="战场：点击设施与部队，右键相邻目标；Shift拖动框选；WASD平移"></canvas><div class="field-key">拖动平移 · 滚轮缩放 · Shift 框选 · 右键目标</div><div class="view-controls"><button id="zoom-out" aria-label="缩小">−</button><output id="zoom-value">50%</output><button id="zoom-in" aria-label="放大">＋</button><button id="reset-view">全图</button><button id="home-view">⌂ 基地</button></div><div class="field-bottom"><span id="asset-status">加载像素设施…</span><span>确认后回放 · 每次行动均为链上交易</span></div></section>
<aside class="operations-panel"><section class="panel-section"><div class="section-heading"><span>指挥终端</span><span class="tiny-label">COMMANDER</span></div><label for="wallet-select">浏览器钱包</label><div class="inline"><select id="wallet-select"><option value="">选择钱包</option></select><button id="connect">连接</button></div><label for="account-select">实际签名地址</label><select id="account-select"><option value="">未连接 · 旁观模式</option></select><p id="wallet-status" class="muted-note">无需钱包即可读取已部署房间。</p></section>
<section class="panel-section"><canvas id="minimap" tabindex="0" aria-label="小地图：点击定位，Enter全图"></canvas><div class="minimap-caption">13 个设施 / 20 条道路 <span>点击定位 ↗</span></div></section>
<section class="panel-section selection-panel"><div class="section-heading"><label for="source-select">01 / 来源设施</label><span id="node-version" class="tiny-label">VERSION —</span></div><select id="source-select"></select><div class="selected-title"><strong id="ownership">等待链上状态</strong><span id="supply-label">—</span></div><p id="node-details" class="muted-note"></p><div class="section-heading"><span>02 / 选择实际部队</span><span id="unit-count" class="tiny-label">0 / 6 已选</span></div><div id="unit-list" class="unit-list"></div><button id="clear-selection" class="subtle">清空单位与目标</button><div class="section-heading route-heading"><span>03 / 相邻目的地</span></div><div id="target-list" class="target-list"></div><p id="preview" class="preview">选择本方来源、1至6个单位与相邻目标。</p><p id="selection-notice" class="warning" role="status"></p><button id="dispatch" class="primary full" data-order="dispatch">复核调遣 →</button><p id="action-reason" class="muted-note"></p></section>
<section class="panel-section"><div class="section-heading"><span>后勤与工程</span><span class="tiny-label">SUPPORT</span></div><div class="inline"><select id="recruit-kind" aria-label="招募兵种"><option value="0">步兵 · 20</option><option value="1">坦克 · 50</option><option value="2">工程师 · 35</option></select><input id="recruit-count" aria-label="招募数量" type="number" min="1" max="6" value="1"></div><button id="recruit" class="full" data-order="recruit">复核招募</button><div class="inline support"><button id="fortify" data-order="fortify">修筑工事 · 20</button><button id="repair" data-order="repair">修复部队 · 15</button></div><p class="muted-note">修复：上方选择1至3个残血单位，每个 +10 HP，合计15军费。工程须有工程师与补给；工事限非基地。</p></section></aside></main>
<div class="lower-layout"><section class="panel-section lobby-panel"><div class="section-heading"><h2>房间名单与准备</h2><span id="roster-version" class="tiny-label">ROSTER —</span></div><p id="lobby-status" class="muted-note">房主配置四方等额名单，每个私人地址亲自发送 ready 交易。</p><div id="roster-status" class="roster-status"></div><div class="inline"><button id="ready" class="primary">我已准备 · 签名交易</button><button id="start">房主开启300秒回合</button></div><details id="roster-editor"><summary>房主管理名单</summary><div class="inline roster-toolbar"><label for="seats">每方席位</label><select id="seats"><option>1</option><option selected>2</option><option>3</option><option>4</option></select><button id="load-roster">载入当前名单</button></div><div id="roster-fields" class="roster-fields"></div><button id="configure" class="full">复核名单配置 · 签名交易</button><p class="muted-note">每行一个地址；四方均须填满。修改名单清空所有 ready，活动回合中无法修改。</p></details></section>
<section class="panel-section"><div class="section-heading"><h2>链上回执</h2><span class="tiny-label">VERIFIED ORDERS</span></div><p id="tx-status" role="status" aria-live="polite">尚无本机交易。</p><a id="tx-link" target="_blank" rel="noreferrer" hidden>查看交易 ↗</a><div id="replacement-panel" hidden><label for="replacement-hash">钱包最终交易哈希（取消/加速后可填）</label><input id="replacement-hash" placeholder="可选：0x…" autocomplete="off"></div><button id="recheck" class="full" hidden>重新核验待处理交易</button><p id="recent-status" class="muted-note">近期已核验战报 · 最近100区块，最多6笔，并非完整历史</p><ol id="reports" class="reports"></ol></section>
<section id="deployment-panel" class="panel-section"><div class="section-heading"><h2>房间与部署</h2><span class="tiny-label">CONTRACT</span></div><p id="deployment-status">尚无新版合约地址；等待部署或读取已有房间。</p><a id="contract-link" target="_blank" rel="noreferrer" hidden></a><button id="copy-link" class="full" disabled>复制已验证房间链接</button><details id="deployment-tools" open><summary>部署、恢复或打开房间</summary><button id="deploy" class="full">部署 SiegeCanvas · 钱包签名</button><label for="recover-hash">成功部署的交易哈希</label><input id="recover-hash" placeholder="0x…" autocomplete="off"><button id="recover" class="full">核验并恢复部署</button><label for="contract-address">已有合约地址</label><input id="contract-address" placeholder="0x…" autocomplete="off"><label for="contract-block">部署区块</label><input id="contract-block" inputmode="numeric" placeholder="部署所在区块"><button id="open-room" class="full">只读打开并核验</button><p id="room-recovery-note" class="muted-note" hidden>待处理订单保留原交易锁。若订单属于另一房间，请在上方输入原合约地址和部署区块，只读打开原房间后重新核验；切换房间不会清除订单或发送交易。</p></details></section></div>
<footer>BLITZCANVAS / FOUR-FACTION SIEGE <span>军费为局内共享数值 · gas 使用测试 MON</span></footer>
<dialog id="review-dialog"><form method="dialog"><div class="section-heading"><h2 id="review-title">复核交易</h2><button value="cancel" aria-label="关闭">×</button></div><pre id="review-body"></pre><p>最终签名在所选钱包中完成。交易确认前，地图兵力与归属保持链上快照。</p><div class="inline"><button value="cancel">返回调整</button><button id="confirm-order" type="button" class="primary">确认并请求钱包签名</button></div></form></dialog>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
const text=(id:string,value:string)=>{const node=el(id);if(node.textContent!==value)node.textContent=value;};
const disabled=(id:string,value:boolean)=>{el<HTMLButtonElement>(id).disabled=value;};
const short=(s:string)=>s.slice(0,6)+'…'+s.slice(-4);
const same=(a:string|undefined|null,b:string|undefined|null)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase();
const actions:Record<string,string>={configureRoster:'配置名单',ready:'确认准备',startRound:'开启回合',dispatch:'调遣',recruit:'招募',fortify:'修筑工事',repair:'修复部队',deploy:'部署新合约'};
let world:World|null=null,deployment:Deployment|null=null,verified=false,stale=true,busy=false,suspended=false,disposed=false,epoch=0,reading=false,recentReading=false,lastRecent=0;
const deploymentSelection=createDeploymentSelection();
let selection=captureSelection(null,0),unitKey='',routeKey='',rosterKey='',walletKey='',accountKey='';
let review:{functionName:ActionName|'deploy',args:any[],team?:number,summary:string,account:string,epoch:number}|null=null;
let scene:MapScene;
let storage:Storage|undefined;try{storage=window.localStorage;}catch{/* Controller can keep in-memory pending hashes. */}
const controller=createSiegeController({storage,onWalletChange:()=>{
 epoch++;selection=captureSelection(world?.snapshot??null,selection.source);closeReview();text('wallet-status',controller.account()?`实际签名地址：${controller.account()}`:'钱包会话变化，请连接并明确选择当前签名地址。');render();
}});
const registry=createWalletRegistry(window as typeof window&{ethereum?:Provider});
const context=()=>({snapshot:world?.snapshot??null,account:controller.account(),verified,stale,busy,pending:!!controller.pending()});
const team=()=>access(context()).team;
const bindings=new AbortController();
function on(id:string,event:string,fn:EventListener){el(id).addEventListener(event,fn,{signal:bindings.signal});}
function closeReview(){review=null;const d=el<HTMLDialogElement>('review-dialog');if(d.open)d.close();}
function notice(message:string){text('selection-notice',message);}
function fail(error:unknown){text('tx-status',describeError(error));}
function select(source:number,unit?:number,target=false){
 try{
  const s=world?.snapshot??null;
  if(target){selection=captureSelection(s,selection.source,selection.units,source);}
  else if(unit!==undefined){const current=source===selection.source?selection.units:[];selection=captureSelection(s,source,current.includes(unit)?current.filter(i=>i!==unit):[...current,unit],source===selection.source?selection.target:null);}
  else selection=captureSelection(s,source);
  closeReview();notice('');render();
 }catch(error){notice(describeError(error));}
}
function options(){return {kind:Number(el<HTMLSelectElement>('recruit-kind').value),count:Number(el<HTMLInputElement>('recruit-count').value)};}
function order(type:ActionName){return actionOrder(context(),selection,type,options());}
function renderWallets(){
 const list=registry.list(),key=list.map(w=>w.id+':'+w.name).join('|');
 if(key!==walletKey){walletKey=key;const select=el<HTMLSelectElement>('wallet-select');select.replaceChildren(new Option(list.length?'选择钱包':'未检测到钱包',''),...list.map(w=>new Option(w.name,w.id)));}
 el<HTMLSelectElement>('wallet-select').value=registry.selectedId()??'';
 const accounts=controller.accounts(),k=accounts.join('|');
 if(k!==accountKey){accountKey=k;el<HTMLSelectElement>('account-select').replaceChildren(new Option(accounts.length?'请选择实际签名地址':'未连接 · 旁观模式',''),...accounts.map(a=>new Option(a,a)));}
 el<HTMLSelectElement>('account-select').value=controller.account()??'';
}
function render(){
 if(disposed)return;renderWallets();const s=world?.snapshot??null,p=access(context()),controls=roomControls({busy,pending:controller.pending()}),locked=!controls.write;
 const seconds=remainingSeconds(s),active=!!s?.roundId&&seconds!==0;
 text('clock',seconds===null?'—:—':`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
 text('round-label',s?.roundId?`ROUND ${s.roundId}`:'等待开局');
 text('block-label',s?`区块 #${s.blockNumber} · 链上时间 ${new Date(s.blockTimestamp*1000).toLocaleTimeString()}`:'尚无链上快照');
 const fresh=verified&&!stale&&!!s&&Date.now()-s.loadedAt<=15000;
 text('chain-status',fresh?'● 快照已核验':s?'◌ 只读 · 快照过期':'◌ 等待有效合约');
 text('board-state',fresh?(s!.roundId?'真实链上驻军 · 四方交战':'尚未开局 · 驻军为空'):s?'旧快照仅供检视 · 禁止下令':'等待已验证快照 · 无示例驻军');
 for(const f of FACTIONS){const i=f.id-1;const count=s?.players.filter((_,n)=>s.teams[n]===f.id).length??0;const score=s?.scores[i]??0;const rank=s?1+s.scores.filter(v=>v>score).length:0;
  text(`rank-${f.id}`,s?`#${rank}`:'—');text(`score-${f.id}`,s?String(score):'—');text(`economy-${f.id}`,s?`军费 ${s.funds[i]} / 200 · +${s.incomeRates[i]}/秒`:'军费 — · 收入 —');text(`tower-${f.id}`,s?`连通塔 ${s.scoreRates[i]} · ${count} 席`:'连通塔 — · 席位 —');}
 const n=s?.nodes[selection.source],f=FACTIONS.find(f=>f.id===n?.owner);
 el<HTMLSelectElement>('source-select').value=String(selection.source);text('ownership',f?`${f.shape} ${f.name}`:n?'◇ 中立设施':'等待链上状态');el('ownership').style.color=f?.color??'#d6cfb0';
 text('supply-label',n?(n.owner?(n.supplied?'补给连通':'补给中断'):'中立'):'—');text('node-version',n?`VERSION ${n.version}`:'VERSION —');
 text('node-details',n?`${MAP_NODES[selection.source].name} · ${n.units.length}/12 驻军${n.fortified?' · 有工事':''}${n.cooldownUntil>s!.blockTimestamp?` · 冷却 ${n.cooldownUntil-s!.blockTimestamp} 秒（链上）`:''}`:'无有效快照，不生成示例兵力。');
 text('unit-count',`${selection.units.length} / 6 已选`);
 const key=`${selection.source}:${n?.version}:${n?.units.map(u=>u.kind+','+u.hp).join(';')}`;
 if(key!==unitKey){unitKey=key;const list=el('unit-list');list.replaceChildren();n?.units.forEach((u,i)=>{const b=document.createElement('button');b.className='unit-button';b.dataset.unit=String(i);const icon=document.createElement('span');icon.className='unit-icon';icon.textContent=['♟','▰','⚒'][u.kind];const label=document.createElement('span');label.textContent=`#${i+1} ${UNIT_STATS[u.kind].name}`;const hp=document.createElement('small');hp.textContent=`${u.hp} / ${UNIT_STATS[u.kind].hp} HP`;label.append(hp);b.append(icon,label);list.append(b);});}
 for(const button of el('unit-list').querySelectorAll<HTMLButtonElement>('button')){const chosen=selection.units.includes(Number(button.dataset.unit));button.setAttribute('aria-pressed',String(chosen));button.classList.toggle('is-selected',chosen);button.disabled=!p.allowed||n?.owner!==p.team||!chosen&&selection.units.length>=6;}
 if(routeKey!==String(selection.source)){routeKey=String(selection.source);el('target-list').replaceChildren(...neighbors(selection.source).map(id=>{const b=document.createElement('button');b.dataset.target=String(id);b.textContent=MAP_NODES[id].name;b.className='target-button';return b;}));}
 for(const b of el('target-list').querySelectorAll<HTMLButtonElement>('button')){const id=Number(b.dataset.target);b.disabled=!p.allowed||n?.owner!==p.team||id<4&&s?.nodes[id].owner!==p.team;b.classList.toggle('is-selected',selection.target===id);b.setAttribute('aria-pressed',String(selection.target===id));b.title=id<4&&s?.nodes[id].owner!==p.team?'敌方基地不可进攻':'选择相邻目的地';}
 let preview='选择本方来源、1至6个单位与相邻目标。';
 if(s&&selection.target!==null&&selection.units.length){try{const result=previewDispatch(s,selection,p.team);preview=`${MAP_NODES[selection.source].name} → ${MAP_NODES[selection.target].name}\n派出 ${selection.units.length} · 后方留守 ${result.remaining}\n${result.friendly?'友军合并，不发生战斗':`预计 ${result.pulses} 轮：我方存活 ${result.attackers.length}，守方存活 ${result.defenders.length}；${result.captured?'占领目标':result.returned?'残部返回，保留残血':'原旗帜保留'}`}\n我方预期 HP：${result.attackers.map(u=>UNIT_STATS[u.kind].name+' '+u.hp).join('、')||'无幸存者'}${result.remaining===0?'\n⚠ 来源派空，仍保留所有权；更易被夺取。':''}${result.atRisk.length?'\n⚠ 若来源失守，将断供：'+result.atRisk.map(id=>MAP_NODES[id].name).join('、'):''}\n预览依据当前快照，实际结果以交易执行为准。`;}catch(error){preview=describeError(error);}}
 text('preview',preview);text('action-reason',p.reason||'共享部队与军费；队友操作会使旧选择失效。');
 for(const type of ['dispatch','recruit','fortify','repair'] as ActionName[]){try{order(type);disabled(type,false);el(type).title='复核后发起真实交易';}catch(error){disabled(type,true);el(type).title=describeError(error);}}
 disabled('clear-selection',!selection.units.length&&selection.target===null);
 const lobby=world?.lobby,actor=controller.account(),host=same(actor,lobby?.host),readyIndex=lobby?.players.findIndex(a=>same(a,actor))??-1;
 const canLobby=fresh&&!locked&&!!actor&&!active;
 disabled('configure',!canLobby||!host);disabled('ready',!canLobby||readyIndex<0||!!lobby?.readyFlags[readyIndex]);disabled('start',!canLobby||!host||!lobby?.players.length||!lobby.readyFlags.every(Boolean));disabled('load-roster',!lobby);
 text('roster-version',lobby?`ROSTER ${lobby.rosterVersion}`:'ROSTER —');text('lobby-status',lobby?`房主 ${lobby.host} · 每方 ${lobby.seatsPerFaction} 席 · ${lobby.readyFlags.filter(Boolean).length}/${lobby.players.length} 已准备${active?' · 回合进行中，名单锁定':''}`:'部署或打开房间后载入名单。');
 const rk=lobby?`${lobby.rosterVersion}:${lobby.players.join(',')}:${lobby.readyFlags.join(',')}`:'';
 if(rk!==rosterKey){rosterKey=rk;el('roster-status').replaceChildren(...FACTIONS.map(f=>{const group=document.createElement('div');const name=document.createElement('strong');name.textContent=f.shape+' '+f.name;name.style.color=f.color;group.append(name);lobby?.players.forEach((a,i)=>{if(lobby.teams[i]!==f.id)return;const line=document.createElement('p');line.textContent=`${lobby.readyFlags[i]?'✓ 已准备':'○ 待准备'} · ${short(a)}`;line.title=a;group.append(line);});return group;}));}
 disabled('connect',busy);disabled('wallet-select',busy);disabled('account-select',busy);disabled('deploy',locked||!actor);disabled('open-room',!controls.open);el('room-recovery-note').hidden=!controller.pending();disabled('recover',busy||!!controller.pending()&&controller.pending()?.key!=='deploy');disabled('refresh',reading);disabled('copy-link',!verified||!deployment);
 el('recheck').hidden=!controller.pending()||controller.pending()?.key==='deploy';el('replacement-panel').hidden=el('recheck').hidden;disabled('recheck',busy||!deployment);
 el('contract-link').hidden=!verified||!deployment;
 if(verified&&deployment){const a=el<HTMLAnchorElement>('contract-link');a.href=`${EXPLORER}/address/${deployment.address}`;a.textContent=deployment.address;}
 if(scene)scene.setSelection(selection);
}
function ingest(next:World){
 if(!applySnapshot(world?.snapshot??null,next.snapshot,scene,clearReports))return;
 const previous=selection;world=next;verified=true;stale=false;selection=reconcileSelection(selection,next.snapshot);
 if(selection!==previous&&(previous.units.length||previous.target!==null)){closeReview();notice('来源、目标或回合已变化，旧选择已清空；请重新选择。');}
 text('deployment-status',`已核验 SiegeCanvas · 部署区块 ${deployment!.blockNumber}`);render();
}
const reportHashes=new Set<string>();
function clearReports(){reportHashes.clear();el('reports').replaceChildren();lastRecent=0;}
const reportContext=()=>({disposed,suspended,deployment,epoch,roundId:world?.snapshot.roundId??null});
function report(proof:Confirmed,request:{deployment:Deployment|null,epoch:number,roundId:bigint|null}=reportContext()){
 if(!acceptReport(reportContext(),request,proof)||reportHashes.has(proof.hash))return;reportHashes.add(proof.hash);if(reportHashes.size>100)reportHashes.delete(reportHashes.values().next().value!);
 const e=proof.event;
 if(proof.eventName==='OrderExecuted'&&Number(e.action)===1)scene.playConfirmedOrder({hash:proof.hash,from:Number(e.from),to:Number(e.to),team:Number(e.team),returned:e.returned,count:e.deployed.length});
 const li=document.createElement('li'),a=document.createElement('a');a.href=`${EXPLORER}/tx/${proof.hash}`;a.target='_blank';a.rel='noreferrer';
 a.textContent=proof.eventName==='OrderExecuted'?`${FACTIONS[Number(e.team)-1]?.short??''} · ${['招募','调遣','修筑','修复'][Number(e.action)]} ${MAP_NODES[Number(e.from)]?.name??''}${Number(e.action)===1?' → '+MAP_NODES[Number(e.to)]?.name:''}`:`${({RosterConfigured:'名单已配置',PlayerReady:'玩家已准备',RoundStarted:'回合已开启'} as Record<string,string>)[proof.eventName]??proof.eventName}`;
 const detail=document.createElement('small');detail.textContent=`已核验${e.roundId!==undefined?' · 回合 '+e.roundId:''} · 区块 ${proof.blockNumber} · ${short(proof.hash)}`;li.append(a,detail);el('reports').prepend(li);while(el('reports').children.length>6)el('reports').lastElementChild?.remove();
}
async function refresh(){
 if(!deployment||reading||disposed||suspended)return;reading=true;render();const d=deployment,e=epoch;
 try{const next=await controller.read(d);if(!acceptRead({disposed,suspended,deployment,epoch,blockNumber:world?.snapshot.blockNumber??null},{deployment:d,epoch:e},next.snapshot.blockNumber))return;ingest(next);
  if(!recentReading&&Date.now()-lastRecent>7000){recentReading=true;lastRecent=Date.now();const request={deployment:d,epoch:e,roundId:next.snapshot.roundId};void controller.recent(d,next).then(proofs=>{proofs.forEach(proof=>report(proof,request));}).catch(()=>{if(!disposed&&!suspended&&deployment===d&&epoch===e&&world?.snapshot.roundId===request.roundId)text('recent-status','近期战报暂不可用；已核验快照仍可读取。');}).finally(()=>{recentReading=false;});}
 }catch(error){if(deployment===d&&epoch===e&&!disposed&&!suspended){stale=true;closeReview();text('deployment-status',describeError(error));}}
 finally{reading=false;render();}
}
async function activate(d:Deployment|null){
 deploymentSelection.select();epoch++;deployment=d;verified=false;world=null;stale=true;selection=captureSelection(null,0);unitKey='';rosterKey='';closeReview();scene.setState(null);clearReports();
 text('deployment-status',d?'正在核验网络、运行代码与链上快照…':'尚无新版合约；请部署或输入已有房间。');render();await refresh();
 if(verified&&deployment===d&&d)history.replaceState(null,'',urlForDeployment(d));
}
function progress(p:Progress){text('tx-status',`${({ 'awaiting-signature':'等待钱包最终签名',broadcast:'已广播，等待核验',confirmed:'回执、事件和快照已核验',unverified:'状态未核验，请勿重复发送',reverted:'交易已回退',cancelled:'交易已取消或替换'} as Record<string,string>)[p.status]}${p.message?' · '+p.message:''}`);if(p.hash){const a=el<HTMLAnchorElement>('tx-link');a.hidden=false;a.href=`${EXPLORER}/tx/${p.hash}`;a.textContent=p.hash;if(controller.pending()?.key==='deploy')el<HTMLInputElement>('recover-hash').value=p.hash;}render();}
function beginReview(functionName:ActionName|'deploy',args:any[],summary:string,teamId?:number){
 const account=controller.account();if(!account)throw Error('请先连接并明确选择签名地址');
 if(busy||controller.pending())throw Error('已有交易等待处理或核验');
 if(functionName==='deploy')deploymentSelection.select();
 el<HTMLInputElement>('replacement-hash').value='';review={functionName,args:structuredClone(args),summary,team:teamId,account,epoch};
 text('review-title',`复核：${actions[functionName]}`);text('review-body',`签名地址：${account}\n网络：Monad Testnet (${CHAIN_ID})\n合约：${deployment?.address??'新部署'}\n${summary}`);el<HTMLDialogElement>('review-dialog').showModal();
}
function plan(type:ActionName){const o=order(type);const s=world!.snapshot;let summary=`回合 ${s.roundId} · ${MAP_NODES[selection.source].name} · 版本 ${selection.sourceVersion}\n局内费用：${o.cost} 军费 · 另需测试 MON gas`;
 if(type==='dispatch')summary+='\n'+el('preview').textContent+'\n选中索引（从0起）：'+selection.units.join(', ');
 else if(type==='recruit')summary+=`\n招募 ${options().count} 个${UNIT_STATS[options().kind].name}`;
 else if(type==='repair')summary+='\n修复单位：'+selection.units.map(i=>`#${i+1}`).join('、');
 beginReview(type,o.args,summary,o.team);}
const serialize=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
async function confirm(){
 const r=review;if(!r)return;
 try{
  if(epoch!==r.epoch||!same(r.account,controller.account()))throw Error('钱包或房间已变化，请重新复核');
  if(r.functionName!=='deploy'){
   if(!world||!verified||stale||Date.now()-world.snapshot.loadedAt>15000)throw Error('快照已过期，请重新刷新');
   if(['dispatch','recruit','fortify','repair'].includes(r.functionName)){const current=order(r.functionName);if(serialize(current.args)!==serialize(r.args))throw Error('指令参数已变化，请重新复核');}
   else if(r.functionName==='startRound'){if(world.snapshot.roundId!==r.args[0]||world.lobby.rosterVersion!==r.args[1])throw Error('回合或名单已变化');}
   else if(world.lobby.rosterVersion!==r.args[0])throw Error('名单已变化，请重新复核');
  }
  closeReview();busy=true;render();
  if(r.functionName==='deploy'){deploymentSelection.select();const d=await controller.deploy(progress);await activate(d);}
  else {if(!deployment)throw Error('尚未核验部署');const request={deployment,epoch};const result=await controller.send(deployment,r.functionName,r.args,progress,r.team);if(acceptRead({...reportContext(),blockNumber:world?.snapshot.blockNumber??null},request,result.world.snapshot.blockNumber)){ingest(result.world);report(result.proof,{...request,roundId:result.world.snapshot.roundId});}}
 }catch(error){fail(error);}finally{busy=false;render();void refresh();}
}
// Stable DOM nodes keep input text, scroll and focused controls through ordinary polling.
for(const f of FACTIONS){const card=document.createElement('button');card.className='faction-card';card.dataset.base=String(f.base);card.style.setProperty('--faction',f.color);card.innerHTML=`<span class="faction-name">${f.shape} ${f.name}<small id="rank-${f.id}">—</small></span><strong id="score-${f.id}">—</strong><span class="score-caption">统治分</span><span id="economy-${f.id}">军费 — · 收入 —</span><span id="tower-${f.id}">连通塔 — · 席位 —</span>`;el('rankings').append(card);
 const label=document.createElement('label');label.textContent=f.shape+' '+f.name;label.style.color=f.color;const input=document.createElement('textarea');input.id=`roster-${f.id}`;input.rows=3;input.placeholder='每行一个私人钱包地址';input.spellcheck=false;label.append(input);el('roster-fields').append(label);}
el<HTMLSelectElement>('source-select').replaceChildren(...MAP_NODES.map(n=>new Option(`${String(n.id).padStart(2,'0')} · ${n.name}`,String(n.id))));
scene=new MapScene(el<HTMLCanvasElement>('battle-canvas'),el<HTMLCanvasElement>('minimap'),{live:true,team,onSelect:select,onCamera:c=>text('zoom-value',`${Math.round(c.zoom*100)}%`),onAssets:loaded=>text('asset-status',loaded?'像素设施已载入':'程序绘制设施'),onBoxSelect:r=>{if(r.mixed){notice('框选跨越多个来源，请分开下令。');return;}if(r.source!==null){selection=captureSelection(world?.snapshot??null,r.source,r.units);closeReview();notice(r.truncated?'已选择前6个实际单位；每次最多6个。':'');render();}}});
app.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;try{
 if(button.dataset.base!==undefined){select(Number(button.dataset.base));scene.centerOn(selection.source);}
 if(button.dataset.unit!==undefined)select(selection.source,Number(button.dataset.unit));
 if(button.dataset.target!==undefined)select(Number(button.dataset.target),undefined,true);
 if(button.dataset.order)plan(button.dataset.order as ActionName);
}catch(error){fail(error);}},{signal:bindings.signal});
on('source-select','change',()=>{select(Number(el<HTMLSelectElement>('source-select').value));scene.centerOn(selection.source);});
on('clear-selection','click',()=>select(selection.source));
on('recruit-kind','change',()=>{closeReview();render();});on('recruit-count','input',()=>{closeReview();render();});
on('zoom-in','click',()=>scene.zoom(.15));on('zoom-out','click',()=>scene.zoom(-.15));on('reset-view','click',()=>scene.reset());on('home-view','click',()=>{const id=(HOME_BY_TEAM as Record<number,number>)[team()]??0;select(id);scene.centerOn(id);});
on('minimap','keydown',e=>{if((e as KeyboardEvent).key==='Enter'){e.preventDefault();scene.reset();}});
on('refresh','click',()=>void refresh());
on('wallet-select','change',()=>{try{registry.select(el<HTMLSelectElement>('wallet-select').value);}catch(error){fail(error);}});
on('account-select','change',()=>{try{const a=el<HTMLSelectElement>('account-select').value;if(a)controller.selectAccount(a as Address);}catch(error){fail(error);}render();});
on('connect','click',()=>void (async()=>{try{controller.setProvider(registry.provider());busy=true;render();await controller.connect();text('wallet-status',controller.account()?`已连接 ${controller.account()}`:'已授权多个地址，请明确选择实际签名者。');}catch(error){fail(error);}finally{busy=false;render();}})());
const unsubscribe=registry.subscribe(()=>{try{controller.setProvider(registry.provider());}catch{controller.setProvider(null);}render();});
on('configure','click',()=>{try{const r=parseRoster(FACTIONS.map(f=>el<HTMLTextAreaElement>(`roster-${f.id}`).value),Number(el<HTMLSelectElement>('seats').value));beginReview('configureRoster',[world!.lobby.rosterVersion,r.players,r.teams,r.seatsPerFaction],`名单版本 ${world!.lobby.rosterVersion} · 每方 ${r.seatsPerFaction} 席\n${r.players.map((a,i)=>FACTIONS[r.teams[i]-1].name+'：'+a).join('\n')}\n所有旧 ready 将清空。`);}catch(error){fail(error);}});
on('load-roster','click',()=>{if(!world)return;el<HTMLSelectElement>('seats').value=String(world.lobby.seatsPerFaction);FACTIONS.forEach(f=>{el<HTMLTextAreaElement>(`roster-${f.id}`).value=world!.lobby.players.filter((_,i)=>world!.lobby.teams[i]===f.id).join('\n');});closeReview();});
on('ready','click',()=>{try{beginReview('ready',[world!.lobby.rosterVersion],`为本人确认名单版本 ${world!.lobby.rosterVersion}。`);}catch(error){fail(error);}});
on('start','click',()=>{try{beginReview('startRound',[world!.snapshot.roundId,world!.lobby.rosterVersion],`当前回合 ${world!.snapshot.roundId} · 名单版本 ${world!.lobby.rosterVersion}\n四方所有席位均已 ready，开启新的300秒回合。`);}catch(error){fail(error);}});
on('deploy','click',()=>{try{beginReview('deploy',[],'部署当前版本 SiegeCanvas；当前签名者成为房主。仅使用测试 MON 支付 gas。');}catch(error){fail(error);}});
on('confirm-order','click',()=>void confirm());on('review-dialog','close',()=>{review=null;});
on('recheck','click',()=>void (async()=>{if(!deployment)return;busy=true;render();try{const finalHash=el<HTMLInputElement>('replacement-hash').value.trim();if(finalHash&&!/^0x[0-9a-f]{64}$/i.test(finalHash))throw Error('最终交易哈希须为完整的0x开头64位十六进制');const request={deployment,epoch};const result=await controller.recheck(deployment,progress,finalHash?finalHash as Hex:undefined);if(result&&acceptRead({...reportContext(),blockNumber:world?.snapshot.blockNumber??null},request,result.world.snapshot.blockNumber)){ingest(result.world);report(result.proof,{...request,roundId:result.world.snapshot.roundId});}}catch(error){fail(error);}finally{busy=false;render();void refresh();}})());
on('recover','click',()=>void (async()=>{const hash=el<HTMLInputElement>('recover-hash').value.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash)){fail(Error('请输入完整部署交易哈希'));return;}busy=true;deploymentSelection.select();render();try{await activate(await controller.recover(hash as Hex));}catch(error){fail(error);}finally{busy=false;render();}})());
on('open-room','click',()=>void (async()=>{try{const d=parseDeployment(new URLSearchParams({contract:el<HTMLInputElement>('contract-address').value.trim(),start:el<HTMLInputElement>('contract-block').value.trim()}));await activate(d);}catch(error){fail(error);}})());
on('copy-link','click',()=>void (async()=>{if(!verified||!deployment)return;try{await navigator.clipboard.writeText(urlForDeployment(deployment));text('deployment-status','已复制通过核验的房间链接。');}catch{fail(Error('无法复制，请从地址栏复制房间链接。'));}})());
const resize=new ResizeObserver(()=>scene.resize());const observe=()=>{resize.observe(el('battle-canvas'));resize.observe(el('minimap'));};observe();
let poll:ReturnType<typeof setInterval>|undefined,tick:ReturnType<typeof setInterval>|undefined;
function startTimers(){poll=setInterval(()=>void refresh(),3500);tick=setInterval(render,1000);}
function stopTimers(){clearInterval(poll);clearInterval(tick);}
bindPageLifecycle(window,{suspend:()=>{suspended=true;epoch++;stopTimers();resize.disconnect();scene.pause();closeReview();},resume:()=>{suspended=false;stale=true;observe();scene.resume();startTimers();void refresh();},dispose:()=>{disposed=true;epoch++;stopTimers();resize.disconnect();bindings.abort();unsubscribe();registry.destroy();controller.destroy();scene.destroy();}});
render();startTimers();const pending=controller.pending();if(pending?.hash){progress({status:'unverified',hash:pending.hash,message:'发现此前未完成核验的交易，请先复核。'});if(pending.key==='deploy')el<HTMLInputElement>('recover-hash').value=pending.hash;}
const initialSelection=deploymentSelection.capture();void resolveDeployment().then(d=>{if(deploymentSelection.accepts(initialSelection,disposed))return activate(d);}).catch(error=>{if(deploymentSelection.accepts(initialSelection,disposed)){text('deployment-status',describeError(error));render();}});
