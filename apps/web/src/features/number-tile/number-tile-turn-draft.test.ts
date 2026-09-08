import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  validatePlatformSnapshotV2,
  type NumberTilePlayingPlatformSnapshotV2,
  type PlatformSnapshotV2,
  type TileId,
} from "@hangul-rummikub/shared";

import {
  NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT,
  addNumberTileDraftMeld,
  appendNumberTileDraftTileToMeld,
  canEditNumberTileTurnDraft,
  chooseNumberTileDraftJokerNumber,
  createNumberTileTurnDraft,
  decideNumberTileTurnDraftReconciliation,
  findNumberTileDraftReusableEmptyMeldIndex,
  findNumberTileDraftTile,
  isNumberTileTurnDraftDirty,
  placeNumberTileDraftTile,
  placeNumberTileDraftTileInNewMeld,
  removeEmptyNumberTileDraftMeld,
  resetNumberTileTurnDraft,
  returnNumberTileDraftTileToRack,
  undoNumberTileTurnDraft,
  type NumberTileTurnDraft,
  type NumberTileTurnDraftEditErrorCode,
  type NumberTileTurnDraftEditResult,
} from "./number-tile-turn-draft.js";
import { serializeNumberTileTurnDraft } from "../../lib/number-tile-actions.js";
import { classifyNumberTileDraftMeld, numberTileInitialMeldValueHint } from "./number-tile-ux.js";
import { NumberTileTurnDraftEditor } from "./NumberTileTurnDraftEditor.js";
import type { NumberTileTurnDraftController } from "./use-number-tile-turn-draft.js";

type SnapshotOptions = Readonly<{
  selfIsActive?: boolean;
  initialMeldCompleted?: boolean;
  gameId?: string;
  gameRevision?: number;
  turnId?: string;
  presenceVersion?: number;
  canonicalJoker?: boolean;
  emptyTable?: boolean;
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
      remainingPoolCount: options.emptyTable === true ? 100 : 97,
      table: {
        melds: options.emptyTable === true
          ? []
          : [{ kind: "RUN", tiles: tableTiles }],
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
  draft = requireEdit(addNumberTileDraftMeld(draft));
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
  assert.equal(draft.table.melds.length, 1);
  assert.equal(tileOccurrences(draft, rackTileId), 1);
  assert.equal(draft.availableRackTiles.some((tile) => tile.tileId === rackTileId), false);
});

test("empty 조합은 하나만 재사용하고 tile이 있는 조합과 구분해 삭제한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft));
  const oneEmptyMeld = draft;
  draft = requireEdit(addNumberTileDraftMeld(draft));
  assert.equal(draft, oneEmptyMeld);
  assert.equal(findNumberTileDraftReusableEmptyMeldIndex(draft), 1);
  assert.deepEqual(
    draft.table.melds.slice(1).map((meld) => [meld.kind, meld.tiles.length]),
    [[null, 0]],
  );

  const rackTileId = fixtureTileId(draft, "rack-red-7-a");
  draft = requireEdit(placeNumberTileDraftTileInNewMeld(draft, rackTileId));
  assert.equal(draft.table.melds[1]?.tiles.length, 1);
  assert.equal(findNumberTileDraftReusableEmptyMeldIndex(draft), null);
  expectEditError(
    removeEmptyNumberTileDraftMeld(draft, 1),
    "MELD_NOT_EMPTY",
  );
  draft = requireEdit(addNumberTileDraftMeld(draft));
  assert.equal(findNumberTileDraftReusableEmptyMeldIndex(draft), 2);
  draft = requireEdit(removeEmptyNumberTileDraftMeld(draft, 2));
  assert.equal(draft.table.melds.length, 2);
});

test("첫 rack click용 edit는 조합 생성과 physical Tile 이동을 Undo 한 번에 commit한다", () => {
  const baseline = requireDraft(
    createNumberTileTurnDraft(snapshot({
      initialMeldCompleted: false,
      emptyTable: true,
    })),
  );
  const red = fixtureTileId(baseline, "rack-red-7-a");
  const placed = requireEdit(placeNumberTileDraftTileInNewMeld(baseline, red));

  assert.equal(baseline.table.melds.length, 0);
  assert.equal(placed.table.melds.length, 1);
  assert.deepEqual(
    placed.table.melds.at(-1)?.tiles.map((tile) => tile.tileId),
    [red],
  );
  assert.equal(placed.history.length, 1);
  assert.equal(tileOccurrences(placed, red), 1);

  const undone = requireEdit(undoNumberTileTurnDraft(placed));
  assert.deepEqual(undone.table, baseline.table);
  assert.deepEqual(undone.availableRackTiles, baseline.availableRackTiles);
});

test("whole-card append는 조합 간 Tile을 이동하고 비워진 source 조합을 정리한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  const red = fixtureTileId(draft, "rack-red-7-a");
  const blue = fixtureTileId(draft, "rack-blue-7-a");

  draft = requireEdit(placeNumberTileDraftTileInNewMeld(draft, red));
  draft = requireEdit(addNumberTileDraftMeld(draft));
  draft = requireEdit(placeNumberTileDraftTileInNewMeld(draft, blue));
  const beforeMove = draft;
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, red, 2));

  assert.equal(draft.table.melds.length, 2);
  assert.deepEqual(
    draft.table.melds[1]?.tiles.map((tile) => tile.tileId),
    [blue, red],
  );
  assert.equal(tileOccurrences(draft, red), 1);
  assert.equal(tileOccurrences(draft, blue), 1);

  const undone = requireEdit(undoNumberTileTurnDraft(draft));
  assert.deepEqual(undone.table, beforeMove.table);
});

test("canonical source 조합도 마지막 Tile 이동 시 제거하고 target index를 보존한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft));
  const canonicalTileIds = [
    fixtureTileId(draft, "table-red-3-a"),
    fixtureTileId(draft, "table-red-4-a"),
    fixtureTileId(draft, "table-red-5-a"),
  ];
  draft = requireEdit(
    appendNumberTileDraftTileToMeld(draft, canonicalTileIds[0]!, 1),
  );
  draft = requireEdit(
    appendNumberTileDraftTileToMeld(draft, canonicalTileIds[1]!, 1),
  );
  const beforeLastMove = draft;
  draft = requireEdit(
    appendNumberTileDraftTileToMeld(draft, canonicalTileIds[2]!, 1),
  );

  assert.equal(draft.table.melds.length, 1);
  assert.deepEqual(
    draft.table.melds[0]?.tiles.map((tile) => tile.tileId),
    canonicalTileIds,
  );
  for (const tileId of canonicalTileIds) {
    assert.equal(tileOccurrences(draft, tileId), 1);
  }
  assert.deepEqual(
    requireEdit(undoNumberTileTurnDraft(draft)).table,
    beforeLastMove.table,
  );
});

test("rack-origin Tile 반환은 빈 조합을 정리하고 canonical Table Tile 반환은 atomic reject한다", () => {
  const baseline = requireDraft(createNumberTileTurnDraft(snapshot()));
  const red = fixtureTileId(baseline, "rack-red-7-a");
  const placed = requireEdit(placeNumberTileDraftTileInNewMeld(baseline, red));
  const returned = requireEdit(returnNumberTileDraftTileToRack(placed, red));
  assert.equal(returned.table.melds.length, baseline.table.melds.length);
  assert.deepEqual(returned.availableRackTiles, baseline.availableRackTiles);
  assert.deepEqual(
    requireEdit(undoNumberTileTurnDraft(returned)).table,
    placed.table,
  );

  const canonical = fixtureTileId(returned, "table-red-3-a");
  const beforeRejectedReturn = structuredClone(returned);
  expectEditError(
    returnNumberTileDraftTileToRack(returned, canonical),
    "CANONICAL_TILE_CANNOT_RETURN_TO_RACK",
  );
  assert.deepEqual(returned, beforeRejectedReturn);
});

test("새 조합 이동은 rearrangement Table Tile을 허용하지만 initial canonical Table은 잠근다", () => {
  const rearrangement = requireDraft(createNumberTileTurnDraft(snapshot()));
  const canonical = fixtureTileId(rearrangement, "table-red-3-a");
  const beforeInvalidEdits = structuredClone(rearrangement);
  expectEditError(
    placeNumberTileDraftTileInNewMeld(
      rearrangement,
      "unknown-number-tile" as TileId,
    ),
    "TILE_NOT_FOUND",
  );
  expectEditError(
    appendNumberTileDraftTileToMeld(rearrangement, canonical, 999),
    "MELD_NOT_FOUND",
  );
  assert.deepEqual(rearrangement, beforeInvalidEdits);

  const moved = requireEdit(
    placeNumberTileDraftTileInNewMeld(rearrangement, canonical),
  );
  assert.equal(tileOccurrences(moved, canonical), 1);
  assert.equal(moved.table.melds.at(-1)?.tiles[0]?.tileId, canonical);

  const initial = requireDraft(
    createNumberTileTurnDraft(snapshot({ initialMeldCompleted: false })),
  );
  const beforeLockedEdit = structuredClone(initial);
  expectEditError(
    placeNumberTileDraftTileInNewMeld(initial, canonical),
    "INITIAL_MELD_TABLE_LOCKED",
  );
  assert.deepEqual(initial, beforeLockedEdit);
});

test("rack face만으로 local 조합 kind를 자동 분류하고 Undo/Reset은 같은 physical identity를 복원한다", () => {
  const authoritative = snapshot({ initialMeldCompleted: false });
  const blackSeven = {
    tileId: "rack-black-7-a" as TileId,
    kind: "ORDINARY" as const,
    number: 7 as const,
    color: "BLACK" as const,
  };
  const threeColors: NumberTilePlayingPlatformSnapshotV2 = {
    ...authoritative,
    game: {
      ...authoritative.game,
      privateState: {
        rack: [
          authoritative.game.privateState.rack[0]!,
          authoritative.game.privateState.rack[1]!,
          blackSeven,
        ],
      },
    },
  };
  const baseline = requireDraft(createNumberTileTurnDraft(threeColors));
  let draft = requireEdit(addNumberTileDraftMeld(baseline));
  const ids = ["rack-black-7-a", "rack-red-7-a", "rack-blue-7-a"];
  for (const [index, value] of ids.entries()) {
    draft = requireEdit(placeNumberTileDraftTile(
      draft,
      fixtureTileId(draft, value),
      { meldIndex: 1, tileIndex: index },
    ));
  }
  assert.equal(draft.table.melds[1]?.kind, "GROUP");
  assert.deepEqual(
    draft.table.melds[1]?.tiles.map((tile) => tile.tileId),
    ["rack-red-7-a", "rack-blue-7-a", "rack-black-7-a"],
  );
  for (const value of ids) {
    assert.equal(tileOccurrences(draft, fixtureTileId(draft, value)), 1);
  }

  const undone = requireEdit(undoNumberTileTurnDraft(draft));
  assert.equal(undone.table.melds[1]?.kind, null);
  assert.equal(undone.table.melds[1]?.tiles.length, 2);
  const reset = resetNumberTileTurnDraft(draft);
  assert.deepEqual(reset.table, baseline.table);
  assert.deepEqual(reset.availableRackTiles, baseline.availableRackTiles);
});

test("untouched canonical meld order는 empty 조합 add/remove와 same-position move로 바뀌거나 dirty가 되지 않는다", () => {
  const authoritative = snapshot();
  const orange = {
    tileId: "table-orange-7-a" as TileId,
    kind: "ORDINARY" as const,
    number: 7 as const,
    color: "ORANGE" as const,
  };
  const red = {
    ...orange,
    tileId: "table-red-7-b" as TileId,
    color: "RED" as const,
  };
  const blue = {
    ...orange,
    tileId: "table-blue-7-b" as TileId,
    color: "BLUE" as const,
  };
  const nonCanonicalDisplayOrder: NumberTilePlayingPlatformSnapshotV2 = {
    ...authoritative,
    game: {
      ...authoritative.game,
      table: {
        melds: [{ kind: "GROUP", tiles: [orange, red, blue] }],
      },
    },
  };
  const baseline = requireDraft(createNumberTileTurnDraft(nonCanonicalDisplayOrder));
  let draft = requireEdit(addNumberTileDraftMeld(baseline));
  draft = requireEdit(removeEmptyNumberTileDraftMeld(draft, 1));
  assert.deepEqual(draft.table, baseline.table);
  assert.equal(isNumberTileTurnDraftDirty(draft), false);

  const firstTileId = fixtureTileId(draft, "table-orange-7-a");
  const samePosition = requireEdit(placeNumberTileDraftTile(
    draft,
    firstTileId,
    { meldIndex: 0, tileIndex: 0 },
  ));
  assert.equal(samePosition, draft);
  assert.equal(isNumberTileTurnDraftDirty(samePosition), false);
});

test("Table Tile은 meld 사이를 이동하지만 pre-turn Table Tile은 rack으로 갈 수 없다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft));
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
  const beforeRejectedReturn = structuredClone(draft);
  expectEditError(
    returnNumberTileDraftTileToRack(draft, canonicalTileId),
    "CANONICAL_TILE_CANNOT_RETURN_TO_RACK",
  );
  assert.deepEqual(draft, beforeRejectedReturn);
});

test("initial meld draft는 canonical Table을 수정하지 않고 local meld만 편집한다", () => {
  let draft = requireDraft(
    createNumberTileTurnDraft(snapshot({ initialMeldCompleted: false })),
  );
  draft = requireEdit(addNumberTileDraftMeld(draft));
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
  draft = requireEdit(addNumberTileDraftMeld(draft));
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

test("Joker는 physical identity만 유지한 채 local 조합 사이를 이동한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  draft = requireEdit(addNumberTileDraftMeld(draft));
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
  assert.deepEqual(located.tile, {
    tileId: jokerId,
    kind: "JOKER",
    origin: "SELF_RACK",
  });
  draft = requireEdit(addNumberTileDraftMeld(draft));
  draft = requireEdit(
    appendNumberTileDraftTileToMeld(draft, jokerId, 2),
  );
  assert.equal(findNumberTileDraftTile(draft, jokerId)?.source, "TABLE");
  assert.equal(tileOccurrences(draft, jokerId), 1);
});

test("direct click/drop append fixes O7/J/O9 + O6 in one Undo and serializes bare physical identities", () => {
  const source = snapshot({ emptyTable: true, initialMeldCompleted: false });
  source.game.privateState.rack = [
    { tileId: "o7" as TileId, kind: "ORDINARY", number: 7, color: "ORANGE" },
    { tileId: "j8" as TileId, kind: "JOKER" },
    { tileId: "o9" as TileId, kind: "ORDINARY", number: 9, color: "ORANGE" },
    { tileId: "o6" as TileId, kind: "ORDINARY", number: 6, color: "ORANGE" },
  ];
  source.game.playerStates[0]!.rackCount = 4;
  source.game.remainingPoolCount = 99;
  const baseline = requireDraft(createNumberTileTurnDraft(source));
  let draft = requireEdit(placeNumberTileDraftTileInNewMeld(baseline, "o7" as TileId));
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, "j8" as TileId, 0));
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, "o9" as TileId, 0));
  const previous = draft;
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, "o6" as TileId, 0));
  assert.equal(draft.history.length, previous.history.length + 1);
  assert.deepEqual(draft.table.melds[0]?.tiles.map(tile => tile.tileId), ["o6", "o7", "j8", "o9"]);
  assert.equal(numberTileInitialMeldValueHint(draft.table.melds), 30);
  assert.deepEqual(serializeNumberTileTurnDraft(draft), { melds: [{ kind: "RUN", tiles: [
    { tileId: "o6", kind: "ORDINARY" }, { tileId: "o7", kind: "ORDINARY" }, { tileId: "j8", kind: "JOKER" }, { tileId: "o9", kind: "ORDINARY" },
  ] }] });
  assert.deepEqual(requireEdit(undoNumberTileTurnDraft(draft)).table, previous.table);
  assert.deepEqual(resetNumberTileTurnDraft(draft).availableRackTiles, baseline.availableRackTiles);
  assert.equal(tileOccurrences(draft, "j8" as TileId), 1);
});

function ambiguousRunFixture() {
  const source = snapshot({ emptyTable: true, initialMeldCompleted: false });
  source.game.privateState.rack = [
    { tileId: "r6" as TileId, kind: "ORDINARY", number: 6, color: "RED" },
    { tileId: "numeric-joker" as TileId, kind: "JOKER" },
    { tileId: "r5" as TileId, kind: "ORDINARY", number: 5, color: "RED" },
  ];
  const baseline = requireDraft(createNumberTileTurnDraft(source));
  let draft = requireEdit(placeNumberTileDraftTileInNewMeld(baseline, "r6" as TileId));
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, "numeric-joker" as TileId, 0));
  draft = requireEdit(appendNumberTileDraftTileToMeld(draft, "r5" as TileId, 0));
  return { source, baseline, draft };
}

test("genuine RUN numeric choice reorders only current physical placements as one Undo and rejects stale choices", () => {
  const { baseline, draft } = ambiguousRunFixture();
  assert.equal(classifyNumberTileDraftMeld(draft.table.melds[0]!).status, "AMBIGUOUS");
  assert.equal(serializeNumberTileTurnDraft(draft), null);
  const lower = requireEdit(chooseNumberTileDraftJokerNumber(draft, 0, 4));
  const upper = requireEdit(chooseNumberTileDraftJokerNumber(draft, 0, 7));
  assert.equal(lower.history.length, draft.history.length + 1);
  assert.deepEqual(lower.table.melds[0]?.tiles.map(tile => tile.tileId), ["numeric-joker", "r5", "r6"]);
  assert.deepEqual(upper.table.melds[0]?.tiles.map(tile => tile.tileId), ["r5", "r6", "numeric-joker"]);
  assert.equal(numberTileInitialMeldValueHint(lower.table.melds), 15);
  assert.equal(numberTileInitialMeldValueHint(upper.table.melds), 18);
  assert.deepEqual(requireEdit(undoNumberTileTurnDraft(lower)).table, draft.table);
  assert.deepEqual(resetNumberTileTurnDraft(lower).table, baseline.table);
  assert.deepEqual(serializeNumberTileTurnDraft(lower)?.melds[0]?.tiles[0], { tileId: "numeric-joker", kind: "JOKER" });
  expectEditError(chooseNumberTileDraftJokerNumber(draft, 0, 8), "INVALID_TARGET");
  expectEditError(chooseNumberTileDraftJokerNumber(lower, 0, 7), "INVALID_TARGET");
  assert.equal(tileOccurrences(lower, "numeric-joker" as TileId), 1);
});

test("Number editor shows only genuine numeric buttons, no color picker; choice hides after resolution", () => {
  const { source, draft } = ambiguousRunFixture();
  const controller = (value: NumberTileTurnDraft): NumberTileTurnDraftController => ({
    draft: value, canEdit: true, isDirty: true, noticeMessage: null, editErrorMessage: null,
    addMeld() {}, removeEmptyMeld() {}, placeTile() {}, appendTileToMeld() {}, placeTileInNewMeld() {}, returnTileToRack() {}, chooseJokerNumber() {}, undo() {}, reset() {}, clearFeedback() {},
  });
  const render = (value: NumberTileTurnDraft) => renderToStaticMarkup(createElement(NumberTileTurnDraftEditor, {
    snapshot: source, controller: controller(value), submitPending: false, actionPending: false, commandRetryKind: null, canSubmit: true, canAct: true,
    onSubmit() {}, onDraw() {}, onPass() {},
  }));
  const html = render(draft);
  assert.match(html, /조커 숫자 4, 조합 합계 15점/);
  assert.match(html, /조커 숫자 7, 조합 합계 18점/);
  assert.match(html, /disabled=""[^>]*>조합 제출/);
  assert.doesNotMatch(html, /<select|assignedColor|assignedNumber|색상 선택<\/button>/);
  const resolved = render(requireEdit(chooseNumberTileDraftJokerNumber(draft, 0, 4)));
  assert.doesNotMatch(resolved, /aria-label="조합 1 조커 숫자 선택"/);
  assert.match(resolved, /✓ 연속 숫자 조합/);
});

test("canonical Joker는 valid whole-draft RUN role을 바꿔도 stale role 없이 serialize된다", () => {
  let rearrangement = requireDraft(
    createNumberTileTurnDraft(snapshot({ canonicalJoker: true })),
  );
  const jokerId = fixtureTileId(rearrangement, "table-joker-a");
  const blueEightId = fixtureTileId(rearrangement, "rack-red-7-a");
  const blueTenId = fixtureTileId(rearrangement, "rack-blue-7-a");
  const rackJokerId = fixtureTileId(rearrangement, "rack-joker-a");
  const remapRackFace = (
    tile: NumberTileTurnDraft["rackTiles"][number],
  ): NumberTileTurnDraft["rackTiles"][number] => {
    if (tile.tileId === blueEightId) {
      return { ...tile, kind: "ORDINARY", number: 8, color: "BLUE" };
    }
    if (tile.tileId === blueTenId) {
      return { ...tile, kind: "ORDINARY", number: 10, color: "BLUE" };
    }
    return tile;
  };
  rearrangement = {
    ...rearrangement,
    rackTiles: rearrangement.rackTiles.map(remapRackFace),
    availableRackTiles: rearrangement.availableRackTiles.map(remapRackFace),
  };
  rearrangement = requireEdit(addNumberTileDraftMeld(rearrangement));
  rearrangement = requireEdit(
    placeNumberTileDraftTile(rearrangement, jokerId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  rearrangement = requireEdit(
    placeNumberTileDraftTile(rearrangement, rackJokerId, {
      meldIndex: 0,
      tileIndex: 1,
    }),
  );
  rearrangement = requireEdit(
    placeNumberTileDraftTile(rearrangement, blueEightId, {
      meldIndex: 1,
      tileIndex: 0,
    }),
  );
  rearrangement = requireEdit(
    placeNumberTileDraftTile(rearrangement, blueTenId, {
      meldIndex: 1,
      tileIndex: 2,
    }),
  );
  const located = findNumberTileDraftTile(rearrangement, jokerId);
  if (located?.source !== "TABLE" || located.tile.kind !== "JOKER") {
    throw new Error("Expected a canonical Joker.");
  }
  assert.deepEqual(located.tile, {
    tileId: jokerId,
    kind: "JOKER",
    origin: "CANONICAL_TABLE",
  });
  assert.equal(tileOccurrences(rearrangement, jokerId), 1);
  assert.deepEqual(serializeNumberTileTurnDraft(rearrangement), {
    melds: [
      {
        kind: "RUN",
        tiles: [
          { tileId: "table-red-3-a", kind: "ORDINARY" },
          { tileId: "rack-joker-a", kind: "JOKER" },
          { tileId: "table-red-5-a", kind: "ORDINARY" },
        ],
      },
      {
        kind: "RUN",
        tiles: [
          { tileId: "rack-red-7-a", kind: "ORDINARY" },
          { tileId: "table-joker-a", kind: "JOKER" },
          { tileId: "rack-blue-7-a", kind: "ORDINARY" },
        ],
      },
    ],
  });

  const initial = requireDraft(
    createNumberTileTurnDraft(
      snapshot({ canonicalJoker: true, initialMeldCompleted: false }),
    ),
  );
  expectEditError(
    placeNumberTileDraftTile(initial, fixtureTileId(initial, "table-joker-a"), {
      meldIndex: 0,
      tileIndex: 0,
    }),
    "INITIAL_MELD_TABLE_LOCKED",
  );
});

test("undo/reset/dirty는 local history만 변경하고 baseline을 복원한다", () => {
  const baseline = requireDraft(createNumberTileTurnDraft(snapshot()));
  const changed = requireEdit(addNumberTileDraftMeld(baseline));
  assert.equal(isNumberTileTurnDraftDirty(changed), true);

  const undone = requireEdit(undoNumberTileTurnDraft(changed));
  assert.deepEqual(undone.table, baseline.table);
  assert.equal(isNumberTileTurnDraftDirty(undone), false);
  expectEditError(undoNumberTileTurnDraft(undone), "NO_UNDO_HISTORY");

  const changedAgain = requireEdit(addNumberTileDraftMeld(undone));
  const reset = resetNumberTileTurnDraft(changedAgain);
  assert.deepEqual(reset.table, baseline.table);
  assert.deepEqual(reset.availableRackTiles, baseline.availableRackTiles);
  assert.equal(reset.history.length, 0);
  assert.equal(isNumberTileTurnDraftDirty(reset), false);
});

test("edit history는 최근 50개 상태만 유지한다", () => {
  let draft = requireDraft(createNumberTileTurnDraft(snapshot()));
  const red = fixtureTileId(draft, "rack-red-7-a");
  for (let index = 0; index < 55; index += 1) {
    draft = index % 2 === 0
      ? requireEdit(placeNumberTileDraftTileInNewMeld(draft, red))
      : requireEdit(returnNumberTileDraftTileToRack(draft, red));
  }
  assert.equal(
    draft.history.length,
    NUMBER_TILE_TURN_DRAFT_HISTORY_LIMIT,
  );
  const undone = requireEdit(undoNumberTileTurnDraft(draft));
  assert.equal(findNumberTileDraftTile(undone, red)?.source, "AVAILABLE_RACK");
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
