import type { TileId } from "@hangul-rummikub/shared";
import { findNumberTileDraftTile, type NumberTileTurnDraft } from "./number-tile-turn-draft.js";

/** Number editor intent only. All moves still use the existing atomic draft operations. */
export function numberTileTableTap(
  draft: NumberTileTurnDraft | null, selectedTileId: TileId | null, tappedTileId: TileId, canEdit: boolean,
): Readonly<{ kind: "IGNORE" | "CANCEL" }> | Readonly<{ kind: "SELECT"; tileId: TileId; meldIndex: number }> | Readonly<{ kind: "MOVE"; tileId: TileId; meldIndex: number }> {
  if (draft === null || !canEdit) return { kind: "IGNORE" };
  const tapped = findNumberTileDraftTile(draft, tappedTileId);
  if (tapped?.source !== "TABLE") return { kind: "IGNORE" };
  if (draft.mode === "INITIAL_MELD" && draft.table.melds[tapped.meldIndex]?.origin === "CANONICAL_TABLE") return { kind: "IGNORE" };
  if (selectedTileId === tappedTileId) return { kind: "CANCEL" };
  const selected = selectedTileId === null ? null : findNumberTileDraftTile(draft, selectedTileId);
  if (selected?.source === "TABLE" && selected.meldIndex !== tapped.meldIndex) {
    if (draft.mode === "INITIAL_MELD" && draft.table.melds[selected.meldIndex]?.origin === "CANONICAL_TABLE") return { kind: "IGNORE" };
    return { kind: "MOVE", tileId: selected.tile.tileId, meldIndex: tapped.meldIndex };
  }
  return { kind: "SELECT", tileId: tappedTileId, meldIndex: tapped.meldIndex };
}
