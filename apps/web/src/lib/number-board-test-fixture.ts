import * as v from "valibot";
import { NUMBER_TILE_COLORS, NumberTilePlayingPlatformSnapshotV2Schema, type NumberTilePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { createNumberTileTurnDraft } from "../features/number-tile/number-tile-turn-draft.js";
import type { NumberTilePlayingScreenProps } from "../features/number-tile/NumberTilePlayingScreen.js";

/** Layout-only fixture. Counts remain coherent; IDs never reach a runtime Room. */
export function numberBoardFixture(meldCount = 3, rackCount = 14, runLength = 3, active = true, groups = false): NumberTilePlayingPlatformSnapshotV2 {
  const melds = Array.from({ length: meldCount }, (_, index) => ({
    kind: groups ? "GROUP" : "RUN", tiles: Array.from({ length: runLength }, (_tile, position) => ({
      kind: "ORDINARY", tileId: `board-${index}-${position}`, color: NUMBER_TILE_COLORS[groups ? position % 4 : index % 4], number: groups ? index % 13 + 1 : position + 1,
    })),
  }));
  const rack = Array.from({ length: rackCount }, (_, index) => ({ kind: "ORDINARY", tileId: `rack-${index}`, color: NUMBER_TILE_COLORS[index % 4], number: index % 13 + 1 }));
  const now = Date.now();
  return v.parse(NumberTilePlayingPlatformSnapshotV2Schema, {
    snapshotVersion: 2, versions: { roomRevision: 4, presenceVersion: 1 }, serverTime: now,
    room: { roomId: "board-fixture", roomCode: "ABC234", phase: "PLAYING", gameType: "NUMBER_TILE", players: [
      { playerId: "self", nickname: "서연", isHost: true, connectionStatus: "CONNECTED" },
      { playerId: "other", nickname: "민준", isHost: false, connectionStatus: "CONNECTED" },
    ] }, self: { playerId: "self" },
    game: { gameType: "NUMBER_TILE", gameId: "board-game", gameRevision: 1,
      remainingPoolCount: 106 - meldCount * runLength - rackCount - 14,
      table: { melds }, playerStates: [
        { playerId: "self", rackCount, initialMeldCompleted: meldCount > 0, forfeited: false },
        { playerId: "other", rackCount: 14, initialMeldCompleted: true, forfeited: false },
      ], turn: { turnId: "board-turn", turnNumber: 1, activePlayerId: active ? "self" : "other", startedAt: now, deadlineAt: now + 90000 },
      privateState: { rack },
    },
  });
}

export function numberBoardProps(snapshot = numberBoardFixture()): NumberTilePlayingScreenProps {
  const draft = createNumberTileTurnDraft(snapshot);
  return { snapshot, connectionLabel: "서버 연결됨", connectionTone: "connected", errorMessage: null, sessionReplaced: false,
    turnDraft: { draft, canEdit: draft !== null, isDirty: false, noticeMessage: null, editErrorMessage: null,
      addMeld() {}, removeEmptyMeld() {}, placeTile() {}, appendTileToMeld() {}, placeTileInNewMeld() {}, returnTileToRack() {}, chooseJokerNumber() {}, undo() {}, reset() {}, clearFeedback() {},
    }, submitPending: false, actionPending: false, commandRetryKind: null, actionFeedback: null, roomLeavePending: false, canSubmit: draft !== null, canAct: draft !== null,
    onSubmit() {}, onDraw() {}, onPass() {}, onLeaveRoom() {}, onGoHome() {},
  };
}
