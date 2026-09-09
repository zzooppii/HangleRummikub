# CITY card visual distinctiveness

## Scope and baseline

- Starting commit: `58f79c1` — `feat: add city landmark abilities`.
- Baseline: 1533 tests (shared 110 / Web 358 / server 1065).
- Presentation only: original SVG artwork for all 30 public building templates, category styling, card hierarchy, and Landmark panel emphasis.
- No rules, card data, command handlers, server, shared schema, dependency, audio, or reconnect changes. Railway NOT DEPLOYED.

## Visual system

`CityTemplateArt.tsx` owns lightweight, original SVG paths. Each template has its own large silhouette and motif; category frames and palettes supply family resemblance without replacing individual identity.

| Category | Family | Template motifs, in template ID order 01–06 |
| --- | --- | --- |
| CIVIC | Blue stone, columns | 비표보관소: 서가; 공론마당: 연단; 길안내소: 갈림길 표지판; 협의뜰: 원탁; 우편회랑: 봉투와 아치; 수평의사당: 대칭 기둥 |
| CULTURE | Plum curtains | 종이공방: 접은 종이; 낭독쉼터: 책과 나무; 노래뜰: 음악 무대; 기록정원: 기록석; 별관측실: 망원경; 이야기회랑: 두루마리 |
| TRADE | Gold awnings | 저울마당: 저울; 포장공방: 도로 석재; 교환안뜰: 두 천막과 교환; 상인회랑: 줄무늬 천막; 장부전당: 장부와 금화; 운송집결소: 수레 |
| GUARD | Terracotta battlements | 등불초소: 등불; 길목대기소: 차단문; 신호마당: 봉화; 순찰회랑: 방벽 아치; 지도훈련소: 지도와 표적; 방호전당: 방패 요새 |
| LANDMARK | Green foliage, gold | 빗물정원: 비와 연못; 작은해시계: 해시계; 돌물결마당: 분수; 바람계단: 계단과 풍향기; 달그림회랑: 달빛 아치; 일곱길기념뜰: 일곱 길 기념비 |

No new template or gameplay meaning is invented. The example “기록보관소” is not a canonical template; existing 비표보관소 and 기록정원 receive their own motifs instead.

The existing shared `CityBuildingFace` renders category badge → illustration → name → cost/VP → applicable special ability. Hand, pending choices, public city, and Finished cards therefore use the same artwork. The existing category-only Guide illustrations remain unchanged. Landmark v1/v2 text gating remains unchanged.

SVGs are decorative and unfocusable; the existing card accessible name, category icon/text, selected check, disabled reasons, focus styling and reduced-motion rules remain. No animation or external image is introduced.

## Verification

- Added two tests covering all 30 IDs, unique silhouettes/motifs, five category families, decorative accessibility, named motifs, hierarchy and Landmark panel preservation.
- Full suite: 1535 PASS (shared 110 / Web 360 / server 1065); existing tests retained.
- Root typecheck, build, and diff-check PASS.
- Local production UI at 1280: create/start with a normal second Socket.IO participant, acquire gold, select/build 비표보관소; gold 4→3, hand 4→3, city 0→1. Shared city/hand art and selection/dock interaction verified.
- Same-browser Home resume restored the existing local game. Actual 390 and 320 game viewports had document client/scroll widths 375/375 and 305/305 respectively. Hand selection and Landmark ability panel remained readable and reachable. New resumed tab console logs: empty.
- A separate temporary public-catalog gallery rendered the actual card component and production CSS for all 30 hand-sized and all 30 dense city/result-sized cards. Category and motif comparison at desktop and 390/320 used this presentation fixture, not injected production game state. Finished appearance is covered by the shared component/gallery, not a claimed completed live game.
- Bundle: 568.00 → 577.32 kB, gzip 159.90 → 164.49 kB. Existing >500 kB build warning remains; no dependency or raster assets added.

Railway deployment remains a user action; this task verifies local presentation only.
