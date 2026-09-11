# 스파이폴 — 구현 경계

[게임 규칙](SPYFALL_GAME_RULES.md), [공통 방](ROOM_GAME_SWITCH.md), [상위 아키텍처](ARCHITECTURE.md)를 따른다. SPYFALL은 기존 게임과 독립된 concrete game이다. 공통 게임 엔진/새 dependency를 추가하지 않는다.

- Shared: 설정, 공개 장소 후보, 단계·명령 DTO, strict 개인별 projection 및 일관성 검사. 실제 장소 선택·스파이 식별자·직업 배정·투표 원장은 서버 전용 상태다.
- Domain: `REVEAL → QUESTION ↔ ANSWER`; 도중 `ACCUSATION` 실패 시 같은 질문/답변과 남은 두 타이머로 복원한다. 질문 마감 후 `FINAL_ACCUSATION → ACCUSATION`을 순차 처리한다. 스파이만 흐르는 질문 단계에서 `GUESS`에 진입한다. 모든 전이는 clone candidate를 검증한 뒤 반환한다.
- Application: current-primary actor, membership, room/game/phase scope, 서버 마감, 차례, 본인 투표, 최종 지목 자격을 검증한다. Room lane/UoW에서 상태와 멱등 receipt를 함께 commit한다. 동시 투표는 같은 phaseId에서 각자 제출 가능하며 다른 사람 투표의 gameRevision 증가 때문에 거부되지 않는다. 타이머는 game/phase/deadline으로 식별하고 overdue sweeper가 등록 실패를 복구한다.
- Projection: 방장도 본인 카드만 받는다. 스파이 projection에는 선택된 location/job/다른 표가 없다. 장소 후보와 그림은 의도된 공개 콘텐츠이므로 모든 사용자에게 같은 atlas를 제공한다. GUESS에서는 자발적으로 공개된 스파이만 공개 필드로 제공한다. 결과에서 정답과 표를 공개한다.
- Platform: Room union, storage clone/validation, start/leave/timer/retention, registry, transport, capability와 웹 decoder/controller를 기존 방식으로 additive 연결한다. 게임 교체와 재경기는 공통 명령을 사용한다. 종료 후 60초 오프라인 방장 승계는 기존 라이어 패턴을 독립 적용한다.
- Web: 빈티지 첩보 테이블, 개인 임무 카드, 24칸 장소 수첩, 단계별 행동. 모바일에는 개인 카드와 현재 행동을 우선 배치한다. 테이블은 좁은 화면에서 참가자 카드 그리드로 변환한다. 재접속·탭 숨김·단계 전환 시 개인 카드를 가린다. 제외 메모는 로컬이며 새 판에서 초기화한다.
- Audio: 새 dependency 없이 Web Audio 합성. 역할 중립적인 카드 효과음, 선택, 본인 차례, 지목, 10초 경고, 승패. 사용자 제스처로 unlock하며 음량/음소거를 로컬 저장한다. 과거 snapshot·중복 revision·비활성 탭에서는 단계 효과음을 재생하지 않는다. 오디오 장치 실패는 게임을 방해하지 않는다.
- Art: [원본 프롬프트 및 사용처](../apps/web/public/images/spyfall/README.md). built-in ImageGen으로 제작한 첩보 장면과 6×4 장소 atlas를 JPEG로 저장한다. UI는 이미지 내부 글자에 의존하지 않고 한국어 레이블을 직접 렌더한다.

## 주요 파일

- `packages/shared/src/games/spyfall/{contracts,v2-projection-contracts}.ts`
- `apps/server/src/games/spyfall/domain/{game,locations}.ts`
- `apps/server/src/games/spyfall/application/{service,lifecycle,host-succession}.ts`
- `apps/server/src/games/spyfall/compatibility/{adapter,projector}.ts`
- `apps/web/src/features/spyfall/{SpyfallGameScreen.tsx,spyfall.css,sound.ts}`
- Shared 계약 / 서버 domain·Socket.IO / Web 렌더·효과음 테스트.

## 검증

2026-09-11 검증:

- Root `npm run typecheck`, `npm run build`: 통과. Vite 공통 JS 번들 1,190.37 kB / gzip 334.03 kB로 기존 500 kB 청크 경고가 남는다. 이번 게임의 이미지 합계는 약 1.37 MB이며 별도 정적 파일이다.
- Root `npm test`: Shared 126 / Web 620 / Server 1,683, 총 2,429개 통과(실패·skip 0). 스케줄러 실패를 주입한 테스트의 예상 복구 로그가 출력되며 실제 실패는 없다.
- 실제 Chrome의 독립 브라우저 세션 3개로 방 생성·참가, 설정, 비밀 카드 확인/새로고침 가림, 질문/답변, 정체 공개/추측 승리, 같은 방 재경기, 만장일치 지목 승리를 검증했다. 테스트 서버 Clock을 주입해 단계 마감을 진행했고 사용자 명령은 실제 UI/Socket.IO로 전달했다.
- 8인 화면을 1360/1000/390/320px에서 캡처하고 참가자 카드의 영역 겹침/화면 이탈을 검사했다. 3인 390/320px에서 가로 넘침 없음, 보이는 버튼 최소 높이 44px도 확인했다. 실제 휴대폰 하드웨어 테스트는 하지 않았다.
- 실제 브라우저 AudioContext의 oscillator 생성, 음소거 후 새로고침 시 음량 0 유지를 확인했다. 역할 중립 효과음, 중복/초기 snapshot 억제 및 오디오 장치 부재는 자동 테스트로 확인했다.
- 브라우저 JavaScript 오류 및 Spyfall 이미지 로드 오류 없음. 기존 `/favicon.ico` 미제공으로 발생하는 404는 별도 경고로 기록했으며 공통 아이콘 변경은 포함하지 않았다.
- 검증 중 발견한 타이머 동기화 첫 렌더의 초과 표시와 비활성 정보 카드의 흐려짐을 수정했다. 새 테스트의 퇴장 명령에는 공통 계약이 요구하는 두 revision을 전달하도록 수정했다.
- `git diff --check` 및 문서의 상대 링크: 통과.

## 로컬 실행 및 후속 범위

`npm run build` 후 `PORT=4177 npm start`로 웹과 Socket.IO를 함께 실행하고 `http://localhost:4177`에서 스파이폴을 선택한다. 최소 3명의 독립 브라우저 세션이 필요하다. 같은 브라우저의 일반 탭들은 동일한 접속 자격을 공유하므로 독립 참가자 테스트에는 별도 프로필/브라우저를 사용한다. 원격 친구에게 localhost 링크를 보내는 것으로 접속할 수는 없다.

이번 구현은 공개 서비스에 배포하지 않았다. 대화는 대면 또는 별도 음성 통화로 진행한다. 내장 음성, 누적 점수, 서버 재시작 복구는 이번 구현의 범위 밖이며 후속 요구가 정해지면 별도로 설계한다.
