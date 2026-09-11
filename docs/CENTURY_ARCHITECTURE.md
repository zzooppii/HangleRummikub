# 센추리 구현 경계

[규칙](./CENTURY_GAME_RULES.md)을 따른다. 기존 Room/Session/UoW와 서버 권위형 경계 유지.

- shared games/century: strict action/개인별 projection DTO. `century:act`의 PRODUCE/TRADE/UPGRADE/ACQUIRE/REST/CLAIM은 gameId, expectedGameRevision, turnId, requestId를 받는다. 인증 actor는 socket binding에서만 결정한다.
- server games/century: 순수 domain과 정본 카드 데이터, application 직렬화·idempotency·원자 commit. 카드 ID는 주입 ID port로 생성한다. 모든 카드 zone을 중복 없이 보존하고 정본 카드 효과·동전 보존·자원 음수/한도·종료 정산을 검증한다. 무제한 자원 공급은 지불/생산/반환 전이를 검증한다.
- 교환 반복, 업그레이드 단계, 시장 카드별 지불 및 초과 반환을 전체 candidate에서 검증한다. 실패 시 revision 및 live state 불변. 시장 지불은 카드 ID와 자원 색의 순서 있는 배열이다.
- no timer: lifecycle activeTurn=null. 현재 차례와 revision은 계속 검증하며 이전 게임 timer가 개입하지 않는다. 명시적 퇴장은 취소. 개인별 projector로 상대 손패·획득 목표·덱을 보호한다.
- web features/century: React 카드 시장·손패·선택 패널, 표시용 미리보기. 서버 승인 전 판 수정 없음, 유실은 동일 요청 재확인, scope 변경 시 draft 폐기. 모바일 시장 순서·자원 표시·하단 조작 유지.
- art: 자체 생성 향신료 시장 일러스트를 홈·대기실·카드에 사용. 카드 수치와 색+문양은 독립적인 의미 있는 UI. Web Audio로 종이·나무·동전·차례·종료 소리, 음량/음소거 저장, 사용자 제스처로 활성화, 신규 revision만 재생. reduced-motion 지원.

## 검증

2026-09-12 검증:

- root `npm run typecheck`, `npm test`, `npm run build` 통과. 전체 테스트 2,524개(공유 126 · 웹 637 · 서버 1,761), 실패/skip 없음. 최초 sandbox 실행은 localhost listen EPERM으로 실패했고 로컬 포트를 허용한 실행에서 전체 통과했다. 개발 중 신규 테스트 fixture/ack 호출의 오류도 수정한 뒤 재검증했다.
- 빌드에는 Vite의 500kB 초과 chunk 경고가 남는다(전체 앱 JS 1,330.57kB, gzip 374.49kB). 이번 범위에서 공통 번들 분할은 변경하지 않았다. 문서 상대 링크와 `git diff --check` 확인.
- 카드 목록: 상인 43장·점수 36장의 비용/효과/점수를 두 공개 목록과 대조했다. 두 번째 목록의 갈색 생산 4개 오기는 다른 목록의 갈색 1개로 보정했으며 정본 카드 multiset 테스트로 고정했다.
- 센추리 서버 테스트 17개: 2–5인 초기 배치, 반복 교환·연속 승급·선지불·초과 반환, 금/은 이동, 모든 자리의 마지막 라운드, 동점, 정본 카드 보존, 비공개 projection, 실패 원자성, 동시/중복 요청, 재접속·퇴장·방장 승계·재시작. 2–5인 각각 3개 seed의 전체 게임도 종료까지 검증했다.
- 센추리 웹 테스트 4개: 표시용 행동 미리보기, strict payload, 화면/decoder 연결, 효과음 전이 중복 방지.
- Chrome 두 origin의 독립 세션으로 방 생성·참가·시작, 생산, 시장 지불/획득, 같은 자원 연속 승급, 휴식, 점수 획득, 새로고침 복구를 확인했다. 320px/390px 모바일 및 1440px 데스크톱 화면을 확인하고 제목 대비·상인 얼굴 crop을 보정했다. 320px 행동 dialog는 화면 안에 들어온다.
- 소리 듣기 조작과 음소거 후 새로고침 유지 확인. 실제 출력 장치에서 음색/음량을 청취하는 평가는 별도다. 브라우저 로그에서 확인한 경고는 MetaMask 확장 스크립트의 메시지/리스너 경고였다.
- 새 dependency 없음. 새 이미지의 생성 도구·최종 프롬프트·저장 위치는 [아트 기록](../image/century/README.md)에 기록했다.
