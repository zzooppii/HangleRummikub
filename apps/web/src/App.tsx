import { DrawRelayScreen } from "./features/draw-relay/DrawRelayScreen.js";
import "./features/draw-relay/draw-relay.css";
import { ReconnectBoundary } from "./features/platform/ReconnectBoundary.js";

import { useLobbyApp } from "./app/use-lobby-app.js";
import { PlayingScreen } from "./features/game/PlayingScreen.js";
import { FinishedScreen } from "./features/game/FinishedScreen.js";
import { useTurnDraft } from "./features/game/use-turn-draft.js";
import { GemCardPlayingScreen } from "./features/gem-card/GemCardPlayingScreen.js";
import { GemCardFinishedScreen } from "./features/gem-card/GemCardFinishedScreen.js";
import "./features/gem-card/gem-card.css";
import { CityRolePlayingScreen } from "./features/city-role/CityRolePlayingScreen.js";
import { CityRoleFinishedScreen } from "./features/city-role/CityRoleFinishedScreen.js";
import { CityImpactLayer } from "./features/city-role/CityImpactLayer.js";
import "./features/city-role/city-role.css";
import "./features/city-role/city-role-help.css";
import "./features/city-role/city-tabletop.css";
import { NumberTileFinishedScreen } from "./features/number-tile/NumberTileFinishedScreen.js";
import { NumberTilePlayingScreen } from "./features/number-tile/NumberTilePlayingScreen.js";
import { useNumberTileTurnDraft } from "./features/number-tile/use-number-tile-turn-draft.js";
import { HomeScreen } from "./features/lobby/HomeScreen.js";
import { LobbyScreen } from "./features/lobby/LobbyScreen.js";
import { IncompatibleSnapshotScreen } from "./features/platform/IncompatibleSnapshotScreen.js";
import {
  getGameStartControl,
  type GameStartControl,
} from "./lib/game-start.js";
import { resolveRoomSnapshotView } from "./lib/room-snapshot-view.js";
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

type NumberTilePlayingRouteProps = Readonly<{
  snapshot: Parameters<typeof NumberTilePlayingScreen>[0]["snapshot"];
  connectionState: RealtimeConnectionState;
  connectionLabel: string;
  connectionTone: ConnectionPresentation["tone"];
  errorMessage: string | null;
  sessionReplaced: boolean;
  operationPending: boolean;
  submitPending: boolean;
  actionPending: boolean;
  commandRetryKind: ReturnType<typeof useLobbyApp>["numberCommandRetryKind"];
  actionFeedback: ReturnType<typeof useLobbyApp>["numberActionFeedback"];
  roomLeavePending: boolean;
  draftResetGeneration: number;
  onSubmit: ReturnType<typeof useLobbyApp>["submitNumberTurn"];
  onDraw: ReturnType<typeof useLobbyApp>["drawNumberTurn"];
  onPass: ReturnType<typeof useLobbyApp>["passNumberTurn"];
  onLeaveRoom: ReturnType<typeof useLobbyApp>["leaveRoom"];
  onGoHome: () => void;
}>;

function NumberTilePlayingRoute(props: NumberTilePlayingRouteProps) {
  const selfState = props.snapshot.game.playerStates.find(
    (player) => player.playerId === props.snapshot.self.playerId,
  );
  const isActivePlayer =
    props.snapshot.game.turn.activePlayerId === props.snapshot.self.playerId;
  const commandCapable =
    props.connectionState === "CONNECTED" &&
    !props.sessionReplaced &&
    !props.operationPending &&
    !props.roomLeavePending &&
    selfState?.forfeited !== true;
  const editorEnabled =
    commandCapable &&
    isActivePlayer &&
    !props.submitPending &&
    !props.actionPending &&
    props.commandRetryKind === null;
  const draft = useNumberTileTurnDraft(
    props.snapshot,
    editorEnabled,
    props.sessionReplaced,
    props.draftResetGeneration,
  );

  return (
    <NumberTilePlayingScreen
      snapshot={props.snapshot}
      connectionLabel={props.connectionLabel}
      connectionTone={props.connectionTone}
      errorMessage={props.errorMessage}
      sessionReplaced={props.sessionReplaced}
      turnDraft={draft}
      submitPending={props.submitPending}
      actionPending={props.actionPending}
      commandRetryKind={props.commandRetryKind}
      actionFeedback={props.actionFeedback}
      roomLeavePending={props.roomLeavePending}
      canSubmit={
        commandCapable &&
        isActivePlayer &&
        !props.actionPending &&
        (props.commandRetryKind === null || props.commandRetryKind === "SUBMIT")
      }
      canAct={
        commandCapable &&
        isActivePlayer &&
        !props.submitPending &&
        props.commandRetryKind !== "SUBMIT"
      }
      onSubmit={props.onSubmit}
      onDraw={props.onDraw}
      onPass={props.onPass}
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
  const recovery = {
    visible: app.snapshot !== null && app.reconnectNeeded && !app.sessionReplaced && app.snapshotIncompatibility === null,
    pending: app.resumePending,
    onReconnect: app.reconnect,
  };

  if (app.snapshotIncompatibility !== null) {
    return (
      <ReconnectBoundary {...recovery}>
        <IncompatibleSnapshotScreen onGoHome={app.goHome} />
      </ReconnectBoundary>
    );
  }

  if (
    app.snapshot !== null &&
    app.compatibleSnapshot !== null &&
    app.route.kind === "ROOM" &&
    app.route.roomCode === app.snapshot.room.roomCode
  ) {
    const invitationUrl = createInvitationUrl(
      window.location.origin,
      app.snapshot.room.roomCode,
    );
    const roomView = resolveRoomSnapshotView(app.compatibleSnapshot);

    if (roomView.kind === "INCOMPATIBLE") {
      return (
        <ReconnectBoundary {...recovery}>
          <IncompatibleSnapshotScreen onGoHome={app.goHome} />
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "PLAYING") {
      return (
        <ReconnectBoundary {...recovery}>
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
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "FINISHED") {
      return (
        <ReconnectBoundary {...recovery}>
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
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "NUMBER_TILE_PLAYING") {
      return (
        <ReconnectBoundary {...recovery}>
          <NumberTilePlayingRoute
            snapshot={roomView.snapshot}
            connectionState={app.connectionState}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            operationPending={app.operationLabel !== null}
            submitPending={app.turnSubmitPending}
            actionPending={app.turnActionPending}
            commandRetryKind={app.numberCommandRetryKind}
            actionFeedback={app.numberActionFeedback}
            roomLeavePending={app.roomLeavePending}
            draftResetGeneration={app.turnDraftResetGeneration}
            onSubmit={app.submitNumberTurn}
            onDraw={app.drawNumberTurn}
            onPass={app.passNumberTurn}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "NUMBER_TILE_FINISHED") {
      return (
        <ReconnectBoundary {...recovery}>
          <NumberTileFinishedScreen
            onRematch={app.rematchNumber}
            rematchPending={app.operationLabel !== null}
            snapshot={roomView.snapshot}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            roomLeavePending={app.roomLeavePending}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "DRAW_RELAY") {
      return <ReconnectBoundary {...recovery}><DrawRelayScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced} onCommand={app.actDraw}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "CITY_ROLE_PLAYING") {
      const current = roomView.snapshot;
      const canAct = app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.roomLeavePending &&
        app.operationLabel === null && current.game.window.activePlayerId === current.self.playerId &&
        current.game.playerStates.some(player => player.playerId === current.self.playerId && !player.forfeited);
      return <ReconnectBoundary {...recovery}><CityImpactLayer snapshot={current} connected={connection.tone === "connected" && !app.sessionReplaced} feedback={app.cityActionFeedback}><CityRolePlayingScreen snapshot={current}
        connectionLabel={connectionLabel} connectionTone={connection.tone} errorMessage={app.errorMessage}
        sessionReplaced={app.sessionReplaced} actionPending={app.cityActionPending} retryPending={app.cityRetryPending}
        actionFeedback={app.cityActionFeedback} selectionResetGeneration={app.citySelectionResetGeneration}
        roomLeavePending={app.roomLeavePending} canAct={canAct} onAction={app.actCity} onRetry={app.retryCityAction}
        onLeaveRoom={app.leaveRoom} onGoHome={app.goHome} /></CityImpactLayer></ReconnectBoundary>;
    }
    if (roomView.kind === "CITY_ROLE_FINISHED") {
      return <ReconnectBoundary {...recovery}><CityImpactLayer snapshot={roomView.snapshot} connected={connection.tone === "connected" && !app.sessionReplaced} feedback={app.cityActionFeedback}><CityRoleFinishedScreen snapshot={roomView.snapshot}
        connectionLabel={connectionLabel} connectionTone={connection.tone} errorMessage={app.errorMessage}
        sessionReplaced={app.sessionReplaced} actionFeedback={app.cityActionFeedback}
        actionPending={app.cityActionPending} retryPending={app.cityRetryPending} onRetry={app.retryCityAction}
        roomLeavePending={app.roomLeavePending} onLeaveRoom={app.leaveRoom} onGoHome={app.goHome} /></CityImpactLayer></ReconnectBoundary>;
    }

    if (roomView.kind === "GEM_CARD_PLAYING") {
      const selfState = roomView.snapshot.game.playerStates.find(
        (player) => player.playerId === roomView.snapshot.self.playerId,
      );
      const canAct = app.connectionState === "CONNECTED" &&
        !app.sessionReplaced && !app.roomLeavePending &&
        app.operationLabel === null && selfState?.forfeited === false &&
        roomView.snapshot.game.turn.activePlayerId === roomView.snapshot.self.playerId;
      return (
        <ReconnectBoundary {...recovery}>
          <GemCardPlayingScreen
            snapshot={roomView.snapshot}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            actionPending={app.gemActionPending}
            commandRetryKind={app.gemCommandRetryKind}
            actionFeedback={app.gemActionFeedback}
            selectionResetGeneration={app.gemSelectionResetGeneration}
            roomLeavePending={app.roomLeavePending}
            canAct={canAct}
            onCollect={app.collectGemResources}
            onPurchase={app.purchaseGemCard}
            onReserve={app.reserveGemCard}
            onYield={app.yieldGemTurn}
            onRetry={app.retryGemAction}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </ReconnectBoundary>
      );
    }

    if (roomView.kind === "GEM_CARD_FINISHED") {
      return (
        <ReconnectBoundary {...recovery}>
          <GemCardFinishedScreen
            snapshot={roomView.snapshot}
            actionFeedback={app.gemActionFeedback}
            connectionLabel={connectionLabel}
            connectionTone={connection.tone}
            errorMessage={app.errorMessage}
            sessionReplaced={app.sessionReplaced}
            roomLeavePending={app.roomLeavePending}
            onLeaveRoom={app.leaveRoom}
            onGoHome={app.goHome}
          />
        </ReconnectBoundary>
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
      <ReconnectBoundary {...recovery}>
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
      </ReconnectBoundary>
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
    <ReconnectBoundary {...recovery}>
      <HomeScreen
        savedGame={app.route.kind !== "ROOM" || app.savedGame?.roomCode === app.route.roomCode ? app.savedGame : null}
        resumePending={app.resumePending}
        onReconnect={app.reconnect}
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
    </ReconnectBoundary>
  );
}
