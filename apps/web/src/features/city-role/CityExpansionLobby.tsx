import { useState } from 'react';
import { CITY_DEFAULT_SETTINGS, CITY_EXPANDED_ROLES, CITY_STANDARD_CAST, type CityExpansionSettings, type CityExpansionClientCommand, type RoomRevision } from '@hangul-rummikub/shared';
import { createRequestId } from '../../lib/request-id.js';

export function CityExpansionLobby({ settings, revision, host, connected, count, onCommand }: { settings: CityExpansionSettings | undefined; revision: RoomRevision; host: boolean; connected: boolean; count: number; onCommand(command: CityExpansionClientCommand): Promise<void> }) {
  const current = settings ?? CITY_DEFAULT_SETTINGS;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(next: CityExpansionSettings) {
    setBusy(true); setError('');
    try { await onCommand({ kind: 'city:configure', protocolVersion: 1, requestId: createRequestId(), expectedRoomRevision: revision, payload: { enabled: next.enabled, roles: [...next.roles] } }); }
    catch (e) { setError(e instanceof Error ? e.message : '설정을 저장하지 못했습니다.'); } finally { setBusy(false); }
  }
  return <section className="city-expansion-lobby">
    <div className="city-expansion-heading"><div><span className="city-eyebrow">CITY · NEW CHAPTER</span><h2>우리 도시의 이야기</h2><p>교역 20 · 시정 12 · 수비 11 · 문화 11 · 특수 14장</p></div><span className="city-deck-count">68<span>장</span></span></div>
    <div className="city-mode-switch" aria-label="게임 모드">
      <button aria-pressed={!current.enabled} disabled={!host || !connected || busy} onClick={() => void save({ enabled: false, roles: CITY_STANDARD_CAST })}><strong>일반판</strong><span>기본 직업 8개와 추천 특수 건물 14종</span></button>
      <button aria-pressed={current.enabled} disabled={!host || !connected || busy} onClick={() => void save({ enabled: true, roles: current.roles })}><strong>확장판</strong><span>직업을 직접 선택 · 특수 건물 30종 중 무작위 14종</span></button>
    </div>
    {current.enabled && <div className="city-cast-settings">{Array.from({ length: 9 }, (_, i) => <label key={i}><span>{String(i + 1).padStart(2, '0')}번 직업</span><select aria-label={`${i + 1}번 직업`} value={current.roles[i] ?? ''} disabled={!host || !connected || busy} onChange={event => {
      const role = CITY_EXPANDED_ROLES.find(r => r.id === event.target.value);
      const roles = [...current.roles]; if (role) roles[i] = role.id; else roles.splice(i, 1);
      void save({ enabled: true, roles });
    }}>{i === 8 && <option value="">사용하지 않음</option>}{CITY_EXPANDED_ROLES.filter(r => r.rank === i + 1).map(r => <option key={r.id} value={r.id} disabled={i === 8 && count === 2 || r.id === 'EMPEROR' && count === 2 || r.id === 'QUEEN' && count < 5}>{r.name}</option>)}</select><small>{CITY_EXPANDED_ROLES.find(r => r.id === current.roles[i])?.text ?? '9번 직업은 선택 사항입니다.'}</small></label>)}</div>}
    <p className="city-muted">{host ? '방장이 설정합니다. 2인전은 1–8번을 사용하며 황제는 3인 이상, 왕비는 5인 이상에서 선택할 수 있습니다.' : '방장이 게임 모드와 직업을 정하고 있습니다.'}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
