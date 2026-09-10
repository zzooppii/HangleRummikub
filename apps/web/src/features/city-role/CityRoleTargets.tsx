import type { CityRoleId } from '@hangul-rummikub/shared';
import { CityRoleEmblem } from './CityVisuals.js';

export function toggleCityRoleTarget(selected: readonly CityRoleId[], id: CityRoleId, count: number): CityRoleId[] {
  if (selected.includes(id)) return selected.filter(value => value !== id);
  return count === 1 ? [id] : selected.length < count ? [...selected, id] : [...selected];
}

export function CityRoleTargets({ targets, selected, count, verb, disabled, used, onChange, onConfirm }: {
  targets: readonly { id: CityRoleId; name: string; reason: string | null }[];
  selected: readonly CityRoleId[];
  count: number;
  verb: string;
  disabled: boolean;
  used: boolean;
  onChange(ids: CityRoleId[]): void;
  onConfirm(): void;
}) {
  const valid = selected.length === count && selected.every(id => targets.some(t => t.id === id && !t.reason));
  const locked = disabled || used;
  return <section className="city-role-targets" aria-label={`${verb} 대상 직업`}>
    <div className="city-role-target-heading"><h3>{verb} 대상 직업을 고르세요</h3><span>{selected.length} / {count}</span></div>
    <p className="city-muted">{count === 1 ? '직업 카드를 누르면 대상 하나가 선택됩니다.' : `${count}개를 선택하세요. 첫 번째는 진짜 표식, 나머지는 가짜 표식입니다.`}</p>
    <div className="city-role-target-cards">{targets.map(target => {
      const index = selected.indexOf(target.id);
      return <button key={target.id} className={`city-role-card city-role-target-card${index >= 0 ? ' is-targeted' : ''}`} data-role={target.id} aria-label={`${target.name} 지목${target.reason ? ` · ${target.reason}` : ''}`} aria-pressed={index >= 0} disabled={locked || target.reason !== null || count > 1 && selected.length >= count && index < 0} onClick={() => onChange(toggleCityRoleTarget(selected, target.id, count))}>
        <CityRoleEmblem roleId={target.id}/><strong>{target.name}</strong><span className="city-role-target-mark">{target.reason ?? (index >= 0 ? count === 1 ? '✓ 선택됨' : index === 0 ? '① 진짜 표식' : `${index + 1} · 가짜 표식` : '대상 선택')}</span>
      </button>;
    })}</div>
    <div className="city-role-target-confirm"><span aria-live="polite">{used ? '이번 차례의 직업 능력을 사용했습니다.' : selected.length ? selected.map(id => targets.find(t => t.id === id)?.name ?? '').join(' · ') : '아직 선택한 직업이 없습니다.'}</span><button disabled={locked || !valid} onClick={() => { if (!locked && valid) onConfirm(); }}>{used ? '능력 사용 완료' : `${verb} 지목 확정`}</button></div>
  </section>;
}
