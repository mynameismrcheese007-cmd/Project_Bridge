import { useCallback, useRef, type RefObject } from 'react';
import { Flip, gsap, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, STAGGER, prefersReducedMotion } from '../tokens';

/**
 * All the motion of a list that can be filtered, sorted, searched and paged, in one place so no
 * two animations ever act on the same card.
 *
 * Give each item `data-flip-id={id}`, pass the state that holds the list in `deps`, and call
 * `capture()` just before that state is replaced (a filter, a sort, a search).
 *  - After `capture()`: cards that stay glide to their new places, and new ones dock in.
 *  - Without it (first load, "Load more", a refetch): only cards not shown before dock in.
 * Items that leave are removed by React at once, so they are not animated out.
 */
export function useFlipList<T extends HTMLElement = HTMLDivElement>(deps: readonly unknown[]): { ref: RefObject<T | null>; capture: () => void } {
  const ref = useRef<T>(null);
  const before = useRef<Flip.FlipState | null>(null);
  const seen = useRef(new Set<string>());

  const capture = useCallback(() => {
    if (!ref.current || prefersReducedMotion()) return;
    before.current = Flip.getState(ref.current.querySelectorAll('[data-flip-id]'));
  }, []);

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('[data-flip-id]'));
      const fresh = items.filter((el) => !seen.current.has(el.dataset.flipId ?? ''));
      for (const el of fresh) seen.current.add(el.dataset.flipId ?? '');
      const state = before.current;
      before.current = null;

      const dockIn = (els: Element[]) => {
        if (els.length === 0) return;
        if (prefersReducedMotion()) {
          gsap.fromTo(els, { autoAlpha: 0 }, { autoAlpha: 1, duration: DURATION.fade, clearProps: 'opacity,visibility' });
          return;
        }
        gsap.fromTo(
          els,
          { autoAlpha: 0, y: DISTANCE.near },
          { autoAlpha: 1, y: 0, duration: DURATION.enter, ease: EASE.enter, stagger: STAGGER.list, overwrite: true, clearProps: 'transform,opacity,visibility' },
        );
      };

      if (state) {
        Flip.from(state, { targets: items, duration: DURATION.enter, ease: EASE.enter, prune: true, onEnter: (els) => dockIn(els) });
      } else {
        dockIn(fresh);
      }
      // Under StrictMode the first run is undone at once; forget its ids so the real run animates.
      return () => {
        for (const el of fresh) seen.current.delete(el.dataset.flipId ?? '');
      };
    },
    { scope: ref, dependencies: [...deps], revertOnUpdate: false },
  );
  return { ref, capture };
}
