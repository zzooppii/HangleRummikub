import { useEffect, useRef, useState } from "react";
import { SneakyDifficultySchema, type SneakyClientCommand, type SneakySettings } from "@hangul-rummikub/shared";
import { safeParse } from "valibot";
import type { SneakyWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { ClassroomArt, LunchboxArt, StudentArt } from "./art.js";
import { LunchAudio } from "./sound.js";
import { LunchFeedbackTracker, type LunchFeedback } from "./feedback.js";

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
  ["가장 먼저 빈 도시락!", "모든 도시락을 먼저 비우면 승리! 들켰다면 친구들을 구경해요."],
] as const;
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });
export function remainingFood(bites: number, required: number) { return bites >= required ? 0 : 1 - (bites % 30) / 30; }
export function canEat(snapshot: SneakyWebSnapshot, connected: boolean, pending = false) {
  return connected && !pending && snapshot.game?.phase === "CLASSROOM" && snapshot.game.playerStates.some(p => p.playerId === snapshot.self.playerId && p.status === "ACTIVE");
}

export function SneakyLunchScreen(props: SneakyScreenProps) {
  const s = props.snapshot, game = s.game, self = s.self.playerId, host = s.room.players.some(p => p.playerId === self && p.isHost);
  const settings = game?.settings ?? ("settings" in s.room ? s.room.settings : { lunchboxCount: 3, difficulty: "NORMAL" as const });
  const own = game?.playerStates.find(p => p.playerId === self), teacher = game?.phase === "CLASSROOM" ? game.teacherState : "BOARD";
  const danger = game?.phase === "CLASSROOM" && (teacher === "WATCHING" || teacher === "RETURNING");
  const allowed = canEat(s, props.connected, props.pending), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(false), audio = useRef(new LunchAudio()), tracker = useRef(new LunchFeedbackTracker());
  const [notices, setNotices] = useState<LunchFeedback[]>([]), [bite, setBite] = useState(0);
  const [help, setHelp] = useState(false), [step, setStep] = useState(0), dialog = useRef<HTMLDialogElement>(null);
  const [clock, setClock] = useState(0), received = useRef({ serverTime: s.serverTime, local: Date.now() });
  const gameIdentity = useRef(game?.gameId), alive = useRef(true), taps = useRef(0);
  useEffect(() => {
    alive.current = true;
    try { const enabled = localStorage.getItem("sneaky-lunch:sound") !== "off"; setSound(enabled); audio.current.enabled = enabled;
      if (!game && localStorage.getItem("sneaky-lunch:guide") !== "seen") setHelp(true);
    } catch { /* Optional preferences; gameplay remains available. */ }
    return () => { alive.current = false; audio.current.close(); };
  }, []);
  useEffect(() => { received.current = { serverTime: s.serverTime, local: Date.now() }; }, [s.serverTime]);
  useEffect(() => {
    if (game?.phase !== "COUNTDOWN") return;
    const timer = setInterval(() => setClock(n => n + 1), 100); return () => clearInterval(timer);
  }, [game?.phase]);
  useEffect(() => {
    if (gameIdentity.current !== game?.gameId) { setNotices([]); setBite(0); setError(null); setHelp(false); gameIdentity.current = game?.gameId; }
    if (!props.connected) setNotices([]);
    const feedback = tracker.current.update(s, props.connected);
    for (const event of feedback) {
      if (event.cue === "BITE") { audio.current.play(event.cue); setBite(n => n + 1); }
      else if (event.cue === "SUSPICIOUS" || event.cue === "WATCHING" && !event.text.includes("들켰")) audio.current.play(event.cue);
      else setNotices(queue => [...queue, event].slice(-8));
    }
  }, [s, props.connected]);
  const currentNotice = notices[0];
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
  const title = game?.phase === "COUNTDOWN" ? "수업이 곧 시작돼요" : game?.phase === "FINISHED" ? "오늘의 몰래 한입" : teacher === "WATCHING" ? "멈춰! 선생님이 보고 있어요" : teacher === "RETURNING" ? "아직 안 돼요, 조금만 더!" : teacher === "SUSPICIOUS" ? "쉿… 무슨 소리지?" : "칠판 볼 때, 몰래 한입!";
  const name = (id: string | null) => s.room.players.find(p => p.playerId === id)?.nickname ?? "친구";
  return <main className={`lunch-shell difficulty-${settings.difficulty.toLowerCase()}${danger ? " is-danger" : ""}`} onPointerDown={() => audio.current.unlock()}>
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
      <section className={`lunch-front teacher-${teacher.toLowerCase()}`} aria-label="선생님과 교실"><div className="lunch-front-caption"><span className="lunch-eyebrow">{DIFFICULTY_COPY[settings.difficulty][0]} · {settings.lunchboxCount}개의 도시락</span><h2 role="status">{title}</h2></div><div className="lunch-scene"><ClassroomArt state={teacher}/></div>
        {game.phase === "COUNTDOWN" && <div className="lunch-countdown" role="status"><strong>{seconds > 0 ? seconds : "쉿!"}</strong><span>도시락 뚜껑을 살짝 열어주세요</span></div>}
      </section>
      <section className="lunch-desks-section" aria-label="친구들의 도시락"><div className="lunch-section-heading"><h2>교실 뒤쪽, 우리 자리</h2><span>친구들의 눈치 작전</span></div><div className="lunch-desks">
        {s.room.players.map((p, i) => { const player = game.playerStates.find(g => g.playerId === p.playerId)!; const winner = game.phase === "FINISHED" && game.result.winnerPlayerId === p.playerId;
          return <article key={p.playerId} className={`lunch-desk${p.playerId === self ? " my-desk" : ""} status-${player.status.toLowerCase()}${winner ? " winner" : ""}`}><div className="lunch-desk-student"><StudentArt seat={i} caught={player.status === "CAUGHT"} winner={winner} chewKey={p.playerId === self ? bite : 0}/><div className="lunch-desk-food"><LunchboxArt small remaining={remainingFood(player.completedBites, game.requiredBites)} closed={player.status !== "ACTIVE"}/></div></div>
            <div className="lunch-desk-name"><strong>{p.nickname}{p.playerId === self ? " · 나" : ""}</strong><span>{winner ? "완식 성공!" : player.status === "CAUGHT" ? "들켰어요" : player.status === "FORFEITED" ? "자리 비움" : p.connectionStatus === "OFFLINE" ? "연결 대기" : "눈치 작전 중"}</span></div>
            <div className="lunch-progress" role="progressbar" aria-label={`${p.nickname}님의 완식 진행`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(player.completedBites / game.requiredBites * 100)}><span style={{ width: `${player.completedBites / game.requiredBites * 100}%` }}/></div>
            <div className="lunch-box-track" aria-label="도시락 완식 상태">{Array.from({ length: settings.lunchboxCount }, (_, j) => <span key={j} className={player.completedBites >= (j + 1) * 30 ? "cleared" : ""} aria-label={player.completedBites >= (j + 1) * 30 ? "빈 도시락" : "남은 도시락"}><LunchboxArt closed small/></span>)}</div>
          </article>; })}
      </div></section>
      {game.phase === "FINISHED" ? <section className="lunch-result" aria-label="게임 결과"><span className="lunch-sticker">오늘의 작전 결과</span><h2>{game.result.reason === "TEACHER_WIN" ? "전원 적발!" : `${name(game.result.winnerPlayerId)}님 완식 성공!`}</h2><p>{game.result.reason === "TEACHER_WIN" ? "점심시간까지 기다리세요! 다음에는 더 조심해볼까요?" : "빈 도시락만 남기고, 완벽하게 성공했어요."}</p><LunchboxArt closed/>
        {host ? <button className="lunch-primary" disabled={!props.connected || props.pending || busy} onClick={() => void command({ ...envelope(), kind: "sneaky:rematch", gameId: game.gameId, expectedGameRevision: game.gameRevision, expectedRoomRevision: s.versions.roomRevision, payload: {} })}>같은 방에서 다시 하기</button> : <p>방장이 다음 수업을 준비할 때까지 기다려주세요.</p>}
      </section> : <section className={`lunch-eat-dock${own?.status === "CAUGHT" ? " caught" : ""}`} aria-label="내 도시락과 먹기"><div className="lunch-my-food" key={bite}><LunchboxArt remaining={remainingFood(own?.completedBites ?? 0, game.requiredBites)} closed={own?.status !== "ACTIVE"}/></div><div className="lunch-eat-guidance"><span className="lunch-eyebrow">MY SECRET LUNCH</span><strong>{own?.status === "CAUGHT" ? "들켰습니다!" : own?.status === "FORFEITED" ? "이번 수업은 관전 중" : danger ? "손을 멈춰요!" : teacher === "SUSPICIOUS" ? "한입 더? 들킬지도!" : "도시락을 몰래 비워요"}</strong><small>{own?.status !== "ACTIVE" ? "친구들의 몰래 먹기를 구경하세요." : danger ? "칠판을 볼 때까지 기다려요." : "꾹 누르지 말고, 톡톡!"}</small></div>
        <button className={`lunch-eat-button${danger ? " danger" : ""}`} disabled={!allowed} onClick={() => void eat()} aria-label={own?.status !== "ACTIVE" ? "관전 중" : danger ? "멈춰! 누르면 들켜요" : "먹기!"}><span aria-hidden="true">{danger ? "!" : "냠"}</span>{own?.status !== "ACTIVE" ? "관전 중" : danger ? "멈춰!" : game.phase === "COUNTDOWN" ? "준비…" : "먹기!"}</button>
      </section>}
    </>}
    {currentNotice && <aside key={currentNotice.id} className={`lunch-impact${currentNotice.prominent ? " prominent" : ""}`} role="status"><span aria-hidden="true">{currentNotice.cue === "CAUGHT" ? "!" : "✦"}</span>{currentNotice.text}</aside>}
    {help && <dialog ref={dialog} className="lunch-guide" aria-labelledby="lunch-guide-title" onCancel={closeHelp}><button className="lunch-guide-close" onClick={closeHelp} aria-label="게임 방법 닫기">닫기</button><span className="lunch-eyebrow">비밀 작전 수첩 · {step + 1} / 5</span><div className="lunch-guide-art">{step === 0 || step === 4 ? <LunchboxArt closed={step === 4}/> : <ClassroomArt state={step === 2 ? "WATCHING" : "SUSPICIOUS"}/>}</div><h2 id="lunch-guide-title">{LESSONS[step]![0]}</h2><p>{LESSONS[step]![1]}</p><div className="lunch-guide-controls"><button disabled={step === 0} onClick={() => setStep(n => n - 1)}>이전</button><button className="lunch-primary" onClick={() => step === 4 ? closeHelp() : setStep(n => n + 1)}>{step === 4 ? "작전 준비 완료" : "다음"}</button></div></dialog>}
  </main>;
}
