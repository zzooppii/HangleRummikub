import { useEffect, useMemo, useRef, useState } from "react";
import {
  PROTOCOL_VERSION,
  BURGUNDY_BOARDS,
  BURGUNDY_BUILDINGS,
  burgundyBoard,
  burgundyPlacementReason,
  type BurgundyAction,
  type BurgundyClientCommand,
  type BurgundyProjection,
  type BurgundyTile,
  type TileId,
} from "@hangul-rummikub/shared";
import type { BurgundyWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { BurgundyCommandRejected } from "../../lib/burgundy-command-error.js";
import { BurgundyBoard } from "./BurgundyBoard.js";
import { BurgundyDie, BurgundyTileArt } from "./art.js";
import {
  BURGUNDY_NAMES,
  burgundyKnowledge,
  burgundyPendingLabel,
  burgundyPreviewWorkers,
  burgundyTileName,
  burgundyTileText,
} from "./ui.js";
import { useBurgundyClock } from "./use-burgundy-clock.js";
import { useBurgundySound } from "./sound.js";
import { BurgundyExpansions } from "./BurgundyExpansions.js";
type Props = {
  snapshot: BurgundyWebSnapshot;
  connected: boolean;
  pending: boolean;
  error: string | null;
  connectionLabel: string;
  onCommand(command: BurgundyClientCommand): Promise<void>;
  onRematch(): void;
  onStart(): void;
  onLeave(): void;
  onCopy(): void;
};
const expansionOptions = [
  ["extraTiles", "추가 타일", "크레인·거위·지식 27·28"],
  ["whiteCastles", "하얀 성", "흰 주사위로 추가 행동"],
  ["inns", "여관", "색에 구애받지 않는 배치"],
  ["borderPosts", "국경 초소", "영지 가장자리 연결 경쟁"],
  ["tradeRoutes", "무역로", "상품 판매로 얻는 보너스"],
  ["shields", "문장", "성에 붙이는 특별한 능력"],
  ["extraDuchies", "추가 영지", "다양한 영지 지도 선택"],
] as const;
export function BurgundyScreen(props: Props) {
  const s = props.snapshot,
    sound = useBurgundySound(s.game, s.self.playerId, props.connected);
  return (
    <section
      className="bu-screen"
      aria-label="버건디의 성"
      onPointerDownCapture={sound.unlock}
      onKeyDownCapture={sound.unlock}
    >
      <header className="bu-header">
        <div>
          <span className="bu-eyebrow">THE CASTLES OF BURGUNDY</span>
          <h1>
            버건디의 성 <small>20주년판</small>
          </h1>
        </div>
        <div className="bu-room-tools">
          <span>방 {s.room.roomCode}</span>
          <span className="bu-connection">{props.connectionLabel}</span>
          <details className="bu-audio">
            <summary>{sound.volume ? "소리 켜짐" : "소리 꺼짐"}</summary>
            <label>
              효과음{" "}
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={sound.volume}
                onChange={(e) => sound.changeVolume(Number(e.target.value))}
              />
              {sound.volume}%
            </label>
            <button
              type="button"
              onClick={() => sound.changeVolume(sound.volume ? 0 : 50)}
            >
              {sound.volume ? "음소거" : "소리 켜기"}
            </button>
            <button type="button" onClick={() => sound.play("TURN")}>
              들어보기
            </button>
          </details>
          <button type="button" onClick={props.onCopy}>
            초대
          </button>
          <button
            type="button"
            onClick={props.onLeave}
            disabled={props.pending}
          >
            나가기
          </button>
        </div>
      </header>
      {props.error ? (
        <p className="bu-error" role="alert">
          {props.error}
        </p>
      ) : null}
      {s.game === null ? (
        <BurgundyLobby {...props} />
      ) : (
        <BurgundyTable
          key={s.game.gameId}
          {...props}
          game={s.game}
          onSelect={() => sound.play("SELECT")}
        />
      )}
    </section>
  );
}
function BurgundyLobby(props: Props) {
  const s = props.snapshot;
  const [settings, setSettings] = useState(s.room.settings),
    [sending, setSending] = useState(false),
    [error, setError] = useState<string | null>(null);
  const ref = useRef<BurgundyClientCommand | null>(null);
  useEffect(() => {
    setSettings(s.room.settings);
  }, [s.room.settings]);
  const control = getGameStartControl(
    s,
    props.pending || sending || !props.connected,
  );
  const dirty = JSON.stringify(settings) !== JSON.stringify(s.room.settings);
  async function save() {
    if (sending) return;
    setSending(true);
    setError(null);
    const command: BurgundyClientCommand = ref.current ?? {
      protocolVersion: PROTOCOL_VERSION,
      requestId: createRequestId(),
      kind: "burgundy:configure",
      expectedRoomRevision: s.versions.roomRevision,
      payload: settings,
    };
    ref.current = command;
    try {
      await props.onCommand(command);
      ref.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정을 저장하지 못했습니다.");
      if (e instanceof BurgundyCommandRejected) ref.current = null;
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="bu-lobby">
      <div className="bu-lobby-scene">
        <div>
          <span className="bu-eyebrow">YOUR DUCHY AWAITS</span>
          <h2>
            두 개의 주사위.
            <br />
            당신만의 풍요로운 영지.
          </h2>
          <p>
            성을 세우고, 강을 따라 교역하고,
            <br />
            작은 선택을 큰 번영으로 이어가세요.
          </p>
          <span className="bu-tag">2–4인 · 개인전</span>
        </div>
      </div>
      <div className="bu-lobby-settings">
        <h2>함께할 공작들</h2>
        <div className="bu-seats">
          {s.room.players.map((p, i) => (
            <div key={p.playerId}>
              <b className={`bu-player-color bu-player-${i}`}>{i + 1}</b>
              <strong>{p.nickname}</strong>
              <span>
                {p.isHost ? "방장 · " : ""}
                {p.connectionStatus === "CONNECTED" ? "접속 중" : "연결 대기"}
              </span>
            </div>
          ))}
        </div>
        <fieldset
          disabled={
            !control.isHost ||
            sending ||
            !props.connected ||
            ref.current !== null
          }
        >
          <legend>이번 게임 설정</legend>
          <div className="bu-settings-row">
            <label>
              한 차례 시간
              <select
                value={settings.turnSeconds}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v === 30 || v === 60 || v === 90)
                    setSettings({ ...settings, turnSeconds: v });
                }}
              >
                {[30, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n}초
                  </option>
                ))}
              </select>
            </label>
            <label>
              공통 영지
              <select
                value={settings.boardId}
                onChange={(e) => {
                  const boardId = Number(e.target.value);
                  setSettings({
                    ...settings,
                    boardId,
                    borderPosts: !!BURGUNDY_BOARDS.find((b) => b.id === boardId)
                      ?.borderPostGroups,
                  });
                }}
              >
                {BURGUNDY_BOARDS.filter(
                  (b) => settings.extraDuchies || b.id <= 10,
                ).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="bu-muted">
            시간이 끝나면 남은 주사위로 일꾼을 얻고 차례를 마칩니다.
          </p>
          <h3>확장 선택</h3>
          <div className="bu-expansion-settings">
            {expansionOptions.map(([key, label, description]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      [key]: e.target.checked,
                      ...(key === "borderPosts"
                        ? e.target.checked
                          ? {
                              extraDuchies: true,
                              boardId:
                                BURGUNDY_BOARDS.find((b) => b.borderPostGroups)
                                  ?.id ?? settings.boardId,
                            }
                          : { boardId: 1 }
                        : {}),
                      ...(key === "extraDuchies" && !e.target.checked
                        ? { boardId: 1, borderPosts: false }
                        : {}),
                    })
                  }
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p className="bu-error" role="alert">
            {error}
          </p>
        ) : null}
        {control.isHost ? (
          <button
            type="button"
            className="bu-secondary"
            onClick={() => void save()}
            disabled={sending || !props.connected || (!dirty && !ref.current)}
          >
            {ref.current
              ? "설정 저장 재확인"
              : sending
                ? "저장 중…"
                : "설정 적용"}
          </button>
        ) : null}
        <p>{control.guidance}</p>
        <button
          type="button"
          className="bu-primary bu-start"
          disabled={!control.canStart || dirty || !!ref.current}
          onClick={props.onStart}
        >
          {dirty ? "설정을 먼저 적용하세요" : "게임 시작"}
        </button>
      </div>
    </div>
  );
}
function BurgundyTable(
  props: Props & { game: BurgundyProjection; onSelect(): void },
) {
  const { game: g, snapshot: s } = props;
  const self = g.playerStates.find((p) => p.playerId === s.self.playerId)!;
  const [viewed, setViewed] = useState(s.self.playerId);
  const [mobileTab, setMobileTab] = useState<"estate" | "market">("estate");
  const [die, setDie] = useState<0 | 1>(0),
    [value, setValue] = useState(1),
    [mode, setMode] = useState<"TAKE" | "PLACE" | "SELL" | "WORKERS" | "BUY">(
      "TAKE",
    );
  const [tile, setTile] = useState<BurgundyTile | null>(null),
    [cell, setCell] = useState<string | null>(null),
    [discard, setDiscard] = useState<TileId | undefined>();
  const [inspect, setInspect] = useState<BurgundyTile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [uncertain, setUncertain] = useState(false),
    [payWorkers, setPayWorkers] = useState<0 | 1 | 2>(0);
  const actionPanel = useRef<HTMLElement>(null);
  const retry = useRef<BurgundyClientCommand | null>(null),
    sending = useRef(false);
  const seconds = useBurgundyClock(
    s.serverTime,
    g.phase === "PLAYING" ? g.deadlineAt : null,
  );
  const pending = g.pending[0];
  const myTurn = g.phase === "PLAYING" && g.activePlayerId === s.self.playerId;
  const enabled =
    myTurn &&
    props.connected &&
    !busy &&
    !props.pending &&
    !uncertain &&
    seconds > 0;
  const known = burgundyKnowledge(g, self);
  const activeName = (id: string) =>
    s.room.players.find((p) => p.playerId === id)?.nickname ?? "플레이어";
  const scope = `${g.gameId}:${g.gameRevision}`;
  useEffect(() => {
    setTile(null);
    setCell(null);
    setDiscard(undefined);
    setError(null);
    const index = self.dice[0].used ? 1 : 0;
    setDie(index);
    setValue(self.dice[index].value);
  }, [scope]);
  useEffect(() => {
    if (g.phase === "PLAYING" && g.activePlayerId === s.self.playerId)
      setViewed(s.self.playerId);
  }, [g.phase === "PLAYING" ? g.turnId : "finished"]);
  async function send(action?: BurgundyAction) {
    if (sending.current || !props.connected) return;
    if (action && !enabled) return;
    const command: BurgundyClientCommand | null =
      action && g.phase === "PLAYING"
        ? {
            protocolVersion: PROTOCOL_VERSION,
            requestId: createRequestId(),
            kind: "burgundy:act" as const,
            gameId: g.gameId,
            expectedGameRevision: g.gameRevision,
            turnId: g.turnId,
            payload: action,
          }
        : retry.current;
    if (!command) return;
    sending.current = true;
    retry.current = command;
    setBusy(true);
    setError(null);
    try {
      await props.onCommand(command);
      retry.current = null;
      setUncertain(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "행동을 처리하지 못했습니다.");
      if (e instanceof BurgundyCommandRejected) {
        retry.current = null;
        setUncertain(false);
      } else setUncertain(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const viewedPlayer =
    g.playerStates.find((p) => p.playerId === viewed) ?? self;
  const legalCells = useMemo(
    () =>
      new Set(
        tile && mode === "PLACE" && viewedPlayer.playerId === self.playerId
          ? burgundyBoard(self.boardId)
              .cells.filter(
                (c) => !burgundyPlacementReason(self, tile, c.id, known),
              )
              .map((c) => c.id)
          : [],
      ),
    [tile, mode, viewedPlayer, self, known],
  );
  const selectedCell = cell
    ? burgundyBoard(self.boardId).cells.find((c) => c.id === cell)
    : null;
  const effectiveValue =
    mode === "PLACE" && selectedCell ? selectedCell.die : value;
  const cost =
    (pending?.type === "ACTION" && pending.die === null) ||
    (pending && pending.type !== "ACTION")
      ? 0
      : burgundyPreviewWorkers(
          g,
          self,
          die,
          effectiveValue,
          mode === "PLACE" ? "PLACE" : mode === "SELL" ? "SELL" : "TAKE",
          tile ?? undefined,
        );
  function chooseTile(
    t: BurgundyTile,
    origin: "storage" | "depot" | "black",
    depot?: number,
  ) {
    props.onSelect();
    setInspect(t);
    setTile(t);
    setCell(null);
    setMode(
      pending?.type === "SHIELD_PLACE"
        ? "PLACE"
        : pending?.type === "TAKE_BLACK" && origin === "black"
          ? "TAKE"
          : origin === "storage"
            ? "PLACE"
            : origin === "black"
              ? "BUY"
              : "TAKE",
    );
    if (depot) setValue(depot);
    if (origin === "storage" || pending?.type === "SHIELD_PLACE") {
      setViewed(self.playerId);
      setMobileTab("estate");
    }
  }
  function action(): BurgundyAction | null {
    if (mode === "WORKERS")
      return pending?.type === "ACTION"
        ? { type: "EFFECT_WORKERS" }
        : pending
          ? null
          : { type: "WORKERS", die };
    if (mode === "SELL")
      return pending && (pending.type === "SELL" || pending.type === "ACTION")
        ? { type: "EFFECT_SELL", value }
        : pending
          ? null
          : { type: "SELL", die, value };
    if (!tile) return null;
    if (mode === "BUY")
      return {
        type: "BUY",
        tileId: tile.tileId,
        workers: payWorkers,
        ...(discard ? { discardTileId: discard } : {}),
      };
    if (mode === "TAKE")
      return pending
        ? {
            type: "EFFECT_TAKE",
            tileId: tile.tileId,
            value,
            ...(discard ? { discardTileId: discard } : {}),
          }
        : {
            type: "TAKE",
            die,
            value,
            tileId: tile.tileId,
            ...(discard ? { discardTileId: discard } : {}),
          };
    if (mode === "PLACE" && selectedCell)
      return pending?.type === "SHIELD_PLACE"
        ? { type: "SHIELD_PLACE", tileId: tile.tileId, cellId: selectedCell.id }
        : pending
          ? {
              type: "EFFECT_PLACE",
              tileId: tile.tileId,
              cellId: selectedCell.id,
              value: selectedCell.die,
            }
          : {
              type: "PLACE",
              die,
              value: selectedCell.die,
              tileId: tile.tileId,
              cellId: selectedCell.id,
            };
    return null;
  }
  const candidate = action();
  const placementError =
    mode === "PLACE" && tile && cell
      ? burgundyPlacementReason(self, tile, cell, known)
      : null;
  return (
    <>
      <div className="bu-progress">
        <div className="bu-eras">
          {["A", "B", "C", "D", "E"].map((era, i) => (
            <span key={era} className={i === g.phaseIndex ? "bu-current" : ""}>
              {era}
              <b>{10 - 2 * i}</b>
            </span>
          ))}
        </div>
        <div>
          <strong>
            {g.phase === "FINISHED"
              ? "게임 종료"
              : `${activeName(g.activePlayerId)}님의 차례`}
          </strong>
          <span>
            시대 {g.phaseIndex + 1}/5 · 라운드 {g.roundIndex + 1}/5
          </span>
        </div>
        <div
          className={"bu-timer" + (seconds <= 10 ? " bu-urgent" : "")}
          role="timer"
          aria-label={`남은 시간 ${seconds}초`}
        >
          {g.phase === "PLAYING" ? `${seconds}초` : "최종 점수"}
        </div>
        <div className="bu-white-die">
          <BurgundyDie value={g.whiteDie} />
          <small>흰 주사위</small>
        </div>
      </div>
      <div className="bu-players">
        {g.playerStates.map((p, i) => (
          <button
            type="button"
            key={p.playerId}
            aria-pressed={viewed === p.playerId}
            className={
              g.phase === "PLAYING" && g.activePlayerId === p.playerId
                ? "bu-active-player"
                : ""
            }
            onClick={() => {
              setViewed(p.playerId);
              setMobileTab("estate");
            }}
          >
            <b className={`bu-player-color bu-player-${i}`}>{i + 1}</b>
            <span>
              <strong>
                {activeName(p.playerId)}
                {p.playerId === self.playerId ? " · 나" : ""}
              </strong>
              <small>
                은화 {p.silver} · 일꾼 {p.workers}
              </small>
            </span>
            <b className="bu-points">
              {p.score}
              <small>점</small>
            </b>
            <span className="bu-rival-dice">
              {p.dice.map((d, j) => (
                <BurgundyDie key={j} {...d} />
              ))}
            </span>
          </button>
        ))}
      </div>
      {g.phase === "FINISHED" ? (
        <div className="bu-results">
          <h2>
            {g.result.reason === "CANCELLED"
              ? "게임이 취소되었습니다"
              : `${g.result.winnerPlayerIds.map(activeName).join(" · ")} 승리`}
          </h2>
          <div className="bu-result-grid">
            {g.result.scores.map((p) => (
              <div key={p.playerId}>
                <h3>
                  {activeName(p.playerId)} · {p.total}점
                </h3>
                <dl>
                  <dt>게임 중 획득</dt>
                  <dd>{p.base}</dd>
                  <dt>남은 상품</dt>
                  <dd>+{p.goods}</dd>
                  <dt>은화</dt>
                  <dd>+{p.silver}</dd>
                  <dt>일꾼</dt>
                  <dd>+{p.workers}</dd>
                  <dt>지식 보너스</dt>
                  <dd>+{p.knowledge}</dd>
                  <dt>확장 보너스</dt>
                  <dd>+{p.expansion}</dd>
                </dl>
                <details>
                  <summary>게임 중 획득한 점수</summary>
                  <dl>
                    {Object.entries(
                      g.playerStates.find((x) => x.playerId === p.playerId)
                        ?.scoreBreakdown ?? {},
                    ).map(([key, n]) => (
                      <div key={key}>
                        <dt>
                          {(
                            {
                              animals: "동물",
                              regions: "지역 크기",
                              phaseBonus: "시대 보너스",
                              colorBonus: "색 완성",
                              buildings: "건물",
                              goodsSales: "상품 판매",
                              expansion: "확장",
                            } as Record<string, string>
                          )[key] ?? key}
                        </dt>
                        <dd>{n}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            ))}
          </div>
          {s.room.players.find((p) => p.playerId === self.playerId)?.isHost ? (
            <button
              type="button"
              className="bu-primary"
              onClick={props.onRematch}
            >
              대기실로 돌아가기
            </button>
          ) : null}
        </div>
      ) : null}
      <nav className="bu-mobile-tabs" aria-label="보드 보기">
        <button
          type="button"
          aria-pressed={mobileTab === "estate"}
          onClick={() => setMobileTab("estate")}
        >
          영지
        </button>
        <button
          type="button"
          aria-pressed={mobileTab === "market"}
          onClick={() => setMobileTab("market")}
        >
          공동 시장
        </button>
        {g.phase === "PLAYING" ? (
          <button
            type="button"
            onClick={() =>
              actionPanel.current?.scrollIntoView({ block: "start" })
            }
          >
            내 행동
          </button>
        ) : null}
      </nav>
      <div className={`bu-table bu-tab-${mobileTab}`}>
        <section className="bu-market">
          <h2>
            공동 시장 <small>타일을 눌러 효과 확인</small>
          </h2>
          <div className="bu-depots">
            {g.depots.map((tiles, i) => (
              <section
                className={
                  "bu-depot" + (value === i + 1 ? " bu-depot-selected" : "")
                }
                key={i}
              >
                <header>
                  <BurgundyDie value={i + 1} />
                  <strong>{i + 1}번 시장</strong>
                </header>
                <div className="bu-depot-tiles">
                  {tiles.map((t) => (
                    <button
                      type="button"
                      key={t.tileId}
                      aria-pressed={tile?.tileId === t.tileId}
                      onClick={() => chooseTile(t, "depot", i + 1)}
                    >
                      <BurgundyTileArt tile={t} />
                    </button>
                  ))}
                  {tiles.length === 0 ? (
                    <span className="bu-empty">빈 시장</span>
                  ) : null}
                </div>
                <div className="bu-goods">
                  {g.depotGoods[i]!.map((n, j) =>
                    n > 0 ? (
                      <span className={`bu-good bu-good-${j}`} key={j}>
                        {j + 1}
                        <b>×{n}</b>
                      </span>
                    ) : null,
                  )}
                </div>
              </section>
            ))}
          </div>
          <section className="bu-black-market">
            <h3>
              검은 시장 <span>은화 2개 · 차례마다 한 번</span>
            </h3>
            <div className="bu-depot-tiles">
              {[...g.blackDepot, ...g.inns].map((t) => (
                <button
                  type="button"
                  key={t.tileId}
                  aria-pressed={tile?.tileId === t.tileId}
                  onClick={() => chooseTile(t, "black")}
                >
                  <BurgundyTileArt tile={t} />
                </button>
              ))}
            </div>
          </section>
          <div className="bu-bonuses">
            <h3>색 완성 보너스</h3>
            {Object.entries(g.colorFinishers).map(([color, ids]) => (
              <span key={color}>
                {
                  (
                    {
                      CASTLE: "성",
                      SHIP: "배",
                      LIVESTOCK: "동물",
                      MONASTERY: "지식",
                      MINE: "은광",
                      BUILDING: "건물",
                    } as Record<string, string>
                  )[color]
                }{" "}
                <b>
                  {ids.length === 0
                    ? g.playerStates.length + 3
                    : ids.length === 1
                      ? g.playerStates.length
                      : "완료"}
                </b>
              </span>
            ))}
          </div>
        </section>
        <section className="bu-own-estate">
          <h2>
            {activeName(viewedPlayer.playerId)}의 영지{" "}
            {viewedPlayer.playerId !== self.playerId ? (
              <button type="button" onClick={() => setViewed(self.playerId)}>
                내 영지로
              </button>
            ) : null}
          </h2>
          <BurgundyBoard
            player={viewedPlayer}
            selectedCell={viewed === self.playerId ? cell : null}
            selectedTile={tile}
            legalCells={legalCells}
            interactive={
              enabled &&
              mode === "PLACE" &&
              viewedPlayer.playerId === self.playerId
            }
            onCell={(id) => {
              setCell(id);
              props.onSelect();
            }}
            onInspect={setInspect}
          />
          <div className="bu-turn-order">
            <strong>다음 라운드 순서</strong>
            {g.turnOrder.map((id, i) => (
              <span key={id}>
                {i + 1}. {activeName(id)}
              </span>
            ))}
          </div>
          <details className="bu-history">
            <summary>최근 진행 내역</summary>
            {[...g.history].reverse().map((h, i) => (
              <p key={`${h.at}:${i}`}>
                <strong>{activeName(h.playerId)}</strong> {h.message}{" "}
                {h.points ? `+${h.points}점` : ""}
                {h.automatic ? " · 자동" : ""}
              </p>
            ))}
          </details>
        </section>
      </div>
      {g.phase === "PLAYING" ? (
        <section
          ref={actionPanel}
          className="bu-action-panel"
          aria-label="내 차례 행동"
        >
          <div className="bu-action-top">
            <strong>
              {myTurn
                ? burgundyPendingLabel(pending)
                : "다른 플레이어의 차례입니다"}
            </strong>
            <span>
              은화 <b>{self.silver}</b> · 일꾼 <b>{self.workers}</b>
            </span>
          </div>
          <div className="bu-hand">
            <div className="bu-my-dice">
              <span>내 주사위</span>
              {self.dice.map((d, i) => (
                <button
                  type="button"
                  key={i}
                  disabled={d.used || !enabled || !!pending}
                  aria-pressed={die === i}
                  onClick={() => {
                    setDie(i === 0 ? 0 : 1);
                    setValue(d.value);
                    props.onSelect();
                  }}
                >
                  <BurgundyDie {...d} />
                </button>
              ))}
            </div>
            <div className="bu-storage">
              <span>타일 보관함</span>
              {self.storage.map((t) => (
                <button
                  type="button"
                  key={t.tileId}
                  aria-pressed={tile?.tileId === t.tileId}
                  onClick={() => chooseTile(t, "storage")}
                >
                  <BurgundyTileArt tile={t} />
                </button>
              ))}
              {Array.from(
                { length: Math.max(0, 3 - self.storage.length) },
                (_, i) => (
                  <span className="bu-key-space" key={i}>
                    빈칸
                  </span>
                ),
              )}
            </div>
            <div className="bu-goods bu-own-goods">
              {self.goods.map((n, i) =>
                n > 0 ? (
                  <button
                    className={`bu-good bu-good-${i}`}
                    type="button"
                    key={i}
                    onClick={() => {
                      setMode("SELL");
                      setValue(i + 1);
                      setTile(null);
                    }}
                  >
                    {i + 1}
                    <b>×{n}</b>
                  </button>
                ) : null,
              )}
            </div>
          </div>
          {pending?.type === "SHIP" ? (
            <ShipChoice
              game={g}
              enabled={enabled}
              onAction={(a) => void send(a)}
            />
          ) : pending?.type === "CRANE" ? (
            <div className="bu-effect-choices">
              {[
                ...BURGUNDY_BUILDINGS,
                ...(g.settings.whiteCastles ? ["WHITE_CASTLE" as const] : []),
              ].map((b) => (
                <button
                  type="button"
                  key={b}
                  disabled={!enabled}
                  onClick={() => void send({ type: "CRANE", building: b })}
                >
                  {BURGUNDY_NAMES[b]}
                </button>
              ))}
            </div>
          ) : pending?.type === "GEESE" ? (
            <div className="bu-effect-choices">
              {(["SHEEP", "COW", "PIG", "GOAT"] as const).map((a) => (
                <button
                  type="button"
                  key={a}
                  disabled={!enabled}
                  onClick={() => void send({ type: "GEESE", animal: a })}
                >
                  {BURGUNDY_NAMES[a]}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="bu-actions">
                {(["TAKE", "PLACE", "SELL", "WORKERS", "BUY"] as const).map(
                  (m) => (
                    <button
                      type="button"
                      key={m}
                      aria-pressed={mode === m}
                      onClick={() => {
                        setMode(m);
                        if (m !== "BUY") setTile(null);
                        setCell(null);
                      }}
                    >
                      {
                        {
                          TAKE: "타일 가져오기",
                          PLACE: "영지에 배치",
                          SELL: "상품 판매",
                          WORKERS: "일꾼 얻기",
                          BUY: "은화로 구매",
                        }[m]
                      }
                    </button>
                  ),
                )}
                <label>
                  사용할 눈
                  <select
                    value={effectiveValue}
                    disabled={
                      mode === "PLACE" || mode === "WORKERS" || mode === "BUY"
                    }
                    onChange={(e) => setValue(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {tile &&
              (mode === "TAKE" || mode === "BUY") &&
              self.storage.length >= 3 ? (
                <label>
                  보관함에서 버릴 타일
                  <select
                    value={discard ?? ""}
                    onChange={(e) =>
                      setDiscard(
                        self.storage.find((t) => t.tileId === e.target.value)
                          ?.tileId,
                      )
                    }
                  >
                    <option value="">버릴 타일 선택</option>
                    {self.storage.map((t) => (
                      <option key={t.tileId} value={t.tileId}>
                        {burgundyTileName(t)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="bu-confirm-row">
                <p>
                  {placementError ??
                    (mode === "BUY"
                      ? `은화 ${2 - (known.includes(6) ? payWorkers : 0)}개 · 일꾼 ${known.includes(6) ? payWorkers : 0}명${self.purchased ? " · 이번 차례 구매 완료" : ""}`
                      : mode === "WORKERS"
                        ? `일꾼 ${known.includes(14) ? 4 : 2}명 획득`
                        : `일꾼 ${cost}명 사용`)}
                  {tile ? ` · ${burgundyTileName(tile)}` : ""}
                  {selectedCell ? ` · ${selectedCell.die}번 칸` : ""}
                </p>
                <button
                  type="button"
                  className="bu-primary"
                  disabled={!enabled || !candidate || !!placementError}
                  onClick={() => candidate && void send(candidate)}
                >
                  행동 확정
                </button>
                {pending && pending.type !== "ACTION" ? (
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => void send({ type: "SKIP_EFFECT" })}
                  >
                    추가 효과 건너뛰기
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={
                    !enabled || !!pending || self.dice.some((d) => !d.used)
                  }
                  onClick={() => void send({ type: "END_TURN" })}
                >
                  차례 마치기
                </button>
              </div>
            </>
          )}
          {known.includes(6) ? (
            <label>
              지식 6 · 구매에 사용할 일꾼
              <select
                value={payWorkers}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n === 0 || n === 1 || n === 2) setPayWorkers(n);
                }}
              >
                <option value="0">은화 2개</option>
                <option value="1">은화 1개 + 일꾼 1명</option>
                <option value="2">일꾼 2명</option>
              </select>
            </label>
          ) : null}
          {known.includes(28) ? (
            <button
              type="button"
              disabled={!enabled || self.silver < 1}
              onClick={() => void send({ type: "BUY_WORKERS", silver: 1 })}
            >
              지식 28 · 은화 1개로 일꾼 2명
            </button>
          ) : null}
          <BurgundyExpansions
            game={g}
            self={self}
            enabled={enabled}
            die={die}
            value={value}
            cellId={cell}
            tile={tile}
            onAction={(a) => void send(a)}
          />
          {error ? (
            <p className="bu-error" role="alert">
              {error}
            </p>
          ) : null}
          {uncertain ? (
            <div role="status">
              응답을 확인하지 못했습니다. 같은 요청으로 결과를 재확인하세요.
              <button
                type="button"
                disabled={busy || !props.connected}
                onClick={() => void send()}
              >
                결과 재확인
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {inspect ? (
        <aside className="bu-inspector" aria-label="타일 설명">
          <BurgundyTileArt tile={inspect} />
          <div>
            <strong>{burgundyTileName(inspect)}</strong>
            <p>{burgundyTileText(inspect)}</p>
          </div>
          <button
            type="button"
            aria-label="타일 설명 닫기"
            onClick={() => setInspect(null)}
          >
            ×
          </button>
        </aside>
      ) : null}
      <details className="bu-help">
        <summary>규칙과 조작 도움말</summary>
        <p>
          주사위를 고르고 시장 타일을 가져오거나, 보관함의 타일을 눌러 영지에
          배치하세요. 타일은 같은 색·맞는 숫자의 빈칸에 기존 영지와 이어
          놓습니다. 필요한 일꾼 비용은 확정 전에 표시됩니다.
        </p>
        <p>
          지역 완성: 크기 점수 1·3·6·10·15·21·28·36 + 시대 보너스 10·8·6·4·2.
          같은 색 전체 완성은 먼저 완성한 두 명에게 보너스가 있습니다.
        </p>
        <p>
          두 주사위 사용 후 검은 시장 구매를 마쳤으면 ‘차례 마치기’를 누르세요.
          시간은 확정한 행동 사이에도 계속 흐릅니다.
        </p>
      </details>
    </>
  );
}
function ShipChoice({
  game: g,
  enabled,
  onAction,
}: {
  game: BurgundyProjection;
  enabled: boolean;
  onAction(a: BurgundyAction): void;
}) {
  const [depot, setDepot] = useState(1),
    [adjacent, setAdjacent] = useState<number | undefined>(),
    [types, setTypes] = useState<number[]>([]),
    [shieldType, setShieldType] = useState<number | undefined>();
  const p =
    g.phase === "PLAYING"
      ? g.playerStates.find((x) => x.playerId === g.activePlayerId)
      : null;
  const known = p ? burgundyKnowledge(g, p) : [];
  const ownedTypes = p?.goods.flatMap((n, i) => (n > 0 ? [i + 1] : [])) ?? [];
  useEffect(() => {
    const available = [1, 2, 3, 4, 5, 6].filter(
      (n) =>
        g.depotGoods[depot - 1]![n - 1]! +
          (adjacent ? g.depotGoods[adjacent - 1]![n - 1]! : 0) >
          0 && !ownedTypes.includes(n),
    );
    setTypes(available.slice(0, Math.max(0, 3 - ownedTypes.length)));
    setShieldType(undefined);
  }, [depot, adjacent, g.gameRevision]);
  return (
    <div className="bu-ship-choice">
      <label>
        상품을 가져올 시장
        <select
          value={depot}
          onChange={(e) => {
            setDepot(Number(e.target.value));
            setAdjacent(undefined);
            setTypes([]);
          }}
        >
          {g.depotGoods.map((goods, i) => (
            <option key={i} value={i + 1}>
              {i + 1}번 · 상품 {goods.reduce((a, b) => a + b, 0)}개
            </option>
          ))}
        </select>
      </label>
      {known.includes(5) ? (
        <label>
          인접 시장
          <select
            value={adjacent ?? ""}
            onChange={(e) =>
              setAdjacent(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">추가하지 않음</option>
            {[((depot + 4) % 6) + 1, (depot % 6) + 1].map((n) => (
              <option key={n} value={n}>
                {n}번
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="bu-effect-choices">
        {[1, 2, 3, 4, 5, 6]
          .filter(
            (n) =>
              g.depotGoods[depot - 1]![n - 1]! +
                (adjacent ? g.depotGoods[adjacent - 1]![n - 1]! : 0) >
              0,
          )
          .map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                checked={ownedTypes.includes(n) || types.includes(n)}
                disabled={
                  ownedTypes.includes(n) ||
                  (!types.includes(n) && ownedTypes.length + types.length >= 3)
                }
                onChange={(e) =>
                  setTypes(
                    e.target.checked
                      ? [...types, n]
                      : types.filter((x) => x !== n),
                  )
                }
              />
              {n}번 상품
            </label>
          ))}
      </div>
      {p?.extension.shields.some((s) => s.shieldId === 5) ? (
        <label>
          문장 5 · 모든 시장에서 가져올 상품
          <select
            value={shieldType ?? ""}
            onChange={(e) =>
              setShieldType(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">추가하지 않음</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}번 상품
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <p className="bu-muted">
        최대 세 종류를 보관합니다. 보관 가능한 상품 종류를 선택하세요.
      </p>
      <button
        type="button"
        className="bu-primary"
        disabled={!enabled}
        onClick={() =>
          onAction({
            type: "SHIP_GOODS",
            depot,
            ...(adjacent ? { adjacentDepot: adjacent } : {}),
            ...(shieldType ? { shieldType } : {}),
            types,
          })
        }
      >
        상품 가져오기
      </button>
    </div>
  );
}
