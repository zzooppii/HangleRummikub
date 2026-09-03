# 한글 루미큐브

Roadmap Phase 11까지의 npm workspaces, Room/Session 기반, 브라우저 Lobby, server-authoritative `game:start`와 최소 PLAYING 상태를 구현한 프로젝트다. TurnDraft와 시작 이후 gameplay command는 아직 구현하지 않았다.

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

## Lobby와 Game start 개발 확인

1. <http://localhost:5173>에서 Player A의 닉네임을 입력하고 Room을 만든다.
2. Lobby의 초대 URL을 별도 browser tab 또는 session에서 연다.
3. Player B의 닉네임을 입력해 참가하고 양쪽 Player 목록, Host와 연결 상태가 일치하는지 확인한다.
4. 두 Player가 모두 `접속 중`일 때 Player A의 `게임 시작` 버튼으로 Game을 시작한다. Host가 아니거나 참가자가 OFFLINE이면 actionable start control을 제공하지 않는다.
5. 양쪽 화면이 같은 현재 차례와 Player 수를 보여주고, 2인 기준 bag 잔여 개수가 자음 `81`, 모음 `47`, 각자의 `내 타일`이 `14개`인지 확인한다.
6. Player B tab을 새로고침해 같은 Player와 PLAYING 상태, rack 개수, turnOrder가 재배분 없이 복원되는지 확인한다.

초대 URL은 `/room/{ROOM_CODE}` 형식이며 credential을 포함하지 않는다. 같은 tab의 새로고침 복구 정보는 `sessionStorage`에만 저장되므로 tab/browser session 종료나 server restart 뒤 복구는 보장하지 않는다.

Phase 11 화면은 canonical snapshot의 시작 상태만 표시한다. rack/Board 편집, Submit, draw, timeout countdown과 종료는 후속 Phase 범위다.

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
