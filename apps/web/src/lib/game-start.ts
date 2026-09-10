import {
  PROTOCOL_VERSION,
  GAME_PLAYER_LIMITS,
  type GameStartCommand,
  type GameType,
  type RequestId,
  type RoomRevision,
} from "@hangul-rummikub/shared";

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
  const { min: minPlayers, max: maxPlayers } = GAME_PLAYER_LIMITS[snapshot.room.gameType ?? "HANGUL_TILE"];
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
      guidance: minPlayers === maxPlayers ? `참가자가 정확히 ${minPlayers}명일 때 시작할 수 있습니다.` : `참가자가 ${minPlayers}~${maxPlayers}명일 때 시작할 수 있습니다.`,
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
