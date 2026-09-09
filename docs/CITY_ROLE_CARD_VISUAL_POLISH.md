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

## Card art & UI overhaul — 2026-09-09

### Baseline and scope

- Starting HEAD: `183c396`, clean `master === origin/master`.
- Baseline: 1587 PASS (shared 110 / Web 388 / server 1089), root typecheck/build PASS.
- This edition replaces the earlier small vector plates above with 30 separately generated, original environmental illustrations. The earlier SVG work and its verification remain historical, not the current art-quality claim.
- Only CITY Web presentation, its tests and these asset notes change. Server/domain, shared protocol, rules, physical card catalog, Landmark effects, timer, privacy, audio, reconnect and HANGUL/NUMBER/GEM are unchanged.

### Identity and provenance

- Main artwork: `apps/web/public/city-art/illustrated-v1/cb-*.webp`, one file for every one of the 30 existing public template IDs.
- Registry: `CityTemplateArt.tsx`. Unknown or category-mismatched IDs do not receive another building's illustration.
- Shared face: `CityBuildingFace.tsx`, used by hand/pending-choice/build-target/city/Finished views. Guide/Tutorial use the same representative template plates.
- Built-in OpenAI image generation produced each scene separately from an original subject brief. Neither reference screenshot was submitted as an edit target or copied into the asset set. No official Citadels assets, frame, card text or logo is used.
- Full common prompt and individual scene briefs/source-generation filenames are recorded in `apps/web/public/city-art/illustrated-v1/provenance.json`. Original PNGs remain in Codex's generated-image directory; only optimized distribution images are committed. They are AI-generated illustrations, not a claim of manually painted originals.
- The public template names/IDs and costs continue to come from canonical snapshots. Artwork is decorative: it adds no gameplay hints or private state.

### Five visual families and all 30 places

| Family | Frame and atmosphere | Distinct environmental compositions, 01–06 |
| --- | --- | --- |
| CIVIC | Angular blue/ivory, double-rule trim, orderly stone and daylight | 비표보관소: tall archive interior; 공론마당: circular debating forum; 길안내소: uphill fork and signpost kiosk; 협의뜰: pergola and round council table; 우편회랑: deep postal arcade; 수평의사당: broad colonnaded facade and reflecting pool |
| CULTURE | Curved plum frame, rose/lilac lighting, softer ornament | 종이공방: sheets drying above paper vats; 낭독쉼터: flowering-tree reading nook; 노래뜰: outdoor musical stage; 기록정원: memory-stone garden; 별관측실: telescope under open dome; 이야기회랑: lantern-lit storytelling interior |
| TRADE | Saffron trim, cream paper, copper and busy market light | 저울마당: weighing plaza; 포장공방: stone-paving workshop and unfinished road; 교환안뜰: facing barter stalls; 상인회랑: deep striped-awning passage; 장부전당: grand counting hall; 운송집결소: loaded wagons and warehouse crane |
| GUARD | Squared iron/rust frame, ridged edge, dense defensive silhouettes | 등불초소: lantern-lit watch hut; 길목대기소: constricted checkpoint; 신호마당: raised beacon plaza; 순찰회랑: winding wall patrol; 지도훈련소: terrain-model training yard; 방호전당: massive fortified hall |
| LANDMARK | Jade/gold double emphasis and dedicated gold ability panel | 빗물정원: rain chains and lily pools; 작은해시계: secluded sundial courtyard; 돌물결마당: wave-sculpted fountain; 바람계단: exposed cliff stair; 달그림회랑: moonlit arches and reflection; 일곱길기념뜰: radial memorial garden |

### Card hierarchy and states

Category icon/text → large square scene → name → separate gold/VP indicators → v2-only Landmark ability. HTML/SVG labels remain sharp independently of image resolution. Built status and public Landmark usage remain outside the immutable face.

Hand affordance styling reads the existing build preview; it never changes legality. Ready uses green text/rail, insufficient gold uses rust text/rail, unavailable keeps its existing explanatory reason. Selected cards retain pressed state, check marker and focus outline. Input commands, disabled behavior and the bottom build/end-turn dock are unchanged.

Grid cards align at their own natural height instead of stretching every card to match the longest Landmark in the row. Dense cities now retain a minimum practical illustration width; narrow screens use two columns. Reduced-motion disables card transforms/transitions, and no new animation/audio is introduced.

### Verification

- Seven additional tests: 30 files/unique hashes/size budget, six per category and local-only paths, safe unknown/mismatched identity, cost/VP hierarchy, identical v1/v2 artwork with correct ability gating, existing-preview-derived build states, responsive/motion/focus CSS invariants.
- Existing 30-motif test migrated its uniqueness assertion from SVG path identity to image source identity; actual file hashes now also prevent accidental duplicate art. No tests removed or skipped.
- Final full suite: **1594 PASS twice consecutively** = shared 110 / Web 395 / server 1089. Typecheck/build/diff-check PASS. Existing production-serving integration tests PASS.
- Browser presentation fixture rendered actual production CITY components and CSS, not a replacement mock UI: all 30 cards, first twelve side by side, category/name-hidden comparison, hand selection, unaffordable Landmark/build disabled, city cards, Finished cards and Guide/Tutorial. All 30 assets were visually reviewed. This is visual QA, not a blind novice-user study.
- 1280 desktop: no document overflow; selection activates the existing build dock. 390: client/scroll 375/375; 320: 305/305, no overflowing cards. Mobile Guide expands/scrolls and Tutorial uses the matching original plate.
- Separate actual production server + browser + second normal Socket.IO participant: create/join/start, two-role draft, acquire gold 2→4, select/build 길안내소, gold 4→2, hand 4→3, city 0→1. The same `CB-CIV-03` scene appears in its public built card. No canonical state injection/debug endpoint was used.
- Actual production Web also checked at 390/320: client/scroll 375/375 and 305/305, card overflow 0. All 30 production image requests return 200 + `image/webp`.
- App errors/React warnings: 0 in fixture and production smoke. MetaMask `chrome-extension://` listener/multiplex warnings are separate browser-extension noise.

### Delivery cost

| Resource | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main JS | 599.71 kB | 591.18 kB | −8.53 kB |
| Main JS gzip | 170.94 kB | 166.01 kB | −4.93 kB |
| CSS | 86.51 kB | 90.85 kB | +4.34 kB |
| CSS gzip | 18.23 kB | 19.17 kB | +0.94 kB |
| 30 separate WebP plates | 0 | 2,141,076 bytes | +2.14 MB total |

Images are 512×512, cwebp quality 82, lazy-loaded and asynchronously decoded, not base64-packed into JS. The image total is real additional download cost when all 30 are viewed; JS shrinking does not cancel it. No package/dependency change. Existing Vite >500 kB warning remains.

**Railway: NOT DEPLOYED.** User visual review precedes deployment.
