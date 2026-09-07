# GEM_CARD P11C — Web gameplay

> Starting checkpoint: `cc20977 feat: integrate gem card server`
> Baseline: 1083 = shared 85 + Web 180 + server 818.
> Status: **SOURCE COMPLETE / MANUAL PUBLIC VERIFICATION PENDING** (2026-09-08).
> Public deployment: `DEPLOYMENT_PENDING_USER_ACTION`; P12 verification remains separate.

## Scope and ownership

The current Web advertises exactly `HANGUL_TILE`, `NUMBER_TILE`, `GEM_CARD` and unchanged snapshot versions `[2, 1]`. Home offers three concrete games. GEM create explicitly supplies `GEM_CARD`; join/resume still use canonical Room identity and existing credentials, never a client-selected join game type. Invitation URLs remain `/room/{ROOM_CODE}`.

Strict shared V2 validation precedes the dedicated GEM decoder branch and concrete Playing/Finished routes. GEM never passes through either tile-game adapter. The existing platform Lobby handles Host/2–4 connected player readiness. There is no GEM V1, renderer registry, GameModule, generic Card engine, fake Rack or private-state bridge.

GEM-specific presentation, preview and local selection state live under `apps/web/src/features/gem-card/`. The existing realtime client validates each exact command/ack and the existing page controller owns canonical snapshot ordering, authentication/session lifecycle, request retry and the shared single-flight primitive. Server/shared/domain contracts remain P11B's source of truth.

## Original visual direction

The UI is authored from the project's cream/navy palette and the actual information needs: a prominent turn strip, three tier rows of three fixed card slots, and a separate resource/action area. Resource labels and letter markers distinguish identities without relying on color. No third-party card frame, artwork, icon package, sound asset or commercial dataset was used.

`보석 카드 게임` remains a descriptive working title, not a release-cleared brand. The P10 original-only and review-before-release policy remains in force. Independent UI authorship is not a legal non-infringement determination. Naming, visual/product review and public three-game verification remain P12/release gates.

## Market and public player information

Every tier retains three fixed nullable slots; empty slots never compress. Only public remaining deck counts are shown. A card exposes tier, production, points and nonzero printed costs; selecting it does not immediately buy it. Expected effective costs and basic-first/PRISM-shortfall payment are clearly preview-only. No payment plan is submitted.

Supply and all players' exact resource holdings, production discounts, score and reserved cards are public. Own reserved cards can be selected for purchase; opponents' reserved cards are read-only. Purchased cards have a compact summary and an expandable exact-card detail list. Actual scores above 18 remain visible. Forfeited data is displayed as projected, not recalculated or treated as eligible.

## Actions and transient state

- COLLECT selects one/two distinct basics or one PRISM, never mixed; supply-zero and cap9 constraints are previewed. At eight holdings only one resource fits.
- PURCHASE targets the exact market slot or own reserved card. Only the server computes payment, discount, score and refill.
- RESERVE is available only for a market card with fewer than two own reservations; it provides no resource reward.
- YIELD is explained as available only when collect/purchase/reserve are all impossible, not as an unrestricted Pass. Client hints never replace server legality.

Selections are local UI data, not a second canonical game state. New gameplay identity clears stale choices; presence-only updates preserve them. Pending/retry state prevents conflicting commands. Ack-loss retry reuses the same requestId and immutable payload, rather than creating a second purchase/collect. Rejected actions have no success feedback. Canonical accepted outcomes drive feedback and snapshots; no optimistic resource/card/score mutation occurs.

## Turn, lifecycle and finish

The prominent `내 차례입니다` / opponent-name banner uses the canonical active player. `00:45` countdown is display-only from the server deadline, with a non-flashing warning at ten seconds and no per-second live announcement. Turn/action audio uses original browser-generated tones, optional local preference and duplicate guards; audio/storage failure must not interrupt gameplay.

Score-triggered and market-exhaustion fair-round banners describe the public pending reason only; the client never invents the remaining queue or computes the finish boundary. Finished rendering consumes the four concrete reasons and server rankings/winner IDs verbatim, including shared winners, competition ranks and forfeited entries.

Refresh/resume restores canonical state through the existing session flow. Same-player/single-primary replacement policy is unchanged. Selection/command state is page-local and discarded safely when session, page or gameplay scope changes. Existing Hangul/Number behavior, especially Number's bare Joker decoding and direct tile editor, is preserved.

## Responsive and accessibility

Desktop centers the tiered market. Narrow layouts stack content rather than force nine cards into a row. Mobile native jump links move focus to the market or own resource/action area; stacked panels stretch across the available width. Card/resource/action controls are native buttons with readable labels, focus-visible outlines and at least 44px targets. Resource labels/markers, accessible card costs and production, public reservation ownership, stable live announcements and keyboard operation are explicit requirements. No touch-only or drag-only action is introduced.

## Verification record

- Full typecheck, tests and root build PASS: **1114 = shared 85 + Web 211 + server 818**. Existing 1083 tests retained; 31 new Web tests (11 command/retry, 16 UI/preview/audio, 4 capability/routing/isolation). No skipped tests.
- Targeted Web regression **111/111 PASS**. GEM command/renderer/decoder tests cover exact payloads, public fields, both purchase sources, reserve limits, collect cap/mode, Yield rejection/success feedback, pending reasons, all four finish reasons and competition/shared winners. Existing Hangul/Number action/draft/Joker and P11B suites remain PASS.
- Standalone production-serving **6/6 PASS**. Actual built server + built Web client/decoder/command builders verified three independent-game A/B flows: create/join/start/action/resume/leave/LAST_PLAYER_STANDING. GEM additionally verified natural market and own-reserved purchase, refill/payment, Yield rejection without mutation and public privacy. Legacy omitted-create V1, exact `[2,1]` and H/N/GEM handshake observed server-side, same-origin WebSocket and graceful shutdown PASS. No debug endpoint or runtime fixture added.
- Actual **local production in-app browser** A/B: Home three games, GEM create/direct invitation join/start, nine market cards and correct counts, 45-second turn, basic-one/basic-two/PRISM Collect, Reserve/refill, naturally affordable market Purchase, discount update and refresh/resume PASS. Refresh retained GemB's purchase/production and two-player identity; opponent actions disabled. Native keyboard Enter selected and collected a resource.
- Actual viewport inspection: desktop 1280×720, 390×844 and 320×568; document widths 1265/375/305 respectively (scrollbars excluded), no horizontal overflow. Market cards, resource/action panels, public player rows and mobile focus-jump links inspected. A/B browser console warning/error entries: **0**.
- Local Leave confirmations caused the in-app browser automation to time out; the A dialog was not exposed by the dialog API, so temporary tabs were closed instead. After A closed, the unchanged offline-timeout/forfeit policy naturally produced **LAST_PLAYER_STANDING** and B's actual browser displayed Finished, winner/ranks, its purchase/production and A's forfeited public holdings/reserve. Browser click-confirmed Leave is not claimed; compiled-client runtime Leave/LPS and all Finished renderer fixtures passed. Chrome/Safari/Firefox devices, screen-reader output, audible sound quality, public Railway and the other natural full-length terminal matches remain manual/P12 checks.
- The first sandboxed full test invocation could not bind localhost (`listen EPERM`); the identical suite passed after authorized loopback access. No assertion or application behavior was altered for this environment restriction.
- Final protected-path audit: no server/shared/domain/rules/cardset, dependency manifest/lockfile, Hangul/Number gameplay feature or common CSS diff. No generic renderer/GameModule/command bus or fake Rack introduced.

## Remaining gates

No Railway scale/config/deployment is performed or inferred. Public three-game E2E/release/Railway verification belongs to P12. Separate pending Number Joker manual Railway/Chrome verification is not reclassified as completed. Process-memory Room/session loss on restart/redeploy, single-replica requirement and Hangul test-dictionary-v1 limitations remain.
