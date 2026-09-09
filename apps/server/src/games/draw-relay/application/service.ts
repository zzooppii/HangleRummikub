import { GameRevisionSchema,RoomRevisionSchema,ServerTimeSchema,TurnIdSchema,RequestIdSchema,
  type DrawClientCommand,type ErrorDto,type RoomId,type PlayerId,type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { StartGameInput,GameStartResult } from "../../../application/game-start-service.js";
import { GameStartSuccessDataSchema } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock,IdGenerator,RandomSource,TurnScheduler,ScheduledTurnDeadline } from "../../../ports/system.js";
import type { DrawRelayRoomRecord,RoomWriteCandidate } from "../../../model/persistence.js";
import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import { createDrawRelay,applyRelayAction,timeoutRelay,revealNext,type DrawRelayState } from "../domain/game.js";
import { DRAW_PROMPTS } from "../domain/prompts-v1.js";

export type DrawDependencies = Readonly<{ roomRepository:RoomRepository;roomUnitOfWork:RoomUnitOfWork;idempotencyRepository:IdempotencyRepository;
  roomMutationExecutor:RoomMutationSerialExecutor;presence:RoomPresencePolicyReader;clock:Clock;ids:IdGenerator;random:RandomSource;turnScheduler:TurnScheduler }>;
const failure=(code:ErrorDto["code"])=>({ok:false as const,error:{code,message:"요청을 처리할 수 없습니다. 현재 단계와 연결을 확인해주세요.",recoverable:true}});
export function transitionDraw(room:DrawRelayRoomRecord,state:DrawRelayState,at:ServerTime):RoomWriteCandidate & {gameType:"DRAW_RELAY"} {
  if(!room.game)throw new Error("Missing DRAW game.");
  const phase=state.phase==="FINISHED"?"FINISHED":"PLAYING";
  return {...room,phase,game:{...room.game,state,gameRevision:parse(GameRevisionSchema,state.revision),finishedAt:state.finishedAt===null?null:parse(ServerTimeSchema,state.finishedAt)},
    roomRevision:phase===room.phase?room.roomRevision:parse(RoomRevisionSchema,room.roomRevision+1),updatedAt:at};
}
export class DrawRelayService {
  readonly listeners=new Set<(roomId:RoomId)=>void|Promise<void>>();
  constructor(readonly deps:DrawDependencies){}
  subscribe(listener:(roomId:RoomId)=>void|Promise<void>){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  async notify(roomId:RoomId){await Promise.allSettled([...this.listeners].map(fn=>Promise.resolve().then(()=>fn(roomId))));}
  async schedule(roomId:RoomId){
    const room=await this.deps.roomRepository.findById(roomId);
    if(room?.gameType!=="DRAW_RELAY"||!room.game||room.game.state.deadlineAt===null)return;
    await this.deps.turnScheduler.scheduleTimeout({roomId,gameId:room.game.gameId,expectedGameRevision:room.game.gameRevision,turnId:parse(TurnIdSchema,room.game.state.stageToken),deadlineAt:parse(ServerTimeSchema,room.game.state.deadlineAt)});
  }
  async start(input:StartGameInput):Promise<GameStartResult>{
    try {
      const result=await this.deps.roomMutationExecutor.run(input.roomId,async():Promise<GameStartResult>=>{
        const room=await this.deps.roomRepository.findById(input.roomId);
        if(!input.authorization.isCurrent())return failure("UNAUTHENTICATED");
        if(room?.gameType!=="DRAW_RELAY")return failure("INVALID_PHASE");
        const scopeKey=`room-player:${input.roomId}:${input.actorPlayerId}`,payloadFingerprint=JSON.stringify(["game:start",input.expectedRoomRevision]);
        const prior=await this.deps.idempotencyRepository.classify(scopeKey,input.requestId,payloadFingerprint);
        if(prior.status==="CONFLICT")return failure("REQUEST_ID_REUSED");
        if(prior.status==="REPLAY")return {ok:true,data:parse(GameStartSuccessDataSchema,prior.record.terminalResult)};
        if(room.phase!=="LOBBY"||room.game!==null)return failure("INVALID_PHASE");
        if(room.hostPlayerId!==input.actorPlayerId)return failure("HOST_ONLY");
        if(room.roomRevision!==input.expectedRoomRevision)return failure("STALE_ROOM_REVISION");
        if(room.players.length<3)return failure("NOT_ENOUGH_PLAYERS");
        if(room.players.length>8)return failure("INVALID_PHASE");
        const lease=await this.deps.presence.acquireRoomPresenceLease(room.roomId);
        if(!lease.isCurrent()||!room.players.every(p=>lease.connectionStatusByPlayerId.get(p.playerId)==="CONNECTED"))return failure("PLAYERS_NOT_CONNECTED");
        const now=this.deps.clock.now(),gameId=this.deps.ids.generateGameId(),token=this.deps.ids.generateTurnId(),mode=room.promptMode??"MIXED";
        const seats=shuffleFrozen(room.players.map(p=>p.playerId),this.deps.random);
        const pool=DRAW_PROMPTS.filter(p=>mode==="MIXED"||p.difficulty==="EASY"||mode==="NORMAL"&&p.difficulty==="NORMAL");
        const prompts=shuffleFrozen(pool,this.deps.random).slice(0,seats.length);
        const state=createDrawRelay({gameId,seatOrder:seats,prompts,bookIds:seats.map(()=>this.deps.ids.generateTileId()),stageToken:token,now,promptMode:mode});
        const roomRevision=parse(RoomRevisionSchema,room.roomRevision+1),gameRevision=parse(GameRevisionSchema,0);
        const data=parse(GameStartSuccessDataSchema,{roomId:room.roomId,roomRevision,gameId,gameRevision,turnId:token});
        const committed=await this.deps.roomUnitOfWork.commit({roomMutation:{kind:"REPLACE",candidate:{...room,phase:"PLAYING",game:{gameId,gameRevision,startedAt:now,finishedAt:null,state},roomRevision,updatedAt:now},
          expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},sessionMutation:{kind:"NONE"},
          idempotency:{scopeKey,requestId:input.requestId,payloadFingerprint,terminalResult:data,createdAt:now}},
          {isSatisfied:()=>input.authorization.isCurrent()&&lease.isCurrent()});
        return committed.status==="COMMITTED"||committed.status==="REPLAY"?{ok:true,data}:failure("STALE_ROOM_REVISION");
      });
      if(result.ok)await this.schedule(input.roomId);
      return result;
    }catch{return failure("INTERNAL_ERROR");}
  }
  async command(input:Readonly<{roomId:RoomId;actorPlayerId:PlayerId;command:DrawClientCommand;receivedAt:ServerTime;authorization:{isCurrent():boolean}}>){
    const d=this.deps,c=input.command;
    try{
      const result=await d.roomMutationExecutor.run(input.roomId,async()=>{
        if(!input.authorization.isCurrent())return failure("UNAUTHENTICATED");
        const room=await d.roomRepository.findById(input.roomId);
        if(room?.gameType!=="DRAW_RELAY"||room.departedPlayerIds?.includes(input.actorPlayerId))return failure("INVALID_PHASE");
        const scopeKey=`room-player:${room.roomId}:${input.actorPlayerId}`,payloadFingerprint=JSON.stringify(c);
        const prior=await d.idempotencyRepository.classify(scopeKey,c.requestId,payloadFingerprint);
        if(prior.status==="CONFLICT")return failure("REQUEST_ID_REUSED");
        if(prior.status==="REPLAY")return {ok:true as const};
        const now=d.clock.now(); let candidate:Omit<DrawRelayRoomRecord,"storageRevision">;
        if(c.kind==="draw:configure"){
          if(room.phase!=="LOBBY")return failure("INVALID_PHASE");
          if(room.hostPlayerId!==input.actorPlayerId)return failure("HOST_ONLY");
          if(room.roomRevision!==c.expectedRoomRevision)return failure("STALE_ROOM_REVISION");
          candidate={...room,promptMode:c.payload.promptMode,roomRevision:parse(RoomRevisionSchema,room.roomRevision+1),updatedAt:now};
        }else{
          if(!room.game||room.game.gameId!==c.gameId)return failure("STALE_GAME_REVISION");
          if(c.kind==="draw:rematch"){
            if(room.phase!=="FINISHED")return failure("INVALID_PHASE");
            if(room.hostPlayerId!==input.actorPlayerId)return failure("HOST_ONLY");
            if(room.roomRevision!==c.expectedRoomRevision||room.game.gameRevision!==c.expectedGameRevision)return failure("STALE_ROOM_REVISION");
            candidate={...room,phase:"LOBBY",game:null,departedPlayerIds:[],players:room.players.filter(p=>!room.departedPlayerIds?.includes(p.playerId)),roomRevision:parse(RoomRevisionSchema,room.roomRevision+1),updatedAt:now};
          }else{
            const state=room.game.state;
            if(room.phase!=="PLAYING")return failure("INVALID_PHASE");
            if(c.stageToken!==state.stageToken)return failure("STALE_GAME_REVISION");
            let next:DrawRelayState;
            if(c.kind==="draw:revealNext"){
              if(room.hostPlayerId!==input.actorPlayerId)return failure("HOST_ONLY");
              if(state.phase!=="REVEAL")return failure("INVALID_PHASE");
              if(c.expectedGameRevision!==room.game.gameRevision)return failure("STALE_GAME_REVISION");
              next=revealNext(state,now);
            }else{
              if(state.deadlineAt===null||input.receivedAt>=state.deadlineAt)return failure("TURN_EXPIRED");
              try{
                next=applyRelayAction(state,input.actorPlayerId,c.stageToken,
                  c.kind==="draw:draftSave"?{kind:"SAVE",...c.payload}:c.kind==="draw:submitDrawing"?{kind:"DRAW",drawing:c.payload.drawing}:{kind:"GUESS",text:c.payload.text},
                  input.receivedAt,d.ids.generateTurnId());
              }catch{return failure("INVALID_PAYLOAD");}
            }
            candidate=transitionDraw(room,next,now);
          }
        }
        const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:"REPLACE",candidate,expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},
          sessionMutation:{kind:"NONE"},idempotency:{scopeKey,requestId:c.requestId,payloadFingerprint,terminalResult:{drawCommitted:true},createdAt:now}},
          {isSatisfied:()=>input.authorization.isCurrent()});
        if(committed.status!=="COMMITTED"&&committed.status!=="REPLAY")return failure("STALE_GAME_REVISION");
        if(room.game&&("game" in candidate)&&candidate.game?.gameId===room.game.gameId&&candidate.game.state.stageToken!==room.game.state.stageToken)
          await d.turnScheduler.cancelTimeout(parse(TurnIdSchema,room.game.state.stageToken));
        if(room.game&&candidate.game?.state.deadlineAt===null)await d.turnScheduler.cancelTimeout(parse(TurnIdSchema,room.game.state.stageToken));
        return {ok:true as const};
      });
      if(result.ok){await this.schedule(input.roomId);if(c.kind!=="draw:draftSave")await this.notify(input.roomId);}
      return result;
    }catch{return failure("INTERNAL_ERROR");}
  }
  async timeout(input:ScheduledTurnDeadline):Promise<{status:"NO_OP"|"APPLIED"|"FAILED"}>{
    const d=this.deps;
    try{
      const applied=await d.roomMutationExecutor.run(input.roomId,async()=>{
        const room=await d.roomRepository.findById(input.roomId),now=d.clock.now();
        if(room?.gameType!=="DRAW_RELAY"||room.phase!=="PLAYING"||!room.game||room.game.gameId!==input.gameId||room.game.state.stageToken!==input.turnId||room.game.state.deadlineAt!==input.deadlineAt||now<input.deadlineAt)return false;
        const lease=await d.presence.acquireRoomPresenceLease(room.roomId);
        const offline=new Set(room.players.filter(p=>lease.connectionStatusByPlayerId.get(p.playerId)!=="CONNECTED").map(p=>String(p.playerId)));
        const state=timeoutRelay(room.game.state,input.turnId,now,offline,d.ids.generateTurnId());
        const candidate=transitionDraw(room,state,now),scopeKey=`draw-timeout:${room.roomId}:${room.game.gameId}`;
        const requestId=parse(RequestIdSchema,`timeout:${input.turnId}`);
        const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:"REPLACE",candidate,expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},
          sessionMutation:{kind:"NONE"},idempotency:{scopeKey,requestId,payloadFingerprint:JSON.stringify([input.turnId,input.deadlineAt]),terminalResult:{drawTimeout:true},createdAt:now}}, {isSatisfied:()=>lease.isCurrent()});
        return committed.status==="COMMITTED";
      });
      if(applied){await this.schedule(input.roomId);await this.notify(input.roomId);}
      return {status:applied?"APPLIED":"NO_OP"};
    }catch{return {status:"FAILED"};}
  }
}
