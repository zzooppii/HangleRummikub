# 몰래 한입 — SNEAKY_LUNCH

P21A: USER-APPROVED / CONFIRMED / DOMAIN READY. Version `sneaky-lunch-rules-v1`.
Source: user's sixth-game unattended development request, 2026-09-10. No existing game rules change.

## Setup and victory

2–8 participants; Host configures 1–5 lunchboxes (default 3) and EASY/NORMAL/HARD/NIGHTMARE (default NORMAL). All participants must be connected to start. Settings freeze at start. Each box is exactly 30 accepted bites; 3-second server countdown precedes play. Repeated click/tap, never hold-to-eat.

The first active player to complete all boxes wins immediately (`PLAYER_FINISHED`). No scores, subsequent placements, or last-survivor automatic victory. All participants caught/forfeited means `TEACHER_WIN`, no player winner. Room-lane ordering decides simultaneous final bites.

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

## Scope/status

P21A defines approved rules. P21B domain, P21C integration, P21D Web, P22 local gate follow in order. No deployment or sixth-game availability is claimed by this document alone.
