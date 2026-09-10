import {
  PROTOCOL_VERSION,
  type GameStartCommand,
  type GameType,
  type RequestId,
  type RoomRevision,
} from "@hangul-rummikub/shared";

const MIN_GAME_PLAYERS = 2;

export type GameStartControl = Readonly<{
  isHost: boolean;
  canStart: boolean;
  guidance: string;
}>;

export type GameStartSnapshot = Readonly<{
  room: Readonly<{
    gameType?: GameType;
    phase: "LOBBY" | "PLAYING" | "FINISHED";
    players: readonly Readonly<{
      playerId: string;
      isHost: boolean;
      isReady?: boolean | undefined;
      connectionStatus: "CONNECTED" | "OFFLINE";
    }>[];
  }>;
  self: Readonly<{ playerId: string }>;
}>;

export function getGameStartControl(
  snapshot: GameStartSnapshot,
  commandPending: boolean,
): GameStartControl {
  const minPlayers = snapshot.room.gameType === "DRAW_RELAY" || snapshot.room.gameType === "WOLF_NIGHT" || snapshot.room.gameType === "ISLAND_SETTLERS" ? 3 : MIN_GAME_PLAYERS;
  const maxPlayers = snapshot.room.gameType === "WOLF_NIGHT" ? 10 : snapshot.room.gameType === "DRAW_RELAY" || snapshot.room.gameType === "SNEAKY_LUNCH" ? 8 : (snapshot.room.gameType === "CITY_ROLE" || snapshot.room.gameType === "HALLI_GALLI") ? 6 : 4;
  const self = snapshot.room.players.find(
    (player) => player.playerId === snapshot.self.playerId,
  );

  if (self?.isHost !== true) {
    return {
      isHost: false,
      canStart: false,
      guidance: "방장이 게임을 시작할 수 있습니다.",
    };
  }

  if (snapshot.room.phase !== "LOBBY") {
    return {
      isHost: true,
      canStart: false,
      guidance: "대기실에서만 게임을 시작할 수 있습니다.",
    };
  }

  if (
    snapshot.room.players.length < minPlayers ||
    snapshot.room.players.length > maxPlayers
  ) {
    return {
      isHost: true,
      canStart: false,
      guidance: `참가자가 ${minPlayers}~${maxPlayers}명일 때 시작할 수 있습니다.`,
    };
  }

  if (
    snapshot.room.players.some(
      (player) => player.connectionStatus !== "CONNECTED",
    )
  ) {
    return {
      isHost: true,
      canStart: false,
      guidance: "모든 참가자가 접속 중일 때 시작할 수 있습니다.",
    };
  }

  if (commandPending) {
    return {
      isHost: true,
      canStart: false,
      guidance: "진행 중인 요청이 끝나면 게임을 시작할 수 있습니다.",
    };
  }

  return {
    isHost: true,
    canStart: true,
    guidance: "지금 게임을 시작할 수 있습니다.",
  };
}

export function createOrReuseGameStartCommand(
  pendingCommand: GameStartCommand | null,
  expectedRoomRevision: RoomRevision,
  createId: () => RequestId,
): GameStartCommand {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  return {
    kind: "game:start",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedRoomRevision,
    payload: {},
  };
}
