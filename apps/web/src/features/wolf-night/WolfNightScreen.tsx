import { useEffect, useRef, useState } from "react";
import { safeParse } from "valibot";
import { defaultWolfDeck, WOLF_ROLES, WOLF_ROLE_LIMITS, WolfDeckSchema, type WolfRole, type WolfClientCommand, type WolfSettings, type PlayerId } from "@hangul-rummikub/shared";
import type { WolfWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { ROLE_COPY, STAGE_COPY } from "./roles.js";
import { WolfEmblem, NightLandscape } from "./art.js";

export type WolfScreenProps = Readonly<{ snapshot: WolfWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
  onCommand(command: WolfClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void }>;
const envelope = () => ({ protocolVersion: 1 as const, requestId: createRequestId() });
export function wolfSelectionValid(role: WolfRole | null, playerCount: number, centerCount: number): boolean {
  if (!role) return false;
  if (role === "SEER") return playerCount === 1 && centerCount === 0 || playerCount === 0 && centerCount === 2;
  if (role === "TROUBLEMAKER") return playerCount === 2 && centerCount === 0;
  if (role === "WEREWOLF" || role === "DRUNK") return playerCount === 0 && centerCount === 1;
  return (role === "DOPPELGANGER" || role === "ROBBER") && playerCount === 1 && centerCount === 0;
}
function RoleToken({ role, count }: { role: WolfRole; count?: number }) { return <span className={`wolf-role-token team-${ROLE_COPY[role].team === "늑대팀" ? "wolf" : "village"}`} title={ROLE_COPY[role].description}><span aria-hidden="true">{ROLE_COPY[role].symbol}</span>{ROLE_COPY[role].name}{count && count > 1 ? ` ×${count}` : ""}</span>; }
function roleCounts(deck: readonly WolfRole[]) { return WOLF_ROLES.filter(r => deck.includes(r)).map(role => ({ role, count: deck.filter(r => r === role).length })); }

export function WolfNightScreen(props: WolfScreenProps) {
  const s = props.snapshot, game = s.game, self = s.self.playerId;
  const host = s.room.players.some(p => p.playerId === self && p.isHost);
  const settings = game?.settings ?? ("settings" in s.room ? s.room.settings : { roles: null, discussionSeconds: 180 as const });
  const deck = game?.deck ?? settings.roles ?? defaultWolfDeck(s.room.players.length);
  const playing = game?.phase === "PLAYING" ? game : null, role = playing?.privateView.actionRole ?? null;
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [help, setHelp] = useState(false), [secret, setSecret] = useState(false);
  const [targets, setTargets] = useState<PlayerId[]>([]), [centers, setCenters] = useState<number[]>([]), [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState<WolfRole[]>([]), [clock, setClock] = useState(0);
  const received = useRef({ at: s.serverTime, local: Date.now() }), dialog = useRef<HTMLDialogElement>(null), messagesEnd = useRef<HTMLDivElement>(null), sending = useRef(false);
  const messageBaseline = useRef({ gameId: game?.gameId, count: game?.messages.length ?? 0 });
  const enabled = props.connected && !props.pending && !busy;
  useEffect(() => { received.current = { at: s.serverTime, local: Date.now() }; }, [s.serverTime]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setClock(v => v + 1), 250); return () => clearInterval(timer); }, [playing?.phaseId]);
  useEffect(() => { setTargets([]); setCenters([]); setError(null); }, [playing?.phaseId, playing?.privateView.actionRevision, game?.gameId]);
  useEffect(() => { setSecret(false); setMessage(""); }, [game?.gameId, props.connected]);
  useEffect(() => { if (help && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [help]);
  useEffect(() => {
    const previous = messageBaseline.current, count = game?.messages.length ?? 0;
    if (previous.gameId === game?.gameId && count > previous.count) messagesEnd.current?.scrollIntoView({ block: "nearest" });
    messageBaseline.current = { gameId: game?.gameId, count };
  }, [game?.gameId, game?.messages.length]);
  const seconds = playing ? Math.max(0, Math.ceil((playing.deadlineAt - received.current.at - (Date.now() - received.current.local)) / 1000)) : 0;
  void clock;
  const canAct = enabled && seconds > 0;
  const ready = getGameStartControl(s, !enabled), validDeck = deck.length === s.room.players.length + 3 && safeParse(WolfDeckSchema, deck).success;
  const name = (id: string) => s.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
  async function command(c: WolfClientCommand) {
    if (!enabled || sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    try { await props.onCommand(c); } catch (e) { setError(e instanceof Error ? e.message : "요청을 확인해주세요."); }
    finally { sending.current = false; setBusy(false); }
  }
  function configure(next: WolfSettings) { void command({ ...envelope(), kind: "wolf:configure", expectedRoomRevision: s.versions.roomRevision, payload: next }); }
  function togglePlayer(id: PlayerId) {
    setCenters([]); const max = role === "TROUBLEMAKER" && playing?.stage !== "VOTE" ? 2 : 1;
    setTargets(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id].slice(-max));
  }
  function toggleCenter(index: number) { setTargets([]); const max = role === "SEER" ? 2 : 1; setCenters(previous => previous.includes(index) ? previous.filter(x => x !== index) : [...previous, index].slice(-max)); }
  function act(pass = false) {
    if (!playing) return;
    void command({ ...envelope(), kind: "wolf:act", gameId: playing.gameId, phaseId: playing.phaseId, expectedActionRevision: playing.privateView.actionRevision,
      payload: pass ? { type: "PASS" } : centers.length ? { type: "CENTER", indices: centers } : { type: "PLAYERS", playerIds: targets } });
  }
  function closeHelp() { dialog.current?.close(); setHelp(false); }
  const stage = playing?.stage ?? "FINISHED", isDay = stage === "DISCUSSION" || stage === "VOTE";
  return <main className={`wolf-shell${isDay ? " wolf-day" : ""}`}>
    <header className="wolf-header"><div className="wolf-brand"><span aria-hidden="true">☾</span><div><small>ONE NIGHT. MANY SECRETS.</small><h1>늑대의 밤</h1></div></div>
      <nav aria-label="게임 도구"><button onClick={props.onCopy}>초대 · {s.room.roomCode}</button><span className="wolf-connection">{props.connectionLabel}</span><button onClick={() => setHelp(true)}>게임 방법</button><button onClick={props.onLeave} disabled={props.pending}>나가기</button></nav>
    </header>
    {(error || props.error) && <p className="wolf-error" role="alert">{error ?? props.error}</p>}
    {!game ? <div className="wolf-lobby">
      <section className="wolf-invitation"><span className="wolf-eyebrow">SOCIAL DEDUCTION · 3–10 PLAYERS</span><h2>달이 지면,<br/>진실이 뒤집힌다.</h2><p>누군가는 거짓말을 하고,<br/>누군가는 자신이 바뀐 줄도 모릅니다.</p><WolfEmblem large/><div className="wolf-chapters"><span><b>01</b> 비밀의 밤</span><span><b>02</b> 의심의 아침</span><span><b>03</b> 단 한 번의 투표</span></div><NightLandscape/></section>
      <section className="wolf-panel wolf-setup"><div className="wolf-section-head"><div><span className="wolf-eyebrow">THE VILLAGE</span><h2>오늘 밤, 이 마을에는</h2></div><span className="wolf-count">{s.room.players.length}<small> / 10</small></span></div>
        <div className="wolf-lobby-players">{s.room.players.map((p,i) => <div key={p.playerId}><span className="wolf-avatar">{String(i + 1).padStart(2,"0")}</span><span><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "준비된 마을 사람" : "연결 기다리는 중"}</small></span><i className={p.connectionStatus === "CONNECTED" ? "online" : ""}/></div>)}</div>
        <div className="wolf-section-head"><h3>역할 구성</h3><span>{deck.length}장 · 중앙 3장 포함</span></div><div className="wolf-deck">{roleCounts(deck).map(r => <RoleToken key={r.role} {...r}/>)}</div>
        {host && <div className="wolf-setting-actions"><button disabled={!enabled} onClick={() => { setDraft([...deck]); setEditing(v => !v); }}>{editing ? "편집 닫기" : "역할 직접 고르기"}</button><button disabled={!enabled || settings.roles === null} onClick={() => { configure({ ...settings, roles: null }); setEditing(false); }}>인원에 맞춰 자동 구성</button></div>}
        {editing && host && <fieldset className="wolf-deck-editor" disabled={!enabled}><legend>참가자 수 + 3장을 선택하세요 · {draft.length} / {s.room.players.length + 3}</legend>{WOLF_ROLES.map(r => <label key={r}><span>{ROLE_COPY[r].name}</span><select aria-label={`${ROLE_COPY[r].name} 카드 수`} value={draft.filter(x => x === r).length} onChange={e => setDraft([...draft.filter(x => x !== r), ...Array.from({ length: Number(e.target.value) }, () => r)])}>{Array.from({ length: WOLF_ROLE_LIMITS[r] + 1 }, (_,n) => n).filter(n => r !== "MASON" || n !== 1).map(n => <option key={n} value={n}>{n}장</option>)}</select></label>)}
          <p>프리메이슨은 2장씩, 불면증환자는 강도나 말썽쟁이와 함께 사용합니다.</p><button className="wolf-primary" disabled={draft.length !== s.room.players.length + 3 || !safeParse(WolfDeckSchema, draft).success} onClick={() => { configure({ ...settings, roles: draft }); setEditing(false); }}>이 구성 저장</button></fieldset>}
        <fieldset className="wolf-discussion-setting" disabled={!host || !enabled}><legend>아침 토론 시간</legend>{([120,180,300] as const).map(n => <button key={n} aria-pressed={settings.discussionSeconds === n} onClick={() => configure({ ...settings, discussionSeconds: n })}>{n / 60}분</button>)}</fieldset>
        <p className="wolf-hint">{!validDeck && s.room.players.length >= 3 ? "인원이 바뀌었습니다. 역할 수를 맞추거나 자동 구성을 선택해주세요." : editing ? "역할 구성을 저장하거나 편집을 닫아주세요." : ready.guidance}</p>
        {host ? <button className="wolf-primary wolf-start" disabled={!ready.canStart || !validDeck || editing} onClick={props.onStart}>밤을 시작하기 <span aria-hidden="true">→</span></button> : <p className="wolf-wait">방장이 밤을 준비하고 있습니다.</p>}
      </section>
    </div> : <>
      <section className={`wolf-stage-banner${playing ? " wolf-stage-live" : ""}`}><div><span className="wolf-eyebrow">{game.phase === "FINISHED" ? "THE TRUTH" : isDay ? "DAYBREAK" : "AFTER DARK"}</span><h2>{STAGE_COPY[stage]}</h2></div>{playing && <div className={`wolf-timer${seconds <= 10 ? " urgent" : ""}`} role="timer" aria-label={`남은 시간 ${seconds}초`}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2,"0")}<small>남은 시간</small></div>}</section>
      {game.phase === "FINISHED" ? <section className="wolf-results wolf-panel"><span className="wolf-eyebrow">{game.result.reason === "CANCELLED" ? "ROUND CANCELLED" : game.result.winnerPlayerIds.includes(self) ? "YOU WIN" : "NIGHT'S END"}</span><h2>{game.result.reason === "CANCELLED" ? "참가자가 떠나 이번 판이 취소됐습니다" : [game.result.villageWins ? "마을팀 승리" : "", game.result.wolvesWin ? "늑대팀 승리" : "", game.result.tannerWins ? "무두장이 승리" : ""].filter(Boolean).join(" · ") || "승리한 사람이 없습니다"}</h2>
        <p>{game.result.reason === "CANCELLED" ? "같은 방에서 인원을 정비하고 다시 시작할 수 있습니다." : game.result.eliminatedPlayerIds.length ? `${game.result.eliminatedPlayerIds.map(name).join(", ")} 탈락` : "최다 득표가 1표 이하라 아무도 탈락하지 않았습니다."}</p>
        <div className="wolf-result-grid">{game.result.players.map(p => <article key={p.playerId} className={game.result.winnerPlayerIds.includes(p.playerId) ? "winner" : ""}><div className="wolf-section-head"><h3>{name(p.playerId)}{p.playerId === self ? " · 나" : ""}</h3><span>{game.result.winnerPlayerIds.includes(p.playerId) ? "승리" : game.result.eliminatedPlayerIds.includes(p.playerId) ? "탈락" : "생존"}</span></div><div className="wolf-role-change"><small>{ROLE_COPY[p.originalRole].name}</small><span>→</span><RoleToken role={p.finalRole}/></div>{p.finalRole === "DOPPELGANGER" && <p>{p.effectiveRole === "DOPPELGANGER" ? "복사되지 않은 카드 · 마을팀" : `복사 역할: ${ROLE_COPY[p.effectiveRole].name}`}</p>}<p>{p.votesReceived}표 받음 · {p.votedFor ? `${name(p.votedFor)}에게 투표` : "기권"}</p></article>)}</div>
        <div className="wolf-center-result">중앙에 남은 카드 {game.result.center.map((r,i) => <RoleToken role={r} key={i}/>)}</div>{host ? <button className="wolf-primary" disabled={!enabled} onClick={() => void command({ ...envelope(), kind: "wolf:rematch", gameId: game.gameId, expectedRoomRevision: s.versions.roomRevision, expectedGameRevision: game.gameRevision, payload: {} })}>같은 방에서 다시 하기</button> : <p>방장이 다음 밤을 준비할 때까지 기다려주세요.</p>}
      </section> : <div className="wolf-play-layout"><section className="wolf-table wolf-panel"><div className="wolf-section-head"><h3>마을의 사람들</h3><span>역할은 아직 비밀입니다</span></div>
        <div className="wolf-seats">{s.room.players.map((p,i) => { const selectable = p.playerId !== self && (stage === "VOTE" && game.privateView.votedFor === null || role !== null && !["WEREWOLF","DRUNK"].includes(role)); return <button className={`wolf-seat${targets.includes(p.playerId) ? " selected" : ""}${p.playerId === self ? " self" : ""}`} key={p.playerId} disabled={!canAct || !selectable} aria-pressed={targets.includes(p.playerId)} onClick={() => togglePlayer(p.playerId)}><span className="wolf-seat-number">{String(i+1).padStart(2,"0")}</span><span className="wolf-card-back" aria-hidden="true">☾</span><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.connectionStatus === "OFFLINE" ? "연결 끊김" : targets.includes(p.playerId) ? "선택됨" : "비공개 카드"}</small></button>; })}</div>
        <div className="wolf-center"><span className="wolf-eyebrow">THE THREE UNKNOWN</span><div>{[0,1,2].map(i => <button key={i} aria-label={`중앙 카드 ${i+1}`} aria-pressed={centers.includes(i)} disabled={!canAct || role === null || !["SEER","WEREWOLF","DRUNK"].includes(role)} className={centers.includes(i) ? "selected" : ""} onClick={() => toggleCenter(i)}><span aria-hidden="true">✦</span><small>중앙 {i+1}</small></button>)}</div></div>
        <div className="wolf-action-panel" aria-live="polite">{role ? <><h3>{ROLE_COPY[role].name}의 시간</h3><p>{ROLE_COPY[role].description}</p><p className="wolf-hint">{role === "TROUBLEMAKER" ? "위에서 다른 사람 2명을 선택하세요." : role === "SEER" ? "다른 사람 1명 또는 중앙 카드 2장을 선택하세요." : ["DRUNK","WEREWOLF"].includes(role) ? "중앙 카드 1장을 선택하세요." : "위에서 다른 사람 1명을 선택하세요."}</p><button className="wolf-primary" disabled={!canAct || !wolfSelectionValid(role, targets.length, centers.length)} onClick={() => act()}>선택한 대상으로 능력 사용</button>{game.privateView.canPass && <button disabled={!canAct} onClick={() => act(true)}>능력 사용하지 않기</button>}</> : stage === "VOTE" ? <><h3>{game.privateView.votedFor ? "투표를 마쳤습니다" : "가장 의심스러운 한 사람을 선택하세요"}</h3><p>{game.privateView.votedFor ? `${name(game.privateView.votedFor)}에게 투표했습니다. 모두의 선택이 끝나면 공개합니다.` : "투표는 비밀이며 확정하면 바꿀 수 없습니다. 시간 안에 투표하지 않으면 기권입니다."}</p>{!game.privateView.votedFor && <button className="wolf-primary" disabled={!canAct || targets.length !== 1} onClick={() => { const target = targets[0]; if (target) void command({ ...envelope(), kind: "wolf:vote", gameId: game.gameId, phaseId: game.phaseId, payload: { playerId: target } }); }}>{targets[0] ? `${name(targets[0])}에게 투표 확정` : "투표할 사람을 선택하세요"}</button>}</> : <><h3>{stage === "REVEAL" ? "나의 역할 카드를 열어보세요" : stage === "DISCUSSION" ? "당신이 아는 이야기부터 시작하세요" : "조용히 밤의 움직임을 기다리세요"}</h3><p>{stage === "DISCUSSION" ? "처음 받은 역할과 지금의 역할은 다를 수 있습니다. 정보를 나눠도, 거짓말을 해도 좋아요." : "나의 기록에서 확인한 정보와 행동을 볼 수 있습니다. 다른 사람의 행동이 끝나도 정해진 시간까지 기다립니다."}</p></>}</div>
      </section><aside className="wolf-private-column"><section className="wolf-private wolf-panel"><span className="wolf-eyebrow">FOR YOUR EYES ONLY</span><h3>나의 비밀</h3><button className={`wolf-secret-card${secret ? " revealed" : ""}`} aria-expanded={secret} onClick={() => setSecret(x => !x)}>{secret ? <><span aria-hidden="true">{ROLE_COPY[game.privateView.originalRole].symbol}</span><strong>{ROLE_COPY[game.privateView.originalRole].name}</strong><small>처음 받은 역할</small>{game.privateView.copiedRole && <small>복사: {ROLE_COPY[game.privateView.copiedRole].name}</small>}</> : <><WolfEmblem/><strong>눌러서 역할 확인</strong><small>당신에게만 보이는 카드</small></>}</button>{secret && <p>{ROLE_COPY[game.privateView.originalRole].description}</p>}<p className="wolf-hint">이 카드는 처음 받은 역할입니다.<br/>밤중에 바뀐 현재 카드를 보여주지 않습니다.</p>
        <details className="wolf-notes"><summary>나의 밤 기록 <span>{game.privateView.observations.length}</span></summary>{game.privateView.observations.length === 0 ? <p>아직 확인한 정보가 없습니다.</p> : game.privateView.observations.map((note,i) => <div key={i}>{note.label === "COPY" ? "역할 복사" : note.label === "WOLVES" ? "확인한 늑대" : note.label === "MASONS" ? "확인한 동료" : note.label === "SWAPPED" ? "카드 교환" : note.label === "AUTO" ? "시간 초과로 서버가 대신 처리했습니다." : note.label === "PASSED" ? "능력을 사용하지 않았습니다." : "확인한 카드"}{note.playerIds.length > 0 && <p>{note.playerIds.map(name).join(", ")}</p>}{(note.label === "WOLVES" || note.label === "MASONS") && note.playerIds.length === 0 && <p>다른 사람이 없었습니다.</p>}{note.cards.map((c,j) => <p key={j}>{c.location.startsWith("center:") ? `중앙 ${Number(c.location.slice(7))+1}` : name(c.location)} · <b>{ROLE_COPY[c.role].name}</b></p>)}{note.label === "SWAPPED" && !note.cards.length && <p>바뀐 역할은 확인할 수 없습니다.</p>}</div>)}</details></section>
        <section className="wolf-chat wolf-panel"><h3>마을의 대화</h3><div className="wolf-messages" role="log" aria-label="토론 채팅">{game.messages.length === 0 && <p className="wolf-hint">{stage === "DISCUSSION" ? "첫 이야기를 들려주세요." : "토론 시간이 되면 대화할 수 있습니다."}</p>}{game.messages.map((m,i) => <p key={`${m.at}-${i}`}><b>{name(m.playerId)}</b><span>{m.text}</span></p>)}<div ref={messagesEnd}/></div><form onSubmit={e => { e.preventDefault(); if (!message.trim() || stage !== "DISCUSSION") return; void command({ ...envelope(), kind: "wolf:say", gameId: game.gameId, phaseId: game.phaseId, payload: { text: message.trim() } }); setMessage(""); }}><label className="wolf-sr-only" htmlFor="wolf-message">토론 메시지</label><input id="wolf-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={200} disabled={!canAct || stage !== "DISCUSSION"} placeholder={stage === "DISCUSSION" ? "당신의 이야기는…" : "아침이 오면 대화해요"}/><button disabled={!canAct || stage !== "DISCUSSION" || !message.trim()}>보내기</button></form></section>
      </aside></div>}
      <section className="wolf-public-deck"><span className="wolf-eyebrow">TONIGHT'S ROLES</span><div className="wolf-deck">{roleCounts(deck).map(r => <RoleToken key={r.role} {...r}/>)}</div></section>
    </>}
    <footer className="wolf-footer">단 한 번의 밤. 마지막 카드가 당신의 운명입니다.</footer>
    {help && <dialog ref={dialog} className="wolf-guide" onCancel={closeHelp} aria-labelledby="wolf-help-title"><button className="wolf-guide-close" onClick={closeHelp}>닫기</button><span className="wolf-eyebrow">A GUIDE TO THE NIGHT</span><h2 id="wolf-help-title">늑대의 밤, 이렇게 즐기세요</h2><h3>1. 게임 개요 및 준비</h3>
      <p>3–10명 · 만 8세 이상 · 약 10분. 한 번의 밤과 낮의 토론·투표로 한 판이 끝납니다. 서버가 사회자 역할을 맡습니다.</p>
      <p>참가자 수 + 3장의 역할 카드를 섞어 각자 1장씩 나누고 중앙에 3장을 둡니다. 처음 받은 역할을 혼자 확인하세요.</p>
      <p>초보자 추천: 3인은 늑대인간 2장, 마을주민·강도·말썽쟁이·주정뱅이 각 1장입니다. 4–5인은 마을주민을 1장씩 추가합니다. 이 인원에서는 자동 구성에 적용됩니다.</p>
      <h3>2. 밤 단계</h3>
      <p>도플갱어 → 늑대인간 → 하수인 → 프리메이슨 → 예언가 → 강도 → 말썽쟁이 → 주정뱅이 → 불면증환자 순서로 진행합니다. 구성에 없는 역할은 건너뜁니다.</p>
      <p>처음 받은 역할에 따라 행동합니다. 도플갱어가 복사한 역할의 행동 시점은 아래 안내를 확인하세요. 마을주민·사냥꾼·무두장이는 밤에 행동하지 않습니다.</p>
      <h3>3. 낮의 토론과 투표</h3>
      <p>밤이 끝나면 현재 자기 카드를 다시 확인할 수 없습니다. 처음 받은 역할과 밤에 확인한 기록을 바탕으로 토론한 뒤 자신을 제외한 1명에게 비밀 투표하세요. 확정한 표는 바꿀 수 없습니다.</p>
      <p>2표 이상 받은 최다 득표자가 탈락하고, 동률이면 모두 탈락합니다. 모두 1표 이하이면 아무도 탈락하지 않습니다. 탈락한 사냥꾼이 지목한 사람도 함께 탈락합니다.</p>
      <p>실물 게임은 사망자부터 카드를 공개합니다. 여기서는 투표가 끝나면 탈락자와 모든 최종 카드를 결과 화면에 함께 공개합니다. 승패는 처음 역할이 아닌 최종 카드로 판정합니다.</p>
      <h3>4. 승리 조건</h3>
      <ul>
        <li><b>마을팀</b>: 늑대인간이 1명이라도 탈락하면 승리합니다. 늑대인간이 없고 아무도 탈락하지 않아도 승리합니다. 마을팀의 사망자가 있어도 됩니다.</li>
        <li><b>늑대팀</b>: 늑대인간이 있고, 늑대인간과 무두장이가 아무도 탈락하지 않으면 승리합니다. 하수인도 함께 승리합니다.</li>
        <li><b>하수인 단독</b>: 늑대인간이 없으면 하수인이 아닌 다른 사람이 탈락해야 합니다. 단, 무두장이가 탈락하면 무두장이 승리가 우선합니다.</li>
        <li><b>무두장이</b>: 자신이 탈락하면 승리합니다. 늑대인간도 함께 탈락하면 마을팀과 공동 승리하고, 늑대인간이 탈락하지 않았거나 없는 판이면 단독 승리합니다.</li>
      </ul>
      <h3>온라인 진행 안내</h3>
      <p>밤 단계는 정해진 시간에 자동으로 진행됩니다. 혼자인 늑대의 중앙 확인, 예언가·강도·말썽쟁이의 능력은 생략할 수 있습니다. 필수 도플갱어 복사·주정뱅이 교환은 시간 초과 시 자동 처리하고, 미투표는 기권입니다. 명시적으로 나가면 판이 취소되지만, 잠깐 연결이 끊기는 것은 복구할 수 있습니다.</p>
      <div className="wolf-role-guide">{WOLF_ROLES.map(r => <article key={r}><h3><span aria-hidden="true">{ROLE_COPY[r].symbol}</span> {ROLE_COPY[r].name}</h3><small>{ROLE_COPY[r].team}</small><p>{ROLE_COPY[r].description}</p></article>)}</div><button className="wolf-primary" onClick={closeHelp}>밤을 맞을 준비가 됐어요</button></dialog>}
  </main>;
}
