# GEM_CARD IP / Product-design Gate

> 상태: `P10 FIRST PASS / AWAITING_RULE_DECISIONS / REVIEW_BEFORE_RELEASE`
> 범위: `GEM_CARD`의 제품 정체성, 표현물, asset, 규칙 문구, balance/data 및 공개 출시 전 검토 경계
> 중요: **NOT LEGAL ADVICE — 이 문서는 법률 자문이나 권리 비침해 판단이 아니다.**

## 1. 목적

이 문서는 `GEM_CARD`를 독립적인 제품으로 설계하고 구현하는 동안 불필요한 IP·브랜드 혼동 위험을 줄이기 위한 개발 정책이다. 일반적인 게임 mechanic이나 idea를 독립적으로 설계할 수 있다는 전제와, title·logo·artwork·문구·고유 용어·data compilation·visual presentation 같은 구체적 표현을 복제하지 않는다는 원칙을 분리한다.

이 문서는 다음을 하지 않는다.

- 특정 제3자 권리의 존재·범위·유효성 또는 침해 여부를 판단하지 않는다.
- 저작권, 상표, trade dress, 특허, 퍼블리시티권, 계약 또는 license의 법률 결론을 내리지 않는다.
- 특정 제3자 제품이나 asset을 조사·비교·승인하지 않는다.
- 미확정 `GEM_CARD` 규칙, 수치, 카드 dataset 또는 public title을 확정하지 않는다.
- 어떤 외부 자료도 사용 가능하다고 추정하지 않는다.

## 2. 제품 정체성과 naming 정책

### 2.1 내부 식별자

`GEM_CARD`는 protocol, persistence, registry, telemetry와 source code에서 사용할 중립적인 내부 식별자 후보다. P10에서는 runtime `GameType`에 추가하지 않으며, 후속 구현 gate가 열릴 때까지 문서상의 식별자로만 사용한다.

내부 식별자에는 다음을 결합하지 않는다.

- 특정 상용 제품의 title, 약칭 또는 혼동 가능한 변형
- 제3자의 company·series·character·world 명칭
- 공식 asset이나 고유 기능 이름을 연상시키기 위한 표현

### 2.2 공개 명칭

`보석 카드 게임`은 규칙 논의와 UI 초안을 위한 설명적 working name이다. 공개 출시 명칭으로 확정된 것이 아니다. 최종 public title은 다음 절차를 통과해야 한다.

1. 독립적인 후보를 만든다.
2. 기존 제품과의 혼동 가능성을 product/brand 관점에서 검토한다.
3. 필요한 시장과 관할에 대해 qualified legal review 여부를 결정한다.
4. 승인된 이름만 UI, store metadata, domain, social account와 marketing material에 적용한다.

이 검토가 끝날 때까지 정책은 `NEUTRAL_NAMING / REVIEW_BEFORE_RELEASE`다.

## 3. 정책 표기

| Policy | 개발 의미 |
| --- | --- |
| `ORIGINAL_ONLY` | 프로젝트가 독립적으로 만든 표현·design·dataset을 사용한다. 제3자 자료를 사용한다면 명시적인 적법한 license 또는 public-domain/compatible-license 근거와 기록이 있어야 한다. |
| `NEUTRAL_NAMING` | 내부 ID와 working name은 설명적이고 중립적으로 유지하며 특정 상용 제품과의 연상을 의도하지 않는다. |
| `DO_NOT_COPY` | 제3자의 구체적 표현, asset, 문구, 고유 명칭, 전체 data table 또는 식별 가능한 visual presentation을 source로 복제하거나 close adaptation하지 않는다. 이는 보수적인 개발 금지선이며 법적 결론은 아니다. |
| `REVIEW_BEFORE_RELEASE` | 공개 배포·marketing·store 등록 전에 provenance, license, naming, visual identity와 필요한 법률 검토를 완료한다. |

`ORIGINAL_ONLY`는 “인터넷에서 찾은 자료를 약간 수정하면 original”이라는 뜻이 아니다. `DO_NOT_COPY`는 binary 법률 판정이 아니라 출처가 불명확하거나 유사성이 높은 항목을 제품에 넣지 않는 내부 gate다.

## 4. General mechanics와 구체적 표현의 경계

공개 시장, 자원 지불, 영구 생산 효과, 점수, reserve 같은 일반적인 mechanic concept은 `GEM_CARD` 규칙 문서에서 독립적으로 조합·검증할 수 있다. 그러나 다음은 mechanic 그 자체가 아니라 별도 검토가 필요한 product expression 또는 data다.

- mechanic을 설명하는 구체적인 rulebook 문장과 예시
- resource·card·objective의 고유 명칭과 flavor text
- icon, illustration, frame, typography, color system과 화면 배치
- 카드 cost, point, supply, deck composition의 전체 dataset
- 특정 제품을 연상시키는 기능 조합, 명칭, 수치와 presentation의 총체

기능 요구사항은 우리 문장으로 작성하고, rule decision과 balance 목표에서 출발해 독립적으로 구현한다. 특정 제품을 그대로 재현하는 것을 제품 목표나 acceptance criterion으로 삼지 않는다.

## 5. IP/product risk table

| Area | Risk | Policy |
| --- | --- | --- |
| Game title | 기존 표장·제품과 혼동되거나 연관·후원을 암시하는 공개 명칭 | `NEUTRAL_NAMING` + `REVIEW_BEFORE_RELEASE`; 내부는 `GEM_CARD`, 공개 working name은 `보석 카드 게임`, 최종 title은 별도 승인 |
| Logo | 제3자 logo, wordmark, 상징 또는 식별 가능한 스타일의 복제·모방 | `ORIGINAL_ONLY` + `DO_NOT_COPY` + `REVIEW_BEFORE_RELEASE`; 독립적인 visual identity 제작 |
| Card artwork | 공식·제3자 illustration, character, background, texture 또는 close adaptation 사용 | `ORIGINAL_ONLY` + `DO_NOT_COPY`; 자체 제작 또는 provenance가 확인된 적법한 asset만 사용 |
| Card layout | 식별 가능한 frame, 정보 계층, 배치, 장식과 전체 visual presentation의 모방 | `ORIGINAL_ONLY` + `DO_NOT_COPY` + `REVIEW_BEFORE_RELEASE`; 기능 요구에서 독립 UI system을 설계 |
| Resource icons | 공식 icon shape·set·color coding 또는 출처 불명 icon 사용 | `ORIGINAL_ONLY` + `DO_NOT_COPY`; 자체 icon system 또는 license-compatible set과 provenance 사용 |
| Rulebook text | 문장 복사, 번역 복제 또는 표현만 소폭 바꾼 close paraphrase | `DO_NOT_COPY` + `ORIGINAL_ONLY`; confirmed rule에서 독립 문장·도식·예시 작성 |
| Card/deck data | 공개된 전체 card list, cost table, point distribution 또는 deck composition을 그대로 옮김 | `DO_NOT_COPY` + `ORIGINAL_ONLY` + `REVIEW_BEFORE_RELEASE`; 독자 dataset과 설계 기록·playtest 근거 유지 |
| Terminology | 고유 resource·action·card·objective·character 명칭이나 혼동 가능한 변형 사용 | `NEUTRAL_NAMING` + `DO_NOT_COPY` + `REVIEW_BEFORE_RELEASE`; generic working terms에서 독자 어휘로 발전 |
| Exact balance numbers | 제3자의 supply, cost, score, threshold와 분포를 한 세트로 복제 | `DO_NOT_COPY` + `ORIGINAL_ONLY`; 자체 balance 목표, simulation과 playtest로 수치 도출 |
| Objective system | 식별 가능한 objective 이름·조건·조합·presentation 또는 exact data 복제 | `ORIGINAL_ONLY` + `DO_NOT_COPY`; v1에서 제거하거나 독립 규칙·dataset으로 설계 후 검토 |
| Marketing screenshots | 제3자 UI·art·logo·card나 권리 미확인 asset이 포함된 홍보 이미지 | `ORIGINAL_ONLY` + `REVIEW_BEFORE_RELEASE`; 승인된 우리 build와 우리 asset으로만 촬영·제작 |

## 6. Asset policy

### 6.1 허용 가능한 provenance

제품 asset은 다음 중 하나의 근거가 명확해야 한다.

- 팀이 처음부터 자체 제작하고 ownership이 기록된 asset
- 계약으로 필요한 사용·수정·재배포 권리를 확보한 commissioned asset
- 상업적 사용과 배포 방식에 맞는 license를 가진 third-party asset
- public domain이거나 프로젝트 사용 방식과 호환되는 open license asset

각 외부 asset은 최소한 source, creator, license 이름·version, 취득일, 원본 URL 또는 계약 위치, attribution/notice 의무, 수정 여부와 사용 범위를 asset inventory에 기록한다. “무료”, 검색 결과 노출, 다운로드 가능 또는 출처 미상은 사용 허가의 근거가 아니다.

### 6.2 금지 사항

- 공식 card, artwork, logo, icon, screenshot 또는 rulebook image를 가져오지 않는다.
- 출처·권리·license가 불명확한 asset을 임시 placeholder라는 이유로 production source에 넣지 않는다.
- 제3자 asset을 trace, recolor, crop 또는 재배치한 것을 original asset으로 취급하지 않는다.
- 특정 작가·제품의 식별 가능한 스타일을 모사하는 것이 목표인 생성 요청을 사용하지 않는다.
- 생성형 도구 출력도 자동으로 안전하다고 가정하지 않는다. 입력 reference, tool terms와 output 사용 조건을 release 전에 검토한다.

P10에서는 asset을 다운로드, 생성 또는 repository에 추가하지 않는다.

## 7. Terminology와 rule text 정책

규칙의 canonical source는 사용자가 확정한 `GEM_CARD` decision table이다. Rulebook과 UI copy는 그 결정을 바탕으로 처음부터 독립적으로 작성한다.

- 제3자 rulebook의 문장을 복사, 번역 또는 문장 구조를 따라 close paraphrase하지 않는다.
- 고유 action·resource·objective·card·character 이름을 가져오지 않는다.
- 설명을 위해 필요한 일반 용어는 중립적인 working terminology로 사용하되 공개 명칭 검토와 분리한다.
- 예시, diagram, tutorial과 tooltip도 우리 규칙과 우리 표현으로 작성한다.
- 외부 문구를 인용해야 할 제품상 필요가 생기면 구현하지 않고 source·목적·허용 근거를 legal review 대상으로 올린다.

내부 enum과 UI label은 분리한다. UI color 또는 그림이 domain identifier의 권위가 되어서는 안 되며, 최종 resource naming과 visual mapping은 독립 product decision으로 확정한다.

## 8. Balance와 card/deck data 정책

`GEM_CARD` v1 dataset은 다음 순서로 독립 설계한다.

1. 목표 play time, player count, resource scarcity와 strategic trade-off를 문서화한다.
2. confirmed rule에 맞는 자체 supply, cost, point, threshold와 deck distribution을 만든다.
3. 생성 근거와 revision을 versioned design record에 남긴다.
4. simulation과 playtest 결과로 조정한다.
5. 공개 전 전체 dataset에 대해 외부 published table의 복제 여부와 provenance를 검토한다.

다음은 금지한다.

- 제3자의 full deck composition, exact card cost table, token supply table 또는 score distribution을 import·transcribe하는 일
- 원본 열 이름만 바꾸거나 행 순서를 섞어 독립 dataset으로 주장하는 일
- 테스트 fixture에 넣은 복제 data를 나중에 production seed로 승격하는 일
- “업계 표준”이라는 추정만으로 수치 세트를 자동 확정하는 일

개별 숫자가 우연히 같다는 사실만으로 법률 결론을 내리지는 않는다. 다만 전체 패턴·분포·조합의 출처가 외부 published data라면 `REVIEW_BEFORE_RELEASE`이며, 독자 설계 근거가 없으면 release blocker다.

## 9. Visual design와 layout 정책

UI는 market, supply, player engine, action affordance 같은 기능 요구에서 시작해 독립적으로 설계한다.

- 자체 spacing, typography, color token, component shape, icon family와 motion language를 사용한다.
- 특정 제품의 card frame, slot arrangement, resource placement, score treatment와 전체 screen composition을 재현하는 것을 목표로 하지 않는다.
- 정보 접근성, responsive behavior와 server-authoritative state 표시는 우리 Web architecture 요구로 설계한다.
- wire/domain ID와 시각적 color·icon은 분리해 theme 변경이 game rule을 바꾸지 않게 한다.

Card layout과 전체 visual identity는 mockup 단계와 release candidate 단계에서 각각 `REVIEW_BEFORE_RELEASE`를 수행한다.

## 10. Marketing과 screenshot 정책

Marketing material은 승인된 `GEM_CARD` build, public title, logo와 asset만 사용한다.

- 제3자 제품 화면, card, packaging, logo, artwork 또는 comparison crop을 포함하지 않는다.
- 개발 중 placeholder나 license 미확인 asset이 남아 있는 build를 촬영하지 않는다.
- screenshot에 session credential, private player state 또는 운영상 secret이 보이지 않는지도 별도로 확인한다.
- store, social, press와 landing-page image는 asset inventory의 release-approved 항목으로 추적한다.
- “공식”, “인증”, “후속작”, “호환”처럼 관계를 오인시킬 수 있는 문구를 승인 없이 사용하지 않는다.

## 11. Public release checklist

아래 모든 항목이 완료되기 전에는 `GEM_CARD`를 public production catalog에 활성화하지 않는다.

### Identity

- [ ] 내부 식별자는 중립적인 `GEM_CARD`로 유지된다.
- [ ] 최종 public title이 확정되고 product/brand review가 완료됐다.
- [ ] 필요하다고 판단한 시장·관할의 qualified legal review가 완료됐다.
- [ ] title, subtitle, domain, metadata와 marketing copy가 제3자와의 관계를 암시하지 않는다.

### Rules, terminology and data

- [ ] 모든 high-impact `GC-*` 규칙이 사용자에 의해 확정됐다.
- [ ] Rulebook, tutorial, UI text와 examples가 confirmed rule에서 독립적으로 작성됐다.
- [ ] 고유 명칭·문구의 외부 출처 복사나 close adaptation이 없다.
- [ ] Card/deck, supply, cost, score와 threshold dataset에 독립 설계 provenance가 있다.
- [ ] Exact balance/data audit와 product review가 완료됐다.

### Assets and visual identity

- [ ] 모든 image, icon, font, sound와 animation이 asset inventory에 있다.
- [ ] 각 외부 asset의 license, attribution, modification와 distribution 의무가 기록됐다.
- [ ] License notice와 attribution이 build/repository/distribution에 올바르게 포함됐다.
- [ ] Logo, card artwork, resource icons와 UI layout이 독립적으로 제작됐다.
- [ ] Placeholder, official asset, 출처 불명 asset과 unapproved generated output이 없다.
- [ ] Visual identity와 layout의 release review가 완료됐다.

### Marketing and distribution

- [ ] Screenshot과 video는 승인된 우리 build와 asset만 보여 준다.
- [ ] Store listing, landing page와 social copy가 final naming policy를 따른다.
- [ ] 배포 대상 platform의 third-party license·notice 요건이 충족됐다.
- [ ] 변경된 title, asset, data 또는 marketing material에 대해 review를 다시 수행했다.

## 12. Legal-review boundary

이 문서의 checklist 통과는 법률 의견이나 비침해 보증이 아니다. 다음 중 하나라도 해당하면 개발팀이 임의로 승인하지 않고 product owner와 qualified legal counsel 검토 여부를 결정한다.

- 최종 title, logo 또는 visual identity가 기존 표장·제품과 유사하다는 우려가 있음
- 제3자 또는 commissioned asset의 ownership, license 범위, attribution 또는 재배포 권리가 불명확함
- 번역·adaptation·reference image 또는 외부 rule text 사용이 필요함
- 외부 published dataset이나 balance table을 source로 삼았거나 실질적으로 유사한 전체 조합이 존재함
- 특정 visual layout, icon system 또는 marketing presentation의 혼동 가능성이 제기됨
- 생성형 도구의 입력 권리 또는 output 사용 조건을 확인할 수 없음
- 국가·store·distribution partner별 trademark, copyright, consumer-protection 또는 license 의무 판단이 필요함

검토 결과가 없거나 불명확하면 해당 항목은 `DO_NOT_COPY / REVIEW_BEFORE_RELEASE` 상태로 남기고 release하지 않는다.

## 13. Release blockers

다음은 명시적인 public release blocker다.

- 최종 public title 또는 logo가 승인되지 않음
- Asset inventory, provenance, license 또는 attribution 기록이 누락됨
- 공식·제3자 artwork, icon, screenshot, rulebook text 또는 close adaptation이 포함됨
- Card/deck data나 exact balance table이 외부 published data에서 복제됐거나 독립 설계 근거가 없음
- Visual layout이 특정 제품의 식별 가능한 presentation을 재현하도록 설계됨
- Rule text, terminology, objective 또는 flavor content의 독립 작성 여부가 불명확함
- Marketing screenshot에 unapproved/third-party asset 또는 오해를 유발하는 branding이 포함됨
- 필요한 legal review가 미완료이거나 사용 권한에 해결되지 않은 의문이 있음
- P10의 high-impact rule decisions와 consistency audit이 완료되지 않음

현재 P10 first pass에서는 final public title, artwork/icon system, original balance dataset과 card/deck data가 아직 없고 `GC-*` 사용자 결정도 남아 있다. 따라서 이 문서는 구현 가능한 asset/data를 승인하지 않으며, public release gate는 닫혀 있다.

## 14. Change control

- Naming, rule text, asset, layout, dataset 또는 marketing material이 바뀌면 해당 checklist와 provenance review를 다시 실행한다.
- 새 third-party material은 먼저 inventory와 license review를 거친 뒤 repository에 추가한다.
- 임시 예외는 source에 숨겨 두지 않고 owner, 범위, 만료 조건과 release 차단 여부를 기록한다.
- `GEM_CARD` rules approval과 IP/product approval은 별도 gate다. 한쪽의 승인이 다른 쪽을 자동 승인하지 않는다.
- P11 runtime 구현 승인은 public release 승인과 동치가 아니다.
