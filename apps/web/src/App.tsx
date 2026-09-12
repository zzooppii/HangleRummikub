import { BurgundyScreen } from "./features/burgundy/BurgundyScreen.js";
import "./features/burgundy/burgundy.css";
import { LiarGameScreen } from "./features/liar-game/LiarGameScreen.js";
import { SpyfallGameScreen } from "./features/spyfall/SpyfallGameScreen.js";
import "./features/liar-game/liar-game.css";
import "./features/spyfall/spyfall.css";
import "./features/lobby/room-game-controls.css";
import { RoomGameControls } from "./features/lobby/RoomGameControls.js";
import { SplendorScreen } from "./features/splendor/SplendorScreen.js";
import { TrainScreen } from "./features/train/TrainScreen.js";
import { CenturyScreen } from "./features/century/CenturyScreen.js";
import { JaipurScreen } from "./features/jaipur/JaipurScreen.js";
import { LoveLetterScreen } from "./features/love-letter/LoveLetterScreen.js";
import { GuryongtuScreen } from "./features/guryongtu/GuryongtuScreen.js";
import { AzulScreen } from "./features/azul/AzulScreen.js";
import { VegasScreen } from "./features/vegas/VegasScreen.js";
import { CarcassonneScreen } from "./features/carcassonne/CarcassonneScreen.js";
import { ClueScreen } from "./features/clue/ClueScreen.js";
import { DuetScreen } from "./features/word-duet/DuetScreen.js";
import { SaboteurScreen } from "./features/saboteur/SaboteurScreen.js";
import { LostCitiesScreen } from "./features/lost-cities/LostCitiesScreen.js";
import "./features/splendor/splendor.css";
import "./features/train/train.css";
import "./features/century/century.css";
import "./features/jaipur/jaipur.css";
import "./features/love-letter/loveLetter.css";
import "./features/guryongtu/guryongtu.css";
import "./features/azul/azul.css";
import "./features/vegas/vegas.css";
import "./features/carcassonne/carcassonne.css";
import "./features/clue/clue.css";
import "./features/word-duet/duet.css";
import "./features/saboteur/saboteur.css";
import "./features/lost-cities/lost-cities.css";
import { IslandScreen } from "./features/island/IslandScreen.js";
import "./features/island/island.css";
import { CityExpandedScreen } from "./features/city-role/CityExpandedScreen.js";
import { CityExpansionLobby } from "./features/city-role/CityExpansionLobby.js";
import "./features/city-role/city-expansion.css";
import { HalliGalliScreen } from "./features/halli-galli/HalliGalliScreen.js";
import { WolfNightScreen } from "./features/wolf-night/WolfNightScreen.js";
import "./features/halli-galli/halli-galli.css";
import "./features/wolf-night/wolf-night.css";
import { DrawRelayScreen } from "./features/draw-relay/DrawRelayScreen.js";
import { SneakyLunchScreen } from "./features/sneaky-lunch/SneakyLunchScreen.js";
import "./features/sneaky-lunch/sneaky-lunch.css";
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
    roomControls: app.snapshot && app.compatibleSnapshot && app.route.kind === "ROOM" && app.route.roomCode === app.snapshot.room.roomCode && app.snapshotIncompatibility === null
      ? <RoomGameControls key={`${app.snapshot.room.roomId}:${app.snapshot.room.gameType}:${app.snapshot.room.phase}`} snapshot={app.snapshot}
          disabled={app.connectionState !== "CONNECTED" || app.sessionReplaced || app.reconnectNeeded || app.resumePending || app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
          onSelectGame={app.selectRoomGame} /> : null,
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
            onRematch={() => app.selectRoomGame("NUMBER_TILE")}
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
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced} onCommand={async command => { if (command.kind === "draw:rematch") app.selectRoomGame("DRAW_RELAY"); else await app.actDraw(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "ISLAND_SETTLERS") {
      return <ReconnectBoundary {...recovery}><IslandScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={async command => { if (command.kind === "island:rematch") app.selectRoomGame("ISLAND_SETTLERS"); else await app.actIsland(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "SPLENDOR") {
      return <ReconnectBoundary {...recovery}><SplendorScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={async command => { if (command.kind === "splendor:rematch") app.selectRoomGame("SPLENDOR"); else await app.actSplendor(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "TRAIN") {
      return <ReconnectBoundary {...recovery}><TrainScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actTrain} onRematch={() => app.selectRoomGame("TRAIN")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "CENTURY") {
      return <ReconnectBoundary {...recovery}><CenturyScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actCentury} onRematch={() => app.selectRoomGame("CENTURY")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "JAIPUR") {
      return <ReconnectBoundary {...recovery}><JaipurScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actJaipur} onRematch={() => app.selectRoomGame("JAIPUR")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "LOVE_LETTER") {
      return <ReconnectBoundary {...recovery}><LoveLetterScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actLoveLetter} onRematch={() => app.selectRoomGame("LOVE_LETTER")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "GURYONGTU") {
      return <ReconnectBoundary {...recovery}><GuryongtuScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actGuryongtu} onRematch={() => app.selectRoomGame("GURYONGTU")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "AZUL") {
      return <ReconnectBoundary {...recovery}><AzulScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actAzul} onRematch={() => app.selectRoomGame("AZUL")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }
    if (roomView.kind === "VEGAS") {
      return <ReconnectBoundary {...recovery}><VegasScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actVegas} onRematch={() => app.selectRoomGame("VEGAS")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }
    if (roomView.kind === "CARCASSONNE") {
      return <ReconnectBoundary {...recovery}><CarcassonneScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actCarcassonne} onRematch={() => app.selectRoomGame("CARCASSONNE")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }
    if (roomView.kind === "BURGUNDY") {
      return <ReconnectBoundary {...recovery}><BurgundyScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actBurgundy} onRematch={() => app.selectRoomGame("BURGUNDY")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }
    if (roomView.kind === "CLUE") {
      return <ReconnectBoundary {...recovery}><ClueScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actClue} onRematch={() => app.selectRoomGame("CLUE")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "WORD_DUET") {
      return <div className="duet-room-shell"><ReconnectBoundary {...recovery}><DuetScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actDuet} onRematch={() => app.selectRoomGame("WORD_DUET")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary></div>;
    }

    if (roomView.kind === "SABOTEUR") {
      return <ReconnectBoundary {...recovery}><SaboteurScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actSaboteur} onRematch={() => app.selectRoomGame("SABOTEUR")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }


    if (roomView.kind === "LOST_CITIES") {
      return <ReconnectBoundary {...recovery}><LostCitiesScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actLostCities} onRematch={() => app.selectRoomGame("LOST_CITIES")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "HALLI_GALLI") {
      return <ReconnectBoundary {...recovery}><HalliGalliScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={async command => { if (command.kind === "halli:rematch") app.selectRoomGame("HALLI_GALLI"); else await app.actHalli(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "WOLF_NIGHT") {
      return <ReconnectBoundary {...recovery}><WolfNightScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={async command => { if (command.kind === "wolf:rematch") app.selectRoomGame("WOLF_NIGHT"); else await app.actWolf(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "SPYFALL") {
      return <ReconnectBoundary {...recovery}><SpyfallGameScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actSpyfall} onRematch={() => app.selectRoomGame("SPYFALL")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "LIAR_GAME") {
      return <ReconnectBoundary {...recovery}><LiarGameScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={app.actLiar} onRematch={() => app.selectRoomGame("LIAR_GAME")}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "SNEAKY_LUNCH") {
      return <ReconnectBoundary {...recovery}><SneakyLunchScreen snapshot={roomView.snapshot}
        connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} onCommand={async command => { if (command.kind === "sneaky:rematch") app.selectRoomGame("SNEAKY_LUNCH"); else await app.actSneaky(command); }}
        onStart={app.startGame} onLeave={app.leaveRoom} onCopy={() => app.copyInvitation(invitationUrl)}
        pending={app.operationLabel !== null || app.roomLeavePending || app.gameStartPending}
        error={app.errorMessage} connectionLabel={connectionLabel}/></ReconnectBoundary>;
    }

    if (roomView.kind === "CITY_ROLE_PLAYING") {
      const current = roomView.snapshot;
      if (current.game.expansion) return <ReconnectBoundary {...recovery}><CityImpactLayer snapshot={current} connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} feedback={null}><CityExpandedScreen snapshot={current} connected={app.connectionState === "CONNECTED" && !app.sessionReplaced} pending={app.cityActionPending} errorMessage={app.errorMessage} onCommand={app.actCityExpansion} onAction={app.actCity} onLeave={app.leaveRoom}/></CityImpactLayer></ReconnectBoundary>;
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
      if (roomView.snapshot.game.expansion) return <ReconnectBoundary {...recovery}><CityImpactLayer snapshot={roomView.snapshot} connected={app.connectionState === "CONNECTED" && !app.sessionReplaced && !app.resumePending && !app.reconnectNeeded} feedback={null}><CityExpandedScreen snapshot={roomView.snapshot} connected={app.connectionState === "CONNECTED" && !app.sessionReplaced} pending={false} errorMessage={app.errorMessage} onCommand={app.actCityExpansion} onAction={app.actCity} onLeave={app.leaveRoom}/></CityImpactLayer></ReconnectBoundary>;
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
        {app.compatibleSnapshot?.kind === "PLATFORM_V2_CITY_ROLE" && app.compatibleSnapshot.platformSnapshot.room.phase === "LOBBY" && <CityExpansionLobby settings={app.compatibleSnapshot.platformSnapshot.room.settings} revision={app.compatibleSnapshot.platformSnapshot.versions.roomRevision} host={gameStartControl.isHost} connected={app.connectionState === "CONNECTED" && !app.sessionReplaced} count={app.compatibleSnapshot.platformSnapshot.room.players.length} onCommand={app.actCityExpansion}/>}
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
