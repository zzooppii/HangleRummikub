import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PROTOCOL_VERSION, VEGAS_FACES, type VegasClientCommand, type VegasFace, type VegasProjection } from "@hangul-rummikub/shared";
import type { VegasWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import { VegasCommandRejected } from "../../lib/vegas-command-error.js";
import { createRequestId } from "../../lib/request-id.js";
import { getGameStartControl } from "../../lib/game-start.js";
import { previewVegas, vegasGroups, vegasMoney, VEGAS_MARKS, VEGAS_NAMES } from "./ui.js";
import { useVegasSound } from "./sound.js";
import { useVegasClock } from "./use-vegas-clock.js";
type Props = Readonly<{
    snapshot: VegasWebSnapshot;
    connected: boolean;
    pending: boolean;
    error: string | null;
    connectionLabel: string;
    onCommand(command: VegasClientCommand): Promise<void>;
    onRematch(): void;
    onStart(): void;
    onLeave(): void;
    onCopy(): void;
}>;
const dots: Record<VegasFace, readonly number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function VegasDie({ face, seat = 0, small = false }: {
    face: VegasFace;
    seat?: number;
    small?: boolean;
}) { return <span className={`vg-die vg-seat-${seat}${small ? ' vg-die-small' : ''}`} aria-label={`${face} 눈 주사위`}><span className="vg-pips" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} className={dots[face].includes(i) ? 'vg-pip' : 'vg-no-pip'}/>)}</span></span>; }
function Banknote({ amount }: {
    amount: number;
}) { return <span className={`vg-banknote vg-note-${amount / 10000}`} aria-label={`상금 ${vegasMoney(amount)}`}><small>LAS VEGAS</small><strong>{vegasMoney(amount)}</strong><span aria-hidden="true">✦ ━━━━━ ✦</span></span>; }
export function VegasScreen(props: Props) {
    const s = props.snapshot, g = s.game, sound = useVegasSound(g, s.self.playerId, props.connected), start = getGameStartControl(s, props.pending || !props.connected);
    return <section className="vg-screen" onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    <header className={`vg-hero${g ? ' vg-hero-playing' : ''}`}><div className="vg-topline"><span>THE DICE BOULEVARD</span><div><button onClick={props.onCopy}>방 {s.room.roomCode} · 초대</button><span className="vg-connection">{props.connectionLabel}</span><button onClick={props.onLeave} disabled={props.pending}>나가기</button></div></div><div className="vg-hero-title"><span>LUCK. TIMING. A LITTLE NERVE.</span><h1>라스베이거스</h1><p>한 번의 선택, 달라지는 상금의 주인.</p></div></header>
    <div className="vg-utility"><span>2–5 PLAYERS <i>◆</i> FOUR ROUNDS</span><div className="vg-sound"><button type="button" onClick={() => sound.changeVolume(sound.volume ? 0 : 60)} aria-pressed={sound.volume === 0}>{sound.volume ? '소리 켜짐' : '음소거'}</button><label>음량 <input aria-label="효과음 음량" type="range" min="0" max="100" value={sound.volume} onChange={e => sound.changeVolume(Number(e.target.value))}/><span>{sound.volume}%</span></label><button onClick={() => sound.play('ROLL')} disabled={!sound.volume}>소리 듣기</button></div></div>
    {props.error && <p className="vg-error" role="alert">{props.error}</p>}
    {!g ? <div className="vg-lobby"><div><span className="vg-eyebrow">WELCOME TO THE TABLE</span><h2>오늘의 행운을 시험해볼까요?</h2><p>주사위를 굴리고, 같은 숫자를 모아 카지노를 차지하세요.<br />동률이 되는 순간, 상금은 다른 사람에게 넘어갑니다.</p><div className="vg-lobby-dice">{[1, 3, 5].map((face, i) => <VegasDie key={face} face={VEGAS_FACES[face - 1]!} seat={i}/>)}</div></div><div className="vg-guest-list"><h3>테이블에 앉은 사람들 <span>{s.room.players.length}/5</span></h3>{s.room.players.map((p, i) => <div key={p.playerId}><span className={`vg-seat-ink-${i}`}>{VEGAS_MARKS[i]}</span><strong>{p.nickname}{p.playerId === s.self.playerId ? ' · 나' : ''}</strong><small>{p.isHost ? '방장 · ' : ''}{p.connectionStatus === 'CONNECTED' ? '접속 중' : '재접속 대기'}</small></div>)}<button className="vg-primary" disabled={!start.canStart} onClick={() => { sound.unlock(); props.onStart(); }}>카지노 열기</button><p>{start.guidance}</p></div></div> : <VegasTable key={g.gameId} {...props} game={g} sound={sound}/>}
    <details className="vg-rules"><summary>처음 오셨나요? 게임 방법과 온라인 규칙</summary><div><p><b>굴리고, 고르고, 놓기.</b> 각자 주사위 8개로 시작합니다. 차례마다 남은 주사위를 모두 굴리고, 나온 숫자 하나의 주사위 전부를 해당 카지노에 놓습니다. 남은 주사위는 다음 내 차례에 다시 굴립니다.</p><p><b>동률은 모두 제외.</b> 전원이 주사위를 쓰면 같은 카지노에 같은 개수를 놓은 사람은 모두 지급에서 제외됩니다. 남은 사람에게 주사위가 많은 순서로 가장 큰 지폐부터 한 장씩 지급합니다. 남은 지폐는 더미 아래로 돌아갑니다.</p><p><b>네 번의 승부.</b> 매 라운드 주사위 8개와 새로운 상금으로 시작합니다. 카지노마다 합계 $50,000 이상을 놓습니다. 4라운드 합계 금액이 가장 크면 승리! 동점이면 지폐 수를 비교하고 그래도 같으면 공동 승리합니다.</p><p><b>30초의 선택.</b> 굴리기와 배치를 합쳐 30초. 만료되면 서버가 가능한 눈 중 무작위로 하나를 골라 자동 배치합니다. 새로고침·재접속으로 결과나 시간이 바뀌지 않습니다. 나가기 버튼은 이번 게임을 취소합니다.</p><p>내 누적 금액만 볼 수 있고 상대 누적 금액은 종료 시 공개합니다. 현재 주사위·카지노·라운드 지급 내역은 공개됩니다. 지급 예상은 현재 배치 기준이며 상대의 다음 선택에 따라 달라집니다.</p></div></details>
  </section>;
}
function VegasTable({ game: g, sound, ...props }: Props & {
    game: VegasProjection;
    sound: ReturnType<typeof useVegasSound>;
}) {
    const self = props.snapshot.self.playerId, players = props.snapshot.room.players, seat = g.playerStates.findIndex(p => p.playerId === self);
    const nickname = (id: string) => players.find(p => p.playerId === id)?.nickname ?? '플레이어';
    const [selection, setSelection] = useState<VegasFace | null>(null), [flight, setFlight] = useState(false), [retry, setRetry] = useState<VegasClientCommand | null>(null), [message, setMessage] = useState<string | null>(null), [animate, setAnimate] = useState(false), [freshRound, setFreshRound] = useState(false);
    const lock = useRef(false), mounted = useRef(true), previous = useRef(g);
    const scope = `${g.gameId}:${g.gameRevision}`, scopeRef = useRef(scope);
    scopeRef.current = scope;
    const seconds = useVegasClock(props.snapshot.serverTime, g.phase === 'PLAYING' ? g.deadlineAt : null);
    const myTurn = g.phase === 'PLAYING' && g.activePlayerId === self;
    const canAct = myTurn && props.connected && !props.pending && !flight && !retry && seconds > 0;
    const selectionNow = selection !== null && g.phase === 'PLAYING' && g.rolled.includes(selection) ? selection : null;
    const preview = previewVegas(g, self, selectionNow), groups = vegasGroups(g), warned = useRef<string | null>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setSelection(null); setRetry(null); setMessage(null); if (g.gameRevision > previous.current.gameRevision) {
        setAnimate(true);
        if ((g.lastRound?.round ?? 0) > (previous.current.lastRound?.round ?? 0))
            setFreshRound(true);
    } previous.current = g; const timer = setTimeout(() => { setAnimate(false); setFreshRound(false); }, 1500); return () => clearTimeout(timer); }, [scope]);
    useEffect(() => { const id = g.phase === 'PLAYING' ? g.turnId : null; if (myTurn && props.connected && seconds > 0 && seconds <= 5 && warned.current !== id) {
        warned.current = id;
        sound.play('WARNING');
    } }, [seconds, myTurn, props.connected, g, sound]);
    async function send(command: VegasClientCommand) {
        if (lock.current || !props.connected)
            return;
        lock.current = true;
        setFlight(true);
        setMessage(null);
        const sentScope = scopeRef.current;
        try {
            await props.onCommand(command);
            if (mounted.current && scopeRef.current === sentScope) {
                setRetry(null);
                setSelection(null);
            }
        }
        catch (error) {
            if (mounted.current && scopeRef.current === sentScope) {
                if (error instanceof VegasCommandRejected) {
                    setRetry(null);
                    setMessage(error.message);
                    sound.play('ERROR');
                }
                else {
                    setRetry(command);
                    setMessage('응답을 확인하지 못했습니다. 같은 요청의 결과를 다시 확인해주세요.');
                }
            }
        }
        finally {
            lock.current = false;
            if (mounted.current)
                setFlight(false);
        }
    }
    function submit() { if (!canAct || g.phase !== 'PLAYING')
        return; const payload = g.turnStage === 'AWAITING_ROLL' ? { kind: 'ROLL' as const } : selectionNow !== null ? { kind: 'PLACE' as const, face: selectionNow } : null; if (!payload)
        return; void send({ kind: 'vegas:act', protocolVersion: PROTOCOL_VERSION, requestId: createRequestId(), gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId, payload }); }
    function select(face: VegasFace) {
        if (!canAct || !groups.some(p => p.face === face)) return;
        setSelection(face);
        sound.play('PICK');
        if (window.matchMedia('(max-width: 580px)').matches) {
            document.querySelector(`.vg-casino-${face}`)?.scrollIntoView({
                block: 'start',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
            });
        }
    }
    const chosen = selectionNow === null ? null : preview[selectionNow - 1], ownAward = chosen?.awards.find(a => a.playerIndex === seat)?.amount ?? 0;
    return <div className={`vg-game${myTurn ? ' vg-my-turn' : ''}${seconds <= 5 && myTurn ? ' vg-urgent' : ''}`}>
    <div className="vg-turnbar"><div role="status"><span className="vg-eyebrow">{g.phase === 'FINISHED' ? 'THE FINAL COUNT' : myTurn ? 'YOUR TURN' : 'AT THE TABLE'}</span><h2>{g.phase === 'FINISHED' ? '오늘의 승부가 끝났습니다' : myTurn ? '지금, 내 차례입니다' : `${nickname(g.activePlayerId)}님의 차례`}</h2><p>{g.phase === 'PLAYING' ? (g.turnStage === 'AWAITING_ROLL' ? '남은 주사위를 모두 굴려주세요' : '나온 숫자 하나를 골라 모두 놓아주세요') : '다음 테이블에서도 행운이 함께하길!'}</p></div><div className="vg-round">ROUND <strong>{g.round}<small>/ 4</small></strong></div>{g.phase === 'PLAYING' && <div className="vg-clock" role="timer" aria-label={`남은 시간 ${seconds}초`}><strong>{seconds}</strong><small>초 남음</small></div>}</div>
    <div className="vg-players">{g.playerStates.map((p, i) => <div key={p.playerId} className={`vg-player vg-seat-${i}${g.phase === 'PLAYING' && g.activePlayerId === p.playerId ? ' vg-active' : ''}`}><span className="vg-player-name"><i>{VEGAS_MARKS[i]}</i><strong>{nickname(p.playerId)}{p.playerId === self ? ' · 나' : ''}</strong>{p.playerId === g.roundStarterId && <small>선</small>}</span><span className="vg-dice-meter" aria-label={`남은 주사위 ${p.remainingDice}개`}>{Array.from({ length: 8 }, (_, n) => <i key={n} className={n < p.remainingDice ? 'vg-remaining' : ''}/>)}<b>{p.remainingDice}</b></span><small>{players.find(a => a.playerId === p.playerId)?.connectionStatus === 'OFFLINE' ? '재접속 대기 · ' : ''}{p.playerId === self ? vegasMoney(g.ownBanknotes.reduce((a, b) => a + b, 0)) : g.phase === 'FINISHED' && g.result.reason === 'FOUR_ROUNDS' ? vegasMoney(g.result.scores.find(a => a.playerId === p.playerId)?.total ?? 0) : '획득 금액 비공개'}</small></div>)}</div>
    {g.phase === 'FINISHED' && <section className="vg-result"><span className="vg-eyebrow">{g.result.reason === 'CANCELLED' ? 'UNTIL NEXT TIME' : 'WINNER’S CIRCLE'}</span><h2>{g.result.reason === 'CANCELLED' ? '참가자 퇴장으로 게임이 취소되었습니다' : `${g.result.winnerPlayerIds.map(nickname).join(' · ')}${g.result.winnerPlayerIds.length > 1 ? ' 공동 승리' : '님의 승리'}`}</h2>{[...g.result.scores].sort((a, b) => b.total - a.total || b.banknoteCount - a.banknoteCount).map(p => <p key={p.playerId}><span>{nickname(p.playerId)}</span><strong>{vegasMoney(p.total)}</strong><small>지폐 {p.banknoteCount}장</small></p>)}{players.find(p => p.playerId === self)?.isHost ? <button className="vg-primary" onClick={props.onRematch} disabled={!props.connected || props.pending}>같은 방에서 다시 하기</button> : <p>방장이 다음 게임을 선택할 수 있습니다.</p>}</section>}
    {g.lastRound && <details key={g.lastRound.round} className={`vg-recap${freshRound ? ' vg-recap-fresh' : ''}`} open={freshRound || g.phase === 'FINISHED' ? true : undefined}><summary>{g.lastRound.round}라운드 정산 <span>동률 제외와 지폐 지급 내역 보기</span></summary><div className="vg-recap-grid">{g.lastRound.casinos.map(c => <div key={c.face}><strong>{c.face}번 · {VEGAS_NAMES[c.face - 1]}</strong>{c.excludedPlayerIds.length > 0 && <p className="vg-tied">{c.excludedPlayerIds.map(nickname).join(' · ')} 동률 제외</p>}{c.awards.length ? c.awards.map(a => <p className="vg-award" key={a.playerId}>{nickname(a.playerId)} <b>+{vegasMoney(a.amount)}</b></p>) : <p>수령자 없음</p>}{c.returned.length > 0 && <small>더미로 반환 {c.returned.map(vegasMoney).join(' · ')}</small>}</div>)}</div></details>}
    <div className="vg-board-heading"><span className="vg-eyebrow">SIX CASINOS. YOUR CALL.</span><span>현재 배치 기준 지급 예상 · 같은 개수는 모두 제외</span></div>
    <div className="vg-casinos">{VEGAS_FACES.map((face, i) => {
            const p = preview[i]!, selected = selectionNow === face, available = canAct && groups.some(a => a.face === face), landed = animate && g.feedback?.kind === 'PLACE' && g.feedback.face === face;
            return <article key={face} className={`vg-casino vg-casino-${face}${selected ? ' vg-selected' : ''}${landed ? ' vg-landed' : ''}`}><button type="button" className="vg-casino-art" style={{ '--vg-art-position': `${i * 20}%` } as CSSProperties} disabled={!available} onClick={() => select(face)} aria-pressed={selected} aria-label={`${face}번 ${VEGAS_NAMES[i]}${available ? '에 같은 눈 전체 선택' : ''}`}><span className="vg-casino-sign"><VegasDie face={face} seat={seat} small/><span><small>CASINO 0{face}</small><strong>{VEGAS_NAMES[i]}</strong></span><i aria-hidden="true">{selected ? '✓' : '✦'}</i></span></button><div className="vg-casino-body"><div className="vg-banknotes">{g.casinos[i]!.map((amount, j) => <Banknote amount={amount} key={j}/>)}{g.casinos[i]!.length === 0 && <span className="vg-empty">이번 상금 지급 완료</span>}</div><div className="vg-stacks">{g.playerStates.map((player, j) => { const n = p.counts[j]!; return <div key={player.playerId} className={`vg-stack vg-seat-${j}${p.excluded[j] ? ' vg-stack-tied' : ''}`}><span><i>{VEGAS_MARKS[j]}</i>{nickname(player.playerId)}</span><div className="vg-mini-dice" aria-hidden="true">{Array.from({ length: n }, (_, k) => <span key={k} className={j === seat && selected && k >= player.casinoDice[i]! ? 'vg-ghost-die' : ''}>{face}</span>)}</div><b>{selected && j === seat && p.added > 0 ? `${player.casinoDice[i]} → ` : ''}{n}<small>{p.excluded[j] ? ' 동률 제외' : '개'}</small></b></div>; })}</div><div className="vg-payout"><small>{selected ? '배치 후 지급 예상' : '현재 지급 예상'}</small><span>{p.awards.length ? p.awards.map(a => `${nickname(g.playerStates[a.playerIndex]!.playerId)} ${vegasMoney(a.amount)}`).join(' · ') : '수령자 없음'}</span></div></div></article>;
        })}</div>
    {g.feedback && <p className="vg-last-action" role="status">{g.feedback.automatic ? '시간 초과 · 자동 배치 · ' : ''}{nickname(g.feedback.playerId)} · {g.feedback.kind === 'ROLL' ? `주사위 ${g.feedback.count}개를 굴렸습니다` : `${g.feedback.face}번 카지노에 ${g.feedback.count}개를 놓았습니다`}</p>}
    {g.phase === 'PLAYING' && <section className="vg-actionbar" aria-label="주사위 굴리기와 배치"><div className="vg-action-heading"><div><span className="vg-eyebrow">{myTurn ? 'YOUR DICE' : 'ON THE TABLE'}</span><strong>{!props.connected ? '연결 복구 중 · 시간은 계속 흐릅니다' : seconds === 0 ? '시간 종료 · 자동 배치 결과 확인 중' : flight ? '선택을 반영하고 있습니다…' : g.turnStage === 'AWAITING_ROLL' ? `${myTurn ? '내' : nickname(g.activePlayerId) + '님의'} 남은 주사위 ${g.playerStates.find(p => p.playerId === g.activePlayerId)!.remainingDice}개` : myTurn ? '같은 숫자를 한 번에 선택하세요' : `${nickname(g.activePlayerId)}님이 숫자를 고르고 있습니다`}</strong></div><span className="vg-small-clock">{seconds}초</span></div><div className="vg-action-content"><div className={`vg-roll-groups${animate && g.feedback?.kind === 'ROLL' ? ' vg-rolling' : ''}`}>{g.turnStage === 'AWAITING_ROLL' ? <div className="vg-roll-invite"><VegasDie face={5} seat={g.playerStates.findIndex(p => p.playerId === g.activePlayerId)}/><span>행운은 주사위 끝에서 시작됩니다.</span></div> : groups.map(group => <button type="button" key={group.face} aria-label={`${group.face} 눈 ${group.count}개 선택`} aria-pressed={selectionNow === group.face} disabled={!canAct} onClick={() => select(group.face)}><span className="vg-group-dice">{Array.from({ length: group.count }, (_, i) => <VegasDie key={i} face={group.face} seat={g.playerStates.findIndex(p => p.playerId === g.activePlayerId)} small/>)}</span><strong><span className="vg-group-face">{group.face}번 · </span>{group.count}개</strong></button>)}</div><button className="vg-primary" disabled={retry ? !props.connected || flight : !canAct || (g.turnStage === 'AWAITING_PLACEMENT' && selectionNow === null)} onClick={() => retry ? void send(retry) : submit()}>{retry ? '요청 결과 다시 확인' : flight ? '처리 중…' : g.turnStage === 'AWAITING_ROLL' ? '주사위 굴리기' : selectionNow ? `${selectionNow}번에 ${chosen?.added}개 배치` : '숫자를 선택하세요'}</button></div><p className="vg-selection-copy" aria-live="polite">{chosen ? chosen.excluded[seat] ? `배치하면 나도 동률로 제외됩니다 · 내 지급 예상 $0` : `배치 후 내 지급 예상 ${vegasMoney(ownAward)} · 다음 선택에 따라 달라집니다` : myTurn ? '숫자를 선택하면 카지노에 배치 결과를 미리 보여드립니다.' : '모든 주사위와 카지노의 경쟁 상황은 함께 볼 수 있습니다.'}</p>{message && <p className="vg-error" role="alert">{message}</p>}</section>}
  </div>;
}
