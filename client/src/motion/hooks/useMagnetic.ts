import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DURATION, EASE, MEDIA, type MotionConditions } from '../tokens';

/**
 * A primary call to action leans towards the pointer and settles back when it leaves.
 * Mouse and trackpad only, and never under reduced motion; touch devices get a plain button.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(strength = 0.25): RefObject<T | null> {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add(MEDIA, (ctx) => {
        const { reduce, fine } = ctx.conditions as MotionConditions;
        if (reduce || !fine) return;
        const xTo = gsap.quickTo(el, 'x', { duration: DURATION.enter, ease: EASE.enter });
        const yTo = gsap.quickTo(el, 'y', { duration: DURATION.enter, ease: EASE.enter });
        const move = (e: PointerEvent) => {
          const box = el.getBoundingClientRect();
          xTo((e.clientX - (box.left + box.width / 2)) * strength);
          yTo((e.clientY - (box.top + box.height / 2)) * strength);
        };
        const leave = () => {
          xTo(0);
          yTo(0);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        return () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerleave', leave);
          gsap.set(el, { clearProps: 'transform' });
        };
      });
    },
    { scope: ref },
  );
  return ref;
}
