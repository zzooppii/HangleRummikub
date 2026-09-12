import { TrainClientCommandSchema, type TrainClientCommand } from "@hangul-rummikub/shared";
import { CenturyClientCommandSchema, type CenturyClientCommand } from "@hangul-rummikub/shared";
import { RoomPreparationCommandSchema, type RoomPreparationCommand } from "@hangul-rummikub/shared";
import { SplendorClientCommandSchema, type SplendorClientCommand } from "@hangul-rummikub/shared";
import { JaipurClientCommandSchema, type JaipurClientCommand } from "@hangul-rummikub/shared";
import { LoveLetterClientCommandSchema, type LoveLetterClientCommand } from "@hangul-rummikub/shared";
import { GuryongtuClientCommandSchema, type GuryongtuClientCommand } from "@hangul-rummikub/shared";
import { AzulClientCommandSchema, type AzulClientCommand } from "@hangul-rummikub/shared";
import { VegasClientCommandSchema, type VegasClientCommand } from "@hangul-rummikub/shared";
import { BurgundyClientCommandSchema, type BurgundyClientCommand } from "@hangul-rummikub/shared";
import { CarcassonneClientCommandSchema, type CarcassonneClientCommand } from "@hangul-rummikub/shared";
import { ClueClientCommandSchema, type ClueClientCommand } from "@hangul-rummikub/shared";
import { DuetClientCommandSchema, type DuetClientCommand } from "@hangul-rummikub/shared";
import { SaboteurClientCommandSchema, type SaboteurClientCommand } from "@hangul-rummikub/shared";
import { LostCitiesClientCommandSchema, type LostCitiesClientCommand } from "@hangul-rummikub/shared";
import { CityExpansionClientCommandSchema, type CityExpansionClientCommand } from "@hangul-rummikub/shared";
import { IslandClientCommandSchema, type IslandClientCommand } from "@hangul-rummikub/shared";
import { HalliClientCommandSchema, type HalliClientCommand } from "@hangul-rummikub/shared";
import { WolfClientCommandSchema, type WolfClientCommand } from "@hangul-rummikub/shared";
import { LiarClientCommandSchema, type LiarClientCommand } from "@hangul-rummikub/shared";
import { SpyfallClientCommandSchema, type SpyfallClientCommand } from "@hangul-rummikub/shared";
import { DrawClientCommandSchema, type DrawClientCommand } from "@hangul-rummikub/shared";
import { SneakyClientCommandSchema, type SneakyClientCommand } from "@hangul-rummikub/shared";
import { safeParse as parseRematch } from "valibot";
import { NumberRematchCommandSchema, type NumberRematchCommand } from "@hangul-rummikub/shared";
import {
  validateCityClientCommand,
  validateCitySelectRoleWireAck,
  validateCityTakeIncomeWireAck,
  validateCityDrawBuildingCardsWireAck,
  validateCityChooseBuildingCardWireAck,
  validateCityUseRoleAbilityWireAck,
  validateCityBuildWireAck,
  validateCityEndTurnWireAck,
  type CityClientCommand,
  type CityActionWireAck,
  validateGemCollectCommand,
  validateGemCollectWireAck,
  validateGemPurchaseCommand,
  validateGemPurchaseWireAck,
  validateGemReserveCommand,
  validateGemReserveWireAck,
  validateGemYieldCommand,
  validateGemYieldWireAck,
  type GemCollectCommand,
  type GemCollectWireAck,
  type GemPurchaseCommand,
  type GemPurchaseWireAck,
  type GemReserveCommand,
  type GemReserveWireAck,
  type GemYieldCommand,
  type GemYieldWireAck,
  validateGameStartWireAck,
  validateGameStartCommand,
  validateGameFinishedEvent,
  validateNumberDrawCommand,
  validateNumberDrawWireAck,
  validateNumberPassCommand,
  validateNumberPassWireAck,
  validateNumberSubmitCommand,
  validateNumberSubmitWireAck,
  validateRoomCreateWireAck,
  validateRoomCreateCommand,
  validateRoomJoinWireAck,
  validateRoomJoinCommand,
  validateRoomClosedEvent,
  validateRoomLeaveAck,
  validateRoomLeaveCommand,
  validateSessionBootstrapAck,
  validateSessionBootstrapCommand,
  validateSessionReplacedNotification,
  validateSessionResumeWireAck,
  validateSessionResumeCommand,
  validateStateSnapshotWireEvent,
  validateStateSyncWireAck,
  validateStateSyncCommand,
  validateTurnDrawWireAck,
  validateTurnDrawCommand,
  validateTurnPassWireAck,
  validateTurnPassCommand,
  validateTurnSubmitWireAck,
  validateTurnSubmitCommand,
  validateTurnStartedEvent,
  type GameStartWireAck,
  type GameStartCommand,
  type GameFinishedEvent,
  type NumberDrawCommand,
  type NumberDrawWireAck,
  type NumberPassCommand,
  type NumberPassWireAck,
  type NumberSubmitCommand,
  type NumberSubmitWireAck,
  type RoomCreateWireAck,
  type RoomCreateCommand,
  type RoomJoinWireAck,
  type RoomJoinCommand,
  type RoomClosedEvent,
  type RoomLeaveAck,
  type RoomLeaveCommand,
  type SnapshotWireClientToServerEvents,
  type SnapshotWireServerToClientEvents,
  type SnapshotWireVersion,
  type SessionBootstrapAck,
  type SessionBootstrapCommand,
  type SessionReplacedNotification,
  type SessionResumeWireAck,
  type SessionResumeCommand,
  type StateSnapshotWireEvent,
  type StateSnapshotWirePayload,
  type StateSyncWireAck,
  type StateSyncCommand,
  type StateVersions,
  type TurnStartedEvent,
  type TurnDrawWireAck,
  type TurnDrawCommand,
  type TurnPassWireAck,
  type TurnPassCommand,
  type TurnSubmitWireAck,
  type TurnSubmitCommand,
} from "@hangul-rummikub/shared";
import {
  io as createSocket,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from "socket.io-client";

import { hasMatchingAcknowledgementRequestId } from "./ack-correlation.js";
import { cityReceiptMatches } from "../features/city-role/city-role-actions.js";
import {
  WEB_SUPPORTED_GAME_TYPES,
  WEB_SUPPORTED_SNAPSHOT_VERSIONS,
} from "./snapshot-wire-decoder.js";

const DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS = 8_000;
const DEFAULT_SOCKET_PATH = "/socket.io";

type RealtimeSocket = Socket<
  SnapshotWireServerToClientEvents,
  SnapshotWireClientToServerEvents
>;

export type RealtimeConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "SESSION_REPLACED";

export type TransportConnectedEvent = Readonly<{
  kind: "INITIAL" | "RECONNECTED";
}>;

export type RealtimeCommandName = keyof SnapshotWireClientToServerEvents;

export type RealtimeProtocolIssue = Readonly<
  | {
      kind: "INVALID_ACKNOWLEDGEMENT";
      command: RealtimeCommandName;
    }
  | {
      kind: "INVALID_SERVER_EVENT";
      event:
        | "state:snapshot"
        | "turn:started"
        | "game:finished"
        | "room:closed"
        | "session:replaced";
    }
  | {
      kind: "INCOMPATIBLE_SNAPSHOT";
      reason:
        | "UNSUPPORTED_OR_INVALID_V2"
        | "NEGOTIATION_REJECTED"
        | "VERSION_CHANGED";
    }
>;

export type RealtimeClientErrorCode =
  | "ACKNOWLEDGEMENT_TIMEOUT"
  | "CLIENT_CLOSED"
  | "INVALID_COMMAND"
  | "INVALID_SERVER_RESPONSE"
  | "NOT_CONNECTED"
  | "SESSION_REPLACED";

export class RealtimeClientError extends Error {
  constructor(public readonly code: RealtimeClientErrorCode) {
    super(messageForClientError(code));
    this.name = "RealtimeClientError";
  }
}

export type RealtimeClientOptions = Readonly<{
  /** Omit to use the browser's current origin. */
  url?: string;
  path?: string;
  acknowledgementTimeoutMs?: number;
  autoConnect?: boolean;
}>;

type Unsubscribe = () => void;
type ConnectionStateListener = (state: RealtimeConnectionState) => void;
type ConnectedListener = (event: TransportConnectedEvent) => void;
type SnapshotListener = (event: StateSnapshotWireEvent) => void;
type TurnStartedListener = (event: TurnStartedEvent) => void;
type GameFinishedListener = (event: GameFinishedEvent) => void;
type RoomClosedListener = (event: RoomClosedEvent) => void;
type SessionReplacedListener = (
  event: SessionReplacedNotification,
) => void;
type ProtocolIssueListener = (issue: RealtimeProtocolIssue) => void;

type RuntimeValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false };

type Validator<TValue> = (
  input: unknown,
) => RuntimeValidationResult<TValue>;

function openSocket(
  url: string | undefined,
  options: Partial<ManagerOptions & SocketOptions>,
): RealtimeSocket {
  // socket.io-client's public `io()` overload erases event-map generics in
  // v4.8.x. Keep the assertion at this single adapter boundary.
  return (url === undefined
    ? createSocket(options)
    : createSocket(url, options)) as RealtimeSocket;
}

function messageForClientError(code: RealtimeClientErrorCode): string {
  switch (code) {
    case "ACKNOWLEDGEMENT_TIMEOUT":
      return "The server did not acknowledge the command in time.";
    case "CLIENT_CLOSED":
      return "The realtime client has been closed.";
    case "INVALID_COMMAND":
      return "The realtime command is invalid.";
    case "INVALID_SERVER_RESPONSE":
      return "The server response is invalid.";
    case "NOT_CONNECTED":
      return "The realtime transport is not connected.";
    case "SESSION_REPLACED":
      return "This Player session is active on another connection.";
  }
}

function sameVersions(left: StateVersions, right: StateVersions): boolean {
  return (
    left.roomRevision === right.roomRevision &&
    left.gameRevision === right.gameRevision &&
    left.presenceVersion === right.presenceVersion
  );
}

function snapshotVersions(snapshot: StateSnapshotWirePayload): StateVersions {
  if ("snapshotVersion" in snapshot) {
    return {
      roomRevision: snapshot.versions.roomRevision,
      gameRevision: snapshot.game?.gameRevision ?? null,
      presenceVersion: snapshot.versions.presenceVersion,
    };
  }

  return snapshot.versions;
}

function snapshotWireVersion(
  snapshot: StateSnapshotWirePayload,
): SnapshotWireVersion {
  return "snapshotVersion" in snapshot ? 2 : 1;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function containsVersionedSnapshotCandidate(input: unknown): boolean {
  if (!isRecord(input)) {
    return false;
  }

  const payloadOrData = isRecord(input.payload)
    ? input.payload
    : isRecord(input.data)
      ? input.data
      : null;
  if (payloadOrData === null || !isRecord(payloadOrData.snapshot)) {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(
      payloadOrData.snapshot,
      "snapshotVersion",
    ) ||
    (isRecord(payloadOrData.snapshot.room) &&
      Object.prototype.hasOwnProperty.call(
        payloadOrData.snapshot.room,
        "gameType",
      ))
  );
}

function hasConsistentSnapshotEvent(event: StateSnapshotWireEvent): boolean {
  const snapshot = event.payload.snapshot;

  return (
    (!("protocolVersion" in snapshot) ||
      event.protocolVersion === snapshot.protocolVersion) &&
    event.serverTime === snapshot.serverTime &&
    sameVersions(event.versions, snapshotVersions(snapshot))
  );
}

function hasConsistentSnapshotAcknowledgement(
  acknowledgement:
    | RoomCreateWireAck
    | RoomJoinWireAck
    | SessionResumeWireAck
    | StateSyncWireAck
    | GameStartWireAck
    | GemCollectWireAck
    | GemPurchaseWireAck
    | GemReserveWireAck
    | GemYieldWireAck
    | NumberDrawWireAck
    | NumberPassWireAck
    | NumberSubmitWireAck
    | TurnDrawWireAck
    | TurnPassWireAck
    | TurnSubmitWireAck,
): boolean {
  if (!acknowledgement.ok) {
    return true;
  }

  const snapshot = acknowledgement.data.snapshot;

  return (
    acknowledgement.scope === "ROOM" &&
    acknowledgement.serverTime === snapshot.serverTime &&
    sameVersions(acknowledgement.versions, snapshotVersions(snapshot))
  );
}

function validatePositiveTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError("Acknowledgement timeout must be positive.");
  }

  return value;
}

export class RealtimeClient {
  readonly #socket: RealtimeSocket;
  readonly #acknowledgementTimeoutMs: number;
  readonly #connectionStateListeners = new Set<ConnectionStateListener>();
  readonly #connectedListeners = new Set<ConnectedListener>();
  readonly #snapshotListeners = new Set<SnapshotListener>();
  readonly #turnStartedListeners = new Set<TurnStartedListener>();
  readonly #gameFinishedListeners = new Set<GameFinishedListener>();
  readonly #roomClosedListeners = new Set<RoomClosedListener>();
  readonly #sessionReplacedListeners = new Set<SessionReplacedListener>();
  readonly #protocolIssueListeners = new Set<ProtocolIssueListener>();

  #connectionState: RealtimeConnectionState = "DISCONNECTED";
  #hasConnected = false;
  #replacementBlocked = false;
  #closed = false;
  #observedSnapshotVersion: SnapshotWireVersion | null = null;

  constructor(options: RealtimeClientOptions = {}) {
    this.#acknowledgementTimeoutMs = validatePositiveTimeout(
      options.acknowledgementTimeoutMs ??
        DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS,
    );

    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      autoConnect: false,
      path: options.path ?? DEFAULT_SOCKET_PATH,
      auth: {
        supportsRoomPreparation: true,
        supportedSnapshotVersions: [...WEB_SUPPORTED_SNAPSHOT_VERSIONS],
        supportedGameTypes: [...WEB_SUPPORTED_GAME_TYPES],
      },
    };

    this.#socket = openSocket(options.url, socketOptions);

    this.#socket.on("connect", this.#handleConnect);
    this.#socket.on("disconnect", this.#handleDisconnect);
    this.#socket.on("connect_error", this.#handleConnectError);
    this.#socket.on("state:snapshot", this.#handleSnapshot);
    this.#socket.on("turn:started", this.#handleTurnStarted);
    this.#socket.on("game:finished", this.#handleGameFinished);
    this.#socket.on("room:closed", this.#handleRoomClosed);
    this.#socket.on("session:replaced", this.#handleSessionReplaced);
    this.#socket.io.on("reconnect_attempt", this.#handleReconnectAttempt);
    this.#socket.io.on("reconnect_failed", this.#handleReconnectFailed);

    if (options.autoConnect === true) {
      this.connect();
    }
  }

  get connectionState(): RealtimeConnectionState {
    return this.#connectionState;
  }

  get connected(): boolean {
    return this.#socket.connected && !this.#replacementBlocked;
  }

  connect(): void {
    this.#assertOpen();

    if (this.#replacementBlocked || this.#socket.connected) {
      return;
    }

    this.#setConnectionState(
      this.#hasConnected ? "RECONNECTING" : "CONNECTING",
    );
    this.#socket.connect();
  }

  disconnect(): void {
    if (this.#closed) {
      return;
    }

    this.#socket.disconnect();
    if (!this.#replacementBlocked) {
      this.#setConnectionState("DISCONNECTED");
    }
  }

  destroy(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#socket.off("connect", this.#handleConnect);
    this.#socket.off("disconnect", this.#handleDisconnect);
    this.#socket.off("connect_error", this.#handleConnectError);
    this.#socket.off("state:snapshot", this.#handleSnapshot);
    this.#socket.off("turn:started", this.#handleTurnStarted);
    this.#socket.off("game:finished", this.#handleGameFinished);
    this.#socket.off("room:closed", this.#handleRoomClosed);
    this.#socket.off("session:replaced", this.#handleSessionReplaced);
    this.#socket.io.off(
      "reconnect_attempt",
      this.#handleReconnectAttempt,
    );
    this.#socket.io.off("reconnect_failed", this.#handleReconnectFailed);
    this.#socket.disconnect();
    this.#connectionState = "DISCONNECTED";

    this.#connectionStateListeners.clear();
    this.#connectedListeners.clear();
    this.#snapshotListeners.clear();
    this.#turnStartedListeners.clear();
    this.#gameFinishedListeners.clear();
    this.#roomClosedListeners.clear();
    this.#sessionReplacedListeners.clear();
    this.#protocolIssueListeners.clear();
  }

  /** Call only after an explicit user action that abandons the replaced session. */
  resetSessionReplacement(): void {
    this.#assertOpen();
    if (!this.#replacementBlocked) {
      return;
    }

    this.#replacementBlocked = false;
    this.#setConnectionState(
      this.#socket.connected ? "CONNECTED" : "DISCONNECTED",
    );
  }

  subscribeConnectionState(
    listener: ConnectionStateListener,
  ): Unsubscribe {
    this.#connectionStateListeners.add(listener);
    listener(this.#connectionState);

    return () => {
      this.#connectionStateListeners.delete(listener);
    };
  }

  subscribeTransportConnected(listener: ConnectedListener): Unsubscribe {
    this.#connectedListeners.add(listener);

    return () => {
      this.#connectedListeners.delete(listener);
    };
  }

  subscribeSnapshot(listener: SnapshotListener): Unsubscribe {
    this.#snapshotListeners.add(listener);

    return () => {
      this.#snapshotListeners.delete(listener);
    };
  }

  subscribeTurnStarted(listener: TurnStartedListener): Unsubscribe {
    this.#turnStartedListeners.add(listener);

    return () => {
      this.#turnStartedListeners.delete(listener);
    };
  }

  subscribeGameFinished(listener: GameFinishedListener): Unsubscribe {
    this.#gameFinishedListeners.add(listener);

    return () => {
      this.#gameFinishedListeners.delete(listener);
    };
  }

  subscribeRoomClosed(listener: RoomClosedListener): Unsubscribe {
    this.#roomClosedListeners.add(listener);

    return () => {
      this.#roomClosedListeners.delete(listener);
    };
  }

  subscribeSessionReplaced(
    listener: SessionReplacedListener,
  ): Unsubscribe {
    this.#sessionReplacedListeners.add(listener);

    return () => {
      this.#sessionReplacedListeners.delete(listener);
    };
  }

  subscribeProtocolIssue(listener: ProtocolIssueListener): Unsubscribe {
    this.#protocolIssueListeners.add(listener);

    return () => {
      this.#protocolIssueListeners.delete(listener);
    };
  }

  bootstrapSession(
    command: SessionBootstrapCommand,
  ): Promise<SessionBootstrapAck> {
    const validatedCommand = validateSessionBootstrapCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "session:bootstrap",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "session:bootstrap",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateSessionBootstrapAck,
    );
  }

  createRoom(command: RoomCreateCommand): Promise<RoomCreateWireAck> {
    const validatedCommand = validateRoomCreateCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "room:create",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "room:create",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateRoomCreateWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  joinRoom(command: RoomJoinCommand): Promise<RoomJoinWireAck> {
    const validatedCommand = validateRoomJoinCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "room:join",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "room:join",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateRoomJoinWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  leaveRoom(command: RoomLeaveCommand): Promise<RoomLeaveAck> {
    const validatedCommand = validateRoomLeaveCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "room:leave",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "room:leave",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateRoomLeaveAck,
    );
  }

  resumeSession(command: SessionResumeCommand): Promise<SessionResumeWireAck> {
    const validatedCommand = validateSessionResumeCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "session:resume",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "session:resume",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateSessionResumeWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  syncState(command: StateSyncCommand): Promise<StateSyncWireAck> {
    const validatedCommand = validateStateSyncCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "state:sync",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("state:sync", validatedCommand.value, acknowledge);
      },
      validateStateSyncWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  actDraw(command: DrawClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(DrawClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "draw:draftSave": this.#socket.emit("draw:draftSave", command, acknowledge); break;
        case "draw:submitDrawing": this.#socket.emit("draw:submitDrawing", command, acknowledge); break;
        case "draw:submitGuess": this.#socket.emit("draw:submitGuess", command, acknowledge); break;
        case "draw:revealNext": this.#socket.emit("draw:revealNext", command, acknowledge); break;
        case "draw:rematch": this.#socket.emit("draw:rematch", command, acknowledge); break;
        case "draw:configure": this.#socket.emit("draw:configure", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actIsland(command: IslandClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(IslandClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "island:act": this.#socket.emit("island:act", command, acknowledge); break;
        case "island:rematch": this.#socket.emit("island:rematch", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actSplendor(command: SplendorClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(SplendorClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "splendor:configure": this.#socket.emit("splendor:configure", command, acknowledge); break;
        case "splendor:act": this.#socket.emit("splendor:act", command, acknowledge); break;
        case "splendor:rematch": this.#socket.emit("splendor:rematch", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actTrain(command: TrainClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(TrainClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "train:act": this.#socket.emit("train:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actCentury(command: CenturyClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(CenturyClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "century:act": this.#socket.emit("century:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actJaipur(command: JaipurClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(JaipurClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "jaipur:act": this.#socket.emit("jaipur:act", command, acknowledge); break;
        case "jaipur:nextRound": this.#socket.emit("jaipur:nextRound", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actLoveLetter(command: LoveLetterClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(LoveLetterClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "loveLetter:act": this.#socket.emit("loveLetter:act", command, acknowledge); break;
        case "loveLetter:nextRound": this.#socket.emit("loveLetter:nextRound", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actGuryongtu(command: GuryongtuClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(GuryongtuClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "guryongtu:act": this.#socket.emit("guryongtu:act", command, acknowledge); break;
        case "guryongtu:nextRound": this.#socket.emit("guryongtu:nextRound", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actAzul(command: AzulClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(AzulClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "azul:act": this.#socket.emit("azul:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actVegas(command: VegasClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(VegasClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "vegas:act": this.#socket.emit("vegas:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actBurgundy(command: BurgundyClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(BurgundyClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "burgundy:configure": this.#socket.emit("burgundy:configure", command, acknowledge); break;
        case "burgundy:act": this.#socket.emit("burgundy:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actCarcassonne(command: CarcassonneClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(CarcassonneClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "carcassonne:act": this.#socket.emit("carcassonne:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actClue(command: ClueClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(ClueClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "clue:act": this.#socket.emit("clue:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actDuet(command: DuetClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(DuetClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "duet:act": this.#socket.emit("duet:act", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actSaboteur(command: SaboteurClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(SaboteurClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "saboteur:say": this.#socket.emit("saboteur:say", command, acknowledge); break;
        case "saboteur:act": this.#socket.emit("saboteur:act", command, acknowledge); break;
        case "saboteur:nextRound": this.#socket.emit("saboteur:nextRound", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }


  actLostCities(command: LostCitiesClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(LostCitiesClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "lostCities:configure": this.#socket.emit("lostCities:configure", command, acknowledge); break;
        case "lostCities:act": this.#socket.emit("lostCities:act", command, acknowledge); break;
        case "lostCities:nextRound": this.#socket.emit("lostCities:nextRound", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actHalli(command: HalliClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(HalliClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
                case "halli:flip": this.#socket.emit("halli:flip", command, acknowledge); break;
        case "halli:bell": this.#socket.emit("halli:bell", command, acknowledge); break;
        case "halli:rematch": this.#socket.emit("halli:rematch", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  actWolf(command: WolfClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(WolfClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "wolf:configure": this.#socket.emit("wolf:configure", command, acknowledge); break;
                case "wolf:act": this.#socket.emit("wolf:act", command, acknowledge); break;
        case "wolf:vote": this.#socket.emit("wolf:vote", command, acknowledge); break;
        case "wolf:say": this.#socket.emit("wolf:say", command, acknowledge); break;
        case "wolf:rematch": this.#socket.emit("wolf:rematch", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actSpyfall(command: SpyfallClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(SpyfallClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "spyfall:configure": this.#socket.emit("spyfall:configure", command, acknowledge); break;
        case "spyfall:ask": this.#socket.emit("spyfall:ask", command, acknowledge); break;
        case "spyfall:answer": this.#socket.emit("spyfall:answer", command, acknowledge); break;
        case "spyfall:accuse": this.#socket.emit("spyfall:accuse", command, acknowledge); break;
        case "spyfall:vote": this.#socket.emit("spyfall:vote", command, acknowledge); break;
        case "spyfall:skip": this.#socket.emit("spyfall:skip", command, acknowledge); break;
        case "spyfall:reveal": this.#socket.emit("spyfall:reveal", command, acknowledge); break;
        case "spyfall:guess": this.#socket.emit("spyfall:guess", command, acknowledge); break;

      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actLiar(command: LiarClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(LiarClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "liar:configure": this.#socket.emit("liar:configure", command, acknowledge); break;
                case "liar:clue": this.#socket.emit("liar:clue", command, acknowledge); break;
        case "liar:vote": this.#socket.emit("liar:vote", command, acknowledge); break;
        case "liar:say": this.#socket.emit("liar:say", command, acknowledge); break;
        case "liar:guess": this.#socket.emit("liar:guess", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actCityExpansion(command: CityExpansionClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(CityExpansionClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      if (command.kind === "city:configure") this.#socket.emit("city:configure", command, acknowledge);
      else this.#socket.emit("city:expansionAction", command, acknowledge);
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }
  actSneaky(command: SneakyClientCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(SneakyClientCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      switch (command.kind) {
        case "sneaky:configure": this.#socket.emit("sneaky:configure", command, acknowledge); break;
        case "sneaky:eat": this.#socket.emit("sneaky:eat", command, acknowledge); break;
        case "sneaky:rematch": this.#socket.emit("sneaky:rematch", command, acknowledge); break;
      }
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  prepareRoom(command: RoomPreparationCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(RoomPreparationCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged(command.kind, command.requestId, acknowledge => {
      if (command.kind === "room:selectGame") this.#socket.emit("room:selectGame", command, acknowledge);
      else this.#socket.emit("room:ready", command, acknowledge);
    }, validateStateSyncWireAck, ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  rematchNumber(command: NumberRematchCommand): Promise<StateSyncWireAck> {
    if (!parseRematch(NumberRematchCommandSchema, command).success) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    return this.#emitAcknowledged("number:rematch", command.requestId,
      acknowledge => this.#socket.emit("number:rematch", command, acknowledge), validateStateSyncWireAck,
      ack => hasConsistentSnapshotAcknowledgement(ack) && this.#acceptAcknowledgementSnapshotVersion(ack));
  }

  startGame(command: GameStartCommand): Promise<GameStartWireAck> {
    const validatedCommand = validateGameStartCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "game:start",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("game:start", validatedCommand.value, acknowledge);
      },
      validateGameStartWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  submitTurn(command: TurnSubmitCommand): Promise<TurnSubmitWireAck> {
    const validatedCommand = validateTurnSubmitCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "turn:submit",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "turn:submit",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateTurnSubmitWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  drawTurn(command: TurnDrawCommand): Promise<TurnDrawWireAck> {
    const validatedCommand = validateTurnDrawCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "turn:draw",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("turn:draw", validatedCommand.value, acknowledge);
      },
      validateTurnDrawWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  passTurn(command: TurnPassCommand): Promise<TurnPassWireAck> {
    const validatedCommand = validateTurnPassCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "turn:pass",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("turn:pass", validatedCommand.value, acknowledge);
      },
      validateTurnPassWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  submitNumberTurn(
    command: NumberSubmitCommand,
  ): Promise<NumberSubmitWireAck> {
    const validatedCommand = validateNumberSubmitCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "number:submit",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit(
          "number:submit",
          validatedCommand.value,
          acknowledge,
        );
      },
      validateNumberSubmitWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  drawNumberTurn(command: NumberDrawCommand): Promise<NumberDrawWireAck> {
    const validatedCommand = validateNumberDrawCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "number:draw",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("number:draw", validatedCommand.value, acknowledge);
      },
      validateNumberDrawWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  passNumberTurn(command: NumberPassCommand): Promise<NumberPassWireAck> {
    const validatedCommand = validateNumberPassCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }

    return this.#emitAcknowledged(
      "number:pass",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("number:pass", validatedCommand.value, acknowledge);
      },
      validateNumberPassWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  collectGemResources(command: GemCollectCommand): Promise<GemCollectWireAck> {
    const validatedCommand = validateGemCollectCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }
    return this.#emitAcknowledged(
      "gem:collect",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("gem:collect", validatedCommand.value, acknowledge);
      },
      validateGemCollectWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  purchaseGemCard(command: GemPurchaseCommand): Promise<GemPurchaseWireAck> {
    const validatedCommand = validateGemPurchaseCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }
    return this.#emitAcknowledged(
      "gem:purchase",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("gem:purchase", validatedCommand.value, acknowledge);
      },
      validateGemPurchaseWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  reserveGemCard(command: GemReserveCommand): Promise<GemReserveWireAck> {
    const validatedCommand = validateGemReserveCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }
    return this.#emitAcknowledged(
      "gem:reserve",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("gem:reserve", validatedCommand.value, acknowledge);
      },
      validateGemReserveWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  yieldGemTurn(command: GemYieldCommand): Promise<GemYieldWireAck> {
    const validatedCommand = validateGemYieldCommand(command);
    if (!validatedCommand.ok) {
      return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    }
    return this.#emitAcknowledged(
      "gem:yield",
      validatedCommand.value.requestId,
      (acknowledge) => {
        this.#socket.emit("gem:yield", validatedCommand.value, acknowledge);
      },
      validateGemYieldWireAck,
      (acknowledgement) =>
        hasConsistentSnapshotAcknowledgement(acknowledgement) &&
        this.#acceptAcknowledgementSnapshotVersion(acknowledgement),
    );
  }

  /** Closed CITY command family; the wire always uses its concrete event. */
  actCity(command: CityClientCommand): Promise<CityActionWireAck> {
    const parsed = validateCityClientCommand(command);
    if (!parsed.ok) return Promise.reject(new RealtimeClientError("INVALID_COMMAND"));
    const value = parsed.value;
    const validators: Record<CityClientCommand["kind"], Validator<CityActionWireAck>> = {
      "city:selectRole": validateCitySelectRoleWireAck, "city:takeIncome": validateCityTakeIncomeWireAck,
      "city:drawBuildingCards": validateCityDrawBuildingCardsWireAck, "city:chooseBuildingCard": validateCityChooseBuildingCardWireAck,
      "city:useRoleAbility": validateCityUseRoleAbilityWireAck, "city:build": validateCityBuildWireAck, "city:endTurn": validateCityEndTurnWireAck,
    };
    return this.#emitAcknowledged(value.kind, value.requestId, acknowledge => {
      switch (value.kind) {
        case "city:selectRole": this.#socket.emit("city:selectRole", value, acknowledge); break;
        case "city:takeIncome": this.#socket.emit("city:takeIncome", value, acknowledge); break;
        case "city:drawBuildingCards": this.#socket.emit("city:drawBuildingCards", value, acknowledge); break;
        case "city:chooseBuildingCard": this.#socket.emit("city:chooseBuildingCard", value, acknowledge); break;
        case "city:useRoleAbility": this.#socket.emit("city:useRoleAbility", value, acknowledge); break;
        case "city:build": this.#socket.emit("city:build", value, acknowledge); break;
        case "city:endTurn": this.#socket.emit("city:endTurn", value, acknowledge); break;
      }
    }, validators[value.kind], ack => cityReceiptMatches(value, ack));
  }

  #emitAcknowledged<
    TAcknowledgement extends Readonly<{ requestId: string | null }>,
  >(
    command: RealtimeCommandName,
    expectedRequestId: string,
    emit: (acknowledge: (value: TAcknowledgement) => void) => void,
    validator: Validator<TAcknowledgement>,
    additionalCheck?: (value: TAcknowledgement) => boolean,
  ): Promise<TAcknowledgement> {
    try {
      this.#assertCanSend();
    } catch (error: unknown) {
      return Promise.reject(error);
    }

    return new Promise<TAcknowledgement>((resolve, reject) => {
      let settled = false;
      const timeoutId = globalThis.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new RealtimeClientError("ACKNOWLEDGEMENT_TIMEOUT"));
      }, this.#acknowledgementTimeoutMs);

      const acknowledge = (input: TAcknowledgement) => {
        if (settled) {
          return;
        }

        settled = true;
        globalThis.clearTimeout(timeoutId);
        const result = validator(input);
        if (!result.ok) {
          this.#notifyProtocolIssue(
            containsVersionedSnapshotCandidate(input)
              ? {
                  kind: "INCOMPATIBLE_SNAPSHOT",
                  reason: "UNSUPPORTED_OR_INVALID_V2",
                }
              : {
                  kind: "INVALID_ACKNOWLEDGEMENT",
                  command,
                },
          );
          reject(new RealtimeClientError("INVALID_SERVER_RESPONSE"));
          return;
        }
        if (
          !hasMatchingAcknowledgementRequestId(
            expectedRequestId,
            result.value,
          ) ||
          (additionalCheck !== undefined && !additionalCheck(result.value))
        ) {
          this.#notifyProtocolIssue({
            kind: "INVALID_ACKNOWLEDGEMENT",
            command,
          });
          reject(new RealtimeClientError("INVALID_SERVER_RESPONSE"));
          return;
        }

        resolve(result.value);
      };

      try {
        emit(acknowledge);
      } catch {
        settled = true;
        globalThis.clearTimeout(timeoutId);
        reject(new RealtimeClientError("NOT_CONNECTED"));
      }
    });
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new RealtimeClientError("CLIENT_CLOSED");
    }
  }

  #assertCanSend(): void {
    this.#assertOpen();

    if (this.#replacementBlocked) {
      throw new RealtimeClientError("SESSION_REPLACED");
    }

    if (!this.#socket.connected) {
      throw new RealtimeClientError("NOT_CONNECTED");
    }
  }

  #setConnectionState(nextState: RealtimeConnectionState): void {
    if (nextState === this.#connectionState) {
      return;
    }

    this.#connectionState = nextState;
    for (const listener of this.#connectionStateListeners) {
      listener(nextState);
    }
  }

  #notifyProtocolIssue(issue: RealtimeProtocolIssue): void {
    for (const listener of this.#protocolIssueListeners) {
      listener(issue);
    }
  }

  #acceptSnapshotVersion(snapshot: StateSnapshotWirePayload): boolean {
    const incomingVersion = snapshotWireVersion(snapshot);
    if (this.#observedSnapshotVersion === null) {
      this.#observedSnapshotVersion = incomingVersion;
      return true;
    }
    if (this.#observedSnapshotVersion === incomingVersion) {
      return true;
    }

    this.#notifyProtocolIssue({
      kind: "INCOMPATIBLE_SNAPSHOT",
      reason: "VERSION_CHANGED",
    });
    return false;
  }

  #acceptAcknowledgementSnapshotVersion(
    acknowledgement:
      | RoomCreateWireAck
      | RoomJoinWireAck
      | SessionResumeWireAck
      | StateSyncWireAck
      | GameStartWireAck
      | GemCollectWireAck
      | GemPurchaseWireAck
      | GemReserveWireAck
      | GemYieldWireAck
      | NumberDrawWireAck
      | NumberPassWireAck
      | NumberSubmitWireAck
      | TurnDrawWireAck
      | TurnPassWireAck
      | TurnSubmitWireAck,
  ): boolean {
    return !acknowledgement.ok ||
      this.#acceptSnapshotVersion(acknowledgement.data.snapshot);
  }

  readonly #handleConnect = (): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const connectionKind = this.#hasConnected ? "RECONNECTED" : "INITIAL";
    this.#observedSnapshotVersion = null;
    this.#hasConnected = true;
    this.#setConnectionState("CONNECTED");

    for (const listener of this.#connectedListeners) {
      listener({ kind: connectionKind });
    }
  };

  readonly #handleDisconnect = (): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    this.#setConnectionState(
      this.#socket.active ? "RECONNECTING" : "DISCONNECTED",
    );
  };

  readonly #handleConnectError = (error: Error): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    if (
      error.message === "INCOMPATIBLE_SNAPSHOT_VERSION" ||
      error.message === "INVALID_SNAPSHOT_CAPABILITY" ||
      error.message === "INVALID_GAME_CAPABILITY"
    ) {
      this.#notifyProtocolIssue({
        kind: "INCOMPATIBLE_SNAPSHOT",
        reason: "NEGOTIATION_REJECTED",
      });
      // This is a deterministic representation mismatch, not a transient
      // transport outage. Stop Socket.IO's automatic retries so the explicit
      // incompatible view is stable instead of entering a reconnect loop.
      this.#socket.disconnect();
      this.#setConnectionState("DISCONNECTED");
      return;
    }

    this.#setConnectionState(
      this.#socket.active
        ? this.#hasConnected
          ? "RECONNECTING"
          : "CONNECTING"
        : "DISCONNECTED",
    );
  };

  readonly #handleReconnectAttempt = (): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    this.#setConnectionState("RECONNECTING");
  };

  readonly #handleReconnectFailed = (): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    this.#setConnectionState("DISCONNECTED");
  };

  readonly #handleSnapshot = (input: StateSnapshotWireEvent): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateStateSnapshotWireEvent(input);
    if (!validation.ok) {
      if (containsVersionedSnapshotCandidate(input)) {
        this.#notifyProtocolIssue({
          kind: "INCOMPATIBLE_SNAPSHOT",
          reason: "UNSUPPORTED_OR_INVALID_V2",
        });
        return;
      }
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "state:snapshot",
      });
      return;
    }

    if (!hasConsistentSnapshotEvent(validation.value)) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "state:snapshot",
      });
      return;
    }
    if (!this.#acceptSnapshotVersion(validation.value.payload.snapshot)) {
      return;
    }

    for (const listener of this.#snapshotListeners) {
      listener(validation.value);
    }
  };

  readonly #handleTurnStarted = (input: TurnStartedEvent): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateTurnStartedEvent(input);
    if (!validation.ok || validation.value.versions.gameRevision === null) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "turn:started",
      });
      return;
    }

    for (const listener of this.#turnStartedListeners) {
      listener(validation.value);
    }
  };

  readonly #handleGameFinished = (input: GameFinishedEvent): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateGameFinishedEvent(input);
    if (!validation.ok) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "game:finished",
      });
      return;
    }

    for (const listener of this.#gameFinishedListeners) {
      listener(validation.value);
    }
  };

  readonly #handleRoomClosed = (input: RoomClosedEvent): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateRoomClosedEvent(input);
    if (!validation.ok) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "room:closed",
      });
      return;
    }

    for (const listener of this.#roomClosedListeners) {
      listener(validation.value);
    }
  };

  readonly #handleSessionReplaced = (
    input: SessionReplacedNotification,
  ): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateSessionReplacedNotification(input);
    if (!validation.ok) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "session:replaced",
      });
      return;
    }

    this.#replacementBlocked = true;
    this.#setConnectionState("SESSION_REPLACED");
    for (const listener of this.#sessionReplacedListeners) {
      listener(validation.value);
    }
  };
}

export function createRealtimeClient(
  options: RealtimeClientOptions = {},
): RealtimeClient {
  return new RealtimeClient(options);
}
