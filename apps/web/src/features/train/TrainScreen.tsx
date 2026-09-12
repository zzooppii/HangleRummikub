import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PROTOCOL_VERSION, TRAIN_COLORS, TRAIN_ROUTES, TRAIN_TICKETS, TRAIN_ROUTE_POINTS, trainCityName, type TrainColor, type TrainCardId, type TrainTicketCard, type TrainAction, type TrainClientCommand } from '@hangul-rummikub/shared';
import type { TrainWebSnapshot } from '../../lib/snapshot-wire-decoder.js';
import { getGameStartControl } from '../../lib/game-start.js';
import { createRequestId } from '../../lib/request-id.js';
import { TrainCommandRejected } from '../../lib/train-command-error.js';
import { TrainBoard } from './TrainBoard.js';
import { TRAIN_LABELS, TRAIN_PAINT, TRAIN_SYMBOLS, TRAIN_PLAYER_PAINT, TRAIN_ACTION_LABELS, trainPayments, trainCanDraw, trainCanPass, trainRouteOpen } from './ui.js';
import { useTrainSound } from './sound.js';
type Props = Readonly<{
    snapshot: TrainWebSnapshot;
    connected: boolean;
    pending: boolean;
    error: string | null;
    connectionLabel: string;
    onCommand(command: TrainClientCommand): Promise<void>;
    onRematch(): void;
    onStart(): void;
    onLeave(): void;
    onCopy(): void;
}>;
type Game = NonNullable<TrainWebSnapshot['game']>;
function Car({ color, count, disabled, onClick, label }: {
    color: TrainColor;
    count?: number;
    disabled?: boolean;
    onClick?: () => void;
    label?: string;
}) { const i = TRAIN_COLORS.indexOf(color); return <button type="button" className={`tr-car tr-car-${color.toLowerCase()}`} style={{ '--tr-car-color': TRAIN_PAINT[color], '--tr-art-x': `${i % 3 * 50}%`, '--tr-art-y': `${Math.floor(i / 3) * 50}%` } as CSSProperties} disabled={disabled} onClick={onClick} aria-label={label ?? `${TRAIN_LABELS[color]}${count === undefined ? ' 가져오기' : ` ${count}장`}`}><span className="tr-car-art"/><span className="tr-car-label"><span>{TRAIN_SYMBOLS[color]} {TRAIN_LABELS[color]}</span>{count !== undefined ? <b>{count}</b> : null}</span></button>; }
function Ticket({ card, selected, onClick, completed, disabled = false }: {
    card: TrainTicketCard;
    selected: boolean;
    onClick(): void;
    completed?: boolean;
    disabled?: boolean;
}) { const ticket = TRAIN_TICKETS.find(t => t.ticketId === card.ticketId)!; return <button type="button" className={`tr-ticket ${completed ? 'tr-ticket-complete' : ''}`} aria-pressed={selected} disabled={disabled} onClick={onClick} aria-label={`${trainCityName(ticket.a)}에서 ${trainCityName(ticket.b)}, ${ticket.points}점${completed === undefined ? '' : completed ? ', 연결 완료' : ', 미완료'}`}><span className="tr-ticket-overline">DESTINATION TICKET</span><span className="tr-ticket-cities"><span>{trainCityName(ticket.a)}</span><span className="tr-ticket-rail">● ─ ─ ─ ●</span><span>{trainCityName(ticket.b)}</span></span><span className="tr-ticket-bottom"><small>{completed === undefined ? (selected ? '✓ 보유 선택' : '보유할 카드 선택') : completed ? '✓ 연결 완료' : '아직 연결되지 않음'}</small><b>{ticket.points}<small>점</small></b></span></button>; }
export function TrainScreen(props: Props) {
    const s = props.snapshot, start = getGameStartControl(s, props.pending || !props.connected), sound = useTrainSound(s.game, s.self.playerId, props.connected);
    return <section className="train-screen" aria-label="티켓 투 라이드" onPointerDown={sound.unlock} onKeyDown={sound.unlock}>
  <header className="tr-header"><div><span className="tr-eyebrow">THE GREAT RAILWAY JOURNEY</span><h1>티켓 투 라이드 <small>북아메리카</small></h1></div><div className="tr-room"><span>방 {s.room.roomCode}</span><span role="status">{props.connectionLabel}</span><button onClick={props.onCopy}>초대 링크</button><button disabled={props.pending} onClick={props.onLeave}>나가기</button></div></header>
  <div className="tr-tools"><details><summary>게임 방법</summary><div className="tr-help"><p>차례마다 열차 카드 뽑기, 노선 한 개 점유, 목적지 뽑기 중 하나를 합니다. 시작 목적지는 3장 중 최소 2장, 추가 목적지는 최대 3장 중 최소 1장을 보유합니다.</p><p>열차 카드는 1장씩 두 번 가져옵니다. 공개 기관차는 첫 선택에만 가능하고 차례 전체를 사용합니다. 뒤집힌 덱의 기관차는 1장으로 셉니다.</p><p>노선 길이만큼 같은 색 카드와 기관차를 지불합니다. 회색 노선은 아무 한 색으로 지불하며 기존 내 노선과 연결할 필요는 없습니다. 2–3인은 복선 한쪽만, 4–5인은 서로 다른 사람이 양쪽을 점유할 수 있습니다.</p><p>기차가 2개 이하가 되면 그 사람까지 모두 한 번씩 더 진행합니다. 노선 점수 + 목적지 성공/실패 점수 + 최장 노선 10점으로 정산합니다. 동점은 완료 목적지 수, 최장 보너스 순으로 비교합니다.</p><p>시간 제한 없음. 재접속하면 선택 중인 단계가 유지됩니다. 나가기는 이번 판을 취소합니다. 상대 손패와 목적지 내용은 비공개입니다.</p></div></details><div className="tr-audio"><button aria-pressed={sound.volume === 0} onClick={() => sound.changeVolume(sound.volume === 0 ? 45 : 0)}>{sound.volume === 0 ? '소리 켜기' : '음소거'}</button><label>효과음 <input aria-label="효과음 음량" type="range" min="0" max="100" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))}/></label><button onClick={() => sound.play('CLAIM_ROUTE')}>소리 듣기</button></div></div>
  {props.error ? <p className="tr-error" role="alert">{props.error}</p> : null}
  {s.game === null ? <div className="tr-lobby"><div className="tr-lobby-copy"><span className="tr-eyebrow">ALL ABOARD · 1900</span><h2>당신의 철도로<br />대륙을 이어 보세요.</h2><p>카드를 모으고, 도시를 연결하고,<br />나만의 여정을 완성하세요.</p><div className="tr-lobby-seats">{s.room.players.map((p, i) => <span key={p.playerId}><i style={{ background: TRAIN_PLAYER_PAINT[i] }}/>{p.nickname} {p.isHost ? '♛' : ''} · {p.connectionStatus === 'CONNECTED' ? '접속 중' : '재접속 대기'}</span>)}</div><p>{start.guidance}</p><button className="tr-primary" disabled={!start.canStart} onClick={props.onStart}>여정 시작</button><p>2–5인 · 미국 기본판 · 시간 제한 없음</p></div></div> : <TrainTable key={s.game.gameId} {...props} game={s.game} sound={sound}/>}
 </section>;
}
function TrainTable({ game: g, sound, ...props }: Props & {
    game: Game;
    sound: ReturnType<typeof useTrainSound>;
}) {
    const self = props.snapshot.self.playerId, players = props.snapshot.room.players, names = Object.fromEntries(players.map(p => [p.playerId, p.nickname])), me = g.playerStates.find(p => p.playerId === self)!;
    const [selected, setSelected] = useState<string | null>(null), [payment, setPayment] = useState(0), [keep, setKeep] = useState<TrainCardId[]>([]), [reverse, setReverse] = useState(false), [focusTicket, setFocusTicket] = useState<string | null>(null), [flight, setFlight] = useState(false), [retry, setRetry] = useState<TrainClientCommand | null>(null), [message, setMessage] = useState<string | null>(null);
    const scope = `${g.gameId}:${g.gameRevision}:${g.phase}`, scopeRef = useRef(scope), inFlight = useRef<TrainClientCommand | null>(null), mounted = useRef(true), pendingKey = g.privateState.pendingTickets.map(t => t.cardId).join(',');
    scopeRef.current = scope;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setSelected(null); setPayment(0); setRetry(null); setMessage(null); inFlight.current = null; setFlight(false); }, [scope]);
    useEffect(() => { setKeep([]); setReverse(false); }, [pendingKey]);
    const canAct = g.phase === 'PLAYING' && g.activePlayerId === self && props.connected && !props.pending && !flight && !retry;
    const route = TRAIN_ROUTES.find(r => r.routeId === selected), payments = route ? trainPayments(g, route) : [], chosen = payments[payment];
    const ticket = TRAIN_TICKETS.find(t => t.ticketId === focusTicket), highlight = ticket ? [ticket.a, ticket.b] : route ? [route.a, route.b] : [];
    const picking = g.phase === 'PLAYING' && (g.step === 'SETUP' || g.step === 'CHOOSE_TICKETS') && g.activePlayerId === self;
    const returned = g.privateState.pendingTickets.filter(t => !keep.includes(t.cardId)).map(t => t.cardId);
    if (reverse)
        returned.reverse();
    async function send(c: TrainClientCommand) {
        if (inFlight.current || !props.connected)
            return;
        const sentScope = scope;
        inFlight.current = c;
        setFlight(true);
        setMessage(null);
        try {
            await props.onCommand(c);
            if (mounted.current && scopeRef.current === sentScope)
                setRetry(null);
        }
        catch (error) {
            if (mounted.current && scopeRef.current === sentScope) {
                if (error instanceof TrainCommandRejected) {
                    setMessage(error.message);
                    setRetry(null);
                    sound.play('ERROR');
                }
                else {
                    setRetry(c);
                    setMessage('응답을 확인하지 못했습니다. 같은 요청으로 결과를 재확인하세요.');
                }
            }
        }
        finally {
            if (mounted.current && inFlight.current === c) {
                inFlight.current = null;
                setFlight(false);
            }
        }
    }
    function act(payload: TrainAction) { if (g.phase !== 'PLAYING' || !canAct)
        return; void send({ kind: 'train:act', protocolVersion: PROTOCOL_VERSION, requestId: createRequestId(), gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId, payload }); }
    function chooseRoute(id: string) { setSelected(id || null); setPayment(0); setFocusTicket(null); sound.play('PICK'); }
    const instruction = g.phase === 'FINISHED' ? '여정이 끝났습니다' : g.activePlayerId !== self ? `${names[g.activePlayerId]}${g.step === 'SETUP' || g.step === 'CHOOSE_TICKETS' ? ' 님이 목적지를 고르고 있습니다' : ' 님의 차례입니다'}` : g.step === 'DRAW_SECOND' ? '열차 카드를 한 장 더 가져오세요' : picking ? '보유할 목적지를 선택하세요' : '카드를 모으거나, 노선을 연결하세요';
    return <>
  <div className={`tr-turn ${g.phase === 'PLAYING' && g.activePlayerId === self ? 'tr-my-turn' : ''}`} role="status"><strong>{instruction}</strong><span>{g.phase === 'PLAYING' && g.step === 'SETUP' ? '출발 준비' : `${g.round}라운드`}{g.finalTurnsRemaining !== null ? ` · 마지막 ${g.finalTurnsRemaining}턴` : ''}</span>{g.phase === 'PLAYING' && players.find(p => p.playerId === g.activePlayerId)?.connectionStatus === 'OFFLINE' ? <span>재접속 대기</span> : null}</div>
  <div className="tr-players">{g.playerStates.map((p, i) => <div className={`tr-player ${g.phase === 'PLAYING' && g.activePlayerId === p.playerId ? 'tr-active' : ''}`} style={{ '--tr-player': TRAIN_PLAYER_PAINT[i] } as CSSProperties} key={p.playerId}><span className="tr-player-name"><i />{names[p.playerId]}{p.playerId === self ? ' · 나' : ''}{p.playerId === g.startingPlayerId ? ' ♛' : ''}</span><strong>{p.routePoints}<small>점</small></strong><span>기차 {p.trains} · 손패 {p.handCount} · 목적지 {p.ticketCount}</span></div>)}</div>
  {g.phase === 'FINISHED' ? <section className="tr-results"><span className="tr-eyebrow">THE JOURNEY'S END</span><h2>{g.result.reason === 'CANCELLED' ? '게임이 취소되었습니다' : `${g.result.winnerPlayerIds.map(id => names[id]).join(' · ')} 승리`}</h2>{g.result.reason === 'STALEMATE' ? <p>모두 가능한 행동이 없어 현재 상태로 정산했습니다.</p> : null}<div className="tr-score-scroll"><table><thead><tr><th>플레이어</th><th>노선</th><th>목적지</th><th>최장 보너스</th><th>총점</th></tr></thead><tbody>{g.result.scores.map(s => <tr key={s.playerId}><th>{names[s.playerId]}</th><td>{s.routePoints}</td><td>{s.ticketPoints}</td><td>{s.longestBonus} <small>({s.longestLength}칸)</small></td><td><b>{s.total}</b></td></tr>)}</tbody></table></div>{g.result.scores.map(s => <details key={s.playerId}><summary>{names[s.playerId]} · 완료 목적지 {s.completedCount}개</summary><div className="tr-ticket-row">{s.tickets.map(t => <Ticket key={t.cardId} card={t} completed={t.completed} selected={focusTicket === t.ticketId} onClick={() => setFocusTicket(t.ticketId)}/>)}</div></details>)}{players.find(p => p.playerId === self)?.isHost ? <button className="tr-primary" disabled={!props.connected || props.pending} onClick={props.onRematch}>같은 방에서 다시 하기</button> : <p>방장이 다음 게임을 선택할 수 있습니다.</p>}</section> : null}
  {picking ? <section className="tr-ticket-choice" aria-label="목적지 선택"><div className="tr-section-title"><h2>{g.step === 'SETUP' ? '첫 여정을 골라 보세요' : '새로운 여정'}</h2><span>최소 {g.privateState.minimumKeep}장 보유 · 현재 {keep.length}장</span></div><div className="tr-ticket-row">{g.privateState.pendingTickets.map(t => <Ticket key={t.cardId} card={t} selected={keep.includes(t.cardId)} disabled={!canAct} onClick={() => { setKeep(k => k.includes(t.cardId) ? k.filter(id => id !== t.cardId) : [...k, t.cardId]); setFocusTicket(t.ticketId); sound.play('PICK'); }}/>)}</div><div className="tr-choice-footer"><span>선택하지 않은 카드는 덱 아래로 돌아갑니다.</span>{returned.length > 1 ? <button disabled={!canAct} onClick={() => setReverse(r => !r)}>반환 순서 바꾸기 · {returned.map(id => { const t = g.privateState.pendingTickets.find(t => t.cardId === id)!; const route = TRAIN_TICKETS.find(x => x.ticketId === t.ticketId)!; return `${trainCityName(route.a)}–${trainCityName(route.b)}`; }).join(' → ')}</button> : null}<button className="tr-primary" disabled={!canAct || keep.length < g.privateState.minimumKeep} onClick={() => act({ kind: 'KEEP_TICKETS', keepCardIds: keep, returnCardIds: returned })}>선택한 {keep.length}장 보유</button></div></section> : null}
  {message ? <p className="tr-error" role="alert">{message}</p> : null}{retry ? <button className="tr-primary" disabled={flight || !props.connected} onClick={() => void send(retry)}>같은 요청 결과 재확인</button> : null}
  <div className="tr-table-layout"><div className="tr-board-column"><TrainBoard game={g} selected={selected} onSelect={chooseRoute} highlight={highlight} names={names}/>
  <section className="tr-route-panel" aria-label="노선 선택과 카드 지불"><div className="tr-route-picker"><label htmlFor="tr-route-select">노선 확인</label><select id="tr-route-select" value={selected ?? ''} onChange={e => chooseRoute(e.target.value)}><option value="">지도에서 누르거나 목록에서 선택</option>{TRAIN_ROUTES.map(r => <option key={r.routeId} value={r.routeId}>{trainCityName(r.a)} ↔ {trainCityName(r.b)} · {TRAIN_LABELS[r.color]} {r.length}칸 {r.lane ? '②' : ''}{g.claims.some(c => c.routeId === r.routeId) ? ' · 점유됨' : ''}</option>)}</select></div>
   {route ? <><div className="tr-section-title"><h3>{trainCityName(route.a)} ↔ {trainCityName(route.b)}</h3><span>{TRAIN_LABELS[route.color]} {route.length}칸 · +{TRAIN_ROUTE_POINTS[route.length]}점</span></div>{!trainRouteOpen(g, route, self) ? <p>이미 점유되었거나 복선 규칙에 따라 사용할 수 없는 노선입니다.</p> : payments.length === 0 ? <p>이 노선을 점유할 카드 또는 기차가 부족합니다.</p> : <><div className="tr-payments">{payments.map((p, i) => <button key={i} aria-pressed={payment === i} onClick={() => { setPayment(i); sound.play('PICK'); }}>{p.ordinary ? `${TRAIN_SYMBOLS[p.color]} ${TRAIN_LABELS[p.color]} ${p.ordinary}장` : ''}{p.wild ? `${p.ordinary ? ' + ' : ''}★ 기관차 ${p.wild}장` : ''}</button>)}</div><div className="tr-choice-footer"><span>기차 {me.trains} → {me.trains - route.length}개</span><button className="tr-primary" disabled={!canAct || g.phase !== 'PLAYING' || g.step !== 'TURN' || !chosen} onClick={() => { if (chosen)
        act({ kind: 'CLAIM_ROUTE', routeId: route.routeId, cardIds: chosen.cardIds }); }}>이 카드로 노선 점유</button></div></>}</> : <p className="tr-muted">노선을 선택하면 필요한 카드와 점수를 확인할 수 있습니다.</p>}
  </section></div>
  <aside className="tr-market" aria-label="공개 열차 카드"><div className="tr-section-title"><h2>열차 카드</h2><span>{g.phase === 'PLAYING' && g.step === 'DRAW_SECOND' ? '두 번째 선택' : '공개 5장'}</span></div><div className="tr-market-cards">{g.market.map(c => <Car key={c.cardId} color={c.color} disabled={!canAct || !trainCanDraw(g, self, c.color)} onClick={() => act({ kind: 'DRAW_MARKET', cardId: c.cardId })}/>)}</div><button className="tr-deck" disabled={!canAct || !trainCanDraw(g, self, 'DECK')} onClick={() => act({ kind: 'DRAW_DECK' })}><span className="tr-deck-emblem">✦</span><b>뒤집힌 카드 뽑기</b><small>덱 {g.deckCount}장 · 버림패 {g.discardCount}장</small></button><button className="tr-ticket-deck" disabled={!canAct || g.phase !== 'PLAYING' || g.step !== 'TURN' || g.ticketDeckCount === 0} onClick={() => act({ kind: 'DRAW_TICKETS' })}>목적지 추가하기 <small>덱 {g.ticketDeckCount}장 · 최소 1장 보유</small></button>{trainCanPass(g) ? <button disabled={!canAct} onClick={() => act({ kind: 'PASS' })}>가능한 행동 없음 · 차례 넘기기</button> : null}<p className="tr-market-hint">공개 기관차는 한 장으로 차례가 끝납니다.</p></aside></div>
  {g.feedback ? <div className="tr-feedback" role="status">{names[g.feedback.playerId]} · {TRAIN_ACTION_LABELS[g.feedback.kind]}{g.feedback.routeId ? ` · ${trainCityName(TRAIN_ROUTES.find(r => r.routeId === g.feedback!.routeId)!.a)} ↔ ${trainCityName(TRAIN_ROUTES.find(r => r.routeId === g.feedback!.routeId)!.b)}` : ''}</div> : null}
  <section className="tr-hand-section"><div className="tr-section-title"><h2>내 열차 카드</h2><span>나에게만 보입니다 · {me.handCount}장</span></div><div className="tr-hand">{TRAIN_COLORS.map(color => <Car key={color} color={color} count={g.privateState.hand.filter(c => c.color === color).length} disabled label={`${TRAIN_LABELS[color]} ${g.privateState.hand.filter(c => c.color === color).length}장 보유`}/>)}</div></section>
  <section className="tr-destinations"><div className="tr-section-title"><h2>내 목적지</h2><span>목적지를 누르면 지도에 두 도시가 표시됩니다.</span></div><div className="tr-ticket-row">{g.privateState.tickets.map(t => <Ticket key={t.cardId} card={t} selected={focusTicket === t.ticketId} completed={t.completed} onClick={() => { setFocusTicket(f => f === t.ticketId ? null : t.ticketId); setSelected(null); }}/>)}</div>{!g.privateState.tickets.length ? <p>출발 준비 중입니다. 차례가 오면 목적지를 골라주세요.</p> : null}</section>
 </>;
}
