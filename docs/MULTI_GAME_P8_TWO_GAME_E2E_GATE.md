# Multi-game Platform P8 Two-game E2E Gate

> 상태: SOURCE E2E COMPLETE / PUBLIC DEPLOYMENT VERIFICATION PENDING
> 검증일: 2026-09-07
> 기준 checkpoint: `458ddfe feat: add number tile web gameplay`
> 대상: `HANGUL_TILE` + `NUMBER_TILE`

## 1. 판정 범위

P8은 새 기능이나 공통 abstraction을 추가하지 않고, P7C까지 완성된 두 concrete game이 하나의 Room/session/realtime runtime에서 서로 침범하지 않는지 검증하는 release gate다. 검증 기준은 기존 unit/application/integration/security test, 새 raw Socket.IO two-game test, clean production build와 실제 로컬 production browser A/B smoke다.

이번 gate에서 production source, shared wire, gameplay rule과 dependency는 변경하지 않았다. 추가 변경은 누락된 regression test, test helper와 이 검증 기록뿐이다. `GameModule`, generic game state/result/turn/tile/rack, `GEM_CARD`, protocol redesign은 도입하지 않았다.

## 2. Automated gate

최종 suite는 shared 75, Web 142, server 699로 총 916 tests다. P7C의 909 tests는 삭제하거나 skip하지 않았다.

새 regression coverage는 다음을 고정한다.

- raw `number:submit`: deterministic exact 29 initial meld는 canonical state와 idempotency record를 남기지 않고 거절하며, exact 30의 RUN + GROUP은 Table, rack, `initialMeldCompleted`, revision과 next Turn을 한 번만 commit한다.
- raw Joker recovery: actor rack에서 오지 않은 replacement는 `INVALID_JOKER_RECOVERY`로 atomic reject한다. Exact color/number ordinary replacement와 같은 Submit의 동일 Joker `tileId` 재사용은 성공하고 assignment와 physical identity가 보존된다.
- simultaneous rooms: 별도 Hangul V1 Room과 Number V2 Room을 같은 runtime에 두고 양방향 wrong command와 cross-shaped payload를 fail-closed한다. 같은 request ID를 각 Room에서 사용한 parallel Draw와 replay는 Room별로 한 번만 mutate한다.
- scheduler/recovery isolation: Hangul 60초, Number 90초 Turn deadline을 각각 읽고 overall game deadline은 Hangul만 복구한다.
- production-serving: capable A/B client가 explicit Number Room create, gameType 없는 join, shared start, idempotent Draw, viewer privacy와 stable-player resume를 실제 HTTP/Socket.IO production server surface에서 수행한다. Number advisory는 0이다.
- Web recovery: same canonical identity는 pending/draft를 유지하고 newer revision 또는 changed Turn은 supersede한다.
- import ownership: Web Hangul/Number feature와 shared Hangul/Number contract namespace의 상호 import를 금지하고 Hangul domain의 Number server import도 금지한다.

기존 suite가 함께 고정하는 영역은 다음과 같다.

| 영역 | Hangul | Number |
| --- | --- | --- |
| lifecycle | create/join, 2~4인 start, Submit/Draw/Pass, timeout, reconnect, leave/forfeit, 모든 기존 finish reason | create/join, 2~4인 start, Submit/Draw/Pass, timeout, offline streak/resume, leave/forfeit, `RACK_EMPTY`/`STALEMATE`/`LAST_PLAYER_STANDING` |
| state | concrete Hangul Room state, 60초 Turn, 25분 deadline | concrete Number Room state, 90초 Turn, overall deadline 없음 |
| projection | V1과 V2, own rack only, bag count only | V2 only, own rack only, pool count only, public Table/Joker assignment |
| admission | legacy omission과 modern Hangul V2 | V2 선택 + exact `NUMBER_TILE` capability가 create/join/resume 전에 필수 |
| delivery | existing `turn:started`/`game:finished` | authoritative snapshot only, Number advisory 없음 |
| persistence | exact Hangul adapter, CAS/UoW/immutable game type | exact Number adapter, CAS/UoW/immutable game type |

## 3. V1/V2와 capability matrix

| Room | client capability | 결과 |
| --- | --- | --- |
| `HANGUL_TILE` | snapshot/game capability omission | Legacy V1 지원; `snapshotVersion`/`gameType` 없음 |
| `HANGUL_TILE` | snapshot `[2,1]`, Hangul 지원 | V2 지원; canonical `room.gameType = HANGUL_TILE` |
| `NUMBER_TILE` | V2 + `NUMBER_TILE` 지원 | V2 지원 |
| `NUMBER_TILE` | V1 선택, capability omission 또는 Hangul-only | create/join/resume mutation 전에 거절 |

Home selection, URL, invitation state와 event name은 renderer/dispatch authority가 아니다. Join과 resume은 canonical Room의 immutable `gameType`과 current connection capability를 사용한다. URL은 계속 `/room/{ROOM_CODE}`이며 join payload에는 game type이 없다.

## 4. Cross-game isolation

- Hangul Room의 `number:*`와 Number Room의 `turn:*`는 matching service로 fallback하지 않는다.
- Number `ProposedTable`과 Hangul `ProposedBoard` cross-shaped 입력은 strict wire schema 또는 canonical router에서 거절된다.
- Wrong/cross-game rejection은 Room/game/storage revision, state, accepted idempotency와 advisory를 만들지 않는다.
- Same request ID는 Room/player command scope 밖으로 새지 않으며 각 Room의 replay만 반환한다.
- `RoomRecord.gameType`은 create부터 join/start/gameplay/timeout/resume/leave/finish까지 바뀌지 않는다.
- Hangul projection에는 Number Table/pool/result가 없고 Number projection에는 Hangul Board/WordGroup/consonant-vowel bag/result가 없다.

## 5. Privacy와 security

두 게임 모두 viewer own rack만 physical descriptor와 `tileId`를 제공한다. 상대는 rack count만 보며 bag/pool order와 IDs, session token, verification/hash, socket/generation, storage/idempotency, scheduler/offline tracker는 projection에 없다. Number Table 위 ordinary face와 Joker assignment만 public이며 FINISHED에서도 상대 rack detail을 공개하지 않는다.

기존 malformed/security matrix는 oversized/extra-field input, stale revision, reused request conflict, non-primary/replaced session, unauthorized Tile probe normalization, unsupported capability, cross-origin production Socket.IO와 secret-free health를 계속 검증한다.

## 6. Local production browser gate

Fresh production output을 `npm start`로 실행한 실제 browser A/B smoke에서 다음을 확인했다.

- Home은 한글 타일·숫자 타일 정확히 두 card만 제공하고 placeholder가 없다.
- Hangul: default selection create, invitation/direct join, shared start, rack 14×2와 bag 81/47, Draw, refresh/resume, 기존 PLAYING renderer.
- Number: explicit create, gameType 없는 direct join, shared start, rack 14×2, pool 78, empty Table, 90초 Turn, GROUP/RUN editor, Draw 뒤 actor rack 15·pool 77·next Turn, refresh/resume.
- Number invalid empty GROUP Submit은 읽을 수 있는 한국어 오류를 표시하고 draft를 보존한다.
- Dirty Draw confirmation 취소는 draft를 보존하고 focus를 Draw control로 복원한다. 확인은 command를 실행하고 committed snapshot 뒤 draft를 버린다.
- A/B Number projection에서 actor만 15개 tile descriptor를 보고 상대는 rack count 15만 본다. FINISHED 화면도 rack tile detail을 공개하지 않는다.
- Hangul/Number 두 A/B tab의 browser warn/error log는 비어 있었다.

Random browser rack으로 valid 30/Joker recovery를 만들지 않았다. 그 규칙은 production debug/cheat 없이 deterministic raw protocol test에서 검증했다. Pool-empty Pass/STALEMATE도 browser state를 조작하지 않고 existing application/integration gate로 검증했다.

## 7. Responsive와 accessibility

390×844와 320×568에서 Home create/join control, Number PLAYING action control과 FINISHED result의 document-level horizontal overflow와 clipping이 없었다. 320px Number PLAYING에서 GROUP/RUN, Undo/Reset, Submit/Draw control은 폭 안에 있고 높이 48px이다. 긴 rack만 `overflow-x: auto`인 내부 영역에서 스크롤하며 document 폭을 늘리지 않는다.

Native button semantics, color 외 문자 marker, tile accessible label, 44~48px target, stable countdown live status와 dirty confirmation focus 이동/복원은 automated accessibility test와 browser 관찰로 확인했다. 실제 physical keyboard 전체 journey, Safari/Firefox 실제 device와 screen reader는 이번 환경에서 직접 검증하지 않았다.

## 8. Fresh build와 serving

Tracked source가 아닌 git-ignored shared/Web/server dist만 제거한 뒤 root build를 다시 생성했다. Fresh output은 `/health`, `/`, direct Room SPA, hashed asset, missing asset/API/non-GET 처리와 graceful shutdown gate를 통과했다. 그 실제 `npm start` process를 대상으로 별도 legacy Hangul A/B와 capable Number A/B raw Socket.IO smoke를 수행했다. 양쪽 모두 create/join/start/Draw/resume가 revision 1까지 이어졌고 Number duplicate Draw는 두 번째 mutation을 만들지 않았다. Same-origin WebSocket은 성공하고 attacker Origin은 거절됐다.

## 9. Public Railway status

이 P8 요청에는 P7C checkpoint `458ddfe`가 Railway의 Active/Successful/master/1 Replica라는 사용자 확인이 없다. 마지막으로 사용자에게 확인된 public checkpoint는 P5C였으므로 public endpoint의 현재 정상 여부를 P7C/P8 production 성공으로 추정하지 않는다.

따라서 현재 판정은 다음과 같다.

- source/local: `SOURCE_E2E_COMPLETE`
- public: `DEPLOYMENT_PENDING_USER_ACTION`
- P9A: public P8 verification 전에는 `NOT READY`

사용자가 Railway Dashboard에서 P8 checkpoint 또는 최소 P7C `458ddfe`의 Active/Successful/master/1 Replica를 확인한 뒤, Home 두 card와 Hangul/Number public A/B smoke, Number V2/gameType, privacy와 console을 별도 검증해야 한다. Push/redeploy는 process-memory Room/Game/session을 모두 잃게 할 수 있다.

## 10. Known limitations

- single-process in-memory Room/Game/session은 restart/deploy 때 사라진다.
- Railway는 one replica 전제가 필요하지만 이번 요청에서 현재 replica를 직접 또는 사용자 확인으로 재검증하지 않았다.
- Hangul production dictionary는 계속 `test-dictionary-v1`이다.
- 실제 Safari/Firefox/device/screen reader 전체 journey는 미검증이다.
- Number random browser rack의 valid 30/Joker recovery와 pool-empty browser Pass는 deterministic protocol/application test로 대체했다.

P8 public gate가 완료되기 전에는 P9A abstraction analysis를 시작하지 않는다.
