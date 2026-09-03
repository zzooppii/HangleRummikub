import type { TileId } from "@hangul-rummikub/shared";

import {
  composeWord,
  type HangulCompositionError,
} from "../hangul/composition.js";
import type {
  DictionaryProvider,
  DictionaryUnavailableReason,
} from "../../ports/system.js";
import type {
  Board,
  BoardTilePlacement,
  TileDescriptor,
  WordGroup,
} from "./board.js";

export type RuleValidationPolicy = Readonly<{
  minimumWordSyllables: number;
  initialMeldMinimumTileCount: number;
}>;

export const MVP_RULE_VALIDATION_POLICY: RuleValidationPolicy = Object.freeze({
  minimumWordSyllables: 2,
  initialMeldMinimumTileCount: 6,
});

export type ValidateBoardInput = Readonly<{
  canonicalBoard: Board;
  proposedBoard: Board;
  tilesById: ReadonlyMap<TileId, TileDescriptor>;
  actorRackTileIds: ReadonlySet<TileId>;
  initialMeldCompleted: boolean;
  dictionaryProvider: DictionaryProvider;
  policy: RuleValidationPolicy;
}>;

export type ComposedWord = Readonly<{
  groupId: string;
  word: string;
}>;

export type ValidatedBoard = Readonly<{
  composedWords: readonly ComposedWord[];
  newlyUsedRackTileIds: readonly TileId[];
  recoveredJokerTileIds: readonly TileId[];
  completesInitialMeld: boolean;
}>;

type BoardScope = "CANONICAL" | "PROPOSED";

export type BoardValidationError =
  | Readonly<{
      code: "INVALID_BOARD";
      reason:
        | "INVALID_POLICY"
        | "EMPTY_GROUP_ID"
        | "DUPLICATE_GROUP_ID"
        | "EMPTY_WORD_GROUP";
      board?: BoardScope;
      groupIndex?: number;
    }>
  | Readonly<{
      code: "INVALID_TILE_REFERENCE";
      board: BoardScope;
      groupId: string;
    }>
  | Readonly<{
      code: "INVALID_TILE_ASSIGNMENT";
      groupId: string;
    }>
  | Readonly<{
      code: "TILE_NOT_OWNED";
      groupId: string;
    }>
  | Readonly<{
      code: "TILE_CONSERVATION_VIOLATION";
      reason: "DUPLICATE_TILE_REFERENCE" | "MISSING_CANONICAL_TILE";
      board: BoardScope;
      groupId: string;
    }>
  | Readonly<{
      code: "INVALID_HANGUL_COMPOSITION";
      groupId: string;
      compositionCode: HangulCompositionError["code"];
    }>
  | Readonly<{
      code: "WORD_TOO_SHORT";
      groupId: string;
    }>
  | Readonly<{
      code: "WORD_NOT_ALLOWED";
      groupId: string;
    }>
  | Readonly<{
      code: "INITIAL_MELD_VIOLATION";
      reason: "CANONICAL_BOARD_CHANGED" | "NOT_ENOUGH_TILES";
    }>
  | Readonly<{
      code: "REARRANGEMENT_VIOLATION";
      reason: "NO_RACK_TILE_USED";
    }>
  | Readonly<{
      code: "JOKER_RULE_VIOLATION";
      reason: "INVALID_ASSIGNMENT" | "MISSING_REPLACEMENT";
      groupId: string;
    }>
  | Readonly<{
      code: "DICTIONARY_UNAVAILABLE";
      reason: DictionaryUnavailableReason;
      groupId: string;
    }>;

export type BoardValidationResult =
  | Readonly<{ ok: true; value: ValidatedBoard }>
  | Readonly<{ ok: false; error: BoardValidationError }>;

type PlacementRole = "CHOSEONG" | "JUNGSEONG" | "JONGSEONG";

type LogicalPlacement = Readonly<{
  component: BoardTilePlacement;
  groupId: string;
  syllableIndex: number;
  role: PlacementRole;
  componentIndex: number;
}>;

type BoardAnalysis = Readonly<{
  wordGroups: readonly WordGroup[];
  groupsById: ReadonlyMap<string, WordGroup>;
  placements: readonly LogicalPlacement[];
  placementsByTileId: ReadonlyMap<TileId, LogicalPlacement>;
}>;

type InternalResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: BoardValidationError }>;

const JOKER_ONE_POSITION_SYMBOLS: ReadonlySet<string> = new Set([
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
]);

export async function validateProposedBoard(
  input: ValidateBoardInput,
): Promise<BoardValidationResult> {
  if (!isValidPolicy(input.policy)) {
    return failure({ code: "INVALID_BOARD", reason: "INVALID_POLICY" });
  }

  const canonicalAnalysisResult = analyzeBoard(input.canonicalBoard, "CANONICAL");
  if (!canonicalAnalysisResult.ok) {
    return canonicalAnalysisResult;
  }

  const proposedAnalysisResult = analyzeBoard(input.proposedBoard, "PROPOSED");
  if (!proposedAnalysisResult.ok) {
    return proposedAnalysisResult;
  }

  const canonicalAnalysis = canonicalAnalysisResult.value;
  const proposedAnalysis = proposedAnalysisResult.value;

  const canonicalReferenceResult = validateReferences(
    canonicalAnalysis,
    input.tilesById,
    "CANONICAL",
  );
  if (!canonicalReferenceResult.ok) {
    return canonicalReferenceResult;
  }

  const proposedReferenceResult = validateReferences(
    proposedAnalysis,
    input.tilesById,
    "PROPOSED",
  );
  if (!proposedReferenceResult.ok) {
    return proposedReferenceResult;
  }

  const canonicalAssignmentResult = validateTileAssignments(
    canonicalAnalysis,
    input.tilesById,
    "CANONICAL",
  );
  if (!canonicalAssignmentResult.ok) {
    return canonicalAssignmentResult;
  }

  const conservationResult = validateCanonicalTileConservation(
    canonicalAnalysis,
    proposedAnalysis,
  );
  if (!conservationResult.ok) {
    return conservationResult;
  }

  const newlyUsedResult = collectNewlyUsedPlacements(
    canonicalAnalysis,
    proposedAnalysis,
    input.actorRackTileIds,
  );
  if (!newlyUsedResult.ok) {
    return newlyUsedResult;
  }

  const newlyUsedPlacements = newlyUsedResult.value;

  // Ownership is checked before interpreting an untrusted new Tile's physical
  // capabilities, so a caller cannot probe another rack through assignment errors.
  const proposedAssignmentResult = validateTileAssignments(
    proposedAnalysis,
    input.tilesById,
    "PROPOSED",
  );
  if (!proposedAssignmentResult.ok) {
    return proposedAssignmentResult;
  }

  if (input.initialMeldCompleted) {
    if (newlyUsedPlacements.length === 0) {
      return failure({
        code: "REARRANGEMENT_VIOLATION",
        reason: "NO_RACK_TILE_USED",
      });
    }
  } else {
    if (!canonicalGroupsArePreserved(canonicalAnalysis, proposedAnalysis)) {
      return failure({
        code: "INITIAL_MELD_VIOLATION",
        reason: "CANONICAL_BOARD_CHANGED",
      });
    }

    if (
      newlyUsedPlacements.length < input.policy.initialMeldMinimumTileCount
    ) {
      return failure({
        code: "INITIAL_MELD_VIOLATION",
        reason: "NOT_ENOUGH_TILES",
      });
    }
  }

  const jokerResult = validateJokerRecovery(
    canonicalAnalysis,
    proposedAnalysis,
    newlyUsedPlacements,
    input.tilesById,
  );
  if (!jokerResult.ok) {
    return jokerResult;
  }

  const composedWordsResult = await validateWords(
    proposedAnalysis.wordGroups,
    input.policy.minimumWordSyllables,
    input.dictionaryProvider,
  );
  if (!composedWordsResult.ok) {
    return composedWordsResult;
  }

  return {
    ok: true,
    value: Object.freeze({
      composedWords: Object.freeze(
        composedWordsResult.value.map((entry) => Object.freeze({ ...entry })),
      ),
      newlyUsedRackTileIds: Object.freeze(
        newlyUsedPlacements.map((placement) => placement.component.tileId),
      ),
      recoveredJokerTileIds: Object.freeze([...jokerResult.value]),
      completesInitialMeld: !input.initialMeldCompleted,
    }),
  };
}

function isValidPolicy(policy: RuleValidationPolicy): boolean {
  return (
    Number.isSafeInteger(policy.minimumWordSyllables) &&
    policy.minimumWordSyllables >= 1 &&
    Number.isSafeInteger(policy.initialMeldMinimumTileCount) &&
    policy.initialMeldMinimumTileCount >= 1
  );
}

function analyzeBoard(
  board: Board,
  boardScope: BoardScope,
): InternalResult<BoardAnalysis> {
  const wordGroups: WordGroup[] = [];
  const groupsById = new Map<string, WordGroup>();
  const placements: LogicalPlacement[] = [];
  const placementsByTileId = new Map<TileId, LogicalPlacement>();

  for (const [groupIndex, group] of board.wordGroups.entries()) {
    if (group.groupId.length === 0) {
      return failure({
        code: "INVALID_BOARD",
        reason: "EMPTY_GROUP_ID",
        board: boardScope,
        groupIndex,
      });
    }

    if (groupsById.has(group.groupId)) {
      return failure({
        code: "INVALID_BOARD",
        reason: "DUPLICATE_GROUP_ID",
        board: boardScope,
        groupIndex,
      });
    }

    if (group.syllables.length === 0) {
      return failure({
        code: "INVALID_BOARD",
        reason: "EMPTY_WORD_GROUP",
        board: boardScope,
        groupIndex,
      });
    }

    const snapshottedGroup = snapshotWordGroup(group);
    wordGroups.push(snapshottedGroup);
    groupsById.set(snapshottedGroup.groupId, snapshottedGroup);

    for (const [syllableIndex, syllable] of snapshottedGroup.syllables.entries()) {
      const roles: readonly Readonly<{
        role: PlacementRole;
        components: readonly BoardTilePlacement[];
      }>[] = [
        { role: "CHOSEONG", components: syllable.choseong },
        { role: "JUNGSEONG", components: syllable.jungseong },
        { role: "JONGSEONG", components: syllable.jongseong },
      ];

      for (const { role, components } of roles) {
        for (const [componentIndex, component] of components.entries()) {
          const placement: LogicalPlacement = {
            component,
            groupId: group.groupId,
            syllableIndex,
            role,
            componentIndex,
          };

          if (placementsByTileId.has(component.tileId)) {
            return failure({
              code: "TILE_CONSERVATION_VIOLATION",
              reason: "DUPLICATE_TILE_REFERENCE",
              board: boardScope,
              groupId: group.groupId,
            });
          }

          placements.push(placement);
          placementsByTileId.set(component.tileId, placement);
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      wordGroups: Object.freeze(wordGroups),
      groupsById,
      placements: Object.freeze(placements),
      placementsByTileId,
    },
  };
}

function snapshotWordGroup(group: WordGroup): WordGroup {
  const snapshotComponents = (
    components: readonly BoardTilePlacement[],
  ): readonly BoardTilePlacement[] =>
    Object.freeze(
      components.map((component) =>
        Object.freeze({
          tileId: component.tileId,
          assignedSymbol: component.assignedSymbol,
        }),
      ),
    );

  return Object.freeze({
    groupId: group.groupId,
    syllables: Object.freeze(
      group.syllables.map((syllable) =>
        Object.freeze({
          choseong: snapshotComponents(syllable.choseong),
          jungseong: snapshotComponents(syllable.jungseong),
          jongseong: snapshotComponents(syllable.jongseong),
        }),
      ),
    ),
  });
}

function validateReferences(
  analysis: BoardAnalysis,
  tilesById: ReadonlyMap<TileId, TileDescriptor>,
  boardScope: BoardScope,
): InternalResult<undefined> {
  for (const placement of analysis.placements) {
    const descriptor = tilesById.get(placement.component.tileId);
    if (
      descriptor === undefined ||
      descriptor.tileId !== placement.component.tileId
    ) {
      return failure({
        code: "INVALID_TILE_REFERENCE",
        board: boardScope,
        groupId: placement.groupId,
      });
    }
  }

  return { ok: true, value: undefined };
}

function validateTileAssignments(
  analysis: BoardAnalysis,
  tilesById: ReadonlyMap<TileId, TileDescriptor>,
  boardScope: BoardScope,
): InternalResult<undefined> {
  for (const placement of analysis.placements) {
    const descriptor = tilesById.get(placement.component.tileId);
    if (descriptor === undefined) {
      return failure({
        code: "INVALID_TILE_REFERENCE",
        board: boardScope,
        groupId: placement.groupId,
      });
    }

    if (descriptor.kind === "ORDINARY") {
      if (!descriptor.allowedSymbols.includes(placement.component.assignedSymbol)) {
        return failure({
          code: "INVALID_TILE_ASSIGNMENT",
          groupId: placement.groupId,
        });
      }
      continue;
    }

    if (!JOKER_ONE_POSITION_SYMBOLS.has(placement.component.assignedSymbol)) {
      return failure({
        code: "JOKER_RULE_VIOLATION",
        reason: "INVALID_ASSIGNMENT",
        groupId: placement.groupId,
      });
    }
  }

  return { ok: true, value: undefined };
}

function validateCanonicalTileConservation(
  canonicalAnalysis: BoardAnalysis,
  proposedAnalysis: BoardAnalysis,
): InternalResult<undefined> {
  for (const canonicalPlacement of canonicalAnalysis.placements) {
    if (
      !proposedAnalysis.placementsByTileId.has(
        canonicalPlacement.component.tileId,
      )
    ) {
      return failure({
        code: "TILE_CONSERVATION_VIOLATION",
        reason: "MISSING_CANONICAL_TILE",
        board: "PROPOSED",
        groupId: canonicalPlacement.groupId,
      });
    }
  }

  return { ok: true, value: undefined };
}

function collectNewlyUsedPlacements(
  canonicalAnalysis: BoardAnalysis,
  proposedAnalysis: BoardAnalysis,
  actorRackTileIds: ReadonlySet<TileId>,
): InternalResult<readonly LogicalPlacement[]> {
  const newlyUsedPlacements: LogicalPlacement[] = [];

  for (const proposedPlacement of proposedAnalysis.placements) {
    if (
      canonicalAnalysis.placementsByTileId.has(
        proposedPlacement.component.tileId,
      )
    ) {
      continue;
    }

    if (!actorRackTileIds.has(proposedPlacement.component.tileId)) {
      return failure({
        code: "TILE_NOT_OWNED",
        groupId: proposedPlacement.groupId,
      });
    }

    newlyUsedPlacements.push(proposedPlacement);
  }

  return { ok: true, value: newlyUsedPlacements };
}

function canonicalGroupsArePreserved(
  canonicalAnalysis: BoardAnalysis,
  proposedAnalysis: BoardAnalysis,
): boolean {
  for (const [groupId, canonicalGroup] of canonicalAnalysis.groupsById) {
    const proposedGroup = proposedAnalysis.groupsById.get(groupId);
    if (
      proposedGroup === undefined ||
      !wordGroupsHaveEqualContents(canonicalGroup, proposedGroup)
    ) {
      return false;
    }
  }

  return true;
}

function wordGroupsHaveEqualContents(left: WordGroup, right: WordGroup): boolean {
  if (left.syllables.length !== right.syllables.length) {
    return false;
  }

  for (const [syllableIndex, leftSyllable] of left.syllables.entries()) {
    const rightSyllable = right.syllables[syllableIndex];
    if (
      rightSyllable === undefined ||
      !componentsAreEqual(leftSyllable.choseong, rightSyllable.choseong) ||
      !componentsAreEqual(leftSyllable.jungseong, rightSyllable.jungseong) ||
      !componentsAreEqual(leftSyllable.jongseong, rightSyllable.jongseong)
    ) {
      return false;
    }
  }

  return true;
}

function componentsAreEqual(
  left: readonly BoardTilePlacement[],
  right: readonly BoardTilePlacement[],
): boolean {
  return (
    left.length === right.length &&
    left.every((component, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        component.tileId === other.tileId &&
        component.assignedSymbol === other.assignedSymbol
      );
    })
  );
}

function validateJokerRecovery(
  canonicalAnalysis: BoardAnalysis,
  proposedAnalysis: BoardAnalysis,
  newlyUsedPlacements: readonly LogicalPlacement[],
  tilesById: ReadonlyMap<TileId, TileDescriptor>,
): InternalResult<readonly TileId[]> {
  const replacementCounts = new Map<string, number>();

  for (const placement of newlyUsedPlacements) {
    const descriptor = tilesById.get(placement.component.tileId);
    if (descriptor?.kind !== "ORDINARY") {
      continue;
    }

    const symbol = placement.component.assignedSymbol;
    replacementCounts.set(symbol, (replacementCounts.get(symbol) ?? 0) + 1);
  }

  const recoveredJokerTileIds: TileId[] = [];

  for (const canonicalPlacement of canonicalAnalysis.placements) {
    const descriptor = tilesById.get(canonicalPlacement.component.tileId);
    if (descriptor?.kind !== "JOKER") {
      continue;
    }

    const proposedPlacement = proposedAnalysis.placementsByTileId.get(
      canonicalPlacement.component.tileId,
    );
    if (proposedPlacement === undefined) {
      continue;
    }

    if (logicalPlacementIsUnchanged(canonicalPlacement, proposedPlacement)) {
      continue;
    }

    const oldSymbol = canonicalPlacement.component.assignedSymbol;
    const availableReplacementCount = replacementCounts.get(oldSymbol) ?? 0;
    if (availableReplacementCount === 0) {
      return failure({
        code: "JOKER_RULE_VIOLATION",
        reason: "MISSING_REPLACEMENT",
        groupId: canonicalPlacement.groupId,
      });
    }

    replacementCounts.set(oldSymbol, availableReplacementCount - 1);
    recoveredJokerTileIds.push(canonicalPlacement.component.tileId);
  }

  return { ok: true, value: recoveredJokerTileIds };
}

function logicalPlacementIsUnchanged(
  canonicalPlacement: LogicalPlacement,
  proposedPlacement: LogicalPlacement,
): boolean {
  return (
    canonicalPlacement.groupId === proposedPlacement.groupId &&
    canonicalPlacement.syllableIndex === proposedPlacement.syllableIndex &&
    canonicalPlacement.role === proposedPlacement.role &&
    canonicalPlacement.componentIndex === proposedPlacement.componentIndex &&
    canonicalPlacement.component.assignedSymbol ===
      proposedPlacement.component.assignedSymbol
  );
}

async function validateWords(
  wordGroups: readonly WordGroup[],
  minimumWordSyllables: number,
  dictionaryProvider: DictionaryProvider,
): Promise<InternalResult<readonly ComposedWord[]>> {
  const composedWords: ComposedWord[] = [];

  for (const group of wordGroups) {
    if (group.syllables.length < minimumWordSyllables) {
      return failure({ code: "WORD_TOO_SHORT", groupId: group.groupId });
    }

    const compositionResult = composeWord({ syllables: group.syllables });
    if (!compositionResult.ok) {
      return failure({
        code: "INVALID_HANGUL_COMPOSITION",
        groupId: group.groupId,
        compositionCode: compositionResult.error.code,
      });
    }

    const composedWord = {
      groupId: group.groupId,
      word: compositionResult.value.word,
    };

    let lookupResult;
    try {
      lookupResult = await dictionaryProvider.lookup(composedWord.word);
    } catch {
      return failure({
        code: "DICTIONARY_UNAVAILABLE",
        reason: "ERROR",
        groupId: composedWord.groupId,
      });
    }

    if (lookupResult.status === "NOT_ALLOWED") {
      return failure({
        code: "WORD_NOT_ALLOWED",
        groupId: composedWord.groupId,
      });
    }

    if (lookupResult.status === "UNAVAILABLE") {
      return failure({
        code: "DICTIONARY_UNAVAILABLE",
        reason: lookupResult.reason,
        groupId: composedWord.groupId,
      });
    }

    composedWords.push(composedWord);
  }

  return { ok: true, value: composedWords };
}

function failure(
  error: BoardValidationError,
): Readonly<{ ok: false; error: BoardValidationError }> {
  return { ok: false, error };
}
