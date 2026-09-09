# CITY — 2인 비밀 draft / 피드백 개선

기준 HEAD: `95c42bc`. 기존 baseline 1600 tests. 2026-09-09 사용자 승인.

## 확정 규칙 변경

첨부된 설명 화면은 공식 원문 검증 자료가 아니라 사용자가 요청한 변경 기준이다. 기존 CITY 2인 공개 제외 2장 규칙만 대체한다. CITY-001–070/E01–03의 다른 규칙, 명소 v2, 3–6인 draft, 45/90초, privacy는 유지한다.

2인 라운드: 서버 shuffle 후 아무도 보지 않는 1장 제외 → 선도자가 7장에서 1장 선택 + 1장 비공개 버림 → 상대가 5장에서 동일 처리 → 선도자가 3장에서 동일 처리 → 마지막 1장은 상대에게 자동 배정한다. 총 4장 배정/4장 비공개 제외. 마지막 역할은 별도 타이머나 응답 대기 없이 같은 commit에 배정한다.

사용자 추가 승인: 45초 안에 확정하지 않으면 서버 RNG가 서로 다른 두 역할을 무작위로 선택하여 가져오기/버리기를 수행한다. UI에서 미확정한 선택은 서버에 제출되지 않으며 timeout을 제한하지 않는다. 선택+버리기는 기존 `city:selectRole`의 `discardRoleId`로 atomic 처리한다. 누락/중복/비가용 역할은 mutation 없이 reject한다. 기존 requestId/revision/primary 인증과 E02 timeout→forfeit→다음 window 순서는 유지한다.

## 저장 / 공개 / 호환

기존 저장판을 조용히 재해석하지 않는다. 새 production game은 `roleDraftVersion: city-draft-v2`를 저장한다. 이 필드가 없는 v1/v2 저장판은 이전 draft 그대로 진행한다. `city-rules-v2`, `city-cardset-v2`, `city-roles-v1`의 명소/카드/능력은 그대로이며 이번 draft 규칙은 독립된 명시적 버전 축이다.

라운드 시작 시 eligible 2명일 때만 적용한다. 그 외 인원은 이전 제거 산술 유지. 공개 projection의 `secretPairDraft`가 현재 라운드 방식을 명시한다. 선택 중 상대가 떠났다고 클라이언트가 현재 participant 수로 규칙을 추측하지 않는다. 선택 후보는 현 actor에게만, 선택 결과는 각 owner에게만 공개한다. 비공개 버린 역할 목록은 wire에 추가하지 않는다. 합법적인 후보 목록 비교로 가능한 추론까지 없앤다고 주장하지 않는다.

새 Web/server 동시 업데이트 필요. 기존 Web은 새 additive projection을 이해하지 못하면 fail closed하며 새로고침이 필요하다. 다른 게임에는 변경 없음.

## 피드백 / 시각

viewer 전용 승인된 사건을 순서대로 2초씩 표시한다. 새로운 사건이 현재 팝업을 대체하지 않는다. reconnect/scope 변경 시 대기열을 비우고 과거 사건을 재생하지 않는다. Sound OFF에서도 text/visual 유지. CR05 실패 공격은 공격자만 알며 보호 대상에게 새 알림을 주지 않는다.

금화 synthesized metallic cue, 카드 filtered paper noise. 성공 ACK/canonical event 이후에만 재생하며 클릭 시 성공음을 내지 않는다. 배경음은 자체 합성한 잔잔한 화음이며 기본 OFF, 별도 저장 preference/버튼. 효과음 OFF와 독립적이다. 연결 종료/화면 종료/숨겨진 탭에서 중단하고 브라우저 gesture 제한을 존중한다. 외부 음원/새 dependency 없음.

역할 선택은 자체 보유 도시 원화를 역할별 환경 배경으로 재사용하고 장식 프레임/역할 emblem/명확한 가져오기·버리기 상태를 사용한다. 새로운 인물 원화 8장을 만들었다고 표현하지 않는다. Mobile 2열, 44px 버튼, focus/reduced-motion 유지.

## 배포

Railway NOT DEPLOYED. 아래 검증은 source/local 범위다.

## 검증 결과

- 최종 1611 PASS: shared 110 / Web 405 / server 1096. 기준 1600에서 11 tests 추가, 삭제/skip 없음.
- typecheck / full test / build / diff-check PASS. 기존 Vite 500KB chunk warning은 유지한다.
- 새 2인 7→5→3→자동 마지막 배정, 잘못된 discard 거절, legacy draft 유지, 3–6인 회귀, timeout/forfeit, JSON/adapter 복원 테스트.
- 실제 timeout application service에서 45초마다 random pair를 commit, revision +1, stale replay no-op, 마지막 선택 이후 90초 역할 window 확인.
- 기존 2/4/6인 full application game 및 privacy/scheduler/Socket.IO/production-serving/CR02 회귀 PASS. CR02 기존 기대 효과는 그대로 두고 fixture의 2인 선택 입력만 새 규칙에 맞췄다.
- 실제 local production 2인(Web + raw peer): create/join/start, 공개 제외 0, private 5장 선택·버리기, 마지막 자동 배정 뒤 자기 역할 2/2, 정상 CR06/CR07 행동 진입, 금화 2+1, 카드 보기/선택, refresh 복구. Snapshot/state 조작 없음.
- 팝업 DOM 250ms 간격 관측: 장터지기 bonus 다음 기본 gold ACK가 각각 약 2초씩 유지되고 순서대로 종료. Refresh 후 과거 팝업 없음.
- 효과음 OFF 동안 배경음 ON 유지, 각각 별도 toggle 확인. 브라우저 console error/warning 0. 실제 기기에서 음량/음색의 주관적 검수는 수동 항목이다.
- 실제 React UI fixture: 390px 선택·버리기/확정 callback, 320px 305/305(document client/scroll), 실제 production desktop 1280px 1265/1265. 역할 원화 프레임/모바일 2열/접근 가능한 버튼 확인. 임시 fixture는 gameplay 검증을 대체하지 않는다.
- Railway 배포 및 GitHub push는 수행하지 않았다.
