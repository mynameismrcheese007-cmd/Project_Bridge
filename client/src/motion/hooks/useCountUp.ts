import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DURATION, EASE, VIEW_START, prefersReducedMotion } from '../tokens';

/**
 * Counts a number up to `value` once it is in view, and from its previous value when it changes.
 * The element's text is written by this hook; use <AnimatedNumber> rather than calling it directly,
 * because that component also keeps the real value readable by screen readers.
 */
export function useCountUp<T extends HTMLElement = HTMLSpanElement>(value: number, format: (n: number) => string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const shown = useRef(0);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        shown.current = value;
        el.textContent = format(value);
        return;
      }
      const counter = { n: shown.current };
      el.textContent = format(counter.n);
      gsap.to(counter, {
        n: value,
        duration: Math.min(DURATION.hero, DURATION.enter + Math.abs(value - shown.current) / 400),
        ease: EASE.enter,
        scrollTrigger: { trigger: el, start: VIEW_START, once: true },
        onUpdate: () => {
          // Remembered every frame, so a value that changes mid-count carries on from where it was.
          shown.current = counter.n;
          el.textContent = format(counter.n);
        },
        onComplete: () => {
          shown.current = value;
          el.textContent = format(value);
        },
      });
    },
    { scope: ref, dependencies: [value] },
  );
  return ref;
}
