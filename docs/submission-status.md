# 参赛交付状态（2026-10-17）

团队：SpiritMan。项目：闪绘 · 像素据点战 / BlitzCanvas，v0.4.0。

- 正式游戏：https://blitzcanvas-monad-20261017.hardy369.chatgpt.site/
- 只读等距地图：https://blitzcanvas-monad-20261017.hardy369.chatgpt.site/map
- 目标公开仓库：https://github.com/jiandanplus/monad
- 源快照：Sites 版本 12，原源码提交 `fb07b898de1942b63b0aed0bc4e902d069b5eb44`（17:55:30 上海时间发布）。

## 真实链上证据

网络为 Monad Testnet，chainId 10143。合约 `0xfF0c32C5e82FB2b4B4ec049779873E83d43a4d5C`；部署区块 71778049；部署交易 `0x24be4d321393335d21cafc053b107bf1a6cb790fce7405cd6b3dabe02d60bbf7`。此前独立 RPC 核验已确认运行代码逐字节匹配当前 4,973 字节编译产物。

第一轮开局交易 `0x5fc3d1008456bbc136c4334a3c7a734ef63f2c3cdc386ceaa14e8d4c85c770df` 成功，区块 71779168。该轮 180 秒现已结束。

调遣交易 `0xd348233a5a89b08814ebffe1f5c1cff1375b72dcb8eceee5becb475b1ecd1b65` 成功，区块 71779241，实际 calldata 为 `cast(1,1,1,0)`。事件表明翡翠联盟步兵将陆家嘴驻军从 20 减至 2，仍为中立；spent=20，pointsAfter=80。独立无钱包读端看到同一变化。gas=202720，实际费用 0.0206652768 测试 MON。

目前只核验一方真实调遣，第二阵营交易尚未完成。不能宣称双阵营实战、四阵营链上对局或实测网络 TPS。不同地址攻击不同中立点且未占领时无应用存储冲突的结论，来自本地真实 EVM SLOAD/SSTORE 轨迹，覆盖范围严格限定于该场景。

18:04（上海）独立公共 RPC 再次校验，区块 71792741 的运行代码匹配；快照总行动为 1，双方分数 180:180。公开数据见 [real-orders-live-proof.json](real-orders-live-proof.json)，成功交易截图见 [dispatch-receipt.png](images/dispatch-receipt.png)。记录明确保留 `twoFactionAcceptancePassed=false`。

## 地图预览边界

四阵营等距地图仅用于交互验收。基地、部队与设施为示例；没有新版合约，没有钱包交易，没有真实多人战果。原两阵营游戏仍是默认入口，合约、钱包、部署配置与原实战版本保持一致。

## 测试与已知限制

本次新仓库快照复验全量 79 项测试通过（0 失败、0 跳过），合约重编译、类型检查与双入口生产构建通过。测试覆盖本地真实 EVM、规则模型、钱包与交易状态、地图交互模型等；不代替真实测试网多人验收。

公开站点曾出现 MetaMask 风险警告，其原因及解决状态未确认。已有签名验证使用本机构建；请勿关闭钱包保护。地址数量不等于独立玩家数，单笔费用不等于平均费用。

本文件记录代码与证据范围；GitHub 发布、演示视频上传、Mojo 表单提交是否完成，以相应平台的实际回读为准。文档中的路线图及现场演示步骤不构成完成证据。
