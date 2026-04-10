"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Triangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Padding added around the target element's bounds to give the spotlight breathing room. */
const SPOTLIGHT_PAD = 6;
/** Gap between the highlighted element and the tooltip card. */
const TOOLTIP_GAP = 10;
/** Fixed width for the tooltip card. */
const TOOLTIP_WIDTH = 240;
/** Minimum distance the tooltip card keeps from the screen edges. */
const SCREEN_PAD = 12;
/** Approximate tooltip card height (title + body + button + padding) for scroll math. */
const TOOLTIP_EST_HEIGHT = 260;
/** Minimum gap between tutorial region and viewport edge after scrolling. */
const VIEWPORT_MARGIN = 16;

export type TooltipPlacement = "above" | "below";

interface Rect {
  top: number;
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/** Vertical span of target + estimated tooltip, in viewport coordinates. */
function unionVerticalBounds(
  elRect: DOMRect,
  placement: TooltipPlacement,
): { top: number; bottom: number } {
  let top = elRect.top;
  let bottom = elRect.bottom;
  if (placement === "below") {
    bottom = elRect.bottom + TOOLTIP_GAP + TOOLTIP_EST_HEIGHT;
  } else {
    top = elRect.top - TOOLTIP_GAP - TOOLTIP_EST_HEIGHT;
  }
  return {
    top: top - VIEWPORT_MARGIN,
    bottom: bottom + VIEWPORT_MARGIN,
  };
}

function collectVerticalScrollParents(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const st = window.getComputedStyle(p);
    if (
      /auto|scroll|overlay/.test(st.overflowY) &&
      p.scrollHeight > p.clientHeight + 1
    ) {
      out.push(p);
    }
    p = p.parentElement;
  }
  return out;
}

/** Wait for smooth scroll to finish: `scrollend` where supported, capped by timeout. */
function waitForScrollSettled(
  timeoutMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(t);
      window.removeEventListener("scrollend", onScrollEnd);
      document.documentElement.removeEventListener("scrollend", onScrollEnd);
      document.body.removeEventListener("scrollend", onScrollEnd);
      resolve();
    };

    const onScrollEnd = () => {
      if (!isCancelled()) finish();
    };

    const t = window.setTimeout(finish, timeoutMs);
    window.addEventListener("scrollend", onScrollEnd, { once: true });
    document.documentElement.addEventListener("scrollend", onScrollEnd, {
      once: true,
    });
    document.body.addEventListener("scrollend", onScrollEnd, { once: true });
  });
}

/**
 * Instant nudges so target + tooltip region fits the viewport (after smooth scroll).
 */
function scrollTutorialRegionFineTune(
  el: HTMLElement,
  placement: TooltipPlacement,
): void {
  const scrollers = collectVerticalScrollParents(el);
  const vh = window.innerHeight;

  for (let pass = 0; pass < 6; pass++) {
    const elRect = el.getBoundingClientRect();
    const { top: uTop, bottom: uBottom } = unionVerticalBounds(elRect, placement);
    const regionH = uBottom - uTop;
    const maxH = vh - VIEWPORT_MARGIN * 2;

    if (regionH <= maxH && uTop >= VIEWPORT_MARGIN && uBottom <= vh - VIEWPORT_MARGIN) {
      break;
    }

    // Region taller than viewport: pin the top of the tutorial block just below the margin
    if (regionH > maxH) {
      const deltaWindow = uTop - VIEWPORT_MARGIN;
      if (Math.abs(deltaWindow) > 1) {
        window.scrollBy({ top: deltaWindow, left: 0, behavior: "auto" });
      }
      for (const scroller of scrollers) {
        const sr = scroller.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const { top: ut, bottom: ub } = unionVerticalBounds(r, placement);
        if (ut < sr.top + VIEWPORT_MARGIN) {
          scroller.scrollTop += ut - (sr.top + VIEWPORT_MARGIN);
        } else if (ub > sr.bottom - VIEWPORT_MARGIN) {
          scroller.scrollTop += ub - (sr.bottom - VIEWPORT_MARGIN);
        }
      }
      break;
    }

    const regionMid = (uTop + uBottom) / 2;
    const viewMid = vh / 2;
    const deltaWindow = regionMid - viewMid;
    if (Math.abs(deltaWindow) > 1) {
      window.scrollBy({ top: deltaWindow, left: 0, behavior: "auto" });
    }

    for (const scroller of scrollers) {
      const sr = scroller.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const { top: ut, bottom: ub } = unionVerticalBounds(r, placement);

      if (ut < sr.top + VIEWPORT_MARGIN) {
        const d = ut - (sr.top + VIEWPORT_MARGIN);
        scroller.scrollTop += d;
      } else if (ub > sr.bottom - VIEWPORT_MARGIN) {
        const d = ub - (sr.bottom - VIEWPORT_MARGIN);
        scroller.scrollTop += d;
      }
    }
  }
}

/**
 * Smooth scroll toward the target, wait for animation, then fine-tune instantly.
 */
async function scrollTutorialRegionIntoViewSmooth(
  el: HTMLElement,
  placement: TooltipPlacement,
  isCancelled: () => boolean,
): Promise<void> {
  el.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "smooth",
  });

  await waitForScrollSettled(700, isCancelled);
  if (isCancelled()) return;

  scrollTutorialRegionFineTune(el, placement);
}

export function TutorialSpotlight({
  targetSelector,
  placement,
  title,
  body,
  onGotIt,
}: {
  /** CSS selector for the element to highlight — targets the first match in the DOM. */
  targetSelector: string;
  /** Whether the tooltip floats above or below the highlighted element. */
  placement: TooltipPlacement;
  title: string;
  body: string;
  onGotIt: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector<Element>(targetSelector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    });
  }, [targetSelector]);

  useEffect(() => {
    let rafId = 0;
    let observer: MutationObserver | null = null;
    let cancelled = false;
    const isCancelled = () => cancelled;

    async function foundElement(found: HTMLElement) {
      observer?.disconnect();
      observer = null;
      await scrollTutorialRegionIntoViewSmooth(found, placement, isCancelled);
      if (cancelled) return;
      // rAF after scroll so layout / scroll offsets are applied before measure
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(measure);
      });
    }

    function tryFind() {
      const el = document.querySelector<HTMLElement>(targetSelector);
      if (el) {
        void foundElement(el);
        return;
      }
      // Element not in DOM yet (feed still loading) — watch for it via MutationObserver
      // so we don't have a fixed retry window that can expire before cards render.
      observer = new MutationObserver(() => {
        const found = document.querySelector<HTMLElement>(targetSelector);
        if (found) void foundElement(found);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    tryFind();

    // Keep the spotlight anchored on scroll / resize
    window.addEventListener("scroll", measure, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [targetSelector, measure, placement]);

  if (!rect || typeof document === "undefined") return null;

  // Spotlight bounds: slightly larger than the target for visual breathing room
  const spotTop = rect.top - SPOTLIGHT_PAD;
  const spotLeft = rect.left - SPOTLIGHT_PAD;
  const spotWidth = rect.width + SPOTLIGHT_PAD * 2;
  const spotHeight = rect.height + SPOTLIGHT_PAD * 2;

  // Tooltip horizontal: centered over the target, clamped to screen edges
  const targetCenterX = rect.left + rect.width / 2;
  const tooltipLeft = Math.max(
    SCREEN_PAD,
    Math.min(
      targetCenterX - TOOLTIP_WIDTH / 2,
      window.innerWidth - TOOLTIP_WIDTH - SCREEN_PAD,
    ),
  );

  // Tooltip vertical: above or below the highlighted element
  const tooltipTop =
    placement === "below" ? rect.bottom + TOOLTIP_GAP : undefined;
  const tooltipBottom =
    placement === "above"
      ? window.innerHeight - rect.top + TOOLTIP_GAP
      : undefined;

  // Triangle horizontal offset within the tooltip, pointing at the target's center.
  // Clamped so the triangle never overflows the card's left/right padding.
  const triangleOffsetX = Math.max(
    10,
    Math.min(Math.round(targetCenterX - tooltipLeft) - 8, TOOLTIP_WIDTH - 26),
  );

  // Triangle transform:
  //   "above" → tooltip is above target → triangle at card bottom, flipped to point DOWN
  //   "below" → tooltip is below target → triangle at card top, default to point UP
  const triangleStyle =
    placement === "above"
      ? {
          position: "absolute" as const,
          bottom: -11,
          left: triangleOffsetX,
          lineHeight: 0,
          transform: "rotate(180deg)",
        }
      : {
          position: "absolute" as const,
          top: -11,
          left: triangleOffsetX,
          lineHeight: 0,
        };

  return createPortal(
    <>
      {/*
       * Spotlight overlay: a transparent div whose box-shadow covers the entire
       * viewport. The div itself has no background, so the target element below
       * remains fully visible — creating the "hole in the dim" effect.
       */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: spotTop,
          left: spotLeft,
          width: spotWidth,
          height: spotHeight,
          borderRadius: 10,
          boxShadow: "0 0 0 9999px rgba(47, 47, 47, 0.72)",
          pointerEvents: "none",
          zIndex: 60,
        }}
      />

      {/*
       * Tooltip speech bubble.
       * drop-shadow on the wrapper unifies the shadow across both the card
       * and the triangle pointer so the whole bubble looks seamless.
       */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: "fixed",
          top: tooltipTop,
          bottom: tooltipBottom,
          left: tooltipLeft,
          width: TOOLTIP_WIDTH,
          zIndex: 61,
          filter: "drop-shadow(0 2px 8px rgba(47,47,47,0.35))",
        }}
      >
        {/* Triangle pointer — base merges with the card edge, tip points at the target */}
        <div aria-hidden className="text-surface" style={triangleStyle}>
          <Triangle size={16} fill="currentColor" strokeWidth={0} />
        </div>

        <div className="flex flex-col gap-12 rounded-radius-md bg-surface p-16">
          <div className="flex flex-col gap-8">
            <p className="text-heading-m text-text text-center">{title}</p>
            <p className="text-body-m text-text-secondary text-center">
              {body}
            </p>
          </div>
          <Button variant="primary" className="w-full" onClick={onGotIt}>
            Got it
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
