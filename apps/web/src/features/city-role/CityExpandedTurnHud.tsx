import type { CityRolePlayingPlatformSnapshotV2, PlayerId } from '@hangul-rummikub/shared';
import { formatCountdownMmSs } from '../../lib/turn-countdown.js';
import { CityIcon, CityRoleEmblem } from './CityVisuals.js';

/** The canonical window identifies the responder, including interrupting role choices. */
export function CityExpandedTurnHud({ game, viewerId, actor, remainingSeconds, roleName }: Readonly<{
  game: CityRolePlayingPlatformSnapshotV2['game'];
  viewerId: PlayerId;
  actor: string;
  remainingSeconds: number;
  roleName: string;
}>) {
  const mine = game.window.activePlayerId === viewerId;
  const selection = game.phase === 'ROLE_SELECTION';
  const responding = Boolean(game.expansion?.pending);
  const hint = remainingSeconds === 0 ? '시간이 끝났습니다. 서버의 자동 진행을 기다립니다.'
    : responding ? '선택에 응답할 차례입니다.'
    : selection ? '직업을 고르면 선택을 확정하세요.'
    : game.privateState.action?.acquisition === 'PENDING' && mine ? '뽑은 카드 중 받을 카드를 고르세요.'
    : '기본 자원을 받고 직업 능력과 건설을 진행합니다.';
  return <section className={`city-turn-hud${mine ? ' is-mine' : ''}${remainingSeconds <= 10 ? ' is-urgent' : ''}`} aria-label="현재 라운드와 차례">
    {game.phase === 'ROLE_ACTION' ? <CityRoleEmblem roleId={game.window.activeRoleId} /> : <CityIcon name="hourglass" className="city-turn-hourglass" />}
    <div className="city-expanded-turn-copy">
      <p className="city-turn-phase">{game.roundNumber}라운드 · {selection ? '직업 선택' : `${roleName}${responding ? ' · 응답 선택' : ''}`}</p>
      <h2>{mine ? selection ? '내 직업을 고를 차례입니다' : responding ? '내가 응답할 차례입니다' : '내 차례입니다' : `${actor}님의 ${responding ? '응답' : selection ? '직업 선택' : '차례'}`}</h2>
      <p className="city-turn-hint">{hint}</p>
    </div>
    <div className="city-countdown"><span>{selection ? '선택' : '행동'} 시간</span><strong role="timer" aria-label={`남은 시간 ${remainingSeconds}초`}>{formatCountdownMmSs(remainingSeconds)}</strong><progress aria-label="남은 시간 비율" value={remainingSeconds} max={(game.window.deadlineAt - game.window.startedAt) / 1000} /></div>
  </section>;
}
