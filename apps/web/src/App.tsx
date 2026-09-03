import { PROTOCOL_VERSION } from "@hangul-rummikub/shared";

import { useLobbyApp } from "./app/use-lobby-app.js";
import { HomeScreen } from "./features/lobby/HomeScreen.js";
import { LobbyScreen } from "./features/lobby/LobbyScreen.js";
import { createInvitationUrl } from "./lib/room-url.js";
import type { RealtimeConnectionState } from "./lib/realtime-client.js";

type ConnectionPresentation = Readonly<{
  label: string;
  tone: "connected" | "pending" | "offline" | "replaced";
}>;

function connectionPresentation(
  state: RealtimeConnectionState,
): ConnectionPresentation {
  switch (state) {
    case "CONNECTING":
      return { label: "서버 연결 중...", tone: "pending" };
    case "CONNECTED":
      return { label: "서버 연결됨", tone: "connected" };
    case "RECONNECTING":
      return { label: "서버 재연결 중...", tone: "pending" };
    case "DISCONNECTED":
      return { label: "서버 연결 끊김", tone: "offline" };
    case "SESSION_REPLACED":
      return { label: "다른 창에서 연결됨", tone: "replaced" };
  }
}

export function App() {
  const app = useLobbyApp();
  const connection = connectionPresentation(app.connectionState);
  const connectionLabel = app.operationLabel ?? connection.label;

  if (
    app.snapshot !== null &&
    app.route.kind === "ROOM" &&
    app.route.roomCode === app.snapshot.room.roomCode
  ) {
    const invitationUrl = createInvitationUrl(
      window.location.origin,
      app.snapshot.room.roomCode,
    );

    return (
      <div data-protocol-version={PROTOCOL_VERSION}>
        <LobbyScreen
          snapshot={app.snapshot}
          invitationUrl={invitationUrl}
          connectionLabel={connectionLabel}
          connectionTone={connection.tone}
          errorMessage={app.errorMessage}
          copyMessage={app.copyMessage}
          sessionReplaced={app.sessionReplaced}
          onCopyInvitation={() => app.copyInvitation(invitationUrl)}
          onGoHome={app.goHome}
        />
      </div>
    );
  }

  const routeErrorMessage =
    app.route.kind === "INVALID_ROOM_INVITATION"
      ? "유효한 6자리 방 코드가 아닌 초대 링크입니다."
      : app.route.kind === "NOT_FOUND"
        ? "찾을 수 없는 주소입니다. 홈에서 다시 시작해주세요."
        : null;
  const busyLabel =
    app.operationLabel ??
    (app.connectionState === "CONNECTED" ? null : connection.label);

  return (
    <div data-protocol-version={PROTOCOL_VERSION}>
      <HomeScreen
        nickname={app.nickname}
        roomCodeInput={app.roomCodeInput}
        invitationRoomCode={
          app.route.kind === "ROOM" ? app.route.roomCode : null
        }
        routeErrorMessage={routeErrorMessage}
        busyLabel={busyLabel}
        connectionLabel={connectionLabel}
        connectionTone={connection.tone}
        errorMessage={app.errorMessage}
        onNicknameChange={app.setNickname}
        onRoomCodeChange={app.setRoomCodeInput}
        onCreateRoom={app.createRoom}
        onJoinRoom={app.joinRoom}
        onGoHome={app.goHome}
      />
    </div>
  );
}
