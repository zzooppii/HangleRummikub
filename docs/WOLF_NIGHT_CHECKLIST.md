# 늑대의 밤 — 사용자 체크리스트 검증

2026-09-10. 서버 도메인 테스트와 실제 로컬 Socket.IO 연결 테스트로 검증한다. 이번 작업에서 브라우저 DevTools 수동 점검이나 새로고침 UI 자동화는 실행하지 않았다. 기존 규칙은 [게임 규칙](./WOLF_NIGHT_GAME_RULES.md)을 따른다.

## 판정 및 행동

| 사용자 항목 | 검증 내용 | 테스트 파일 |
| --- | --- | --- |
| 초기 역할 ≠ 최종 역할 | 강도가 늑대와 교환한 뒤 최종 늑대로 패배하며 상대는 마을팀 승리 | `wolf-night.domain.test.ts`: final roles decide winners |
| 밤 순서·중앙 카드 보존 | 예언가 관찰 → 강도 교환 → 말썽쟁이 교환 → 원래 주정뱅이의 중앙 교환. 단계마다 카드 ID 보존과 예상 위치, 관찰 내용, 최종 승패를 독립 기대값으로 확인 | domain: checklist Seer then Robber |
| 도플갱어 | 복사 가능한 기본판 11종 각각의 시점과 카드에 귀속된 복사 역할 확인 | domain: Doppelganger copies |
| 투표 최소 2표 | 4인 순환 투표로 모두 1표인 경우 무탈락 | domain: checklist four distinct votes |
| 투표 동률 | 4인 중 두 명이 각 2표로 함께 탈락 | domain: tied majority |
| 사냥꾼 | 탈락한 사냥꾼의 대상인 늑대도 탈락, 도플갱어 사냥꾼 연쇄 | domain: hunter and Doppelganger-hunter chain |
| 무두장이 | 늑대 생존 시 단독 승리, 늑대와 함께 탈락 시 마을 공동 승리 | domain: Tanner alone / tied majority |
| 플레이어 늑대 0명 | 아무도 죽지 않으면 마을 승리, 마을 사람만 죽으면 승자 없음 | domain: checklist four distinct votes |
| 하수인·늑대 0명 | 비하수인 탈락 시 승리, 자신만 탈락하거나 무탈락이면 패배, 무두장이 승리 우선 | domain: minion without wolves / checklist no-wolf Minion |
| 외로운 늑대 | 동료 없음과 중앙 한 장 관찰 | domain: lone wolf |
| 예언가 | 다른 사람 한 장과 중앙 두 장의 양자택일, 잘못된 수량과 두 번째 행동 거부 | domain: checklist Seer alternatives |
| 강도·말썽쟁이 | 실제 교환과 강도 관찰, 말썽쟁이에게 교환 카드 내용 비공개 | domain: robber knows new face / checklist Seer then Robber |
| 주정뱅이·불면증환자 | 주정뱅이 새 카드 비공개, 불면증환자는 바뀐 현재 카드 관찰 | domain: drunk must exchange |
| 프리메이슨 | 두 플레이어의 상호 확인, 한 장이 중앙일 때 동료 없음만 공개 | domain: pair Masons / checklist lone Mason |
| 늑대팀·마을팀 승리 | 생존 늑대와 탈락 늑대에 따른 진영 판정 | domain: participants / final roles decide winners |
| Timeout | 3–10인 미행동 완료, 필수 복사·교환 자동 처리, 오래된 타이머 재실행 무효 | domain: participants / mandatory timeout; integration: stale callbacks |

늑대팀 승리에는 **무두장이가 탈락하지 않아야 한다**는 예외가 추가된다. 사용자가 앞서 제공한 무두장이 우선 규칙과 동일하다.

## 비밀정보·재접속·결과의 확인 범위

- 비밀정보: `wolf-night.integration.test.ts`의 raw private projection과 domain per-viewer 테스트에서 실제 응답의 타인 카드·중앙 배열·전체 투표·타인 관찰 미노출을 검사한다. 도플갱어 교환 상대의 정보도 추가 검사했다. 공개 역할 구성 수량과 본인이 능력으로 확인한 정보는 허용된 정보다. 다른 참가자의 자격 증명 자체를 획득한 상황까지 보호한다는 뜻은 아니다.
- 재접속: integration의 checklist resume 테스트는 도플갱어가 강도를 복사한 직후 연결을 끊고 새 소켓으로 복구한다. 복사 기록과 남은 교환 능력을 확인하고, 교환 후 새 request ID와 최신 revision으로 재실행을 시도해 저장 상태 불변을 검증한다. 다시 연결해 완료 기록이 유지되는지도 확인한다.
- **미확정 UI 선택은 복원되지 않는다.** 아직 능력 사용 버튼을 누르지 않고 클릭만 한 대상은 React 임시 상태이므로 새로고침하면 초기화된다. 서버에 확정한 행동·투표·관찰 기록과 구분한다.
- 결과: 복합 교환 테스트에서 예상 이동 과정과 초기 역할·최종 역할·사망자·승자·최종 projection의 일관성을 확인한다. **현재 결과 화면에는 전체 밤 이동 이력은 없다.** 초기/최종 역할, 도플갱어 복사 역할, 투표, 탈락 및 승패만 표시한다. 이동 이력 표시를 구현했다고 주장하지 않는다.

이번 변경 파일은 서버의 두 늑대 테스트 파일, 이 문서와 구현 검증 문서다. 게임 로직과 다른 게임 코드는 수정하지 않았다.
