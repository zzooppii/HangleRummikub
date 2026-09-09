import { DrawRelayPlayingProjectionSchema,DrawRelayFinishedProjectionSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { DrawRelayStoredGame } from "./adapter.js";
import { relayPrivateAssignment,relayRevealedBooks,stageCount } from "../domain/game.js";
export function projectDrawRelay(game:DrawRelayStoredGame,viewer:string) {
  const s=game.state;
  const base={gameType:"DRAW_RELAY",gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,promptsVersion:s.promptsVersion,
    stageIndex:s.stageIndex,totalStages:stageCount(s.seatOrder.length),stageToken:s.stageToken,drawSeconds:s.drawSeconds,
    playerStates:s.players.map(p=>({playerId:p.playerId,forfeited:p.forfeited,submitted:s.submissions.includes(p.playerId)}))};
  if(s.phase==="FINISHED")return parse(DrawRelayFinishedProjectionSchema,{...base,phase:s.phase,reveal:s.reveal,books:relayRevealedBooks(s)});
  if(s.phase==="REVEAL")return parse(DrawRelayPlayingProjectionSchema,{...base,phase:s.phase,reveal:s.reveal,books:relayRevealedBooks(s)});
  return parse(DrawRelayPlayingProjectionSchema,{...base,phase:s.phase,deadlineAt:s.deadlineAt,privateState:relayPrivateAssignment(s,viewer)});
}
