import assert from "node:assert/strict";
import test from "node:test";

import { TileIdSchema, type TileId } from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { normalizeNumberTileMeld, validateNumberTileMeld } from "./games/number-tile/domain/rule-engine.js";
import type {
  NumberTileJokerPlacement,
  NumberTileMeld,
  NumberTileOrdinaryPlacement,
} from "./games/number-tile/domain/table.js";
import type {
  NumberTile,
  NumberTileColor,
  NumberTileNumber,
} from "./games/number-tile/domain/tile.js";

class MeldFixture {
  readonly tilesById = new Map<TileId, NumberTile>();
  #sequence = 0;

  ordinary(
    color: NumberTileColor,
    number: NumberTileNumber,
  ): NumberTileOrdinaryPlacement {
    const tileId = parse(
      TileIdSchema,
      `number-meld-${this.#sequence += 1}`,
    );
    this.tilesById.set(
      tileId,
      Object.freeze({ tileId, kind: "ORDINARY", color, number }),
    );
    return Object.freeze({ tileId, kind: "ORDINARY" });
  }

  joker(): NumberTileJokerPlacement {
    const tileId = parse(
      TileIdSchema,
      `number-meld-${this.#sequence += 1}`,
    );
    this.tilesById.set(tileId, Object.freeze({ tileId, kind: "JOKER" }));
    return Object.freeze({
      tileId,
      kind: "JOKER",
    });
  }
}

function assertValid(
  meld: NumberTileMeld,
  fixture: MeldFixture,
  expectedValue?: number,
): void {
  const result = validateNumberTileMeld(meld, fixture.tilesById);
  assert.equal(result.ok, true);
  if (result.ok && expectedValue !== undefined) {
    assert.equal(result.value.value, expectedValue);
  }
}

function assertInvalid(
  meld: NumberTileMeld,
  fixture: MeldFixture,
  code = "INVALID_MELD",
): void {
  const result = validateNumberTileMeld(meld, fixture.tilesById);
  assert.deepEqual(result, { ok: false, error: { code } });
}

test("GROUP은 세 가지 color의 같은 number를 허용한다", () => {
  const fixture = new MeldFixture();
  assertValid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 7),
        fixture.ordinary("BLUE", 7),
        fixture.ordinary("BLACK", 7),
      ],
    },
    fixture,
  );
});

test("GROUP은 네 가지 color의 같은 number를 허용한다", () => {
  const fixture = new MeldFixture();
  assertValid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 11),
        fixture.ordinary("BLUE", 11),
        fixture.ordinary("BLACK", 11),
        fixture.ordinary("ORANGE", 11),
      ],
    },
    fixture,
  );
});

test("GROUP은 colorless Joker 한 장의 number를 ordinary tiles에서 유도한다", () => {
  const fixture = new MeldFixture();
  assertValid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 10),
        fixture.ordinary("BLUE", 10),
        fixture.joker(),
      ],
    },
    fixture,
    30,
  );
});

test("GROUP은 세 ordinary color와 colorless Joker를 허용한다", () => {
  for (const thirdColor of ["BLACK", "ORANGE"] as const) {
    const fixture = new MeldFixture();
    assertValid(
      {
        kind: "GROUP",
        tiles: [
          fixture.ordinary("RED", 10),
          fixture.ordinary("BLUE", 10),
          fixture.ordinary(thirdColor, 10),
          fixture.joker(),
        ],
      },
      fixture,
      40,
    );
  }
});

test("네 ordinary color에 Joker를 더한 size 5 GROUP은 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 10),
        fixture.ordinary("BLUE", 10),
        fixture.ordinary("BLACK", 10),
        fixture.ordinary("ORANGE", 10),
        fixture.joker(),
      ],
    },
    fixture,
  );
});

for (const size of [2, 5] as const) {
  test(`GROUP size ${size}는 거절한다`, () => {
    const fixture = new MeldFixture();
    const colors = ["RED", "BLUE", "BLACK", "ORANGE", "RED"] as const;
    assertInvalid(
      {
        kind: "GROUP",
        tiles: colors
          .slice(0, size)
          .map((color) => fixture.ordinary(color, 7)),
      },
      fixture,
    );
  });
}

test("GROUP의 서로 다른 number는 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 7),
        fixture.ordinary("BLUE", 8),
        fixture.ordinary("BLACK", 7),
      ],
    },
    fixture,
  );
});

test("GROUP의 같은-color physical copy 두 장은 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 7),
        fixture.ordinary("RED", 7),
        fixture.ordinary("BLUE", 7),
      ],
    },
    fixture,
  );
});

test("GROUP의 ordinary same-color duplicate는 Joker가 있어도 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "GROUP",
      tiles: [
        fixture.ordinary("RED", 10),
        fixture.ordinary("RED", 10),
        fixture.joker(),
      ],
    },
    fixture,
  );
});

test("RUN은 1-2-3과 11-12-13 boundary를 허용한다", () => {
  for (const numbers of [
    [1, 2, 3],
    [11, 12, 13],
  ] as const) {
    const fixture = new MeldFixture();
    assertValid(
      {
        kind: "RUN",
        tiles: numbers.map((number) => fixture.ordinary("RED", number)),
      },
      fixture,
    );
  }
});

test("RUN은 length 3보다 긴 연속열을 허용한다", () => {
  const fixture = new MeldFixture();
  assertValid(
    {
      kind: "RUN",
      tiles: [3, 4, 5, 6, 7].map((number) =>
        fixture.ordinary("BLACK", number as NumberTileNumber),
      ),
    },
    fixture,
  );
});

test("RUN은 연속이어도 length 2이면 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "RUN",
      tiles: [
        fixture.ordinary("BLUE", 4),
        fixture.ordinary("BLUE", 5),
      ],
    },
    fixture,
  );
});

for (const [label, numbers] of [
  ["gap", [4, 6, 7]],
  ["duplicate", [4, 5, 5]],
  ["descending", [6, 5, 4]],
  ["12-13-1 wrap", [12, 13, 1]],
  ["13-1-2 wrap", [13, 1, 2]],
] as const) {
  test(`RUN ${label}은 ${label === "descending" ? "유일한 연속열로 정규화한다" : "거절한다"}`, () => {
    const fixture = new MeldFixture();
    // Unordered unique RUNs are now legal; preserve the other invalid cases.
    const verify = label === "descending" ? assertValid : assertInvalid;
    verify(
      {
        kind: "RUN",
        tiles: numbers.map((number) => fixture.ordinary("RED", number)),
      },
      fixture,
    );
  });
}

test("RUN의 mixed color는 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "RUN",
      tiles: [
        fixture.ordinary("RED", 4),
        fixture.ordinary("BLUE", 5),
        fixture.ordinary("RED", 6),
      ],
    },
    fixture,
  );
});

test("RUN은 Joker role을 ordered position에서 유일하게 유도한다", () => {
  for (const [tiles, expectedValue] of [
    [
      (fixture: MeldFixture) => [
        fixture.joker(),
        fixture.ordinary("ORANGE", 5),
        fixture.ordinary("ORANGE", 6),
      ],
      15,
    ],
    [
      (fixture: MeldFixture) => [
        fixture.ordinary("ORANGE", 4),
        fixture.joker(),
        fixture.ordinary("ORANGE", 6),
      ],
      15,
    ],
    [
      (fixture: MeldFixture) => [
        fixture.ordinary("ORANGE", 5),
        fixture.ordinary("ORANGE", 6),
        fixture.joker(),
      ],
      18,
    ],
  ] as const) {
    const fixture = new MeldFixture();
    assertValid(
      { kind: "RUN", tiles: tiles(fixture) },
      fixture,
      expectedValue,
    );
  }
});

test("RUN의 edge 위치가 범위를 벗어나도 유일한 1-13 interpretation으로 정규화한다", () => {
  for (const [tiles, value] of [
    [(fixture: MeldFixture) => [
      fixture.joker(),
      fixture.ordinary("RED", 1),
      fixture.ordinary("RED", 2),
    ], 6],
    [(fixture: MeldFixture) => [
      fixture.ordinary("RED", 12),
      fixture.ordinary("RED", 13),
      fixture.joker(),
    ], 36],
  ] as const) {
    const fixture = new MeldFixture();
    // Raw order is no longer a constraint when only one legal range exists.
    assertValid({ kind: "RUN", tiles: tiles(fixture) }, fixture, value);
  }
});

function permutations<T>(values: readonly T[]): T[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_entry, other) => other !== index))
      .map(rest => [value, ...rest]));
}

test("orange 7, joker, orange 9, orange 6는 모든 raw permutation에서 6/7/J8/9와 value 30이다", () => {
  const fixture = new MeldFixture();
  const seven = fixture.ordinary("ORANGE", 7);
  const joker = fixture.joker();
  const nine = fixture.ordinary("ORANGE", 9);
  const six = fixture.ordinary("ORANGE", 6);
  for (const tiles of permutations([seven, joker, nine, six])) {
    const before = [...tiles];
    const result = normalizeNumberTileMeld({ kind: "RUN", tiles }, fixture.tilesById);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("Unique unordered RUN must be valid.");
    assert.equal(result.value.value, 30);
    assert.deepEqual(result.value.meld.tiles, [six, seven, joker, nine]);
    assert.deepEqual(tiles, before);
    assert.deepEqual(result.value.meld.tiles[2], { kind: "JOKER", tileId: joker.tileId });
  }
});

test("ordinary RUN permutation은 같은 physical IDs를 ascending으로 정규화하고 duplicate faces는 reject한다", () => {
  const fixture = new MeldFixture();
  const placements = [4, 5, 6].map(number => fixture.ordinary("BLUE", number as NumberTileNumber));
  for (const tiles of permutations(placements)) {
    const result = normalizeNumberTileMeld({ kind: "RUN", tiles }, fixture.tilesById);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value.meld.tiles, placements);
  }
  assertInvalid({ kind: "RUN", tiles: [
    fixture.ordinary("BLUE", 5), fixture.ordinary("BLUE", 5), fixture.joker(),
  ] }, fixture);
});

test("genuinely ambiguous unordered Joker RUN은 점수를 임의 선택하지 않고 fail closed한다", () => {
  const fixture = new MeldFixture();
  const five = fixture.ordinary("RED", 5);
  const six = fixture.ordinary("RED", 6);
  const joker = fixture.joker();
  assertInvalid({ kind: "RUN", tiles: [five, joker, six] }, fixture);
  assertInvalid({ kind: "RUN", tiles: [joker, six, five] }, fixture);
  assertValid({ kind: "RUN", tiles: [joker, five, six] }, fixture, 15);
  assertValid({ kind: "RUN", tiles: [five, six, joker] }, fixture, 18);
});

test("RUN에서 ordered position으로 연속열을 만들 수 없는 Joker gap은 거절한다", () => {
  const fixture = new MeldFixture();
  assertInvalid(
    {
      kind: "RUN",
      tiles: [
        fixture.ordinary("RED", 4),
        fixture.joker(),
        fixture.ordinary("RED", 7),
      ],
    },
    fixture,
  );
});

test("모든 Meld는 Joker 두 장을 거절한다", () => {
  for (const kind of ["GROUP", "RUN"] as const) {
    const fixture = new MeldFixture();
    assertInvalid(
      {
        kind,
        tiles: [
          fixture.joker(),
          fixture.joker(),
          fixture.ordinary(kind === "GROUP" ? "BLACK" : "RED", 9),
        ],
      },
      fixture,
    );
  }
});

test("같은 physical tileId의 중복 reference는 별도 error로 거절한다", () => {
  const fixture = new MeldFixture();
  const duplicate = fixture.ordinary("RED", 7);
  assertInvalid(
    {
      kind: "GROUP",
      tiles: [duplicate, duplicate, fixture.ordinary("BLUE", 7)],
    },
    fixture,
    "DUPLICATE_TILE_REFERENCE",
  );
});

test("canonical kind와 placement kind가 다르면 Joker assignment error다", () => {
  const fixture = new MeldFixture();
  const joker = fixture.joker();
  const malformed = {
    kind: "GROUP",
    tiles: [
      fixture.ordinary("RED", 7),
      fixture.ordinary("BLUE", 7),
      { tileId: joker.tileId, kind: "ORDINARY" },
    ],
  } as unknown as NumberTileMeld;
  assertInvalid(malformed, fixture, "INVALID_JOKER_ASSIGNMENT");
});

test("bare Joker placement에 obsolete assignment field가 있으면 거절한다", () => {
  const fixture = new MeldFixture();
  const joker = fixture.joker();
  const malformed = {
    kind: "GROUP",
    tiles: [
      fixture.ordinary("RED", 7),
      fixture.ordinary("BLUE", 7),
      {
        tileId: joker.tileId,
        kind: "JOKER",
        assignedColor: "BLACK",
        assignedNumber: 7,
      },
    ],
  } as unknown as NumberTileMeld;
  assertInvalid(malformed, fixture, "INVALID_JOKER_ASSIGNMENT");
});
