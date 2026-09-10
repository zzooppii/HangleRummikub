# 몰래 한입 — SNEAKY_LUNCH

P21A: USER-APPROVED / CONFIRMED / DOMAIN READY. New games: `sneaky-lunch-rules-v2` (placement upgrade). Stored `sneaky-lunch-rules-v1` keeps its original semantics.
Source: user's sixth-game unattended development request, 2026-09-10. No existing game rules change.

## Setup and victory

2–8 participants; Host configures 1–5 lunchboxes (default 3) and EASY/NORMAL/HARD/NIGHTMARE (default NORMAL). All participants must be connected to start. Settings freeze at start. Each box is exactly 30 accepted bites; 3-second server countdown precedes play. Repeated click/tap, never hold-to-eat.

User-approved placement upgrade: the first player to finish all boxes locks rank 1, the next rank 2, and so on. `placementOrder` is canonical and immutable once appended; placed players remain Room participants/spectators, cannot eat or be caught/forfeited, and do not receive offline gameplay penalties. Their historical `ACTIVE` status is retained; eligibility also excludes placementOrder. No score/tie-break system is introduced. Room-lane ordering decides concurrent final bites.

When exactly one unplaced ACTIVE player remains, append that survivor at the next rank without requiring more bites and finish. Normal completion reason is `PLACEMENT_COMPLETE`; elimination-driven termination is `LAST_PLAYER_STANDING`. The first entry remains the winner even if someone else survives last. Caught/forfeited participants are shown separately as eliminated, not assigned artificial placement ranks.

If nobody remains eligible, finish immediately: preserve any confirmed winner, otherwise `TEACHER_WIN`. A presence sweep applies simultaneously expired offline forfeits atomically before deciding a survivor; it must not award an offline player a fictitious win due to iteration order. Sequential catches stop as soon as one survivor remains, so a later catch cannot turn that already finished game into an all-caught result. Teacher timing and catch/rate-limit ordering are unchanged.

Legacy v1 stored games still use first-completion `PLAYER_FINISHED` and all-eliminated `TEACHER_WIN`, with no automatic survivor victory. The validator requires placementOrder in v2 and forbids it in v1; old saves are never silently reinterpreted. Rematch/new start creates v2 with empty placements.

## Teacher and input

`COUNTDOWN → BOARD → SUSPICIOUS → (FAKE: BOARD | REAL: WATCHING → RETURNING → BOARD)`.
BOARD and SUSPICIOUS permit eating. WATCHING and RETURNING catch a player who taps using the current teacher revision. Catch freezes progress, but preserves participant/session/spectating. One catch does not shorten a teacher window.

Validation order: session/current-primary/membership/game/phase → teacher revision → danger catch → safe-tap 150ms minimum interval → accepted bite. Stale teacher revision never awards a bite or catches. Rate limiting does not shield a current-revision danger tap. Replays never add another bite/catch. No optimistic progress authority.

## Difficulty (milliseconds, server-only plan)

| Difficulty | BOARD | SUSPICIOUS | WATCHING | RETURNING | Fake probability |
|---|---|---|---|---|---|
| EASY | 4500–7500 | 900–1100 | 1600–2200 | 700–900 | 18% |
| NORMAL | 3000–5500 | 650–800 | 1300–1900 | 550–700 | 30% |
| HARD | 1800–4000 | 450–550 | 1000–1500 | 450–550 | 43% |
| NIGHTMARE | mixed 700–1600 / 1601–3200 / 3201–5200 | 300–700 | 800–1500 | 350–650 | 58%, at most 2 consecutive fakes |

Intervals are inclusive. Nightmare chooses three duration bands with equal probability. Fake chance is per eligible suspicious window, not an unconditional observed proportion after the two-fake cap. Application supplies random samples; domain validates deterministic plans. No future timing, outcome, sequence, or seed reaches a viewer.

## Presence and rematch

Disconnect preserves identity/progress; continuous PLAYING offline time of 30 seconds forfeits. Resume before expiry cancels; after forfeit restores a spectator. Explicit leave immediately forfeits during play and removes credentials under existing policy. Finished result roster is immutable.

Playing does not require Host. Explicit Host leave transfers to earliest remaining joinOrder. In FINISHED, continuous Host offline time ≥60 seconds permits transfer to earliest connected non-departed participant; no eligible successor means no change. Old Host retains identity/result/session and does not reclaim Host on resume. Transfer is not forfeit. Lobby keeps existing presence policy.

Host rematch: FINISHED → same Room LOBBY; explicitly departed participants excluded, merely disconnected/offline-forfeited retained. Preserve RoomCode, identities, nickname, joinOrder, sessions/capabilities. Reset all gameplay, teacher plan/revisions, input timestamps, timers, results. Next start uses a new game identity and plan.

## Presentation interpretation

Exact progress is public canonical data. Display diminishing food and completed boxes rather than running bite counts/percentage numerals. The subsequent classroom redesign request explicitly approves a brief `+1` after an accepted bite (or the exact accepted delta if several updates arrive together); it supersedes the original ban on that transient label, not the rules or privacy contract. This is presentation, not secrecy or anti-cheat. Teacher next-transition countdowns remain forbidden. Danger retains the tap button for active connected participants. Original classroom SVG/CSS and Web Audio, Sound toggle, five-step visual guide, reduced motion, 1280/768/390/320 layouts. Classroom seats remain in place when caught and behind a dismissible Finished overlay.

## Caught impact and food presentation

A newly confirmed catch shows only that viewer an original fullscreen stern teacher / “야!!” comic close-up for two seconds, dismissible sooner. No strobe or repeated flash; reduced-motion removes the entry zoom. Sound OFF stops and prevents the caught sound. The stronger follow-up uses an original 0.68-second synthesized, voiced ‘악!’-like scream at near-full digital level (0.96 peak, no clipping), independent of OS speech voices, network assets or dependencies. Other cue volumes and device/system volume remain unchanged. A caught ACK that narrowly beats a gesture-triggered audio resume can play within 300ms; delayed/muted/closed cues cannot replay later. Reconnect/refresh establishes a silent feedback baseline rather than replaying the scare. Final results wait for this presentation, not for the canonical game transition.

Each lunchbox displays thirty fixed-size food portions. One accepted bite removes one portion; the tray and remaining portions do not shrink. The next box refills only on a canonical thirty-bite boundary; final completion remains empty.

## Scope/status

P21A defines approved rules. P21B domain, P21C integration, P21D Web, P22 local gate follow in order. No deployment or sixth-game availability is claimed by this document alone.
