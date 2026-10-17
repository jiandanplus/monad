import './style.css';
import { FACTIONS, NODES, neighbors, legalTarget } from './world.mjs';
import { MapScene, demoUnits } from './scene';
import { bindPageLifecycle } from './lifecycle.mjs';
const app = document.querySelector<HTMLDivElement>('#map-app')!;
app.innerHTML = `
<header class="command-header"><a class="wordmark" href="./map.html" aria-label="断线争城地图预览"><span class="brand-mark">断</span><span>断线争城<small>FACTIONS / FIELD OPERATIONS</small></span></a><div class="mode-tag"><i></i> 地图交互预览</div><a class="legacy-link" href="./index.html">旧版入口 ↗</a></header>
<main class="command-layout"><section class="battlefield" aria-label="可交互等距战场">
 <div class="field-top"><div><span class="eyebrow">THE BORDERLANDS · 四方边境</span><h1>每一条路，都是战线。</h1></div><span class="sector-label">SECTOR / 013<br><strong>四方边境</strong></span></div>
 <canvas id="battle-canvas" tabindex="0" aria-label="等距战场：拖动平移，滚轮缩放；亦可使用设施选择控件"></canvas>
 <div class="map-coordinate" aria-live="off"><span class="crosshair-symbol">⌖</span><span id="camera-label">视野 50%</span><span>64 × 64 地形格</span></div>
 <div class="field-key"><span><kbd>W A S D</kbd> 平移</span><span>拖动平移</span><span>滚轮缩放</span></div>
 <div class="view-controls" aria-label="镜头控制"><button id="zoom-out" aria-label="缩小地图">−</button><output id="zoom-value">50%</output><button id="zoom-in" aria-label="放大地图">＋</button><span></span><button id="reset-view" title="重置全图">全图</button><button id="home-view" title="回到翡翠基地">⌂ 基地</button></div>
 <div class="preview-watermark">地图交互预览 / 示例驻军 / 未接入新版合约</div>
</section>
<aside class="operations-panel" aria-label="地图操作面板">
 <section class="panel-section overview"><div class="section-heading"><span>战区总览</span><span class="tiny-label">TACTICAL MAP</span></div><canvas id="minimap" tabindex="0" aria-label="小地图：点击定位镜头；键盘回车重置全图"></canvas><div class="minimap-caption"><span>13 处设施 · 20 条道路</span><span>点击定位 ↗</span></div></section>
 <section class="panel-section factions"><div class="section-heading"><span>四方部署</span><span class="tiny-label">FACTIONS</span></div><div class="faction-list">${FACTIONS.map(f => `<button class="faction-button" data-base="${f.base}" style="--faction:${f.color}" title="定位${f.name}基地"><span class="faction-symbol">${f.shape}</span><span>${f.name}</span><span>定位 ↗</span></button>`).join('')}</div><p class="muted-note">阵营仅以基地标识 · 所有驻军均为静态示例</p></section>
 <section class="panel-section selection-panel"><div class="section-heading"><label for="source-select">设施检视</label><span id="node-id" class="tiny-label">NODE / 00</span></div><select id="source-select" aria-label="选择来源设施">${NODES.map(n => `<option value="${n.id}">${String(n.id).padStart(2, '0')} · ${n.name}</option>`).join('')}</select><div class="selected-title"><span id="node-type">前进基地</span><span id="ownership">■ 翡翠联盟</span></div><p id="facility-description" class="facility-description"></p><div class="unit-heading"><span>示例驻军</span><span id="unit-count"></span></div><div id="unit-list" class="unit-list"></div><p class="muted-note">选择同一来源的示例单位，查看道路。兵力不会改变。</p>
 <div class="route-heading">相邻道路 <span>ADJACENT ROUTES</span></div><div id="target-list" class="target-list"></div><div class="route-status" id="route-status" role="status">选择相邻设施，预览一段道路。</div><button id="clear-route" class="clear-route" disabled>清除道路预览</button></section>
 <section class="scope-note"><span class="note-icon">i</span><div><strong>未接入新版合约</strong><p>本页用于地图与操作验收。无钱包连接，不发送交易；不显示实时战况或成绩。</p><span id="asset-status">正在加载独立建筑精灵…</span></div></section>
</aside></main><footer class="command-footer"><span>BLITZCANVAS / ISOMETRIC FIELD STUDY</span><span>地图交互预览 / 示例驻军 / 未接入新版合约</span></footer>`;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
let source = 0, target: number | null = null, units: number[] = [];
const descriptions: Record<string, string> = { base: '外环前进基地。两条道路通向相邻矿场，是阵营的初始集结地。', mine: '外环资源设施。由相邻阵营争夺，通过两座通信塔通往内环。', tower: '内环通信设施。连接两处矿场与中央兵工厂，位于城区。', factory: '中央生产设施。四条道路分别连接四座通信塔。' };
const types: Record<string, string> = { base: '前进基地', mine: '资源矿场', tower: '通信设施 · 城区', factory: '中央兵工厂' };
let renderedSource: number | null = null;
function sync() {
    const n = NODES[source], f = FACTIONS.find(f => f.id === n.faction);
    element<HTMLSelectElement>('source-select').value = String(source);
    element('node-id').textContent = `NODE / ${String(source).padStart(2, '0')}`;
    element('node-type').textContent = types[n.type];
    element('ownership').textContent = f ? `${f.shape} ${f.name}` : '◇ 中立设施';
    element('ownership').style.color = f?.color || '#c5bd97';
    element('facility-description').textContent = descriptions[n.type];
    const list = demoUnits(source);
    element('unit-count').textContent = `${list.length} 个示例单位`;
    // Keep buttons mounted while toggling units or previewing routes, preserving focus.
    if (renderedSource !== source) {
        element('unit-list').innerHTML = list.map((kind, i) => `<button class="unit-button" aria-pressed="false" data-unit="${i}"><span class="unit-icon">${kind === '坦克' ? '▰' : kind === '工程师' ? '⚒' : '♟'}</span><span>${kind}<small>示例 #${i + 1}</small></span><span class="unit-check">＋</span></button>`).join('');
        element('target-list').innerHTML = neighbors(source).map(id => `<button data-target="${id}" aria-pressed="false" class="target-button" ${legalTarget(source, id) ? '' : 'disabled'}><span>${NODES[id].name.replace('前进', '')}</span><span>${legalTarget(source, id) ? '预览 ↗' : '基地不可进攻'}</span></button>`).join('');
        renderedSource = source;
    }
    for (const button of element('unit-list').querySelectorAll<HTMLButtonElement>('button')) {
        const selected = units.includes(Number(button.dataset.unit));
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.querySelector('.unit-check')!.textContent = selected ? '✓' : '＋';
    }
    for (const button of element('target-list').querySelectorAll<HTMLButtonElement>('button')) {
        const selected = target === Number(button.dataset.target);
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
    }
    element('route-status').textContent = target === null ? '选择相邻设施，预览一段道路。' : `${NODES[source].name} → ${NODES[target].name} · 合法相邻道路${units.length ? ` · 已选 ${units.length} 个示例单位` : ''}。仅作路线预览。`;
    element<HTMLButtonElement>('clear-route').disabled = target === null;
    scene.setSelection({ source, target, units: [...units] });
}
function selectNode(id: number, unit?: number, asTarget = false) {
    if (unit !== undefined) {
        if (source !== id) {
            source = id;
            target = null;
            units = [];
        }
        units = units.includes(unit) ? units.filter(i => i !== unit) : [...units, unit].sort();
    }
    else if (asTarget) {
        if (legalTarget(source, id)) {
            target = id;
        }
        else {
            element("route-status").textContent = "无法预览：请选择相邻且非基地的设施。";
            return;
        }
    }
    else {
        source = id;
        target = null;
        units = [];
    }
    sync();
}
const scene = new MapScene(element<HTMLCanvasElement>('battle-canvas'), element<HTMLCanvasElement>('minimap'), { onSelect: selectNode, onCamera: camera => {
        element('zoom-value').textContent = `${Math.round(camera.zoom * 100)}%`;
        element('camera-label').textContent = `视野 ${Math.round(camera.zoom * 100)}% · ${Math.round(camera.x)}, ${Math.round(camera.y)}`;
    }, onAssets: loaded => {
        element('asset-status').textContent = loaded ? '独立像素精灵已载入 · 地形实时绘制' : '精灵素材不可用 · 已启用程序绘制设施';
    } });
element<HTMLSelectElement>('source-select').addEventListener('change', e => {
    source = Number((e.target as HTMLSelectElement).value);
    target = null;
    units = [];
    scene.centerOn(source);
    sync();
});
app.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b)
        return;
    if (b.dataset.base !== undefined) {
        source = Number(b.dataset.base);
        target = null;
        units = [];
        scene.centerOn(source);
        sync();
    }
    if (b.dataset.unit !== undefined) {
        selectNode(source, Number(b.dataset.unit));
    }
    if (b.dataset.target !== undefined) {
        const id = Number(b.dataset.target);
        if (legalTarget(source, id)) {
            target = id;
            sync();
        }
    }
});
element('zoom-in').addEventListener('click', () => scene.zoom(.15));
element('zoom-out').addEventListener('click', () => scene.zoom(-.15));
element('reset-view').addEventListener('click', () => scene.reset());
element('home-view').addEventListener('click', () => {
    source = 0;
    target = null;
    units = [];
    scene.centerOn(0);
    sync();
});
element('clear-route').addEventListener('click', () => {
    target = null;
    sync();
});
element('minimap').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        scene.reset();
    }
});
const resizeObserver = new ResizeObserver(() => scene.resize());
function observeCanvases() {
    resizeObserver.observe(element('battle-canvas'));
    resizeObserver.observe(element('minimap'));
}
observeCanvases();
sync();
bindPageLifecycle(window, {
    suspend: () => {
        resizeObserver.disconnect();
        scene.pause();
    },
    resume: () => {
        observeCanvases();
        scene.resume();
    },
    dispose: () => {
        resizeObserver.disconnect();
        scene.destroy();
    },
});
