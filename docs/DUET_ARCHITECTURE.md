# 듀엣 구현과 시각 디자인

2026-09-11. [확정한 게임 규칙과 온라인 기본값](./DUET_GAME_RULES.md)을 따른다.

- 공용 계약: `packages/shared/src/games/word-duet`와 `duet:act`. 모든 명령에 requestId, gameId, expectedGameRevision, turnId를 요구하며 strict schema로 추가 필드를 거절한다.
- 서버: `games/word-duet/domain`에서 초기 지도 조합, 방향별 추측, 힌트·토큰·최후의 추측·공동 승패를 순수하게 판정한다. 원본 state는 수정하지 않는다. ID와 무작위성은 기존 port로 주입한다. 시간 토큰은 실제 시간 제한과 무관하다.
- application: 현재 인증 actor, phase, revision, turn identity를 검증하고 방 단위 직렬 처리와 RoomUnitOfWork로 state/영수증을 한 번만 commit한다. 같은 requestId 재전송은 중복 반영하지 않는다.
- 내부 단계: CLUE → GUESS → CLUE, 토큰 소진/영구 패스로 SUDDEN_DEATH, 성공/실패/퇴장으로 FINISHED. 시작 힌트는 어느 쪽이든 먼저 제출 가능하며 서버 직렬 처리로 한 명만 수락한다. 매 수락 명령은 revision과 transitionId를 갱신한다.
- projection: 단어25개, 공개 힌트·확정 기록, 방향별 시민 표시, 발견 수, 남은 토큰과 자기 key만 전달한다. 상대 key/seed/남은 정답 수는 전달하지 않는다. cluesComplete는 자기 key의 요원이 모두 발견되었을 때만 true다. FINISHED에서만 양쪽 key 공개.
- 플랫폼: 구체적인 Room union, V2 schema, renderer, 시작·퇴장·보존·방장승계·재접속·게임선택 경로를 추가한다. deadline은 null이며 기존 게임의 타이머를 재사용하지 않는다. 지속 저장과 새로운 dependency는 추가하지 않는다.
- 클라이언트: 선택·입력은 로컬 draft. 확정 후 서버 snapshot으로만 카드 공개. 응답 유실은 같은 requestId로 확인하며, revision 갱신 시 선택·재전송 안내를 정리한다. 현재 단계와 역할이 바뀔 때 비밀 지도 기본 표시 및 힌트 draft를 전환한다.

## 화면

오리지널 야간 도시 일러스트, 청록 테이블, 아이보리 종이 카드, 황동 시간 토큰과 기밀 문서 패널로 구성한다. 카드의 떠오름·선택 테두리·접선 도장과 공개 animation을 사용하며 prefers-reduced-motion을 따른다. 색상과 함께 글자/아이콘으로 역할을 표시한다. 비밀 지도 화면에서는 실수 추측을 막고 공용 단어판으로 돌아가 확정한다.

공개적으로 발견된 요원은 오리지널 인물 일러스트 카드로 덮는다. 단어와 접선 표시는 그림 위에 유지하며, 공개된 패배 원인이 암살자일 때만 암살자 일러스트를 표시한다. 비밀 지도에만 있는 미발견 역할에는 인물 카드를 표시하지 않는다. 신규 발견/실패 전환에만 덮이는 animation을 적용하고 재접속·접속 상태 갱신에는 재생하지 않는다. reduced-motion에서는 animation을 끈다.

5×5 위치는 320px 모바일에서도 유지한다. 좁은 화면에서는 기록/힌트 패널을 보드 아래에 배치하고 추측 확정 바를 sticky로 제공한다. 키보드 focus, 명시적 input label, 공개 결과 기록과 네트워크 오류 안내를 제공한다.

아트 위치와 생성 prompt는 [asset README](../apps/web/public/images/word-duet/README.md)에 기록했다.

## 검증

- root `npm run typecheck`, `npm test`, `npm run build` 통과. 테스트는 shared 124개, web 586개, server 1,584개로 총 2,294개 통과, 실패/skip 없음.
- 규칙 테스트: 양면 지도 분포, 방향별 판정, 추측 횟수, 토큰 소진, 영구 패스, 30개 seed의 완주, projection 비공개 정보 차단을 확인했다.
- 실제 Socket.IO 테스트: 2인 입장 제한, 동시 첫 힌트, 중복 요청, 잘못된 actor/revision, 완주와 지도 공개, 재게임, 재접속 및 이전 연결의 인증 거절, 퇴장 취소를 확인했다.
- 서로 다른 두 브라우저에서 힌트 교환, 세 요원 발견, 턴 전환, 토큰 감소, 각자의 비밀 지도, 새로고침 복귀를 확인했다. 320px/390px 모바일과 1280px 데스크톱에서 가로 넘침 없이 표시되고 모바일 확정 버튼이 동작했다. 확인 시 브라우저 error/warn 로그는 없었다.
- `git diff --check` 통과. 빌드에는 전체 웹 앱의 500kB 초과 JS chunk 경고가 남아 있다(약 1,037kB, gzip 293kB). 기능 오류는 아니며 공통 번들 분리는 별도 범위다.

공개 배포는 이번 작업에 포함하지 않는다. 후속 미확정 범위는 규칙 문서에 기록했다.

### 인물 카드 후속 검증

- 새 에셋 2개는 총 약 74KB WebP로 최적화했다. 생성 도구와 최종 prompt는 asset README에 기록했다.
- 실제 두 브라우저에서 요원 발견 시 1장의 신규 덮기 연출, 암살자 공개와 패배, 390px 모바일 가독성, 이미지 로딩을 확인했다. 새로고침 및 파트너 재접속 시 기존 카드 연출이 재생되지 않는 것을 확인했다.
- 전체 테스트 재실행 통과. 최종 연출 보정 후 web 테스트도 다시 통과했다. 최초 제한 환경에서의 로컬 소켓 EPERM은 로컬 포트 허용 후 재실행하여 해결했다. 기존 번들 크기 경고는 유지된다.
