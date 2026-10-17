# Experience redesign — user authorized 2026-10-17

User says current UI is too crude, interaction weak and visuals poor. Upgrade presentation and interaction fully, preserving contracts, game rules, network safety, source/public publishing authorization and pending competition delivery. Taste returned no learned profile or saved matching references; design is based on explicit feedback, not invented personal preferences.

## Direction
Immersive isometric city arena (actual Canvas2D procedural scene) instead of nine dashboard cards. Deep midnight blue environment, cyan repair vs hot coral chaos, restrained violet/ivory HUD. Compact brand/mode/wallet header, battle score/time strip, large responsive city scene, 300–340px commander rail and reachable skills/fire. Primary gameplay is visible in desktop first viewport; no oversized marketing hero. Mobile has a shorter world and large controls, no horizontal overflow or canvas intercepting page scroll. Accessible alternative district controls mirror canvas selection.

## Interactions
- 3-step first-play hint: choose side → select district → cast. Main scene has hover target, selected beacon and an obvious confirmation action.
- Local practice does not start its180s clock or simulated rival until the first valid human action. New round resets it to waiting-first-action.
- Show selected target, current integrity and clearly labeled projected impact (clamped18/32); live prediction never modifies confirmed state.
- Distinct skill icons, powers/cooldowns and active selection; visible progress/cooldown on fire. Every disabled action explains why. Successful confirmed hit triggers ring/particles/floating delta and optional synthetic audio. Pending distinct, no fake state changes.
- Live/unconfigured/failed RPC/end-result state clear, idle practice never claims real chain action. No fabricated activity/online counts. Preserve shared refresh promises, account generation guards, authoritative chain-time outcome, expectedRoundId sends, runtime check, deployment recovery/explicit links, wallet selection.
- Keyboard hints:1/2 skill, arrows change district; do not cause implicit chain transactions from generic Space/Enter. Focused native fire remains keyboard usable. Escape closes dialogs and presentation mode.
- Sound default off, user toggles, no external audio. prefers-reduced-motion honored including JS scene. No continuous screen shake; hit local and short.
- Rules/help/share/deployment in proper dialogs or collapsible region; current mode and source link obvious. Wallet custom data uses textContent. Dialog focus/cancel works.

## Work units
Scene unit: src/battlefield.ts + src/scene-math.mjs + test/scene.test.mjs, no chain/model mutations. Exports createBattlefield API in shared brief.
UI unit: src/main.ts/src/style.css/index.html consumes scene and existing chain/model, src/audio.ts if needed. Tests browser behavior; root will independently verify. Keep readable functions/files, no one-line application.
Parent: source review, tests/build, desktop + mobile practical checks where supported, package/deploy same public Site, screenshot and delivery. No new npm dependency, external image/font/CDN service required.

## Acceptance
Existing23tests pass. Scene math hit-test/project tests; visual scene identity, hover/selection and effects. Main practice firsthitstart, target/skill/fire/cooldown, opponent, mode isolation, no-wallet error and dialogs, complete end/restart. 1440desktop firstscreen mainactions, compact viewport and mobile responsive. Publish and verify actual public state. Real chain deployment still needs user's wallet and public GitHub URL for Mojo.
