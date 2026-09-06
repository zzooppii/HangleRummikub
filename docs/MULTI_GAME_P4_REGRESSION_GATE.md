# Multi-game Platform P4 Regression Gate

> 상태: 검증 완료, checkpoint commit/push 및 post-push public smoke 조건부
> 검증일: 2026-09-06
> 비교 기준: `hangul-game-v1` 및 P3D checkpoint `cedda1a refactor: extract hangul game module`
> 자동화 기준선: shared 59 + web 91 + server 481 = 631 tests

## 1. 목적과 변경 범위

P4는 P2~P3D에서 경계와 물리 소유권을 바꾼 뒤 extracted `HANGUL_TILE` vertical slice가 기존 production behavior와 동등한지 확인하는 stop gate다. 새 protocol, architecture, game, catalog 또는 production gameplay code는 추가하지 않았다.

영구 변경은 다음으로 제한했다.

- 기존 production-serving A/B smoke에 Draw 이후 revision, rack/bag, private Tile 비노출과 resume 연속성 assertion 추가
- 이 검증 기록과 multi-game architecture/roadmap 상태 동기화

새 test case를 만들지 않았으므로 total count는 631로 유지된다. 기존 test를 삭제·skip하거나 assertion을 약화하지 않았다.

## 2. 기준 태그 contract 비교

`git show`와 AST declaration 비교로 working tree를 checkout하지 않고 `hangul-game-v1`과 현재 구조를 비교했다.

- `protocolVersion = 1`, Client 10개/Server 5개 Socket.IO event inventory와 acknowledgement/error envelope가 같다.
- old protocol 선언 43개와 projection 선언 60개가 현재 root compatibility composition 및 `games/hangul-tile` contract에 구조적으로 모두 보존됐다.
- `room:create`와 flat LOBBY/PLAYING/FINISHED `StateSnapshot` v1에 `gameType`이 없다.
- server serving entry, web controller/realtime/route와 `GAME_RULES.md`는 기준 태그와 동일하다.
- 이동된 Board, composition, GameState, result, RuleEngine, stalemate, inventory, dictionary declaration은 import/namespace를 제외하고 동일하다.

P2~P3D의 의도된 차이는 internal immutable `RoomRecord.gameType`, exact registration/routing, state/projector/lifecycle seam과 physical namespace뿐이다. supported `HANGUL_TILE` behavior regression은 발견되지 않았다.

## 3. Wire, projection과 security

P1 characterization이 다음 v1 contract를 고정한 채 통과한다.

- Client: `session:bootstrap`, `room:create`, `room:join`, `session:resume`, `state:sync`, `room:leave`, `game:start`, `turn:submit`, `turn:draw`, `turn:pass`
- Server: `state:snapshot`, `turn:started`, `game:finished`, `session:replaced`, `room:closed`
- strict extra-field rejection, scope, revision vector, LOBBY/PLAYING/FINISHED key/discriminant
- A/B own rack detail과 opponent `rackCount` only, FINISHED에서도 opponent rack 비공개
- bag Tile ID/order, session credential, verification/socket/storage/idempotency/scheduler/offline/stalemate 내부 state 비노출

Malformed/oversized input, stale revision, duplicate request/fingerprint, replaced/non-primary session과 unauthorized Tile probe normalization도 기존 transport/application test가 보존한다. production log source는 payload, token 또는 rack을 interpolate하지 않고 constant diagnostic만 기록한다.

## 4. Hangul gameplay와 lifecycle

기존 domain/application/integration suite로 다음을 재검증했다.

- 2/3/4 Player create/join/start, 5번째 join과 non-Host start 거절, Host/invitation/resume/single-primary
- ordinary consonant 94, vowel 60, Joker 2, total 156; source pool 95/61; initial 7+7 rack
- 초성·중성·종성, 복합 모음/받침, dedicated doubles, physical consumption, Joker, NFC composition
- Board/ownership/conservation, 2음절·6 physical Tile initial meld, self-rack-only, rearrangement, Joker recovery
- `test-dictionary-v1`의 version/integrity와 approved 30 words, NOT_ALLOWED/UNAVAILABLE path
- Submit candidate isolation, deadline boundary, atomic commit/rollback, revision/idempotency와 RACK_EMPTY
- consonant/vowel Draw, selected bag empty, private drawn Tile, Pass both-empty rule와 stalemate
- timeout penalty 최대 3, stale/duplicate callback, Submit/Draw/leave/deadline race
- offline first/second timeout, penalty-before-forfeit, resume streak reset와 revision semantics
- Lobby/PLAYING/FINISHED explicit leave, Host succession, forfeit와 terminal transition
- RACK_EMPTY, TIME_LIMIT, STALEMATE, LAST_PLAYER_STANDING, ALL_PLAYERS_FORFEITED 결과와 rank/score/tie
- 25분 game deadline, Lobby grace, all-offline/FINISHED 30분 retention, cleanup/code reuse/session removal
- scheduler registration/replacement/cancel, overdue recovery, at-least-once safe callback와 graceful shutdown

## 5. P2~P3D boundary regression

- P2: `HANGUL_TILE` only runtime identity, immutable Room gameType, identity-only registry, unknown/duplicate/missing registration fail-closed
- P3A: `cloneAndValidate`, lifecycle inspection, detached Board/rack/bag/result, CAS/UoW/idempotency co-commit, Room shell + Legacy Hangul v1 projection
- P3B: exact canonical gameType start/Submit/Draw/Pass dispatch, delegate once, `receivedAt`/request input preservation
- P3C: leave/presence action과 timeout/deadline dispatch, unsupported type before mutation, stale/race behavior
- P3D: old production `domain/game`, `domain/hangul`, top-level Legacy import 0; Hangul domain reverse dependency 0; allowlist 밖 direct consumer 0; duplicate implementation과 server/shared relative-import cycle 0

Persistence는 Hangul Tile/Board/rack/bag/result/stalemate/offline-streak 내부를 직접 복제하거나 읽지 않고 state adapter의 clone/lifecycle inspection을 사용한다.

## 6. Web와 responsive/accessibility

Web 91 tests가 Home, create/join/invitation, Lobby, Playing, TurnDraft, Submit/Draw/Pass, countdown, Finished, refresh/resume, replaced/stale session과 현재 malformed Playing/Finished → Lobby fallback을 보존한다.

Static release characterization은 320px layout rules, 44~52px control target, tap/native-button/keyboard/focus-visible path, dirty Draw confirmation focus restoration과 stable live region을 확인한다. 실제 Chromium public page에서도 다음을 확인했다.

| Viewport | Horizontal overflow | Home controls |
| --- | --- | --- |
| 390×844 | 없음 | button height 48px |
| 320×568 | 없음 | button 48px, input 50px |

Safari, Firefox 및 physical device는 이번 환경에서 실행하지 않았으므로 검증 완료로 주장하지 않는다.

## 7. Production build와 local runtime smoke

Fresh root build 뒤 실제 `npm start` production dist를 별도 port에 실행해 다음을 확인했다.

첫 증분 build 감사에서 P3D 이전 ignored `apps/server/dist/domain/*`와 top-level Legacy JS가 로컬에 남아 있음을 발견했다. 이는 source/import나 runtime entry regression은 아니고 `tsc`가 제거된 source의 과거 output을 청소하지 않는 generated-artifact 문제였다. Git이 추적하지 않는 `apps/server/dist`만 명시적으로 비운 뒤 fresh build했으며, 재생성된 dist에는 old path/duplicate JS가 0개였다. P4 범위상 package script나 production source는 바꾸지 않았다.

- `/health` 200 `{ "ok": true }`
- `/`와 `/room/ABC234` GET 200 SPA, hashed JS asset 200 immutable cache
- missing asset와 `/api/missing`, non-GET SPA 404
- same-origin Socket.IO, cross-origin rejection와 graceful shutdown

독립 A/B Socket.IO smoke 결과:

```text
bootstrap -> create -> join -> Host start -> CONSONANT Draw
-> A/B state sync/privacy -> B disconnect -> same-player resume
-> normal leave/finish cleanup path
```

Start는 two-player rack 14/14, bag 81/47, gameRevision 0이었다. Draw는 actor rack 15, bag 80/47, gameRevision 1이었고 drawn `tileId`와 두 session token은 상대/public projection에 없었다. Resume은 같은 player/rack/game state를 복구했고 duplicate Player를 만들지 않았다.

## 8. Public Railway 확인

Checkpoint 전 공개 endpoint에서 다음 behavior를 확인했다.

- HTTPS `/health` 200 `{ "ok": true }`
- Home 및 `/room/ABC234` SPA, Socket.IO 연결, browser console error 없음
- 독립 A/B bootstrap/create/join/start/Draw, revision/rack/bag와 drawn Tile privacy
- disconnect 후 same-player resume와 duplicate Player 없음
- smoke Room은 direct deletion 없이 정상 leave/finish path를 사용

Checkpoint push가 auto-deploy를 일으킬 수 있으므로 같은 public smoke를 push 뒤 다시 실행한다. 이 repository에는 deployment commit/replica identity endpoint가 없다. Railway dashboard/log에 접근하지 못하면 public behavior는 검증하되 deployed commit identity와 1 replica는 독립 검증으로 표시하지 않고 최종 보고에서 분리한다.

## 9. Dependency와 알려진 제약

- 새 dependency 없음; `package.json`/`package-lock.json` 변경 없음
- Room/Game/session은 process memory에만 있어 restart/deploy 시 사라진다.
- Railway auto-deploy는 active Room을 잃게 할 수 있다. P4는 scale/replica/config를 변경하지 않는다.
- production dictionary는 계속 `test-dictionary-v1` 30 words다.
- 실제 durable recovery, multi-replica, Safari/Firefox/physical device와 Railway deployment commit/replica dashboard 확인은 이 gate의 검증 범위가 아니다.

P4 checkpoint가 root typecheck, 631 tests 2회, build, production-serving, diff-check, normal push와 post-push public smoke를 모두 통과하면 **P4 COMPLETE / P5A READY**다.
