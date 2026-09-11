import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SPYFALL_DEFAULT_SETTINGS, SPYFALL_LOCATION_IDS, SPYFALL_LOCATION_LABELS, spyfallLocations,
  type SpyfallClientCommand, type SpyfallSettings, type SpyfallStage, type SpyfallResult, type SpyfallLocation, type PlayerId } from "@hangul-rummikub/shared";
import type { SpyfallWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { RealtimeClientError } from "../../lib/realtime-client.js";
import { useSpyfallSound } from "./sound.js";
export type SpyfallScreenProps = Readonly<{ snapshot: SpyfallWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
  onCommand(command: SpyfallClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void; onRematch(): void }>;
export const SPYFALL_STAGE_COPY: Record<SpyfallStage, string> = { REVEAL: "당신의 임무를 확인하세요", QUESTION: "질문 속에 단서를 숨기세요", ANSWER: "자연스럽게 대답하세요", ACCUSATION: "이 사람, 스파이일까요?", FINAL_ACCUSATION: "마지막으로 지목할 시간", GUESS: "스파이가 정체를 드러냈습니다" };
export const SPYFALL_RESULT_COPY: Record<SpyfallResult["reason"], string> = { SPY_CAUGHT: "모두의 추리가 모여 스파이를 찾아냈습니다.", MISIDENTIFIED: "무고한 참가자가 지목되어 스파이가 탈출했습니다.", ESCAPED: "마지막 지목까지 합의하지 못해 스파이가 탈출했습니다.", GUESS_CORRECT: "스파이가 대화 속에서 정확한 장소를 알아냈습니다.", GUESS_WRONG: "스파이의 최종 장소 추측이 틀렸습니다.", GUESS_TIMEOUT: "스파이가 시간 안에 장소를 선택하지 못했습니다.", CANCELLED: "참가자가 나가 이번 임무가 취소됐습니다." };
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
export function SpyfallLocationArt({ location, className = "" }: { location: SpyfallLocation; className?: string }) {
  const i = SPYFALL_LOCATION_IDS.indexOf(location);
  return <span aria-hidden="true" className={`spy-location-art ${className}`} style={{ backgroundPosition: `${(i % 6) * 20}% ${Math.floor(i / 6) * 100 / 3}%` }}/>;
}
export function SpyfallGameScreen(props: SpyfallScreenProps) {
  const s = props.snapshot, game = s.game, self = s.self.playerId, playing = game?.phase === "PLAYING" ? game : null;
  const host = s.room.players.some(p => p.playerId === self && p.isHost);
  const settings = game?.settings ?? ("settings" in s.room ? s.room.settings : SPYFALL_DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [secret, setSecret] = useState(false);
  const [target, setTarget] = useState<PlayerId | null>(null), [accusing, setAccusing] = useState(false), [revealConfirm, setRevealConfirm] = useState(false);
  const [location, setLocation] = useState<SpyfallLocation | null>(null), [excluded, setExcluded] = useState<SpyfallLocation[]>([]);
  const [, tick] = useState(0), sending = useRef(false);
  const received = useMemo(() => ({ server: s.serverTime, local: Date.now() }), [s.serverTime, playing?.phaseId]);
  const scope = `${game?.gameId ?? "lobby"}:${playing?.phaseId ?? "finished"}`, scopeRef = useRef(scope); scopeRef.current = scope;
  useEffect(() => { if (!playing) return; const timer = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(timer); }, [playing?.phaseId]);
  useEffect(() => { setSecret(false); setTarget(null); setAccusing(false); setRevealConfirm(false); setLocation(null); setError(null); }, [scope, props.connected]);
  useEffect(() => { setExcluded([]); if (game?.phase === "PLAYING") window.scrollTo({ top: 0, left: 0 }); }, [game?.gameId]);
  useEffect(() => { const hide = () => { if (document.hidden) { setSecret(false); setRevealConfirm(false); } }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  const now = received.server + Date.now() - received.local;
  const seconds = playing ? Math.max(0, Math.ceil((playing.deadlineAt - now) / 1000)) : 0;
  const roundSeconds = playing ? Math.max(0, Math.ceil((playing.roundDeadlineAt === null ? playing.remainingMs : playing.roundDeadlineAt - now) / 1000)) : settings.roundSeconds;
  const audio = useSpyfallSound(game, self, props.connected, seconds);
  const enabled = props.connected && !props.pending && !busy, canAct = enabled && seconds > 0;
  const ready = getGameStartControl(s, !enabled);
  const name = (id: string | null) => s.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
  const regular = playing?.stage === "QUESTION" || playing?.stage === "ANSWER";
  const finalMine = playing?.stage === "FINAL_ACCUSATION" && playing.finalAccuserId === self;
  const selecting = accusing || finalMine || playing?.stage === "QUESTION" && playing.questionerId === self;
  const myRecord = playing?.playerStates.find(p => p.playerId === self);
  const locations = spyfallLocations(settings.locationPack);
  async function command(c: SpyfallClientCommand): Promise<boolean> {
    if (!enabled || sending.current) return false;
    sending.current = true; setBusy(true); setError(null); const submittedScope = scope;
    try {
      try { await props.onCommand(c); }
      catch (e) { if (e instanceof RealtimeClientError && e.code === "ACKNOWLEDGEMENT_TIMEOUT") await props.onCommand(c); else throw e; }
      return true;
    } catch (e) { if (scopeRef.current === submittedScope) setError(e instanceof Error ? e.message : "연결과 현재 차례를 확인해주세요."); return false; }
    finally { sending.current = false; setBusy(false); }
  }
  function configure(next: SpyfallSettings) { void command({ ...envelope(), kind: "spyfall:configure", expectedRoomRevision: s.versions.roomRevision, payload: next }); }
  function choosePerson(id: PlayerId) { setTarget(id); audio.play("SELECT"); }
  function accuse() { if (playing && target) void command({ ...envelope(), kind: "spyfall:accuse", gameId: playing.gameId, phaseId: playing.phaseId, payload: { playerId: target } }); }
  const identity = playing ? { ...envelope(), gameId: playing.gameId, phaseId: playing.phaseId } : null;
  const actor = playing?.stage === "QUESTION" ? playing.questionerId : playing?.stage === "ANSWER" ? playing.respondentId : playing?.stage === "FINAL_ACCUSATION" ? playing.finalAccuserId : null;
  return <main className="spy-shell" onPointerDownCapture={audio.unlock} onKeyDownCapture={audio.unlock}>
    <header className="spy-header"><div className="spy-brand"><span aria-hidden="true" className="spy-seal">S</span><div><small>THE SECRET IS AMONG US</small><h1>스파이폴</h1></div></div>
      <nav aria-label="게임 도구"><span className="spy-connection">{props.connectionLabel}</span><button onClick={props.onCopy}>초대 · {s.room.roomCode}</button><details className="spy-sound"><summary>효과음 {audio.volume === 0 ? "꺼짐" : "켜짐"}</summary><div><label htmlFor="spy-volume">효과음 음량 · {audio.volume}%</label><input id="spy-volume" type="range" min="0" max="100" step="5" value={audio.volume} onChange={e => audio.changeVolume(Number(e.target.value))}/><button onClick={() => audio.changeVolume(audio.volume ? 0 : 35)}>{audio.volume ? "음소거" : "소리 켜기"}</button><button disabled={!audio.volume} onClick={() => audio.play("TURN")}>미리 듣기</button></div></details><button disabled={props.pending} onClick={props.onLeave}>나가기</button></nav>
    </header>
    {(error || props.error) && <p className="spy-error" role="alert">{error ?? props.error}</p>}
    {!props.connected && <p className="spy-notice" role="status">연결을 복구하고 있습니다. 서버의 시간은 계속 흐릅니다.</p>}
    {!game ? <div className="spy-lobby">
      <section className="spy-hero"><div className="spy-hero-copy"><span className="spy-eyebrow">A TABLE FULL OF SECRETS</span><h2>우린 모두<br/>같은 곳에 있다.<br/><em>한 사람만 빼고.</em></h2><p>너무 정확하면 장소가 들키고,<br/>너무 모호하면 내가 의심받는다.</p><div className="spy-hero-tags"><span>3–8명</span><span>비밀 장소 24곳</span><span>질문과 추리</span></div></div><div className="spy-hero-bottom">01 비밀을 확인하고 <span>02 질문을 건네고</span> 03 스파이를 찾아라</div></section>
      <section className="spy-dossier spy-lobby-settings"><div className="spy-section-head"><div><span className="spy-eyebrow">MISSION BRIEFING</span><h2>임무 브리핑</h2></div><span>{s.room.players.length} / 8명</span></div>
        <div className="spy-lobby-roster">{s.room.players.map((p, i) => <div key={p.playerId}><span className="spy-initial">{String(i + 1).padStart(2, "0")}</span><span><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "접속 중" : "연결 기다리는 중"}</small></span></div>)}</div>
        <fieldset disabled={!host || !enabled}><legend>질문 시간</legend><div className="spy-options">{([360, 480, 600] as const).map(roundSeconds => <button key={roundSeconds} aria-pressed={settings.roundSeconds === roundSeconds} onClick={() => configure({ ...settings, roundSeconds })}>{roundSeconds / 60}분{roundSeconds === 480 ? " · 기본" : ""}</button>)}</div></fieldset>
        <fieldset disabled={!host || !enabled}><legend>장소 묶음</legend><div className="spy-options"><button aria-pressed={settings.locationPack === "EVERYDAY"} onClick={() => configure({ ...settings, locationPack: "EVERYDAY" })}>일상 · 12곳</button><button aria-pressed={settings.locationPack === "ALL"} onClick={() => configure({ ...settings, locationPack: "ALL" })}>모든 장소 · 24곳</button></div></fieldset>
        <fieldset disabled={!host || !enabled}><legend>역할 연기</legend><div className="spy-options"><button aria-pressed={!settings.useRoles} onClick={() => configure({ ...settings, useRoles: false })}>장소만 · 입문 추천</button><button aria-pressed={settings.useRoles} onClick={() => configure({ ...settings, useRoles: true })}>직업도 함께</button></div></fieldset>
        <p className="spy-hint">대면 또는 외부 음성통화로 대화하세요. 웹이 카드·차례·투표를 진행합니다.</p><p className="spy-hint">{ready.guidance}</p>
        {host ? <button className="spy-primary spy-wide" disabled={!ready.canStart} onClick={props.onStart}>비밀 임무 배부하기 →</button> : <p>방장이 임무를 시작하면 카드를 받습니다.</p>}
      </section>
    </div> : game.phase === "FINISHED" ? <section className="spy-result spy-dossier"><span className="spy-eyebrow">MISSION {game.result.reason === "CANCELLED" ? "CANCELLED" : "COMPLETE"}</span><h2>{game.result.reason === "CANCELLED" ? "이번 임무는 취소됐습니다" : game.result.winnerPlayerIds.includes(game.result.spyPlayerId) ? "스파이의 완벽한 탈출" : "스파이를 막아냈습니다"}</h2><p>{SPYFALL_RESULT_COPY[game.result.reason]}</p>
      <div className="spy-result-cards"><article><SpyfallLocationArt location={game.result.location}/><small>우리가 있던 장소</small><h3>{SPYFALL_LOCATION_LABELS[game.result.location]}</h3></article><article className="spy-spy-result"><img src="/images/spyfall/mission.jpg" alt="어둠 속에 숨어 있던 첩보원"/><small>스파이의 정체</small><h3>{name(game.result.spyPlayerId)}</h3></article></div>
      {game.result.guess && <p>스파이의 최종 추측: <b>{SPYFALL_LOCATION_LABELS[game.result.guess]}</b></p>}
      {game.result.voteRounds.length > 0 && <details className="spy-result-votes"><summary>지목과 투표 기록 · {game.result.voteRounds.length}회</summary>{game.result.voteRounds.map((r, i) => <article key={i}><b>{i + 1}. {name(r.accuserId)} → {name(r.suspectId)} · {r.convicted ? "만장일치" : "합의 실패"}{r.final ? " · 최종 지목" : ""}</b><p>{r.ballots.filter(b => b.playerId !== r.suspectId).map(b => `${name(b.playerId)} ${b.agree === null ? "미응답" : b.agree ? "찬성" : "반대"}`).join(" / ")}</p></article>)}</details>}
      {host ? <button className="spy-primary" disabled={!enabled} onClick={props.onRematch}>같은 방에서 다시 하기 →</button> : <p>방장이 다음 임무를 준비할 때까지 기다려주세요.</p>}
    </section> : <>
      <section className="spy-phase-bar"><div><span className="spy-eyebrow">{game.stage === "REVEAL" ? "CONFIDENTIAL" : game.stage === "ACCUSATION" || game.stage === "FINAL_ACCUSATION" ? "UNDER SUSPICION" : "OPERATION IN PROGRESS"}</span><h2>{SPYFALL_STAGE_COPY[game.stage]}</h2></div><div className="spy-phase-timer"><small>{game.stage === "QUESTION" ? "상대 선택" : game.stage === "ANSWER" ? "답변" : game.stage === "ACCUSATION" ? "투표" : game.stage === "GUESS" ? "장소 추측" : game.stage === "REVEAL" ? "카드 확인" : "지목"}</small><b className={seconds <= 10 ? "urgent" : ""} role="timer" aria-label={`남은 시간 ${seconds}초`}>{formatTime(seconds)}</b></div></section>
      <div className="spy-play-layout"><div className="spy-main">
        <section className="spy-table" aria-label="참가자 첩보 테이블"><div className="spy-table-rim" aria-hidden="true"/><div className="spy-table-center"><span className="spy-eyebrow">THE ROOM OF SECRETS</span><div className="spy-compass" aria-hidden="true">✧</div><small>{regular ? "남은 질문 시간" : "질문 타이머 멈춤"}</small><strong>{formatTime(roundSeconds)}</strong><p>{game.stage === "ANSWER" ? `${name(game.questionerId)} → ${name(game.respondentId)}` : game.stage === "QUESTION" ? `${name(game.questionerId)}님의 질문` : game.stage === "ACCUSATION" ? `${name(game.suspectId)}님 지목` : game.stage === "GUESS" ? "스파이의 마지막 선택" : game.stage === "FINAL_ACCUSATION" ? `${name(game.finalAccuserId)}님의 지목` : "누군가의 카드는 다릅니다"}</p></div>
          <div className="spy-seats">{game.playerStates.map((p, i) => { const roomPlayer = s.room.players.find(member => member.playerId === p.playerId); const angle = (i / game.playerStates.length * Math.PI * 2) - Math.PI / 2;
            const allowed = canAct && selecting && p.playerId !== self && ((accusing || finalMine) || p.playerId !== game.previousQuestionerId);
            const style = { "--seat-x": `${50 + Math.cos(angle) * 38}%`, "--seat-y": `${50 + Math.sin(angle) * 37}%`, "--seat-index": i } as CSSProperties;
            return <button key={p.playerId} style={style} className={`spy-seat${actor === p.playerId ? " active" : ""}${game.suspectId === p.playerId ? " suspected" : ""}`} aria-pressed={target === p.playerId} disabled={!allowed} onClick={() => choosePerson(p.playerId)}><span className="spy-agent-portrait" aria-hidden="true"><span>{String(i + 1).padStart(2, "0")}</span></span><b>{name(p.playerId)}{p.playerId === self ? " · 나" : ""}</b><small>{roomPlayer?.connectionStatus === "OFFLINE" ? "연결 끊김" : game.suspectId === p.playerId ? "지목받음" : actor === p.playerId ? game.stage === "ANSWER" ? "답변 중" : game.stage === "FINAL_ACCUSATION" ? "최종 지목자" : "질문자" : target === p.playerId ? "선택됨" : "참가자"}</small></button>;
          })}</div>
        </section>
        <section className="spy-dossier spy-action" aria-live="polite">
          {game.stage === "REVEAL" && <><span className="spy-eyebrow">FOR YOUR EYES ONLY</span><h3>나만 보는 임무 카드를 펼쳐보세요.</h3><p>한 사람만 장소를 모릅니다. 잠시 후 첫 질문이 시작됩니다.</p></>}
          {(accusing || finalMine) && <><h3>{finalMine ? "마지막 의심을 선택하세요" : "누가 스파이라고 생각하나요?"}</h3><p>테이블에서 한 명을 선택하세요. 피지목자를 제외한 전원이 동의해야 정체를 공개합니다.</p><div className="spy-actions"><button className="spy-primary" disabled={!canAct || !target} onClick={accuse}>{target ? `${name(target)}님 지목 확정` : "지목할 참가자를 선택하세요"}</button>{finalMine ? <button disabled={!canAct} onClick={() => identity && void command({ ...identity, kind: "spyfall:skip", payload: {} })}>이번 지목 건너뛰기</button> : <button onClick={() => { setAccusing(false); setTarget(null); }}>취소</button>}</div></>}
          {!accusing && game.stage === "QUESTION" && (game.questionerId === self ? <><h3>질문할 상대를 선택하세요.</h3><p>장소를 직접 말하지 않고 질문하세요. 방금 질문한 사람에게 바로 되물을 수는 없어요.</p><button className="spy-primary" disabled={!canAct || !target} onClick={() => identity && target && void command({ ...identity, kind: "spyfall:ask", payload: { playerId: target } })}>{target ? `${name(target)}님에게 질문 시작 →` : "테이블에서 상대를 선택하세요"}</button></> : <><h3>{name(game.questionerId)}님이 질문할 상대를 고르고 있어요.</h3><p>다른 사람의 질문과 답변도 잘 들어보세요.</p></>)}
          {!accusing && game.stage === "ANSWER" && (game.respondentId === self ? <><h3>{name(game.questionerId)}님의 질문에 대답하세요.</h3><p>대답한 뒤 버튼을 누르면 내가 다음 질문자가 됩니다.</p><button className="spy-primary" disabled={!canAct} onClick={() => identity && void command({ ...identity, kind: "spyfall:answer", payload: {} })}>답변 완료 · 다음은 내 질문 →</button></> : <><h3>{name(game.respondentId)}님이 답변 중입니다.</h3><p>질문자: {name(game.questionerId)} · 너무 뚜렷한 단서는 스파이를 돕습니다.</p></>)}
          {game.stage === "ACCUSATION" && <><h3>{name(game.accuserId)}님이 {name(game.suspectId)}님을 지목했습니다.</h3><p>질문 시간은 멈췄습니다. 투표 중에는 장소에 대한 이야기를 잠시 멈춰주세요.</p>{game.suspectId === self ? <p className="spy-stamp">지목받은 사람은 투표하지 않습니다.</p> : game.privateView.vote !== null ? <p className="spy-stamp">{game.accuserId === self ? "지목자는 자동 찬성입니다." : `내 투표: ${game.privateView.vote ? "찬성" : "반대"} · 제출 완료`} 다른 참가자의 선택을 기다립니다.</p> : <div className="spy-actions"><button className="spy-primary" disabled={!canAct} onClick={() => identity && void command({ ...identity, kind: "spyfall:vote", payload: { agree: true } })}>찬성 · 스파이 같아요</button><button disabled={!canAct} onClick={() => identity && void command({ ...identity, kind: "spyfall:vote", payload: { agree: false } })}>반대 · 확신이 없어요</button></div>}</>}
          {game.stage === "FINAL_ACCUSATION" && !finalMine && <><h3>{name(game.finalAccuserId)}님의 마지막 지목입니다.</h3><p>각자 한 번씩 지목 기회를 갖습니다. 끝까지 합의하지 못하면 스파이가 승리합니다.</p></>}
          {game.stage === "GUESS" && <><h3>{name(game.revealedSpyId)}님이 스파이였습니다.</h3>{game.privateView.role === "SPY" ? <><p>아래 장소 카드에서 정답을 선택하세요. 확정하면 되돌릴 수 없습니다.</p><button className="spy-primary" disabled={!canAct || !location} onClick={() => identity && location && void command({ ...identity, kind: "spyfall:guess", payload: { location } })}>{location ? `${SPYFALL_LOCATION_LABELS[location]} · 최종 추측 확정` : "아래에서 장소를 선택하세요"}</button></> : <p>아직 장소를 말하지 마세요. 스파이의 최종 추측을 기다립니다.</p>}</>}
          {regular && !accusing && <div className="spy-accuse-row"><span>{myRecord?.accusationUsed ? "도중 지목 기회를 사용했습니다." : "수상한 답변을 들었나요?"}</span><button disabled={!canAct || myRecord?.accusationUsed} onClick={() => { setAccusing(true); setTarget(null); audio.play("SELECT"); }}>스파이 지목</button></div>}
          {seconds === 0 && <p role="status">서버에서 다음 단계를 확인하고 있습니다…</p>}
        </section>
        {game.history.length > 0 && <details className="spy-history"><summary>질문 기록 · {game.history.length}회</summary><ol>{game.history.map((h, i) => <li key={i}>{name(h.questionerId)} → {h.respondentId ? name(h.respondentId) : "상대 선택 없음"}<span>{h.completed ? "답변 완료" : "시간 초과"}</span></li>)}</ol></details>}
      </div>
      <aside className="spy-personal"><section className="spy-private-wrap"><div className="spy-section-head"><span className="spy-eyebrow">PRIVATE DOSSIER</span><small>나만 보는 카드</small></div><button className={`spy-secret${secret ? " open" : ""}`} aria-expanded={secret} disabled={!props.connected} onClick={() => { setSecret(value => !value); audio.play("CARD"); }}>
        {secret ? game.privateView.role === "CITIZEN" ? <><SpyfallLocationArt location={game.privateView.location}/><span className="spy-secret-copy"><small>당신이 있는 장소</small><strong>{SPYFALL_LOCATION_LABELS[game.privateView.location]}</strong><span>{game.privateView.job ? `내 역할 · ${game.privateView.job}` : "스파이에게 장소를 들키지 마세요"}</span><small>다시 눌러 가리기</small></span></> : <><img src="/images/spyfall/mission.jpg" alt=""/><span className="spy-secret-copy"><small>당신의 비밀 임무</small><strong>당신은 스파이</strong><span>자연스럽게 섞여 장소를 알아내세요.</span><small>다시 눌러 가리기</small></span></> : <><span className="spy-card-mark" aria-hidden="true">S</span><span className="spy-secret-copy"><small>TOP SECRET</small><strong>임무 카드 확인</strong><span>다른 사람에게 보이지 않게 펼치세요.</span></span></>}
        </button>
        {regular && game.privateView.role === "SPY" && <div className="spy-guess-entry">{revealConfirm ? <><p>정체를 공개하면 20초 안에 장소를 맞혀야 합니다. 공개 후 취소할 수 없습니다.</p><div className="spy-actions"><button className="spy-primary" disabled={!canAct} onClick={() => identity && void command({ ...identity, kind: "spyfall:reveal", payload: {} })}>정체 공개하고 추측</button><button onClick={() => setRevealConfirm(false)}>취소</button></div></> : <button className="spy-wide" disabled={!canAct} onClick={() => setRevealConfirm(true)}>장소를 알겠어요</button>}</div>}
        <p className="spy-private-tip">카드는 탭을 벗어나거나 단계가 바뀌면 다시 가려집니다.</p>
      </section><section className="spy-field-notes"><span className="spy-eyebrow">FIELD NOTES</span><h3>말의 틈을 찾아보세요.</h3><p>“여기엔 자주 오나요?”<br/>“일할 때 어떤 옷을 입나요?”<br/>“이곳의 소리는 어떤가요?”</p><small>대화는 대면 또는 외부 음성통화로 진행합니다.</small></section></aside></div>
    </>}
    {game?.phase !== "FINISHED" && <section className="spy-locations"><div className="spy-section-head"><div><span className="spy-eyebrow">THE POSSIBLE LOCATIONS</span><h2>{playing?.stage === "GUESS" && playing.privateView.role === "SPY" ? "우리가 있는 곳은?" : "장소 수첩"}</h2></div><p>{playing?.stage === "GUESS" && playing.privateView.role === "SPY" ? "장소 선택 후 위에서 최종 확정하세요." : playing ? "카드를 눌러 제외 · 표시는 나에게만 보여요" : "이번 임무에서 등장할 수 있는 장소를 살펴보세요."}</p></div><div className="spy-location-grid">{locations.map((place, i) => {
      const guessing = playing?.stage === "GUESS" && playing.privateView.role === "SPY", isExcluded = excluded.includes(place);
      return <button key={place} className={`spy-location${!guessing && isExcluded ? " excluded" : ""}`} aria-pressed={guessing ? location === place : isExcluded} aria-label={`${SPYFALL_LOCATION_LABELS[place]}${guessing ? location === place ? " 선택됨" : " 선택" : isExcluded ? " 제외됨, 복원" : " 제외 표시"}`} disabled={guessing ? !canAct : !playing} onClick={() => { audio.play("SELECT"); if (guessing) setLocation(place); else setExcluded(values => values.includes(place) ? values.filter(v => v !== place) : [...values, place]); }}><SpyfallLocationArt location={place}/><span><small>{String(i + 1).padStart(2, "0")}</small><b>{SPYFALL_LOCATION_LABELS[place]}</b><span aria-hidden="true">{guessing && location === place ? "●" : !guessing && isExcluded ? "×" : ""}</span></span></button>;
    })}</div></section>}
    <details className="spy-help"><summary>처음이라면 · 게임 방법과 온라인 진행 안내</summary><div><ol><li>한 명은 스파이, 나머지는 같은 장소를 아는 참가자입니다. 역할을 켜면 직업에 맞춰 대답해보세요.</li><li>질문받은 사람이 다음 질문자가 됩니다. 바로 되묻기는 금지합니다. 상대 선택·답변은 각각 최대 60초이며 전체 질문 시간이 먼저 끝나면 최종 지목으로 넘어갑니다.</li><li>도중 지목은 각자 한 번. 피지목자를 제외한 전원 동의 시 정체를 공개합니다. 지목자는 자동 찬성, 미응답은 동의하지 않은 것으로 처리합니다.</li><li>스파이는 질문 시간이 흐를 때만 정체를 공개하고 장소를 한 번 추측할 수 있습니다. 투표 중이나 잡힌 뒤에는 추측할 수 없습니다.</li><li>전체 시간이 끝나면 순서대로 마지막 지목 기회를 갖습니다. 지목 선택 20초, 투표 30초. 끝내 합의하지 못하면 스파이 승리입니다.</li><li>창을 닫아도 시간은 흐릅니다. 재접속하면 같은 임무로 돌아옵니다. 나가기를 누르면 이번 판은 취소됩니다.</li></ol><p>브라우저 내 음성통화는 제공하지 않습니다. 효과음은 첫 화면 조작 이후 재생되며 상단에서 음량을 조절할 수 있습니다.</p></div></details>
    <footer className="spy-footer">ONE LOCATION. MANY STORIES. ONE SPY.</footer>
  </main>;
}
