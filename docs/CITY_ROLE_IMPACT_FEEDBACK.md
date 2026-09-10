# CITY gameplay impact feedback

## Scope

Starting HEAD `9205eb7`, baseline 1535 (shared 110 / Web 360 / server 1065). CITY-only presentation. No server/domain/shared/protocol/dependency or other-game behavior changes. Railway NOT DEPLOYED.

The user clarified CR-05: announce protection **activation to self**, and a rejected protected-city attempt **to its requesting actor only**. Never notify the target or bystanders that an unsuccessful attack occurred. This changes no protection rule.

## Evidence and architecture

- `city-impact.ts`: pure comparison of consecutive viewer-projected snapshots; bounded caller-owned tracker.
- `CityImpactLayer.tsx`: the same mounted CITY boundary across Playing→Finished; ephemeral two-second banner, visual accents, recent eight-entry viewer-local log. Log resets each round, disconnect and identity change; never stored or sent to another player.
- `city-role-actions.ts`: accepted request receipts identify own replacement/swap/acquisition/pick. No optimistic success. Only matching game/revision feedback can play. The protected-city rejection helper examines the actor's existing public protection state; it does not broadcast a failed attempt.
- Existing `useCitySound` owns preference, gesture unlock and cleanup; the impact layer owns gameplay cue scheduling in CITY Playing/Finished. Legacy cue helpers remain compatible, but do not double-play on these screens.
- `App.tsx` and `use-lobby-app.ts` changes are confined to CITY branches. The renderer receives exactly the same privacy projection as before.

No generic event framework, server event log or new persistence state is introduced.

## Visibility matrix

`S/V/T` means short sound (only if enabled/unlocked), visual and text. Simultaneous effects share one highest-intensity cue (latest at equal intensity), while each message remains in the local log. All names mentioned below already belong to public participants. Hand card identities never occur in messages or event payloads.

| Event | Actor | Target/owner | Other participants | Name / exact amount / card identity |
| --- | --- | --- | --- | --- |
| CR-01/02 private mark accepted | S/V/T: own generic acceptance, no claim of hit | None | None | No target or ownership added |
| CR-01 role skipped | No new impact | S/V/T: own skipped role | None | No attacker nickname; no mark target exposed |
| CR-02 observable transfer | S/V/T: exact gained gold | S/V/T: exact lost gold | None | No source nickname; correlated public gold values only |
| CR-03 full swap | S/V/T: public target nickname, whole swap | S/V/T: public acting nickname and own count before/after | None | No card IDs/names; own count and public nicknames only |
| CR-03 own replacement | S/V/T: exact accepted count | Same as actor | None | No card IDs or names |
| CR-04 entry | S/V/T to new role owner even if already leader | Same | Existing public leader UI only | No private role inference |
| CR-05 activation | S/V/T to protected self | Same | Existing public protection badge only | No attack attempt implied |
| CR-05 rejected CR-08 attempt | S/V/T: coarse current protection message | **None** | **None** | No new disclosure; optional visual on already-public target card |
| CR-06 acquisition bonus | S/V/T: extra gold 1, separate from gold2 | Same | None | Exact mandatory +1 |
| CR-07 entry | S/V/T: newly received own count and max3 build reminder | Same | None | Excludes prior pending-card IDs; no card identities in text |
| CR-08 success | S/V/T: public building removed | S/V/T: own public building removed | No extra impact | Public building name only; no attacker nickname needed |
| Build | S/V/T: name, own gold before/after | Same | Small S/V/T: public builder and building | Public card only |
| Garden / sundial / staircase | S/V/T to owner | Same | Build/public state remains visible | Canonical history and exact draw/discount count; sundial can be 0 |
| Stone demolition surcharge | S/V/T to successful demolisher | Existing successful-destruction impact | None | Public passive cost +1; never claims immunity |
| Moon | Own build reminder; own Finished diversity result | Same | Existing public card/results | No in-game bonus invented; +3 not doubled |
| Seventh | Own Finished actual landmark bonus | Same | Existing public result | Server result bonus, never virtual category count |
| First completion / new round | All S/V/T | All | All | Public completer name and final-round state |
| Finished | Winner/joint winner: victory; others: end bell | All | All | Server rank/score/winner list; no private history reveal |

## Conservative derivation and replay safety

Gold decrease alone cannot establish theft: require new role entry, public CR-02 owner, both sides' exact gold transfer and current role-income correlation. An unobservable zero-gold/no-op or revision gap is not reconstructed. Likewise an unchanged empty hand swap has no target-side state impact to replay; the actor still has its accepted receipt. These are intentional fail-closed presentation limits, not missing gameplay or altered legality.

CR-01 is self-only, after a known own role's order has passed without a normal reveal, or after the lawful disabled reveal. Already-passed roles on a resume baseline cannot generate a delayed strike. Forfeit does not become an attack animation.

Mount, refresh, reconnect and revision gaps establish a silent baseline. Same/older revisions never replay snapshot events. Receipt IDs and semantic role IDs deduplicate feedback; a late success receipt at the resume baseline is suppressed. Rejected actions do not generate success effects. Ordinary presence changes do not become game events. Tracker entries are bounded (trim 256→192); recent display log holds eight.

## Visual/audio/accessibility

Original short Web Audio cues: strike, coin gain/loss, shuffle, draw, build, break, shield, leader, water, tick, wind, moon, bell and victory. Durations .16–.65 seconds, modest gains .025–.065; small/medium/large visual intensity. No audio files, external assets or dependencies. Muting drops cues immediately; enabling later never replays them. Device denial is nonfatal.

Parchment top banner, original SVG strike/icon visuals, card settle, hand shake, gold accent, shield outline and winner entrance. A removed public building has a short decorative artwork echo with crack/fade in the impact banner; this never keeps the removed canonical card interactive. Existing public protection/final-round/score breakdown remains authoritative. The dock remains unobstructed. `aria-live=polite`, visible text, accessible existing card names and reduced-motion overrides remain available when sound is off.

## Verification evidence

- Automated tests: CR01 privacy/skipping/resume, exact correlated theft, both swap viewers, replacement receipts, leader, protection activation/rejection, CR06/07, destruction, build, six Landmark paths, completion/result, duplicate/gap/reconnect suppression, mute, banner semantics, reduced motion and mobile placement.
- Local production, two actual Web viewers using separate localhost/127.0.0.1 storage origins: create/join/start; CR01 target skip; CR02 exact **3 gold** transfer with different actor/target messages; CR03 **4→4** hand swap with no card names; CR05 self protection activation; CR07 extra **2 cards**; ordinary builds; moon Landmark construction; CR08 demolition with distinct actor/target messages. No canonical state injection or debug endpoint.
- 1280 desktop gameplay; 390 document client/scroll 375/375; 320 client/scroll 305/305. Actual 320 build banner screenshot confirms top placement above the unobscured bottom dock.
- Refresh restored the same A player/game and current hand/city, with an empty impact banner and no old local log. Both actual browser consoles had no app warnings/errors.
- Full completion/joint-winner, all six rare Landmark activations and rejected-protection ACK are automated fixture/handler tests, not claimed as naturally reached live browser outcomes. Local in-app browser leave confirmation did not expose a usable confirm handle, so live leave-to-Finished smoke was not claimed. No production code was altered to bypass the dialog. Physical speaker loudness remains device-specific manual review.
- Final root typecheck, full tests and build pass; `git diff --check` passes. **1557/1557** tests (shared 110 / Web 382 / server 1065), **22 additive tests**, no skips/deletions. JS 591.45 kB (gzip 168.87), versus starting 577.32 kB (gzip 164.49); existing >500 kB warning remains.

Railway NOT DEPLOYED. No subsequent phase is started automatically.

## V3 audio correction — 2026-09-10

The expanded Playing/Finished routes now retain `CityImpactLayer` and `useCitySound`. `city-expanded-impact.ts` derives v3 resources, card movement, construction, destruction and correlated theft from consecutive viewer projections, without assuming legacy role abilities. V3 ignores legacy success-receipt sound events to avoid duplicated or incorrect amounts (for example Gold Mine).

Audio now plays once when a fresh state event batch arrives, rather than waiting behind the two-second visual banner queue. One meaningful cue wins within the batch; other players' public actions use 45% amplitude. Text banners retain their queue. Muted events are consumed silently and never replayed after enabling sound. The new STEAL voice combines descending coin notes with a short paper/swish texture. A stored 0–100 volume control applies to tonal and noise layers. Existing autoplay blocking, cleanup, snapshot-gap and reconnect protections remain.

V3 correction verification: committed project plus only CITY audio changes passes root typecheck, **1,882 tests** (118 shared / 464 Web / 1,300 server), and build. The existing >500 kB JavaScript bundle warning remains (754.65 kB). The live shared working directory's root commands were also attempted; concurrent HALLI_GALLI contract/renderer changes caused unrelated type failures, so those results are not reported as passing. CITY source files and the two App route changes were compared byte-for-byte against the isolated verification copy.

An ephemeral browser harness mounted the actual CityExpandedScreen and CityImpactLayer with projected test states. A native running AudioContext scheduled 3 coin notes, 2 card notes plus noise, 3 construction notes plus noise, and 3 theft notes plus noise. Muting and volume zero scheduled no further nodes, and re-enabling did not replay missed effects. This verifies browser audio routing; it is not a claim of a new end-to-end server gameplay run or a physical-speaker loudness review. Harness files, browser tab and test server were removed/stopped.
