# 보드게임 서버

친구들과 브라우저에서 함께 즐기는 실시간 온라인 보드게임 플랫폼이다. 한글 타일 게임으로 시작해 여러 타일·카드·파티게임과 섬 개척을 지원한다.

하나의 Room/초대 코드 체계에서 게임을 선택하고 참가할 수 있다. 서버가 게임 규칙·차례·시간·결과를 판정하며, 세션 기반 재접속과 플레이어별 비공개 정보 보호를 제공한다. Web과 Socket.IO 서버는 production에서 하나의 origin으로 제공한다.

## 지원 게임

| 게임 | 내용 | 규칙 / 상세 문서 |
| --- | --- | --- |
| 한글 타일 게임 (`HANGUL_TILE`) | 한글 타일로 단어를 구성하는 게임 | [한글 규칙](./docs/GAME_RULES.md) |
| 숫자 타일 게임 (`NUMBER_TILE`) | GROUP/RUN 구성과 테이블 재배열, 패를 비운 순서에 따른 순위, 같은 방 재게임 | [숫자 규칙](./docs/NUMBER_TILE_GAME_RULES.md) · [순위/재게임](./docs/NUMBER_TILE_PLACEMENT_REMATCH.md) |
| 보석 카드 게임 (`GEM_CARD`) | 자원 수집·예약·구매와 영구 할인을 활용하는 카드 게임 | [보석 규칙](./docs/GEM_CARD_GAME_RULES.md) |
| 스플렌더 (`SPLENDOR`) | 2~4명이 보석과 영구 할인으로 명성을 겨루는 전략 게임. 방장이 기본판 / 도시 확장을 선택 | [스플렌더 규칙](./docs/SPLENDOR_GAME_RULES.md) · [구현과 디자인](./docs/SPLENDOR_ARCHITECTURE.md) |
| 비밀 도시 게임 (`CITY_ROLE`) | 비밀 역할 선택과 도시 건설, 명소 6종의 특수 능력 | [도시 규칙](./docs/CITY_ROLE_GAME_RULES.md) · [명소 V2](./docs/CITY_ROLE_GAME_RULES_V2.md) |
| 그림 릴레이 (`DRAW_RELAY`) | 3~8명이 그림과 추측을 전달하고 함께 공개하는 파티게임 | [그림 릴레이 규칙](./docs/DRAW_RELAY_GAME_RULES.md) |
| 몰래 한입 (`SNEAKY_LUNCH`) | 2~8명이 선생님 눈을 피해 도시락을 비우는 교실 파티게임 | [몰래 한입 규칙](./docs/SNEAKY_LUNCH_GAME_RULES.md) · [로컬 검증](./docs/SNEAKY_LUNCH_LOCAL_RELEASE_GATE.md) |
| 섬 개척 (`ISLAND_SETTLERS`) | 3~4명이 자원을 생산·거래하고 마을과 도시를 건설하는 섬 전략 게임. 차례당 2분, 시간 초과 자동 처리 | [섬 개척 규칙](./docs/ISLAND_GAME_RULES.md) · [구현과 검증](./docs/ISLAND_ARCHITECTURE.md) |
| 코드네임 듀엣 (`WORD_DUET`) | 2명이 서로 다른 비밀 지도로 힌트를 주고 15요원을 찾는 협동 단어 게임. 시간 제한 없음 | [듀엣 규칙](./docs/DUET_GAME_RULES.md) · [구현과 디자인](./docs/DUET_ARCHITECTURE.md) |
| 자이푸르 (`JAIPUR`) | 정확히 2명이 상품과 낙타를 교환하고 판매해 인장 2개를 겨루는 카드 게임. 시간 제한 없음 | [자이푸르 규칙](./docs/JAIPUR_GAME_RULES.md) · [구현과 검증](./docs/JAIPUR_ARCHITECTURE.md) |
| 아줄 (`AZUL`) | 2~4명이 도자기 타일을 골라 벽을 완성하는 전략 게임. 자동 정산·시간 제한 없음 | [아줄 규칙](./docs/AZUL_GAME_RULES.md) · [화면과 검증](./docs/AZUL_ARCHITECTURE.md) |

현재 소스의 기능과 실제 public 배포 상태는 구분한다. 기존 3게임의 공개 검증 이력은 [release gate](./docs/THREE_GAME_PLATFORM_RELEASE_GATE.md), CITY의 로컬 검증 이력은 [CITY local gate](./docs/CITY_ROLE_LOCAL_RELEASE_GATE.md)에 기록되어 있다. 이후 변경이 모두 Railway에 배포되었다는 의미는 아니다.

## 프로젝트 구성

- `apps/web`: 브라우저 UI와 게임별 화면
- `apps/server`: 서버 권위형 게임 도메인, Room/세션, Socket.IO
- `packages/shared`: 공용 DTO와 런타임 검증 계약
- `docs`: 게임 규칙, 설계, 검증 기록
- [`image/city`](./image/city/README.md): CITY 건물 30종의 원본 PNG 일러스트
- `apps/web/public/city-art/illustrated-v1`: 게임에서 사용하는 최적화 WebP 이미지

CITY 카드 아트는 자체 제작된 독립 일러스트다. 원본은 보관용이며 Web에서는 경량 배포 이미지를 사용한다. [카드 비주얼 상세](./docs/CITY_ROLE_CARD_VISUAL_POLISH.md)

## 요구 환경

- Node.js `^20.18.0` 또는 `>=22.0.0` (확인 환경: `v20.18.2`)
- npm `>=10.8.2`

## 설치와 실행

```bash
npm install
npm run dev
```

- web: <http://localhost:5173>
- server health: <http://localhost:3001/health>

server는 `PORT` 환경 변수가 있으면 해당 port를 사용하고, 없으면 `3001`을 사용한다.
개발 중 web은 같은 origin의 `/socket.io` 경로를 사용하며 Vite가 이를 `http://127.0.0.1:3001`로 proxy한다.

## 로컬 플레이 확인

Home에서 게임을 선택하고 닉네임으로 방을 만든 뒤, 초대 URL을 다른 브라우저 세션에 공유한다. 참가자들이 연결되면 방장이 게임을 시작한다. 같은 브라우저 프로필의 여러 탭보다 별도 프로필/시크릿 창을 이용하면 독립 참가자 테스트를 구분하기 쉽다.

### 한글 타일 게임 상세 확인

1. <http://localhost:5173>에서 Player A의 닉네임을 입력하고 Room을 만든다.
2. Lobby의 초대 URL을 별도 browser tab 또는 session에서 연다.
3. Player B의 닉네임을 입력해 참가하고 양쪽 Player 목록, Host와 연결 상태가 일치하는지 확인한다.
4. 두 Player가 모두 `접속 중`일 때 Player A의 `게임 시작` 버튼으로 Game을 시작한다. Host가 아니거나 참가자가 OFFLINE이면 actionable start control을 제공하지 않는다.
5. 양쪽 화면이 같은 현재 차례와 Player 수를 보여주고, 2인 기준 bag 잔여 개수가 자음 `81`, 모음 `47`, 각자의 `내 타일`이 `14개`인지 확인한다.
6. Player B tab을 새로고침해 같은 Player와 PLAYING 상태, rack 개수, turnOrder가 재배분 없이 복원되는지 확인한다.
7. 현재 active Player 화면에서 WordGroup과 syllable을 추가하고 rack Tile의 symbol을 골라 초성·중성·종성 slot에 배치한다. Submit 전에는 다른 Player 화면의 canonical Board가 바뀌지 않는다.
8. Tile 이동, undo/reset, Submit 또는 Draw를 확인한다. accepted command 뒤에는 새 authoritative snapshot과 다음 Turn이 표시된다.
9. active Player가 시간을 넘기면 server timer가 penalty를 적용하고 다음 Turn으로 진행하는지 확인한다.
10. disconnect/resume, explicit leave/forfeit와 FINISHED result 화면을 확인한다. active Player tab을 새로고침하면 session은 resume되지만 미제출 TurnDraft는 폐기된다.

초대 URL은 `/room/{ROOM_CODE}` 형식이며 credential을 포함하지 않는다. 활성 tab의 credential은 `sessionStorage`로 분리하고, 최근 게임의 복귀 정보는 같은 origin의 `localStorage`에도 저장한다. 저장 정보가 남아 있으면 새로고침·tab 닫기/열기 뒤 Home의 **진행 중인 게임 → 다시 접속하기**로 기존 자리에 복귀할 수 있다. 다른 기기에서 nickname만으로 자리를 복구할 수 없으며, 저장소 삭제/차단이나 server restart 뒤 복구는 보장하지 않는다. 자세한 동작과 제한은 [재접속 UX](./docs/RECONNECT_UX.md)를 참고한다.

TurnDraft의 rack/Board 편집은 해당 tab 메모리에서만 동작한다. 모든 canonical mutation과 deadline 판정은 server가 수행한다.

## 초기 한글 MVP 검증 이력과 운영 제한

아래는 초기 한글 게임의 검증 기록이다. 이후 추가된 게임의 규칙과 검증 범위는 위 게임별 문서를 따른다.

- 실제 Socket.IO 통합 테스트에서 2·3·4인 lifecycle, 5번째 참가 거절, non-Host start, stale/duplicate command, unauthorized Tile probe와 reconnect storm을 검증한다.
- Codex in-app browser에서 1280×720 desktop, 390×844와 320×568 viewport의 Home/Lobby/Playing 흐름, tap-to-place, local-only draft, Draw, timeout, refresh discard와 presence-only draft 보존을 확인했다.
- browser harness가 엔진/version을 공개하지 않아 Chromium/WebKit별 호환성을 따로 인증하지 않았다. Safari/WebKit과 실제 모바일 기기는 아직 별도 확인 대상이다.
- 서버와 session은 single-process memory에만 존재하며 process restart 뒤 복구되지 않는다. 사전은 production 사전이 아닌 deterministic `test-dictionary-v1`이다.
- production single-origin 정적 제공과 Railway public lifecycle은 <https://hanglerummikub-production.up.railway.app>에서 검증했다.

## 품질 gate

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

`npm test`는 Node.js 내장 test runner로 shared contract, web 순수 로직과 server test를 실제 실행한다.

## Build output

- shared: `packages/shared/dist`
- web: `apps/web/dist`
- server: `apps/server/dist`

## Production single-origin 실행

production build와 단일 Node server를 repository root에서 실행한다.

```bash
npm run build
PORT=4100 npm start
```

`npm start`는 watcher나 Vite dev server 없이 빌드된 server entry 하나만 실행한다. 이 server는 `0.0.0.0`과 `PORT`에 bind하고 다음을 한 origin에서 제공한다.

- `GET /health`: secret-free readiness response
- `GET /assets/*`: Vite hashed asset, 1년 immutable cache
- `GET /`, `GET /room/{ROOM_CODE}`와 확장자 없는 미지의 browser route: cache하지 않는 SPA `index.html`
- `/socket.io/*`: polling 및 WebSocket transport

SPA fallback은 GET에만 적용하며 `/health`, `/api`, `/socket.io`, `/assets`와 file-like path를 가로채지 않는다. production web build 또는 `index.html`이 없으면 server는 API-only 상태로 조용히 시작하지 않고 fail-fast한다. browser Socket.IO client는 endpoint를 hard-code하지 않고 현재 origin의 `/socket.io`를 사용하며, invitation URL도 `window.location.origin + /room/{ROOM_CODE}`로 만든다.

## Railway production 배포

Public URL: <https://hanglerummikub-production.up.railway.app>

아래는 기존 배포 설정과 확인 이력이다. 최신 로컬/source 변경의 public 배포 여부는 별도로 확인해야 한다. README 제목 변경은 GitHub 저장소 이름이나 Railway service/domain을 자동으로 변경하지 않는다.

현재 Railway 신규 service에서는 legacy `railway.json`/`railway.toml` Config as Code를 새로 적용할 수 없으므로 deprecated file을 repository에 추가하지 않는다. project-level `.railway/railway.ts`는 linked Railway project/service 이름과 실제 account state를 읽은 뒤 도입해야 하며, 이 repository에는 Railway SDK나 CLI를 application dependency로 추가하지 않았다.

Railway Dashboard에서 GitHub repository root `/`를 사용하는 service **하나만** 만들고 다음 값을 확인한다.

| 설정 | 값 |
| --- | --- |
| Builder | Railpack |
| Root Directory | `/` |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | 60초 이상 |
| Restart Policy | On Failure |
| Region/Replica | 실제 account에서 제공되는 한 region, replica 정확히 `1` |
| Public Networking | healthcheck 성공 뒤 Railway generated domain 생성 |

monorepo 자동 import가 `apps/web`과 `apps/server`를 별도 service로 제안하더라도 사용하지 않는다. public application service는 하나여야 하며 Redis, PostgreSQL, Volume 또는 별도 frontend service를 추가하지 않는다.

다음을 실제 generated HTTPS domain에서 확인했다.

1. `/health`, `/`, `/room/ABC234`와 HTML이 참조한 `/assets/*`가 성공한다.
2. 같은 origin의 Socket.IO가 연결되고 browser console에 CORS, mixed-content 또는 asset 오류가 없다.
3. 독립 session A/B가 create → join → start를 완료한다.
4. 양쪽 private rack projection이 분리되고 Draw, snapshot fan-out과 다음 turn이 동작한다.
5. refresh/resume이 같은 playerId, gameId와 rack으로 복구한다.
6. Railway Dashboard에 replica가 정확히 1개로 표시된다. 이 항목은 사용자가 확인했으며 multi-region 설정은 확인하지 않았다.

Codex는 public HTTPS에서 `/health`, Home, hashed asset, direct Room route와 reload, actual WebSocket connection, 독립 session A/B의 create → join → start, private rack 분리, Draw fan-out과 refresh/resume를 검증했다. 사용자는 Railway service `HangleRummikub` 하나가 GitHub source의 `master`와 연결되고 Dashboard에 `1 Replica`가 표시되는 것을 확인했다. Railway 내부 build/healthcheck log와 region·multi-region 설정은 Codex가 직접 확인하지 않았다.

Railway deploy/restart 또는 process crash 시 process-memory Room, Game과 session은 모두 사라질 수 있으므로 친구들과 진행 중인 Game에서 재배포하지 않는다. generated domain이면 충분하며 custom domain은 필요하지 않다. production 사전도 아직 deterministic `test-dictionary-v1`이다.
