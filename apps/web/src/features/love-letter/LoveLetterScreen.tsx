import {useEffect,useRef,useState} from 'react';
import {PROTOCOL_VERSION,LOVE_LETTER_RANKS,LOVE_LETTER_COUNTS,type LoveLetterRank,type LoveLetterClientCommand,type PlayerId,type LoveLetterCard,type LoveLetterAction} from '@hangul-rummikub/shared';
import type {LoveLetterWebSnapshot} from '../../lib/snapshot-wire-decoder.js';
import {createRequestId} from '../../lib/request-id.js';
import {getGameStartControl} from '../../lib/game-start.js';
import {LoveLetterCommandRejected} from '../../lib/love-letter-command-error.js';
import {COURT,forcedCountess,targetsFor,makePlay,eventText} from './ui.js';
import {useCourtSound} from './sound.js';
type Props={snapshot:LoveLetterWebSnapshot;connected:boolean;pending:boolean;error:string|null;connectionLabel:string;onCommand(c:LoveLetterClientCommand):Promise<void>;onRematch():void;onStart():void;onLeave():void;onCopy():void};
export function CourtPortrait({rank,className=''}:{rank:LoveLetterRank;className?:string}){return <span aria-hidden="true" className={`ll-portrait ${className}`} style={{backgroundPosition:`${rank%5*25}% ${rank<5?0:100}%`}}/>;}
export function CourtCard({rank,selected=false,disabled=false,onClick}:{rank:LoveLetterRank;selected?:boolean;disabled?:boolean;onClick?:()=>void}){
 const content=<><CourtPortrait rank={rank}/><span className="ll-card-number">{rank}</span><span className="ll-card-copy"><small>{COURT[rank].english}</small><strong>{COURT[rank].name}</strong><span>{COURT[rank].effect}</span></span>{selected&&<span className="ll-chosen">선택됨</span>}</>;
 return onClick?<button type="button" className="ll-card" disabled={disabled} aria-pressed={selected} aria-label={`${rank} ${COURT[rank].name}`} onClick={onClick}>{content}</button>:<div className="ll-card ll-card-static">{content}</div>;
}
export function LoveLetterScreen(props:Props){
 const {snapshot:s}=props,g=s.game,self=s.self.playerId;
 const sound=useCourtSound(g,self,props.connected);
 const [cardId,setCard]=useState<string|null>(null),[target,setTarget]=useState<PlayerId|null>(null),[guess,setGuess]=useState<LoveLetterRank|null>(null),[reverse,setReverse]=useState(false);
 const [flight,setFlight]=useState(false),[retry,setRetry]=useState<LoveLetterClientCommand|null>(null),[message,setMessage]=useState<string|null>(null),[notesOpen,setNotesOpen]=useState(false);
 const lock=useRef(false),mounted=useRef(true),scope=g?.gameId??s.room.roomId,scopeRef=useRef(scope);scopeRef.current=scope;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setCard(null);setTarget(null);setGuess(null);setReverse(false);setNotesOpen(false);},[g?.gameId,g?.roundId,g?.gameRevision]);
 useEffect(()=>{setRetry(null);setMessage(null);},[scope]);
 const name=(id:string)=>s.room.players.find(p=>p.playerId===id)?.nickname??'참가자';
 const isHost=s.room.players.find(p=>p.playerId===self)?.isHost===true;
 const available=props.connected&&!props.pending&&!flight&&retry===null;
 const canAct=available&&g?.phase==='PLAYING'&&g.activePlayerId===self;
 const selected=g?.privateState.hand.find(c=>c.cardId===cardId);
 const targets=g&&selected?targetsFor(g,selected.rank):[];
 const mustCountess=g?forcedCountess(g.privateState.hand):false;
 const action=g?makePlay(g,cardId,target,guess):null;
 const returnCards=g?.privateState.hand.filter(c=>c.cardId!==cardId)??[];
 const ordered=reverse?[...returnCards].reverse():returnCards;
 async function send(command:LoveLetterClientCommand){
  if(lock.current||!props.connected)return;lock.current=true;setFlight(true);setMessage(null);const sentScope=scope;
  try{await props.onCommand(command);if(mounted.current&&scopeRef.current===sentScope)setRetry(null);}
  catch(error){if(mounted.current&&scopeRef.current===sentScope){sound.cue('ERROR');if(error instanceof LoveLetterCommandRejected){setRetry(null);setMessage(error.message);}else{setRetry(command);setMessage('응답을 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해주세요.');}}}
  finally{lock.current=false;if(mounted.current)setFlight(false);}
 }
 function submit(payload:LoveLetterAction){if(!g||g.phase!=='PLAYING'||!canAct)return;void send({kind:'loveLetter:act',protocolVersion:PROTOCOL_VERSION,requestId:createRequestId(),gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId,payload});}
 function choose(c:LoveLetterCard){sound.cue('SELECT');setCard(c.cardId);setTarget(null);setGuess(null);setReverse(false);}
 const last=g?.roundResults.at(-1),me=g?.playerStates.find(p=>p.playerId===self);
 const start=getGameStartControl(s,props.pending||!props.connected);
 const status=!g?'궁정에 오신 것을 환영합니다':g.phase==='FINISHED'?(g.result.reason==='CANCELLED'?'매치가 취소되었습니다':'마음이 전해졌습니다'):g.phase==='ROUND_RESULT'?`${g.round}라운드 종료`:g.activePlayerId===self?(g.stage==='CHANCELLOR'?'남길 카드 한 장을 고르세요':'당신의 차례입니다'):`${name(g.activePlayerId)}의 차례`;
 const seats=g?g.playerStates:s.room.players.map(p=>({playerId:p.playerId,handCount:0,tokens:0,eliminated:false,protected:false,discards:[]}));
 return <main className="ll-game" onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
  <header className="ll-header"><div className="ll-wordmark"><span className="ll-seal" aria-hidden="true">L</span><div><small>THE ROYAL COURT</small><h1>러브레터</h1></div></div><div className="ll-header-tools"><span className="ll-room-code">{s.room.roomCode}</span><button onClick={props.onCopy}>초대 링크</button><details className="ll-audio"><summary>소리 {sound.enabled?'켜짐':'꺼짐'}</summary><div><button onClick={()=>{sound.toggle();}} aria-pressed={sound.enabled}>효과음 {sound.enabled?'끄기':'켜기'}</button><label>음량 <input aria-label="효과음 음량" type="range" min="0" max="100" value={Math.round(sound.volume*100)} onChange={e=>sound.setVolume(Number(e.target.value)/100)} onPointerUp={()=>sound.cue('SELECT')}/></label></div></details><button onClick={props.onLeave} disabled={props.pending}>나가기</button></div></header>
  {(!props.connected||props.error)&&<p className="ll-error" role="alert">{props.error||props.connectionLabel}</p>}
  <div className="ll-table-content">
   <div className="ll-table-heading"><span>{g?`ROUND ${String(g.round).padStart(2,'0')}`:'A LETTER, A SECRET'}</span><h2>{status}</h2><p>{!g?'한 장의 편지, 열 명의 인물. 누구의 마음을 읽을 수 있을까요?':g.phase==='PLAYING'?(me?.eliminated?'이번 라운드에서는 탈락했습니다. 공개 기록을 보며 다음 라운드를 기다리세요.':canAct?(g.stage==='CHANCELLOR'?'나에게만 보이는 카드입니다. 선택을 마친 뒤 덱 아래로 돌려놓습니다.':'한 장을 사용하고, 남은 한 장으로 마음을 전하세요.'):'공개된 카드에서 다음 수의 단서를 찾아보세요.'):'호감 토큰을 확인하고 다음 이야기를 이어가세요.'}</p></div>
   <section className="ll-seats" data-count={seats.length} aria-label="궁정 참가자">
    {seats.map((p,i)=>{const active=g?.phase==='PLAYING'&&g.activePlayerId===p.playerId,isTarget=targets.includes(p.playerId);return <article key={p.playerId} className={`ll-seat ${active?'ll-active':''} ${p.eliminated?'ll-eliminated':''} ${p.protected?'ll-protected':''} ${target===p.playerId?'ll-target':''}`}>
     <button className="ll-seat-pick" type="button" aria-pressed={target===p.playerId} disabled={!canAct||g?.phase!=='PLAYING'||g.stage!=='PLAY_CARD'||!isTarget} onClick={()=>{setTarget(p.playerId);sound.cue('SELECT');}} aria-label={`${name(p.playerId)}${p.playerId===self?' (나)':''} 대상 선택`}>
      <span className="ll-avatar" aria-hidden="true">{name(p.playerId).slice(0,1)}</span><span><strong>{name(p.playerId)}{p.playerId===self?' · 나':''}</strong><small>{p.eliminated?'이번 라운드 탈락':p.protected?'보호 중':s.room.players.find(x=>x.playerId===p.playerId)?.connectionStatus!=='CONNECTED'?'재접속 대기':active?'현재 차례':g?'편지를 지키는 중':`${i+1}번 자리`}</small></span><span className="ll-token-count" aria-label={`호감 ${p.tokens}개`}>♥ {p.tokens}</span>
     </button>
     <div className="ll-seat-cards" aria-label={`${name(p.playerId)} 공개 카드`}>{g&&p.handCount>0&&<span className="ll-mini-back" aria-label={`비공개 손패 ${p.handCount}장`}>✉ <small>{p.handCount}</small></span>}{p.discards.map(c=><span key={c.cardId} className="ll-discard" aria-label={`${c.rank} ${COURT[c.rank].name}`}><CourtPortrait rank={c.rank}/><b>{c.rank}</b><small>{COURT[c.rank].name}</small></span>)}{!g&&<small>참가 완료</small>}</div>
    </article>;})}
   </section>
   {!g?<section className="ll-welcome"><div className="ll-showcase"><CourtCard rank={1}/><CourtCard rank={9}/><CourtCard rank={2}/></div><div className="ll-welcome-copy"><small>LOVE LETTER · 21 CARDS</small><h2>당신의 편지를<br/>끝까지 지켜주세요.</h2><p>2–6명 · 한 장 뽑고 한 장 사용<br/>비밀을 읽고, 상대를 피하고, 호감을 모으세요.</p><button className="ll-primary" disabled={!start.canStart} onClick={()=>{sound.cue('PAPER');props.onStart();}}>편지 나누기 · 게임 시작</button><p>{start.guidance}</p><small>시간 제한 없음 · 새로고침 후 이어하기</small></div></section>:<>
    {g.phase==='PLAYING'&&<section className="ll-center" aria-label="공용 테이블"><div className="ll-deck"><div className="ll-card-back"><span>✉</span><b>LOVE<br/>LETTER</b></div><div><strong>{g.deckCount}<small>장</small></strong><span>남은 편지</span></div></div><div className="ll-announcement" key={`${g.roundId}:${g.history.length}`}><span className="ll-ornament">✦</span><p role="status">{eventText(g,name)}</p><small>목표 호감 {g.targetTokens}개 · 비공개 제외 {g.setAsideCount}장</small></div>{g.faceUp.length>0&&<div className="ll-excluded"><small>2인 공개 제외</small>{g.faceUp.map(c=><span key={c.cardId}>{c.rank} {COURT[c.rank].name}</span>)}</div>}</section>}
    {g.phase!=='PLAYING'&&<section className="ll-round-result" aria-label="라운드 결과"><span className="ll-result-seal">♥</span><h2>{g.phase==='FINISHED'?(g.result.reason==='CANCELLED'?'참가자가 나가 매치가 취소되었습니다':`${g.result.winnerPlayerIds.map(name).join(' · ')} 승리`):`${last?.winnerPlayerIds.map(name).join(' · ')}의 편지가 도착했습니다`}</h2>{g.phase==='FINISHED'&&g.result.reason==='CANCELLED'?<p>진행 중이던 비공개 손패는 공개하지 않습니다.</p>:<><p>{last?.reason==='LAST_PLAYER'?'마지막까지 살아남아 호감 +1':'가장 높은 손패로 호감 +1'}{last?.spyPlayerId?` · ${name(last.spyPlayerId)} 첩자 보너스 +1`:''}</p><div className="ll-reveals">{last?.reveals.map(r=><div key={r.playerId}><CourtCard rank={r.rank}/><strong>{name(r.playerId)}</strong></div>)}</div></>}{g.phase==='ROUND_RESULT'?<><button className="ll-primary" disabled={!available||!isHost||s.room.players.some(p=>p.connectionStatus!=='CONNECTED')} onClick={()=>void send({kind:'loveLetter:nextRound',protocolVersion:PROTOCOL_VERSION,requestId:createRequestId(),gameId:g.gameId,expectedGameRevision:g.gameRevision,roundId:g.roundId,payload:{}})}>다음 라운드 · 편지 나누기</button><p>{!isHost?'방장이 다음 라운드를 시작합니다.':s.room.players.some(p=>p.connectionStatus!=='CONNECTED')?'모두 다시 접속하면 시작할 수 있습니다.':'모두 결과를 확인한 뒤 시작해주세요.'}</p></>:isHost&&<button className="ll-primary" disabled={!available} onClick={props.onRematch}>같은 방에서 다시 하기</button>}</section>}
    {g.phase==='PLAYING'&&<section className={`ll-hand-area ${canAct?'ll-hand-active':''}`}><div className="ll-hand-heading"><h3>{g.stage==='CHANCELLOR'&&canAct?'재상의 선택':'나의 편지'}</h3><span>나에게만 보이는 손패</span>{g.privateState.notes.length>0&&<button onClick={()=>{setNotesOpen(x=>!x);if(!notesOpen)sound.cue('SECRET');}} aria-expanded={notesOpen}>✉ 비밀 기록 {g.privateState.notes.length}</button>}</div>
     {notesOpen&&<aside className="ll-private-note" aria-label="나만 보는 비밀 기록"><strong>나에게만 열린 편지</strong>{g.privateState.notes.map((n,i)=><p key={i}>{n.turn}번째 차례 · {name(n.subjectPlayerId)}: <b>{n.rank} {COURT[n.rank].name}</b></p>)}<small>확인 당시의 정보입니다. 이후 손패가 바뀌었을 수 있습니다.</small><button onClick={()=>setNotesOpen(false)}>편지 닫기</button></aside>}
     {mustCountess&&canAct&&g.stage==='PLAY_CARD'&&<p className="ll-private-hint">왕 또는 왕자와 함께 있어 백작부인을 사용해야 합니다. 이 안내는 나에게만 보입니다.</p>}
     <div className="ll-hand" key={`${g.roundId}:${g.phase==='PLAYING'?g.turnId:''}`}>{g.privateState.hand.map(c=><CourtCard key={c.cardId} rank={c.rank} selected={cardId===c.cardId} disabled={!canAct||(g.stage==='PLAY_CARD'&&mustCountess&&c.rank!==8)} onClick={()=>choose(c)}/>)}{!g.privateState.hand.length&&<p className="ll-empty-hand">이번 편지는 전해지지 못했습니다.<br/>다음 라운드에서 다시 만나요.</p>}</div>
     {canAct&&g.stage==='PLAY_CARD'&&selected&&<div className="ll-selection" aria-live="polite"><strong>{COURT[selected.rank].name} 사용</strong><p>{targets.length?(target?`${name(target)}에게 사용합니다.`:'위의 참가자 중 대상을 선택하세요.'):[1,2,3,7].includes(selected.rank)?'다른 생존자가 모두 보호 중입니다. 효과 없이 사용합니다.':selected.rank===9?'공주를 사용하면 내가 즉시 탈락합니다.':'대상을 선택하지 않는 카드입니다.'}</p>{selected.rank===1&&targets.length>0&&<fieldset className="ll-guesses"><legend>상대가 가진 인물은?</legend>{LOVE_LETTER_RANKS.filter(r=>r!==1).map(r=><button key={r} aria-pressed={guess===r} onClick={()=>{setGuess(r);sound.cue('SELECT');}}><b>{r}</b> {COURT[r].name}</button>)}</fieldset>}</div>}
     {canAct&&g.stage==='CHANCELLOR'&&selected&&<div className="ll-selection"><strong>{COURT[selected.rank].name} 한 장을 남깁니다.</strong><p>덱 아래 반환 순서: {ordered.map(c=>`${c.rank} ${COURT[c.rank].name}`).join(' → ')}<br/><small>왼쪽 카드가 오른쪽 카드보다 먼저 뽑힙니다. 나에게만 보입니다.</small></p>{ordered.length===2&&<button onClick={()=>{setReverse(x=>!x);sound.cue('PAPER');}}>반환 순서 바꾸기 ⇄</button>}</div>}
     <div className="ll-commit"><span>{flight?'서버 결과를 확인하고 있습니다…':!canAct?'공개 기록과 카드 도감을 살펴보세요.':!selected?'카드를 눌러 선택하세요.':'선택을 확인한 뒤 확정하세요.'}</span><button className="ll-primary" disabled={!canAct||!selected||(g.stage==='PLAY_CARD'&&!action)} onClick={()=>{if(g.stage==='CHANCELLOR'&&selected)submit({kind:'CHANCELLOR',keepCardId:selected.cardId,returnCardIds:ordered.map(c=>c.cardId)});else if(action)submit(action);}}>{g.stage==='CHANCELLOR'&&canAct?'이 카드를 남기기':selected?`${COURT[selected.rank].name} 사용 확정`:'카드를 선택하세요'}</button></div>
    </section>}
   </>}
   {(message||retry)&&<div className="ll-error" role="alert"><p>{message}</p>{retry&&<button disabled={flight||!props.connected} onClick={()=>void send(retry)}>같은 요청 결과 재확인</button>}</div>}
   <section className="ll-reference"><details><summary>궁정의 인물들 · 카드 도감</summary><div className="ll-guide-grid">{LOVE_LETTER_RANKS.map(r=><div className="ll-guide-person" key={r}><CourtPortrait rank={r}/><div><strong>{r} {COURT[r].name} <small>총 {LOVE_LETTER_COUNTS[r]}장</small></strong><p>{COURT[r].effect}</p></div></div>)}</div></details>{g&&<details><summary>공개 기록 · 이번 라운드</summary><ol>{g.history.map(e=><li key={e.sequence}>{eventText({...g,history:[e]},name)}</li>)}</ol></details>}<details><summary>게임 방법과 온라인 진행</summary><p>내 차례에 서버가 한 장을 뽑아줍니다. 손패 두 장 중 한 장을 사용하고 효과를 처리하세요. 마지막 생존자 또는 덱 소진 후 가장 높은 손패가 라운드에서 승리합니다. 동점자는 모두 호감을 얻습니다.</p><p>목표 호감: 2인 6개 · 3인 5개 · 4인 4개 · 5–6인 3개. 첩자 보너스도 승리에 포함됩니다. 동시에 목표를 달성하면 공동 승리입니다.</p><p>시간 제한은 없습니다. 창을 닫아도 재접속할 수 있습니다. ‘나가기’를 선택하면 매치가 취소됩니다. 대화는 대면 또는 별도 음성 통화를 이용해주세요.</p></details></section>
  </div>
 </main>;
}
