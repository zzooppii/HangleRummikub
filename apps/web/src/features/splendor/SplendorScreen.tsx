import { SplendorCommandRejected } from "../../lib/splendor-command-error.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SPLENDOR_COLORS,
  meetsSplendorCity,
  type SplendorCity,
  SPLENDOR_TOKENS,
  type SplendorAction,
  type SplendorCard,
  type SplendorClientCommand,
  type SplendorNoble,
  type SplendorTokens,
  type SplendorToken,
} from "@hangul-rummikub/shared";
import type { SplendorWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { Gem, Portrait, Scene, TokenBadge, cardColor } from "./art.js";
import {
  TOKEN_LABELS,
  zeroTokens,
  tokenTotal,
  paymentPreview,
  validTake,
  cardLabel,
  cityLabel,
  cityRemaining,
} from "./ui.js";
type Props = {
  snapshot: SplendorWebSnapshot;
  connected: boolean;
  pending: boolean;
  error: string | null;
  connectionLabel: string;
  onCommand(c: SplendorClientCommand): Promise<void>;
  onStart(): void;
  onLeave(): void;
  onCopy(): void;
};
type Selection =
  | { kind: "CARD"; cardId: SplendorCard["cardId"] }
  | { kind: "DECK"; tier: 1 | 2 | 3 }
  | { kind: "TAKE" }
  | { kind: "PASS" };
export function CardFace({ card }: { card: SplendorCard }) {
  return (
    <>
      <Scene index={card.art} />
      <span className="sp-card-shade" />
      <span className="sp-card-heading">
        <span className="sp-prestige">
          {card.points > 0 ? (
            <>
              ✦ <b>{card.points}</b>
            </>
          ) : null}
        </span>
        <span className="sp-card-bonus">
          <Gem color={card.bonus} />
          <small>+1</small>
        </span>
      </span>
      <span className="sp-card-price">
        {SPLENDOR_COLORS.filter((k) => card.cost[k] > 0).map((k) => (
          <TokenBadge key={k} color={k} count={card.cost[k]} />
        ))}
      </span>
    </>
  );
}
function NobleFace({ noble }: { noble: SplendorNoble }) {
  return (
    <>
      <Portrait index={noble.portrait} />
      <span className="sp-noble-points">✦ 3</span>
      <span className="sp-noble-price">
        {SPLENDOR_COLORS.filter((k) => noble.cost[k] > 0).map((k) => (
          <TokenBadge key={k} color={k} count={noble.cost[k]} />
        ))}
      </span>
    </>
  );
}
export function CityFace({city}: {city: SplendorCity}) {
  return <><Scene index={(city.tile + 2) % 6}/><span className="sp-city-shade"/>
    <span className="sp-city-heading"><span>도시 {city.tile}</span><b>✦ {city.points}<small>목표</small></b></span>
    <span className="sp-city-price">{SPLENDOR_COLORS.filter(k => city.cost[k] > 0).map(k =>
      <TokenBadge key={k} color={k} count={city.cost[k]}/>)}
      {city.sameColor > 0 && <span className="sp-city-wild" aria-label={`한 가지 ${SPLENDOR_COLORS.some(k => city.cost[k] > 0) ? "다른 " : ""}색 할인 ${city.sameColor}개`}><span>◇</span><b>{city.sameColor}</b><small>같은 색</small></span>}
      {SPLENDOR_COLORS.every(k => city.cost[k] === 0) && city.sameColor === 0 && <span className="sp-city-score-only">명성만으로 달성</span>}
    </span></>;
}
export function SplendorScreen(props: Props) {
  const s = props.snapshot,
    game = s.game,
    playing = game?.phase === "PLAYING" ? game : null,
    self = s.self.playerId;
  const citiesMode = game ? game.rulesVersion === "splendor-cities-2017-v1" : s.room.phase === "LOBBY" && s.room.settings?.mode === "CITIES";
  const mine = game?.playerStates.find((p) => p.playerId === self),
    isHost = s.room.players.some((p) => p.playerId === self && p.isHost);
  const [now, setNow] = useState<number>(s.serverTime),
    [selection, setSelection] = useState<Selection | null>(null),
    [mode, setMode] = useState<"DIFFERENT" | "SAME">("DIFFERENT"),
    [take, setTake] = useState(zeroTokens);
  const [actionMode, setActionMode] = useState<"BUY" | "RESERVE">("BUY"),
    [chosenPayment, setChosenPayment] = useState<SplendorTokens | null>(null),
    [returns, setReturns] = useState(zeroTokens),
    [nobleId, setNobleId] = useState<string | null>(null),
    [cityId, setCityId] = useState<string | null>(null),
    [inspectedCity, setInspectedCity] = useState<SplendorCity | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState<SplendorClientCommand | null>(null),
    [help, setHelp] = useState(false);
  const busyRef = useRef(false),
    actionDialog = useRef<HTMLDialogElement>(null),
    helpDialog = useRef<HTMLDialogElement>(null),
    cityDialog = useRef<HTMLDialogElement>(null),
    lastTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const base = performance.now();
    setNow(s.serverTime);
    const timer = window.setInterval(
      () => setNow(s.serverTime + performance.now() - base),
      250,
    );
    return () => window.clearInterval(timer);
  }, [s.serverTime]);
  useEffect(() => {
    setSelection(null);
    setTake(zeroTokens());
    setReturns(zeroTokens());
    setChosenPayment(null);
    setNobleId(null);
    setCityId(null);
    setRetry(null);
    setError(null);
  }, [game?.gameId, game?.gameRevision]);
  useEffect(() => {
    if (selection) {
      actionDialog.current?.showModal();
    } else if (actionDialog.current?.open) {
      actionDialog.current.close();
      lastTrigger.current?.focus();
    }
  }, [selection]);
  useEffect(() => {
    if (help) helpDialog.current?.showModal();
    else helpDialog.current?.close();
  }, [help]);
  useEffect(() => { if (inspectedCity) cityDialog.current?.showModal(); else cityDialog.current?.close(); }, [inspectedCity]);
  const enabled = props.connected && !props.pending && !busy && !retry;
  const canAct =
    enabled &&
    playing !== null &&
    playing.activePlayerId === self &&
    now < playing.deadlineAt;
  const name = (id: string) =>
    s.room.players.find((p) => p.playerId === id)?.nickname ?? "참가자";
  const ready = getGameStartControl(s, props.pending || !props.connected);
  const publicCards =
    game?.market.flatMap((t) =>
      t.slots.filter((c): c is SplendorCard => c !== null),
    ) ?? [];
  const ownCards = game?.privateState.reserved ?? [];
  const selectedCard =
    selection?.kind === "CARD"
      ? [...publicCards, ...ownCards].find((c) => c.cardId === selection.cardId)
      : undefined;
  const isReserved = selectedCard
    ? ownCards.some((c) => c.cardId === selectedCard.cardId)
    : false;
  const buying = !!selectedCard && (actionMode === "BUY" || isReserved);
  const preview =
    selectedCard && mine
      ? paymentPreview(
          selectedCard,
          mine.bonuses,
          mine.tokens,
          chosenPayment ?? undefined,
        )
      : null;
  const eligible = useMemo(() => {
    if (!game || !mine) return [];
    const bonus = { ...mine.bonuses };
    if (selectedCard && buying) bonus[selectedCard.bonus]++;
    return game.nobles.filter((n) =>
      SPLENDOR_COLORS.every((k) => bonus[k] >= n.cost[k]),
    );
  }, [game, mine, selectedCard, buying]);
  const eligibleCities = useMemo(() => {
    if (!game || !mine || !citiesMode) return [];
    const bonus = {...mine.bonuses};
    if (selectedCard && buying) bonus[selectedCard.bonus]++;
    return game.cities.filter(c => meetsSplendorCity(c, mine.score + (selectedCard && buying ? selectedCard.points : 0), bonus));
  }, [game, mine, citiesMode, selectedCard, buying]);
  const cityOK = eligibleCities.length <= 1 || eligibleCities.some(c => c.cityId === cityId);
  const displayedCities = game ? [...game.cities.map(city => ({city, owner: null})), ...game.playerStates.flatMap(p => p.cities.map(city => ({city, owner: p.playerId})))].sort((a,b) => a.city.tile - b.city.tile) : [];
  const after = mine ? { ...mine.tokens } : zeroTokens();
  if (selection?.kind === "TAKE")
    for (const k of SPLENDOR_TOKENS) after[k] += take[k];
  else if (selection?.kind === "DECK" || (selectedCard && !buying)) {
    if (game && game.bank.GOLD > 0) after.GOLD++;
  } else if (buying && preview?.can)
    for (const k of SPLENDOR_TOKENS) after[k] -= preview.payment[k];
  const excess = Math.max(0, tokenTotal(after) - 10),
    returnOK =
      tokenTotal(returns) === excess &&
      SPLENDOR_TOKENS.every((k) => returns[k] <= after[k]);
  const nobleOK =
    eligible.length <= 1 || eligible.some((n) => n.nobleId === nobleId);
  const reserveOK = !!mine && mine.reservedCount < 3;
  const selectionOK =
    selection?.kind === "TAKE"
      ? !!game && validTake(take, game.bank)
      : selection?.kind === "DECK"
        ? reserveOK &&
          !!game?.market.find((t) => t.tier === selection.tier)?.deckCount
        : selection?.kind === "PASS"
          ? true
          : selectedCard
            ? buying
              ? preview?.can
              : reserveOK
            : false;
  const noMainAction =
    !!game &&
    !!mine &&
    !SPLENDOR_COLORS.some((k) => game.bank[k] > 0) &&
    !(
      mine.reservedCount < 3 &&
      game.market.some(
        (t) => t.deckCount > 0 || t.slots.some((c) => c !== null),
      )
    ) &&
    ![...publicCards, ...ownCards].some(
      (c) => paymentPreview(c, mine.bonuses, mine.tokens).can,
    );
  function openSelection(value: Selection) {
    lastTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setChosenPayment(null);
    setReturns(zeroTokens());
    setNobleId(null);
    setCityId(null);
    setActionMode("BUY");
    setError(null);
    setSelection(value);
  }
  function closeSelection() {
    if (busyRef.current) return;
    setSelection(null);
    setError(null);
  }
  async function send(c: SplendorClientCommand) {
    if (busyRef.current || !props.connected) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setRetry(c);
    try {
      await props.onCommand(c);
      setRetry(null);
      setSelection(null);
    } catch (e) {
      if (e instanceof SplendorCommandRejected) setRetry(null);
      setError(e instanceof Error ? e.message : "연결을 확인해주세요.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function confirm() {
    if (
      !playing ||
      !selection ||
      !canAct ||
      !selectionOK ||
      !returnOK ||
      !nobleOK || !cityOK
    )
      return;
    const resolution = {
      returns,
      ...(citiesMode ? {cityId: eligibleCities.length === 1 ? eligibleCities[0]!.cityId : cityId} : {}),
      nobleId: eligible.length === 1 ? eligible[0]!.nobleId : nobleId,
    };
    let action: SplendorAction;
    if (selection.kind === "TAKE")
      action = { kind: "TAKE", tokens: take, ...resolution };
    else if (selection.kind === "DECK")
      action = { kind: "RESERVE_DECK", tier: selection.tier, ...resolution };
    else if (selection.kind === "PASS")
      action = { kind: "PASS", ...resolution };
    else if (selectedCard && buying && preview)
      action = {
        kind: "BUY",
        cardId: selectedCard.cardId,
        payment: preview.payment,
        ...resolution,
      };
    else if (selectedCard)
      action = { kind: "RESERVE", cardId: selectedCard.cardId, ...resolution };
    else return;
    void send({
      protocolVersion: 1,
      requestId: createRequestId(),
      kind: "splendor:act",
      gameId: playing.gameId,
      expectedGameRevision: playing.gameRevision,
      turnId: playing.turnId,
      payload: action,
    });
  }
  function selectToken(k: SplendorToken) {
    if (!canAct || !game || k === "GOLD") return;
    setTake((current) => {
      const next = { ...current };
      if (mode === "SAME") {
        if (game.bank[k] < 4) return current;
        return { ...zeroTokens(), [k]: current[k] === 2 ? 0 : 2 };
      }
      if (current[k] > 0) next[k] = 0;
      else if (
        tokenTotal(current) <
        Math.min(3, SPLENDOR_COLORS.filter((c) => game.bank[c] > 0).length)
      )
        next[k] = 1;
      return next;
    });
  }
  function selectCard(c: SplendorCard) {
    openSelection({ kind: "CARD", cardId: c.cardId });
  }
  const feedback = game?.feedback;
  const feedbackText = feedback
    ? `${name(feedback.playerId)}님이 ${{ TAKE: "보석을 가져왔습니다", BUY: "카드를 구매했습니다", RESERVE: "카드를 예약했습니다", RESERVE_DECK: "덱에서 카드를 예약했습니다", PASS: "턴을 넘겼습니다", TIMEOUT: "시간초과로 턴을 넘겼습니다" }[feedback.kind]}${feedback.points > 0 ? ` · +${feedback.points}점` : ""}`
    : "보석을 모아 첫 카드를 구매해보세요.";
  const seconds = playing
    ? Math.max(0, Math.ceil((playing.deadlineAt - now) / 1000))
    : 90;
  function cardButton(c: SplendorCard) {
    const affordable =
      !!mine && paymentPreview(c, mine.bonuses, mine.tokens).can;
    return (
      <button
        key={c.cardId}
        className={`sp-development ${affordable ? "affordable" : ""}`}
        style={cardColor(c.bonus)}
        onClick={() => selectCard(c)}
        aria-label={`${cardLabel(c)}${affordable ? ". 구매 가능" : ""}`}
      >
        <CardFace card={c} />
        {affordable && (
          <span className="sp-affordable-mark" aria-hidden="true">
            ✓
          </span>
        )}
      </button>
    );
  }
  return (
    <main className="splendor-screen">
      <header className="sp-topbar">
        <div className="sp-wordmark">
          <Gem color="GREEN" />
          <div>
            <span>SPLENDOR</span>
            <h1>스플렌더 {citiesMode && <small className="sp-edition-badge">도시 확장</small>}</h1>
          </div>
        </div>
        <div className="sp-roomtools">
          <span className="sp-connection">
            {props.connectionLabel} · {s.room.roomCode}
          </span>
          <button onClick={props.onCopy} aria-label="초대 링크 복사">
            초대
          </button>
          <button onClick={() => setHelp(true)} aria-label="게임 방법 보기">
            ?
          </button>
          <button onClick={props.onLeave} disabled={props.pending || busy}>
            나가기
          </button>
        </div>
      </header>
      {(props.error || error) && (
        <p className="sp-error" role="alert">
          {props.error || error}
        </p>
      )}
      {!props.connected && (
        <p className="sp-error" role="status">
          연결을 복구하고 있어요. 보석과 카드는 그대로 보관됩니다.
        </p>
      )}
      {retry && !selection && (
        <div className="sp-retry">
          <span>행동 결과를 확인해주세요.</span>
          <button
            disabled={!props.connected || busy}
            onClick={() => void send(retry)}
          >
            같은 요청 다시 확인
          </button>
        </div>
      )}
      {!game ? (
        <section className="sp-lobby">
          <div className="sp-lobby-table">
            <Scene index={5} />
            <div className="sp-lobby-overlay" />
            <div className="sp-lobby-copy">
              <span className="sp-eyebrow">THE MERCHANT'S TABLE</span>
              <h2>
                작은 보석에서
                <br />
                위대한 명성으로.
              </h2>
              <p>보석을 모으고, 나만의 상단을 키우세요.</p>
              <div className="sp-lobby-gems">
                {SPLENDOR_TOKENS.map((k) => (
                  <Gem key={k} color={k} />
                ))}
              </div>
              <span className="sp-lobby-meta">
                2–4명 <i /> {citiesMode ? "도시 확장" : "기본판"} <i /> 차례당 90초
              </span>
            </div>
          </div>
          <aside className="sp-lobby-seats">
            <span className="sp-eyebrow">YOUR COMPANY</span>
            <h2>
              함께할 상인들 <small>{s.room.players.length}/4</small>
            </h2>
            {Array.from({ length: 4 }, (_, i) => {
              const p = s.room.players[i];
              return (
                <div className={`sp-lobby-player ${p ? "" : "empty"}`} key={i}>
                  <Portrait index={i * 2} />
                  {p ? (
                    <div>
                      <b>
                        {p.nickname}
                        {p.playerId === self ? " · 나" : ""}
                      </b>
                      <span>
                        {p.isHost ? "방장 · " : ""}
                        {p.connectionStatus === "CONNECTED"
                          ? "접속 중"
                          : "연결 기다리는 중"}
                      </span>
                    </div>
                  ) : (
                    <span>빈 자리</span>
                  )}
                </div>
              );
            })}
            <fieldset className="sp-edition-picker">
              <legend>{isHost ? "이번 판의 여정" : "방장이 선택한 여정"}</legend>
              <div>{(["BASE", "CITIES"] as const).map(value => <button key={value}
                type="button" aria-pressed={citiesMode === (value === "CITIES")}
                disabled={!isHost || !enabled}
                onClick={() => { if (citiesMode !== (value === "CITIES")) void send({kind:"splendor:configure", protocolVersion:1, requestId:createRequestId(), expectedRoomRevision:s.versions.roomRevision, payload:{mode:value}}); }}>
                {value === "BASE" ? <Portrait index={3}/> : <Scene index={4}/>}
                <span className="sp-edition-shade"/><span className="sp-edition-copy"><b>{value === "BASE" ? "기본판" : "도시 확장"}</b><small>{value === "BASE" ? "귀족의 후원 · 15점 경쟁" : "세 도시 · 새로운 승리 조건"}</small></span>
                <span className="sp-edition-check" aria-hidden="true">{citiesMode === (value === "CITIES") ? "✓" : ""}</span>
              </button>)}</div>
              <p>{citiesMode ? "도시의 명성과 할인 조건을 달성해 승리를 차지하세요." : "보석을 모아 귀족의 후원을 받고 명성을 높이세요."}</p>
            </fieldset>
            <p>{ready.guidance}</p>
            {isHost ? (
              <button
                className="sp-primary"
                disabled={!ready.canStart || !enabled}
                onClick={props.onStart}
              >
                상단 열기 <span>→</span>
              </button>
            ) : (
              <div className="sp-wait">방장이 시작하면 카드를 펼칩니다.</div>
            )}
          </aside>
        </section>
      ) : game.phase === "FINISHED" ? (
        <section className="sp-finish">
          <span className="sp-crown" aria-hidden="true">
            ♛
          </span>
          <span className="sp-eyebrow">THE FINAL PRESTIGE</span>
          <h2>
            {(game.result.reason === "POINTS" || game.result.reason === "CITIES")
              ? `${game.result.winnerPlayerIds.map(name).join(" · ")} 승리`
              : "이번 판을 마쳤습니다"}
          </h2>
          <p>
            {game.result.reason === "CANCELLED"
              ? "참가자가 방을 나가 이번 판이 취소됐습니다."
              : game.result.reason === "INACTIVE"
                ? "세 라운드 동안 행동이 없어 판을 종료했습니다."
                : "모든 상인의 마지막 차례가 끝났습니다."}
          </p>
          <div className="sp-final-scores">
            {[...game.result.scores]
              .sort((a, b) => Number(game.result.winnerPlayerIds.includes(b.playerId)) - Number(game.result.winnerPlayerIds.includes(a.playerId)) || b.score - a.score || a.cards - b.cards)
              .map((p) => (
                <article
                  key={p.playerId}
                  className={
                    game.result.winnerPlayerIds.includes(p.playerId)
                      ? "winner"
                      : ""
                  }
                >
                  <Portrait
                    index={
                      s.room.players.findIndex(
                        (x) => x.playerId === p.playerId,
                      ) * 2
                    }
                  />
                  <h3>{name(p.playerId)}</h3>
                  <strong>
                    {p.score}
                    <small>명성</small>
                  </strong>
                  <span>구매 카드 {p.cards}장</span>
                  {citiesMode && <span>{game.playerStates.find(x => x.playerId === p.playerId)?.cities.length ? "도시 획득" : "도시 미획득"}</span>}
                  {game.result.winnerPlayerIds.includes(p.playerId) && (
                    <span className="sp-winner-ribbon">WINNER</span>
                  )}
                </article>
              ))}
          </div>
          {isHost ? (
            <button
              className="sp-primary"
              disabled={!enabled}
              onClick={() =>
                void send({
                  protocolVersion: 1,
                  requestId: createRequestId(),
                  kind: "splendor:rematch",
                  gameId: game.gameId,
                  expectedGameRevision: game.gameRevision,
                  expectedRoomRevision: s.versions.roomRevision,
                  payload: {},
                })
              }
            >
              대기실로 돌아가기
            </button>
          ) : (
            <p>방장이 다음 판을 준비합니다.</p>
          )}
        </section>
      ) : (
        <>
          <section className="sp-players" aria-label="상인 현황">
            {game.playerStates
              .filter((p) => p.playerId !== self)
              .map((p) => (
                <details
                  key={p.playerId}
                  className={`sp-player ${game.activePlayerId === p.playerId ? "active" : ""}`}
                >
                  <summary>
                    <Portrait
                      index={
                        s.room.players.findIndex(
                          (x) => x.playerId === p.playerId,
                        ) * 2
                      }
                    />
                    <span className="sp-player-name">
                      <b>{name(p.playerId)}</b>
                      <small>
                        {s.room.players.find((x) => x.playerId === p.playerId)
                          ?.connectionStatus === "OFFLINE"
                          ? "접속 끊김"
                          : game.activePlayerId === p.playerId
                            ? "생각하는 중…"
                            : `예약 ${p.reservedCount}장`}
                      </small>
                    </span>
                    <strong className="sp-player-score">{p.cities.length > 0 && <span className="sp-city-seal" aria-label="도시 획득">♜</span>} ✦ {p.score}</strong>
                    <span className="sp-player-holdings" aria-label={`${name(p.playerId)} 보유 토큰`}>
                      <span className="sp-holdings-label">보유</span>
                      {SPLENDOR_TOKENS.map((k) => (
                        <TokenBadge key={k} color={k} count={p.tokens[k]} />
                      ))}
                    </span>
                  </summary>
                  <div className="sp-player-detail">
                    <span>영구 할인 · 보유 토큰과 별개</span>
                    <div className="sp-inline-tokens" aria-label={`${name(p.playerId)} 영구 할인`}>
                      {SPLENDOR_COLORS.map((k) => (
                        <TokenBadge key={k} color={k} count={p.bonuses[k]} />
                      ))}
                    </div>
                    <span>
                      구매 {p.purchased.length}장 · {citiesMode ? `도시 ${p.cities.length}개` : `귀족 ${p.nobles.length}명`} ·
                      예약 {p.reservedCount}장
                    </span>
                    <div className="sp-owned-gallery">
                      {p.purchased.map((c) => (
                        <div
                          key={c.cardId}
                          className="sp-development"
                          style={cardColor(c.bonus)}
                          aria-label={cardLabel(c)}
                        >
                          <CardFace card={c} />
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
          </section>
          <section
            className={`sp-turn-banner ${game.activePlayerId === self ? "mine" : ""}`}
          >
            <span>
              {game.finalRound ? "마지막 라운드" : `라운드 ${game.round}`}
            </span>
            <strong>
              {game.activePlayerId === self
                ? "당신의 차례"
                : `${name(game.activePlayerId)}님의 차례`}
            </strong>
            <div
              className={`sp-clock ${seconds <= 10 ? "urgent" : ""}`}
              role="timer"
              aria-label={`${seconds}초 남음`}
            >
              <span style={{ width: `${(seconds / 90) * 100}%` }} />
              <b>
                {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </b>
            </div>
          </section>
          <div className="sp-table-layout">
            <section
              id="sp-market"
              className={`sp-table ${citiesMode ? "sp-city-table" : ""}`}
              aria-label="공용 카드 시장"
            >
              {citiesMode ? <>
                <div className="sp-section-label"><span>도시의 부름</span><span>명성 + 영구 할인 · 타일을 눌러 목표 확인</span></div>
                <div className="sp-cities" aria-label="도시 목표">
                  {displayedCities.map(({city, owner}) => {
                    const remaining = cityRemaining(city, mine?.score ?? 0, mine?.bonuses ?? zeroTokens());
                    return <button key={city.cityId} className={`sp-city ${owner ? "claimed" : remaining.points === 0 && remaining.cards === 0 ? "ready" : ""}`}
                      onClick={() => setInspectedCity(city)} aria-label={`${cityLabel(city)}. ${owner ? `${name(owner)} 획득` : `내 명성 ${remaining.points}점, 할인 ${remaining.cards}개 더 필요`}`}>
                      <CityFace city={city}/>{owner && <span className="sp-city-claimed">♜ {name(owner)}</span>}
                      <span className="sp-city-progress">{owner ? "도시 획득" : remaining.points === 0 && remaining.cards === 0 ? "달성 가능" : `✦ ${remaining.points} · ▱ ${remaining.cards} 더`}</span>
                    </button>;
                  })}
                </div>
              </> : <><div className="sp-section-label">
                <span>귀족의 후원</span>
                <span>조건 달성 시 ✦ 3</span>
              </div>
              <div className="sp-nobles">
                {game.nobles.map((n) => {
                  const bonus = mine?.bonuses;
                  const remaining = bonus
                    ? SPLENDOR_COLORS.reduce(
                        (x, k) => x + Math.max(0, n.cost[k] - bonus[k]),
                        0,
                      )
                    : 0;
                  return (
                    <div
                      key={n.nobleId}
                      className={`sp-noble ${remaining === 0 ? "ready" : ""}`}
                      aria-label={`귀족 ${n.portrait + 1}, 3점, ${SPLENDOR_COLORS.filter(
                        (k) => n.cost[k] > 0,
                      )
                        .map((k) => `${TOKEN_LABELS[k]} 할인 ${n.cost[k]}`)
                        .join(", ")}`}
                    >
                      <NobleFace noble={n} />
                      <span className="sp-noble-progress">
                        {remaining === 0 ? "후원 가능" : `${remaining}개 더`}
                      </span>
                    </div>
                  );
                })}
              </div>
              </>}
              <div className="sp-market">
                {[...game.market].reverse().map((t) => (
                  <div className="sp-market-row" key={t.tier}>
                    <button
                      className={`sp-deck tier-${t.tier}`}
                      disabled={!canAct || !reserveOK || t.deckCount === 0}
                      onClick={() =>
                        openSelection({ kind: "DECK", tier: t.tier })
                      }
                      aria-label={`${t.tier}단계 덱에서 비공개 예약, ${t.deckCount}장 남음`}
                    >
                      <span className="sp-deck-ornament">✧</span>
                      <span className="sp-tier-dots">{"◆".repeat(t.tier)}</span>
                      <span className="sp-deck-count">{t.deckCount}</span>
                    </button>
                    <div className="sp-market-cards">
                      {t.slots.map((c, i) =>
                        c ? (
                          cardButton(c)
                        ) : (
                          <span key={`empty-${i}`} className="sp-empty-card">
                            덱 소진
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <aside id="sp-bank" className="sp-bank">
              <div className="sp-section-label">
                <span>보석 은행</span>
                <span>{mode === "SAME" ? "같은 색 2개" : "서로 다른 색"}</span>
              </div>
              <div
                className="sp-take-mode"
                role="group"
                aria-label="보석 가져오기 방식"
              >
                <button
                  aria-pressed={mode === "DIFFERENT"}
                  onClick={() => {
                    setMode("DIFFERENT");
                    setTake(zeroTokens());
                  }}
                  disabled={!canAct}
                >
                  서로 다른 3개
                </button>
                <button
                  aria-pressed={mode === "SAME"}
                  onClick={() => {
                    setMode("SAME");
                    setTake(zeroTokens());
                  }}
                  disabled={!canAct}
                >
                  같은 색 2개
                </button>
              </div>
              <div className="sp-bank-tokens">
                {SPLENDOR_TOKENS.map((k) => (
                  <button
                    key={k}
                    className={`sp-chip ${k.toLowerCase()} ${take[k] > 0 ? "selected" : ""}`}
                    disabled={
                      !canAct ||
                      k === "GOLD" ||
                      game.bank[k] === 0 ||
                      (mode === "SAME" && game.bank[k] < 4)
                    }
                    onClick={() => selectToken(k)}
                    aria-label={`${TOKEN_LABELS[k]} ${game.bank[k]}개 남음${k === "GOLD" ? ", 예약으로 획득" : ""}`}
                    aria-pressed={take[k] > 0}
                  >
                    <span className="sp-chip-rim">
                      <Gem color={k} />
                    </span>
                    <b className="sp-chip-count">{game.bank[k]}</b>
                    <span className="sp-chip-label">{TOKEN_LABELS[k]}</span>
                    {take[k] > 0 && (
                      <span className="sp-chip-selected">+{take[k]}</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                className="sp-primary"
                disabled={!canAct || !validTake(take, game.bank)}
                onClick={() => openSelection({ kind: "TAKE" })}
              >
                {tokenTotal(take) > 0
                  ? `${tokenTotal(take)}개 가져오기`
                  : "보석을 골라주세요"}
              </button>
              <p className="sp-bank-hint">
                {mode === "SAME"
                  ? "은행에 4개 이상 남은 색을 고를 수 있어요."
                  : "황금은 카드를 예약할 때 얻습니다."}
              </p>
              <div
                className="sp-table-note"
                key={feedback?.at ?? "start"}
                role="status"
                aria-live="polite"
              >
                <span>테이블 소식</span>
                <p>{feedbackText}</p>
                {feedback?.tokenMovement && <div className="sp-token-movement" aria-label="최근 행동의 토큰 변화">
                  {([
                    ["gained", "가져옴"], ["spent", "사용"], ["returned", "반환"],
                  ] as const).map(([kind, label]) => {
                    const tokens = feedback.tokenMovement![kind];
                    const colors = SPLENDOR_TOKENS.filter(k => tokens[k] > 0);
                    return colors.length > 0 && <div key={kind} aria-label={label}>
                      <span>{label}</span>{colors.map(k => <TokenBadge key={k} color={k} count={tokens[k]} plus={kind === "gained"}/>)}
                    </div>;
                  })}
                </div>}
              </div>
              {noMainAction && (
                <button
                  className="sp-quiet"
                  disabled={!canAct}
                  onClick={() => openSelection({ kind: "PASS" })}
                >
                  가능한 행동 없음 · 턴 넘기기
                </button>
              )}
            </aside>
          </div>
          {mine && (
            <section id="sp-company" className="sp-tray" aria-label="내 상단">
              <div className="sp-my-title">
                <Portrait
                  index={
                    s.room.players.findIndex((x) => x.playerId === self) * 2
                  }
                />
                <div>
                  <b>
                    {name(self)} <small>나의 상단</small>
                  </b>
                  <span>보유 보석 {tokenTotal(mine.tokens)} / 10</span>
                </div>
                <strong>
                  ✦ {mine.score}
                  <small>{citiesMode ? (mine.cities.length > 0 ? "♜ 도시 획득" : "도시 목표") : "/ 15"}</small>
                </strong>
              </div>
              <div className="sp-my-engine">
                <div className="sp-resource-columns">
                  {SPLENDOR_TOKENS.map((k) => (
                    <div key={k} className="sp-resource-column">
                      <Gem color={k} />
                      <b>{mine.tokens[k]}</b>
                      {k !== "GOLD" ? (
                        <span
                          className="sp-discount"
                          aria-label={`${TOKEN_LABELS[k]} 영구 할인 ${mine.bonuses[k]}`}
                        >
                          할인 {mine.bonuses[k]}
                        </span>
                      ) : (
                        <span className="sp-discount">만능</span>
                      )}
                    </div>
                  ))}
                </div>
                <details className="sp-purchased">
                  <summary>
                    영구 할인 {mine.purchased.length} · 구매 카드 보기
                  </summary>
                  <div className="sp-owned-gallery">
                    {mine.purchased.length === 0 ? (
                      <p>카드를 사면 이곳에 영구 할인이 쌓입니다.</p>
                    ) : (
                      mine.purchased.map((c) => (
                        <div
                          className="sp-development"
                          key={c.cardId}
                          style={cardColor(c.bonus)}
                          aria-label={cardLabel(c)}
                        >
                          <CardFace card={c} />
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </div>
              <div className="sp-reservations">
                <div className="sp-section-label">
                  <span>내 예약</span>
                  <span>{mine.reservedCount}/3 · 나만 보기</span>
                </div>
                <div className="sp-reserved-row">
                  {ownCards.map(cardButton)}
                  {Array.from({ length: 3 - ownCards.length }, (_, i) => (
                    <span className="sp-reserved-empty" key={i}>
                      ✧
                    </span>
                  ))}
                </div>
              </div>
              {mine.nobles.length > 0 && (
                <div className="sp-my-nobles" aria-label="획득한 귀족">
                  {mine.nobles.map((n) => (
                    <div key={n.nobleId} className="sp-noble">
                      <NobleFace noble={n} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
      {playing && (
        <nav className="sp-mobile-nav" aria-label="테이블 빠른 이동">
          {[
            { id: "sp-market", icon: "▱", label: "카드 시장" },
            { id: "sp-bank", icon: "◇", label: "보석 은행" },
            { id: "sp-company", icon: "♜", label: "내 상단" },
          ].map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() =>
                document.getElementById(id)?.scrollIntoView({ block: "start" })
              }
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
      <dialog
        ref={actionDialog}
        className="sp-action-dialog"
        aria-labelledby="sp-action-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else closeSelection();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeSelection();
        }}
      >
        <div className="sp-dialog-content">
          <header>
            <span className="sp-eyebrow">YOUR NEXT MOVE</span>
            <button
              className="sp-close"
              onClick={closeSelection}
              disabled={busy}
              aria-label="선택 창 닫기"
            >
              ×
            </button>
          </header>
          <h2 id="sp-action-title">
            {selectedCard
              ? buying
                ? "카드 구매"
                : "카드 예약"
              : selection?.kind === "DECK"
                ? `${selection.tier}단계 비공개 예약`
                : selection?.kind === "PASS"
                  ? "턴 넘기기"
                  : "보석 가져오기"}
          </h2>
          {selectedCard && (
            <>
              <div
                className="sp-selected-card sp-development"
                style={cardColor(selectedCard.bonus)}
              >
                <CardFace card={selectedCard} />
              </div>
              <div className="sp-selected-benefit">
                <span>✦ {selectedCard.points} 명성</span>
                <span>
                  <Gem color={selectedCard.bonus} /> 영구 할인 +1
                </span>
              </div>
              {!isReserved && (
                <div className="sp-take-mode">
                  <button
                    aria-pressed={buying}
                    onClick={() => {
                      setActionMode("BUY");
                      setReturns(zeroTokens());
                      setNobleId(null);
    setCityId(null);
                    }}
                  >
                    구매
                  </button>
                  <button
                    aria-pressed={!buying}
                    onClick={() => {
                      setActionMode("RESERVE");
                      setReturns(zeroTokens());
                      setNobleId(null);
    setCityId(null);
                    }}
                  >
                    예약
                  </button>
                </div>
              )}
            </>
          )}
          {buying && preview && mine && (
            <div className="sp-payment">
              <span className="sp-section-label">할인 적용 후 지불</span>
              {SPLENDOR_COLORS.filter((k) => preview.cost[k] > 0).map((k) => (
                <div className="sp-payment-row" key={k}>
                  <Gem color={k} />
                  <span>
                    {TOKEN_LABELS[k]}{" "}
                    <small>
                      {selectedCard?.cost[k]} − {mine.bonuses[k]} ={" "}
                      {preview.cost[k]}
                    </small>
                  </span>
                  <div className="sp-stepper">
                    <button
                      aria-label={`${TOKEN_LABELS[k]} 대신 황금 사용`}
                      disabled={
                        busy ||
                        preview.payment[k] === 0 ||
                        preview.payment.GOLD >= mine.tokens.GOLD
                      }
                      onClick={() =>
                        setChosenPayment({
                          ...preview.payment,
                          [k]: preview.payment[k] - 1,
                        })
                      }
                    >
                      −
                    </button>
                    <b>{preview.payment[k]}</b>
                    <button
                      aria-label={`${TOKEN_LABELS[k]} 지불 늘리기`}
                      disabled={
                        busy ||
                        preview.payment[k] >=
                          Math.min(preview.cost[k], mine.tokens[k])
                      }
                      onClick={() =>
                        setChosenPayment({
                          ...preview.payment,
                          [k]: preview.payment[k] + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className="sp-payment-total">
                <Gem color="GOLD" />
                <span>
                  황금 {preview.payment.GOLD} / 보유 {mine.tokens.GOLD}
                </span>
              </div>
              <p className={preview.can ? "sp-payment-ok" : "sp-error"}>
                {preview.can
                  ? tokenTotal(preview.payment) === 0
                    ? "할인으로 무료 구매"
                    : "표시된 보석을 지불합니다. − 버튼으로 황금을 대신 쓸 수 있어요."
                  : `보석이 ${preview.shortage}개 부족합니다.`}
              </p>
            </div>
          )}
          {(selection?.kind === "DECK" || (selectedCard && !buying)) && (
            <div className="sp-reserve-preview">
              <Gem color="GOLD" />
              <p>
                {game?.bank.GOLD
                  ? "황금 1개와 함께 예약합니다."
                  : "황금이 없어 카드만 예약합니다."}
              </p>
              <span>
                내 예약 {mine?.reservedCount ?? 0} →{" "}
                {(mine?.reservedCount ?? 0) + 1} / 3
              </span>
              {!reserveOK && (
                <p className="sp-error">예약 카드가 가득 찼습니다.</p>
              )}
              {selection?.kind === "DECK" && (
                <p>카드 내용은 예약을 확정한 뒤 나에게만 보입니다.</p>
              )}
            </div>
          )}
          {selection?.kind === "TAKE" && (
            <div className="sp-selected-gems">
              {SPLENDOR_COLORS.filter((k) => take[k] > 0).map((k) => (
                <TokenBadge key={k} color={k} count={take[k]} />
              ))}
            </div>
          )}
          {excess > 0 && (
            <section className="sp-return">
              <h3>돌려줄 보석 {excess}개 선택</h3>
              <div className="sp-return-tokens">
                {SPLENDOR_TOKENS.filter((k) => after[k] > 0).map((k) => (
                  <button
                    key={k}
                    aria-label={`${TOKEN_LABELS[k]} 반환 ${returns[k]}개, 누르면 수량 변경`}
                    aria-pressed={returns[k] > 0}
                    onClick={() =>
                      setReturns((r) => ({
                        ...r,
                        [k]:
                          r[k] >= Math.min(after[k], excess) ||
                          tokenTotal(r) >= excess
                            ? 0
                            : r[k] + 1,
                      }))
                    }
                    disabled={busy}
                  >
                    <Gem color={k} />
                    <b>{returns[k]}</b>
                    <small>보유 {after[k]}</small>
                  </button>
                ))}
              </div>
              <p>
                {tokenTotal(returns)} / {excess}개 선택
              </p>
            </section>
          )}
          {eligible.length > 0 && (
            <section className="sp-noble-choice">
              <h3>
                {eligible.length === 1
                  ? "귀족의 후원을 받습니다"
                  : "후원받을 귀족을 고르세요"}
              </h3>
              <div>
                {eligible.map((n) => (
                  <button
                    key={n.nobleId}
                    className="sp-noble"
                    aria-label={`귀족 ${n.portrait + 1} 선택, 3점`}
                    aria-pressed={
                      eligible.length === 1 || nobleId === n.nobleId
                    }
                    onClick={() => setNobleId(n.nobleId)}
                    disabled={busy}
                  >
                    <NobleFace noble={n} />
                  </button>
                ))}
              </div>
            </section>
          )}
          {eligibleCities.length > 0 && <section className="sp-city-choice">
            <h3>{eligibleCities.length === 1 ? "도시의 초대를 받습니다" : "획득할 도시를 고르세요"}</h3>
            <p>도시를 획득하면 이번 라운드가 마지막입니다.</p>
            <div>{eligibleCities.map(city => <button key={city.cityId} className="sp-city"
              aria-label={`${cityLabel(city)} 선택`} aria-pressed={eligibleCities.length === 1 || city.cityId === cityId}
              disabled={busy} onClick={() => setCityId(city.cityId)}><CityFace city={city}/></button>)}</div>
          </section>}
          {error && (
            <p className="sp-error" role="alert">
              {error}
            </p>
          )}
          {retry ? (
            <button
              className="sp-primary"
              disabled={!props.connected || busy}
              onClick={() => void send(retry)}
            >
              {busy ? "처리 중…" : "같은 요청 다시 확인"}
            </button>
          ) : (
            <button
              className="sp-primary"
              disabled={!canAct || !selectionOK || !returnOK || !nobleOK || !cityOK}
              onClick={confirm}
            >
              {!props.connected
                ? "연결 복구 중"
                : playing?.activePlayerId !== self
                  ? "다른 상인의 차례"
                  : busy
                    ? "처리 중…"
                    : !returnOK
                      ? "돌려줄 보석을 선택하세요"
                      : !nobleOK
                        ? "귀족을 선택하세요"
                        : !cityOK
                          ? "도시를 선택하세요"
                        : buying
                          ? "구매 확정"
                          : "선택 확정"}
            </button>
          )}
        </div>
      </dialog>
      <dialog ref={cityDialog} className="sp-help-dialog" aria-labelledby="sp-city-title" onCancel={() => setInspectedCity(null)}>
        <div className="sp-dialog-content"><header><span className="sp-eyebrow">A CITY AWAITS</span><button className="sp-close" aria-label="도시 목표 닫기" onClick={() => setInspectedCity(null)}>×</button></header>
          {inspectedCity && <><h2 id="sp-city-title">도시 {inspectedCity.tile}의 초대</h2><div className="sp-city sp-city-preview"><CityFace city={inspectedCity}/></div>
            <p>{cityLabel(inspectedCity)}</p>
            <p>명성과 영구 할인을 모두 갖추면 턴 끝에 도시를 획득합니다. 보유 보석은 조건에 포함되지 않습니다.</p>
            {displayedCities.find(c => c.city.cityId === inspectedCity.cityId)?.owner ? <p>이미 획득한 도시입니다. 다른 도시를 목표로 해보세요.</p> : <p>여러 도시를 동시에 달성하면 하나를 선택합니다. 도시 획득 후에는 현재 라운드를 끝까지 진행합니다.</p>}
            <p>도시를 획득한 상인끼리 점수를 비교합니다. 동점이면 구매 카드가 적은 상인이, 다시 같으면 함께 승리합니다.</p>
            <small>이 안내를 읽는 동안에도 턴 시간은 흐릅니다.</small></>}
        </div>
      </dialog>
      <dialog
        ref={helpDialog}
        className="sp-help-dialog"
        aria-labelledby="sp-help-title"
        onCancel={() => setHelp(false)}
      >
        <div className="sp-dialog-content">
          <header>
            <span className="sp-eyebrow">HOW TO PLAY</span>
            <button
              className="sp-close"
              onClick={() => setHelp(false)}
              aria-label="게임 방법 닫기"
            >
              ×
            </button>
          </header>
          <h2 id="sp-help-title">{citiesMode ? "보석 → 상단 → 도시" : "보석 → 카드 → 명성"}</h2>
          <div className="sp-help-visual">
            <Gem color="BLUE" />
            <span>→</span>
            <span>▱</span>
            <span>→</span>
            <b>{citiesMode ? "♜" : "✦ 15"}</b>
          </div>
          <ol>
            <li>
              서로 다른 보석 3개, 또는 은행에 4개 이상 남은 같은 색 2개를
              가져옵니다. 가능한 색이 부족하면 그만큼만 가져옵니다.
            </li>
            <li>
              카드를 사면 해당 색 영구 할인 +1. 카드 가격에서 할인만큼 빼고
              지불합니다. 황금은 어떤 보석이든 대신할 수 있습니다.
            </li>
            <li>
              공개 카드 또는 덱에서 예약하면 황금 1개를 받습니다. 예약은 최대
              3장, 황금이 없어도 예약 가능합니다.
            </li>
            <li>보석은 황금 포함 최대 10개. 초과분은 선택해 반환합니다.</li>
            {citiesMode ? <><li>귀족 대신 도시 3개가 펼쳐집니다. 표시된 명성과 영구 할인을 모두 달성하면 턴 끝에 도시를 획득합니다. ◇는 한 가지 색 할인 조건이며, 지정된 색과 다른 색이어야 합니다.</li>
              <li>도시를 여러 개 달성하면 하나를 선택합니다. 누군가 도시를 획득하면 라운드를 끝까지 진행하고, 도시를 가진 상인 중 최고점이 승리합니다. 동점이면 구매 카드가 적은 상인이, 다시 같으면 함께 승리합니다. 15점만으로는 게임이 끝나지 않습니다.</li></> : <><li>귀족에 표시된 만큼 할인 카드를 모으면 3점. 한 턴에 한 귀족만 얻습니다.</li><li>누군가 15점에 도달하면 같은 라운드를 마친 뒤 최고점 승리. 동점은 구매 카드가 더 적은 사람이 승리하며 다시 같으면 공동 승리입니다.</li></>}
          </ol>
          <p>
            차례당 90초 · 시간초과는 턴 넘김 · 3라운드 연속 행동이 없으면 종료 ·
            명시적으로 나가면 판 취소
          </p>
          <p>이 안내를 읽는 동안에도 턴 시간은 흐릅니다.</p>
        </div>
      </dialog>
    </main>
  );
}
