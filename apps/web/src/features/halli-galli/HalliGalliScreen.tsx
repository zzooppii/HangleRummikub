import { HalliBellArt, HalliFruitArt } from "./art.js";
import { useEffect, useRef, useState } from "react";
import type { HalliCardFace, HalliClientCommand } from "@hangul-rummikub/shared";
import type { HalliWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
const FRUIT = { STRAWBERRY: { icon: "🍓", name: "딸기" }, BANANA: { icon: "🍌", name: "바나나" }, LIME: { icon: "🍋‍🟩", name: "라임" }, PLUM: { icon: "🟣", name: "자두" } };

function FruitCard({ card }: { card: HalliCardFace | null }) {
 return <div className={`halli-card ${card ? card.fruit.toLowerCase() : "back"}`} aria-label={card ? `${FRUIT[card.fruit].name} ${card.count}개` : "아직 공개된 카드 없음"}>
  {card ? <><b className="halli-card-number">{card.count}</b><div className={`halli-fruits count-${card.count}`} aria-hidden="true">{Array.from({ length: card.count }, (_, i) => <span key={i}><HalliFruitArt fruit={card.fruit}/></span>)}</div><small>{FRUIT[card.fruit].name}</small></> : <><span aria-hidden="true">✳</span><small>FRUIT CLUB</small></>}
 </div>;
}
type Props = Readonly<{ snapshot: HalliWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
 onCommand(command: HalliClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void }>;
export function HalliGalliScreen(props: Props) {
 const s = props.snapshot, game = s.game, playing = game?.phase === "PLAYING" ? game : null;
 const self = s.self.playerId, host = s.room.players.some(p => p.playerId === self && p.isHost);
 const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [now, setNow] = useState(s.serverTime as number);
 const busyRef = useRef(false);
 useEffect(() => { window.scrollTo(0, 0); }, [s.room.roomId]);
 useEffect(() => { const base = performance.now(); setNow(s.serverTime); const timer = window.setInterval(() => setNow(s.serverTime + performance.now() - base), 100); return () => window.clearInterval(timer); }, [s.serverTime]);
 const enabled = props.connected && !props.pending && !busy;
 const mine = game?.playerStates.find(p => p.playerId === self);
 const canBell = enabled && playing !== null && !mine?.eliminated && now < playing.deadlineAt;
 const canFlip = canBell && playing?.activePlayerId === self;
 const name = (id: string) => s.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
 async function send(command: HalliClientCommand) {
  if (busyRef.current || !props.connected) return;
  busyRef.current = true; setBusy(true); setError(null);
  try { await props.onCommand(command); } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해주세요."); }
  finally { busyRef.current = false; setBusy(false); }
 }
 function bell() { if (canBell && playing) void send({ protocolVersion: 1, requestId: createRequestId(), kind: "halli:bell", gameId: playing.gameId, expectedGameRevision: playing.gameRevision, payload: {} }); }
 function flip() { if (canFlip && playing) void send({ protocolVersion: 1, requestId: createRequestId(), kind: "halli:flip", gameId: playing.gameId, expectedGameRevision: playing.gameRevision, turnId: playing.turnId, payload: {} }); }
 useEffect(() => {
  const key = (e: KeyboardEvent) => { if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.target instanceof HTMLElement && e.target.closest("button,input,textarea,select,summary,[contenteditable]")) return; if (e.code === "Space") { e.preventDefault(); bell(); } if (e.code === "KeyF") { e.preventDefault(); flip(); } };
  window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
 });
 const ready = getGameStartControl(s, props.pending || !props.connected);
 const feedback = game?.feedback;
 return <main className="halli-screen">
  <header className="halli-header"><div><span className="halli-eyebrow">THE FRUIT CLUB · 08</span><h1>할리갈리<span>다섯 개, 지금!</span></h1></div><div className="halli-room-tools"><span>{props.connectionLabel} · 방 {s.room.roomCode}</span><button onClick={props.onCopy}>초대 링크 복사</button><button onClick={props.onLeave} disabled={props.pending}>방 나가기</button></div></header>
  {(error || props.error) && <p className="halli-error" role="alert">{error || props.error}</p>}
  {!props.connected && <p className="halli-error" role="status">연결을 복구하고 있습니다. 다시 연결되면 현재 카드로 이어집니다.</p>}
  {!game ? <div className="halli-lobby"><section className="halli-welcome"><span className="halli-eyebrow">눈은 과일에. 손은 벨에.</span><h2>하나, 둘, 셋, 넷…<br/><em>다섯!</em></h2><div className="halli-hero-art"><FruitCard card={{ fruit: "STRAWBERRY", count: 2 }}/><HalliBellArt/><FruitCard card={{ fruit: "STRAWBERRY", count: 3 }}/></div><p>같은 과일이 정확히 5개라면?<br/>가장 먼저 벨을 울려 카드를 가져오세요.</p><span className="halli-tag">2–6명 · 반응 속도 · 카드가 소진될 때까지</span></section>
   <section className="halli-lobby-panel"><span className="halli-eyebrow">READY AT THE TABLE</span><h2>함께할 친구들 <small>{s.room.players.length}/6</small></h2><div className="halli-roster">{s.room.players.map((p, i) => <div key={p.playerId}><span className="halli-avatar">{["🍓", "🍌", "🟣", "🍋‍🟩"][i % 4]}</span><div><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "준비 완료" : "연결 기다리는 중"}</small></div><i className={p.connectionStatus === "CONNECTED" ? "online" : ""}/></div>)}</div><p>{ready.guidance}</p>{host ? <button className="halli-primary" disabled={!ready.canStart || !enabled} onClick={props.onStart}>카드 나누고 시작하기 <span>→</span></button> : <p className="halli-wait">방장이 시작하면 카드를 나눠드립니다.</p>}</section>
  </div> : game.phase === "FINISHED" ? <section className="halli-result"><span className="halli-eyebrow">THAT WAS QUICK!</span><HalliBellArt/><h2>{game.result.reason === "CANCELLED" ? "이번 판이 취소됐어요" : `${game.result.winnerPlayerIds.map(name).join(" · ")} 승리!`}</h2><p>{game.result.reason === "CANCELLED" ? "참가자가 방을 나갔습니다. 인원을 정비하고 다시 시작해요." : "다른 참가자의 카드가 모두 소진되었습니다. 마지막 생존자가 모든 카드를 가져갑니다."}</p><div className="halli-scores">{[...game.result.scores].sort((a, b) => b.cards - a.cards).map(p => <div className={game.result.winnerPlayerIds.includes(p.playerId) ? "winner" : ""} key={p.playerId}><b>{name(p.playerId)}</b><strong>{p.cards}<small>장</small></strong></div>)}</div>{host ? <button className="halli-primary" disabled={!enabled} onClick={() => void send({ protocolVersion: 1, requestId: createRequestId(), kind: "halli:rematch", gameId: game.gameId, expectedGameRevision: game.gameRevision, expectedRoomRevision: s.versions.roomRevision, payload: {} })}>같은 방에서 다시 하기</button> : <p>방장이 다음 판을 준비하고 있습니다.</p>}</section> : <>
   <section className="halli-turn"><div><span className="halli-eyebrow">{game.playerStates.filter(p => !p.eliminated).length === 2 ? "마지막 두 사람 · 카드가 소진될 때까지" : "WATCH THE TOP CARDS"}</span><h2>{game.activePlayerId === self ? "내 카드 뒤집을 차례" : `${name(game.activePlayerId)} 님 차례`}</h2></div><span className="halli-timer" role="timer">{Math.max(0, Math.ceil((game.deadlineAt - now) / 1000))}<small>초 뒤 자동 공개</small></span></section>
   <section className="halli-table" aria-label="공개 카드 테이블">{game.playerStates.map(p => <article key={p.playerId} className={`halli-seat${p.playerId === self ? " self" : ""}${p.playerId === game.activePlayerId ? " active" : ""}${p.eliminated ? " eliminated" : ""}`}><div className="halli-seat-title"><b>{name(p.playerId)}{p.playerId === self ? " · 나" : ""}</b><small>{p.eliminated ? "탈락" : s.room.players.find(r => r.playerId === p.playerId)?.connectionStatus === "OFFLINE" ? "자동 진행" : p.playerId === game.activePlayerId ? "뒤집을 차례" : "대기"}</small></div><FruitCard card={p.topCard}/><div className="halli-card-count"><span>남은 카드 <b>{p.deckCount}</b></span><span>공개 더미 <b>{p.discardCount}</b></span></div></article>)}</section>
   <section className="halli-controls"><div className="halli-flip-panel"><span className="halli-eyebrow">YOUR NEXT MOVE</span><button className="halli-primary" disabled={!canFlip} onClick={flip}>{mine?.eliminated ? "관전 중" : game.activePlayerId !== self ? "다른 사람 차례" : "카드 뒤집기"}<kbd>F</kbd></button><small>10초가 지나면 자동으로 뒤집습니다.</small></div><button className="halli-bell" disabled={!canBell} onClick={bell} aria-label="벨 누르기"><HalliBellArt/><strong>벨 누르기</strong><kbd>SPACE</kbd></button><div className={`halli-feedback ${feedback?.kind.toLowerCase() ?? ""}`} role="status" aria-live="polite"><span className="halli-eyebrow">AT THE TABLE</span><p>{feedback ? feedback.kind === "CORRECT" ? `${name(feedback.playerId)} 님 성공! ${feedback.cards}장 획득` : feedback.kind === "WRONG" ? `${name(feedback.playerId)} 님, 5개가 아니에요. ${feedback.cards}장 이동` : `${name(feedback.playerId)} 님이 카드를 ${feedback.kind === "AUTO" ? "자동으로 " : ""}뒤집었습니다.` : "첫 카드가 공개되면 눈 크게 뜨세요!"}</p><small>같은 과일이 정확히 5개일 때만!</small></div></section>
  </>}
  <details className="halli-help"><summary>처음이라면? 게임 방법과 온라인 판정</summary><ol><li>각자 덱에서 차례대로 한 장씩 뒤집어요. 공개 더미의 맨 위 카드만 셉니다.</li><li>같은 과일이 정확히 5개면 누구나 벨! 성공하면 공개 더미 전체를 덱 아래로 가져옵니다.</li><li>잘못 누르면 다른 생존자에게 한 장씩 줍니다. 부족하면 다음 좌석부터 가능한 만큼 지급합니다.</li><li>덱이 비면 즉시 탈락하지만 공개 카드는 남아요. 두 명이 남아도 계속합니다. 오답이면 상대에게 한 장을 주고 이어갑니다.</li><li>다른 참가자의 덱이 모두 소진되면 마지막 생존자가 남은 공개 더미까지 가져가 승리합니다.</li></ol><p>내 차례가 오면 바로 뒤집기 · 차례당 10초 후 자동 진행 · 카드가 소진될 때까지 · 명시적으로 나가면 판 취소</p><p>벨은 서버에서 먼저 처리된 유효 입력을 인정합니다. 통신 지연에 따라 차이가 날 수 있습니다. 낡은 카드 화면의 입력은 벌점 없이 거절하며, 벨 연타는 0.7초 간격으로 제한합니다.</p><p>PC: Space로 벨, F로 카드 뒤집기. 모바일: 버튼 터치. 카드와 벨은 이 사이트의 자체 화면으로 표현합니다.</p></details>
 </main>;
}
