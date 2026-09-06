import * as v from "valibot";

import { TileIdSchema } from "../../identifiers.js";

/** Transport resource limits, not gameplay acceptance rules. */
export const PROPOSED_BOARD_MAX_TILE_REFERENCES = 156;
export const PROPOSED_BOARD_MAX_WORD_GROUPS = 156;
export const PROPOSED_WORD_GROUP_MAX_SYLLABLES = 156;
export const PROPOSED_WORD_GROUP_ID_MAX_LENGTH = 128;
export const PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH = 8;

export const ProposedBoardTilePlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  assignedSymbol: v.pipe(
    v.string(),
    v.nonEmpty("A proposed Tile assignment must not be empty."),
    v.maxLength(
      PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH,
      "A proposed Tile assignment is too long.",
    ),
  ),
});
export type ProposedBoardTilePlacement = v.InferOutput<
  typeof ProposedBoardTilePlacementSchema
>;

export const ProposedBoardSyllableSchema = v.strictObject({
  choseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.length(1, "A proposed syllable must contain one choseong component."),
  ),
  jungseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.minLength(1, "A proposed syllable must contain a jungseong component."),
    v.maxLength(2, "A proposed syllable may contain two jungseong components."),
  ),
  jongseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.maxLength(2, "A proposed syllable may contain two jongseong components."),
  ),
});
export type ProposedBoardSyllable = v.InferOutput<
  typeof ProposedBoardSyllableSchema
>;

export const ProposedWordGroupSchema = v.strictObject({
  groupId: v.pipe(
    v.string(),
    v.nonEmpty("A proposed WordGroup identifier must not be empty."),
    v.maxLength(
      PROPOSED_WORD_GROUP_ID_MAX_LENGTH,
      "A proposed WordGroup identifier is too long.",
    ),
  ),
  // Empty groups are structurally safe; the RuleEngine owns that rejection.
  syllables: v.pipe(
    v.array(ProposedBoardSyllableSchema),
    v.maxLength(
      PROPOSED_WORD_GROUP_MAX_SYLLABLES,
      "A proposed WordGroup contains too many syllables.",
    ),
  ),
});
export type ProposedWordGroup = v.InferOutput<
  typeof ProposedWordGroupSchema
>;

function proposedBoardTileReferenceCount(
  board: Readonly<{ wordGroups: readonly ProposedWordGroup[] }>,
): number {
  let count = 0;

  for (const group of board.wordGroups) {
    for (const syllable of group.syllables) {
      count +=
        syllable.choseong.length +
        syllable.jungseong.length +
        syllable.jongseong.length;
    }
  }

  return count;
}

const ProposedBoardObjectSchema = v.strictObject({
  wordGroups: v.pipe(
    v.array(ProposedWordGroupSchema),
    v.maxLength(
      PROPOSED_BOARD_MAX_WORD_GROUPS,
      "A proposed Board contains too many WordGroups.",
    ),
  ),
});

export const ProposedBoardSchema = v.pipe(
  ProposedBoardObjectSchema,
  v.check(
    (board) =>
      proposedBoardTileReferenceCount(board) <=
      PROPOSED_BOARD_MAX_TILE_REFERENCES,
    "A proposed Board contains too many physical Tile references.",
  ),
);
export type ProposedBoard = v.InferOutput<typeof ProposedBoardSchema>;

export const TurnDrawBagKindSchema = v.picklist(["CONSONANT", "VOWEL"]);
export type TurnDrawBagKind = v.InferOutput<
  typeof TurnDrawBagKindSchema
>;
