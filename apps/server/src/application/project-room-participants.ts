import type {
  ConnectionStatus,
  PlatformPlayerViewV2,
  PlayerId,
} from "@hangul-rummikub/shared";

import type { PlayerRecord } from "../model/persistence.js";

export function projectRoomParticipants(
  players: readonly Pick<PlayerRecord, "playerId" | "nickname">[],
  hostPlayerId: PlayerId | null,
  statuses: ReadonlyMap<PlayerId, ConnectionStatus>,
): PlatformPlayerViewV2[] {
  return players.map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    isHost: player.playerId === hostPlayerId,
    connectionStatus: statuses.get(player.playerId) ?? "OFFLINE",
  }));
}
