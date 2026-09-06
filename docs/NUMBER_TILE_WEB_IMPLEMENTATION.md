# Number Tile Web Implementation

> 상태: P7C IMPLEMENTED / P8 TWO-GAME E2E READY
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

Draft는 browser memory에만 존재하며 base `gameId`, `gameRevision`, `turnId`, complete proposed Table, available rack, immutable baseline, dirty state와 최대 50단계 history를 가진다. Physical identity는 항상 `tileId`로 유지되어 같은 number/color의 두 physical copy도 합쳐지지 않는다. 중간에는 empty/short/invalid GROUP 또는 RUN이 허용되며 canonical state는 Submit 성공 snapshot 전까지 바뀌지 않는다.

- GROUP/RUN을 empty local meld로 추가하고 empty meld만 삭제한다.
- Tap/click과 native button으로 rack→Table 및 Table→Table insertion/move를 수행한다. Drag-only interaction은 없다.
- 첫 등록 전 canonical Table은 읽기 전용이고 local meld에는 own rack tile만 놓는다. 합계 30 안내와 candidate 합계는 UX hint일 뿐 server 판정을 대체하지 않는다.
- 첫 등록 뒤 split/merge/extend/rebuild가 가능한 whole-table editor를 제공하고 own rack tile 1개 사용 requirement를 안내한다.
- 이번 turn의 rack-origin tile은 rack으로 되돌릴 수 있지만 pre-turn canonical Table tile은 rack으로 반환할 수 없다.
- Joker는 같은 `tileId`를 유지한 채 1~13과 네 색 assignment를 선택·재지정한다. Stable meld ID나 recovery algorithm을 client에 만들지 않고 exact replacement/same-Submit reuse/final validity는 server가 판정한다.
- Undo는 move, meld create/delete, Joker assignment, rack return을 복원하고 Reset은 authoritative baseline으로 돌아간다.

## 4. Command와 recovery

`number:submit`은 draft의 complete `proposedTable`, base revision/turn과 새 request ID를 보낸다. Ordinary face는 주장하지 않고 Joker assignment만 wire에 포함한다. Gameplay rejection은 readable shared error를 표시하며 draft를 보존한다. stale revision, wrong turn, expired turn, invalid authority/identity는 draft를 버리고 `state:sync`를 요청한다.

Pool이 남아 있으면 `number:draw`, 0이면 `number:pass`만 표시한다. Draw는 tile을 고르지 않고 empty payload를 보낸다. Dirty draft에서 Draw/Pass를 실행하기 전 discard confirmation과 focus 이동·복원을 제공한다. Submit/Draw/Pass는 하나의 page-memory single-flight gate를 사용하며 acknowledgement loss reconnect retry는 같은 command/request ID를 유지한다. Number-specific advisory와 `number:start`는 없고 shared `game:start` 및 authoritative snapshot-bearing ack를 사용한다.

Transient reconnect나 presence-only update에서 `gameId`, `gameRevision`, `turnId`가 같으면 dirty draft를 유지한다. Canonical gameplay/turn/game identity 변화, timeout, FINISHED, session replacement는 reset한다. Page refresh는 local draft를 저장하지 않으므로 discard한다.

## 5. Presentation, privacy와 accessibility

PLAYING은 active Player, server canonical deadline 기반 display-only 90초 countdown, pool count, public Table, player rack counts/status와 viewer own rack detail만 표시한다. 상대 차례에도 own rack은 읽기 전용으로 보이지만 상대 physical tile detail은 없다. 색상은 RED/BLUE/BLACK/ORANGE marker와 accessible label을 함께 사용하고 native controls, focus-visible, 최소 48px action target과 horizontal inner scrolling을 제공한다.

Submit/Draw/Pass 제어는 canonical active Player에게만 활성화되고 상대 차례에는 명시적으로 비활성화된다. 390×844와 320×568에서 document-level horizontal overflow 없이 Room·gameplay controls가 유지되며, 긴 rack은 문서가 아니라 rack 내부에서만 수평 스크롤한다.

FINISHED는 server result order와 제공된 rank만 사용한다. `RACK_EMPTY`, `STALEMATE`, `LAST_PLAYER_STANDING`만 표시하며 `TIME_LIMIT`과 `ALL_PLAYERS_FORFEITED`를 추측하지 않는다. Opponent rack detail, pool order/Tile IDs와 session/persistence/scheduler 내부 값은 PLAYING과 FINISHED 모두 노출하지 않는다.

## 6. 현재 제한과 P8 gate

- P7C는 Web/문서만 변경하며 server/shared/domain rules와 dependency를 바꾸지 않는다.
- In-memory single-process, one-replica, restart/deploy 시 Room/session 소실과 Hangul `test-dictionary-v1` 제약은 그대로다.
- Browser editor는 server RuleEngine을 복제하지 않으므로 local invalid interim state와 server rejection 수정 flow가 의도된 동작이다.
- P7C local production build에서 실제 A/B browser로 Number create/join/start, 14장·pool 78, meld/Joker editor, Draw 뒤 15장·pool 77, privacy와 refresh/resume를 확인했다. Hangul production-serving raw-client 회귀는 기존 harness를 유지한다.
- P7C checkpoint는 Railway를 배포하지 않는다. Public two-game smoke는 사용자 수동 배포 뒤 별도 확인해야 한다.
- 다음 stop gate P8은 Hangul/Number catalog-create부터 invitation, start, commands, reconnect, privacy, wrong-game isolation과 deployment를 두 game E2E로 검증한다.
