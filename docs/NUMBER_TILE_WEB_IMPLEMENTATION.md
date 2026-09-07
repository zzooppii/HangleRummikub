# Number Tile Web Implementation

> 상태: P7C IMPLEMENTED / P8 COMPLETE / PUBLIC TWO-GAME VERIFIED / NUMBER_TILE UX POLISH
> Canonical ruleset: `number-tile-rules-v1`
> Wire: protocol v1 additive Number commands + `PlatformSnapshotV2` only

## 1. 범위와 권위

P7C는 P7B의 strict shared/server contract만 소비하는 `NUMBER_TILE` Web vertical slice를 추가한다. Current Web은 handshake에서 `supportedSnapshotVersions: [2, 1]`과 `supportedGameTypes: [HANGUL_TILE, NUMBER_TILE]`을 정확히 광고한다. Home catalog에는 같은 계층의 한글 타일·숫자 타일 두 항목만 있으며 `GEM_CARD`나 disabled placeholder는 없다.

Home의 선택은 `room:create`의 optional `gameType`만 정한다. Join payload와 `/room/{ROOM_CODE}`에는 game type이 없고, Room 진입 뒤 renderer authority는 strict V2 snapshot의 canonical `room.gameType`뿐이다. Number snapshot은 legacy Hangul V1으로 변환하거나 Lobby로 fallback하지 않는다.

## 2. Web ownership

```text
RealtimeClient
  -> strict V1 ack / PlatformSnapshotV2 decode
  -> common RoomSnapshotShell (Room/session/revision only)
  -> canonical room.gameType routing
     -> existing Legacy Hangul V1/V2 adapter + renderer
     -> NumberTilePlayingScreen / NumberTileFinishedScreen
        -> Number-local TurnDraft/controller/editor
```

`apps/web/src/features/number-tile/`은 Number Table/Meld/rack/Joker draft와 화면을 소유한다. Hangul `TurnDraft`, Board, WordGroup 또는 editor를 import하지 않으며 `GameBoard`, `GameController`, giant game UI interface 같은 추측성 공통화를 만들지 않는다. Common Lobby, Room URL, session/reconnect, request ID, connection status와 mutation ordering은 platform Web 경로를 그대로 사용한다.

## 3. Number TurnDraft와 editor

Draft는 browser memory에만 존재하며 base `gameId`, `gameRevision`, `turnId`, complete proposed Table, available rack, immutable baseline, dirty state와 최대 50단계 history를 가진다. Physical identity는 항상 `tileId`로 유지되어 같은 number/color의 두 physical copy도 합쳐지지 않는다. 중간에는 empty/short/invalid meld가 허용되며 canonical state는 Submit 성공 snapshot 전까지 바뀌지 않는다.

- `+ 새 조합 만들기`로 분류되지 않은 empty local meld를 추가하고 empty meld만 삭제한다. Physical face가 같은-number/서로 다른 color이면 GROUP, 같은-color/consecutive number이면 RUN으로 자동 분류하며 사용자가 kind를 선택하지 않는다.
- Tap/click과 native button으로 rack→Table 및 Table→Table insertion/move를 수행한다. Drag-only interaction은 없다.
- 첫 등록 전 canonical Table은 읽기 전용이고 local meld에는 own rack tile만 놓는다. 합계 30 안내와 candidate 합계는 UX hint일 뿐 server 판정을 대체하지 않는다.
- 첫 등록 뒤 split/merge/extend/rebuild가 가능한 whole-table editor를 제공하고 own rack tile 1개 사용 requirement를 안내한다.
- 이번 turn의 rack-origin tile은 rack으로 되돌릴 수 있지만 pre-turn canonical Table tile은 rack으로 반환할 수 없다.
- Joker는 같은 `tileId`를 유지한다. 유일한 valid assignment는 자동 추론하고 여러 후보일 때만 picker를 제공하며, Stable meld ID나 recovery algorithm을 client에 만들지 않고 exact replacement/same-Submit reuse/final validity는 server가 판정한다.
- Undo는 move, meld create/delete, Joker assignment, rack return을 복원하고 Reset은 authoritative baseline으로 돌아간다.

## 4. Command와 recovery

`number:submit`은 draft의 complete `proposedTable`, base revision/turn과 새 request ID를 보낸다. Ordinary face는 주장하지 않고 Joker assignment만 wire에 포함한다. Gameplay rejection은 readable shared error를 표시하며 draft를 보존한다. stale revision, wrong turn, expired turn, invalid authority/identity는 draft를 버리고 `state:sync`를 요청한다.

Pool이 남아 있으면 `number:draw`, 0이면 `number:pass`만 표시한다. Draw는 tile을 고르지 않고 empty payload를 보낸다. Dirty draft에서 Draw/Pass를 실행하기 전 discard confirmation과 focus 이동·복원을 제공한다. Submit/Draw/Pass는 하나의 page-memory single-flight gate를 사용하며 acknowledgement loss reconnect retry는 같은 command/request ID를 유지한다. Number-specific advisory와 `number:start`는 없고 shared `game:start` 및 authoritative snapshot-bearing ack를 사용한다.

Transient reconnect나 presence-only update에서 `gameId`, `gameRevision`, `turnId`가 같으면 dirty draft를 유지한다. Canonical gameplay/turn/game identity 변화, timeout, FINISHED, session replacement는 reset한다. Page refresh는 local draft를 저장하지 않으므로 discard한다.

## 5. Presentation, privacy와 accessibility

PLAYING은 prominent self/opponent turn banner, server canonical deadline 기반 display-only `mm:ss` countdown, compact pool/Table/rack statistics, public Table, player rack counts/status와 viewer own rack detail만 표시한다. 상대 차례에도 own rack은 읽기 전용으로 보이지만 상대 physical tile detail은 없다. Number-only high-contrast RED/BLUE/BLACK/ORANGE styling은 marker와 accessible label을 함께 사용하고 native controls, focus-visible, 최소 44~48px action target을 제공한다.

Submit/Draw/Pass 제어는 canonical active Player에게만 활성화되고 상대 차례에는 명시적으로 비활성화된다. Own rack은 responsive grid로 줄바꿈하며 수평 scrollbar를 사용하지 않고 Tile 수에 따라 세로로 확장한다. New self turn과 accepted command는 canonical turn/request identity로 중복 제거된 best-effort Web Audio feedback을 제공하며 sound preference나 autoplay failure는 gameplay와 분리된다.

FINISHED는 server result order와 제공된 rank만 사용한다. `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`만 표시하며 `TIME_LIMIT`과 `ALL_PLAYERS_FORFEITED`를 추측하지 않는다. Opponent rack detail, pool order/Tile IDs와 session/persistence/scheduler 내부 값은 PLAYING과 FINISHED 모두 노출하지 않는다.

## 6. 현재 제한과 P8 gate

- P7C는 Web/문서만 변경하며 server/shared/domain rules와 dependency를 바꾸지 않는다.
- In-memory single-process, one-replica, restart/deploy 시 Room/session 소실과 Hangul `test-dictionary-v1` 제약은 그대로다.
- Browser editor는 server RuleEngine을 복제하지 않으므로 local invalid interim state와 server rejection 수정 flow가 의도된 동작이다.
- P7C local production build에서 실제 A/B browser로 Number create/join/start, 14장·pool 78, meld/Joker editor, Draw 뒤 15장·pool 77, privacy와 refresh/resume를 확인했다. Hangul production-serving raw-client 회귀는 기존 harness를 유지한다.
- P7C checkpoint는 Railway를 배포하지 않는다. Public two-game smoke는 사용자 수동 배포 뒤 별도 확인해야 한다.
- 다음 stop gate P8은 Hangul/Number catalog-create부터 invitation, start, commands, reconnect, privacy, wrong-game isolation과 deployment를 두 game E2E로 검증한다.

## 7. P8 당시 browser와 Web boundary 결과

Actual local production build의 independent A/B browser에서 Number card 선택, explicit Room create, gameType 없는 direct invitation join, shared start, 14장씩·pool 78·90초 Turn, GROUP/RUN editor, Draw 뒤 actor rack 15·pool 77·next Turn, refresh/resume와 viewer privacy를 확인했다. Empty GROUP Submit은 한국어 gameplay error를 표시하면서 dirty draft를 보존했다. Dirty Draw confirmation을 취소하면 draft와 Draw focus가 유지되고, 확인 뒤 authoritative commit으로 draft가 정리됐다.

P8 당시 390×844와 320×568에서 Home, Number PLAYING controls와 FINISHED result는 document-level horizontal overflow가 없었다. 당시 긴 rack은 내부 `overflow-x: auto` 영역을 사용했으며, 이 historical observation은 이후 UX polish에서 responsive vertical wrap으로 대체됐다. Native button/accessible tile label, color 외 marker, countdown live status와 confirmation focus는 automated test와 browser에서 확인했다. 실제 physical keyboard 전체 journey, Safari/Firefox/device/screen reader는 직접 검증하지 않았다.

Web test는 same identity의 transient update에서 draft/pending command를 유지하고 newer revision 또는 changed Turn에서 supersede하는 경계를 강화했다. 또한 Hangul/Number Web feature와 shared contract namespace가 서로 import하지 않음을 고정했다. Browser console의 Hangul/Number A/B warn/error log는 비어 있었다.

Random browser rack의 valid 30/Joker recovery와 pool-empty Pass는 production cheat 없이 deterministic raw protocol/application test로 검증했다. 사용자가 Railway의 `deafc39` deployment와 1 Replica를 확인한 뒤 public Number UI, A/B create·join·start·Draw·resume, privacy, responsive와 clean browser console을 검증했다. 상세는 [MULTI_GAME_P8_TWO_GAME_E2E_GATE.md](./MULTI_GAME_P8_TWO_GAME_E2E_GATE.md)를 따른다.

## 8. UX polish boundary

Rack wrap/sort, stronger color identity, compact turn hierarchy, sound feedback, automatic meld classification, and Joker inference are documented in [NUMBER_TILE_UX_POLISH.md](./NUMBER_TILE_UX_POLISH.md). These are Web-only presentation/draft helpers: the existing command/event/snapshot contracts are unchanged and the Number server RuleEngine remains the final authority.
