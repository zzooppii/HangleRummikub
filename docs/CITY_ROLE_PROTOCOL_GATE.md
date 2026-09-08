# CITY_ROLE — P14B protocol / integration gate

> 문서 계약 상태: **P14B COMPLETE / DOMAIN READY / CLASSIC_REFERENCE_VERIFIED / CARDSET_CONFIRMED**.
> DOMAIN READY는 P14B의 설계 준비 판정이며 runtime schema, event 등록 또는 구현 완료를 뜻하지 않는다.
> CITY-001–070/E01–03 및 사용자 승인 exact60-card를 반영한 전체 final audit는 [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)를 따른다. P15A는 별도 요청 전 시작하지 않는다.

## 1. 승인된 규칙과 문서 경계

이 설계의 입력은 CITY-001 C, CITY-004 B, CITY-018 B, CITY-019 B, CITY-070 B 및 나머지 A이다. 사용자 메시지의 축약 `002–017 A`와 개별·마지막 설명 `004 B` 중 명시적 다역할 설명을 적용한다. 즉 시작 인원 2–6명, 매 round setup의 eligible 2/3명은 각 2 roles, 4–6명은 각 1 role이다. 상세 권한과 규칙은 [decision gate](./CITY_ROLE_DECISION_GATE.md), [P14B rules](./CITY_ROLE_GAME_RULES.md), [consistency audit](./CITY_ROLE_P14B_CONSISTENCY_AUDIT.md)를 따른다.

이 문서가 결정하는 것은 승인된 gameplay를 표현하는 **CITY 전용 계약 방향**이다. 새 능력·새 timeout·새 공개 정보·새 종료 조건을 추가하지 않는다. `CITY_ROLE`, 아래 DTO 이름과 event는 문서상의 후속 구현 계약이며 현재 `GameType`/capability/Socket.IO에 존재하지 않는다. `protocolVersion` 숫자, HANGUL V1/V2, NUMBER/GEM payload와 규칙은 그대로 유지한다.

## 2. 현재 source에서 확인한 integration seams

경로는 repository root 기준이며 P14B 시작 source에서 직접 확인했다.

| Source / symbol | 현재 사실 | 후속 CITY 구현 시 필요한 좁은 변경 |
| --- | --- | --- |
| `apps/server/src/application/room-session-service.ts` / `MAX_ROOM_PLAYERS`, join check | 모든 Room admission max4 | canonical `room.gameType` 기준 CITY max6, 기존 3종 max4; join preflight/UoW 경쟁 검증 유지 |
| `packages/shared/src/platform/platform-snapshot-v2.ts` / `LobbyPlatformPlayersV2Schema`, `ActivePlatformPlayersV2Schema` | Lobby max4, active 2–4; exact game/phase branches | CITY용 Lobby/active roster bounds만 추가; 기존 schemas 상한을 전역 6으로 바꾸지 않음 |
| `apps/web/src/lib/game-start.ts` / `GameStartSnapshot`, `getGameStartControl` | 입력 Room에 gameType이 없고 2–4 문구/검사 고정 | canonical shell의 gameType을 좁게 전달해 CITY 2–6만 허용; Host/Lobby/all-CONNECTED/pending checks 유지 |
| `apps/web/src/features/lobby/LobbyScreen.tsx` | 참가자 counter와 accessible label max4 | CITY counter max6와 game-specific title/help 연결; H/N/G UI 의미 보존 |
| `packages/shared/src/games/gem-card/v2-projection-contracts.ts` 및 H/N concrete contracts | 개별 roster/result/winner/rank bounds도 game-owned | 해당 3종 bounds는 그대로. CITY에서 roster/ranking max6와 자기 projection correlation 새 검증 |
| `apps/server/src/model/persistence.ts` / `RoomRecord`, `RoomWriteCandidate` | H/N/G exact discriminator-state union | 향후 exact `CityRoleRoomRecord` branch; generic state/envelope 금지 |
| `apps/server/src/infrastructure/in-memory-persistence.ts` / `validateRoomGameCoherence` | Room.players를 `game.turnOrder`와 비교 | CITY stable participant roster와 비교; role 호출 순서에 playerId를 중복시켜 기존 검사를 속이지 않음 |
| 같은 파일 / `listActiveTurnDeadlines` | adapter의 `activeTurn.turnId/deadlineAt`과 gameRevision 사용 | CITY selection/action timed window까지 읽는 concrete inspection coverage 필요 |
| `apps/server/src/ports/system.ts` / `ScheduledTurnDeadline`, `TurnScheduler` | room/game/turn/revision/deadline tuple, cancel by TurnId | CITY action window와 typed mapping seam 검토. selection을 가짜 H/N/G turn으로 만들지 않음 |
| `apps/server/src/application/turn-transition.ts` / `toScheduledTurnDeadline`, `scheduleCurrentTurnBestEffort` | 현재 3종의 non-null `game.turn`, 동일 gameRevision 검사 | CITY 중간 mutation도 **원래 deadline**으로 최신 descriptor 재등록; stale callback/overdue recovery 검증 |
| `apps/server/src/games/gem-card/compatibility/gem-card-game-state-adapter.ts` | concrete clone/whole-state validation/lifecycle inspection | CITY 자체 adapter가 hand/role/pending/round validation 소유; GEM adapter 재활용 금지 |
| `apps/server/src/games/gem-card/application/gem-card-command-service.ts` / `#withinLane` | canonical gameType→current auth→request replay→phase/actor/deadline/revision→candidate/UoW | 같은 platform mechanism 사용 근거. GEM의 action마다 turn 종료 정책은 CITY로 복사하지 않음 |
| `apps/server/src/application/room-admission-policy.ts` | 미광고 gameType 및 non-H V1 거부 | CITY도 V2와 explicit CITY capability 모두 필요; admission 전에 fail-closed |
| `apps/server/src/application/platform-snapshot-v2-projector.ts` | self membership 확인, 4-field participant shell, concrete game projection | CITY viewer/subphase projector 새 branch. participant helper에 hand/role/gold 추가 금지 |
| `packages/shared/src/protocol.ts`, `apps/server/src/transport/socket-io.ts` | concrete command union, authenticated dispatch/ACK/fan-out | CITY event의 좁은 additive 등록, canonical Room.type으로 routing; generic command 없음 |
| `apps/web/src/lib/snapshot-wire-decoder.ts`, `apps/web/src/lib/room-snapshot-shell.ts`, `apps/web/src/App.tsx` | exact 3-game decode/render, 공통 Room/session shell | CITY exact decode/route만 추가. 기존 H/N/G 변환/renderer rewrite 불필요 |
| `apps/web/src/features/game-catalog/game-catalog.ts`, `apps/web/src/lib/saved-game.ts` | 3-game catalog 및 saved session의 gameType presentation | 후속 CITY 공개명/재접속 metadata 추가; role/hand를 saved credential에 넣지 않음 |

새 CITY start는 Host·LOBBY·2–6 registered players·all-CONNECTED를 확인하고 actor/presence precondition을 commit 시 재검사하는 방향이다. 이는 기존 platform 시작 조건을 약화하지 않는 integration 계약이다. PLAYER COUNT 변경은 위 단일 상수 교체로 끝나지 않는다. Snapshot/coherence/result/admission/Web 시작/6인 responsive/6인 reconnect regression이 함께 필요하다. 기존 H/N/G start/domain/adapter/player-count tests의 2–4 계약을 유지한다.

## 3. Room phase와 CITY action identity

외부 Room phase는 `LOBBY | PLAYING | FINISHED` 그대로다. CITY `PLAYING`의 durable subphase만 `ROLE_SELECTION | ROLE_ACTION`으로 나눈다. ROLE_SETUP, 역할 호출/미보유 skip, ROUND_END는 외부 입력이 필요 없는 동안 하나의 bounded canonical transition 안에서 계산한다.

| 값 | 의미 / lifetime |
| --- | --- |
| `gameId` | 기존 opaque game identity. 다른 game의 낡은 명령을 거부 |
| `gameRevision` | 시작 0; 성공한 각 canonical CITY command 또는 server-action commit마다 1 증가. private pick/draw/choose도 포함 |
| `roundNumber` | 설명과 round/effect rules용 count. 별도 mutation authority나 유일성 token이 아님 |
| `actionId` | server가 새 **개별 pick** 또는 새 **정상 role action**에 발급하는 opaque CITY window identity. 같은 player의 두 roles도 서로 다름 |
| `deadlineAt` | 해당 pick 45초 / role action 90초의 server deadline. build/ability/draw/choose/guide/resume으로 연장되지 않음 |
| `actorPlayerId` | 인증된 지속 player identity와 일치해야 함. Host/leader/roleId/socketId를 대신 쓰지 않음 |
| `activeRoleId` | ROLE_ACTION에서 정상 reveal된 역할. ROLE_SELECTION에는 active role owner를 노출하는 필드가 없음 |

`actionId`는 CITY 전용 단일 token 개념이다. `roundId + phaseRevision + selectionId + choiceId` 계층은 추가하지 않는다. 같은 action 안에 draw pending은 최대 하나이며, 승인된 acquisition budget과 `gameRevision`이 낡은 choice를 차단한다. pending용 별도 deadline/token은 필요하지 않다. Runtime opaque ID primitive를 기존 generator 표현으로 재사용할 수 있는지는 구현 시 타입 경계에서 검토하되 H/N/G TurnId 의미를 변경하지 않는다.

Reject/stale/replay/presence-only는 추가 gameRevision 증가가 없다. 정상 resume의 offline streak reset은 game-private bookkeeping이며 새 action/role/deadline을 만들거나 gameplay revision을 올리는 이유가 아니다. 선택→마지막 pick→role-entry 자동 효과가 한 command의 candidate라면 전체가 +1이지 내부 단계 수만큼 증가하지 않는다.

## 4. Concrete command surface

`game:start`는 현재 `expectedRoomRevision`과 빈 payload 방식 유지. CITY의 일곱 gameplay command는 아래 공통 envelope 방향을 사용한다. 이는 설명용 명세이지 TS/schema 구현이 아니다.

```text
kind: concrete city:* event와 일치
protocolVersion: 현재 플랫폼 값
requestId: 기존 RequestId
gameId: 현재 CITY gameId
expectedGameRevision: 현재 canonical gameRevision
actionId: 현재 server-issued CITY timed window
payload: 아래 event별 strict closed shape
```

Room/actor는 authenticated current-primary socket binding에서 얻는다. Client가 payload에 room type/player owner/deadline/score/gold/next role을 넣어 authority를 선택하게 하지 않는다. `roundNumber`도 검사 tuple을 대신하지 않는다.

| Event | 정확한 payload 방향 | 허용 시점 / atomic 의미 |
| --- | --- | --- |
| `city:selectRole` | `{roleId}` | ROLE_SELECTION의 current chooser만. Available role 하나를 소유로 이동, pick cursor 이동, 필요한 다음 timed window 생성 |
| `city:takeIncome` | `{}` | ROLE_ACTION의 미소비 기본 acquisition. Gold2와 CR-06 후속 bonus를 함께 반영; role turn은 계속 |
| `city:drawBuildingCards` | `{}` | 미소비 acquisition, supply가 최소1일 때. 최대2장을 server deck에서 분리해 private pending 생성; RNG/선택지 authority는 server |
| `city:chooseBuildingCard` | `{cardId}` | 같은 action의 DRAW_BUILDING pending owner만. 후보1장을 hand로, 나머지를 draw 순서로 deck bottom, acquisition 완료/후속 bonus 반영 |
| `city:useRoleAbility` | 아래 CITY-only closed variant | 기본 acquisition 완료, pending 없음, 해당 optional 능력 미사용인 현재 role owner. 능력·카드 이동·지불 전부 atomic |
| `city:build` | `{cardId}` | own hand의 physical instance, acquisition 완료/pending 없음, gold/건설 budget/template 중복 확인. city 이동·gold 지불·score/finish latch 함께 commit |
| `city:endTurn` | `{}` | acquisition 완료/pending 없음. Optional 미사용 허용; 다음 role/round/terminal을 bounded transition으로 처리 |

Optional ability payload의 **다섯 개 concrete variants**:

| `ability` discriminator | 추가 필드 | 독립 검증 |
| --- | --- | --- |
| `MARK_ROLE_DISABLED` | `targetRoleId` | CR-01만; 현재보다 높은 roster role. hidden ownership/removal/disable 여부로 입력 거부하지 않음 |
| `MARK_ROLE_GOLD_TRANSFER` | `targetRoleId` | CR-02만; 높은 role. 자기 다른 role/absent/disabled 대상도 입력 자체는 같은 의미로 허용 |
| `EXCHANGE_HANDS` | `targetPlayerId` | CR-03만; 다른 eligible player. 양쪽 exact hands의 private atomic 교환 |
| `REPLACE_OWN_CARDS` | `cardIds` | CR-03만; 최소1개의 중복 없는 own physical IDs, 공급/수량 검증. CR-03의 두 variant는 합쳐서 once budget |
| `DESTROY_BUILDING` | `targetPlayerId`, `cardId` | CR-08만; 다른 eligible public city와 physical card, 공개 보호/current count, 비용 확인 |

CR-04/05/06/07의 mandatory leader/category/보호/카드 bonus는 command가 아니다. CR-08 category 수입도 role entry에서만 처리한다. `useRoleAbility`는 CITY 안의 닫힌 합집합이며 role framework/callback bag/generic game executor가 아니다. Payload에 ability 비용·효과·타이밍을 임의 전달하지 않는다.

`REPLACE_OWN_CARDS`는 discard 후 draw하며 승인된 discard reshuffle 규칙상 방금 discard한 카드가 다시 나올 수 있다. 별도 quarantine/다시 뽑기 금지 규칙을 만들지 않는다. **P14B-E03 CONFIRMED:** 자기 카드 교환은 최소1장이다. 0장 요청은 reject하며 능력 once budget·gameRevision·카드 상태·RNG를 소비하지 않는다. 이는 사용자가 확정한 문서 계약이며 이 단계에서 runtime schema에 `minLength(1)`을 구현한 것은 아니다.

## 5. Canonical pending vs local UI

ROLE_ACTION 내부 기본 acquisition 상태는 `NOT_TAKEN → DRAW_BUILDING_PENDING → COMPLETE` 또는 gold로 `NOT_TAKEN → COMPLETE`다. ROLE_ACTION의 current actor/role/actionId/deadline은 pending 전후 동일하다.

- Draw 요청 성공 시 후보가 canonical deck에서 빠지고 pending zone에 정확히 한 번 존재한다. Request replay나 stale retry는 재추첨하지 않는다.
- 1장만 뽑혔어도 같은 pending/choose 계약으로 표현할 수 있다. 자동 UI 선택을 하더라도 새 command는 현재 pending revision으로 한 번만 commit해야 하며 draw와 합친 숨은 재추첨이 아니다.
- 0장 availability면 draw 전체 reject, acquisition 미소비; gold 선택 가능. Deck/discard 접근 순서는 final rules가 소유한다.
- Highlight, card 확대, 대상 hover, 확인창, Guide 열림은 local transient. 서버 pending을 local modal에만 두거나 full TurnDraft/Undo로 되돌리지 않는다.
- Pending 중 build/ability/endTurn은 reject. Timeout default와 explicit leave cleanup만 승인된 별도 server-action 경로다.
- 선택된 role/own hand/pending은 same-browser resume 후 그대로 복원한다. 새 player join/새 role/새 draw/deadline 재설정 없음.

## 6. V2 phase-correlated projection

기존 outer snapshot의 `snapshotVersion`, `versions.roomRevision/presenceVersion`, `serverTime`, `room`, `self.playerId`를 사용한다. `room.gameType=CITY_ROLE`은 후속 concrete branch에서만 추가한다. Public participant mapping은 기존 네 필드(playerId/nickname/isHost/connectionStatus) 그대로다.

CITY 공통 game header: gameType/gameId/gameRevision, rulesVersion/cardSetVersion/roleSetVersion, roundNumber, stable seatOrder, leaderPlayerId, playerStates. CITY player summary는 playerId/gold/handCount/builtBuildings/public score preview/forfeited만 포함한다. 모든 시작 참가자 roster를 유지하며 역할 수만큼 player row를 복제하지 않는다. 자기 hand와 다른 player의 hand count는 같은 필드에 합치지 않는다.

| Exact branch | Public | Viewer-private |
| --- | --- | --- |
| LOBBY | CITY Room players와 metadata, `game=null` | Game hand/role/choice 없음 |
| PLAYING / ROLE_SELECTION | round/leader/seat order, public removed role IDs, current chooser와 actionId/deadline, public cities/gold/hand counts | own hand/current-round owned roles; **current chooser만** availableRoleIds |
| PLAYING / ROLE_ACTION / NOT_TAKEN 또는 COMPLETE | 정상 activeRoleId/actor/actionId/deadline, 이미 공개된 role 결과, public city/economy | own hand/own unrevealed roles, 자신의 optional ability 사용/현재 role 행동 budget, 자신이 만든 private mark의 허용 정보 |
| PLAYING / ROLE_ACTION / DRAW_BUILDING_PENDING | 위 공통 + pending kind/actor. 후보 수는 없음 | owner만 exact candidate cards와 draw order; 다른 viewer는 candidate 필드 자체 없음 |
| FINISHED | CITY result/rankings/도시/bonuses/forfeit, 이미 합법적으로 공개된 role 사실 | 남아 있는 own private hand/role만 본인에게; 종료했다고 타인 hand/미공개 history 추가 공개 금지 |

`availableRoleIds`는 자기 이전 pick 때 받은 과거 목록이 아니라 **현재 선택 권한**에만 전달한다. 기존 chooser가 알게 된 과거 정보의 기억을 지웠다고 주장하지 않지만, 다음 chooser의 변경 목록을 전원에게 push하지 않는다. `selectedRole=null` 배열을 전원분량으로 보내 소유 구조를 누설하지 않는다.

CITY-010 A와 CITY-070 B의 결합: 미보유/disabled 호출은 같은 공개 skip 표현이며 disabled owner는 정상 role action으로 노출하지 않는다. Disabled owner 공개는 승인된 round-end 처리에서만; gold mark는 정상 reveal 시 실제 이전 결과만 public. Private target 자체를 공용 action log/ACK에 미리 넣지 않는다. 효과가 없었던 표적·미선택 역할·hidden removal을 추론 편의를 위해 추가 공개하지 않는다. 이미 공개된 gold/hand count 변화로 가능한 정당한 추론과 private ID/owner 직접 leak를 구분한다. **P14B-E01 CONFIRMED:** source player가 forfeit하면 그 player가 만든 미해결 CR-01/CR-02 mark를 모두 취소한다. 이미 해결된 skip/이전을 되돌리지 않으며 취소 때문에 secret target을 추가 공개하지 않는다. Frozen source에게 이후 자원을 이전하거나 source-free mark를 계속 적용하지 않는다.

다음은 모든 player snapshot에서 제외한다: deck/discard order와 future IDs, hidden removed roles, 타인의 미공개 selected roles/choice list/mark target, RNG, offline streak, session credential/verification data, storageRevision, idempotency/scheduler records. 카드 catalog 정의 공개와 아직 보지 못한 **physical instances/order** 공개는 다르다. Physical cardId는 opaque해야 하며 templateId·deck index·future 순서를 encode하지 않는다.

Strict decoder는 CITY 2–6 unique roster/self membership, participant↔game playerStates correlation, handCount↔self exact count, public/private physical 중복, role/order/window/subphase correlation을 확인한다. Client가 볼 수 없는 deck/모든 role partition까지 검증한 척하지 않는다. 전체 conservation/hidden coherence는 server adapter의 책임이다. `privateRackMatchesSelfCount`에 fake Rack을 넣는 방식은 금지다.

## 7. Admission / security / ACK / replay

향후 CITY 지원 Web은 실제 handshake에서 V2 지원과 CITY_ROLE 지원을 함께 광고한다. 현재 `[2,1]` 순서를 바꿀 필요는 없으며 HANGUL legacy fallback은 그대로다. CITY 미광고 또는 V1-only client는 create/join/resume 전에 fail-closed; capability를 Room/session 권한이나 Host의 secret 열람 권한으로 저장하지 않는다.

명령 처리 순서의 계약:

1. Canonical room type와 authenticated current-primary actor 확인. Wrong-game 요청으로 타 게임 service가 secret state를 읽거나 replay하는 경로 금지.
2. Room/player scope의 requestId와 payload fingerprint 검사. Fingerprint에는 concrete kind, gameId, expectedGameRevision, actionId, payload의 의미를 포함한다. Secret payload 자체를 운영 로그로 출력하지 않는다.
3. 동일 request/fingerprint는 저장된 성공 결과 재사용, 새 RNG/지불/선택/bonus/타이머 없음. 같은 ID에 다른 의미는 `REQUEST_ID_REUSED` 방향으로 거부.
4. New request는 game/Room phase, current window/actor, server receivedAt deadline, expectedGameRevision, physical ownership/role budget/규칙 검증.
5. Immutable candidate의 전체 상태를 검증하고 Room/session/idempotency를 UoW/CAS와 current-primary precondition으로 원자 commit. 성공 후 player별 fresh snapshot fan-out.

ACK는 기존 ROOM-scoped 구조를 유지하고 CITY success data는 최소 `gameId`와 `committedGameRevision`으로 제한하는 방향이다. Own draw/선택지는 viewer-specific snapshot에서 받고, 오래된 replay ACK에 담긴 private state를 live snapshot으로 되돌리지 않는다. 새 request로 sync/resume할 수 있지만 acknowledgment loss를 이유로 draw를 다시 실행하지 않는다.

현재 auth/phase/deadline/stale/requestId 오류 범주는 보존한다. 신규 CITY domain 실패의 실제 error-code mapping은 후속 구현 gate에서 strict schema와 함께 정하되, forged/nonexistent/opponent/private card reference는 같은 비공개-safe 오류 의미를 사용한다. Hidden role가 존재하는지·이미 disabled인지에 따라 target enabled state/거부 코드/ACK detail을 다르게 하지 않는다. Public wrong-game `INTERNAL_ERROR` taxonomy debt를 이번 protocol 설계로 광범위 개편하지 않는다.

## 8. Scheduler / timeout / UoW

Sequential pick이므로 한 CITY game에 동시 timed actor는 최대 하나다. 각 pick은45초, 정상 role action은90초, draw pending은 그 role의 남은 시간을 그대로 쓴다. Overall deadline scheduler는 추가하지 않는다.

후속 scheduled identity의 최소 의미는 `{roomId, gameId, actionId, expectedGameRevision, deadlineAt}`이다. State의 action discriminator로 selection/action 정책을 고르므로 scheduler payload에 role ability/config를 싣지 않는다. 현재 `ScheduledTurnDeadline`의 public type이 이미 이 action 모델을 표현한다고 주장하지 않는다. CITY concrete mapping/reader/dispatch의 좁은 typed 확장이 필요하다.

**중간 revision 변경 주의:** CITY는 기존 단일-command-turn 게임과 달리 draw/build/ability 뒤 동일 action이 계속된다. 현재 mapper와 scheduler에는 expectedGameRevision이 있으므로 매 성공 commit 뒤 **같은 actionId와 원래 deadline**으로 최신 revision descriptor를 재등록해야 한다. 이전 callback은 stale no-op. 새 callback 등록 실패 시 같은 현재 descriptor를 overdue reader/sweeper가 복구해야 한다. Deadline을 새90초로 만들거나 stale callback이라는 이유로 영원히 timeout을 놓쳐서는 안 된다.

선택 완료/role end/active leave/terminal이면 이전 descriptor를 취소하고, 다음 waiting window가 있으면 새 actionId/deadline을 등록한다. Callback은 Room lane 안에서 tuple·실제 deadline 경과·현재 actor eligibility를 다시 확인한다. Auth command/timeout/leave/resume이 경쟁해도 한 candidate만 commit한다.

**P14B-E02 CONFIRMED:** timeout의 현재 window default/종료를 처리하고 해당 시점의 종료 조건을 먼저 확인한다. 이미 terminal이면 추가 forfeit/다음 entry가 없다. 아직 terminal이 아니면 offline streak가 3회인 player를 forfeit 처리하고, 청산·E01 mark 취소·remaining eligible 종료 조건 확인을 마친 다음에만 다음 role의 mandatory entry 또는 새 round setup을 준비한다. 즉 다음 role 수입·이전·카드 bonus나 다음 round draft quota를 source forfeit보다 먼저 계산하지 않는다. 이 전체 처리는 하나의 canonical server-action candidate/UoW이며 중간 live state를 노출하지 않는다. Explicit leave는 pending 후보/hand discard·gold 반환·city frozen·role tombstone·session 해제를 같은 UoW에 묶고 accidental disconnect에는 이 청산을 적용하지 않는다.

## 9. Concrete storage / recovery

`CityRoleGameStateAdapter`에 해당하는 새 concrete adapter 방향이다. 현재 exact Room union/adapter bag을 유지하며 registry/envelope를 선행 추출하지 않는다.

- Start roster/seat order는 고유 playerId 2–6. Round draft queue는 quotas를 가진 별도 배열이고 role resolution은 CR order다. 같은 player가 두 action을 한다고 stable roster에 중복시키지 않는다.
- 8 roles는 public removal/hidden removal/available/selected(leave tombstone 포함)/최종 unselected로 정확히 partition된다. Quota는 round setup에서 고정하고 중간 leave는 남은 pick만 skip한다.
- 60 physical cards는 deck/discard/hands/public cities/pending choice의 정확히 한 zone에 존재한다. 자체 cardset version 정의와 template/cost/category를 검증하며 clone에서 RNG 또는 ID를 재생성하지 않는다.
- Public gold의 gameplay cap 없음과 machine-safe 정수 validation을 구분한다. 임의 gameplay 상한/자산 clipping을 추가하지 않는다.
- Role marks/once budget/protection/leader/firstCompletion/round-end 공개 자료/result coherence를 CITY rules에 맞게 검증한다.
- RUNNING inspection은 selection 또는 role action의 현재 deadline 하나, FINISHED는 finishedAt/result를 제공한다. Awaiting pending이 sweep에서 사라져서는 안 된다.
- Resume/clone 후 own role/hand/pending order/actionId/deadline이 동일해야 한다. 서버-only state를 wire 공용 DTO로 저장하지 않는다.

현재 persistence는 process-memory이며 실제 durable DB/재배포 복원 기능이 아니다. 1 replica/redeploy loses Room/Game/session limitation은 이 planning으로 해결되지 않는다.

## 10. 후속 구현 regression gate

1. CITY 시작 인원2/3/4/5/6, join7 거부, H/N/G join5와 기존 start 상한 유지, V1 exact regression.
2. 같은 private canonical state를 모든 참가자별로 project/decode; 선택자 전용 available list, own hand/pending, secret mark·hidden removal·future card leak0.
3. 2/3인 두 roles의 별도 actionId, 같은 player 연속 role 처리, next-round quota 변경, leave tombstone과 role partition.
4. Select/draw/choose/build/ability/end 성공/reject/stale/동일 replay/다른 fingerprint, 같은 requestID 다른 game 재사용 충돌, current-primary 교체 시 fail-closed.
5. Draw pending의 refresh/resume/replay가 동일 후보/기한을 복원하고 재draw0; 후보 count조차 타인에게 없음. Local highlight/cancel은 canonical mutation0.
6. 중간 build/ability 후 deadline 불변, 최신 revision timeout descriptor·오래된 callback no-op·등록 실패 recovery; pick/action/forfeit 경합과 terminal 이후 mutation0.
7. Forged/opponent/unknown card reference의 같은 외부 오류 의미; absent/disabled/self-owned hidden role target의 입력 응답으로 소유/mark 확인 불가.
8. 60-card zone/8-role partition/roster/action/score adapter round-trip와 corrupt-state reject; clone 후 arbitrary IDs/order 재생성 없음.
9. H/N/G snapshots/privacy/reconnect/gameplay/production-serving 및 P12 release gate 유지. Existing UI/audio/rules와 release tag 변경 없음.

이 목록은 설계상의 검증 요구이며 P14B에서 새 runtime test를 실행했다고 표시하지 않는다. 실제 구현은 rule ambiguity와 content approval gate가 닫히고 사용자가 별도 구현을 승인한 다음에만 시작한다.
