# 섬 개척 구현과 검증

2026-09-10. 기존 게임 선택·방·세션 흐름에 `ISLAND_SETTLERS`를 추가한다. 공개 작업명은 **섬 개척**이다. 규칙과 확정 근거는 [ISLAND_GAME_RULES.md](./ISLAND_GAME_RULES.md)를 따른다.

## 구현 경계

| 위치 | 책임 |
| --- | --- |
| `packages/shared/src/games/island/board.ts` | 공개 육각형 보드의 지형·교차점·간선·항구 좌표와 연결 관계 |
| `packages/shared/src/games/island/actions.ts` | 자원·단계·행동의 strict 런타임 스키마 |
| `packages/shared/src/games/island/contracts.ts` | 플레이어별 playing/finished DTO; canonical state 없음 |
| `apps/server/src/games/island/domain/game.ts` | 주입된 시간·난수 입력으로 배치, 생산, 건설, 거래, 발전 카드, 점수, timeout을 계산하는 순수 도메인 |
| `apps/server/src/games/island/application/` | 인증, 현재 connection, room lane, revision, 원자적 commit, scheduler, leave와 방장 승계 |
| `apps/server/src/games/island/compatibility/` | 저장 상태 검증과 비공개 정보의 명시적 allowlist projection |
| `apps/web/src/features/island/` | 자체 SVG 보드·기물·자원 그림, 반응형 대기실/플레이/결과 화면, 로컬 선택·확정 |

기존 concrete game start/lifecycle/timeout router, persistence union, per-viewer snapshot, Socket.IO 등록에 분기를 추가한다. 범용 엔진이나 새로운 repository·네트워크 계층으로 교체하지 않는다. 기존 dependency, 환경 설정, Railway 단일 origin 배포 구조를 유지한다.

## 계약과 상태 전이

- `game:start`는 기존 roomRevision 계약으로 3–4명 모두 접속 중인 대기실에서 방장만 실행한다.
- `island:act`는 `gameId`, `expectedGameRevision`, `turnId`, `requestId`와 strict action payload를 받는다. 인증된 playerId는 socket context에서 가져오며 payload의 actor/보드/주사위/패 주입을 거절한다.
- `island:rematch`는 게임 종료 후 방장만 실행한다. gameRevision과 roomRevision을 모두 검증하고 이탈자를 제거한 대기실로 돌아간다. 다음 시작에는 새 gameId·cardId·turnId를 발급한다.
- 단계는 `SETUP_SETTLEMENT → SETUP_ROAD`의 순·역순 배치 후 `ROLL → ACTION`을 반복한다. 7은 `DISCARD → ROBBER_HEX → ROBBER_VICTIM`, 기사·도로 건설은 해당 선택 후 원래 `ROLL` 또는 `ACTION`으로 복귀한다.
- 거래는 `ACTION`에서 하나만 열 수 있다. 제안 → 수락/거절 → 제안자의 상대 선택·확정 순서다. 수정 제안은 새 ID를 받아 기존 수락을 모두 폐기한다. 현재 차례 참가자를 포함하는 거래만 유효하다.
- 일반 행동·거래 응답·timeout·leave는 같은 room lane을 사용한다. 성공 candidate와 replay receipt를 UoW/CAS로 함께 commit한다. 실패 시 live state와 gameRevision을 변경하지 않는다. 동일 requestId의 재전송은 결과를 재사용하며 주사위나 거래를 다시 실행하지 않는다.
- 여러 사람이 같은 revision으로 동시에 거래 응답하면 나중 요청은 stale 오류를 받을 수 있다. Web은 최신 snapshot을 요청하고 거래 입력을 유지하여 새 화면에서 다시 응답할 수 있게 한다.

## 시간과 연결

사용자가 선택한 빠른 모드는 **120초 고정**이다. 초기 마을+도로 한 쌍에도 120초를 적용한다. 행동의 유효 시간은 lane 안에서 서버 `Clock`으로 판정하고, 경계 시각부터 일반 입력을 거절한다. 브라우저는 snapshot의 serverTime에 단조 시간 경과를 더해 남은 시간을 표시한다.

거래·버리기·카드 선택·재접속으로 deadline을 연장하지 않는다. 같은 차례에서 갱신된 revision의 timer를 예약하되 token과 deadline은 유지한다. timeout은 gameId/turnId/deadline을 재검증하고 미완료 배치, 주사위, 모든 버리기, 도둑 이동·훔치기, 무료 도로를 합법적으로 해결한 뒤 한 번만 다음 차례로 이동한다. 다음 차례는 서버가 실제 전환한 시각부터 120초다. 자동 행동은 로그에 표시한다.

오래된 timer는 no-op이며 예약 실패는 기록하고 기존 overdue sweeper가 복구한다. 일시 연결 끊김에는 자리와 패를 유지한다. 명시적으로 나가면 전체 판을 취소하며 UI에서 이를 확인한다. 종료 후 방장이 60초 이상 오프라인이면 기존 정책에 따라 접속한 참가자로 승계한다.

## 비공개 정보와 불변 조건

사용자 요청에 따라 모든 참가자의 자원 종류별 수량을 playerStates.resources로 공개한다. 각 자원 수량의 합이 resourceCount와 일치하고, 자기 public resources와 privateState.resources가 종류별로 일치하는지 검증한다. 발전 카드 앞면·ID, 덱 순서, 숨은 승점은 계속 플레이어별 projection으로 보호한다. 공개 데이터에는 보드·은행 재고·남은 발전 카드 수·공개 점수와 기사·도로 현황도 포함한다. 종료 시 최종 점수를 공개하고 상대 카드 앞면·ID는 계속 숨긴다.

저장 상태 검증은 자원별 19장, 발전 카드 25개의 종류·고유 ID, 기물 소유권·상한·중복·마을 간격, 지형·숫자·항구 구성, setup 진행, 상·결과·점수와 metadata 일치를 확인한다. 불법 행동은 복제 candidate만 폐기한다. 보드와 발전 덱은 서버 RandomSource에서 각각 새로운 난수를 받아 섞는다. 공개 보드로 비공개 덱의 공통 seed를 역산할 수 있는 구조를 사용하지 않는다. RNG seed와 credential은 wire DTO에 포함하지 않는다.

## 화면

바다 위 육각형 보드를 중심으로 플레이어 현황, 내 자원, 행동 패널을 배치한다. 각 지형에는 큰 나무·통나무, 광석 덩어리, 벽돌, 양모 실타래, 곡물 이삭 그림과 한글 자원명을 함께 표시하며 숫자 토큰은 위쪽에 둔다. 보드·내 자원·거래·플레이어 카드에서 같은 자원 그림을 사용한다. 각 플레이어 카드에는 다섯 자원의 그림·이름·정확한 수량을 0장까지 표시한다. 지형 질감·기물·아이콘은 코드로 그린 자체 SVG이며 외부 이미지/dependency를 추가하지 않는다. 기본 보기는 보드 전체를 가로폭에 맞추며, 데스크톱에서는 화면 높이도 고려해 축소한다. 플레이어 카드를 압축하고 내 자원을 행동 패널에 배치해 보드와 확정 버튼을 함께 볼 수 있게 한다. 모바일에서는 패널을 쌓되 보드 자체는 내부 스크롤 없이 표시한다. 사용자가 확대 보기를 켰을 때만 보드 내부 이동을 허용한다. SVG와 HTML 선택 버튼은 같은 740:660 비율의 컨테이너를 사용하며 그림에만 별도의 높이 제한을 적용하지 않는다. 합법적인 위치만 버튼으로 표시하고 선택 후 확정한다. 도로 후보는 실제 간선의 점선, 선택한 도로는 설치될 선 전체로 미리 보여준다. 키보드용 위치 목록도 제공한다.

현재 단계에 맞춰 주사위, 버리기, 도둑 대상, 무료 도로를 안내한다. 거래 조건 변경과 수락·확정을 분리한다. 카드의 구매 차례·사용 가능 여부는 서버 projection을 따른다. 연결 끊김·처리 중·시간 만료에는 행동을 막는다.

## 검증 범위와 남은 사항

- 도메인: 3/4인 순·역순 배치, 생산과 은행 부족, 도로 연결·순환·단절, 항구, 거래 동의·보존, 발전 카드, 숨은 승점 승리, timeout, 손상된 저장 상태 거절. 실제 생산·건설·은행 교환·카드 사용으로 승리까지 진행하는 3/4인 완주 테스트 포함.
- 실제 Socket.IO: 3/4인 생성·시작·배치, 참여 정원과 권한, 엄격한 payload, 중복 요청, 동시 거래, 연결 교체·재접속, 정확한 마감, leave/rematch, 이전 timer 무효화, scheduler 장애 복구.
- Web: 세 단계 라우팅, 3–4인 시작 조건, privateState 검증, 조작 가능한 위치의 서버 권한, 연결/대기/만료 시 버튼 비활성화, 위치 선택·확정, 버리기·도둑·거래·결과의 HTML 렌더링.

검증 command는 저장소 root의 `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`다. 최초 자동 검증은 브라우저에서 직접 플레이하거나 모바일 화면을 육안 검사한 결과를 의미하지 않으며, 후속 브라우저 검증은 아래에 별도로 기록한다. 공개 배포도 별도다. 프로세스 재시작 시 게임이 사라지는 기존 in-memory 제한은 유지하며, DB 복구·봇·확장판·최종 브랜드 결정은 이번 범위 밖이다.

최초 구현(자원 종류별 공개 변경 이전)의 2026-09-10 로컬 검증 결과: root typecheck PASS, **2,034 tests PASS**(shared 121 / Web 519 / server 1,394, 실패·skip 0), root build PASS, diff whitespace 검사 PASS. 새 게임 관련 검사는 도메인 24 / 실제 소켓 8 / Web 9개다. Vite의 기존 500 kB chunk 경고는 남아 있으며 당시 JS bundle은 854.90 kB(gzip 244.29 kB)다. 의존성과 lockfile은 변경하지 않았다.

자원 식별·공개 정책 수정 후 검증: root typecheck PASS, **2,102 tests PASS**(shared 121 / Web 531 / server 1,450, 실패·skip 0), root build PASS, diff whitespace 검사 PASS. 각 지형의 상시 이름·자원 그림과 상대의 종류별 수량 표시, public/private 자원의 종류별 일치, 상대 발전 카드 비공개를 추가 검증했다. 실제 소켓에서 초기 생산 후 모든 참가자의 공개 수량을 canonical state와 비교했다. `IslandBoard`가 출력한 SVG를 PNG로 렌더링해 지형 그림·숫자·이름을 육안 확인했다. 기존 500 kB bundle 경고는 유지되며 JS 892.21 kB(gzip 254.61 kB)다.

2026-09-11 보드 배치 수정: Web 회귀 테스트 13개 PASS. 도로 72개의 미리보기와 실제 건설 선의 두 끝점, 꼭짓점 54개의 선택 표시와 기물 위치가 일치함을 검사했다. 실제 Chrome에서 1470×1000, 1440×900, 1366×768, 390×844, 820×1180 화면의 보드 내부 가로·세로 넘침이 없고 버튼 중심 오차가 0.03px 미만임을 확인했다. 데스크톱 세 크기에서는 보드 하단도 viewport 안에 들어온다. 모바일의 플레이어 현황·행동 패널·기록은 일반 페이지 스크롤로 접근한다. 브라우저 검증은 렌더링과 선택·확정 콜백을 확인하는 로컬 UI fixture이며 실제 서버와의 게임 완주 검증은 아니다.

이번 수정의 root typecheck와 build는 PASS이며 기존 500 kB bundle 경고는 남는다. root test는 shared 126개 PASS, Web 619개 PASS / 1개 FAIL에서 중단됐다. 실패는 동시 작업 중인 `city-role-admission.test.ts`의 지원 게임 목록에서 SPYFALL과 LIAR_GAME 순서가 기대값과 다른 것으로, 이번 섬 보드 변경과 무관하며 해당 파일은 수정하지 않았다. 따라서 이 실행에서는 server 테스트가 시작되지 않았다. 섬 Web 테스트 13개와 위 5개 viewport의 선택·확정·확대/축소 브라우저 검증은 모두 PASS다.
