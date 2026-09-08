# GEM_CARD UX polish — onboarding and gameplay clarity

Status: **SOURCE COMPLETE / MANUAL PUBLIC UX REVIEW PENDING**.
Public deployment: **DEPLOYMENT_PENDING_USER_ACTION**. P12 remains **NOT STARTED**.

## Baseline and scope

- Starting checkpoint: `e8937b6 feat: redesign number tile game board`; clean `master === origin/master`.
- Baseline: 1142 tests (shared 91 / Web 224 / server 827), typecheck and build PASS.
- Web-only GEM presentation/help changes. No canonical game rules, cardset, server, shared protocol, command payloads, payment authority, session, scheduling, dependencies or package manifests changed.
- Hangul is unchanged. Number's board-centric UI, physical tile identities, colorless GROUP Joker and unordered RUN canonicalization are unchanged.
- No generic tutorial framework, tour dependency, new route, game capability or production asset.

## Beginner problem and terminology

The original screen did not clearly explain why resources buy cards, why cards provide lasting value, or which action is affordable. In particular, zero holdings could show an apparent payment of PRISM 4, even though the player owned none.

User-facing card labels, accessibility labels, selected-card explanations and final summaries now use **영구 할인 +1**, not **생산 +1/생산 할인**. Internal `productionResource` and `production` remain unchanged. Home's GEM description explains the resources → cards → permanent discounts → 18-point loop.

## Optional tutorial and always-available guide

`GemGameHelp.tsx` owns only local reading state. In a canonical GEM Lobby, first-time users see a non-blocking **간단히 배우기 / 지금은 건너뛰기** invitation. Lobby and Playing always offer **게임 방법**. Playing never opens a forced tutorial and Host start/join is never gated on reading it.

Six steps: goal 18/final round; distinct basic resources 1–2 OR PRISM 1/cap 9; purchase; accumulating permanent discounts; basic-first/PRISM-shortage payment; public reservation max 2/no reward. Previous/next, skip, complete and guide-triggered replay are supported.

`gem-card-guide.ts` stores optional `seen` at `hangul-rummikub:preferences:gem-tutorial-v1`, separate from credentials. Skip and complete mark it; reopening remains possible. Unavailable/blocked localStorage cannot break gameplay. No tutorial navigation emits a gameplay command or changes a snapshot/revision/session.

The ten-section guide covers goal, one-action turns, collect, purchase, permanent discounts, PRISM, reservation, cap 9, fair-round completion and conditional YIELD. The worked table shows printed DAWN 3 / EMBER 2, discounts 1 each, effective DAWN 2 / EMBER 1; holdings DAWN 2 / EMBER 0 / PRISM 1 pay DAWN 2 / PRISM 1. No arbitrary payment plan is offered.

Both help modes explicitly warn that the server's **45-second timer continues**. Native modal `<dialog>` provides an inert background and keyboard focus containment; heading focus, Escape/accessible close button, trigger focus return, and a stable guide-button fallback when the first-visit CTA disappears are implemented. Buttons remain at least 44px high. Long guide content scrolls vertically inside the viewport-bound dialog.

## Affordability and action clarity

`GemPurchasePreview.tsx` reads only the current snapshot:

- Card benefit first: victory points and resource-specific permanent discount.
- Table: printed cost → owned permanent discount → effective cost, floored at zero.
- Explicit current holdings.
- Affordable: actual expected basic-first payment, using PRISM only for the shortage and only when enough is owned.
- Unaffordable: **구매 불가 · 자원 부족**, missing basic counts, PRISM requirement AND owned amount, unmet remainder. It does **not** call an impossible PRISM amount an expected payment.
- Fully discounted: **할인으로 무료 / 없음 (0개)**.

`gemPaymentPreview` retains existing effective cost, basic-first and affordability semantics; explanatory fields are added. Existing command owners still send the same card source, not a client payment plan. Server validation and authoritative snapshots alone change resources, supply, cards, score and discounts. Existing stale-selection, rejection, retry/ack-loss, reconnect and sound behavior remain intact.

Context hints explain initial resource collection and affordable market/reserved cards without selecting a strategy or controlling command availability. Collect adds selected basic count / PRISM mode and projected total against cap 9; existing atomic-cap warning/availability logic remains. Purchase remains primary, reserve secondary, conditional YIELD exceptional.

## Layout and public information

Turn → market → own resources/actions → compact player summaries → optional help remains the hierarchy. The existing nine fixed market slots stay primary; the header is smaller and selected cards use a clear warm border/background while retaining keyboard focus styles.

Opponents show score, public resource counts, permanent discounts and expandable purchased/reserved card counts/details. Own large resource/discount rows are not repeated below the existing action panel. Two-column summaries collapse to one column on mobile. All public information remains accessible; no privacy policy changed.

## Files

- New: `apps/web/src/features/gem-card/GemGameHelp.tsx`, `GemPurchasePreview.tsx`, `gem-card-guide.ts`.
- Modified GEM: `GemCardPlayingScreen.tsx`, `GemCardFinishedScreen.tsx`, `gem-card-ui.ts`, `gem-card.css`.
- Minimal shared-Web integration: `features/lobby/LobbyScreen.tsx` (GEM-only entry), `features/game-catalog/game-catalog.ts` (GEM description).
- Tests: new `apps/web/src/lib/gem-card-onboarding.test.ts`; existing `gem-card-ui.test.ts` and `game-catalog.test.ts` copy expectations synchronized without removing assertions/tests.

## Validation and browser evidence

- Added **15 tests**: affordability/discount/PRISM/free cases, no snapshot mutation, first-visit/non-forced tutorial, six steps, preference/skip/completion/replay, storage failure, no command coupling, ten guide sections/examples, native modal wiring, context hints, 2/3/4-player public summaries and CSS boundary characterization.
- Final total: **1157 = shared 91 / Web 239 / server 827**, all PASS. Existing 1142 tests are retained; no skip/deletion.
- Final root typecheck, full tests and build PASS; separate targeted GEM Web/controller/sound/guide/payment and Hangul/Number Web regressions **132/132 PASS**; production-serving **6/6 PASS**; `git diff --check` PASS.
- Actual local production-build A/B browser smoke used independent `localhost` and `127.0.0.1` browser origins against the same local server, with two player sessions in one GEM room. Create/join, first-visit Lobby tutorial, six-step completion, start, unavailable selected-card preview, Collect, market reservation/refill, available preview and successful purchase were exercised. The purchased card's permanent discount became +1 through the server response.
- Refresh resumed the same room/player state with retained resources/cards, no additional player, no forced tutorial. Guide replay, skip, Escape, close/focus return, inert background and continuing turn countdown were inspected. Both captured browser console warning/error lists were empty.
- Actual viewport/DOM/screenshot inspection: **1280×720, 1440×900, 390×844, 320×568**. Market/action panels and dialog fit; no page horizontal overflow. At 320px the guide's cost example and tutorial navigation fit, with internal vertical scrolling. Responsive scope is desktop emulation, not a claim of physical Safari/Firefox/touch-device testing.
- Browser QA found and fixed two local presentation issues before closure: first-visit completion lost focus when its trigger disappeared (stable guide-button fallback), and inherited full-width buttons overflowed the mobile tutorial footer (GEM-only auto widths). These did not affect canonical gameplay.
- Existing user's public Chrome game was left untouched. Browser smoke ran in Codex's in-app browser on the local production build, **not public Railway**.

## Release/readiness limits

The visible beginner questions have explicit UI answers (find help; one action; card value; lasting discounts; PRISM; affordability/shortage; final round). This is source/browser QA, not a claim of actual first-time-user acceptance research.

No Railway deployment/configuration was performed or inferred from push. User should deploy the checkpoint, refresh the Web client, then conduct **Manual GEM_CARD beginner UX review**. Existing single-process in-memory room/session loss on redeploy remains. P12 waits for user confirmation.
