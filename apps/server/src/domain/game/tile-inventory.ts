import type { TileId } from "@hangul-rummikub/shared";

import type { IdGenerator } from "../../ports/system.js";

export const TILE_INVENTORY_VERSION = "hangul-tile-inventory-v1";

export type TileSourceBag = "CONSONANT" | "VOWEL";

export type OrdinaryTileDescriptor = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
  physicalType: string;
  sourceBag: TileSourceBag;
  allowedSymbols: readonly string[];
}>;

export type JokerTileDescriptor = Readonly<{
  tileId: TileId;
  kind: "JOKER";
  physicalType: "JOKER";
  sourceBag: TileSourceBag;
}>;

export type TileDescriptor = OrdinaryTileDescriptor | JokerTileDescriptor;

type OrdinaryDefinitionInput = Readonly<{
  kind: "ORDINARY";
  physicalType: string;
  sourceBag: TileSourceBag;
  quantity: number;
  allowedSymbols: readonly string[];
}>;

type JokerDefinitionInput = Readonly<{
  kind: "JOKER";
  physicalType: "JOKER";
  sourceBag: TileSourceBag;
  quantity: 1;
}>;

function ordinaryDefinition<const TDefinition extends OrdinaryDefinitionInput>(
  definition: TDefinition,
): TDefinition {
  Object.freeze(definition.allowedSymbols);
  return Object.freeze(definition);
}

function jokerDefinition<const TDefinition extends JokerDefinitionInput>(
  definition: TDefinition,
): TDefinition {
  return Object.freeze(definition);
}

/**
 * The sole runtime definition of the C-22 `hangul-tile-inventory-v1`
 * physical inventory. Quantities belong to physical families, not to each
 * member of `allowedSymbols`.
 */
export const CANONICAL_TILE_INVENTORY_V1 = Object.freeze([
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "GIYEOK_NIEUN_ROTATION",
    sourceBag: "CONSONANT",
    quantity: 12,
    allowedSymbols: ["ㄱ", "ㄴ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "DIGEUT",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㄷ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "RIEUL",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㄹ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "MIEUM",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅁ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "BIEUP",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅂ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SIOT",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅅ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "IEUNG",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅇ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "JIEUT",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅈ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "CHIEUT",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅊ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "KIEUK",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅋ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "TIEUT",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅌ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "PIEUP",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅍ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "HIEUH",
    sourceBag: "CONSONANT",
    quantity: 6,
    allowedSymbols: ["ㅎ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SSANG_BIEUP",
    sourceBag: "CONSONANT",
    quantity: 2,
    allowedSymbols: ["ㅃ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SSANG_JIEUT",
    sourceBag: "CONSONANT",
    quantity: 2,
    allowedSymbols: ["ㅉ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SSANG_DIGEUT",
    sourceBag: "CONSONANT",
    quantity: 2,
    allowedSymbols: ["ㄸ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SSANG_GIYEOK",
    sourceBag: "CONSONANT",
    quantity: 2,
    allowedSymbols: ["ㄲ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "SSANG_SIOT",
    sourceBag: "CONSONANT",
    quantity: 2,
    allowedSymbols: ["ㅆ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "A_ROTATION",
    sourceBag: "VOWEL",
    quantity: 20,
    allowedSymbols: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "YA_ROTATION",
    sourceBag: "VOWEL",
    quantity: 20,
    allowedSymbols: ["ㅑ", "ㅕ", "ㅛ", "ㅠ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "I_EU_ROTATION",
    sourceBag: "VOWEL",
    quantity: 12,
    allowedSymbols: ["ㅣ", "ㅡ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "AE",
    sourceBag: "VOWEL",
    quantity: 2,
    allowedSymbols: ["ㅐ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "E",
    sourceBag: "VOWEL",
    quantity: 2,
    allowedSymbols: ["ㅔ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "YAE",
    sourceBag: "VOWEL",
    quantity: 2,
    allowedSymbols: ["ㅒ"],
  }),
  ordinaryDefinition({
    kind: "ORDINARY",
    physicalType: "YE",
    sourceBag: "VOWEL",
    quantity: 2,
    allowedSymbols: ["ㅖ"],
  }),
  jokerDefinition({
    kind: "JOKER",
    physicalType: "JOKER",
    sourceBag: "CONSONANT",
    quantity: 1,
  }),
  jokerDefinition({
    kind: "JOKER",
    physicalType: "JOKER",
    sourceBag: "VOWEL",
    quantity: 1,
  }),
] as const);

export type PhysicalTileDefinition =
  (typeof CANONICAL_TILE_INVENTORY_V1)[number];
export type OrdinaryPhysicalTileDefinition = Extract<
  PhysicalTileDefinition,
  { readonly kind: "ORDINARY" }
>;
export type JokerPhysicalTileDefinition = Extract<
  PhysicalTileDefinition,
  { readonly kind: "JOKER" }
>;
export type OrdinaryPhysicalTileType =
  OrdinaryPhysicalTileDefinition["physicalType"];
export type PhysicalTileType = PhysicalTileDefinition["physicalType"];
export type OrdinaryTileSymbol =
  OrdinaryPhysicalTileDefinition["allowedSymbols"][number];

export type OrdinaryTileInstance = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
  physicalType: OrdinaryPhysicalTileType;
  sourceBag: TileSourceBag;
  allowedSymbols: readonly OrdinaryTileSymbol[];
}>;

export type JokerTileInstance = Readonly<{
  tileId: TileId;
  kind: "JOKER";
  physicalType: "JOKER";
  sourceBag: TileSourceBag;
}>;

export type TileInstance = OrdinaryTileInstance | JokerTileInstance;

export const JOKER_ALLOWED_SYMBOLS = Object.freeze([
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
] as const);

export type JokerAllowedSymbol = (typeof JOKER_ALLOWED_SYMBOLS)[number];

export function isJokerAllowedSymbol(
  symbol: string,
): symbol is JokerAllowedSymbol {
  return JOKER_ALLOWED_SYMBOLS.some((allowedSymbol) => allowedSymbol === symbol);
}

function sumDefinitions(
  predicate: (definition: PhysicalTileDefinition) => boolean,
): number {
  return CANONICAL_TILE_INVENTORY_V1.reduce(
    (total, definition) =>
      total + (predicate(definition) ? definition.quantity : 0),
    0,
  );
}

export const TILE_INVENTORY_TOTALS = Object.freeze({
  ordinaryConsonants: sumDefinitions(
    (definition) =>
      definition.kind === "ORDINARY" && definition.sourceBag === "CONSONANT",
  ),
  ordinaryVowels: sumDefinitions(
    (definition) =>
      definition.kind === "ORDINARY" && definition.sourceBag === "VOWEL",
  ),
  jokers: sumDefinitions((definition) => definition.kind === "JOKER"),
  consonantPool: sumDefinitions(
    (definition) => definition.sourceBag === "CONSONANT",
  ),
  vowelPool: sumDefinitions((definition) => definition.sourceBag === "VOWEL"),
  grandTotal: sumDefinitions(() => true),
});

const EXPECTED_TILE_INVENTORY_TOTALS = Object.freeze({
  ordinaryConsonants: 94,
  ordinaryVowels: 60,
  jokers: 2,
  consonantPool: 95,
  vowelPool: 61,
  grandTotal: 156,
});

function assertCanonicalInventoryTotals(): void {
  if (
    TILE_INVENTORY_TOTALS.ordinaryConsonants !==
      EXPECTED_TILE_INVENTORY_TOTALS.ordinaryConsonants ||
    TILE_INVENTORY_TOTALS.ordinaryVowels !==
      EXPECTED_TILE_INVENTORY_TOTALS.ordinaryVowels ||
    TILE_INVENTORY_TOTALS.jokers !== EXPECTED_TILE_INVENTORY_TOTALS.jokers ||
    TILE_INVENTORY_TOTALS.consonantPool !==
      EXPECTED_TILE_INVENTORY_TOTALS.consonantPool ||
    TILE_INVENTORY_TOTALS.vowelPool !==
      EXPECTED_TILE_INVENTORY_TOTALS.vowelPool ||
    TILE_INVENTORY_TOTALS.grandTotal !==
      EXPECTED_TILE_INVENTORY_TOTALS.grandTotal
  ) {
    throw new Error("Canonical tile inventory totals are invalid.");
  }
}

assertCanonicalInventoryTotals();

export function cloneTileInstance(tile: TileInstance): TileInstance {
  if (tile.kind === "JOKER") {
    return Object.freeze({
      tileId: tile.tileId,
      kind: tile.kind,
      physicalType: tile.physicalType,
      sourceBag: tile.sourceBag,
    });
  }

  return Object.freeze({
    tileId: tile.tileId,
    kind: tile.kind,
    physicalType: tile.physicalType,
    sourceBag: tile.sourceBag,
    allowedSymbols: Object.freeze([...tile.allowedSymbols]),
  });
}

export function createCanonicalTileInstances(
  idGenerator: IdGenerator,
): readonly TileInstance[] {
  const instances: TileInstance[] = [];
  const tileIds = new Set<TileId>();

  for (const definition of CANONICAL_TILE_INVENTORY_V1) {
    for (let index = 0; index < definition.quantity; index += 1) {
      const tileId = idGenerator.generateTileId();
      if (tileIds.has(tileId)) {
        throw new Error("IdGenerator returned a duplicate tileId.");
      }
      tileIds.add(tileId);

      const instance: TileInstance =
        definition.kind === "JOKER"
          ? Object.freeze({
              tileId,
              kind: definition.kind,
              physicalType: definition.physicalType,
              sourceBag: definition.sourceBag,
            })
          : Object.freeze({
              tileId,
              kind: definition.kind,
              physicalType: definition.physicalType,
              sourceBag: definition.sourceBag,
              allowedSymbols: definition.allowedSymbols,
            });

      instances.push(instance);
    }
  }

  if (
    instances.length !== TILE_INVENTORY_TOTALS.grandTotal ||
    tileIds.size !== TILE_INVENTORY_TOTALS.grandTotal
  ) {
    throw new Error("Canonical tile instance creation violated inventory totals.");
  }

  return Object.freeze(instances);
}
