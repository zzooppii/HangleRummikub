import assert from "node:assert/strict";
import test from "node:test";

import type {
  PlayerId,
  RequestId,
  RoomId,
  TileId,
  TurnId,
} from "@hangul-rummikub/shared";

import {
  classifyNumberTileDraftMeld,
  normalizeNumberTileDraftMeld,
  numberTilePlacementLabel,
  sortNumberTileRackTiles,
} from "../features/number-tile/number-tile-ux.js";
import type {
  NumberTileDraftJokerPlacement,
  NumberTileDraftMeld,
  NumberTileDraftPlacement,
} from "../features/number-tile/number-tile-turn-draft.js";
import {
  formatNumberTileCountdown,
  markNumberTileActionFeedback,
  numberTileActionSoundCue,
  numberTileTurnSoundStorageKey,
  shouldAnnounceNumberTileTurn,
} from "../features/number-tile/number-tile-sound.js";

function ordinary(
  tileId: string,
  number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13,
  color: "RED" | "BLUE" | "BLACK" | "ORANGE",
): NumberTileDraftPlacement {
  return {
    tileId: tileId as TileId,
    kind: "ORDINARY",
    number,
    color,
    origin: "SELF_RACK",
  };
}

function joker(tileId = "joker"): NumberTileDraftJokerPlacement {
  return {
    tileId: tileId as TileId,
    kind: "JOKER",
    assignment: null,
    assignmentSource: null,
    origin: "SELF_RACK",
  };
}

function meld(tiles: readonly NumberTileDraftPlacement[]): NumberTileDraftMeld {
  return { kind: null, origin: "LOCAL", tiles };
}

test("same-number 조합은 GROUP으로, unordered consecutive 조합은 RUN으로 자동 분류한다", () => {
  const group = classifyNumberTileDraftMeld(meld([
    ordinary("red-7", 7, "RED"),
    ordinary("blue-7", 7, "BLUE"),
    ordinary("black-7", 7, "BLACK"),
  ]));
  assert.equal(group.status, "VALID");
  assert.equal(group.status === "VALID" && group.interpretation.kind, "GROUP");

  const run = normalizeNumberTileDraftMeld(meld([
    ordinary("red-6", 6, "RED"),
    ordinary("red-4", 4, "RED"),
    ordinary("red-5", 5, "RED"),
  ]));
  assert.equal(run.kind, "RUN");
  assert.deepEqual(run.tiles.map((tile) => tile.tileId), [
    "red-4",
    "red-5",
    "red-6",
  ]);
});

test("두 타일은 incomplete이고 규칙에 맞지 않는 세 타일은 invalid다", () => {
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      ordinary("red-3", 3, "RED"),
      ordinary("blue-4", 4, "BLUE"),
    ])),
    { status: "INCOMPLETE" },
  );
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      ordinary("red-3", 3, "RED"),
      ordinary("blue-4", 4, "BLUE"),
      ordinary("black-7", 7, "BLACK"),
    ])),
    { status: "INVALID" },
  );
});

test("RUN의 유일한 Joker 해석은 자동 지정하고 readable number order로 정리한다", () => {
  const normalized = normalizeNumberTileDraftMeld(meld([
    ordinary("red-6", 6, "RED"),
    joker(),
    ordinary("red-4", 4, "RED"),
  ]));
  assert.equal(normalized.kind, "RUN");
  assert.deepEqual(normalized.tiles.map((tile) => tile.tileId), [
    "red-4",
    "joker",
    "red-6",
  ]);
  const placedJoker = normalized.tiles[1];
  assert.equal(placedJoker?.kind, "JOKER");
  if (placedJoker?.kind !== "JOKER") {
    throw new Error("Expected the inferred Joker in the middle of the RUN.");
  }
  assert.deepEqual(placedJoker.assignment, { number: 5, color: "RED" });
  assert.equal(placedJoker.assignmentSource, "INFERRED");
});

test("same-number Joker 해석이 여러 개면 자동 선택하지 않고 후보를 모두 보존한다", () => {
  const classification = classifyNumberTileDraftMeld(meld([
    ordinary("red-9", 9, "RED"),
    ordinary("blue-9", 9, "BLUE"),
    joker(),
  ]));
  assert.equal(classification.status, "AMBIGUOUS_JOKER");
  if (classification.status !== "AMBIGUOUS_JOKER") {
    throw new Error("Expected ambiguous Joker candidates.");
  }
  assert.deepEqual(
    classification.interpretations.map((candidate) => candidate.jokerAssignment),
    [
      { number: 9, color: "BLACK" },
      { number: 9, color: "ORANGE" },
    ],
  );
  const normalized = normalizeNumberTileDraftMeld(meld([
    ordinary("red-9", 9, "RED"),
    ordinary("blue-9", 9, "BLUE"),
    joker(),
  ]));
  assert.equal(normalized.kind, null);
  assert.equal(normalized.tiles[2]?.kind === "JOKER" && normalized.tiles[2].assignment, null);
});

test("stale Joker assignment는 unique face로 재추론하고 ambiguous이면 picker 상태로 되돌린다", () => {
  const staleUnique = normalizeNumberTileDraftMeld(meld([
    ordinary("red-4", 4, "RED"),
    {
      ...joker(),
      assignment: { number: 10, color: "BLUE" },
      assignmentSource: "CANONICAL",
    },
    ordinary("red-6", 6, "RED"),
  ]));
  assert.equal(staleUnique.kind, "RUN");
  const inferred = staleUnique.tiles[1];
  assert.equal(inferred?.kind, "JOKER");
  if (inferred?.kind !== "JOKER") {
    throw new Error("Expected a re-inferred Joker.");
  }
  assert.deepEqual(inferred.assignment, { number: 5, color: "RED" });
  assert.equal(inferred.assignmentSource, "INFERRED");

  const staleAmbiguous = normalizeNumberTileDraftMeld(meld([
    ordinary("red-9", 9, "RED"),
    ordinary("blue-9", 9, "BLUE"),
    {
      ...joker("stale-joker"),
      assignment: { number: 8, color: "RED" },
      assignmentSource: "USER",
    },
  ]));
  assert.equal(staleAmbiguous.kind, null);
  const unresolved = staleAmbiguous.tiles[2];
  assert.equal(unresolved?.kind, "JOKER");
  assert.equal(
    unresolved?.kind === "JOKER" && unresolved.assignment,
    null,
  );
});

test("duplicate identity, multiple Joker, and 13→1 wraparound은 valid meld로 분류하지 않는다", () => {
  const duplicate = ordinary("duplicate", 7, "RED");
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      duplicate,
      duplicate,
      ordinary("blue-7", 7, "BLUE"),
    ])),
    { status: "INVALID" },
  );
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      joker("joker-a"),
      joker("joker-b"),
      ordinary("red-7", 7, "RED"),
    ])),
    { status: "INVALID" },
  );
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      ordinary("red-12", 12, "RED"),
      ordinary("red-13", 13, "RED"),
      ordinary("red-1", 1, "RED"),
    ])),
    { status: "INVALID" },
  );
});

test("rack 정렬은 view-only이며 기본/숫자/색상 순서와 Joker-last를 보장한다", () => {
  const tiles = [
    { tileId: "joker-a" as TileId, kind: "JOKER" as const },
    { tileId: "blue-7-a" as TileId, kind: "ORDINARY" as const, number: 7 as const, color: "BLUE" as const },
    { tileId: "red-12-a" as TileId, kind: "ORDINARY" as const, number: 12 as const, color: "RED" as const },
    { tileId: "red-7-a" as TileId, kind: "ORDINARY" as const, number: 7 as const, color: "RED" as const },
    { tileId: "red-7-b" as TileId, kind: "ORDINARY" as const, number: 7 as const, color: "RED" as const },
    { tileId: "black-2-a" as TileId, kind: "ORDINARY" as const, number: 2 as const, color: "BLACK" as const },
  ];
  const originalIds = tiles.map((tile) => tile.tileId);

  assert.deepEqual(
    sortNumberTileRackTiles(tiles, "DEFAULT").map((tile) => tile.tileId),
    originalIds,
  );
  assert.deepEqual(
    sortNumberTileRackTiles(tiles, "NUMBER").map((tile) => tile.tileId),
    ["black-2-a", "red-7-a", "red-7-b", "blue-7-a", "red-12-a", "joker-a"],
  );
  assert.deepEqual(
    sortNumberTileRackTiles(tiles, "COLOR").map((tile) => tile.tileId),
    ["red-7-a", "red-7-b", "red-12-a", "blue-7-a", "black-2-a", "joker-a"],
  );
  assert.deepEqual(tiles.map((tile) => tile.tileId), originalIds);
  assert.equal(new Set(sortNumberTileRackTiles(tiles, "COLOR").map((tile) => tile.tileId)).size, tiles.length);
});

test("색상 marker를 보완하는 accessible tile label은 ordinary와 assigned Joker를 구분한다", () => {
  assert.equal(numberTilePlacementLabel(ordinary("red-7", 7, "RED")), "빨강 7");
  assert.equal(numberTilePlacementLabel(joker()), "조커");
  assert.equal(
    numberTilePlacementLabel({
      tileId: "assigned-joker" as TileId,
      kind: "JOKER",
      assignment: { number: 10, color: "RED" },
      assignmentSource: "USER",
      origin: "SELF_RACK",
    }),
    "조커, 빨강 10으로 사용 중",
  );
});

test("turn sound는 새 self turnId에만 한 번이고 same-turn/reconnect/presence에는 반복하지 않는다", () => {
  const self = "self" as PlayerId;
  const other = "other" as PlayerId;
  const first = "turn-1" as TurnId;
  const future = "turn-2" as TurnId;
  assert.equal(shouldAnnounceNumberTileTurn(null, first, other, self), false);
  assert.equal(shouldAnnounceNumberTileTurn(null, first, self, self), true);
  assert.equal(shouldAnnounceNumberTileTurn(first, first, self, self), false);
  assert.equal(shouldAnnounceNumberTileTurn(first, future, self, self), true);
  assert.equal(shouldAnnounceNumberTileTurn(future, future, self, self), false);
  assert.equal(
    numberTileTurnSoundStorageKey("room" as RoomId, self),
    "hangul-rummikub:number-tile-turn-sound:room:self",
  );
});

test("accepted action feedback는 requestId별 exact-once이고 replay는 중복되지 않는다", () => {
  const seen = new Set<RequestId>();
  const submit = "submit" as RequestId;
  const draw = "draw" as RequestId;
  const pass = "pass" as RequestId;
  assert.equal(markNumberTileActionFeedback(seen, submit), true);
  assert.equal(markNumberTileActionFeedback(seen, submit), false);
  assert.equal(markNumberTileActionFeedback(seen, draw), true);
  assert.equal(markNumberTileActionFeedback(seen, draw), false);
  assert.equal(markNumberTileActionFeedback(seen, pass), true);
  assert.equal(markNumberTileActionFeedback(seen, pass), false);
  assert.equal(seen.size, 3);
  assert.equal(numberTileActionSoundCue("SUBMIT"), "SUBMIT_SUCCESS");
  assert.equal(numberTileActionSoundCue("DRAW"), "DRAW_SUCCESS");
  assert.equal(numberTileActionSoundCue("PASS"), "PASS_SUCCESS");
});

test("countdown은 large display용 mm:ss 문자열로 안정적으로 표시된다", () => {
  assert.equal(formatNumberTileCountdown(90), "01:30");
  assert.equal(formatNumberTileCountdown(39), "00:39");
  assert.equal(formatNumberTileCountdown(0), "00:00");
  assert.equal(formatNumberTileCountdown(-2), "00:00");
});
