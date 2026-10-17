# Four-Faction Live Siege Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task, with an independent task review and final whole-change review.

**Goal:** 完成已确认的四阵营300秒据点攻防，等距地图读取SiegeCanvas真实快照，每次名单、ready、开局、招募、调遣、修筑、修复均由钱包发送真实交易，准备私人钱包验收。

**Architecture:** 在保留既有BlitzCanvas和地图预览的基础上增加独立SiegeCanvas、纯规则模型、真实链适配器及`siege.html`。合约是唯一权威，模型用于战损预览和本地EVM对照；签名、回执、同块快照之间不产生本地战果。

**Tech Stack:** 原生TypeScript/Vite、viem、Solidity0.8.30 Shanghai/viaIR/optimizer200、node:test、Ganache，不新增依赖。

## Global Constraints

- 局长300秒，四阵营1..4，13节点0..12，每阵营1至4席，默认2席。
- 每次招募、调遣、修筑、修复均为真实nonpayable交易；军费是阵营共享局内数值。
- 新版本独立入口；保留当前已提交版本13、BlitzCanvas合约及视频，钱包验收前不切默认入口。
- 精确规则见`../specs/2026-10-17-four-faction-siege-design.md`第2至9节；历史文档“取消GitHub/未提交Mojo”已被用户后续指令与项目420的实际提交覆盖，不再适用。
- 不自动签名、不使用公开私钥、不绕过钱包风险警告；未知快照不生成示例兵力，不以本地模拟替代链上交易。
- 当前检出路径`work/four-faction-implementation`，分支`feat/four-faction-siege`，基线`b1bb622f832a478174582e23ed5d4029b03bae2d`。只在明确文件范围内修改；所有shell命令带`rtk`前缀。
- 战斗按每轮开始时存活单位计算两方伤害；汇总到目标类别后，对防守步兵先做floor(damage*75/100)，再对工事做floor(damage*80/100)。三轮后消耗工事；优先级与低hp/原始索引规则不变。
- 索引为当前有序活单位数组的索引，必须严格递增；任何变动增加节点version，来源行动冷却3秒。返回部队放在未出发部队后，残血不恢复。

## Locked chain interface

```
configureRoster(uint256 expectedRosterVersion,address[] players,uint8[] teams,uint8 seatsPerFaction)
ready(uint256 expectedRosterVersion)
startRound(uint256 expectedRoundId,uint256 expectedRosterVersion)
recruit(uint256 expectedRoundId,uint8 node,uint32 nodeVersion,uint8 kind,uint8 count)
dispatch(uint256 expectedRoundId,uint8 from,uint8 to,uint32 fromVersion,uint32 toVersion,uint8[] unitIndexes)
fortify(uint256 expectedRoundId,uint8 node,uint32 nodeVersion)
repair(uint256 expectedRoundId,uint8 node,uint32 nodeVersion,uint8[] unitIndexes)
getLobby() -> (address host,uint256 rosterVersion,uint8 seatsPerFaction,address[] players,uint8[] teams,bool[] readyFlags)
getSnapshot(uint256 requestedRoundId) -> Snapshot
```

`requestedRoundId=0`代表当前回合；尚未开局时返回roundId=0、所有部队为空，不伪造初始化。查询不存在的正数回合回退。Snapshot是命名struct，字段顺序固定：`uint256 roundId,uint64 startsAt,uint64 endsAt,uint64 blockTimestamp,uint256 rosterVersion,uint8 seatsPerFaction,address[] players,uint8[] teams,NodeView[13] nodes,uint256[4] funds,uint256[4] scores,uint8[4] incomeRates,uint8[4] scoreRates`。NodeView字段：`uint8 owner,uint32 version,uint64 cooldownUntil,bool fortified,uint16[] units,bool supplied`。单位编码`(kind<<8)|hp`，零仅为空，不存死亡单位。

事件：`RosterConfigured(uint256 indexed rosterVersion,uint8 seatsPerFaction)`、`PlayerReady(uint256 indexed rosterVersion,address indexed actor)`、`RoundStarted(uint256 indexed roundId,uint64 startsAt,uint64 endsAt)`、`OrderExecuted(uint256 indexed roundId,address indexed actor,uint8 indexed action,uint8 from,uint8 to,uint8 team,uint32 fromVersion,uint32 toVersion,uint16 spent,bool captured,bool returned,uint16[] deployed,uint16[] survivors)`。action0/1/2/3对应招募/调遣/修筑/修复。非调遣from=to=node；deployed记录本次选出发或招募的真实单位，survivors记录战后进攻方幸存者；只有真实事件可触发回放。

## Task 1: 纯规则、补给、战斗与名单模型

**Files:** 新增`src/siege/{config,supply,combat,roster,model}.mjs`及对应`test/siege-*.test.mjs`；不改旧版文件。

**Interfaces:** `config`导出`FACTIONS,HOME_BY_TEAM,NODES,EDGES,ROUND_SECONDS,UNIT_STATS`；`supply`导出`neighbors(node),supplied(owners,team),rates(owners,team)`；`HOME_BY_TEAM`为冻结对象{1:0,2:2,3:1,4:3}，NODES条目为{id,kind,baseTeam}，FACTIONS条目为{id,name,color,shape,base}，rates返回{income,score,connected}；`combat`导出`resolveBattle({attackers,defenders,city,fortified}) -> {attackers,defenders,captured,pulses}`，Unit=`{kind:0|1|2,hp:number}`，无输入修改。

`model`导出`createRound({roundId,rosterVersion,seatsPerFaction,players,teams,now})`、`snapshot(state,now)`、`applyOrder(state,order,now)`。Round保存13节点和四方经济检查点；order包含`actor,expectedRoundId,type`及对应ABI参数。返回新状态或抛明确错误，输入保持不变。snapshot与链Snapshot字段匹配但units使用Unit数组。`roster`导出`createLobby(host,seats=2),configureRoster(lobby,{actor,expectedVersion,players,teams,seatsPerFaction,active}),markReady(lobby,{actor,expectedVersion}),consumeReady(lobby,{actor,expectedRoundId,expectedVersion,active})`，consume增加roundId并清空ready。

- [ ] 写失败测试并记录RED。道路四向对称、各基地距离中心3、备用补给路径、断线/恢复/敌方不可借道、输入拒绝。
- [ ] 完成配置/补给。可读取`work/four-faction-plan-check`的既有草稿供参考，但必须核验，不把旧草稿测试当新完成证据。
- [ ] 实现战斗与测试：平原2步兵攻1坦克失败（坦克剩9hp）；城区2步兵守1坦克胜（1步兵剩2hp）；同时死亡留旗、坦克清空不占领且返回、工程师接空点、纯工程师有守军拒绝、工事整数减伤、残血和优先级。
- [ ] 实现名单与模型：4/8/12/16席，重复/零地址/不均衡拒绝，旧名单ready拒绝，开局后ready清空；回合/节点版本、来源冷却、友军容量、工程条件和费用、300秒截断、占领前先结算、恢复不补发、上限200、共享军费与来源竞争失败原子性。
- [ ] focused测试及完整现有测试通过，提交并写报告。边界用具体期望值；不以源代码正则作为玩法行为证据。

## Task 2: Solidity新合约与真实本地EVM

**Files:** `contracts/SiegeCanvas.sol`,`scripts/compile-siege.mjs`,`src/generated/SiegeCanvas.json`,`test/siege-contract.test.mjs`；`package.json` compile串联两个合约且版本0.5.0；锁文件只同步版本，不增依赖。

- [ ] 先写真实EVM失败测试，部署者为host，ABI严格按上节，所有方法nonpayable，所有循环有界。
- [ ] 实现名单、逐席ready、host开局与历史快照；历史保存当局名单。active禁止改名单/重开局；下一轮重新ready。错误回退原子。
- [ ] 领土变更前settle所有队伍旧速率；其他经济操作settle本队，查询计算到min(block.timestamp,endsAt)。基地不可攻击，断线停对应收益，恢复不补发。版本和冷却阻止队友使用旧选择。
- [ ] 与Task1模型逐项对照，至少覆盖4/8/12/16席、四阵营实际调遣、招募/工程/战损/补给中断恢复/截止/旧版本与军费竞争/历史名单。包含完整真实EVM控制路线案例，不用生产mock代替。
- [ ] 记录编译字节码长度与代表性交易gas；确认最大循环路径gas低于15M。完整测试/构建通过，提交并写报告。只记录本地EVM，不宣称测试网部署或多人通过。

## Task 3: 四方真实链适配与交易保护

**Files:** `src/siege/chain.ts`,`src/siege/types.ts`,`src/siege/transactions.mjs`及声明与行为测试。可复用`src/wallets.ts`的已授权provider发现；不改旧快照解析器。

- [ ] 新adapter校验chain10143、运行代码与新artifact完全一致；部署/恢复回执必须确认代码来源。读lobby与snapshot均固定同一已获取blockNumber，返回blockNumber与blockTimestamp。
- [ ] 写请求锁定provider、账号、chain、合约和全部ABI参数。发前重读版本与账户；重复点击同一个待处理订单不发第二笔。拒签、回退、替换、超时、未知状态明确区分，无自动重发。
- [ ] 回执核验to/from/status、实际calldata参数、该合约事件的round/actor/action/from/to及版本；只有确认后读到receipt.blockNumber或更高的一致快照才标记已确认。未知回执保持未核验。
- [ ] 本地EVM通过adapter读真实快照/事件与下单；针对账户/网络切换、过期版本、回执不匹配、超时与重载复核测试。提交并写报告。

## Task 4: 将等距地图接入真实状态与多人指挥UI

**Files:** `siege.html`,`src/siege/main.ts`,`src/siege/scene.ts`,`src/siege/style.css`,`src/siege/map-data.mjs`及声明；`vite.config.mjs`新增第三入口。复用现有独立地图资源与纯投影/道路数据，保留`map.html`只读预览。

- [ ] MapScene新增快照输入，13节点实际owner/units/hp/fortified/supplied/version，单位最多12且动态拾取；没有有效快照时不渲染示例军队。绘制真实补给连接、四方旗帜和断线状态。沿20权威道路回放已确认事件，保留平移缩放、小地图、深度排序。
- [ ] HUD：四方榜、军费/得分/收入/塔数/席位、回合与300秒倒计时估算、实际签名地址；名单每方1..4行、ready状态、host开局。房主编辑名单不暗中代签他人ready。
- [ ] 来源→实际单位1..6→相邻目标→预览→显式确认。显示派走后守军、预期战损、断线警告。招募/工事/修复各自交易；所有权威兵力只在真实快照更新。含键盘/触屏控件、右键目标、同源框选最多6。
- [ ] 未部署时明确显示部署/恢复面板；无钱包旁观可读，拒绝错误chain/代码/快照，不会显示可出兵假战场。回执状态面板与确认后战报，不提供practice/bot/simulate按钮。
- [ ] 行为测试与桌面/手机实际浏览器QA：选择稳定、12兵拾取、交易锁、断线展示、窗口生命周期、未知快照、名单与错误反馈。完整构建，提交并写报告。

## Task 5: 集成审查、发布与钱包验收准备

**Files:** 新版使用部署说明、`public/siege-deployment.json`（无真实新地址时不伪填）、只读核验脚本、source.zip与outputs状态记录。

- [ ] 独立最终代码审查，修复Critical/Important并复测。全套测试/构建一次，实际浏览器对本地EVM完成四方加入ready、招募调遣、攻占、断线和恢复；明确标为本地验收。
- [ ] 新版`/siege`独立入口发布，保留参赛默认入口和已有视频；同一已公开Sites项目，GitHub同步清理过的源代码，保留已有历史不用force push；未通过钱包验收不改Mojo为四阵营已上线。
- [ ] 请用户配合：四个不同可签名私人地址、每席ready、新合约部署与开局、每阵营至少一次真实调遣、真实断线恢复。每笔最终签名由用户完成。
- [ ] 记录真实合约/交易/区块和独立无钱包读端；缺少用户签名时交付可验收入口与精确清单，不宣称真实链上多人已通过。
