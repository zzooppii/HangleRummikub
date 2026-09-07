# NUMBER_TILE UX polish

Status: `SOURCE_COMPLETE_LOCAL_PRODUCTION_VERIFIED`

This checkpoint improves the existing `NUMBER_TILE` Web experience without changing its game rules, wire protocol, server authority, or canonical persistence state. GEM_CARD P11A (`fb8324c`) remains intact, and GEM_CARD P11B/P11C are outside this work.

## Rack readability

- The Number rack uses a responsive wrapping grid. It grows vertically and does not use a horizontal scrollbar.
- The layout is verified for 14, 19, 24, and 30 visible Tiles at desktop, 390×844, and 320×568 viewports.
- `기본`, `숫자순`, and `색상순` are view-only modes. The default preserves server rack order; deterministic sorted modes place Jokers last and retain every physical `tileId`.
- RED, BLUE, BLACK, and ORANGE use stronger Number-only border, number, and marker styling. Text labels and R/B/K/O markers keep color from being the sole identifier.
- Tile controls retain native keyboard interaction, explicit focus-visible styling, and at least a 44px touch target.

## Turn awareness and feedback

- The previous large four-card summary is replaced by a compact turn banner, a prominent self/opponent turn message, a large `mm:ss` countdown, and a non-flashing warning at 10 seconds or less.
- Pool, own-rack, and public-meld counts remain visible as compact secondary statistics. Participant rows are also compact so the Table and rack remain the visual focus.
- The deadline remains server-authoritative; the Web countdown is display-only.
- A short synthesized Web Audio cue is attempted once for a newly observed self turn. The exact canonical `turnId` is stored in session storage so presence-only snapshots and same-tab refresh/resume do not replay it.
- Accepted Submit, Draw, and Pass acknowledgements produce request-ID-deduplicated visual and audio feedback. Rejection does not produce success feedback; autoplay/storage failures never affect gameplay.
- A local sound on/off preference is independent of Room state, credentials, revisions, and commands.

## Combination editor

- The explicit `GROUP 추가` and `RUN 추가` controls are replaced by one `+ 새 조합 만들기` action.
- Draft melds are derived from their physical faces:
  - same effective number, distinct colors, and 3–4 Tiles → `GROUP` wire kind;
  - same effective color, consecutive ascending numbers, and 3+ Tiles → `RUN` wire kind;
  - shorter melds remain incomplete; other shapes remain invalid.
- User-facing status uses Korean descriptions (`같은 숫자 조합`, `연속 숫자 조합`) instead of requiring rules terminology first.
- Valid RUNs are displayed and serialized in ascending number order; valid GROUPs use deterministic color order. Only touched source/target melds are normalized, so unrelated canonical Table order cannot create a dirty draft.
- A Joker with exactly one valid interpretation is assigned automatically. Multiple interpretations expose a picker; stale assignments are re-evaluated after a move. Physical Joker identity is never replaced or duplicated.
- Undo keeps the existing 50-entry limit, inference/order changes share the same atomic edit history entry, and Reset restores the authoritative baseline. Rack sorting is not draft state.

## Direct interaction polish

- The editor keeps one local active combination, shown as `● 여기에 추가 중`. Clicking a combination header selects the destination for subsequent rack Tiles without changing canonical game state or the wire payload.
- Clicking the first rack Tile when no combination exists creates the first local combination and places that exact physical `tileId` in one atomic draft edit. `+ 새 조합 만들기` immediately activates a new combination, while an existing empty local combination is reused instead of accumulating empty cards.
- Rack Tiles move directly into the active combination by click, tap, Enter, or Space. The old per-position insertion `+` controls are no longer part of the gameplay UI; valid RUN/GROUP display order continues to be derived deterministically without replacing physical identities.
- Desktop mouse drag uses Pointer Events as an optional convenience over the same draft operations. A 6px threshold separates click from drag, pointer capture and window-level cleanup keep releases outside the source safe, and the exact `tileId` identifies every move.
- Whole combination cards, the whole rack, and a dedicated `+ 여기에 놓아 새 조합 만들기` area are drop targets. Rack-to-combination, rack-to-new-combination, combination-to-combination, and rack-origin-combination-to-rack moves each create one Undo entry. Invalid/cancelled drops leave the draft unchanged.
- A canonical pre-turn Table Tile may move between combinations after initial registration, but cannot enter the rack. Both pointer and click/keyboard fallback reject that transition with `공개 테이블의 타일은 내 랙으로 가져올 수 없습니다.`
- Click/tap remains the primary mobile path. Native button semantics, explicit keyboard activation, focus handoff after a moved Tile disappears, and focus-visible styling keep drag optional rather than mandatory.
- Turn/game supersession, accepted Submit, and Reset clear transient selection/drag state. Same-identity presence updates preserve the draft and active target; reconnect never restores a stale DOM pointer capture.

## Guidance and authority

- An empty Table explains that the first registration must use only the player’s own Tiles and total at least 30 points.
- Initial-meld mode displays a client-side contribution hint while explicitly stating that the server makes the final decision.
- Client classification only derives the existing required `meld.kind` for the existing `number:submit` payload. The server still resolves `tileId` against canonical inventory and independently validates meld kind, Joker assignment/recovery, Table conservation, initial-meld threshold, and rack contribution.
- Duplicate identities, incomplete/invalid melds, and unresolved Joker ambiguity fail closed before serialization. This adds no event, protocol version, or snapshot field.

## Compatibility boundaries

- `NUMBER_TILE` rules, turn length, start/deal, Submit/Draw/Pass, timeout, forfeit, result, privacy, and revision/idempotency semantics are unchanged.
- `HANGUL_TILE` production components and styles retain their existing behavior.
- No shared/server production source, dependency, package manifest, or lockfile changes are part of this checkpoint.
- GEM_CARD domain source and its P11A checkpoint are preserved; server/shared integration has not started.

## Local production verification

- An independent A/B production-build flow covered create, invitation/direct join, start, Draw, refresh/resume, own-rack privacy, and opponent rack-count-only projection.
- Real canonical Draw actions grew both racks through 14, 19, 24, and 30 Tiles. At both 390×844 and 320×568, every checkpoint had zero document/rack horizontal overflow, all Tile rectangles remained inside the rack, and no gameplay control was clipped. The 30-Tile rack wrapped to 6 rows at 390px and 8 rows at 320px.
- Browser interaction confirmed the three sort modes, selected-Tile identity across sorting, derived same-number classification, unique Joker inference, the ambiguous-Joker picker, server rejection of a locally valid but sub-30 initial meld, large turn/countdown presentation, action feedback, and sound preference control.
- Browser warning/error logs were empty during Number and Hangul A/B flows. Hangul create/join/start/Draw/refresh-resume remained functional, including 14→15 private rack growth and opponent count-only projection.
- The final automated gate passes typecheck, build, and 1,025 tests (shared 75, Web 170, server 780), including production-serving, Number RuleEngine, V1/V2, privacy, and Hangul lifecycle regression coverage.

### Direct-interaction browser verification

- An independent A/B production-build Room covered first-Tile auto-create, repeated direct placement into one active combination, active-target switching, empty-combination reuse, Undo, Reset, and mixed click/keyboard/mouse input.
- Actual mouse input covered rack-to-existing-combination, rack-to-new-combination, combination-to-combination, and rack-origin Tile return through the full rack drop target. An outside/invalid drop was atomic, and a canonical Table Tile dropped on the rack was rejected without changing either count.
- A shuffled rack supplied a valid BLUE 8–12 RUN. The UI normalized its display, serialized the existing payload, and the unchanged server RuleEngine accepted the 50-point first registration; the authoritative snapshot then advanced the Turn and exposed only the public Table.
- At an actual 390×844 viewport, 14, 19, 24, and 30-Tile rack checkpoints had no document or rack horizontal overflow (5 columns; 30 Tiles wrapped to 6 rows). A 320×568 checkpoint used 4 columns without overflow, and tap placement remained usable.
- Draw, refresh/resume, opponent-turn edit disabling, physical-keyboard Enter placement, focus recovery, and clean warning/error logs were verified in the same production-build flow.
- This interaction pass adds six Web tests, for 1,031 total tests (shared 75, Web 176, server 780). It does not change Number rules, protocol, shared/server production source, dependencies, Hangul behavior, or GEM_CARD P11A.
