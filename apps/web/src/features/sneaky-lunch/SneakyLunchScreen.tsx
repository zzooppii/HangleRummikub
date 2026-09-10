import { useEffect, useRef, useState } from "react";
import { SneakyDifficultySchema, type SneakyClientCommand, type SneakySettings } from "@hangul-rummikub/shared";
import { safeParse } from "valibot";
import type { SneakyWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { ClassroomArt, LunchboxArt, StudentArt } from "./art.js";
import { LunchAudio } from "./sound.js";
import { LunchFeedbackTracker, type LunchFeedback } from "./feedback.js";
import { ClassroomPlaying, type SeatPulse } from "./ClassroomPlaying.js";
import { CaughtImpact } from "./CaughtImpact.js";
export { remainingFood } from "./ClassroomPlaying.js";

export type SneakyScreenProps = Readonly<{ snapshot: SneakyWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
  onCommand(command: SneakyClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void }>;
export const DIFFICULTY_COPY = {
  EASY: ["쉬움", "오래 칠판을 보고 천천히 돌아봅니다."], NORMAL: ["보통", "기본 속도와 적당한 페이크."],
  HARD: ["어려움", "빠른 반응과 더 많은 페이크."], NIGHTMARE: ["공포의 담임", "리듬을 읽기 힘든 불규칙 패턴."],
} as const;
const LESSONS = [
  ["한입씩, 몰래몰래", "먹기 버튼을 톡톡 눌러 도시락을 먹어요. 꾹 누르기는 안 돼요."],
  ["쉿… 움직인다!", "분필이 멈추면 조심하세요. 아직 먹을 수 있지만, 곧 돌아볼지도 몰라요."],
  ["눈이 마주치면 멈춰!", "선생님이 보고 있거나 돌아가는 중에 누르면 들켜요. 칠판을 볼 때까지 기다려요."],
  ["앗, 페이크였네", "수상한 움직임 뒤 다시 판서를 할 수도 있어요. 미리 알 수는 없어요!"],
  ["빈 도시락 순서대로!", "완식하면 순위가 확정되고 친구들의 경기는 계속돼요. 마지막 생존자는 남은 순위를 받아요. 들켰다면 관전!"],
] as const;
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });
export function canEat(snapshot: SneakyWebSnapshot, connected: boolean, pending = false) {
  return connected && !pending && snapshot.game?.phase === "CLASSROOM" && !snapshot.game.placementOrder?.includes(snapshot.self.playerId) && snapshot.game.playerStates.some(p => p.playerId === snapshot.self.playerId && p.status === "ACTIVE");
}

export function SneakyLunchScreen(props: SneakyScreenProps) {
  const s = props.snapshot, game = s.game, self = s.self.playerId, host = s.room.players.some(p => p.playerId === self && p.isHost);
  const settings = game?.settings ?? ("settings" in s.room ? s.room.settings : { lunchboxCount: 3, difficulty: "NORMAL" as const });
  const teacher = game?.phase === "CLASSROOM" ? game.teacherState : "BOARD";
  const danger = game?.phase === "CLASSROOM" && (teacher === "WATCHING" || teacher === "RETURNING");
  const allowed = canEat(s, props.connected, props.pending), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(false), audio = useRef(new LunchAudio()), tracker = useRef(new LunchFeedbackTracker());
  const [notices, setNotices] = useState<LunchFeedback[]>([]), [pulses, setPulses] = useState<Record<string,SeatPulse>>({});
  const [caughtSpeech,setCaughtSpeech]=useState<string|null>(null), pulseTimers=useRef(new Set<ReturnType<typeof setTimeout>>());
  const [dismissedCatch,setDismissedCatch]=useState<string|null>(null);
  const speechTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [help, setHelp] = useState(false), [step, setStep] = useState(0), dialog = useRef<HTMLDialogElement>(null);
  const [clock, setClock] = useState(0), received = useRef({ serverTime: s.serverTime, local: Date.now() });
  const gameIdentity = useRef(game?.gameId), alive = useRef(true), taps = useRef(0);
  useEffect(() => {
    alive.current = true;
    try { const enabled = localStorage.getItem("sneaky-lunch:sound") !== "off"; setSound(enabled); audio.current.enabled = enabled;
      if (!game && localStorage.getItem("sneaky-lunch:guide") !== "seen") setHelp(true);
    } catch { /* Optional preferences; gameplay remains available. */ }
    return () => { alive.current = false; audio.current.close(); pulseTimers.current.forEach(clearTimeout); if(speechTimer.current)clearTimeout(speechTimer.current); };
  }, []);
  useEffect(() => { received.current = { serverTime: s.serverTime, local: Date.now() }; }, [s.serverTime]);
  useEffect(() => {
    if (game?.phase !== "COUNTDOWN") return;
    const timer = setInterval(() => setClock(n => n + 1), 100); return () => clearInterval(timer);
  }, [game?.phase]);
  useEffect(() => {
    if (gameIdentity.current !== game?.gameId || !props.connected) {
      setNotices([]); setPulses({}); setCaughtSpeech(null); pulseTimers.current.forEach(clearTimeout); pulseTimers.current.clear();
      if(speechTimer.current)clearTimeout(speechTimer.current);
      if(gameIdentity.current!==game?.gameId){setError(null);setHelp(false);gameIdentity.current=game?.gameId;}
    }
    const feedback = tracker.current.update(s, props.connected);
    for (const event of feedback) {
      if(event.playerId){
        const playerId=event.playerId;
        setPulses(previous=>({...previous,[playerId]:event}));
        const timer=setTimeout(()=>{pulseTimers.current.delete(timer);setPulses(previous=>{if(previous[playerId]?.id!==event.id)return previous;const next={...previous};delete next[playerId];return next;});},event.biteDelta?700:2000);
        pulseTimers.current.add(timer);
        if(!event.biteDelta){
          if(speechTimer.current)clearTimeout(speechTimer.current);
          setCaughtSpeech(`${s.room.players.find(p=>p.playerId===playerId)?.nickname??"친구"}! 도시락은 점심시간에 먹어!`);
          speechTimer.current=setTimeout(()=>setCaughtSpeech(null),2000);
        }
      }
      if(event.biteDelta&&event.playerId!==self)continue; // Public seat motion, never a chorus of remote bite sounds.
      if (event.cue === "BITE") audio.current.play(event.cue);
      else if (event.cue === "SUSPICIOUS" || event.cue === "WATCHING" && !event.text.includes("들켰")) audio.current.play(event.cue);
      else setNotices(queue => event.cue==="CAUGHT" ? [event,...queue].slice(0,8) : [...queue, event].slice(-8));
    }
  }, [s, props.connected]);
  const currentNotice = notices[0];
  const caughtImpact=currentNotice?.cue==="CAUGHT"&&currentNotice.id!==dismissedCatch;
  useEffect(() => {
    if (!currentNotice) return;
    audio.current.play(currentNotice.cue);
    const timer = setTimeout(() => setNotices(queue => queue.slice(1)), 2000); return () => clearTimeout(timer);
  }, [currentNotice?.id]);
  useEffect(() => { if (help && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [help]);
  function closeHelp() { dialog.current?.close(); setHelp(false); try { localStorage.setItem("sneaky-lunch:guide", "seen"); } catch { /* Optional preference. */ } }
  function toggleSound() { const enabled = !sound; setSound(enabled); audio.current.enabled = enabled; audio.current.unlock(); try { localStorage.setItem("sneaky-lunch:sound", enabled ? "on" : "off"); } catch { /* Optional preference. */ } }
  async function command(value: SneakyClientCommand) {
    if (!props.connected || props.pending || busy) return;
    setBusy(true); setError(null);
    try { await props.onCommand(value); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "요청 결과를 확인해주세요."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function eat() {
    if (!allowed || !game || taps.current >= 3) return;
    audio.current.unlock(); taps.current++;
    try { await props.onCommand({ ...envelope(), kind: "sneaky:eat", gameId: game.gameId, teacherStateRevision: game.teacherStateRevision, payload: {} }); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "연결을 확인해주세요."); }
    finally { taps.current--; }
  }
  function configure(next: SneakySettings) { void command({ ...envelope(), kind: "sneaky:configure", expectedRoomRevision: s.versions.roomRevision, payload: next }); }
  const seconds = game?.phase === "COUNTDOWN" ? Math.max(0, Math.ceil((game.countdownEndsAt - (received.current.serverTime + Date.now() - received.current.local)) / 1000)) : 0;
  void clock;
  const ready = getGameStartControl(s, busy || props.pending || !props.connected);
  const currentLesson=step===4&&game?.rulesVersion==="sneaky-lunch-rules-v1"
    ? ["가장 먼저 빈 도시락!", "이 저장판은 이전 규칙입니다. 먼저 완식하면 즉시 승리하고, 모두 탈락하면 선생님이 승리해요."]
    : LESSONS[step]!;
  const title = game?.phase === "COUNTDOWN" ? "수업이 곧 시작돼요" : game?.phase === "FINISHED" ? "오늘의 몰래 한입" : teacher === "WATCHING" ? "멈춰! 선생님이 보고 있어요" : teacher === "RETURNING" ? "아직 안 돼요, 조금만 더!" : teacher === "SUSPICIOUS" ? "쉿… 무슨 소리지?" : "칠판 볼 때, 몰래 한입!";
  return <main className={`lunch-shell${game?" lunch-playing":""} difficulty-${settings.difficulty.toLowerCase()}${danger ? " is-danger" : ""}`} onPointerDown={() => audio.current.unlock()}>
    <header className="lunch-header"><div><span className="lunch-eyebrow">THE SECRET LUNCH CLUB</span><h1>몰래 한입<span aria-hidden="true">!</span></h1></div><nav aria-label="교실 도구">
      <button onClick={props.onCopy} aria-label="방 초대 복사">ROOM {s.room.roomCode}</button><span className={`lunch-connection ${props.connected ? "online" : ""}`}>{props.connectionLabel}</span>
      <button onClick={() => { setStep(0); setHelp(true); }}>게임 방법</button><button onClick={toggleSound} aria-pressed={sound}>소리 {sound ? "ON" : "OFF"}</button><button onClick={props.onLeave} disabled={props.pending}>방 나가기</button>
    </nav></header>
    {(error || props.error) && <p className="lunch-error" role="alert">{error ?? props.error}<button onClick={() => setError(null)} aria-label="알림 닫기">닫기</button></p>}
    {!game ? <div className="lunch-lobby"><section className="lunch-invitation"><span className="lunch-sticker">오늘의 비밀 작전</span><h2>분필 소리에 맞춰,<br/><em>도시락을 비워라.</em></h2><ClassroomArt/><p>선생님 몰래 톡톡 한입.<br/>눈이 마주치면, 이미 늦었어요!</p><span className="lunch-paper-note">친구 2–8명 · 연타와 눈치의 교실 파티</span></section>
      <section className="lunch-setup"><span className="lunch-eyebrow">LUNCH PLAN</span><h2>오늘의 도시락 계획</h2><div className="lunch-classmates">{s.room.players.map((p, i) => <div key={p.playerId}><StudentArt seat={i}/><strong>{p.nickname}{p.playerId === self ? " · 나" : ""}</strong><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "자리 착석" : "자리 비움"}</small></div>)}</div>
        <fieldset disabled={!host || !props.connected || props.pending || busy}><legend>도시락은 몇 개?</legend><div className="lunch-box-choice">{[1, 2, 3, 4, 5].map(count => <button key={count} aria-pressed={settings.lunchboxCount === count} aria-label={`도시락 ${count}개`} onClick={() => configure({ ...settings, lunchboxCount: count })}><LunchboxArt small closed/>{count}개</button>)}</div>
          <label htmlFor="lunch-difficulty">오늘의 선생님<select id="lunch-difficulty" value={settings.difficulty} onChange={e => { const value = safeParse(SneakyDifficultySchema, e.target.value); if (value.success) configure({ ...settings, difficulty: value.output }); }}>{Object.entries(DIFFICULTY_COPY).map(([id, copy]) => <option key={id} value={id}>{copy[0]}</option>)}</select></label><p className="lunch-difficulty-hint">{DIFFICULTY_COPY[settings.difficulty][1]}</p>
        </fieldset><p>{ready.guidance}</p>{host ? <button className="lunch-primary" disabled={!ready.canStart} onClick={props.onStart}>쉿! 수업 시작</button> : <p className="lunch-wait-note">방장이 수업을 준비하고 있어요.</p>}
      </section></div> : <>
      <ClassroomPlaying snapshot={s} title={title} seconds={seconds} allowed={allowed} danger={danger} pulses={pulses} caughtSpeech={caughtSpeech} suppressResult={Boolean(caughtImpact||pulses[self]?.cue==="CAUGHT")} onEat={()=>void eat()} resultControls={game.phase==="FINISHED" ? host ? <button className="lunch-primary" disabled={!props.connected||props.pending||busy} onClick={()=>void command({...envelope(),kind:"sneaky:rematch",gameId:game.gameId,expectedGameRevision:game.gameRevision,expectedRoomRevision:s.versions.roomRevision,payload:{}})}>대기실로 돌아가기</button> : <p>방장이 다음 수업을 준비할 때까지 기다려주세요.</p> : null}/>
    </>}
    {caughtImpact&&currentNotice&&<CaughtImpact key={currentNotice.id} onClose={()=>setDismissedCatch(currentNotice.id)}/>}
    {currentNotice && !caughtImpact && <aside key={currentNotice.id} className={`lunch-impact${currentNotice.prominent ? " prominent" : ""}`} role="status"><span aria-hidden="true">{currentNotice.cue === "CAUGHT" ? "!" : "✦"}</span>{currentNotice.text}</aside>}
    {help && <dialog ref={dialog} className="lunch-guide" aria-labelledby="lunch-guide-title" onCancel={closeHelp}><button className="lunch-guide-close" onClick={closeHelp} aria-label="게임 방법 닫기">닫기</button><span className="lunch-eyebrow">비밀 작전 수첩 · {step + 1} / 5</span><div className="lunch-guide-art">{step === 0 || step === 4 ? <LunchboxArt closed={step === 4}/> : <ClassroomArt state={step === 2 ? "WATCHING" : "SUSPICIOUS"}/>}</div><h2 id="lunch-guide-title">{currentLesson[0]}</h2><p>{currentLesson[1]}</p><div className="lunch-guide-controls"><button disabled={step === 0} onClick={() => setStep(n => n - 1)}>이전</button><button className="lunch-primary" onClick={() => step === 4 ? closeHelp() : setStep(n => n + 1)}>{step === 4 ? "작전 준비 완료" : "다음"}</button></div></dialog>}
  </main>;
}
