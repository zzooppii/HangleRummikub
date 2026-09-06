import assert from "node:assert/strict";
import test from "node:test";

import type {
  GameRevision,
  GameId,
  NumberSubmitCommand,
  RequestId,
  TileId,
  TurnId,
} from "@hangul-rummikub/shared";

import type { NumberTileTurnDraft } from "../features/number-tile/number-tile-turn-draft.js";
import {
  createOrReuseNumberDrawCommand,
  createOrReuseNumberPassCommand,
  createOrReuseNumberSubmitCommand,
  decideNumberTileCommandFailureAction,
  numberSnapshotSupersedesCommand,
  runNumberTileCommandSingleFlight,
  serializeNumberTileTurnDraft,
} from "./number-tile-actions.js";

const revision = 4 as GameRevision;
const turnId = "number-turn" as TurnId;
const requestId = "number-request" as RequestId;

function draft(jokerAssigned = true): NumberTileTurnDraft {
  const table = {
    melds: [
      {
        kind: "GROUP" as const,
        origin: "LOCAL" as const,
        tiles: [
          {
            tileId: "number-red-seven" as TileId,
            kind: "ORDINARY" as const,
            number: 7 as const,
            color: "RED" as const,
            origin: "SELF_RACK" as const,
          },
          {
            tileId: "number-joker" as TileId,
            kind: "JOKER" as const,
            assignment: jokerAssigned
              ? { number: 7 as const, color: "BLUE" as const }
              : null,
            origin: "SELF_RACK" as const,
          },
        ],
      },
    ],
  };
  const value: NumberTileTurnDraft = {
    baseGameId: "number-game" as GameId,
    baseGameRevision: revision,
    baseTurnId: turnId,
    mode: "INITIAL_MELD",
    table,
    availableRackTiles: [],
    rackTiles: [],
    canonicalTableTileIds: [],
    baseline: { table: { melds: [] }, availableRackTiles: [] },
    history: [],
  };
  return value;
}

test("Number draft는 ordinary identity와 Joker assignment만 exact proposedTable로 serialize한다", () => {
  assert.deepEqual(serializeNumberTileTurnDraft(draft()), {
    melds: [
      {
        kind: "GROUP",
        tiles: [
          { tileId: "number-red-seven", kind: "ORDINARY" },
          {
            tileId: "number-joker",
            kind: "JOKER",
            assignedNumber: 7,
            assignedColor: "BLUE",
          },
        ],
      },
    ],
  });
  assert.equal(serializeNumberTileTurnDraft(draft(false)), null);
});

test("Number Submit/Draw/Pass는 revision, turnId, requestId와 empty action payload를 보존한다", () => {
  const submit = createOrReuseNumberSubmitCommand(null, draft(), () => requestId);
  assert.equal(submit?.kind, "number:submit");
  assert.equal(submit?.expectedGameRevision, revision);
  assert.equal(submit?.turnId, turnId);

  const draw = createOrReuseNumberDrawCommand(null, revision, turnId, () => requestId);
  const pass = createOrReuseNumberPassCommand(null, revision, turnId, () => requestId);
  assert.deepEqual(draw.payload, {});
  assert.deepEqual(pass.payload, {});
  assert.equal(draw.requestId, requestId);
  assert.equal(pass.requestId, requestId);
});

test("ack 손실 retry는 같은 Number command object를 재사용한다", () => {
  const pending = createOrReuseNumberSubmitCommand(null, draft(), () => requestId);
  assert.notEqual(pending, null);
  assert.equal(
    createOrReuseNumberSubmitCommand(
      pending as NumberSubmitCommand,
      draft(),
      () => "other-request" as RequestId,
    ),
    pending,
  );
});

test("Draw/Pass ack 손실 retry도 같은 requestId와 command identity를 유지한다", () => {
  const draw = createOrReuseNumberDrawCommand(null, revision, turnId, () => requestId);
  const pass = createOrReuseNumberPassCommand(null, revision, turnId, () => requestId);

  assert.equal(
    createOrReuseNumberDrawCommand(draw, 9 as GameRevision, "next" as TurnId, () =>
      "other" as RequestId),
    draw,
  );
  assert.equal(
    createOrReuseNumberPassCommand(pass, 9 as GameRevision, "next" as TurnId, () =>
      "other" as RequestId),
    pass,
  );
});

test("gameplay rejection은 draft를 보존하고 stale/turn/deadline mismatch는 reset+sync한다", () => {
  for (const code of [
    "INVALID_TABLE",
    "INVALID_MELD",
    "INITIAL_MELD_TOO_LOW",
    "INVALID_JOKER_RECOVERY",
  ] as const) {
    assert.equal(
      decideNumberTileCommandFailureAction(code, revision, revision),
      "PRESERVE_DRAFT",
    );
  }
  for (const code of [
    "STALE_GAME_REVISION",
    "NOT_YOUR_TURN",
    "TURN_EXPIRED",
    "INVALID_TILE_ACCESS",
  ] as const) {
    assert.equal(
      decideNumberTileCommandFailureAction(code, revision, revision),
      "RESET_DRAFT_AND_SYNC",
    );
  }
  assert.equal(
    decideNumberTileCommandFailureAction(
      "INVALID_TABLE",
      5 as GameRevision,
      revision,
    ),
    "RESET_DRAFT_AND_SYNC",
  );
});

test("Number command는 한 번에 하나만 실행한다", async () => {
  const flightRef = { current: null as Promise<void> | null };
  let calls = 0;
  let release: (() => void) | undefined;
  const first = runNumberTileCommandSingleFlight(flightRef, async () => {
    calls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const second = runNumberTileCommandSingleFlight(flightRef, async () => {
    calls += 1;
  });
  assert.equal(first, second);
  assert.equal(calls, 1);
  release?.();
  await first;
  assert.equal(flightRef.current, null);
});

test("canonical revision/turn 종료 또는 FINISHED 전이만 pending Number command를 supersede한다", () => {
  const command = createOrReuseNumberDrawCommand(null, revision, turnId, () => requestId);
  const sameIdentity = {
    game: {
      gameRevision: revision,
      turn: { turnId },
    },
  };

  assert.equal(
    numberSnapshotSupersedesCommand(
      command,
      sameIdentity as Parameters<typeof numberSnapshotSupersedesCommand>[1],
    ),
    false,
  );
  assert.equal(numberSnapshotSupersedesCommand(command, null), true);
});
