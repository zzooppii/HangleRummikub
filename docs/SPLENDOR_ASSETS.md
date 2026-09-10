# 스플렌더 데이터와 그래픽 기록

## 카드와 귀족

규칙 기준: [Space Cowboys 기본판 공식 규칙 PDF](https://cdn.svc.asmodee.net/production-spacecowboys/uploads/2025/10/SCSPL01EN_SPLENDOR_RULES_LIGHT.pdf).

서버 카드 표는 아래 두 공개 CSV의 숫자 사실을 WHITE/BLUE/GREEN/RED/BLACK 순서로 정규화하여 90개 `(tier, bonus, points, cost)` 튜플이 모두 일치함을 확인한 뒤 작성했다. 외부 게임 엔진 구현이나 기존 게임 그림은 가져오지 않았다.

- [bouk/splendimax, Splendor Cards.csv](https://github.com/bouk/splendimax/blob/5ffcb148ee0093e3b47f612b04a1927301ff13ee/Splendor%20Cards.csv)
  - 다운로드 SHA-256: `33e7e966758f73a6a236b8336f1ab7e9f057c8a55d33300671c9e918426cc2fb`
- [seal256/splendor, assets/cards.csv](https://github.com/seal256/splendor/blob/263abc066c563a1c89dba4bdc408446a20ad9d1d/assets/cards.csv)
  - 다운로드 SHA-256: `4b63a97ba3b30b4b6b8f7aa2a1d9aae0d981651557b8eada37ceeab3e87e6b74`

데이터 버전은 `splendor-base-2014-v1`. 단계별 40/30/20장, 각 색별 8/6/4장이다. 귀족은 기본판의 순환 색 조합 5개의 4+4 요구, 5개의 3+3+3 요구이며 각 3점이다. 서버 state를 복제/저장할 때 전체 카드 정의와 카드·보석·귀족 보존을 다시 확인한다.

## 자체 제작 그래픽

2026-09-10 내장 imagegen으로 이 작업을 위해 새로 생성했다. 원작 카드나 귀족 그림을 참조 입력으로 제공하지 않았다. 생성한 원본 PNG를 프로젝트에 복사하고 `sips`로 JPEG 인코딩만 적용했다. 런타임 외부 이미지 서비스 호출 없이 아래 3개의 로컬 atlas를 사용한다.

| 프로젝트 파일 | 크기 | 구성 |
| --- | --- | --- |
| `apps/web/public/assets/splendor/landscapes.jpg` | 1536×1024 | 3열×2행, 카드 배경 6종 |
| `apps/web/public/assets/splendor/portraits.jpg` | 1983×793 | 5열×2행, 가상의 귀족 10명 |
| `apps/web/public/assets/splendor/gems.jpg` | 1536×1024 | 3열×2행, 보석 5종과 황금 |

원본 생성 파일은 작업 당시 Codex generated_images 디렉터리의 `exec-8e0dd45f-cdd2-44fe-bc76-4f955e98273e.png`, `exec-4b7e0a54-8c5b-4491-a111-7dee6959bd69.png`, `exec-c8ed096e-5ee3-4e77-bc94-654dfd52ea02.png`였다. 앱은 위 프로젝트 파일만 참조한다.

재생성용 프롬프트 기록(생성 지시 요약):

1. **카드 배경**: Original premium tabletop strategy game card-art atlas, exactly 3 columns by 2 rows, six equal square cells without gutters. Renaissance merchant world, painterly cinematic detail, warm sunlight, deep emerald/teal shadows and restrained gold. Six scenes: gem mine, merchant ship and harbor, artisan gemstone workshop, terraced gardens, Venetian canal, magnificent palace. Rich environmental artwork with room for UI overlays. No text, numbers, logos, borders, copied game artwork or interface.
2. **귀족**: Original premium strategy board game portrait atlas, exactly 5 columns by 2 rows, ten distinct fictional Renaissance nobles, men and women with varied appearances, dignified expressions and richly textured period clothing. Chest-up painted portraits, dark backgrounds, warm oil-paint lighting, consistent framing. No famous people, text, symbols, borders, logos or existing game artwork.
3. **보석**: Polished 3D game-asset atlas, exactly 3 columns by 2 rows, six isolated large tokens on a consistent dark midnight teal background #10282c. White brilliant-cut diamond, deep blue sapphire, rectangular green emerald, red ruby, angular black onyx, small stack of gold coins. Distinct silhouettes, sharp reflective facets, luxurious tactile lighting, centered with padding. No lettering, UI, labels, logos or existing game assets.

점수, 비용, 카드 테두리, 토큰 수량, 귀족 조건은 CSS와 텍스트로 렌더링한다. 이미지에 게임 수치를 고정하지 않는다. 각 토큰은 색 외에도 서로 다른 모양과 접근성 이름을 가진다.
