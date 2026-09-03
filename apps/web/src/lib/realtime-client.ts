import {
  validateGameStartAck,
  validateGameStartCommand,
  validateRoomCreateAck,
  validateRoomCreateCommand,
  validateRoomJoinAck,
  validateRoomJoinCommand,
  validateSessionBootstrapAck,
  validateSessionBootstrapCommand,
  validateSessionReplacedNotification,
  validateSessionResumeAck,
  validateSessionResumeCommand,
  validateStateSnapshotEvent,
  validateStateSyncAck,
  validateStateSyncCommand,
  validateTurnStartedEvent,
  type ClientToServerEvents,
  type GameStartAck,
  type GameStartCommand,
  type RoomCreateAck,
  type RoomCreateCommand,
  type RoomJoinAck,
  type RoomJoinCommand,
  type ServerToClientEvents,
  type SessionBootstrapAck,
  type SessionBootstrapCommand,
  type SessionReplacedNotification,
  type SessionResumeAck,
  type SessionResumeCommand,
  type StateSnapshotEvent,
  type StateSyncAck,
  type StateSyncCommand,
  type StateVersions,
  type TurnStartedEvent,
} from "@hangul-rummikub/shared";
import {
  io as createSocket,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from "socket.io-client";

import { hasMatchingAcknowledgementRequestId } from "./ack-correlation.js";

const DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS = 8_000;
const DEFAULT_SOCKET_PATH = "/socket.io";

type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type RealtimeConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "SESSION_REPLACED";

export type TransportConnectedEvent = Readonly<{
  kind: "INITIAL" | "RECONNECTED";
}>;

export type RealtimeCommandName = keyof ClientToServerEvents;

export type RealtimeProtocolIssue = Readonly<
  | {
      kind: "INVALID_ACKNOWLEDGEMENT";
      command: RealtimeCommandName;
    }
  | {
      kind: "INVALID_SERVER_EVENT";
      event: "state:snapshot" | "turn:started" | "session:replaced";
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
type SnapshotListener = (event: StateSnapshotEvent) => void;
type TurnStartedListener = (event: TurnStartedEvent) => void;
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

function hasConsistentSnapshotEvent(event: StateSnapshotEvent): boolean {
  const snapshot = event.payload.snapshot;

  return (
    event.protocolVersion === snapshot.protocolVersion &&
    event.serverTime === snapshot.serverTime &&
    sameVersions(event.versions, snapshot.versions)
  );
}

function hasConsistentSnapshotAcknowledgement(
  acknowledgement:
    | RoomCreateAck
    | RoomJoinAck
    | SessionResumeAck
    | StateSyncAck
    | GameStartAck,
): boolean {
  if (!acknowledgement.ok) {
    return true;
  }

  const snapshot = acknowledgement.data.snapshot;

  return (
    acknowledgement.scope === "ROOM" &&
    acknowledgement.serverTime === snapshot.serverTime &&
    sameVersions(acknowledgement.versions, snapshot.versions)
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
  readonly #sessionReplacedListeners = new Set<SessionReplacedListener>();
  readonly #protocolIssueListeners = new Set<ProtocolIssueListener>();

  #connectionState: RealtimeConnectionState = "DISCONNECTED";
  #hasConnected = false;
  #replacementBlocked = false;
  #closed = false;

  constructor(options: RealtimeClientOptions = {}) {
    this.#acknowledgementTimeoutMs = validatePositiveTimeout(
      options.acknowledgementTimeoutMs ??
        DEFAULT_ACKNOWLEDGEMENT_TIMEOUT_MS,
    );

    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      autoConnect: false,
      path: options.path ?? DEFAULT_SOCKET_PATH,
    };

    this.#socket = openSocket(options.url, socketOptions);

    this.#socket.on("connect", this.#handleConnect);
    this.#socket.on("disconnect", this.#handleDisconnect);
    this.#socket.on("connect_error", this.#handleConnectError);
    this.#socket.on("state:snapshot", this.#handleSnapshot);
    this.#socket.on("turn:started", this.#handleTurnStarted);
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

  createRoom(command: RoomCreateCommand): Promise<RoomCreateAck> {
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
      validateRoomCreateAck,
      hasConsistentSnapshotAcknowledgement,
    );
  }

  joinRoom(command: RoomJoinCommand): Promise<RoomJoinAck> {
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
      validateRoomJoinAck,
      hasConsistentSnapshotAcknowledgement,
    );
  }

  resumeSession(command: SessionResumeCommand): Promise<SessionResumeAck> {
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
      validateSessionResumeAck,
      hasConsistentSnapshotAcknowledgement,
    );
  }

  syncState(command: StateSyncCommand): Promise<StateSyncAck> {
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
      validateStateSyncAck,
      hasConsistentSnapshotAcknowledgement,
    );
  }

  startGame(command: GameStartCommand): Promise<GameStartAck> {
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
      validateGameStartAck,
      hasConsistentSnapshotAcknowledgement,
    );
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
        if (
          !result.ok ||
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

  readonly #handleConnect = (): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const connectionKind = this.#hasConnected ? "RECONNECTED" : "INITIAL";
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

  readonly #handleConnectError = (): void => {
    if (this.#closed || this.#replacementBlocked) {
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

  readonly #handleSnapshot = (input: StateSnapshotEvent): void => {
    if (this.#closed || this.#replacementBlocked) {
      return;
    }

    const validation = validateStateSnapshotEvent(input);
    if (!validation.ok || !hasConsistentSnapshotEvent(validation.value)) {
      this.#notifyProtocolIssue({
        kind: "INVALID_SERVER_EVENT",
        event: "state:snapshot",
      });
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
