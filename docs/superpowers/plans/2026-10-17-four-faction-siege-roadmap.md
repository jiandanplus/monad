# Four-Faction Siege Delivery Roadmap

**Goal:** 将已确认的五分钟据点攻防扩展为四方对称、默认8席、最多16席的真实交易策略游戏。

**Architecture:** 新规则进入独立的SiegeCanvas合约、纯规则模块和页面入口。保留现有BlitzCanvas合约与公开版本10；逐阶段验证，不把模型、真实EVM或测试网实测混称为同一种验收。

**Tech Stack:** 沿用当前项目的原生TypeScript、Vite、viem、Solidity 0.8.30、Node内置测试和Ganache；本路线图不新增依赖。

## Global Constraints

- 局长300秒，四阵营1..4，13节点0..12，每阵营1至4席，默认2席。
- 每次招募、调遣、修筑、修复均为真实nonpayable交易；军费是阵营共享局内数值。
- 新版本独立入口；当前公开版本10继续保留。
- 钱包签名由用户完成，禁止公开测试私钥参与测试网；域名钱包风险提醒保持如实报告。
- 用户已取消GitHub上传，保持取消；Mojo提交状态单独报告。

权威规则：[四阵营规则](../specs/2026-10-17-four-faction-siege-design.md)。本文件是分阶段依赖与验收路线图，只有A阶段另附可逐步执行的代码计划；B至E需要在执行前按各自范围展开详细计划，不能把本路线图视为完整实现或完成证明。

## A. 固定地图与补给模块

详细执行计划：[四方地图与补给](2026-10-17-four-faction-supply.md)。

新增文件：`src/siege/config.mjs`、`src/siege/supply.mjs`、`test/siege-supply.test.mjs`。

输出稳定接口：

```ts
FACTIONS: readonly {id: number; name: string; color: string; shape: string}[]
HOME_BY_TEAM: Readonly<Record<number, number>>
NODES: readonly {id: number; kind: 'base'|'mine'|'tower'|'factory'; baseTeam: number}[]
EDGES: readonly (readonly [number, number])[]
neighbors(node: number): number[]
supplied(owners: readonly number[], team: number): boolean[]
rates(owners: readonly number[], team: number): {income: number; score: number; connected: boolean[]}
```

验证四向旋转、四基地最短距离相同、备用路线、切断/恢复、敌方不可借道与无效输入；输出当前每秒速率，不承担时间积分。通过条件：独立测试通过且旧测试不受影响。

## B. 确定性战斗、资源积分与名单模型

新增文件职责：

| 文件 | 责任 |
|---|---|
| `src/siege/combat.mjs` | 三轮同时伤害、城区、工事、目标优先级、残血与占领判定 |
| `src/siege/roster.mjs` | 4/8/12/16席、唯一地址、同人数、名单版本、逐席ready |
| `src/siege/model.mjs` | 回合、部队容量、来源冷却、军费积分、版本保护、工程操作 |
| `test/siege-combat.test.mjs` | 精确战斗案例，双方同时死亡、坦克不能占领、工程师空点接管 |
| `test/siege-model.test.mjs` | 断线积分、恢复不补发、300秒截止、共享军费争用、失败不改变状态 |

跨文件接口约定：

```ts
type Unit = {kind: 0|1|2; hp: number};
type BattleInput = {attackers: Unit[]; defenders: Unit[]; city: boolean; fortified: boolean};
type BattleResult = {attackers: Unit[]; defenders: Unit[]; captured: boolean; pulses: number};
resolveBattle(input: BattleInput): BattleResult;
```

纯模型使用整数秒与传入的`now`，禁止读取墙钟。`resolveBattle`不修改输入，不处理钱包或资源；模型校验版本后才结算和移动。错误动作返回明确错误且保持原状态。时间积分先结算四方旧速率，再改变领土，防止断线之后继续得分或恢复补发。

通过条件：全部规则案例有具体期望数值；四方换色/旋转等价；模型只用于预测与测试，不作为生产假链回退。

## C. 独立合约与真实EVM对照

新增：`contracts/SiegeCanvas.sol`、`scripts/compile-siege.mjs`、`src/generated/SiegeCanvas.json`、`test/siege-contract.test.mjs`。

接口采用规则第8节的完整参数；合约必须有当前快照、指定历史回合快照、名单/ready状态和事件，读取接口的具体ABI在本阶段计划中锁定，再交给D阶段使用。所有状态循环有界，单节点最多12单位、单次最多6单位、最多16席。Solidity目标与当前构建一致：0.8.30、Shanghai、viaIR、optimizer 200。

通过条件：真实本地EVM与B模型逐项对照，包括四方轮换、所有战斗规则、名单变更后旧ready失败、新局重新ready、16席、旧回合/节点版本拒绝、两名队友同时消费军费/调同一部队、回退原子性。记录交易gas、代码体积和实际存储读写；不将旧合约的并行性结论套用到共享军费的新合约。

## D. 链适配与四方像素指挥界面

新增：`siege.html`、`src/siege/main.ts`、`src/siege/chain.ts`、`src/siege/scene.ts`、`src/siege/style.css`。地图世界拆分为`src/siege/map-data.mjs`（64×64地形、13设施、20道路折线）、`src/siege/camera.mjs`（投影、镜头、缩放、拾取）、`src/siege/assets/`（独立地形/建筑/部队资源）。

复用当前`src/wallets.ts`的钱包发现；从已有签名会话保护中提取共用模块前，先确保旧版回归测试覆盖不下降。新合约适配不复用旧9点/2阵营快照解析器。

界面必须提供四方排行榜、队友与ready状态、13节点固定道路、补给线、残血部队、生产/调遣/工程面板、真实签名地址、预计战损/来源空虚提示及已确认战报。每笔指令只有回执成功并读到一致区块快照后改变权威地图；拒签、回退、超时和钱包切换分别显示。新页面无模拟按钮或本地AI敌军。

用户要求地图达到游戏战场的空间与交互体验。D阶段先制作等距地形、摄像机、小地图、建筑和单位点选的独立视觉验收版本，再连接真实快照与交易。固定镜头朝向，世界可平移缩放；图层深度与遮挡正确，部队沿可见道路/桥面回放。概念图仅作风格参照，成品由地形格和独立对象渲染。视觉验收版本不得显示为可联网实战；没有C阶段合约时不提供假的出兵或假交易。

通过条件：桌面/窄屏可操作，四种颜色同时配合名称和形状；镜头缩放/平移后点选准确、小地图视窗同步、20道路与权威边表一致、行军回放不穿越不可通行地形；无钱包只读可看战场；重复点击不会重复发单；授权地址切换会中止旧会话；旧版默认入口保持可用。

## E. 测试网、多人验收与发布

1. 新版在独立入口先完成部署、名单、逐席ready与开局。至少4个不同可签名私人钱包各属一方；签名与测试币由用户配合。
2. 每方各有真实调遣，验证队内共享操作、断补给与恢复；无钱包读端以同一区块复核归属、部队、余额、积分与事件。
3. 报告实际地址数/实际同场人数、16席本地验证与测试网执行记录，不能相互替代。
4. 关键项通过后再更新默认入口和公开源码包；使用相同构建产物验证下载哈希。
5. Mojo提交与GitHub字段单独处理：用户取消上传的选择不变，必填字段仍须如实解决，不能声称已参赛提交。

18:30是用户提出的冲刺目标，不能用减少真实链验收来换取“完成”表述。若到时仍有未完成项，应交付可验收部分和准确缺口。

## 当前进度

- [x] 五分钟实时据点攻防方向获得用户确认。
- [x] 新增两个阵营与多人要求纳入规则。
- [x] 四方规则、阶段依赖、A阶段详细计划写入本地文档。
- [ ] A阶段实现与验证。
- [ ] B至E阶段实现与验证。
- [ ] 新版公开切换与参赛提交。
