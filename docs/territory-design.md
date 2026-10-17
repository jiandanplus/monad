# 闪绘 · 街区攻防 — approved direction, 2026-10-17

User authorized upgrading existing project to multiplayer district conflict and making it fun, while preserving same-day 18:30 submission. This supersedes the free-paint product rules in docs/design.md. Existing deployed Site remains the same public Site. Never alter wallet keys or broadcast without the user's wallet confirmation.

## Rules
- 9 named districts in a 3×3 map. Each starts at integrity 50/100.
- Team 1 = 修复联盟 (mint), increases integrity. Team 2 = 涂改军团 (coral), decreases integrity. First successful cast fixes address's team for that round.
- startRound(expectedCurrentRoundId) permissionless only if no round exists or current round has ended. Each lasts exactly 180 seconds by block.timestamp. Starting a round is explicit; cast never silently starts/restarts a round.
- Skill 0 快速冲击: magnitude 18, address cooldown 5 seconds. Skill 1 全力爆发: magnitude 32, cooldown 12 seconds. Clamp integrity to 0..100. Casting against own boundary (repair100 / chaos0) reverts without cooldown or counters.
- The address cooldown applies across districts, and first valid action is immediately available. It is an address limit, not a Sybil defense.
- At end: sum integrity >450 repair wins; <450 chaos wins; ==450 tie. getRoundResult(id) computes outcome; no keeper/owner/finalize tx needed. No application fee, payable methods, deposits, prizes or random on-chain logic.
- Per-district keyed state avoids a shared per-action global counter. Snapshot derives action/participant totals from nine districts. A new address is counted only in its first district; sum of entrants is unique addresses in that round. Both factions can attack any district.
- Historical rounds retained for result verification. Frontend shows current round; restarting creates a new numbered round and clears current display histories.

## Exact Solidity/chain interface
Contract BlitzCanvas, pragma 0.8.30, constants ROUND_DURATION=180, DISTRICT_COUNT=9.
startRound(uint256 expectedCurrentRoundId) external; cast(uint256 expectedRoundId,uint8 district,uint8 team,uint8 ability) external. Both reject mismatching round IDs to prevent delayed wallet confirmations affecting a different round.
getSnapshot(address viewer) view returns (uint256 roundId,uint64 startsAt,uint64 endsAt,uint16[9] integrity,uint32[9] actions,uint32[9] entrants,uint8 viewerTeam,uint64 nextActionAt,uint64 chainTime).
getRoundResult(uint256 roundId) view returns (uint16 repaired,uint8 winner,bool ended). Unknown round reverts. winner=0 while active,1 repair,2 chaos,3 tie.
event RoundStarted(uint256 indexed roundId,uint64 startsAt,uint64 endsAt,address indexed starter).
event DistrictHit(uint256 indexed roundId,uint8 indexed district,address indexed actor,uint8 team,uint8 ability,uint16 beforeIntegrity,uint16 afterIntegrity).
Errors can be descriptive require strings. No owner/admin, no force-stop, no external calls.

## UX
Chinese polished arcade command center, readable desktop/mobile, 3×3 animated pixel city, faction selection, skill buttons, targeted district, current repair ratio, 3-minute countdown, clear network/round/status, cooldown, tactical feedback, recent bounded on-chain log, fullscreen projection and QR sharing. Confirmed actions trigger feedback; pending transactions distinct. End screen states winner and has explicit next-round button.
Before deployment: prominent LOCAL SIMULATION practice with clearly labeled simulated rival, local counts and results separated from chain. Do not present simulation as multiplayer or chain verification. Practice is playable and reactive: rival checks for an action every 2.5s, respecting actual 5s/12s skill cooldowns; user skills have same cooldown; faction fixed after first cast; end states match contract. Live spectator mode no wallet required. No fabricated live activity/statistics.

Wallet selector discovers EIP-6963 providers, fallback window.ethereum/providers if needed, lets user choose (no silently forcing an installed wallet). Label selected wallet. Unsupported network error suggests enabling Backpack Developer Mode/Testnet or using a wallet supporting custom EVM testnets; do not promise all versions support it. Switching providers clears cached address and event listeners. Fixed Monad Testnet 10143 only; no API key/private key collection.

Deployment v2 artifact, new pending key prevents legacy deployment auto-recovery. Exact runtime code check rejects old contract. Persist replacement deployment tx hash and preserve explicit shared links. Poll every 3s, one in flight, no stale cross-contract/round/log writes. Countdown uses chainTime+elapsed since receipt as estimate, marks expired when endsAt passed, and contract remains authoritative. Refresh before sends and after receipt. Local mode never affects live state.

## Acceptance
Contract local EVM tests: no round, permissionless start, no active restart, exact180sec expiry, both abilities/clamp, team lock, global-address cooldown, invalid inputs, saturation reject no counters, cross-district unique count, ended casts reject, result/tie/history, attached funds reject.
Model tests match deterministic rules, clock/cooldown and practice isolation. Wallet tests include multiple providers and unsupported network. Build/typecheck; browser practice skill, opponent, cooldown, switching, win/loss/end, sharing, no-wallet errors. Independent final source review. Public Site updated, source/docs updated. Real chain deployment/two-wallet acceptance/Mojo submission still require actual evidence and GitHub URL.
