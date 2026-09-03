import {
  PROTOCOL_VERSION,
  type GameStartCommand,
  type RequestId,
  type RoomRevision,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

const MIN_GAME_PLAYERS = 2;
const MAX_GAME_PLAYERS = 4;

export type GameStartControl = Readonly<{
  isHost: boolean;
  canStart: boolean;
  guidance: string;
}>;

export function getGameStartControl(
  snapshot: StateSnapshot,
  commandPending: boolean,
): GameStartControl {
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
    snapshot.room.players.length < MIN_GAME_PLAYERS ||
    snapshot.room.players.length > MAX_GAME_PLAYERS
  ) {
    return {
      isHost: true,
      canStart: false,
      guidance: "참가자가 2~4명일 때 시작할 수 있습니다.",
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
