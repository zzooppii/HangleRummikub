import { useEffect, useRef, useState, type RefObject } from "react";
import { CITY_GUIDE_SECTIONS, CITY_TUTORIAL_STEPS, hasSeenCityTutorial, markCityTutorialSeen, nextCityTutorialStep } from "./city-role-guide.js";

/** Native modal focus/inert behavior only; no gameplay or timer inputs. */
export function CityHelpDialog({ tutorial, onTutorial, onDismiss, onFinish, returnFocusRef }: Readonly<{
  tutorial: boolean; onTutorial: () => void; onDismiss: () => void; onFinish: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const content = CITY_TUTORIAL_STEPS[step]!;
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (dialog === null) return;
    dialog.showModal();
    headingRef.current?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      else returnFocusRef?.current?.focus();
    };
  }, []);
  function changeStep(next: number) {
    setStep(next);
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  }
  return <dialog ref={dialogRef} className="city-help-dialog" aria-modal="true" aria-labelledby="city-help-heading"
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <header className="city-help-header"><span>비밀 도시 게임 · 게임 방법</span>
      <button type="button" className="text-button" aria-label="게임 방법 닫기" onClick={onDismiss}>닫기 ×</button></header>
    <div ref={scrollRef} className="city-help-scroll">
      <p className="city-help-timer">선택 45초 · 행동 90초. 설명을 열어도 게임 시간은 계속 흐릅니다.</p>
      {tutorial ? <section className="city-tutorial-step" aria-live="polite">
        <p className="city-help-progress">간단히 배우기 · {step + 1} / {CITY_TUTORIAL_STEPS.length}</p>
        <h2 ref={headingRef} id="city-help-heading" tabIndex={-1}>{content.title}</h2>
        <p>{content.body}</p><p className="city-tutorial-example">{content.example}</p>
      </section> : <>
        <h2 ref={headingRef} id="city-help-heading" tabIndex={-1}>비밀 도시 게임 방법</h2>
        <p>비밀 역할을 고르고, 금화와 카드로 나만의 도시를 건설하세요.</p>
        <button type="button" className="secondary-button" onClick={onTutorial}>7단계 튜토리얼 다시 보기</button>
        <div className="city-guide-sections">{CITY_GUIDE_SECTIONS.map((section, index) => <section key={section.title}>
          <h3><span>{String(index + 1).padStart(2, "0")}</span> {section.title}</h3><p>{section.body}</p>
        </section>)}</div>
      </>}
    </div>
    {tutorial ? <footer className="city-help-footer">
      <button type="button" className="text-button" onClick={onFinish}>건너뛰기</button>
      <div><button type="button" className="secondary-button" disabled={step === 0} onClick={() => changeStep(Math.max(0, step - 1))}>이전</button>
        <button type="button" className="primary-button" onClick={() => { const next = nextCityTutorialStep(step); if (next === null) onFinish(); else changeStep(next); }}>{step === CITY_TUTORIAL_STEPS.length - 1 ? "완료" : "다음"}</button></div>
    </footer> : <footer className="city-help-footer"><small>실제 행동과 규칙의 최종 판단은 서버가 담당합니다.</small></footer>}
  </dialog>;
}

export function CityGameHelp({ placement }: Readonly<{ placement: "LOBBY" | "PLAYING" }>) {
  const [seen, setSeen] = useState(hasSeenCityTutorial);
  const [mode, setMode] = useState<"GUIDE" | "TUTORIAL" | null>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  function finish() { markCityTutorialSeen(); setSeen(true); setMode(null); }
  return <div className={`city-help-entry${placement === "LOBBY" ? " in-lobby" : ""}`}>
    {placement === "LOBBY" && !seen ? <div className="city-first-visit">
      <div><strong>처음이라면 7단계로 배워보세요</strong><p>역할 선택부터 금화·건설·점수까지, 함께 시작할 준비를 해요.</p></div>
      <button type="button" className="primary-button" onClick={() => setMode("TUTORIAL")}>간단히 배우기</button>
      <button type="button" className="text-button" onClick={finish}>지금은 건너뛰기</button>
    </div> : null}
    <button ref={guideButtonRef} type="button" className="secondary-button city-help-open" onClick={() => setMode("GUIDE")}>{placement === "LOBBY" ? "게임 방법 보기" : "? 게임 방법"}</button>
    {mode === null ? null : <CityHelpDialog key={mode} tutorial={mode === "TUTORIAL"} onTutorial={() => setMode("TUTORIAL")} onDismiss={() => setMode(null)} onFinish={finish} returnFocusRef={guideButtonRef} />}
  </div>;
}
