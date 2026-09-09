import { useEffect, useRef, useState, type ReactNode } from "react";
import { createCityImpactTracker, type CityImpact, type CityImpactSnapshot } from "./city-impact.js";
import type { CityActionFeedback } from "./city-role-actions.js";
import { playCityImpactSound } from "./city-role-sound.js";
import { CityIcon } from "./CityVisuals.js";
import { CityTemplateArt } from "./CityTemplateArt.js";

export function CityImpactBanner({ events }: Readonly<{ events: readonly CityImpact[] }>) {
  return <div className="city-impact-banner" role="status" aria-live="polite" aria-atomic="true">
    {events.map(event => <div key={event.id} className={`city-impact city-impact-${event.cue.toLowerCase()} is-${event.intensity}`}>
      {event.cue === "STRIKE" ? <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M26 3 13 18l-3-3L26 3ZM9 17l6 6M11 21l-6 7M5 8l22 19" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg> :
        <CityIcon name={event.cue === "SHIELD" ? "shield" : event.cue === "BUILD" || event.cue === "BREAK" ? "hammer" : event.cue === "LEADER" ? "compass" : event.cue === "DRAW" || event.cue === "SHUFFLE" ? "cards" : event.cue === "COIN_GAIN" || event.cue === "COIN_LOSS" ? "coin" : "landmark"} />}
      <span>{event.message}</span>
      {event.departingBuilding ? <span className="city-impact-retired" aria-hidden="true"><CityTemplateArt templateId={event.departingBuilding.templateId} category={event.departingBuilding.category} /><svg className="city-impact-crack" viewBox="0 0 100 70"><path d="m48 0-8 20 14 9-15 18 9 23M42 42l-23-6" fill="none" stroke="#60372f" strokeWidth="3" /></svg></span> : null}
    </div>)}
  </div>;
}

/** Same mounted CITY boundary across Playing→Finished. No persisted private event log. */
export function CityImpactLayer({ snapshot, connected, feedback, children }: Readonly<{
  snapshot: CityImpactSnapshot; connected: boolean; feedback: CityActionFeedback | null; children: ReactNode;
}>) {
  const tracker = useRef(createCityImpactTracker());
  const [batch, setBatch] = useState<readonly CityImpact[]>([]);
  const [log, setLog] = useState<readonly CityImpact[]>([]);
  const scope = `${snapshot.room.roomId}:${snapshot.game.gameId}:${snapshot.self.playerId}`;
  const lastScope = useRef(scope);
  const round = useRef(snapshot.game.roundNumber);
  const root = useRef<HTMLDivElement>(null);
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!connected || lastScope.current !== scope) {
      tracker.current.reset(); setBatch([]); setLog([]); lastScope.current = scope;
      if (!connected) return;
    }
    if (round.current !== snapshot.game.roundNumber) { setLog([]); round.current = snapshot.game.roundNumber; }
    const events = tracker.current.accept(snapshot, feedback);
    if (events.length === 0) return;
    setBatch(prior => [...prior, ...events]); setLog(prior => [...prior, ...events].slice(-8));
  }, [snapshot, connected, feedback, scope]);
  useEffect(() => {
    const event = batch[0];
    if (!event) return;
    if (played.current !== event.id) { played.current = event.id; playCityImpactSound(event.cue); }
    const marked: Element[] = [];
      for (const card of root.current?.querySelectorAll<HTMLElement>("[data-impact-card]") ?? []) {
        if (card.dataset.impactCard === event.cardId) { card.setAttribute("data-impact-cue", event.cue); marked.push(card); }
      }
    const timer = setTimeout(() => setBatch(prior => prior.slice(1)), 2000);
    return () => { clearTimeout(timer); for (const node of marked) node.removeAttribute("data-impact-cue"); };
  }, [batch[0]]);
  return <div className="city-impact-root" ref={root} data-city-impact={batch[0]?.cue ?? ""}>
    {children}
    <CityImpactBanner events={connected && lastScope.current === scope ? batch.slice(0, 1) : []} />
    {connected && lastScope.current === scope && log.length ? <details className="city-impact-log"><summary>이번 라운드 기록 · 내 화면 전용</summary><ol>{log.map(event => <li key={event.id}>{event.message}</li>)}</ol></details> : null}
  </div>;
}
