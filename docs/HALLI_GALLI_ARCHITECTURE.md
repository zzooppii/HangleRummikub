# 할리갈리 구현

`HALLI_GALLI`를 여덟 번째 게임으로 추가한다. 규칙은 [HALLI_GALLI_GAME_RULES.md](./HALLI_GALLI_GAME_RULES.md)를 따른다. 서버 권위형/개인별 projection 경계를 유지하며 새 dependency는 없다.

- Shared: `games/halli-galli/contracts.ts`, `protocol.ts`, `platform/platform-snapshot-v2.ts`의 strict command 및 concrete Lobby/Playing/Finished DTO. `halli:flip`, `halli:bell`, `halli:rematch`는 기존 V2 capability 협상을 사용한다.
- Server: `games/halli-galli/domain/game.ts`는 카드 56장과 고유 ID·과일 수량 보존, 판정, 벌점, 탈락·결과를 순수 함수로 처리한다. `application/service.ts`가 인증 actor, membership, phase, game identity/revision, turn identity/ownership, Clock 마감과 방 lane/UoW/CAS/idempotency를 연결한다. 실패는 canonical state를 바꾸지 않는다.
- `compatibility/adapter.ts`는 서버 저장 상태를 detached validation한다. `projector.ts`는 카드 앞면·수량·탈락·판정·결과만 whitelist하며 서버 카드 ID와 덱/덮인 카드 순서를 내보내지 않는다.
- 매 뒤집기/벨 판정은 새 타이머 토큰을 만들고 이전 타이머를 취소한다. 마감은 차례별 10초다. 전체 게임 시간 제한은 없으며, 마지막 생존자만 남아야 정상 종료한다. callback은 game ID, 토큰, 마감 시각을 재검증한다. 등록 실패는 기존 overdue sweeper로 복구한다.
- 명시적 이탈은 판 취소와 결과 보존, rematch는 떠난 참가자를 제외한 같은 방 Lobby 복귀다. 새 게임 ID로 기존 게임의 지연 명령/타이머와 분리된다. 접속 끊김은 자동 진행·credential resume을 사용한다. 종료 방의 Host가 60초 이상 offline이면 연결된 참가자로 승계한다.
- Web: `features/halli-galli/`에 대기실, 과일 카드 테이블, 벨, 카드 뒤집기, 결과와 안내. 공용 catalog, decoder, realtime controller 및 App에 명시적 분기만 추가한다. 모바일 터치, Space 벨, F 뒤집기, 연결 끊김 시 입력 차단을 지원한다.

## 검증
도메인 테스트는 2–6인 분배, 맨 위 과일 계산, 정확히 5개, 공개 더미 수집, 부족한 벌점, 탈락, 카드 소진 종료, 15분 이후 계속 진행, 카드 변조 거절을 확인한다. 실제 Socket.IO 테스트는 방 생성/참가/시작, 동시 벨, idempotency, stale·위조 요청, 덱 정보 비노출, 재접속, 이탈·재경기, 타이머 복구를 확인한다. Web 테스트는 V2 routing, 화면과 admission, strict DTO를 확인한다.

## 제한
프로세스 내 메모리 저장이므로 서버 재시작 복구는 지원하지 않는다. 네트워크 지연 보정과 확장판 규칙은 미확정이며 구현하지 않았다. 서버에서 먼저 처리된 입력을 기준으로 판정한다. 운영 서버 배포는 별도 작업이다.

## 최초 v1 로컬 검증 기록 (2026-09-10, 아래 v2 정정 이전)

- Root `npm run typecheck`: PASS.
- Root `npm test`: 1,911 PASS (shared 118 / Web 468 / server 1,325), 실패·skip 없음. 샌드박스의 `listen EPERM` 제한으로 최초 Socket.IO 실행은 실패했으며, 로컬 포트 사용 권한으로 재실행해 통과했다.
- Root `npm run build`: PASS. JS 771.67KB / gzip 220.32KB의 기존 500KB 번들 경고는 유지한다. dependency/lockfile 변경 없음.
- `git diff --check`: PASS.
- 실제 브라우저: Home에서 할리갈리 선택 → 방 생성 → 3인 입장 → F로 뒤집기 → 벨 성공으로 6장 획득 → Space 오답으로 2장 지급 → 새로고침 재접속을 확인했다. 별도 2인 방에서 최종 벨 → 승자·카드 수 → 같은 방 Lobby 복귀를 확인했다.
- 390px 카드 테이블과 데스크톱 대기실/결과를 육안 확인했다. 320px 6인 화면은 가로 넘침 없음(뷰포트 320px / 문서 305px). 주요 버튼 높이 44px 이상. 카드/벨은 자체 SVG다. 확인한 플레이 구간의 브라우저 warn/error 로그는 비어 있었다.
- 나가기 안내가 한글 게임의 ‘기권’ 문구를 사용하던 연결 부분을 할리갈리의 ‘모든 참가자의 이번 판 취소’로 맞추고 브라우저 확인 대화상자에서 검증했다.
- 테스트 탭 정리 과정에서 브라우저 focus 제어가 한 번 timeout되어 문서화된 탭 닫기로 정리했다. 게임 플레이 검증 결과에는 영향이 없다.
- 작업 도중 다른 작업의 CITY 관련 변경이 함께 존재했으며 이를 되돌리지 않았다. 위 root 검증 수치는 당시 전체 작업 디렉터리 기준이다. 운영 서버 배포·commit은 수행하지 않았다.

## v2 종료 규칙 정정 (2026-09-10)

사용자의 명시적 요청으로 `halli-galli-v2`에서는 2인 최종 벨 종료 및 15분 시간 제한을 제거했다. 2인 오답은 상대 덱 아래로 한 장을 지급하고 공개 더미는 유지한다. 성공 시 기존 덱 순서를 보존한 채 공개 더미 전체를 아래에 붙이고 승리자가 다음 카드를 뒤집는다. 마지막 생존자는 남은 공개 더미까지 회수해 56장을 보유하며 유일한 승자가 된다. 카드 수가 많은 탈락자가 승자로 선택될 수 없도록 결과 검증도 추가했다.

Halli 전용 state/projection의 `gameDeadlineAt`과 result의 `FINAL_BELL`/`TIME_LIMIT`를 제거하고 규칙 버전을 갱신했다. 서버/클라이언트는 함께 반영해야 한다. in-memory의 이전 프로세스 게임을 새 규칙으로 변환하지 않으며, 업데이트 후 새 게임에서 v2를 시작한다. 기존 공통 Clock/차례 timer/직렬화 경계는 유지한다.

수정 전에 2인 정답, 2인 오답, 15분 경과의 세 재현 테스트가 모두 기존 조기 종료 때문에 실패함을 확인했다. 기존 조기 종료를 기대한 테스트는 새 확정 규칙에 맞춰 실제 카드 소진까지 진행하도록 바꾸었다. 동시 정답 입력·중복 요청·재접속·다음 뒤집기·56장 보존·최종 승자·재경기·종료 방장 승계 검증은 유지·확장했다. 화면에서도 ‘다음 벨로 종료’ 및 ‘최대 15분’ 안내를 제거했다.

### v2 검증 결과

- 현재 작업 폴더의 root `npm run typecheck`, `npm test`, `npm run build`: PASS. 테스트 1,981개(shared 121 / Web 506 / server 1,354), 실패·skip 없음.
- 최초 전체 검증은 동시에 진행 중인 CITY 변경의 `rule-engine.ts` 타입 오류로 서버 단계가 막혔다. 해당 코드는 수정하지 않았다. 마지막 커밋 `c54dffb`에 할리갈리 수정만 복사한 임시 사본에서 typecheck/test/build가 통과했고(1,972개), 이후 현재 작업 폴더에서도 위 전체 검증이 통과했다.
- 빌드의 기존 500KB 초과 경고는 유지한다(JS 806.15KB / gzip 230.11KB). dependency와 lockfile 변경 없음.
- `git diff --check`: PASS. 이번 정정은 도메인·실제 Socket.IO·화면 렌더 테스트로 검증했으며 브라우저 수동 재검증과 운영 배포는 수행하지 않았다.
