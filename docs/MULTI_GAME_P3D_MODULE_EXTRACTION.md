# Multi-game Platform P3D Module Extraction

> 상태: 구현 완료, 최종 quality gate와 checkpoint/push 검증 대상
> 기준 checkpoint: `d21eaad refactor: isolate hangul server actions`
> 기준 test: shared 59 + web 91 + server 478 = 628

## 1. 목적과 범위

P3D는 P3A~P3C에서 소유권과 호출 경계가 이미 검증된 한글 전용 구현을 물리적인 `hangul-tile` namespace로 옮긴다. 새 게임, wire contract, gameplay 규칙 또는 공통 abstraction을 추가하지 않는다.

이동 판단은 파일 이름이 아니라 실제 state와 규칙 의존성을 기준으로 했다. platform orchestration과 한글 규칙이 함께 남은 application service는 이동률을 높이기 위해 억지로 옮기지 않았다.

## 2. Server 최종 namespace

```text
apps/server/src/games/
  game-registry.ts
  hangul-tile/
    domain/
      board.ts
      composition.ts
      dictionary-provider.ts
      game-state.ts
      result-engine.ts
      rule-engine.ts
      stalemate.ts
      tile-inventory.ts
    compatibility/
      legacy-hangul-compatibility-registration.ts
      legacy-hangul-game-state-adapter.ts
      legacy-hangul-player-lifecycle-actions.ts
      legacy-hangul-server-action-router.ts
      legacy-hangul-v1-command-router.ts
      legacy-hangul-v1-game-projector.ts
    infrastructure/
      test-dictionary-provider.ts
```

`domain/game`과 `domain/hangul`에는 기존 test runner discovery를 보존하기 위한 test file만 남는다. production implementation의 canonical path는 새 module뿐이며 server-internal old-path re-export shim은 만들지 않았다.

## 3. `VERIFIED_HANGUL` 이동

| 범주 | 이동한 책임 | 근거 |
| --- | --- | --- |
| composition | 현대 한글 초성·중성·종성 및 복합 자모 조합 | 한글 Unicode 조합만 수행한다. |
| board/rule | Board, WordGroup, syllable placement, Joker, initial meld, rearrangement, dictionary 판정 | 현재 한글 타일 규칙을 직접 표현한다. |
| inventory/state | 156개 physical inventory, 자음/모음 bag, rack, rules snapshot, turn/state clone | `HANGUL_TILE`의 canonical state다. |
| finish | rack/Joker penalty, 다섯 finish reason, stalemate tracker | Hangul v1 score/result 규칙이다. |
| dictionary | `DictionaryProvider` contract와 `test-dictionary-v1` fixture | 단어 허용 판정은 현재 게임 전용이다. |
| P3A seam | state adapter, v1 projector | concrete Hangul state clone/lifecycle/projection을 소유한다. |
| P3B seam | v1 command router | canonical `HANGUL_TILE`을 기존 start/submit/draw/pass service로 연결한다. |
| P3C seam | player lifecycle action, scheduled server-action router | Hangul forfeit/streak decision과 timeout/deadline dispatch를 연결한다. |

`ports/system.ts`는 platform port와 game-specific port가 섞인 파일이었으므로 파일 전체를 이동하지 않고 `DictionaryUnavailableReason`, `DictionaryLookupResult`, `DictionaryProvider`만 module domain으로 분리했다. `Clock`, session credential, ID/random, scheduler contract는 기존 platform port에 남겼다.

## 4. 이동하지 않은 책임

다음 platform mechanism은 기존 위치를 유지한다.

- `GameRegistry`, Room/Session repository와 UoW, in-memory persistence
- ConnectionRegistry, presence/session/resume, Room cleanup/retention
- Turn/Game/Room-policy scheduler, overdue sweeper, shutdown lifecycle
- Socket.IO/Express transport, player-specific fan-out, composition root

다음 application 파일은 Hangul decision과 Room lane, authorization, idempotency, UoW, scheduling이 한 구현에 함께 있으므로 `MIXED/CROSS_GAME_CANDIDATE`로 남겼다.

- `GameStartService`
- `TurnSubmitService`, `TurnDrawService`, `TurnPassService`
- `TurnTimeoutService`, `GameDeadlineService`
- `turn-transition.ts`, `game-finish-transition.ts`, `game-deadline-transition.ts`
- `RoomLeaveService`, `RoomPresencePolicyService`, `LobbyStateSnapshotProjector`, `RoomSessionApplicationService`

이 파일들은 새 canonical Hangul path를 직접 import하는 검증된 현재 consumer다. P3D는 이 dependency를 숨기지 않고 allowlist로 고정하며, 실제 두 번째 game과 P9 abstraction review 전에는 generic command/state framework로 바꾸지 않는다.

## 5. Shared physical split와 compatibility

Shared package는 public root API와 flat v1 envelope를 유지하면서 명백한 Hangul-owned 내부 정의만 아래로 분리했다.

```text
packages/shared/src/games/hangul-tile/
  turn-command-contracts.ts
  v1-projection-contracts.ts
```

- `turn-command-contracts.ts`는 ProposedBoard/WordGroup/syllable/Tile input과 자음·모음 Draw bag contract를 소유한다.
- `v1-projection-contracts.ts`는 Hangul Board/rack/bag/turn, Tile/Joker metadata와 Hangul v1 result/ranking validator를 소유한다.
- root `protocol.ts`는 기존 command envelope, event name, protocol/revision/error와 client-command union을 계속 조립한다.
- root `projections.ts`는 Room/player/presence shell과 flat LOBBY/PLAYING/FINISHED `StateSnapshot` v1을 계속 조립한다.
- root 파일은 이동한 모든 기존 public symbol을 같은 이름으로 re-export한다. `index.ts`와 package `exports`는 바꾸지 않았다.
- `realtime.ts`와 `validation.ts`는 platform envelope와 Legacy Hangul v1 contract가 밀접한 compatibility composition이므로 P5A 전까지 이동하지 않았다.

따라서 server/web consumer는 계속 `@hangul-rummikub/shared` root만 import하고 새 package subpath API는 생기지 않는다.

## 6. Dependency와 import ownership

현재 실행 방향은 다음과 같다.

```text
platform transport/composition
  -> Legacy Hangul compatibility seams
  -> mixed application orchestration
  -> Hangul domain

platform persistence/projector
  -> Legacy Hangul state/projector seam
  -> Hangul domain

shared v1 compatibility composition
  -> shared Hangul command/projection contracts
```

Hangul domain은 Express, Socket.IO, React, transport, application service, persistence model 또는 infrastructure adapter를 import하지 않는다. `game-state.ts`와 `tile-inventory.ts`가 pure injected `IdGenerator`/`RandomSource` type을 `ports/system.ts`에서 읽는 결합은 남는다.

Compatibility router는 기존 mixed application service의 type을 import하고, player lifecycle action은 기존 finish/turn transition을 runtime에서 사용한다. 반대 방향의 RoomLeave/Presence dependency는 type-only여서 현재 JavaScript circular dependency는 없다. 이 구조는 새 abstraction 없이 P3A~P3C behavior를 보존하기 위한 의도적인 transitional seam이다.

`hangul-module-import-boundary.test.ts`는 다음을 고정한다.

1. old domain과 top-level Legacy seam 경로에 production implementation이 다시 생기지 않는다.
2. source/test import가 old canonical path를 사용하지 않는다.
3. Hangul domain이 platform orchestration/runtime adapter를 역참조하지 않는다.
4. module 밖 direct import는 현재 검증된 mixed/composition allowlist를 넘지 않는다.

## 7. 의도적으로 유지한 coupling

- `RoomRecord.game`은 계속 concrete `GameState | null`이다. 두 번째 state가 없는 상태에서 `unknown`, `any`, JSON blob 또는 fake base type으로 바꾸지 않았다.
- mixed application service는 여전히 Hangul state/rules와 platform transaction orchestration을 함께 가진다.
- active-turn/game-deadline/finished-retention recovery port는 현재 Turn/Game shape를 사용한다.
- `StateSnapshot` v1, realtime event map, validation entry와 Web renderer는 Legacy Hangul v1 compatibility surface다.
- workspace/package/product naming은 현재 한글 제품 기준이며 P3D 범위에서 바꾸지 않았다.

## 8. Compatibility 불변 조건

P3D는 다음을 변경하지 않는다.

- `protocolVersion = 1`
- `/`, `/room/{ROOM_CODE}`, `/health`, `/socket.io`
- `room:create` payload와 `gameType` 비노출
- Socket.IO command/advisory 이름과 acknowledgement/error semantics
- flat LOBBY/PLAYING/FINISHED `StateSnapshot` key/visibility
- player-private rack, bag order와 server-only state 비공개
- start, Submit, Draw, Pass, timeout, reconnect, leave/forfeit, result, retention/cleanup 규칙
- Web route, renderer, 문구와 `resolveLegacyHangulRoomView` fallback

## 9. P4 stop gate

P3D 뒤에는 protocol v2, catalog 또는 두 번째 game으로 바로 진행하지 않는다. 다음 Phase는 기능 추가 없는 **P4 — Hangul production regression gate**다. P4는 clean production build/start, same-origin serving, multi-client lifecycle, session/reconnect, timeout/forfeit/result/cleanup과 privacy를 현재 extracted module에서 다시 검증한다.
