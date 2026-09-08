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
  numberTileInitialMeldValueHint,
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

test("RUN의 Joker 역할은 ordered position에서 유도되고 placement에는 저장되지 않는다", () => {
  const normalized = normalizeNumberTileDraftMeld(meld([
    ordinary("red-4", 4, "RED"),
    joker(),
    ordinary("red-6", 6, "RED"),
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
  assert.deepEqual(placedJoker, {
    tileId: "joker",
    kind: "JOKER",
    origin: "SELF_RACK",
  });
  const classification = classifyNumberTileDraftMeld(normalized);
  assert.deepEqual(
    classification.status === "VALID"
      ? classification.interpretation.jokerRole
      : null,
    { number: 5, color: "RED" },
  );
});

test("production regression: O7 / J / O9 에 O6를 append해도 유일 RUN O6 / O7 / J / O9로 정렬된다", () => {
  const result = normalizeNumberTileDraftMeld(meld([
    ordinary("orange-7", 7, "ORANGE"), joker("orange-joker"),
    ordinary("orange-9", 9, "ORANGE"), ordinary("orange-6", 6, "ORANGE"),
  ]));
  assert.equal(result.kind, "RUN");
  assert.deepEqual(result.tiles.map(tile => tile.tileId), ["orange-6", "orange-7", "orange-joker", "orange-9"]);
  assert.equal(numberTileInitialMeldValueHint([result]), 30);
  assert.deepEqual(result.tiles.find(tile => tile.kind === "JOKER"), joker("orange-joker"));
});

test("unique Joker RUN은 모든 입력 permutation에서 같은 physical order와 derived number로 정규화된다", () => {
  const tiles = [ordinary("o6", 6, "ORANGE"), ordinary("o7", 7, "ORANGE"), joker("j8"), ordinary("o9", 9, "ORANGE")];
  function permutations(values: readonly NumberTileDraftPlacement[]): readonly NumberTileDraftPlacement[][] {
    return values.length === 0 ? [[]] : values.flatMap((tile, index) =>
      permutations(values.filter((_, other) => index !== other)).map(rest => [tile, ...rest]),
    );
  }
  for (const input of permutations(tiles)) {
    const before = JSON.stringify(input);
    const normalized = normalizeNumberTileDraftMeld(meld(input));
    assert.equal(normalized.kind, "RUN");
    assert.deepEqual(normalized.tiles.map(tile => tile.tileId), ["o6", "o7", "j8", "o9"]);
    const classification = classifyNumberTileDraftMeld(normalized);
    assert.deepEqual(classification.status === "VALID" ? classification.interpretation.jokerRole : null, { number: 8, color: "ORANGE" });
    assert.equal(JSON.stringify(input), before);
  }
});

test("unordered R6 / J / R5는 숫자4/7 선택 전 ambiguous이고 기존 valid edge order는 의도를 유지한다", () => {
  const input = meld([ordinary("r6", 6, "RED"), joker(), ordinary("r5", 5, "RED")]);
  const classification = classifyNumberTileDraftMeld(input);
  assert.equal(classification.status, "AMBIGUOUS");
  if (classification.status !== "AMBIGUOUS") throw new Error("Expected numeric ambiguity.");
  assert.deepEqual(classification.candidates.map(candidate => candidate.jokerNumber), [4, 7]);
  assert.deepEqual(classification.candidates.map(candidate => candidate.value), [15, 18]);
  const normalized = normalizeNumberTileDraftMeld(input);
  assert.equal(normalized.kind, null);
  assert.deepEqual(normalized.tiles, input.tiles);
  for (const [tiles, expected] of [
    [[joker(), ordinary("r5", 5, "RED"), ordinary("r6", 6, "RED")], 4],
    [[ordinary("r5", 5, "RED"), ordinary("r6", 6, "RED"), joker()], 7],
  ] as const) {
    const result = classifyNumberTileDraftMeld(meld(tiles));
    assert.equal(result.status, "VALID");
    assert.equal(result.status === "VALID" ? result.interpretation.jokerRole?.number : null, expected);
  }
});

test("GROUP Joker는 colorless wildcard로 즉시 분류되고 ordinary 확장에도 재배정이 없다", () => {
  const threeTiles = meld([
    ordinary("red-9", 9, "RED"),
    ordinary("blue-9", 9, "BLUE"),
    joker(),
  ]);
  const classification = classifyNumberTileDraftMeld(threeTiles);
  assert.equal(classification.status, "VALID");
  assert.deepEqual(
    classification.status === "VALID"
      ? classification.interpretation
      : null,
    { kind: "GROUP", jokerRole: { number: 9, color: null } },
  );
  const expanded = normalizeNumberTileDraftMeld(meld([
    ...threeTiles.tiles,
    ordinary("black-9", 9, "BLACK"),
  ]));
  assert.equal(expanded.kind, "GROUP");
  assert.deepEqual(expanded.tiles.map((tile) => tile.tileId), [
    "red-9",
    "blue-9",
    "black-9",
    "joker",
  ]);
});

test("RUN edge Joker는 위치로 반대 역할을 구분하고 invalid gap은 거절한다", () => {
  const leading = classifyNumberTileDraftMeld(meld([
    joker("leading"),
    ordinary("red-5-a", 5, "RED"),
    ordinary("red-6-a", 6, "RED"),
  ]));
  const trailing = classifyNumberTileDraftMeld(meld([
    ordinary("red-5-b", 5, "RED"),
    ordinary("red-6-b", 6, "RED"),
    joker("trailing"),
  ]));
  assert.deepEqual(
    leading.status === "VALID" ? leading.interpretation.jokerRole : null,
    { number: 4, color: "RED" },
  );
  assert.deepEqual(
    trailing.status === "VALID" ? trailing.interpretation.jokerRole : null,
    { number: 7, color: "RED" },
  );
  assert.deepEqual(
    classifyNumberTileDraftMeld(meld([
      ordinary("red-4-gap", 4, "RED"),
      joker("gap"),
      ordinary("red-7-gap", 7, "RED"),
    ])),
    { status: "INVALID" },
  );
});

test("initial meld 표시 점수도 colorless GROUP과 ordered RUN Joker number를 사용한다", () => {
  assert.equal(
    numberTileInitialMeldValueHint([
      meld([
        ordinary("group-red-10", 10, "RED"),
        ordinary("group-blue-10", 10, "BLUE"),
        joker("group-joker"),
      ]),
    ]),
    30,
  );
  assert.equal(
    numberTileInitialMeldValueHint([
      meld([
        ordinary("run-red-10", 10, "RED"),
        ordinary("run-red-11", 11, "RED"),
        joker("run-joker"),
      ]),
    ]),
    33,
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

test("색상 marker를 보완하는 accessible tile label은 ordinary와 neutral Joker를 구분한다", () => {
  assert.equal(numberTilePlacementLabel(ordinary("red-7", 7, "RED")), "빨강 7");
  assert.equal(numberTilePlacementLabel(joker()), "조커");
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
