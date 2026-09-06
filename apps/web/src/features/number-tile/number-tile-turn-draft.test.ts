import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePlatformSnapshotV2,
  type NumberTilePlayingPlatformSnapshotV2,
  type PlatformSnapshotV2,
  type TileId,
} from "@hangul-rummikub/shared";

import {
  NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT,
  addNumberTileDraftMeld,
  assignNumberTileDraftJoker,
  canEditNumberTileTurnDraft,
  createNumberTileTurnDraft,
  decideNumberTileTurnDraftReconciliation,
  findNumberTileDraftTile,
  isNumberTileTurnDraftDirty,
  placeNumberTileDraftTile,
  removeEmptyNumberTileDraftMeld,
  resetNumberTileTurnDraft,
  returnNumberTileDraftTileToRack,
  undoNumberTileTurnDraft,
  type NumberTileTurnDraft,
  type NumberTileTurnDraftEditErrorCode,
  type NumberTileTurnDraftEditResult,
} from "./number-tile-turn-draft.js";

type SnapshotOptions = Readonly<{
  selfIsActive?: boolean;
  initialMeldCompleted?: boolean;
  gameId?: string;
  gameRevision?: number;
  turnId?: string;
  presenceVersion?: number;
  canonicalJoker?: boolean;
}>;

function isNumberTilePlayingSnapshot(
  value: PlatformSnapshotV2,
): value is NumberTilePlayingPlatformSnapshotV2 {
  return (
    value.room.phase === "PLAYING" &&
    value.room.gameType === "NUMBER_TILE" &&
    value.game !== null &&
    value.game.gameType === "NUMBER_TILE" &&
    "turn" in value.game
  );
}

function snapshot(
  options: SnapshotOptions = {},
): NumberTilePlayingPlatformSnapshotV2 {
  const tableTiles = options.canonicalJoker === true
    ? [
        {
          tileId: "table-red-3-a",
          kind: "ORDINARY",
          number: 3,
          color: "RED",
        },
        {
          tileId: "table-joker-a",
          kind: "JOKER",
          assignedNumber: 4,
          assignedColor: "RED",
        },
        {
          tileId: "table-red-5-a",
          kind: "ORDINARY",
          number: 5,
          color: "RED",
        },
      ]
    : [
        {
          tileId: "table-red-3-a",
          kind: "ORDINARY",
          number: 3,
          color: "RED",
        },
        {
          tileId: "table-red-4-a",
          kind: "ORDINARY",
          number: 4,
          color: "RED",
        },
        {
          tileId: "table-red-5-a",
          kind: "ORDINARY",
          number: 5,
          color: "RED",
        },
      ];
  const input = {
    snapshotVersion: 2,
    versions: {
      roomRevision: 4,
      presenceVersion: options.presenceVersion ?? 8,
    },
    serverTime: 1_800_000_000_000,
    room: {
      roomId: "number-draft-room",
      roomCode: "ABC234",
      phase: "PLAYING",
      gameType: "NUMBER_TILE",
      players: [
        {
          playerId: "number-player-self",
          nickname: "Self",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
        {
          playerId: "number-player-other",
          nickname: "Other",
          isHost: false,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: "number-player-self" },
    game: {
      gameType: "NUMBER_TILE",
      gameId: options.gameId ?? "number-draft-game",
      gameRevision: options.gameRevision ?? 3,
      remainingPoolCount: 97,
      table: {
        melds: [{ kind: "RUN", tiles: tableTiles }],
      },
      playerStates: [
        {
          playerId: "number-player-self",
          rackCount: 3,
          initialMeldCompleted: options.initialMeldCompleted ?? true,
          forfeited: false,
        },
        {
          playerId: "number-player-other",
          rackCount: 3,
          initialMeldCompleted: true,
          forfeited: false,
        },
      ],
      turn: {
        turnId: options.turnId ?? "number-draft-turn",
        turnNumber: 4,
        activePlayerId: options.selfIsActive === false
          ? "number-player-other"
          : "number-player-self",
        startedAt: 1_800_000_000_000,
        deadlineAt: 1_800_000_090_000,
      },
      privateState: {
        rack: [
          {
            tileId: "rack-red-7-a",
            kind: "ORDINARY",
            number: 7,
            color: "RED",
          },
          {
            tileId: "rack-blue-7-a",
            kind: "ORDINARY",
            number: 7,
            color: "BLUE",
          },
          { tileId: "rack-joker-a", kind: "JOKER" },
        ],
      },
    },
  };

  const validated = validatePlatformSnapshotV2(input);
  assert.equal(validated.ok, true);
  if (!validated.ok || !isNumberTilePlayingSnapshot(validated.value)) {
    throw new Error("Expected a valid Number Tile PLAYING snapshot fixture.");
  }
  return validated.value;
}

function requireDraft(
  draft: NumberTileTurnDraft | null,
): NumberTileTurnDraft {
  assert.notEqual(draft, null);
  if (draft === null) {
    throw new Error("Expected an editable Number Tile draft.");
  }
  return draft;
}

function requireEdit(
  result: NumberTileTurnDraftEditResult,
): NumberTileTurnDraft {
  if (!result.ok) {
    throw new Error(`Expected edit success, received ${result.error.code}.`);
  }
  return result.draft;
}

function expectEditError(
  result: NumberTileTurnDraftEditResult,
  code: NumberTileTurnDraftEditErrorCode,
): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected an edit failure.");
  }
  assert.equal(result.error.code, code);
}

function fixtureTileId(draft: NumberTileTurnDraft, value: string): TileId {
  const rackTile = draft.rackTiles.find((tile) => tile.tileId === value);
  if (rackTile !== undefined) {
    return rackTile.tileId;
  }
  const tableTileId = draft.canonicalTableTileIds.find(
    (tileId) => tileId === value,
  );
  if (tableTileId !== undefined) {
    return tableTileId;
  }
  throw new Error(`Unknown fixture Tile ${value}.`);
}

function tileOccurrences(draft: NumberTileTurnDraft, tileId: TileId): number {
  return draft.availableRackTiles.filter((tile) => tile.tileId === tileId)
    .length +
    draft.table.melds.reduce(
      (total, meld) =>
        total + meld.tiles.filter((tile) => tile.tileId === tileId).length,
      0,
    );
}

test("Number TurnDraft는 canonical identity와 complete Table/rack을 detached 상태로 보존한다", () => {
  const authoritative = snapshot();
  const draft = requireDraft(createNumberTileTurnDraft(authoritative));

  assert.equal(draft.baseGameId, authoritative.game.gameId);
  assert.equal(draft.baseGameRevision, authoritative.game.gameRevision);
  assert.equal(draft.baseTurnId, authoritative.game.turn.turnId);
  assert.equal(draft.mode, "REARRANGEMENT");
  assert.deepEqual(
    draft.table.melds[0]?.tiles.map((tile) => tile.tileId),
    authoritative.game.table.melds[0]?.tiles.map((tile) => tile.tileId),
  );
  assert.notEqual(draft.table, authoritative.game.table);
  assert.notEqual(draft.availableRackTiles, authoritative.game.privateState.rack);
  assert.equal(isNumberTileTurnDraftDirty(draft), false);

  assert.equal(
    createNumberTileTurnDraft(snapshot({ selfIsActive: false })),
    null,
  );
  assert.equal(createNumberTileTurnDraft(authoritative, false), null);
  assert.equal(
    requireDraft(
      createNumberTileTurnDraft(snapshot({ initialMeldCompleted: false })),
    ).mode,
    "INITIAL_MELD",
  );
});

test("초기 duplicate tileId 입력은 거절하고 모든 edit는 한 physical identity를 move한다", () => {
  const authoritative = snapshot();
  const firstRackTile = authoritative.game.privateState.rack[0];
  const secondRackTile = authoritative.game.privateState.rack[1];
  const joker = authoritative.game.privateState.rack[2];
  assert.ok(firstRackTile && secondRackTile && joker);
  const duplicateSnapshot: NumberTilePlayingPlatformSnapshotV2 = {
    ...authoritative,
    game: {
      ...authoritative.game,
      privateState: {
        rack: [
          firstRackTile,
          { ...secondRackTile, tileId: firstRackTile.tileId },
          joker,
        ],
      },
    },
  };
  assert.equal(createNumberTileTurnDraft(duplicateSnapshot), null);

  let draft = requireDraft(createNumberTileTurnDraft(authoritative));
  draft = requireEdit(addNumberTileDraftMeld(draft, "GROUP"));
  const rackTileId = fixtureTileId(draft, "rack-red-7-a");
  draft = requireEdit(
    placeNumberTileDraftTile(draft, rackTileId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  assert.equal(tileOccurrences(draft, rackTileId), 1);

  draft = requireEdit(
    placeNumberTileDraftTile(draft, rackTileId, {
      meldIndex: 0,
      tileIndex: 1,
    }),
  );
  assert.equal(tileOccurrences(draft, rackTileId), 1);
  assert.equal(draft.availableRackTiles.some((tile) => tile.tileId === rackTileId), false);
});

test("GROUP/RUN을 empty 상태로 만들 수 있고 오직 empty meld만 삭제한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft, "GROUP"));
  draft = requireEdit(addNumberTileDraftMeld(draft, "RUN"));
  assert.deepEqual(
    draft.table.melds.slice(1).map((meld) => [meld.kind, meld.tiles.length]),
    [["GROUP", 0], ["RUN", 0]],
  );

  const rackTileId = fixtureTileId(draft, "rack-red-7-a");
  draft = requireEdit(
    placeNumberTileDraftTile(draft, rackTileId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  assert.equal(draft.table.melds[1]?.tiles.length, 1);
  expectEditError(
    removeEmptyNumberTileDraftMeld(draft, 1),
    "MELD_NOT_EMPTY",
  );
  draft = requireEdit(removeEmptyNumberTileDraftMeld(draft, 2));
  assert.equal(draft.table.melds.length, 2);
});

test("Table Tile은 meld 사이를 이동하지만 pre-turn Table Tile은 rack으로 갈 수 없다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft, "RUN"));
  const canonicalTileId = fixtureTileId(draft, "table-red-3-a");
  draft = requireEdit(
    placeNumberTileDraftTile(draft, canonicalTileId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  assert.equal(tileOccurrences(draft, canonicalTileId), 1);
  assert.equal(draft.table.melds[0]?.tiles.length, 2);
  assert.equal(draft.table.melds[1]?.tiles[0]?.origin, "CANONICAL_TABLE");
  expectEditError(
    returnNumberTileDraftTileToRack(draft, canonicalTileId),
    "CANONICAL_TILE_CANNOT_RETURN_TO_RACK",
  );
});

test("initial meld draft는 canonical Table을 수정하지 않고 local meld만 편집한다", () => {
  let draft = requireDraft(
    createNumberTileTurnDraft(snapshot({ initialMeldCompleted: false })),
  );
  draft = requireEdit(addNumberTileDraftMeld(draft, "GROUP"));
  const canonicalTileId = fixtureTileId(draft, "table-red-3-a");
  const rackTileId = fixtureTileId(draft, "rack-red-7-a");
  expectEditError(
    placeNumberTileDraftTile(draft, canonicalTileId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
    "INITIAL_MELD_TABLE_LOCKED",
  );
  expectEditError(
    placeNumberTileDraftTile(draft, rackTileId, {
      meldIndex: 0,
      tileIndex: 1,
    }),
    "INITIAL_MELD_TABLE_LOCKED",
  );
  assert.equal(
    requireEdit(
      placeNumberTileDraftTile(draft, rackTileId, {
        meldIndex: 1,
        tileIndex: 0,
      }),
    ).table.melds[1]?.tiles.length,
    1,
  );
});

test("rack-origin Tile만 원래 rack 순서로 돌아갈 수 있다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft, "GROUP"));
  const red = fixtureTileId(draft, "rack-red-7-a");
  const blue = fixtureTileId(draft, "rack-blue-7-a");
  draft = requireEdit(
    placeNumberTileDraftTile(draft, red, { meldIndex: 1, tileIndex: 0 }),
  );
  draft = requireEdit(
    placeNumberTileDraftTile(draft, blue, { meldIndex: 1, tileIndex: 1 }),
  );
  draft = requireEdit(returnNumberTileDraftTileToRack(draft, red));

  assert.deepEqual(
    draft.availableRackTiles.map((tile) => tile.tileId),
    [red, fixtureTileId(draft, "rack-joker-a")],
  );
  assert.equal(tileOccurrences(draft, red), 1);
  assert.equal(tileOccurrences(draft, blue), 1);
});

test("Joker는 unassigned 임시 상태를 거쳐 assignment와 reassignment를 지원한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft, "GROUP"));
  const jokerId = fixtureTileId(draft, "rack-joker-a");
  draft = requireEdit(
    placeNumberTileDraftTile(draft, jokerId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  let located = findNumberTileDraftTile(draft, jokerId);
  assert.equal(located?.source, "TABLE");
  assert.equal(located?.tile.kind, "JOKER");
  if (located?.source !== "TABLE" || located.tile.kind !== "JOKER") {
    throw new Error("Expected a placed Joker.");
  }
  assert.equal(located.tile.assignment, null);

  draft = requireEdit(
    assignNumberTileDraftJoker(draft, jokerId, {
      number: 7,
      color: "RED",
    }),
  );
  draft = requireEdit(
    assignNumberTileDraftJoker(draft, jokerId, {
      number: 9,
      color: "BLUE",
    }),
  );
  located = findNumberTileDraftTile(draft, jokerId);
  if (located?.source !== "TABLE" || located.tile.kind !== "JOKER") {
    throw new Error("Expected a reassigned Joker.");
  }
  assert.deepEqual(located.tile.assignment, { number: 9, color: "BLUE" });

  expectEditError(
    assignNumberTileDraftJoker(
      draft,
      fixtureTileId(draft, "rack-red-7-a"),
      { number: 7, color: "RED" },
    ),
    "TILE_NOT_JOKER",
  );
});

test("canonical Joker reassignment은 rearrangement에서만 허용한다", () => {
  const rearrangement = requireDraft(
    createNumberTileTurnDraft(snapshot({ canonicalJoker: true })),
  );
  const jokerId = fixtureTileId(rearrangement, "table-joker-a");
  const changed = requireEdit(
    assignNumberTileDraftJoker(rearrangement, jokerId, {
      number: 8,
      color: "BLUE",
    }),
  );
  const located = findNumberTileDraftTile(changed, jokerId);
  if (located?.source !== "TABLE" || located.tile.kind !== "JOKER") {
    throw new Error("Expected a canonical Joker.");
  }
  assert.deepEqual(located.tile.assignment, { number: 8, color: "BLUE" });

  const initial = requireDraft(
    createNumberTileTurnDraft(
      snapshot({ canonicalJoker: true, initialMeldCompleted: false }),
    ),
  );
  expectEditError(
    assignNumberTileDraftJoker(initial, fixtureTileId(initial, "table-joker-a"), {
      number: 8,
      color: "BLUE",
    }),
    "INITIAL_MELD_TABLE_LOCKED",
  );
});

test("undo/reset/dirty는 local history만 변경하고 baseline을 복원한다", () => {
  const baseline = requireDraft(createNumberTileTurnDraft(snapshot()));
  const changed = requireEdit(addNumberTileDraftMeld(baseline, "GROUP"));
  assert.equal(isNumberTileTurnDraftDirty(changed), true);

  const undone = requireEdit(undoNumberTileTurnDraft(changed));
  assert.deepEqual(undone.table, baseline.table);
  assert.equal(isNumberTileTurnDraftDirty(undone), false);
  expectEditError(undoNumberTileTurnDraft(undone), "NO_UNDO_HISTORY");

  const changedAgain = requireEdit(addNumberTileDraftMeld(undone, "RUN"));
  const reset = resetNumberTileTurnDraft(changedAgain);
  assert.deepEqual(reset.table, baseline.table);
  assert.deepEqual(reset.availableRackTiles, baseline.availableRackTiles);
  assert.equal(reset.history.length, 0);
  assert.equal(isNumberTileTurnDraftDirty(reset), false);
});

test("edit history는 최근 50개 상태만 유지한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  for (let index = 0; index < 55; index += 1) {
    draft = requireEdit(
      addNumberTileDraftMeld(draft, index % 2 === 0 ? "GROUP" : "RUN"),
    );
  }
  assert.equal(
    draft.history.length,
    NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT,
  );
  const undone = requireEdit(undoNumberTileTurnDraft(draft));
  assert.equal(undone.table.melds.length, draft.table.melds.length - 1);
  assert.equal(
    undone.history.length,
    NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT - 1,
  );
});

test("같은 canonical game/revision/turn identity만 draft를 유지한다", () => {
  const authoritative = snapshot();
  const draft = requireDraft(createNumberTileTurnDraft(authoritative));
  assert.equal(
    decideNumberTileTurnDraftReconciliation(draft, authoritative),
    "KEEP_DRAFT",
  );
  assert.equal(
    canEditNumberTileTurnDraft(draft, authoritative, true),
    true,
  );
  assert.equal(
    canEditNumberTileTurnDraft(draft, authoritative, false),
    false,
  );
  assert.equal(
    decideNumberTileTurnDraftReconciliation(
      draft,
      snapshot({ presenceVersion: 9 }),
    ),
    "KEEP_DRAFT",
  );
  assert.equal(
    decideNumberTileTurnDraftReconciliation(
      draft,
      snapshot({ gameRevision: 4 }),
    ),
    "RESET_DRAFT",
  );
  assert.equal(
    decideNumberTileTurnDraftReconciliation(
      draft,
      snapshot({ turnId: "number-draft-next-turn" }),
    ),
    "RESET_DRAFT",
  );
  assert.equal(
    decideNumberTileTurnDraftReconciliation(
      draft,
      snapshot({ gameId: "number-draft-other-game" }),
    ),
    "RESET_DRAFT",
  );
  assert.equal(
    decideNumberTileTurnDraftReconciliation(
      draft,
      snapshot({ selfIsActive: false }),
    ),
    "RESET_DRAFT",
  );
});
