# Isometric Battlefield Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户已选定的等距像素方向，交付可拖动缩放、通过小地图导航、点选设施与示例驻军的独立地图入口。

**Architecture:** 只读地图演示与当前链上游戏隔离；一份纯地图/相机模块作为渲染、拾取、道路与测试的共同依据。Canvas对象层分别渲染地形、道路、设施、树木和部队，HTML只承担HUD与可访问控制。

**Tech Stack:** 现有Vite/TypeScript、原生Canvas2D、Node内置测试；不新增依赖。

## Global Constraints

- 保留当前默认入口、旧合约、部署配置与钱包流程。
- 四阵营、13节点、20道路与四阵营设计一致。
- 页面固定标注“地图交互预览 / 示例驻军 / 未接入新版合约”；无钱包请求、无假交易、无假分数或在线人数。
- 固定等距视角，平移、0.5至2倍缩放、小地图导航、建筑与来源内驻军点选、相邻道路预览。
- 概念图不是运行时背景；实际地图由地形与独立对象组成。
- 原图与资源来源记录保存在会话outputs；运行时素材放入项目public/map-assets。

## Task 1: 可交互地图与隔离入口

**Files:** Create `map.html`, `src/map-preview/main.ts`, `src/map-preview/style.css`, `src/map-preview/world.mjs`, `src/map-preview/scene.ts`, `test/map-preview.test.mjs`。

**Interfaces:** `world.mjs`导出只读FACTIONS、NODES、EDGES、ROUTES；`project(x,y)`与`unproject(x,y)`是64×32地形投影的互逆；`screenToWorld(camera,x,y)`与`worldToScreen(camera,x,y)`互逆；`zoomAt(camera,zoom,x,y)`保留光标下的世界点并限制缩放；`neighbors(id)`使用20条权威边；地图和小地图消费同一坐标/道路。camera含`x,y,zoom,width,height`，表示视窗中心世界坐标和CSS像素大小。scene提供destroy/resize/centerOn/setSelection，销毁后移除监听与帧请求。

- [ ] Step 1: 先写真实纯函数测试，覆盖投影逆变换、平移缩放后点选坐标、光标缩放锚点、地图边界、小地图转换、四方等长道路、全部20条道路与边表一致、合法相邻目标及非法目标拒绝。
- [ ] Step 2: 运行`rtk proxy node --test test/map-preview.test.mjs`，先确认缺少模块/接口的预期RED，记录结果。
- [ ] Step 3: 实现world模块和所有上述接口；只支持整数有限节点ID，非法输入抛明确错误；世界投影只定义一次，使用者不复制另一套数学公式。
- [ ] Step 4: 实现连续像素地形与独立对象渲染。四角基地/矿/通信塔/中央工厂均有可命中区域；道路按ROUTES绘制，水面交叉处绘桥；楼体与树木按脚点深度排序。优先消费`/map-assets/siege-atlas.png`，按`/map-assets/siege-atlas.json`中检查过的显式矩形读取。生成结果未严格对齐4×2网格，因此不能均分裁切。素材加载失败显示状态并使用原创程序绘制对象，页面不可崩溃。
- [ ] Step 5: 实现点击设施、来源内单位选择、相邻目标道路预览、拖拽空地、WASD、锚点缩放、缩放按钮、重置全图、回基地、小地图点击与视窗框。拖动超过阈值不触发点击；键盘焦点位于输入/按钮时不窃取按键；pointercancel终止拖动。
- [ ] Step 6: HUD包括四方图例、选择信息、当前驻军示例构成、可达目标和操作提示。HTML控件与Canvas互为入口；窄屏不溢出，主画面保留足够高度。未选择任何对象也能操作镜头。路线预览不修改兵力、归属，不播放已确认战果。
- [ ] Step 7: 运行纯函数测试与原测试集，修复实现后GREEN；`rtk proxy npx tsc --noEmit`通过。独立用`map.html`作为Vite构建输入验证产物，默认index构建行为保持原状。
- [ ] Step 8: 在真实浏览器验证地图初始画面、选择、拖动、缩放、小地图、窄屏与资源失败降级；保存截图。确认原入口仍可打开。
- [ ] Step 9: 仅提交本任务文件，记录测试命令、结果和提交号；生成独立审查包，处理重要问题后复核。

## Task 2: 可交付预览与文档

- [ ] 将地图静态构建放到独立`/map.html`入口，不改当前游戏默认入口；提供本地可用链接并打开供用户查看。
- [ ] 在项目README增加地图入口、交互、预览边界和验证方式；记录素材生成工具与提示词。
- [ ] 完成独立审查、测试与实际浏览器验收后，才报告地图交互版本完成。四阵营合约、真实调遣、补给积分和正式多人验收仍按总路线图B至E推进，不由本预览替代。
