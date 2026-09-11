import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import * as v from "valibot";
import { RequestIdSchema, LostCitiesClientCommandSchema, GameRevisionSchema, RoomRevisionSchema, ServerTimeSchema, type LostCitiesSettings, type LostCitiesClientCommand, type ErrorDto, type RoomId, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { GameStartSuccessDataSchema, type StartGameInput, type GameStartResult } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock, IdGenerator, RandomSource, TurnScheduler, ScheduledTurnDeadline } from "../../../ports/system.js";
import type { LostCitiesRoomRecord } from "../../../model/persistence.js";
import { makeLostCitiesCards } from "../domain/catalog.js";
import { timeoutLostCities, createLostCitiesGame, applyLostCitiesAction, confirmLostCitiesRound, type LostCitiesState, type LostCitiesRoundSetup } from "../domain/game.js";

export type LostCitiesDependencies = Readonly<{ roomRepository:RoomRepository; roomUnitOfWork:RoomUnitOfWork; idempotencyRepository:IdempotencyRepository; roomMutationExecutor:RoomMutationSerialExecutor; presence:RoomPresencePolicyReader; clock:Clock; ids:IdGenerator; random:RandomSource; turnScheduler:TurnScheduler }>;
const failure=(code:ErrorDto['code'])=>({ok:false as const,error:{code,message:code==='RULE_VIOLATION'?'선택한 카드와 수량을 확인해주세요.':code==='NOT_ENOUGH_PLAYERS'?'로스트시티는 정확히 2명이 플레이합니다.':'현재 차례와 연결 상태를 확인해주세요.',recoverable:true}});
const Receipt=v.strictObject({outcome:v.literal('ACCEPTED')});
export function transitionLostCities(room:LostCitiesRoomRecord,state:LostCitiesState,at:ServerTime):Omit<LostCitiesRoomRecord,'storageRevision'> {
  if(!room.game)throw new Error('Missing LostCities game.');
  const phase=state.phase==='FINISHED'?'FINISHED':'PLAYING';
  return {...room,phase,game:{...room.game,state,gameRevision:state.revision,finishedAt:state.finishedAt},roomRevision:phase===room.phase?room.roomRevision:v.parse(RoomRevisionSchema,room.roomRevision+1),updatedAt:at};
}
export class LostCitiesService {
  private readonly listeners=new Set<(roomId:RoomId)=>void|Promise<void>>();
  constructor(readonly deps:LostCitiesDependencies) {}
  subscribe(listener:(roomId:RoomId)=>void|Promise<void>){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  async notify(roomId:RoomId){await Promise.allSettled([...this.listeners].map(fn=>Promise.resolve().then(()=>fn(roomId))));}
  async schedule(roomId:RoomId) {
    try {
      const room=await this.deps.roomRepository.findById(roomId);
      if(room?.gameType!=='LOST_CITIES'||room.phase!=='PLAYING'||!room.game||room.game.state.phase!=='PLAYING'||room.game.state.deadlineAt===null)return;
      await this.deps.turnScheduler.scheduleTimeout({roomId,gameId:room.game.gameId,expectedGameRevision:room.game.gameRevision,turnId:room.game.state.transitionId,deadlineAt:room.game.state.deadlineAt});
    } catch { console.error('LOST_CITIES scheduling failed; overdue recovery will retry.'); }
  }
  private async cancelTimer(turnId:LostCitiesState['transitionId']) {
    try { await this.deps.turnScheduler.cancelTimeout(turnId); }
    catch { console.error('LOST_CITIES timer cancellation failed; stale callbacks are guarded.'); }
  }
  async timeout(input:ScheduledTurnDeadline):Promise<{status:'NO_OP'|'APPLIED'|'FAILED'}> {
    const d=this.deps;
    try {
      const applied=await d.roomMutationExecutor.run(input.roomId,async()=>{
        const room=await d.roomRepository.findById(input.roomId),now=d.clock.now();
        if(room?.gameType!=='LOST_CITIES'||room.phase!=='PLAYING'||!room.game||room.game.gameId!==input.gameId||room.game.gameRevision!==input.expectedGameRevision||room.game.state.transitionId!==input.turnId||room.game.state.deadlineAt!==input.deadlineAt||now<input.deadlineAt)return false;
        const outcome=timeoutLostCities(room.game.state,now,d.ids.generateTurnId());
        if(!outcome.ok)return false;
        const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:'REPLACE',candidate:transitionLostCities(room,outcome.state,now),expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},sessionMutation:{kind:'NONE'},idempotency:{scopeKey:`lost-cities-timer:${room.roomId}:${room.game.gameId}`,requestId:v.parse(RequestIdSchema,`turn:${input.turnId}`),payloadFingerprint:JSON.stringify([input.turnId,input.deadlineAt]),terminalResult:{transitioned:true},createdAt:now}});
        return committed.status==='COMMITTED';
      });
      if(applied){await this.cancelTimer(input.turnId);await this.schedule(input.roomId);await this.notify(input.roomId);}
      return {status:applied?'APPLIED':'NO_OP'};
    } catch { return {status:'FAILED'}; }
  }
  private roundSetup(mode:LostCitiesSettings["mode"]="BASE"):LostCitiesRoundSetup {
    return { cards: [...shuffleFrozen(makeLostCitiesCards(() => this.deps.ids.generateTileId(),mode), this.deps.random)] };
  }

  async start(input:StartGameInput):Promise<GameStartResult> {
    const d=this.deps;
    try {const result=await d.roomMutationExecutor.run(input.roomId,async ():Promise<GameStartResult>=>{
      if(!input.authorization.isCurrent())return failure('UNAUTHENTICATED');
      const room=await d.roomRepository.findById(input.roomId);
      if(room?.gameType!=='LOST_CITIES'||room.departedPlayerIds?.includes(input.actorPlayerId)||!room.players.some(p=>p.playerId===input.actorPlayerId))return failure('INVALID_PHASE');
      const scopeKey=`room-player:${room.roomId}:${input.actorPlayerId}`,payloadFingerprint=JSON.stringify(['game:start',input.expectedRoomRevision]);
      const prior=await d.idempotencyRepository.classify(scopeKey,input.requestId,payloadFingerprint);
      if(prior.status==='CONFLICT')return failure('REQUEST_ID_REUSED');
      if(prior.status==='REPLAY')return {ok:true,data:v.parse(GameStartSuccessDataSchema,prior.record.terminalResult)};
      if(room.phase!=='LOBBY'||room.game!==null)return failure('INVALID_PHASE');
      if(room.hostPlayerId!==input.actorPlayerId)return failure('HOST_ONLY');
      if(room.roomRevision!==input.expectedRoomRevision)return failure('STALE_ROOM_REVISION');
      if(room.players.length!==2)return failure('NOT_ENOUGH_PLAYERS');
      const lease=await d.presence.acquireRoomPresenceLease(room.roomId);
      if(!lease.isCurrent()||!room.players.every(p=>lease.connectionStatusByPlayerId.get(p.playerId)==='CONNECTED'))return failure('PLAYERS_NOT_CONNECTED');
      const now=d.clock.now(),gameId=d.ids.generateGameId(),turnId=d.ids.generateTurnId();
      const state=createLostCitiesGame({...this.roundSetup(room.settings?.mode),settings:room.settings??{mode:"BASE"},gameId,playerIds:room.players.map(p=>p.playerId),now,transitionId:turnId,starter:d.random.nextInt(2)});
      const roomRevision=v.parse(RoomRevisionSchema,room.roomRevision+1),gameRevision=v.parse(GameRevisionSchema,0);
      const data=v.parse(GameStartSuccessDataSchema,{roomId:room.roomId,roomRevision,gameId,gameRevision,turnId});
      const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:'REPLACE',candidate:{...room,phase:'PLAYING',roomRevision,updatedAt:now,game:{gameId,gameRevision,startedAt:now,finishedAt:null,state}},expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},sessionMutation:{kind:'NONE'},idempotency:{scopeKey,requestId:input.requestId,payloadFingerprint,terminalResult:data,createdAt:now}},{isSatisfied:()=>input.authorization.isCurrent()&&lease.isCurrent()});
      return committed.status==='COMMITTED'?{ok:true,data}:failure('STALE_ROOM_REVISION');
    });if(result.ok)await this.schedule(input.roomId);return result;}catch{return failure('INTERNAL_ERROR');}
  }
  async command(input:Readonly<{roomId:RoomId;actorPlayerId:PlayerId;command:LostCitiesClientCommand;receivedAt:ServerTime;authorization:{isCurrent():boolean}}>) {
    const parsed=v.safeParse(LostCitiesClientCommandSchema,input.command);if(!parsed.success)return failure('INVALID_PAYLOAD');
    const d=this.deps,c=parsed.output;let changed=false;
    try {
      const result=await d.roomMutationExecutor.run(input.roomId,async()=>{
        if(!input.authorization.isCurrent())return failure('UNAUTHENTICATED');
        const room=await d.roomRepository.findById(input.roomId);
        if(room?.gameType!=='LOST_CITIES'||room.departedPlayerIds?.includes(input.actorPlayerId)||!room.players.some(p=>p.playerId===input.actorPlayerId))return failure('INVALID_PHASE');
        const scopeKey=`room-player:${room.roomId}:${input.actorPlayerId}`,payloadFingerprint=JSON.stringify(c);
        const prior=await d.idempotencyRepository.classify(scopeKey,c.requestId,payloadFingerprint);
        if(prior.status==='CONFLICT')return failure('REQUEST_ID_REUSED');
        if(prior.status==='REPLAY'){v.parse(Receipt,prior.record.terminalResult);return {ok:true as const};}
        if(c.kind==='lostCities:configure') {
          if(room.phase!=='LOBBY'||room.game!==null)return failure('INVALID_PHASE');
          if(room.hostPlayerId!==input.actorPlayerId)return failure('HOST_ONLY');
          if(room.roomRevision!==c.expectedRoomRevision)return failure('STALE_ROOM_REVISION');
          const now=d.clock.now();
          const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:'REPLACE',candidate:{...room,settings:c.payload,roomRevision:v.parse(RoomRevisionSchema,room.roomRevision+1),updatedAt:now},expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},sessionMutation:{kind:'NONE'},idempotency:{scopeKey,requestId:c.requestId,payloadFingerprint,terminalResult:{outcome:'ACCEPTED'},createdAt:now}},{isSatisfied:()=>input.authorization.isCurrent()});
          if(committed.status!=='COMMITTED')return failure('STALE_ROOM_REVISION');
          changed=true;return {ok:true as const};
        }
        if(!room.game||room.game.gameId!==c.gameId||room.game.gameRevision!==c.expectedGameRevision)return failure('STALE_GAME_REVISION');
        if(room.phase!=='PLAYING')return failure('INVALID_PHASE');
        const s=room.game.state,now=v.parse(ServerTimeSchema,d.clock.now());
        if(c.kind==='lostCities:act' && c.turnId!==s.transitionId || c.kind==='lostCities:nextRound' && c.roundId!==s.roundId)return failure('STALE_GAME_REVISION');
        if(c.kind==='lostCities:nextRound'&&(s.phase!=='ROUND_RESULT'||s.confirmedPlayerIds.includes(input.actorPlayerId)))return failure('INVALID_PHASE');
        const applied=c.kind==='lostCities:act'?applyLostCitiesAction(s,input.actorPlayerId,c.payload,now,d.ids.generateTurnId()):confirmLostCitiesRound(s,input.actorPlayerId,s.confirmedPlayerIds.length===1?this.roundSetup(s.settings.mode):null,d.ids.generateTurnId(),now);
        if(!applied.ok)return failure(applied.reason==='INVALID_ACTION'?'RULE_VIOLATION':applied.reason);
        const committed=await d.roomUnitOfWork.commit({roomMutation:{kind:'REPLACE',candidate:transitionLostCities(room,applied.state,now),expectedRoomRevision:room.roomRevision,expectedStorageRevision:room.storageRevision},sessionMutation:{kind:'NONE'},idempotency:{scopeKey,requestId:c.requestId,payloadFingerprint,terminalResult:{outcome:'ACCEPTED'},createdAt:now}},{isSatisfied:()=>input.authorization.isCurrent()});
        if(committed.status!=='COMMITTED')return failure('STALE_GAME_REVISION');
        await this.cancelTimer(s.transitionId);
        changed=true;return {ok:true as const};
      });
      if(changed){await this.schedule(input.roomId);await this.notify(input.roomId);}
      return result;
    }catch{return failure('INTERNAL_ERROR');}
  }
}
