import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CARCASSONNE_CATALOG,
  CARCASSONNE_FEATURE_LABELS,
  CARCASSONNE_TILE_KINDS,
  PROTOCOL_VERSION,
  analyzeCarcassonneBoard,
  carcassonneRegionKey,
  rotateCarcassonnePoint,
  type CarcassonneBoardTile,
  type CarcassonneClientCommand,
  type CarcassonneProjection,
  type CarcassonneRotation,
} from "@hangul-rummikub/shared";
import type { CarcassonneWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { CarcassonneCommandRejected } from "../../lib/carcassonne-command-error.js";
import { CarcassonneMeepleArt, CarcassonneTileArt } from "./art.js";
import { CarcassonneBoard } from "./CarcassonneBoard.js";
import {
  CARCASSONNE_PLAYER_COLORS,
  describeCarcassonneFeature,
  nextCarcassonneRotation,
  previewCarcassonne,
  type CarcassonneDraft,
} from "./ui.js";
import { useCarcassonneSound } from "./sound.js";
import { useCarcassonneClock } from "./use-carcassonne-clock.js";
type Props = Readonly<{
  snapshot: CarcassonneWebSnapshot;
  connected: boolean;
  pending: boolean;
  error: string | null;
  connectionLabel: string;
  onCommand(command: CarcassonneClientCommand): Promise<void>;
  onRematch(): void;
  onStart(): void;
  onLeave(): void;
  onCopy(): void;
}>;
export function CarcassonneScreen(props: Props) {
  const s = props.snapshot,
    start = getGameStartControl(s, props.pending || !props.connected),
    sound = useCarcassonneSound(s.game, s.self.playerId, props.connected);
  return (
    <section
      className={
        "cc-screen" + (s.game ? " cc-playing-screen" : " cc-lobby-screen")
      }
      aria-label="카르카손"
      onPointerDownCapture={sound.unlock}
      onKeyDownCapture={sound.unlock}
    >
      <header className="cc-header">
        <div className="cc-brand">
          <span className="cc-eyebrow">A LANDSCAPE, TOGETHER</span>
          <h1>
            CARCASSONNE <span>카르카손</span>
          </h1>
        </div>
        <div className="cc-room-tools">
          <span className="cc-room-code">방 {s.room.roomCode}</span>
          <span className="cc-connection" role="status">
            {props.connectionLabel}
          </span>
          <details className="cc-audio">
            <summary>{sound.volume === 0 ? "소리 꺼짐" : "소리 켜짐"}</summary>
            <div>
              <label>
                효과음{" "}
                <input
                  type="range"
                  aria-label="카르카손 효과음 볼륨"
                  min="0"
                  max="100"
                  step="5"
                  value={sound.volume}
                  onChange={(e) => sound.changeVolume(Number(e.target.value))}
                />
                <output>{sound.volume}%</output>
              </label>
              <button
                type="button"
                onClick={() => sound.changeVolume(sound.volume ? 0 : 65)}
              >
                {sound.volume ? "음소거" : "소리 켜기"}
              </button>
              <button type="button" onClick={() => sound.play("TURN")}>
                소리 들어보기
              </button>
            </div>
          </details>
          <button type="button" onClick={props.onCopy} disabled={props.pending}>
            초대 링크
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
      {props.error && (
        <p className="cc-error" role="alert">
          {props.error}
        </p>
      )}
      {s.game === null ? (
        <div className="cc-lobby">
          <div className="cc-lobby-story">
            <span className="cc-eyebrow">EVERY TILE TELLS A STORY</span>
            <h2>
              한 조각씩,
              <br />
              우리의 세계가 됩니다.
            </h2>
            <p>
              길을 잇고, 성을 완성하고, 들판을 차지하세요.
              <br />
              작은 미플 하나로 시작하는 커다란 이야기.
            </p>
            <div className="cc-lobby-tags">
              <span>2–5인</span>
              <span>기본판 · 농부 포함</span>
              <span>턴마다 90초</span>
            </div>
          </div>
          <div className="cc-lobby-table">
            <div className="cc-tile-fan" aria-hidden="true">
              {(["M", "D", "B", "V"] as const).map((kind, i) => (
                <div key={kind} style={{ "--cc-i": i } as CSSProperties}>
                  <CarcassonneTileArt kind={kind} />
                </div>
              ))}
            </div>
            <div className="cc-lobby-seats">
              {s.room.players.map((p, i) => (
                <div key={p.playerId}>
                  <CarcassonneMeepleArt
                    color={CARCASSONNE_PLAYER_COLORS[i % 5]!}
                    number={i + 1}
                  />
                  <strong>{p.nickname}</strong>
                  <span>
                    {p.isHost ? "방장 · " : ""}
                    {p.connectionStatus === "CONNECTED"
                      ? "접속 중"
                      : "재접속 대기"}
                  </span>
                </div>
              ))}
            </div>
            <p className="cc-start-guidance">{start.guidance}</p>
            <button
              type="button"
              className="cc-primary cc-start"
              onClick={props.onStart}
              disabled={!start.canStart}
            >
              우리의 지도 시작하기 <span>→</span>
            </button>
          </div>
        </div>
      ) : (
        <CarcassonneTable
          key={s.game.gameId}
          game={s.game}
          sound={sound}
          {...props}
        />
      )}
      <details className="cc-guide">
        <summary>
          처음 오셨나요? <span>카르카손 플레이 가이드</span>
        </summary>
        <div className="cc-guide-grid">
          <div>
            <b>01 · 땅을 이어주세요</b>
            <p>
              이번 타일을 회전하고 빈칸을 고릅니다. 맞닿은 모든 면에서
              도시·도로·들판이 이어져야 합니다.
            </p>
          </div>
          <div>
            <b>02 · 미플을 보내세요</b>
            <p>
              새 타일의 빈 영역 하나에 미플을 놓거나 생략합니다. 멀리 이어진
              같은 영역에도 누구의 미플이 없어야 합니다.
            </p>
          </div>
          <div>
            <b>03 · 완성하면 점수!</b>
            <p>
              도로는 타일당 1점, 도시는 타일·방패당 2점, 수도원은 주변 8칸까지
              채우면 9점입니다. 완성한 미플은 돌아옵니다.
            </p>
          </div>
          <div>
            <b>04 · 들판은 마지막에</b>
            <p>
              누운 농부는 게임이 끝날 때까지 남습니다. 연결된 들판의 완성
              도시마다 3점. 최다 미플 동률이면 각자 전체 점수를 받습니다.
            </p>
          </div>
        </div>
        <p>
          마지막 타일 후 미완성 도로·도시는 타일당 1점(방패 +1), 수도원은 자신과
          주변 타일 수, 들판을 정산합니다. 90초가 끝나면 서버가 타일만 자동
          배치합니다. 연결이 끊겨도 시간은 흐르며, 나가기 버튼은 게임을
          취소합니다.
        </p>
        <details className="cc-catalog">
          <summary>기본 타일 24종 · 전체 72장 보기</summary>
          <div>
            {CARCASSONNE_TILE_KINDS.map((kind) => (
              <figure key={kind}>
                <CarcassonneTileArt kind={kind} />
                <figcaption>
                  {kind} · {CARCASSONNE_CATALOG[kind].count}장
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      </details>
    </section>
  );
}
function CarcassonneTable({
  game: g,
  sound,
  ...props
}: Props & {
  game: CarcassonneProjection;
  sound: ReturnType<typeof useCarcassonneSound>;
}) {
  const selfId = props.snapshot.self.playerId,
    people = props.snapshot.room.players,
    nickname = (id: string) =>
      people.find((p) => p.playerId === id)?.nickname ?? "플레이어";
  const scope =
    g.gameId + ":" + (g.phase === "PLAYING" ? g.turnId : "finished");
  const [selection, setSelection] = useState<{
    scope: string;
    rotation: CarcassonneRotation;
    draft: CarcassonneDraft | null;
  }>({ scope, rotation: 0, draft: null });
  const rotation = selection.scope === scope ? selection.rotation : 0,
    draft = selection.scope === scope ? selection.draft : null;
  const [inspection, setInspection] = useState<{
      tileId: string;
      regionId: string;
    } | null>(null),
    [flight, setFlight] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [retry, setRetry] = useState<{
      scope: string;
      command: CarcassonneClientCommand;
    } | null>(null);
  const currentRetry = retry?.scope === scope ? retry.command : null;
  const panel = useRef<HTMLElement>(null),
    mapArea = useRef<HTMLDivElement>(null),
    locked = useRef(false),
    mounted = useRef(true),
    scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setMessage(null);
    setRetry(null);
  }, [scope]);
  const remaining = useCarcassonneClock(
      props.snapshot.serverTime,
      g.phase === "PLAYING" ? g.deadlineAt : null,
    ),
    myTurn = g.phase === "PLAYING" && g.activePlayerId === selfId;
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (
      myTurn &&
      props.connected &&
      remaining > 0 &&
      remaining <= 5 &&
      warned.current !== scope
    ) {
      warned.current = scope;
      sound.play("WARNING");
    }
  }, [myTurn, props.connected, remaining, scope, sound]);
  const canAct =
    myTurn &&
    props.connected &&
    !props.pending &&
    !flight &&
    !currentRetry &&
    remaining > 0;
  const preview = useMemo(
    () => previewCarcassonne(g, selfId, draft),
    [g, selfId, draft],
  );
  const me = g.playerStates.find((p) => p.playerId === selfId)!,
    selfIndex = g.playerStates.findIndex((p) => p.playerId === selfId);
  const inspectedTile = inspection
    ? g.board.find((t) => t.tileId === inspection.tileId)
    : undefined;
  const feature = useMemo(
    () =>
      inspection
        ? analyzeCarcassonneBoard(g.board, g.meeples).find((f) =>
            f.nodes.includes(
              carcassonneRegionKey(inspection.tileId, inspection.regionId),
            ),
          )
        : undefined,
    [g.board, g.meeples, inspection],
  );
  const pendingFeature = draft?.meepleRegionId
    ? preview.choices.find((c) => c.region.id === draft.meepleRegionId)?.feature
    : undefined;
  const highlight = feature?.nodes ?? pendingFeature?.nodes ?? [];
  function chooseRotation(clockwise = true) {
    if (!canAct) return;
    const next = nextCarcassonneRotation(rotation, clockwise);
    setSelection({ scope, rotation: next, draft: null });
    setMessage(null);
    setInspection(null);
    sound.play("ROTATE");
  }
  function scrollToControls() {
    if (window.matchMedia("(max-width: 850px)").matches)
      panel.current?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }
  function place(x: number, y: number) {
    if (!canAct) return;
    setSelection({
      scope,
      rotation,
      draft: { x, y, rotation, meepleRegionId: null },
    });
    setInspection(null);
    setMessage(null);
    sound.play("PICK");
    scrollToControls();
  }
  function chooseMeeple(regionId: string | null) {
    if (!canAct || !draft) return;
    setSelection({
      scope,
      rotation,
      draft: { ...draft, meepleRegionId: regionId },
    });
    setInspection(null);
    sound.play("MEEPLE");
  }
  function inspect(tile: CarcassonneBoardTile) {
    setInspection({
      tileId: tile.tileId,
      regionId: CARCASSONNE_CATALOG[tile.kind].regions[0]!.id,
    });
  }
  async function send(command: CarcassonneClientCommand) {
    if (locked.current || !props.connected) return;
    locked.current = true;
    setFlight(true);
    setMessage(null);
    const sentScope = scope;
    try {
      await props.onCommand(command);
      if (mounted.current && scopeRef.current === sentScope) {
        setRetry(null);
        setSelection({ scope, rotation: 0, draft: null });
      }
    } catch (error) {
      if (mounted.current && scopeRef.current === sentScope) {
        if (error instanceof CarcassonneCommandRejected) {
          setRetry(null);
          setMessage(error.message);
          sound.play("ERROR");
        } else {
          setRetry({ scope, command });
          setMessage(
            "응답을 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해주세요.",
          );
        }
      }
    } finally {
      locked.current = false;
      if (mounted.current) setFlight(false);
    }
  }
  function confirm() {
    if (!canAct || !preview.action || g.phase !== "PLAYING") return;
    void send({
      kind: "carcassonne:act",
      protocolVersion: PROTOCOL_VERSION,
      requestId: createRequestId(),
      gameId: g.gameId,
      expectedGameRevision: g.gameRevision,
      turnId: g.turnId,
      payload: preview.action,
    });
  }
  const status = !props.connected
    ? "연결 복구 중 · 서버 제한 시간은 계속 흐릅니다"
    : g.phase === "FINISHED"
      ? "완성된 지도를 둘러보세요"
      : remaining === 0
        ? "시간 종료 · 자동 배치를 기다리고 있습니다"
        : flight
          ? "서버에서 배치를 확인하고 있습니다…"
          : myTurn
            ? draft
              ? "미플을 고르고 턴을 확정하세요"
              : "이번 타일을 놓을 빈칸을 골라주세요"
            : nickname(g.activePlayerId) + "님이 타일을 고르고 있습니다";
  return (
    <div
      className={
        "cc-game" +
        (myTurn ? " cc-my-turn" : "") +
        (remaining <= 5 && myTurn ? " cc-urgent" : "")
      }
    >
      <div className="cc-turn-banner">
        <div>
          <span className="cc-eyebrow">
            {g.phase === "FINISHED"
              ? "THE STORY IS COMPLETE"
              : myTurn
                ? "YOUR TURN"
                : "AROUND THE TABLE"}
          </span>
          <strong>
            {g.phase === "FINISHED"
              ? "우리의 지도가 완성되었습니다"
              : myTurn
                ? "지금, 내 차례입니다"
                : nickname(g.activePlayerId) + "님의 차례"}
          </strong>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <div className="cc-turn-meta">
          <div className="cc-deck-count">
            <span className="cc-deck-symbol" aria-hidden="true">
              ▧
            </span>
            <strong>{g.bagCount}</strong>
            <span>남은 타일</span>
          </div>
          {g.phase === "PLAYING" && (
            <div
              className="cc-clock"
              role="timer"
              aria-label={"남은 시간 " + remaining + "초"}
            >
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="28" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  pathLength="90"
                  strokeDasharray={remaining + " 90"}
                />
              </svg>
              <strong>
                {remaining}
                <small>초</small>
              </strong>
            </div>
          )}
        </div>
      </div>
      <div className="cc-players" aria-label="플레이어 점수와 미플">
        {g.playerStates.map((p, i) => (
          <div
            className={
              "cc-player" +
              (g.phase === "PLAYING" && g.activePlayerId === p.playerId
                ? " cc-player-active"
                : "") +
              (p.playerId === selfId ? " cc-player-self" : "")
            }
            key={p.playerId}
            style={
              { "--cc-player": CARCASSONNE_PLAYER_COLORS[i] } as CSSProperties
            }
          >
            <CarcassonneMeepleArt
              color={CARCASSONNE_PLAYER_COLORS[i]!}
              number={i + 1}
            />
            <div className="cc-player-name">
              <strong>
                {nickname(p.playerId)}
                {p.playerId === selfId && <small>나</small>}
              </strong>
              <span>
                미플 {p.availableMeeples}/7
                {people.find((a) => a.playerId === p.playerId)
                  ?.connectionStatus !== "CONNECTED"
                  ? " · 연결 대기"
                  : ""}
              </span>
            </div>
            <div className="cc-player-points">
              <strong>{p.score}</strong>
              <span>점</span>
            </div>
          </div>
        ))}
      </div>
      {g.phase === "FINISHED" && (
        <section className="cc-result" aria-label="최종 결과">
          <div>
            <span className="cc-eyebrow">FINAL SCORING</span>
            <h2>
              {g.result.reason === "CANCELLED"
                ? "이번 게임이 취소되었습니다"
                : g.result.winnerPlayerIds.map(nickname).join(" · ") +
                  (g.result.winnerPlayerIds.length > 1
                    ? " 공동 승리!"
                    : " 승리!")}
            </h2>
            <p>
              {g.result.reason === "CANCELLED"
                ? "플레이어가 방을 나갔습니다. 같은 방에서 다시 시작할 수 있습니다."
                : "도시와 길, 수도원, 그리고 오래 기다린 들판의 점수를 더했습니다."}
            </p>
          </div>
          {g.result.reason !== "CANCELLED" && (
            <div className="cc-result-scores">
              {g.result.scores.map((s) => (
                <div key={s.playerId}>
                  <strong>
                    {nickname(s.playerId)} <b>{s.total}점</b>
                  </strong>
                  <span>
                    진행 중 {s.base} · 도로 +{s.roads} · 도시 +{s.cities} ·
                    수도원 +{s.monasteries} · 들판 +{s.fields}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="cc-primary"
            disabled={
              !people.some((p) => p.playerId === selfId && p.isHost) ||
              !props.connected ||
              props.pending
            }
            onClick={props.onRematch}
          >
            같은 방에서 다시 하기
          </button>
        </section>
      )}
      <div className="cc-table-layout">
        <div className="cc-board-column" ref={mapArea}>
          <CarcassonneBoard
            game={g}
            rotation={rotation}
            draft={preview.tile}
            meepleRegionId={draft?.meepleRegionId ?? null}
            selfId={selfId}
            enabled={canAct}
            highlight={highlight}
            onPlace={place}
            onInspect={inspect}
          />
          {inspectedTile && feature && (
            <section className="cc-inspector" aria-label="연결 영역 살펴보기">
              <div className="cc-inspector-head">
                <strong>{describeCarcassonneFeature(feature)}</strong>
                <button type="button" onClick={() => setInspection(null)}>
                  닫기
                </button>
              </div>
              <div className="cc-inspector-tabs">
                {CARCASSONNE_CATALOG[inspectedTile.kind].regions.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    aria-pressed={inspection?.regionId === r.id}
                    onClick={() =>
                      setInspection({
                        tileId: inspectedTile.tileId,
                        regionId: r.id,
                      })
                    }
                  >
                    {CARCASSONNE_FEATURE_LABELS[r.kind]}{" "}
                    {Number(r.id.slice(1)) + 1}
                  </button>
                ))}
              </div>
              <p>
                {feature.meeples.length
                  ? feature.meeples
                      .map((m) => nickname(m.playerId))
                      .join(" · ") + "님의 미플이 연결되어 있습니다."
                  : "미플이 없는 영역입니다."}
                {feature.kind === "FIELD"
                  ? " 밝게 표시된 들판은 하나의 영역입니다."
                  : ""}
              </p>
            </section>
          )}
        </div>
        <aside className="cc-turn-panel" ref={panel} aria-label="이번 턴 조작">
          <div className="cc-panel-heading">
            <span className="cc-eyebrow">
              {g.phase === "FINISHED"
                ? "THE FINAL LANDSCAPE"
                : myTurn
                  ? "YOUR NEXT CHAPTER"
                  : "ON THE TABLE"}
            </span>
            <strong>
              {g.currentTile
                ? CARCASSONNE_CATALOG[g.currentTile.kind].label
                : "모든 타일을 펼쳤습니다"}
            </strong>
            <span>
              {g.currentTile
                ? "이번 타일 · " + g.currentTile.kind
                : "지도를 눌러 점수 영역을 확인하세요"}
            </span>
          </div>
          {g.currentTile && (
            <>
              <div className="cc-current-tile">
                <CarcassonneTileArt
                  kind={g.currentTile.kind}
                  rotation={rotation}
                  highlight={
                    draft?.meepleRegionId ? [draft.meepleRegionId] : []
                  }
                  tokens={
                    draft?.meepleRegionId
                      ? [
                          {
                            regionId: draft.meepleRegionId,
                            color: CARCASSONNE_PLAYER_COLORS[selfIndex]!,
                            number: selfIndex + 1,
                          },
                        ]
                      : []
                  }
                />
                {canAct &&
                  draft &&
                  preview.choices
                    .filter((c) => c.available && me.availableMeeples > 0)
                    .map(({ region }) => {
                      const [x, y] = rotateCarcassonnePoint(
                        region.point,
                        rotation,
                      );
                      return (
                        <button
                          type="button"
                          className={
                            "cc-region-dot" +
                            (draft.meepleRegionId === region.id
                              ? " cc-region-selected"
                              : "")
                          }
                          style={{ left: x + "%", top: y + "%" }}
                          key={region.id}
                          aria-label={
                            CARCASSONNE_FEATURE_LABELS[region.kind] +
                            " " +
                            (Number(region.id.slice(1)) + 1) +
                            "에 미플 놓기"
                          }
                          onClick={() => chooseMeeple(region.id)}
                        >
                          {draft.meepleRegionId === region.id ? "✓" : "+"}
                        </button>
                      );
                    })}
              </div>
              <div className="cc-rotation-controls">
                <button
                  type="button"
                  onClick={() => chooseRotation(false)}
                  disabled={!canAct}
                  aria-label="타일 왼쪽 90도 회전"
                >
                  ↶ 왼쪽
                </button>
                <span>{rotation}°</span>
                <button
                  type="button"
                  onClick={() => chooseRotation(true)}
                  disabled={!canAct}
                  aria-label="타일 오른쪽 90도 회전"
                >
                  오른쪽 ↷
                </button>
              </div>
            </>
          )}
          {g.phase === "PLAYING" && (
            <>
              <div className="cc-step-list">
                <span className={!draft ? "cc-step-active" : ""}>
                  <b>1</b> 위치 선택
                </span>
                <span className={draft ? "cc-step-active" : ""}>
                  <b>2</b> 미플 선택
                </span>
                <span>
                  <b>3</b> 턴 확정
                </span>
              </div>
              <div className="cc-meeple-reserve">
                <div>
                  <strong>내 미플</strong>
                  <span>{me.availableMeeples}개 남음</span>
                </div>
                <div aria-hidden="true">
                  {Array.from({ length: 7 }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i >= me.availableMeeples ? "cc-used-meeple" : ""
                      }
                    >
                      <CarcassonneMeepleArt
                        color={CARCASSONNE_PLAYER_COLORS[selfIndex]!}
                      />
                    </span>
                  ))}
                </div>
              </div>
              {draft ? (
                <>
                  <div
                    className="cc-region-options"
                    aria-label="미플 배치 영역"
                  >
                    <button
                      type="button"
                      className="cc-no-meeple"
                      disabled={!canAct}
                      aria-pressed={draft.meepleRegionId === null}
                      onClick={() => chooseMeeple(null)}
                    >
                      미플 놓지 않기
                    </button>
                    {preview.choices.map(({ region, available }) => (
                      <button
                        type="button"
                        key={region.id}
                        aria-pressed={draft.meepleRegionId === region.id}
                        disabled={
                          !canAct || !available || me.availableMeeples === 0
                        }
                        onClick={() => chooseMeeple(region.id)}
                      >
                        <span>
                          {CARCASSONNE_FEATURE_LABELS[region.kind]}{" "}
                          {Number(region.id.slice(1)) + 1}
                        </span>
                        <small>
                          {!available
                            ? "이미 점유됨"
                            : me.availableMeeples === 0
                              ? "미플 없음"
                              : region.kind === "FIELD"
                                ? "종료 때 정산"
                                : "미플 배치"}
                        </small>
                      </button>
                    ))}
                  </div>
                  {draft.meepleRegionId?.startsWith("f") && (
                    <p className="cc-farmer-note">
                      농부는 게임이 끝날 때까지 들판에 남습니다.
                    </p>
                  )}
                  <button
                    type="button"
                    className="cc-text-button"
                    onClick={() => {
                      setSelection({ scope, rotation, draft: null });
                      mapArea.current?.scrollIntoView({ block: "start" });
                    }}
                    disabled={!canAct}
                  >
                    위치 다시 고르기
                  </button>
                </>
              ) : (
                <div className="cc-empty-selection">
                  <span aria-hidden="true">✦</span>
                  <p>
                    {myTurn
                      ? "지도의 점선 빈칸을 누르면 미플을 놓을 영역을 고를 수 있어요."
                      : "상대가 놓는 타일을 함께 살펴보세요."}
                  </p>
                </div>
              )}
            </>
          )}
          <div className="cc-score-key">
            <span>
              도로 <b>1점 / 타일</b>
            </span>
            <span>
              도시 <b>2점 / 타일·방패</b>
            </span>
            <span>
              수도원 <b>완성 시 9점</b>
            </span>
            <span>
              들판 <b>종료 시 도시당 3점</b>
            </span>
          </div>
        </aside>
      </div>
      {g.phase === "PLAYING" && (
        <div
          className={
            "cc-action-bar" + (preview.action ? " cc-action-ready" : "")
          }
        >
          <div aria-live="polite">
            <span className="cc-eyebrow">
              {myTurn ? "YOUR TURN" : "WAITING"}
            </span>
            <strong>
              {!canAct
                ? status
                : preview.action
                  ? "타일" +
                    (draft?.meepleRegionId
                      ? " + " +
                        CARCASSONNE_FEATURE_LABELS[
                          CARCASSONNE_CATALOG[g.currentTile!.kind].regions.find(
                            (r) => r.id === draft.meepleRegionId,
                          )!.kind
                        ] +
                        " 미플"
                      : "만") +
                    " 배치 준비"
                  : preview.reason}
            </strong>
            {preview.action && (
              <span className="cc-preview-score">
                {preview.gains.length
                  ? "예상 점수 · " +
                    preview.gains
                      .map((p) => nickname(p.playerId) + " +" + p.points)
                      .join(" · ")
                  : "지금 얻는 점수 없음 · 영역을 이어가세요"}
                {preview.returnCount
                  ? " · 내 미플 " + preview.returnCount + "개 회수"
                  : ""}
              </span>
            )}
          </div>
          <div className="cc-confirm-group">
            <span className="cc-mobile-time">
              {remaining}
              <small>초</small>
            </span>
            {currentRetry ? (
              <button
                type="button"
                className="cc-primary"
                onClick={() => void send(currentRetry)}
                disabled={!props.connected || flight}
              >
                요청 결과 다시 확인
              </button>
            ) : (
              <button
                type="button"
                className="cc-primary"
                onClick={confirm}
                disabled={!canAct || !preview.action}
              >
                {flight ? "확인 중…" : "턴 확정"} <span>→</span>
              </button>
            )}
          </div>
          {message && (
            <p className="cc-command-message" role="alert">
              {message}
            </p>
          )}
        </div>
      )}
      <section className="cc-history" aria-label="최근 게임 기록">
        <div className="cc-history-heading">
          <span className="cc-eyebrow">THE CHRONICLE</span>
          <strong>우리의 이야기</strong>
          <span>
            {g.board.length}장 배치 · 배치 불가 타일 {g.discardedTiles.length}장
          </span>
        </div>
        {g.history.length ? (
          <div className="cc-history-list">
            {[...g.history].reverse().map((item) => (
              <div key={item.tile.tileId}>
                <span className="cc-history-tile">
                  <CarcassonneTileArt
                    kind={item.tile.kind}
                    rotation={item.tile.rotation}
                  />
                </span>
                <div>
                  <strong>
                    {nickname(item.playerId)}{" "}
                    <span>
                      {item.automatic
                        ? "시간 초과 · 자동 배치"
                        : CARCASSONNE_CATALOG[item.tile.kind].label + " 배치"}
                    </span>
                  </strong>
                  <p>
                    {item.scoring.length
                      ? item.scoring
                          .map(
                            (score) =>
                              CARCASSONNE_FEATURE_LABELS[score.kind] +
                              " 완성 · " +
                              score.winnerPlayerIds.map(nickname).join(", ") +
                              " +" +
                              score.points +
                              "점",
                          )
                          .join(" / ")
                      : item.meepleRegionId
                        ? "미플을 보내 영역을 차지했습니다."
                        : "미플을 아끼고 타일만 놓았습니다."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    inspect(item.tile);
                    mapArea.current?.scrollIntoView({ block: "start" });
                  }}
                >
                  살펴보기
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="cc-history-empty">
            첫 타일을 놓으면 이야기가 시작됩니다.
          </p>
        )}
      </section>
    </div>
  );
}
