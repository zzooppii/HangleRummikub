# GEM CARD — 보석 컬렉션 UI 개선

## 범위

시작 HEAD `01c7434`. Baseline 1594 (shared 110 / Web 395 / server 1089).
GEM Web presentation만 변경한다. 규칙, 45-card dataset, 45초 timer, supply/cap, 구매·예약·수집 명령, 점수와 공동승리, session/privacy/reconnect/audio는 변경하지 않는다. 다른 게임과 공용 CSS, dependencies도 변경하지 않는다.

## 시각 언어와 정보 구조

- 새벽: 황금빛 수정 관측소 / 육각형 토큰.
- 물결: 푸른 수정 동굴과 수로 / 물방울 토큰.
- 숲: 나무뿌리 보석 공방 / 잎 모양 토큰.
- 불씨: 붉은 보석 제련소 / 마름모 토큰.
- 울림: 보라색 수정 공명 성소 / 길쭉한 육각 토큰.
- 프리즘: 여러 색의 삼각 토큰. 새로운 카드/능력이 아니다.

보석 계열별 원화 5종을 45장의 공개 `productionResource`에 연결한다. 카드별 고유 원화 45종이라는 의미는 아니다. 카드의 실제 tier/cost/VP/영구 할인 텍스트는 서버 projection 그대로 표시한다. 시장·예약·구매 목록·결과의 공통 `GemCardFace`를 통해 같은 카드 정체성을 유지한다.

카드는 원화, 큰 승점 표시, 영구 할인, 기본 비용, 예상 구매 가능 상태 순서다. 플레이 화면 상단에 보석 보관함과 공용 공급을 배치해 첫 행동을 찾기 쉽게 했다. 수집 선택/수집 확정은 분리하고 기존 disabled/validation을 유지한다. 카드 선택은 성공 동작이 아니며, 구매 상세로 즉시 스크롤/포커스 이동만 한다.

구매 상세는 할인 후 필요한 자원을 먼저 표시한다. 전체 계산표는 펼칠 수 있다. 구매 불가/부족 기본 자원/필요 프리즘/보유 프리즘 설명과 실제 구매 버튼의 기존 차단 조건을 유지한다. 예약은 보상 없이 최대 2장이라는 안내를 유지한다.

모바일: 상단 sticky 차례/타이머, 하단 시장/행동 바로가기 및 safe-area padding. 390px은 시장 2열, 320px은 기존 1열을 유지해 가독성을 확보한다. 이미지·토큰은 decorative이고 이름/수량/접근성 label을 함께 제공한다. 키보드 focus, 44px controls, reduced-motion 지원을 유지한다. 튜토리얼 6단계와 Guide에 동일한 시각 언어를 적용했다.

## 아트 출처

OpenAI built-in image_gen으로 새로 생성한 자체 원화다. 상용 게임 그림/로고/카드 이미지 입력은 사용하지 않았다. 정확한 5개 프롬프트와 생성 파일명은 [provenance.json](../apps/web/public/gem-art/v1/provenance.json)에 보관한다. 1254×1254 PNG 원본 5장은 사용자 요청에 따라 [image/gem](../image/gem/README.md)에 변경 없이 보관하며 SHA-256 일치를 확인했다. 배포 파일은 [gem-art/v1](../apps/web/public/gem-art/v1)에 512×512 WebP q82로 저장한다. 원본 보관 폴더는 앱 번들에 포함하지 않는다.

5개 이미지 합계 371,332 bytes. 신규 dependency 없음.
Baseline JS 591.18KB/gzip166.01, CSS90.85KB/gzip19.17 → JS594.31KB/gzip166.99, CSS98.78KB/gzip20.80. JS +3.13KB, CSS +7.93KB 외에 지연 로딩 이미지 약371KB가 추가된다. 기존 Vite 500KB warning은 남아 있다.

## 검증

- 신규 6 tests: 보석 6종 모양/label, 5개 자산, 공개 정보만 사용하는 art mapping, 구매 불가/Prism, 공급의 화면 순서/9 slots/입력 불변, responsive/a11y CSS.
- 전체 1600 tests 연속 2회 PASS (shared110 / Web401 / server1089), 기존 tests 삭제/skip 없음.
- typecheck / build / git diff --check PASS.
- 실제 React component presentation fixture: 1280/390/320, 9-slot 시장, 구매 가능/불가, 구매 command callback, Guide/튜토리얼, Finished 카드 identity 확인. Fixture는 서버 gameplay 성공을 대신하지 않는다.
- 로컬 production-serving 2인 게임: Home create/join/start, 실제 시장 예약 및 기본 자원 두 종류/한 종류 수집 확인. 예약 카드에 숲2/불씨1 지불 → 보유3에서0 → 예약1장에서0 → 구매 카드와 물결 영구 할인+1 확인. 새로고침 후 같은 게임/할인 복원. 실제 페이지 390px 375/375, 320px 305/305(client/scroll width).
- 두 번째 Socket.IO 검수 참가자는 초기 검수 스크립트의 불필요한 gameId 필드 때문에 자기 행동 요청이 거절되어 서버의 정상 45초 timeout으로 차례를 넘겼다. 이는 앱 변경/규칙 오류가 아니며, 실제 Web 참가자의 수집·예약·구매는 정상 승인되었다.
- 320px fixture의 임시 command-output 문자열이 페이지 밖으로 나오는 검수 도구 문제는 fixture에서 줄바꿈 처리. 앱 요소의 overflow는 없었다.
- 브라우저 app error/React warning은 없고 MetaMask extension warnings는 별도로 구분한다. 물리적 휴대폰 터치/스피커 체감과 Safari는 별도 수동 검수 대상이다.

Railway: NOT DEPLOYED. 실제 public 배포 검증으로 표현하지 않는다.
