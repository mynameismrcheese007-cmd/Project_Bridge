import { useRef, type RefObject } from 'react';
import { gsap, SplitText, useGSAP } from '../../lib/gsap';
import { DURATION, EASE, STAGGER, prefersReducedMotion } from '../tokens';

/**
 * A headline rises in line by line from behind a mask.
 *
 * SplitText keeps the original sentence as the element's accessible name and hides the pieces from
 * screen readers, so it is read once, as written. It re-splits by itself when the font loads or
 * the width changes.
 */
export function useSplitHeadline<T extends HTMLElement = HTMLHeadingElement>({ delay = 0 }: { delay?: number } = {}): RefObject<T | null> {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.from(el, { autoAlpha: 0, duration: DURATION.fade, delay, clearProps: 'opacity,visibility' });
        return;
      }
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        aria: 'auto',
        autoSplit: true,
        onSplit: (self) => gsap.from(self.lines, { yPercent: 110, duration: DURATION.draw, ease: EASE.enter, stagger: STAGGER.lines, delay }),
      });
    },
    { scope: ref },
  );
  return ref;
}
