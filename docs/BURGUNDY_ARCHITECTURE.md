# 버건디 구현 경계

기존 방·세션·Socket.IO·직렬화 mutation lane·서버 Clock·RandomSource를 사용한다. `BURGUNDY`는 별도 게임 타입이며 기존 게임 판정과 상태를 변경하지 않는다.

- `packages/shared/src/games/burgundy`: 공개 DTO, 런타임 schema, 검증된 보드·타일·확장 데이터, 화면의 배치 및 비용 미리보기 함수.
- `apps/server/src/games/burgundy/domain`: 순수 규칙, 추가 효과 queue, 지역/최종 점수, 확장 hook, 시간 초과 자동 선택. hidden supply는 서버 상태에만 존재한다.
- `application`: 인증 actor·현재 연결·phase·revision·차례·deadline 검증 후 candidate 전체를 한 번 commit한다. 설정은 대기실 방장만 room revision으로 변경한다. 동일 requestId 재시도는 저장된 receipt를 반환한다.
- `compatibility`: 참가자별 공개 projection과 플랫폼 수명주기 연결. 판매 상품의 비소유자 상세와 공급 앞면은 공개하지 않는다.
- `apps/web/src/features/burgundy`: 반응형 영지·시장·확장 선택 UI, 주사위/일꾼 비용 미리보기, 명시적 확정 조작, Web Audio 효과음. 실제 판정은 서버 응답만 신뢰한다.

`burgundy:configure`는 방 설정, `burgundy:act`는 게임·turn·revision을 포함한 행동이다. 설정은 시작 시 게임에 고정한다. 실패는 live state/revision을 바꾸지 않는다. 30/60/90초 deadline은 서버만 판정하고 클라이언트 performance clock은 표시용이다.

원본 게임 미술의 스캔 대신 자체 생성한 영지 일러스트와 타일 atlas를 사용한다. PC는 시장·영지를 나란히 배치하며 좁은 화면은 두 영역을 탭으로 전환한다. 주사위→타일→목적지→확정 순서를 사용하며 색 외에 이름·숫자·설명으로도 식별한다. 효과음은 사용자 조작 후 활성화하며 음소거·볼륨과 reduced-motion을 지원한다.
