# 러브레터 구현 경계

[규칙과 온라인 정책](LOVE_LETTER_GAME_RULES.md), [공통 방](ROOM_GAME_SWITCH.md)을 따른다. LOVE_LETTER 구체 모듈을 추가하며 공통 엔진이나 dependency는 추가하지 않는다.

- shared: opaque cardId, 카드별 행동, strict 개인별 projection. 덱 순서·상대 손패·제외 카드는 서버 전용이다.
- server domain: PLAYING(PLAY_CARD/CHANCELLOR) → ROUND_RESULT → 다음 라운드 또는 FINISHED. 실패 시 원본과 revision을 보존하고 성공 candidate에서 21장 구성·중복·영역 보존을 검사한다. 시간·ID·난수는 입력/port로 제공한다.
- application: 인증 actor/room/game/turn 또는 round identity/revision을 검사한다. room lane과 UoW에 상태와 idempotency receipt를 원자적으로 commit한다. 존재하지 않는 카드와 다른 사람의 카드는 같은 외부 오류다.
- projector: whitelist로 공개 영역과 본인의 hand/notes만 조립한다. 사제·남작의 비밀 기록에는 당시 rank만 보관하고 private cardId를 전달하지 않는다. 재상 후보는 본인의 hand로만 전달한다.
- web: 일러스트 atlas와 HTML/CSS 프레임, 대상 선택, 경비병 추측, 재상 남길 카드/반환 순서, 비공개 확인, 라운드 결과. 새 game/round/turn/revision은 draft를 초기화한다. 응답 유실은 같은 요청 ID로 재확인한다.
- sound: Web Audio로 종이 마찰/카드 충격/비밀 확인/보호/탈락/승리를 자체 합성한다. 사용자 제스처 활성화, 음소거·음량 저장, 과거/중복 snapshot 재생 억제. 소리 실패는 게임 진행에 영향을 주지 않는다. reduced-motion과 키보드 선택을 지원한다.
- 기존 room start/lifecycle/retention/connection/capability/decoder/renderer에 구체 분기를 연결한다. 턴 제한이 없어 activeTurn은 null이다.

## 아트

[자산 README](../apps/web/public/images/love-letter/README.md)에 내장 image_gen 사용 및 프롬프트를 기록한다. 5열×2행 오리지널 궁정 인물화. 외부 원작 카드 일러스트를 복제하지 않는다.

## 검증

2026-09-11 검증:

- root `npm run typecheck`, `npm test`, `npm run build` 통과. 전체 2,452개 테스트(shared 126 / web 624 / server 1,702), 실패·skip 없음.
- 새 domain 테스트에서 2–6인 총 40매치, 10종 카드 효과와 예외, 카드 보존, 실패 원본 보존, 개인별 비밀 정보 분리를 확인했다.
- 실제 Socket.IO 테스트에서 인원/권한/입력 검증, 중복 요청과 경쟁 command, 재상 선택 중 재접속, 다음 라운드, 매치 완료·재시작·명시적 퇴장을 확인했다.
- 실제 두 브라우저에서 방 생성/참가, 재상 선택·반환 순서 변경·새로고침 복귀, 경비병 대상/추측/확정과 라운드 결과를 확인했다. Chrome 390px·320px 화면에서 카드와 선택 버튼을 검사했다. 음소거·음량은 새로고침 후 유지됨을 확인했다.
- 합성 효과음의 전이/중복 억제와 오디오 장치 부재 처리는 자동 테스트로 검증했다. 실제 스피커의 청감 평가는 별도 확인이 필요하다.
- Vite의 500kB 초과 번들 경고가 남아 있다(현재 앱 전체 JS 약 1.22MB, gzip 약 343kB). 게임 전체를 묶는 기존 구조이며 이번 작업에서 공통 번들 구조는 변경하지 않았다.
- `git diff --check` 통과. 새 dependency 없음. 공개 배포는 하지 않았다.

로컬에서는 root `npm run build` 후 `PORT=4188 npm start`로 실행하고, 홈에서 **러브레터**를 선택한다. 서로 다른 브라우저/브라우저 프로필을 사용해 2명 이상 참가한다. 저장은 기존 서버의 메모리 방 수명과 동일하며 서버 재시작 후 복구하는 영구 저장은 제공하지 않는다.
