import type { TileId } from "@hangul-rummikub/shared";

import type {
  AssignedJamoComponent,
  SyllableCompositionInput,
} from "../hangul/composition.js";

export type BoardTilePlacement = AssignedJamoComponent;

export type BoardSyllable = SyllableCompositionInput;

export type WordGroup = Readonly<{
  groupId: string;
  syllables: readonly BoardSyllable[];
}>;

export type Board = Readonly<{
  wordGroups: readonly WordGroup[];
}>;

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
