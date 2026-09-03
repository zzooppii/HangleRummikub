import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validatePlayingStateSnapshot,
  validateRoomCode,
  validateTurnDrawCommand,
  validateTurnPassCommand,
  type PlayingStateSnapshot,
  type ProtocolErrorCode,
} from "@hangul-rummikub/shared";

import { createRequestId } from "./request-id.js";
import { runTurnSubmitSingleFlight } from "./turn-submit.js";
import {
  createOrReuseTurnDrawCommand,
  createOrReuseTurnPassCommand,
  decideTurnActionFailureAction,
  getTurnActionControls,
  runTurnActionSingleFlight,
  shouldConfirmDraw,
  shouldDiscardPendingTurnActionOnNavigation,
  snapshotSupersedesPendingTurnAction,
} from "./turn-actions.js";

function playingSnapshot(
  options: Readonly<{
    activePlayerId?: "player_self" | "player_other";
    consonant?: number;
    vowel?: number;
    gameRevision?: number;
    turnId?: string;
  }> = {},
): PlayingStateSnapshot {
  const result = validatePlayingStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 4,
      gameRevision: options.gameRevision ?? 7,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_turn_action_web",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player_self",
          nickname: "나",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 0,
          initialMeldCompleted: false,
        },
        {
          playerId: "player_other",
          nickname: "상대",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 14,
          initialMeldCompleted: false,
        },
      ],
    },
    game: {
      gameId: "game_turn_action_web",
      board: { wordGroups: [] },
      turnOrder: ["player_self", "player_other"],
      turn: {
        turnId: options.turnId ?? "turn_action_one",
        turnNumber: 3,
        activePlayerId: options.activePlayerId ?? "player_self",
        startedAt: 1_750_000_000_000,
        deadlineAt: 1_750_000_060_000,
      },
      bagCounts: {
        consonant: options.consonant ?? 80,
        vowel: options.vowel ?? 47,
      },
    },
    self: { playerId: "player_self", rack: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Turn action web fixture must be valid.");
  }
  return result.value;
}

test("Draw command는 bag만 주장하고 page-memory retry에서 같은 requestId를 유지한다", () => {
  const snapshot = playingSnapshot();
  let sequence = 0;
  const createId = () =>
    createRequestId(() => `turn-draw-request-${++sequence}`);
  const first = createOrReuseTurnDrawCommand(
    null,
    snapshot.versions.gameRevision,
    snapshot.game.turn.turnId,
    "CONSONANT",
    createId,
  );
  const retry = createOrReuseTurnDrawCommand(
    first,
    snapshot.versions.gameRevision,
    snapshot.game.turn.turnId,
    "CONSONANT",
    createId,
  );

  assert.equal(retry, first);
  assert.equal(sequence, 1);
  assert.deepEqual(first.payload, { bagKind: "CONSONANT" });
  assert.equal("tileId" in first.payload, false);
  assert.equal(validateTurnDrawCommand(first).ok, true);
});

test("Pass command는 strict empty payload이며 retry에서 같은 requestId를 유지한다", () => {
  const snapshot = playingSnapshot({ consonant: 0, vowel: 0 });
  let sequence = 0;
  const createId = () =>
    createRequestId(() => `turn-pass-request-${++sequence}`);
  const first = createOrReuseTurnPassCommand(
    null,
    snapshot.versions.gameRevision,
    snapshot.game.turn.turnId,
    createId,
  );
  const retry = createOrReuseTurnPassCommand(
    first,
    snapshot.versions.gameRevision,
    snapshot.game.turn.turnId,
    createId,
  );

  assert.equal(retry, first);
  assert.equal(sequence, 1);
  assert.deepEqual(first.payload, {});
  assert.equal(validateTurnPassCommand(first).ok, true);
});

test("Submit/Draw/Pass transport는 하나의 page-memory single-flight gate를 공유한다", async () => {
  let executions = 0;
  let release: () => void = () => {
    throw new Error("Turn action resolver was not initialized.");
  };
  const flightRef: { current: Promise<void> | null } = { current: null };
  const first = runTurnActionSingleFlight(
    flightRef,
    () =>
      new Promise<void>((resolve) => {
        executions += 1;
        release = resolve;
      }),
  );
  const duplicate = runTurnSubmitSingleFlight(flightRef, async () => {
    executions += 1;
  });

  assert.equal(duplicate, first);
  assert.equal(executions, 1);
  release();
  await first;
  assert.equal(flightRef.current, null);
});

test("active/current session만 Draw control을 사용하고 empty bag은 비활성화한다", () => {
  assert.deepEqual(getTurnActionControls(playingSnapshot(), true, false), {
    visible: true,
    canDrawConsonant: true,
    canDrawVowel: true,
    canPass: false,
  });
  assert.deepEqual(
    getTurnActionControls(
      playingSnapshot({ consonant: 0, vowel: 4 }),
      true,
      false,
    ),
    {
      visible: true,
      canDrawConsonant: false,
      canDrawVowel: true,
      canPass: false,
    },
  );
  assert.equal(
    getTurnActionControls(
      playingSnapshot({ activePlayerId: "player_other" }),
      true,
      false,
    ).visible,
    false,
  );
  assert.equal(
    getTurnActionControls(playingSnapshot(), false, false).visible,
    false,
  );
  assert.deepEqual(getTurnActionControls(playingSnapshot(), true, true), {
    visible: true,
    canDrawConsonant: false,
    canDrawVowel: false,
    canPass: false,
  });
});

test("두 bag이 모두 empty일 때만 Pass control을 제공한다", () => {
  const bothEmpty = getTurnActionControls(
    playingSnapshot({ consonant: 0, vowel: 0 }),
    true,
    false,
  );
  const oneRemaining = getTurnActionControls(
    playingSnapshot({ consonant: 0, vowel: 1 }),
    true,
    false,
  );

  assert.equal(bothEmpty.canPass, true);
  assert.equal(bothEmpty.canDrawConsonant, false);
  assert.equal(bothEmpty.canDrawVowel, false);
  assert.equal(oneRemaining.canPass, false);
});

test("dirty draft Draw는 확인이 필요하고 clean draft는 즉시 실행 가능하다", () => {
  assert.equal(shouldConfirmDraw(true), true);
  assert.equal(shouldConfirmDraw(false), false);
});

test("bag/pass rejection은 draft를 보존하고 turn authority 오류는 reset+sync한다", () => {
  const expectedRevision = playingSnapshot().versions.gameRevision;
  const newerRevision = playingSnapshot({
    gameRevision: 8,
  }).versions.gameRevision;
  const preserving: ProtocolErrorCode[] = [
    "BAG_EMPTY",
    "PASS_NOT_ALLOWED",
    "REQUEST_ID_REUSED",
  ];
  const resetting: ProtocolErrorCode[] = [
    "TURN_EXPIRED",
    "STALE_GAME_REVISION",
    "NOT_YOUR_TURN",
    "INVALID_PHASE",
    "UNAUTHENTICATED",
  ];

  for (const code of preserving) {
    assert.equal(
      decideTurnActionFailureAction(
        code,
        expectedRevision,
        expectedRevision,
      ),
      "PRESERVE_DRAFT",
    );
  }
  for (const code of resetting) {
    assert.equal(
      decideTurnActionFailureAction(
        code,
        expectedRevision,
        expectedRevision,
      ),
      "RESET_DRAFT_AND_SYNC",
    );
  }
  assert.equal(
    decideTurnActionFailureAction(
      "BAG_EMPTY",
      newerRevision,
      expectedRevision,
    ),
    "RESET_DRAFT_AND_SYNC",
  );
});

test("new revision/turn snapshot은 pending action을 끝내고 equal snapshot은 유지한다", () => {
  const snapshot = playingSnapshot();
  const command = createOrReuseTurnDrawCommand(
    null,
    snapshot.versions.gameRevision,
    snapshot.game.turn.turnId,
    "VOWEL",
    () => createRequestId(() => "pending-turn-action"),
  );

  assert.equal(
    snapshotSupersedesPendingTurnAction(command, {
      room: { phase: "PLAYING" },
      versions: { gameRevision: command.expectedGameRevision },
      game: { turn: { turnId: command.turnId } },
    }),
    false,
  );
  assert.equal(
    snapshotSupersedesPendingTurnAction(command, {
      room: { phase: "PLAYING" },
      versions: { gameRevision: command.expectedGameRevision + 1 },
      game: { turn: { turnId: "turn_action_two" } },
    }),
    true,
  );
  assert.equal(
    snapshotSupersedesPendingTurnAction(command, {
      room: { phase: "FINISHED" },
      versions: { gameRevision: command.expectedGameRevision + 1 },
    }),
    true,
  );
});

test("pending Draw/Pass는 현재 Room을 벗어나면 폐기한다", () => {
  const current = validateRoomCode("ABC234");
  const other = validateRoomCode("XYZ789");
  assert.equal(current.ok, true);
  assert.equal(other.ok, true);
  if (!current.ok || !other.ok) {
    throw new Error("Room fixtures must be valid.");
  }

  assert.equal(
    shouldDiscardPendingTurnActionOnNavigation(current.value, current.value),
    false,
  );
  assert.equal(
    shouldDiscardPendingTurnActionOnNavigation(current.value, other.value),
    true,
  );
  assert.equal(
    shouldDiscardPendingTurnActionOnNavigation(current.value, null),
    true,
  );
});
