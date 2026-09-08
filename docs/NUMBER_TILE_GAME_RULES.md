# Number Tile Game Rules Gate

> 상태: `CONFIRMED` — NUMBER_TILE Joker correction + unordered RUN canonicalization applied
> 확정일: 2026-09-06
> 사용자 결정: `ALL:A` (`NT-001`~`NT-044`) + consistency blocker clarification A/A/A
> 내부 식별자: `NUMBER_TILE`
> 공개 작업명: 숫자 타일 게임
> Canonical ruleset: `number-tile-rules-v1`
> 효력: 현재 NUMBER_TILE runtime과 이후 구현이 따라야 하는 확정 규칙

## 1. Document status

이 문서는 두 번째 게임의 canonical 규칙을 구현 전에 확정한 P6 gate다. 사용자가 2026-09-06에 `ALL:A`와 세 consistency clarification의 A안을 선택하여 `NT-001`~`NT-044`를 모두 승인했다. 이후 실제 플레이에서 확인된 Joker 문제를 바로잡기 위해 `NT-012`, `NT-017`, `NT-018`의 canonical 의미를 final-meld-derived role과 final-state conservation으로 좁혀 수정했다. 이 correction은 기존 exact-replacement recovery 규칙을 대체하며 다른 rule ID나 game mechanic을 확장하지 않는다.

2026-09-08 actual-play follow-up은 `O7,J,O9,O6`의 unique RUN을 raw 입력 순서 때문에 거절하던 결함을 수정한다. `NT-006`의 primary input은 physical tile set이며 canonical output은 ascending sequence다. 기존 ordered-position 해석은 genuinely ambiguous한 두 numeric outcome 사이에서 명확한 의도를 나타낼 때만 사용한다. GROUP과 나머지 규칙은 변경하지 않는다.

현재 runtime은 `HANGUL_TILE`과 `NUMBER_TILE`을 지원한다. Joker correction은 NUMBER_TILE domain, Number V2 branch와 Number Web에만 적용하며 Hangul wire/rules와 GEM_CARD domain을 변경하지 않는다.

`docs/GAME_RULES.md`는 계속 `HANGUL_TILE`의 canonical 규칙 문서다. 이 문서의 숫자 타일 규칙이 그 문서를 수정하거나 대체하지 않는다.

## 2. Game identity

- 중립 내부 식별자는 향후 구현에 사용할 `NUMBER_TILE`로 확정한다. 현재 runtime `GameType`에는 아직 추가하지 않았다.
- 공개 작업명은 **숫자 타일 게임**이다.
- 특정 상용 게임 브랜드, 공식 logo 또는 공식 art asset을 식별자나 구현 전제로 사용하지 않는다.
- 법률·라이선스 검토는 이 Phase의 범위가 아니다.
- P6 완료 시점에도 `NUMBER_TILE`은 `SUPPORTED_GAME_TYPES`의 값이 아니다.

게임 방향은 숫자가 표시된 physical tile, 여러 색, rack, table, `GROUP`, `RUN`, Joker, initial meld, 이후 rearrangement를 사용하는 독립적인 숫자 타일 러미 계열 게임이다. 용어가 비슷해도 한글 게임의 규칙을 승계했다는 뜻은 아니다.

## 3. Confirmed safety and ownership rules

다음 안전·소유권 규칙과 이 문서의 `NT-001`~`NT-044`가 모두 확정됐다.

1. 서버가 Room, game state, pool 순서, draw 결과, 90초 turn deadline, legality와 result의 권위자다.
2. 모든 physical tile은 표시값과 별개의 opaque하고 고유한 `tileId`를 가진다. 같은 색·숫자의 두 copy도 서로 다른 tile이다.
3. client draft는 제안일 뿐이며 live canonical state를 직접 변경하지 않는다. 성공한 command만 Room lane 안에서 한 번 원자적으로 commit된다.
4. PLAYING과 FINISHED에서 상대 rack의 tile detail과 pool의 tile ID·순서를 공개하지 않는다. 최소 공개값은 상대 `rackCount`와 `remainingTileCount`이며 FINISHED에는 확정된 result summary를 제공한다.
5. `Meld`, `GROUP`, `RUN`, `Table`, Number 전용 `ProposedTable` 용어를 사용한다. Hangul `WordGroup`, syllable, composer, dictionary, Board, RuleEngine 또는 TurnDraft를 재사용하지 않는다.
6. P6는 문서-only gate다. P7 구현 전 runtime code, wire schema, registry, catalog와 production behavior는 `HANGUL_TILE` only로 유지한다.

## 4. Confirmed rule summary

| 영역 | `CONFIRMED` rule |
| --- | --- |
| Inventory | 숫자 1~13 × 4색 × 각 2장 + Joker 2장 = 106장 |
| 색상 rule ID | `RED`, `BLUE`, `BLACK`, `ORANGE` |
| Player | 2~4명 |
| 시작 rack | 14장 |
| `GROUP` | 같은 number, 서로 다른 color, 3~4장 |
| `RUN` | 같은 color, 연속 number, 3장 이상, 1~13 범위, wrap 금지 |
| Initial meld | 자기 rack만 사용, 같은 turn의 하나 이상 새 meld 합계 30 이상, 기존 table 사용·변경 금지 |
| Normal submit | 여러 meld와 split/merge 허용, 최종 table 전체 valid, 자기 rack tile 1장 이상 사용 |
| Draw | play를 commit하지 않을 때 single pool에서 서버가 무작위 1장 draw하고 turn 종료 |
| Finish | `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`; overall deadline과 `ALL_PLAYERS_FORFEITED` 없음 |
| Privacy | PLAYING과 FINISHED 모두 상대 rack detail 비공개 |
| Local draft | page refresh/session replacement 시 폐기; same game/turn/revision의 presence-only update에는 유지 |
| Turn order | 서버가 game start 때 한 번 shuffle한 뒤 immutable |

Joker, Pass/stalemate, timer/timeout, forfeit, scoring과 protocol도 아래 decision record대로 확정한다.

## 5. Confirmed decision record

사용자 결정 `ALL:A`와 consistency clarification A/A/A에 따라 모든 stable rule ID의 A안을 선택했다. ID는 구현과 test 추적을 위해 유지한다.

| ID | Confirmed rule | Status |
| --- | --- | --- |
| `NT-001` | 1~13 × `RED/BLUE/BLACK/ORANGE` × 2 + Joker 2 = 106장 | `CONFIRMED` |
| `NT-002` | Player 2~4명 | `CONFIRMED` |
| `NT-003` | Initial rack 14장 | `CONFIRMED` |
| `NT-004` | GROUP은 같은 number, distinct colors, 3~4장 | `CONFIRMED` |
| `NT-005` | 같은 color의 physical copy 두 장을 한 GROUP에 함께 사용 금지 | `CONFIRMED` |
| `NT-006` | RUN은 같은 color의 physical set으로 consecutive range를 구성, length ≥3; unique 해는 입력 순서 무관, canonical output ascending | `CONFIRMED` |
| `NT-007` | RUN은 1~13 범위이며 duplicate number와 wrap 금지 | `CONFIRMED` |
| `NT-008` | Physical tile이 다르면 동일 pattern의 별도 meld 허용 | `CONFIRMED` |
| `NT-009` | Initial meld 합계 30 이상 | `CONFIRMED` |
| `NT-010` | 한 turn의 하나 이상 새 meld 점수를 합산 | `CONFIRMED` |
| `NT-011` | Initial meld에 Joker 허용 | `CONFIRMED` |
| `NT-012` | Joker number는 현재 final meld에서 server가 derive하며 그 값을 initial threshold에 합산 | `CONFIRMED` |
| `NT-013` | Initial meld 완료 전 existing table 사용·rearrangement 금지 | `CONFIRMED` |
| `NT-014` | Normal submit에서 여러 meld 생성·변경 허용 | `CONFIRMED` |
| `NT-015` | Split/merge/extend/reorder 허용, final table 전체 valid 필수 | `CONFIRMED` |
| `NT-016` | Successful normal submit마다 자기 rack tile 최소 1장 사용 | `CONFIRMED` |
| `NT-017` | Pre-turn Joker의 이전 color/number/meld role은 future rearrangement를 제한하지 않으며 exact ordinary replacement를 요구하지 않음 | `CONFIRMED` |
| `NT-018` | Pre-turn Joker의 physical `tileId`는 같은 atomic Submit의 final Table에 정확히 한 번 남아야 하며 rack/pool 보관 금지 | `CONFIRMED` |
| `NT-019` | Meld당 Joker 최대 1개 | `CONFIRMED` |
| `NT-020` | 모든 ordinary/Joker tile을 하나의 shuffled pool에서 관리 | `CONFIRMED` |
| `NT-021` | Submit 대신 server-selected tile 1장 Draw | `CONFIRMED` |
| `NT-022` | Draw tile은 다음 turn부터 사용하며 Draw 즉시 turn 종료 | `CONFIRMED` |
| `NT-023` | Explicit Pass command 존재 | `CONFIRMED` |
| `NT-024` | Pass는 pool이 empty일 때만 허용 | `CONFIRMED` |
| `NT-025` | Server-authoritative turn timer 90초 | `CONFIRMED` |
| `NT-026` | Timeout 시 pool이 있으면 1장 Draw, empty면 no-tile turn 후 종료 | `CONFIRMED` |
| `NT-027` | Overall game deadline 없음 | `CONFIRMED` |
| `NT-028` | `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`; `ALL_PLAYERS_FORFEITED`/`TIME_LIMIT` 없음 | `CONFIRMED` |
| `NT-029` | Pool empty 뒤 eligible non-forfeited players의 full no-play cycle로 STALEMATE | `CONFIRMED` |
| `NT-030` | Ordinary penalty는 face value, Joker penalty는 30 | `CONFIRMED` |
| `NT-031` | Rack-empty/last-standing winner는 상대 penalty 합, losers는 자기 penalty의 음수 | `CONFIRMED` |
| `NT-032` | STALEMATE는 non-forfeited를 먼저 낮은 penalty 순 competition ranking하고 forfeited를 뒤에서 같은 방식으로 ranking; 모두 score = -penalty | `CONFIRMED` |
| `NT-033` | PLAYING explicit leave는 즉시 forfeit; rack 동결·score 반영 | `CONFIRMED` |
| `NT-034` | Offline 자기 turn timeout 2회 연속 후 두 번째 action을 먼저 적용하고 forfeit; resume 시 reset | `CONFIRMED` |
| `NT-035` | FINISHED에서도 상대 rack detail 비공개, count/value/result summary만 공개 | `CONFIRMED` |
| `NT-036` | Page refresh/session replacement 시 local draft 폐기; same game/turn/revision의 presence-only update에는 유지 | `CONFIRMED` |
| `NT-037` | 서버가 start 때 turn order를 한 번 shuffle하고 이후 immutable | `CONFIRMED` |
| `NT-038` | `game:start` 유지, additive `number:submit`/`number:draw`/`number:pass` 사용 | `CONFIRMED` |
| `NT-039` | Existing `protocolVersion = 1`에 strict Number events additive | `CONFIRMED` |
| `NT-040` | Number-owned `gameRevision`, immutable `turnId`, `requestId`/idempotency 사용 | `CONFIRMED` |
| `NT-041` | Number-specific advisory 없이 authoritative V2 snapshot 사용 | `CONFIRMED` |
| `NT-042` | Exact `supportedGameTypes`를 create/join/resume mutation 전에 확인; 부재는 legacy Hangul-only | `CONFIRMED` |
| `NT-043` | Host만 start하며 2~4명 registered players 모두 connected여야 함 | `CONFIRMED` |
| `NT-044` | Initial threshold와 새 meld는 자기 rack tile만 사용 | `CONFIRMED` |

`number-tile-rules-v1`은 첫 canonical ruleset이다. Persisted state/result 또는 wire에 rules version을 노출할지는 P7B의 concrete codec/projection 설계에서 별도로 판단하며, 이 규칙을 변경하는 근거로 사용하지 않는다.

## 6. Tile inventory

`NT-001`의 확정 inventory는 ordinary tile 104장과 Joker 2장이다.

```text
13 numbers × 4 colors × 2 physical copies = 104
Joker physical tiles                              =   2
Total                                             = 106
```

한글 게임의 consonant/vowel bag을 재사용하지 않는다. Number game은 single shuffled pool을 사용하며 공개 projection에는 `remainingTileCount`만 둔다. Rule color ID와 Web의 hex·pattern·label은 분리한다. 색상만으로 tile을 구분하지 않도록 Web Phase에서 문자·pattern 보조를 별도로 검토한다.

## 7. Player setup

`NT-002`, `NT-003`, `NT-037`, `NT-043`의 확정 규칙은 다음과 같다.

- 2~4명
- Host만 start 요청 가능
- start 시 참가자 전원이 connected
- 서버가 turn order를 shuffle
- 각 player에게 14장을 비공개로 deal
- 2/3/4명 start 직후 pool은 각각 78/64/50장

위 pool 수치는 확정된 `NT-001`과 `NT-003`에서 도출된다. 현재 Room의 최대 4명 고정 구현을 Number 규칙의 근거로 사용하지 않는다.

## 8. Meld definitions

### 8.1 `GROUP`

`GROUP`은 같은 number의 tile 3~4장이며 ordinary tile의 color는 서로 달라야 한다. 같은 `RED 7` 두 physical copy는 tile ID가 달라도 같은 GROUP에 함께 둘 수 없다. Physical tile identity가 서로 다르면 같은 표시 pattern의 별도 meld는 허용한다.

Joker가 있으면 ordinary tile은 모두 같은 number여야 하고 사용하지 않은 color가 하나 이상 있어야 한다. Joker의 number는 ordinary tile의 공통 number에서 derive되지만, 어떤 unused color를 대신하는지는 existential validity일 뿐 canonical assignment가 아니다. 따라서 `RED 10, BLUE 10, Joker`와 `RED 10, BLUE 10, BLACK 10, Joker`는 valid이고 color/number picker를 요구하지 않는다. `RED 10, RED 10, Joker`와 5장 meld는 invalid다.

### 8.2 `RUN`

`RUN`은 같은 color의 physical tile set으로 1씩 증가하는 연속 구간을 만들 수 있는 3~13장 meld다. 클릭/드롭 순서는 unique RUN의 legality가 아니다. 1은 low-only, 13은 high-only이며 wrap과 같은 ordinary number의 duplicate copy는 금지한다.

서버는 ordinary number를 모두 포함하는 길이 N의 `1..13` consecutive range를 열거한다. 각 후보에서 ordinary tile이 채우지 못한 위치 수는 Joker 수(0 또는 1)와 같아야 한다. 후보가 하나면 raw order와 무관하게 ascending으로 정규화하고, Joker는 missing number 위치에 놓는다. `O7,J,O9,O6`과 모든 permutation은 `O6,O7,J(8),O9`, Joker 없는 `O6,O4,O5`는 `O4,O5,O6`이 된다. `O4,J,O7`은 구간을 채울 수 없어 invalid다.

후보가 둘 이상일 때만 이미 valid ordered sequence인 submitted order를 명확한 numeric intent로 사용한다. `J,R5,R6`은 Joker 4, `R5,R6,J`는 Joker 7이다. `R6,J,R5`처럼 어떤 후보의 ordered sequence도 아닌 입력은 자동으로 첫 후보를 선택하지 않는다. Web은 필요한 Joker **숫자만** 선택하게 하며, 선택은 같은 physical tile들을 해당 canonical 순서로 재배치해 표현한다. 미해결 입력은 Submit에서 fail-closed한다. Color는 항상 ordinary common color에서 derive하며 color picker나 persistent assignment는 없다.

Unique solution이 우선이므로 raw 위치가 범위 밖 역할처럼 보여도 `J,R1,R2`는 유일한 `R1,R2,J(3)`, `R12,R13,J`는 `J(11),R12,R13`으로 valid하다. Wrap을 허용하는 것이 아니다.

### 8.3 Table model

Number domain의 확정 용어는 다음과 같다.

```text
Table {
  melds: Meld[]
}

Meld = GROUP | RUN
```

RUN 입력은 set-first이며, canonical stored/projected RUN은 ascending이다. Order는 genuinely ambiguous Joker numeric intent를 표현할 때만 입력 의미가 있다. Command fingerprint는 기존 raw full payload를 계속 구분하므로 같은 requestId에 다른 배열을 보내는 것은 replay가 아니다. GROUP의 colorless semantics와 기존 ordering 정책은 유지한다.

## 9. Initial meld

`NT-009`~`NT-013`, `NT-044` 확정 규칙:

1. 아직 initial meld를 완료하지 않은 player는 그 turn 시작 때 자기 rack에 있던 tile만 사용한다.
2. 하나 이상의 valid meld를 동시에 제출할 수 있다.
3. 그 turn에 새로 내려놓은 tile의 number 합이 30 이상이어야 한다.
4. Joker를 사용하면 current final meld에서 server가 derive한 number가 합계에 들어간다.
5. 기존 table tile을 가져오거나 table을 재배열할 수 없다.
6. 성공 commit과 함께 player의 `initialMeldCompleted`를 true로 저장한다.

정확히 30은 성공, 29는 실패하는 boundary test가 필요하다. Hangul의 “physical tile 6장” 규칙을 가져오지 않는다.

## 10. Normal turn

Initial meld 완료 후 turn 선택지는 mutually exclusive하다.

- `SUBMIT`: local draft의 최종 proposed table을 원자적으로 검증·commit
- `DRAW`: submit 없이 server pool에서 draw하고 종료
- `PASS`: pool이 empty일 때만 실행

한 turn에 성공한 canonical action은 최대 하나다. Rejected Submit은 state/revision을 바꾸지 않으므로 deadline 전에는 같은 turn에서 수정해 다시 시도할 수 있다. Drawn tile은 다음 turn부터 사용할 수 있으며 같은 turn Submit은 금지한다.

## 11. Rearrangement

`NT-014`~`NT-016`은 intermediate draft가 invalid여도 괜찮고 commit 시점의 final table만 valid하면 된다는 규칙이다. 허용 동작은 다음과 같다.

- 기존 RUN에서 tile 분리
- 두 RUN을 split/merge하여 새 RUN 구성
- 4장 GROUP에서 한 장을 빼 다른 valid meld에 사용
- 기존 meld의 tile과 rack tile을 함께 재배치
- 여러 meld를 한 submit에서 생성·삭제·재구성

최종 검증은 다음을 모두 요구한다.

1. Pre-turn Table의 모든 physical tile은 final Table에도 정확히 한 번 존재하며 rack이나 pool로 이동할 수 없다.
2. 자기 rack에서 가져온 tile도 정확히 한 번만 사용한다.
3. 다른 player rack이나 pool tile은 참조할 수 없다.
4. 모든 final meld가 valid하다.
5. 자기 rack tile을 최소 1장 사용한다.

## 12. Joker

Joker도 고유 `tileId`를 가진 physical tile이지만 canonical face는 없다. ProposedTable과 persisted/public Table의 Joker placement는 bare physical identity이며, role은 현재 containing meld에서 derive한다.

- Initial meld에 Joker를 사용할 수 있고 current meld에서 derive된 number를 threshold 합계에 사용한다.
- 한 meld에는 Joker를 최대 1개만 사용할 수 있다.
- GROUP Joker는 ordinary tile의 공통 number와 unused-color existence로 검증한다. 특정 `assignedColor`를 선택하거나 저장하지 않는다.
- RUN Joker는 ordinary 공통 color와 가능한 consecutive range에서 derive한다. Unique 해는 입력 순서 무관; multiple 해는 valid ordered intent 또는 명시적 숫자 선택으로만 해소한다. Color picker나 hidden server choice는 없다.
- Pre-turn Joker의 previous number/color/meld role은 final rearrangement를 제한하지 않는다. GROUP→RUN, RUN→GROUP, 또는 같은 kind 안의 다른 role로 자유롭게 바뀔 수 있다.
- Exact ordinary replacement recovery는 요구하지 않는다. Server는 intermediate manipulation이 아니라 submitted final Table을 검증한다.
- Pre-turn Table의 모든 Joker `tileId`는 final Table에 정확히 한 번 존재해야 하며, valid final GROUP/RUN 안에 있어야 한다. Joker를 rack이나 pool에 두고 turn을 끝낼 수 없다.
- Stable meld identity와 “다른 meld” 판정은 사용하지 않는다.

예: pre-turn `RUN(RED 4, Joker J1, RED 6)`의 `J1`은 final `RUN(BLUE 8, J1, BLUE 10)`에서 BLUE 9 역할로 사용될 수 있다. `J1`의 physical identity, Table exact-once conservation, 모든 final meld의 validity와 actor-rack contribution이 유지되면 이전 RED 5 역할을 exact ordinary tile로 먼저 대체할 필요가 없다.

## 13. Draw / Pass

Number game에는 자음/모음 선택이 없다. Draw payload는 bag kind나 tile choice를 받지 않으며 server RNG가 single pool에서 한 장을 결정한다. Draw 즉시 turn이 끝나고 drawn tile은 다음 turn부터 사용할 수 있다. Pool이 empty일 때만 explicit Pass가 가능하다.

### 13.1 Full no-play cycle

Full no-play cycle은 다음과 같이 정의한다.

이 문서에서 `eligible`은 현재 game participant 중 `forfeited = false`인 player를 뜻한다. Connection/presence 상태는 eligibility를 바꾸지 않으므로 offline이지만 아직 forfeited되지 않은 player도 turn과 no-play cycle에 포함된다.

1. Pool을 비운 마지막 Draw commit 직후 tracker를 비운 상태로 시작한다. 그 Draw 자체는 no-play로 세지 않는다.
2. 현재 eligible/non-forfeited player가 자기 turn에 valid Submit을 commit하지 않고 explicit Pass 또는 pool-empty timeout의 no-tile turn을 atomic commit하면 그 player의 no-play 기록을 한 번 추가한다.
3. 현재 eligible/non-forfeited player 전원이 마지막 reset 이후 한 번씩 연속 no-play를 기록하면 `STALEMATE`로 종료한다.
4. 누군가 valid Submit을 commit하면 모든 no-play 기록을 지운다. Pool은 이미 empty이므로 다음 eligible player부터 새 cycle을 시작한다.
5. Rejected Submit, duplicate replay, draft 편집·폐기, disconnect/reconnect와 presence-only 변화는 tracker를 진행하거나 reset하지 않는다.
6. Leave/forfeit player는 즉시 eligible set과 tracker에서 제거한다. 기존 remaining eligible player의 no-play 기록은 유지한다.
7. Eligible player set 변경 뒤 한 명만 남으면 `LAST_PLAYER_STANDING`을 먼저 적용한다. 게임이 계속되고 remaining eligible 전원이 이미 기록됐다면 같은 atomic transition에서 `STALEMATE`를 적용한다.
8. Rack-empty 같은 더 높은 우선순위 terminal condition이 발생하면 no-play tracker를 평가하지 않는다.

예를 들어 turn order가 A→B→C이고 pool이 empty라면 `A Pass`, `B pool-empty timeout`, `C Pass` 직후 STALEMATE다. 중간에 successful Submit이 있으면 이전 기록은 모두 폐기된다.

## 14. Turn timer / timeout

Turn timer는 server-authoritative 90초다. Timeout 시 pool에 tile이 있으면 server RNG로 한 장을 Draw하고 turn을 끝낸다. Pool이 empty면 no-tile turn을 commit하고 full no-play cycle에 기록한다.

Deadline 판정은 server `Clock`의 received-at 기준이며 `receivedAt < deadlineAt`만 유효하다. Timeout callback은 at-least-once 실행을 견디고 stale identity, duplicate callback, Submit/Draw/Pass race에서 한 번만 commit해야 한다. Local dirty draft는 timeout 때 폐기된다.

## 15. Reconnect / forfeit

Disconnect 자체로 즉시 forfeit하지 않고 turn timer를 계속 진행한다. Offline player가 자기 turn에서 두 번 연속 timeout하면 두 번째 timeout action을 먼저 적용한 뒤 forfeit하며, 성공한 resume은 offline timeout streak를 reset한다. PLAYING 중 explicit leave는 즉시 forfeit한다.

Local draft는 canonical server state가 아니다. Page refresh와 session replacement에서는 폐기한다. 같은 game/turn/revision의 presence-only update에서는 유지하며, canonical game revision이나 turn identity가 바뀌면 더 이상 적용할 수 없다.

## 16. End conditions

Number Tile v1의 확정 finish reason:

- `RACK_EMPTY`: successful submit으로 player rack이 0장
- `STALEMATE`: pool empty 후 eligible/non-forfeited players의 full no-play cycle
- `LAST_PLAYER_STANDING`: non-forfeited eligible player가 정확히 1명만 남는 순간 즉시 종료

`ALL_PLAYERS_FORFEITED`와 `TIME_LIMIT`은 Number Tile v1 finish reason이 아니다. `LAST_PLAYER_STANDING`으로 종료된 뒤 마지막 player를 추가 forfeit시키는 post-terminal 흐름도 없다. Pool이 empty라는 사실만으로 즉시 finish하지 않는다. 아직 table에 놓을 수 있는 rack tile이 있을 수 있기 때문이다. 전체 legal move를 server solver로 증명하지 않는다.

## 17. Scoring / ranking

`NT-030`~`NT-032` 확정 규칙:

- ordinary rack tile penalty = 표시 number
- Joker rack penalty = 30
- player penalty = 남은 rack penalty 합
- `RACK_EMPTY` winner score = 다른 players의 penalty 합, losers = 자기 penalty의 음수
- `LAST_PLAYER_STANDING` remaining winner도 모든 forfeited players의 frozen rack penalty 합을 양수 score로 받는다. Forfeited players는 winner 후보에서 제외하고 자기 penalty의 음수 score를 받는다.
- `RACK_EMPTY`와 `LAST_PLAYER_STANDING` result는 exact `winnerPlayerIds`와 player별 penalty/score/forfeited를 갖는다. 이 두 single-winner reason에는 별도 loser rank를 정의하거나 요구하지 않는다.
- `STALEMATE`에서는 non-forfeited players를 먼저 낮은 penalty 순으로 competition ranking한다.
- `STALEMATE`의 `winnerPlayerIds`는 final rank 1인 모든 non-forfeited players다. 동점이면 공동 winner이며 forfeited player는 winner가 될 수 없다.
- 이어서 forfeited players를 모든 non-forfeited players 뒤에 두고, forfeited group 안에서 낮은 penalty 순 competition ranking을 적용한다. Forfeited group의 local competition rank에 non-forfeited player 수를 더해 final rank를 만든다.
- STALEMATE score는 모든 player에 대해 자기 penalty의 음수다. Forfeited player도 result entry에 포함되며 더 낮은 penalty여도 non-forfeited player보다 높은 rank를 받을 수 없다.
- 동률은 competition ranking `1, 1, 3`

예: non-forfeited A/B penalty가 8/15이고 forfeited C/D penalty가 3/20이면 A rank 1 score -8, B rank 2 score -15, C rank 3 score -3, D rank 4 score -20이다.

위 형식은 Hangul result를 복사한 공통 `Result`가 아니다. Number 전용 reason·penalty semantics로 별도 DTO를 설계한다.

## 18. Stalemate

Full solver는 가능한 모든 rearrangement를 탐색해야 하므로 사용하지 않는다. STALEMATE는 section 13.1의 server-observable full no-play cycle로 증명한다.

검토할 race:

- pass와 explicit leave
- 마지막 pool tile draw와 timeout
- pass cycle 중 successful submit
- current player forfeit 후 eligible set 축소
- second offline timeout/forfeit와 마지막 required no-play 기록이 같은 transition인 경우

### 18.1 Terminal precedence

한 atomic transition에서 여러 조건이 겹칠 때 다음 순서를 적용한다.

1. Valid Submit으로 rack이 비었으면 `RACK_EMPTY`.
2. Timeout이면 draw/no-tile action과 offline streak 증가를 먼저 적용한다. 이어서 explicit leave 또는 second offline timeout에 해당하는 actor forfeit를 적용한다.
3. Eligible set을 재계산해 정확히 한 명이면 `LAST_PLAYER_STANDING`.
4. 게임이 계속되고 pool이 empty이며 remaining eligible 전원의 no-play 기록이 완성됐으면 `STALEMATE`.
5. Terminal condition이 없으면 next turn으로 진행한다.

`ALL_PLAYERS_FORFEITED`와 overall game deadline이 없으므로 그에 대한 precedence는 정의하지 않는다.

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
| public table meld와 placed physical tile; Joker role은 containing meld에서 derive | server RNG state |
| `remainingTileCount`, active turn, public result summary | session token/hash, socket ID, connection generation |
| Room player identity·presence | storageRevision, idempotency, scheduler, offline-timeout streak, no-play tracker internals |

FINISHED에서도 상대 rack detail을 끝까지 숨기고 `remainingRackCount`, `remainingRackValue`, score 같은 result summary만 공개한다.

## 21. Examples

다음 예는 `number-tile-rules-v1`의 normative example이다. 색 이름은 rule ID를 뜻하며 각 표시는 서로 다른 physical `tileId`를 가진다.

### Valid `GROUP`

```text
RED 7, BLUE 7, BLACK 7
RED 11, BLUE 11, BLACK 11, ORANGE 11
```

### Valid `RUN`

```text
RED 4, RED 5, RED 6
BLUE 9, BLUE 10, BLUE 11, BLUE 12, BLUE 13
ORANGE 7, Joker, ORANGE 9, ORANGE 6 -> ORANGE 6, ORANGE 7, Joker(8), ORANGE 9
ORANGE 4, ORANGE 6, ORANGE 5 -> ORANGE 4, ORANGE 5, ORANGE 6
```

### Initial meld threshold

```text
RED 10, RED 11, RED 12 = 33
-> valid

RED 4, RED 5, RED 6                    = 15
BLUE 5, BLACK 5, ORANGE 5              = 15
same-turn multiple-new-meld total       = 30
-> valid

RED 2, RED 3, RED 4                     = 9
RED 5, BLUE 5, BLACK 5, ORANGE 5       = 20
same-turn multiple-new-meld total       = 29
-> invalid; entire initial Submit is rejected atomically

RED 10, RED 11, Joker = 33
-> valid; ordered RUN의 final position에서 Joker number 12를 server가 derive

ORANGE 7, Joker, ORANGE 9, ORANGE 6 = 6 + 7 + 8 + 9 = 30
-> valid; raw click/drop order와 무관한 unique solution의 initial value
```

Initial failure leaves Table, rack, `initialMeldCompleted`, `gameRevision` and current turn unchanged.

### Valid rearrangement: RUN split/rebuild

```text
pre-turn Table: RED 3-4-5-6 / RED 8-9-10
actor rack:     RED 7
final Table:    RED 3-4-5 / RED 6-7-8-9-10
```

The final Table uses one actor rack tile, preserves every pre-turn physical tile exactly once and contains only valid RUNs.

### Valid rearrangement: GROUP tile move

```text
pre-turn Table: GROUP(RED 7, BLUE 7, BLACK 7, ORANGE 7)
actor rack:     ORANGE 8, ORANGE 9
final Table:    GROUP(RED 7, BLUE 7, BLACK 7)
                RUN(ORANGE 7, ORANGE 8, ORANGE 9)
```

### Valid rearrangement: two melds merge

```text
pre-turn Table: RUN(RED 1, RED 2, RED 3)
                RUN(RED 5, RED 6, RED 7)
actor rack:     RED 4
final Table:    RUN(RED 1, RED 2, RED 3, RED 4, RED 5, RED 6, RED 7)
```

### Valid Joker rearrangement without exact replacement

```text
pre-turn Table: RUN(RED 4, Joker J1, RED 6)
actor rack:     BLUE 4, BLACK 4, BLUE 6, BLACK 6, BLUE 8, BLUE 10
final Table:    GROUP(RED 4, BLUE 4, BLACK 4)
                GROUP(RED 6, BLUE 6, BLACK 6)
                RUN(BLUE 8, Joker J1, BLUE 10)
```

The server derives `J1` as BLUE 9 from the final RUN's unique consecutive range. It verifies every pre-turn physical ID including `J1` exactly once, the actor-rack contribution and all final melds. No exact RED 5 replacement or stable meld identity is required.

### Score

```text
RACK_EMPTY:
A rack penalty 0, B 18, C 27
-> winnerPlayerIds [A]
-> A score +45, B score -18, C score -27

STALEMATE:
A penalty 8, B penalty 8, C penalty 20 (all non-forfeited)
-> A rank 1 score -8, B rank 1 score -8, C rank 3 score -20
```

## 22. Invalid examples

다음은 confirmed rule 기준의 invalid 예다.

```text
RED 7, RED 7, BLUE 7                 # GROUP의 distinct color 위반
RED 4, BLUE 5, RED 6                 # RUN의 same color 위반
RED 4, RED 6, RED 7                  # 연속성 위반
RED 12, RED 13, RED 1                # wrap 금지
같은 tileId를 두 meld에서 동시에 참조       # physical conservation 위반
initial threshold에 기존 table tile을 사용  # NT-044 위반
initial meld 전에 기존 table을 재배열       # NT-013 위반
normal submit 후 어느 final meld가 2장       # final table validity 위반
pre-turn Table의 physical tile을 final Table에서 누락 # conservation 위반
같은 tileId를 final Table에서 두 번 참조      # conservation 위반
valid final Table이지만 actor rack tile을 사용하지 않음 # NT-016 위반
pre-turn Joker tileId를 final Table에서 누락     # NT-018 conservation 위반
pre-turn Joker tileId를 final Table에 두 번 사용  # duplicate/conservation 위반
pre-turn Joker를 actor rack으로 이동              # NT-018 location 위반
Joker가 포함된 final meld가 어떤 role로도 valid하지 않음 # final meld validity 위반
```

## 23. Edge-case checklist

결정표 외에도 구현 test가 다음 경계를 명시적으로 다뤄야 한다.

- pool empty, 한 장만 남은 pool, draw와 timeout race
- 모든 player가 play하지 못하는 상황과 full no-play cycle
- Joker-only rack, Joker로 마지막 rack tile을 낸 경우
- 한 meld의 multiple Jokers, GROUP colorless validity, unordered unique RUN / explicit ambiguous RUN derivation
- previous Joker role 변경, Joker final-Table 누락/중복/rack 이동
- initial meld 정확히 threshold와 1 미만
- duplicate physical copy와 duplicate `tileId` reference
- GROUP의 같은 color copy, RUN의 1/13 boundary
- rearrangement 중 temporary invalid 상태와 final invalid rollback
- active player disconnect/leave와 immediate last-player-standing
- second offline timeout, forfeit, last-standing과 stalemate tracker의 같은-transition precedence
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
| RUN | 1-2-3, 11-12-13, unordered ordinary/Joker, gaps, duplicate, wrap, true ambiguity | set-first unique solution / explicit ambiguous intent / ascending canonical output | `NT-006`, `NT-007`, `NT-019` |
| Initial meld | threshold-1/exact/+1, multiple melds, old table reference | failure atomic, qualification only on success | `NT-009`~`NT-013`, `NT-044` |
| Joker | GROUP colorless wildcard, set-derived RUN role, genuine numeric ambiguity, previous-role change, missing/duplicate/rack move, last rack tile | physical Joker identity와 final-state conservation | `NT-011`, `NT-012`, `NT-017`~`NT-019` |
| Rearrangement | split/merge, 4-group extraction, temporary invalid, final invalid | old table conserved, final full table valid | `NT-014`~`NT-016` |
| Draw/Pass | pool full/one/empty, draw privacy, no-play cycle reset | server RNG, one canonical action/turn | `NT-020`~`NT-024`, `NT-029` |
| Timer/race | `< deadline`, `== deadline`, stale/duplicate callback, submit/draw/pass race | Room lane에서 single commit | `NT-025`~`NT-027` |
| Lifecycle | disconnect, resume, explicit leave, second offline timeout | Player identity 유지, approved forfeit order | `NT-033`, `NT-034` |
| Result | three finish reasons, ties, Joker-only rack, prior-forfeit STALEMATE | reason별 confirmed winner/score와 STALEMATE rank/tie | `NT-028`~`NT-032` |
| Privacy | A/B rack, draw tile, FINISHED, unauthorized probe | 상대/pool detail·secret 비노출 | `NT-035` |
| Draft | presence-only update, gameplay revision, refresh/replacement | canonical state가 draft보다 우선 | `NT-036` |
| Concurrency | stale revision, exact replay, reused request ID/different table | revision/idempotency atomicity | `NT-040` |
| Compatibility | legacy V1, Hangul-only V2, Number-capable V2 create/join/resume | incompatible client mutation 전 reject | `NT-038`~`NT-042` |

## 24. Implementation gate

`NT-001`~`NT-044`와 consistency clarification A/A/A가 모두 `CONFIRMED`이며 문서 수준 audit에서 blocker가 없다. P6는 `COMPLETE`, P7A는 `READY`다.

- P7A는 `number-tile-rules-v1`만 구현하며 새 규칙을 관습이나 Hangul behavior로 보충하지 않는다.
- P7B는 P7A domain completion 전 시작하지 않는다.
- P7C는 P7B shared/server contract completion 전 시작하지 않는다.
- P7A~P7C가 모두 통과할 때까지 `NUMBER_TILE`을 runtime registry/catalog/public create에 enable하지 않는다.

상세 wire·projection·compatibility 차단점은 [NUMBER_TILE_PROTOCOL_GATE.md](./NUMBER_TILE_PROTOCOL_GATE.md)를 따른다.
