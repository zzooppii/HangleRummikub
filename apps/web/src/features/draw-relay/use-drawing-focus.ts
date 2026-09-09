import { useEffect, type RefObject } from "react";

/** Keep the existing editor mounted; only its presentation and page scrolling change. */
export function useDrawingFocus(active: boolean, studio: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const element = studio.current;
    if (!active || !element) return;
    const previousFocus = document.activeElement;
    const scrollY = window.scrollY, scrollX = window.scrollX;
    const style = document.body.style;
    const previous = { position: style.position, top: style.top, left: style.left, width: style.width, overflow: style.overflow };
    Object.assign(style, { position: "fixed", top: `-${scrollY}px`, left: `-${scrollX}px`, width: "100%", overflow: "hidden" });
    const siblings: { element: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement = element;
    while (branch.parentElement && branch !== document.body) {
      for (const sibling of branch.parentElement.children) if (sibling !== branch && sibling instanceof HTMLElement) {
        siblings.push({ element: sibling, inert: sibling.inert }); sibling.inert = true;
      }
      branch = branch.parentElement;
    }
    const controls = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
    controls()[0]?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    element.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("keydown", onKey);
      siblings.forEach(item => { item.element.inert = item.inert; });
      Object.assign(style, previous);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [active, studio, close]);
}
