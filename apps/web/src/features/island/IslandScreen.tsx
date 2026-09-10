import { useEffect, useRef, useState } from "react";
import { ISLAND_RESOURCES, emptyIslandResources, islandResourceCount, type IslandAction, type IslandClientCommand, type IslandResource, type IslandResources, type IslandPlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { IslandWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { IslandBoard, type IslandTarget } from "./IslandBoard.js";
import { IslandEmblem, ResourceArt, ISLAND_LABELS, ISLAND_COLORS } from "./art.js";
type Game = IslandPlayingPlatformSnapshotV2["game"];
type Mode = "ROAD" | "SETTLEMENT" | "CITY" | "TRADE" | "CARDS";
type Props = Readonly<{ snapshot: IslandWebSnapshot; connected: boolean; pending: boolean; error: string | null; connectionLabel: string;
  onCommand(command: IslandClientCommand): Promise<void>; onStart(): void; onLeave(): void; onCopy(): void }>;
const CARD_NAMES = { KNIGHT: "기사", VICTORY: "승점", ROADS: "도로 건설", PLENTY: "풍년", MONOPOLY: "독점" };
const CARD_TEXT = { KNIGHT: "도둑을 옮기고 자원 한 장을 가져옵니다.", VICTORY: "다른 사람에게 보이지 않는 승점 1점.", ROADS: "비용 없이 도로 두 개를 건설합니다.", PLENTY: "은행에서 원하는 자원 두 장을 받습니다.", MONOPOLY: "한 종류의 자원을 상대들에게 모두 받습니다." };
const RATES = { WOOD: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 };
const BUILD_COST: Record<"ROAD" | "SETTLEMENT" | "CITY", string> = { ROAD: "목재 1 + 벽돌 1", SETTLEMENT: "목재 1 + 벽돌 1 + 양모 1 + 곡물 1", CITY: "곡물 2 + 광석 3" };
export function islandStageLabel(game: Game, mine: boolean): string {
  switch (game.stage.kind) {
    case "SETUP_SETTLEMENT": return mine ? "첫 터를 골라보세요" : "마을을 배치하고 있습니다";
    case "SETUP_ROAD": return mine ? "마을에서 길을 이어주세요" : "시작 도로를 배치하고 있습니다";
    case "ROLL": return mine ? "주사위를 굴려주세요" : "주사위를 기다리고 있습니다";
    case "ACTION": return mine ? "거래하고, 섬을 넓혀보세요" : "거래에 참여할 수 있어요";
    case "DISCARD": return "자원을 버리는 중입니다";
    case "ROBBER_HEX": return mine ? "도둑을 옮길 지형을 골라주세요" : "도둑이 움직이고 있습니다";
    case "ROBBER_VICTIM": return mine ? "자원을 가져올 상대를 골라주세요" : "도둑의 대상을 고르는 중입니다";
    case "FREE_ROADS": return mine ? "무료 도로 " + game.stage.remaining + "개를 놓아주세요" : "도로 건설 카드를 사용하고 있습니다";
  }
}
export function islandTargets(game: Game, viewer: string, mode: Mode): IslandTarget[] {
  if (game.activePlayerId !== viewer) return [];
  const stage = game.stage.kind;
  if (stage === "ROBBER_HEX") return game.legalActions.robberHexes.map(id => ({ kind: "hex", id }));
  if (stage === "SETUP_SETTLEMENT") return game.legalActions.settlementVertices.map(id => ({ kind: "vertex", id }));
  if (stage === "SETUP_ROAD" || stage === "FREE_ROADS" || stage === "ACTION" && mode === "ROAD") return game.legalActions.roadEdges.map(id => ({ kind: "edge", id }));
  if (stage === "ACTION" && mode === "SETTLEMENT") return game.legalActions.settlementVertices.map(id => ({ kind: "vertex", id }));
  if (stage === "ACTION" && mode === "CITY") return game.legalActions.cityVertices.map(id => ({ kind: "vertex", id }));
  return [];
}
function ResourcePicker({ label, value, limit, onChange, disabled }: { label: string; value: IslandResources; limit: IslandResources; onChange(value: IslandResources): void; disabled: boolean }) {
  return <fieldset className="island-resource-picker" disabled={disabled}><legend>{label} <span>{islandResourceCount(value)}장</span></legend><div>{ISLAND_RESOURCES.map(r => <label key={r} className={"resource-" + r.toLowerCase()}><ResourceArt resource={r}/><span>{ISLAND_LABELS[r]}</span><input aria-label={label + " " + ISLAND_LABELS[r]} type="number" min="0" max={limit[r]} value={value[r]} onChange={e => onChange({ ...value, [r]: Math.max(0, Math.min(limit[r], Math.trunc(Number(e.target.value) || 0))) })}/></label>)}</div></fieldset>;
}
function ResourceSummary({ resources }: { resources: IslandResources }) {
  return <span className="island-resource-summary">{ISLAND_RESOURCES.filter(r => resources[r] > 0).map(r => <span key={r}><ResourceArt resource={r}/>{ISLAND_LABELS[r]} <b>{resources[r]}</b></span>)}</span>;
}
export function IslandScreen(props: Props) {
  const s = props.snapshot, game = s.game, playing = game?.phase === "PLAYING" ? game : null, self = s.self.playerId;
  const host = s.room.players.some(p => p.playerId === self && p.isHost), mine = playing?.activePlayerId === self;
  const [mode, setMode] = useState<Mode>("ROAD"), [selected, setSelected] = useState<IslandTarget | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [now, setNow] = useState<number>(s.serverTime);
  const [give, setGive] = useState(emptyIslandResources), [receive, setReceive] = useState(emptyIslandResources), [choice, setChoice] = useState(emptyIslandResources);
  const [offerOpen, setOfferOpen] = useState(false), [cardId, setCardId] = useState<string | null>(null), [monopoly, setMonopoly] = useState<IslandResource>("WOOD");
  const [bankGive, setBankGive] = useState<IslandResource>("WOOD"), [bankReceive, setBankReceive] = useState<IslandResource>("ORE");
  const busyRef = useRef(false);
  useEffect(() => { window.scrollTo(0, 0); }, [s.room.roomId]);
  useEffect(() => { const at = performance.now(); setNow(s.serverTime); const interval = window.setInterval(() => setNow(s.serverTime + performance.now() - at), 250); return () => window.clearInterval(interval); }, [s.serverTime]);
  useEffect(() => { setSelected(null); setCardId(null); setChoice(emptyIslandResources()); setOfferOpen(false); setError(null); }, [game?.gameId, playing?.turnId, playing?.stage.kind]);
  const enabled = props.connected && !props.pending && !busy && (!playing || now < playing.deadlineAt);
  const seconds = playing ? Math.max(0, Math.ceil((playing.deadlineAt - now) / 1000)) : 120;
  const targets = playing ? islandTargets(playing, self, mode) : [], validSelection = selected !== null && targets.some(t => t.id === selected.id && t.kind === selected.kind);
  const myState = game?.playerStates.find(p => p.playerId === self), name = (id: string) => s.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
  const ready = getGameStartControl(s, props.pending || !props.connected);
  const discard = playing?.stage.kind === "DISCARD" ? playing.stage.pending.find(p => p.playerId === self) : null;
  const selectedCard = game?.privateState.cards.find(c => c.id === cardId);
  const trading = playing?.stage.kind === "ACTION", trade = playing?.trade ?? null;
  const canCounter = !trade || trade.proposerId === self || mine || trade.proposerId === playing?.activePlayerId;
  const canRespond = trade !== null && trade.proposerId !== self && (mine || trade.proposerId === playing?.activePlayerId);
  const myResponse = trade?.responses.find(r => r.playerId === self);
  async function send(command: IslandClientCommand): Promise<boolean> {
    if (busyRef.current || !props.connected) return false;
    busyRef.current = true; setBusy(true); setError(null);
    try { await props.onCommand(command); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해주세요."); return false; }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function act(payload: IslandAction): Promise<boolean> {
    if (!playing || !enabled) return false;
    return send({ kind: "island:act", protocolVersion: 1, requestId: createRequestId(), gameId: playing.gameId, expectedGameRevision: playing.gameRevision, turnId: playing.turnId, payload });
  }
  function chooseMode(next: Mode) { setMode(next); setSelected(null); setCardId(null); }
  async function confirmPlacement() {
    if (!playing || !selected || !validSelection) return;
    const action: IslandAction = selected.kind === "hex" ? { type: "MOVE_ROBBER", hex: selected.id } : selected.kind === "edge" ? { type: "BUILD_ROAD", edge: selected.id } : playing.stage.kind === "ACTION" && mode === "CITY" ? { type: "BUILD_CITY", vertex: selected.id } : { type: "BUILD_SETTLEMENT", vertex: selected.id };
    if (await act(action)) setSelected(null);
  }
  async function playCard() {
    if (!selectedCard) return;
    let action: IslandAction;
    switch (selectedCard.kind) {
      case "VICTORY": return;
      case "KNIGHT": action = { type: "PLAY_KNIGHT", cardId: selectedCard.id }; break;
      case "ROADS": action = { type: "PLAY_ROADS", cardId: selectedCard.id }; break;
      case "PLENTY": action = { type: "PLAY_PLENTY", cardId: selectedCard.id, resources: choice }; break;
      case "MONOPOLY": action = { type: "PLAY_MONOPOLY", cardId: selectedCard.id, resource: monopoly }; break;
    }
    if (await act(action)) { setCardId(null); setChoice(emptyIslandResources()); }
  }
  return <main className="island-screen">
    <header className="island-header"><div className="island-brand"><span className="island-brand-mark" aria-hidden="true">⬡</span><div><span className="island-eyebrow">ISLAND SETTLERS</span><h1>섬 개척</h1></div></div><div className="island-room-tools"><span>{props.connectionLabel} · {s.room.roomCode}</span><button onClick={props.onCopy} type="button">초대 링크</button><button type="button" onClick={props.onLeave} disabled={props.pending}>나가기</button></div></header>
    {(error || props.error) && <p className="island-error" role="alert">{error || props.error}</p>}
    {!props.connected && <p className="island-error" role="status">연결을 복구하고 있습니다. 재접속하면 같은 패와 보드로 이어집니다. 차례의 2분은 계속 흐릅니다.</p>}
    {!game ? <div className="island-lobby">
      <section className="island-lobby-island"><span className="island-eyebrow">ONE ISLAND. MANY POSSIBILITIES.</span><h2>어디서 시작할까요?</h2><IslandEmblem/><p>자원을 모으고, 거래하고, 길을 이어가세요.<br/>나의 작은 마을이 섬의 중심이 됩니다.</p><div className="island-lobby-tags"><span>3–4명</span><span>목표 10점</span><span>차례당 2분</span></div></section>
      <section className="island-lobby-panel"><span className="island-eyebrow">READY TO SETTLE</span><h2>함께할 개척자들 <small>{s.room.players.length}/4</small></h2><div className="island-lobby-roster">{s.room.players.map((p, i) => <div key={p.playerId}><span className="island-avatar" style={{ background: ISLAND_COLORS[i % 4] }}>{p.nickname.slice(0, 1)}</span><div><b>{p.nickname}{p.playerId === self ? " · 나" : ""}</b><small>{p.isHost ? "방장 · " : ""}{p.connectionStatus === "CONNECTED" ? "접속 중" : "연결 기다리는 중"}</small></div></div>)}</div><p>{ready.guidance}</p>{host ? <button type="button" className="island-primary" disabled={!enabled || !ready.canStart} onClick={props.onStart}>섬 개척 시작하기 <span>→</span></button> : <p className="island-muted">방장이 시작하면 첫 마을을 배치합니다.</p>}<p className="island-lobby-policy">시간이 끝나면 남은 선택을 자동으로 처리합니다.<br/>잠시 끊겨도 같은 자리로 돌아올 수 있어요.</p></section>
    </div> : game.phase === "FINISHED" ? <section className="island-result"><span className="island-eyebrow">OUR ISLAND, OUR STORY</span><IslandEmblem/><h2>{game.result.reason === "CANCELLED" ? "이번 항해를 마칩니다" : name(game.result.winnerPlayerIds[0]!) + " 님의 섬이 되었어요!"}</h2><p>{game.result.reason === "CANCELLED" ? "참가자가 나가 이번 판이 취소되었습니다." : "숨겨진 승점을 포함한 최종 점수를 공개합니다."}</p><div className="island-result-scores">{[...game.result.scores].sort((a, b) => b.points - a.points).map(p => <article key={p.playerId} className={game.result.winnerPlayerIds.includes(p.playerId) ? "winner" : ""}><span>{name(p.playerId)}</span><strong>{p.points}<small>점</small></strong></article>)}</div>{host ? <button type="button" className="island-primary" disabled={!enabled} onClick={() => void send({ kind: "island:rematch", protocolVersion: 1, requestId: createRequestId(), gameId: game.gameId, expectedGameRevision: game.gameRevision, expectedRoomRevision: s.versions.roomRevision, payload: {} })}>같은 방에서 다시 시작하기</button> : <p>방장이 다음 판을 준비하고 있습니다.</p>}</section> :
    <>
      <section className="island-players" aria-label="개척자 현황">{game.playerStates.map((p, i) => {
        const me = p.playerId === self, active = p.playerId === game.activePlayerId;
        return <article key={p.playerId} className={"island-player" + (active ? " active" : "")} style={{ borderTopColor: ISLAND_COLORS[i % 4] }}><div className="island-player-top"><span className="island-avatar" style={{ background: ISLAND_COLORS[i % 4] }}>{name(p.playerId).slice(0, 1)}</span><b>{name(p.playerId)}{me ? " · 나" : ""}<small>{active ? "현재 차례" : s.room.players.find(r => r.playerId === p.playerId)?.connectionStatus === "OFFLINE" ? "재접속 대기" : "교역 가능"}</small></b><strong>{me ? game.privateState.totalPoints : p.publicPoints}<small>{me ? "내 점수" : "공개 점수"}</small></strong></div><div className="island-player-resources" aria-label={name(p.playerId) + " 자원 보유량"}>{ISLAND_RESOURCES.map(r => <div key={r} className={"island-player-resource resource-" + r.toLowerCase()} aria-label={ISLAND_LABELS[r] + " " + p.resources[r] + "장"}><ResourceArt resource={r}/><span>{ISLAND_LABELS[r]}</span><b>{p.resources[r]}</b></div>)}</div><div className="island-player-meta"><span>총 자원 <b>{p.resourceCount}</b></span><span>발전 <b>{p.developmentCount}</b></span><span>기사 <b>{p.knights}</b></span></div>{(game.longestRoadPlayerId === p.playerId || game.largestArmyPlayerId === p.playerId) && <div className="island-awards">{game.longestRoadPlayerId === p.playerId && <span>최장 도로 +2</span>}{game.largestArmyPlayerId === p.playerId && <span>최대 기사단 +2</span>}</div>}</article>;
      })}</section>
      <section className={"island-turn-banner" + (mine ? " mine" : "")}><div><span className="island-eyebrow">{game.turnNumber === 0 ? "INITIAL SETTLEMENTS" : "TURN " + game.turnNumber + " · " + name(game.activePlayerId)}</span><h2>{islandStageLabel(game, !!mine)}</h2></div><div className={"island-clock" + (seconds <= 20 ? " urgent" : "")} role="timer" aria-label={"남은 시간 " + seconds + "초"}><span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><small>남은 차례</small></div></section>
      <div className="island-game-layout">
        <div className="island-board-column">
          <IslandBoard game={game} targets={targets} selected={validSelection ? selected : null} onSelect={setSelected} enabled={enabled}/>
          <section className="island-hand" aria-label="내 자원"><div className="island-section-label"><h2>내 자원</h2><span>모든 참가자에게 공개됩니다</span></div><div className="island-resource-hand">{ISLAND_RESOURCES.map(r => <div className={"island-hand-card resource-" + r.toLowerCase()} key={r}><ResourceArt resource={r}/><div><span>{ISLAND_LABELS[r]}</span><strong>{game.privateState.resources[r]}</strong></div></div>)}</div><div className="island-supply"><span>남은 내 기물</span><span>도로 <b>{myState?.remainingRoads}</b></span><span>마을 <b>{myState?.remainingSettlements}</b></span><span>도시 <b>{myState?.remainingCities}</b></span></div></section>
        </div>
        <aside className="island-action-panel">
          <div className="island-action-heading"><span className="island-eyebrow">YOUR NEXT MOVE</span><h2>{mine ? "나의 다음 한 수" : "테이블에 함께하기"}</h2></div>
          {seconds === 0 && <p className="island-notice" role="status">서버가 남은 선택을 처리하고 있습니다.</p>}
          {game.stage.kind === "ROLL" && <div className="island-roll-panel"><div className="island-dice"><span>?</span><span>?</span></div><p>{mine ? "어떤 자원이 생산될까요?" : name(game.activePlayerId) + " 님이 주사위를 굴립니다."}</p><button type="button" className="island-primary" disabled={!enabled || !mine} onClick={() => void act({ type: "ROLL" })}>주사위 굴리기</button></div>}
          {game.dice && <div className="island-last-roll"><span>이번 주사위</span><div className="island-dice small"><span>{game.dice[0]}</span><span>{game.dice[1]}</span></div><b>{game.dice[0] + game.dice[1]}</b></div>}
          {game.stage.kind === "DISCARD" && (discard ? <div className="island-choice"><h3>자원 {discard.count}장을 골라주세요</h3><ResourcePicker label="버릴 자원" value={choice} limit={game.privateState.resources} onChange={setChoice} disabled={!enabled}/><button type="button" className="island-primary" disabled={!enabled || islandResourceCount(choice) !== discard.count} onClick={() => void act({ type: "DISCARD", resources: choice })}>{islandResourceCount(choice)} / {discard.count}장 · 버리기</button></div> : <p className="island-notice">기다리는 중 · {game.stage.pending.map(p => name(p.playerId)).join(", ")}</p>)}
          {game.stage.kind === "ROBBER_VICTIM" && <div className="island-choice"><h3>{mine ? "누구에게서 가져올까요?" : "상대를 고르는 중"}</h3>{game.stage.candidates.map(id => <button type="button" key={id} disabled={!enabled || !mine} onClick={() => void act({ type: "STEAL", playerId: id })}>{name(id)} · 무작위 자원 한 장</button>)}</div>}
          {(game.stage.kind === "ACTION" || game.stage.kind === "ROLL") && <div className="island-action-tabs" aria-label="행동 선택">
            {game.stage.kind === "ACTION" && mine && <>{(["ROAD", "SETTLEMENT", "CITY"] as const).map(m => <button type="button" key={m} aria-pressed={mode === m} onClick={() => chooseMode(m)}>{m === "ROAD" ? "도로" : m === "SETTLEMENT" ? "마을" : "도시"}</button>)}</>}
            {game.stage.kind === "ACTION" && <button type="button" aria-pressed={mode === "TRADE"} onClick={() => chooseMode("TRADE")}>거래{trade ? " · 1" : ""}</button>}
            <button type="button" aria-pressed={mode === "CARDS"} onClick={() => chooseMode("CARDS")}>발전 {game.privateState.cards.length}</button>
          </div>}
          {mine && (["SETUP_SETTLEMENT", "SETUP_ROAD", "FREE_ROADS", "ROBBER_HEX"].includes(game.stage.kind) || game.stage.kind === "ACTION" && ["ROAD", "SETTLEMENT", "CITY"].includes(mode)) && <div className="island-placement">
            <h3>{game.stage.kind === "ROBBER_HEX" ? "도둑 이동" : game.stage.kind === "SETUP_SETTLEMENT" ? "시작 마을" : game.stage.kind === "SETUP_ROAD" || game.stage.kind === "FREE_ROADS" ? "도로 놓기" : mode === "CITY" ? "도시로 발전" : mode === "SETTLEMENT" ? "마을 건설" : "도로 건설"}</h3>
            <p>{game.stage.kind === "ACTION" && mode !== "TRADE" && mode !== "CARDS" ? BUILD_COST[mode] : game.stage.kind === "ROBBER_HEX" ? "현재 지형을 제외한 곳으로 이동합니다." : "자원 비용 없이 배치합니다."}</p>
            <label className="island-location-select">건설·이동 위치<select value={validSelection ? selected!.kind + ":" + selected!.id : ""} disabled={!enabled || targets.length === 0} onChange={e => { const t = targets.find(t => t.kind + ":" + t.id === e.target.value); setSelected(t ?? null); }}><option value="">보드의 + 표시를 선택하세요</option>{targets.map(t => <option key={t.kind + t.id} value={t.kind + ":" + t.id}>{t.kind === "edge" ? "도로" : t.kind === "vertex" ? "교차점" : "지형"} {t.id + 1}</option>)}</select></label>
            {targets.length === 0 && <p className="island-notice">자원이 부족하거나 지금 건설할 수 있는 위치가 없습니다.</p>}
            <button type="button" className="island-primary" disabled={!enabled || !validSelection} onClick={() => void confirmPlacement()}>{validSelection ? "선택한 위치에 확정" : "위치를 선택해주세요"}</button>
          </div>}
          {trading && (mode === "TRADE" || !mine || trade !== null) && <section className="island-trade-panel"><div className="island-section-label"><h3>플레이어 교역</h3>{canCounter && <button type="button" className="island-link-button" disabled={!enabled} onClick={() => { setOfferOpen(!offerOpen); if (trade) { setGive(trade.proposerId === self ? { ...trade.give } : { ...trade.receive }); setReceive(trade.proposerId === self ? { ...trade.receive } : { ...trade.give }); } }}>{trade ? "조건 바꾸기" : "제안하기"}</button>}</div>
            {trade ? <div className="island-live-trade"><span className="island-eyebrow">{name(trade.proposerId)} 님의 제안</span><div><small>드릴게요</small><ResourceSummary resources={trade.give}/></div><div><small>받고 싶어요</small><ResourceSummary resources={trade.receive}/></div>
              {canRespond && <div className="island-response-buttons"><button type="button" className="island-primary" disabled={!enabled || myResponse?.accepted === true || ISLAND_RESOURCES.some(r => game.privateState.resources[r] < trade.receive[r])} onClick={() => void act({ type: "RESPOND_TRADE", tradeId: trade.id, accepted: true })}>{myResponse?.accepted ? "수락 의사 전달됨" : "거래할게요"}</button><button type="button" disabled={!enabled || myResponse?.accepted === false} onClick={() => void act({ type: "RESPOND_TRADE", tradeId: trade.id, accepted: false })}>이번엔 패스</button></div>}
              {trade.proposerId === self && <><div className="island-trade-responses">{trade.responses.map(r => <div key={r.playerId}><span>{name(r.playerId)} · {r.accepted ? "수락" : "거절"}</span>{r.accepted && <button type="button" disabled={!enabled} onClick={() => void act({ type: "CONFIRM_TRADE", tradeId: trade.id, playerId: r.playerId })}>이 사람과 확정</button>}</div>)}{trade.responses.length === 0 && <p>다른 사람들의 응답을 기다리고 있습니다.</p>}</div><button type="button" className="island-link-button" disabled={!enabled} onClick={() => void act({ type: "CANCEL_TRADE", tradeId: trade.id })}>제안 철회</button></>}
            </div> : <p className="island-muted">필요한 자원을 제안해보세요.<br/>{mine ? "다른 개척자들이 응답할 수 있어요." : "현재 차례인 " + name(game.activePlayerId) + " 님에게 제안합니다."}</p>}
            {offerOpen && canCounter && <div className="island-offer-builder"><ResourcePicker label="내가 줄 자원" value={give} limit={game.privateState.resources} onChange={setGive} disabled={!enabled}/><ResourcePicker label="받고 싶은 자원" value={receive} limit={RATES} onChange={setReceive} disabled={!enabled}/><button type="button" className="island-primary" disabled={!enabled || islandResourceCount(give) === 0 || islandResourceCount(receive) === 0 || ISLAND_RESOURCES.some(r => give[r] > 0 && receive[r] > 0 || give[r] > game.privateState.resources[r])} onClick={() => { void act({ type: "OFFER_TRADE", give, receive }).then(ok => { if (ok) setOfferOpen(false); }); }}>조건 제안하기</button><small>조건을 바꾸면 이전 수락은 취소됩니다.</small></div>}
            {mine && mode === "TRADE" && <div className="island-bank"><h3>은행 · 항구 교환</h3><div><label>줄 자원<select value={bankGive} onChange={e => { const r = ISLAND_RESOURCES.find(r => r === e.target.value); if (r) setBankGive(r); }}>{ISLAND_RESOURCES.map(r => <option key={r} value={r}>{ISLAND_LABELS[r]} {game.legalActions.bankRates[r]}장</option>)}</select></label><span>→</span><label>받을 자원<select value={bankReceive} onChange={e => { const r = ISLAND_RESOURCES.find(r => r === e.target.value); if (r) setBankReceive(r); }}>{ISLAND_RESOURCES.map(r => <option key={r} value={r}>{ISLAND_LABELS[r]} 1장 · 재고 {game.bank[r]}</option>)}</select></label></div><button type="button" disabled={!enabled || bankGive === bankReceive || game.privateState.resources[bankGive] < game.legalActions.bankRates[bankGive] || game.bank[bankReceive] === 0} onClick={() => void act({ type: "BANK_TRADE", give: bankGive, receive: bankReceive })}>{game.legalActions.bankRates[bankGive]} : 1 교환</button></div>}
          </section>}
          {mode === "CARDS" && <section className="island-development"><h3>내 발전 카드</h3>{game.privateState.cards.length === 0 && <p className="island-muted">아직 발전 카드가 없습니다.</p>}<div className="island-development-cards">{game.privateState.cards.map(c => <button type="button" className={"island-dev-card " + c.kind.toLowerCase()} key={c.id} disabled={!enabled || !c.playable} aria-pressed={cardId === c.id} onClick={() => { setCardId(cardId === c.id ? null : c.id); setChoice(emptyIslandResources()); }}><span aria-hidden="true">{c.kind === "KNIGHT" ? "♞" : c.kind === "VICTORY" ? "★" : c.kind === "ROADS" ? "⌁" : c.kind === "PLENTY" ? "✦" : "◆"}</span><b>{CARD_NAMES[c.kind]}</b><small>{c.kind === "VICTORY" ? "숨은 승점 +1" : c.playable ? "사용 가능" : "사용 대기"}</small></button>)}</div>
            {selectedCard && selectedCard.playable && <div className="island-card-choice"><h3>{CARD_NAMES[selectedCard.kind]}</h3><p>{CARD_TEXT[selectedCard.kind]}</p>{selectedCard.kind === "PLENTY" && <ResourcePicker label="가져올 자원" value={choice} limit={game.bank} onChange={setChoice} disabled={!enabled}/>}
              {selectedCard.kind === "MONOPOLY" && <label className="island-location-select">독점할 자원<select value={monopoly} onChange={e => { const r = ISLAND_RESOURCES.find(r => r === e.target.value); if (r) setMonopoly(r); }}>{ISLAND_RESOURCES.map(r => <option key={r} value={r}>{ISLAND_LABELS[r]}</option>)}</select></label>}
              <button type="button" className="island-primary" disabled={!enabled || selectedCard.kind === "PLENTY" && islandResourceCount(choice) !== Math.min(2, islandResourceCount(game.bank))} onClick={() => void playCard()}>카드 사용 확정</button><button type="button" className="island-link-button" onClick={() => setCardId(null)}>닫기</button>
            </div>}
            <div className="island-buy-card"><p>양모 1 + 곡물 1 + 광석 1</p><button type="button" disabled={!enabled || !game.legalActions.canBuyCard} onClick={() => void act({ type: "BUY_CARD" })}>발전 카드 구입 · {game.developmentCount}장 남음</button><small>산 차례에는 사용할 수 없습니다.<br/>행동 카드는 차례당 1장, 승점은 자동 반영됩니다.</small></div>
          </section>}
          {game.stage.kind === "ACTION" && mine && <button type="button" className="island-end-turn" disabled={!enabled} onClick={() => void act({ type: "END_TURN" })}>차례 마치기 <span>→</span></button>}
          <details className="island-bank-inventory"><summary>은행에 남은 자원</summary><ResourceSummary resources={game.bank}/></details>
        </aside>
      </div>
      <section className="island-history"><div className="island-section-label"><h2>섬의 기록</h2><span>가장 최근 행동</span></div><ol aria-live="polite">{game.log.slice(-5).reverse().map((entry, i) => <li key={entry.revision + ":" + i}><span className={entry.automatic ? "auto" : ""}>{entry.automatic ? "자동 진행" : entry.playerId ? name(entry.playerId) : "시작"}</span>{entry.text}</li>)}</ol></section>
    </>}
    <details className="island-help"><summary>게임 방법과 건설 비용</summary><div><ol><li>마을과 도로를 두 쌍 배치합니다. 두 번째 마을 주변 자원을 받고 시작합니다.</li><li>주사위 숫자에 맞는 지형에서 마을은 1장, 도시는 2장을 받습니다. 도둑이 있는 지형은 생산하지 않습니다.</li><li>현재 차례 플레이어와 자원을 교환하거나 은행·항구를 이용하세요. 거래와 건설을 자유롭게 섞을 수 있습니다.</li><li>마을끼리는 한 칸을 띄워야 합니다. 도로를 잇고 마을을 도시로 발전시켜 승점을 모으세요.</li><li>7이 나오면 자원 8장 이상인 사람은 절반을 버립니다. 도둑을 옮겨 인접 상대에게서 무작위 자원 한 장을 가져옵니다.</li><li>최장 도로(5개 이상)·최대 기사단(기사 3장 이상)은 각각 2점. 자기 차례에 숨은 승점을 포함해 10점이면 승리합니다.</li></ol><div><h3>건설 비용</h3><p>도로 · 목재1 + 벽돌1<br/>마을 · 목재1 + 벽돌1 + 양모1 + 곡물1<br/>도시 · 곡물2 + 광석3<br/>발전 카드 · 양모1 + 곡물1 + 광석1</p><h3>온라인 진행</h3><p>모든 참가자의 자원 종류별 수량이 공개됩니다. 발전 카드 앞면과 숨은 승점은 본인에게만 보입니다.</p><p>차례마다 2분입니다. 시간이 끝나면 초기 배치, 자원 버리기, 도둑과 무료 도로를 자동 처리하고 다음 차례로 넘깁니다. 주사위 전에도 발전 카드를 사용할 수 있어요.</p><p>새로고침과 재접속은 같은 자리로 돌아옵니다. 나가기 버튼은 모두의 판을 취소합니다. 서버 재시작 시 진행 중인 판은 복구되지 않습니다.</p></div></div></details>
  </main>;
}
