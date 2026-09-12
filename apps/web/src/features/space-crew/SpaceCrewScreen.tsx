import { useEffect, useRef, useState } from "react";
import { PROTOCOL_VERSION, type SpaceCrewAction, type SpaceCrewCard, type SpaceCrewClientCommand, type SpaceCrewProjection,
  type SpaceCrewStartCommand, type SpaceCrewStartPayload, type SpaceCrewResult } from "@hangul-rummikub/shared";
import type { SpaceCrewWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { CampaignPanel } from "./CampaignPanel.js";
import { getSpaceCrewMissionCopy } from "./mission-copy.js";
import { getSpaceCrewAvailableActions, getSpaceCrewActionPrompt } from "./selectors.js";
import { SpaceCrewAudio, readSpaceCrewAudioSettings, saveSpaceCrewAudioSettings, spaceCrewTransitionSound } from "./sound.js";
import "./space-crew.css";

type Props = Readonly<{ snapshot: SpaceCrewWebSnapshot; connected: boolean; pending: boolean; errorMessage: string | null; connectionLabel: string;
  pendingRequest: SpaceCrewStartCommand | SpaceCrewClientCommand | null; onRetryPending(): Promise<void>;
  onStartConfigured(payload: SpaceCrewStartPayload): Promise<void>; onCommand(command: SpaceCrewClientCommand): Promise<void>; onLeave(): void; onCopy(): void }>;
const SUITS = { PINK: "분홍", BLUE: "파랑", GREEN: "초록", YELLOW: "노랑", ROCKET: "로켓" } as const;
const SYMBOLS = { PINK: "✿", BLUE: "◆", GREEN: "▲", YELLOW: "●", ROCKET: "↑" } as const;
const MARKS = { HIGHEST: "이 색의 가장 높은 카드", LOWEST: "이 색의 가장 낮은 카드", ONLY: "이 색의 유일한 카드" } as const;
const ROLES = { FIRST_FOUR: "처음 네 트릭", MIDDLE: "중간 트릭", LAST: "마지막 트릭" } as const;
const REASONS: Record<SpaceCrewResult["reason"], string> = {
  OBJECTIVES_COMPLETE: "모든 임무 조건을 달성했습니다.", CREW_LEFT: "승무원이 방을 떠나 이번 시도가 중단되었습니다. 캠페인 기록은 보관됩니다.",
  WRONG_OWNER: "목표 카드를 담당 승무원이 획득하지 못했습니다.", TASK_ORDER: "목표 완료 순서를 지키지 못했습니다.",
  EXHAUSTED: "카드를 모두 진행했지만 남은 목표를 달성하지 못했습니다.", OBJECTIVE_NOT_MET: "정해진 임무 조건을 충족하지 못했습니다.",
  ROCKET_DID_NOT_WIN: "지정된 로켓이 트릭에서 이기지 못했습니다.", ROCKET_ORDER: "로켓 승리 순서를 지키지 못했습니다.",
  FORBIDDEN_WIN_VALUE: "이 미션에서 승리가 금지된 숫자로 트릭을 이겼습니다.", TOO_MANY_PLAYER_TRICKS: "지명된 승무원의 허용 승수를 넘었습니다.",
  UNEXPECTED_PLAYER_TRICK: "지명된 승무원이 허용되지 않은 트릭을 이겼습니다.", REQUIRED_WINNER_MISSED: "정해진 트릭을 담당 승무원이 이기지 못했습니다.",
  FORBIDDEN_PLAYER_ROCKET_WIN: "지명된 승무원이 로켓으로 트릭을 이겼습니다.", UNBALANCED_WINS: "승무원 간 트릭 승수 차이가 허용 범위를 넘었습니다.",
  WRONG_COLOR_CAPTURER: "분홍 카드를 지정된 담당자가 모두 모으지 못했습니다.", OMEGA_NOT_LAST_TRICK: "Ω 목표를 마지막 트릭에서 완료하지 못했습니다.",
};
function face(card: Pick<SpaceCrewCard, "suit" | "value">): string { return `${SUITS[card.suit]} ${card.value}`; }
function tokenLabel(token: SpaceCrewProjection["tasks"]["visibleTasks"][number]["token"]): string {
  return !token ? "" : token.kind === "LAST" ? "Ω 마지막" : token.kind === "RELATIVE" ? `${"›".repeat(token.position)} 상대 순서` : `${token.position}번째`;
}
function CardFace({ card }: { card: SpaceCrewCard }) {
  return <><span className="sc-card-corner"><b>{card.value}</b><i aria-hidden="true">{SYMBOLS[card.suit]}</i></span>
    <span className="sc-card-orbit" aria-hidden="true"><span>{SYMBOLS[card.suit]}</span></span><span className="sc-card-foot">{SUITS[card.suit]} <b>{card.value}</b></span></>;
}
function PublicCard({ card }: { card: SpaceCrewCard }) { return <div className={`sc-card sc-suit-${card.suit.toLowerCase()}`} aria-label={face(card)}><CardFace card={card} /></div>; }
function Guide() { return <details className="sc-guide"><summary>Game Guide · 게임 방법</summary><div className="sc-guide-grid">
  <section><h3>함께 완수하는 50개 미션</h3><p>개인 승자는 없습니다. 목표 카드를 맡은 승무원이 그 카드를 포함한 트릭을 이기고, 미션의 추가 조건을 지키면 모두 성공합니다. 로켓 4 소유자가 사령관이며 기본적으로 첫 목표를 고르고 첫 트릭을 시작합니다.</p><p>3~5인으로 진행합니다. 2인 변형과 심해판은 후속 예정입니다.</p></section>
  <section><h3>한 트릭의 진행</h3><p>첫 카드와 같은 색이 손에 있으면 반드시 그 색을 냅니다. 없다면 다른 색이나 로켓을 낼 수 있습니다. 로켓을 먼저 냈을 때도 같은 원칙입니다. 로켓이 있으면 가장 높은 로켓, 없으면 첫 색의 가장 높은 숫자가 이깁니다. 승자가 다음 트릭을 시작합니다.</p><p>3인은 13트릭을 진행하고 한 장이 남습니다. 완료한 트릭은 직전 한 트릭만 확인할 수 있습니다.</p></section>
  <section><h3>교신은 각자 한 번까지</h3><p>목표를 배분한 뒤 트릭 사이에, 손의 색 카드 하나를 공개합니다. 가장 높음·가장 낮음·유일함 중 사실인 표시만 고릅니다. 한 장뿐인 색은 ‘유일함’입니다. 로켓은 교신할 수 없습니다. 공개한 카드는 손패에 남아 있으며 냈다면 표시에서 사라집니다. 쓴 토큰은 되돌아오지 않습니다.</p><p>미션별 교신 금지·지연·표시 제한은 미션 패널에 안내합니다. 손패에 관한 추가 말이나 신호는 주고받지 않습니다.</p></section>
  <section><h3>목표 순서와 구조 신호</h3><p>숫자 토큰은 전체 목표의 완료 순번, 화살표는 화살표 목표들끼리의 상대 순서, Ω는 모든 목표 중 마지막을 뜻합니다. 같은 트릭의 목표도 토큰을 만족하는 완료 순서가 있으면 함께 달성할 수 있습니다. 미션 48의 Ω는 실제 마지막 트릭이어야 합니다.</p><p>첫 교신·첫 트릭 전, 모두 동의하면 같은 방향의 이웃에게 색 카드 한 장씩 동시에 보냅니다. 로켓은 보낼 수 없습니다. 구조 신호 사용은 해당 미션의 재도전에 유지되며 기록 점수에 한 번만 1을 더합니다. 다음 미션에서는 초기화됩니다.</p></section>
  <section><h3>다섯 명의 탐사</h3><p>표시가 있는 후반 미션에서는 첫 트릭 전에 목표 담당자가 자신의 목표 하나를 다른 승무원에게 넘길 수 있습니다. 방 전체에서 한 번만 가능합니다. 해당 미션에서만 양도 버튼이 나타납니다.</p></section>
  <section><h3>쉬었다 이어 하기</h3><p>턴 제한 시간과 자동 카드 제출은 없습니다. 연결이 끊겼다면 같은 자리로 돌아오세요. 방 나가기는 이번 시도를 중단합니다. 실패 뒤에는 같은 방에서 새 손패로 재도전합니다. 서버 재시작 뒤에는 복구 코드로 새 방에서 캠페인을 이어갑니다.</p></section>
</div></details>; }

export function SpaceCrewScreen(props: Props) {
  const { snapshot: snapshot } = props;
  const game = snapshot.game;
  const [settings, setSettings] = useState(readSpaceCrewAudioSettings);
  const audio = useRef<SpaceCrewAudio | null>(null);
  const previous = useRef<SpaceCrewProjection | null>(null);
  const [soundOpen, setSoundOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { audio.current = new SpaceCrewAudio(settings); return () => { audio.current?.dispose(); audio.current = null; }; }, []);
  useEffect(() => { audio.current?.configure(settings); saveSpaceCrewAudioSettings(settings); }, [settings]);
  useEffect(() => {
    if (!props.connected) { previous.current = null; return; }
    const cue = spaceCrewTransitionSound(previous.current, game);
    if (cue) audio.current?.play(cue);
    previous.current = game;
  }, [game, props.connected]);
  useEffect(() => { if (!props.pendingRequest) setMessage(null); }, [props.pendingRequest]);
  const unlock = () => { void audio.current?.unlock(); };
  const host = snapshot.room.players.find(player => player.playerId === snapshot.self.playerId)?.isHost === true;
  const blocked = !props.connected || props.pending || props.pendingRequest !== null;
  const canStart = !blocked && host && snapshot.room.players.length >= 3 && snapshot.room.players.length <= 5
    && snapshot.room.players.every(player => player.connectionStatus === "CONNECTED");
  return <main className="sc-shell" onPointerDownCapture={unlock} onKeyDownCapture={unlock}>
    <div className="sc-backdrop" aria-hidden="true" />
    <header className="sc-header"><div className="sc-brand"><span className="sc-emblem" aria-hidden="true">✦</span><div><span className="sc-eyebrow">DEEP SPACE · MISSION CONTROL</span><h1>스페이스 크루</h1></div></div>
      <div className="sc-header-controls"><span className={`sc-connection ${props.connected ? "is-online" : ""}`}>{props.connectionLabel}</span><button type="button" onClick={props.onCopy}>초대 · {snapshot.room.roomCode}</button><button type="button" aria-expanded={soundOpen} onClick={() => setSoundOpen(value => !value)}>소리 {settings.muted || settings.volume === 0 ? "꺼짐" : "켜짐"}</button><button type="button" onClick={props.onLeave} disabled={props.pending}>나가기</button></div>
    </header>
    {soundOpen && <section className="sc-sound-panel" aria-label="소리 설정"><label><input type="checkbox" checked={!settings.muted} onChange={event => setSettings(old => ({ ...old, muted: !event.target.checked }))} /> 효과음 사용</label><label>음량<input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={event => setSettings(old => ({ ...old, volume: Number(event.target.value) }))} /></label><button type="button" onClick={() => { void audio.current?.unlock().then(() => audio.current?.play("COMMUNICATION")); }}>소리 들어보기</button></section>}
    {(props.errorMessage || message) && <p className="sc-notice sc-error" role="alert">{props.errorMessage || message}</p>}
    {props.pendingRequest && <section className="sc-notice sc-pending" role="status"><p>제출한 요청의 결과를 확인하고 있습니다. 새 행동 전에 같은 요청을 다시 확인하세요.</p><button type="button" disabled={!props.connected || props.pending} onClick={() => { void props.onRetryPending().catch(() => setMessage("아직 결과를 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.")); }}>같은 요청 결과 재확인</button></section>}
    {game ? <CrewTable key={game.gameId} game={game} {...props} blocked={blocked} onSelect={() => audio.current?.play("SELECT")} /> : <section className="sc-lobby">
      <div className="sc-lobby-intro"><span className="sc-eyebrow">EXPLORATION LOG / 001—050</span><h2>한 장의 카드.<br /><em>우리 모두의 임무.</em></h2><p>서로의 손패는 모릅니다.<br />한 번의 교신, 그리고 함께 완수할 50개의 탐사.</p><div className="sc-specs"><span>3—5인</span><span>협동 트릭테이킹</span><span>시간 제한 없음</span></div></div>
      <div className="sc-launch-deck"><h2>승무원 탑승</h2><div className="sc-lobby-crew">{snapshot.room.players.map(player => <div key={player.playerId}><span className="sc-avatar">{player.nickname.slice(0, 1)}</span><strong>{player.nickname}</strong><small>{player.isHost ? "방장 · " : ""}{player.connectionStatus === "CONNECTED" ? "탑승 완료" : "재접속 대기"}</small></div>)}</div>
        <p className="sc-muted">{host ? canStart ? "모든 승무원이 준비됐습니다. 탐사 방식을 선택하세요." : "승무원 3~5명이 모두 접속하면 시작할 수 있습니다." : "방장이 캠페인 또는 연습 미션을 선택합니다."}</p>
        <CampaignPanel canStart={canStart} onStart={props.onStartConfigured} />
      </div>
    </section>}
    <Guide />
  </main>;
}

function actionLabel(action: SpaceCrewAction, game: SpaceCrewProjection, name: (id: string) => string): string {
  const task = (id: string | null) => { const card = game.tasks.visibleTasks.find(card => card.id === id); return card ? face(card) : "비공개 목표"; };
  switch (action.kind) {
    case "PLAY": return "카드 제출";
    case "COMMUNICATE": return action.mark ? MARKS[action.mark] : "관계 표시 없이 교신";
    case "SPECIAL_RESPOND": return action.answer === "GOOD" ? "좋음" : action.answer === "BAD" ? "나쁨" : action.answer ? "예" : "아니요";
    case "SPECIAL_SELECT": return `${name(action.playerId)} 지명`;
    case "SPECIAL_PREFERENCE": return `${ROLES[action.preference]} 희망`;
    case "SPECIAL_PROPOSE_ROLES": return `처음 네 트릭 ${name(action.firstFourPlayerId)} / 마지막 ${name(action.lastPlayerId)}`;
    case "SPECIAL_VOTE_ROLES": return action.accept ? "역할 배정에 동의" : "다시 제안하기";
    case "DISTRESS": switch (action.action.kind) {
      case "PROPOSE": return `${action.action.direction === "LEFT" ? "왼쪽" : "오른쪽"}으로 전달 제안`;
      case "VOTE": return action.action.accept ? "구조 신호에 동의" : "동의하지 않음";
      case "SKIP": return "카드 교환 없이 진행";
      case "SELECT": return "전달할 카드 확정";
    }
    case "TASK": switch (action.action.kind) {
      case "CHOOSE": return `${task(action.action.taskId)} 담당`;
      case "RESPOND": return action.action.answer ? "수행 가능" : "수행 불가";
      case "ASSIGN": return `${task(action.action.taskId)} → ${name(action.action.toPlayerId)}`;
      case "TRANSFER": return `${task(action.action.taskId)} → ${name(action.action.toPlayerId)} 양도`;
      case "SWAP_TOKENS": return `${task(action.action.firstTaskId)} ↔ ${task(action.action.secondTaskId)} 토큰 교환`;
      case "MOVE_TOKEN": return `${task(action.action.fromTaskId)} → ${task(action.action.toTaskId)} 토큰 이동`;
    }
  }
}
function ChoiceSelect({ label, actions, game, name, disabled, onAction }: { label: string; actions: readonly SpaceCrewAction[]; game: SpaceCrewProjection; name(id: string): string; disabled: boolean; onAction(action: SpaceCrewAction): void }) {
  const [selected, setSelected] = useState("");
  if (!actions.length) return null;
  const choice = actions.find(action => JSON.stringify(action) === selected) ?? actions[0];
  return <div className="sc-choice-select"><label>{label}<select disabled={disabled} value={JSON.stringify(choice)} onChange={event => setSelected(event.target.value)}>{actions.map(action => <option key={JSON.stringify(action)} value={JSON.stringify(action)}>{actionLabel(action, game, name)}</option>)}</select></label><button type="button" disabled={disabled || !choice} onClick={() => { if (choice) onAction(choice); }}>선택 확정</button></div>;
}
function CrewTable({ game, blocked, onSelect, ...props }: Props & { game: SpaceCrewProjection; blocked: boolean; onSelect(): void }) {
  const copy = getSpaceCrewMissionCopy(game.missionNumber);
  const players = props.snapshot.room.players;
  const name = (id: string) => players.find(player => player.playerId === id)?.nickname ?? "승무원";
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"PLAY" | "COMMUNICATE">("PLAY");
  const [mark, setMark] = useState<string>("");
  const [flight, setFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practice, setPractice] = useState(game.missionNumber);
  const actions = getSpaceCrewAvailableActions(game);
  const canCommunicate = actions.some(action => action.kind === "COMMUNICATE");
  useEffect(() => { if (!canCommunicate) setMode("PLAY"); }, [canCommunicate]);
  const disabled = blocked || flight;
  const distressSelection = game.distress.phase === "SELECTING";
  useEffect(() => { setSelected(null); setMark(""); setError(null); }, [game.gameRevision, game.attemptId]);
  useEffect(() => { if (game.phase === "FINISHED") setPractice(game.missionNumber); }, [game.phase, game.missionNumber]);
  const handActions = actions.filter(action => distressSelection ? action.kind === "DISTRESS" && action.action.kind === "SELECT" : action.kind === mode);
  const eligible = (cardId: string) => handActions.some(action => "cardId" in action ? action.cardId === cardId : action.kind === "DISTRESS" && action.action.kind === "SELECT" && action.action.cardId === cardId);
  const selectedActions = handActions.filter(action => "cardId" in action ? action.cardId === selected : action.kind === "DISTRESS" && action.action.kind === "SELECT" && action.action.cardId === selected);
  const choice = selectedActions.find(action => action.kind === "COMMUNICATE" && String(action.mark) === mark) ?? selectedActions[0];
  const selectedCard = game.privateState.hand.find(card => card.cardId === selected);
  async function send(command: SpaceCrewClientCommand) {
    if (disabled) return;
    setFlight(true); setError(null);
    try { await props.onCommand(command); setSelected(null); }
    catch { setError("요청 결과를 확인하지 못했습니다."); }
    finally { setFlight(false); }
  }
  function act(payload: SpaceCrewAction) { void send({ kind: "spaceCrew:act", protocolVersion: PROTOCOL_VERSION, requestId: createRequestId(), gameId: game.gameId, attemptId: game.attemptId, expectedGameRevision: game.gameRevision, payload }); }
  function progress(kind: "spaceCrew:retry" | "spaceCrew:next" | "spaceCrew:practiceMission") {
    const identity = { protocolVersion: PROTOCOL_VERSION, requestId: createRequestId(), gameId: game.gameId, attemptId: game.attemptId, expectedGameRevision: game.gameRevision } as const;
    void send(kind === "spaceCrew:practiceMission" ? { ...identity, kind, payload: { missionNumber: practice } } : { ...identity, kind, payload: {} });
  }
  const owner = players.find(player => player.playerId === props.snapshot.self.playerId)?.isHost === true;
  const allOnline = players.every(player => player.connectionStatus === "CONNECTED");
  const direct = actions.filter(action => action.kind === "SPECIAL_RESPOND" || action.kind === "SPECIAL_SELECT" || action.kind === "SPECIAL_PREFERENCE" || action.kind === "SPECIAL_VOTE_ROLES" || action.kind === "TASK" && action.action.kind === "RESPOND");
  const distressActions = actions.filter(action => action.kind === "DISTRESS" && action.action.kind !== "SELECT");
  const proposals = actions.filter(action => action.kind === "SPECIAL_PROPOSE_ROLES");
  const assignments = actions.filter(action => action.kind === "TASK" && action.action.kind === "ASSIGN");
  const transfers = actions.filter(action => action.kind === "TASK" && action.action.kind === "TRANSFER");
  const edits = actions.filter(action => action.kind === "TASK" && (action.action.kind === "SWAP_TOKENS" || action.action.kind === "MOVE_TOKEN"));
  const hand = [...game.privateState.hand].sort((a, b) => Object.keys(SUITS).indexOf(a.suit) - Object.keys(SUITS).indexOf(b.suit) || a.value - b.value);
  return <div className="sc-mission-layout">
    <section className="sc-mission-panel"><div className="sc-mission-number"><span>MISSION</span><strong>{String(game.missionNumber).padStart(2, "0")}</strong><small>/ 50</small></div><div className="sc-mission-copy"><span className="sc-eyebrow">{game.mode === "CAMPAIGN" ? "탐사 캠페인" : "미션 연습"} · 시도 {game.attemptNumber}</span><h2>{copy.title}</h2><p>{copy.objective}</p><details><summary>미션 세부 규칙</summary>{copy.setupNotes.map((note, index) => <p key={index}>{note}</p>)}<p>{copy.communicationNote}</p><p>{copy.completionNote}</p>{players.length === 5 && copy.fivePlayerTransfer && <p>5인 특칙: 첫 트릭 전에 목표 한 장을 다른 승무원에게 양도할 수 있습니다.</p>}</details></div><div className="sc-mission-progress"><span>완료한 미션</span><strong>{game.campaign.completedMissions.length}<small> / 50</small></strong><span>기록 점수 {game.campaign.recordedAttempts}{game.campaign.distressActive ? " · 구조 +1" : ""}</span></div></section>
    <div className="sc-crew-stations">{game.playerStates.map(player => {
      const communication = game.communications.find(entry => entry.playerId === player.playerId);
      const member = players.find(entry => entry.playerId === player.playerId);
      return <section className={`sc-station ${player.playerId === game.activePlayerId && game.phase !== "FINISHED" ? "is-active" : ""} ${player.playerId === props.snapshot.self.playerId ? "is-self" : ""}`} key={player.playerId}>
        <div className="sc-station-heading"><span className="sc-avatar">{name(player.playerId).slice(0, 1)}</span><strong>{name(player.playerId)}{player.playerId === props.snapshot.self.playerId && <small> 나</small>}</strong>{game.commanderId === player.playerId && <span className="sc-commander" title="사령관">★</span>}</div><div className="sc-station-meta"><span>손패 {player.handCount}장</span><span>{member?.connectionStatus === "CONNECTED" ? "연결됨" : "재접속 대기"}</span></div>
        <div className="sc-station-tasks">{game.tasks.visibleTasks.filter(task => task.ownerId === player.playerId).map(task => <span className={`sc-task-chip sc-suit-${task.suit.toLowerCase()} ${task.completed ? "is-complete" : ""}`} key={task.id}>{SYMBOLS[task.suit]} {task.value} {tokenLabel(task.token)}{task.completed ? " ✓" : ""}</span>)}</div>
        <div className={`sc-communication ${communication?.used ? "is-used" : ""}`}><span aria-hidden="true">◉</span>{communication?.card ? <span>{face(communication.card)} · {communication.mark ? MARKS[communication.mark] : "관계 표시 없음"}</span> : <span>{communication?.used ? "교신 사용 완료" : "교신 토큰 1개"}</span>}</div>
      </section>;
    })}</div>
    {game.phase === "FINISHED" && <section className={`sc-result ${game.result.outcome === "SUCCESS" ? "is-success" : "is-failure"}`} aria-label="미션 결과"><span className="sc-eyebrow">MISSION {game.missionNumber} · {game.result.outcome}</span><h2>{game.result.outcome === "SUCCESS" ? "모두의 임무, 완수!" : "다시, 함께 도전해요."}</h2><p>{REASONS[game.result.reason]}</p><p>목표 {game.tasks.visibleTasks.filter(task => task.completed).length} / {game.tasks.totalCount} 완료 · 실제 시도 {game.campaign.actualAttempts}회 · 기록 점수 {game.campaign.recordedAttempts}</p>{owner && <div className="sc-result-actions">{game.result.outcome === "FAILURE" && game.result.reason !== "CREW_LEFT" && <button className="sc-primary" type="button" disabled={disabled || !allOnline} onClick={() => progress("spaceCrew:retry")}>같은 미션 다시 도전</button>}{game.result.outcome === "SUCCESS" && game.mode === "CAMPAIGN" && game.missionNumber < 50 && <button className="sc-primary" type="button" disabled={disabled || !allOnline} onClick={() => progress("spaceCrew:next")}>미션 {game.missionNumber + 1}로 출항</button>}{game.mode === "PRACTICE" && game.result.reason !== "CREW_LEFT" && <><label>연습 미션<select value={practice} onChange={event => setPractice(Number(event.target.value))}>{Array.from({ length: 50 }, (_, index) => index + 1).map(number => <option value={number} key={number}>{number}. {getSpaceCrewMissionCopy(number).title}</option>)}</select></label><button type="button" disabled={disabled || !allOnline} onClick={() => progress("spaceCrew:practiceMission")}>선택한 미션 연습</button></>}</div>}{game.missionNumber === 50 && game.mode === "CAMPAIGN" && game.result.outcome === "SUCCESS" && <p>50개 미션의 탐사를 모두 마쳤습니다. 기록은 캠페인에 보관됩니다. 새 방에서 새로운 캠페인이나 미션 연습을 시작할 수 있습니다.</p>}{!owner && <p className="sc-muted">방장이 재도전 또는 다음 미션을 선택합니다.</p>}</section>}
    <div className="sc-table-grid"><section className="sc-trick-table"><div className="sc-section-heading"><h2>공용 트릭</h2><span>{game.completedTrickCount} / {game.totalTricks} 트릭 완료</span></div><div className="sc-trick-surface"><span className="sc-table-ring" aria-hidden="true" />{game.currentTrick.length ? game.currentTrick.map(play => <div className="sc-played" key={play.playerId}><span>{name(play.playerId)}</span><PublicCard card={play.card} /></div>) : <div className="sc-table-empty"><span aria-hidden="true">✧</span><p>{game.phase === "FINISHED" ? "이번 시도가 끝났습니다" : game.missionStatus === "SETUP" ? "출항 준비 중" : `${name(game.leaderId)} 승무원의 선도`}</p><small>{game.phase === "PLAYING" ? "각자 카드 한 장씩, 같은 색을 따라냅니다" : "함께 만든 탐사 기록"}</small></div>}</div>{game.lastTrick && <details className="sc-last-trick"><summary>직전 트릭 {game.lastTrick.number} · {name(game.lastTrick.winnerId)} 획득</summary><div>{game.lastTrick.plays.map(play => <span key={play.playerId} className={`sc-last-card sc-suit-${play.card.suit.toLowerCase()}`}>{name(play.playerId)} · {SYMBOLS[play.card.suit]} {face(play.card)}</span>)}</div></details>}</section>
      <aside className="sc-task-panel"><div className="sc-section-heading"><h2>임무 목표</h2><span>{game.tasks.totalCount}장</span></div>{game.tasks.totalCount === 0 && <p>이 미션은 목표 카드 대신 미션 조건을 달성합니다.</p>}<div className="sc-task-grid">{game.tasks.visibleTasks.map(task => { const action = actions.find(action => action.kind === "TASK" && action.action.kind === "CHOOSE" && action.action.taskId === task.id); return <button type="button" className={`sc-task-card sc-suit-${task.suit.toLowerCase()} ${task.completed ? "is-complete" : ""}`} key={task.id} disabled={disabled || !action} onClick={() => { if (action) act(action); }} aria-label={`${face(task)} ${tokenLabel(task.token)} ${task.completed ? "완료" : task.ownerId ? `${name(task.ownerId)} 담당` : "목표 선택"}`}><span>{tokenLabel(task.token) || "목표"}</span><strong>{SYMBOLS[task.suit]} {task.value}</strong><small>{task.completed ? "✓ 완료" : task.ownerId ? name(task.ownerId) : "담당 선택"}</small></button>; })}</div>{game.tasks.visibleTasks.length < game.tasks.totalCount && <p className="sc-muted">아직 공개되지 않은 목표 {game.tasks.totalCount - game.tasks.visibleTasks.length}장</p>}<ChoiceSelect label="목표 배분" actions={assignments} game={game} name={name} disabled={disabled} onAction={act} />{edits.length > 0 && <details><summary>순서 토큰 변경</summary><ChoiceSelect label="변경할 토큰" actions={edits} game={game} name={name} disabled={disabled} onAction={act} /></details>}{transfers.length > 0 && <details><summary>5인 특칙 · 목표 한 장 양도</summary><ChoiceSelect label="양도할 목표와 승무원" actions={transfers} game={game} name={name} disabled={disabled} onAction={act} /></details>}</aside></div>
    <SpecialStatus game={game} name={name} />
    {game.phase === "PLAYING" && <section className="sc-action-console"><div className="sc-action-prompt" role="status"><span className="sc-pulse" aria-hidden="true" /><strong>{getSpaceCrewActionPrompt(game)}</strong>{game.activePlayerId && game.missionStatus === "ACTIVE" && <span>{name(game.activePlayerId)} 차례</span>}</div>{direct.length > 0 && <div className="sc-action-buttons">{direct.map(action => <button type="button" key={JSON.stringify(action)} disabled={disabled} onClick={() => act(action)}>{actionLabel(action, game, name)}</button>)}</div>}<ChoiceSelect label="두 역할을 맡을 승무원" actions={proposals} game={game} name={name} disabled={disabled} onAction={act} />{distressActions.length > 0 && <details className="sc-distress" open={game.distress.phase === "VOTING"}><summary>구조 신호 {game.distress.active ? "· 활성화됨" : "· 첫 트릭 전 공동 결정"}</summary><p>모두 같은 방향으로 색 카드 한 장씩 전달합니다. 활성화하면 이 미션의 기록 점수에 1이 더해집니다.</p><div className="sc-action-buttons">{distressActions.map(action => <button type="button" key={JSON.stringify(action)} disabled={disabled} onClick={() => act(action)}>{actionLabel(action, game, name)}</button>)}</div></details>}</section>}
    <section className="sc-hand-panel"><div className="sc-section-heading"><h2>내 손패 <small>{hand.length}장</small></h2><span>나에게만 보입니다</span></div>{game.phase === "PLAYING" && !distressSelection && <div className="sc-hand-modes"><button type="button" aria-pressed={mode === "PLAY"} onClick={() => { setMode("PLAY"); setSelected(null); }}>카드 제출</button><button type="button" aria-pressed={mode === "COMMUNICATE"} disabled={!actions.some(action => action.kind === "COMMUNICATE")} onClick={() => { setMode("COMMUNICATE"); setSelected(null); }}>교신</button><span>{mode === "COMMUNICATE" ? copy.communicationNote : "밝게 표시된 카드를 낼 수 있습니다"}</span></div>}<div className="sc-hand">{hand.map(card => { const communication = game.communications.find(entry => entry.playerId === game.privateState.playerId && entry.card?.cardId === card.cardId); return <button type="button" key={card.cardId} className={`sc-card sc-suit-${card.suit.toLowerCase()} ${eligible(card.cardId) && !disabled ? "is-legal" : ""} ${selected === card.cardId ? "is-selected" : ""}`} disabled={disabled || !eligible(card.cardId)} aria-pressed={selected === card.cardId} aria-label={`${face(card)}${communication ? " 교신 중" : ""}${selected === card.cardId ? " 선택됨" : ""}`} onClick={() => { setSelected(card.cardId); setMark(""); onSelect(); }}><CardFace card={card} />{communication && <span className="sc-card-communication">◉ {communication.mark === "ONLY" ? "유일" : communication.mark === "HIGHEST" ? "최고" : communication.mark === "LOWEST" ? "최저" : "교신"}</span>}{game.privateState.pendingDistressCardId === card.cardId && <span className="sc-card-communication">전달 확정</span>}</button>; })}</div>{game.phase === "PLAYING" && <div className="sc-submit-bar"><div><span>{distressSelection ? "전달할 카드" : mode === "COMMUNICATE" ? "교신할 카드" : "제출할 카드"}</span><strong>{selectedCard ? face(selectedCard) : "손패에서 한 장 선택"}</strong></div>{mode === "COMMUNICATE" && !distressSelection && selectedActions.length > 0 && <label>교신 표시<select value={choice?.kind === "COMMUNICATE" ? String(choice.mark) : ""} onChange={event => setMark(event.target.value)}>{selectedActions.map(action => action.kind === "COMMUNICATE" && <option key={String(action.mark)} value={String(action.mark)}>{action.mark ? MARKS[action.mark] : "관계 표시 없음"}</option>)}</select></label>}<button type="button" className="sc-primary" disabled={disabled || !choice} onClick={() => { if (choice) act(choice); }}>{flight ? "확인 중…" : distressSelection ? "전달 카드 확정" : mode === "COMMUNICATE" ? "교신 확정" : "카드 제출"}</button></div>}{error && <p className="sc-notice sc-error" role="alert">{props.errorMessage || "요청 결과를 확인하지 못했습니다. 화면 상단에서 같은 요청을 다시 확인하거나 현재 상태를 확인해주세요."}</p>}</section>
    <details className="sc-campaign-record"><summary>탐사 기록 · 완료한 미션 {game.campaign.completedMissions.length}개 · 복구 정보</summary><div className="sc-completed-missions">{Array.from({ length: 50 }, (_, index) => index + 1).map(number => <span key={number} className={game.campaign.completedMissions.includes(number) ? "is-complete" : number === game.missionNumber ? "is-current" : ""} aria-label={`미션 ${number}${game.campaign.completedMissions.includes(number) ? " 완료" : ""}`}>{number}</span>)}</div><p>현재 미션 실제 시도 {game.campaign.actualAttempts}회 · 구조 신호 {game.campaign.distressActive ? "사용 중" : "미사용"}</p><CampaignPanel canStart={false} onStart={props.onStartConfigured} currentMission={game.missionNumber} campaignId={game.campaign.campaignId} /></details>
  </div>;
}
function SpecialStatus({ game, name }: { game: SpaceCrewProjection; name(id: string): string }) {
  const special = game.special;
  const responses = special.kind === "NO_TRICKS_PLAYER" || special.kind === "LIMITED_TRICKS_PLAYER" ? special.responses : [];
  const designated = special.kind !== "NONE" && special.kind !== "FINAL_ROLES" ? special.playerId : null;
  return <>{(responses.length > 0 || designated || special.kind === "FINAL_ROLES" || game.tasks.responses.length > 0 || game.distress.votes.length > 0 || game.distress.direction) && <section className="sc-shared-decisions" aria-label="공개된 미션 결정"><h3>승무원 결정</h3>{responses.map(response => <span key={response.playerId}>{name(response.playerId)} · {response.answer === "GOOD" ? "좋음" : response.answer === "BAD" ? "나쁨" : response.answer ? "예" : "아니요"}</span>)}{designated && <span>미션 지정 승무원 · {name(designated)}</span>}{special.kind === "PINK_COLLECTOR" && <span>최초 분홍 9 보유 · {name(special.initialPinkNineHolderId)}</span>}{game.tasks.responses.map(response => <span key={response.playerId}>{name(response.playerId)} · {response.answer ? "수행 가능" : "수행 불가"}</span>)}{special.kind === "FINAL_ROLES" && <>{special.preferences.map(preference => <span key={preference.playerId}>{name(preference.playerId)} · {ROLES[preference.preference]} 희망</span>)}{special.proposal && <p>처음 네 트릭: {name(special.proposal.firstFourPlayerId)} / 마지막 트릭: {name(special.proposal.lastPlayerId)} · 동의 {special.votes.length}/{game.playerStates.length}명</p>}</>}{game.distress.direction && <p>구조 신호 전달 방향: {game.distress.direction === "LEFT" ? "왼쪽" : "오른쪽"}</p>}{game.distress.votes.map(vote => <span key={`distress-${vote.playerId}`}>{name(vote.playerId)} · 구조 신호 {vote.accept ? "동의" : "반대"}</span>)}{game.distress.phase === "SELECTING" && <p>전달 카드 선택 {game.distress.selectedPlayerIds.length}/{game.playerStates.length}명 · 선택한 내용은 교환 전까지 비공개</p>}</section>}</>;
}
