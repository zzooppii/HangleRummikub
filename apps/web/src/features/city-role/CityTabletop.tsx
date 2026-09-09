import { CITY_ROLE_IDS, type CityRolePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { CityIcon, CityRoleEmblem } from "./CityVisuals.js";
import { CITY_ROLE_HELP } from "./city-role-ui.js";

/** Public role identities only: never infer an owner from private draft choices. */
export function CityRoleTrack({ game }: Readonly<{ game: CityRolePlayingPlatformSnapshotV2["game"] }>) {
  return <nav className="city-role-track" aria-label="공개 역할 진행 순서"><span className="city-track-title">라운드 {game.roundNumber}<small>역할 진행 순서</small></span><ol>{CITY_ROLE_IDS.map((role, index) => {
    const current = game.phase === "ROLE_ACTION" && game.window.activeRoleId === role;
    const revealed = game.revealedRoles.some(entry => entry.roundNumber === game.roundNumber && entry.roleId === role);
    return <li key={role} className={current ? "is-current" : revealed ? "is-revealed" : ""} aria-current={current ? "step" : undefined}>
      <CityRoleEmblem roleId={role} /><span><b>{index + 1}</b> {CITY_ROLE_HELP[role].name}</span><small>{current ? "현재 역할" : revealed ? "공개됨" : "미공개"}</small>
    </li>;
  })}</ol></nav>;
}

export function CityBuildTrack({ count }: Readonly<{ count: number }>) {
  return <div className="city-build-track" aria-label={`도시 건설 ${count}개, 완성 목표 8개`}>
    {Array.from({ length: 8 }, (_, index) => <span key={index} className={index < count ? "is-built" : ""} aria-hidden="true"><CityIcon name="civic" /></span>)}
  </div>;
}

export function CityResourceTokens({ gold, handCount, score }: Readonly<{ gold: number; handCount: number; score: number }>) {
  return <dl className="city-resource-tokens"><div><dt><CityIcon name="coin" />금화</dt><dd>{gold}</dd></div><div><dt><CityIcon name="cards" />손패</dt><dd>{handCount}<small>장</small></dd></div><div><dt><CityIcon name="civic" />건물 점수</dt><dd>{score}<small>점</small></dd></div></dl>;
}
