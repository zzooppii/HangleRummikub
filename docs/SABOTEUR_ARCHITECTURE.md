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

내부 phase PLAYING/GOLD_SELECTION/ROUND_RESULT 동안 Room은 PLAYING이다. 3라운드 보상 완료 또는 명시적 퇴장 취소에서만 FINISHED가 된다. 턴 제한이 없어 activeTurn deadline은 null이다. 연결 끊김은 기존 상태를 유지하며 새 primary 세션은 기존 연결의 권한을 회수한다. 서버 재시작 복구는 기존 in-memory 제약상 제공하지 않는다.

같은 방 게임 교체는 기존 공통 기능을 사용하며 사보타지 설정은 없다. 방장·전원 접속·3–10인 조건으로 준비 버튼 없이 시작한다. 현재 온라인 기본 정책은 기존 무제한 라운드 게임에 맞췄다.

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
