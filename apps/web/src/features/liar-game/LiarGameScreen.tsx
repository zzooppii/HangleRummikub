import { useEffect, useRef, useState } from "react";
import { LIAR_CATEGORIES, LIAR_CATEGORY_LABELS, LIAR_DEFAULT_SETTINGS, type LiarClientCommand, type LiarSettings, type LiarStage, type LiarResult, type PlayerId } from "@hangul-rummikub/shared";
import type { LiarWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { RealtimeClientError } from "../../lib/realtime-client.js";

export type LiarScreenProps = Readonly<{ snapshot: LiarWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
  onCommand(command: LiarClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void; onRematch(): void }>;
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });
export const LIAR_STAGE_COPY: Readonly<Record<LiarStage, string>> = { REVEAL: "나만의 카드를 확인하세요", CLUE: "제시어를 살짝 설명해 주세요", DISCUSSION: "말 사이에 숨은 거짓말", VOTE: "누가 제시어를 모를까요?", REVOTE: "동률이에요. 한 번 더 투표하세요", GUESS: "라이어의 마지막 기회" };
export const LIAR_RESULT_COPY: Readonly<Record<LiarResult["reason"], string>> = { MISIDENTIFIED: "시민이 지목되어 라이어가 살아남았습니다.", NO_VOTES: "유효한 표가 없어 라이어가 살아남았습니다.", TIE: "재투표도 동률! 라이어가 살아남았습니다.", GUESS_CORRECT: "라이어가 제시어를 맞혔습니다.", GUESS_WRONG: "라이어의 마지막 추측이 틀렸습니다.", GUESS_TIMEOUT: "라이어가 시간 안에 제시어를 맞히지 못했습니다.", CANCELLED: "참가자가 나가 이번 판이 취소됐습니다." };
export function LiarEmblem() { return <svg className="liar-emblem" viewBox="0 0 180 150" aria-hidden="true"><rect x="32" y="16" width="86" height="118" rx="12" transform="rotate(-14 75 75)" fill="currentColor" opacity=".18"/><rect x="61" y="12" width="86" height="118" rx="12" transform="rotate(10 104 71)" fill="currentColor"/><path d="M79 59 Q104 44 130 59 L126 81 Q113 96 103 83 Q91 96 81 80Z" fill="var(--liar-paper, #fff9ec)"/><path d="M88 65l10 3m13 0l10-3" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/><path d="M97 105q9 6 17-1" fill="none" stroke="var(--liar-paper, #fff9ec)" strokeWidth="3" strokeLinecap="round"/></svg>; }

export function LiarGameScreen(props: LiarScreenProps) {
  const s = props.snapshot, game = s.game, self = s.self.playerId;
  const host = s.room.players.some(p => p.playerId === self && p.isHost);
  const settings = game?.settings ?? ("settings" in s.room ? s.room.settings : LIAR_DEFAULT_SETTINGS);
  const playing = game?.phase === "PLAYING" ? game : null;
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [secret, setSecret] = useState(false);
  const [target, setTarget] = useState<PlayerId | null>(null), [text, setText] = useState(""), [message, setMessage] = useState("");
  const [, tick] = useState(0), received = useRef({ at: s.serverTime, local: Date.now() }), sending = useRef(false);
  const scope = `${game?.gameId ?? "lobby"}:${playing?.phaseId ?? "end"}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  useEffect(() => { received.current = { at: s.serverTime, local: Date.now() }; }, [s.serverTime, playing?.phaseId]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => tick(v => v + 1), 250); return () => clearInterval(timer); }, [playing?.phaseId]);
  useEffect(() => { if (game?.phase === "PLAYING") window.scrollTo({ top: 0, left: 0 }); }, [game?.gameId]);
  useEffect(() => { setSecret(false); setTarget(null); setText(""); setMessage(""); setError(null); }, [scope, props.connected]);
  useEffect(() => { const hide = () => { if (document.hidden) setSecret(false); }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  const seconds = playing ? Math.max(0, Math.ceil((playing.deadlineAt - received.current.at - (Date.now() - received.current.local)) / 1000)) : 0;
  const enabled = props.connected && !props.pending && !busy, canAct = enabled && seconds > 0;
  const ready = getGameStartControl(s, !enabled);
  const name = (id: string) => s.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
  async function command(c: LiarClientCommand): Promise<boolean> {
    if (!enabled || sending.current) return false;
    sending.current = true; setBusy(true); setError(null); const submittedScope = scope;
    try {
      try { await props.onCommand(c); }
      catch (e) {
        // A lost ACK retries the identical request; the server's receipt prevents duplicate clues/votes/guesses.
        if (e instanceof RealtimeClientError && e.code === "ACKNOWLEDGEMENT_TIMEOUT") await props.onCommand(c); else throw e;
      }
      return true;
    } catch (e) { if (scopeRef.current === submittedScope) setError(e instanceof Error ? e.message : "요청을 확인하고 다시 시도해주세요."); return false; }
    finally { sending.current = false; setBusy(false); }
  }
  function configure(next: LiarSettings) { void command({ ...envelope(), kind: "liar:configure", expectedRoomRevision: s.versions.roomRevision, payload: next }); }
  const voting = playing?.stage === "VOTE" || playing?.stage === "REVOTE";
  const myTurn = playing?.activePlayerId === self;
  return <main className="liar-shell">
    <header className="liar-header"><div className="liar-brand"><LiarEmblem/><div><small>ONE WORD. ONE LIAR.</small><h1>라이어게임</h1></div></div><nav aria-label="게임 도구"><button onClick={props.onCopy}>초대 · {s.room.roomCode}</button><span className="liar-connection">{props.connectionLabel}</span><button disabled={props.pending} onClick={props.onLeave}>나가기</button></nav></header>
    {(error || props.error) && <p role="alert" className="liar-error">{error ?? props.error}</p>}
    {!game ? <div className="liar-lobby"><section className="liar-invitation"><span className="liar-eyebrow">4–8명 · 비밀 제시어 추리</span><h2>다 아는 이야기.<br/>한 사람만 빼고.</h2><p>너무 정확하면 정답이 들키고,<br/>너무 모호하면 내가 의심받아요.</p><LiarEmblem/><div className="liar-chapters"><span>01 설명하기</span><span>02 의심하기</span><span>03 찾아내기</span></div></section>
      <section className="liar-panel"><div className="liar-section-head"><h2>오늘의 참가자</h2><span>{s.room.players.length} / 8명</span></div><div className="liar-roster">{s.room.players.map((p, i) => <div key={p.playerId}><span className="liar-avatar">{i + 1}</span><span><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "접속 중" : "연결 기다리는 중"}</small></span></div>)}</div>
        <fieldset className="liar-settings" disabled={!host || !enabled}><legend>이번 판의 주제</legend><div className="liar-options">{(["RANDOM", ...LIAR_CATEGORIES] as const).map(category => <button key={category} aria-pressed={settings.category === category} onClick={() => configure({ ...settings, category })}>{LIAR_CATEGORY_LABELS[category]}</button>)}</div></fieldset>
        <fieldset className="liar-settings" disabled={!host || !enabled}><legend>자유 토론 시간</legend><div className="liar-options">{([60, 90, 120] as const).map(discussionSeconds => <button key={discussionSeconds} aria-pressed={settings.discussionSeconds === discussionSeconds} onClick={() => configure({ ...settings, discussionSeconds })}>{discussionSeconds}초</button>)}</div></fieldset>
        <p className="liar-hint">{ready.guidance}</p>{host ? <button className="liar-primary liar-wide" disabled={!ready.canStart} onClick={props.onStart}>비밀 카드 나누기 →</button> : <p>방장이 게임을 시작하면 카드를 받습니다.</p>}
      </section></div> : <>
      <section className={`liar-stage${playing ? " liar-live" : ""}`}><div><span className="liar-eyebrow">{LIAR_CATEGORY_LABELS[game.category]} · {playing ? "한 판의 비밀" : "진실 공개"}</span><h2>{playing ? LIAR_STAGE_COPY[playing.stage] : game.phase === "FINISHED" && game.result.reason === "CANCELLED" ? "이번 판은 여기까지" : "숨겨진 제시어는…"}</h2></div>{playing && <div className={`liar-timer${seconds <= 10 ? " urgent" : ""}`} role="timer" aria-label={`남은 시간 ${seconds}초`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}<small>{seconds ? "남은 시간" : "결과 확인 중"}</small></div>}</section>
      {game.phase === "FINISHED" ? <section className="liar-panel liar-result"><span className="liar-answer">{game.result.word}</span><h2>{game.result.reason === "CANCELLED" ? "승패 없이 종료" : game.result.winnerPlayerIds.includes(game.result.liarPlayerId) ? "라이어 승리!" : "시민 승리!"}</h2><p>{LIAR_RESULT_COPY[game.result.reason]}</p><p>라이어는 <b>{name(game.result.liarPlayerId)}</b>님이었어요.</p>{game.result.guess && <p>마지막 추측: <b>{game.result.guess}</b></p>}
        <div className="liar-result-clues">{game.playerStates.map(p => <article key={p.playerId}><b>{name(p.playerId)} · {p.playerId === game.result.liarPlayerId ? "라이어" : "시민"}</b><p>{p.clue ?? (p.clueDone ? "설명하지 않음" : "설명 전 종료")}</p></article>)}</div>
        {game.result.voteRounds.map((round, i) => <details key={i} open><summary>{i === 0 ? "첫 번째 투표" : "재투표"}</summary><ul className="liar-vote-results">{round.map(vote => <li key={vote.playerId}><span>{name(vote.playerId)}</span><span>→ {vote.votedFor ? name(vote.votedFor) : "기권"}</span></li>)}</ul></details>)}
        {host ? <button className="liar-primary" disabled={!enabled} onClick={props.onRematch}>같은 방에서 다시 하기</button> : <p>방장이 다음 판을 준비할 때까지 기다려주세요.</p>}
      </section> : <div className="liar-play-layout"><section className="liar-panel liar-table"><div className="liar-section-head"><h3>테이블 위의 이야기</h3><span>{game.stage === "CLUE" ? `${name(game.activePlayerId ?? "")}님의 차례` : voting ? "투표는 비밀이에요" : "설명은 모두에게 공개돼요"}</span></div>
        <div className="liar-seats">{game.playerStates.map((p, i) => { const selectable = voting && !game.privateView.votedFor && p.playerId !== self && game.voteCandidates.includes(p.playerId); const selected = target === p.playerId || game.privateView.votedFor === p.playerId; const active = game.activePlayerId === p.playerId; return <button key={p.playerId} className={`liar-seat${active ? " active" : ""}${selected ? " selected" : ""}`} aria-pressed={selected} disabled={!canAct || !selectable} onClick={() => setTarget(p.playerId)}><span className="liar-seat-head"><span className="liar-avatar">{String(i + 1).padStart(2, "0")}</span><b>{name(p.playerId)}{p.playerId === self ? " · 나" : ""}</b></span><span className="liar-clue">{p.clue ? `“${p.clue}”` : p.clueDone ? "설명하지 않음" : active && game.stage === "CLUE" ? "생각하는 중…" : "아직 비밀이에요"}</span><small>{s.room.players.find(person => person.playerId === p.playerId)?.connectionStatus === "OFFLINE" ? "연결 끊김" : game.privateView.votedFor === p.playerId ? "내가 투표한 사람" : selected ? "선택됨" : voting && !game.voteCandidates.includes(p.playerId) ? "재투표 대상 아님" : active ? "현재 차례" : `${i + 1}번째 설명`}</small></button>; })}</div>
        <div className="liar-action" aria-live="polite">
          {game.stage === "REVEAL" && <><h3>나만 보는 카드를 펼쳐보세요</h3><p>시민은 제시어를 알고, 라이어는 주제만 압니다. 잠시 후 첫 설명이 시작됩니다.</p></>}
          {game.stage === "CLUE" && (myTurn ? <form onSubmit={e => { e.preventDefault(); if (text.trim() && canAct) void command({ ...envelope(), kind: "liar:clue", gameId: game.gameId, phaseId: game.phaseId, payload: { text } }); }}><label htmlFor="liar-clue">내 설명 · 40자 이내</label><textarea id="liar-clue" maxLength={40} rows={2} value={text} disabled={!canAct} onChange={e => setText(e.target.value)} placeholder="제시어를 직접 말하지 않고 설명해요"/><button className="liar-primary" disabled={!canAct || !text.trim()}>설명 제출</button></form> : <><h3>{name(game.activePlayerId ?? "")}님의 설명을 기다립니다</h3><p>어떤 말을 고르는지 잘 기억하세요. 시간이 끝나면 다음 차례로 넘어갑니다.</p></>)}
          {game.stage === "DISCUSSION" && <><h3>누구의 설명이 수상했나요?</h3><p>토론창에서 질문하고 의심을 나눠보세요. 제시어를 직접 말하면 라이어에게 힌트가 됩니다.</p></>}
          {voting && <><h3>{game.privateView.votedFor ? "투표를 마쳤습니다" : game.stage === "REVOTE" ? "동률 후보 중 한 사람을 선택하세요" : "의심되는 사람의 카드를 선택하세요"}</h3><p>{game.privateView.votedFor ? `${name(game.privateView.votedFor)}님에게 투표했어요. 모두의 선택이 끝나면 집계합니다.` : "자기 자신에게는 투표할 수 없어요. 확정한 표는 바꿀 수 없고, 미투표는 기권입니다."}</p>{!game.privateView.votedFor && <button className="liar-primary" disabled={!canAct || !target || !game.voteCandidates.includes(target)} onClick={() => { if (target) void command({ ...envelope(), kind: "liar:vote", gameId: game.gameId, phaseId: game.phaseId, payload: { playerId: target } }); }}>{target ? `${name(target)}님에게 투표 확정` : "투표할 사람을 선택하세요"}</button>}</>}
          {game.stage === "GUESS" && (game.privateView.role === "LIAR" ? <form onSubmit={e => { e.preventDefault(); if (text.trim() && canAct) void command({ ...envelope(), kind: "liar:guess", gameId: game.gameId, phaseId: game.phaseId, payload: { text } }); }}><label htmlFor="liar-guess">당신이 생각한 제시어 · 단 한 번의 기회</label><input id="liar-guess" autoComplete="off" maxLength={40} value={text} disabled={!canAct} onChange={e => setText(e.target.value)} placeholder="정답을 입력하세요"/><button className="liar-primary" disabled={!canAct || !text.trim()}>이 정답으로 최종 추측</button></form> : <><h3>{name(game.activePlayerId ?? "")}님이 마지막 추측 중입니다</h3><p>아직 정답을 말하지 마세요. 라이어가 맞히면 승리가 뒤집힙니다.</p></>)}
        </div>
      </section><aside className="liar-side"><section className="liar-panel liar-private"><span className="liar-eyebrow">FOR YOUR EYES ONLY</span><h3>나만 보는 카드</h3><button className={`liar-secret${secret ? " revealed" : ""}`} aria-expanded={secret} disabled={!props.connected} onClick={() => setSecret(value => !value)}>{secret ? <><small>{game.privateView.role === "LIAR" ? "당신은 라이어입니다" : "당신은 시민입니다"}</small><strong>{game.privateView.role === "CITIZEN" ? game.privateView.word : "?"}</strong><span>{game.privateView.role === "LIAR" ? `주제는 ${LIAR_CATEGORY_LABELS[game.category]}. 자연스럽게 섞여보세요.` : "너무 정확한 설명은 위험해요"}</span><small>눌러서 가리기</small></> : <><LiarEmblem/><strong>눌러서 카드 확인</strong><small>당신에게만 보입니다</small></>}</button></section>
        <section className="liar-panel liar-chat"><h3>자유 토론</h3><div className="liar-messages" role="log" aria-label="토론 채팅">{game.messages.length === 0 ? <p className="liar-hint">{game.stage === "DISCUSSION" ? "첫 이야기를 들려주세요." : "설명이 끝나면 토론할 수 있어요."}</p> : game.messages.map((m, i) => <p key={`${m.at}-${i}`}><b>{name(m.playerId)}</b><span>{m.text}</span></p>)}</div><form onSubmit={e => { e.preventDefault(); if (!message.trim() || !canAct || game.stage !== "DISCUSSION") return; const submitted = message; void command({ ...envelope(), kind: "liar:say", gameId: game.gameId, phaseId: game.phaseId, payload: { text: submitted } }).then(ok => { if (ok) setMessage(current => current === submitted ? "" : current); }); }}><label htmlFor="liar-message">토론 메시지 · 200자 이내</label><input id="liar-message" maxLength={200} value={message} disabled={!canAct || game.stage !== "DISCUSSION"} onChange={e => setMessage(e.target.value)} placeholder={game.stage === "DISCUSSION" ? "누가 의심되나요?" : "토론 시간에 열립니다"}/><button disabled={!canAct || game.stage !== "DISCUSSION" || !message.trim()}>보내기</button></form></section>
      </aside></div>}
    </>}
    <details className="liar-help"><summary>게임 방법과 온라인 진행 안내</summary><div><p>4~8명 중 한 명만 제시어를 모릅니다. 시민은 라이어를 찾고, 라이어는 정체를 숨기거나 마지막에 정답을 맞히면 승리합니다.</p><ol><li>15초 동안 개인 카드를 확인합니다. 라이어는 주제만 알 수 있어요.</li><li>순서대로 30초 안에 40자 이내로 설명합니다. 제시어를 직접 말하지 마세요.</li><li>설명 후 정해진 시간 동안 자유롭게 토론합니다. 채팅은 1초에 한 번 보낼 수 있어요.</li><li>30초 안에 자신을 제외한 한 명에게 비밀 투표합니다. 확정 후 변경할 수 없습니다.</li><li>동률은 해당 후보에게 한 번 재투표합니다. 재동률이나 전원 기권이면 라이어 승리입니다.</li><li>시민이 지목되면 라이어 승리. 라이어가 잡히면 20초 안에 정답을 한 번 추측합니다.</li></ol><p>미설명은 건너뛰고 미투표는 기권입니다. 정답의 공백·대소문자와 등록된 동의어는 허용하지만 비슷한 단어를 자동으로 정답 처리하지 않습니다. 연결이 잠깐 끊겨도 같은 자리로 돌아올 수 있으며 시간은 계속 흐릅니다. 나가기를 누르면 이번 판이 취소됩니다. 내장 음성은 제공하지 않습니다.</p></div></details>
    <footer className="liar-footer">하나의 제시어, 여럿의 이야기, 단 한 명의 라이어.</footer>
  </main>;
}
