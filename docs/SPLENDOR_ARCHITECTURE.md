# 스플렌더 구현 경계

2026-09-10. `SPLENDOR`는 기존 `GEM_CARD`와 별개인 기본판 2–4인 게임이다. [규칙](./SPLENDOR_GAME_RULES.md), [카드 데이터·그래픽](./SPLENDOR_ASSETS.md)을 함께 따른다.

## 모듈과 상태

- `packages/shared/src/games/splendor`: 직렬화 가능한 action, 카드/귀족/토큰, public/private projection과 런타임 schema. `protocol.ts`에 `splendor:act`, `splendor:rematch` 명령을 추가한다.
- `apps/server/src/games/splendor/domain`: 90장 카드 데이터, 10종 귀족과 순수 상태 전이. 모든 카드 참조는 매 게임 주입된 ID 생성기로 만든 opaque ID다. 숨은 덱 순서와 상대 예약 카드 ID는 projection에 포함하지 않는다.
- `application`: 기존 room 직렬 실행기, RoomUnitOfWork, Clock, RandomSource, ID generator, idempotency repository, TurnScheduler를 사용한다. 후보 상태에서 보석 보존/카드 90장 보존/귀족 보존/보유 한도를 검증하고 영수증과 한 번에 commit한다.
- `compatibility`: 기존 platform persistence에 게임별 adapter를 연결한다. Snapshot v2의 LOBBY/PLAYING/FINISHED 분기는 구체적인 스플렌더 schema이며 레거시 타일 상태로 변환하지 않는다.
- `apps/web/src/features/splendor`: 독립 React 화면, CSS, 그림 atlas와 표시 보조 계산. 구매 가능 표시·예상 지불은 안내이며 실제 판정은 서버에서 수행한다.

## 명령과 공개 범위

`splendor:act`는 gameId, expectedGameRevision, turnId와 TAKE/BUY/RESERVE/RESERVE_DECK/PASS payload를 받는다. 모든 payload에 반환 보석과 귀족 선택을 포함하므로 보석 초과 반환이나 귀족 선택 중간에 다른 명령이 끼어들지 않는다. BUY에는 지불 보석을 포함해 같은 색 보석 대신 황금을 사용하는 선택도 검증한다.

서버는 현재 연결의 actor, 방 멤버십과 퇴장 여부, game/turn/revision, 자신의 차례, 서버 마감을 확인한다. 유효하지 않은 카드 ID와 상대의 비공개 카드 ID는 동일한 외부 오류로 응답한다. 성공 영수증의 재전송은 다시 행동하지 않고 현재 플레이어별 snapshot을 반환한다. 같은 requestId의 다른 payload는 거절한다.

공개: 공용 보석 수, 시장의 12자리, 단계별 덱 잔량, 공개 귀족, 참가자 점수/보유 보석/할인/구매 카드/획득 귀족/예약 장수. 비공개: 자기 예약 카드만 `privateState`에 전달한다. 공유 계약에는 전체 서버 state나 세션 저장 record를 추가하지 않는다.

90초 마감은 기존 timer router와 overdue sweeper로 진행한다. gameId/revision/turnId/deadline이 다른 옛 타이머는 무시한다. 재접속은 같은 자리와 턴을 유지한다. 명시적 나가기는 판 전체 취소이며, 종료 후 방장의 rematch가 대기실로 되돌린다. 종료 방장의 연결이 60초간 끊어지면 기존 방 정책으로 승계한다. 기존 single-process in-memory 배포 제약은 그대로다.

## 화면과 조작

- 짙은 청록 테이블, 위쪽 상대 상인과 귀족, 단계별 카드 4장×3줄, 보석 은행, 아래쪽 내 상단으로 구성한다.
- 카드는 원본 그림 atlas 위에 점수/할인 보석/가격을 겹쳐 표시한다. 보석은 서로 다른 색과 컷 모양으로 구분한다. 귀족은 초상화와 필요 할인 수량을 함께 보여준다.
- 카드나 보석을 고르면 확인창에서 지불·초과 반환·귀족 선택을 마친다. 서버 확정 전에는 판을 변경하지 않는다.
- 응답 유실은 같은 요청을 재확인한다. 명시적 서버 거절을 받으면 새 선택을 허용한다. 턴/게임 scope가 바뀌면 이전 선택을 닫는다.
- 좁은 화면은 카드 2열, 보석 3열, 아래쪽 확인창을 사용한다. 고정된 차례 표시와 카드 시장/보석 은행/내 상단 빠른 이동으로 긴 스크롤을 줄인다.
- 키보드 버튼 조작, native dialog 포커스 제한, 이미지 의미/숫자 라벨, 선택 상태, 연결 상태, reduced-motion을 제공한다. 설명을 읽는 동안에도 서버 시간은 흐른다.

## 검증

`apps/server/src/splendor.domain.test.ts`: 인원별 초기화, 90장 데이터 구조, 불법 입력 원자성, 보석·황금·예약·구매·반환·귀족 선택, 라운드 종료와 동점, 무활동 종료, 전체 게임 진행.

`apps/server/src/splendor.integration.test.ts`: 실제 Socket.IO 2·3·4클라이언트의 입장/진행, 비공개 투영, 중복/변조/지연 요청, 재접속, deadline 경쟁, 재경기, 퇴장 취소, 타이머 복구, 종료 방장 승계.

`apps/web/src/lib/splendor-ui.test.ts`: 각 phase 라우팅과 그래픽 렌더, 구매/황금/보석 선택 안내, 입장 조건, 엄격한 payload 및 viewer 검증. 기존 공용 계약과 카탈로그 테스트는 지원 게임 10개를 명시적으로 확인한다.

2026-09-10 완료 검증: root `npm run typecheck`, `npm test`(shared 121 + web 525 + server 1,423 = 2,069개), `npm run build`, `git diff --check` 통과. 기존 대용량 JS chunk 경고는 유지되며 이번 빌드의 주 JS는 약 887 kB다. 실제 브라우저에서 방 생성, 보석 선택/확정, 예약과 황금 획득, 황금으로 예약 카드 구매, 새로고침 복원, 모바일 390px 폭의 빠른 이동/확인창, 도움말 Escape 닫기를 확인했다.
