import type {
  CityBuildingCardId,
  CityRoleActionProjectionV2,
  CityRoleId,
  CityRolePlayingPlatformSnapshotV2,
  PlayerId,
} from "@hangul-rummikub/shared";
import { useEffect, useMemo, useState } from "react";
import { calculateServerClockOffset, calculateTurnCountdown, formatCountdownMmSs } from "../../lib/turn-countdown.js";
import {
  CITY_ROLE_HELP, cityBuildLimit, cityBuildPreview,
  cityCardLabel, cityCurrentHint, cityDestroyPreview, cityRoleLabel,
  cityRoleOrder, cityTargetRoleOptions,
  type CityActionFeedback, type CityActionIntent, type CityUiCard,
} from "./city-role-ui.js";
import { cityLandmarkText } from "./city-landmarks.js";
import { CityTemplateArt } from "./CityTemplateArt.js";
import { CityGameHelp } from "./CityGameHelp.js";
import { useCitySound } from "./city-role-sound.js";
import { CityCategoryBadge, CityCategoryGuide, CityIcon, CityRoleEmblem, CitySkyline } from "./CityVisuals.js";

export type CityRolePlayingScreenProps = Readonly<{
  snapshot: CityRolePlayingPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  actionPending: boolean;
  retryPending: boolean;
  actionFeedback: CityActionFeedback | null;
  selectionResetGeneration: number;
  roomLeavePending: boolean;
  canAct: boolean;
  onAction: (intent: CityActionIntent) => void;
  onRetry: () => void;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function CityBuildingFace({ card, rulesVersion = "city-rules-v1" }: Readonly<{ card: CityUiCard; rulesVersion?: string }>) {
  const effect = cityLandmarkText(rulesVersion, card.templateId);
  return <>
    <CityCategoryBadge category={card.category} /><CityTemplateArt category={card.category} templateId={card.templateId} />
    <strong className="city-building-name">{card.name}</strong>
    <span className="city-building-value"><CityIcon name="coin" />금화 <b>{card.cost}</b><span>· {card.victoryPoints}점</span></span>
    {effect ? <span className="city-landmark-effect" title={effect.detail}><strong>★ 특수 능력</strong>{effect.short}</span> : null}
  </>;
}

function CityRoleFace({ roleId }: Readonly<{ roleId: CityRoleId }>) {
  const role = CITY_ROLE_HELP[roleId];
  return <>
    <CityRoleEmblem roleId={roleId} /><span className="city-role-order">등장 순서 {cityRoleOrder(roleId)}</span>
    <strong>{role.name}</strong><span>{role.summary}</span>
  </>;
}

/** These are local choices only. The caller submits one concrete CITY command. */
function CityRoleAbility({ game, selfId, nickname, locked, onAction }: Readonly<{
  game: CityRoleActionProjectionV2;
  selfId: PlayerId;
  nickname: (id: PlayerId) => string;
  locked: boolean;
  onAction: (intent: CityActionIntent) => void;
}>) {
  const [targetRole, setTargetRole] = useState<CityRoleId | null>(null);
  const [exchangeMode, setExchangeMode] = useState<"HANDS" | "CARDS">("HANDS");
  const [targetPlayer, setTargetPlayer] = useState<PlayerId | null>(null);
  const [replacementIds, setReplacementIds] = useState<readonly CityBuildingCardId[]>([]);
  const [destruction, setDestruction] = useState<Readonly<{ playerId: PlayerId; cardId: CityBuildingCardId }> | null>(null);
  const roleId = game.window.activeRoleId;
  const action = game.privateState.action;
  if (game.window.activePlayerId !== selfId || action === undefined) return null;
  const disabled = locked || action.acquisition !== "COMPLETE" || action.abilityUsed;
  const status = action.abilityUsed ? "능력 사용 완료" : action.acquisition !== "COMPLETE" ? "기본 획득을 마친 뒤 사용할 수 있습니다." : "원한다면 한 번 사용할 수 있습니다.";
  const targets = game.playerStates.filter(player => player.playerId !== selfId && !player.forfeited);

  if (roleId === "CR-01" || roleId === "CR-02") return <section className="city-ability" aria-label={`${CITY_ROLE_HELP[roleId].name} 능력`}>
    <h3>{CITY_ROLE_HELP[roleId].name} · 비밀 역할 지목</h3>
    <p>{CITY_ROLE_HELP[roleId].detail}</p><p className="city-helper">{status} 표적은 나에게만 보입니다.</p>
    <div className="city-target-roles">{cityTargetRoleOptions(roleId).map(candidate => <button key={candidate} type="button" className={`city-choice${targetRole === candidate ? " is-selected" : ""}`}
      aria-pressed={targetRole === candidate} disabled={disabled} onClick={() => setTargetRole(candidate)}>{cityRoleLabel(candidate)}</button>)}</div>
    <button type="button" className="secondary-button" disabled={disabled || targetRole === null} onClick={() => {
      if (disabled || targetRole === null) return;
      onAction({ kind: "city:useRoleAbility", payload: { ability: roleId === "CR-01" ? "MARK_ROLE_DISABLED" : "MARK_ROLE_GOLD_TRANSFER", targetRoleId: targetRole } });
    }}>선택한 역할 지목</button>
  </section>;

  if (roleId === "CR-03") return <section className="city-ability" aria-label="교환꾼 능력">
    <h3>교환꾼 · 손패 바꾸기</h3><p className="city-helper">{status} 두 방법 중 하나만 사용할 수 있습니다.</p>
    <div className="city-ability-choices"><button type="button" className="city-choice" aria-pressed={exchangeMode === "HANDS"} disabled={disabled} onClick={() => setExchangeMode("HANDS")}><CityIcon name="exchange" />손패 전체 교환</button>
      <button type="button" className="city-choice" aria-pressed={exchangeMode === "CARDS"} disabled={disabled} onClick={() => setExchangeMode("CARDS")}><CityIcon name="cards" />내 카드 교체</button></div>
    {exchangeMode === "HANDS" ? <>
      <p>다른 참가자와 손패 전체를 교환합니다. 금화와 도시는 유지됩니다.</p>
      <div className="city-target-roles">{targets.map(player => <button type="button" className="city-choice" key={player.playerId} aria-pressed={targetPlayer === player.playerId} disabled={disabled} onClick={() => setTargetPlayer(player.playerId)}>{nickname(player.playerId)} · 손패 {player.handCount}장</button>)}</div>
      <button type="button" className="secondary-button" disabled={disabled || targetPlayer === null} onClick={() => {
        if (disabled || targetPlayer === null) return;
        onAction({ kind: "city:useRoleAbility", payload: { ability: "EXCHANGE_HANDS", targetPlayerId: targetPlayer } });
      }}>손패 교환하기</button>
    </> : <>
      <p>교체할 내 카드를 1장 이상 고르세요. 선택한 카드를 버린 뒤 같은 수만큼 뽑습니다.</p>
      <div className="city-card-grid">{game.privateState.hand.map(card => <button type="button" className={`city-building city-selectable${replacementIds.includes(card.cardId) ? " is-selected" : ""}`} key={card.cardId}
        aria-label={`${cityCardLabel(card)}, 교체 선택`} aria-pressed={replacementIds.includes(card.cardId)} disabled={disabled} onClick={() => setReplacementIds(ids => ids.includes(card.cardId) ? ids.filter(id => id !== card.cardId) : [...ids, card.cardId])}>
        <CityBuildingFace card={card} rulesVersion={game.rulesVersion} /><span>{replacementIds.includes(card.cardId) ? "✓ 교체할 카드" : "교체하려면 선택"}</span>
      </button>)}</div>
      <button type="button" className="secondary-button" disabled={disabled || replacementIds.length === 0} onClick={() => {
        if (disabled || replacementIds.length === 0) return;
        onAction({ kind: "city:useRoleAbility", payload: { ability: "REPLACE_OWN_CARDS", cardIds: [...replacementIds] } });
      }}>{replacementIds.length}장 교체하기</button>
    </>}
  </section>;

  if (roleId === "CR-08") {
    const target = game.playerStates.find(player => player.playerId === destruction?.playerId);
    const card = target?.builtBuildings.find(building => building.cardId === destruction?.cardId);
    const preview = target !== undefined && card !== undefined ? cityDestroyPreview(game, selfId, target, card) : null;
    return <section className="city-ability" aria-label="해체꾼 능력"><h3>해체꾼 · 건물 파괴</h3><p>{CITY_ROLE_HELP[roleId].detail}</p><p className="city-helper">{status}</p>
      {game.playerStates.filter(player => player.playerId !== selfId).map(player => <section className="city-destruction-target" key={player.playerId}><h4>{nickname(player.playerId)}의 도시</h4>
        {player.builtBuildings.length === 0 ? <p className="city-helper">파괴할 건물이 없습니다.</p> : <div className="city-card-grid">{player.builtBuildings.map(building => {
          const available = cityDestroyPreview(game, selfId, player, building);
          const selected = destruction?.playerId === player.playerId && destruction.cardId === building.cardId;
          return <button type="button" className={`city-building city-selectable${selected ? " is-selected" : ""}`} key={building.cardId} disabled={disabled || !available.allowed}
            aria-label={`${nickname(player.playerId)}의 ${cityCardLabel(building)}, ${available.message}`} aria-pressed={selected} onClick={() => setDestruction({ playerId: player.playerId, cardId: building.cardId })}>
            <CityBuildingFace card={building} rulesVersion={game.rulesVersion} /><span className="city-card-hint">{available.message}</span>
          </button>;
        })}</div>}
      </section>)}
      <button type="button" className="secondary-button" disabled={disabled || preview?.allowed !== true} onClick={() => {
        if (disabled || destruction === null || preview?.allowed !== true) return;
        onAction({ kind: "city:useRoleAbility", payload: { ability: "DESTROY_BUILDING", targetPlayerId: destruction.playerId, cardId: destruction.cardId } });
      }}>{preview === null ? "파괴할 건물을 선택하세요" : `금화 ${preview.cost} 내고 파괴`}</button>
    </section>;
  }

  return <section className="city-ability city-entry-effect" aria-label={`${CITY_ROLE_HELP[roleId].name} 시작 효과`}>
    <h3>{CITY_ROLE_HELP[roleId].name} · 자동 효과</h3><p>{CITY_ROLE_HELP[roleId].detail}</p><p className="city-helper">시작 효과는 서버가 반영했습니다. 따로 누를 버튼은 없습니다.</p>
  </section>;
}

export function CityRolePlayingScreen(props: CityRolePlayingScreenProps) {
  const { room, game, self } = props.snapshot;
  const [selectedCardId, setSelectedCardId] = useState<CityBuildingCardId | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const clockAnchor = useMemo(() => {
    const receivedAt = Date.now();
    return { receivedAt, offset: calculateServerClockOffset(props.snapshot.serverTime, receivedAt) };
  }, [props.snapshot.serverTime, game.window.actionId]);
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { setSelectedCardId(null); }, [game.gameId, game.gameRevision, game.window.actionId, props.selectionResetGeneration, props.sessionReplaced]);
  const sound = useCitySound(props.snapshot, props.actionFeedback, props.sessionReplaced);
  const countdown = calculateTurnCountdown(game.window.deadlineAt, clockAnchor.offset, Math.max(now, clockAnchor.receivedAt));
  const nickname = (id: PlayerId) => room.players.find(player => player.playerId === id)?.nickname ?? "참가자";
  const player = game.playerStates.find(candidate => candidate.playerId === self.playerId);
  const myTurn = game.window.activePlayerId === self.playerId;
  const locked = !props.canAct || !myTurn || player?.forfeited !== false || props.sessionReplaced || props.actionPending || props.retryPending || props.roomLeavePending || countdown.expired;
  const selectedCard = game.privateState.hand.find(card => card.cardId === selectedCardId) ?? null;
  const buildPreview = selectedCard === null ? null : cityBuildPreview(game, self.playerId, selectedCard);
  const action = game.phase === "ROLE_ACTION" ? game.privateState.action : undefined;
  const pendingCards = game.phase === "ROLE_ACTION" ? game.privateState.pendingCards : undefined;
  const uiIdentity = `${game.gameId}:${game.gameRevision}:${game.window.actionId}:${props.selectionResetGeneration}:${props.sessionReplaced}`;
  const remainingRoles = Math.max(0, game.rolesPerPlayer - game.privateState.selectedRoleIds.length);

  return <main className="app-shell city-shell city-playing-shell">
    <header className="city-header"><CitySkyline /><div className="city-header-title"><CityIcon name="civic" /><div><p className="eyebrow">비밀 도시 게임 · ROOM {room.roomCode}</p><h1>내 역할로, 함께 만드는 도시.</h1></div></div>
      <div className="city-header-actions"><span className={`connection-chip ${props.connectionTone}`}>{props.connectionLabel}</span><CityGameHelp placement="PLAYING" rulesVersion={game.rulesVersion} />
        <button type="button" className="text-button" aria-pressed={sound.enabled} onClick={sound.toggle}>사운드 {sound.enabled ? "켜짐" : "꺼짐"}</button>
        {!props.sessionReplaced ? <button type="button" className="text-button" disabled={props.roomLeavePending || props.actionPending || props.retryPending} onClick={props.onLeaveRoom}>{props.roomLeavePending ? "나가는 중…" : "방 나가기"}</button> : null}
      </div>
    </header>
    {props.sessionReplaced ? <section className="notice replaced-notice" role="alert"><p>다른 창에서 연결되었습니다. 이 창에서는 행동을 보낼 수 없습니다.</p><button type="button" className="text-button" onClick={props.onGoHome}>홈으로 돌아가기</button></section> : null}
    {props.errorMessage !== null ? <p className="notice error-notice" role="alert">{props.errorMessage}</p> : null}
    {props.retryPending ? <section className="notice" role="status"><p>이전 행동의 결과를 확인하고 있습니다. 다시 누르면 같은 요청을 확인합니다.</p><button type="button" className="secondary-button" disabled={props.connectionTone !== "connected" || props.actionPending || props.sessionReplaced || props.roomLeavePending} onClick={props.onRetry}>행동 결과 다시 확인</button></section> : null}
    <div className="city-overview">
    <section className={`city-turn-hud${myTurn ? " is-mine" : ""}${countdown.remainingSeconds <= 10 ? " is-urgent" : ""}`} aria-label="현재 라운드와 차례"><CityIcon name="hourglass" className="city-turn-hourglass" />
      <div><p className="city-turn-phase">라운드 {game.roundNumber} · {game.phase === "ROLE_SELECTION" ? "비밀 역할 선택" : cityRoleLabel(game.window.activeRoleId)}</p>
        <h2>{myTurn ? game.phase === "ROLE_SELECTION" ? "내 역할을 고를 차례입니다" : "내 차례입니다" : `${nickname(game.window.activePlayerId)}님의 ${game.phase === "ROLE_SELECTION" ? "역할 선택" : "차례입니다"}`}</h2>
        <p className="city-turn-hint">{cityCurrentHint(game, self.playerId)}</p></div>
      <div className="city-countdown"><span>{game.phase === "ROLE_SELECTION" ? "선택 시간" : "행동 시간"}</span><strong role="timer" aria-label={`남은 시간 ${countdown.remainingSeconds}초`}>{formatCountdownMmSs(countdown.remainingSeconds)}</strong><progress aria-label="남은 시간 비율" value={countdown.remainingSeconds} max={game.phase === "ROLE_SELECTION" ? 45 : 90} /></div>
    </section>
    <section className="city-private-summary" aria-label="내 비공개 역할과 금화"><div><span className="city-private-badge">나에게만 보이는 역할</span><strong>내 역할 {game.privateState.selectedRoleIds.length}/{game.rolesPerPlayer}</strong>
      <div className="city-role-chips">{game.privateState.selectedRoleIds.length === 0 ? <span>아직 선택하지 않았습니다.</span> : game.privateState.selectedRoleIds.map(role => <span key={role} className={`city-role-chip${game.phase === "ROLE_ACTION" && game.window.activeRoleId === role ? " is-current" : ""}`}><CityRoleEmblem roleId={role} /><span>{cityRoleLabel(role)}</span></span>)}</div></div>
      <div className="city-my-gold"><span>내 금화</span><strong>{player?.gold ?? 0}</strong><span>손패 {game.privateState.hand.length}장 · 도시 {player?.builtBuildings.length ?? 0}/8</span></div>
    </section>

    </div>
    {game.firstCompletion !== null ? <p className="city-final-round" role="status">마지막 라운드 진행 중 · {nickname(game.firstCompletion.playerId)}님이 도시를 완성했습니다. 남은 역할의 차례까지 진행합니다.</p> : null}
    {countdown.expired ? <p className="city-helper" role="status">서버에서 시간 종료 결과를 확인하고 있습니다.</p> : null}
    {props.actionFeedback !== null ? <p className="city-action-feedback" role="status">{props.actionFeedback.message}</p> : null}
    <div className="city-action-layout"><div>
    {game.phase === "ROLE_SELECTION" ? <section className="city-panel city-selection" aria-labelledby="city-selection-heading"><div className="city-panel-heading"><div><h2 id="city-selection-heading">이번 라운드의 비밀 역할</h2><p>{game.rolesPerPlayer === 2 ? "2~3인 게임에서는 한 라운드에 역할 2개를 고릅니다." : "이번 라운드에는 역할 1개를 고릅니다."} 내 선택 {remainingRoles}개 남음</p></div></div>
      {game.privateState.availableRoleIds !== undefined ? <><p className="city-helper">아래 카드 하나를 누르면 역할이 선택됩니다. 다른 참가자에게는 보이지 않습니다.</p><div className="city-role-grid">{game.privateState.availableRoleIds.map(roleId => <button type="button" className="city-role-card" key={roleId} disabled={locked} aria-label={`${cityRoleLabel(roleId)}, ${CITY_ROLE_HELP[roleId].summary} 역할 선택`} onClick={() => { if (!locked) props.onAction({ kind: "city:selectRole", payload: { roleId } }); }}><CityRoleFace roleId={roleId} /><span className="city-card-cta">이 역할 선택</span></button>)}</div></> : <p className="city-waiting">{remainingRoles === 0 ? "이번 라운드의 역할 선택을 마쳤습니다. 다른 참가자의 선택을 기다려주세요." : "내 선택 차례가 되면 선택 가능한 비밀 역할이 여기에 표시됩니다."}</p>}
      <p className="city-public-removals">공개 제외 역할: {game.publicRemovedRoleIds.length === 0 ? "없음" : game.publicRemovedRoleIds.map(cityRoleLabel).join(" · ")}</p>
    </section> : null}

    {game.phase === "ROLE_ACTION" && myTurn && action !== undefined ? <section className="city-panel city-action-panel" aria-labelledby="city-action-heading"><div className="city-panel-heading"><div><h2 id="city-action-heading">{CITY_ROLE_HELP[game.window.activeRoleId].name}의 행동</h2><p>기본 획득 → 원하는 건설·능력 → 차례 마치기</p></div><span className="city-budget">건설 {action.buildingsBuilt}/{cityBuildLimit(game.window.activeRoleId)}</span></div>
      <div className="city-acquisition"><h3>1. 기본 획득</h3>{action.acquisition === "NOT_TAKEN" ? <><div className="city-acquisition-choices"><button type="button" className="primary-button" disabled={locked} onClick={() => props.onAction({ kind: "city:takeIncome", payload: {} })}><CityIcon name="coin" /><span>금화 2 받기</span></button><button type="button" className="secondary-button" disabled={locked} onClick={() => props.onAction({ kind: "city:drawBuildingCards", payload: {} })}><CityIcon name="cards" /><span>건물 카드 보기</span></button></div><p className="city-helper">카드는 최대 2장을 보고 1장을 가져옵니다.</p></> : <p className="city-acquisition-status">{action.acquisition === "PENDING" ? "카드 선택을 기다리는 중" : "✓ 기본 획득 완료"}</p>}</div>
      {pendingCards !== undefined ? <section className="city-pending-choice" aria-labelledby="city-pending-heading"><h3 id="city-pending-heading">카드 1장을 선택하세요</h3><p>나에게만 보입니다. 선택하지 않은 카드는 덱 아래로 돌아갑니다. 선택 중에도 행동 시간은 계속 흐릅니다.</p><div className="city-card-grid">{pendingCards.map(card => <button type="button" className="city-building city-selectable" key={card.cardId} disabled={locked} aria-label={`${cityCardLabel(card)}, 손패에 넣기`} onClick={() => props.onAction({ kind: "city:chooseBuildingCard", payload: { cardId: card.cardId } })}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /><span className="city-card-cta">이 카드 가져오기</span></button>)}</div></section> : null}
      <div className="city-ability-step"><h3>2. 역할 능력</h3><CityRoleAbility key={uiIdentity} game={game} selfId={self.playerId} nickname={nickname} locked={locked} onAction={props.onAction} /></div>
      <div className="city-construction-step"><CityIcon name="hammer" /><div><h3>3. 건설</h3><p className="city-helper">내 손패에서 카드를 고른 뒤 아래에서 건설하세요. 능력과 건설은 선택 사항입니다.</p></div></div>
    </section> : null}

    </div><CityCategoryGuide rulesVersion={game.rulesVersion} /></div>
    <section className="city-panel city-cities" aria-labelledby="city-cities-heading"><div className="city-panel-heading"><div><h2 id="city-cities-heading">함께 만드는 도시</h2><p>{game.rulesVersion === "city-rules-v2" ? "건물 8개가 목표 · 건물 점수와 완성·다양성·명소 보너스로 순위를 정합니다." : "건물 8개가 목표 · 건물 점수와 완성·다양성 보너스로 최종 순위를 정합니다."}</p></div><span>선도자 {nickname(game.leaderPlayerId)}</span></div>
      <div className="city-city-grid">{[...game.playerStates].sort((left, right) => Number(right.playerId === self.playerId) - Number(left.playerId === self.playerId)).map(state => {
        const participant = room.players.find(entry => entry.playerId === state.playerId);
        const mine = state.playerId === self.playerId;
        const publicRoles = game.revealedRoles.filter(role => role.roundNumber === game.roundNumber && role.playerId === state.playerId);
        return <article className={`city-public-city${mine ? " is-mine" : ""}${state.playerId === game.window.activePlayerId ? " is-active" : ""}`} key={state.playerId} aria-label={`${nickname(state.playerId)}의 공개 도시`}><header><div><h3>{nickname(state.playerId)}{mine ? " · 나" : ""}{state.playerId === game.window.activePlayerId ? <span className="city-active-label">현재 차례</span> : null}</h3><p>{state.forfeited ? "기권" : participant?.connectionStatus === "CONNECTED" ? "접속 중" : "연결 끊김"}{game.protectedPlayerIds.includes(state.playerId) ? " · 보호 중" : ""}</p></div><strong>{state.builtBuildings.length}<small>/8 건물</small></strong></header>
          <p className="city-public-stats">금화 {state.gold} · 손패 {state.handCount}장 · 건물 점수 {state.scorePreview}점</p>
          {publicRoles.length > 0 ? <p className="city-revealed-roles">공개된 역할: {publicRoles.map(role => `${cityRoleLabel(role.roleId)}${role.kind === "DISABLED" ? " (봉쇄)" : ""}`).join(" · ")}</p> : null}
          {state.builtBuildings.length === 0 ? <div className="city-empty-city"><CitySkyline /><p>아직 건물이 없어요.<br />첫 건물을 기다리는 도시입니다.</p></div> : <div className={`city-card-grid city-built-grid${state.builtBuildings.length >= 5 ? " is-dense" : ""}`}>{state.builtBuildings.map(card => <div className="city-building is-built" key={card.cardId} aria-label={`${cityCardLabel(card)}, 건설됨`}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /><span className="city-built-label">건설됨</span>{game.rulesVersion === "city-rules-v2" && (card.templateId === "CB-LAN-01" || card.templateId === "CB-LAN-02") ? <span className="city-landmark-status">최초 건설 보상 사용 완료</span> : null}{game.rulesVersion === "city-rules-v2" && card.category === "LANDMARK" && state.forfeited ? <span className="city-landmark-status">기권 · 효과 비활성</span> : null}{game.rulesVersion === "city-rules-v2" && card.templateId === "CB-LAN-04" ? <span className="city-landmark-status">남은 할인 {game.landmarkHistory?.find(row => row.playerId === state.playerId)?.staircaseRemaining ?? 0}/3{game.landmarkHistory?.find(row => row.playerId === state.playerId)?.lastDiscountRound === game.roundNumber ? " · 이번 라운드 사용" : ""}</span> : null}</div>)}</div>}
        </article>;
      })}</div>
    </section>

    <section className="city-panel city-hand" aria-labelledby="city-hand-heading"><div className="city-panel-heading"><div><span className="city-private-badge">나에게만 보임</span><h2 id="city-hand-heading">내 건물 카드 · {game.privateState.hand.length}장</h2></div>{game.phase === "ROLE_ACTION" && myTurn && action !== undefined ? <span className="city-budget">건설 {action.buildingsBuilt}/{cityBuildLimit(game.window.activeRoleId)}</span> : null}</div>
      {game.privateState.hand.length === 0 ? <p className="city-empty-city">손패가 없습니다. 내 차례의 기본 획득에서 건물 카드를 볼 수 있습니다.</p> : <div className="city-card-grid city-hand-grid">{game.privateState.hand.map(card => {
        const preview = cityBuildPreview(game, self.playerId, card);
        return <button type="button" className={`city-building city-selectable${selectedCardId === card.cardId ? " is-selected" : ""}`} key={card.cardId} disabled={locked}
          aria-label={`${cityCardLabel(card)}, 내 손패, ${preview.message}`} aria-pressed={selectedCardId === card.cardId} onClick={() => setSelectedCardId(id => id === card.cardId ? null : card.cardId)}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /><span className="city-card-hint">{preview.message}</span></button>;
      })}</div>}

    </section>
    {game.privateState.marks.length > 0 ? <section className="city-panel city-private-marks" aria-label="나만 보는 지목 기록"><h2>내 비밀 지목</h2>{game.privateState.marks.map(mark => <p key={mark.kind}>{mark.kind === "DISABLE" ? "봉쇄" : "금화 이전"} · {cityRoleLabel(mark.targetRoleId)} · {mark.status === "UNRESOLVED" ? "결과 대기" : mark.status === "CANCELLED" ? "취소됨" : "처리됨"}</p>)}</section> : null}
    <footer className="city-action-dock" aria-label="내 역할 행동 dock">
      <div className="city-dock-inventory"><span><CityIcon name="coin" />내 금화 <b>{player?.gold ?? 0}</b></span><span><CityIcon name="cards" />내 손패 <b>{game.privateState.hand.length}장</b></span></div>
      <p className="city-dock-reason" role="status">{!myTurn ? "내 차례를 기다리고 있습니다." : game.phase === "ROLE_SELECTION" ? "위에서 비밀 역할을 선택하세요." : locked ? "연결·행동 결과를 확인하고 있습니다." : action?.acquisition !== "COMPLETE" ? pendingCards !== undefined ? "먼저 가져올 카드 1장을 선택하세요." : "먼저 금화 또는 건물 카드를 선택하세요." : selectedCard === null ? "건설할 내 카드를 선택하거나 차례를 마치세요." : `${selectedCard.name} · ${buildPreview?.message ?? ""}`}</p>
      <div className="city-dock-buttons"><button type="button" className="secondary-button" disabled={locked || buildPreview?.allowed !== true} onClick={() => {
        if (locked || selectedCard === null || buildPreview?.allowed !== true) return;
        props.onAction({ kind: "city:build", payload: { cardId: selectedCard.cardId } });
      }}><CityIcon name="hammer" />{selectedCard === null ? "건물 건설" : `금화 ${cityBuildPreview(game, self.playerId, selectedCard).paidCost} 내고 건설`}</button>
      {myTurn && game.phase === "ROLE_ACTION" ? <button type="button" className="primary-button city-end-turn" disabled={locked || action?.acquisition !== "COMPLETE"} onClick={() => {
        if (locked || game.phase !== "ROLE_ACTION" || action?.acquisition !== "COMPLETE") return;
        props.onAction({ kind: "city:endTurn", payload: {} });
      }}><CityIcon name="check" />역할 차례 마치기</button> : null}</div>
    </footer>
  </main>;
}
