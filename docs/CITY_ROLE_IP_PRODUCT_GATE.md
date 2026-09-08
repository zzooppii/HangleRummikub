# CITY_ROLE — IP / product planning gate

> P14A · 2026-09-08 · `PLANNING ONLY / PRODUCT DECISIONS OPEN / NOT RELEASE CLEARANCE`
>
> 현재 목적: 친구들과 개인적으로 플레이하는 온라인 보드게임. 기존 세 게임의 production runtime·release tag는 변경하지 않는다.
>
> 이 문서는 개발 정책과 검토 항목이다. 특정 게임의 권리 범위, 법적 비침해 또는 사용 허가를 판정하는 법률 자문이 아니다.

## 1. 확정된 경계와 아직 OPEN인 선택

사용자가 이미 정한 범위는 다음과 같다.

- 비밀 역할 선택, 도시 건설, 라운드 구조를 검토한다. Mechanics의 유사성 자체를 이번 기획에서 금지하지 않는다.
- 공식 title/logo/artwork/card images/character illustration/rulebook 문장/app UI/trade dress를 직접 복제하지 않는다.
- 자체 이름·용어·카드 문구·art/icons·UI와 출처 기록을 사용한다.
- 이번 단계에서는 코드, 카드 dataset, 이미지, 소리, runtime schema 또는 production asset을 만들지 않는다.
- 향후 공개·상업 배포에는 별도 IP/product review가 필요하다. 개인 목적이라는 설명은 권리자 허가나 법적 면책의 근거로 사용하지 않는다.

반면 **얼마나 원작에 가깝게 플레이할지, 어느 판본을 참고할지, 역할/건물 데이터의 구체적인 내용과 최종 public title은 OPEN**이다. [Decision gate](./CITY_ROLE_DECISION_GATE.md)의 선택이 authority이며, 이 문서가 추천을 승인으로 바꾸지 않는다.

## 2. Reference baseline: 확인 사실과 한계

### 2.1 Publisher 자료에서 확인한 최소 사실

Z-Man의 현재 제품 페이지는 revised edition을 소개하며 2–8인과 라운드마다 역할을 선택해 재화·도시 건설에 활용하는 구조를 설명한다. 이는 CITY_ROLE의 player count나 세부 규칙을 확정하는 근거가 아니다. Classic과 revised edition을 같은 규칙 세트라고 가정하지 않는다. [Z-Man Citadels product page](https://www.zmangames.com/game/citadels/)

공식 Classic rulebook의 검색 색인에서는 일반 4–7인 설명과 별도 2/3인 규칙이 식별되었다. 다만 이 기획 조사에서 해당 PDF 직접 열기는 502로 실패했으므로 **본문 전체를 읽고 검증했다고 주장하지 않는다**. 인원별 draft 제거표, 특수 인원 처리, 역할 효과/타이밍과 카드 목록을 기억이나 검색 snippet으로 canonicalize하지 않는다. Classic에 매우 가까운 선택을 하면 P14B에서 정확한 판본과 필요한 rule source를 다시 확인해야 한다. [Official Classic rulebook URL — 직접 열람 미완료](https://images-cdn.zmangames.com/us-east-1/filer_public/d3/b0/d3b00592-62fa-409a-b5c6-3364e972955f/wr01_citadels_classic_rules.pdf)

### 2.2 Publisher community policy는 구현 허가가 아님

Publisher의 community IP policy는 자체적으로 license가 아니라고 명시한다. 또한 온라인 게임 복제와 해당 IP를 쓰는 software app을 허용 범위에서 제외한다. 따라서 “친구용이므로”, “무료이므로”, “이름과 그림만 바꾸므로” 그 정책에 의해 구현이 허용되었다고 결론내리지 않는다. 이는 **publisher가 게시한 정책의 확인**이며, 모든 추상 mechanic의 법적 소유 여부나 CITY_ROLE의 침해 여부를 판정한 것이 아니다. [Z-Man IP Policy](https://www.zmangames.com/ip-policy/)

이 발견은 docs-only decision gate 작성을 막지 않는다. 다만 기계적 유사성 정도를 결정한 뒤, 우리 설계가 독립적인 game인지 온라인 재현에 해당할 위험이 있는지와 공개 범위에 필요한 검토를 P14B 및 release gate에서 명시적으로 남겨야 한다. 권리 검토 없이 “표현만 바꾸면 안전”이라고 약속하지 않는다.

### 2.3 일반 IP 배경의 한계

미국 Copyright Office는 idea/system/method와 그 구체적 표현을 구분한다. 이것만으로 전체 제품 재현이나 특정 데이터·이미지·문구 사용의 적법성이 증명되지는 않는다. [Copyright Office FAQ](https://www.copyright.gov/help/faq/faq-protect.html)

USPTO는 상품·서비스의 출처를 구별하는 word/symbol/design 등을 상표의 기능으로 설명한다. 그러므로 자체 임시 이름도 title/branding 검토 없이 release-cleared라고 부르지 않는다. 이 미국 자료는 한국 또는 다른 관할의 완결된 법률 분석을 대신하지 않는다. [USPTO — What is a trademark?](https://www.uspto.gov/trademarks/basics/what-trademark)

## 3. Original-content 선택 gate

`CITY-002`는 다음의 서로 다른 제품 방향을 사용자에게 묻는다. A를 likely recommendation으로 둘 수 있지만 자동 승인하지 않는다.

| 방향 | 의미 | 이 단계의 상태 / 후속 영향 |
| --- | --- | --- |
| A — Classic 스타일에 매우 가까운 mechanics | 원하는 role-draft/city-building 경험과 타이밍을 가깝게 검토하되 이름·art·문구·UI는 자체 제작 | `OPEN`; 정확한 판본/source 확인, publisher policy와 독립 표현 경계 재검토 필요. 공식 구현 허가가 아님 |
| B — 핵심 구조 + 일부 변형 | 비밀 draft/역할 순서/도시 건설은 유지하고 인원·간섭·경제 등을 명시적으로 조정 | `OPEN`; 변경 규칙의 일관성 audit와 자체 dataset 설계가 필요. 변형 자체가 legal clearance는 아님 |
| C — 독립 변형 | 같은 넓은 genre 안에서 별도의 역할·경제·종료 구조를 설계 | `OPEN`; gameplay loop를 더 많이 재검증해야 함. IP review 면제는 아님 |

Mechanics 선택과 표현물 정책은 분리한다. A/B/C 어느 쪽도 official asset, copied card prose 또는 commercial digital trade dress의 사용을 승인하지 않는다. 반대로 표현물을 자체 제작한다는 정책이 gameplay 수치나 능력을 임의로 바꾸라는 지시도 아니다.

## 4. Working identity와 용어

- Internal stable candidate: `CITY_ROLE`. 현재 문서 식별자일 뿐 `GameType`, event, registry 또는 storage schema에 추가하지 않는다.
- Public working title 후보: `비밀 도시 게임`, `도시의 역할`, `왕국 건설 게임`. 문서에서는 **비밀 도시 게임**을 설명용으로 사용할 수 있으며 최종 이름은 OPEN이다.
- `Citadels` 표기는 이 기획의 참고 대상 식별/출처 설명에만 사용한다. 우리 production game의 title, logo, SEO/marketing상 공식 관계를 암시하는 명칭으로 사용하지 않는다.
- Role은 neutral internal ID와 자체 display name을 분리한다. 공식 character 이름을 단순 번역한 표를 production content로 만들지 않는다.
- Gold/currency, building/category, role target 같은 작업 용어는 기능 설명이다. 자체 public terminology와 rule text는 확정 결정에서 독립적으로 작성한다.
- “공식”, “승인된 digital version”, “호환/후속작” 같은 관계를 증명되지 않은 상태로 주장하지 않는다.

## 5. 표현·데이터·asset authoring 정책

| 대상 | 우리가 만드는 것 | 하지 않는 것 |
| --- | --- | --- |
| Role text | 승인된 효과/제약/타이밍에서 처음부터 작성한 한국어 설명과 자체 예시 | 공식 card/rulebook의 복사·번역 복제·문장 구조를 따른 close paraphrase |
| Building dataset | 인원·deck 크기·비용·점수·범주·특수효과 결정 후 독립 설계 기록과 버전별 audit | 공식 전체 deck/card list, 비용·매수·효과 table을 전사·scrape하거나 이름만 교체 |
| Art / icons / audio | 자체 제작 또는 필요한 사용 권리를 명확히 확보하고 사용자가 승인한 자산 | 공식 character/district 그림·sound, crop/recolor/trace, 출처 불명의 placeholder |
| UI / tutorial / Guide | phase·privacy·mobile 접근성 요구로 만든 자체 구성과 문구 | commercial app의 화면·card frame·전체 시각적 구성을 재현하는 acceptance criterion |
| Public title / branding | 자체 후보와 별도 혼동 가능성 검토 | 공식 title/logo/wordmark 또는 관계를 오인시키는 변형 |
| Examples / screenshots | 승인 후 우리의 실제 build와 합성 테스트 정보로 만든 예시 | 공식 앱/카드 screenshot, 다른 player private state/session secret 노출 |

P14A에서 독립 deck을 실제로 채우지 않는다. 먼저 player count, draft, role set, economy, build, finish/scoring과 timeout/leave를 결정해야 한다. 독립 dataset 작성 권한과 제출·승인 방식도 [decision gate](./CITY_ROLE_DECISION_GATE.md)에 남긴다. 특정 개별 숫자가 같은지 여부만으로 법률 결론을 내리지 않으며, 전체 데이터의 출처·작성 과정을 기록한다.

향후 asset inventory에는 최소 `asset ID / creator / source URL 또는 계약 / license와 version / 취득일 / 수정 여부 / 사용 범위 / attribution 의무 / 검토 상태`를 남긴다. 생성형 도구를 쓰더라도 official reference를 무단 입력하거나 출력을 자동으로 권리 검토 완료로 취급하지 않는다. 이번 phase에는 asset 생성·다운로드·추가가 없다.

## 6. P14B와 후속 release에서 다시 확인할 것

### P14B rules / protocol / IP consistency gate

- [ ] `CITY-002`의 proximity/edition 선택과 실제 역할·draft·수치 결정이 서로 일치한다.
- [ ] 특정 판본의 동작을 근거로 삼은 규칙은 primary source의 열람 범위와 자체 변경점을 표시한다.
- [ ] Publisher policy를 personal-use/renaming 허가로 잘못 표현하지 않는다.
- [ ] 역할/건물의 이름·문구·dataset은 independent-authoring 계획과 연결되며 official table을 복사하지 않는다.
- [ ] Secret role/hand 개인정보, replay/log/screenshot 노출 경계가 제품 요구에 맞게 확정된다.
- [ ] 미확정 title, asset, data와 공개 범위에 대한 review ownership을 기록한다.

### Public / commercial release 이전 별도 gate

- [ ] 자체 public title, role/building terminology, visual identity의 product/brand 검토.
- [ ] Card text·deck data·art/icons/UI·audio의 provenance와 필요한 권리/attribution 확인.
- [ ] 해당 서비스의 실제 공개 범위와 대상 관할에 맞는 별도 IP review; 필요한 경우 qualified legal review/권리 확보.
- [ ] Official affiliation나 허가를 암시하는 metadata·screenshots·marketing copy가 없음.
- [ ] 선택한 mechanics의 근접성, 전체 presentation, publisher policy를 함께 검토한 결과를 기록.

**P14A 결과는 decision 준비이지 개발 content 전체 승인, release 승인 또는 비침해 판단이 아니다.** 사용자 decisions 이후 P14B로 진행하며, 기존 HANGUL_TILE / NUMBER_TILE / GEM_CARD와 `three-game-platform-v1`은 이 gate의 영향을 받지 않는다.
