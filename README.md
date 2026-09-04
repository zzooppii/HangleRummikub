# 한글 루미큐브

Roadmap Phase 17까지의 첫 playable MVP와 통합 안정화를 완료한 실시간 한글 타일 게임이다. Room 생성·참가부터 server-authoritative Game start, browser-only TurnDraft, Submit/Draw/Pass/timeout, disconnect/resume/leave/forfeit, 다섯 종료 reason과 Room cleanup까지 하나의 lifecycle로 연결되어 있다.

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

## 로컬 MVP 확인

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

초대 URL은 `/room/{ROOM_CODE}` 형식이며 credential을 포함하지 않는다. 같은 tab의 새로고침 복구 정보는 `sessionStorage`에만 저장되므로 tab/browser session 종료나 server restart 뒤 복구는 보장하지 않는다.

TurnDraft의 rack/Board 편집은 해당 tab 메모리에서만 동작한다. 모든 canonical mutation과 deadline 판정은 server가 수행한다.

## Release candidate 검증 범위

- 실제 Socket.IO 통합 테스트에서 2·3·4인 lifecycle, 5번째 참가 거절, non-Host start, stale/duplicate command, unauthorized Tile probe와 reconnect storm을 검증한다.
- Codex in-app browser에서 1280×720 desktop, 390×844와 320×568 viewport의 Home/Lobby/Playing 흐름, tap-to-place, local-only draft, Draw, timeout, refresh discard와 presence-only draft 보존을 확인했다.
- browser harness가 엔진/version을 공개하지 않아 Chromium/WebKit별 호환성을 따로 인증하지 않았다. Safari/WebKit과 실제 모바일 기기는 아직 별도 확인 대상이다.
- 서버와 session은 single-process memory에만 존재하며 process restart 뒤 복구되지 않는다. 사전은 production 사전이 아닌 deterministic `test-dictionary-v1`이다.
- production single-origin 정적 제공과 Railway 배포는 Phase 18 범위다.

## 품질 gate

```bash
npm run typecheck
npm test
npm run build
```

`npm test`는 Node.js 내장 test runner로 shared contract, web 순수 로직과 server test를 실제 실행한다.

## Build output

- shared: `packages/shared/dist`
- web: `apps/web/dist`
- server: `apps/server/dist`
