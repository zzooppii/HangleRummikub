# Reconnect UX — same-browser seat recovery

## 범위와 경계

Web의 재접속 경로와 안내만 보완한다. server/shared wire, single-primary,
session token 검증, gameRevision, offline timeout streak, resume streak reset,
forfeit, scheduler, retention은 변경하지 않는다. 세 게임 모두 같은 platform
재접속 안내를 사용하며 각 게임 renderer/domain은 변경하지 않는다.

## 사용자 흐름

- Playing/Lobby/Finished 단절 시 기존 화면을 보존하고
  `연결이 끊어졌습니다. 재접속 중...`과 `다시 접속하기`를 표시한다.
- Socket.IO transport가 복구되면 기존 `session:resume`과 저장 credential을
  사용한다. 자동 복원도 수동 버튼도 nickname 기반 새 join을 만들지 않는다.
- 수동 버튼은 half-open transport도 다시 연결한다. ack 대기 중에는 중복 버튼
  실행을 막고, 기존 resume single-flight와 pending command retry를 유지한다.
- transport만 연결된 상태를 게임 복원 성공으로 표시하지 않는다. 유효한 resume
  응답 확인 전에는 편집/command를 연결 복원 상태로 제한한다.
- Home에는 최근 저장 게임 이름/Room과 복귀 버튼을 표시한다. 이름은 UI metadata일
  뿐이며 renderer와 admission authority는 여전히 server snapshot이다.
- direct Room에서 정보가 없으면 `이 기기에는 기존 게임의 재접속 정보가 없습니다.`를
  안내한다. 신규 join은 기존 server LOBBY 정책을 따르며 기존 seat를 탈취하지 않는다.

## 저장 및 교체 정책

- 기존 `player-session.v1` tab credential은 그대로 검증/사용한다.
- `hangul-rummikub.saved-game.v1` localStorage record는 최근 게임 하나의 bound
  credential + gameType 표시 metadata를 보관한다. schema-invalid credential은
  사용하지 않는다. 서버가 이미 종료된 Room인지 여부는 resume 때 확인한다.
- refresh/새 tab의 direct Room은 Room code가 일치하는 backup만 tab으로 가져온다.
  활성 tab은 다른 tab의 저장 갱신으로 player identity가 바뀌지 않는다.
- `session:replaced`는 tab credential 삭제 + `replaced-tab.v1` 표식을 남긴다.
  이전 tab의 foreground/refresh는 자동으로 primary를 탈환하지 않는다.
  명시적 복귀 버튼을 누를 때만 다시 server의 기존 primary replacement 정책을 적용한다.
- replaced tab은 공유 browser backup을 지우지 않는다. 정상 leave/definitive stale
  cleanup도 exact room/player/token이 일치하는 backup만 제거하여 다른 tab을 보호한다.
- credential은 DOM, URL, 상태 안내, 일반 로그에 노출하지 않는다. browser storage는
  same-origin JavaScript 접근 가능한 bearer credential이며 cross-device 복구 수단이 아니다.
- pending create/join은 tab-local 유지, gameplay pending/draft는 기존 page-memory 유지.
  presence-only 같은 gameplay identity 복원으로 draft를 초기화하지 않는다.
- `online`/`pageshow`/visible 복귀는 끊어진 transport만 재개한다. 이미 연결된 primary를
  매번 resume하지 않으며 replaced/incompatible 상태의 자동 재시도를 막는다.

## 검증

- 최종 root typecheck / test / build / `git diff --check` PASS.
  1182/1182 (shared 91, web 264, server 827), 기존 1172개 유지 + 신규 10개.
- 별도 server 재접속/security/lifecycle/production-serving targeted 159/159 PASS
  (production-serving 6개 포함).
- 신규 10 tests: 저장/refresh/tab 재열기, malformed/missing credential,
  Room mismatch, tab 격리, replacement/refresh 차단, 명시적 복귀, exact cleanup,
  저장소 접근 제한, Home/단절 안내와 버튼의 SSR 렌더링.
- 기존 server resume/security/lifecycle tests: 같은 playerId와 game state,
  wrong/missing token fail-closed, single-primary/reconnect storm,
  세 게임 offline streak reset 및 revision semantics를 유지한다.
- 로컬 production 빌드 A/B Number smoke: create/join/start 후 **게임 서버를 유지하고
  테스트 TCP 프록시 연결만 단절/복구**하여 실제 자동 resume과 기존 2명/랙 복원을 확인.
  단절 중 수동 버튼, Home 복귀, tab 닫기/재열기, direct Room refresh도 확인.
- 동일 origin 새 tab으로 primary 교체 후 이전 tab refresh가 자동 탈환하지 않는 것 확인.
- 320×568 / 390×844: 가로 overflow 없음, 하단 재접속 버튼 접근 가능,
  Number 상단 mobile Turn HUD와 겹치지 않음.

실제 iOS/Android background suspension과 이동통신망 handoff는 별도 기기 검증 대상이다.
테스트 중 의도적인 연결 차단에 따른 network 오류는 정상 연결 상태의 오류와 구분한다.
Railway 배포는 수행하지 않았다. process-memory Room/Game/session은 재배포로 소실될 수 있다.

## Source checkpoint / 수동 모바일 검증

판정: **SOURCE COMPLETE / MANUAL MOBILE RECONNECT VERIFICATION PENDING**.
사용자 결정에 따라 실제 모바일 기기 검증은 source commit/push blocker가 아니다.
배포 상태는 **DEPLOYMENT_PENDING_USER_ACTION**이며 Codex가 Railway 배포를 실행하거나
push만으로 배포 완료를 추정하지 않는다.

사용자가 Deploy Latest Commit 후 새로고침한 Web으로 **새 Room**을 만들어 확인한다.
재배포 이전 in-memory Room이 유지되는지 시험하는 것이 아니다. 테스트 중에는
`게임 나가기`를 누르지 않는다. explicit leave는 기존 규칙대로 forfeit/세션 종료이며
네트워크 단절과 다르다. 서버 시계는 단절 중에도 계속 진행한다.

1. **CASE 1 — 모바일 네트워크 단절**: NUMBER_TILE Playing 중 잠깐 연결을 끊고 복구한다.
   상대 화면의 offline 표시, 내 화면의 재접속 상태, 같은 player 자동 복귀를 확인한다.
   player 수가 늘지 않고 기존 game/소유 타일이 유지되어야 한다. 테스트는 turn deadline
   전에 짧게 진행한다. 단절 중 deadline이 지나면 기존 timeout에 따른 변화는 정상이다.
2. **CASE 2 — 새로고침**: Playing 중 browser refresh. 방 코드/닉네임 입력 없이 같은
   자리와 player identity로 복귀하며, 현재 turn deadline을 새 90초로 재설정하지 않는다.
   미제출 local draft는 기존 refresh 정책대로 폐기된다.
3. **CASE 3 — 탭 닫기/다시 열기**: 동일 browser/origin에서 tab을 닫고 사이트 Home을 연다.
   `진행 중인 게임`의 게임 이름/ROOM과 `다시 접속하기`를 확인하고 기존 자리로 복귀한다.
   저장소를 지우거나 시크릿 세션을 종료한 경우는 복구 보장 밖이다.
4. **CASE 4 — 수동 다시 접속하기**: 자동 복구가 지연되면 `다시 접속하기`를 누른다.
   저장 credential로 resume되며 nickname 기반 새 join/중복 player 생성이 없어야 한다.
5. **CASE 5 — 다른 브라우저**: 기존 credential이 없는 다른 browser에서 같은 PLAYING
   Room/nickname으로 접근한다. 재접속 정보가 없다는 안내가 나오고 기존 seat 탈취는
   실패해야 한다. 대기실의 정상적인 신규 참가 허용 여부와 혼동하지 않는다.
6. **CASE 6 — NUMBER mobile regression**: sticky turn/time, tap rearrangement,
   Submit 성공 audio와 내 turn 시작 audio가 정상인지 확인한다. 소리를 켜고 사용자
   터치로 audio를 활성화하며, 같은 turn의 재접속/presence update가 소리를 중복 재생하지 않아야 한다.
7. **CASE 7 — GEM/Hangul**: 각 게임에서 단절/복구와 refresh 후 기존 player/session 복원을
   확인한다. GEM onboarding 및 기존 Hangul 화면/게임 동작도 그대로여야 한다.

사용자 수동 검증 통과 후에만 다음 단계:
**Multi-game Platform P12 — Three-game E2E / release / Railway production verification**.
이번 checkpoint에서는 P12를 시작하지 않는다.
