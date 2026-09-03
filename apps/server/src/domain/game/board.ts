import type {
  AssignedJamoComponent,
  SyllableCompositionInput,
} from "../hangul/composition.js";

export type {
  JokerTileDescriptor,
  OrdinaryTileDescriptor,
  TileDescriptor,
  TileSourceBag,
} from "./tile-inventory.js";

export type BoardTilePlacement = AssignedJamoComponent;

export type BoardSyllable = SyllableCompositionInput;

export type WordGroup = Readonly<{
  groupId: string;
  syllables: readonly BoardSyllable[];
}>;

export type Board = Readonly<{
  wordGroups: readonly WordGroup[];
}>;
