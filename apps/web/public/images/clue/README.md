# Clue original illustration assets

2026-09-11. Generated with the built-in image_gen tool; original artwork, no commercial art files copied. Approved output was inspected, then encoded as WebP with cwebp quality 86. Full source images remain in the task's generated_images folder. Atlas art is rendered as individual framed illustrations in the UI; labels are accessible HTML.

Files: rooms.webp (nine room atlas), suspects.webp (six portrait atlas), objects.webp (six evidence prop atlas), manor.webp (lobby/home scenery).

## Final prompts

rooms

Use case: illustration-story. Asset type: one seamless 3 by 3 square atlas of nine ornate mansion room illustrations for a premium mystery board game, no text, no letters, no numerals, no logos, no borders between cells, equal cells aligned exactly in a 3x3 grid. Each cell is a separate beautifully painted cutaway interior viewed from a high overhead angle, consistent scale, rich tactile gouache/digital oil illustration, emerald and burgundy shadows, warm amber lamps, intricate parquet, cozy mysterious evening, luxurious board game art. In exact reading order: top left kitchen with copper pots and cream tiled floor; top middle ballroom with grand piano and chandelier; top right glass conservatory with lush palms and moonlight; middle left dining room with long set table and crimson chairs; middle middle billiard room with green pool table; middle right library with tall bookcases and reading lamps; bottom left lounge with velvet sofas and fireplace; bottom middle grand entrance hall with checkerboard floor and sweeping staircase; bottom right study with writing desk and scattered sealed letters. Furnishings centered in each individual square, full bleed each cell. No people. Crisp elegant miniature diorama details that remain readable at small scale. Generate a high resolution square image.

suspects

Use case: illustration-story. Asset type: a single 3 columns by 2 rows character portrait atlas for a beautifully illustrated classic detective board game. Exactly six equal rectangular cells, edge-to-edge no gaps, no frames, no labels, no text or logos. Each cell features one original fictional adult, waist-up portrait centered, head entirely within its own cell, vintage 1930s detective novel gouache illustration, exquisite painterly shading, believable expressive faces, sophisticated costumes, gold rim lighting and dark moody mansion backgrounds, consistent visual style. Reading order: a confident woman with wavy auburn hair in scarlet evening dress; a distinguished older man with mustache in mustard gold military-inspired jacket; a thoughtful bespectacled dark-haired professor in plum purple velvet jacket; a poised dark-skinned man in forest green three-piece suit; a dignified older woman with silver hair in ivory blouse and black dress; a stylish mature woman in peacock blue silk dress and feather brooch. Original artistic identities, not likenesses of actors or reproductions of commercial game artwork. Portraits should be beautiful and richly detailed. Landscape 3:2 composition.

objects

Use case: illustration-story. Asset type: one 3 columns by 2 rows atlas of six evidence object illustrations for an elegant detective board game. Six equal cells, no gutters, no borders, no text or logos. Rich vintage oil/gouache painting, each single object centered on warm aged ivory parchment with subtle shadows, large and clearly recognizable, brass and dark steel patina, fine detailed edges. Reading order: antique brass candlestick with unlit ivory candle; neatly coiled thick rope; antique adjustable wrench; a plain short lead pipe; antique dagger resting flat; an antique revolver resting flat. Fictional board game props, no people, no injury, no blood. Each object stays inside its own cell with generous negative space. Landscape 3:2 image.

manor

Use case: illustration-story. Asset type: panoramic background illustration for the home card and lobby of an online detective board game. A magnificent old English manor at blue hour, glowing amber windows, ivy-covered stone facade, wrought iron gate and wet cobblestone path, lush carefully painted gardens, crescent moon and mist, cinematic storybook gouache and textured oil painting, refined premium tabletop game box art. Teal night sky, deep emerald foliage, warm brass light, subtle burgundy roses. Rich detailed architecture, inviting mystery, no people, no violence, no text, no logos. Wide landscape composition, central manor with room around it for interface text.


## 2026-09-12 보너스판 방 일러스트

- 파일: `rooms-bonus.webp`. built-in ImageGen 생성 후 WebP quality 90으로 저장. 기존 아트는 보존.
- 사용자 사진에 맞춘 방 이름: 주방, 욕실, 침실 / 식당, 당구실, 차고 / 거실, 현관, 서재.
- 최종 프롬프트:

> Use case: stylized-concept. Asset: square 3 by 3 room illustration atlas for a premium mystery board game. Nine equally sized square panels with very thin consistent dark separators exactly at one-third and two-thirds. Strict top-down overhead dollhouse rooms, intricate painted illustration, warm brass and dark walnut, jewel-toned accents, moody but readable lighting. Row 1 left to right: elegant tiled kitchen, luxurious bathroom with bathtub, large bedroom with bed. Row 2: dining room with long set table, billiard room with green pool table, garage with three vintage cars. Row 3: living room with sofas and fireplace, entrance vestibule with stairs and double front door, study with desk and books. Each cell fully fills its square. No text, no labels, no people, no letters, no watermarks. High detail, visually distinct furnishings, cohesive beautiful board game artwork.


## 어두운 복도 석재 질감

`corridor-stone.webp`: built-in ImageGen으로 생성, 최대 768px WebP quality 82로 저장. 각 칸은 서로 다른 질감 위치를 사용하며 CSS로 팔각 모서리·검은 줄눈·이동 강조를 표시한다. 새 dependency 없음.

최종 프롬프트:

> Game material texture, square flat seamless albedo of dark antique grey limestone, weathered manor corridor stone. Entire image one continuous stone surface with fine mineral mottling, dusty warm charcoal grey and very subtle desaturated lavender undertones, fine hairline veins and small scratches, softly worn satin surface. Moderate mid-dark grey values with detailed soft cloudy variation. Strict orthographic flat texture, evenly lit, no perspective, NO tile grid, no grout, no edges, no objects, no text, no symbols, no strong highlights, no directional shadows. Premium painted-realistic mystery board game material, tasteful and readable at small size.

검증: root typecheck/test(2,561개)/build 및 git diff --check 통과. 기존 500KB 초과 bundle 경고 유지. 보드 미리보기에는 실제 React 출력과 같은 석재 CSS/자산을 포함했다.
