import { useEffect, useRef, useState } from "react";
import { DRAW_COLORS, DRAW_WIDTHS, type Drawing, type DrawClientCommand, type DrawRelayPlayingProjection } from "@hangul-rummikub/shared";
import type { DrawRelayWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { formatCountdownMmSs } from "../../lib/turn-countdown.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { RelayCanvas } from "./RelayCanvas.js";
import { RelayDoodle, RelayHelp } from "./RelayHelp.js";
import { RelayAudio } from "./relay-sound.js";
import { BLANK_DRAWING, undoStroke } from "./drawing.js";

type Props = { snapshot: DrawRelayWebSnapshot; connected: boolean; onCommand: (command: DrawClientCommand) => Promise<void>;
  onStart: () => void; onLeave: () => void; onCopy: () => void; pending: boolean; error: string | null; connectionLabel: string };
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });

function DrawEditor(props: { game: Extract<DrawRelayPlayingProjection, { phase: "DRAW" }>; enabled: boolean; send: Props["onCommand"]; audio: RelayAudio }) {
  const { game } = props, [drawing, setDrawing] = useState<Drawing>(game.privateState.draft);
  const [tool, setTool] = useState<"PEN" | "ERASER">("PEN"), [color, setColor] = useState<Drawing["strokes"][number]["color"]>("#202838"), [width, setWidth] = useState<4 | 10 | 22>(4);
  const [status, setStatus] = useState("저장됨"), [error, setError] = useState<string | null>(null), [submitting, setSubmitting] = useState(false), [clear, setClear] = useState(false);
  const ref = useRef({ drawing, dirty: false, revision: game.privateState.draftRevision, saving: false, alive: true,
    pending: null as Extract<DrawClientCommand, { kind: "draw:draftSave" }> | null });
  const latest = useRef(props); latest.current = props;
  const [change, setChange] = useState(0);
  useEffect(() => { ref.current.alive = true; return () => { ref.current.alive = false; }; }, []);
  useEffect(() => {
    if (!ref.current.dirty && !ref.current.saving) { ref.current.revision = game.privateState.draftRevision; ref.current.drawing = game.privateState.draft; setDrawing(game.privateState.draft); }
  }, [game.privateState.draftRevision]);
  function update(next: Drawing) { ref.current.drawing = next; ref.current.dirty = true; setDrawing(next); setStatus("저장 대기"); setChange(n => n + 1); }
  async function save(): Promise<boolean> {
    const current = ref.current;
    if (current.saving || !latest.current.enabled) return false;
    if (!current.dirty && !current.pending) return true;
    current.saving = true; setStatus("저장 중..."); setError(null);
    const sent = current.pending ?? { ...envelope(), kind: "draw:draftSave" as const, gameId: game.gameId, stageToken: game.stageToken,
      payload: { drawing: current.drawing, expectedDraftRevision: current.revision } };
    current.pending = sent;
    try {
      await latest.current.send(sent);
      current.revision = sent.payload.expectedDraftRevision + 1; current.pending = null;
      current.dirty = current.drawing !== sent.payload.drawing;
      if (current.alive) { setStatus(current.dirty ? "저장 대기" : "저장됨"); setChange(n => n + 1); }
      return !current.dirty;
    } catch (e) { if (current.alive) { setStatus("저장 확인 필요"); setError(e instanceof Error ? e.message : "저장하지 못했습니다. 그림은 이 화면에 유지됩니다."); } return false; }
    finally { current.saving = false; }
  }
  useEffect(() => {
    if (!props.enabled || !ref.current.dirty || ref.current.pending) return;
    const timer = setTimeout(() => { void save(); }, 300); return () => clearTimeout(timer);
  }, [change, props.enabled]);
  const submitCommand = useRef<Extract<DrawClientCommand, { kind: "draw:submitDrawing" }> | null>(null);
  async function submit() {
    if (!props.enabled || ref.current.saving || submitting) return;
    setSubmitting(true); setError(null);
    const command = submitCommand.current ?? { ...envelope(), kind: "draw:submitDrawing" as const, gameId: game.gameId, stageToken: game.stageToken, payload: { drawing: ref.current.drawing } };
    submitCommand.current = command;
    try { await props.send(command); props.audio.play("SUBMIT"); }
    catch (e) { if (ref.current.alive) setError(e instanceof Error ? e.message : "제출 결과를 확인하지 못했습니다. 다시 시도해주세요."); }
    finally { if (ref.current.alive) setSubmitting(false); }
  }
  const locked = !props.enabled || submitting || submitCommand.current !== null;
  return <section className="relay-studio">
    <div className="relay-prompt"><span>나만 보는 제시어</span><h2>{game.privateState.source.text}</h2><p>글자 대신 그림으로 표현해보세요.</p></div>
    <div className="relay-paper"><RelayCanvas drawing={drawing} editable={!locked} tool={tool} color={color} width={width} onChange={update} onPencil={() => props.audio.play("PENCIL")} /></div>
    <div className="relay-tools" aria-label="그림 도구">
      <button disabled={locked} aria-pressed={tool === "PEN"} onClick={() => setTool("PEN")}>펜</button><button disabled={locked} aria-pressed={tool === "ERASER"} onClick={() => setTool("ERASER")}>지우개</button>
      <div className="relay-palette">{DRAW_COLORS.map((c, i) => <button key={c} disabled={locked} aria-label={["검정", "흰색", "빨강", "노랑", "초록", "파랑", "보라", "분홍"][i]} aria-pressed={color === c} style={{ "--ink": c } as React.CSSProperties} onClick={() => { setColor(c); setTool("PEN"); }} />)}</div>
      {DRAW_WIDTHS.map(w => <button key={w} disabled={locked} aria-label={`펜 굵기 ${w}`} aria-pressed={width === w} onClick={() => setWidth(w)}><span style={{ width: w, height: w }} className="relay-width" /></button>)}
      <button disabled={locked || !drawing.strokes.length} onClick={() => update(undoStroke(drawing))}>되돌리기</button><button disabled={locked || !drawing.strokes.length} onClick={() => setClear(true)}>모두 지우기</button>
    </div>
    {clear && <div className="relay-notice" role="alert">그림을 모두 지울까요? <button onClick={() => { update(BLANK_DRAWING); setClear(false); }}>지우기 확인</button><button onClick={() => setClear(false)}>취소</button></div>}
    <div className="relay-editor-footer"><span aria-live="polite">{status} · {drawing.strokes.length}/250 획</span><button className="relay-primary" disabled={!props.enabled || submitting || ref.current.saving} onClick={() => void submit()}>{submitCommand.current ? "그림 제출 다시 확인" : "그림 제출"}</button></div>
    {drawing.strokes.reduce((n, s) => n + s.points.length, 0) >= 11000 && <p>그림 용량 한도에 가까워졌어요. 필요 없는 획을 되돌릴 수 있어요.</p>}
    {error && <p className="relay-notice" role="alert">{error} <button disabled={!props.enabled || ref.current.saving} onClick={() => void save()}>저장 다시 확인</button></p>}
  </section>;
}

export function DrawRelayScreen(props: Props) {
  const { snapshot: s } = props, game = s.game, self = s.self.playerId;
  const isHost = s.room.players.some(p => p.playerId === self && p.isHost), canCommand = props.connected && !props.pending;
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [guess, setGuess] = useState("");
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem("draw-relay:sound") !== "off"; } catch { return true; } });
  const audio = useRef(new RelayAudio()); audio.current.enabled = enabled;
  const [now, setNow] = useState(Date.now()), offset = useRef(s.serverTime - Date.now());
  useEffect(() => { offset.current = s.serverTime - Date.now(); }, [s.serverTime]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => { clearInterval(timer); audio.current.close(); }; }, []);
  const seconds = game && "deadlineAt" in game ? Math.max(0, Math.ceil((game.deadlineAt - (now + offset.current)) / 1000)) : null;
  const stage = game ? `${game.gameId}:${game.stageToken}:${game.phase}` : "lobby", seenStage = useRef(stage), warning = useRef<string | null>(null);
  const wasConnected = useRef(props.connected);
  const [notice, setNotice] = useState<string | null>(null), previousDeadline = useRef<number | null>(game && "deadlineAt" in game ? game.deadlineAt : null);
  useEffect(() => {
    if (seenStage.current !== stage) {
      setGuess(""); setError(null);
      if (props.connected && wasConnected.current) {
        audio.current.play(game?.phase === "REVEAL" ? "REVEAL" : game?.phase === "FINISHED" ? "FINISH" : "PASS");
        setNotice(previousDeadline.current !== null && now + offset.current >= previousDeadline.current ? "시간이 끝나 자동 제출되었습니다." : game?.phase === "REVEAL" ? "모두 모였어요. 그림책을 펼쳐볼까요?" : "새 페이지가 도착했어요!");
      }
      seenStage.current = stage;
    }
    previousDeadline.current = game && "deadlineAt" in game ? game.deadlineAt : null;
    if (!props.connected) warning.current = stage;
    wasConnected.current = props.connected;
  }, [stage, props.connected]);
  const cursor = game && "reveal" in game ? `${game.gameId}:${game.reveal.bookIndex}:${game.reveal.pageIndex}` : null;
  const seenCursor = useRef(cursor);
  useEffect(() => {
    if (cursor !== seenCursor.current && seenCursor.current !== null && props.connected && game?.phase === "REVEAL") audio.current.play("FLIP");
    seenCursor.current = cursor;
  }, [cursor, props.connected]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(null), 2500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => { if (props.connected && seconds !== null && seconds <= 10 && seconds > 0 && warning.current !== stage) { warning.current = stage; audio.current.play("WARNING"); } }, [seconds, stage, props.connected]);
  const pending = useRef<DrawClientCommand | null>(null);
  async function send(command: DrawClientCommand) {
    if (busy || !canCommand) return;
    setBusy(true); setError(null); pending.current ??= command;
    try { await props.onCommand(pending.current); pending.current = null; if (command.kind !== "draw:revealNext") audio.current.play("SUBMIT"); }
    catch (e) { setError(e instanceof Error ? e.message : "요청을 확인하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  useEffect(() => { pending.current = null; }, [stage]);
  const nickname = (id: string) => s.room.players.find(p => p.playerId === id)?.nickname ?? "이탈한 참가자";
  const progress = game?.playerStates.filter(p => p.submitted).length ?? 0;
  const ready = getGameStartControl(s, props.pending || busy || !props.connected);
  return <main className="relay-shell" onPointerDown={() => audio.current.unlock()} onKeyDown={() => audio.current.unlock()}>
    <header className="relay-header"><div><span className="relay-kicker">PASS A LITTLE IMAGINATION</span><h1>그림 릴레이<span className="relay-pencil" aria-hidden="true">✎</span></h1><p>그림 한 장, 엉뚱한 다음 이야기.</p></div><nav aria-label="방 도구"><button onClick={props.onCopy}>ROOM {s.room.roomCode}</button><span className={`relay-connection ${props.connected ? "online" : ""}`}>{props.connectionLabel}</span><button aria-pressed={enabled} onClick={() => { const next = !enabled; setEnabled(next); audio.current.enabled = next; if (next) audio.current.unlock(); try { localStorage.setItem("draw-relay:sound", next ? "on" : "off"); } catch { /* Optional preference. */ } }}>소리 {enabled ? "ON" : "OFF"}</button><button onClick={props.onLeave} disabled={props.pending}>방 나가기</button></nav></header>
    <RelayHelp/>
    {(error || props.error) && <p className="relay-notice" role="alert">{error ?? props.error}{pending.current && <button disabled={busy || !canCommand} onClick={() => pending.current && void send(pending.current)}>다시 확인</button>}</p>}
    {notice && <p className="relay-notice" role="status">{notice}</p>}
    {!game ? <section className="relay-lobby"><div className="relay-cover"><RelayDoodle/><span>우리만의 그림책</span><h2>잘 그리지 않아도<br/>재밌는 이야기가 돼요.</h2><p>3~8명이 함께, 단어 → 그림 → 추측</p></div><div className="relay-lobby-controls"><h2>오늘의 그림 친구들 <small>{s.room.players.length}/8</small></h2><div className="relay-player-grid">{s.room.players.map((p, i) => <div key={p.playerId}><span className={`relay-avatar color-${i % 4}`}>{i + 1}</span><strong>{p.nickname}{p.playerId === self ? " · 나" : ""}</strong><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "접속 중" : "오프라인"}</small></div>)}</div><label>제시어 꾸러미<select aria-label="제시어 난이도" disabled={!isHost || !canCommand || busy} value={"promptMode" in s.room ? s.room.promptMode : "MIXED"} onChange={e => { const mode = e.target.value; if (mode === "EASY" || mode === "NORMAL" || mode === "MIXED") void send({ ...envelope(), kind: "draw:configure", expectedRoomRevision: s.versions.roomRevision, payload: { promptMode: mode } }); }}><option value="EASY">쉬움 · 친숙한 사물</option><option value="NORMAL">보통 · 행동과 장소까지</option><option value="MIXED">혼합 · 엉뚱한 상상까지</option></select></label><p>{ready.guidance}</p>{isHost && <button className="relay-primary" disabled={!ready.canStart} onClick={props.onStart}>그림책 만들기 시작</button>}</div></section> : <>
      <section className={`relay-stage${seconds !== null && seconds <= 10 ? " urgent" : ""}`}><div><span className="relay-kicker">{game.phase === "REVEAL" || game.phase === "FINISHED" ? "THE BIG REVEAL" : `PAGE ${game.stageIndex} / ${game.totalStages}`}</span><h2>{game.phase === "DRAW" ? "그림으로 전해요" : game.phase === "REVEAL" ? "우리의 그림책을 펼쳐요" : game.phase === "FINISHED" ? "모든 그림책을 확인했습니다!" : "이 그림은 무엇일까요?"}</h2></div>{seconds !== null ? <div className="relay-clock"><span>남은 시간</span><strong>{formatCountdownMmSs(seconds)}</strong><small>제출 {progress}/{s.room.players.length}</small></div> : <RelayDoodle/>}</section>
      {"privateState" in game && <><div className="relay-progress" aria-label="제출 진행">{s.room.players.map(p => <span key={p.playerId} className={game.playerStates.find(g => g.playerId === p.playerId)?.submitted ? "done" : ""}>{p.nickname} {game.playerStates.find(g => g.playerId === p.playerId)?.submitted ? "✓" : "…"}</span>)}</div>
        {game.privateState.submitted ? <section className="relay-wait"><RelayDoodle/><h2>제출 완료!</h2><p>다른 참가자를 기다리고 있어요.</p><strong>{progress} / {s.room.players.length} 완료</strong></section> : game.phase === "DRAW" ? <DrawEditor key={`${game.gameId}:${game.stageToken}:${self}`} game={game} enabled={canCommand && seconds !== 0} send={props.onCommand} audio={audio.current}/> : <section className="relay-guess"><div className="relay-paper"><RelayCanvas drawing={game.privateState.source.drawing}/></div><form onSubmit={e => { e.preventDefault(); void send({ ...envelope(), kind: "draw:submitGuess", gameId: game.gameId, stageToken: game.stageToken, payload: { text: guess } }); }}><label htmlFor="relay-guess">{game.phase === "FINAL_GUESS" ? "마지막 추측을 들려주세요" : "그림 속 단어를 맞혀보세요"}</label><input id="relay-guess" value={guess} maxLength={80} onChange={e => setGuess(Array.from(e.target.value).slice(0, 40).join(""))} placeholder="떠오르는 단어를 적어주세요" disabled={!canCommand || busy}/><span>{Array.from(guess).length}/40</span><button className="relay-primary" disabled={!guess.trim() || !canCommand || busy || seconds === 0}>추측 제출</button></form></section>}
      </>}
      {"books" in game && <section className="relay-reveal" aria-live="polite" aria-label="공개된 그림책"><div className="relay-book-tabs">{game.books.map((b, i) => <span key={b.ownerPlayerId} className={i === game.reveal.bookIndex ? "current" : ""}>{nickname(b.ownerPlayerId)}의 책</span>)}</div>
        {game.books.map((book, index) => <details className="relay-book" key={book.ownerPlayerId} open={index === game.reveal.bookIndex || game.phase === "FINISHED"}><summary>{nickname(book.ownerPlayerId)}의 그림책</summary>{book.initialPrompt === null ? <div className="relay-cover"><RelayDoodle/><h2>어떤 이야기로 변했을까요?</h2><p>첫 페이지를 기다려주세요.</p></div> : <><div className="relay-word"><span>처음 단어</span><h3>{book.initialPrompt}</h3></div><div className="relay-pages">{book.pages.map((page, i) => <article className="relay-page" key={i}><span className="relay-page-number">{i + 1}</span>{page.kind === "DRAWING" ? <RelayCanvas drawing={page.drawing}/> : <blockquote>“{page.text}”</blockquote>}<footer>{nickname(page.authorPlayerId)} · {page.kind === "DRAWING" ? "그림" : "추측"}{page.timedOut ? " · 자동 제출" : ""}</footer></article>)}</div>{book.pages.length === game.totalStages && <div className="relay-comparison"><div><small>처음에는...</small><strong>{book.initialPrompt}</strong></div><span aria-hidden="true">→</span><div><small>마지막에는...</small><strong>{(() => { const page = book.pages.at(-1); return page?.kind === "GUESS" ? page.text : ""; })()}</strong></div></div>}</>}</details>)}
        <div className="relay-reveal-dock">{isHost ? <button className="relay-primary" disabled={!canCommand || busy} onClick={() => void send(game.phase === "FINISHED" ? { ...envelope(), kind: "draw:rematch", gameId: game.gameId, stageToken: game.stageToken, expectedGameRevision: game.gameRevision, expectedRoomRevision: s.versions.roomRevision, payload: {} } : { ...envelope(), kind: "draw:revealNext", gameId: game.gameId, stageToken: game.stageToken, expectedGameRevision: game.gameRevision, payload: {} })}>{game.phase === "FINISHED" ? "같은 방에서 다시 하기" : game.reveal.pageIndex >= game.totalStages ? game.reveal.bookIndex === s.room.players.length - 1 ? "모든 그림책 감상 완료" : "다음 그림책 펼치기" : "다음 페이지 공개"}</button> : <p>{game.phase === "FINISHED" ? "방장이 새 그림책을 준비할 때까지 기다려주세요." : "방장이 다음 장을 넘길 때까지 기다려주세요."}</p>}</div>
      </section>}
    </>}
  </main>;
}
