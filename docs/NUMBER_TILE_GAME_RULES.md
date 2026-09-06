# Number Tile Game Rules Gate

> 상태: `AWAITING_RULE_DECISIONS`
> 작성일: 2026-09-06
> 내부 식별자 후보: `NUMBER_TILE`
> 공개 작업명: 숫자 타일 게임
> 편집 draft: `P6-DRAFT-1` (runtime rules version 아님)
> 효력: 설계 초안이며, `USER_DECISION_REQUIRED` 항목은 구현 계약이 아니다.

## 1. Document status

이 문서는 두 번째 게임의 규칙을 구현 전에 확정하기 위한 P6 gate다. 현재 runtime의 유일한 지원 game type은 `HANGUL_TILE`이며, 이 문서는 `GameType`, registry, catalog, shared schema 또는 production 지원을 추가하지 않는다.

문서의 규칙 문장은 다음 세 등급으로만 해석한다.

- `CONFIRMED`: 기존 플랫폼 안전 불변 조건 또는 이번 요청에서 명시적으로 확정된 제품 방향
- `PROPOSED_DEFAULT`: 구현 가능한 첫 기준안이지만 사용자 승인 전에는 적용 금지
- `USER_DECISION_REQUIRED`: 선택 전에는 그 decision이 속한 후속 Phase 시작 금지

`docs/GAME_RULES.md`는 계속 `HANGUL_TILE`의 canonical 규칙 문서다. 이 문서의 숫자 타일 규칙이 그 문서를 수정하거나 대체하지 않는다.

## 2. Game identity

- 중립 내부 식별자 후보는 `NUMBER_TILE`이다.
- 공개 작업명은 **숫자 타일 게임**이다.
- 특정 상용 게임 브랜드, 공식 logo 또는 공식 art asset을 식별자나 구현 전제로 사용하지 않는다.
- 법률·라이선스 검토는 이 Phase의 범위가 아니다.
- P6에서 `NUMBER_TILE`은 문서상의 후보일 뿐 `SUPPORTED_GAME_TYPES`의 값이 아니다.

게임 방향은 숫자가 표시된 physical tile, 여러 색, rack, table, `GROUP`, `RUN`, Joker, initial meld, 이후 rearrangement를 사용하는 독립적인 숫자 타일 러미 계열 게임이다. 용어가 비슷해도 한글 게임의 규칙을 승계했다는 뜻은 아니다.

## 3. Confirmed rules

현재 확정할 수 있는 것은 다음 안전·소유권 규칙뿐이다.

1. 서버가 Room, game state, pool 순서, draw 결과, deadline(채택하는 경우), legality와 result의 권위자다.
2. 모든 physical tile은 표시값과 별개의 opaque하고 고유한 `tileId`를 가진다. 같은 색·숫자의 두 copy도 서로 다른 tile이다.
3. client draft는 제안일 뿐이며 live canonical state를 직접 변경하지 않는다. 성공한 command만 Room lane 안에서 한 번 원자적으로 commit된다.
4. PLAYING 중에는 상대 rack의 tile detail과 pool의 tile ID·순서를 공개하지 않는다. 최소 공개값은 상대 `rackCount`와 `remainingTileCount`다. FINISHED 공개 범위는 `NT-035`에서 결정한다.
5. `Meld`, `GROUP`, `RUN`, `Table`, Number 전용 `ProposedTable` 용어를 사용한다. Hangul `WordGroup`, syllable, composer, dictionary, Board, RuleEngine 또는 TurnDraft를 재사용하지 않는다.
6. P6는 문서-only gate다. 사용자 승인 전 runtime code, wire schema, registry, catalog와 production behavior는 `HANGUL_TILE` only로 유지한다.

숫자 범위, 색 수, tile 수, player 수, meld legality, Joker, timer와 score는 아직 `CONFIRMED`가 아니다.

## 4. Proposed defaults

아래는 검토를 시작하기 위한 한 묶음의 기준안이다. 일반적인 상용 규칙이라는 이유로 확정하지 않는다.

| 영역 | `PROPOSED_DEFAULT` |
| --- | --- |
| Inventory | 숫자 1~13 × 4색 × 각 2장 + Joker 2장 = 106장 |
| 색상 rule ID | `RED`, `BLUE`, `BLACK`, `ORANGE` |
| Player | 2~4명 |
| 시작 rack | 14장 |
| `GROUP` | 같은 number, 서로 다른 color, 3~4장 |
| `RUN` | 같은 color, 연속 number, 3장 이상, 1~13 범위, wrap 금지 |
| Initial meld | 자기 rack만 사용, 같은 turn의 하나 이상 meld 합계 30 이상 |
| Normal submit | 여러 meld와 split/merge 허용, 최종 table 전체 valid, 자기 rack tile 1장 이상 사용 |
| Draw | play를 commit하지 않을 때 single pool에서 서버가 무작위 1장 draw하고 turn 종료 |
| Win | rack을 먼저 비우면 종료 |
| Privacy | FINISHED에서도 상대 rack detail 비공개 |
| Local draft | refresh/resume 시 폐기하고 canonical snapshot으로 복구 |
| Turn order | 서버가 game start 때 한 번 shuffle한 뒤 immutable |

Joker, Pass/stalemate, timer/timeout, overall deadline, forfeit, scoring과 protocol은 아래 결정표에 남긴다.

## 5. User decisions required

모든 항목의 status는 `USER_DECISION_REQUIRED`다. `Recommended`는 구현 초안의 일관성을 위한 제안이며 승인 표시가 아니다.

| ID | Rule | Proposed default | Alternative | Status | Implementation impact |
| --- | --- | --- | --- | --- | --- |
| `NT-001` | Inventory·color IDs | 1~13 × `RED/BLUE/BLACK/ORANGE` × 2 + Joker 2 = 106 | 숫자 범위, 색, copy 또는 Joker 수 변경 | `USER_DECISION_REQUIRED` | High: inventory, conservation, UI, fixtures |
| `NT-002` | Player count | 2~4명 | 2~6명 또는 다른 범위 | `USER_DECISION_REQUIRED` | High: Room capacity, start, projection |
| `NT-003` | Initial rack | 14장 | 12장/10장/다른 장수 | `USER_DECISION_REQUIRED` | High: deal, pool count, tests |
| `NT-004` | `GROUP` base | 같은 number, distinct colors, size 3~4 | 정확히 3장 또는 다른 cardinality | `USER_DECISION_REQUIRED` | High: RuleEngine |
| `NT-005` | Same-color copy in `GROUP` | 두 physical copy라도 같은 color는 한 GROUP에 함께 사용 금지 | 같은 color copy 허용 | `USER_DECISION_REQUIRED` | High: GROUP validation |
| `NT-006` | `RUN` base | 같은 color, strictly consecutive, length ≥3 | 다른 최소/최대 길이 | `USER_DECISION_REQUIRED` | High: RuleEngine |
| `NT-007` | Run boundaries | 1~13, duplicate number·wrap 금지 | `12-13-1`만 또는 완전 순환 허용 | `USER_DECISION_REQUIRED` | High: RUN/Joker validation |
| `NT-008` | Duplicate meld | physical tile이 다르면 동일 pattern의 별도 meld 허용 | 동일 pattern의 별도 meld 금지 | `USER_DECISION_REQUIRED` | Medium: table validation |
| `NT-009` | Initial threshold | 합계 30 이상 | 다른 threshold 또는 gate 없음 | `USER_DECISION_REQUIRED` | High: state transition |
| `NT-010` | Initial aggregation | 한 turn의 하나 이상 새 meld 점수를 합산 | single meld 하나만 threshold 판정 | `USER_DECISION_REQUIRED` | High: qualification |
| `NT-011` | Initial Joker 허용 | 허용 | initial meld 완료 전 금지 | `USER_DECISION_REQUIRED` | High: legality |
| `NT-012` | Initial Joker value | 명시적으로 배정한 number를 threshold 합계에 사용 | 0 또는 고정값 | `USER_DECISION_REQUIRED` | High: threshold calculation |
| `NT-013` | Initial 전 table rearrangement | existing table은 그대로 두고 새 meld만 추가 | initial threshold를 자기 rack으로 충족하면 existing table rearrangement 허용 | `USER_DECISION_REQUIRED` | High: candidate/table validation |
| `NT-014` | Normal multiple meld | 한 submit에서 여러 meld 생성·변경 허용 | exactly one meld만 변경 | `USER_DECISION_REQUIRED` | High: candidate shape |
| `NT-015` | Rearrangement scope | split/merge/extend/reorder 허용, final table 전체 valid | extend-only 또는 existing table 불변 | `USER_DECISION_REQUIRED` | High: atomic RuleEngine |
| `NT-016` | Rack contribution | successful normal submit마다 자기 rack tile ≥1 사용 | pure table rearrangement 허용 | `USER_DECISION_REQUIRED` | High: turn legality·stalemate |
| `NT-017` | Joker recovery replacement | assigned color+number와 같은 ordinary rack tile로 교체 | same number의 다른 color 또는 다른 조건 | `USER_DECISION_REQUIRED` | High: Joker transition |
| `NT-018` | Recovered Joker disposition | 같은 turn의 다른 valid meld에 반드시 재사용, rack 보관 금지 | 같은 turn 재사용 선택 또는 rack 보관 허용 | `USER_DECISION_REQUIRED` | High: conservation·draft |
| `NT-019` | Meld당 Joker 수 | 최대 1개 | valid assignment이면 복수 허용 | `USER_DECISION_REQUIRED` | High: meld validation |
| `NT-020` | Draw pool | 모든 ordinary/Joker tile의 single shuffled pool | 복수 pool 또는 다른 source | `USER_DECISION_REQUIRED` | High: state·randomization |
| `NT-021` | Draw amount | play 대신 server-selected 1장 | 2장 또는 다른 수량 | `USER_DECISION_REQUIRED` | High: pool/rack transition |
| `NT-022` | Draw 후 action | 뽑은 tile은 다음 turn부터 사용, draw 즉시 turn 종료 | 같은 turn submit 허용 | `USER_DECISION_REQUIRED` | High: action state·UI |
| `NT-023` | Pass 존재 | explicit Pass command 존재 | Pass command 없음 | `USER_DECISION_REQUIRED` | High: command surface |
| `NT-024` | Pass availability | pool이 empty일 때만 허용 | 항상 허용 또는 다른 조건 | `USER_DECISION_REQUIRED` | High: validation·stalemate |
| `NT-025` | Turn timer | 90초 | 60초 또는 제한 없음 | `USER_DECISION_REQUIRED` | High: Turn state·scheduler |
| `NT-026` | Timeout action | pool이 있으면 1장 draw, empty면 no-tile turn으로 계수 후 종료 | 단순 skip 또는 penalty 여러 장 | `USER_DECISION_REQUIRED` | High: server action·race |
| `NT-027` | Overall game deadline | 두지 않음 | 25분/30분/다른 제한 | `USER_DECISION_REQUIRED` | High: scheduler·TIME_LIMIT result |
| `NT-028` | Rack-empty·finish reasons | valid submit으로 rack이 비면 즉시 종료; stalemate/last standing/all forfeited, deadline 채택 시 time limit | round 종료 후 finish 또는 pool-empty 즉시 finish | `USER_DECISION_REQUIRED` | High: result engine |
| `NT-029` | Stalemate proof | pool empty 뒤 eligible players의 full no-play cycle | pool 무관 no-play cycle 또는 server solver | `USER_DECISION_REQUIRED` | High: tracker·complexity |
| `NT-030` | Rack penalty values | ordinary number 합, Joker 30 | Joker 다른 값 또는 count-based | `USER_DECISION_REQUIRED` | High: score |
| `NT-031` | Winner/loser score | rack-empty/last-standing winner는 상대 penalty 합, losers는 음수 | winner 0 또는 ranking only | `USER_DECISION_REQUIRED` | High: result DTO |
| `NT-032` | Other-finish ranking·ties | 낮은 penalty 우선, score는 음수, competition rank 1,1,3 | rackCount 우선 또는 dense rank | `USER_DECISION_REQUIRED` | High: stalemate/deadline result |
| `NT-033` | Explicit leave | PLAYING leave 즉시 forfeit, rack 동결·score 반영 | forfeit 유예 또는 tile을 pool로 반환 | `USER_DECISION_REQUIRED` | High: lifecycle·conservation |
| `NT-034` | Offline timeout·resume | 자기 turn timeout 2회 연속 후 forfeit; resume 시 streak reset | 횟수 제한 없음 또는 독립 grace | `USER_DECISION_REQUIRED` | High: presence·scheduler |
| `NT-035` | FINISHED privacy | 상대 rack detail은 계속 비공개, count/value summary만 공개 | 종료 후 전체 공개 또는 aggregate만 공개 | `USER_DECISION_REQUIRED` | Medium: projection·UI |
| `NT-036` | Draft recovery | refresh/session replacement 시 폐기; presence-only update에는 유지 | browser 복구 또는 server draft | `USER_DECISION_REQUIRED` | Medium: Web state |
| `NT-037` | Turn order | 서버가 start 때 한 번 shuffle, 이후 immutable | join order/Host-first/매 round 변경 | `USER_DECISION_REQUIRED` | Medium: initial state |
| `NT-038` | Command routing | additive `number:submit`/`number:draw`/조건부 `number:pass`; `game:start` 유지 | `number:command` 또는 closed `game:command` | `USER_DECISION_REQUIRED` | High: shared wire·transport |
| `NT-039` | Command protocol version | existing `protocolVersion = 1`에 additive strict Number events | 새 protocol version에서만 Number command 허용 | `USER_DECISION_REQUIRED` | High: rollout·legacy compatibility |
| `NT-040` | Revision·idempotency | Number-owned `gameRevision`·immutable `turnId`; 모든 action에 expected revision/turn ID/request ID, normalized payload fingerprint | Room revision만 또는 table/turn revision 분리 | `USER_DECISION_REQUIRED` | High: concurrency·replay |
| `NT-041` | Advisory events | authoritative V2 snapshot만 사용, 첫 구현에는 Number advisory 없음 | Number-specific 또는 versioned generic advisory | `USER_DECISION_REQUIRED` | Medium: realtime ordering·UI |
| `NT-042` | Client game capability | handshake에 exact `supportedGameTypes`; Number create/join/resume를 mutation 전에 확인; 부재는 legacy Hangul-only | snapshot V2 여부만 사용 또는 join 후 차단 | `USER_DECISION_REQUIRED` | High: ghost membership·compatibility |
| `NT-043` | Start authority·presence | Host만 start, 최소 인원 충족 및 모든 joined player connected | offline player 허용 또는 다른 authority | `USER_DECISION_REQUIRED` | High: start orchestration |
| `NT-044` | Initial threshold tile source | threshold와 새 meld는 자기 rack tile만 사용 | existing table tile 일부/전부를 threshold·meld 구성에 사용 | `USER_DECISION_REQUIRED` | High: ownership·conservation |

`P6-DRAFT-1`은 문서 편집 식별자다. 모든 결정을 승인하면 첫 canonical ruleset을 `number-tile-rules-v1`로 기록하며, persisted state/result 또는 wire에 rules version을 노출할 필요가 있는지는 P7B의 concrete codec/projection 설계에서 별도 검토한다.

P7A를 막는 core rule은 `NT-001`~`NT-034`, `NT-037`, `NT-043`, `NT-044`다. P7B를 시작하려면 추가로 `NT-035`, `NT-038`~`NT-042` 승인이 필요하다. `NT-036`은 P7C 전에 확정해야 한다.

## 6. Tile inventory

`NT-001` 제안은 ordinary tile 104장과 Joker 2장이다.

```text
13 numbers × 4 colors × 2 physical copies = 104
Joker physical tiles                              =   2
Total                                             = 106
```

한글 게임의 consonant/vowel bag을 재사용하지 않는다. Number game은 single shuffled pool 후보이며 공개 projection에는 `remainingTileCount`만 둔다. rule color ID와 Web의 hex·pattern·label은 분리한다. 색상만으로 tile을 구분하지 않도록 Web Phase에서 문자·pattern 보조를 별도로 검토한다.

## 7. Player setup

`NT-002`, `NT-003`, `NT-037`, `NT-043`의 제안은 다음과 같다.

- 2~4명
- Host만 start 요청 가능
- start 시 참가자 전원이 connected
- 서버가 turn order를 shuffle
- 각 player에게 14장을 비공개로 deal
- 제안 inventory라면 2/3/4명 start 직후 pool은 각각 78/64/50장

위 pool 수치는 `NT-001`과 `NT-003`을 함께 승인하는 경우에만 성립한다. 현재 Room의 최대 4명 고정 구현을 Number 규칙의 근거로 사용하지 않는다.

## 8. Meld definitions

### 8.1 `GROUP` proposal

`GROUP`은 같은 number의 tile 3~4장이며 ordinary tile의 color는 서로 달라야 한다. 같은 `RED 7` 두 physical copy는 tile ID가 달라도 같은 group에 함께 둘 수 없다는 것이 `NT-004`·`NT-005` 제안이다. 같은 표시 pattern의 별도 meld 허용 여부는 `NT-008`이다.

### 8.2 `RUN` proposal

`RUN`은 같은 color의 number가 오름차순으로 1씩 증가하는 3장 이상 sequence다. `NT-006`·`NT-007` 제안에서 1은 low-only, 13은 high-only이며 `12-13-1`과 `13-1-2`는 금지한다. 같은 number의 duplicate copy를 한 run에 함께 둘 수 없다.

### 8.3 Table model

Number domain의 후보 용어는 다음과 같다.

```text
Table {
  melds: Meld[]
}

Meld = GROUP | RUN
```

RUN의 order는 의미가 있다. GROUP은 rule상 order가 의미 없더라도 deterministic projection·fingerprint를 위해 canonical ordering을 두는 방안은 P7A 설계에서 결정할 수 있다. 이것은 gameplay rule 변경이 아니다.

## 9. Initial meld

`NT-009`~`NT-013`, `NT-044` 제안:

1. 아직 initial meld를 완료하지 않은 player는 그 turn 시작 때 자기 rack에 있던 tile만 사용한다.
2. 하나 이상의 valid meld를 동시에 제출할 수 있다.
3. 그 turn에 새로 내려놓은 tile의 number 합이 30 이상이어야 한다.
4. Joker를 허용한다면 배정된 number가 합계에 들어간다.
5. 기존 table tile을 가져오거나 table을 재배열할 수 없다.
6. 성공 commit과 함께 player의 `initialMeldCompleted`를 true로 저장한다.

정확히 30은 성공, 29는 실패하는 boundary test가 필요하다. Hangul의 “physical tile 6장” 규칙을 가져오지 않는다.

## 10. Normal turn

Initial meld 완료 후 제안되는 turn 선택지는 mutually exclusive하다.

- `SUBMIT`: local draft의 최종 proposed table을 원자적으로 검증·commit
- `DRAW`: submit 없이 server pool에서 draw하고 종료
- `PASS`: `NT-023`에서 command를 채택하고 `NT-024`에서 허용한 조건일 때만 실행

한 turn에 성공한 canonical action은 최대 하나다. rejected submit은 state/revision을 바꾸지 않으므로 deadline 전에는 같은 turn에서 수정해 다시 시도할 수 있다. draw한 tile을 같은 turn에 다시 play할 수 있는지는 `NT-022` 선택으로 정한다.

## 11. Rearrangement

`NT-014`~`NT-016` 제안은 intermediate draft가 invalid여도 괜찮고 commit 시점의 final table만 valid하면 된다는 것이다. 후보 동작은 다음과 같다.

- 기존 RUN에서 tile 분리
- 두 RUN을 split/merge하여 새 RUN 구성
- 4장 GROUP에서 한 장을 빼 다른 valid meld에 사용
- 기존 meld의 tile과 rack tile을 함께 재배치
- 여러 meld를 한 submit에서 생성·삭제·재구성

최종 검증은 다음을 모두 요구한다.

1. 이전 table의 모든 physical tile이 정확히 한 번 남아 있다.
2. 자기 rack에서 가져온 tile도 정확히 한 번만 사용한다.
3. 다른 player rack이나 pool tile은 참조할 수 없다.
4. 모든 final meld가 valid하다.
5. `NT-016` 제안에서는 자기 rack tile을 최소 1장 사용한다.

## 12. Joker

Joker도 고유 `tileId`를 가진 physical tile이다. table placement에는 Joker가 현재 대신하는 `number`와 `color`가 명시적으로 필요하다. client의 assignment는 제안일 뿐 server가 meld context와 함께 검증한다.

승인이 필요한 세 영역은 다음과 같다.

- Initial meld 사용과 threshold value (`NT-011`, `NT-012`)
- 한 meld의 최대 Joker 수 (`NT-019`)
- 회수 replacement와 회수 후 disposition (`NT-017`, `NT-018`)

제안 회수 예: `RED 5, Joker(as RED 6), RED 7`에서 rack의 physical `RED 6`으로 exact replacement하면 Joker를 회수할 수 있고, 그 Joker는 같은 submit의 다른 valid meld에 배치해야 한다. 단순히 rack으로 되돌린 채 turn을 끝내는 것은 제안상 금지다.

## 13. Draw / Pass

Number game에는 자음/모음 선택이 없다. `NT-020`~`NT-022` 제안의 draw payload는 bag kind나 tile choice를 받지 않으며 server RNG가 single pool에서 한 장을 결정한다.

`NT-023`·`NT-024` 제안에서는 pool이 비어 있을 때 draw 대신 explicit Pass가 가능하다. `NT-029` 제안은 마지막 successful submit 뒤의 eligible player 각각이 한 번씩 Pass 또는 pool-empty timeout을 기록하면 stalemate로 본다. 누군가 submit하면 cycle을 reset한다. player가 leave/forfeit하면 즉시 eligible set에서 제거하고, 남은 eligible players가 모두 현재 cycle에 이미 no-play를 기록했다면 같은 atomic transition에서 stalemate를 판정한다. Pass command를 두지 않는 선택이면 `NT-029`에서 별도 no-play signal 또는 solver 방식을 함께 선택해야 한다.

## 14. Turn timer / timeout

Timer와 timeout action은 서로 다른 결정이다.

- `NT-025`: A 90초 (`PROPOSED_DEFAULT`), B 60초, C turn timer 없음
- `NT-026`: A pool이 있으면 1장 draw, empty면 `no-tile turn`으로 계수 후 종료 (`PROPOSED_DEFAULT`), B draw 없이 skip, C 가능한 범위에서 penalty draw

`NT-025=C`이면 scheduled timeout action 자체가 없으므로 `NT-026`은 적용되지 않는다. `no-tile turn`은 `NT-023`의 client Pass command 존재 여부와 무관한 server-side stalemate signal이며, `NT-029`에서 그 signal을 cycle에 포함할지를 승인한다.

Timer를 채택하면 판정은 server `Clock`의 received-at 기준이며 `receivedAt < deadlineAt`만 유효하다. timeout callback은 at-least-once 실행을 견디고 stale identity, duplicate callback, submit/draw/pass race에서 한 번만 commit해야 한다. local dirty draft는 timeout 때 폐기된다.

## 15. Reconnect / forfeit

Room/session reconnect mechanism은 재사용할 수 있지만 game 결과 정책은 `NT-033`·`NT-034` 결정이다.

제안은 disconnect 자체로 즉시 forfeit하지 않고 turn timer를 계속 진행하는 것이다. offline player가 두 번 연속 timeout하면 두 번째 timeout action을 먼저 적용한 뒤 forfeit하며, 성공한 resume은 streak를 reset한다. PLAYING 중 explicit leave는 즉시 forfeit한다. timer를 채택하지 않으면 이 offline 정책은 별도 grace 기반으로 다시 설계해야 한다.

Local draft는 canonical server state가 아니므로 `NT-036` 제안에서는 refresh/resume 시 폐기한다.

## 16. End conditions

`NT-028`·`NT-029` 제안 finish reason:

- `RACK_EMPTY`: successful submit으로 player rack이 0장
- `STALEMATE`: pool empty 후 active players의 완전한 Pass cycle
- `LAST_PLAYER_STANDING`: forfeit하지 않은 player가 1명만 남음
- `ALL_PLAYERS_FORFEITED`: 모두 forfeit
- `TIME_LIMIT`: `NT-027`에서 overall deadline을 채택한 경우에만 존재

Pool이 empty라는 사실만으로 즉시 finish하지 않는다. 아직 table에 놓을 수 있는 rack tile이 있을 수 있기 때문이다. 전체 legal move를 server solver로 증명하는 것은 P6 제안에 포함하지 않는다.

## 17. Scoring / ranking

`NT-030`~`NT-032` 제안:

- ordinary rack tile penalty = 표시 number
- Joker rack penalty = 30
- player penalty = 남은 rack penalty 합
- `RACK_EMPTY` winner score = 다른 players의 penalty 합, losers = 자기 penalty의 음수
- `LAST_PLAYER_STANDING` remaining winner도 다른 players penalty 합, forfeited players는 winner 후보에서 제외
- `STALEMATE` 또는 optional `TIME_LIMIT`은 penalty가 낮은 순으로 ranking하고 score는 자기 penalty의 음수
- 동률은 competition ranking `1, 1, 3`
- `ALL_PLAYERS_FORFEITED`에는 winner가 없고 모두 자기 penalty의 음수

위 형식은 Hangul result를 복사한 공통 `Result`가 아니다. Number 전용 reason·penalty semantics가 승인된 뒤 별도 DTO를 설계한다.

## 18. Stalemate

Full solver는 가능한 모든 rearrangement를 탐색해야 하므로 구현·성능 위험이 크다. 첫 구현의 제안은 `pool empty + active player 전원의 explicit Pass cycle`처럼 서버가 command history로 증명할 수 있는 조건이다.

검토할 race:

- pass와 explicit leave
- 마지막 pool tile draw와 timeout
- pass cycle 중 successful submit
- current player forfeit 후 eligible set 축소
- timeout과 overall game deadline이 같은 시각에 도착한 경우

## 19. Server authority

서버는 다음 순서로 Number mutation을 처리해야 한다.

1. wire payload를 `unknown`에서 strict validation한다.
2. session/current-primary actor, Room membership와 canonical `Room.gameType`을 확인한다.
3. Room lane을 획득하고 phase, expected revision, turn identity와 deadline을 검증한다.
4. live state에서 detached candidate를 만든다.
5. physical conservation, ownership, meld, initial/normal-turn rule과 finish를 Number RuleEngine으로 검증한다.
6. 성공 시 Room/game/idempotency를 한 번 commit하고, 실패 시 모두 그대로 둔다.
7. commit 뒤 viewer별 snapshot을 fan-out한다.

Client는 draw tile, shuffle, Joker legality, “move 없음”, score 또는 winner를 결정하지 않는다.

## 20. Privacy

최소 privacy contract는 다음과 같다.

| Viewer-visible | 금지 |
| --- | --- |
| 자기 rack의 `tileId`, number/color/Joker detail | 상대 rack의 tile detail·tileId |
| 상대 player의 `rackCount` | pool tile ID·order·다음 draw |
| public table meld와 placed tile·Joker assignment | server RNG state |
| `remainingTileCount`, active turn, public result summary | session token/hash, socket ID, connection generation |
| Room player identity·presence | storageRevision, idempotency, scheduler internals |

FINISHED 공개 범위는 `NT-035` 결정이다. 기본 제안은 상대 rack detail을 끝까지 숨기고 `remainingRackCount`, `remainingRackValue`, score 같은 result summary만 공개하는 것이다.

## 21. Examples

다음 예는 관련 decision을 승인했을 때만 normative해진다.

### Candidate valid `GROUP`

```text
RED 7, BLUE 7, BLACK 7
RED 11, BLUE 11, BLACK 11, ORANGE 11
```

### Candidate valid `RUN`

```text
RED 4, RED 5, RED 6
BLUE 9, BLUE 10, BLUE 11, BLUE 12, BLUE 13
```

### Candidate initial meld boundary

```text
RED 10, BLUE 10, BLACK 10 = 30  -> valid at threshold 30
RED 9, BLUE 9, BLACK 9    = 27  -> below threshold
```

### Candidate rearrangement

기존 `RED 3-4-5-6`에서 `RED 6`을 분리하고, rack의 `BLUE 6`, `BLACK 6`과 `GROUP 6`을 만든다. 최종 `RED 3-4-5`와 세 색의 `GROUP 6`이 모두 valid하고 rack tile 두 장을 사용하므로 `NT-014`~`NT-016` 제안상 valid다.

## 22. Invalid examples

관련 proposed rule 기준의 invalid 예다.

```text
RED 7, RED 7, BLUE 7                 # GROUP의 distinct color 위반
RED 4, BLUE 5, RED 6                 # RUN의 same color 위반
RED 4, RED 6, RED 7                  # 연속성 위반
RED 12, RED 13, RED 1                # wrap 금지
같은 tileId를 두 meld에서 동시에 참조       # physical conservation 위반
initial threshold에 기존 table tile을 사용  # NT-044 제안 위반
initial meld 전에 기존 table을 재배열       # NT-013 제안 위반
normal submit 후 어느 final meld가 2장       # final table validity 위반
```

Joker-only meld, 복수 Joker meld와 recovery 예는 `NT-011`·`NT-012`, `NT-017`~`NT-019` 결정 전에는 valid/invalid로 확정하지 않는다.

## 23. Open questions and edge-case checklist

결정표 외에도 구현 test가 다음 경계를 명시적으로 다뤄야 한다.

- pool empty, 한 장만 남은 pool, draw와 timeout race
- 모든 player가 play하지 못하는 상황과 full Pass cycle
- Joker-only rack, Joker로 마지막 rack tile을 낸 경우
- 한 meld의 multiple Jokers, group/run Joker assignment
- exact physical tile로 Joker recovery, recovered Joker 누락
- initial meld 정확히 threshold와 1 미만
- duplicate physical copy와 duplicate `tileId` reference
- GROUP의 같은 color copy, RUN의 1/13 boundary
- rearrangement 중 temporary invalid 상태와 final invalid rollback
- active player disconnect/leave, last active player, all forfeited
- timeout과 game deadline 동시성(둘 다 채택한 경우)
- stale revision, duplicate request, 같은 request ID의 다른 fingerprint
- opponent tile probe가 tile 존재 여부를 누설하지 않는지
- refresh 중 dirty draft, replaced session, non-primary socket

### 23.1 P7 test matrix

아래는 test implementation 계획이며 현재 runtime test가 아니다.

| 영역 | 최소 case | 유지할 invariant | Decision dependency |
| --- | --- | --- | --- |
| Inventory | 모든 tile 생성, duplicate display copy, Joker | `tileId` unique, total/conservation exact | `NT-001`, `NT-003`, `NT-020` |
| Player/start | min/max player, Host/non-Host, offline participant, deal/order | approved capacity·authority·presence만 start | `NT-002`, `NT-003`, `NT-037`, `NT-043` |
| GROUP | 3/4 colors, same-color duplicate, duplicate pattern, size 2/5 | approved number/color/cardinality만 valid | `NT-004`, `NT-005`, `NT-008`, `NT-019` |
| RUN | 1-2-3, 11-12-13, gaps, duplicate, wrap | approved boundary와 order만 valid | `NT-006`, `NT-007`, `NT-019` |
| Initial meld | threshold-1/exact/+1, multiple melds, old table reference | failure atomic, qualification only on success | `NT-009`~`NT-013`, `NT-044` |
| Joker | group/run assignment, recovery, missing reuse, last rack tile | physical Joker conservation·approved semantics | `NT-011`, `NT-012`, `NT-017`~`NT-019` |
| Rearrangement | split/merge, 4-group extraction, temporary invalid, final invalid | old table conserved, final full table valid | `NT-014`~`NT-016` |
| Draw/Pass | pool full/one/empty, draw privacy, pass cycle reset | server RNG, one canonical action/turn | `NT-020`~`NT-024`, `NT-029` |
| Timer/race | `< deadline`, `== deadline`, stale/duplicate callback, submit/draw/pass race | Room lane에서 single commit | `NT-025`~`NT-027` |
| Lifecycle | disconnect, resume, explicit leave, second offline timeout | Player identity 유지, approved forfeit order | `NT-033`, `NT-034` |
| Result | every reason, ties, Joker-only rack, all forfeited | deterministic winner/rank/score | `NT-028`~`NT-032` |
| Privacy | A/B rack, draw tile, FINISHED, unauthorized probe | 상대/pool detail·secret 비노출 | `NT-035` |
| Draft | presence-only update, gameplay revision, refresh/replacement | canonical state가 draft보다 우선 | `NT-036` |
| Concurrency | stale revision, exact replay, reused request ID/different table | revision/idempotency atomicity | `NT-040` |
| Compatibility | legacy V1, Hangul-only V2, Number-capable V2 create/join/resume | incompatible client mutation 전 reject | `NT-038`~`NT-042` |

## 24. Implementation gate

현재 `NT-001`~`NT-044`가 모두 `USER_DECISION_REQUIRED`이므로 이 문서의 상태는 `AWAITING_RULE_DECISIONS`다.

- P7A는 core rules(`NT-001`~`NT-034`, `NT-037`, `NT-043`, `NT-044`) 승인 전 시작하지 않는다.
- P7B는 projection privacy와 protocol/capability(`NT-035`, `NT-038`~`NT-042`) 승인 전 시작하지 않는다.
- P7C는 draft recovery(`NT-036`) 승인 전 시작하지 않는다.
- 승인 후 이 문서에서 각 ID를 `CONFIRMED`로 바꾸고 선택 근거·날짜를 남겨야 한다.
- 승인되지 않은 항목을 “일반적인 규칙” 또는 기존 Hangul behavior로 채우지 않는다.

상세 wire·projection·compatibility 차단점은 [NUMBER_TILE_PROTOCOL_GATE.md](./NUMBER_TILE_PROTOCOL_GATE.md)를 따른다.
