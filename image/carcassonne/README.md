# 카르카손 아트·사운드

- 생성 도구: 내장 `image_gen.imagegen`, 2026-09-11.
- 사용 파일: [countryside.png](../../apps/web/public/images/carcassonne/countryside.png), 1536 × 1024. 홈 게임 카드와 대기실 배경에서 사용한다.
- 실제 타일·성벽·도로·수도원·미플: [art.tsx](../../apps/web/src/features/carcassonne/art.tsx)의 자체 SVG. 24종 지형은 공유 카탈로그의 판정 영역과 함께 회전한다. 기존 게임의 이미지 파일을 사용하지 않는다.
- 효과음: [sound.ts](../../apps/web/src/features/carcassonne/sound.ts)의 자체 Web Audio 합성. 목재 접촉·현·종 계열로 선택, 회전, 미플, 배치, 점수, 차례, 마감, 종료를 구분한다. 외부 음원/샘플/dependency 없음. 사용자 제스처 후 오디오를 활성화하고 음소거·볼륨 설정을 저장한다.

## 일러스트 생성 프롬프트

Use case: illustration-story. Create a beautiful original premium tabletop boardgame cover illustration for a browser medieval tile-laying game. Landscape wide composition 1536x1024. A sunlit fortified southern French medieval town with warm limestone crenellated walls and little terracotta-roof houses, a graceful abbey, winding pale country roads through lush patchwork meadows and small cypress trees. Elevated bird's-eye painterly perspective, richly detailed handcrafted gouache and watercolor illustration on subtle paper grain, charming sophisticated European boardgame art, warm late-afternoon golden light, deep forest-green and ochre palette, atmospheric blue hills. Lower foreground includes a few subtly square landscape plots suggesting tiles but no visible game UI, no meeple symbols. Town slightly right of center, calm darker meadow on left to support UI text overlay added by code. Artwork edge-to-edge, no frame, no text, no letters, no logos, no watermarks. Entirely original artwork, do not reproduce any existing board game cover.
