import { useEffect } from "react";

const SCROLLBAR_VISIBLE_MS = 900;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);
const timers = new WeakMap<HTMLElement, number>();
const intentUntil = new WeakMap<HTMLElement, number>();

/** Shows the scrollbar for the scroll container the user is interacting with. */
export function useAutoHideScrollbars() {
  useEffect(() => {
    const show = (container: HTMLElement) => {
      container.classList.add("z-scrollbar-active");
      const previousTimer = timers.get(container);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      timers.set(container, window.setTimeout(() => {
        container.classList.remove("z-scrollbar-active");
        timers.delete(container);
      }, SCROLLBAR_VISIBLE_MS));
    };

    const showForTarget = (target: EventTarget | null, deltaX = 0, deltaY = 0) => {
      const container = findScrollableAncestor(target, deltaX, deltaY);
      if (!container) return;
      intentUntil.set(container, Date.now() + SCROLLBAR_VISIBLE_MS);
      show(container);
    };

    const showAfterUserScroll = (target: EventTarget | null) => {
      const container = findScrollableAncestor(target, 0, 0);
      if (!container || (intentUntil.get(container) ?? 0) < Date.now()) return;
      show(container);
    };

    const onWheel = (event: WheelEvent) => showForTarget(event.target, event.deltaX, event.deltaY);
    const onTouchStart = (event: TouchEvent) => showForTarget(event.target);
    const onTouchMove = (event: TouchEvent) => showForTarget(event.target);
    const onScroll = (event: Event) => showAfterUserScroll(event.target);
    const onPointerDown = (event: PointerEvent) => {
      const container = findScrollableAncestor(event.target, 0, 0);
      if (!container) return;
      intentUntil.set(container, Date.now() + SCROLLBAR_VISIBLE_MS);
      show(container);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) showForTarget(event.target);
    };

    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}

function findScrollableAncestor(target: EventTarget | null, deltaX: number, deltaY: number) {
  let element = target instanceof Element ? target : null;
  while (element) {
    if (element instanceof HTMLElement && canScroll(element, deltaX, deltaY)) return element;
    element = element.parentElement;
  }
  const root = document.scrollingElement;
  return root instanceof HTMLElement && canScroll(root, deltaX, deltaY) ? root : null;
}

function canScroll(element: HTMLElement, deltaX: number, deltaY: number) {
  const style = window.getComputedStyle(element);
  if (deltaX === 0 && deltaY === 0) {
    return canScrollAxis(element, style.overflowX, "x") || canScrollAxis(element, style.overflowY, "y");
  }
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  return canScrollAxis(element, horizontal ? style.overflowX : style.overflowY, horizontal ? "x" : "y");
}

function canScrollAxis(element: HTMLElement, overflow: string, axis: "x" | "y") {
  const hasOverflow = axis === "x"
    ? element.scrollWidth > element.clientWidth + 1
    : element.scrollHeight > element.clientHeight + 1;
  const isRoot = element === document.scrollingElement;
  return hasOverflow && (
    overflow === "auto"
    || overflow === "scroll"
    || overflow === "overlay"
    || (isRoot && overflow === "visible")
  );
}
