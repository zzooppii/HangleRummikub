import type {
  GameId,
  GameRevision,
  PlayingStateSnapshot,
  PrivateRackTileView,
  PublicBoardTilePlacement,
  StateSnapshot,
  TileId,
  TurnId,
} from "@hangul-rummikub/shared";

export const TURN_DRAFT_HISTORY_LIMIT = 50;

type DraftTileOrigin = "CANONICAL_BOARD" | "SELF_RACK";

export type OrdinaryDraftPlacedTile = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
  physicalType: string;
  assignedSymbol: string;
  allowedSymbols: readonly string[];
  origin: DraftTileOrigin;
}>;

export type JokerDraftPlacedTile = Readonly<{
  tileId: TileId;
  kind: "JOKER";
  physicalType: "JOKER";
  assignedSymbol: string;
  allowedSymbols: readonly string[];
  origin: DraftTileOrigin;
}>;

export type DraftPlacedTile =
  | OrdinaryDraftPlacedTile
  | JokerDraftPlacedTile;

export type DraftSyllable = Readonly<{
  choseong: DraftPlacedTile | null;
  jungseong: readonly [DraftPlacedTile | null, DraftPlacedTile | null];
  jongseong: readonly [DraftPlacedTile | null, DraftPlacedTile | null];
}>;

export type DraftWordGroup = Readonly<{
  groupId: string;
  origin: "CANONICAL_BOARD" | "LOCAL";
  syllables: readonly DraftSyllable[];
}>;

export type DraftSlotTarget = Readonly<{
  groupId: string;
  syllableIndex: number;
  role: "choseong" | "jungseong" | "jongseong";
  componentIndex: 0 | 1;
}>;

export type DraftBoardTileLocation = DraftSlotTarget;

type DraftPresent = Readonly<{
  wordGroups: readonly DraftWordGroup[];
  availableRackTiles: readonly PrivateRackTileView[];
}>;

export type TurnDraft = Readonly<{
  baseGameId: GameId;
  baseGameRevision: GameRevision;
  baseTurnId: TurnId;
  mode: "INITIAL_MELD" | "REARRANGEMENT";
  wordGroups: readonly DraftWordGroup[];
  availableRackTiles: readonly PrivateRackTileView[];
  /** Immutable catalog used to restore the authoritative rack order. */
  rackTiles: readonly PrivateRackTileView[];
  canonicalBoardTileIds: readonly TileId[];
  baseline: DraftPresent;
  history: readonly DraftPresent[];
}>;

export type LocatedDraftTile =
  | Readonly<{
      source: "AVAILABLE_RACK";
      tile: PrivateRackTileView;
    }>
  | Readonly<{
      source: "BOARD";
      tile: DraftPlacedTile;
      location: DraftBoardTileLocation;
    }>;

export type TurnDraftEditErrorCode =
  | "DUPLICATE_GROUP_ID"
  | "GROUP_NOT_FOUND"
  | "SYLLABLE_NOT_FOUND"
  | "GROUP_NOT_EMPTY"
  | "SYLLABLE_NOT_EMPTY"
  | "TILE_NOT_FOUND"
  | "SLOT_OCCUPIED"
  | "INVALID_SLOT"
  | "INVALID_ASSIGNED_SYMBOL"
  | "INITIAL_MELD_BOARD_LOCKED"
  | "CANONICAL_TILE_CANNOT_RETURN_TO_RACK"
  | "NO_UNDO_HISTORY";

export type TurnDraftEditResult =
  | Readonly<{ ok: true; draft: TurnDraft }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: TurnDraftEditErrorCode }>;
    }>;

export type TurnDraftReconciliationDecision =
  | "KEEP_DRAFT"
  | "RESET_DRAFT";

function cloneRackTile(tile: PrivateRackTileView): PrivateRackTileView {
  if (tile.kind === "JOKER") {
    return {
      tileId: tile.tileId,
      kind: "JOKER",
      physicalType: "JOKER",
      sourceBag: tile.sourceBag,
      allowedSymbols: [...tile.allowedSymbols],
    };
  }

  return {
    tileId: tile.tileId,
    kind: "ORDINARY",
    physicalType: tile.physicalType,
    sourceBag: tile.sourceBag,
    allowedSymbols: [...tile.allowedSymbols],
  };
}

function clonePlacedTile(tile: DraftPlacedTile): DraftPlacedTile {
  if (tile.kind === "JOKER") {
    return { ...tile, allowedSymbols: [...tile.allowedSymbols] };
  }

  return { ...tile, allowedSymbols: [...tile.allowedSymbols] };
}

function cloneSyllable(syllable: DraftSyllable): DraftSyllable {
  return {
    choseong:
      syllable.choseong === null
        ? null
        : clonePlacedTile(syllable.choseong),
    jungseong: [
      syllable.jungseong[0] === null
        ? null
        : clonePlacedTile(syllable.jungseong[0]),
      syllable.jungseong[1] === null
        ? null
        : clonePlacedTile(syllable.jungseong[1]),
    ],
    jongseong: [
      syllable.jongseong[0] === null
        ? null
        : clonePlacedTile(syllable.jongseong[0]),
      syllable.jongseong[1] === null
        ? null
        : clonePlacedTile(syllable.jongseong[1]),
    ],
  };
}

function cloneWordGroup(group: DraftWordGroup): DraftWordGroup {
  return {
    groupId: group.groupId,
    origin: group.origin,
    syllables: group.syllables.map(cloneSyllable),
  };
}

function clonePresent(present: DraftPresent): DraftPresent {
  return {
    wordGroups: present.wordGroups.map(cloneWordGroup),
    availableRackTiles: present.availableRackTiles.map(cloneRackTile),
  };
}

function publicPlacementToDraft(
  placement: PublicBoardTilePlacement,
): DraftPlacedTile {
  if (placement.kind === "JOKER") {
    return {
      tileId: placement.tileId,
      kind: "JOKER",
      physicalType: "JOKER",
      assignedSymbol: placement.assignedSymbol,
      allowedSymbols: [...placement.allowedSymbols],
      origin: "CANONICAL_BOARD",
    };
  }

  return {
    tileId: placement.tileId,
    kind: "ORDINARY",
    physicalType: placement.physicalType,
    assignedSymbol: placement.assignedSymbol,
    allowedSymbols: [...placement.allowedSymbols],
    origin: "CANONICAL_BOARD",
  };
}

function publicComponentsToDraft(
  components: readonly PublicBoardTilePlacement[],
): readonly [DraftPlacedTile | null, DraftPlacedTile | null] {
  return [
    components[0] === undefined
      ? null
      : publicPlacementToDraft(components[0]),
    components[1] === undefined
      ? null
      : publicPlacementToDraft(components[1]),
  ];
}

function canonicalWordGroups(
  snapshot: PlayingStateSnapshot,
): readonly DraftWordGroup[] {
  return snapshot.game.board.wordGroups.map((group) => ({
    groupId: group.groupId,
    origin: "CANONICAL_BOARD",
    syllables: group.syllables.map((syllable) => ({
      choseong:
        syllable.choseong[0] === undefined
          ? null
          : publicPlacementToDraft(syllable.choseong[0]),
      jungseong: publicComponentsToDraft(syllable.jungseong),
      jongseong: publicComponentsToDraft(syllable.jongseong),
    })),
  }));
}

function boardTileIds(groups: readonly DraftWordGroup[]): readonly TileId[] {
  const tileIds: TileId[] = [];

  for (const group of groups) {
    for (const syllable of group.syllables) {
      if (syllable.choseong !== null) {
        tileIds.push(syllable.choseong.tileId);
      }
      for (const tile of syllable.jungseong) {
        if (tile !== null) {
          tileIds.push(tile.tileId);
        }
      }
      for (const tile of syllable.jongseong) {
        if (tile !== null) {
          tileIds.push(tile.tileId);
        }
      }
    }
  }

  return tileIds;
}

/** Creates an editable draft only for the active, command-capable Player. */
export function createTurnDraft(
  snapshot: PlayingStateSnapshot,
  isCurrentCommandSession = true,
): TurnDraft | null {
  if (
    !isCurrentCommandSession ||
    snapshot.self.playerId !== snapshot.game.turn.activePlayerId
  ) {
    return null;
  }

  const selfPublicView = snapshot.room.players.find(
    (player) => player.playerId === snapshot.self.playerId,
  );
  if (selfPublicView === undefined) {
    return null;
  }

  const wordGroups = canonicalWordGroups(snapshot);
  const rackTiles = snapshot.self.rack.map(cloneRackTile);
  const canonicalTileIds = boardTileIds(wordGroups);
  const canonicalTileIdSet = new Set(canonicalTileIds);
  if (rackTiles.some((tile) => canonicalTileIdSet.has(tile.tileId))) {
    return null;
  }
  const baseline = clonePresent({
    wordGroups,
    availableRackTiles: rackTiles,
  });

  return {
    baseGameId: snapshot.game.gameId,
    baseGameRevision: snapshot.versions.gameRevision,
    baseTurnId: snapshot.game.turn.turnId,
    mode: selfPublicView.initialMeldCompleted
      ? "REARRANGEMENT"
      : "INITIAL_MELD",
    wordGroups: baseline.wordGroups.map(cloneWordGroup),
    availableRackTiles: baseline.availableRackTiles.map(cloneRackTile),
    rackTiles: rackTiles.map(cloneRackTile),
    canonicalBoardTileIds: [...canonicalTileIds],
    baseline,
    history: [],
  };
}

export function getAvailableRackTiles(
  draft: TurnDraft,
): readonly PrivateRackTileView[] {
  return draft.availableRackTiles;
}

export function getAssignableSymbols(
  tile: PrivateRackTileView | DraftPlacedTile,
): readonly string[] {
  return tile.allowedSymbols;
}

export function findDraftTile(
  draft: TurnDraft,
  tileId: TileId,
): LocatedDraftTile | null {
  const rackTile = draft.availableRackTiles.find(
    (candidate) => candidate.tileId === tileId,
  );
  if (rackTile !== undefined) {
    return { source: "AVAILABLE_RACK", tile: rackTile };
  }

  for (const group of draft.wordGroups) {
    for (
      let syllableIndex = 0;
      syllableIndex < group.syllables.length;
      syllableIndex += 1
    ) {
      const syllable = group.syllables[syllableIndex];
      if (syllable === undefined) {
        continue;
      }

      if (syllable.choseong?.tileId === tileId) {
        return {
          source: "BOARD",
          tile: syllable.choseong,
          location: {
            groupId: group.groupId,
            syllableIndex,
            role: "choseong",
            componentIndex: 0,
          },
        };
      }

      for (const role of ["jungseong", "jongseong"] as const) {
        for (const componentIndex of [0, 1] as const) {
          const tile = syllable[role][componentIndex];
          if (tile?.tileId === tileId) {
            return {
              source: "BOARD",
              tile,
              location: {
                groupId: group.groupId,
                syllableIndex,
                role,
                componentIndex,
              },
            };
          }
        }
      }
    }
  }

  return null;
}

export function getDraftTileAtSlot(
  draft: TurnDraft,
  target: DraftSlotTarget,
): DraftPlacedTile | null | undefined {
  const group = draft.wordGroups.find(
    (candidate) => candidate.groupId === target.groupId,
  );
  const syllable = group?.syllables[target.syllableIndex];
  if (syllable === undefined) {
    return undefined;
  }

  if (target.role === "choseong") {
    return target.componentIndex === 0 ? syllable.choseong : undefined;
  }

  return syllable[target.role][target.componentIndex];
}

function fail(code: TurnDraftEditErrorCode): TurnDraftEditResult {
  return { ok: false, error: { code } };
}

function succeed(draft: TurnDraft): TurnDraftEditResult {
  return { ok: true, draft };
}

function currentPresent(draft: TurnDraft): DraftPresent {
  return {
    wordGroups: draft.wordGroups,
    availableRackTiles: draft.availableRackTiles,
  };
}

function commitEdit(
  draft: TurnDraft,
  nextPresent: DraftPresent,
): TurnDraft {
  const nextHistory = [
    ...draft.history,
    clonePresent(currentPresent(draft)),
  ].slice(-TURN_DRAFT_HISTORY_LIMIT);

  return {
    ...draft,
    wordGroups: nextPresent.wordGroups.map(cloneWordGroup),
    availableRackTiles: nextPresent.availableRackTiles.map(cloneRackTile),
    history: nextHistory,
  };
}

function emptySyllable(): DraftSyllable {
  return {
    choseong: null,
    jungseong: [null, null],
    jongseong: [null, null],
  };
}

function isEmptySyllable(syllable: DraftSyllable): boolean {
  return (
    syllable.choseong === null &&
    syllable.jungseong.every((tile) => tile === null) &&
    syllable.jongseong.every((tile) => tile === null)
  );
}

function isInitialMeldLockedGroup(
  draft: TurnDraft,
  group: DraftWordGroup,
): boolean {
  return draft.mode === "INITIAL_MELD" && group.origin === "CANONICAL_BOARD";
}

export function addDraftWordGroup(
  draft: TurnDraft,
  groupId: string,
): TurnDraftEditResult {
  if (draft.wordGroups.some((group) => group.groupId === groupId)) {
    return fail("DUPLICATE_GROUP_ID");
  }

  return succeed(
    commitEdit(draft, {
      wordGroups: [
        ...draft.wordGroups,
        { groupId, origin: "LOCAL", syllables: [] },
      ],
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

export function addDraftSyllable(
  draft: TurnDraft,
  groupId: string,
): TurnDraftEditResult {
  const group = draft.wordGroups.find(
    (candidate) => candidate.groupId === groupId,
  );
  if (group === undefined) {
    return fail("GROUP_NOT_FOUND");
  }
  if (isInitialMeldLockedGroup(draft, group)) {
    return fail("INITIAL_MELD_BOARD_LOCKED");
  }

  return succeed(
    commitEdit(draft, {
      wordGroups: draft.wordGroups.map((candidate) =>
        candidate.groupId === groupId
          ? {
              ...candidate,
              syllables: [...candidate.syllables, emptySyllable()],
            }
          : candidate,
      ),
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

export function removeEmptyDraftSyllable(
  draft: TurnDraft,
  groupId: string,
  syllableIndex: number,
): TurnDraftEditResult {
  const group = draft.wordGroups.find(
    (candidate) => candidate.groupId === groupId,
  );
  if (group === undefined) {
    return fail("GROUP_NOT_FOUND");
  }
  if (isInitialMeldLockedGroup(draft, group)) {
    return fail("INITIAL_MELD_BOARD_LOCKED");
  }

  const syllable = group.syllables[syllableIndex];
  if (syllable === undefined) {
    return fail("SYLLABLE_NOT_FOUND");
  }
  if (!isEmptySyllable(syllable)) {
    return fail("SYLLABLE_NOT_EMPTY");
  }

  return succeed(
    commitEdit(draft, {
      wordGroups: draft.wordGroups.map((candidate) =>
        candidate.groupId === groupId
          ? {
              ...candidate,
              syllables: candidate.syllables.filter(
                (_, index) => index !== syllableIndex,
              ),
            }
          : candidate,
      ),
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

export function removeEmptyDraftWordGroup(
  draft: TurnDraft,
  groupId: string,
): TurnDraftEditResult {
  const group = draft.wordGroups.find(
    (candidate) => candidate.groupId === groupId,
  );
  if (group === undefined) {
    return fail("GROUP_NOT_FOUND");
  }
  if (isInitialMeldLockedGroup(draft, group)) {
    return fail("INITIAL_MELD_BOARD_LOCKED");
  }
  if (!group.syllables.every(isEmptySyllable)) {
    return fail("GROUP_NOT_EMPTY");
  }

  return succeed(
    commitEdit(draft, {
      wordGroups: draft.wordGroups.filter(
        (candidate) => candidate.groupId !== groupId,
      ),
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

function validateTarget(
  draft: TurnDraft,
  target: DraftSlotTarget,
):
  | Readonly<{ ok: true; group: DraftWordGroup }>
  | Readonly<{ ok: false; code: TurnDraftEditErrorCode }> {
  const group = draft.wordGroups.find(
    (candidate) => candidate.groupId === target.groupId,
  );
  if (group === undefined) {
    return { ok: false, code: "GROUP_NOT_FOUND" };
  }
  if (isInitialMeldLockedGroup(draft, group)) {
    return { ok: false, code: "INITIAL_MELD_BOARD_LOCKED" };
  }
  if (group.syllables[target.syllableIndex] === undefined) {
    return { ok: false, code: "SYLLABLE_NOT_FOUND" };
  }
  if (target.role === "choseong" && target.componentIndex !== 0) {
    return { ok: false, code: "INVALID_SLOT" };
  }

  return { ok: true, group };
}

function supportsAssignedSymbol(
  tile: PrivateRackTileView | DraftPlacedTile,
  assignedSymbol: string,
): boolean {
  return getAssignableSymbols(tile).includes(assignedSymbol);
}

function rackTileToPlacement(
  tile: PrivateRackTileView,
  assignedSymbol: string,
): DraftPlacedTile {
  if (tile.kind === "JOKER") {
    return {
      tileId: tile.tileId,
      kind: "JOKER",
      physicalType: "JOKER",
      assignedSymbol,
      allowedSymbols: [...tile.allowedSymbols],
      origin: "SELF_RACK",
    };
  }

  return {
    tileId: tile.tileId,
    kind: "ORDINARY",
    physicalType: tile.physicalType,
    assignedSymbol,
    allowedSymbols: [...tile.allowedSymbols],
    origin: "SELF_RACK",
  };
}

function withAssignedSymbol(
  tile: DraftPlacedTile,
  assignedSymbol: string,
): DraftPlacedTile {
  return tile.kind === "JOKER"
    ? { ...tile, assignedSymbol, allowedSymbols: [...tile.allowedSymbols] }
    : { ...tile, assignedSymbol, allowedSymbols: [...tile.allowedSymbols] };
}

function replaceSyllableSlot(
  syllable: DraftSyllable,
  target: Pick<DraftSlotTarget, "role" | "componentIndex">,
  tile: DraftPlacedTile | null,
): DraftSyllable {
  if (target.role === "choseong") {
    return { ...syllable, choseong: tile };
  }

  const components = syllable[target.role];
  const replacement: readonly [
    DraftPlacedTile | null,
    DraftPlacedTile | null,
  ] =
    target.componentIndex === 0
      ? [tile, components[1]]
      : [components[0], tile];

  return { ...syllable, [target.role]: replacement };
}

function replaceBoardSlot(
  groups: readonly DraftWordGroup[],
  target: DraftSlotTarget,
  tile: DraftPlacedTile | null,
): readonly DraftWordGroup[] {
  return groups.map((group) =>
    group.groupId === target.groupId
      ? {
          ...group,
          syllables: group.syllables.map((syllable, index) =>
            index === target.syllableIndex
              ? replaceSyllableSlot(syllable, target, tile)
              : syllable,
          ),
        }
      : group,
  );
}

function sameLocation(
  left: DraftBoardTileLocation,
  right: DraftBoardTileLocation,
): boolean {
  return (
    left.groupId === right.groupId &&
    left.syllableIndex === right.syllableIndex &&
    left.role === right.role &&
    left.componentIndex === right.componentIndex
  );
}

/**
 * Moves, rather than copies, a physical Tile. An occupied destination is
 * rejected so no displaced Tile can be lost implicitly.
 */
export function placeDraftTile(
  draft: TurnDraft,
  tileId: TileId,
  assignedSymbol: string,
  target: DraftSlotTarget,
): TurnDraftEditResult {
  const targetValidation = validateTarget(draft, target);
  if (!targetValidation.ok) {
    return fail(targetValidation.code);
  }

  const located = findDraftTile(draft, tileId);
  if (located === null) {
    if (
      draft.mode === "INITIAL_MELD" &&
      draft.canonicalBoardTileIds.includes(tileId)
    ) {
      return fail("INITIAL_MELD_BOARD_LOCKED");
    }
    return fail("TILE_NOT_FOUND");
  }
  if (
    located.source === "BOARD" &&
    located.tile.origin === "CANONICAL_BOARD" &&
    draft.mode === "INITIAL_MELD"
  ) {
    return fail("INITIAL_MELD_BOARD_LOCKED");
  }
  if (!supportsAssignedSymbol(located.tile, assignedSymbol)) {
    return fail("INVALID_ASSIGNED_SYMBOL");
  }

  const targetTile = getDraftTileAtSlot(draft, target);
  if (targetTile === undefined) {
    return fail("INVALID_SLOT");
  }
  if (
    targetTile !== null &&
    (located.source !== "BOARD" ||
      !sameLocation(located.location, target))
  ) {
    return fail("SLOT_OCCUPIED");
  }

  if (
    located.source === "BOARD" &&
    sameLocation(located.location, target) &&
    located.tile.assignedSymbol === assignedSymbol
  ) {
    return succeed(draft);
  }

  const placement =
    located.source === "AVAILABLE_RACK"
      ? rackTileToPlacement(located.tile, assignedSymbol)
      : withAssignedSymbol(located.tile, assignedSymbol);
  const groupsWithoutSource =
    located.source === "BOARD"
      ? replaceBoardSlot(draft.wordGroups, located.location, null)
      : draft.wordGroups;
  const nextGroups = replaceBoardSlot(
    groupsWithoutSource,
    target,
    placement,
  );
  const nextRack =
    located.source === "AVAILABLE_RACK"
      ? draft.availableRackTiles.filter((tile) => tile.tileId !== tileId)
      : draft.availableRackTiles;

  return succeed(
    commitEdit(draft, {
      wordGroups: nextGroups,
      availableRackTiles: nextRack,
    }),
  );
}

export function moveDraftTile(
  draft: TurnDraft,
  tileId: TileId,
  assignedSymbol: string,
  target: DraftSlotTarget,
): TurnDraftEditResult {
  return placeDraftTile(draft, tileId, assignedSymbol, target);
}

export function changeDraftTileAssignedSymbol(
  draft: TurnDraft,
  tileId: TileId,
  assignedSymbol: string,
): TurnDraftEditResult {
  const located = findDraftTile(draft, tileId);
  if (located === null) {
    return fail("TILE_NOT_FOUND");
  }
  if (located.source === "AVAILABLE_RACK") {
    return fail("TILE_NOT_FOUND");
  }
  if (
    located.tile.origin === "CANONICAL_BOARD" &&
    draft.mode === "INITIAL_MELD"
  ) {
    return fail("INITIAL_MELD_BOARD_LOCKED");
  }
  if (!supportsAssignedSymbol(located.tile, assignedSymbol)) {
    return fail("INVALID_ASSIGNED_SYMBOL");
  }
  if (located.tile.assignedSymbol === assignedSymbol) {
    return succeed(draft);
  }

  return succeed(
    commitEdit(draft, {
      wordGroups: replaceBoardSlot(
        draft.wordGroups,
        located.location,
        withAssignedSymbol(located.tile, assignedSymbol),
      ),
      availableRackTiles: draft.availableRackTiles,
    }),
  );
}

export function returnDraftTileToRack(
  draft: TurnDraft,
  tileId: TileId,
): TurnDraftEditResult {
  const located = findDraftTile(draft, tileId);
  if (located === null) {
    return fail("TILE_NOT_FOUND");
  }
  if (located.source === "AVAILABLE_RACK") {
    return succeed(draft);
  }
  if (located.tile.origin === "CANONICAL_BOARD") {
    return fail("CANONICAL_TILE_CANNOT_RETURN_TO_RACK");
  }

  const availableIds = new Set([
    ...draft.availableRackTiles.map((tile) => tile.tileId),
    tileId,
  ]);
  const restoredRack = draft.rackTiles.filter((tile) =>
    availableIds.has(tile.tileId),
  );

  return succeed(
    commitEdit(draft, {
      wordGroups: replaceBoardSlot(
        draft.wordGroups,
        located.location,
        null,
      ),
      availableRackTiles: restoredRack,
    }),
  );
}

export function undoTurnDraft(draft: TurnDraft): TurnDraftEditResult {
  const previous = draft.history.at(-1);
  if (previous === undefined) {
    return fail("NO_UNDO_HISTORY");
  }

  const restored = clonePresent(previous);
  return succeed({
    ...draft,
    wordGroups: restored.wordGroups,
    availableRackTiles: restored.availableRackTiles,
    history: draft.history.slice(0, -1).map(clonePresent),
  });
}

/** Resets only browser memory to the authoritative baseline captured for this draft. */
export function resetTurnDraft(draft: TurnDraft): TurnDraft {
  const baseline = clonePresent(draft.baseline);
  return {
    ...draft,
    wordGroups: baseline.wordGroups,
    availableRackTiles: baseline.availableRackTiles,
    history: [],
  };
}

function presentFingerprint(present: DraftPresent): string {
  return JSON.stringify({
    wordGroups: present.wordGroups,
    availableRackTileIds: present.availableRackTiles.map(
      (tile) => tile.tileId,
    ),
  });
}

export function isTurnDraftDirty(draft: TurnDraft): boolean {
  return (
    presentFingerprint(currentPresent(draft)) !==
    presentFingerprint(draft.baseline)
  );
}

/**
 * Presence-only and duplicate snapshots keep browser edits. A different Game,
 * a newer canonical revision, a different Turn, or loss of turn ownership
 * resets them instead of attempting an unsafe merge.
 */
export function decideTurnDraftReconciliation(
  draft: TurnDraft,
  incomingSnapshot: StateSnapshot,
): TurnDraftReconciliationDecision {
  if (!("game" in incomingSnapshot)) {
    return "RESET_DRAFT";
  }

  if (
    incomingSnapshot.game.gameId !== draft.baseGameId ||
    incomingSnapshot.versions.gameRevision !== draft.baseGameRevision ||
    incomingSnapshot.game.turn.turnId !== draft.baseTurnId ||
    incomingSnapshot.self.playerId !==
      incomingSnapshot.game.turn.activePlayerId
  ) {
    return "RESET_DRAFT";
  }

  return "KEEP_DRAFT";
}
