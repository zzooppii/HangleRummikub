import { CITY_LANDMARK_TEXT, CITY_LANDMARK_NAMES } from "./city-landmarks.js";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CITY_GUIDE_SECTIONS, CITY_TUTORIAL_STEPS, hasSeenCityTutorial, markCityTutorialSeen, nextCityTutorialStep } from "./city-role-guide.js";
import { CityBuildingArt, CityCategoryGuide, CityIcon, CityRoleEmblem, CityRoleLegend } from "./CityVisuals.js";

/** Native modal focus/inert behavior only; no gameplay or timer inputs. */
export function CityHelpDialog({ tutorial, onTutorial, onDismiss, onFinish, returnFocusRef, rulesVersion = "city-rules-v1" }: Readonly<{
  tutorial: boolean; onTutorial: () => void; onDismiss: () => void; onFinish: () => void;
  rulesVersion?: string;
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
        <div className="city-tutorial-art" aria-hidden="true">{step === 2 || step === 5 ? <><CityRoleEmblem roleId="CR-03" /><CityRoleEmblem roleId="CR-07" /></> : step === 3 ? <><CityIcon name="coin" /><CityIcon name="cards" /></> : <CityBuildingArt category={step === 6 ? "LANDMARK" : "CIVIC"} />}</div>
        <p>{content.body}</p>{rulesVersion === "city-rules-v2" && step === 4 ? <p>명소는 각각 고유한 특수 능력을 가진 건물입니다. 카드의 ★ 표시를 확인하세요. 바람계단 할인은 일반 건물에만 적용됩니다.</p> : null}<p className="city-tutorial-example">{content.example}</p>{rulesVersion === "city-rules-v2" && step === 6 ? <p>달그림회랑은 다양성에 빠진 일반 분류 1종만 보완하고, 일곱길기념뜰은 실제 일반 분류마다 최대 4점을 더합니다. 기권 시 두 보너스는 없습니다.</p> : null}
      </section> : <>
        <h2 ref={headingRef} id="city-help-heading" tabIndex={-1}>비밀 도시 게임 방법</h2>
        <p>비밀 역할을 고르고, 금화와 카드로 나만의 도시를 건설하세요.</p>
        <button type="button" className="secondary-button" onClick={onTutorial}>7단계 튜토리얼 다시 보기</button>
        <CityCategoryGuide rulesVersion={rulesVersion} /><CityRoleLegend />{rulesVersion === "city-rules-v2" ? <section className="city-landmark-guide"><h3>명소 · 여섯 가지 특수 능력</h3><p>효과는 건설 후 적용됩니다. 파괴·기권 시 남은 할인은 소멸하고, 재건설로 보상이나 횟수가 복구되지 않습니다.</p>{Object.entries(CITY_LANDMARK_TEXT).map(([id, effect]) => <p key={id}><strong>★ {CITY_LANDMARK_NAMES[id]} · {effect.short}</strong><br />{effect.detail}</p>)}</section> : null}
        <div className="city-guide-sections">{CITY_GUIDE_SECTIONS.map((section, index) => <section key={section.title}>
          <h3><span>{String(index + 1).padStart(2, "0")}</span> {section.title}</h3><p>{section.body}</p>{rulesVersion === "city-rules-v2" && index === 9 ? <p>예외: 돌물결마당은 해체 비용이 1 증가하여 금화 2가 필요합니다.</p> : null}{rulesVersion === "city-rules-v2" && index === 10 ? <p>여기에 일곱길기념뜰의 실제 일반 분류 보너스(최대4)를 더합니다. 달그림회랑은 다양성 판정만 보완하며 +3을 중복 지급하지 않습니다.</p> : null}
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

export function CityGameHelp({ placement, rulesVersion = "city-rules-v2" }: Readonly<{ placement: "LOBBY" | "PLAYING"; rulesVersion?: string }>) {
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
    {mode === null ? null : <CityHelpDialog key={mode} tutorial={mode === "TUTORIAL"} onTutorial={() => setMode("TUTORIAL")} onDismiss={() => setMode(null)} onFinish={finish} returnFocusRef={guideButtonRef} rulesVersion={rulesVersion} />}
  </div>;
}
