# Territory Upgrade Implementation Plan

> Execute continuously with subagent-driven-development. Rules and signatures in territory-design.md are authoritative.

**Goal:** Replace free paint with an enjoyable three-minute multiplayer district battle and publish today.
**Architecture:** One permissionless round-based contract; frontend renders9 districts with skill/cooldown/result. Public reads separated from wallet; local simulator mirrors deterministic rules and labels rival as simulated.
**Tech stack:** Keep existing Solidity/solc/Ganache/Node/TypeScript/Viem/Vite/qrcode; no new runtime services.

## Global constraints
9 districts, integrity50 initial, range0..100; 180sec rounds; team1 repair/team2 chaos; ability0 magnitude18/cooldown5sec, ability1 magnitude32/cooldown12sec. Strict rules/interface docs/territory-design.md. Wallet keys remain in user's wallet. Local practice never appears as chain state. Same public Sites project; no production old contract assumed deployed. Do not touch session work/mojo credential.

## Task 1 Contract
Own contracts/BlitzCanvas.sol, scripts/compile.mjs, test/contract.test.mjs, src/generated/BlitzCanvas.json. Write behavioral local EVM tests, observe red against old contract, implement exact new interface. Store per-round per-district keyed state, derive totals in views, per-round per-address team/cooldown. Test full time/round/result/invalid/value acceptance then compile artifact. Report actual evidence. No concurrent edits to frontend.

## Task 2 Frontend
Own index.html/src/main.ts/src/style.css. Consume parent model and chain APIs in dedicated brief. Render meaningful arcade gameplay, local AI practice with visible labels, on-chain spectator, confirmed effect/pending state, choose faction+skill+district, countdown/cooldown/round ending, share QR/fullscreen/deploy/recover. All async failures recover. Strict build after dependencies exist. Parent browser QA.

## Task 3 Integration
Parent owns src/model.mjs/src/chain.ts/src/wallets.ts and tests; model mirrors contract, independent local simulator; chain parses exact snapshot, event filter round, wallet discovery and selection. Tests first red→green, then new implementation. Preserve receipt recovery/explicit-link authority. Update README/pitch/source archive and verification script for rounds. Broad independent review after integration; repair findings, check build and browser practice flow, publish via existing Sites identity/source helper. Record actual remaining chain/GitHub/submission dependencies.
