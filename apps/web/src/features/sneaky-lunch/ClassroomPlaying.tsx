import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SneakyWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { LunchboxArt, StudentArt } from "./art.js";
import { ClassroomBackdrop, NpcDesk, TeacherArt } from "./classroom-art.js";
import type { LunchFeedback } from "./feedback.js";

export function remainingFood(bites: number, required: number) { return bites >= required ? 0 : 1 - (bites % 30) / 30; }
export function lunchFoodStage(bites: number, required: number) { return Math.ceil(remainingFood(bites, required) * 4); }
export type SeatPulse = Readonly<{id:string;cue:LunchFeedback["cue"];biteDelta?:number}>;

function DeskItem({seat}: {seat:number}) {
  return <svg viewBox="0 0 45 48" className="lunch-desk-item" aria-hidden="true">
    {seat%4===0 ? <><path d="M9 7h21v34H9Z" fill="#dfb766" stroke="#77633e" strokeWidth="2"/><path d="M14 13h12m-12 7h12m-12 7h8" stroke="#fff0c6" strokeWidth="3"/><path d="M34 5v35" stroke="#477b70" strokeWidth="5"/></> : seat%4===1 ? <><rect x="12" y="11" width="22" height="32" rx="7" fill="#78a7aa" stroke="#466d6b" strokeWidth="2"/><rect x="15" y="4" width="16" height="9" rx="2" fill="#e6d3a4"/><path d="M18 20v13" stroke="#c0ded2" strokeWidth="3"/></> : seat%4===2 ? <><path d="M6 15h33v26H6Z" fill="#b68281" stroke="#7a4f56" strokeWidth="2"/><path d="M8 19h28m-13-1v22" stroke="#f3cbb1" strokeWidth="2"/><circle cx="23" cy="30" r="5" fill="#f4d790"/></> : <><path d="M7 13l29-4 4 30-30 4Z" fill="#91a77e" stroke="#586d51" strokeWidth="2"/><path d="M12 13l4 28m4-17 5 8 6-14" fill="none" stroke="#e3edbd" strokeWidth="2"/></>}
  </svg>;
}

function Progress({nickname,bites,required}: {nickname:string;bites:number;required:number}) {
  return <div className="lunch-seat-progress" role="progressbar" aria-label={`${nickname}님의 완식 진행`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bites/required*100)}><span style={{width:`${bites/required*100}%`}}/></div>;
}

export function ClassroomPlaying({snapshot:s, title, seconds, allowed, danger, pulses, caughtSpeech, onEat, resultControls, suppressResult=false}: {
  snapshot:SneakyWebSnapshot;title:string;seconds:number;allowed:boolean;danger:boolean;pulses:Readonly<Record<string,SeatPulse>>;
  caughtSpeech:string|null;onEat():void;resultControls:ReactNode;suppressResult?:boolean;
}) {
  const game=s.game;
  const [resultClosed,setResultClosed]=useState(false);
  const resultButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>setResultClosed(false),[game?.gameId,game?.phase]);
  useEffect(()=>{if(resultClosed)resultButton.current?.focus();},[resultClosed]);
  if (!game) return null;
  const self=s.self.playerId, own=game.playerStates.find(p=>p.playerId===self), ownSeat=s.room.players.findIndex(p=>p.playerId===self);
  const me=s.room.players[ownSeat], teacher=game.phase==="CLASSROOM" ? game.teacherState : game.phase==="FINISHED"&&game.result.reason==="TEACHER_WIN" ? "WATCHING" : "BOARD";
  const classmates=s.room.players.filter(p=>p.playerId!==self), ownPulse=pulses[self];
  const finished=game.phase==="FINISHED", teacherWin=finished&&game.result.reason==="TEACHER_WIN";
  const ownCaught=own?.status==="CAUGHT", ownWinner=finished&&game.result.winnerPlayerId===self;
  const food=remainingFood(own?.completedBites??0,game.requiredBites);
  const ownRank=(game.placementOrder?.indexOf(self)??-1)+1;
  const placements=game.placementOrder??(finished&&game.result.winnerPlayerId?[game.result.winnerPlayerId]:[]);
  const speech=caughtSpeech ?? (teacherWin ? "전원 적발! 도시락은 점심시간에!" : teacher==="WATCHING" ? "거기, 뭘 먹고 있는 건 아니지?" : teacher==="SUSPICIOUS" ? "…무슨 소리지?" : null);
  return <section className={`lunch-classroom teacher-${teacher.toLowerCase()}${finished?" lesson-finished":""}`} aria-label="함께 앉아 있는 교실" data-player-count={s.room.players.length}>
    <div className="lunch-room-stage">
      <ClassroomBackdrop/>
      {!!placements.length&&<ol className="lunch-live-placements" aria-label="확정된 순위">{placements.map((id,i)=><li key={id}><b>{i+1}위</b> {s.room.players.find(p=>p.playerId===id)?.nickname??"참가자"}</li>)}</ol>}
      <div className="lunch-teacher-zone" aria-label="선생님과 교실">
        <div className="lunch-lesson-caption"><span>점심시간까지는 비밀</span><h2 role="status">{title}</h2></div>
        <TeacherArt state={teacher}/>
        {speech&&<div className={`lunch-teacher-speech${caughtSpeech?" caught-speech":""}`} role="status">{speech}</div>}
        <div className="lunch-npc-seat npc-left"><NpcDesk/></div><div className="lunch-npc-seat npc-right"><NpcDesk variant={1}/></div>
      </div>
      <div className={`lunch-seating peers-${classmates.length}`} aria-label="친구들의 교실 자리">
        {classmates.map(p=>{
          const state=game.playerStates.find(v=>v.playerId===p.playerId);
          if (!state) return null;
          const seat=s.room.players.findIndex(v=>v.playerId===p.playerId), pulse=pulses[p.playerId], caught=state.status==="CAUGHT";
          const winner=finished&&game.result.winnerPlayerId===p.playerId;
          return <div key={p.playerId} className={`lunch-classroom-seat status-${state.status.toLowerCase()}${p.connectionStatus==="OFFLINE"?" is-offline":""}${winner?" winner":""}`} data-player-id={p.playerId}>
            <div className={`lunch-seat-actor${pulse?.cue==="CAUGHT"||pulse?.cue==="WATCHING"?" just-caught":""}${pulse?.biteDelta?" is-eating":""}`} key={pulse?.id??"rest"}>
              <div className="lunch-seat-chair"/><StudentArt seat={seat} caught={caught} winner={winner} chewKey={pulse?.biteDelta?1:0}/>
              <div className="lunch-seat-table"><DeskItem seat={seat}/><LunchboxArt remaining={remainingFood(state.completedBites,game.requiredBites)} closed={state.status!=="ACTIVE"} small/></div>
              {caught&&<span className="lunch-caught-stamp">들킴</span>}
            </div>
            <div className="lunch-seat-label"><strong title={p.nickname}>{p.nickname}</strong><span>{placements.includes(p.playerId)?`${placements.indexOf(p.playerId)+1}위 확정`:winner?"완식!":caught?"CAUGHT":state.status==="FORFEITED"||p.connectionStatus==="OFFLINE"?"OFFLINE":"ACTIVE"}</span><Progress nickname={p.nickname} bites={state.completedBites} required={game.requiredBites}/></div>
          </div>;
        })}
      </div>
      {game.phase==="COUNTDOWN"&&<div className="lunch-countdown" role="status"><strong>{seconds>0?seconds:"쉿!"}</strong><span>도시락 뚜껑을 살짝 열어주세요</span></div>}
    </div>
    <section className={`lunch-own-seat${ownCaught?" status-caught":""}${ownWinner?" winner":""}`} aria-label="내 도시락과 먹기" data-player-id={self}>
      <div className="lunch-own-avatar"><div key={ownPulse?.id??"rest"} className={`${ownPulse?.biteDelta?"is-eating":""}${ownPulse?.cue==="CAUGHT"?" just-caught":""}`}><StudentArt seat={Math.max(0,ownSeat)} caught={ownCaught} winner={ownWinner} chewKey={ownPulse?.biteDelta?1:0}/></div><strong>{me?.nickname} · 내 자리</strong>{ownCaught&&<span className="lunch-caught-stamp">들킴</span>}</div>
      <div className="lunch-own-tray" data-food-stage={lunchFoodStage(own?.completedBites??0,game.requiredBites)}>
        <div key={ownPulse?.id??"rest"} className={`lunch-own-food${ownPulse?.biteDelta?" is-eating":""}${ownPulse?.cue==="BOX"&&food>0?" new-lunchbox":""}`}>
          {ownPulse?.cue==="BOX"&&food>0&&<div className="lunch-empty-exit"><LunchboxArt remaining={0}/></div>}
          <LunchboxArt remaining={food} closed={own?.status!=="ACTIVE"}/>
          {ownPulse?.biteDelta&&<span className="lunch-bite-pop" aria-hidden="true">+{ownPulse.biteDelta}</span>}
        </div>
        <div className="lunch-own-boxes" aria-label="도시락 완식 상태">{Array.from({length:game.settings.lunchboxCount},(_,i)=><span key={i} className={(own?.completedBites??0)>=(i+1)*30?"cleared":""}><LunchboxArt closed small/><span>{i+1}번</span></span>)}<span>{ownCaught?"뚜껑 닫고, 조용히…":food===0?"깨끗하게 비웠어요!":"오늘 싸 온 도시락"}</span></div>
        <div className="lunch-own-progress"><Progress nickname={me?.nickname??"나"} bites={own?.completedBites??0} required={game.requiredBites}/></div>
        <span className="lunch-sr-only" role="status">{ownPulse?.biteDelta ? ownPulse.cue==="BOX" ? "도시락 하나를 비웠어요!" : "냠! 한입 성공" : ""}</span>
      </div>
      <div className="lunch-own-action"><span className="lunch-eyebrow">MY SECRET LUNCH</span><strong>{ownRank?"내 순위 확정 · 관전 중":ownCaught?"들켰습니다!":own?.status==="FORFEITED"?"이번 수업은 관전 중":finished?"오늘의 작전 완료!":danger?"눈 마주치면, 딱 걸려요!":teacher==="SUSPICIOUS"?"한입 더? …조심해요!":"지금이야, 몰래 한입!"}</strong>
        {!!ownRank&&<p className="lunch-placement-message">{ownRank}위를 확정했습니다!{!finished&&<small>친구들의 순위 결정이 진행 중입니다.</small>}</p>}
        <small>{ownRank||own?.status!=="ACTIVE"?"같은 자리에서 친구들을 응원해요.":danger?"돌아가는 중에도 먹으면 들켜요.":"선생님을 보면서 톡, 톡!"}</small>
        {finished?<button ref={resultButton} className="lunch-primary" onClick={()=>setResultClosed(false)}>게임 결과 보기</button>:ownRank?<button className="lunch-eat-button" disabled>순위 확정 · 관전 중</button>:<button className={`lunch-eat-button${danger&&own?.status==="ACTIVE"?" danger":""}`} disabled={!allowed} onClick={onEat} aria-label={own?.status!=="ACTIVE"?"관전 중":danger?"멈춰! 누르면 들켜요":"먹기!"}><span aria-hidden="true">{own?.status!=="ACTIVE"?"쉿":danger?"!":"냠"}</span>{own?.status!=="ACTIVE"?"관전 중":game.phase==="COUNTDOWN"?"준비…":"먹기!"}<small>{own?.status!=="ACTIVE"?"친구들을 응원해요":danger?"누르면 들켜요":"한 번에 한입"}</small></button>}
      </div>
    </section>
    {finished&&!resultClosed&&!suppressResult&&<ClassroomResult teacherWin={teacherWin} winnerName={s.room.players.find(p=>p.playerId===game.result.winnerPlayerId)?.nickname??"친구"} onClose={()=>setResultClosed(true)}>
      <ol className="lunch-final-ranks">{placements.map((id,i)=><li key={id}><b>{i+1}위</b><span>{s.room.players.find(p=>p.playerId===id)?.nickname??"참가자"}</span><small>{game.playerStates.find(p=>p.playerId===id)?.completedBites===game.requiredBites?"완식":"마지막 생존"}</small></li>)}</ol>
      {game.playerStates.filter(p=>p.status!=="ACTIVE").map(p=><p key={p.playerId} className="lunch-eliminated-result">{s.room.players.find(v=>v.playerId===p.playerId)?.nickname??"참가자"} · {p.status==="CAUGHT"?"들킴":"탈락"}</p>)}
      {resultControls}</ClassroomResult>}
  </section>;
}

function ClassroomResult({teacherWin,winnerName,onClose,children}: {teacherWin:boolean;winnerName:string;onClose():void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(dialog.current&&!dialog.current.open)dialog.current.showModal();},[]);
  function closeResult(){dialog.current?.close();onClose();}
  return <dialog ref={dialog} className={`lunch-classroom-result${teacherWin?" teacher-victory":""}`} aria-labelledby="lunch-result-title" onCancel={event=>{event.preventDefault();closeResult();}}>
    <button className="lunch-result-close" onClick={closeResult} aria-label="결과 닫고 교실 보기">닫기</button><span className="lunch-sticker">오늘의 비밀 작전</span>
    <div className="lunch-result-art">{teacherWin?<TeacherArt state="WATCHING"/>:<LunchboxArt remaining={0}/>}</div><h2 id="lunch-result-title">{teacherWin?"전원 적발!":`${winnerName}님 우승!`}</h2>
    <p>{teacherWin?"도시락은 점심시간에 먹으라니까!":"오늘의 몰래 한입 · 최종 순위"}</p>{children}
  </dialog>;
}
