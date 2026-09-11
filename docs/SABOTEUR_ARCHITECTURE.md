# 사보타지 구현 경계

[확정 규칙과 온라인 정책](./SABOTEUR_GAME_RULES.md)에 따라 SABOTEUR를 기존 12개 게임에 추가한다. 서버 권위형 Room/session/UoW 구조를 유지한다.

- shared games/saboteur: opaque card ID, 0/180° 방향, 행동, 공개/개인별 projection, strict runtime schema. 공개 카드 도형과 보드 연결 탐색만 browser-safe geometry로 공유한다. 서버 내부 덱/역할 배분/금 저장 상태는 공유하지 않는다.
- server games/saboteur/domain: 67장 길·행동 카드 및 28장 금 카드 보존, 플레이어별 장비 카드 소유, 통로 내부 연결, 목표 공개, 사보타지/광부 보상, 3라운드 매치. 시간·난수·식별자는 application에서 주입한다.
- application: 방 lane과 UoW로 권한·회원·phase·game identity·scoped revision을 검사하고 candidate와 성공 receipt를 원자적으로 commit한다. 없는 카드와 비인가 카드는 동일 외부 오류를 반환한다.
- compatibility: concrete adapter와 whitelist projector. 손패·역할·지도 관찰·금은 본인에게만, 금 선택 후보는 현재 선택자에게만 전송한다. 역할 공개는 종료한 라운드 기록에만 포함한다. 취소 결과는 진행 중 역할이나 비공개 금을 공개하지 않는다.
- web: 자체 일러스트 atlas, SVG 통로/장비 카드, 확대·이동 보드, 탭/드래그 후 확정, 모바일 손패 고정, 비공개 역할·지도 dialog, 공개 채팅, 역할 공개·금 선택·결과와 재경기. 서버 확정 전에 실제 보드를 변경하지 않는다.

## 명령과 경쟁 처리

- `saboteur:act`: gameId, turnId, expectedGameRevision. 현재 turnId를 반드시 일치시킨다. future revision은 거부하며 같은 turnId 중 채팅으로 높아진 snapshot revision은 허용한다. 게임 행동이나 금 선택이 성공할 때마다 새 turnId를 생성하므로 이전 턴 명령은 재실행되지 않는다.
- `saboteur:nextRound`: gameId, roundId, expectedGameRevision과 본인의 아직 확인하지 않은 상태를 검사한다. 같은 라운드의 다른 참가자 확인 때문에 높아진 revision은 허용하여 전원이 동시에 확인할 수 있다. 마지막 확인만 새 카드·역할·roundId를 배분한다.
- `saboteur:say`: gameId, roundId와 개인 chatSequence를 검사한다. 240자·2초 간격·최근 60개. 채팅은 gameRevision을 증가시키지만 turnId는 바꾸지 않는다. React text node로 렌더링한다.
- 응답 유실은 같은 requestId로 재확인한다. 실패 시 원본 state/revision은 유지한다. 새 게임으로 교체된 후 과거 명령은 gameId로 거부한다.

## 라운드와 연결

내부 phase PLAYING/GOLD_SELECTION/ROUND_RESULT 동안 Room은 PLAYING이다. 3라운드 보상 완료 또는 명시적 퇴장 취소에서만 FINISHED가 된다. 진행 중 activeTurn은 transitionId와 서버 deadlineAt을 노출하며 종료 시 제거한다. 행동/금 선택 마감은 30초, 라운드 결과 확인은 최대 60초다. 연결 끊김은 기존 상태를 유지하며 새 primary 세션은 기존 연결의 권한을 회수한다. 서버 재시작 복구는 기존 in-memory 제약상 제공하지 않는다.

같은 방 게임 교체는 기존 공통 기능을 사용하며 사보타지 설정은 없다. 방장·전원 접속·3–10인 조건으로 준비 버튼 없이 시작한다. 접속 끊김에도 타이머는 진행한다.

## 시각 자료

[atlas.png](../apps/web/public/images/saboteur/atlas.png)는 내장 imagegen으로 만든 자체 광산/역할/금/재질 이미지다. [최종 프롬프트](../apps/web/public/images/saboteur/README.md)를 기록했다. 숫자·통로·장비 상태·프레임은 SVG/CSS로 렌더링한다. 새 dependency와 원본 보드게임 이미지 복제는 없다.

## 검증

2026-09-11 로컬 검증:

- 루트 `npm run typecheck`, `npm test`, `npm run build` 통과. 전체 테스트 2,243개(shared 121, web 578, server 1,544), 실패·건너뜀 0개. 마지막 화면 조정 후 web 테스트 578개도 다시 통과했다.
- 사보타지 신규 테스트 24개: domain 13, 실제 Socket.IO 통합 5, web 6. 3–10인 배분/카드 보존, 막다른 길과 목표 공개, 장비/지도/낙석, 보상과 3라운드 종료, 비공개 projection, 중복·동시 요청, primary 재접속과 퇴장 취소를 확인했다.
- 로컬 실제 브라우저와 테스트 참가자 2명으로 방 생성/입장/시작, 길 선택·미리보기·확정, 장비 고장, 공개 채팅, 개인 역할 보기, 새로고침 복원을 확인했다. PC와 모바일 390×844·320×740에서 화면을 확인했고 모바일 문서 가로 넘침은 없었다. 모바일 주요 행동 버튼 높이는 44px이다.
- `git diff --check`와 문서 상대 링크 확인도 통과했다. 새 dependency는 없다.
- Vite 단일 JS 번들 990.16 kB(gzip 280.52 kB)로 500 kB 청크 경고가 남는다. 빌드는 성공하며 별도 코드 분할은 이번 범위에 포함하지 않았다.
- 로컬 구현·검증만 수행했으며 외부 배포는 하지 않았다. 서버 재시작 복구는 기존 in-memory 제약을 따른다.

## 채팅 표시 수정

- 새 메시지를 받거나 재접속하여 대화를 복원하면 대화 목록 내부만 최신 메시지로 스크롤한다. 최근 60개가 유지되어 목록 길이가 같아도 내용 변경을 감지한다. 게임 상태만 갱신되면 과거 대화를 읽던 위치는 유지한다.
- 대화 목록의 90/110/135/200px 최대 높이 제한을 없애고 패널의 남는 높이를 사용한다. 입력창은 패널 하단에 유지하고 모바일 패널 높이는 제한한다.
- 실제 React 화면에 60개 메시지를 넣은 로컬 브라우저에서 최초 표시, 60개 유지 상태의 추가 수신, 과거 대화 탐색 후 상태 갱신과 신규 수신을 확인했다. 1280×1400에서 패널 810px 중 목록 714px를 사용하고 입력창 하단 여백은 10px였다. 390×844에서는 패널 228px, 목록 135px이며 최신 수신 후 하단 오차는 1px 이내였다. 검증용 화면은 제거했다.
- 수정 후 루트 typecheck/test/build와 `git diff --check` 통과. 현재 작업 트리 전체 테스트 2,294개(shared 124, web 586, server 1,584), 실패·건너뜀 0개. Vite의 500 kB 청크 크기 경고는 남아 있다.

## 서버 제한 시간

- 공개 projection의 `deadlineAt`은 진행 중 필수 시각, 종료 시 null이다. 클라이언트는 snapshot serverTime과 단조 시간으로 남은 초만 표시한다. 마지막 10초를 강조하고 마지막 5초를 알린다.
- 기존 TurnScheduler/active deadline 조회/overdue sweeper를 이용한다. timeout은 방 mutation lane에서 gameId·transitionId·deadlineAt·서버 Clock을 검사하고 한 번만 commit한다. 채팅/일부 확인으로 증가한 revision은 같은 transitionId와 deadlineAt에 한해서 허용한다.
- 플레이어 행동과 결과 확인은 서버 시각이 deadlineAt 이상이면 거부한다. 성공한 행동/금 선택/다음 라운드 시작만 새 마감 시각을 만든다. 채팅·실패·재접속·일부 확인은 기한을 바꾸지 않는다.
- 시간 초과 행동은 주입한 RandomSource로 손패 또는 금 후보에서 한 장을 고른다. 결과 확인 만료는 미확인 참가자가 있어도 다음 라운드를 시작한다. 서버 지연 시 새 단계는 처리 시각부터 온전한 30초를 부여한다.

제한 시간 검증: 루트 typecheck/test/build와 `git diff --check` 통과. 전체 2,303개(shared 124, web 588, server 1,591), 실패·건너뜀 0개. 사보타지 domain 17개와 Socket.IO 통합 8개에 30초 경계, 자동 금 선택, 60초 결과 만료, 전원 조기 확인, 채팅 중 기한 유지, 중복 콜백/늦은 명령 경쟁, 연결 끊김, 전원 무행동 3라운드 완료 및 실제 스케줄러 broadcast를 포함했다. 모바일 390×844 브라우저에서 60초/마지막 5초 표시, 0초 행동 차단과 가로 넘침 없음을 확인했다. Vite 청크 크기 경고는 남아 있다.
