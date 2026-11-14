import { useCallback, useRef, type RefObject } from 'react';
import { Flip, gsap, useGSAP } from '../../lib/gsap';
import { DURATION, EASE, STAGGER, prefersReducedMotion } from '../tokens';

/**
 * Cards glide to their new places when a list is filtered, sorted or searched, instead of jumping.
 *
 * Give each item `data-flip-id={id}`. Call `capture()` just before the state that holds the list
 * changes, and pass that state in `deps`. Items that stay move; items that are new dock in.
 * (Items that leave are removed by React at once, so they are not animated out.)
 */
export function useFlipList<T extends HTMLElement = HTMLDivElement>(deps: readonly unknown[]): { ref: RefObject<T | null>; capture: () => void } {
  const ref = useRef<T>(null);
  const before = useRef<Flip.FlipState | null>(null);

  const capture = useCallback(() => {
    if (!ref.current || prefersReducedMotion()) return;
    before.current = Flip.getState(ref.current.querySelectorAll('[data-flip-id]'));
  }, []);

  useGSAP(
    () => {
      const state = before.current;
      before.current = null;
      if (!state || !ref.current) return;
      Flip.from(state, {
        targets: ref.current.querySelectorAll('[data-flip-id]'),
        duration: DURATION.enter,
        ease: EASE.enter,
        stagger: STAGGER.list / 3,
        prune: true,
        onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: DURATION.enter, ease: EASE.enter, clearProps: 'transform,opacity,visibility' }),
      });
    },
    { scope: ref, dependencies: [...deps], revertOnUpdate: false },
  );
  return { ref, capture };
}
