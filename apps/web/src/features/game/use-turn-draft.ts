import type {
  PlayingStateSnapshot,
  TileId,
} from "@hangul-rummikub/shared";
import { useCallback, useEffect, useState } from "react";

import {
  addDraftSyllable,
  addDraftWordGroup,
  changeDraftTileAssignedSymbol,
  createTurnDraft,
  decideTurnDraftReconciliation,
  isTurnDraftDirty,
  moveDraftTile,
  removeEmptyDraftSyllable,
  removeEmptyDraftWordGroup,
  resetTurnDraft,
  returnDraftTileToRack,
  undoTurnDraft,
  type DraftSlotTarget,
  type TurnDraft,
  type TurnDraftEditErrorCode,
  type TurnDraftEditResult,
} from "../../lib/turn-draft.js";

const STALE_DRAFT_MESSAGE =
  "게임 상태가 변경되어 편집 내용이 초기화되었습니다.";

const EDIT_ERROR_MESSAGES: Readonly<Record<TurnDraftEditErrorCode, string>> = {
  DUPLICATE_GROUP_ID: "새 낱말 묶음을 만들지 못했습니다.",
  GROUP_NOT_FOUND: "편집할 낱말 묶음을 찾을 수 없습니다.",
  SYLLABLE_NOT_FOUND: "편집할 음절을 찾을 수 없습니다.",
  GROUP_NOT_EMPTY: "타일이 남아 있는 낱말 묶음은 삭제할 수 없습니다.",
  SYLLABLE_NOT_EMPTY: "타일이 남아 있는 음절은 삭제할 수 없습니다.",
  TILE_NOT_FOUND: "선택한 타일을 현재 편집 상태에서 찾을 수 없습니다.",
  SLOT_OCCUPIED: "이미 타일이 놓인 칸입니다. 먼저 다른 칸으로 옮겨주세요.",
  INVALID_SLOT: "이 역할에는 해당 칸을 사용할 수 없습니다.",
  INVALID_ASSIGNED_SYMBOL: "이 타일로 선택한 자모를 표현할 수 없습니다.",
  INITIAL_MELD_BOARD_LOCKED:
    "첫 등록 전에는 기존 보드 타일을 움직일 수 없습니다.",
  CANONICAL_TILE_CANNOT_RETURN_TO_RACK:
    "보드의 기존 타일은 랙으로 가져갈 수 없습니다. 다른 보드 칸으로 옮겨주세요.",
  NO_UNDO_HISTORY: "되돌릴 편집이 없습니다.",
};

type EditorState = Readonly<{
  draft: TurnDraft | null;
  noticeMessage: string | null;
  editErrorMessage: string | null;
}>;

export type TurnDraftController = Readonly<{
  draft: TurnDraft | null;
  noticeMessage: string | null;
  editErrorMessage: string | null;
  isDirty: boolean;
  canEdit: boolean;
  addWordGroup: () => void;
  addSyllable: (groupId: string) => void;
  removeEmptySyllable: (groupId: string, syllableIndex: number) => void;
  removeEmptyWordGroup: (groupId: string) => void;
  placeTile: (
    tileId: TileId,
    assignedSymbol: string,
    target: DraftSlotTarget,
  ) => void;
  changeAssignedSymbol: (tileId: TileId, assignedSymbol: string) => void;
  returnTileToRack: (tileId: TileId) => void;
  undo: () => void;
  reset: () => void;
  clearFeedback: () => void;
}>;

function createDraftGroupId(): string {
  return `draft-group-${crypto.randomUUID()}`;
}

function initialEditorState(
  snapshot: PlayingStateSnapshot,
  commandCapable: boolean,
): EditorState {
  return {
    draft: createTurnDraft(snapshot, commandCapable),
    noticeMessage: null,
    editErrorMessage: null,
  };
}

export function useTurnDraft(
  snapshot: PlayingStateSnapshot,
  commandCapable: boolean,
  sessionReplaced: boolean,
): TurnDraftController {
  const currentCommandSession = commandCapable && !sessionReplaced;
  const [state, setState] = useState<EditorState>(() =>
    initialEditorState(snapshot, currentCommandSession),
  );

  useEffect(() => {
    setState((current) => {
      if (sessionReplaced) {
        return {
          draft: null,
          noticeMessage: null,
          editErrorMessage: null,
        };
      }

      if (current.draft === null) {
        const nextDraft = createTurnDraft(snapshot, currentCommandSession);
        return nextDraft === null
          ? current
          : {
              draft: nextDraft,
              noticeMessage: null,
              editErrorMessage: null,
            };
      }

      if (
        decideTurnDraftReconciliation(current.draft, snapshot) ===
        "KEEP_DRAFT"
      ) {
        return current;
      }

      const discardedDirtyDraft = isTurnDraftDirty(current.draft);
      return {
        draft: createTurnDraft(snapshot, currentCommandSession),
        noticeMessage: discardedDirtyDraft ? STALE_DRAFT_MESSAGE : null,
        editErrorMessage: null,
      };
    });
  }, [currentCommandSession, sessionReplaced, snapshot]);

  const applyEdit = useCallback(
    (edit: (draft: TurnDraft) => TurnDraftEditResult): void => {
      setState((current) => {
        if (
          sessionReplaced ||
          current.draft === null ||
          decideTurnDraftReconciliation(current.draft, snapshot) !==
            "KEEP_DRAFT"
        ) {
          return current;
        }

        const result = edit(current.draft);
        return result.ok
          ? {
              ...current,
              draft: result.draft,
              editErrorMessage: null,
            }
          : {
              ...current,
              editErrorMessage: EDIT_ERROR_MESSAGES[result.error.code],
            };
      });
    },
    [sessionReplaced, snapshot],
  );

  const addWordGroup = useCallback(() => {
    applyEdit((draft) => addDraftWordGroup(draft, createDraftGroupId()));
  }, [applyEdit]);

  const addSyllable = useCallback(
    (groupId: string) => {
      applyEdit((draft) => addDraftSyllable(draft, groupId));
    },
    [applyEdit],
  );

  const removeEmptySyllable = useCallback(
    (groupId: string, syllableIndex: number) => {
      applyEdit((draft) =>
        removeEmptyDraftSyllable(draft, groupId, syllableIndex),
      );
    },
    [applyEdit],
  );

  const removeEmptyWordGroup = useCallback(
    (groupId: string) => {
      applyEdit((draft) => removeEmptyDraftWordGroup(draft, groupId));
    },
    [applyEdit],
  );

  const placeTile = useCallback(
    (tileId: TileId, assignedSymbol: string, target: DraftSlotTarget) => {
      applyEdit((draft) =>
        moveDraftTile(draft, tileId, assignedSymbol, target),
      );
    },
    [applyEdit],
  );

  const changeAssignedSymbol = useCallback(
    (tileId: TileId, assignedSymbol: string) => {
      applyEdit((draft) =>
        changeDraftTileAssignedSymbol(draft, tileId, assignedSymbol),
      );
    },
    [applyEdit],
  );

  const returnTileToRack = useCallback(
    (tileId: TileId) => {
      applyEdit((draft) => returnDraftTileToRack(draft, tileId));
    },
    [applyEdit],
  );

  const undo = useCallback(() => {
    applyEdit(undoTurnDraft);
  }, [applyEdit]);

  const reset = useCallback(() => {
    setState((current) =>
      sessionReplaced ||
      current.draft === null ||
      decideTurnDraftReconciliation(current.draft, snapshot) !== "KEEP_DRAFT"
        ? current
        : {
            ...current,
            draft: resetTurnDraft(current.draft),
            editErrorMessage: null,
      },
    );
  }, [sessionReplaced, snapshot]);

  const clearFeedback = useCallback(() => {
    setState((current) => ({
      ...current,
      noticeMessage: null,
      editErrorMessage: null,
    }));
  }, []);

  const effectiveDraft =
    sessionReplaced ||
    (state.draft !== null &&
      decideTurnDraftReconciliation(state.draft, snapshot) !== "KEEP_DRAFT")
      ? null
      : state.draft;

  return {
    draft: effectiveDraft,
    noticeMessage: state.noticeMessage,
    editErrorMessage: state.editErrorMessage,
    isDirty:
      effectiveDraft === null ? false : isTurnDraftDirty(effectiveDraft),
    canEdit: effectiveDraft !== null,
    addWordGroup,
    addSyllable,
    removeEmptySyllable,
    removeEmptyWordGroup,
    placeTile,
    changeAssignedSymbol,
    returnTileToRack,
    undo,
    reset,
    clearFeedback,
  };
}
