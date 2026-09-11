# 센추리 자체 아트

2026-09-11~12. 내장 image_gen 도구 사용. 기존 게임의 원본 스캔·로고·일러스트는 사용하지 않는다. JPEG 인코딩으로 저장하고 카드 수치·자원 문양은 HTML/CSS가 표시한다.

- [시장 일러스트](../../apps/web/public/images/century/market.jpg): 홈, 대기실, 헤더, 점수 카드 배경.
- [상인 3종 일러스트](../../apps/web/public/images/century/merchants.jpg): 생산/교환/업그레이드 카드의 동일 폭 세 패널. CSS로 패널 선택.
- 효과음은 `apps/web/src/features/century/sound.ts`의 Web Audio 합성. 나무 자원, 종이 카드, 승급 음계, 동전, 차례, 종료를 구분한다. 외부 음원 없음.

## 최종 생성 프롬프트 — 시장

Use case: stylized-concept. Asset type: original illustration for a browser board game's spice market table and lobby banner. Create a luxurious, painterly storybook landscape illustration, 1536x1024. A sunlit ancient spice trading town with terracotta arcades, emerald fabric awnings, carved wooden market stalls, ceramic bowls of turmeric yellow, saffron red, cardamom green and cinnamon brown spices, distant caravan crossing dunes, layered atmospheric mountains. Elegant handmade gouache, paper grain, richly detailed but calm, warm gold sunlight against deep teal shadows, sophisticated tabletop board game mood. Composition: architecture and caravan in upper two thirds; colorful spice bowls and textiles along lower corners, middle spacious for a game title overlay. No text, letters, numbers, logo, watermark, card frames or UI. Entirely original artwork, do not imitate any existing Century game illustration or packaging.

## 최종 생성 프롬프트 — 상인

Use case: stylized-concept. Asset type: original three-panel illustration atlas for merchant cards in a browser spice trading board game. Wide 1536x1024 image, THREE EQUAL VERTICAL PANELS side by side, crisp straight divisions at exactly one third and two thirds width, no gutters. Left panel: a kindly female spice grower in linen and ochre clothing holding a shallow bowl of yellow turmeric with green herb plants and sunlit terracotta garden behind her. Middle panel: a confident male caravan trader in teal robes weighing saffron on a small brass balance, sacks of spices and a market arch behind him. Right panel: an experienced woman artisan in indigo clothing grinding fragrant spices with a pestle in an elegant tiled workshop. Each character waist-up, visible expressive face near upper third, hands at middle, generous uncluttered bottom fifth for separate UI overlay. Cohesive sophisticated hand-painted gouache, tactile paper grain, rich teal, warm ochre and copper, soft natural light, dignified friendly characters. Edge-to-edge illustrated panels, no lettering, text, numbers, logos, UI, card borders or watermark. Entirely original characters and art; do not copy an existing Century illustration.
