import "./style.css";
import { createTransactionBook } from "./transactions.mjs";
import QRCode from "qrcode";
import { createBattlefield } from "./battlefield";
import { createAudio } from "./audio";
import { createActivityGate } from "./scene-math.mjs";
import { DISTRICTS, TEAMS, UNITS, shortAddress, winner, totals, estimatedChainTime, remainingSeconds, canReach, previewDispatch, projectedPoints, projectedScores } from "./model.mjs";
import { CHAIN_ID, EXPLORER, resolveDeployment, getSnapshot, getActivity, readOrderReceipt, connect, onWalletChanged, getConnectedAddress, getAuthorizedAccounts, getPreferredAccount, selectAccount, cast, startRound, deployCanvas, recoverDeployment, urlForDeployment, describeError, listWallets, selectWallet, selectedWalletId, onWalletsChanged, type Deployment, type Snapshot, type Activity } from "./chain";
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<div class="shell">
<header class="topbar"><a class="brand" href="./" aria-label="闪绘据点战首页"><span class="brand-mark" aria-hidden="true">▰</span><span>闪绘<span class="brand-sub">BLITZCANVAS / 据点战争</span></span></a><div class="tabs" role="group" aria-label="真实链上战场"><button id="live-tab" class="active">每次调遣 · 真实交易 ↗</button></div><div class="wallet-tools"><button id="help" class="icon-button" aria-label="玩法帮助">?</button><button id="sound" class="icon-button" aria-pressed="false" aria-label="开启音效">♪ <span id="sound-label">关</span></button><select id="wallet-select" aria-label="选择钱包"></select><button id="wallet">连接钱包 ↗</button></div></header>
<div class="modebar"><span id="mode-badge">MONAD TESTNET · 每次调遣独立交易</span><span>SECTOR 09 <i></i> 180 秒据点争夺</span></div>
<main>
<section class="battle" aria-label="像素据点战场">
<div class="battle-top"><div><span id="round-label" class="eyebrow">TACTICAL OPERATION / 待命</span><h1 id="battle-title">占领，从第一支小队开始。</h1></div><div class="clock"><span id="timer">--:--</span><small id="clock-note">发送开局交易后计时</small></div></div>
<div class="scoreboard"><div class="team-score emerald"><span><i></i>翡翠联盟 <small id="owned-1">1 据点</small></span><strong id="score-1">0</strong></div><div class="score-caption"><span>团队累计分数</span><small id="score-note">占领 × 时间</small></div><div class="team-score ember"><span>赤焰军团 <small id="owned-2">1 据点</small><i></i></span><strong id="score-2">0</strong></div></div>
<div class="world" id="world"><canvas id="battlefield" tabindex="0" aria-label="俯视像素战场。方向键选择据点，数字1、2、3选择兵种，再点击出兵按钮。"></canvas><div class="hit-banner" id="hit-banner" role="status" aria-live="polite"></div><div id="live-overlay" class="world-overlay"><span class="eyebrow">MONAD TESTNET</span><h2 id="load-title">正在连接真实战场。</h2><p id="load-detail">正在核验合约与区块数据。数据就绪前不能出兵。</p><div><button id="overlay-retry" class="primary">重新连接链上战场</button><button id="overlay-deploy">部署 / 恢复 ↗</button></div></div><div id="result" class="result" hidden><span class="eyebrow">OPERATION COMPLETE</span><div class="result-emblem" aria-hidden="true">⚑</div><h2 id="result-title"></h2><p id="result-detail"></p><button id="restart" class="primary">再战一局</button></div></div>
<div class="map-legend"><span><i class="legend-selected"></i>选定目标</span><span><i class="legend-frontier"></i>可达前线</span><span>⚑ 占领奖励 +20</span><span id="world-tip">发送开局交易后计时</span></div>
<div id="districts" class="districts" role="group" aria-label="选择据点"></div>
<div class="map-foot"><span>矿区 +2/s · 电站 +3/s · 其他 +1/s</span><div><button id="share">分享战场 ↗</button><button id="fullscreen" aria-label="全屏战场">全屏 ⤢</button></div></div>
</section>
<aside><section class="command"><div class="section-head"><span class="eyebrow">COMMAND / 指挥台</span><span id="team-lock">首次出兵锁定阵营</span></div>
<div class="resources"><div><span>指挥点 <small id="points-note">链上估算</small></span><strong><b id="points">—</b><small> / 200</small></strong></div><div class="income"><b id="income">待加入</b><small>每秒恢复</small></div></div><div class="resource-track"><i id="points-fill"></i></div>
<div class="teams"><button id="team-1" class="team emerald active" aria-pressed="true"><i></i><span>翡翠联盟<small>01 基地出发</small></span></button><button id="team-2" class="team ember" aria-pressed="false"><i></i><span>赤焰军团<small>09 基地出发</small></span></button></div>
<div class="target"><div><span>目标据点 <b id="target-number">02</b></span><strong id="target-name">陆家嘴</strong><small id="target-defense">中立 · 驻军 20 / 100</small></div><div class="target-yield"><b id="target-rate">+1</b><small>产出 / 秒</small></div></div>
<div class="production-heading"><b>生产部队</b><small>选择兵种 · 确认出兵</small></div><div class="skills" role="group" aria-label="选择兵种">${UNITS.map((u: any, i: number) => `<button id="skill-${i}" class="skill ${i === 0 ? 'active' : ''}" aria-pressed="${i === 0}"><span class="unit-portrait unit-${i}" aria-hidden="true"><i></i></span><span class="unit-label"><b>${u.name}</b><small>${i === 0 ? '灵活进攻' : i === 1 ? '重装突破' : '接管 / 增援'}</small></span><span class="unit-cost">${u.cost}<small>指挥点</small></span><span class="unit-detail">${i === 2 ? '接管中立 · 增援 +35' : `${u.power} 战力`}<em>${u.cooldown}s 冷却 · 键 ${i + 1}</em></span></button>`).join('')}</div>
<div id="impact-preview" class="impact-preview"></div>
<div class="cast-control"><div class="dock-meta"><strong id="dock-target"></strong><span id="dock-preview"></span></div><div class="dock-skills" role="group" aria-label="快捷选择兵种">${UNITS.map((u: any, i: number) => `<button id="dock-skill-${i}" aria-label="${u.name}，${u.cost}指挥点"><span>${u.name}</span><b>${u.cost}<small> 点</small></b></button>`).join('')}</div><button id="fire" class="primary fire">部署步兵 →</button><div class="cooldown-track" aria-hidden="true"><i id="cooldown-fill"></i></div><span id="dock-reason"></span></div>
<p id="action-note" class="micro"></p><div id="status" class="status" role="status" aria-live="polite"></div><div id="pending" class="pending"></div><div class="sync-row"><span id="sync" class="micro"></span><select id="account-select" aria-label="选择签名账户"></select><button id="wallet-account" aria-label="重新选择授权账户">授权账户</button><button id="retry" hidden>重试 ↻</button></div><div id="contract-info" class="micro"></div></section>
<section class="log-panel"><div class="section-head"><span class="eyebrow">FIELD LOG / 战况</span><span id="feed-label">已确认事件</span></div><div class="stats"><span><b id="actions">0</b> 次行动</span><span><b id="players">0</b> <span id="players-label">参与地址</span></span></div><ul id="activity"></ul></section><section class="orders-panel"><div class="section-head"><span class="eyebrow">ORDERS / 我的交易</span><span id="order-scope">等待连接钱包</span></div><p class="micro">一条指令，一笔交易。战果只在回执确认后生效。</p><ol id="orders" aria-live="polite"></ol></section></aside>
</main><footer><span>九个据点。三种兵力。每一秒都算数。<span class="keyboard-hint">方向键选区 · 1 / 2 / 3 选兵</span></span><nav><button id="show-setup">部署 / 恢复 ↗</button><a href="./source.zip" download>源码 ↗</a><a href="${EXPLORER}" target="_blank" rel="noopener noreferrer">浏览器 ↗</a></nav></footer>
</div>
<dialog id="setup" class="setup"><button id="close-setup" class="close" aria-label="关闭部署窗口">×</button><span class="eyebrow">创建链上战场</span><h2>把这座城，交给所有人。</h2><p>在 Monad Testnet 部署据点合约，生成独立的实战分享链接。部署后需明确开启首轮；每次行动消耗测试网 gas，无应用收费。</p><div class="setup-actions"><button id="deploy" class="primary">部署据点合约 ↗</button></div><output id="deploy-status" aria-live="polite"></output><div class="recover-section"><label for="recover-hash">已经广播过部署交易？</label><p>填入交易哈希恢复战场。如交易被替换，请使用最终哈希。</p><div class="recover-row"><input id="recover-hash" placeholder="0x… 交易哈希" autocomplete="off"><button id="recover">恢复部署</button></div></div><input id="deployment-url" readonly hidden aria-label="部署分享链接"><button id="copy-deployment" hidden>复制实战链接</button></dialog>
<dialog id="share-dialog"><button id="close-share" class="close" aria-label="关闭分享窗口">×</button><span class="eyebrow">邀请另一位战场指挥官</span><h2>同一座城，下一位对手。</h2><p id="share-label"></p><img id="qr" alt="据点观战链接二维码"><input id="share-url" readonly aria-label="分享链接"><button id="copy-share" class="primary">复制链接 ↗</button></dialog>
<dialog id="help-dialog"><button id="close-help" class="close" aria-label="关闭玩法帮助">×</button><span class="eyebrow">FIELD MANUAL / 作战手册</span><h2>占领据点，持续得分。</h2><ol class="help-steps"><li><b>选择阵营与相邻目标</b><p>翡翠联盟从 01 基地出发，赤焰军团从 09 基地出发。首个成功指令锁定阵营；进攻须与己方据点上下左右相邻，己方据点可直接增援。全线失守时可从任意据点反攻。</p></li><li><b>生产部队</b><p>步兵：20 点 / 18 战力 / 2 秒冷却。坦克：50 点 / 50 战力 / 5 秒冷却。工程师：35 点 / 3 秒冷却，可直接接管中立据点并驻军 30，或为友军增加 35 驻军，不能进攻敌军。</p></li><li><b>控制经济，赢下 180 秒</b><p>初始 100 指挥点，上限 200。加入后每秒恢复 3 点，加上己方据点产出；每次占领奖励 20 点。矿区产出 2、电站 3、其他 1。占领期间按产出逐秒累计团队分数，结束时高分方获胜，相同则平局。</p></li></ol><div class="help-note">每次调遣都是一笔 Monad Testnet 交易，需钱包确认。等待签名或回执时不会产生战果；取消、回退不会扣除游戏指挥点，已发送交易仍可能消耗网络费。指挥点和分数预测会明确标注。参与地址不等于独立人数。无代币、奖金或资产托管。</div><p>方向键选据点 · 1 / 2 / 3 选兵种 · Tab 前往出兵按钮 · Esc 关闭窗口</p><button id="help-ready" class="primary">准备出击</button></dialog>`;
function el<T extends HTMLElement = HTMLElement>(id: string) { return document.getElementById(id)! as T; }
let deployment: Deployment | null = null, snapshot: Snapshot | null = null;
let team = 1, ability = 2, selected = 1, busy = false, connecting = false, pendingDistrict: number | null = null, lastCooldown = 2;
let deploymentLoading = true, deploymentError = "", deploymentLoadGeneration = 0;
let activities: Activity[] = [], stale = "", historyError = "", walletGeneration = 0;
let browserStorage: Storage | null = null;
try { browserStorage = window.localStorage; } catch { /* Denied storage does not block sending. */ }
const orders = createTransactionBook(browserStorage, "blitzcanvas.real-orders.v1");
let orderSignature = "", reconcileInFlight = false, accountsSignature = "";
const receiptAttemptedAt = new Map<string, number>();
const activityGate = createActivityGate();
const districtButtons: HTMLButtonElement[] = [];
function status(message: string, tone = "") { el("status").textContent = message; el("status").dataset.tone = tone; }
function link(label: string, url: string) { const a = document.createElement("a"); a.textContent = label; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; }
function activeSnapshot() { return snapshot; }
function chainNow(s: any) { return estimatedChainTime(s); }
function projectedSnapshot(s: any) { return { ...s, chainTime: estimatedChainTime(s), points: projectedPoints(s), scores: projectedScores(s) }; }
function reasonText(reason: string) {
    const reasons: Record<string, string> = { "No round": "等待开启首轮", "Round not started": "回合尚未开始", "Round ended": "本轮已结束", "Cooldown active": "兵种冷却中", "Unreachable": "先占领上下左右相邻的据点", "Engineer cannot attack enemy": "工程师不能进攻敌军，请选择步兵或坦克", "No effect": "友军驻军已满，请选择其他据点", "Insufficient points": "指挥点不足，等待恢复或占领高产据点", "Team locked": "本轮阵营已锁定" };
    return reasons[reason] ?? reason;
}
function hashStatus(hash: string) { el("pending").replaceChildren(document.createTextNode("已广播 · "), link(shortAddress(hash) + " ↗", `${EXPLORER}/tx/${hash}`)); }
const audio = createAudio();
const battlefield = createBattlefield(el<HTMLCanvasElement>("battlefield"), { onSelect: selectDistrict });
function selectDistrict(index: number) { selected = index; audio.play("select"); render(); }
DISTRICTS.forEach((district: any, index: number) => { const button = document.createElement("button"); button.className = "district"; button.innerHTML = '<span class="district-index"></span><strong></strong><b></b>'; button.querySelector(".district-index")!.textContent = String(index + 1).padStart(2, "0"); button.querySelector("strong")!.textContent = district.name; button.onclick = () => selectDistrict(index); el("districts").append(button); districtButtons.push(button); });
let logSignature = "", renderedContract: string | null = null;
function renderLog() {
    const signature = String(!!deployment) + activities.map(a => a.hash).join("|");
    if (signature === logSignature) return;
    logSignature = signature;
    const list = el("activity"); list.replaceChildren();
    for (const a of activities) {
        const li = document.createElement("li");
        li.append(document.createTextNode(`${shortAddress(a.actor)} · ${UNITS[a.unit]?.name} → ${DISTRICTS[a.district]?.name} · ${a.beforeOwner !== a.afterOwner ? "占领" : "驻军 " + a.beforeDefense + "→" + a.afterDefense} `), link(shortAddress(a.hash) + " ↗", `${EXPLORER}/tx/${a.hash}`));
        list.append(li);
    }
    if (!list.children.length) { const li = document.createElement("li"); li.textContent = deployment ? "最近 100 区块内暂无本轮已确认调遣。" : "等待真实链上事件"; list.append(li); }
}
function renderOrders() {
    const account = getConnectedAddress();
    const scope = deployment && account ? {chainId: CHAIN_ID, contract: deployment.address, account} : null;
    const records = scope ? orders.list(scope).slice(0, 12) : [];
    const signature = JSON.stringify([scope, records]);
    if (signature === orderSignature) return;
    orderSignature = signature;
    el("order-scope").textContent = account ? shortAddress(account) : "等待连接钱包";
    const list = el("orders"); list.replaceChildren();
    const labels: Record<string,string> = {signing:"等待钱包签名",pending:"已广播 · 等待回执",confirmed:"链上已确认",reverted:"链上回退",cancelled:"已取消 / 替换",not_sent:"未发送",unknown:"待核验"};
    for (const r of records) {
        const li = document.createElement("li"); li.dataset.status = r.status;
        const header = document.createElement("div"), name = document.createElement("strong"), badge = document.createElement("span");
        name.textContent = r.kind === "startRound" ? `开局 · 预期当前轮 ${r.roundId}` : `${TEAMS[r.team]?.name} · ${UNITS[r.unit]?.name} → ${DISTRICTS[r.district]?.name} · 第 ${r.roundId} 轮`;
        badge.className = "order-state"; badge.textContent = labels[r.status] ?? "待核验"; header.append(name,badge); li.append(header);
        if (r.hash) li.append(link("当前哈希 " + shortAddress(r.hash) + " ↗", `${EXPLORER}/tx/${r.hash}`));
        const earlier = r.hashes.filter((h:string)=>h!==r.hash);
        if (earlier.length) {
            const history=document.createElement("details"), summary=document.createElement("summary");
            summary.textContent=`原始 / 替换哈希（${earlier.length}）`; history.append(summary);
            for (const h of earlier) history.append(link(shortAddress(h)+" ↗",`${EXPLORER}/tx/${h}`),document.createElement("br"));
            li.append(history);
        }
        const detail = document.createElement("small");
        detail.textContent = r.status === "confirmed" || r.status === "reverted" ? `区块 ${r.blockNumber} · ${new Date(r.createdAt).toLocaleTimeString()}${r.timingObserved && Number.isFinite(r.submittedAt) && Number.isFinite(r.confirmedAt) && r.confirmedAt >= r.submittedAt ? ` · 观察确认耗时 ${((r.confirmedAt-r.submittedAt)/1000).toFixed(1)}s` : ""}` : r.error ? String(r.error).slice(0,240) : r.status === "signing" ? "签名前不会移动部队或扣游戏点数" : "确认前不会产生战果；请勿重复发送";
        li.append(detail); list.append(li);
    }
    if (!records.length) { const li=document.createElement("li");li.textContent=account?"此账户在当前战场尚无本机记录。链上战况见上方已确认事件。":"连接钱包后显示本账户的签名、广播与真实回执。";list.append(li); }
}
async function reconcileOrders() {
    const account=getConnectedAddress(), d=deployment;
    if (!d || !account || reconcileInFlight) return;
    const pending=orders.list({chainId:CHAIN_ID,contract:d.address,account}).filter((r:any)=>r.hash && ["pending","unknown"].includes(r.status))
        .sort((a:any,b:any)=>(receiptAttemptedAt.get(a.id)??0)-(receiptAttemptedAt.get(b.id)??0)).slice(0,3);
    if (!pending.length) return;
    reconcileInFlight=true;
    try {
        for (const r of pending) {
            receiptAttemptedAt.set(r.id,Date.now());
            const stillAwaiting = () => orders.list().some((current:any)=>current.id===r.id && current.hash===r.hash && ["pending","unknown"].includes(current.status));
            try {
                const proof=await readOrderReceipt(r.hash);
                if (!stillAwaiting()) continue;
                if (proof) orders.settle(r.id,proof);
                else if(Date.now()-r.updatedAt>120000) orders.unknown(r.id,"尚未查到回执，请检查钱包；不会自动重发");
            } catch(error) {
                if(stillAwaiting()) orders.unknown(r.id,describeError(error));
            }
        }
    }
    finally { reconcileInFlight=false; renderOrders(); }
}
function renderAccountChoices() {
    const accounts=getAuthorizedAccounts(), chosen=getPreferredAccount();
    const signature=JSON.stringify([accounts,chosen]);
    const select=el<HTMLSelectElement>("account-select");
    if(signature!==accountsSignature) {
        accountsSignature=signature;select.replaceChildren();
        if(!accounts.length) {const option=document.createElement("option");option.value="";option.textContent="尚无授权账户";select.append(option);}
        for(const address of accounts) {const option=document.createElement("option");option.value=address;option.textContent=shortAddress(address);option.title=address;select.append(option);}
        select.value=chosen??accounts[0]??"";
    }
    select.disabled=busy||connecting||accounts.length<2;
}
function render() {
    const s = activeSnapshot(), hasRound = !!s && Number(s.roundId) > 0, time = s ? Math.max(0, remainingSeconds(s)) : 0;
    const ended = hasRound && time <= 0, confirmedEnd = ended && s!.chainTime >= s!.endsAt, locked = s?.viewerTeam || 0;
    if (locked)
        team = locked;
    const projected = s ? projectedSnapshot(s) : null, preview = projected ? previewDispatch(projected, selected, team, ability) : null;
    const cooldown = s ? Math.max(0, Math.ceil(s.nextActionAt - chainNow(s))) : 0, t = s ? totals(s) : null, owners = s?.owners ?? Array(9).fill(0), defense = s?.defense ?? Array(9).fill(0);
    const scores = projected?.scores ?? [0, 0], points = projected?.points ?? 0;
    el("timer").textContent = !s ? "--:--" : `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
    el("timer").classList.toggle("urgent", time <= 30 && hasRound);
    el("clock-note").textContent = "倒计时估算 · 区块时间为准";
    el("round-label").textContent = hasRound ? `MONAD / 第 ${s!.roundId} 轮` : "MONAD / 等待链上数据";
    el("battle-title").textContent = ended ? "本轮行动结束。" : deploymentLoading ? "正在连接真实战场。" : !deployment || !s ? "等待可核验的链上数据。" : !hasRound ? "战场就绪，等待开局。" : "据点争夺进行中。";
    el("mode-badge").textContent = "MONAD TESTNET · 每次调遣独立交易 · 无模拟对手";
    document.body.dataset.team = String(team);
    document.body.dataset.mode = "live";
    battlefield.setState({ owners, defense, selected, team, pending: pendingDistrict, known: !!s, mode: "live", rates: DISTRICTS.map((d: any) => d.rate) });
    el("live-overlay").hidden = !!deployment && !!s;
    el("load-title").textContent = deploymentLoading ? "正在核验真实战场。" : deploymentError || stale ? "链上连接未就绪。" : "等待真实合约配置。";
    el("load-detail").textContent = deploymentError || stale || (deploymentLoading ? "等待合约与区块数据。没有链上快照时不能调遣。" : "请部署或恢复当前据点战合约。所有调遣都必须发送真实交易。");
    el("world-tip").textContent = busy ? "指令待确认 · 尚未产生战果" : "点选地图锁定目标";
    el("live-tab").classList.add("active");
    el<HTMLButtonElement>("wallet-account").disabled = busy || connecting;
    for (const id of ["live-tab", "wallet-select"])
        el<HTMLButtonElement>(id).disabled = busy || (id === "wallet-select" && connecting);
    for (const n of [1, 2]) {
        el(`score-${n}`).textContent = s ? String(scores[n - 1]) : "—";
        el(`owned-${n}`).textContent = s ? `${t!.owned[n - 1]} 据点` : "未知";
        el(`team-${n}`).classList.toggle("active", team === n);
        el(`team-${n}`).setAttribute("aria-pressed", String(team === n));
        el<HTMLButtonElement>(`team-${n}`).disabled = busy || !!locked && locked !== n;
    }
    el("score-note").textContent = s && !confirmedEnd ? "实时估算 · 以链上结算为准" : "占领产出 × 控制时间";
    el("points").textContent = s ? String(points) : "—";
    el("points-note").textContent = "链上估算";
    el("points-fill").style.width = `${points / 2}%`;
    el("income").textContent = s ? (locked ? `+${s.income}/s` : "加入后恢复") : "—";
    el("team-lock").textContent = locked ? "本轮阵营已锁定" : "首个成功指令锁定阵营";
    districtButtons.forEach((button, i) => { button.classList.toggle("selected", i === selected); button.classList.toggle("reachable", !!s && canReach(owners, team, i)); button.dataset.owner = String(owners[i]); button.setAttribute("aria-pressed", String(i === selected)); button.setAttribute("aria-label", s ? `${DISTRICTS[i].name}，${owners[i] ? TEAMS[owners[i]].name : "中立"}，驻军 ${defense[i]}，每秒产出 ${DISTRICTS[i].rate}` : `${DISTRICTS[i].name}，等待快照`); button.querySelector("b")!.textContent = s ? String(defense[i]) : "—"; });
    for (const n of [0, 1, 2])
        for (const prefix of ["skill-", "dock-skill-"]) {
            el(prefix + n).classList.toggle("active", ability === n);
            el(prefix + n).setAttribute("aria-pressed", String(ability === n));
            el<HTMLButtonElement>(prefix + n).disabled = busy;
        }
    el("target-number").textContent = String(selected + 1).padStart(2, "0");
    el("target-name").textContent = DISTRICTS[selected].name;
    el("target-defense").textContent = s ? `${owners[selected] ? TEAMS[owners[selected]].name : "中立"} · 驻军 ${defense[selected]} / 100` : "等待链上快照";
    el("target-rate").textContent = `+${DISTRICTS[selected].rate}`;
    const canStart = !!deployment && !!s && !hasRound;
    const reason = cooldown > 0 ? `生产冷却 ${cooldown}s` : preview && !preview.valid ? reasonText(preview.reason) : "";
    const fire = el<HTMLButtonElement>("fire");
    fire.disabled = busy || connecting || (!deployment || !s) || ended || (!canStart && !preview?.valid);
    fire.textContent = busy ? "指令确认中…" : connecting ? "连接钱包中…" : !deployment ? "等待建立战场" : !s ? "等待同步战场…" : canStart ? "开启首轮战斗 ↗" : ended ? "本轮已结束" : cooldown > 0 ? `生产冷却 ${cooldown}s` : preview && !preview.valid ? "暂时无法出兵" : `调遣${UNITS[ability].name} ↗`;
    const outcome = preview?.valid ? `${preview.capture ? "预计占领" : "预计驻军"} ${defense[selected]} → ${preview.afterDefense}${preview.capture ? " · 奖励 +20" : ""}` : reason || "等待链上快照";
    el("impact-preview").textContent = outcome;
    el("impact-preview").classList.toggle("blocked", !!reason);
    el("dock-target").textContent = `${String(selected + 1).padStart(2, "0")} ${DISTRICTS[selected].name}`;
    el("dock-preview").textContent = `${"点数估算"} ${s ? points : "—"} / 200 · 费用 ${UNITS[ability].cost}`;
    el("dock-reason").textContent = !s ? "等待链上快照" : canStart ? "发送交易开启 180 秒战斗" : reason || (preview?.capture ? "占领成功返还 20 点" : `预计驻军 ${defense[selected]} → ${preview?.afterDefense ?? "—"}`);
    el("cooldown-fill").style.width = `${Math.min(100, cooldown / lastCooldown * 100)}%`;
    el("action-note").textContent = "每次调遣发送一笔独立交易。签名和回执确认前不会产生战果。指挥点是局内资源，交易另消耗测试 MON 网络费。";
    el("actions").textContent = t ? String(t.actions) : "—";
    el("players").textContent = t ? String(t.players) : "—";
    el("players-label").textContent = "参与地址";
    el("feed-label").textContent = "本轮已确认 · 最近 100 区块";
    el("sync").textContent = deploymentError || stale || historyError || (snapshot ? `已核验区块 ${snapshot.blockNumber} · 每 1.5 秒同步` : "等待真实链上快照");
    el("sync").classList.toggle("warning", !!deploymentError || !!stale || !!historyError);
    el("retry").hidden = !deploymentError && !stale && !historyError && !!snapshot;
    el<HTMLButtonElement>("retry").disabled = busy || deploymentLoading;
    if (renderedContract !== (deployment?.address ?? "")) {
        renderedContract = deployment?.address ?? "";
        el("contract-info").replaceChildren();
        if (deployment)
            el("contract-info").append(document.createTextNode(`Chain ${CHAIN_ID} · `), link(shortAddress(deployment.address) + " ↗", `${EXPLORER}/address/${deployment.address}`));
    }
    el("result").hidden = !ended;
    if (ended) {
        const w = winner(s!.scores);
        el("result").dataset.winner = confirmedEnd ? String(w) : "0";
        el("result").querySelector(".result-emblem")!.textContent = confirmedEnd ? "⚑" : "◌";
        el("result-title").textContent = !confirmedEnd ? "等待链上结算" : w === 3 ? "双方势均力敌。" : `${TEAMS[w].name}胜利。`;
        el("result-detail").textContent = confirmedEnd ? `链上结算 · ${s!.scores[0]} : ${s!.scores[1]} · 总行动 ${t!.actions} 次` : "倒计时归零，等待区块时间达到结束时间的真实快照。";
        el<HTMLButtonElement>("restart").disabled = busy || !confirmedEnd;
        el("restart").textContent = "发送交易，开启下一轮 ↗";
    }
    renderLog();
    renderOrders();
    renderAccountChoices();
}
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function blast(hit: {
    district: number;
    team: number;
    unit: number;
    beforeOwner: number;
    afterOwner: number;
    beforeDefense: number;
    afterDefense: number;
}) {
    battlefield.hit(hit);
    const text = `链上确认 · ${UNITS[hit.unit].name} → ${DISTRICTS[hit.district].name} · ${hit.beforeOwner !== hit.afterOwner ? "占领 +20 指挥点" : `驻军 ${hit.beforeDefense} → ${hit.afterDefense}`}`;
    el("hit-banner").textContent = text;
    el("hit-banner").dataset.team = String(hit.team);
    el("hit-banner").classList.add("visible");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el("hit-banner").classList.remove("visible"), 2500);
    audio.play("hit");
}
// Ordinary polls share the current request. Writes force a new viewer read after it settles.
let refreshInFlight: Promise<void> | null = null;
async function refresh(forceFresh = false): Promise<void> {
    if (refreshInFlight && !forceFresh)
        return refreshInFlight;
    while (refreshInFlight)
        await refreshInFlight;
    const request = fetchSnapshot();
    refreshInFlight = request;
    try {
        await request;
    }
    finally {
        if (refreshInFlight === request)
            refreshInFlight = null;
    }
}
async function fetchSnapshot() {
    if (!deployment)
        return;
    const d = deployment, generation = walletGeneration, viewer = getConnectedAddress();
    try {
        const next = await getSnapshot(d);
        if (deployment !== d ||
            walletGeneration !== generation ||
            getConnectedAddress() !== viewer)
            return;
        if (snapshot && next.blockNumber < snapshot.blockNumber)
            return;
        const old = snapshot;
        snapshot = next;
        stale = "";
        if (old && old.roundId !== next.roundId) {
            activities = [];
        }
        render();
        const round = next.roundId;
        try {
            const logs = await getActivity(d, next.blockNumber, round);
            if (deployment === d &&
                walletGeneration === generation &&
                getConnectedAddress() === viewer &&
                snapshot?.roundId === round) {
                // Scope comes from the actual deployment and round, even if a wallet change cleared snapshot.
                const scope = `${d.address.toLowerCase()}:${round}`;
                for (const event of activityGate.ingest(scope, logs, true)) blast(event);
                activities = logs;
                historyError = "";
                render();
            }
        }
        catch {
            if (deployment === d &&
                walletGeneration === generation &&
                getConnectedAddress() === viewer) {
                historyError = "快照已同步；近期记录暂不可用。";
                render();
            }
        }
    }
    catch (error) {
        if (deployment === d &&
            walletGeneration === generation &&
            getConnectedAddress() === viewer) {
            stale = `快照可能过期 · ${describeError(error)}`;
            render();
        }
    }
}
function renderWallets() {
    const select = el<HTMLSelectElement>("wallet-select");
    select.replaceChildren();
    const wallets = listWallets();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = wallets.length ? "选择钱包" : "未检测到钱包";
    select.append(placeholder);
    for (const w of wallets) {
        const option = document.createElement("option");
        option.value = w.id;
        option.textContent = w.name;
        select.append(option);
    }
    select.value = selectedWalletId() ?? "";
}
async function connectWallet(changeAccount = false) {
    connecting = true;
    render();
    el<HTMLButtonElement>("wallet").disabled = true;
    el<HTMLSelectElement>("wallet-select").disabled = true;
    try {
        if(changeAccount) status("请在钱包中重新选择授权账户；此步骤不发送交易。");
        const w = await connect(changeAccount);
        walletGeneration++;
        snapshot = null;
        render();
        await refresh(true);
        el("wallet").textContent = `${shortAddress(w.address)} · ${w.balance} MON`;
        status(`已连接 ${shortAddress(w.address)}。`, "success");
        return true;
    }
    catch (error) {
        el("wallet").textContent = "重新连接钱包 ↗";
        status(describeError(error), "error");
        return false;
    }
    finally {
        connecting = false;
        el<HTMLButtonElement>("wallet").disabled = false;
        el<HTMLSelectElement>("wallet-select").disabled = busy;
    }
}
async function runAction(newRound = false) {
    if (busy || connecting)
        return;
    if (!deployment)
        return;
    el("pending").replaceChildren();
    busy = true;
    const d = deployment, target = selected, chosenTeam = team, skill = ability, expectedRound = snapshot?.roundId;
    pendingDistrict = newRound ? null : target;
    let orderId: string | null = null;
    render();
    try {
        if (!getConnectedAddress() && !(await connectWallet()))
            return;
        await refresh(true);
        if (stale)
            throw new Error("链上快照同步失败，请刷新后重试。");
        if (deployment !== d)
            throw new Error("战场已变更，请重试。");
        const s = snapshot;
        if (!s || expectedRound === undefined)
            throw new Error("请等待有效链上快照。");
        const account = getConnectedAddress();
        if (!account) throw new Error("钱包尚未连接。");
        const opening = newRound || Number(s.roundId) === 0;
        orderId = orders.begin({chainId:CHAIN_ID,contract:d.address,account,kind:opening?"startRound":"dispatch",roundId:String(expectedRound),...(opening?{}:{district:target,team:chosenTeam,unit:skill})});
        const onHash = (hash: `0x${string}`, sender?: `0x${string}`, replacement?: 'repriced'|'cancelled'|'replaced') => {
            orders.submitted(orderId!,hash,sender??account,replacement); hashStatus(hash); renderOrders();
        };
        let receipt;
        if (newRound || Number(s.roundId) === 0) {
            if (Number(s.roundId) > 0 && remainingSeconds(s) > 0)
                throw new Error("当前轮尚未结束。");
            receipt = await startRound(d, onHash, expectedRound);
        }
        else {
            if (remainingSeconds(s) <= 0)
                throw new Error("本轮已结束，请明确开启下一轮。");
            if (s.viewerTeam && s.viewerTeam !== chosenTeam)
                throw new Error("本轮阵营已锁定。");
            if (s.nextActionAt > estimatedChainTime(s))
                throw new Error("兵种仍在冷却。");
            const preview = previewDispatch(projectedSnapshot(s), target, chosenTeam, skill);
            if (!preview.valid)
                throw new Error(reasonText(preview.reason));
            receipt = await cast(d, target, chosenTeam, skill, onHash, expectedRound);
            lastCooldown = UNITS[skill].cooldown;
        }
        const proof = await readOrderReceipt(receipt.hash);
        if (!proof) throw new Error("回执暂不可读，正在核验；请勿重复发送。");
        orders.settle(orderId,proof);
        if (proof.status !== "success") throw new Error("交易已回退，游戏状态未改变。");
        el("pending").replaceChildren(document.createTextNode("已确认 · "),link(shortAddress(receipt.hash)+" ↗",`${EXPLORER}/tx/${receipt.hash}`));
        status("交易已确认，正在同步战场。", "success");
        await refresh(true);
    }
    catch (error) {
        if (orderId) {
            const record = orders.list().find((r:any)=>r.id===orderId);
            if (record?.hash && !["confirmed","reverted","cancelled"].includes(record.status)) orders.unknown(orderId,describeError(error));
            else if (!record?.hash) orders.notSent(orderId,describeError(error));
        }
        status(describeError(error), "error");
    }
    finally {
        busy = false;
        pendingDistrict = null;
        render();
    }
}
for (const n of [1, 2])
    el(`team-${n}`).onclick = () => {
        team = n;
        const current = activeSnapshot();
        if (current && !current.viewerTeam && !canReach(current.owners, team, selected))
            selected = team === 1 ? 1 : 7;
        audio.play("select");
        render();
    };
for (const n of [0, 1, 2])
    el(`skill-${n}`).onclick = () => {
        ability = n;
        audio.play("select");
        render();
    };
for (const n of [0, 1, 2])
    el(`dock-skill-${n}`).onclick = () => {
        ability = n;
        audio.play("select");
        render();
    };
el("fire").onclick = () => void runAction();
el("restart").onclick = () => void runAction(true);
function resetFeedback() {
    battlefield.setState({
        owners: Array(9).fill(0),
        defense: Array(9).fill(0),
        rates: DISTRICTS.map((d: any) => d.rate),
        selected,
        team,
        pending: null,
        known: false,
        mode: "live",
    });
    clearTimeout(bannerTimer);
    el("hit-banner").classList.remove("visible");
    el("hit-banner").textContent = "";
    el("pending").replaceChildren();
}
el("live-tab").onclick = () => void refresh(true);
el<HTMLSelectElement>("account-select").onchange = (event) => {
    try {selectAccount((event.target as HTMLSelectElement).value);void connectWallet();}
    catch(error) {status(describeError(error),"error");}
};
el("wallet-account").onclick = () => { if(!busy && !connecting) void connectWallet(true); };
el("wallet").onclick = () => {
    if (!busy)
        void connectWallet();
};
el<HTMLSelectElement>("wallet-select").onchange = (e) => {
    selectWallet((e.target as HTMLSelectElement).value);
    walletGeneration++;
    snapshot = null;
    el("wallet").textContent = "连接所选钱包 ↗";
    render();
    void refresh();
};
onWalletsChanged(renderWallets);
onWalletChanged(() => {
    walletGeneration++;
    snapshot = null;
    el("wallet").textContent = "重新连接钱包 ↗";
    status("钱包账户或网络已变化，请重新连接。");
    renderWallets();
    render();
    void refresh();
});
function currentURL() {
    return deployment
        ? urlForDeployment(deployment)
        : location.origin + location.pathname;
}
async function copy(value: string) {
    try {
        await navigator.clipboard.writeText(value);
        status("链接已复制。", "success");
    }
    catch {
        status("请选中链接文本手动复制。");
    }
}
el("share").onclick = async () => {
    const url = currentURL();
    el<HTMLInputElement>("share-url").value = url;
    el("share-label").textContent = deployment ? "扫描观看同一个真实链上战场；每次调遣需要钱包交易。" : "战场尚未配置，当前不能调遣。";
    el<HTMLDialogElement>("share-dialog").showModal();
    try {
        el<HTMLImageElement>("qr").src = await QRCode.toDataURL(url, {
            width: 400,
            margin: 2,
            color: { dark: "#141823", light: "#ffffff" },
        });
    }
    catch {
        el("share-label").textContent = "二维码暂不可用，请复制链接。";
    }
};
el("close-share").onclick = () => el<HTMLDialogElement>("share-dialog").close();
el("copy-share").onclick = () => void copy(currentURL());
el("fullscreen").onclick = async () => {
    if (document.fullscreenElement) {
        await document.exitFullscreen();
    }
    else {
        try {
            await document.documentElement.requestFullscreen();
        }
        catch {
            document.body.classList.toggle("presentation");
        }
    }
};
function openSetup() {
    el<HTMLDialogElement>("setup").showModal();
}
el("show-setup").onclick = openSetup;
el("overlay-deploy").onclick = openSetup;
el("overlay-retry").onclick = () => void loadDeployment();
el("close-setup").onclick = () => el<HTMLDialogElement>("setup").close();
const storageKey = "blitzcanvas.pixel.pending-deployment";
function saveHash(hash: string) {
    try {
        localStorage.setItem(storageKey, hash);
    }
    catch { }
    el<HTMLInputElement>("recover-hash").value = hash;
    el("deploy-status").replaceChildren(document.createTextNode("部署交易已广播："), link(shortAddress(hash), `${EXPLORER}/tx/${hash}`));
}
function finishDeployment(d: Deployment) {
    deploymentLoadGeneration++;
    resetFeedback();
    deployment = d;
    deploymentError = ""; deploymentLoading = false;
    snapshot = null;
    activities = [];
    stale = "";
    history.replaceState(null, "", urlForDeployment(d));
    el("deploy-status").textContent =
        "部署成功。请点击「开启首轮战斗」发送开局交易。";
    el<HTMLInputElement>("deployment-url").value = urlForDeployment(d);
    el("deployment-url").hidden = false;
    el("copy-deployment").hidden = false;
    try {
        localStorage.removeItem(storageKey);
    }
    catch { }
    render();
    void refresh();
}
async function deploymentAction(recover: boolean) {
    if (busy || connecting)
        return;
    busy = true;
    render();
    el<HTMLButtonElement>("deploy").disabled = true;
    el<HTMLButtonElement>("recover").disabled = true;
    try {
        if (recover) {
            const hash = el<HTMLInputElement>("recover-hash").value.trim();
            if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
                throw new Error("请输入有效交易哈希。");
            saveHash(hash);
            finishDeployment(await recoverDeployment(hash as `0x${string}`, saveHash));
        }
        else {
            el("deploy-status").textContent = "请在钱包确认 Monad Testnet 部署交易。";
            finishDeployment(await deployCanvas(saveHash));
        }
    }
    catch (error) {
        el("deploy-status").append(document.createTextNode(" " + describeError(error)));
    }
    finally {
        busy = false;
        el<HTMLButtonElement>("deploy").disabled = false;
        el<HTMLButtonElement>("recover").disabled = false;
        render();
    }
}
el("deploy").onclick = () => void deploymentAction(false);
el("recover").onclick = () => void deploymentAction(true);
el("copy-deployment").onclick = () => void copy(el<HTMLInputElement>("deployment-url").value);
async function loadDeployment() {
    if (busy || connecting) return;
    const generation=++deploymentLoadGeneration;
    deploymentLoading = true; deploymentError = ""; render();
    try {
        const d = await resolveDeployment();
        if (generation !== deploymentLoadGeneration) return;
        if (!d) throw new Error("尚未配置真实合约。请部署或恢复战场。");
        deployment = d; snapshot = null; resetFeedback();
        await refresh(true);
    } catch(error) {
        if (generation !== deploymentLoadGeneration) return;
        deployment = null; snapshot = null;
        deploymentError = describeError(error);
        status(`链上战场未就绪：${deploymentError}`, "error");
    } finally { if(generation===deploymentLoadGeneration) { deploymentLoading = false; render(); } }
}
async function init() {
    renderWallets();
    render();
    await loadDeployment();
    let hash: string | null = null;
    try {
        hash = localStorage.getItem(storageKey);
    }
    catch { }
    if (hash) {
        el<HTMLInputElement>("recover-hash").value = hash;
        openSetup();
        el("deploy-status").textContent =
            "检测到待恢复部署，可点击恢复部署检查回执。";
    }
    if (new URLSearchParams(location.search).get("setup") === "1" &&
        !el<HTMLDialogElement>("setup").open)
        openSetup();
    render();
}
el("retry").onclick = () => void (deployment ? refresh(true) : loadDeployment());
el("help").onclick = () => el<HTMLDialogElement>("help-dialog").showModal();
el("close-help").onclick = el("help-ready").onclick = () => el<HTMLDialogElement>("help-dialog").close();
el("sound").onclick = () => {
    const enabled = audio.toggle();
    el("sound").setAttribute("aria-pressed", String(enabled));
    el("sound").setAttribute("aria-label", enabled ? "关闭音效" : "开启音效");
    el("sound-label").textContent = enabled ? "开" : "关";
};
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
        document.body.classList.remove("presentation");
    if (document.querySelector("dialog[open]") ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey)
        return;
    const target = event.target as HTMLElement;
    if (target.closest("input,select,textarea") || target.isContentEditable)
        return;
    if (busy)
        return;
    if (["1", "2", "3"].includes(event.key)) {
        event.preventDefault();
        ability = Number(event.key) - 1;
        audio.play("select");
        render();
    }
    const offsets: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -3,
        ArrowDown: 3,
    };
    if (event.key in offsets) {
        event.preventDefault();
        selectDistrict((selected + offsets[event.key] + 9) % 9);
        if (target.closest("#districts"))
            districtButtons[selected].focus();
    }
});
const renderTimer = setInterval(() => { if (!document.hidden)
    render(); }, 250);
const pollTimer = setInterval(() => {
    if (!document.hidden) { void refresh(); void reconcileOrders(); }
}, 1500);
window.addEventListener("pagehide", (event) => {
    if (event.persisted)
        return;
    clearInterval(renderTimer);
    clearInterval(pollTimer);
    clearTimeout(bannerTimer);
    battlefield.destroy();
    audio.destroy();
}, { once: true });
void init();
