import { useEffect, useRef, useState, type RefObject } from "react";
import { GEM_GUIDE_SECTIONS, GEM_TUTORIAL_STEPS, hasSeenGemTutorial, markGemTutorialSeen, nextGemTutorialStep } from "./gem-card-guide.js";

export function GemPurchaseExample() {
  return <figure className="gem-guide-example">
    <figcaption>할인과 프리즘, 한 번에 이해하기</figcaption>
    <table><caption>기본 비용에서 영구 할인을 빼면</caption><thead><tr><th>자원</th><th>기본</th><th>할인</th><th>실제 비용</th></tr></thead>
      <tbody><tr><th>새벽</th><td>3</td><td>−1</td><td>2</td></tr><tr><th>불씨</th><td>2</td><td>−1</td><td>1</td></tr></tbody></table>
    <p>내 보유: <strong>새벽 2 · 불씨 0 · 프리즘 1</strong></p>
    <p className="gem-example-payment">실제 지불: <strong>새벽 2 + 프리즘 1</strong></p>
    <small>영구 할인은 그대로 남습니다. 프리즘도 없다면 구매 불가입니다.</small>
  </figure>;
}

/** Native modal owns focus/inert background only. It has no game or network inputs. */
export function GemHelpDialog({ tutorial, onTutorial, onDismiss, onFinish, returnFocusRef }: Readonly<{
  tutorial: boolean; onTutorial: () => void; onDismiss: () => void; onFinish: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const content = GEM_TUTORIAL_STEPS[step]!;
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
  return <dialog ref={dialogRef} className="gem-help-dialog" aria-modal="true" aria-labelledby="gem-help-heading"
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <header className="gem-help-header"><span>보석 카드 게임 · 게임 방법</span>
      <button type="button" className="text-button" aria-label="게임 방법 닫기" onClick={onDismiss}>닫기 ×</button></header>
    <div className="gem-help-scroll">
      <p className="gem-help-timer">게임 시간은 계속 흐릅니다. 한 턴은 45초이며, 설명을 열어도 멈추지 않습니다.</p>
      {tutorial ? <section className="gem-tutorial-step" aria-live="polite">
        <p className="gem-help-progress">간단히 배우기 · {step + 1} / {GEM_TUTORIAL_STEPS.length}</p>
        <h2 ref={headingRef} id="gem-help-heading" tabIndex={-1}>{content.title}</h2>
        <p>{content.body}</p><div className="gem-tutorial-example">{content.example}</div>
      </section> : <>
        <h2 ref={headingRef} id="gem-help-heading" tabIndex={-1}>보석 카드 게임 방법</h2>
        <p className="gem-help-intro">자원을 모으고 → 카드를 사고 → 영구 할인과 승점을 쌓으세요.</p>
        <button type="button" className="secondary-button" onClick={onTutorial}>6단계 튜토리얼 다시 보기</button>
        <div className="gem-guide-sections">{GEM_GUIDE_SECTIONS.map((section, index) => <section key={section.title}>
          <h3><span>{String(index + 1).padStart(2, "0")}</span> {section.title}</h3><p>{section.body}</p>
          {"example" in section ? <p className="gem-tutorial-example">{section.example}</p> : null}
          {index === 5 ? <GemPurchaseExample /> : null}
        </section>)}</div>
      </>}
    </div>
    {tutorial ? <footer className="gem-help-footer">
      <button type="button" className="text-button" onClick={onFinish}>건너뛰기</button>
      <div><button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep(current => Math.max(0, current - 1))}>이전</button>
        <button type="button" className="primary-button" onClick={() => { const next = nextGemTutorialStep(step); if (next === null) onFinish(); else setStep(next); }}>{step === GEM_TUTORIAL_STEPS.length - 1 ? "완료" : "다음"}</button></div>
    </footer> : <footer className="gem-help-footer"><small>화면 안내는 도움말이며 실제 행동은 서버가 검증합니다.</small></footer>}
  </dialog>;
}

export function GemGameHelp({ placement }: Readonly<{ placement: "LOBBY" | "PLAYING" }>) {
  const [seen, setSeen] = useState(hasSeenGemTutorial);
  const [mode, setMode] = useState<"GUIDE" | "TUTORIAL" | null>(null);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  function finish() { markGemTutorialSeen(); setSeen(true); setMode(null); }
  return <div className={`gem-help-entry${placement === "LOBBY" ? " in-lobby" : ""}`}>
    {placement === "LOBBY" && !seen ? <div className="gem-first-visit">
      <div><strong>게임 시작 전에 간단히 알아볼까요?</strong><p>자원 → 카드 → 영구 할인. 6단계로 시작해보세요.</p></div>
      <button type="button" className="primary-button" onClick={() => setMode("TUTORIAL")}>간단히 배우기</button>
      <button type="button" className="text-button" onClick={finish}>지금은 건너뛰기</button>
    </div> : null}
    <button ref={guideButtonRef} type="button" className="secondary-button gem-help-open" onClick={() => setMode("GUIDE")}>{placement === "LOBBY" ? "게임 방법 보기" : "? 게임 방법"}</button>
    {mode === null ? null : <GemHelpDialog key={mode} tutorial={mode === "TUTORIAL"} onTutorial={() => setMode("TUTORIAL")} onDismiss={() => setMode(null)} onFinish={finish} returnFocusRef={guideButtonRef} />}
  </div>;
}
