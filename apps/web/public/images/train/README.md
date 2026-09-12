# TRAIN illustration assets

2026-09-12, OpenAI image_gen, newly generated original illustrations. The user's original Ticket to Ride board/component screenshots informed the physical component types and railway atmosphere; no screenshot was embedded or traced into these images. No publisher logos, card lettering or original decorative frames were requested.

- `journey.jpg`: original brass/dark-green steam locomotive, landscape and railway travel lobby artwork.
- `carriages.jpg`: nine equal cells, 3 columns × 3 rows, ordered RED/ORANGE/YELLOW, GREEN/BLUE/PURPLE, WHITE/BLACK/LOCOMOTIVE. CSS background position selects the complete cell without separate image files.

Prompts: original premium railway board-game illustration, late-19th-century North American railway in detailed gouache/engraving style, parchment/antique brass/forest-green/burgundy/ivory palette. Journey: large locomotive lower right, mountains, sunset, pines and small station, quieter upper-left area for HTML text. Carriages: red boxcar, orange lumber wagon, yellow covered freight, green caboose, blue passenger car, purple sleeper, ivory refrigerated car, black coal hopper, golden locomotive with a subtle rainbow sky; complete side profiles and margins in a 3×3 equal atlas. No words, lettering, logos, watermark or outer frame.

Generation PNGs (1536×1024) are retained outside the repository in the Codex generated_images directory: `exec-fa7da3e0-8fe5-4a4b-b56e-98942370be5c.png` (journey), `exec-188336d2-9583-4a19-bd40-c101768eddb3.png` (carriages). Delivery JPEGs were converted with macOS sips, quality 85/90 respectively. Both originals were visually inspected; actual market/hand card crops were checked in browser. Geography, routes, destination cards and plastic-like train pieces are implemented as SVG/CSS separately.

Sound effects are synthesized by `src/features/train/sound.ts` through Web Audio; there are no downloaded audio assets or additional audio dependencies.
