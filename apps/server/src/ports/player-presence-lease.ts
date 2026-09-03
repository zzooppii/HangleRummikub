import type {
  ConnectionStatus,
  PlayerId,
  RoomId,
} from "@hangul-rummikub/shared";

/**
 * A point-in-time observation of ephemeral Player presence that can also be
 * rechecked synchronously at the instant a canonical Room candidate commits.
 */
export interface PlayerPresenceLease {
  readonly connectionStatus: ConnectionStatus;
  /** Monotonic identity of the observed primary connection lifecycle. */
  readonly connectionGeneration: number | null;
  isCurrent(): boolean;
}

export interface PlayerPresenceLeaseReader {
  acquirePlayerPresenceLease(
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<PlayerPresenceLease>;
}
