import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LOST_CITIES_SUITS, lostCitiesSuits, type LostCitiesSettings, PROTOCOL_VERSION, type LostCitiesCard, type LostCitiesClientCommand, type LostCitiesProjection, type LostCitiesSuit, type PlatformPlayerViewV2 } from "@hangul-rummikub/shared";
import type { LostCitiesWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { createRequestId } from "../../lib/request-id.js";
import { LostCitiesCommandRejected } from "../../lib/lost-cities-command-error.js";
import { LC_LABELS, LC_MARKS, cardLabel, canPlaceLostCities, emptyLostCitiesDraft, previewLostCities, sortLostCitiesHand } from "./ui.js";

type Props={snapshot:LostCitiesWebSnapshot;connected:boolean;pending:boolean;error:string|null;connectionLabel:string;onCommand(command:LostCitiesClientCommand):Promise<void>;onRematch():void;onStart():void;onLeave():void;onCopy():void};
const artStyle=(suit:LostCitiesSuit):CSSProperties=>suit==='CANYON'?{backgroundImage:"url('/images/lost-cities/canyon.png')",backgroundSize:'cover',backgroundPosition:'center 42%'}:({backgroundPosition:`${LOST_CITIES_SUITS.findIndex(value=>value===suit)*25}% 42%`});
function CardFace({card}:{card:LostCitiesCard}) {
  const rank=card.kind==='NUMBER'?card.value:'×';
  return <><span className="lc-card-art" style={artStyle(card.suit)} aria-hidden="true"/><span className="lc-card-corner"><b>{rank}</b><small>{LC_MARKS[card.suit]}</small></span><span className="lc-card-name">{card.kind==='INVESTMENT'?'투자':LC_LABELS[card.suit]}</span><span className="lc-card-bottom" aria-hidden="true">{rank}</span>{card.kind==='INVESTMENT'&&<span className="lc-invest-seal" aria-hidden="true">✦</span>}</>;
}
function Expedition({expedition,highlight}:{expedition:LostCitiesProjection['playerStates'][number]['expeditions'][number];highlight:boolean}) {
  const {score,cards,suit}=expedition;
  return <div className={`lc-expedition ${highlight?'lc-highlight':''}`} aria-label={`${LC_LABELS[suit]} 탐험`}>
    <div className="lc-expedition-art" style={artStyle(suit)} aria-hidden="true"/>
    <div className="lc-stack">{cards.map((card,i)=><div key={card.cardId} className={`lc-table-card lc-suit-${suit} ${i===cards.length-1?'lc-last-card':''}`} aria-label={cardLabel(card)}><CardFace card={card}/></div>)}{!cards.length&&<span className="lc-empty-mark" aria-label="아직 시작하지 않은 탐험">{LC_MARKS[suit]}</span>}</div>
    <details className="lc-score-detail"><summary><strong>{score.total>0?'+':''}{score.total}</strong><span>점</span><small>×{score.multiplier}</small></summary><div>{score.cardCount===0?'미시작 · 0점':<>{score.sum} − {score.cost}<br/>× {score.multiplier}<br/>보너스 +{score.bonus}<br/>{score.cardCount}장 / 8장</>}</div></details>
  </div>;
}
export function LostCitiesScreen(props:Props) {
  const s=props.snapshot;
  const [configuring,setConfiguring]=useState(false),[configError,setConfigError]=useState<string|null>(null),[configRetry,setConfigRetry]=useState<LostCitiesClientCommand|null>(null);
  const configLock=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const mode=(s.game?.settings??s.room.settings)?.mode??'BASE',suits=lostCitiesSuits(mode);
  const start=getGameStartControl(s,props.pending||!props.connected||configuring||!!configRetry);
  async function configure(nextMode:LostCitiesSettings['mode'],retryCommand?:LostCitiesClientCommand){
    if(configLock.current||!props.connected||props.pending||s.game!==null||!s.room.players.find(p=>p.playerId===s.self.playerId)?.isHost)return;
    configLock.current=true;setConfiguring(true);setConfigError(null);
    const command=retryCommand??{kind:'lostCities:configure',protocolVersion:PROTOCOL_VERSION,requestId:createRequestId(),expectedRoomRevision:s.versions.roomRevision,payload:{mode:nextMode}};
    try{await props.onCommand(command);if(alive.current)setConfigRetry(null);}
    catch(error){if(alive.current){setConfigError(error instanceof Error?error.message:'설정을 저장하지 못했습니다.');setConfigRetry(error instanceof LostCitiesCommandRejected?null:command);}}
    finally{configLock.current=false;if(alive.current)setConfiguring(false);}
  }
  const modeLabel=mode==='BASE'?'일반판 · 5개 탐험 · 60장':'확장판 · 6개 탐험 · 72장';
  return <section className="lost-cities-screen" aria-label="로스트시티">
    <header className="lc-header"><div><span className="lc-eyebrow">THE EXPEDITION TABLE</span><h1>LOST CITIES <span>로스트시티</span></h1></div><div className="lc-room"><span>방 {s.room.roomCode}</span><span role="status">{props.connectionLabel}</span><button type="button" onClick={props.onCopy} disabled={props.pending}>초대 링크</button><button type="button" onClick={props.onLeave} disabled={props.pending}>나가기</button></div></header>
    {props.error&&<p className="lc-error" role="alert">{props.error}</p>}
    {s.game===null?<div className="lc-lobby"><div className="lc-lobby-landscapes" style={{gridTemplateColumns:`repeat(${suits.length},minmax(0,1fr))`}} aria-hidden="true">{suits.map(suit=><div key={suit} style={artStyle(suit)}><span>{LC_LABELS[suit]}</span></div>)}</div><div className="lc-lobby-content"><span className="lc-eyebrow">{mode==='BASE'?'FIVE PATHS. ONE GREAT ADVENTURE.':'SIX PATHS. A GREATER ADVENTURE.'}</span><h2>어떤 탐험을 시작할까요?</h2><p>카드 한 장의 선택, 대담한 투자.<br/>친구와 함께 {mode==='BASE'?'다섯':'여섯'} 미지의 도시를 향해 떠나세요.</p><fieldset className="lc-mode-selector" disabled={props.pending||!props.connected||configuring||!!configRetry||!s.room.players.find(p=>p.playerId===s.self.playerId)?.isHost}><legend>게임 모드 · 방장 선택</legend>{(['BASE','SIX_EXPEDITIONS'] as const).map(option=><button type="button" key={option} aria-pressed={mode===option} onClick={()=>void configure(option)}>{option==='BASE'?<><strong>일반판</strong><span>5개 탐험 · 60장</span></>:<><strong>확장판</strong><span>6개 탐험 · 72장</span></>}</button>)}</fieldset><p className="lc-mode-description" role="status">{configuring?'설정 저장 중…':modeLabel} · 손패 8장 / 3라운드</p>{configError&&<p className="lc-error" role="alert">{configError}</p>}{configRetry&&<button type="button" disabled={configuring||!props.connected} onClick={()=>void configure(mode,configRetry)}>설정 결과 재확인</button>}<div className="lc-seats">{s.room.players.map(p=><div key={p.playerId}><span className="lc-avatar">{p.nickname.slice(0,1)}</span><strong>{p.nickname}</strong><small>{p.connectionStatus==='CONNECTED'?'접속 중':'재접속 대기'}</small></div>)}{s.room.players.length===1&&<div className="lc-open-seat"><span className="lc-avatar">＋</span><span>친구를 초대하세요</span></div>}</div><button className="lc-primary" disabled={!start.canStart} onClick={props.onStart}>탐험 시작하기 <span aria-hidden="true">→</span></button><p className="lc-muted">{start.guidance}</p><span className="lc-eyebrow">2인 · 3라운드 · 시간 제한 없음</span></div></div>:<LostCitiesTable key={s.game.gameId} game={s.game} {...props}/>}
    <details className="lc-help"><summary>게임 방법</summary><div><p>카드 한 장을 자기 탐험에 놓거나 같은 색 더미에 버린 뒤, 덱 또는 버린 카드 맨 위에서 한 장 가져옵니다. 방금 버린 카드는 바로 가져올 수 없습니다.</p><p>숫자는 오름차순, 투자 카드는 숫자보다 먼저 놓으세요. 시작한 탐험은 (숫자 합 − 20) × (투자 장수 + 1)점입니다. 투자 포함 8장 이상이면 20점 추가. 시작하지 않은 탐험은 0점입니다.</p><p>덱 마지막 카드를 가져오면 즉시 정산합니다. 손패는 점수에 포함되지 않습니다. 세 라운드의 합계가 높은 사람이 승리하고, 동점이면 공동 승리입니다.</p><p>시간 제한은 없습니다. 새로고침과 재접속은 같은 자리로 돌아옵니다. 나가기 버튼은 이번 매치를 취소합니다.</p></div></details>
  </section>;
}
function LostCitiesTable({game:g,...props}:Props&{game:LostCitiesProjection}) {
  const [draft,setDraft]=useState(emptyLostCitiesDraft),[flight,setFlight]=useState(false),[retry,setRetry]=useState<LostCitiesClientCommand|null>(null),[message,setMessage]=useState<string|null>(null);
  const commandRef=useRef<LostCitiesClientCommand|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const scope=`${g.gameId}:${g.roundId}:${g.phase}:${g.phase==='PLAYING'?g.turnId:''}`,scopeRef=useRef(scope);scopeRef.current=scope;
  useEffect(()=>{setDraft(emptyLostCitiesDraft());setRetry(null);setMessage(null);},[scope]);
  const selfId=props.snapshot.self.playerId,players=props.snapshot.room.players;
  const name=(id:string)=>players.find(p=>p.playerId===id)?.nickname??'탐험가';
  const me=g.playerStates.find(p=>p.playerId===selfId)!,other=g.playerStates.find(p=>p.playerId!==selfId)!;
  const canAct=g.phase==='PLAYING'&&g.activePlayerId===selfId&&props.connected&&!props.pending&&!flight&&!retry;
  const card=g.privateState.hand.find(c=>c.cardId===draft.cardId),preview=previewLostCities(g,draft);
  const playable=!!card&&canPlaceLostCities(card,me.expeditions.find(e=>e.suit===card.suit)!.cards);
  async function send(c:LostCitiesClientCommand) {
    if(commandRef.current||!props.connected)return;
    commandRef.current=c;setFlight(true);setMessage(null);const sentScope=scope;
    try {await props.onCommand(c);if(mounted.current&&scopeRef.current===sentScope){setRetry(null);setDraft(emptyLostCitiesDraft());}}
    catch(error){if(mounted.current&&scopeRef.current===sentScope){if(error instanceof LostCitiesCommandRejected){setRetry(null);setMessage(error.message);}else{setRetry(c);setMessage('응답을 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해주세요.');}}}
    finally {if(commandRef.current===c){commandRef.current=null;if(mounted.current)setFlight(false);}}
  }
  function submit(){if(!canAct||g.phase!=='PLAYING'||!preview.action)return;void send({kind:'lostCities:act',protocolVersion:PROTOCOL_VERSION,requestId:createRequestId(),gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId,payload:preview.action});}
  const feedback=g.feedback?`${name(g.feedback.playerId)} · ${cardLabel(g.feedback.card)} ${g.feedback.kind==='PLAY'?'놓기':'버리기'} → ${g.feedback.draw.kind==='DECK'?'덱에서 1장':cardLabel(g.feedback.draw.card)+' 가져오기'}`:null;
  const status=g.phase!=='PLAYING'?'탐험 결과':g.activePlayerId===selfId?'당신의 차례':`${name(g.activePlayerId)}의 차례`;
  return <>
    <p className="lc-mode-badge">{g.settings?.mode==='SIX_EXPEDITIONS'?'확장판 · 6개 탐험 · 72장':'일반판 · 5개 탐험 · 60장'}</p><div className="lc-player-bar"><div className="lc-player"><span className="lc-avatar">{name(other.playerId).slice(0,1)}</span><div><strong>{name(other.playerId)}</strong><small>{players.find(p=>p.playerId===other.playerId)?.connectionStatus==='CONNECTED'?'상대 탐험 · 손패 8장':'재접속을 기다리는 중'}</small></div><div className="lc-hidden-hand" aria-hidden="true">{Array.from({length:8},(_,i)=><span key={i}/>)}</div></div><div className="lc-round"><span>ROUND</span><strong>{g.round} <small>/ 3</small></strong></div><div className="lc-match-score"><span>누적 점수</span><strong>나 {me.cumulative} <i>:</i> 상대 {other.cumulative}</strong></div></div>
    {g.phase!=='PLAYING'&&<Result game={g} players={players} selfId={selfId} connected={props.connected&&!props.pending&&!flight&&!retry} onConfirm={()=>void send({kind:'lostCities:nextRound',protocolVersion:PROTOCOL_VERSION,requestId:createRequestId(),gameId:g.gameId,expectedGameRevision:g.gameRevision,roundId:g.roundId,payload:{}})} onRematch={props.onRematch}/>}
    <div className="lc-board-scroll" tabIndex={0} aria-label="탐험 보드 가로 스크롤"><div className={`lc-board ${g.settings?.mode==='SIX_EXPEDITIONS'?'lc-board-six':''}`} style={{gridTemplateColumns:`repeat(${lostCitiesSuits(g.settings?.mode).length},minmax(0,1fr))`}} aria-label={g.settings?.mode==='SIX_EXPEDITIONS'?'여섯 탐험 보드':'다섯 탐험 보드'}>{lostCitiesSuits(g.settings?.mode).map(suit=>{
      const discard=g.discards.find(d=>d.suit===suit)!;
      const disabled=!canAct||!draft.kind||!discard.top||(draft.kind==='DISCARD'&&card?.suit===suit);
      return <section className={`lc-lane lc-suit-${suit}`} key={suit} aria-label={LC_LABELS[suit]}><header><span aria-hidden="true">{LC_MARKS[suit]}</span><strong>{LC_LABELS[suit]}</strong></header><Expedition expedition={other.expeditions.find(e=>e.suit===suit)!} highlight={g.feedback?.playerId===other.playerId&&g.feedback.kind==='PLAY'&&g.feedback.card.suit===suit}/><div className="lc-discard-zone"><span className="lc-zone-label">공용 버림</span><button type="button" className={`lc-discard-slot ${discard.top?'lc-has-card':''}`} disabled={disabled} aria-pressed={draft.draw?.kind==='DISCARD'&&draft.draw.suit===suit} aria-label={`${LC_LABELS[suit]} 버린 카드 ${discard.top?cardLabel(discard.top):'없음'} 가져오기`} onClick={()=>setDraft(d=>({...d,draw:{kind:'DISCARD',suit}}))}>{discard.top?<CardFace card={discard.top}/>:<span className="lc-empty-mark" aria-hidden="true">{LC_MARKS[suit]}</span>}</button><span className="lc-discard-count">{discard.count}장</span></div><Expedition expedition={me.expeditions.find(e=>e.suit===suit)!} highlight={!!card&&draft.kind==='PLAY'&&card.suit===suit&&playable}/></section>;
    })}</div></div>
    {g.settings?.mode==='SIX_EXPEDITIONS'&&<p className="lc-scroll-hint">보드를 좌우로 밀어 여섯 탐험을 확인하세요 ↔</p>}<div className="lc-table-status"><span className={canAct?'lc-your-turn':''} role="status">{status}</span><span className="lc-board-legend">위: 상대 탐험 · 아래: 내 탐험</span><button className={`lc-deck ${g.deckCount<=8?'lc-deck-low':''}`} type="button" disabled={!canAct||!draft.kind} aria-pressed={draft.draw?.kind==='DECK'} onClick={()=>setDraft(d=>({...d,draw:{kind:'DECK'}}))}><span className="lc-deck-icon" aria-hidden="true">✦</span><span>덱에서 가져오기<strong>{g.deckCount}장 남음</strong></span></button></div>
    {feedback&&<p className="lc-feedback" key={`${g.gameRevision}-feedback`} role="status">{feedback}</p>}
    <section className="lc-hand-section" aria-label="내 손패"><div className="lc-hand-heading"><h2>내 손패 <small>8장</small></h2><span>나에게만 보입니다</span></div><div className="lc-hand">{sortLostCitiesHand(g.privateState.hand).map(c=><button type="button" key={c.cardId} className={`lc-hand-card lc-suit-${c.suit}`} aria-label={cardLabel(c)} aria-pressed={draft.cardId===c.cardId} disabled={!canAct} onClick={()=>{setDraft({cardId:c.cardId,kind:null,draw:null});setMessage(null);}}><CardFace card={c}/></button>)}</div></section>
    {g.phase==='PLAYING'&&<footer className="lc-action-bar"><div className="lc-action-summary"><span className="lc-eyebrow">{!card?'01 · 카드 선택':!draft.kind?'02 · 행동 선택':!draft.draw?'03 · 가져올 곳':'04 · 턴 확정'}</span><p aria-live="polite">{canAct?preview.hint:flight?'서버에서 결과를 확인하는 중…':retry?'요청 결과를 재확인해주세요.':props.connected?'상대의 탐험을 살펴보세요.':'연결을 복구하는 중입니다.'}</p></div><div className="lc-action-buttons"><button type="button" disabled={!canAct||!card||!playable} aria-pressed={draft.kind==='PLAY'} onClick={()=>setDraft(d=>({...d,kind:'PLAY',draw:null}))}>탐험에 놓기</button><button type="button" disabled={!canAct||!card} aria-pressed={draft.kind==='DISCARD'} onClick={()=>setDraft(d=>({...d,kind:'DISCARD',draw:null}))}>버리기</button><button type="button" className="lc-primary" disabled={!canAct||!preview.action} onClick={submit}>턴 확정 <span aria-hidden="true">→</span></button></div>{card&&!playable&&<small className="lc-placement-hint">{card.kind==='INVESTMENT'?'숫자를 놓은 탐험에는 투자할 수 없습니다.':'이미 놓인 숫자보다 큰 카드만 놓을 수 있습니다.'} 버리기는 가능합니다.</small>}</footer>}
    {(message||retry)&&<div className="lc-error" role="alert"><p>{message}</p>{retry&&<button type="button" disabled={!props.connected||flight} onClick={()=>void send(retry)}>같은 요청 결과 재확인</button>}</div>}
  </>;
}
function Result({game:g,players,selfId,connected,onConfirm,onRematch}:{game:LostCitiesProjection;players:readonly PlatformPlayerViewV2[];selfId:string;connected:boolean;onConfirm():void;onRematch():void}) {
  if(g.phase==='PLAYING')return null;
  const name=(id:string)=>players.find(p=>p.playerId===id)?.nickname??'탐험가',last=g.roundResults.at(-1);
  const title=g.phase==='ROUND_RESULT'?`${g.round}라운드 탐험 완료`:g.result.reason==='CANCELLED'?'매치가 취소되었습니다':g.result.winnerPlayerIds.length===2?'두 탐험가의 공동 승리':`${name(g.result.winnerPlayerIds[0]!)} 승리!`;
  return <section className="lc-result" aria-label="탐험 결과"><span className="lc-eyebrow">{g.phase==='ROUND_RESULT'?'EXPEDITION COMPLETE':'THE JOURNEY ENDS'}</span><h2>{title}</h2>{last&&<div className="lc-result-scores">{last.scores.map(p=><div key={p.playerId}><strong>{name(p.playerId)}</strong><span className="lc-result-total">{p.total>0?'+':''}{p.total}<small>점</small></span><span>누적 {p.cumulative}점</span><div className="lc-result-suits">{p.expeditions.map(e=><span key={e.suit} className={`lc-suit-${e.suit}`}><span aria-label={LC_LABELS[e.suit]}>{LC_MARKS[e.suit]}</span> {e.total}</span>)}</div></div>)}</div>}{g.roundResults.length>0&&<details className="lc-round-history"><summary>라운드별 점수 보기</summary>{g.roundResults.map(r=><p key={r.round}>{r.round}라운드 · {r.scores.map(s=>`${name(s.playerId)} ${s.total}점`).join(' / ')}</p>)}</details>}{g.phase==='ROUND_RESULT'?<><p>{g.confirmedPlayerIds.length?`${g.confirmedPlayerIds.map(name).join(', ')} 확인 완료`:'두 사람이 확인하면 다음 탐험을 시작합니다.'}</p><button className="lc-primary" disabled={!connected||g.confirmedPlayerIds.includes(g.privateState.playerId)} onClick={onConfirm}>{g.confirmedPlayerIds.includes(g.privateState.playerId)?'상대 확인 기다리는 중':'확인 · 다음 라운드'}</button></>:players.find(p=>p.playerId===selfId)?.isHost?<button className="lc-primary" disabled={!connected} onClick={onRematch}>같은 방에서 다시 하기</button>:<p>방장이 다음 게임을 선택할 수 있습니다.</p>}</section>;
}
