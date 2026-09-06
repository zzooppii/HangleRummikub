import type {
  NumberTileColor,
  NumberTileNumber,
  NumberTilePlayingPlatformSnapshotV2,
  TileId,
} from "@hangul-rummikub/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  addNumberTileDraftMeld,
  assignNumberTileDraftJoker,
  canEditNumberTileTurnDraft,
  createNumberTileTurnDraft,
  decideNumberTileTurnDraftReconciliation,
  isNumberTileTurnDraftDirty,
  placeNumberTileDraftTile,
  removeEmptyNumberTileDraftMeld,
  resetNumberTileTurnDraft,
  returnNumberTileDraftTileToRack,
  undoNumberTileTurnDraft,
  type NumberTileDraftMeldKind,
  type NumberTileDraftTarget,
  type NumberTileTurnDraft,
  type NumberTileTurnDraftEditErrorCode,
  type NumberTileTurnDraftEditResult,
} from "./number-tile-turn-draft.js";

const STALE_DRAFT_MESSAGE =
  "게임 상태가 변경되어 숫자 타일 편집 내용이 초기화되었습니다.";

const EDIT_ERROR_MESSAGES: Readonly<
  Record<NumberTileTurnDraftEditErrorCode, string>
> = {
  MELD_NOT_FOUND: "편집할 조합을 찾을 수 없습니다.",
  MELD_NOT_EMPTY: "타일이 남은 조합은 삭제할 수 없습니다.",
  INVALID_TARGET: "선택한 위치에 타일을 놓을 수 없습니다.",
  TILE_NOT_FOUND: "선택한 타일을 현재 편집 상태에서 찾을 수 없습니다.",
  TILE_NOT_JOKER: "조커 타일만 대체 숫자와 색상을 지정할 수 있습니다.",
  JOKER_NOT_ON_TABLE: "테이블에 놓은 조커의 값을 지정해주세요.",
  INITIAL_MELD_TABLE_LOCKED:
    "첫 등록을 마치기 전에는 기존 테이블을 변경할 수 없습니다.",
  CANONICAL_TILE_CANNOT_RETURN_TO_RACK:
    "기존 테이블 타일은 랙으로 가져갈 수 없습니다.",
  NO_UNDO_HISTORY: "되돌릴 편집이 없습니다.",
};

type EditorState = Readonly<{
  draft: NumberTileTurnDraft | null;
  noticeMessage: string | null;
  editErrorMessage: string | null;
}>;

export type NumberTileTurnDraftController = Readonly<{
  draft: NumberTileTurnDraft | null;
  noticeMessage: string | null;
  editErrorMessage: string | null;
  isDirty: boolean;
  canEdit: boolean;
  addMeld: (kind: NumberTileDraftMeldKind) => void;
  removeEmptyMeld: (meldIndex: number) => void;
  placeTile: (tileId: TileId, target: NumberTileDraftTarget) => void;
  returnTileToRack: (tileId: TileId) => void;
  assignJoker: (
    tileId: TileId,
    number: NumberTileNumber,
    color: NumberTileColor,
  ) => void;
  undo: () => void;
  reset: () => void;
  clearFeedback: () => void;
}>;

function createState(
  snapshot: NumberTilePlayingPlatformSnapshotV2,
  commandCapable: boolean,
): EditorState {
  return {
    draft: createNumberTileTurnDraft(snapshot, commandCapable),
    noticeMessage: null,
    editErrorMessage: null,
  };
}

export function useNumberTileTurnDraft(
  snapshot: NumberTilePlayingPlatformSnapshotV2,
  commandCapable: boolean,
  sessionReplaced: boolean,
  authorityResetGeneration = 0,
): NumberTileTurnDraftController {
  const currentCommandSession = commandCapable && !sessionReplaced;
  const handledResetRef = useRef(authorityResetGeneration);
  const [state, setState] = useState<EditorState>(() =>
    createState(snapshot, currentCommandSession),
  );

  useEffect(() => {
    setState((current) => {
      if (sessionReplaced) {
        return { draft: null, noticeMessage: null, editErrorMessage: null };
      }
      if (handledResetRef.current !== authorityResetGeneration) {
        handledResetRef.current = authorityResetGeneration;
        return {
          draft: createNumberTileTurnDraft(snapshot, currentCommandSession),
          noticeMessage: STALE_DRAFT_MESSAGE,
          editErrorMessage: null,
        };
      }
      if (current.draft === null) {
        const draft = createNumberTileTurnDraft(
          snapshot,
          currentCommandSession,
        );
        return draft === null
          ? current
          : { draft, noticeMessage: null, editErrorMessage: null };
      }
      if (
        decideNumberTileTurnDraftReconciliation(current.draft, snapshot) ===
        "KEEP_DRAFT"
      ) {
        return current;
      }
      return {
        draft: createNumberTileTurnDraft(snapshot, currentCommandSession),
        noticeMessage: isNumberTileTurnDraftDirty(current.draft)
          ? STALE_DRAFT_MESSAGE
          : null,
        editErrorMessage: null,
      };
    });
  }, [
    authorityResetGeneration,
    currentCommandSession,
    sessionReplaced,
    snapshot,
  ]);

  const applyEdit = useCallback(
    (edit: (draft: NumberTileTurnDraft) => NumberTileTurnDraftEditResult) => {
      setState((current) => {
        if (
          sessionReplaced ||
          current.draft === null ||
          !canEditNumberTileTurnDraft(
            current.draft,
            snapshot,
            currentCommandSession,
          )
        ) {
          return current;
        }
        const result = edit(current.draft);
        return result.ok
          ? { ...current, draft: result.draft, editErrorMessage: null }
          : {
              ...current,
              editErrorMessage: EDIT_ERROR_MESSAGES[result.error.code],
            };
      });
    },
    [currentCommandSession, sessionReplaced, snapshot],
  );

  const effectiveDraft =
    sessionReplaced ||
    (state.draft !== null &&
      decideNumberTileTurnDraftReconciliation(state.draft, snapshot) !==
        "KEEP_DRAFT")
      ? null
      : state.draft;

  return {
    draft: effectiveDraft,
    noticeMessage: state.noticeMessage,
    editErrorMessage: state.editErrorMessage,
    isDirty:
      effectiveDraft === null
        ? false
        : isNumberTileTurnDraftDirty(effectiveDraft),
    canEdit: canEditNumberTileTurnDraft(
      effectiveDraft,
      snapshot,
      currentCommandSession,
    ),
    addMeld: (kind) => applyEdit((draft) => addNumberTileDraftMeld(draft, kind)),
    removeEmptyMeld: (meldIndex) =>
      applyEdit((draft) => removeEmptyNumberTileDraftMeld(draft, meldIndex)),
    placeTile: (tileId, target) =>
      applyEdit((draft) => placeNumberTileDraftTile(draft, tileId, target)),
    returnTileToRack: (tileId) =>
      applyEdit((draft) => returnNumberTileDraftTileToRack(draft, tileId)),
    assignJoker: (tileId, number, color) =>
      applyEdit((draft) =>
        assignNumberTileDraftJoker(draft, tileId, { number, color }),
      ),
    undo: () => applyEdit(undoNumberTileTurnDraft),
    reset: () => {
      setState((current) => {
        if (
          current.draft === null ||
          !canEditNumberTileTurnDraft(
            current.draft,
            snapshot,
            currentCommandSession,
          )
        ) {
          return current;
        }
        return {
          ...current,
          draft: resetNumberTileTurnDraft(current.draft),
          editErrorMessage: null,
        };
      });
    },
    clearFeedback: () => {
      setState((current) => ({
        ...current,
        noticeMessage: null,
        editErrorMessage: null,
      }));
    },
  };
}
