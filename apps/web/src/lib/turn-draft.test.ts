import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validatePlayingStateSnapshot,
  type PlayingStateSnapshot,
  type TileId,
} from "@hangul-rummikub/shared";

import {
  TURN_DRAFT_HISTORY_LIMIT,
  addDraftSyllable,
  addDraftWordGroup,
  changeDraftTileAssignedSymbol,
  createTurnDraft,
  decideTurnDraftReconciliation,
  findDraftTile,
  getAssignableSymbols,
  getDraftTileAtSlot,
  isTurnDraftDirty,
  moveDraftTile,
  placeDraftTile,
  removeEmptyDraftSyllable,
  removeEmptyDraftWordGroup,
  resetTurnDraft,
  returnDraftTileToRack,
  undoTurnDraft,
  type DraftSlotTarget,
  type DraftPlacedTile,
  type TurnDraft,
  type TurnDraftEditErrorCode,
  type TurnDraftEditResult,
} from "./turn-draft.js";

const JOKER_SYMBOLS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅛ",
  "ㅜ",
  "ㅠ",
  "ㅡ",
  "ㅣ",
] as const;

type SnapshotOptions = Readonly<{
  selfIsActive?: boolean;
  initialMeldCompleted?: boolean;
  gameRevision?: number;
  gameId?: string;
  turnId?: string;
  presenceVersion?: number;
}>;

function snapshot(options: SnapshotOptions = {}): PlayingStateSnapshot {
  const rack = [
    {
      tileId: "rack_giyeok",
      kind: "ORDINARY",
      physicalType: "GIYEOK_NIEUN_ROTATION",
      sourceBag: "CONSONANT",
      allowedSymbols: ["ㄱ", "ㄴ"],
    },
    {
      tileId: "rack_a_one",
      kind: "ORDINARY",
      physicalType: "A_ROTATION",
      sourceBag: "VOWEL",
      allowedSymbols: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
    },
    {
      tileId: "rack_siot",
      kind: "ORDINARY",
      physicalType: "SIOT",
      sourceBag: "CONSONANT",
      allowedSymbols: ["ㅅ"],
    },
    {
      tileId: "rack_i",
      kind: "ORDINARY",
      physicalType: "I_EU_ROTATION",
      sourceBag: "VOWEL",
      allowedSymbols: ["ㅣ", "ㅡ"],
    },
    {
      tileId: "rack_hieuh",
      kind: "ORDINARY",
      physicalType: "HIEUH",
      sourceBag: "CONSONANT",
      allowedSymbols: ["ㅎ"],
    },
    {
      tileId: "rack_a_two",
      kind: "ORDINARY",
      physicalType: "A_ROTATION",
      sourceBag: "VOWEL",
      allowedSymbols: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
    },
    {
      tileId: "rack_giyeok_two",
      kind: "ORDINARY",
      physicalType: "GIYEOK_NIEUN_ROTATION",
      sourceBag: "CONSONANT",
      allowedSymbols: ["ㄱ", "ㄴ"],
    },
    {
      tileId: "rack_joker",
      kind: "JOKER",
      physicalType: "JOKER",
      sourceBag: "VOWEL",
      allowedSymbols: [...JOKER_SYMBOLS],
    },
  ] as const;
  const result = validatePlayingStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 4,
      gameRevision: options.gameRevision ?? 0,
      presenceVersion: options.presenceVersion ?? 2,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_turn_draft",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player_self",
          nickname: "나",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: rack.length,
          initialMeldCompleted: options.initialMeldCompleted ?? false,
        },
        {
          playerId: "player_other",
          nickname: "상대",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 14,
          initialMeldCompleted: true,
        },
      ],
    },
    game: {
      gameId: options.gameId ?? "game_turn_draft",
      board: {
        wordGroups: [
          {
            groupId: "canonical_group",
            syllables: [
              {
                choseong: [
                  {
                    tileId: "board_giyeok",
                    kind: "ORDINARY",
                    physicalType: "GIYEOK_NIEUN_ROTATION",
                    assignedSymbol: "ㄱ",
                    allowedSymbols: ["ㄱ", "ㄴ"],
                  },
                ],
                jungseong: [
                  {
                    tileId: "board_a",
                    kind: "ORDINARY",
                    physicalType: "A_ROTATION",
                    assignedSymbol: "ㅏ",
                    allowedSymbols: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
                  },
                ],
                jongseong: [],
              },
              {
                choseong: [
                  {
                    tileId: "board_nieun",
                    kind: "ORDINARY",
                    physicalType: "GIYEOK_NIEUN_ROTATION",
                    assignedSymbol: "ㄴ",
                    allowedSymbols: ["ㄱ", "ㄴ"],
                  },
                ],
                jungseong: [
                  {
                    tileId: "board_joker",
                    kind: "JOKER",
                    physicalType: "JOKER",
                    assignedSymbol: "ㅏ",
                    allowedSymbols: [...JOKER_SYMBOLS],
                  },
                ],
                jongseong: [],
              },
            ],
          },
        ],
      },
      turnOrder: ["player_self", "player_other"],
      turn: {
        turnId: options.turnId ?? "turn_one",
        turnNumber: 1,
        activePlayerId:
          options.selfIsActive === false ? "player_other" : "player_self",
        startedAt: 1_750_000_000_000,
        deadlineAt: 1_750_000_060_000,
      },
      bagCounts: { consonant: 81, vowel: 47 },
    },
    self: { playerId: "player_self", rack },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("TurnDraft snapshot fixture must be valid.");
  }
  return result.value;
}

function requireDraft(value: TurnDraft | null): TurnDraft {
  assert.notEqual(value, null);
  if (value === null) {
    throw new Error("Expected an editable TurnDraft.");
  }
  return value;
}

function requireEdit(result: TurnDraftEditResult): TurnDraft {
  if (!result.ok) {
    throw new Error(`Expected successful edit, received ${result.error.code}.`);
  }
  assert.equal(result.ok, true);
  return result.draft;
}

function expectEditError(
  result: TurnDraftEditResult,
  code: TurnDraftEditErrorCode,
): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected TurnDraft edit failure.");
  }
  assert.equal(result.error.code, code);
}

function fixtureTileId(draft: TurnDraft, value: string): TileId {
  const rackTile = draft.rackTiles.find((tile) => tile.tileId === value);
  if (rackTile !== undefined) {
    return rackTile.tileId;
  }

  const canonicalTileId = draft.canonicalBoardTileIds.find(
    (tileId) => tileId === value,
  );
  if (canonicalTileId !== undefined) {
    return canonicalTileId;
  }

  throw new Error(`Unknown fixture Tile: ${value}`);
}

function requireBoardTile(draft: TurnDraft, value: string): DraftPlacedTile {
  const located = findDraftTile(draft, fixtureTileId(draft, value));
  if (located === null || located.source !== "BOARD") {
    throw new Error(`Expected ${value} to be placed on the draft Board.`);
  }
  return located.tile;
}

function target(
  groupId: string,
  syllableIndex: number,
  role: DraftSlotTarget["role"],
  componentIndex: 0 | 1 = 0,
): DraftSlotTarget {
  return { groupId, syllableIndex, role, componentIndex };
}

function addEmptyWord(draft: TurnDraft, groupId = "local_group"): TurnDraft {
  return requireEdit(
    addDraftSyllable(requireEdit(addDraftWordGroup(draft, groupId)), groupId),
  );
}

function countPlacedTiles(draft: TurnDraft): number {
  let count = 0;
  for (const group of draft.wordGroups) {
    for (const syllable of group.syllables) {
      count += syllable.choseong === null ? 0 : 1;
      count += syllable.jungseong.filter((tile) => tile !== null).length;
      count += syllable.jongseong.filter((tile) => tile !== null).length;
    }
  }
  return count;
}

test("active Player만 mode에 맞는 detached TurnDraft를 생성한다", () => {
  const initialSnapshot = snapshot();
  const initial = requireDraft(createTurnDraft(initialSnapshot));
  const rearrangement = requireDraft(
    createTurnDraft(snapshot({ initialMeldCompleted: true })),
  );

  assert.equal(initial.mode, "INITIAL_MELD");
  assert.equal(rearrangement.mode, "REARRANGEMENT");
  assert.equal(initial.baseGameId, initialSnapshot.game.gameId);
  assert.equal(initial.baseGameRevision, 0);
  assert.equal(initial.baseTurnId, initialSnapshot.game.turn.turnId);
  assert.equal(initial.wordGroups[0]?.origin, "CANONICAL_BOARD");
  assert.equal(initial.availableRackTiles.length, 8);
  assert.equal(createTurnDraft(snapshot({ selfIsActive: false })), null);
  assert.equal(createTurnDraft(initialSnapshot, false), null);

  const firstRackTile = initialSnapshot.self.rack[0];
  const firstBoardTile =
    initialSnapshot.game.board.wordGroups[0]?.syllables[0]?.choseong[0];
  assert.ok(firstRackTile);
  assert.ok(firstBoardTile);
  assert.equal(
    createTurnDraft({
      ...initialSnapshot,
      self: {
        ...initialSnapshot.self,
        rack: [
          { ...firstRackTile, tileId: firstBoardTile.tileId },
          ...initialSnapshot.self.rack.slice(1),
        ],
      },
    }),
    null,
  );

  const edited = addEmptyWord(initial);
  assert.equal(initialSnapshot.game.board.wordGroups.length, 1);
  assert.equal(initialSnapshot.self.rack.length, 8);
  assert.equal(edited.wordGroups.length, 2);
});

test("WordGroup과 empty syllable을 immutable하게 추가·삭제한다", () => {
  const base = requireDraft(createTurnDraft(snapshot()));
  const withGroup = requireEdit(addDraftWordGroup(base, "new_group"));
  const withSyllable = requireEdit(addDraftSyllable(withGroup, "new_group"));

  assert.equal(base.wordGroups.length, 1);
  assert.equal(withGroup.wordGroups.length, 2);
  assert.equal(withSyllable.wordGroups[1]?.syllables.length, 1);
  expectEditError(
    addDraftWordGroup(withSyllable, "new_group"),
    "DUPLICATE_GROUP_ID",
  );

  const withoutSyllable = requireEdit(
    removeEmptyDraftSyllable(withSyllable, "new_group", 0),
  );
  const withoutGroup = requireEdit(
    removeEmptyDraftWordGroup(withoutSyllable, "new_group"),
  );
  assert.equal(withoutGroup.wordGroups.length, 1);
});

test("rack Tile을 초성·중성·종성 및 compound/final-cluster 두 slot에 배치한다", () => {
  let draft = addEmptyWord(requireDraft(createTurnDraft(snapshot())));
  const placements = [
    ["rack_hieuh", "ㅎ", target("local_group", 0, "choseong")],
    ["rack_a_one", "ㅗ", target("local_group", 0, "jungseong", 0)],
    ["rack_a_two", "ㅏ", target("local_group", 0, "jungseong", 1)],
    ["rack_giyeok", "ㄱ", target("local_group", 0, "jongseong", 0)],
    ["rack_siot", "ㅅ", target("local_group", 0, "jongseong", 1)],
  ] as const;

  for (const [tileIdValue, assignedSymbol, slot] of placements) {
    draft = requireEdit(
      placeDraftTile(
        draft,
        fixtureTileId(draft, tileIdValue),
        assignedSymbol,
        slot,
      ),
    );
  }

  assert.equal(
    getDraftTileAtSlot(
      draft,
      target("local_group", 0, "jungseong", 0),
    )?.assignedSymbol,
    "ㅗ",
  );
  assert.equal(
    getDraftTileAtSlot(
      draft,
      target("local_group", 0, "jungseong", 1),
    )?.assignedSymbol,
    "ㅏ",
  );
  assert.equal(
    getDraftTileAtSlot(
      draft,
      target("local_group", 0, "jongseong", 0),
    )?.assignedSymbol,
    "ㄱ",
  );
  assert.equal(
    getDraftTileAtSlot(
      draft,
      target("local_group", 0, "jongseong", 1),
    )?.assignedSymbol,
    "ㅅ",
  );
  assert.equal(draft.availableRackTiles.length, 3);
});

test("동일 tileId 배치는 copy가 아니라 move이고 occupied slot은 Tile 유실 없이 거절한다", () => {
  const empty = addEmptyWord(requireDraft(createTurnDraft(snapshot())));
  const placed = requireEdit(
    placeDraftTile(
      empty,
      fixtureTileId(empty, "rack_giyeok"),
      "ㄱ",
      target("local_group", 0, "choseong"),
    ),
  );
  const moved = requireEdit(
    moveDraftTile(
      placed,
      fixtureTileId(placed, "rack_giyeok"),
      "ㄴ",
      target("local_group", 0, "jongseong"),
    ),
  );

  assert.equal(
    getDraftTileAtSlot(
      moved,
      target("local_group", 0, "choseong"),
    ),
    null,
  );
  assert.equal(
    getDraftTileAtSlot(
      moved,
      target("local_group", 0, "jongseong"),
    )?.assignedSymbol,
    "ㄴ",
  );
  assert.equal(
    countPlacedTiles(moved),
    countPlacedTiles(empty) + 1,
  );

  const rejected = placeDraftTile(
    moved,
    fixtureTileId(moved, "rack_hieuh"),
    "ㅎ",
    target("local_group", 0, "jongseong"),
  );
  expectEditError(rejected, "SLOT_OCCUPIED");
  assert.notEqual(
    findDraftTile(moved, fixtureTileId(moved, "rack_hieuh"))?.source,
    "BOARD",
  );
});

test("rack-origin Tile만 rack으로 되돌리고 canonical-origin Tile은 Board 안에서만 이동한다", () => {
  let draft = addEmptyWord(
    requireDraft(createTurnDraft(snapshot({ initialMeldCompleted: true }))),
  );
  draft = requireEdit(
    placeDraftTile(
      draft,
      fixtureTileId(draft, "rack_giyeok"),
      "ㄱ",
      target("local_group", 0, "choseong"),
    ),
  );
  const returned = requireEdit(
    returnDraftTileToRack(draft, fixtureTileId(draft, "rack_giyeok")),
  );
  assert.equal(
    findDraftTile(returned, fixtureTileId(returned, "rack_giyeok"))?.source,
    "AVAILABLE_RACK",
  );

  const movedCanonical = requireEdit(
    moveDraftTile(
      returned,
      fixtureTileId(returned, "board_giyeok"),
      "ㄴ",
      target("local_group", 0, "choseong"),
    ),
  );
  assert.equal(
    findDraftTile(
      movedCanonical,
      fixtureTileId(movedCanonical, "board_giyeok"),
    )?.source,
    "BOARD",
  );
  expectEditError(
    returnDraftTileToRack(
      movedCanonical,
      fixtureTileId(movedCanonical, "board_giyeok"),
    ),
    "CANONICAL_TILE_CANNOT_RETURN_TO_RACK",
  );
});

test("initial meld UX는 canonical group 편집을 막고 local group rack 배치는 허용한다", () => {
  const base = requireDraft(createTurnDraft(snapshot()));
  expectEditError(
    addDraftSyllable(base, "canonical_group"),
    "INITIAL_MELD_BOARD_LOCKED",
  );
  expectEditError(
    changeDraftTileAssignedSymbol(
      base,
      fixtureTileId(base, "board_giyeok"),
      "ㄴ",
    ),
    "INITIAL_MELD_BOARD_LOCKED",
  );
  expectEditError(
    moveDraftTile(
      base,
      fixtureTileId(base, "board_giyeok"),
      "ㄴ",
      target("canonical_group", 1, "jongseong"),
    ),
    "INITIAL_MELD_BOARD_LOCKED",
  );

  const editable = addEmptyWord(base);
  assert.equal(
    placeDraftTile(
      editable,
      fixtureTileId(editable, "rack_giyeok"),
      "ㄱ",
      target("local_group", 0, "choseong"),
    ).ok,
    true,
  );
});

test("normal turn은 existing Board Tile 이동과 rotation/Joker assignedSymbol 변경을 지원한다", () => {
  let draft = addEmptyWord(
    requireDraft(createTurnDraft(snapshot({ initialMeldCompleted: true }))),
  );
  draft = requireEdit(
    moveDraftTile(
      draft,
      fixtureTileId(draft, "board_giyeok"),
      "ㄴ",
      target("local_group", 0, "choseong"),
    ),
  );
  assert.equal(
    findDraftTile(draft, fixtureTileId(draft, "board_giyeok"))?.source,
    "BOARD",
  );

  draft = requireEdit(
    changeDraftTileAssignedSymbol(
      draft,
      fixtureTileId(draft, "board_a"),
      "ㅗ",
    ),
  );
  draft = requireEdit(
    changeDraftTileAssignedSymbol(
      draft,
      fixtureTileId(draft, "board_joker"),
      "ㄱ",
    ),
  );
  assert.equal(
    requireBoardTile(draft, "board_a").assignedSymbol,
    "ㅗ",
  );
  const joker = requireBoardTile(draft, "board_joker");
  assert.equal(joker.assignedSymbol, "ㄱ");
  assert.deepEqual(getAssignableSymbols(joker), JOKER_SYMBOLS);
  expectEditError(
    changeDraftTileAssignedSymbol(
      draft,
      fixtureTileId(draft, "board_a"),
      "ㅣ",
    ),
    "INVALID_ASSIGNED_SYMBOL",
  );
  expectEditError(
    changeDraftTileAssignedSymbol(
      draft,
      fixtureTileId(draft, "board_joker"),
      "ㅘ",
    ),
    "INVALID_ASSIGNED_SYMBOL",
  );
});

test("Undo는 placement/move/symbol change를 되돌리고 Reset은 authoritative baseline으로 복귀한다", () => {
  const base = addEmptyWord(requireDraft(createTurnDraft(snapshot())));
  const placed = requireEdit(
    placeDraftTile(
      base,
      fixtureTileId(base, "rack_giyeok"),
      "ㄱ",
      target("local_group", 0, "choseong"),
    ),
  );
  const changed = requireEdit(
    changeDraftTileAssignedSymbol(
      placed,
      fixtureTileId(placed, "rack_giyeok"),
      "ㄴ",
    ),
  );
  const undone = requireEdit(undoTurnDraft(changed));

  assert.equal(
    requireBoardTile(undone, "rack_giyeok").assignedSymbol,
    "ㄱ",
  );
  assert.equal(isTurnDraftDirty(undone), true);

  const reset = resetTurnDraft(undone);
  assert.equal(reset.wordGroups.length, 1);
  assert.equal(reset.availableRackTiles.length, 8);
  assert.equal(reset.history.length, 0);
  assert.equal(isTurnDraftDirty(reset), false);
  expectEditError(undoTurnDraft(reset), "NO_UNDO_HISTORY");
});

test("Undo history는 최근 50단계로 제한된다", () => {
  let draft = requireDraft(createTurnDraft(snapshot()));
  for (let index = 0; index < TURN_DRAFT_HISTORY_LIMIT + 5; index += 1) {
    draft = requireEdit(addDraftWordGroup(draft, `local-${index}`));
  }

  assert.equal(draft.history.length, TURN_DRAFT_HISTORY_LIMIT);
  assert.equal(requireEdit(undoTurnDraft(draft)).wordGroups.length, 55);
});

test("same revision/turn과 presence-only snapshot은 유지하고 canonical identity 변경은 reset한다", () => {
  const draft = requireDraft(createTurnDraft(snapshot()));

  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot()),
    "KEEP_DRAFT",
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot({ presenceVersion: 3 })),
    "KEEP_DRAFT",
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot({ gameRevision: 1 })),
    "RESET_DRAFT",
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot({ turnId: "turn_two" })),
    "RESET_DRAFT",
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot({ gameId: "game_other" })),
    "RESET_DRAFT",
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, snapshot({ selfIsActive: false })),
    "RESET_DRAFT",
  );
});

test("편집은 authoritative snapshot과 이전 draft를 mutate하지 않고 deterministic하다", () => {
  const authoritative = snapshot({ initialMeldCompleted: true });
  const authoritativeBefore = structuredClone(authoritative);
  const firstBase = addEmptyWord(requireDraft(createTurnDraft(authoritative)));
  const secondBase = addEmptyWord(requireDraft(createTurnDraft(authoritative)));
  const firstBefore = structuredClone(firstBase);
  const operation = (
    draft: TurnDraft,
  ) =>
    placeDraftTile(
      draft,
      fixtureTileId(draft, "rack_giyeok"),
      "ㄱ",
      target("local_group", 0, "choseong"),
    );
  const first = operation(firstBase);
  const second = operation(secondBase);

  assert.deepEqual(first, second);
  assert.deepEqual(firstBase, firstBefore);
  assert.deepEqual(authoritative, authoritativeBefore);
});

test("TurnDraft는 browser memory 데이터만 가지며 gameplay/network/storage command를 생성하지 않는다", () => {
  const draft = requireDraft(createTurnDraft(snapshot()));
  const keys = JSON.stringify(draft);

  assert.doesNotMatch(keys, /sessionToken|requestId|socket|turn:submit|turn:draw|turn:pass/u);
  assert.equal("emit" in draft, false);
  assert.equal("storage" in draft, false);
});
