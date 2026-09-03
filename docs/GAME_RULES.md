# 한글 루미큐브 게임 규칙

## 1. 문서 목적과 현재 상태

이 문서는 서버가 판정해야 하는 한글 워드 게임 규칙과 웹 MVP 운영 정책의 규범적 기준이다.

- Phase 7A(MVP gameplay 규칙 확정): **완료**
- Phase 7B(공식 Tile inventory와 symbol 표현 확정): **완료** (2026-09-03)
- Roadmap Phase 7 전체: **완료**
- Phase 8(순수 Hangul·Unicode 조합): **완료** (2026-09-03)
- Phase 9(Test DictionaryProvider): **완료** (2026-09-03)
- Phase 10(Board와 순수 RuleEngine): **완료** (2026-09-03)
- Phase 11(Game start와 권한별 상태 동기화): **완료** (2026-09-03)

공식 physical Tile inventory와 디지털 symbol 표현의 canonical 기준은 C-22와 C-23이다. Phase 8은 Hangul composer를 구현했고 Phase 9는 아래 승인된 fixture를 `test-dictionary-v1` adapter로 구현했다. Phase 10은 server-only Board·Tile validation descriptor와 순수 RuleEngine을 구현했다. Phase 11은 exact inventory로 canonical GameState와 immutable RulesConfig를 만들고 `game:start`, Player별 PLAYING projection과 최소 web 상태를 연결했다. Submit·draw·timeout 같은 Game 시작 이후 mutation은 아직 없다.

규칙 문장에서 “해야 한다”, “허용한다”, “거절한다”는 서버 판정에 적용되는 규범적 표현이다. 예시는 규칙을 설명하지만 규범 문장을 대체하지 않는다.

## 2. Source of truth 분류

| source type | 의미 |
| --- | --- |
| OFFICIAL_BASE_RULE | 공식 한글 워드 게임 방법 또는 공식 구성 정보에서 확인한 기본 규칙 |
| DIGITAL_MVP_POLICY | 브라우저 기반 서버 권위형 게임을 위해 프로젝트가 추가로 확정한 정책 |
| IMPLEMENTATION_INVARIANT | 사용자에게 선택권을 주는 게임 규칙이 아니라 상태 보존·보안·동시성 정확성을 위한 구현 불변 조건 |

하나의 항목에 여러 source type이 있으면 각 규칙 문장 옆에 종류를 따로 표시한다. 디지털 adaptation을 공식 규칙인 것처럼 표현하지 않는다.

## 3. 근거 matrix

2026-09-03에 아래 원문을 직접 확인했다. exact inventory를 secondary source로 확정하지 않았다.

| ID | source | 등급 | 확인한 내용 | 확인 방법 | 확인일 |
| --- | --- | --- | --- | --- | --- |
| S-01 | [공식 한글워드 게임방법](https://www.rummikub.co.kr/default/sub1/sub15.php) | official | 목표, 시작 배분, 첫 등록, 재조합, 제한시간, 가져오기, Joker, 종료와 점수 | 공식 웹페이지 직접 확인 | 2026-09-03 |
| S-02 | [공식 한글워드 제품정보](https://www.rummikub.co.kr/default/sub3/sub33.php) | official | 두벌식 키보드 자판 기반, ordinary consonant 94개, ordinary vowel 60개, Joker 2개, 자음·모음 bag 분리 | 공식 웹페이지 직접 확인 | 2026-09-03 |
| S-03 | [공식 설명서 게시물](https://www.rummikub.co.kr/default/sub5/sub51.php?com_board_basic=read_form&com_board_id=12&com_board_idx=36)의 [첨부 PDF](https://www.rummikub.co.kr/chtml/board.php?template=bizdemo58906&com_board_basic=file_download&com_board_id=12&com_board_idx=36&com_board_file_seq=0) `한글워드 인쇄출력버전.pdf` (`루미큐브_한글워드 타일 룰북(제품용)`) | official primary | 1쪽의 자음군 95개·모음군 61개에 Joker가 각 1개 포함됨과 category별 배분·bag 절차, 2쪽의 회전 규칙, 3~4쪽의 Joker·복합 자모 실제 예 | 첨부 PDF 4쪽을 300 DPI로 전부 렌더링해 육안 대조. 내려받은 파일 SHA-256: `d27282fdd4f4c7b90e33575d787923f35e4e1827fc66bc986f68f6c092668a62` | 2026-09-03 |
| S-04 | [루미큐브 공식쇼핑몰 한글워드 제품 페이지](https://rummikubshop.co.kr/product/%EB%A3%A8%EB%AF%B8%ED%81%90%EB%B8%8C-%ED%95%9C%EA%B8%80%EC%9B%8C%EB%93%9C-rummikub-hangul-word/486/)의 [공식 원본 구성 이미지](https://rummikubshop.co.kr/web/upload/NNEditor/20251126/EC8381EC84B8.jpg) | official sales channel | physical family별 exact quantity와 표시 도형을 S-03 및 S-02 합계와 교차 확인 | 제품 상세 원본 이미지를 원본 해상도로 확인 | 2026-09-03 |
| U-01 | [Unicode Standard 17.0, Core Specification §3.12](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-3/) | technical primary | modern Hangul L/V/T repertoire, conjoining jamo 기반 조합과 NFC 관계 | Phase 8 구현 불변 조건의 근거로 확인 | 2026-09-03 |
| U-02 | [Unicode 17.0 `Jamo.txt`](https://www.unicode.org/Public/17.0.0/ucd/Jamo.txt) | technical primary | modern choseong/jungseong/jongseong short-name와 범위 | Phase 8 mapping 교차 확인 | 2026-09-03 |
| U-03 | [Unicode Standard 17.0, Core Specification §18.6](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-18/) | technical primary | Compatibility Jamo가 spacing, nonconjoining character라는 구분 | Compatibility glyph 단순 NFC 조합 금지의 근거로 확인 | 2026-09-03 |

S-03의 1쪽은 ordinary Tile에 각 bag 소속 Joker 1개를 더해 자음군 95개와 모음군 61개로 적는다. S-02의 94/60/2 표기와 모순이 아니라 `94 + 1`, `60 + 1`이라는 동일 구성의 서로 다른 집계 방식이다. 검색 과정에서 판매 페이지·블로그 같은 secondary 자료도 발견했지만 규범적 확정에는 사용하지 않았다.

---

# CONFIRMED

## C-01. 참가 인원, 목표와 Player order

### Normative rule

- **OFFICIAL_BASE_RULE:** 한 Game은 2~4명이 플레이한다.
- **OFFICIAL_BASE_RULE:** 자신의 rack Tile을 가장 먼저 모두 사용한 Player가 즉시 우승한다.
- **OFFICIAL_BASE_RULE:** 실물 게임은 정한 순서를 시계 방향으로 순환한다.
- **DIGITAL_MVP_POLICY:** game:start 시 서버 RandomSource가 참가 Player 목록을 한 번 shuffle한다.
- **DIGITAL_MVP_POLICY:** shuffle 결과를 immutable turnOrder로 GameState에 저장하고 첫 번째 Player가 첫 turn을 시작한다.
- **DIGITAL_MVP_POLICY:** 이후 turn은 active Player의 turnOrder를 순환한다. reconnect 때문에 다시 shuffle하지 않는다.
- **DIGITAL_MVP_POLICY:** forfeit Player는 원래 순서를 보존한 채 active rotation에서 제외한다.

### 정상 예

- 네 Player를 서버가 [P3, P1, P4, P2]로 정했다면 첫 turn은 P3이고 이후 P1, P4, P2 순서다.
- P1이 reconnect해도 순서는 바뀌지 않는다.

### 거절·edge case

- client가 자신을 첫 Player로 지정하는 요청은 받아들이지 않는다.
- nickname, playerId 또는 접속 시각으로 turnOrder를 재정렬하지 않는다.
- 게임 도중 새 shuffle 결과를 적용하지 않는다.

### Server validation implication

- game:start 한 번만 서버 RandomSource를 사용한다.
- 모든 turn command actor는 현재 activePlayerId와 일치해야 한다.
- turnOrder 변경이 필요한 forfeit 처리는 직렬화된 canonical mutation으로 수행한다.

## C-02. 공식 Tile 합계와 시작 rack

### Normative rule

- **OFFICIAL_BASE_RULE:** 전체 구성은 ordinary consonant Tile 94개, ordinary vowel Tile 60개, Joker 2개, 총 156개다. exact physical family와 quantity는 C-22의 canonical inventory table을 따른다.
- **OFFICIAL_BASE_RULE:** 자음군 95개는 ordinary consonant 94개와 Joker 1개, 모음군 61개는 ordinary vowel 60개와 Joker 1개로 구성되며 서로 다른 bag으로 관리한다.
- **OFFICIAL_BASE_RULE:** 게임 준비 때 자음군과 모음군을 각각 섞어 각 Player에게 자음군 7개와 모음군 7개를 나눠 주고, 남은 자음군과 모음군을 각각 해당 bag에 넣는다.
- **DIGITAL_MVP_POLICY:** 서버는 이를 각 Joker를 포함한 consonant/vowel physical pool별 shuffle과 각 pool의 7회 draw로 구현한다. affiliated Joker가 나오면 7회 중 하나로 세며 특정 symbol 비율을 보장하지 않는다.
- **IMPLEMENTATION_INVARIANT:** 모든 실제 Tile 인스턴스는 표시 symbol이 같아도 서로 다른 opaque tileId를 가진다.
- **IMPLEMENTATION_INVARIANT:** bag이나 rack에 있는 회전형 ordinary Tile은 아직 `assignedSymbol`을 갖지 않는다. 의미 symbol은 placement에서만 정한다.

### 정상 예

- 같은 `GIYEOK_NIEUN_ROTATION` family Tile 두 개가 존재하면 서로 다른 tileId를 가진 독립 인스턴스다.
- consonant bag의 초기 7회 중 그 bag 소속 Joker가 나오면 ordinary consonant 6개와 Joker 1개로 7개가 완료된다.
- 한 Player가 같은 회전 family를 여러 개 받아도 서버가 다른 symbol Tile로 바꾸어 보정하지 않는다.

### 거절·edge case

- Joker를 7회 배분 뒤 별도로 더해 8번째 consonant 또는 vowel Tile로 주지 않는다.
- physical family quantity를 `allowedSymbols` 각각의 quantity로 오해하지 않는다. `GIYEOK_NIEUN_ROTATION` 12개는 ㄱ 12개와 ㄴ 12개가 아니다.
- tileId 없이 화면 문자만으로 Tile 소유권을 판정하지 않는다.

### Server validation implication

- Game 시작 시 C-22의 inventory version으로 physical Tile instance를 정확히 한 번 생성하고 bag별 합계 95/61과 전체 156을 검증한다.
- server RandomSource로 각 bag의 physical tileId를 shuffle한 뒤 Player마다 정확히 7회씩 draw한다.
- Game 시작과 이후 모든 mutation에서 Tile conservation과 tileId uniqueness를 검증할 수 있어야 한다.

## C-03. Board와 WordGroup

### Normative rule

- **DIGITAL_MVP_POLICY:** Board는 2D crossword가 아니라 WordGroup들의 ordered collection이다.
- **DIGITAL_MVP_POLICY:** 각 WordGroup은 stable groupId, ordered Tile placement, 낱말을 만들기 위한 Tile 순서, syllable segmentation, 필요한 Joker assignment를 표현한다.
- **DIGITAL_MVP_POLICY:** WordGroup 배열 순서는 안정적인 UI 배치를 위한 것이며 낱말 유효성에는 의미가 없다.
- **DIGITAL_MVP_POLICY:** 서로 다른 physical tileId를 사용하는 독립적인 유효 WordGroup이라면 같은 NFC 완성 낱말을 Board에 여러 번 둘 수 있다.
- **OFFICIAL_BASE_RULE:** 최종 낱말은 최소 두 글자여야 한다.
- **OFFICIAL_BASE_RULE:** 최종 table에 남는 모든 낱말은 사전에서 확인 가능한 유효한 낱말이어야 한다.
- **DIGITAL_MVP_POLICY:** 서버의 canonical lookup 단위를 명확히 하기 위해 “두 글자”를 최소 2개의 완성형 Hangul syllable로 적용한다.
- **DIGITAL_MVP_POLICY:** 실물 table의 낱말들을 WordGroup으로 모델링하며 accepted Submit의 최종 Board에는 standalone Tile을 허용하지 않는다.
- **IMPLEMENTATION_INVARIANT:** 하나의 physical tileId는 최종 Board 전체에서 최대 한 번만 나타나며 동시에 두 WordGroup에 속할 수 없다.
- **IMPLEMENTATION_INVARIANT:** 서버는 모든 final WordGroup의 composition과 dictionary validity를 검증한다.

### 정상 예

- 바다, 학교, 사과처럼 2음절 이상이고 dictionary policy를 통과하는 낱말은 길이 조건을 만족한다.
- WordGroup 표시 순서를 바다·학교에서 학교·바다로 바꿔도 각 낱말의 유효성은 변하지 않는다.
- 서로 다른 physical Tile로 각각 만든 “학교” WordGroup 두 개는 두 group이 모두 독립적으로 유효하면 허용한다.

### 거절·edge case

- 나, 집, 물 같은 1음절 WordGroup은 거절한다.
- 공식 안내의 난이도 완화용 1글자 선택 변형은 MVP에서 사용하지 않는다.
- 어느 WordGroup에도 속하지 않은 Tile을 최종 Board에 남길 수 없다.
- 동일 tileId를 두 WordGroup에 중복 배치하면 거절한다.
- 같은 완성 낱말을 표현하더라도 두 WordGroup이 하나의 tileId를 공유하면 거절한다.

### Server validation implication

- 서버는 groupId 안정성, Tile 순서, segmentation, Joker assignment와 dictionary 결과를 함께 검증한다.
- final Board 전체를 대상으로 tileId 중복과 standalone Tile 부재를 확인한다.
- composed word의 uniqueness를 강제하지 않으며, groupId와 physical tileId의 uniqueness는 각각 독립적으로 검증한다.

## C-04. 서버 권위형 Submit과 Tile conservation

### Normative rule

- **IMPLEMENTATION_INVARIANT:** client가 보낸 문자열, 소유권, Board diff 또는 계산된 결과를 신뢰하지 않는다.
- **IMPLEMENTATION_INVARIANT:** 서버는 live state를 먼저 수정하지 않고 제출 전체로 candidate state를 만든다.
- **IMPLEMENTATION_INVARIANT:** actor, phase, turnId, active Player, deadline, expected gameRevision, Tile 존재·소유권·중복·보존, Hangul 조합, dictionary와 해당 move 규칙을 모두 통과한 경우에만 한 번 commit한다.
- **IMPLEMENTATION_INVARIANT:** 실패하면 canonical Board, rack, bag, turn state와 gameRevision은 그대로 유지한다.
- **IMPLEMENTATION_INVARIANT:** 같은 Room의 Submit, draw, timeout, leave 같은 경쟁 mutation은 직렬화한다.

### 정상 예

- 유효한 candidate Board와 rack conservation이 확인되면 하나의 atomic commit으로 Board와 rack을 갱신한다.

### 거절·edge case

- client가 존재하지 않는 tileId나 상대 rack Tile을 제출하면 외부에 Tile 존재 여부를 누설하지 않는 안전한 오류로 거절한다.
- validation 도중 dictionary provider가 실패하면 일부 Tile만 이동시키지 않는다.

### Server validation implication

- 제출 검증은 pure candidate 기반이어야 하며 commit 전 live aggregate를 변경하면 안 된다.
- accepted request의 canonical state와 idempotency 결과를 함께 원자적으로 보존한다.

## C-05. Initial meld

### Normative rule

- **OFFICIAL_BASE_RULE:** initial meld를 완료하지 않은 Player에게만 적용한다.
- **OFFICIAL_BASE_RULE:** 자신의 rack Tile만 사용할 수 있다.
- **OFFICIAL_BASE_RULE:** 기존 Board Tile을 사용하거나 재조합할 수 없다.
- **OFFICIAL_BASE_RULE:** 한 번의 등록에서 새로 내려놓는 physical Tile 합계가 최소 6개여야 한다.
- **OFFICIAL_BASE_RULE:** 등록하는 각 낱말은 최소 2글자여야 한다.
- **OFFICIAL_BASE_RULE:** 자신의 rack에 있던 Joker를 initial meld에 사용할 수 있다.
- **DIGITAL_MVP_POLICY:** 하나 또는 여러 WordGroup의 합으로 6 Tile 조건을 충족할 수 있다.
- **DIGITAL_MVP_POLICY:** accepted initial meld 뒤 initialMeldCompleted를 true로 만들고 그 turn을 종료한다.
- **IMPLEMENTATION_INVARIANT:** invalid initial meld는 Board, rack, flag, turn과 gameRevision을 변경하지 않는다.

### 정상 예

1. 하나의 유효 WordGroup이 rack Tile 6개 이상을 사용하면 조건을 만족한다.
2. “바다”와 “나무”라는 두 유효 2음절 WordGroup은 합계 8개의 physical Tile을 사용하므로 조건을 만족한다. 각 음절은 최소 choseong·jungseong 두 자리를 요구하므로 두 개의 유효 2음절 WordGroup은 정확히 6개가 아니라 최소 8개부터 가능하지만, initial meld 임계값 자체는 6개로 유지한다.
3. rack의 Joker 하나에 명시적 symbol assignment를 부여해 만든 유효 WordGroup들이 총 6개 이상의 Tile을 사용하면 조건을 만족한다.

### 거절·edge case

- 유효한 두 낱말을 만들었어도 사용한 Tile 합계가 5개면 거절한다.
- 6개 이상을 사용했어도 하나의 WordGroup이 1음절이면 전체 Submit을 거절한다.
- 기존 Board Tile 하나와 rack Tile 다섯 개를 섞어 6개를 맞추면 거절한다.
- Board를 재배치하면서 initial meld를 동시에 완료하려는 Submit은 거절한다.

### Server validation implication

- 서버는 turn 시작 rack의 tileId 집합과 submitted Board의 신규 tileId를 비교한다.
- 사용 Tile 수는 음절 수가 아니라 physical tileId 수로 센다.
- accepted commit에서만 initialMeldCompleted를 변경한다.

## C-06. Normal turn과 rearrangement

### Normative rule

- **OFFICIAL_BASE_RULE:** initial meld 완료 후 자신의 rack으로 새 낱말을 만들 수 있다.
- **OFFICIAL_BASE_RULE:** 기존 WordGroup에 Tile을 추가하거나, 기존 WordGroup을 분리하거나, 여러 기존 WordGroup의 Tile을 새 WordGroup들로 재조합할 수 있다.
- **IMPLEMENTATION_INVARIANT:** 기존 Board의 모든 tileId는 accepted 최종 Board에 정확히 한 번 남아야 한다.
- **OFFICIAL_BASE_RULE:** 기존 Board Tile을 자신의 rack으로 가져갈 수 없다.
- **DIGITAL_MVP_POLICY:** 정상 Submit은 자신의 rack에서 최소 1개 이상의 Tile을 Board에 새로 사용해야 한다.

### 정상 예

- Board의 두 WordGroup을 분해하고 rack Tile 두 개를 더해 세 개의 유효 WordGroup으로 재조합한다.
- 기존 WordGroup 끝에 자신의 rack Tile을 추가해 유효한 다른 낱말을 만든다.

### 거절·edge case

- 기존 Board Tile만 재배치하고 자신의 rack Tile을 하나도 사용하지 않으면 거절한다.
- 기존 Board Tile 하나가 사라지거나 두 번 등장하면 거절한다.
- 최종 Board에 하나라도 invalid WordGroup이 있으면 전체 Submit을 거절한다.

### Server validation implication

- before/after Board tileId multiset을 비교하고 기존 Tile conservation을 검증한다.
- 신규 Board Tile 집합은 actor의 rack 소유권을 검증하며 1개 이상이어야 한다.

## C-07. TurnDraft와 invalid Submit

### Normative rule

- **IMPLEMENTATION_INVARIANT:** TurnDraft는 client-only인 canonical Board의 working copy이며 Submit 전에는 canonical state가 아니다.
- **DIGITAL_MVP_POLICY:** 현재 active Player만 TurnDraft를 편집할 수 있다.
- **IMPLEMENTATION_INVARIANT:** 다른 Player에게 draft를 실시간 broadcast하거나 서버 canonical state로 저장하지 않는다.
- **DIGITAL_MVP_POLICY:** Submit 전에는 canonical state가 아니므로 undo, reset과 일시적인 invalid group을 허용한다.
- **DIGITAL_MVP_POLICY:** 새로운 gameRevision을 받으면 stale draft를 자동 merge하지 않고 폐기 또는 명시적 reset 대상으로 처리한다.
- **IMPLEMENTATION_INVARIANT:** invalid Submit은 canonical state를 바꾸지 않는다.
- **DIGITAL_MVP_POLICY:** invalid Submit만으로 turn은 끝나지 않는다.
- **DIGITAL_MVP_POLICY:** deadline 전에는 횟수 제한 없이 draft를 고쳐 다시 Submit할 수 있으며 server deadline은 계속 진행된다.

### 정상 예

- 편집 중 Tile 하나가 잠시 standalone이어도 Submit하기 전까지는 허용한다.
- 첫 Submit이 사전 판정에 실패해도 deadline 전이면 수정 후 같은 turn에서 다시 제출할 수 있다.

### 거절·edge case

- 다른 Player의 draft를 서버 snapshot에 포함하지 않는다.
- stale gameRevision 기반 draft를 새 Board와 임의 병합하지 않는다.
- invalid Submit을 이유로 timer를 재시작하거나 연장하지 않는다.

### Server validation implication

- 서버는 TurnDraft 저장소를 만들 필요가 없고 최종 Submit payload만 검증한다.
- invalid 결과에서 canonical state와 gameRevision 불변을 보장한다.

## C-08. 일반 draw, no-draw turn end와 bag

### Normative rule

- **OFFICIAL_BASE_RULE:** initial meld를 하지 않기로 하거나 유효한 move 없이 turn을 끝내려는 Player는 Tile 1개를 가져오고 turn을 종료한다.
- **OFFICIAL_BASE_RULE:** Player는 consonant bag 또는 vowel bag을 선택한다.
- **OFFICIAL_BASE_RULE:** 한 bag이 비어도 다른 bag이 남아 있으면 Game은 계속된다.
- **DIGITAL_MVP_POLICY:** draw command는 CONSONANT 또는 VOWEL만 지정하며 실제 tileId는 서버가 선택한다.
- **DIGITAL_MVP_POLICY:** 선택한 bag이 비고 다른 bag이 남아 있으면 상태를 바꾸지 않는 recoverable BAG_EMPTY 성격의 rule rejection을 반환해 다른 bag을 선택하게 한다.
- **DIGITAL_MVP_POLICY:** 두 bag 모두 비면 draw 없이 turn을 종료할 수 있다.
- **DIGITAL_MVP_POLICY:** 두 bag 모두 empty인 경우 외에는 별도 일반 PASS command를 제공하지 않는다.
- **DIGITAL_MVP_POLICY:** draw는 Player의 가능한 Board move 존재 여부를 서버가 탐색해 증명할 것을 요구하지 않는 자발적 turn 종료 선택이다.

### 정상 예

- 두 bag에 Tile이 있을 때 Player가 VOWEL을 선택하면 서버가 vowel bag에서 한 Tile을 뽑고 turn을 넘긴다.
- vowel bag만 비어 있으면 CONSONANT 재선택으로 정상 draw할 수 있다.
- 두 bag 모두 비면 no-draw turn end를 수행할 수 있다.

### 거절·edge case

- client가 tileId를 지정한 draw는 허용하지 않는다.
- 비어 있는 bag 선택 실패로 다른 bag에서 자동 draw하지 않는다.
- 일반 bag에 Tile이 남아 있는데 no-draw PASS를 요청하면 거절한다.

### Server validation implication

- bag 선택과 실제 Tile 선택을 구분하고 RandomSource는 서버에서만 사용한다.
- accepted draw와 turn advance를 원자적으로 commit하고 requestId 재시도를 중복 적용하지 않는다.

## C-09. Nickname

### Normative rule

- **DIGITAL_MVP_POLICY:** 입력 앞뒤 whitespace를 제거하고 Unicode NFC normalization을 적용한다.
- **DIGITAL_MVP_POLICY:** normalization 뒤 길이는 1~12 Unicode code point이며 Unicode Letter, Unicode Number, underscore만 허용한다.
- **DIGITAL_MVP_POLICY:** 같은 Room 안에서 normalized nickname exact 값의 중복을 금지한다. 대소문자는 구분한다.
- **DIGITAL_MVP_POLICY:** nickname은 identity나 authentication 수단이 아니다.

### 정상 예

- 혁상, Harvey, 혁상2, player_1
- Harvey와 harvey는 서로 다른 nickname으로 허용한다.

### 거절·edge case

- 빈 문자열, trim 후 빈 문자열, 13 code point 이상, 내부 공백, control character, emoji, HTML/script punctuation
- NFC equivalent 입력이 기존 nickname과 같으면 NICKNAME_TAKEN

### Server validation implication

- shared validator의 normalized 결과만 저장·비교하고 별도 regex를 복제하지 않는다.

## C-10. Room code

### Normative rule

- **DIGITAL_MVP_POLICY:** roomCode는 정확히 6자이며 생성 alphabet은 ABCDEFGHJKMNPQRSTUVWXYZ23456789다.
- **DIGITAL_MVP_POLICY:** 서버 canonical form은 uppercase이고 입력은 trim 뒤 uppercase로 normalize한다.
- **DIGITAL_MVP_POLICY:** roomCode는 locator이지 credential이 아니며 invitation URL에는 roomCode만 포함한다.
- **DIGITAL_MVP_POLICY:** createRoom은 collision candidate를 최대 10회 시도하고 모두 충돌하면 ROOM_CODE_EXHAUSTED로 실패한다.

### 정상 예

- abc234 입력은 ABC234로 normalize한다.

### 거절·edge case

- 0, O, 1, I, L, 기호 또는 길이가 다른 값은 거절한다.
- collision 실패 attempt는 ghost Room, Player, session 또는 idempotency state를 남기지 않는다.

### Server validation implication

- RoomCodeGenerator는 candidate만 만들며 lookup, retry와 atomic commit은 application 책임이다.

## C-11. Session credential

### Normative rule

- **DIGITAL_MVP_POLICY:** UNBOUND bootstrap credential TTL은 발급 시각부터 정확히 5분이며 now < expiresAt일 때만 유효하다.
- **DIGITAL_MVP_POLICY:** create/join 성공 시 정확히 하나의 Room/Player BOUND session으로 promotion한다.
- **DIGITAL_MVP_POLICY:** BOUND session은 해당 Room이 server memory에 존재하는 동안 유효하고 explicit leave 또는 Room cleanup 때 종료한다.
- **DIGITAL_MVP_POLICY:** 별도 absolute expiry는 두지 않으며 process restart/redeploy 후 복구를 보장하지 않는다.
- **DIGITAL_MVP_POLICY:** web은 bound credential을 sessionStorage에 저장한다.
- **IMPLEMENTATION_INVARIANT:** raw token은 직접 credential response에만 보내며 URL, 일반 event, snapshot, idempotency result와 log에 넣지 않는다.

### 정상 예

- 같은 tab refresh와 일시적 network reconnect 후 BOUND session으로 resume한다.

### 거절·edge case

- now === expiresAt인 bootstrap credential은 expired다.
- roomCode나 nickname만으로 Player를 복구하지 않는다.
- browser session을 완전히 종료한 뒤 복구는 MVP에서 보장하지 않는다.

### Server validation implication

- raw token 대신 verification data를 저장하고 conditional one-time promotion을 사용한다.

## C-12. Duplicate connection

### Normative rule

- **DIGITAL_MVP_POLICY:** 동일 BOUND Player session에는 single-primary 정책을 적용한다.
- **DIGITAL_MVP_POLICY:** 새 socket resume 성공 시 새 connectionGeneration이 primary가 되고 이전 socket은 즉시 command 권한을 잃는다.
- **DIGITAL_MVP_POLICY:** 이전 socket에 session:replaced를 알릴 수 있으며 그 socket의 늦은 disconnect는 새 connection을 OFFLINE으로 바꾸지 않는다.
- **DIGITAL_MVP_POLICY:** gameplay Player identity, rack과 turn ownership은 유지하며 새 Player나 복제 Game state를 만들지 않는다.

### 정상 예

- 같은 tab session을 새 연결이 resume하면 동일 playerId와 rack으로 이어진다.

### 거절·edge case

- replaced socket의 state:sync나 gameplay command는 UNAUTHENTICATED 성격으로 거절한다.

### Server validation implication

- actor는 payload가 아니라 current-primary ConnectionRegistry binding에서 도출한다.
- connectionGeneration은 public projection에 넣지 않는다.

## C-13. Lobby 공개 정보

### Normative rule

- **DIGITAL_MVP_POLICY:** Lobby에는 playerId, normalized nickname, Host 여부, CONNECTED/OFFLINE presence와 Player 표시 순서를 공개한다.
- **DIGITAL_MVP_POLICY:** sessionToken, token hash, socketId, connectionGeneration, bootstrap credential, storageRevision와 repository 내부 정보는 공개하지 않는다.
- **DIGITAL_MVP_POLICY:** ready 기능은 MVP Lobby에 두지 않는다.

### 정상 예

- 참가자는 joinOrder 기반 목록과 Host·presence를 본다.

### 거절·edge case

- 공용 Room snapshot에 credential이나 connection registry 객체를 직렬화하지 않는다.

### Server validation implication

- canonical entity를 직접 broadcast하지 않고 Player별 projection을 만든다.

## C-14. Turn duration과 timeout

### Normative rule

- **OFFICIAL_BASE_RULE:** 각 turn의 기본 제한시간은 60초다.
- **OFFICIAL_BASE_RULE:** 시간 안에 조합을 완료하지 못하면 실물 변경을 원상복구하고 penalty Tile 3개를 받는다.
- **DIGITAL_MVP_POLICY:** turnDurationMs는 60,000이며 server Clock만 authority다.
- **DIGITAL_MVP_POLICY:** command의 서버 수신 시각 receivedAt < deadlineAt이면 시간 조건을 만족하고 receivedAt >= deadlineAt이면 expired다.
- **DIGITAL_MVP_POLICY:** timeout 시 client-only TurnDraft를 폐기하고 canonical Board는 그대로 둔다.
- **DIGITAL_MVP_POLICY:** timeout penalty는 최대 3개다. 각 draw마다 두 bag이 모두 non-empty이면 server RandomSource가 CONSONANT와 VOWEL을 동일 확률 1/2로 선택하고, 한 bag만 남으면 그 bag을 사용하며, 둘 다 비면 중단한다.
- **DIGITAL_MVP_POLICY:** 선택된 bag 내부의 실제 Tile도 서버가 선택하고 penalty를 rack에 넣은 뒤 다음 turn으로 이동한다.

### 정상 예

- deadlineAt보다 1ms 먼저 서버에 도착한 Submit은 시간 조건을 통과할 수 있다.
- penalty 두 번째 draw 뒤 bag이 모두 비면 rack에는 2개만 추가하고 turn을 넘긴다.

### 거절·edge case

- receivedAt === deadlineAt인 command는 expired다.
- client countdown이 1초를 표시해도 서버 receivedAt이 deadline 이상이면 받아들이지 않는다.
- 공식 실물 규칙의 penalty bag 선택을 기다리지 않고 디지털 MVP는 서버가 선택한다.

### Server validation implication

- turn 시작 시 deadlineAt을 한 번 저장하고 임의 reset하지 않는다.
- timeout command와 늦은 Submit은 Room mutation serialization 및 turnId/gameRevision precondition으로 정확히 하나만 commit한다.

## C-15. Joker

### Normative rule

- **OFFICIAL_BASE_RULE:** Joker는 어떤 Tile이든 대체해 사용할 수 있다.
- **OFFICIAL_BASE_RULE:** consonant bag에 Joker 1개, vowel bag에 Joker 1개가 속한다.
- **DIGITAL_MVP_POLICY:** 두 source bag의 Joker는 기능상 동일하며, Joker 하나는 C-22의 ordinary physical Tile 한 자리만 대신한다. exact replacement symbol universe는 consonant 19개 `ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ`와 one-position vowel 14개 `ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅛ ㅜ ㅠ ㅡ ㅣ`다.
- **DIGITAL_MVP_POLICY:** 두 physical Tile이 필요한 복합모음이나 겹받침 전체를 Joker 하나로 대신할 수 없다. Joker는 그 구성 위치 중 하나만 대신할 수 있다.
- **DIGITAL_MVP_POLICY:** Board의 모든 Joker placement에는 현재 대체하는 `assignedSymbol`과 syllable role이 명시되어야 한다.
- **OFFICIAL_BASE_RULE:** 자신의 rack Joker는 initial meld에 사용할 수 있다.
- **OFFICIAL_BASE_RULE:** Board Joker가 대체하는 Tile을 사용할 수 있으면 그 Joker를 회수할 수 있다.
- **OFFICIAL_BASE_RULE:** 회수한 Joker는 rack에 보관하지 않고 같은 turn에 다른 유효 WordGroup에 즉시 사용해야 한다.
- **OFFICIAL_BASE_RULE:** initial meld를 완료하지 않은 Player는 기존 Board Joker를 회수하거나 재조합할 수 없다.
- **DIGITAL_MVP_POLICY:** rearrangement 중 assignment 변경은 허용하지만 accepted final Board에는 명시적 assignment가 있어야 한다.
- **DIGITAL_MVP_POLICY:** Joker가 포함된 모든 final WordGroup도 composition과 dictionary validation을 통과해야 한다.
- **IMPLEMENTATION_INVARIANT:** canonical Board의 기존 Joker logical placement는 `groupId`, syllable index, `CHOSEONG | JUNGSEONG | JONGSEONG` role, role 내부 component index와 canonical `assignedSymbol`로 식별한다. proposed Board에서 이 위치와 symbol이 모두 같을 때만 회수하지 않은 Joker로 본다.
- **IMPLEMENTATION_INVARIANT:** 기존 Joker가 다른 logical placement로 이동하거나 `assignedSymbol`이 바뀌거나 canonical group 구조가 더 이상 유지되지 않으면 recovered Joker로 본다.
- **IMPLEMENTATION_INVARIANT:** recovered Joker마다 actor rack에서 proposed Board에 새로 사용한 서로 다른 ordinary physical Tile 하나가 필요하며, 그 Tile의 final `assignedSymbol`은 Joker의 canonical old symbol과 정확히 같아야 한다. matching은 final Board 전체의 symbol별 multiset으로 판정하므로 ordinary Tile이 Joker의 옛 위치에 남을 필요는 없다.
- **IMPLEMENTATION_INVARIANT:** recovered Joker의 tileId는 proposed Board에도 정확히 한 번 남아야 하며, 이 conservation이 같은 turn의 즉시 재사용을 보장한다. actor rack에서 처음 Board로 나온 새 Joker에는 recovered-Joker replacement 조건을 적용하지 않는다.

### 정상 예

- Board Joker가 ㄱ을 대신하고 있을 때 actor가 ㄱ으로 사용할 수 있는 실제 Tile을 사용해 Joker를 회수한 뒤 같은 Submit에서 다른 유효 낱말에 배치한다.
- 기존 Joker를 다른 위치로 옮기고 actor rack의 ordinary ㄱ Tile을 final Board의 어느 위치에서든 `assignedSymbol = ㄱ`으로 새로 사용하면 canonical ㄱ Joker의 회수 조건을 충족할 수 있다.
- 기존 Joker의 assignment를 ㄱ에서 ㄴ으로 바꾸더라도 actor rack의 새 ordinary ㄱ Tile로 old symbol을 대체하고 Joker를 final Board에 즉시 재사용하면 허용할 수 있다.
- `ㅗ + Joker(assignedSymbol = ㅏ)` 두 자리로 복합모음 ㅘ를 표현할 수 있다.
- 어느 bag에서 나온 Joker든 `assignedSymbol = ㄴ` 또는 `assignedSymbol = ㅐ`처럼 one-position symbol을 대신할 수 있다.
- actor rack의 새 Joker는 유효한 one-position assignment와 final word 조건을 만족하면 별도의 old-symbol replacement 없이 사용할 수 있다.

### 거절·edge case

- 회수한 Joker를 rack에 남기거나 assignment 없이 Board에 두면 거절한다.
- initialMeldCompleted가 false인 Player가 Board Joker를 건드리면 거절한다.
- Joker 하나에 `assignedSymbol = ㅘ`를 부여하거나 Joker 하나만으로 ㄳ 전체를 표현하면 거절한다.
- replacement assignment가 C-22 ordinary Tile의 어떤 `allowedSymbols`에도 속하지 않으면 거절한다.
- 같은 symbol의 기존 Joker 두 개를 회수하면서 matching newly-used ordinary Tile을 하나만 사용하면 거절한다.
- matching ordinary Tile이 있어도 recovered Joker tileId가 final Board에서 사라지면 Tile conservation 위반으로 거절한다.

### Server validation implication

- before/after Joker의 logical placement와 assignment를 비교하고 recovered Joker의 canonical old symbol별 수량을 newly-used ordinary Tile의 final assigned symbol별 수량과 일대일로 소비해 검증한다.
- recovered Joker tileId가 final Board에 정확히 한 번 남는지 Tile conservation으로 확인하고, 새 rack Joker는 recovery matching 대상에서 제외한다.
- Joker의 source bag은 inventory conservation을 위해 보존하되 replacement authorization 조건으로 사용하지 않는다.

## C-16. Hangul·Unicode와 Dictionary policy

### Normative rule

- **OFFICIAL_BASE_RULE:** 사전에서 확인 가능한 낱말을 사용하며 공식 안내는 명사·동사·형용사·부사 등을 폭넓게 다룬다.
- **DIGITAL_MVP_POLICY:** dictionary lookup canonical form은 Unicode NFC normalized 완성형 Hangul string이다.
- **DIGITAL_MVP_POLICY:** 모든 final WordGroup은 서버 DictionaryProvider로 검증한다.
- **DIGITAL_MVP_POLICY:** 한 Game은 game:start 시 고정한 dictionaryVersion을 끝까지 사용한다.
- **DIGITAL_MVP_POLICY:** MVP 구현 단계는 versioned test dictionary를 사용한다. 이는 production 한국어 사전이라고 주장하지 않는다.
- **DIGITAL_MVP_POLICY:** provider unavailable/error는 TEMPORARILY_UNAVAILABLE 성격의 recoverable failure이며 canonical state를 바꾸지 않는다.
- **DIGITAL_MVP_POLICY:** 사전 확인 중 server turn deadline을 연장하거나 멈추지 않는다.
- **IMPLEMENTATION_INVARIANT:** pure composition layer는 `physical tileId + assignedSymbol + explicit syllable role/segmentation`을 C-23의 허용 sequence로 검증하고, 이를 logical Unicode choseong/jungseong/jongseong으로 바꾼 뒤 NFC 완성형 Hangul word를 만든다.
- **IMPLEMENTATION_INVARIANT:** 문서에서 쓰는 `ㄱ`, `ㅘ`, `ㄳ` 같은 Hangul Compatibility Jamo glyph를 단순 연결한 뒤 `String.prototype.normalize("NFC")`가 음절을 만들어 준다고 가정하지 않는다. Phase 8은 syllable role에 맞는 conjoining jamo 또는 동등한 명시적 조합 알고리즘을 사용한다.
- **IMPLEMENTATION_INVARIANT:** `ㅘ = ㅗ + ㅏ`, `ㄳ = ㄱ + ㅅ` 표기는 physical Tile component expansion이다. Unicode canonical decomposition을 뜻하지 않는다.
- **IMPLEMENTATION_INVARIANT:** browser 표시 문자열, client가 조합한 word 문자열 또는 단순 string concatenation을 규칙 결과로 신뢰하지 않는다.
- **IMPLEMENTATION_INVARIANT:** `DictionaryProvider`는 word-level input에 NFC normalization만 적용한다. trim, whitespace·punctuation 제거, 자모 조합 또는 최소 음절 수 판정은 수행하지 않는다.

### 정상 예

- 서버가 산출한 precomposed Hangul syllable과 canonically equivalent한 conjoining L/V/(T) sequence는 같은 최종 NFC lookup form을 갖는다.
- Game 도중 dictionary data가 배포돼도 진행 중 Game은 snapshot된 dictionaryVersion을 유지한다.

### 거절·edge case

- composition 결과가 완성형 Hangul word가 아니면 dictionary lookup 이전에 거절한다.
- physical component sequence가 허용돼도 choseong/jungseong/jongseong role에 맞지 않으면 거절한다.
- 고유명사, 방언, 신조어, 활용형의 exact inclusion은 production dataset 선택 전에는 확정하지 않는다.
- 공식 실물 규칙은 사전 확인 동안 시간을 멈추지만 디지털 MVP는 deadline을 멈추지 않는다.

### Server validation implication

- composition과 dictionary lookup은 server-side deterministic boundary로 둔다.
- client가 주장한 final word를 비교 기준으로 삼지 않고 서버가 placement와 segmentation으로 다시 계산한다.
- provider 장애와 “단어 없음”을 구분하되 내부 예외를 client에 노출하지 않는다.

### TEST_DICTIONARY_CANDIDATES — PHASE 9 FIXTURE APPROVED

아래 30개 단어는 Phase 9 deterministic test dictionary fixture로 승인되었다. version은 `test-dictionary-v1`이며, 이 목록은 production 사전의 범위나 품질을 의미하지 않는다. 이 절이 규범적 단어 목록이고 `apps/server/src/infrastructure/test-dictionary-provider.ts`의 readonly executable fixture가 이를 그대로 구현한다. 단어의 추가·삭제·변경에는 새 dictionaryVersion을 부여하며 기존 version을 재사용하지 않는다.

- 명사: 가방, 가위, 개구리, 고구마, 고양이, 구름, 나무, 나비, 다람쥐, 달걀, 도토리, 바다, 바나나, 사과, 사자, 수박, 시계, 안경, 연필, 우산, 인형, 자동차, 장갑, 학교
- 동사 기본형: 가다, 걷다, 달리다
- 형용사 기본형: 느리다, 하얗다
- 부사: 아주

## C-17. Game 종료, 점수와 stalemate

### Normative rule

- **OFFICIAL_BASE_RULE:** accepted Submit 뒤 active Player rack이 0개면 즉시 Game을 종료하고 그 Player가 winner다.
- **OFFICIAL_BASE_RULE:** 한 Game의 전체 제한시간은 25분이다.
- **OFFICIAL_BASE_RULE:** 종료 시 remaining non-Joker Tile은 각 -1점, remaining Joker는 각 -30점이다.
- **OFFICIAL_BASE_RULE:** rack을 비운 winner는 다른 Player들의 음수 penalty 절댓값 합계를 positive score로 받는다.
- **DIGITAL_MVP_POLICY:** gameDeadlineAt = gameStartedAt + 25분이며 deadline 도달 시 진행 중 TurnDraft를 폐기하고 Game을 종료한다.
- **DIGITAL_MVP_POLICY:** 25분 종료 ranking은 remaining rack Tile 수가 적은 순, 동률이면 penaltyCost가 낮은 순, 그래도 같으면 공동 순위다. penaltyCost는 remaining non-Joker 수 + 30 × remaining Joker 수인 non-negative 값이다.
- **DIGITAL_MVP_POLICY:** 두 bag이 모두 empty여도 Board move가 가능하면 Game은 계속된다.
- **DIGITAL_MVP_POLICY:** 두 bag이 empty인 상태에서 모든 active non-forfeit Player가 연속으로 no-draw turn end를 한 번씩 완료하면 stalemate로 FINISHED한다.
- **DIGITAL_MVP_POLICY:** accepted Board move 또는 active Player 집합 변경은 진행 중 stalemate 연속 기록을 reset한다.
- **DIGITAL_MVP_POLICY:** stalemate ranking은 penaltyCost가 낮은 순이며 동률은 공동 순위다.
- **DIGITAL_MVP_POLICY:** rack-empty 종료에서는 winner가 다른 Player penalty 절댓값 합계의 positive score를 얻는다. time cap·stalemate 종료에서는 각 Player의 remaining rack penalty score를 결과로 기록한다.
- **DIGITAL_MVP_POLICY:** 장기 match나 여러 Game의 누적 점수는 MVP 범위가 아니다.

### 정상 예

- B의 일반 Tile 4개는 -4, C의 일반 Tile 2개와 Joker 1개는 -32이고 A가 rack을 비우면 A는 +36이다.
- 25분 종료 때 P1은 Tile 3개와 penaltyCost 3, P2는 Tile 3개와 Joker 포함 penaltyCost 32라면 P1이 앞선다.

### 거절·edge case

- 한 bag만 비었다는 이유로 Game을 끝내지 않는다.
- 두 bag이 비어도 모든 active Player가 한 차례씩 no-draw 종료하기 전에는 stalemate가 아니다.
- 25분 deadline 뒤 도착한 Submit으로 rack-empty 승리를 만들 수 없다.
- forfeit로 active Player 한 명만 남아 끝난 Game의 winner는 확정하지만, 그 종료 원인의 positive score 계산은 공식 근거와 사용자 결정이 없어 아직 확정하지 않는다.

### Server validation implication

- Game 종료는 FINISHED phase, result/ranking과 active timer 취소를 하나의 canonical mutation으로 commit한다.
- 종료 원인별 scoring path를 명시적으로 구분한다.

## C-18. PLAYING 중 disconnect와 explicit leave

### Normative rule

- **DIGITAL_MVP_POLICY:** network disconnect는 Game을 pause하지 않고 server turn timer는 계속 진행한다.
- **DIGITAL_MVP_POLICY:** disconnected Player는 forfeit 전까지 turnOrder에 남는다.
- **DIGITAL_MVP_POLICY:** 그 Player의 turn이 timeout되면 C-14의 일반 timeout penalty를 적용한다.
- **DIGITAL_MVP_POLICY:** reconnect하면 동일 playerId, rack, initial meld 상태와 현재 Game state로 복귀한다.
- **DIGITAL_MVP_POLICY:** Player가 OFFLINE 상태에서 자신의 turn을 연속 2번 timeout하면 두 번째 timeout penalty 처리 뒤 forfeit한다.
- **DIGITAL_MVP_POLICY:** 성공적으로 resume해 CONNECTED가 되면 offline-timeout 연속 횟수를 0으로 reset한다. CONNECTED 상태의 timeout은 이 forfeit 횟수에 포함하지 않는다.
- **DIGITAL_MVP_POLICY:** forfeit Player는 active rotation에서 제외하되 rack과 result metadata를 Game 종료까지 유지한다.
- **DIGITAL_MVP_POLICY:** active non-forfeit Player가 1명만 남으면 그 Player를 winner로 하고 Game을 종료한다.
- **DIGITAL_MVP_POLICY:** PLAYING 중 explicit leave는 즉시 forfeit이며 동일한 결과 보존 규칙을 적용한다.

### 정상 예

- OFFLINE P2가 첫 자기 turn timeout 후에도 남아 있고, resume 없이 다음 자기 turn도 timeout하면 penalty 후 forfeit한다.
- 첫 offline timeout 뒤 P2가 resume하면 streak가 reset되고 이후 한 번의 offline timeout만으로는 forfeit하지 않는다.

### 거절·edge case

- disconnect 즉시 Player를 삭제하거나 forfeit하지 않는다.
- stale replaced socket disconnect는 현재 primary Player의 presence나 streak를 바꾸지 않는다.
- explicit leave와 일시적 transport disconnect를 같은 command로 취급하지 않는다.

### Server validation implication

- presence는 ConnectionRegistry projection state이고 forfeit/streak는 canonical Game state다.
- timeout 시점의 authoritative presence와 current turnId를 직렬화 경계 안에서 다시 확인한다.

## C-19. Host policy

### Normative rule

- **DIGITAL_MVP_POLICY:** Host는 Lobby 운영 role이며 PLAYING 중 규칙을 우회할 권한이 없다.
- **DIGITAL_MVP_POLICY:** LOBBY에서 Host가 explicit leave하면 남아 있는 CONNECTED Player 중 joinOrder가 가장 낮은 Player에게 즉시 Host를 이전한다.
- **DIGITAL_MVP_POLICY:** LOBBY에서 Host disconnect만으로 즉시 이전하지 않고 60초 동안 resume grace를 둔다.
- **DIGITAL_MVP_POLICY:** 60초 동안 계속 OFFLINE이면 당시 CONNECTED Player 중 joinOrder가 가장 낮은 Player에게 Host를 이전한다.
- **DIGITAL_MVP_POLICY:** 이전 대상이 없으면 기존 Host identity를 유지하고 Room cleanup policy를 기다린다. grace가 이미 지난 뒤 eligible Player가 생기면 Host 상태를 재평가해 즉시 이전한다.
- **DIGITAL_MVP_POLICY:** 한번 Host가 이전되면 이전 Host가 reconnect해도 자동으로 Host를 돌려주지 않는다.
- **DIGITAL_MVP_POLICY:** PLAYING에서 Host disconnect는 특별한 gameplay 효과가 없고 explicit leave는 다른 Player와 동일하게 forfeit다.
- **DIGITAL_MVP_POLICY:** FINISHED의 Host role은 result와 ranking에 영향을 주지 않는다.

### 정상 예

- Host가 Lobby에서 나가고 joinOrder 1과 2가 연결돼 있으면 joinOrder 1이 Host가 된다.
- Host가 40초 만에 resume하면 Host를 유지한다.

### 거절·edge case

- OFFLINE Player를 Host 승계 대상으로 선택하지 않는다.
- stale socket disconnect로 Host grace timer를 다시 시작하지 않는다.
- 60초 뒤 승계된 Host를 기존 Host reconnect만으로 되돌리지 않는다.

### Server validation implication

- Host grace는 server Clock와 current-primary presence를 사용한다.
- hostPlayerId 변경은 canonical Room mutation이므로 roomRevision/storageRevision을 정상적으로 갱신한다.

## C-20. Gameplay visibility

### Normative rule

- **DIGITAL_MVP_POLICY:** 본인에게 자신의 rack Tile 상세, initialMeldCompleted, connection 상태와 forfeit 여부를 공개한다.
- **DIGITAL_MVP_POLICY:** 모든 Player에게 Board 전체, activePlayerId, turn deadline, immutable turnOrder, 각 Player nickname·Host·presence·remaining rack Tile 수·initial meld 완료 여부, Game phase와 result/ranking을 공개한다.
- **DIGITAL_MVP_POLICY:** consonant remaining count와 vowel remaining count를 모든 Player에게 공개한다.
- **DIGITAL_MVP_POLICY:** 상대 rack Tile 상세, bag Tile 순서, future draw Tile, session credential과 server random state는 공개하지 않는다.
- **IMPLEMENTATION_INVARIANT:** 모든 snapshot은 Player별 projection으로 생성하며 canonical GameState를 그대로 broadcast하지 않는다.

### 정상 예

- P1은 P2 rack에 8개가 남았다는 사실은 보지만 어떤 자모인지는 보지 못한다.

### 거절·edge case

- Room 전체에 한 개의 동일한 canonical snapshot을 broadcast하지 않는다.
- draw 전에 다음 tileId나 symbol을 공개하지 않는다.

### Server validation implication

- PublicPlayerGameView와 PrivatePlayerGameView 경계를 분리한다.
- serialization test로 credential, random state, 상대 rack 상세와 server-only revision 누출을 막는다.

## C-21. Versioned RulesConfig snapshot

### Normative rule

- **DIGITAL_MVP_POLICY:** game:start는 해당 Game이 끝까지 사용할 immutable, versioned RulesConfig snapshot을 저장해야 한다.
- **DIGITAL_MVP_POLICY:** 최소 항목은 rulesVersion, dictionaryVersion, turnDurationMs, gameDurationMs, initialRack.consonants, initialRack.vowels, initialMeld.minimumTileCount, initialMeld.minimumWordSyllables, timeoutPenaltyTileCount, maxPlayers, jokerRulesVersion/reference와 tileInventoryVersion이다.
- **DIGITAL_MVP_POLICY:** 확정 값은 turnDurationMs 60000, gameDurationMs 1500000, initialRack 7/7, initialMeld minimumTileCount 6, minimumWordSyllables 2, timeoutPenaltyTileCount 3, maxPlayers 4다.
- **DIGITAL_MVP_POLICY:** 최초 exact inventory document version은 `hangul-tile-inventory-v1`이며 C-22의 physical types, quantity, allowedSymbols와 bag affiliation 전체를 식별한다.
- **IMPLEMENTATION_INVARIANT:** Game 도중 배포 설정이 바뀌어도 snapshot된 RulesConfig와 dictionaryVersion을 변경하지 않는다.
- **IMPLEMENTATION_INVARIANT:** C-22의 구성 요소 하나라도 바꾸면 같은 tileInventoryVersion을 재사용하지 않는다.

### 정상 예

- 서버 배포 뒤 새 Game은 새 rulesVersion을 사용할 수 있지만 이미 PLAYING인 Game은 시작 당시 snapshot을 유지한다.
- `hangul-tile-inventory-v1` Game은 C-22와 다른 quantity나 allowedSymbols를 섞지 않는다.

### 거절·edge case

- inventory를 바꾸고도 `hangul-tile-inventory-v1`을 유지하면 거절한다.
- client가 RulesConfig 값을 바꾸어 Submit해도 서버 snapshot을 대체하지 않는다.

### Server validation implication

- 모든 gameplay 판정은 Room의 live global config가 아니라 Game snapshot을 참조한다.
- Phase 11의 `createDefaultRulesConfig()`는 `hangul-rummikub-rules-v1`, `test-dictionary-v1`, `hangul-tile-inventory-v1`, `hangul-joker-rules-v1`과 위 수치를 새 Game에 복제·동결한다.
- repository는 반환값과 저장값 사이에 nested collection을 공유하지 않도록 RulesConfig와 GameState를 명시적으로 복제한다.

## C-22. Canonical physical Tile inventory

이 표가 repository 안의 exact inventory 수량에 대한 유일한 canonical table이다. `Quantity`는 physical family 전체 수량이며 `Allowed Symbols` 각각의 수량이 아니다. Phase 11의 `CANONICAL_TILE_INVENTORY_V1`은 이 표의 `Physical Type`, bag, quantity와 allowed symbol을 동일한 identifier로 구현한다.

| Physical Type | Bag | Quantity | Allowed Symbols | Rotation/Assignment | Source |
| --- | --- | ---: | --- | --- | --- |
| `GIYEOK_NIEUN_ROTATION` | CONSONANT | 12 | ㄱ, ㄴ | 한 physical Tile을 회전해 둘 중 하나로 사용 | S-03 2쪽, S-04 |
| `DIGEUT` | CONSONANT | 6 | ㄷ | dedicated, 고정 | S-04 |
| `RIEUL` | CONSONANT | 6 | ㄹ | dedicated, 고정 | S-04 |
| `MIEUM` | CONSONANT | 6 | ㅁ | dedicated, 고정 | S-04 |
| `BIEUP` | CONSONANT | 6 | ㅂ | dedicated, 고정 | S-04 |
| `SIOT` | CONSONANT | 6 | ㅅ | dedicated, 고정 | S-04 |
| `IEUNG` | CONSONANT | 6 | ㅇ | dedicated, 고정 | S-04 |
| `JIEUT` | CONSONANT | 6 | ㅈ | dedicated, 고정 | S-04 |
| `CHIEUT` | CONSONANT | 6 | ㅊ | dedicated, 고정 | S-04 |
| `KIEUK` | CONSONANT | 6 | ㅋ | dedicated, 고정 | S-04 |
| `TIEUT` | CONSONANT | 6 | ㅌ | dedicated, 고정 | S-04 |
| `PIEUP` | CONSONANT | 6 | ㅍ | dedicated, 고정 | S-04 |
| `HIEUH` | CONSONANT | 6 | ㅎ | dedicated, 고정 | S-04 |
| `SSANG_BIEUP` | CONSONANT | 2 | ㅃ | dedicated, 고정 | S-04 |
| `SSANG_JIEUT` | CONSONANT | 2 | ㅉ | dedicated, 고정 | S-04 |
| `SSANG_DIGEUT` | CONSONANT | 2 | ㄸ | dedicated, 고정 | S-04 |
| `SSANG_GIYEOK` | CONSONANT | 2 | ㄲ | dedicated, 고정 | S-04 |
| `SSANG_SIOT` | CONSONANT | 2 | ㅆ | dedicated, 고정 | S-04 |
| `A_ROTATION` | VOWEL | 20 | ㅏ, ㅓ, ㅗ, ㅜ | 한 physical Tile을 회전해 넷 중 하나로 사용 | S-03 2쪽, S-04 |
| `YA_ROTATION` | VOWEL | 20 | ㅑ, ㅕ, ㅛ, ㅠ | 한 physical Tile을 회전해 넷 중 하나로 사용 | S-03 2쪽, S-04 |
| `I_EU_ROTATION` | VOWEL | 12 | ㅣ, ㅡ | 한 physical Tile을 회전해 둘 중 하나로 사용 | S-03 2쪽, S-04 |
| `AE` | VOWEL | 2 | ㅐ | dedicated, 고정 | S-04 |
| `E` | VOWEL | 2 | ㅔ | dedicated, 고정 | S-04 |
| `YAE` | VOWEL | 2 | ㅒ | dedicated, 고정 | S-04 |
| `YE` | VOWEL | 2 | ㅖ | dedicated, 고정 | S-04 |
| `JOKER` | CONSONANT | 1 | C-15 one-position universe | source bag은 conservation metadata이며 replacement를 제한하지 않음 | 수량·bag: S-03 1쪽, S-04; 대체: S-03 3쪽 + C-15 DIGITAL_MVP_POLICY |
| `JOKER` | VOWEL | 1 | C-15 one-position universe | source bag은 conservation metadata이며 replacement를 제한하지 않음 | 수량·bag: S-03 1쪽, S-04; 대체: S-03 3쪽 + C-15 DIGITAL_MVP_POLICY |

### Inventory 합계

- CONSONANT ordinary: `12 + (12 × 6) + (5 × 2) = 94`
- VOWEL ordinary: `20 + 20 + 12 + (4 × 2) = 60`
- JOKER: `1 + 1 = 2`
- GRAND TOTAL: `94 + 60 + 2 = 156`
- physical bag totals including affiliated Joker: CONSONANT `95`, VOWEL `61`

### Normative rule

- **OFFICIAL_BASE_RULE:** 표의 physical face/family 사실, quantity, 허용 회전과 bag별 Joker 구성이 공식 inventory다.
- **DIGITAL_MVP_POLICY:** `Physical Type`의 영문 이름은 공식 제품 명칭이 아니라 이 프로젝트의 문서 식별자다. 한 inventory entry는 `(Physical Type, Bag)`으로 구분하므로 기능상 같은 `JOKER`가 bag별 한 행씩 존재한다.
- **DIGITAL_MVP_POLICY:** 이 exact 구성의 inventory version은 `hangul-tile-inventory-v1`이다.
- **IMPLEMENTATION_INVARIANT:** 각 quantity만큼 서로 다른 tileId를 가진 physical instance를 생성하며 `physicalType`, source `bagKind`와 tileId는 Game 동안 바꾸지 않는다.

### 정상 예

- `A_ROTATION` instance 하나를 한 placement에서 `assignedSymbol = ㅗ`로 사용할 수 있다.
- `GIYEOK_NIEUN_ROTATION` 12개는 각각 독립 tileId를 갖고 각 placement에서 ㄱ 또는 ㄴ 중 하나로 해석된다.

모음 physical mapping별 compact 예는 다음과 같다.

| Physical Type | 정상 assignment | 거절 assignment |
| --- | --- | --- |
| `A_ROTATION` | ㅗ | ㅑ |
| `YA_ROTATION` | ㅠ | ㅏ |
| `I_EU_ROTATION` | ㅡ | ㅗ |
| `AE` | ㅐ | ㅔ |
| `E` | ㅔ | ㅐ |
| `YAE` | ㅒ | ㅖ |
| `YE` | ㅖ | ㅒ |

### 거절·edge case

- 위 예시 표의 거절 assignment처럼 physical definition의 `allowedSymbols` 밖 값을 부여하면 거절한다.
- `GIYEOK_NIEUN_ROTATION` 12개를 ㄱ 12개와 ㄴ 12개, 총 24개로 생성하지 않는다.

### Server validation implication

- Tile factory는 version table의 행별 quantity와 전체 합계를 검증하고 중복 tileId를 만들지 않는다.
- source bag affiliation은 draw/conservation에 사용하며 display rotation angle은 canonical state에 사용하지 않는다.

## C-23. Physical Tile과 assignedSymbol 및 음절 표현

### Normative rule

- **DIGITAL_MVP_POLICY:** `PhysicalTileDefinition`은 최소 `physicalType`, `sourceBag`, `quantity`, `kind`와 ordinary Tile의 `allowedSymbols` 의미를 갖는다.
- **IMPLEMENTATION_INVARIANT:** physical Tile identity와 placement interpretation을 분리한다. tileId는 `assignedSymbol`이나 rotation angle을 encode하지 않는다.
- **IMPLEMENTATION_INVARIANT:** `assignedSymbol`은 TurnDraft 또는 Board placement에만 존재하며 서버는 ordinary Tile에서 `assignedSymbol ∈ allowedSymbols`를 검증한다. CSS degree는 `assignedSymbol`에서 파생하는 presentation metadata일 뿐 authority가 아니다.
- **DIGITAL_MVP_POLICY:** 쌍자음 ㄲ, ㄸ, ㅃ, ㅆ, ㅉ은 dedicated physical Tile 하나로만 표현한다. ordinary 자음 두 개를 합쳐 쌍자음을 만들 수 없다.
- **DIGITAL_MVP_POLICY:** 하나의 syllable은 required choseong, required jungseong, optional jongseong을 명시적으로 구분한다. client는 각 role이 사용하는 ordered physical tileId와 `assignedSymbol`을 제출해야 한다.
- **IMPLEMENTATION_INVARIANT:** 하나의 physical tileId는 bag, 하나의 rack 또는 accepted Board의 정확히 한 placement에만 속한다. 두 자리 복합모음과 겹받침은 서로 다른 physical tileId 두 개를 소비하고 dedicated 쌍자음은 하나를 소비한다.

### Modern Hangul role universe

- choseong 19: `ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ`; modern conjoining L range U+1100..U+1112
- jungseong 21: `ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅗ ㅘ ㅙ ㅚ ㅛ ㅜ ㅝ ㅞ ㅟ ㅠ ㅡ ㅢ ㅣ`; modern conjoining V range U+1161..U+1175
- non-empty single jongseong 16: `ㄱ ㄲ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅆ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ`
- cluster jongseong 11: `ㄳ ㄵ ㄶ ㄺ ㄻ ㄼ ㄽ ㄾ ㄿ ㅀ ㅄ`
- single과 cluster를 합친 non-empty modern conjoining T range는 U+11A8..U+11C2의 27개다. Unicode의 `TCount = 28`은 no-final index 0과 실제 T 27개를 함께 센 값이며 no-final은 자모나 Tile symbol이 아니다.
- ㄸ, ㅃ, ㅉ은 modern choseong에는 있지만 modern jongseong에는 없다. jongseong이 없는 음절도 valid하다.

위 repertoire는 official inventory의 physical quantity가 아니라 Phase 8 조합 입력을 제한하는 Unicode modern Hangul 범위다. U-01과 U-02를 근거로 한 **IMPLEMENTATION_INVARIANT**다.

### Jungseong physical component mapping

| Logical jungseong | Required ordered physical assignedSymbols | Source type |
| --- | --- | --- |
| ㅏ, ㅓ, ㅗ, ㅜ | 같은 symbol 하나 (`A_ROTATION`) | OFFICIAL_BASE_RULE |
| ㅑ, ㅕ, ㅛ, ㅠ | 같은 symbol 하나 (`YA_ROTATION`) | OFFICIAL_BASE_RULE |
| ㅣ, ㅡ | 같은 symbol 하나 (`I_EU_ROTATION`) | OFFICIAL_BASE_RULE |
| ㅐ, ㅔ, ㅒ, ㅖ | 같은 symbol의 dedicated Tile 하나 | OFFICIAL_BASE_RULE |
| ㅘ | ㅗ + ㅏ | DIGITAL_MVP_POLICY; S-03 4쪽 official example와 일치 |
| ㅙ | ㅗ + ㅐ | DIGITAL_MVP_POLICY |
| ㅚ | ㅗ + ㅣ | DIGITAL_MVP_POLICY |
| ㅝ | ㅜ + ㅓ | DIGITAL_MVP_POLICY |
| ㅞ | ㅜ + ㅔ | DIGITAL_MVP_POLICY |
| ㅟ | ㅜ + ㅣ | DIGITAL_MVP_POLICY |
| ㅢ | ㅡ + ㅣ | DIGITAL_MVP_POLICY |

Dedicated Tile이 있는 ㅐ, ㅔ, ㅒ, ㅖ는 arbitrary component 합성으로 대신하지 않는다. 예를 들어 `ㅑ + ㅣ`을 ㅒ로 인정하지 않는다.

### Jongseong cluster physical component mapping

| Logical jongseong | Required ordered physical assignedSymbols |
| --- | --- |
| ㄳ | ㄱ + ㅅ |
| ㄵ | ㄴ + ㅈ |
| ㄶ | ㄴ + ㅎ |
| ㄺ | ㄹ + ㄱ |
| ㄻ | ㄹ + ㅁ |
| ㄼ | ㄹ + ㅂ |
| ㄽ | ㄹ + ㅅ |
| ㄾ | ㄹ + ㅌ |
| ㄿ | ㄹ + ㅍ |
| ㅀ | ㄹ + ㅎ |
| ㅄ | ㅂ + ㅅ |

이 11개 exact two-position mapping은 **DIGITAL_MVP_POLICY**다. S-03 3쪽의 ㄺ official example, two-set physical inventory와 U-01/U-02의 modern jongseong repertoire에 맞춘다. 임의의 두 자음을 cluster로 인정하지 않는다.

### 정상 예

- `가` syllable은 choseong `ㄱ` Tile 한 자리와 jungseong `ㅏ` Tile 한 자리를 명시한다.
- `한`은 `ㅎ` / `ㅏ` / single jongseong `ㄴ`, `글`은 `ㄱ` / `ㅡ` / single jongseong `ㄹ`로 분절한다.
- ㅘ와 ㄳ은 각각 서로 다른 physical Tile 두 개를 소비하고, ㄲ은 dedicated Tile 한 개를 소비한다.

### 거절·edge case

- 동일 tileId를 한 syllable의 두 component나 여러 syllable에 재사용하면 거절한다.
- 두 ordinary ㄱ Tile을 choseong ㄲ로, `ㅑ + ㅣ`을 jungseong ㅒ로, ㄸ을 jongseong으로 해석하면 거절한다.
- client가 syllable boundary 없이 flat Tile sequence와 완성 word 문자열만 보내 서버가 경계를 추측하게 하지 않는다.

### Server validation implication

- Phase 8 입력은 `tileId + assignedSymbol` component와 explicit syllable roles를 받아 exact component 형식, input 내부 tileId 중복과 role universe를 검증한다. `physicalType`별 `allowedSymbols` 적합성, Game 내 Tile 존재·소유권과 전체 Board conservation 판정은 Phase 10 inventory/RuleEngine 책임이다.
- mapping은 role-sensitive해야 한다. 같은 assigned glyph ㄱ도 choseong role에서는 U+1100 `ᄀ`, jongseong role에서는 U+11A8 `ᆨ`으로 바꾼다. Compatibility Jamo의 NFKC 변환에 role 결정을 맡기지 않는다.
- two-position physical component는 Unicode composition 전에 하나의 logical conjoining jamo로 collapse한다. 예를 들어 `ㅗ + ㅏ`는 V U+116A `ᅪ`, `ㄱ + ㅅ`은 T U+11AA `ᆪ`가 된 뒤 하나의 modern conjoining L, V, optional T를 Hangul syllable로 조합한다.
- 조합 결과를 NFC normalize해 완성형 word를 산출한다.
- client가 함께 보낸 display word가 있더라도 서버 계산 결과를 대체하지 못한다.

## C-24. Game start 연결 조건과 첫 Turn 번호

### Normative rule

- **DIGITAL_MVP_POLICY:** `game:start`는 Room phase가 `LOBBY`이고 등록 Player가 2~4명이며 모든 등록 Player의 authoritative presence가 `CONNECTED`일 때만 허용한다.
- **DIGITAL_MVP_POLICY:** 시작 요청 actor는 현재 Host여야 한다. Ready 기능은 사용하지 않으며 시작 순간 CONNECTED인 일부 Player만 선별해 Game 참가자로 snapshot하지 않는다.
- **IMPLEMENTATION_INVARIANT:** transport는 요청 payload가 아니라 current-primary socket binding에서 `roomId`와 `actorPlayerId`를 도출한다. 이 binding의 유효성은 live Room/Game/idempotency state를 바꾸기 직전의 UnitOfWork precondition에서도 다시 확인하며, 교체되었거나 인증되지 않은 socket은 시작 command 권한이 없다.
- **IMPLEMENTATION_INVARIANT (digital implementation semantics):** server-random `turnOrder`의 첫 Player가 맡는 첫 Turn의 `turnNumber`는 `1`이다.
- **IMPLEMENTATION_INVARIANT:** `game:start` 성공은 Room phase, canonical GameState와 accepted idempotency result를 하나의 Room UnitOfWork에서 commit한다.

### 정상 예

- Host와 다른 Player 한 명이 모두 CONNECTED인 2인 Lobby에서 Host의 current-primary socket이 최신 `roomRevision`으로 요청하면 시작 조건을 충족한다.
- 시작 시 `turnOrder = [P2, P1]`이면 첫 Turn은 `activePlayerId = P2`, `turnNumber = 1`이다.
- 성공 acknowledgement가 유실되어 같은 Room/Player scope, `requestId`, payload fingerprint로 재전송하면 새 Tile이나 Turn을 만들지 않고 기존 non-secret 결과를 replay한다.

### 거절·edge case

- 한 명뿐인 Lobby의 시작은 `NOT_ENOUGH_PLAYERS`로 거절한다.
- 등록 Player 중 한 명이라도 OFFLINE이면 `PLAYERS_NOT_CONNECTED`로 거절하며 그 Player를 제외하고 시작하지 않는다.
- non-Host 요청은 `HOST_ONLY`, `LOBBY`가 아닌 Room은 `INVALID_PHASE`, 오래된 `expectedRoomRevision`은 `STALE_ROOM_REVISION`으로 거절한다.
- 같은 `requestId`를 다른 fingerprint에 재사용하면 `REQUEST_ID_REUSED`로 거절하고, 이미 시작된 Room에 새 `requestId`로 다시 요청하면 `INVALID_PHASE`로 거절한다.

### Server validation implication

- `GameStartService`는 Room별 직렬화 경계 안에서 최신 Room과 `PlayerPresenceReader`를 다시 읽어 phase, Host, 인원, revision과 모든 Player의 CONNECTED 상태를 검증한다. transport가 캡처한 current-primary authorization은 candidate와 idempotency record를 만든 뒤 live state를 교체하는 바로 직전에 동기 precondition으로 재검증한다.
- 거절된 요청은 Room phase, Room/Game/storage revision, Tile, rack, bag과 idempotency state를 변경하지 않는다.
- 성공하면 exact inventory 156개, bag별 shuffle·7/7 배분, immutable turnOrder와 첫 Turn을 생성해 `roomRevision + 1`, 새 `gameRevision = 0`, `storageRevision + 1`을 원자적으로 반영한다.
- `startedAt`은 server Clock 값이고 첫 `deadlineAt = startedAt + 60_000`, `gameDeadlineAt = startedAt + 1_500_000`이다. Phase 11은 deadline을 저장하지만 timeout을 실행하지 않는다.

---

# PHASE_7_GATE_RESULT

- **Phase 7A:** COMPLETE
- **Phase 7B:** COMPLETE (2026-09-03)
- **Phase 7 overall:** COMPLETE
- **Phase 8 composition implementation:** COMPLETE (2026-09-03)
- **Phase 9 test dictionary implementation:** COMPLETE (2026-09-03)
- **Phase 10 Board/RuleEngine implementation:** COMPLETE (2026-09-03)
- **Phase 11 Game start/state projection implementation:** COMPLETE (2026-09-03)

공식 exact consonant/vowel inventory, 두 Joker의 physical bag handling, rotation family, physical identity와 assignedSymbol 분리, 쌍자음·복합모음·겹받침 표현, Joker one-position replacement, 초기 7/7 draw semantics, 전체 156개 합계와 Phase 8 input/output semantics를 모두 확정했다. Tile representation에 관한 Phase 7B 미확정 항목은 없다.

`PHASE_7A_CORRECTION`: 실질 수정 없음. 공식 PDF는 Phase 7A의 bag depletion, 25분 종료, scoring과 Joker gameplay 방향에 충돌하지 않았다. C-02의 “consonant 7 + vowel 7”을 bag별 7회 draw이고 소속 Joker가 그 안에 포함된다는 뜻으로 명확히 했을 뿐이다.

---

# TO_BE_CONFIRMED

현재 공식 근거나 제품 정책이 충분하지 않아 남아 있는 항목이다. 관련 구현 Phase 전에 별도 결정한다.

## TBC-C. Production dictionary dataset

- 실제 dataset/provider, license와 release/version 관리
- 고유명사, 방언, 신조어, 옛말, 활용형과 띄어쓰기 표현의 exact inclusion
- upstream data 변경 시 기존 dictionaryVersion 재현 방법
- Phase 9에서는 `test-dictionary-v1` fixture/adapter만 구현했다. production provider를 승인하는 별도 작업 전에 위 항목을 확정한다.

## TBC-D. Lobby의 비-Host explicit leave와 Room retention

- 비-Host가 Lobby를 나갈 때 Player/session을 제거하는 정확한 mutation
- 빈 Room cleanup 지연, FINISHED retention, roomCode 재사용 정책

## TBC-E. 운영 한도

- Room/IP별 command rate limit
- 최대 serialized Submit 크기와 WordGroup·Tile 수 방어 한도
- observability와 abuse 대응 정책

## TBC-F. Rematch와 장기 match

- FINISHED Room에서 새 Game을 시작하는 rematch
- 여러 Game 누적 점수와 match winner

## TBC-G. Forfeit 종료의 positive score

- forfeit로 active non-forfeit Player 한 명만 남아 종료될 때 winner의 positive score 계산
- forfeited Player와 이미 forfeit하지 않은 Player의 remaining rack penalty를 winner score에 어떤 범위로 합산할지
- 이 결정은 Phase 15의 forfeit result 구현 전에 확정한다.

---

# 기존 TBC 추적

| 기존 항목 | Phase 7 결과 |
| --- | --- |
| TBC-01 Tile inventory | C-22 canonical exact table과 `hangul-tile-inventory-v1`으로 해소 |
| TBC-02 시작 rack/Joker | C-02에서 bag별 7회 draw와 bag 소속 Joker 포함 의미로 해소 |
| TBC-03 Hangul composition | C-16과 C-23에서 physical component, role, logical jamo, NFC 경계로 해소 |
| TBC-04 낱말 길이 | 최소 2음절을 C-03에 확정 |
| TBC-05 initial meld | C-05에 확정 |
| TBC-06 Joker | C-15에서 exact one-position symbol universe, granularity와 bag affiliation으로 해소 |
| TBC-07 rearrangement | C-06에 확정 |
| TBC-08 draw/pass | C-08에 확정 |
| TBC-09 turn 제한시간/timeout | C-14에 확정 |
| TBC-10 disconnect/leave | PLAYING 정책은 C-18, Host 정책은 C-19 확정; Lobby 비-Host leave는 TBC-D |
| TBC-11 Host succession | C-19에 확정 |
| TBC-12 승리/점수/stalemate | rack-empty/time-cap/stalemate는 C-17에 확정, forfeit 종료 positive score는 TBC-G |
| TBC-13 dictionary | deterministic MVP 방향은 C-16 확정, production dataset은 TBC-C |

## 다음 결정 절차

1. Phase 7 gate, Phase 8 Hangul composition, Phase 9 test dictionary, Phase 10 Board/RuleEngine과 Phase 11 Game start/state projection 구현은 완료되었다.
2. 다음 작업은 Roadmap Phase 12의 Client TurnDraft다.
3. Phase 11은 Game 시작 상태와 첫 deadline을 만들지만 TurnDraft, Submit, draw, timeout 실행, score와 종료는 구현하지 않았다.
