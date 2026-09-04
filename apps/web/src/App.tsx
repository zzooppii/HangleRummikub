import { PROTOCOL_VERSION } from "@hangul-rummikub/shared";

import { useLobbyApp } from "./app/use-lobby-app.js";
import { PlayingScreen } from "./features/game/PlayingScreen.js";
import { FinishedScreen } from "./features/game/FinishedScreen.js";
import { useTurnDraft } from "./features/game/use-turn-draft.js";
import { HomeScreen } from "./features/lobby/HomeScreen.js";
import { LobbyScreen } from "./features/lobby/LobbyScreen.js";
import {
  getGameStartControl,
  type GameStartControl,
} from "./lib/game-start.js";
import { resolveLegacyHangulRoomView } from "./lib/legacy-hangul-room-view.js";
import { createInvitationUrl } from "./lib/room-url.js";
import type { RealtimeConnectionState } from "./lib/realtime-client.js";

type ConnectionPresentation = Readonly<{
  label: string;
  tone: "connected" | "pending" | "offline" | "replaced";
}>;

type PlayingRouteProps = Readonly<{
  snapshot: Parameters<typeof PlayingScreen>[0]["snapshot"];
  connectionState: RealtimeConnectionState;
  connectionLabel: string;
  connectionTone: ConnectionPresentation["tone"];
  errorMessage: string | null;
  sessionReplaced: boolean;
  turnSubmitPending: boolean;
  turnActionPending: boolean;
  roomLeavePending: boolean;
  turnDraftResetGeneration: number;
  onSubmitTurn: ReturnType<typeof useLobbyApp>["submitTurn"];
  onDrawTurn: ReturnType<typeof useLobbyApp>["drawTurn"];
  onPassTurn: ReturnType<typeof useLobbyApp>["passTurn"];
  onLeaveRoom: ReturnType<typeof useLobbyApp>["leaveRoom"];
  onGoHome: () => void;
}>;

function PlayingRoute(props: PlayingRouteProps) {
  const selfPlayer = props.snapshot.room.players.find(
    (player) => player.playerId === props.snapshot.self.playerId,
  );
  const commandCapable =
    props.connectionState === "CONNECTED" &&
    !props.sessionReplaced &&
    !props.roomLeavePending &&
    selfPlayer?.forfeited !== true;
  const turnDraft = useTurnDraft(
    props.snapshot,
    commandCapable,
    props.sessionReplaced,
    props.turnDraftResetGeneration,
  );

  return (
    <PlayingScreen
      snapshot={props.snapshot}
      connectionLabel={props.connectionLabel}
      connectionTone={props.connectionTone}
      errorMessage={props.errorMessage}
      sessionReplaced={props.sessionReplaced}
      turnDraft={turnDraft}
      turnSubmitPending={props.turnSubmitPending}
      turnActionPending={props.turnActionPending}
      roomLeavePending={props.roomLeavePending}
      canSubmit={
        commandCapable &&
        !props.turnActionPending
      }
      canAct={
        commandCapable &&
        !props.turnSubmitPending
      }
      onSubmitTurn={props.onSubmitTurn}
      onDrawTurn={props.onDrawTurn}
      onPassTurn={props.onPassTurn}
      onLeaveRoom={props.onLeaveRoom}
      onGoHome={props.onGoHome}
    />
  );
}

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
    const roomView = resolveLegacyHangulRoomView(app.snapshot);

    if (roomView.kind === "PLAYING") {
      return (
        <div data-protocol-version={PROTOCOL_VERSION}>
          <PlayingRoute
            snapshot={roomView.snapshot}
            connectionState={app.connectionState}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            turnSubmitPending={app.turnSubmitPending}
            turnActionPending={app.turnActionPending}
            roomLeavePending={app.roomLeavePending}
            turnDraftResetGeneration={app.turnDraftResetGeneration}
            onSubmitTurn={app.submitTurn}
            onDrawTurn={app.drawTurn}
            onPassTurn={app.passTurn}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </div>
      );
    }

    if (roomView.kind === "FINISHED") {
      return (
        <div data-protocol-version={PROTOCOL_VERSION}>
          <FinishedScreen
            snapshot={roomView.snapshot}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            roomLeavePending={app.roomLeavePending}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </div>
      );
    }

    const snapshotControl = getGameStartControl(
      app.snapshot,
      app.gameStartPending ||
        app.roomLeavePending ||
        app.operationLabel !== null,
    );
    const gameStartControl: GameStartControl =
      snapshotControl.isHost &&
      snapshotControl.canStart &&
      (app.connectionState !== "CONNECTED" || app.sessionReplaced)
        ? {
            isHost: true,
            canStart: false,
            guidance: "서버에 연결되면 게임을 시작할 수 있습니다.",
          }
        : snapshotControl;

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
          gameStartControl={gameStartControl}
          roomLeavePending={app.roomLeavePending}
          onCopyInvitation={() => app.copyInvitation(invitationUrl)}
          onStartGame={app.startGame}
          onLeaveRoom={app.leaveRoom}
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
