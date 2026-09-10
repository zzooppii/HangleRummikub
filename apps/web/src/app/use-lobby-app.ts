import type { WolfClientCommand } from "@hangul-rummikub/shared";
import type { DrawClientCommand } from "@hangul-rummikub/shared";
import type { SneakyClientCommand } from "@hangul-rummikub/shared";
import {
  type CityClientCommand,
  type CityRolePlayingPlatformSnapshotV2,
  PROTOCOL_VERSION,
  validateNickname,
  validateRoomCode,
  type BrowserStoredPlayerSession,
  type ErrorDto,
  type GameStartCommand,
  type GameType,
  type GemCardPlayingPlatformSnapshotV2,
  type GemCollectSelectionDto,
  type GemMarketSourceDto,
  type GemPurchaseSourceDto,
  type Nickname,
  type NumberSubmitCommand,
  type NumberTilePlayingPlatformSnapshotV2,
  type RequestId,
  type RoomCode,
  type RoomCreateWireAck,
  type RoomJoinWireAck,
  type RoomLeaveCommand,
  type SessionResumeCommand,
  type StateSnapshot,
  type StateSnapshotWirePayload,
  type StateSyncCommand,
  type TurnDrawBagKind,
  type TurnSubmitCommand,
} from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";

import { getUserErrorMessage } from "../lib/error-messages.js";
import { runAsyncSingleFlight } from "../lib/async-single-flight.js";
import {
  createGemCollectCommand,
  createGemPurchaseCommand,
  createGemReserveCommand,
  createGemYieldCommand,
  gemCardActionFeedback as createGemActionFeedback,
  gemCardCommandKind,
  gemSnapshotSupersedesCommand,
  shouldResetGemSelectionAfterFailure,
  type GemCardActionFeedback,
  type GemCardActionKind,
  type PendingGemCardCommand,
} from "../features/gem-card/gem-card-actions.js";
import { createCityCommand, cityActionFeedback, cityProtectionRejection, cityErrorMessage, type CityActionIntent, type CityActionFeedback } from "../features/city-role/city-role-actions.js";
import { DEFAULT_SELECTED_GAME_TYPE } from "../features/game-catalog/game-catalog.js";
import {
  createOrReuseGameStartCommand,
  getGameStartControl,
} from "../lib/game-start.js";
import {
  createRealtimeClient,
  RealtimeClientError,
  type RealtimeClient,
  type RealtimeConnectionState,
  type RealtimeProtocolIssue,
} from "../lib/realtime-client.js";
import { createRequestId } from "../lib/request-id.js";
import {
  browserSavedGameStorage,
  MISSING_RESUME_CREDENTIAL,
  type SavedGameEntry,
} from "../lib/saved-game.js";
import {
  createOrReuseNumberDrawCommand,
  createOrReuseNumberPassCommand,
  createOrReuseNumberSubmitCommand,
  decideNumberTileCommandFailureAction,
  numberSnapshotSupersedesCommand,
  runNumberTileCommandSingleFlight,
  type PendingNumberTileActionCommand,
} from "../lib/number-tile-actions.js";
import {
  projectRoomSnapshotShell,
  type RoomSnapshotShell,
} from "../lib/room-snapshot-shell.js";
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
  createPendingRoomCreateOperation,
  createPendingRoomJoinOperation,
  readPendingRoomOperation,
  writePendingRoomOperation,
  type PendingRoomOperation,
} from "../lib/session-storage.js";
import {
  decideGameFinishedAdvisory,
  decideSnapshotUpdate,
  decideTurnStartedAdvisory,
} from "../lib/snapshot-state.js";
import {
  decodeWebSnapshot,
  type CompatibleWebSnapshot,
  type WebSnapshotIncompatibilityReason,
} from "../lib/snapshot-wire-decoder.js";
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
import type { NumberTileTurnDraft } from "../features/number-tile/number-tile-turn-draft.js";
import {
  markNumberTileActionFeedback,
  numberTileActionSoundCue,
  playNumberTileSound,
  readNumberTileSoundEnabled,
  type NumberTileActionFeedback,
  type NumberTileActionFeedbackKind,
} from "../features/number-tile/number-tile-sound.js";

const STALE_SESSION_MESSAGE =
  "재접속 유예 시간이 만료되었거나 방이 종료되어 연결 정보가 더 이상 유효하지 않습니다. 새 방을 만들거나 다시 참가해주세요.";
const STORAGE_UNAVAILABLE_MESSAGE =
  "브라우저 저장소를 사용할 수 없어 새로고침 복구가 제한됩니다. 이 창을 닫지 말고 다시 시도해주세요.";
const CONNECTION_RETRY_MESSAGE =
  "서버 응답을 확인하지 못했습니다. 연결이 복구되면 같은 요청으로 다시 시도합니다.";
const INVALID_SERVER_STATE_MESSAGE =
  "서버 상태를 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";

type EntryAck = RoomCreateWireAck | RoomJoinWireAck;
type SnapshotApplication = "CURRENT" | "REQUEST_SYNC" | "REJECTED";
export type NumberTileCommandRetryKind = "SUBMIT" | "DRAW" | "PASS" | null;

function isCityPlayingSnapshot(snapshot: Extract<CompatibleWebSnapshot, { kind: "PLATFORM_V2_CITY_ROLE" }>["platformSnapshot"]): snapshot is CityRolePlayingPlatformSnapshotV2 {
  return snapshot.room.phase === "PLAYING" && snapshot.game !== null && "window" in snapshot.game;
}

function isGemCardPlayingSnapshot(
  snapshot: Extract<CompatibleWebSnapshot,
    { kind: "PLATFORM_V2_GEM_CARD" }>["platformSnapshot"],
): snapshot is GemCardPlayingPlatformSnapshotV2 {
  return snapshot.room.phase === "PLAYING" && snapshot.game !== null &&
    snapshot.game.gameType === "GEM_CARD" && "turn" in snapshot.game;
}

function isNumberTilePlayingSnapshot(
  snapshot: Extract<
    CompatibleWebSnapshot,
    { kind: "PLATFORM_V2_NUMBER_TILE" }
  >["platformSnapshot"],
): snapshot is NumberTilePlayingPlatformSnapshotV2 {
  return (
    snapshot.room.phase === "PLAYING" &&
    snapshot.game !== null &&
    snapshot.game.gameType === "NUMBER_TILE" &&
    "turn" in snapshot.game
  );
}
export type SnapshotIncompatibility =
  | WebSnapshotIncompatibilityReason
  | Extract<
      RealtimeProtocolIssue,
      { kind: "INCOMPATIBLE_SNAPSHOT" }
    >["reason"];

export type LobbyAppState = Readonly<{
  route: AppRoute;
  nickname: string;
  roomCodeInput: string;
  snapshot: RoomSnapshotShell | null;
  compatibleSnapshot: CompatibleWebSnapshot | null;
  snapshotIncompatibility: SnapshotIncompatibility | null;
  connectionState: RealtimeConnectionState;
  savedGame: SavedGameEntry | null;
  reconnectNeeded: boolean;
  resumePending: boolean;
  reconnect: () => void;
  operationLabel: string | null;
  errorMessage: string | null;
  copyMessage: string | null;
  sessionReplaced: boolean;
  gameStartPending: boolean;
  turnSubmitPending: boolean;
  turnActionPending: boolean;
  numberCommandRetryKind: NumberTileCommandRetryKind;
  numberActionFeedback: NumberTileActionFeedback | null;
  gemActionPending: boolean;
  gemCommandRetryKind: GemCardActionKind | null;
  gemActionFeedback: GemCardActionFeedback | null;
  gemSelectionResetGeneration: number;
  cityActionPending: boolean;
  cityRetryPending: boolean;
  cityActionFeedback: CityActionFeedback | null;
  citySelectionResetGeneration: number;
  actCity: (intent: CityActionIntent) => void;
  retryCityAction: () => void;
  roomLeavePending: boolean;
  turnDraftResetGeneration: number;
  setNickname: (value: string) => void;
  setRoomCodeInput: (value: string) => void;
  createRoom: (gameType: GameType) => void;
  joinRoom: () => void;
  startGame: () => void;
  submitTurn: (draft: TurnDraft) => void;
  drawTurn: (bagKind: TurnDrawBagKind) => void;
  passTurn: () => void;
  submitNumberTurn: (draft: NumberTileTurnDraft) => void;
  drawNumberTurn: () => void;
  passNumberTurn: () => void;
  rematchNumber: () => void;
  actDraw: (command: DrawClientCommand) => Promise<void>;
  actWolf: (command: WolfClientCommand) => Promise<void>;
  actSneaky: (command: SneakyClientCommand) => Promise<void>;
  collectGemResources: (selection: GemCollectSelectionDto) => void;
  purchaseGemCard: (source: GemPurchaseSourceDto) => void;
  reserveGemCard: (source: GemMarketSourceDto) => void;
  yieldGemTurn: () => void;
  retryGemAction: () => void;
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
  snapshot: RoomSnapshotShell,
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
  const [snapshot, setSnapshot] = useState<RoomSnapshotShell | null>(null);
  const [compatibleSnapshot, setCompatibleSnapshot] =
    useState<CompatibleWebSnapshot | null>(null);
  const [snapshotIncompatibility, setSnapshotIncompatibility] =
    useState<SnapshotIncompatibility | null>(null);
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("CONNECTING");
  const [operationLabel, setOperationLabel] = useState<string | null>(null);
  const [savedGame, setSavedGame] = useState<SavedGameEntry | null>(() =>
    typeof window === "undefined" ? null : browserSavedGameStorage().entry(),
  );
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [gameStartPending, setGameStartPending] = useState(false);
  const [turnSubmitPending, setTurnSubmitPending] = useState(false);
  const [turnActionPending, setTurnActionPending] = useState(false);
  const [numberCommandRetryKind, setNumberCommandRetryKind] =
    useState<NumberTileCommandRetryKind>(null);
  const [numberActionFeedback, setNumberActionFeedback] =
    useState<NumberTileActionFeedback | null>(null);
  const [roomLeavePending, setRoomLeavePending] = useState(false);
  const [gemActionPending, setGemActionPending] = useState(false);
  const [gemCommandRetryKind, setGemCommandRetryKind] =
    useState<GemCardActionKind | null>(null);
  const [gemActionFeedback, setGemActionFeedback] =
    useState<GemCardActionFeedback | null>(null);
  const [gemSelectionResetGeneration, setGemSelectionResetGeneration] = useState(0);
  const [cityActionPending, setCityActionPending] = useState(false);
  const [cityRetryPending, setCityRetryPending] = useState(false);
  const [cityFeedback, setCityFeedback] = useState<CityActionFeedback | null>(null);
  const [citySelectionResetGeneration, setCitySelectionResetGeneration] = useState(0);
  const [turnDraftResetGeneration, setTurnDraftResetGeneration] = useState(0);

  const routeRef = useRef<AppRoute>(initialRoute);
  const snapshotRef = useRef<RoomSnapshotShell | null>(null);
  const compatibleSnapshotRef = useRef<CompatibleWebSnapshot | null>(null);
  const snapshotIncompatibilityRef =
    useRef<SnapshotIncompatibility | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);
  const numberRematchFlightRef = useRef(false);
  const entryFlightRef = useRef<Promise<void> | null>(null);
  const entryActionActiveRef = useRef(false);
  const pendingRetryRequestedRef = useRef(false);
  const resumeFlightRef = useRef<Promise<void> | null>(null);
  const resumeRetryRequestedRef = useRef(false);
  const savedGameStorageRef = useRef(browserSavedGameStorage());
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
  const pendingNumberSubmitCommandRef = useRef<NumberSubmitCommand | null>(null);
  const numberSubmitRetryRequestedRef = useRef(false);
  const pendingNumberActionCommandRef =
    useRef<PendingNumberTileActionCommand | null>(null);
  const numberActionRetryRequestedRef = useRef(false);
  const announcedNumberActionRequestIdsRef = useRef<Set<RequestId>>(new Set());
  const pendingGemCommandRef = useRef<PendingGemCardCommand | null>(null);
  const gemRetryRequestedRef = useRef(false);
  const announcedGemActionRequestIdsRef = useRef<Set<RequestId>>(new Set());
  const gemContextGenerationRef = useRef(0);
  const pendingCityCommandRef = useRef<CityClientCommand | null>(null);
  const cityRetryRequestedRef = useRef(false);
  const cityContextGenerationRef = useRef(0);
  const announcedCityRequestIdsRef = useRef(new Set<RequestId>());
  const roomLeaveFlightRef = useRef<Promise<void> | null>(null);
  const pendingRoomLeaveCommandRef = useRef<RoomLeaveCommand | null>(null);
  const roomLeaveRetryRequestedRef = useRef(false);
  const sessionReplacedRef = useRef(false);

  function refreshNumberCommandRetryKind(): void {
    setNumberCommandRetryKind(
      pendingNumberSubmitCommandRef.current !== null
        ? "SUBMIT"
        : pendingNumberActionCommandRef.current?.kind === "number:draw"
          ? "DRAW"
          : pendingNumberActionCommandRef.current?.kind === "number:pass"
            ? "PASS"
            : null,
    );
  }

  function publishNumberActionFeedback(
    kind: NumberTileActionFeedbackKind,
    requestId: RequestId,
  ): void {
    if (
      !markNumberTileActionFeedback(
        announcedNumberActionRequestIdsRef.current,
        requestId,
      )
    ) {
      return;
    }
    setNumberActionFeedback({
      kind,
      requestId,
      message: kind === "SUBMIT"
        ? "조합을 제출했습니다."
        : kind === "DRAW"
          ? "타일 1개를 가져왔습니다."
          : "패스했습니다.",
    });
    if (readNumberTileSoundEnabled(window.localStorage)) {
      playNumberTileSound(numberTileActionSoundCue(kind));
    }
  }

  function clearNumberActionFeedbackState(): void {
    setNumberActionFeedback(null);
    announcedNumberActionRequestIdsRef.current.clear();
  }

  function currentLegacyHangulSnapshot(): StateSnapshot | null {
    const compatible = compatibleSnapshotRef.current;
    return compatible === null || compatible.kind === "PLATFORM_V2_NUMBER_TILE" ||
      compatible.kind === "PLATFORM_V2_GEM_CARD" || compatible.kind === "PLATFORM_V2_CITY_ROLE" || compatible.kind === "PLATFORM_V2_DRAW_RELAY" || compatible.kind === "PLATFORM_V2_SNEAKY_LUNCH" || compatible.kind === "PLATFORM_V2_WOLF_NIGHT"
      ? null
      : compatible.legacySnapshot;
  }

  async function actDraw(command: DrawClientCommand): Promise<void> {
    const client = clientRef.current, session = storedSessionForCurrentRoute();
    if (!client?.connected || session === null || sessionReplacedRef.current || compatibleSnapshotRef.current?.kind !== "PLATFORM_V2_DRAW_RELAY") throw new Error("연결을 확인하고 다시 시도해주세요.");
    const ack = await client.actDraw(command);
    if (clientRef.current !== client || sessionReplacedRef.current || storedSessionForCurrentRoute()?.playerId !== session.playerId ||
      storedSessionForCurrentRoute()?.credential.roomCode !== session.credential.roomCode) throw new Error("게임 연결이 변경되었습니다.");
    if (!ack.ok) { void requestLatestSnapshot(); throw new Error(getUserErrorMessage(ack.error.code)); }
    applyWireSnapshot(ack.data.snapshot, session);
  }

  async function actWolf(command: WolfClientCommand): Promise<void> {
    const client = clientRef.current, session = storedSessionForCurrentRoute();
    if (!client?.connected || session === null || sessionReplacedRef.current || compatibleSnapshotRef.current?.kind !== "PLATFORM_V2_WOLF_NIGHT") throw new Error("연결을 확인하고 다시 시도해주세요.");
    const ack = await client.actWolf(command);
    if (clientRef.current !== client || sessionReplacedRef.current || storedSessionForCurrentRoute()?.playerId !== session.playerId ||
      storedSessionForCurrentRoute()?.credential.roomCode !== session.credential.roomCode) throw new Error("게임 연결이 변경되었습니다.");
    if (!ack.ok) {
      void requestLatestSnapshot();
      throw new Error(getUserErrorMessage(ack.error.code));
    }
    applyWireSnapshot(ack.data.snapshot, session);
  }

  async function actSneaky(command: SneakyClientCommand): Promise<void> {
    const client = clientRef.current, session = storedSessionForCurrentRoute();
    if (!client?.connected || session === null || sessionReplacedRef.current || compatibleSnapshotRef.current?.kind !== "PLATFORM_V2_SNEAKY_LUNCH") throw new Error("연결을 확인하고 다시 시도해주세요.");
    const ack = await client.actSneaky(command);
    if (clientRef.current !== client || sessionReplacedRef.current || storedSessionForCurrentRoute()?.playerId !== session.playerId ||
      storedSessionForCurrentRoute()?.credential.roomCode !== session.credential.roomCode) throw new Error("게임 연결이 변경되었습니다.");
    if (!ack.ok) {
      void requestLatestSnapshot();
      // An old teacher frame is neither a bite nor a catch; restore the current view silently.
      if (command.kind === "sneaky:eat" && ack.error.code === "STALE_GAME_REVISION") return;
      throw new Error(getUserErrorMessage(ack.error.code));
    }
    applyWireSnapshot(ack.data.snapshot, session);
  }

  function rematchNumber(): void {
    const compatible = compatibleSnapshotRef.current, client = clientRef.current, session = storedSessionForCurrentRoute();
    if (numberRematchFlightRef.current || sessionReplacedRef.current || !client?.connected || session === null || compatible?.kind !== "PLATFORM_V2_NUMBER_TILE") return;
    const current = compatible.platformSnapshot;
    if (current.room.phase !== "FINISHED" || current.game === null || !("result" in current.game) || !current.room.players.some(p => p.playerId === current.self.playerId && p.isHost)) return;
    numberRematchFlightRef.current = true;
    setOperationLabel("같은 방에서 다시 준비하는 중..."); setErrorMessage(null);
    void client.rematchNumber({ kind: "number:rematch", protocolVersion: 1, requestId: createRequestId(),
      expectedRoomRevision: current.versions.roomRevision, expectedGameRevision: current.game.gameRevision, payload: { gameId: current.game.gameId } }).then(ack => {
      if (clientRef.current !== client || sessionReplacedRef.current || storedSessionForCurrentRoute()?.playerId !== session.playerId || storedSessionForCurrentRoute()?.credential.roomCode !== session.credential.roomCode) return;
      if (!ack.ok) { setErrorMessage(getUserErrorMessage(ack.error.code)); return; }
      pendingNumberSubmitCommandRef.current = null; pendingNumberActionCommandRef.current = null;
      announcedNumberActionRequestIdsRef.current.clear(); setNumberActionFeedback(null); setNumberCommandRetryKind(null);
      resetTurnDraftFromAuthority(); applyWireSnapshot(ack.data.snapshot, session);
    }).catch(() => {
      if (clientRef.current !== client || sessionReplacedRef.current || storedSessionForCurrentRoute()?.playerId !== session.playerId) return;
      setErrorMessage("다시 하기 결과를 확인하지 못했습니다. 방 상태를 확인해주세요."); void requestLatestSnapshot();
    })
      .finally(() => { numberRematchFlightRef.current = false; setOperationLabel(null); });
  }

  function currentNumberTilePlayingSnapshot(): NumberTilePlayingPlatformSnapshotV2 | null {
    const compatible = compatibleSnapshotRef.current;
    if (
      compatible?.kind !== "PLATFORM_V2_NUMBER_TILE" ||
      !isNumberTilePlayingSnapshot(compatible.platformSnapshot)
    ) {
      return null;
    }
    return compatible.platformSnapshot;
  }

  function clearPendingGameStartRequest(): void {
    pendingGameStartCommandRef.current = null;
    gameStartRetryRequestedRef.current = false;
    setGameStartPending(false);
  }

  function currentGemCardPlayingSnapshot(): GemCardPlayingPlatformSnapshotV2 | null {
    const compatible = compatibleSnapshotRef.current;
    return compatible?.kind === "PLATFORM_V2_GEM_CARD" &&
      isGemCardPlayingSnapshot(compatible.platformSnapshot)
      ? compatible.platformSnapshot : null;
  }

  function clearPendingGemCommand(settled = true): void {
    pendingGemCommandRef.current = null;
    gemRetryRequestedRef.current = false;
    setGemCommandRetryKind(null);
    if (settled) setGemActionPending(false);
  }

  function currentCityPlayingSnapshot(): CityRolePlayingPlatformSnapshotV2 | null {
    const compatible = compatibleSnapshotRef.current;
    if (compatible?.kind !== "PLATFORM_V2_CITY_ROLE") return null;
    const current = compatible.platformSnapshot;
    return isCityPlayingSnapshot(current) ? current : null;
  }

  function discardCityEditor(): void {
    cityContextGenerationRef.current += 1;
    pendingCityCommandRef.current = null;
    cityRetryRequestedRef.current = false;
    setCityActionPending(false); setCityRetryPending(false); setCityFeedback(null);
    announcedCityRequestIdsRef.current.clear();
    setCitySelectionResetGeneration(value => value + 1);
  }

  function discardGemEditor(): void {
    gemContextGenerationRef.current += 1;
    clearPendingGemCommand();
    setGemActionFeedback(null);
    announcedGemActionRequestIdsRef.current.clear();
    setGemSelectionResetGeneration((current) => current + 1);
  }

  function clearPendingTurnSubmitRequest(): void {
    pendingTurnSubmitCommandRef.current = null;
    turnSubmitRetryRequestedRef.current = false;
    pendingNumberSubmitCommandRef.current = null;
    numberSubmitRetryRequestedRef.current = false;
    refreshNumberCommandRetryKind();
    setTurnSubmitPending(false);
  }

  function clearPendingTurnActionRequest(settled = true): void {
    pendingTurnActionCommandRef.current = null;
    turnActionRetryRequestedRef.current = false;
    pendingNumberActionCommandRef.current = null;
    numberActionRetryRequestedRef.current = false;
    refreshNumberCommandRetryKind();
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

  function updateSnapshot(
    nextSnapshot: RoomSnapshotShell | null,
    nextCompatibleSnapshot: CompatibleWebSnapshot | null = null,
  ): void {
    snapshotRef.current = nextSnapshot;
    compatibleSnapshotRef.current = nextCompatibleSnapshot;
    setSnapshot(nextSnapshot);
    setCompatibleSnapshot(nextCompatibleSnapshot);
  }

  function clearSnapshotIncompatibility(): void {
    snapshotIncompatibilityRef.current = null;
    setSnapshotIncompatibility(null);
  }

  function markSnapshotIncompatible(
    reason: SnapshotIncompatibility,
  ): void {
    snapshotIncompatibilityRef.current = reason;
    setSnapshotIncompatibility(reason);
    updateSnapshot(null);
    clearPendingRoomOperation(window.sessionStorage);
    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();
    discardGemEditor();
    discardCityEditor();
    clearPendingRoomLeaveRequest();
    resetTurnDraftFromAuthority();
    setOperationLabel(null);
    setErrorMessage(null);
  }

  function decodeIncomingSnapshot(
    incomingSnapshot: StateSnapshotWirePayload,
  ): CompatibleWebSnapshot | null {
    const decoded = decodeWebSnapshot(incomingSnapshot);
    if (decoded.kind === "COMPATIBLE") {
      return decoded.value;
    }
    if (decoded.kind === "INCOMPATIBLE") {
      markSnapshotIncompatible(decoded.reason);
    } else {
      setErrorMessage(INVALID_SERVER_STATE_MESSAGE);
    }
    return null;
  }

  function clearCurrentRoomClientState(
    message: string | null,
    navigateHome: boolean,
  ): void {
    savedGameStorageRef.current.forget(storedSessionForCurrentRoute());
    setSavedGame(savedGameStorageRef.current.entry());
    setReconnectNeeded(false);
    clearPendingRoomOperation(window.sessionStorage);
    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();
    discardGemEditor();
    discardCityEditor();
    clearPendingRoomLeaveRequest();
    updateSnapshot(null);
    clearSnapshotIncompatibility();
    resetTurnDraftFromAuthority();
    setOperationLabel(null);
    setCopyMessage(null);
    clearNumberActionFeedbackState();
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

    return savedGameStorageRef.current.forRoom(currentRoute.roomCode);
  }

  function applyOrderedSnapshot(
    compatible: CompatibleWebSnapshot,
    session: BrowserStoredPlayerSession,
  ): SnapshotApplication {
    if (sessionReplacedRef.current) return "REJECTED";
    const incomingSnapshot = projectRoomSnapshotShell(compatible);
    const incomingLegacySnapshot =
      compatible.kind === "PLATFORM_V2_NUMBER_TILE" ||
      compatible.kind === "PLATFORM_V2_GEM_CARD" || compatible.kind === "PLATFORM_V2_CITY_ROLE" || compatible.kind === "PLATFORM_V2_DRAW_RELAY" || compatible.kind === "PLATFORM_V2_SNEAKY_LUNCH" || compatible.kind === "PLATFORM_V2_WOLF_NIGHT"
        ? null
        : compatible.legacySnapshot;
    const incomingNumberSnapshot =
      compatible.kind === "PLATFORM_V2_NUMBER_TILE" &&
      isNumberTilePlayingSnapshot(compatible.platformSnapshot)
        ? compatible.platformSnapshot
        : null;
    const incomingGemSnapshot =
      compatible.kind === "PLATFORM_V2_GEM_CARD" &&
      isGemCardPlayingSnapshot(compatible.platformSnapshot)
        ? compatible.platformSnapshot : null;
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
    if (decision === "APPLY" || decision === "KEEP_EQUAL") {
      savedGameStorageRef.current.save(session, incomingSnapshot.room.gameType);
      setSavedGame(savedGameStorageRef.current.entry());
    }
    switch (decision) {
      case "APPLY":
        if (
          pendingTurnSubmitCommandRef.current !== null &&
          (incomingLegacySnapshot === null ||
            snapshotSupersedesPendingTurnSubmit(
              pendingTurnSubmitCommandRef.current,
              incomingLegacySnapshot,
            ))
        ) {
          clearPendingTurnSubmitRequest();
        }
        if (
          pendingTurnActionCommandRef.current !== null &&
          (incomingLegacySnapshot === null ||
            snapshotSupersedesPendingTurnAction(
              pendingTurnActionCommandRef.current,
              incomingLegacySnapshot,
            ))
        ) {
          clearPendingTurnActionRequest(false);
        }
        if (
          pendingNumberSubmitCommandRef.current !== null &&
          numberSnapshotSupersedesCommand(
            pendingNumberSubmitCommandRef.current,
            incomingNumberSnapshot,
          )
        ) {
          clearPendingTurnSubmitRequest();
        }
        if (
          pendingNumberActionCommandRef.current !== null &&
          numberSnapshotSupersedesCommand(
            pendingNumberActionCommandRef.current,
            incomingNumberSnapshot,
          )
        ) {
          clearPendingTurnActionRequest(false);
        }
        if (pendingGemCommandRef.current !== null &&
          gemSnapshotSupersedesCommand(pendingGemCommandRef.current, incomingGemSnapshot)) {
          clearPendingGemCommand(false);
        }
        updateSnapshot(incomingSnapshot, compatible);
        clearSnapshotIncompatibility();
        return "CURRENT";
      case "KEEP_EQUAL":
        // A reconnect renegotiates the wire format per socket. Preserve the
        // canonical V1-shaped state (and therefore TurnDraft identity), while
        // refreshing the renderer-routing metadata even when revisions are
        // equal across a V1 <-> V2 representation change.
        compatibleSnapshotRef.current = compatible;
        setCompatibleSnapshot(compatible);
        clearSnapshotIncompatibility();
        return "CURRENT";
      case "IGNORE_STALE":
        return "CURRENT";
      case "REQUEST_SYNC":
        return "REQUEST_SYNC";
    }
  }

  function applyWireSnapshot(
    incomingSnapshot: StateSnapshotWirePayload,
    session: BrowserStoredPlayerSession,
  ): SnapshotApplication {
    const compatible = decodeIncomingSnapshot(incomingSnapshot);
    return compatible === null
      ? "REJECTED"
      : applyOrderedSnapshot(compatible, session);
  }

  async function requestLatestSnapshot(
    allowFollowup = true,
  ): Promise<void> {
    if (sessionReplacedRef.current) {
      return;
    }
    if (snapshotIncompatibilityRef.current !== null) {
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

        const application = applyWireSnapshot(
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

  function receiveSnapshot(incomingSnapshot: StateSnapshotWirePayload): void {
    const session = storedSessionForCurrentRoute();
    if (session === null) {
      return;
    }

    const compatible = decodeIncomingSnapshot(incomingSnapshot);
    if (compatible === null) {
      return;
    }
    const normalizedSnapshot = projectRoomSnapshotShell(compatible);
    if (!isSnapshotForSession(normalizedSnapshot, session)) {
      return;
    }

    const application = applyOrderedSnapshot(compatible, session);
    if (application === "REQUEST_SYNC") {
      void requestLatestSnapshot();
    } else if (
      application === "CURRENT" &&
      normalizedSnapshot.room.phase === "PLAYING"
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

        const application = applyWireSnapshot(
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

          const application = applyWireSnapshot(
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

          const application = applyWireSnapshot(
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

  async function executeNumberSubmitCommand(
    command: NumberSubmitCommand,
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
      refreshNumberCommandRetryKind();
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingNumberSubmitCommandRef.current = command;
    setNumberCommandRetryKind(null);
    setNumberActionFeedback(null);
    setTurnSubmitPending(true);
    setOperationLabel("숫자 타일 배치 제출 중...");
    setErrorMessage(null);

    const flight = runNumberTileCommandSingleFlight(
      gameplayMutationFlightRef,
      async () => {
        try {
          const acknowledgement = await client.submitNumberTurn(command);
          pendingNumberSubmitCommandRef.current = null;

          if (!acknowledgement.ok) {
            setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
            if (
              decideNumberTileCommandFailureAction(
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

          const application = applyWireSnapshot(
            acknowledgement.data.snapshot,
            session,
          );
          if (application === "CURRENT") {
            setErrorMessage(null);
            publishNumberActionFeedback("SUBMIT", command.requestId);
          } else {
            resetTurnDraftFromAuthority();
            void requestLatestSnapshot();
          }
        } catch (error: unknown) {
          if (!isRetryableCommandFailure(error)) {
            pendingNumberSubmitCommandRef.current = null;
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
      refreshNumberCommandRetryKind();
    }

    const retryRequested = numberSubmitRetryRequestedRef.current;
    numberSubmitRetryRequestedRef.current = false;
    const pendingCommand = pendingNumberSubmitCommandRef.current;
    if (
      retryRequested &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeNumberSubmitCommand(pendingCommand);
    }
  }

  async function executeNumberActionCommand(
    command: PendingNumberTileActionCommand,
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
      refreshNumberCommandRetryKind();
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    pendingNumberActionCommandRef.current = command;
    setNumberCommandRetryKind(null);
    setNumberActionFeedback(null);
    setTurnActionPending(true);
    setOperationLabel(
      command.kind === "number:draw"
        ? "숫자 타일 가져오는 중..."
        : "턴 넘기는 중...",
    );
    setErrorMessage(null);

    const flight = runNumberTileCommandSingleFlight(
      gameplayMutationFlightRef,
      async () => {
        try {
          const acknowledgement = command.kind === "number:draw"
            ? await client.drawNumberTurn(command)
            : await client.passNumberTurn(command);
          pendingNumberActionCommandRef.current = null;

          if (!acknowledgement.ok) {
            setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
            if (
              decideNumberTileCommandFailureAction(
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

          const application = applyWireSnapshot(
            acknowledgement.data.snapshot,
            session,
          );
          if (application === "CURRENT") {
            setErrorMessage(null);
            publishNumberActionFeedback(
              command.kind === "number:draw" ? "DRAW" : "PASS",
              command.requestId,
            );
          } else {
            resetTurnDraftFromAuthority();
            void requestLatestSnapshot();
          }
        } catch (error: unknown) {
          if (!isRetryableCommandFailure(error)) {
            pendingNumberActionCommandRef.current = null;
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
      refreshNumberCommandRetryKind();
    }

    const retryRequested = numberActionRetryRequestedRef.current;
    numberActionRetryRequestedRef.current = false;
    const pendingCommand = pendingNumberActionCommandRef.current;
    if (
      retryRequested &&
      pendingCommand !== null &&
      client.connected &&
      !sessionReplacedRef.current
    ) {
      await executeNumberActionCommand(pendingCommand);
    }
  }

  async function executeGemCommand(command: PendingGemCardCommand): Promise<void> {
    if (gameplayMutationFlightRef.current !== null) return gameplayMutationFlightRef.current;
    const client = clientRef.current;
    const session = storedSessionForCurrentRoute();
    if (client === null || !client.connected || session === null ||
      sessionReplacedRef.current || snapshotIncompatibilityRef.current !== null) {
      setGemCommandRetryKind(gemCardCommandKind(command));
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const contextGeneration = gemContextGenerationRef.current;
    const hasCurrentContext = () => clientRef.current === client &&
      gemContextGenerationRef.current === contextGeneration && !sessionReplacedRef.current;
    pendingGemCommandRef.current = command;
    setGemCommandRetryKind(null);
    setGemActionFeedback(null);
    setGemActionPending(true);
    setOperationLabel("보석 카드 행동 확인 중...");
    setErrorMessage(null);

    const flight = runAsyncSingleFlight(gameplayMutationFlightRef, async () => {
      try {
        const acknowledgement = command.kind === "gem:collect"
          ? await client.collectGemResources(command)
          : command.kind === "gem:purchase"
            ? await client.purchaseGemCard(command)
            : command.kind === "gem:reserve"
              ? await client.reserveGemCard(command)
              : await client.yieldGemTurn(command);
        if (!hasCurrentContext()) return;
        pendingGemCommandRef.current = null;
        if (!acknowledgement.ok) {
          if (isStaleSessionError(acknowledgement.error)) {
            handleStaleSession();
            return;
          }
          setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
          if (shouldResetGemSelectionAfterFailure(
            acknowledgement.error.code,
            acknowledgement.scope === "ROOM" ? acknowledgement.versions.gameRevision : null,
            command.expectedGameRevision,
          )) {
            setGemSelectionResetGeneration((current) => current + 1);
            void requestLatestSnapshot();
          }
          return;
        }

        const application = applyWireSnapshot(acknowledgement.data.snapshot, session);
        if (!hasCurrentContext()) return;
        if (application === "CURRENT") {
          setErrorMessage(null);
          setGemSelectionResetGeneration((current) => current + 1);
          const feedback = createGemActionFeedback(command, announcedGemActionRequestIdsRef.current);
          if (feedback !== null) setGemActionFeedback(feedback);
        } else {
          setGemSelectionResetGeneration((current) => current + 1);
          void requestLatestSnapshot();
        }
      } catch (error: unknown) {
        if (!hasCurrentContext()) return;
        if (!isRetryableCommandFailure(error)) {
          pendingGemCommandRef.current = null;
          if (error instanceof RealtimeClientError && error.code === "INVALID_SERVER_RESPONSE") {
            setGemSelectionResetGeneration((current) => current + 1);
            void requestLatestSnapshot();
          }
        }
        setErrorMessage(clientFailureMessage(error));
      }
    });
    try {
      await flight;
    } finally {
      if (hasCurrentContext()) {
        setGemActionPending(false);
        setOperationLabel(null);
        setGemCommandRetryKind(pendingGemCommandRef.current === null
          ? null : gemCardCommandKind(pendingGemCommandRef.current));
      }
    }
    if (!hasCurrentContext()) return;
    const retryRequested = gemRetryRequestedRef.current;
    gemRetryRequestedRef.current = false;
    const pending = pendingGemCommandRef.current;
    if (retryRequested && pending !== null && client.connected) {
      await executeGemCommand(pending);
    }
  }

  async function executeCityCommand(command: CityClientCommand): Promise<void> {
    if (gameplayMutationFlightRef.current !== null) return gameplayMutationFlightRef.current;
    const client = clientRef.current, session = storedSessionForCurrentRoute();
    if (client === null || !client.connected || session === null || sessionReplacedRef.current || snapshotIncompatibilityRef.current !== null) {
      setCityRetryPending(true);
      setErrorMessage("연결을 복구한 뒤 같은 요청을 다시 확인해주세요.");
      return;
    }
    const generation = cityContextGenerationRef.current;
    const currentContext = () => clientRef.current === client && cityContextGenerationRef.current === generation && !sessionReplacedRef.current;
    pendingCityCommandRef.current = command;
    setCityActionPending(true); setCityRetryPending(false); setCityFeedback(null);
    setOperationLabel("도시 게임 행동 확인 중..."); setErrorMessage(null);
    const flight = runAsyncSingleFlight(gameplayMutationFlightRef, async () => {
      try {
        const ack = await client.actCity(command);
        if (!currentContext()) return;
        if (!ack.ok) {
          pendingCityCommandRef.current = null;
          if (isStaleSessionError(ack.error)) { handleStaleSession(); return; }
          if (["STALE_GAME_REVISION", "NOT_YOUR_TURN", "TURN_EXPIRED", "INVALID_PHASE", "CARD_NOT_AVAILABLE"].includes(ack.error.code)) {
            setCitySelectionResetGeneration(value => value + 1);
            await requestLatestSnapshot();
          }
          if (currentContext()) {
            setErrorMessage(cityErrorMessage(ack.error.code));
            const current = compatibleSnapshotRef.current;
            if (current?.kind === "PLATFORM_V2_CITY_ROLE" && current.platformSnapshot.room.phase !== "LOBBY" && current.platformSnapshot.game !== null) {
              const impact = cityProtectionRejection(command, ack.error.code, current.platformSnapshot);
              if (impact) setCityFeedback(impact);
            }
          }
          return;
        }
        // A commit receipt is not private state. Use fresh viewer projection;
        // never infer cards, role ownership or successful outcome from revision alone.
        await requestLatestSnapshot();
        if (!currentContext()) return;
        const visible = compatibleSnapshotRef.current;
        if (visible?.kind !== "PLATFORM_V2_CITY_ROLE" || visible.platformSnapshot.game?.gameId !== ack.data.gameId ||
          visible.platformSnapshot.game.gameRevision < ack.data.committedGameRevision) {
          setErrorMessage("행동은 접수되었습니다. 최신 상태를 다시 확인해주세요.");
          return;
        }
        pendingCityCommandRef.current = null;
        setErrorMessage(null); setCitySelectionResetGeneration(value => value + 1);
        const feedback = cityActionFeedback(command, announcedCityRequestIdsRef.current, visible.platformSnapshot);
        if (feedback !== null) setCityFeedback(feedback);
      } catch (error: unknown) {
        if (!currentContext()) return;
        if (!isRetryableCommandFailure(error)) {
          pendingCityCommandRef.current = null;
          setCitySelectionResetGeneration(value => value + 1);
          void requestLatestSnapshot();
        }
        setErrorMessage(clientFailureMessage(error));
      }
    });
    try { await flight; }
    finally { if (currentContext()) {
      setCityActionPending(false); setOperationLabel(null); setCityRetryPending(pendingCityCommandRef.current !== null);
    } }
    if (!currentContext()) return;
    const retry = cityRetryRequestedRef.current; cityRetryRequestedRef.current = false;
    if (retry && pendingCityCommandRef.current !== null && client.connected) await executeCityCommand(pendingCityCommandRef.current);
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
    setResumePending(true);
    setReconnectNeeded(true);
    const flight = (async () => {
      try {
        const acknowledgement = await client.resumeSession(command);
        // A late ack must not revive a replaced tab or a different route/seat.
        const activeSession = storedSessionForCurrentRoute();
        if (sessionReplacedRef.current || clientRef.current !== client ||
          activeSession?.playerId !== session.playerId ||
          activeSession.credential.sessionToken !== session.credential.sessionToken) return;
        if (!acknowledgement.ok) {
          if (isStaleSessionError(acknowledgement.error)) {
            handleStaleSession();
            return;
          }

          setErrorMessage(getUserErrorMessage(acknowledgement.error.code));
          return;
        }

        const application = applyWireSnapshot(
          acknowledgement.data.snapshot,
          session,
        );
        if (application !== "REJECTED" && client.connected) setReconnectNeeded(false);
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
        setResumePending(false);
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

    const compatible = decodeIncomingSnapshot(
      acknowledgement.data.snapshot,
    );
    if (compatible === null) {
      return;
    }
    const nextSnapshot = projectRoomSnapshotShell(compatible);
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
    discardGemEditor();
    discardCityEditor();
    clearNumberActionFeedbackState();

    const sessionStored = savedGameStorageRef.current.save(nextSession, nextSnapshot.room.gameType);
    setSavedGame(savedGameStorageRef.current.entry());
    setReconnectNeeded(false);
    if (sessionStored) {
      clearPendingRoomOperation(window.sessionStorage);
    }

    navigateToRoom(nextSnapshot.room.roomCode);
    const application = applyOrderedSnapshot(compatible, nextSession);
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

  async function startCreateRoom(
    normalizedNickname: Nickname,
    gameType: GameType,
  ): Promise<void> {
    const pending = readPendingRoomOperation(window.sessionStorage);
    if (
      pending?.kind === "room:create" &&
      pending.payload.nickname === normalizedNickname &&
      (pending.payload.gameType ?? DEFAULT_SELECTED_GAME_TYPE) === gameType
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
      gameType,
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
    if (
      sessionReplacedRef.current ||
      snapshotIncompatibilityRef.current !== null
    ) {
      return;
    }

    const pending = readPendingRoomOperation(window.sessionStorage);
    if (pending !== null && pendingMatchesRoute(pending, routeRef.current) &&
      storedSessionForCurrentRoute() === null) {
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
    if (sessionReplacedRef.current) {
      return;
    }
    if (pendingTurnActionCommand !== null) {
      if (gameplayMutationFlightRef.current !== null) {
        turnActionRetryRequestedRef.current = true;
        await gameplayMutationFlightRef.current;
      } else {
        await executeTurnActionCommand(pendingTurnActionCommand);
      }
    }

    const pendingNumberSubmitCommand = pendingNumberSubmitCommandRef.current;
    if (sessionReplacedRef.current) {
      return;
    }
    if (pendingNumberSubmitCommand !== null) {
      if (gameplayMutationFlightRef.current !== null) {
        numberSubmitRetryRequestedRef.current = true;
        await gameplayMutationFlightRef.current;
      } else {
        await executeNumberSubmitCommand(pendingNumberSubmitCommand);
      }
    }

    const pendingCityCommand = pendingCityCommandRef.current;
    if (pendingCityCommand !== null && !sessionReplacedRef.current) {
      if (gameplayMutationFlightRef.current !== null) {
        cityRetryRequestedRef.current = true;
        await gameplayMutationFlightRef.current;
      } else await executeCityCommand(pendingCityCommand);
      return;
    }

    const pendingGemCommand = pendingGemCommandRef.current;
    if (pendingGemCommand !== null && !sessionReplacedRef.current) {
      if (gameplayMutationFlightRef.current !== null) {
        gemRetryRequestedRef.current = true;
        await gameplayMutationFlightRef.current;
      } else {
        await executeGemCommand(pendingGemCommand);
      }
      return;
    }

    const pendingNumberActionCommand = pendingNumberActionCommandRef.current;
    if (pendingNumberActionCommand === null || sessionReplacedRef.current) {
      return;
    }
    if (gameplayMutationFlightRef.current !== null) {
      numberActionRetryRequestedRef.current = true;
      await gameplayMutationFlightRef.current;
      return;
    }
    await executeNumberActionCommand(pendingNumberActionCommand);
  }

  useEffect(() => {
    const client = createRealtimeClient();
    clientRef.current = client;

    const unsubscribeConnection = client.subscribeConnectionState((state) => {
      setConnectionState(state);
      if (state !== "CONNECTED" && state !== "SESSION_REPLACED" &&
        storedSessionForCurrentRoute() !== null) setReconnectNeeded(true);
    });
    const unsubscribeConnected = client.subscribeTransportConnected(() => {
      void recoverAfterTransportConnection();
    });
    const unsubscribeSnapshot = client.subscribeSnapshot((event) => {
      receiveSnapshot(event.payload.snapshot);
    });
    const unsubscribeTurnStarted = client.subscribeTurnStarted((event) => {
      if (
        decideTurnStartedAdvisory(currentLegacyHangulSnapshot(), event) ===
        "REQUEST_SYNC"
      ) {
        void requestLatestSnapshot();
      }
    });
    const unsubscribeGameFinished = client.subscribeGameFinished((event) => {
      if (
        decideGameFinishedAdvisory(currentLegacyHangulSnapshot(), event) ===
        "REQUEST_SYNC"
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
      savedGameStorageRef.current.replaced();
      setSavedGame(savedGameStorageRef.current.entry());
      setReconnectNeeded(false);
      setResumePending(false);
      clearPendingRoomOperation(window.sessionStorage);
      clearPendingGameStartRequest();
      clearPendingTurnSubmitRequest();
      clearPendingTurnActionRequest();
      discardGemEditor();
      discardCityEditor();
      clearPendingRoomLeaveRequest();
      resetTurnDraftFromAuthority();
      clearSnapshotIncompatibility();
    });
    const unsubscribeProtocolIssue = client.subscribeProtocolIssue((issue) => {
      if (issue.kind === "INCOMPATIBLE_SNAPSHOT") {
        markSnapshotIncompatible(issue.reason);
        return;
      }
      if (snapshotIncompatibilityRef.current !== null) {
        return;
      }
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
      clearSnapshotIncompatibility();
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
        discardGemEditor();
        discardCityEditor();
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

    const refreshSavedEntry = () => setSavedGame(savedGameStorageRef.current.entry());
    const recoverOnWake = () => {
      if (document.visibilityState === "hidden" || sessionReplacedRef.current ||
        snapshotIncompatibilityRef.current !== null) return;
      refreshSavedEntry();
      // Connected sockets already have a primary; waking alone is not a resume.
      if (!client.connected) client.connect();
    };
    refreshSavedEntry();
    window.addEventListener("storage", refreshSavedEntry);
    window.addEventListener("online", recoverOnWake);
    window.addEventListener("pageshow", recoverOnWake);
    document.addEventListener("visibilitychange", recoverOnWake);
    window.addEventListener("popstate", handlePopState);
    client.connect();

    return () => {
      window.removeEventListener("storage", refreshSavedEntry);
      window.removeEventListener("online", recoverOnWake);
      window.removeEventListener("pageshow", recoverOnWake);
      document.removeEventListener("visibilitychange", recoverOnWake);
      window.removeEventListener("popstate", handlePopState);
      unsubscribeConnection();
      unsubscribeConnected();
      unsubscribeSnapshot();
      unsubscribeTurnStarted();
      unsubscribeGameFinished();
      unsubscribeRoomClosed();
      unsubscribeReplaced();
      unsubscribeProtocolIssue();
      gemContextGenerationRef.current += 1;
      cityContextGenerationRef.current += 1;
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

  function createRoom(gameType: GameType): void {
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
    runEntryAction(() => startCreateRoom(nicknameResult.value, gameType));
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
    if (savedGameStorageRef.current.forRoom(roomCodeResult.value) !== null) {
      navigateToRoom(roomCodeResult.value);
      reconnect();
      return;
    }
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

    const currentSnapshot = currentLegacyHangulSnapshot();
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

    const currentSnapshot = currentLegacyHangulSnapshot();
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

    const currentSnapshot = currentLegacyHangulSnapshot();
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

  function submitNumberTurn(draft: NumberTileTurnDraft): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnActionCommandRef.current !== null ||
      pendingNumberActionCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = currentNumberTilePlayingSnapshot();
    const client = clientRef.current;
    if (
      currentSnapshot === null ||
      currentSnapshot.game.gameRevision !== draft.baseGameRevision ||
      currentSnapshot.game.gameId !== draft.baseGameId ||
      currentSnapshot.game.turn.turnId !== draft.baseTurnId ||
      currentSnapshot.game.turn.activePlayerId !== currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const command = createOrReuseNumberSubmitCommand(
      pendingNumberSubmitCommandRef.current,
      draft,
      createRequestId,
    );
    if (command === null) {
      setErrorMessage("모든 조커의 숫자와 색상을 지정해주세요.");
      return;
    }
    pendingNumberSubmitCommandRef.current = command;
    void executeNumberSubmitCommand(command);
  }

  function drawNumberTurn(): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      pendingNumberSubmitCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = currentNumberTilePlayingSnapshot();
    const client = clientRef.current;
    if (
      currentSnapshot === null ||
      currentSnapshot.game.turn.activePlayerId !== currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (currentSnapshot.game.remainingPoolCount === 0) {
      setErrorMessage(getUserErrorMessage("POOL_EMPTY"));
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const pending = pendingNumberActionCommandRef.current;
    if (pending !== null && pending.kind !== "number:draw") {
      setErrorMessage(
        "이전 턴 종료 요청의 결과를 확인 중입니다. 같은 요청을 다시 시도해주세요.",
      );
      return;
    }
    const command = createOrReuseNumberDrawCommand(
      pending,
      currentSnapshot.game.gameRevision,
      currentSnapshot.game.turn.turnId,
      createRequestId,
    );
    pendingNumberActionCommandRef.current = command;
    void executeNumberActionCommand(command);
  }

  function passNumberTurn(): void {
    if (
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      pendingNumberSubmitCommandRef.current !== null ||
      resumeFlightRef.current !== null ||
      entryFlightRef.current !== null ||
      gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null
    ) {
      return;
    }

    const currentSnapshot = currentNumberTilePlayingSnapshot();
    const client = clientRef.current;
    if (
      currentSnapshot === null ||
      currentSnapshot.game.turn.activePlayerId !== currentSnapshot.self.playerId
    ) {
      resetTurnDraftFromAuthority();
      void requestLatestSnapshot();
      return;
    }
    if (currentSnapshot.game.remainingPoolCount !== 0) {
      setErrorMessage(getUserErrorMessage("PASS_NOT_ALLOWED"));
      return;
    }
    if (client === null || !client.connected || sessionReplacedRef.current) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const pending = pendingNumberActionCommandRef.current;
    if (pending !== null && pending.kind !== "number:pass") {
      setErrorMessage(
        "이전 턴 종료 요청의 결과를 확인 중입니다. 같은 요청을 다시 시도해주세요.",
      );
      return;
    }
    const command = createOrReuseNumberPassCommand(
      pending,
      currentSnapshot.game.gameRevision,
      currentSnapshot.game.turn.turnId,
      createRequestId,
    );
    pendingNumberActionCommandRef.current = command;
    void executeNumberActionCommand(command);
  }

  function gemActionSnapshot(): GemCardPlayingPlatformSnapshotV2 | null {
    if (gameplayMutationFlightRef.current !== null || resumeFlightRef.current !== null ||
      entryFlightRef.current !== null || gameStartFlightRef.current !== null ||
      roomLeaveFlightRef.current !== null || pendingRoomLeaveCommandRef.current !== null ||
      operationLabel !== null || snapshotIncompatibilityRef.current !== null) return null;
    if (pendingGemCommandRef.current !== null) {
      setErrorMessage("이전 행동의 결과를 확인 중입니다. 같은 요청을 다시 확인해주세요.");
      return null;
    }
    const current = currentGemCardPlayingSnapshot();
    if (current === null || current.game.turn.activePlayerId !== current.self.playerId ||
      !current.game.playerStates.some((player) => player.playerId === current.self.playerId &&
        !player.forfeited)) return null;
    if (clientRef.current === null || !clientRef.current.connected ||
      sessionReplacedRef.current || storedSessionForCurrentRoute() === null) {
      setErrorMessage("서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return null;
    }
    return current;
  }

  function collectGemResources(selection: GemCollectSelectionDto): void {
    const current = gemActionSnapshot();
    if (current === null) return;
    void executeGemCommand(createGemCollectCommand(selection,
      current.game.gameRevision, current.game.turn.turnId, createRequestId));
  }

  function purchaseGemCard(source: GemPurchaseSourceDto): void {
    const current = gemActionSnapshot();
    if (current === null) return;
    void executeGemCommand(createGemPurchaseCommand(source,
      current.game.gameRevision, current.game.turn.turnId, createRequestId));
  }

  function reserveGemCard(source: GemMarketSourceDto): void {
    const current = gemActionSnapshot();
    if (current === null) return;
    void executeGemCommand(createGemReserveCommand(source,
      current.game.gameRevision, current.game.turn.turnId, createRequestId));
  }

  function yieldGemTurn(): void {
    const current = gemActionSnapshot();
    if (current === null) return;
    void executeGemCommand(createGemYieldCommand(
      current.game.gameRevision, current.game.turn.turnId, createRequestId));
  }

  function retryGemAction(): void {
    const pending = pendingGemCommandRef.current;
    if (pending === null || sessionReplacedRef.current ||
      resumeFlightRef.current !== null || snapshotIncompatibilityRef.current !== null) return;
    void executeGemCommand(pending);
  }

  function actCity(intent: CityActionIntent): void {
    if (gameplayMutationFlightRef.current !== null || resumeFlightRef.current !== null ||
      entryFlightRef.current !== null || gameStartFlightRef.current !== null || roomLeaveFlightRef.current !== null ||
      pendingRoomLeaveCommandRef.current !== null || operationLabel !== null || snapshotIncompatibilityRef.current !== null ||
      pendingCityCommandRef.current !== null || sessionReplacedRef.current || !clientRef.current?.connected) return;
    const current = currentCityPlayingSnapshot();
    if (current === null || current.game.window.activePlayerId !== current.self.playerId ||
      !current.game.playerStates.some(player => player.playerId === current.self.playerId && !player.forfeited)) return;
    try { void executeCityCommand(createCityCommand(intent, current, createRequestId)); }
    catch { setErrorMessage("선택한 행동을 확인해주세요."); }
  }

  function retryCityAction(): void {
    const pending = pendingCityCommandRef.current;
    if (pending === null || sessionReplacedRef.current || resumeFlightRef.current !== null || snapshotIncompatibilityRef.current !== null) return;
    void executeCityCommand(pending);
  }

  function leaveRoom(): void {
    if (
      pendingGemCommandRef.current !== null ||
      pendingCityCommandRef.current !== null ||
      roomLeaveFlightRef.current !== null ||
      gameplayMutationFlightRef.current !== null ||
      pendingTurnSubmitCommandRef.current !== null ||
      pendingTurnActionCommandRef.current !== null ||
      pendingNumberSubmitCommandRef.current !== null ||
      pendingNumberActionCommandRef.current !== null ||
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

    const negotiationWasRejected =
      snapshotIncompatibilityRef.current === "NEGOTIATION_REJECTED";
    updateSnapshot(null);
    setReconnectNeeded(false);
    setSavedGame(savedGameStorageRef.current.entry());
    clearSnapshotIncompatibility();
    clearPendingGameStartRequest();
    clearPendingTurnSubmitRequest();
    clearPendingTurnActionRequest();
    discardGemEditor();
    discardCityEditor();
    clearPendingRoomLeaveRequest();
    clearNumberActionFeedbackState();
    setErrorMessage(null);
    setCopyMessage(null);
    if (window.location.pathname !== "/") {
      window.history.pushState(null, "", "/");
    }
    updateRoute({ kind: "HOME" });
    if (
      !negotiationWasRejected &&
      clientRef.current !== null &&
      !clientRef.current.connected
    ) {
      clientRef.current.connect();
    }
  }

  function reconnect(): void {
    if (resumeFlightRef.current !== null || entryFlightRef.current !== null || entryActionActiveRef.current ||
      snapshotIncompatibilityRef.current !== null) return;
    const currentRoute = routeRef.current;
    const roomCode = currentRoute.kind === "ROOM" ? currentRoute.roomCode :
      savedGameStorageRef.current.entry()?.roomCode;
    if (roomCode === undefined || savedGameStorageRef.current.select(roomCode) === null) {
      setErrorMessage(MISSING_RESUME_CREDENTIAL);
      return;
    }
    const client = clientRef.current;
    if (client === null) return;
    if (sessionReplacedRef.current) {
      sessionReplacedRef.current = false;
      setSessionReplaced(false);
      client.resetSessionReplacement();
    }
    navigateToRoom(roomCode);
    setErrorMessage(null);
    setReconnectNeeded(true);
    // Also replace half-open mobile transports whose socket still says connected.
    // The connected subscription resumes the existing credential exactly once.
    if (client.connected) client.disconnect();
    client.connect();
  }

  return {
    route,
    nickname,
    roomCodeInput,
    snapshot,
    compatibleSnapshot,
    snapshotIncompatibility,
    connectionState: reconnectNeeded && connectionState === "CONNECTED" ? "RECONNECTING" : connectionState,
    savedGame,
    reconnectNeeded,
    resumePending,
    reconnect,
    operationLabel,
    errorMessage,
    copyMessage,
    sessionReplaced,
    gameStartPending,
    turnSubmitPending,
    turnActionPending,
    numberCommandRetryKind,
    numberActionFeedback,
    gemActionPending,
    gemCommandRetryKind,
    gemActionFeedback,
    gemSelectionResetGeneration,
    cityActionPending,
    cityRetryPending,
    cityActionFeedback: cityFeedback,
    citySelectionResetGeneration,
    actCity,
    retryCityAction,
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
    submitNumberTurn,
    drawNumberTurn,
    passNumberTurn,
    rematchNumber,
    actDraw,
    actWolf,
    actSneaky,
    collectGemResources,
    purchaseGemCard,
    reserveGemCard,
    yieldGemTurn,
    retryGemAction,
    leaveRoom,
    copyInvitation,
    goHome,
  };
}
