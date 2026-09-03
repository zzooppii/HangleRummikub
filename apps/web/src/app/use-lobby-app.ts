import {
  PROTOCOL_VERSION,
  validateNickname,
  validateRoomCode,
  type BrowserStoredPlayerSession,
  type ErrorDto,
  type GameStartCommand,
  type Nickname,
  type RoomCode,
  type RoomCreateAck,
  type RoomJoinAck,
  type RoomLeaveCommand,
  type SessionResumeCommand,
  type StateSnapshot,
  type StateSyncCommand,
  type TurnDrawBagKind,
  type TurnSubmitCommand,
} from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";

import { getUserErrorMessage } from "../lib/error-messages.js";
import {
  createOrReuseGameStartCommand,
  getGameStartControl,
} from "../lib/game-start.js";
import {
  createRealtimeClient,
  RealtimeClientError,
  type RealtimeClient,
  type RealtimeConnectionState,
} from "../lib/realtime-client.js";
import { createRequestId } from "../lib/request-id.js";
import {
  createOrReuseRoomLeaveCommand,
  decideRoomLeaveClientAction,
  isStaleRoomLeaveSessionFailure,
  roomClosedMatchesCurrentRoom,
  roomLeaveConfirmationMessage,
  runRoomLeaveSingleFlight,
  shouldRequestSyncAfterRoomLeaveFailure,
} from "../lib/room-leave.js";
import {
  createRoomPath,
  parseAppPathname,
  type AppRoute,
} from "../lib/room-url.js";
import {
  clearPendingRoomOperation,
  clearStoredPlayerSession,
  createPendingRoomCreateOperation,
  createPendingRoomJoinOperation,
  readPendingRoomOperation,
  readStoredPlayerSessionForRoom,
  writePendingRoomOperation,
  writeStoredPlayerSession,
  type PendingRoomOperation,
} from "../lib/session-storage.js";
import {
  compareStateVersions,
  decideSnapshotUpdate,
} from "../lib/snapshot-state.js";
import {
  createOrReuseTurnDrawCommand,
  createOrReuseTurnPassCommand,
  decideTurnActionFailureAction,
  runTurnActionSingleFlight,
  shouldDiscardPendingTurnActionOnNavigation,
  snapshotSupersedesPendingTurnAction,
  type PendingTurnActionCommand,
} from "../lib/turn-actions.js";
import {
  createOrReuseTurnSubmitCommand,
  decideTurnSubmitFailureAction,
  runTurnSubmitSingleFlight,
  shouldDiscardPendingTurnSubmitOnNavigation,
  snapshotSupersedesPendingTurnSubmit,
} from "../lib/turn-submit.js";
import type { TurnDraft } from "../lib/turn-draft.js";

const STALE_SESSION_MESSAGE =
  "재접속 유예 시간이 만료되었거나 방이 종료되어 연결 정보가 더 이상 유효하지 않습니다. 새 방을 만들거나 다시 참가해주세요.";
const STORAGE_UNAVAILABLE_MESSAGE =
  "브라우저 저장소를 사용할 수 없어 새로고침 복구가 제한됩니다. 이 창을 닫지 말고 다시 시도해주세요.";
const CONNECTION_RETRY_MESSAGE =
  "서버 응답을 확인하지 못했습니다. 연결이 복구되면 같은 요청으로 다시 시도합니다.";
const INVALID_SERVER_STATE_MESSAGE =
  "서버 상태를 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";

type EntryAck = RoomCreateAck | RoomJoinAck;
type SnapshotApplication = "CURRENT" | "REQUEST_SYNC" | "REJECTED";

export type LobbyAppState = Readonly<{
  route: AppRoute;
  nickname: string;
  roomCodeInput: string;
  snapshot: StateSnapshot | null;
  connectionState: RealtimeConnectionState;
  operationLabel: string | null;
  errorMessage: string | null;
  copyMessage: string | null;
  sessionReplaced: boolean;
  gameStartPending: boolean;
  turnSubmitPending: boolean;
  turnActionPending: boolean;
  roomLeavePending: boolean;
  turnDraftResetGeneration: number;
  setNickname: (value: string) => void;
  setRoomCodeInput: (value: string) => void;
  createRoom: () => void;
  joinRoom: () => void;
  startGame: () => void;
  submitTurn: (draft: TurnDraft) => void;
  drawTurn: (bagKind: TurnDrawBagKind) => void;
  passTurn: () => void;
  leaveRoom: () => void;
  copyInvitation: (invitationUrl: string) => void;
  goHome: () => void;
}>;

function isStaleSessionError(error: ErrorDto): boolean {
  return (
    error.code === "SESSION_NOT_FOUND" || error.code === "ROOM_NOT_FOUND"
  );
}

function entryLabel(operation: PendingRoomOperation): string {
  return operation.kind === "room:create"
    ? "방 만드는 중..."
    : "참가하는 중...";
}

function pendingMatchesRoute(
  operation: PendingRoomOperation,
  route: AppRoute,
): boolean {
  if (operation.kind === "room:create") {
    return route.kind === "HOME";
  }

  return (
    route.kind === "HOME" ||
    (route.kind === "ROOM" &&
      route.roomCode === operation.payload.roomCode)
  );
}

function isSnapshotForSession(
  snapshot: StateSnapshot,
  session: BrowserStoredPlayerSession,
): boolean {
  return (
    snapshot.room.roomCode === session.credential.roomCode &&
    snapshot.self.playerId === session.playerId &&
    snapshot.room.players.some(
      (player) => player.playerId === session.playerId,
    )
  );
}

function clientFailureMessage(error: unknown): string {
  if (!(error instanceof RealtimeClientError)) {
    return "문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
  }

  switch (error.code) {
    case "ACKNOWLEDGEMENT_TIMEOUT":
    case "NOT_CONNECTED":
      return CONNECTION_RETRY_MESSAGE;
    case "SESSION_REPLACED":
      return "이 플레이어 세션이 다른 창에서 연결되었습니다.";
    case "INVALID_COMMAND":
    case "INVALID_SERVER_RESPONSE":
      return INVALID_SERVER_STATE_MESSAGE;
    case "CLIENT_CLOSED":
      return "서버 연결이 종료되었습니다. 페이지를 새로고침해주세요.";
  }
}

function isRetryableCommandFailure(error: unknown): boolean {
  return (
    error instanceof RealtimeClientError &&
    (error.code === "ACKNOWLEDGEMENT_TIMEOUT" ||
      error.code === "NOT_CONNECTED")
  );
}

export function useLobbyApp(): LobbyAppState {
  const initialRoute = parseAppPathname(window.location.pathname);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [nickname, setNicknameState] = useState("");
  const [roomCodeInput, setRoomCodeInputState] = useState("");
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("CONNECTING");
  const [operationLabel, setOperationLabel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [gameStartPending, setGameStartPending] = useState(false);
  const [turnSubmitPending, setTurnSubmitPending] = useState(false);
  const [turnActionPending, setTurnActionPending] = useState(false);
  const [roomLeavePending, setRoomLeavePending] = useState(false);
  const [turnDraftResetGeneration, setTurnDraftResetGeneration] = useState(0);

  const routeRef = useRef<AppRoute>(initialRoute);
  const snapshotRef = useRef<StateSnapshot | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const entryFlightRef = useRef<Promise<void> | null>(null);
  const entryActionActiveRef = useRef(false);
  const pendingRetryRequestedRef = useRef(false);
  const resumeFlightRef = useRef<Promise<void> | null>(null);
  const resumeRetryRequestedRef = useRef(false);
  const syncFlightRef = useRef<Promise<void> | null>(null);
  const syncRetryRequestedRef = useRef(false);
  const gameStartFlightRef = useRef<Promise<void> | null>(null);
  const pendingGameStartCommandRef = useRef<GameStartCommand | null>(null);
  const gameStartRetryRequestedRef = useRef(false);
  const gameplayMutationFlightRef = useRef<Promise<void> | null>(null);
  const pendingTurnSubmitCommandRef = useRef<TurnSubmitCommand | null>(null);
  const turnSubmitRetryRequestedRef = useRef(false);
  const pendingTurnActionCommandRef =
    useRef<PendingTurnActionCommand | null>(null);
  const turnActionRetryRequestedRef = useRef(false);
  const roomLeaveFlightRef = useRef<Promise<void> | null>(null);
  const pendingRoomLeaveCommandRef = useRef<RoomLeaveCommand | null>(null);
  const roomLeaveRetryRequestedRef = useRef(false);
  const sessionReplacedRef = useRef(false);

  function clearPendingGameStartRequest(): void {
    pendingGameStartCommandRef.current = null;
    gameStartRetryRequestedRef.current = false;
    setGameStartPending(false);
  }

  function clearPendingTurnSubmitRequest(): void {
    pendingTurnSubmitCommandRef.current = null;
    turnSubmitRetryRequestedRef.current = false;
    setTurnSubmitPending(false);
  }

  function clearPendingTurnActionRequest(settled = true): void {
    pendingTurnActionCommandRef.current = null;
    turnActionRetryRequestedRef.current = false;
    if (settled) {
      setTurnActionPending(false);
    }
  }

  function clearPendingRoomLeaveRequest(settled = true): void {
    pendingRoomLeaveCommandRef.current = null;
    roomLeaveRetryRequestedRef.current = false;
    if (settled) {
      setRoomLeavePending(false);
    }
  }

  function resetTurnDraftFromAuthority(): void {
    setTurnDraftResetGeneration((current) => current + 1);
  }

  function updateRoute(nextRoute: AppRoute): void {
    routeRef.current = nextRoute;
    setRoute(nextRoute);
  }

  function updateSnapshot(nextSnapshot: StateSnapshot | null): void {
    snapshotRef.current = nextSnapshot;
    setSnapshot(nextSnapshot);
  }

  function clearCurrentRoomClientState(
    message: string | null,
    navigateHome: boolean,
  ): void {
    clearStoredPlayerSession(window.sessionStorage);
    clearPendingRoomOperation(window.sessionStorage);
    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();
    clearPendingRoomLeaveRequest();
    updateSnapshot(null);
    resetTurnDraftFromAuthority();
    setOperationLabel(null);
    setCopyMessage(null);
    setErrorMessage(message);

    if (sessionReplacedRef.current) {
      sessionReplacedRef.current = false;
      setSessionReplaced(false);
      clientRef.current?.resetSessionReplacement();
    }

    if (navigateHome) {
      if (window.location.pathname !== "/") {
        window.history.pushState(null, "", "/");
      }
      updateRoute({ kind: "HOME" });
    }
  }

  function handleStaleSession(): void {
    if (pendingRoomLeaveCommandRef.current !== null) {
      clearCurrentRoomClientState(STALE_SESSION_MESSAGE, true);
      return;
    }

    clearCurrentRoomClientState(STALE_SESSION_MESSAGE, false);
  }

  function applyRoomLeaveClientOutcome(
    outcome:
      | "ACCEPTED"
      | "ROOM_CLOSED"
      | "DEFINITIVE_FAILURE"
      | "RETRYABLE_FAILURE",
    message: string | null,
  ): void {
    const action = decideRoomLeaveClientAction(outcome);
    if (action.roomState === "CLEAR_AND_GO_HOME") {
      clearCurrentRoomClientState(message, true);
      return;
    }

    if (action.pendingCommand === "CLEAR") {
      clearPendingRoomLeaveRequest(false);
    }
  }

  function navigateToRoom(roomCode: RoomCode): void {
    const path = createRoomPath(roomCode);
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    updateRoute({ kind: "ROOM", roomCode });
  }

  function storedSessionForCurrentRoute(): BrowserStoredPlayerSession | null {
    const currentRoute = routeRef.current;
    if (currentRoute.kind !== "ROOM") {
      return null;
    }

    return readStoredPlayerSessionForRoom(
      window.sessionStorage,
      currentRoute.roomCode,
    );
  }

  function applyOrderedSnapshot(
    incomingSnapshot: StateSnapshot,
    session: BrowserStoredPlayerSession,
  ): SnapshotApplication {
    if (!isSnapshotForSession(incomingSnapshot, session)) {
      setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
      return "REJECTED";
    }

    const currentRoute = routeRef.current;
    if (
      currentRoute.kind !== "ROOM" ||
      currentRoute.roomCode !== incomingSnapshot.room.roomCode
    ) {
      return "REJECTED";
    }

    const decision = decideSnapshotUpdate(
      snapshotRef.current,
      incomingSnapshot,
    );
    switch (decision) {
      case "APPLY":
        if (
          pendingTurnSubmitCommandRef.current !== null &&
          snapshotSupersedesPendingTurnSubmit(
            pendingTurnSubmitCommandRef.current,
            incomingSnapshot,
          )
        ) {
          clearPendingTurnSubmitRequest();
        }
        if (
          pendingTurnActionCommandRef.current !== null &&
          snapshotSupersedesPendingTurnAction(
            pendingTurnActionCommandRef.current,
            incomingSnapshot,
          )
        ) {
          clearPendingTurnActionRequest(false);
        }
        updateSnapshot(incomingSnapshot);
        return "CURRENT";
      case "KEEP_EQUAL":
      case "IGNORE_STALE":
        return "CURRENT";
      case "REQUEST_SYNC":
        return "REQUEST_SYNC";
    }
  }

  async function requestLatestSnapshot(
    allowFollowup = true,
  ): Promise<void> {
    if (sessionReplacedRef.current) {
      return;
    }
    if (syncFlightRef.current !== null) {
      syncRetryRequestedRef.current = true;
      return syncFlightRef.current;
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (client === null || !client.connected || session === null) {
      return;
    }

    const command: StateSyncCommand = {
      kind: "state:sync",
      protocolVersion: PROTOCOL_VERSION,
      requestId: createRequestId(),
      payload: {},
    };
    let followupRequired = false;
    const flight = (async () => {
      try {
        const acknowledgement = await client.syncState(command);
        if (!acknowledgement.ok) {
          if (isStaleSessionError(acknowledgement.error)) {
            handleStaleSession();
            return;
          }

          setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
          return;
        }

        const application = applyOrderedSnapshot(
          acknowledgement.data.snapshot,
          session,
        );
        if (application === "CURRENT") {
          setErrorMessage(null);
        } else if (application === "REQUEST_SYNC") {
          if (allowFollowup) {
            followupRequired = true;
          } else {
            setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
          }
        }
      } catch (error: unknown) {
        setErrorMessage(clientFailureMessage(error));
      }
    })();

    syncFlightRef.current = flight;
    try {
      await flight;
    } finally {
      if (syncFlightRef.current === flight) {
        syncFlightRef.current = null;
      }
    }

    const retryRequestedWhileActive = syncRetryRequestedRef.current;
    syncRetryRequestedRef.current = false;
    if (followupRequired || retryRequestedWhileActive) {
      await requestLatestSnapshot(false);
    }
  }

  function receiveSnapshot(incomingSnapshot: StateSnapshot): void {
    const session = storedSessionForCurrentRoute();
    if (session === null || !isSnapshotForSession(incomingSnapshot, session)) {
      return;
    }

    const application = applyOrderedSnapshot(incomingSnapshot, session);
    if (application === "REQUEST_SYNC") {
      void requestLatestSnapshot();
    } else if (
      application === "CURRENT" &&
      incomingSnapshot.room.phase === "PLAYING"
    ) {
      clearPendingGameStartRequest();
    }
  }

  async function executeGameStartCommand(
    command: GameStartCommand,
  ): Promise<void> {
    if (gameStartFlightRef.current !== null) {
      return gameStartFlightRef.current;
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (
      client === null ||
      !client.connected ||
      session === null ||
      sessionReplacedRef.current
    ) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingGameStartCommandRef.current = command;
    setGameStartPending(true);
    setOperationLabel("게임 시작 요청 중...");
    setErrorMessage(null);

    const flight = (async () => {
      try {
        const acknowledgement = await client.startGame(command);
        pendingGameStartCommandRef.current = null;

        if (!acknowledgement.ok) {
          setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
          if (
            acknowledgement.error.code === "STALE_ROOM_REVISION" ||
            acknowledgement.error.code === "INVALID_PHASE"
          ) {
            void requestLatestSnapshot();
          }
          return;
        }

        const application = applyOrderedSnapshot(
          acknowledgement.data.snapshot,
          session,
        );
        if (application === "CURRENT") {
          setErrorMessage(null);
        } else if (application === "REQUEST_SYNC") {
          void requestLatestSnapshot();
        }
      } catch (error: unknown) {
        if (!isRetryableCommandFailure(error)) {
          pendingGameStartCommandRef.current = null;
          if (
            error instanceof RealtimeClientError &&
            error.code === "INVALID_SERVER_RESPONSE"
          ) {
            void requestLatestSnapshot();
          }
        }
        setErrorMessage(clientFailureMessage(error));
      }
    })();

    gameStartFlightRef.current = flight;
    try {
      await flight;
    } finally {
      if (gameStartFlightRef.current === flight) {
        gameStartFlightRef.current = null;
        setGameStartPending(false);
        setOperationLabel(null);
      }
    }

    const retryRequestedWhileActive = gameStartRetryRequestedRef.current;
    gameStartRetryRequestedRef.current = false;
    const pendingCommand = pendingGameStartCommandRef.current;
    if (
      retryRequestedWhileActive &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeGameStartCommand(pendingCommand);
    }
  }

  async function executeTurnSubmitCommand(
    command: TurnSubmitCommand,
  ): Promise<void> {
    if (gameplayMutationFlightRef.current !== null) {
      return gameplayMutationFlightRef.current;
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (
      client === null ||
      !client.connected ||
      session === null ||
      sessionReplacedRef.current
    ) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingTurnSubmitCommandRef.current = command;
    setTurnSubmitPending(true);
    setOperationLabel("배치 제출 중...");
    setErrorMessage(null);

    const flight = runTurnSubmitSingleFlight(
      gameplayMutationFlightRef,
      async () => {
        try {
          const acknowledgement = await client.submitTurn(command);
          pendingTurnSubmitCommandRef.current = null;

          if (!acknowledgement.ok) {
            setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
            if (
              decideTurnSubmitFailureAction(
                acknowledgement.error.code,
                acknowledgement.scope === "ROOM"
                  ? acknowledgement.versions.gameRevision
                  : null,
                command.expectedGameRevision,
              ) === "RESET_DRAFT_AND_SYNC"
            ) {
              resetTurnDraftFromAuthority();
              void requestLatestSnapshot();
            }
            return;
          }

          const application = applyOrderedSnapshot(
            acknowledgement.data.snapshot,
            session,
          );
          if (application === "CURRENT") {
            setErrorMessage(null);
          } else {
            resetTurnDraftFromAuthority();
            void requestLatestSnapshot();
          }
        } catch (error: unknown) {
          if (!isRetryableCommandFailure(error)) {
            pendingTurnSubmitCommandRef.current = null;
            if (
              error instanceof RealtimeClientError &&
              error.code === "INVALID_SERVER_RESPONSE"
            ) {
              resetTurnDraftFromAuthority();
              void requestLatestSnapshot();
            }
          }
          setErrorMessage(clientFailureMessage(error));
        }
      },
    );
    try {
      await flight;
    } finally {
      setTurnSubmitPending(false);
      setOperationLabel(null);
    }

    const retryRequestedWhileActive = turnSubmitRetryRequestedRef.current;
    turnSubmitRetryRequestedRef.current = false;
    const pendingCommand = pendingTurnSubmitCommandRef.current;
    if (
      retryRequestedWhileActive &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeTurnSubmitCommand(pendingCommand);
    }
  }

  async function executeTurnActionCommand(
    command: PendingTurnActionCommand,
  ): Promise<void> {
    if (gameplayMutationFlightRef.current !== null) {
      return gameplayMutationFlightRef.current;
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (
      client === null ||
      !client.connected ||
      session === null ||
      sessionReplacedRef.current
    ) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingTurnActionCommandRef.current = command;
    setTurnActionPending(true);
    setOperationLabel(
      command.kind === "turn:draw" ? "타일 가져오는 중..." : "턴 넘기는 중...",
    );
    setErrorMessage(null);

    const flight = runTurnActionSingleFlight(
      gameplayMutationFlightRef,
      async () => {
        try {
          const acknowledgement =
            command.kind === "turn:draw"
              ? await client.drawTurn(command)
              : await client.passTurn(command);
          pendingTurnActionCommandRef.current = null;

          if (!acknowledgement.ok) {
            setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
            if (
              decideTurnActionFailureAction(
                acknowledgement.error.code,
                acknowledgement.scope === "ROOM"
                  ? acknowledgement.versions.gameRevision
                  : null,
                command.expectedGameRevision,
              ) === "RESET_DRAFT_AND_SYNC"
            ) {
              resetTurnDraftFromAuthority();
              void requestLatestSnapshot();
            }
            return;
          }

          const application = applyOrderedSnapshot(
            acknowledgement.data.snapshot,
            session,
          );
          if (application === "CURRENT") {
            setErrorMessage(null);
          } else {
            resetTurnDraftFromAuthority();
            void requestLatestSnapshot();
          }
        } catch (error: unknown) {
          if (!isRetryableCommandFailure(error)) {
            pendingTurnActionCommandRef.current = null;
            if (
              error instanceof RealtimeClientError &&
              error.code === "INVALID_SERVER_RESPONSE"
            ) {
              resetTurnDraftFromAuthority();
              void requestLatestSnapshot();
            }
          }
          setErrorMessage(clientFailureMessage(error));
        }
      },
    );
    try {
      await flight;
    } finally {
      setTurnActionPending(false);
      setOperationLabel(null);
    }

    const retryRequestedWhileActive = turnActionRetryRequestedRef.current;
    turnActionRetryRequestedRef.current = false;
    const pendingCommand = pendingTurnActionCommandRef.current;
    if (
      retryRequestedWhileActive &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeTurnActionCommand(pendingCommand);
    }
  }

  async function executeRoomLeaveCommand(
    command: RoomLeaveCommand,
  ): Promise<void> {
    if (roomLeaveFlightRef.current !== null) {
      return roomLeaveFlightRef.current;
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (
      client === null ||
      !client.connected ||
      session === null ||
      sessionReplacedRef.current
    ) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingRoomLeaveCommandRef.current = command;
    setRoomLeavePending(true);
    setOperationLabel("방에서 나가는 중...");
    setErrorMessage(null);

    const flight = runRoomLeaveSingleFlight(
      roomLeaveFlightRef,
      async () => {
        try {
          const acknowledgement = await client.leaveRoom(command);
          if (!acknowledgement.ok) {
            if (
              isStaleRoomLeaveSessionFailure(acknowledgement.error.code)
            ) {
              handleStaleSession();
              return;
            }
            applyRoomLeaveClientOutcome("DEFINITIVE_FAILURE", null);
            setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
            if (
              shouldRequestSyncAfterRoomLeaveFailure(
                acknowledgement.error.code,
              )
            ) {
              void requestLatestSnapshot();
            }
            return;
          }

          const currentSnapshot = snapshotRef.current;
          if (
            acknowledgement.data.roomCode !==
              session.credential.roomCode ||
            (currentSnapshot !== null &&
              acknowledgement.data.roomId !== currentSnapshot.room.roomId)
          ) {
            applyRoomLeaveClientOutcome("DEFINITIVE_FAILURE", null);
            setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
            void requestLatestSnapshot();
            return;
          }

          applyRoomLeaveClientOutcome("ACCEPTED", "방에서 나왔습니다.");
        } catch (error: unknown) {
          applyRoomLeaveClientOutcome(
            isRetryableCommandFailure(error)
              ? "RETRYABLE_FAILURE"
              : "DEFINITIVE_FAILURE",
            null,
          );
          setErrorMessage(clientFailureMessage(error));
        }
      },
    );

    try {
      await flight;
    } finally {
      setRoomLeavePending(false);
      setOperationLabel(null);
    }

    const retryRequestedWhileActive = roomLeaveRetryRequestedRef.current;
    roomLeaveRetryRequestedRef.current = false;
    const pendingCommand = pendingRoomLeaveCommandRef.current;
    if (
      retryRequestedWhileActive &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeRoomLeaveCommand(pendingCommand);
    }
  }

  async function resumeCurrentSession(): Promise<void> {
    if (resumeFlightRef.current !== null || sessionReplacedRef.current) {
      return resumeFlightRef.current ?? Promise.resolve();
    }

    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (client === null || !client.connected || session === null) {
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const command: SessionResumeCommand = {
      kind: "session:resume",
      protocolVersion: PROTOCOL_VERSION,
      requestId: createRequestId(),
      payload: {
        credential: session.credential,
        lastSeenVersions:
          currentSnapshot !== null &&
          isSnapshotForSession(currentSnapshot, session)
            ? currentSnapshot.versions
            : null,
      },
    };

    setOperationLabel("연결 복원 중...");
    const flight = (async () => {
      try {
        const acknowledgement = await client.resumeSession(command);
        if (!acknowledgement.ok) {
          if (isStaleSessionError(acknowledgement.error)) {
            handleStaleSession();
            return;
          }

          setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
          return;
        }

        const application = applyOrderedSnapshot(
          acknowledgement.data.snapshot,
          session,
        );
        if (application === "CURRENT") {
          setErrorMessage(null);
        } else if (application === "REQUEST_SYNC") {
          void requestLatestSnapshot();
        }
      } catch (error: unknown) {
        setErrorMessage(clientFailureMessage(error));
      }
    })();

    resumeFlightRef.current = flight;
    try {
      await flight;
    } finally {
      if (resumeFlightRef.current === flight) {
        resumeFlightRef.current = null;
        setOperationLabel(null);
      }
    }

    if (
      resumeRetryRequestedRef.current &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      resumeRetryRequestedRef.current = false;
      await resumeCurrentSession();
    }
  }

  function finalizeEntry(
    operation: PendingRoomOperation,
    acknowledgement: EntryAck,
  ): void {
    if (!acknowledgement.ok) {
      clearPendingRoomOperation(window.sessionStorage);
      setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
      return;
    }

    const nextSnapshot = acknowledgement.data.snapshot;
    if (
      operation.kind === "room:join" &&
      operation.payload.roomCode !== nextSnapshot.room.roomCode
    ) {
      setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
      return;
    }

    const nextSession: BrowserStoredPlayerSession = {
      protocolVersion: PROTOCOL_VERSION,
      playerId: nextSnapshot.self.playerId,
      credential: {
        roomCode: nextSnapshot.room.roomCode,
        sessionToken: operation.payload.bootstrapCredential.sessionToken,
      },
    };

    if (!isSnapshotForSession(nextSnapshot, nextSession)) {
      setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
      return;
    }

    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();

    const sessionStored = writeStoredPlayerSession(
      window.sessionStorage,
      nextSession,
    );
    if (sessionStored) {
      clearPendingRoomOperation(window.sessionStorage);
    }

    navigateToRoom(nextSnapshot.room.roomCode);
    const application = applyOrderedSnapshot(nextSnapshot, nextSession);
    if (application === "REJECTED") {
      return;
    }
    if (application === "REQUEST_SYNC") {
      void requestLatestSnapshot();
    }
    setErrorMessage(sessionStored ? null : STORAGE_UNAVAILABLE_MESSAGE);
  }

  async function executePendingOperation(
    operation: PendingRoomOperation,
  ): Promise<void> {
    if (entryFlightRef.current !== null) {
      return entryFlightRef.current;
    }

    const client = clientRef.current;
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setOperationLabel(entryLabel(operation));
    setErrorMessage(null);
    const flight = (async () => {
      try {
        const acknowledgement =
          operation.kind === "room:create"
            ? await client.createRoom(operation)
            : await client.joinRoom(operation);
        finalizeEntry(operation, acknowledgement);
      } catch (error: unknown) {
        setErrorMessage(clientFailureMessage(error));
      }
    })();

    entryFlightRef.current = flight;
    try {
      await flight;
    } finally {
      if (entryFlightRef.current === flight) {
        entryFlightRef.current = null;
        setOperationLabel(null);
      }
    }

    if (
      pendingRetryRequestedRef.current &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      pendingRetryRequestedRef.current = false;
      const retryOperation = readPendingRoomOperation(window.sessionStorage);
      if (
        retryOperation !== null &&
        pendingMatchesRoute(retryOperation, routeRef.current)
      ) {
        await executePendingOperation(retryOperation);
      }
    }
  }

  async function bootstrapForEntry(): Promise<
    | { ok: true; sessionToken: PendingRoomOperation["payload"]["bootstrapCredential"]["sessionToken"] }
    | { ok: false }
  > {
    const client = clientRef.current;
    if (client === null || !client.connected) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return { ok: false };
    }

    try {
      const acknowledgement = await client.bootstrapSession({
        kind: "session:bootstrap",
        protocolVersion: PROTOCOL_VERSION,
        requestId: createRequestId(),
        payload: {},
      });
      if (!acknowledgement.ok) {
        setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
        return { ok: false };
      }

      return {
        ok: true,
        sessionToken: acknowledgement.data.credential.sessionToken,
      };
    } catch (error: unknown) {
      setErrorMessage(clientFailureMessage(error));
      return { ok: false };
    }
  }

  async function startCreateRoom(normalizedNickname: Nickname): Promise<void> {
    const pending = readPendingRoomOperation(window.sessionStorage);
    if (
      pending?.kind === "room:create" &&
      pending.payload.nickname === normalizedNickname
    ) {
      await executePendingOperation(pending);
      return;
    }

    if (pending !== null) {
      clearPendingRoomOperation(window.sessionStorage);
    }

    setOperationLabel("연결 중...");
    const bootstrap = await bootstrapForEntry();
    if (!bootstrap.ok) {
      setOperationLabel(null);
      return;
    }

    const operation = createPendingRoomCreateOperation({
      requestId: createRequestId(),
      sessionToken: bootstrap.sessionToken,
      nickname: normalizedNickname,
    });
    if (!writePendingRoomOperation(window.sessionStorage, operation)) {
      setOperationLabel(null);
      setErrorMessage(STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }

    await executePendingOperation(operation);
  }

  async function startJoinRoom(
    normalizedNickname: Nickname,
    normalizedRoomCode: RoomCode,
  ): Promise<void> {
    const pending = readPendingRoomOperation(window.sessionStorage);
    if (
      pending?.kind === "room:join" &&
      pending.payload.nickname === normalizedNickname &&
      pending.payload.roomCode === normalizedRoomCode
    ) {
      await executePendingOperation(pending);
      return;
    }

    if (pending !== null) {
      clearPendingRoomOperation(window.sessionStorage);
    }

    setOperationLabel("연결 중...");
    const bootstrap = await bootstrapForEntry();
    if (!bootstrap.ok) {
      setOperationLabel(null);
      return;
    }

    const operation = createPendingRoomJoinOperation({
      requestId: createRequestId(),
      sessionToken: bootstrap.sessionToken,
      nickname: normalizedNickname,
      roomCode: normalizedRoomCode,
    });
    if (!writePendingRoomOperation(window.sessionStorage, operation)) {
      setOperationLabel(null);
      setErrorMessage(STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }

    await executePendingOperation(operation);
  }

  async function recoverAfterTransportConnection(): Promise<void> {
    if (sessionReplacedRef.current) {
      return;
    }

    const pending = readPendingRoomOperation(window.sessionStorage);
    if (pending !== null && pendingMatchesRoute(pending, routeRef.current)) {
      setNicknameState(pending.payload.nickname);
      if (pending.kind === "room:join") {
        setRoomCodeInputState(pending.payload.roomCode);
      }
      if (entryFlightRef.current !== null) {
        pendingRetryRequestedRef.current = true;
        await entryFlightRef.current;
      } else {
        pendingRetryRequestedRef.current = false;
        await executePendingOperation(pending);
      }
      return;
    }

    if (resumeFlightRef.current !== null) {
      resumeRetryRequestedRef.current = true;
      await resumeFlightRef.current;
    } else {
      resumeRetryRequestedRef.current = false;
      await resumeCurrentSession();
    }

    const pendingRoomLeaveCommand = pendingRoomLeaveCommandRef.current;
    if (pendingRoomLeaveCommand !== null && !sessionReplacedRef.current) {
      if (roomLeaveFlightRef.current !== null) {
        roomLeaveRetryRequestedRef.current = true;
        await roomLeaveFlightRef.current;
      } else {
        await executeRoomLeaveCommand(pendingRoomLeaveCommand);
      }
      return;
    }

    const pendingGameStartCommand = pendingGameStartCommandRef.current;
    if (pendingGameStartCommand !== null && !sessionReplacedRef.current) {
      if (gameStartFlightRef.current !== null) {
        gameStartRetryRequestedRef.current = true;
        await gameStartFlightRef.current;
      } else {
        await executeGameStartCommand(pendingGameStartCommand);
      }
    }

    const pendingTurnSubmitCommand = pendingTurnSubmitCommandRef.current;
    if (sessionReplacedRef.current) {
      return;
    }
    if (pendingTurnSubmitCommand !== null) {
      if (gameplayMutationFlightRef.current !== null) {
        turnSubmitRetryRequestedRef.current = true;
        await gameplayMutationFlightRef.current;
      } else {
        await executeTurnSubmitCommand(pendingTurnSubmitCommand);
      }
    }

    const pendingTurnActionCommand = pendingTurnActionCommandRef.current;
    if (pendingTurnActionCommand === null || sessionReplacedRef.current) {
      return;
    }
    if (gameplayMutationFlightRef.current !== null) {
      turnActionRetryRequestedRef.current = true;
      await gameplayMutationFlightRef.current;
      return;
    }

    await executeTurnActionCommand(pendingTurnActionCommand);
  }

  useEffect(() => {
    const client = createRealtimeClient();
    clientRef.current = client;

    const unsubscribeConnection = client.subscribeConnectionState((state) => {
      setConnectionState(state);
    });
    const unsubscribeConnected = client.subscribeTransportConnected(() => {
      void recoverAfterTransportConnection();
    });
    const unsubscribeSnapshot = client.subscribeSnapshot((event) => {
      receiveSnapshot(event.payload.snapshot);
    });
    const unsubscribeTurnStarted = client.subscribeTurnStarted((event) => {
      const currentSnapshot = snapshotRef.current;
      if (currentSnapshot === null) {
        void requestLatestSnapshot();
        return;
      }

      const decision = compareStateVersions(
        currentSnapshot.versions,
        event.versions,
      );
      if (decision === "APPLY" || decision === "REQUEST_SYNC") {
        void requestLatestSnapshot();
      }
    });
    const unsubscribeGameFinished = client.subscribeGameFinished((event) => {
      const currentSnapshot = snapshotRef.current;
      if (
        currentSnapshot === null ||
        !("game" in currentSnapshot) ||
        currentSnapshot.room.phase !== "FINISHED" ||
        "turn" in currentSnapshot.game ||
        currentSnapshot.game.gameId !== event.payload.gameId ||
        currentSnapshot.versions.gameRevision < event.payload.gameRevision
      ) {
        void requestLatestSnapshot();
      }
    });
    const unsubscribeRoomClosed = client.subscribeRoomClosed((event) => {
      const currentRoute = routeRef.current;
      const currentSnapshot = snapshotRef.current;
      const currentRoomCode =
        currentRoute.kind === "ROOM" ? currentRoute.roomCode : null;
      if (
        roomClosedMatchesCurrentRoom(
          currentSnapshot?.room.roomId ?? null,
          currentRoomCode,
          event.payload.roomId,
          event.payload.roomCode,
        )
      ) {
        applyRoomLeaveClientOutcome(
          "ROOM_CLOSED",
          "방이 종료되어 홈으로 이동했습니다.",
        );
      }
    });
    const unsubscribeReplaced = client.subscribeSessionReplaced(() => {
      sessionReplacedRef.current = true;
      setSessionReplaced(true);
      setOperationLabel(null);
      setErrorMessage(null);
      clearStoredPlayerSession(window.sessionStorage);
      clearPendingRoomOperation(window.sessionStorage);
      clearPendingGameStartRequest();
      clearPendingTurnSubmitRequest();
      clearPendingTurnActionRequest();
      clearPendingRoomLeaveRequest();
      resetTurnDraftFromAuthority();
    });
    const unsubscribeProtocolIssue = client.subscribeProtocolIssue(() => {
      setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
      void requestLatestSnapshot();
    });

    const normalizedInitialRoute = parseAppPathname(window.location.pathname);
    if (normalizedInitialRoute.kind === "ROOM") {
      const canonicalPath = createRoomPath(normalizedInitialRoute.roomCode);
      if (window.location.pathname !== canonicalPath) {
        window.history.replaceState(null, "", canonicalPath);
      }
      updateRoute(normalizedInitialRoute);
    }

    const initialPending = readPendingRoomOperation(window.sessionStorage);
    if (
      initialPending !== null &&
      pendingMatchesRoute(initialPending, normalizedInitialRoute)
    ) {
      setNicknameState(initialPending.payload.nickname);
      if (initialPending.kind === "room:join") {
        setRoomCodeInputState(initialPending.payload.roomCode);
      }
    }

    const handlePopState = () => {
      const nextRoute = parseAppPathname(window.location.pathname);
      updateRoute(nextRoute);
      setErrorMessage(null);
      setCopyMessage(null);

      const currentSnapshot = snapshotRef.current;
      if (
        currentSnapshot !== null &&
        (shouldDiscardPendingTurnSubmitOnNavigation(
          currentSnapshot.room.roomCode,
          nextRoute.kind === "ROOM" ? nextRoute.roomCode : null,
        ) ||
          shouldDiscardPendingTurnActionOnNavigation(
            currentSnapshot.room.roomCode,
            nextRoute.kind === "ROOM" ? nextRoute.roomCode : null,
          ))
      ) {
        clearPendingGameStartRequest();
        clearPendingTurnSubmitRequest();
        clearPendingTurnActionRequest();
        clearPendingRoomLeaveRequest();
        updateSnapshot(null);
        client.disconnect();
        client.connect();
        return;
      }

      if (client.connected) {
        void recoverAfterTransportConnection();
      }
    };

    window.addEventListener("popstate", handlePopState);
    client.connect();

    return () => {
      window.removeEventListener("popstate", handlePopState);
      unsubscribeConnection();
      unsubscribeConnected();
      unsubscribeSnapshot();
      unsubscribeTurnStarted();
      unsubscribeGameFinished();
      unsubscribeRoomClosed();
      unsubscribeReplaced();
      unsubscribeProtocolIssue();
      client.destroy();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, []);

  function setNickname(value: string): void {
    setNicknameState(value);
    setErrorMessage(null);
  }

  function setRoomCodeInput(value: string): void {
    setRoomCodeInputState(value);
    setErrorMessage(null);
  }

  function runEntryAction(action: () => Promise<void>): void {
    entryActionActiveRef.current = true;
    void (async () => {
      try {
        await action();
      } catch {
        setErrorMessage(
          "요청을 준비하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.",
        );
      } finally {
        entryActionActiveRef.current = false;
        setOperationLabel(null);
      }
    })();
  }

  function createRoom(): void {
    if (
      entryActionActiveRef.current ||
      entryFlightRef.current !== null ||
      resumeFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
      setErrorMessage(getUserErrorMessage(nicknameResult.error.code));
      return;
    }

    setNicknameState(nicknameResult.value);
    runEntryAction(() => startCreateRoom(nicknameResult.value));
  }

  function joinRoom(): void {
    if (
      entryActionActiveRef.current ||
      entryFlightRef.current !== null ||
      resumeFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const nicknameResult = validateNickname(nickname);
    if (!nicknameResult.ok) {
      setErrorMessage(getUserErrorMessage(nicknameResult.error.code));
      return;
    }

    const currentRoute = routeRef.current;
    const roomCodeResult = validateRoomCode(
      currentRoute.kind === "ROOM"
        ? currentRoute.roomCode
        : roomCodeInput,
    );
    if (!roomCodeResult.ok) {
      setErrorMessage(getUserErrorMessage(roomCodeResult.error.code));
      return;
    }

    setNicknameState(nicknameResult.value);
    setRoomCodeInputState(roomCodeResult.value);
    runEntryAction(() =>
      startJoinRoom(nicknameResult.value, roomCodeResult.value),
    );
  }

  function copyInvitation(invitationUrl: string): void {
    try {
      if (navigator.clipboard === undefined) {
        setCopyMessage("복사하지 못했습니다. 주소를 직접 선택해주세요.");
        return;
      }

      void navigator.clipboard.writeText(invitationUrl).then(
        () => {
          setCopyMessage("초대 URL을 복사했습니다.");
        },
        () => {
          setCopyMessage("복사하지 못했습니다. 주소를 직접 선택해주세요.");
        },
      );
    } catch {
      setCopyMessage("복사하지 못했습니다. 주소를 직접 선택해주세요.");
    }
  }

  function startGame(): void {
    if (
      gameStartFlightRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const client = clientRef.current;
    if (
      currentSnapshot === null ||
      !getGameStartControl(currentSnapshot, false).canStart
    ) {
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const command = createOrReuseGameStartCommand(
      pendingGameStartCommandRef.current,
      currentSnapshot.versions.roomRevision,
      createRequestId,
    );
    pendingGameStartCommandRef.current = command;
    void executeGameStartCommand(command);
  }

  function submitTurn(draft: TurnDraft): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnActionCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const client = clientRef.current;
    if (
      currentSnapshot?.room.phase !== "PLAYING" ||
      !("game" in currentSnapshot) ||
      !("turn" in currentSnapshot.game) ||
      currentSnapshot.versions.gameRevision !== draft.baseGameRevision ||
      currentSnapshot.game.turn.turnId !== draft.baseTurnId ||
      currentSnapshot.game.turn.activePlayerId !==
        currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const command = createOrReuseTurnSubmitCommand(
      pendingTurnSubmitCommandRef.current,
      draft,
      createRequestId,
    );
    pendingTurnSubmitCommandRef.current = command;
    void executeTurnSubmitCommand(command);
  }

  function drawTurn(bagKind: TurnDrawBagKind): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const client = clientRef.current;
    if (
      currentSnapshot?.room.phase !== "PLAYING" ||
      !("game" in currentSnapshot) ||
      !("turn" in currentSnapshot.game) ||
      currentSnapshot.game.turn.activePlayerId !==
        currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const pending = pendingTurnActionCommandRef.current;
    if (
      pending !== null &&
      (pending.kind !== "turn:draw" || pending.payload.bagKind !== bagKind)
    ) {
      setErrorMessage(
        "이전 턴 종료 요청의 결과를 확인 중입니다. 같은 요청을 다시 시도해주세요.",
      );
      return;
    }

    const command = createOrReuseTurnDrawCommand(
      pending,
      currentSnapshot.versions.gameRevision,
      currentSnapshot.game.turn.turnId,
      bagKind,
      createRequestId,
    );
    pendingTurnActionCommandRef.current = command;
    void executeTurnActionCommand(command);
  }

  function passTurn(): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const client = clientRef.current;
    if (
      currentSnapshot?.room.phase !== "PLAYING" ||
      !("game" in currentSnapshot) ||
      !("turn" in currentSnapshot.game) ||
      currentSnapshot.game.turn.activePlayerId !==
        currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const pending = pendingTurnActionCommandRef.current;
    if (pending !== null && pending.kind !== "turn:pass") {
      setErrorMessage(
        "이전 턴 종료 요청의 결과를 확인 중입니다. 같은 요청을 다시 시도해주세요.",
      );
      return;
    }

    const command = createOrReuseTurnPassCommand(
      pending,
      currentSnapshot.versions.gameRevision,
      currentSnapshot.game.turn.turnId,
      createRequestId,
    );
    pendingTurnActionCommandRef.current = command;
    void executeTurnActionCommand(command);
  }

  function leaveRoom(): void {
    if (
      roomLeaveFlightRef.current !== null ||
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      pendingTurnActionCommandRef.current !== null ||
      gameStartFlightRef.current !== null ||
      pendingGameStartCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      operationLabel !== null
    ) {
      setErrorMessage(
        "이전 요청의 결과를 확인한 뒤 방에서 나갈 수 있습니다.",
      );
      return;
    }

    const currentSnapshot = snapshotRef.current;
    const client = clientRef.current;
    if (currentSnapshot === null || routeRef.current.kind !== "ROOM") {
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (!window.confirm(roomLeaveConfirmationMessage(currentSnapshot.room.phase))) {
      return;
    }

    const command = createOrReuseRoomLeaveCommand(
      pendingRoomLeaveCommandRef.current,
      currentSnapshot.versions.roomRevision,
      currentSnapshot.versions.gameRevision,
      createRequestId,
    );
    pendingRoomLeaveCommandRef.current = command;
    void executeRoomLeaveCommand(command);
  }

  function goHome(): void {
    if (sessionReplacedRef.current) {
      clearCurrentRoomClientState(null, true);
      if (clientRef.current !== null && !clientRef.current.connected) {
        clientRef.current.connect();
      }
      return;
    }

    updateSnapshot(null);
    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();
    clearPendingRoomLeaveRequest();
    setErrorMessage(null);
    setCopyMessage(null);
    if (window.location.pathname !== "/") {
      window.history.pushState(null, "", "/");
    }
    updateRoute({ kind: "HOME" });
    if (clientRef.current !== null && !clientRef.current.connected) {
      clientRef.current.connect();
    }
  }

  return {
    route,
    nickname,
    roomCodeInput,
    snapshot,
    connectionState,
    operationLabel,
    errorMessage,
    copyMessage,
    sessionReplaced,
    gameStartPending,
    turnSubmitPending,
    turnActionPending,
    roomLeavePending,
    turnDraftResetGeneration,
    setNickname,
    setRoomCodeInput,
    createRoom,
    joinRoom,
    startGame,
    submitTurn,
    drawTurn,
    passTurn,
    leaveRoom,
    copyInvitation,
    goHome,
  };
}
