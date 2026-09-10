import { useState } from "react";
import type { CityRoleId } from "@hangul-rummikub/shared";
import { CITY_ROLE_HELP, cityRoleLabel, type CityActionIntent } from "./city-role-ui.js";
import { CityRoleEmblem } from "./CityVisuals.js";

/** Private local preview; one atomic command owns both choices within the server selection window. */
export function CitySecretDraft({ roles, locked, onAction, describeRole, selectionSeconds = 45, discardRequired = true, automaticLast = true }: Readonly<{
  roles: readonly CityRoleId[]; locked: boolean; onAction: (intent: CityActionIntent) => void;
  selectionSeconds?: number; discardRequired?: boolean; automaticLast?: boolean;
  describeRole?: (role: CityRoleId) => Readonly<{ name: string; summary: string }>;
}>) {
  const description = (role: CityRoleId) => describeRole?.(role) ?? CITY_ROLE_HELP[role];
  const label = (role: CityRoleId) => describeRole ? `${Number(role.slice(-2))} · ${description(role).name}` : cityRoleLabel(role);
  const [keep, setKeep] = useState<CityRoleId | null>(null);
  const [discard, setDiscard] = useState<CityRoleId | null>(null);
  return <div className="city-secret-draft">
    <p className="city-helper">{discardRequired ? "가져갈 역할 1장과 비공개로 버릴 역할 1장을 고르세요." : "첫 선택에서는 가져갈 역할 1장만 고르세요."} {selectionSeconds}초가 지나면 서버가 {discardRequired ? "두 장을" : "한 장을"} 무작위로 정합니다.</p>
    <div className="city-draft-progress" role="status"><span>01 · {keep ? `${description(keep).name} 가져오기` : "가져갈 역할 선택"}</span>{discardRequired && <span>02 · {discard ? `${description(discard).name} 버리기` : "버릴 역할 선택"}</span>}</div>
    <div className="city-role-grid">{roles.map(role => <article key={role} data-role={role} className={`city-role-card${keep === role ? " is-kept" : ""}${discard === role ? " is-discarded" : ""}`}>
      <CityRoleEmblem roleId={role} /><span className="city-role-order">등장 순서 {Number(role.slice(-2))}</span><strong>{description(role).name}</strong><p>{description(role).summary}</p>
      <div className="city-draft-card-actions"><button type="button" aria-label={`${label(role)} 가져오기`} aria-pressed={keep === role} disabled={locked} onClick={() => { setKeep(role); if (discard === role) setDiscard(null); }}>가져오기</button>
        {discardRequired && <button type="button" aria-label={`${label(role)} 비공개 버리기`} aria-pressed={discard === role} disabled={locked} onClick={() => { setDiscard(role); if (keep === role) setKeep(null); }}>비공개 버리기</button>}</div>
    </article>)}</div>
    <button type="button" className="primary-button city-draft-confirm" disabled={locked || keep === null || discardRequired && (discard === null || keep === discard)} onClick={() => {
      if (locked || keep === null) return;
      if (discardRequired) {
        if (discard !== null && keep !== discard) onAction({ kind: "city:selectRole", payload: { roleId: keep, discardRoleId: discard } });
      } else onAction({ kind: "city:selectRole", payload: { roleId: keep } });
    }}>{discardRequired ? "선택 · 비공개 버리기 확정" : "직업 선택 확정"}</button>
    <p className="city-helper">{automaticLast ? "세 번의 선택 후 마지막 역할은 상대에게 자동 배정됩니다." : "선도자는 첫 역할만 고릅니다. 이후 상대 → 선도자 → 상대 순서로 한 장씩 고르고 다른 한 장을 비공개로 버립니다."} 공개 제외 역할은 없습니다.</p>
  </div>;
}
