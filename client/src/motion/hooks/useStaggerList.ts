import { useRef, type RefObject } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, STAGGER, prefersReducedMotion } from '../tokens';

/**
 * Items of a fetched list dock in as they scroll into view, in batches.
 *
 * Give each item `data-motion-id={id}` and pass the current ids. Only items not shown before are
 * animated, so "Load more", a refetch or a poll never replays the whole list.
 */
export function useStaggerList<T extends HTMLElement = HTMLDivElement>(ids: readonly string[]): RefObject<T | null> {
  const ref = useRef<T>(null);
  const seen = useRef(new Set<string>());

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      const fresh = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-id]')).filter((el) => !seen.current.has(el.dataset.motionId ?? ''));
      for (const el of fresh) seen.current.add(el.dataset.motionId ?? '');
      if (fresh.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.from(fresh, { autoAlpha: 0, duration: DURATION.fade, clearProps: 'opacity,visibility' });
        return;
      }
      gsap.set(fresh, { autoAlpha: 0, y: DISTANCE.near });
      ScrollTrigger.batch(fresh, {
        start: 'top 94%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { autoAlpha: 1, y: 0, duration: DURATION.enter, ease: EASE.enter, stagger: STAGGER.list, clearProps: 'transform,opacity,visibility' }),
      });
      // Under StrictMode the first run is undone at once; forget its ids so the real run animates.
      return () => {
        for (const el of fresh) seen.current.delete(el.dataset.motionId ?? '');
      };
    },
    { scope: ref, dependencies: [ids.join('|')], revertOnUpdate: false },
  );
  return ref;
}
