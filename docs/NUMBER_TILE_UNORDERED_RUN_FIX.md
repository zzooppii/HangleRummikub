# NUMBER_TILE unordered RUN canonicalization follow-up

> Baseline: `ff1a792 feat: add gem card web gameplay`; 1,114 tests (shared 85 / Web 211 / server 818).
> Scope: Number RUN interpretation, canonical Submit normalization, Number draft preview and regression documentation. GEM P11C remains SOURCE COMPLETE; P12 is not started.
> Status: SOURCE COMPLETE / MANUAL RAILWAY VERIFICATION PENDING.

## Production regression and canonical decision

The reported mobile sequence `ORANGE 7 / JOKER / ORANGE 9 / ORANGE 6` was rejected because both the server and Web derived RUN start from `ordinaryNumber - rawIndex`. Its physical set has exactly one legal consecutive range: `6,7,8,9`. The same physical Joker must derive as 8, and the canonical arrangement is `O6,O7,J,O9`, worth 30 for the initial meld.

RUN validity is now set-first. Same-color ordinary numbers must be distinct; length remains 3–13, with at most one Joker and no wrap. Enumerate complete consecutive ranges of that length within 1–13 containing every ordinary number. The number of missing positions must equal the Joker count. No range means invalid; one range means valid regardless of click/drop order. Ordinary-only permutations also normalize ascending.

GROUP remains a distinct concrete rule: same ordinary number, distinct ordinary colors, length 3–4 and at most one colorless Joker. No GROUP color/number picker, synthetic color or assignment field is introduced.

## Genuine numeric ambiguity

Two possible ranges are not resolved by choosing the first candidate:

| Submitted physical order | Interpretation |
| --- | --- |
| `J,R5,R6` | Existing valid ordered intent: Joker 4, value 15 |
| `R5,R6,J` | Existing valid ordered intent: Joker 7, value 18 |
| `R6,J,R5` | Unresolved: Web offers number 4 or 7 only; server rejects until resolved |
| Any permutation of `O6,O7,O9,J` | Unique Joker 8; no picker, value 30 |
| `O4,J,O7` | Invalid: one Joker cannot fill two missing positions |

The numeric choice reorders existing physical placements as one local Undo action. The ordered array carries this intent through the existing bare-identity wire contract; it does not store `assignedNumber` or `assignedColor`. RUN color always derives from ordinary tiles. Moving a Joker re-derives its current role; no previous-role equality/recovery requirement returns.

## Ownership and compatibility

- `packages/shared/src/games/number-tile/run-interpretation.ts`: Number-owned pure `deriveNumberTileRun(faces)` returns invalid, unresolved candidates, or one resolved solution containing ordered input indices, derived Joker number and value. It neither owns physical IDs nor mutates inputs.
- Server Number `rule-engine.ts`: independently resolves canonical inventory faces for every physical reference, then derives and normalizes the complete proposed Table. Initial-Table signatures and initial value use this normalized candidate. Successful Submit stores the detached canonical order; rejected candidates cannot mutate live state.
- Number state adapter: stored canonical RUNs still require ascending order. Proposal normalization must not silently repair invalid persisted state. Projector and existing strict Number V2 decoder receive the normalized stored order.
- Number Web classifier/draft/editor: unique sets normalize immediately after direct click/drop; unresolved ambiguity preserves placement order until an explicit numeric choice. Active combination, physical IDs, rack-origin restrictions, 50-step Undo, Reset and gameplay-identity reconciliation remain unchanged.

No Socket.IO event, protocol/snapshot version, command DTO, Number V2 schema shape, capability, URL or privacy shape changes in this follow-up. The Joker remains `{ tileId, kind: "JOKER" }`. Public canonical RUN order remains ascending. Raw full-payload request fingerprints remain exact: permuting a payload with the same request ID is still `REQUEST_ID_REUSED`, not a new semantic replay.

Whole-table physical conservation, Joker-to-rack rejection, max-one-Joker, own-rack contribution, colorless GROUP, free valid rearrangement and server authority are preserved. Hangul and GEM runtime sources, rules, dependencies, registry, scheduling and routing are untouched.

## Verification and deployment

The named production regression is covered in shared interpretation, server meld/Submit and Web preview/draft tests. Tests cover all 24 permutations, ordinary-only permutations, boundaries/gaps/duplicate/mixed colors, deterministic initial 30, explicit ambiguity, stored clone/V2 projection, exact replay, numeric-choice Undo and no color picker. Existing descending/edge tests now assert the approved unique-set semantics; genuine invalid-gap coverage remains, and no tests are deleted or skipped.

Root typecheck, full tests **1,135/1,135** (shared 91 / Web 217 / server 827), production build and `git diff --check` pass. All 1,114 existing tests remain, with 21 additions (shared 6 / Web 6 / server 9); no skips. Separate Number server targeted tests pass 116/116, Number UX/draft tests pass 36/36, GEM server regression passes 104/104, GEM Web regression passes 31/31 and fresh-build production-serving passes 6/6. Independent source review found no additional issue. Protected Hangul/GEM/dependency and wire-schema diffs are empty.

Railway is not deployed by this task; public mobile verification remains a separate user action. After deploying, refresh the Web bundle and verify `O7,J,O9 + O6` automatically becomes `O6,O7,J,O9` without another click or picker. Single-process in-memory redeploy still loses active Rooms/Games/sessions. No direct production browser execution is claimed for this follow-up.

Next permitted follow-up after source completion: **NUMBER_TILE BOARD UI OVERHAUL — board-centric real-game interaction**. GEM/P12 work is not part of this correction.
