import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validatePlayingStateSnapshot,
  validateRoomCode,
  validateTurnSubmitCommand,
  type PlayingStateSnapshot,
  type ProtocolErrorCode,
} from "@hangul-rummikub/shared";

import { createRequestId } from "./request-id.js";
import {
  addDraftSyllable,
  addDraftWordGroup,
  createTurnDraft,
  moveDraftTile,
  type TurnDraft,
  type TurnDraftEditResult,
} from "./turn-draft.js";
import {
  createOrReuseTurnSubmitCommand,
  decideTurnSubmitFailureAction,
  runTurnSubmitSingleFlight,
  serializeTurnDraft,
  shouldDiscardPendingTurnSubmitOnNavigation,
  snapshotSupersedesPendingTurnSubmit,
} from "./turn-submit.js";

function playingSnapshot(gameRevision = 7): PlayingStateSnapshot {
  const result = validatePlayingStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 4,
      gameRevision,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_turn_submit_web",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player_self",
          nickname: "나",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 3,
          initialMeldCompleted: true,
          forfeited: false,
        },
        {
          playerId: "player_other",
          nickname: "상대",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 14,
          initialMeldCompleted: true,
          forfeited: false,
        },
      ],
    },
    game: {
      gameId: "game_turn_submit_web",
      board: { wordGroups: [] },
      turnOrder: ["player_self", "player_other"],
      turn: {
        turnId: "turn_submit_one",
        turnNumber: 3,
        activePlayerId: "player_self",
        startedAt: 1_750_000_000_000,
        deadlineAt: 1_750_000_060_000,
      },
      bagCounts: { consonant: 80, vowel: 47 },
    },
    self: {
      playerId: "player_self",
      rack: [
        {
          tileId: "tile_giyeok",
          kind: "ORDINARY",
          physicalType: "GIYEOK_NIEUN_ROTATION",
          sourceBag: "CONSONANT",
          allowedSymbols: ["ㄱ", "ㄴ"],
        },
        {
          tileId: "tile_a",
          kind: "ORDINARY",
          physicalType: "A_ROTATION",
          sourceBag: "VOWEL",
          allowedSymbols: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
        },
        {
          tileId: "tile_siot",
          kind: "ORDINARY",
          physicalType: "SIOT",
          sourceBag: "CONSONANT",
          allowedSymbols: ["ㅅ"],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Turn submit web fixture must be valid.");
  }
  return result.value;
}

function requireEdit(result: TurnDraftEditResult): TurnDraft {
  if (!result.ok) {
    throw new Error(`Expected successful edit, received ${result.error.code}.`);
  }
  assert.equal(result.ok, true);
  return result.draft;
}

function dirtyDraft(): TurnDraft {
  const initial = createTurnDraft(playingSnapshot());
  assert.notEqual(initial, null);
  if (initial === null) {
    throw new Error("Expected an editable draft.");
  }
  const giyeok = initial.rackTiles[0];
  const a = initial.rackTiles[1];
  const siot = initial.rackTiles[2];
  if (giyeok === undefined || a === undefined || siot === undefined) {
    throw new Error("Expected the draft rack fixture.");
  }

  let draft = requireEdit(addDraftWordGroup(initial, "local_word"));
  draft = requireEdit(addDraftSyllable(draft, "local_word"));
  draft = requireEdit(
    moveDraftTile(draft, giyeok.tileId, "ㄱ", {
      groupId: "local_word",
      syllableIndex: 0,
      role: "choseong",
      componentIndex: 0,
    }),
  );
  draft = requireEdit(
    moveDraftTile(draft, a.tileId, "ㅏ", {
      groupId: "local_word",
      syllableIndex: 0,
      role: "jungseong",
      componentIndex: 0,
    }),
  );
  return requireEdit(
    moveDraftTile(draft, siot.tileId, "ㅅ", {
      groupId: "local_word",
      syllableIndex: 0,
      role: "jongseong",
      componentIndex: 0,
    }),
  );
}

test("TurnDraft를 tileId, assignedSymbol, syllable 구획만 담은 ProposedBoard로 직렬화한다", () => {
  const draft = dirtyDraft();
  const before = structuredClone(draft);

  assert.deepEqual(serializeTurnDraft(draft), {
    wordGroups: [
      {
        groupId: "local_word",
        syllables: [
          {
            choseong: [{ tileId: "tile_giyeok", assignedSymbol: "ㄱ" }],
            jungseong: [{ tileId: "tile_a", assignedSymbol: "ㅏ" }],
            jongseong: [{ tileId: "tile_siot", assignedSymbol: "ㅅ" }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(draft, before);
  const serialized = JSON.stringify(serializeTurnDraft(draft));
  assert.equal(serialized.includes("physicalType"), false);
  assert.equal(serialized.includes("allowedSymbols"), false);
  assert.equal(serialized.includes("sessionToken"), false);
  assert.equal(serialized.includes("rack"), false);
});

test("Submit command는 draft base revision/turn을 사용하고 page-memory retry에서 동일 객체를 재사용한다", () => {
  const draft = dirtyDraft();
  let sequence = 0;
  const createId = () =>
    createRequestId(() => {
      sequence += 1;
      return `turn-submit-request-${sequence}`;
    });

  const initial = createOrReuseTurnSubmitCommand(null, draft, createId);
  const retry = createOrReuseTurnSubmitCommand(initial, draft, createId);
  const nextLogical = createOrReuseTurnSubmitCommand(null, draft, createId);

  assert.equal(initial.expectedGameRevision, draft.baseGameRevision);
  assert.equal(initial.turnId, draft.baseTurnId);
  assert.equal(retry, initial);
  assert.equal(retry.requestId, initial.requestId);
  assert.deepEqual(retry.payload, initial.payload);
  assert.notEqual(nextLogical.requestId, initial.requestId);
  assert.equal(sequence, 2);
  assert.equal(validateTurnSubmitCommand(initial).ok, true);
});

test("Submit transport attempt는 page 안에서 single-flight로 실행된다", async () => {
  let executions = 0;
  const gate: { release: () => void } = {
    release: () => {
      throw new Error("Submit flight resolver was not initialized.");
    },
  };
  const flightRef: { current: Promise<void> | null } = { current: null };
  const execute = () => {
    executions += 1;
    return new Promise<void>((resolve) => {
      gate.release = resolve;
    });
  };

  const first = runTurnSubmitSingleFlight(flightRef, execute);
  const duplicate = runTurnSubmitSingleFlight(flightRef, execute);
  assert.equal(duplicate, first);
  assert.equal(executions, 1);

  gate.release();
  await first;
  assert.equal(flightRef.current, null);

  const next = runTurnSubmitSingleFlight(flightRef, async () => {
    executions += 1;
  });
  await next;
  assert.equal(executions, 2);
});

test("rule rejection은 draft를 보존하고 stale/turn/auth/tile 오류는 reset+sync를 요구한다", () => {
  const expectedGameRevision = playingSnapshot(7).versions.gameRevision;
  const newerGameRevision = playingSnapshot(8).versions.gameRevision;
  const preserving: ProtocolErrorCode[] = [
    "INVALID_BOARD",
    "INVALID_HANGUL_COMPOSITION",
    "WORD_NOT_ALLOWED",
    "RULE_VIOLATION",
    "TEMPORARILY_UNAVAILABLE",
  ];
  const resetting: ProtocolErrorCode[] = [
    "STALE_GAME_REVISION",
    "NOT_YOUR_TURN",
    "TURN_EXPIRED",
    "INVALID_PHASE",
    "UNAUTHENTICATED",
    "INVALID_TILE_ACCESS",
  ];

  for (const code of preserving) {
    assert.equal(
      decideTurnSubmitFailureAction(
        code,
        expectedGameRevision,
        expectedGameRevision,
      ),
      "PRESERVE_DRAFT",
      code,
    );
  }
  for (const code of resetting) {
    assert.equal(
      decideTurnSubmitFailureAction(
        code,
        expectedGameRevision,
        expectedGameRevision,
      ),
      "RESET_DRAFT_AND_SYNC",
      code,
    );
  }
  assert.equal(
    decideTurnSubmitFailureAction(
      "WORD_NOT_ALLOWED",
      newerGameRevision,
      expectedGameRevision,
    ),
    "RESET_DRAFT_AND_SYNC",
  );
});

test("authoritative newer revision/new turn/FINISHED snapshot은 pending Submit을 종료한다", () => {
  const command = createOrReuseTurnSubmitCommand(
    null,
    dirtyDraft(),
    () => createRequestId(() => "turn-submit-pending"),
  );

  assert.equal(
    snapshotSupersedesPendingTurnSubmit(command, {
      room: { phase: "PLAYING" },
      versions: { gameRevision: command.expectedGameRevision },
      game: { turn: { turnId: command.turnId } },
    }),
    false,
  );
  assert.equal(
    snapshotSupersedesPendingTurnSubmit(command, {
      room: { phase: "PLAYING" },
      versions: { gameRevision: command.expectedGameRevision + 1 },
      game: { turn: { turnId: "turn_submit_two" } },
    }),
    true,
  );
  assert.equal(
    snapshotSupersedesPendingTurnSubmit(command, {
      room: { phase: "FINISHED" },
      versions: { gameRevision: command.expectedGameRevision + 1 },
    }),
    true,
  );
});

test("pending Submit은 생성된 Room 안에서만 page-memory retry 대상으로 유지한다", () => {
  const currentRoom = validateRoomCode("ABC234");
  const otherRoom = validateRoomCode("XYZ789");
  assert.equal(currentRoom.ok, true);
  assert.equal(otherRoom.ok, true);
  if (!currentRoom.ok || !otherRoom.ok) {
    throw new Error("Pending Submit Room fixtures must be valid.");
  }

  assert.equal(
    shouldDiscardPendingTurnSubmitOnNavigation(
      currentRoom.value,
      currentRoom.value,
    ),
    false,
  );
  assert.equal(
    shouldDiscardPendingTurnSubmitOnNavigation(
      currentRoom.value,
      otherRoom.value,
    ),
    true,
  );
  assert.equal(
    shouldDiscardPendingTurnSubmitOnNavigation(currentRoom.value, null),
    true,
  );
});
