# CITY_ROLE — P14A architecture stress analysis

> 기준: `8f8da13342269aef33c87bd5b1a1a76a953c3bde` / P13B COMPLETE.
>
> P12 verified runtime/tag: `three-game-platform-v1` → `db0e6c638835dc8164236fc3841f4f3a88db6054`.
>
> 상태: planning only. 아래 모델은 제안이며 [decision gate](./CITY_ROLE_DECISION_GATE.md)의 사용자 선택과 P14B consistency audit 전에는 구현 계약이 아니다.

> **P14B 현재 상태 (2026-09-08): P14B COMPLETE / DOMAIN READY.** 70개 선택과 E01–03, 사용자 승인 exact60장, CLASSIC_REFERENCE_VERIFIED를 유지한다. 2–6인, 2/3인 각2roles, 45초 pick/90초 role action을 반영했다. 이 문서의 조건부 표현은 P14A source 분석 history다. 현재 exact 계약 방향과 player-cap source inventory는 [protocol gate](./CITY_ROLE_PROTOCOL_GATE.md), final gate는 [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)를 따른다. Runtime/registry/adapter 구현은 여전히 없고 P15A도 시작하지 않았다.

## 1. 범위와 결론

`CITY_ROLE`은 이름 후보일 뿐 현재 `GameType`이 아니다. P14A는 production·shared schema·tests·dependency·기존 game rules를 변경하지 않는다. P13의 보류 항목은 네 번째 게임을 논의한다는 이유만으로 승인되지 않는다.

현재 platform의 Room/session/credential/current-primary/Room mutation lane/UoW/CAS/per-viewer delivery는 재사용할 근거가 있다. 반면 **비밀 역할 선택과 라운드별 actor, server-owned pending choice를 기존의 단일 `game.turn`으로 이미 표현할 수 있다고 판단할 근거는 없다.** 새 게임은 concrete domain/state/projector/adapter/commands를 필요로 한다. 공통 mechanism이 있다는 사실과 integration 변경 없이 작동한다는 주장을 구분한다.

가장 중요한 세 가지 gate는 다음이다.

1. 5–6인 선택 시 admission·V2 validators·Web 시작 control의 현재 4인 제한을 game별로 재검토해야 한다. 단순 registry 항목 추가로 해결되지 않는다.
2. Round participant roster, 역할별 resolution order, 현재 명령 actor는 서로 다른 개념이다. 현재 persistence의 `turnOrder` roster 검사는 이 차이에 직접 영향을 받는다.
3. Secret selection 및 draw-and-choose는 정보 공개 자체가 canonical mutation이다. modal을 닫거나 reconnect한다고 새 선택지를 다시 뽑아서는 안 된다.

## 2. Source evidence inventory

경로는 repository root 기준이다. 기준 commit의 실제 source/symbol을 검토했으며 P13 결론만을 재인용한 것이 아니다.

| 현재 source / symbol | 확인한 사실 | CITY_ROLE에 대한 의미 |
| --- | --- | --- |
| `apps/server/src/model/persistence.ts` — `RoomRecord`, `RoomWriteCandidate` | H/N/G discriminator와 concrete state를 exact union으로 연결 | 향후 승인된 fourth concrete branch를 추가하는 방향. `RoomRecord<unknown>` 또는 generic envelope 불필요 |
| `apps/server/src/application/room-session-service.ts` — `MAX_ROOM_PLAYERS`, join capacity check | Room 가입은 현재 최대 4명 | CITY-001의 3–6/2–6은 future capacity integration gate |
| `packages/shared/src/platform/platform-snapshot-v2.ts` — `LobbyPlatformPlayersV2Schema`, `ActivePlatformPlayersV2Schema` | Lobby max4, active min2/max4. strict game/phase-correlated branches | 기존 H/N/G 허용 인원을 넓히지 않고 CITY 인원 계약을 추가해야 함 |
| `apps/web/src/lib/game-start.ts` — `getGameStartControl` | Web도 2–4, Host, Lobby, all-CONNECTED를 확인 | count/start requirement 확정 후 concrete control 입력/validation audit 필요 |
| `apps/server/src/games/game-registry.ts` — `GameRegistration`, `GameRegistry` | immutable gameType identity-only | role/ability/deck/renderer/timeout을 등록하는 거대 GameModule 근거 없음 |
| `apps/server/src/application/session-resume-service.ts` — `resumeSession` | credential hash/verification, bound room/player, roomCode, membership, capability 확인 | 기존 player로만 복귀. private role/hand는 인증 이후 projector가 재전달 |
| `apps/server/src/application/room-admission-policy.ts` — `isRoomAdmissionCompatible` | explicit supported game type와 snapshot representation을 함께 검사 | CITY V2-only를 권장. V1-only/미광고 client는 admission 전에 fail-closed |
| `apps/server/src/ports/room-unit-of-work.ts` — `RoomUnitOfWorkChangeSet` | Room/session/idempotency를 atomic commit; Room/storage revision precondition | secret choice·resource·role effect와 revision을 candidate에서 검증하고 한 번 commit |
| `apps/server/src/games/gem-card/application/gem-card-command-service.ts` — `#withinLane` | canonical gameType, current auth, scoped request replay, actor/turn, server receivedAt, revision 검증 후 commit | 재사용할 mechanism의 실례. GEM의 단일-action turn 정책을 CITY로 복사하지 않음 |
| `apps/server/src/ports/system.ts` — `ScheduledTurnDeadline`, `TurnScheduler` | `{roomId, gameId, turnId, expectedGameRevision, deadlineAt}`; cancel by turnId | 일반 role/choice scheduler 계약이 이미 존재하는 것은 아님 |
| `apps/server/src/application/turn-transition.ts` — `toScheduledTurnDeadline`, `scheduleCurrentTurnBestEffort` | 세 concrete game의 non-null `game.turn`을 읽음 | secret draft에서 가짜 player turn을 만들지 말고 실제 timed-action 모델부터 결정 |
| `apps/server/src/infrastructure/in-process-turn-scheduler.ts` — `turnKey`, `deadlineIdentity` | timer key는 room/game/turn, revision/deadline으로 replacement identity 확인 | stale callback/cancel mechanism 재사용 검토 가능, 선택 timeout policy는 CITY 소유 |
| `apps/server/src/infrastructure/overdue-turn-sweeper.ts` — `sweepOnce` | active-turn reader에서 due identities를 받아 재진입 안전하게 enqueue | CITY pending choice가 active-turn reader에서 누락되면 stall; future recovery coverage 필요 |
| `apps/server/src/infrastructure/in-memory-persistence.ts` — `validateRoomGameCoherence`, `listActiveTurnDeadlines` | Room roster를 `game.turnOrder`와 비교; adapter lifecycle의 `activeTurn`으로 deadline 열거 | roster/role-order와 lifecycle inspection 경계의 실제 stress point |
| `apps/server/src/games/gem-card/compatibility/gem-card-game-state-adapter.ts` — `GemCardGameStateStorage` | typed clone/whole-state validation, RUNNING activeTurn 또는 FINISHED | CITY용 concrete adapter 필요. 현재 adapter는 unknown JSON codec이 아님 |
| `apps/server/src/application/platform-snapshot-v2-projector.ts` — `project` | self membership 확인; platform shell과 concrete game projector 분리 | CITY private/public/subphase correlation을 새 game projector에서 명시 |
| `apps/server/src/transport/socket-io.ts` — `projectSnapshotForSocket`, `fanOutRoomSnapshots` | socket capability와 player별 projection을 사용 | 역할/hand를 room-wide payload 하나로 broadcast하지 않음 |
| `apps/web/src/lib/snapshot-wire-decoder.ts`, `apps/web/src/App.tsx` | 현재 세 exact decoder/render branches | CITY phase-specific concrete view가 필요하나 renderer registry는 선행조건 아님 |
| `apps/web/src/lib/saved-game.ts` — `SavedGameStorage` | tab credential + browser backup, replaced-tab auto-reclaim 방지, gameType은 presentation metadata | 동일 browser resume mechanism 유지. role/hand를 saved credential에 함께 저장하지 않음 |
| `apps/web/src/features/gem-card/GemGameHelp.tsx` — `GemHelpDialog` | native dialog focus/inert shell, GEM-specific steps, timer는 계속 진행 | CITY own tutorial/contextual guide 추천 근거이지 generic tutorial framework 근거는 아님 |

## 3. Game-owned canonical model — 후보

Outer Room의 `LOBBY → PLAYING → FINISHED`와 CITY 내부 round 진행을 분리한다. 현재 RoomPhase를 `ROLE_SELECTION` 등으로 늘리는 것을 기본안으로 삼지 않는다.

```text
Room LOBBY
  └─ 승인된 game:start → Room PLAYING
       └─ ROUND SETUP → ROLE SELECTION
            → ROLE RESOLUTION cursor
               → eligible role owner의 ACTION window
                  ↔ canonical pending choice (필요할 때)
               → 다음 role
            → ROUND END → next round setup
       └─ 승인된 terminal 조건 → Room FINISHED
```

이 그림은 논리 전이다. `ROUND SETUP`, owner가 없는 role call, `ROUND END`가 즉시 계산 가능한 경우 하나의 atomic transition 안에서 처리하고 durable phase를 불필요하게 늘리지 않는 방향을 권장한다. 선택 대기나 외부 명령을 기다리는 단계만 명시적 substate로 남긴다. 역할 reveal·ability timing 선택이 달라지면 durable 구분도 P14B에서 달라질 수 있다.

| 후보 state | 역할 / 불변 조건 | 아직 확정하지 않는 것 |
| --- | --- | --- |
| `roundNumber` | 실제 round 진행 count; replay로 두 번 증가하지 않음 | 별도 opaque roundId가 반드시 필요한지 |
| participant roster | game 시작 참가자와 forfeited/frozen records | 역할 draft 순서와 같은 배열로 강제하지 않음 |
| leader/draft order | 이번 round의 선택 순서 및 next-round leader | crown/rotation/role effect 중 무엇인지 |
| `roleSelectionState` | public/hidden removals, available roles, chooser, chosen role ownership | 순차/동시, player당 role 수, 공개 timing |
| `roleResolutionCursor` / `activeRole` | role 호출 순서와 skip/disabled 처리 | roleId를 playerId나 socketId로 사용하지 않음 |
| action actor/window | 현재 실제 명령을 수행할 player와 deadline | 1 player가 여러 role을 갖는 경우 각 window identity 분리 |
| pending choice | owner, private candidates, allowed selection cardinality, resolution/default policy | 모든 UI click을 canonical state로 저장하지 않음 |
| economy / cards / city | gold, hand, deck/discard, public built buildings, role effects | data/special ability 규칙은 OPEN |
| result / end pending | approved trigger와 scoring evidence | GEM fair-round/ranking 구현을 그대로 차용하지 않음 |

`activeRole`과 `activePlayer`를 항상 public한 한 쌍으로 만들면 secret selection을 깨뜨릴 수 있다. Selection의 chooser public 여부와 role reveal 시점을 projection에 따로 적용한다. Host는 Room 시작 권한이지 secret deck/role inspection 권한이 아니다.

## 4. Pending choice와 local interaction 경계

| 행동 | Local transient만으로 충분한 부분 | Server-owned canonical 부분 |
| --- | --- | --- |
| Role 선택 | highlight, 카드 확대, 확인 버튼 | 실제 선택된 role, available-set 변경, 다음 chooser, timeout 결과 |
| Draw-and-choose | 이미 허용된 후보 중 highlight | deck에서 뽑힌 exact instances, choice owner, 제한/잔여 시간, 선택·반환 destination |
| Role target | public/허용된 target UI 선택 | target legality, secret-target effect, 사용 횟수, effect timing |
| Build | own hand 카드 highlight | 비용/건설 제한/중복/카드 이동/점수/종료 trigger |
| End turn | 확인창 | unresolved mandatory choice 방지, next-role/cursor transition |

두 장을 본 뒤 한 장을 선택하는 규칙을 승인하면 **draw 요청에서 이미 deck에서 candidate가 분리되는 canonical pending choice를 commit**해야 한다. 선택은 그 pending state를 소비한다. Refresh·재전송·modal 닫기로 더 좋은 카드를 다시 뽑는 경로는 금지다. Timeout이 어떤 카드를 유지하고 나머지를 어디에 보내는지는 rule decision이며 서버가 독자적으로 선택하지 않는다.

Number의 전체 Table proposal/Undo50을 CITY에 도입하지 않는다. Canonical pending choice를 client-only TurnDraft나 UI modal에 저장하는 것도 안 된다. 동일 내용의 card definition이 여러 장 존재하도록 승인하면 definition과 physical instance identity를 구분하고, hand/deck instance ID에 future order를 인코딩하지 않는 방향을 권장한다.

## 5. Command 및 mutation identity 방향

기존 `game:start`는 유지하고 CITY concrete additive events를 검토한다.

| 후보 event | Boundary / atomicity |
| --- | --- |
| `city:selectRole` | 현재 선택 actor와 available role을 검증, ownership/next chooser를 atomic commit |
| `city:takeIncome` | gold branch 승인 시 base acquisition을 한 번 소비 |
| `city:drawBuildingCards` | draw branch 승인 시 private pending choice를 생성; 모두 즉시 취득하는 규칙이면 단일 commit |
| `city:chooseBuildingCard` | current pending choice에서만 선택; request replay로 redraw 금지 |
| `city:useRoleAbility` | CITY의 승인된 ability별 closed payload/validation; platform generic command 아님 |
| `city:build` | own exact card와 gold/limit/phase/effect를 검증 후 원자적 건설 |
| `city:endTurn` | 미완료 mandatory step/choice 확인 후 role-resolution 진행 |

이름/수/DTO는 후보이며 지금 schema를 추가하지 않는다. Income과 draw를 하나의 concrete acquisition command의 closed option으로 묶는 대안도 가능하다. 다만 아직 보지 못한 private draw 결과를 다음 선택과 하나의 client command로 미리 제출하게 하지는 않는다. 전체 role turn을 한 번에 제출하는 generic executor도 제안하지 않는다.

재사용할 기반은 Room lane, server `receivedAt`, authenticated `actorPlayerId`, `requestId`, `gameRevision`, UoW/CAS다. 현재 세 게임의 turnId가 뜻하는 **하나의 active action window**와 CITY의 선택/window가 의미상 같을 때만 reuse 여부를 판단한다. Round counter만으로 같은 round 내 여러 선택/role-turn을 구분할 수는 없다.

최소 identity 제안은 `room/game identity + expectedGameRevision + requestId + current actionable-window identity`다. `roundId + phaseRevision + selectionId + turnId`를 모두 추가하는 것은 제안하지 않는다. Exact pending-choice ID가 필요한지는 하나의 window에 여러 sequential choice가 있는지와 replay scope를 검증한 뒤 결정한다. Presence-only나 resume 자체를 새 role selection으로 해석하지 않는다.

동시 선택을 승인하면 전역 revision의 첫 성공이 다른 정당한 동시 선택을 stale로 만드는지 별도 설계가 필요하다. 이를 피하려고 revision validation을 약화하거나 선택 순서를 숨겨 임의 승자를 정하지 않는다. Pending-choice별 identity/충돌 규칙과 secret availability가 P14B blocker다.

## 6. Timer / scheduler / recovery

현재 scheduler의 stale callback, exact identity replacement, cancellation, best-effort schedule와 overdue sweep은 유지할 mechanism이다. Timeout consequence는 CITY domain에 남긴다. H60초/overall25분, N90초, G45초와 offline strike 수를 CITY default로 복사하지 않는다.

| 선택 구조 | 필요한 safety / 재사용 판단 |
| --- | --- |
| 순차 role draft + 순차 role action | 동시에 하나의 actionable window만 유지하는 제안이 가장 작음. selection→action 시 old callback 취소/새 identity 필요. 현재 typed mapper/adapter/router에 CITY concrete 지원은 여전히 필요 |
| action 중 draw pending choice | action deadline을 유지할지 별도 choice deadline을 둘지 결정. 새 choice 때문에 무제한 시간 연장 금지; retry/resume은 deadline reset 아님 |
| 동시에 여러 secret selections | timer driver가 여러 keys를 담을 수 있다는 사실만으로 platform 지원 완료가 아님. reader/lifecycle/actor matching/revision/timeout conflict를 새로 검토 |
| owner 없는/disabled/forfeited role | 승인된 skip/reveal 정책을 deterministic bounded transition으로 계산. 진행할 actor가 없는데 stale timer만 남는 상태 금지 |
| explicit leave / offline timeout | 역할/hand/city 처리와 pending-choice 해소, remaining eligible, current callback cancellation을 같은 canonical transition 계획에 포함 |

후속 구현 검증에서는 callback tuple의 room/game/window/revision/deadline이 현재 state와 모두 일치하는지, actor가 여전히 eligible인지, deadline이 실제 지났는지 재검사해야 한다. Timeout 직전 사용자 명령/leave/resume 경쟁은 같은 Room lane에서 직렬화한다. Selection timeout 기본값은 사용자 선택 전 OPEN이며 hidden RNG 사용 시 server RandomSource만 authority다.

현재 `ActiveTurnReader`와 persistence `listActiveTurnDeadlines`는 하나의 `activeTurn` 형태를 읽는다. CITY selection과 private pending choice까지 recovery가 놓치지 않도록 하는 최소 concrete lifecycle extension은 implementation gate에서 필요하다. Generic timeout policy나 거대 lifecycle registry를 먼저 만들 이유는 아니다. 현재 recovery는 **process-local overdue recovery**이지 재배포 후 durable restore가 아니다.

## 7. Snapshot V2 / privacy stress

권장 방향은 CITY V2-only exact branch다. H legacy V1/V2와 N/G exact DTO는 그대로 둔다. Outer shell은 room identity/phase, participant metadata, versions/serverTime/self만 맡고 CITY projection은 own game data를 담당한다. P13B `projectRoomParticipants`의 네 필드에 role/hand/gold를 추가하지 않는다.

| Outer / internal phase 후보 | Public CITY projection 후보 | Viewer-specific private 후보 |
| --- | --- | --- |
| LOBBY | 시작 전 설정/규칙 버전 표시가 승인된 범위 | game state 없음 |
| PLAYING / ROLE_SELECTION | round, 승인된 leader/chooser metadata, public removal, public cities/economy | 자기 hand, 자기 선택 role, 현재 chooser에게만 available choices |
| PLAYING / ROLE_RESOLUTION 또는 ACTION | current called role/reveal, eligible actor, public action/deadline/cities | 자기 unrevealed role/hand, 자신에게 허용된 pending choice만 |
| FINISHED | 승인된 result breakdown/public cities | hand/role history 공개 결정에 따라 exact branch 정의; 자동 전원 공개 아님 |

정확한 phase별 정보 행렬은 [rules draft](./CITY_ROLE_GAME_RULES_DRAFT.md)의 privacy matrix와 decision gate를 따른다. 위 표는 공개 승인이 아니다. Gold/hand count/selected-role reveal/finished history는 OPEN인 규칙과 일치해야 한다.

추가 privacy 검증 면:

- 같은 canonical state를 A/B/C별로 project해 타인 hand/selected role/choices/hidden removal이 섞이지 않는지 검사한다. Public current actor와 role을 조기에 함께 내보내는 간접 leak도 검사한다.
- Hidden target ability의 reject message, ack payload, option list, enabled state가 아직 공개되지 않은 role 소유자를 확인하는 oracle이 되지 않아야 한다. Hidden valid target의 효과가 언제 드러나는지도 rule gate다.
- Deck order, future draw IDs, RNG, offline streak, storage/idempotency/scheduler internals는 projection에서 제외한다. 본인 credential은 전용 credential path일 뿐 game snapshot/broadcast field가 아니다.
- Public role/card **definitions**와 이번 round/deck의 **secret selection/order/instances**를 구분한다. Published catalog 자체를 secret state와 같은 object로 직렬화하지 않는다.
- Replay ack의 private data는 authenticated player/request scope를 벗어나 재사용하지 않는다. Current-primary 교체 후 stale socket에 fan-out하지 않는 기존 guard를 유지한다.

## 8. Persistence / roster / result

CITY-specific typed adapter를 권장한다. 저장 candidate는 deck/discard/pending cards/hands/built cities의 physical conservation, gold/effect coherence, removed/available/selected roles의 partition, round/leader/cursor/actor/choice identity, terminal result를 함께 검사해야 한다. Clone 후 같은 private state·순서·identity가 유지되어야 한다. 결과나 선택지를 clone 과정에서 다시 RNG로 계산하지 않는다.

현재 `validateRoomGameCoherence`는 `Room.players`와 `game.turnOrder`의 동일 참가자 집합을 요구한다. CITY의 **등록/게임 참가 roster는 stable**, 역할 선택 순서와 role-resolution cursor는 round-owned라는 분리가 필요하다. 역할 이름을 `turnOrder`에 넣거나, player당 복수 역할 때문에 playerId를 중복시키거나, 비활성 역할이 없다는 이유로 참가자를 제거하면 기존 roster invariant를 잘못 만족시키는 셈이다.

따라서 future integration에서 exact CITY participant inspection을 concrete adapter에 둘지, 현재 central roster inspection의 작은 platform boundary를 정리할지 판단할 실질적 증거가 생겼다. 그러나 아직 규칙도 정해지지 않았으므로 **POTENTIAL PLATFORM ABSTRACTION EVIDENCE**이지 extraction 승인/registry 필요성 증명은 아니다.

Finished result는 CITY concrete scoring breakdown/bonus/forfeit/tie semantics를 가진다. 기존 GameResult domain, GEM VP ordering, Number penalty를 상속하지 않는다. Finished role history/hand 공개 여부는 별도 rule decision이다. Persisted result가 승인된 score 계산과 정확히 일치하는지 검사하되 공개 projector에는 허용된 breakdown만 보낸다.

## 9. Reconnect / Web / mobile

Session resume·single-primary·automatic/manual/Home recovery를 재사용한다. `SavedGameStorage`는 탭 폐쇄 후 browser backup과 replaced-tab guard를 소유한다. 현재 gameType presentation whitelist와 Web catalog/decoder는 future CITY integration에서 좁게 추가해야 하므로 “아무 변경 없이 fourth game Home resume 완료”라고 하지 않는다.

정상 resume은 같은 player, 같은 round/subphase, 같은 own hand/selected role/pending draw candidates와 현재 deadline을 복원해야 한다. 새 player join, 새 role draw, fresh choice/deadline 생성이 아니다. Missing/wrong credential은 fail-closed이며 Host도 타인의 private projection으로 resume하지 못한다. Explicit leave와 accidental disconnect는 다르며 leave 후 credential/membership 처리와 frozen game participation은 승인된 정책을 concrete lifecycle action과 UoW에서 연결해야 한다.

Web은 Room shell 안의 CITY concrete screen으로 시작하는 방향을 권장한다. Desktop top에 round/호출 role/현재 actor/timer, center에 public cities, side/bottom에 own hand/gold/own role을 둔다. Secret selection은 별도 phase-correlated UI로 구성하고 선택 가능한 role이나 카드가 없는 타인 화면에는 private 선택 component 자체를 전달하지 않는다.

Mobile은 exact own hand/role을 읽기 쉬운 tap flow, public cities의 compact summary, phase guidance, viewport 내 pending-choice modal을 우선 검토한다. Number의 persistent HUD/board drag/tap/compact tile CSS를 generic platform mobile behavior로 올리지 않는다. Shared-device shoulder-surfing 최소화용 가리기 UI는 선택 가능한 제품 요구이지 server privacy를 대신하지 않는다.

Tutorial/Guide/current-phase guidance는 복잡한 role timing을 설명하는 own content로 권장하되 사용자 결정 전 구현하지 않는다. GEM의 native dialog focus/scroll 사용 경험은 참고할 수 있으나 six-step 구성/45초 문구/GEM rules를 가져오지 않는다. Tutorial pause 여부도 timer rule과 일치해야 한다. Common audio engine, Turn HUD component, GenericTurnDraft/renderer/tutorial framework는 제안하지 않는다.

## 10. Platform stress classification

분류는 READY = mechanism 재사용 근거 있음, MINOR EXTENSION = 기존 좁은 계약의 명시적 추가, NEW GAME-SPECIFIC CONCRETE SUPPORT = 새 게임이 소유할 규칙/state, POTENTIAL PLATFORM ABSTRACTION EVIDENCE = 후속 source evidence가 필요한 seam이다. 어느 행도 P14A 구현 승인을 의미하지 않는다.

| 영역 | 분류 | 판단 / 선행 결정 |
| --- | --- | --- |
| Room identity / Host / credential / current-primary | READY | rule을 포함하지 않는 기존 mechanism 유지 |
| Room capacity / start control | MINOR EXTENSION | 5–6인 승인 시 server/shared/Web bounds audit; H/N/G unchanged |
| Exact Room union / identity registry | MINOR EXTENSION | CITY exact branch 추가 방향, generic registry 확장 불필요 |
| Room lane / UoW / CAS / idempotency storage | READY | canonical private mutation을 atomic commit하는 mechanism |
| Role draft / abilities / rounds / economy / build | NEW GAME-SPECIFIC CONCRETE SUPPORT | rule decisions 전 domain 설계 확정 불가 |
| Player actor vs role-resolution identity | NEW GAME-SPECIFIC CONCRETE SUPPORT | 복수 role/skip/reveal/leader 선택의 영향을 명시 |
| Secret projection / pending choice | NEW GAME-SPECIFIC CONCRETE SUPPORT | per-viewer fan-out는 READY지만 새 필드/phase correlation 검증 필요 |
| V2 decode / admission / concrete routing | MINOR EXTENSION | V2-only candidate, unsupported client fail-closed |
| Deadline driver / stale callback mechanism | READY | 선택·행동의 consequence 정책과 분리 |
| Selection/action lifecycle inspection / recovery | POTENTIAL PLATFORM ABSTRACTION EVIDENCE | `activeTurn` 단일 가정의 stress; 동시성/choice timer 승인 후 좁은 boundary 판단 |
| Persistence participant inspection | POTENTIAL PLATFORM ABSTRACTION EVIDENCE | central `turnOrder` roster coupling의 실제 fourth-game 차이 |
| CITY clone/validate/result projector | NEW GAME-SPECIFIC CONCRETE SUPPORT | hand/role partition/conservation와 result 자체는 concrete |
| Same-browser reconnect mechanism | READY | exact new private projection + catalog/decoder wiring 추가 필요 |
| Web phase screens / tutorial / mobile choice | NEW GAME-SPECIFIC CONCRETE SUPPORT | identity router만 MINOR EXTENSION, renderer registry 불필요 |
| Retention/cleanup | READY | 외부 PLAYING lifecycle 유지 시 기존 mechanism; 장기 all-offline와 선택 stall은 구분 |
| Finish/scoring/role history visibility | NEW GAME-SPECIFIC CONCRETE SUPPORT | 다른 게임의 winner/tie/reveal policy를 복사하지 않음 |

## 11. P13 WAIT_FOR_FOURTH_GAME 재관측과 implementation gate

Roster inspection과 scheduled actionable-state inspection에서 실제 설계 차이가 드러났다. 하지만 **네 번째 game이 아직 production에 존재하지 않으므로** codec/lifecycle/renderer registry, stored envelope, start shell, common Result/HUD를 EXTRACT_NOW로 승격하지 않는다. 현재 typed concrete adapters와 exhaustive branches를 기본안으로 유지한다. Source duplication과 동일 invariant가 향후 구현에서 실증된 뒤 별도 승인 대상으로만 다시 다룬다.

P14B 전에 해결해야 할 blocker는 player count/roles-per-player, draft/removal arithmetic, sequential vs simultaneous selection, ability timing과 private pending choice, finish/forfeit precedence, timeout/default choice 및 information visibility다. 그 전에는 card data, DTO, scheduler identity, game domain 구현을 확정하지 않는다.

후속 승인된 구현의 regression surface 초안:

1. Secret phase별 A/B/C projection, hidden-role/hand/target-oracle 차단, V1/unsupported capability reject.
2. Select/draw/choose/ability/build/end replay·stale·deadline·current-primary 경합과 atomic no-partial commit.
3. Round boundaries/ownerless roles/forfeit/current pending choice가 stall 없이 진행; timer cancellation과 overdue recovery.
4. Adapter clone/validate round-trip에서 hand/deck/roles/choices/result identity 보존; invalid partitions reject.
5. Refresh/background/tab close-open에서 같은 private state와 deadline resume; nickname-only takeover 금지.
6. 기존 H/N/G 및 release snapshot/security/reconnect/production-serving gate 전체 유지.

이 목록은 미래 tests의 설계 방향이다. P14A에서 test/runtime source를 추가하거나 P14B 이후 구현을 시작하지 않는다.
