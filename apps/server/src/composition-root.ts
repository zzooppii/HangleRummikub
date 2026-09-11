import { CuratedLiarPrompts } from "./games/liar-game/domain/prompts.js";
import { IslandHostSuccession } from "./games/island/application/host-succession.js";
import { SplendorHostSuccession } from "./games/splendor/application/host-succession.js";
import { JaipurHostSuccession } from "./games/jaipur/application/host-succession.js";
import { LoveLetterHostSuccession } from "./games/love-letter/application/host-succession.js";
import { GuryongtuHostSuccession } from "./games/guryongtu/application/host-succession.js";
import { AzulHostSuccession } from "./games/azul/application/host-succession.js";
import { CarcassonneHostSuccession } from "./games/carcassonne/application/host-succession.js";
import { ClueHostSuccession } from "./games/clue/application/host-succession.js";
import { DuetHostSuccession } from "./games/word-duet/application/host-succession.js";
import { SaboteurHostSuccession } from "./games/saboteur/application/host-succession.js";
import { LostCitiesHostSuccession } from "./games/lost-cities/application/host-succession.js";
import { HalliHostSuccession } from "./games/halli-galli/application/host-succession.js";
import { WolfHostSuccession } from "./games/wolf-night/application/host-succession.js";
import { LiarHostSuccession } from "./games/liar-game/application/host-succession.js";
import { SpyfallHostSuccession } from "./games/spyfall/application/host-succession.js";
import { IslandService } from "./games/island/application/service.js";
import { SplendorService } from "./games/splendor/application/service.js";
import { JaipurService } from "./games/jaipur/application/service.js";
import { LoveLetterService } from "./games/love-letter/application/service.js";
import { GuryongtuService } from "./games/guryongtu/application/service.js";
import { AzulService } from "./games/azul/application/service.js";
import { CarcassonneService } from "./games/carcassonne/application/service.js";
import { ClueService } from "./games/clue/application/service.js";
import { DuetService } from "./games/word-duet/application/service.js";
import { SaboteurService } from "./games/saboteur/application/service.js";
import { LostCitiesService } from "./games/lost-cities/application/service.js";
import { HalliService } from "./games/halli-galli/application/service.js";
import { WolfService } from "./games/wolf-night/application/service.js";
import { LiarService } from "./games/liar-game/application/service.js";
import { SpyfallService } from "./games/spyfall/application/service.js";
import { createIslandLifecycle } from "./games/island/application/lifecycle.js";
import { createSplendorLifecycle } from "./games/splendor/application/lifecycle.js";
import { createJaipurLifecycle } from "./games/jaipur/application/lifecycle.js";
import { createLoveLetterLifecycle } from "./games/love-letter/application/lifecycle.js";
import { createGuryongtuLifecycle } from "./games/guryongtu/application/lifecycle.js";
import { createAzulLifecycle } from "./games/azul/application/lifecycle.js";
import { createCarcassonneLifecycle } from "./games/carcassonne/application/lifecycle.js";
import { createClueLifecycle } from "./games/clue/application/lifecycle.js";
import { createDuetLifecycle } from "./games/word-duet/application/lifecycle.js";
import { createSaboteurLifecycle } from "./games/saboteur/application/lifecycle.js";
import { createLostCitiesLifecycle } from "./games/lost-cities/application/lifecycle.js";
import { createHalliLifecycle } from "./games/halli-galli/application/lifecycle.js";
import { createWolfLifecycle } from "./games/wolf-night/application/lifecycle.js";
import { createLiarLifecycle } from "./games/liar-game/application/lifecycle.js";
import { createSpyfallLifecycle } from "./games/spyfall/application/lifecycle.js";
import { SneakyLunchService } from "./games/sneaky-lunch/application/service.js";
import { SneakyLunchPresence } from "./games/sneaky-lunch/application/presence.js";
import { createSneakyLifecycle } from "./games/sneaky-lunch/application/lifecycle.js";
import { DrawRelayService } from "./games/draw-relay/application/service.js";
import { DrawRelayHostSuccession } from "./games/draw-relay/application/host-succession.js";
import { createDrawRelayLifecycle } from "./games/draw-relay/application/lifecycle.js";
import { RoomGameSelectionService } from "./application/room-game-selection-service.js";
import { NumberTileRematchService } from "./games/number-tile/application/number-tile-rematch-service.js";
import { createGemCardRegistration } from "./games/gem-card/gem-card-registration.js";
import { createCityRoleRegistration } from "./games/city-role/city-role-registration.js";
import { CityRoleGameStateAdapter } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { projectCityRoleV2Game } from "./games/city-role/compatibility/city-role-v2-game-projector.js";
import { CityRoleStartService } from "./games/city-role/application/city-role-start-service.js";
import { CityRoleCommandService } from "./games/city-role/application/city-role-command-service.js";
import { CityRoleCommandRouter } from "./games/city-role/application/city-role-command-router.js";
import { CityRoleTimeoutService } from "./games/city-role/application/city-role-timeout-service.js";
import { createCityRolePlayerLifecycleActions } from "./games/city-role/application/city-role-player-lifecycle-actions.js";
import { GemCardGameStateAdapter } from "./games/gem-card/compatibility/gem-card-game-state-adapter.js";
import { projectGemCardV2Game } from "./games/gem-card/compatibility/gem-card-v2-game-projector.js";
import { GemCardStartService } from "./games/gem-card/application/gem-card-start-service.js";
import { GemCardCommandService } from "./games/gem-card/application/gem-card-command-service.js";
import { GemCardCommandRouter } from "./games/gem-card/application/gem-card-command-router.js";
import { GemCardTimeoutService } from "./games/gem-card/application/gem-card-timeout-service.js";
import { createGemCardPlayerLifecycleActions } from "./games/gem-card/application/gem-card-player-lifecycle-actions.js";
import type { PlayerId, RoomId } from "@hangul-rummikub/shared";

import { GameStartService } from "./application/game-start-service.js";
import {
  GameStartRouter,
  type GameStartRouting,
} from "./application/game-start-router.js";
import { GameDeadlineService } from "./application/game-deadline-service.js";
import {
  scheduleFinishedRetentionBestEffort,
  type GameFinishedPostCommit,
} from "./application/game-finish-transition.js";
import { LobbyDisconnectGraceService } from "./application/lobby-disconnect-grace-service.js";
import { LobbyStateSnapshotProjector } from "./application/lobby-state-snapshot-projector.js";
import { PlatformSnapshotV2Projector } from "./application/platform-snapshot-v2-projector.js";
import { PlayerLifecycleRouter } from "./application/player-lifecycle-router.js";
import { RoomCleanupService } from "./application/room-cleanup-service.js";
import { RoomLeaveService } from "./application/room-leave-service.js";
import {
  ROOM_RETENTION_MS,
  RoomPresencePolicyService,
} from "./application/room-presence-policy-service.js";
import { RoomRetentionService } from "./application/room-retention-service.js";
import { RoomSessionApplicationService } from "./application/room-session-service.js";
import { SessionResumeService } from "./application/session-resume-service.js";
import { ScheduledTurnRouter } from "./application/scheduled-turn-router.js";
import { TurnDrawService } from "./application/turn-draw-service.js";
import { TurnPassService } from "./application/turn-pass-service.js";
import { TurnSubmitService } from "./application/turn-submit-service.js";
import { TurnTimeoutService } from "./application/turn-timeout-service.js";
import {
  GameRegistry,
  type GameRegistration,
  type GameRegistrationReader,
} from "./games/game-registry.js";
import { LegacyHangulGameStateAdapter } from "./games/hangul-tile/compatibility/legacy-hangul-game-state-adapter.js";
import { createLegacyHangulPlayerLifecycleActions } from "./games/hangul-tile/compatibility/legacy-hangul-player-lifecycle-actions.js";
import {
  LegacyHangulV1CommandRouter,
  type LegacyHangulV1CommandCapability,
  type LegacyHangulV1CommandRouting,
} from "./games/hangul-tile/compatibility/legacy-hangul-v1-command-router.js";
import { projectLegacyHangulV1Game } from "./games/hangul-tile/compatibility/legacy-hangul-v1-game-projector.js";
import {
  LEGACY_V1_DEFAULT_GAME_TYPE,
  createLegacyHangulCompatibilityRegistration,
} from "./games/hangul-tile/compatibility/legacy-hangul-compatibility-registration.js";
import {
  LegacyHangulServerActionRouter,
  type LegacyHangulServerActionCapability,
  type LegacyHangulServerActionRouting,
} from "./games/hangul-tile/compatibility/legacy-hangul-server-action-router.js";
import { NumberTileCommandRouter } from "./games/number-tile/application/number-tile-command-router.js";
import { NumberTileDrawService } from "./games/number-tile/application/number-tile-draw-service.js";
import { NumberTilePassService } from "./games/number-tile/application/number-tile-pass-service.js";
import { createNumberTilePlayerLifecycleActions } from "./games/number-tile/application/number-tile-player-lifecycle-actions.js";
import { NumberTileStartService } from "./games/number-tile/application/number-tile-start-service.js";
import { NumberTileSubmitService } from "./games/number-tile/application/number-tile-submit-service.js";
import { NumberTileTimeoutService } from "./games/number-tile/application/number-tile-timeout-service.js";
import { NumberTileGameStateAdapter } from "./games/number-tile/compatibility/number-tile-game-state-adapter.js";
import { projectNumberTileV2Game } from "./games/number-tile/compatibility/number-tile-v2-game-projector.js";
import {
  NUMBER_TILE_GAME_TYPE,
  createNumberTileRegistration,
} from "./games/number-tile/number-tile-registration.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { InProcessGameDeadlineScheduler } from "./infrastructure/in-process-game-deadline-scheduler.js";
import { InProcessRoomPolicyScheduler } from "./infrastructure/in-process-room-policy-scheduler.js";
import { InProcessTurnScheduler } from "./infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { OverdueFinishedRetentionSweeper } from "./infrastructure/overdue-finished-retention-sweeper.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
import { OverdueGameDeadlineSweeper } from "./infrastructure/overdue-game-deadline-sweeper.js";
import {
  RoomLifecycleResources,
  type RoomClosedAdvisoryListener,
} from "./infrastructure/room-lifecycle-resources.js";
import { TestDictionaryProvider } from "./games/hangul-tile/infrastructure/test-dictionary-provider.js";
import {
  CryptoRandomSource,
  NodeCryptoIdGenerator,
  NodeCryptoSessionTokenIssuer,
  RandomRoomCodeGenerator,
  SystemClock,
} from "./infrastructure/system.js";

export type ApplicationRuntime = Readonly<{
  islandService?: IslandService;
  splendorService?: SplendorService;
  jaipurService?: JaipurService;
  loveLetterService?: LoveLetterService;
  guryongtuService?: GuryongtuService;
  azulService?: AzulService;
  carcassonneService?: CarcassonneService;
  clueService?: ClueService;
  duetService?: DuetService;
  saboteurService?: SaboteurService;
  lostCitiesService?: LostCitiesService;
  halliService?: HalliService;
  wolfService?: WolfService;
  liarService?: LiarService;
  spyfallService?: SpyfallService;
  islandHostSuccession?: IslandHostSuccession;
  splendorHostSuccession?: SplendorHostSuccession;
  jaipurHostSuccession?: JaipurHostSuccession;
  loveLetterHostSuccession?: LoveLetterHostSuccession;
  guryongtuHostSuccession?: GuryongtuHostSuccession;
  azulHostSuccession?: AzulHostSuccession;
  carcassonneHostSuccession?: CarcassonneHostSuccession;
  clueHostSuccession?: ClueHostSuccession;
  duetHostSuccession?: DuetHostSuccession;
  saboteurHostSuccession?: SaboteurHostSuccession;
  lostCitiesHostSuccession?: LostCitiesHostSuccession;
  halliHostSuccession?: HalliHostSuccession;
  wolfHostSuccession?: WolfHostSuccession;
  liarHostSuccession?: LiarHostSuccession;
  spyfallHostSuccession?: SpyfallHostSuccession;
  sneakyLunchService?: SneakyLunchService;
  sneakyLunchPresence?: SneakyLunchPresence;
  drawRelayService?: DrawRelayService;
  drawRelayHostSuccession?: DrawRelayHostSuccession;
  clock: SystemClock;
  connectionRegistry: ConnectionRegistry;
  gameRegistry: GameRegistrationReader;
  gameStartRouter: GameStartRouting;
  gameDeadlineScheduler: InProcessGameDeadlineScheduler;
  legacyHangulServerActionRouter: LegacyHangulServerActionRouting;
  legacyHangulV1CommandRouter: LegacyHangulV1CommandRouting;
  numberTileCommandRouter: NumberTileCommandRouter;
  numberTileRematchService: NumberTileRematchService;
  gemCardCommandRouter: GemCardCommandRouter;
  cityRoleCommandRouter: CityRoleCommandRouter;
  cityRoleCommandService?: CityRoleCommandService;
  subscribeCityRoleTimeoutApplied(listener: Parameters<CityRoleTimeoutService["subscribeApplied"]>[0]): () => void;
  subscribeGemCardTimeoutApplied(listener: Parameters<GemCardTimeoutService["subscribeApplied"]>[0]): () => void;
  overdueGameDeadlineSweeper: OverdueGameDeadlineSweeper;
  persistence: InMemoryPersistence;
  roomLeaveService: RoomLeaveService;
  roomGameSelectionService: RoomGameSelectionService;
  roomPolicyScheduler: InProcessRoomPolicyScheduler;
  roomPresencePolicyService: RoomPresencePolicyService;
  roomSessionService: RoomSessionApplicationService;
  sessionResumeService: SessionResumeService;
  snapshotProjector: LobbyStateSnapshotProjector;
  platformSnapshotV2Projector: PlatformSnapshotV2Projector;
  turnScheduler: InProcessTurnScheduler;
  overdueTurnSweeper: OverdueTurnSweeper;
  subscribeGameDeadlineApplied(
    listener: Parameters<GameDeadlineService["subscribeApplied"]>[0],
  ): () => void;
  subscribeTurnTimeoutApplied(
    listener: Parameters<TurnTimeoutService["subscribeApplied"]>[0],
  ): () => void;
  subscribeNumberTileTimeoutApplied(
    listener: Parameters<NumberTileTimeoutService["subscribeApplied"]>[0],
  ): () => void;
  subscribeRoomClosed(listener: RoomClosedAdvisoryListener): () => void;
  subscribeRoomPlayerRemoved(
    listener: (roomId: RoomId, playerId: PlayerId) => void | Promise<void>,
  ): () => void;
  runRoomMutation<TResult>(
    roomId: RoomId,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
  start(): void;
  stop(): void;
}>;

export type ApplicationRuntimeOptions = Readonly<{
  gameRegistrations?: readonly GameRegistration[];
}>;

function reportTurnSchedulingFailure(): void {
  console.error(
    "A committed Turn could not be scheduled; the overdue sweeper remains the recovery path.",
  );
}

function reportTurnTimeoutFailure(): void {
  console.error(
    "A scheduled Turn timeout could not be processed; the overdue sweeper will retry it.",
  );
}

function reportGameDeadlineFailure(): void {
  console.error(
    "A Game deadline could not be processed; the overdue sweeper will retry it.",
  );
}

function reportGameDeadlineSchedulingFailure(): void {
  console.error(
    "A committed Game deadline could not be scheduled; the overdue sweeper remains the recovery path.",
  );
}

function reportFinishedRetentionSchedulingFailure(): void {
  console.error(
    "A committed FINISHED Room retention deadline could not be scheduled after bounded retries.",
  );
}

function reportRoomPolicyFailure(): void {
  console.error(
    "A Room lifecycle policy could not be processed; a later connection or policy callback may retry it.",
  );
}

/** Creates one isolated process-memory runtime; importing this module has no side effects. */
export function createApplicationRuntime(
  options: ApplicationRuntimeOptions = {},
): ApplicationRuntime {
  const gameRegistry = new GameRegistry(
    options.gameRegistrations ?? [
      createLegacyHangulCompatibilityRegistration(),
      createNumberTileRegistration(),
      createGemCardRegistration(),
      createCityRoleRegistration(),
      { gameType: "DRAW_RELAY" },
      { gameType: "SNEAKY_LUNCH" },
      { gameType: "ISLAND_SETTLERS" },
      { gameType: "SPLENDOR" },
      { gameType: "JAIPUR" },
      { gameType: "LOVE_LETTER" },
      { gameType: "GURYONGTU" },
      { gameType: "AZUL" },
      { gameType: "CARCASSONNE" },
      { gameType: "CLUE" },
      { gameType: "WORD_DUET" },
      { gameType: "SABOTEUR" },
      { gameType: "LOST_CITIES" },
      { gameType: "HALLI_GALLI" },
      { gameType: "WOLF_NIGHT" },
      { gameType: "LIAR_GAME" },
      { gameType: "SPYFALL" },
    ],
  );
  gameRegistry.getRequired(LEGACY_V1_DEFAULT_GAME_TYPE);
  gameRegistry.getRequired(NUMBER_TILE_GAME_TYPE);
  gameRegistry.getRequired("GEM_CARD");
  gameRegistry.getRequired("CITY_ROLE");

  const legacyHangulGameStateAdapter = new LegacyHangulGameStateAdapter();
  const numberTileGameStateAdapter = new NumberTileGameStateAdapter();
  const persistence = new InMemoryPersistence({
    legacyHangulGameStateAdapter,
    numberTileGameStateAdapter,
    gemCardGameStateAdapter: new GemCardGameStateAdapter(),
    cityRoleGameStateAdapter: new CityRoleGameStateAdapter(),
  });
  const clock = new SystemClock();
  const randomSource = new CryptoRandomSource();
  const idGenerator = new NodeCryptoIdGenerator();
  const legacyHangulPlayerLifecycleActions =
    createLegacyHangulPlayerLifecycleActions(idGenerator);
  const numberTilePlayerLifecycleActions =
    createNumberTilePlayerLifecycleActions(idGenerator);
  const playerLifecycleActions = new PlayerLifecycleRouter({
    hangul: legacyHangulPlayerLifecycleActions,
    numberTile: numberTilePlayerLifecycleActions,
    gemCard: createGemCardPlayerLifecycleActions(idGenerator),
    cityRole: createCityRolePlayerLifecycleActions(idGenerator),
    drawRelay: createDrawRelayLifecycle(idGenerator),
    island: createIslandLifecycle(),
    splendor: createSplendorLifecycle(),
    jaipur: createJaipurLifecycle(),
    loveLetter: createLoveLetterLifecycle(),
    guryongtu: createGuryongtuLifecycle(),
    azul: createAzulLifecycle(),
    carcassonne: createCarcassonneLifecycle(),
    clue: createClueLifecycle(),
    duet: createDuetLifecycle(),
    saboteur: createSaboteurLifecycle(),
    lostCities: createLostCitiesLifecycle(),
    halli: createHalliLifecycle(),
    wolf: createWolfLifecycle(),
    liar: createLiarLifecycle(),
    spyfall: createSpyfallLifecycle(),
    sneaky: createSneakyLifecycle(),
  });
  const roomCodeGenerator = new RandomRoomCodeGenerator(randomSource);
  const sessionTokenIssuer = new NodeCryptoSessionTokenIssuer();
  const roomMutationExecutor = new KeyedSerialExecutor<RoomId>();
  const connectionRegistry = new ConnectionRegistry();
  const presenceReader = new ConnectionRegistryPresenceReader(
    connectionRegistry,
  );
  const roomClosedListeners = new Set<RoomClosedAdvisoryListener>();
  const roomPlayerRemovedListeners = new Set<
    (roomId: RoomId, playerId: PlayerId) => void | Promise<void>
  >();
  let acceptsTimeoutWork = false;
  let acceptsGameDeadlineWork = false;
  let acceptsRoomPolicyWork = false;
  let legacyHangulServerActionRouter:
    | LegacyHangulServerActionRouting
    | undefined;
  let scheduledTurnRouter: ScheduledTurnRouter | undefined;
  let roomPresencePolicyService: RoomPresencePolicyService | undefined;
  const enqueueTimeout = async (
    deadline: Parameters<TurnTimeoutService["timeout"]>[0],
  ): Promise<void> => {
    if (
      !acceptsTimeoutWork ||
      scheduledTurnRouter === undefined
    ) {
      return;
    }
    const result = await scheduledTurnRouter.handleTurnTimeout(deadline);
    if (result.status === "FAILED") {
      reportTurnTimeoutFailure();
    }
  };
  const turnScheduler = new InProcessTurnScheduler({
    clock,
    onDeadline: enqueueTimeout,
    onCallbackFailure: reportTurnTimeoutFailure,
  });
  const overdueTurnSweeper = new OverdueTurnSweeper({
    activeTurnReader: persistence,
    clock,
    enqueueTimeout,
    onFailure: reportTurnTimeoutFailure,
  });
  const enqueueGameDeadline = async (
    deadline: Parameters<GameDeadlineService["expire"]>[0],
  ): Promise<void> => {
    if (
      !acceptsGameDeadlineWork ||
      legacyHangulServerActionRouter === undefined
    ) {
      return;
    }
    const result =
      await legacyHangulServerActionRouter.handleGameDeadline(deadline);
    if (result.status === "FAILED") {
      reportGameDeadlineFailure();
    }
  };
  const gameDeadlineScheduler = new InProcessGameDeadlineScheduler({
    clock,
    onDeadline: enqueueGameDeadline,
    onCallbackFailure: reportGameDeadlineFailure,
  });
  const overdueGameDeadlineSweeper = new OverdueGameDeadlineSweeper({
    activeGameReader: persistence,
    clock,
    enqueueDeadline: enqueueGameDeadline,
    onFailure: reportGameDeadlineFailure,
  });
  const roomPolicyScheduler = new InProcessRoomPolicyScheduler({
    clock,
    onDeadline: async (deadline) => {
      if (!acceptsRoomPolicyWork || roomPresencePolicyService === undefined) {
        return;
      }
      await roomPresencePolicyService.onDeadline(deadline);
    },
    onCallbackFailure: reportRoomPolicyFailure,
  });
  const notifyRoomClosed: RoomClosedAdvisoryListener = async (
    roomId,
    roomCode,
    bindings,
  ) => {
    for (const listener of roomClosedListeners) {
      try {
        await listener(roomId, roomCode, bindings);
      } catch {
        reportRoomPolicyFailure();
      }
    }
  };
  const notifyRoomPlayerRemoved = async (
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<void> => {
    if (roomPresencePolicyService !== undefined) {
      try {
        await roomPresencePolicyService.onPlayerRemoved(roomId, clock.now());
      } catch {
        reportRoomPolicyFailure();
      }
    }
    for (const listener of roomPlayerRemovedListeners) {
      try {
        await listener(roomId, playerId);
      } catch {
        reportRoomPolicyFailure();
      }
    }
  };
  const roomLifecycleResources = new RoomLifecycleResources({
    connectionRegistry,
    policyScheduler: roomPolicyScheduler,
    turnTimerCleanup: turnScheduler,
    gameDeadlineTimerCleanup: gameDeadlineScheduler,
    onRoomClosed: notifyRoomClosed,
    onPlayerRemoved: notifyRoomPlayerRemoved,
  });
  const roomCleanupService = new RoomCleanupService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    resources: roomLifecycleResources,
  });
  const lobbyDisconnectGraceService = new LobbyDisconnectGraceService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    resources: roomLifecycleResources,
  });
  const roomRetentionService = new RoomRetentionService({
    cleanupService: roomCleanupService,
    roomRepository: persistence,
    presenceReader,
    clock,
  });
  const enqueueFinishedRetention = async (
    deadline: Parameters<RoomRetentionService["expire"]>[0],
  ): Promise<void> => {
    if (!acceptsRoomPolicyWork) {
      return;
    }
    const result = await roomRetentionService.expire(deadline);
    if (result.status === "FAILED") {
      throw new Error("FINISHED Room retention cleanup failed.");
    }
  };
  const overdueFinishedRetentionSweeper =
    new OverdueFinishedRetentionSweeper({
      finishedRoomRetentionReader: persistence,
      clock,
      retentionMs: ROOM_RETENTION_MS,
      enqueueRetention: enqueueFinishedRetention,
      onFailure: reportRoomPolicyFailure,
    });
  roomPresencePolicyService = new RoomPresencePolicyService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    scheduler: roomPolicyScheduler,
    roomPresenceReader: presenceReader,
    playerPresenceLeaseReader: presenceReader,
    playerLifecycleActions,
    clock,
    lobbyGraceService: lobbyDisconnectGraceService,
    retentionService: roomRetentionService,
  });
  const onGameFinished: GameFinishedPostCommit = async ({
    roomId,
    gameId,
  }) => {
    await Promise.allSettled([
      turnScheduler.cancelRoom(roomId),
      gameDeadlineScheduler.cancelDeadline(gameId),
      scheduleFinishedRetentionBestEffort(
        persistence,
        roomPolicyScheduler,
        { roomId, gameId },
        reportFinishedRetentionSchedulingFailure,
      ),
    ]);
  };

  const gameDeadlineService = new GameDeadlineService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    gameDeadlineScheduler,
    onGameDeadlineSchedulingFailure: reportGameDeadlineSchedulingFailure,
  });
  gameDeadlineService.subscribeApplied(async (data) => {
    await onGameFinished({ roomId: data.roomId, gameId: data.gameId });
  });

  const roomSessionService = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    clock,
    idGenerator,
    roomCodeGenerator,
    sessionTokenIssuer,
    roomMutationExecutor,
    gameRegistrationReader: gameRegistry,
  });
  const sessionResumeService = new SessionResumeService({
    sessionRepository: persistence,
    roomRepository: persistence,
    sessionTokenIssuer,
  });
  const gameStartService = new GameStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    idGenerator,
    randomSource,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    gameDeadlineScheduler,
    onGameDeadlineSchedulingFailure: reportGameDeadlineSchedulingFailure,
    gameRegistrationReader: gameRegistry,
  });
  const numberTileStartService = new NumberTileStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    presenceLeaseReader: presenceReader,
    clock,
    idGenerator,
    randomSource,
    gameRegistrationReader: gameRegistry,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const gemCardStartService = new GemCardStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    presenceLeaseReader: presenceReader,
    clock,
    idGenerator,
    randomSource,
    gameRegistrationReader: gameRegistry,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const islandService = new IslandService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const islandHostSuccession = new IslandHostSuccession(islandService.deps, roomId => islandService.notify(roomId));
  islandService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "ISLAND_SETTLERS" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const splendorService = new SplendorService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const splendorHostSuccession = new SplendorHostSuccession(splendorService.deps, roomId => splendorService.notify(roomId));
  splendorService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "SPLENDOR" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const jaipurService = new JaipurService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource });
  const jaipurHostSuccession = new JaipurHostSuccession(jaipurService.deps, roomId => jaipurService.notify(roomId));
  jaipurService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "JAIPUR" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const loveLetterService = new LoveLetterService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource });
  const loveLetterHostSuccession = new LoveLetterHostSuccession(loveLetterService.deps, roomId => loveLetterService.notify(roomId));
  loveLetterService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "LOVE_LETTER" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const guryongtuService = new GuryongtuService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource });
  const guryongtuHostSuccession = new GuryongtuHostSuccession(guryongtuService.deps, roomId => guryongtuService.notify(roomId));
  guryongtuService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "GURYONGTU" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const azulService = new AzulService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const azulHostSuccession = new AzulHostSuccession(azulService.deps, roomId => azulService.notify(roomId));
  azulService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "AZUL" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });

  const carcassonneService = new CarcassonneService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const carcassonneHostSuccession = new CarcassonneHostSuccession(carcassonneService.deps, roomId => carcassonneService.notify(roomId));
  carcassonneService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "CARCASSONNE" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });

  const clueService = new ClueService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource });
  const clueHostSuccession = new ClueHostSuccession(clueService.deps, roomId => clueService.notify(roomId));
  clueService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "CLUE" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const duetService = new DuetService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource });
  const duetHostSuccession = new DuetHostSuccession(duetService.deps, roomId => duetService.notify(roomId));
  duetService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "WORD_DUET" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const saboteurService = new SaboteurService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const saboteurHostSuccession = new SaboteurHostSuccession(saboteurService.deps, roomId => saboteurService.notify(roomId));
  saboteurService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "SABOTEUR" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });

  const lostCitiesService = new LostCitiesService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const lostCitiesHostSuccession = new LostCitiesHostSuccession(lostCitiesService.deps, roomId => lostCitiesService.notify(roomId));
  lostCitiesService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "LOST_CITIES" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const halliService = new HalliService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const halliHostSuccession = new HalliHostSuccession(halliService.deps, roomId => halliService.notify(roomId));
  halliService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "HALLI_GALLI" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const wolfService = new WolfService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const wolfHostSuccession = new WolfHostSuccession(wolfService.deps, roomId => wolfService.notify(roomId));
  wolfService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "WOLF_NIGHT" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const spyfallService = new SpyfallService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const spyfallHostSuccession = new SpyfallHostSuccession(spyfallService.deps, roomId => spyfallService.notify(roomId));
  spyfallService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "SPYFALL" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const liarService = new LiarService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler, prompts: new CuratedLiarPrompts() });
  const liarHostSuccession = new LiarHostSuccession(liarService.deps, roomId => liarService.notify(roomId));
  liarService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "LIAR_GAME" && room.phase === "FINISHED" && room.game) await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const sneakyLunchService = new SneakyLunchService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const sneakyLunchPresence = new SneakyLunchPresence(sneakyLunchService);
  sneakyLunchService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "SNEAKY_LUNCH" && room.phase === "FINISHED" && room.game)
      await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const drawRelayService = new DrawRelayService({ roomRepository: persistence, roomUnitOfWork: persistence, idempotencyRepository: persistence,
    roomMutationExecutor, presence: presenceReader, clock, ids: idGenerator, random: randomSource, turnScheduler });
  const drawRelayHostSuccession = new DrawRelayHostSuccession(drawRelayService.deps, roomId => drawRelayService.notify(roomId));
  drawRelayService.subscribe(async roomId => {
    const room = await persistence.findById(roomId);
    if (room?.gameType === "DRAW_RELAY" && room.phase === "FINISHED" && room.game)
      await onGameFinished({ roomId, gameId: room.game.gameId });
  });
  const cityRoleStartService = new CityRoleStartService({
    roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor, presenceLeaseReader: presenceReader, clock, idGenerator, randomSource,
    gameRegistrationReader: gameRegistry, turnScheduler, onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const turnSubmitService = new TurnSubmitService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    dictionaryProvider: new TestDictionaryProvider(),
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const turnDrawService = new TurnDrawService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const turnPassService = new TurnPassService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const legacyHangulV1CommandCapability: LegacyHangulV1CommandCapability =
    Object.freeze({
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      start: (input) => gameStartService.start(input),
      submit: (input) => turnSubmitService.submit(input),
      draw: (input) => turnDrawService.draw(input),
      pass: (input) => turnPassService.pass(input),
    });
  const legacyHangulV1CommandRouter = new LegacyHangulV1CommandRouter({
    roomRepository: persistence,
    capability: legacyHangulV1CommandCapability,
  });
  const gameStartRouter = new GameStartRouter({
    drawRelay: { gameType: "DRAW_RELAY", start: input => drawRelayService.start(input) },
    island: { gameType: "ISLAND_SETTLERS", start: input => islandService.start(input) },
    splendor: { gameType: "SPLENDOR", start: input => splendorService.start(input) },
    jaipur: { gameType: "JAIPUR", start: input => jaipurService.start(input) },
    loveLetter: { gameType: "LOVE_LETTER", start: input => loveLetterService.start(input) },
    guryongtu: { gameType: "GURYONGTU", start: input => guryongtuService.start(input) },
    azul: { gameType: "AZUL", start: input => azulService.start(input) },
    carcassonne: { gameType: "CARCASSONNE", start: input => carcassonneService.start(input) },
    clue: { gameType: "CLUE", start: input => clueService.start(input) },
    duet: { gameType: "WORD_DUET", start: input => duetService.start(input) },
    saboteur: { gameType: "SABOTEUR", start: input => saboteurService.start(input) },
    lostCities: { gameType: "LOST_CITIES", start: input => lostCitiesService.start(input) },
    halli: { gameType: "HALLI_GALLI", start: input => halliService.start(input) },
    wolf: { gameType: "WOLF_NIGHT", start: input => wolfService.start(input) },
    liar: { gameType: "LIAR_GAME", start: input => liarService.start(input) },
    spyfall: { gameType: "SPYFALL", start: input => spyfallService.start(input) },
    sneaky: { gameType: "SNEAKY_LUNCH", start: input => sneakyLunchService.start(input) },
    cityRole: { gameType: "CITY_ROLE", start: input => cityRoleStartService.start(input) },
    gemCard: { gameType: "GEM_CARD", start: input => gemCardStartService.start(input) },
    roomRepository: persistence,
    hangul: {
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      start: (input) => gameStartService.start(input),
    },
    numberTile: {
      gameType: NUMBER_TILE_GAME_TYPE,
      start: (input) => numberTileStartService.start(input),
    },
  });
  const numberTileSubmitService = new NumberTileSubmitService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const numberTileDrawService = new NumberTileDrawService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const numberTilePassService = new NumberTilePassService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const numberTileCommandRouter = new NumberTileCommandRouter({
    roomRepository: persistence,
    capability: {
      gameType: NUMBER_TILE_GAME_TYPE,
      submit: (input) => numberTileSubmitService.submit(input),
      draw: (input) => numberTileDrawService.draw(input),
      pass: (input) => numberTilePassService.pass(input),
    },
  });
  const turnTimeoutService = new TurnTimeoutService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource,
    presenceLeaseReader: presenceReader,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const numberTileTimeoutService = new NumberTileTimeoutService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource,
    presenceLeaseReader: presenceReader,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });
  const gemCardCommandService = new GemCardCommandService({
    roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor, clock, idGenerator, turnScheduler, onTurnSchedulingFailure: reportTurnSchedulingFailure, onGameFinished,
  });
  const gemCardCommandRouter = new GemCardCommandRouter({ roomRepository: persistence, capability: {
    gameType: "GEM_CARD", collect: input => gemCardCommandService.collect(input), purchase: input => gemCardCommandService.purchase(input),
    reserve: input => gemCardCommandService.reserve(input), yield: input => gemCardCommandService.yield(input),
  } });
  const gemCardTimeoutService = new GemCardTimeoutService({
    roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor, clock, idGenerator, turnScheduler, onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished, presenceLeaseReader: presenceReader,
  });
  const cityRoleCommandService = new CityRoleCommandService({
    roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor, clock, idGenerator, turnScheduler, onTurnSchedulingFailure: reportTurnSchedulingFailure, onGameFinished,
  });
  const cityRoleCommandRouter = new CityRoleCommandRouter({ roomRepository: persistence, capability: {
    gameType: "CITY_ROLE",
    selectRole: input => cityRoleCommandService.selectRole(input),
    takeIncome: input => cityRoleCommandService.takeIncome(input),
    drawBuildingCards: input => cityRoleCommandService.drawBuildingCards(input),
    chooseBuildingCard: input => cityRoleCommandService.chooseBuildingCard(input),
    useRoleAbility: input => cityRoleCommandService.useRoleAbility(input),
    build: input => cityRoleCommandService.build(input),
    endTurn: input => cityRoleCommandService.endTurn(input),
  } });
  const cityRoleTimeoutService = new CityRoleTimeoutService({
    roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor, clock, idGenerator, turnScheduler, onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished, presenceLeaseReader: presenceReader,
  });
  scheduledTurnRouter = new ScheduledTurnRouter({
    lostCities: {gameType:"LOST_CITIES", handleTurnTimeout: input => lostCitiesService.timeout(input)},
    azul: {gameType:"AZUL", handleTurnTimeout: input => azulService.timeout(input)},
    carcassonne: {gameType:"CARCASSONNE", handleTurnTimeout: input => carcassonneService.timeout(input)},
    saboteur: {gameType:"SABOTEUR", handleTurnTimeout: input => saboteurService.timeout(input)},
    drawRelay: { gameType: "DRAW_RELAY", handleTurnTimeout: input => drawRelayService.timeout(input) },
    island: { gameType: "ISLAND_SETTLERS", handleTurnTimeout: input => islandService.timeout(input) },
    splendor: { gameType: "SPLENDOR", handleTurnTimeout: input => splendorService.timeout(input) },
    halli: { gameType: "HALLI_GALLI", handleTurnTimeout: input => halliService.timeout(input) },
    wolf: { gameType: "WOLF_NIGHT", handleTurnTimeout: input => wolfService.timeout(input) },
    liar: { gameType: "LIAR_GAME", handleTurnTimeout: input => liarService.timeout(input) },
    spyfall: { gameType: "SPYFALL", handleTurnTimeout: input => spyfallService.timeout(input) },
    sneaky: { gameType: "SNEAKY_LUNCH", handleTurnTimeout: input => sneakyLunchService.timeout(input) },
    cityRole: { gameType: "CITY_ROLE", handleTurnTimeout: input => cityRoleTimeoutService.timeout(input) },
    gemCard: { gameType: "GEM_CARD", handleTurnTimeout: input => gemCardTimeoutService.timeout(input) },
    roomRepository: persistence,
    hangul: {
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      handleTurnTimeout: (input) => turnTimeoutService.timeout(input),
    },
    numberTile: {
      gameType: NUMBER_TILE_GAME_TYPE,
      handleTurnTimeout: (input) => numberTileTimeoutService.timeout(input),
    },
  });
  const legacyHangulServerActionCapability: LegacyHangulServerActionCapability =
    Object.freeze({
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      handleTurnTimeout: (input) => turnTimeoutService.timeout(input),
      handleGameDeadline: (input) => gameDeadlineService.expire(input),
    });
  legacyHangulServerActionRouter = new LegacyHangulServerActionRouter({
    roomRepository: persistence,
    capability: legacyHangulServerActionCapability,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
    legacyHangulV1GameProjector: projectLegacyHangulV1Game,
  });
  const platformSnapshotV2Projector = new PlatformSnapshotV2Projector({
    clock,
    presenceReader,
    legacyHangulSnapshotProjector: snapshotProjector,
    numberTileGameProjector: projectNumberTileV2Game,
    gemCardGameProjector: projectGemCardV2Game,
    cityRoleGameProjector: projectCityRoleV2Game,
  });
  const roomLeaveService = new RoomLeaveService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    playerLifecycleActions,
    clock,
    resources: roomLifecycleResources,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
    onGameFinished,
  });

  let running = false;
  return Object.freeze({
    clock,
    connectionRegistry,
    gameRegistry,
    gameStartRouter,
    gameDeadlineScheduler,
    legacyHangulServerActionRouter,
    legacyHangulV1CommandRouter,
    numberTileCommandRouter,
    roomGameSelectionService: new RoomGameSelectionService({ roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence, roomMutationExecutor, clock }),
    numberTileRematchService: new NumberTileRematchService({ roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence, roomMutationExecutor, clock, idGenerator, turnScheduler }),
    gemCardCommandRouter,
    cityRoleCommandRouter,
    cityRoleCommandService,
    drawRelayService,
    drawRelayHostSuccession,
    islandService,
    splendorService,
    jaipurService,
    loveLetterService,
    guryongtuService,
    azulService,
    carcassonneService,
    clueService,
    duetService,
    saboteurService,
    lostCitiesService,
    halliService,
    wolfService,
    liarService,
    spyfallService,
    islandHostSuccession,
    splendorHostSuccession,
    jaipurHostSuccession,
    loveLetterHostSuccession,
    guryongtuHostSuccession,
    azulHostSuccession,
    carcassonneHostSuccession,
    clueHostSuccession,
    duetHostSuccession,
    saboteurHostSuccession,
    lostCitiesHostSuccession,
    halliHostSuccession,
    wolfHostSuccession,
    liarHostSuccession,
    spyfallHostSuccession,
    sneakyLunchService,
    sneakyLunchPresence,
    subscribeCityRoleTimeoutApplied(listener) { return cityRoleTimeoutService.subscribeApplied(listener); },
    subscribeGemCardTimeoutApplied(listener) { return gemCardTimeoutService.subscribeApplied(listener); },
    overdueGameDeadlineSweeper,
    persistence,
    roomLeaveService,
    roomPolicyScheduler,
    roomPresencePolicyService,
    roomSessionService,
    sessionResumeService,
    snapshotProjector,
    platformSnapshotV2Projector,
    turnScheduler,
    overdueTurnSweeper,
    subscribeGameDeadlineApplied(listener) {
      return gameDeadlineService.subscribeApplied(listener);
    },
    subscribeTurnTimeoutApplied(listener) {
      return turnTimeoutService.subscribeApplied(listener);
    },
    subscribeNumberTileTimeoutApplied(listener) {
      return numberTileTimeoutService.subscribeApplied(listener);
    },
    subscribeRoomClosed(listener) {
      roomClosedListeners.add(listener);
      return () => {
        roomClosedListeners.delete(listener);
      };
    },
    subscribeRoomPlayerRemoved(listener) {
      roomPlayerRemovedListeners.add(listener);
      return () => {
        roomPlayerRemovedListeners.delete(listener);
      };
    },
    runRoomMutation(roomId, task) {
      return roomMutationExecutor.run(roomId, task);
    },
    start() {
      if (running) {
        return;
      }
      running = true;
      acceptsTimeoutWork = true;
      acceptsGameDeadlineWork = true;
      acceptsRoomPolicyWork = true;
      drawRelayHostSuccession.start();
      sneakyLunchPresence.start();
      islandHostSuccession.start();
      splendorHostSuccession.start();
      jaipurHostSuccession.start();
      loveLetterHostSuccession.start();
      guryongtuHostSuccession.start();
      azulHostSuccession.start();
      carcassonneHostSuccession.start();
      clueHostSuccession.start();
      duetHostSuccession.start();
      saboteurHostSuccession.start();
      lostCitiesHostSuccession.start();
      halliHostSuccession.start();
      wolfHostSuccession.start();
      liarHostSuccession.start();
      spyfallHostSuccession.start();
      roomPolicyScheduler.start();
      turnScheduler.start();
      gameDeadlineScheduler.start();
      overdueTurnSweeper.start();
      overdueGameDeadlineSweeper.start();
      overdueFinishedRetentionSweeper.start();
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      acceptsTimeoutWork = false;
      acceptsGameDeadlineWork = false;
      acceptsRoomPolicyWork = false;
      drawRelayHostSuccession.stop();
      sneakyLunchPresence.stop();
      islandHostSuccession.stop();
      splendorHostSuccession.stop();
      jaipurHostSuccession.stop();
      loveLetterHostSuccession.stop();
      guryongtuHostSuccession.stop();
      azulHostSuccession.stop();
      carcassonneHostSuccession.stop();
      clueHostSuccession.stop();
      duetHostSuccession.stop();
      saboteurHostSuccession.stop();
      lostCitiesHostSuccession.stop();
      halliHostSuccession.stop();
      wolfHostSuccession.stop();
      liarHostSuccession.stop();
      spyfallHostSuccession.stop();
      roomPolicyScheduler.stop();
      overdueTurnSweeper.stop();
      overdueGameDeadlineSweeper.stop();
      overdueFinishedRetentionSweeper.stop();
      turnScheduler.stop();
      gameDeadlineScheduler.stop();
    },
  });
}
