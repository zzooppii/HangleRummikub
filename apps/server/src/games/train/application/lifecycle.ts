import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelTrain } from "../domain/game.js";
import { transitionTrain } from "./service.js";
export function createTrainLifecycle() {
    return {
        applyPlayingLeave(input: {
            room: RoomRecord;
            actorPlayerId: PlayerId;
            occurredAt: ServerTime;
        }): PlayingLeaveActionResult {
            const { room } = input;
            if (room.gameType !== 'TRAIN' || room.phase !== 'PLAYING' || !room.game)
                throw new Error('Train playing room required.');
            const state = cancelTrain(room.game.state, input.occurredAt);
            return { candidate: transitionTrain(room, state, input.occurredAt), advisory: 'NONE', finishedGameId: room.game.gameId, nextTurnIdentity: null };
        },
    };
}
