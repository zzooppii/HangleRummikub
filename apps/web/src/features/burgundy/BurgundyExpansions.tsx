import { useEffect, useState } from "react";
import {
  BURGUNDY_SHIELDS,
  burgundyDefinition,
  type BurgundyProjection,
  type BurgundyPlayer,
  type BurgundyTile,
  type BurgundyAction,
  type BurgundyExpansionBonus,
} from "@hangul-rummikub/shared";
type Props = {
  game: BurgundyProjection;
  self: BurgundyPlayer;
  enabled: boolean;
  die: 0 | 1;
  value: number;
  cellId: string | null;
  tile: BurgundyTile | null;
  onAction(a: BurgundyAction): void;
};
export function BurgundyExpansions({
  game: g,
  self,
  enabled,
  die,
  value,
  onAction,
}: Props) {
  const [castle, setCastle] = useState(""),
    [keep, setKeep] = useState<number[]>(
      self.extension.shields.map((s) => s.shieldId),
    ),
    [workers, setWorkers] = useState(0);
  const pending = g.pending[0];
  useEffect(() => {
    if (pending?.type === "SHIELD_TRIBUTE") {
      setKeep(self.extension.shields.map((s) => s.shieldId));
      setWorkers(0);
    }
  }, [g.phase === "PLAYING" ? g.turnId : "finished", pending?.type]);
  return (
    <div className="bu-expansions">
      {g.settings.shields ? (
        <details open={pending?.type === "SHIELD_TRIBUTE"}>
          <summary>문장 · 특별 능력</summary>
          <div className="bu-shields">
            {self.extension.shields.map((s) => {
              const def = BURGUNDY_SHIELDS.find((x) => x.id === s.shieldId)!;
              return (
                <div key={s.shieldId}>
                  <strong>
                    {s.shieldId}. {def.name}
                  </strong>
                  <p>{def.description}</p>
                  <small>최종 {def.points}점</small>
                </div>
              );
            })}
          </div>
          {pending?.type === "SHIELD_TRIBUTE" ? (
            <>
              <p>유지할 문장을 선택하세요. 문장마다 은화 1개를 바칩니다.</p>
              {self.extension.shields.map((s) => (
                <label key={s.shieldId}>
                  <input
                    type="checkbox"
                    checked={keep.includes(s.shieldId)}
                    onChange={(e) =>
                      setKeep(
                        e.target.checked
                          ? [...keep, s.shieldId]
                          : keep.filter((n) => n !== s.shieldId),
                      )
                    }
                  />
                  {s.shieldId}번 유지
                </label>
              ))}
              {self.extension.shields.some((s) => s.shieldId === 3) ? (
                <label>
                  공물로 낼 일꾼
                  <input
                    type="number"
                    min="0"
                    max={self.workers}
                    value={workers}
                    onChange={(e) => setWorkers(Number(e.target.value))}
                  />
                </label>
              ) : null}
              <button
                disabled={!enabled}
                onClick={() =>
                  onAction({
                    type: "SHIELD_TRIBUTE",
                    keepShieldIds: keep,
                    workers,
                  })
                }
              >
                공물 확정
              </button>
            </>
          ) : (
            <>
              <p className="bu-muted">
                두 주사위를 같은 눈으로 맞춰 문장을 가져옵니다. 일꾼으로 눈을
                조정할 수 있고, 이미 붙인 문장은 교체할 수 있습니다.
              </p>
              <label>
                문장을 붙일 성
                <select
                  value={castle}
                  onChange={(e) => setCastle(e.target.value)}
                >
                  <option value="">성 선택</option>
                  {self.board
                    .filter(
                      (b) => burgundyDefinition(b.tile).color === "CASTLE",
                    )
                    .map((b) => (
                      <option key={b.cellId} value={b.cellId}>
                        {b.cellId}
                      </option>
                    ))}
                </select>
              </label>
              <div className="bu-effect-choices">
                {g.expansion.shieldDepots.flatMap((shields, i) =>
                  shields.map((id) => (
                    <button
                      key={id}
                      title={
                        BURGUNDY_SHIELDS.find((s) => s.id === id)?.description
                      }
                      disabled={
                        !enabled ||
                        !castle ||
                        (pending
                          ? !(
                              pending.type === "ACTION" &&
                              pending.source === "CASTLE" &&
                              self.extension.shields.some(
                                (s) => s.shieldId === 11,
                              )
                            )
                          : self.dice.some((d) => d.used))
                      }
                      onClick={() =>
                        onAction({
                          type: "TAKE_SHIELD",
                          value: i + 1,
                          shieldId: id,
                          castleCellId: castle,
                        })
                      }
                    >
                      {i + 1}번 시장 · 문장 {id}
                    </button>
                  )),
                )}
              </div>
            </>
          )}
          {self.extension.shields.some((s) => s.shieldId === 6) ? (
            <label>
              지식을 공유할 상대
              <select
                defaultValue=""
                disabled={!enabled}
                onChange={(e) => {
                  const p = g.playerStates.find(
                    (p) => p.playerId === e.target.value,
                  );
                  if (p)
                    onAction({ type: "SHIELD_COPY", playerId: p.playerId });
                }}
              >
                <option value="">상대 선택</option>
                {g.playerStates
                  .filter((p) => p.playerId !== self.playerId)
                  .map((p, i) => (
                    <option key={p.playerId} value={p.playerId}>
                      상대 {i + 1} · 지식{" "}
                      {
                        p.board.filter(
                          (t) => burgundyDefinition(t.tile).knowledge,
                        ).length
                      }
                      개
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {self.extension.shields.some((s) => s.shieldId === 16) ? (
            <button
              disabled={!enabled || self.extension.shield16Used}
              onClick={() => onAction({ type: "SHIELD_DIE", die, value })}
            >
              선택한 주사위를 {value}로 조정
            </button>
          ) : null}
        </details>
      ) : null}
      {g.settings.tradeRoutes ? (
        <details>
          <summary>
            무역로 {self.extension.tradeRouteFilled}/
            {self.extension.tradeRoute.length}
          </summary>
          <div className="bu-effect-choices">
            {self.extension.tradeRoute.map((s, i) => (
              <span key={i}>
                {i < self.extension.tradeRouteFilled
                  ? `✓ 상품 ${self.extension.tradeRouteGoods[i]}`
                  : `○ ${s.die}번 상품`}
                · {bonusLabel(s.bonus)}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function bonusLabel(b: BurgundyExpansionBonus): string {
  switch (b.type) {
    case "ACTION":
      return b.die ? `${b.die}번 추가 행동` : "원하는 눈 추가 행동";
    case "PLACE":
      return "타일 배치";
    case "SELL":
      return "상품 판매";
    case "TAKE":
      return "타일 획득";
    case "TAKE_BLACK":
      return "검은 시장 타일 획득";
    case "GAIN":
      return [
        b.score ? `${b.score}점` : "",
        b.workers ? `일꾼 ${b.workers}명` : "",
        b.silver ? `은화 ${b.silver}개` : "",
      ]
        .filter(Boolean)
        .join(" · ");
  }
}
