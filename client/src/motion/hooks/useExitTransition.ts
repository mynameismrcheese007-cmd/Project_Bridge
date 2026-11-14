import { useRef, useState, type RefObject } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, prefersReducedMotion } from '../tokens';

/**
 * Lets a dialog, drawer, toast or dropdown finish leaving before React removes it.
 *
 * Render the element while `mounted` is true and attach `ref`. When `open` turns false the exit
 * plays first and `mounted` turns false only when it has finished, so nothing is left behind.
 */
export function useExitTransition<T extends HTMLElement = HTMLDivElement>(open: boolean, { y = DISTANCE.near }: { y?: number } = {}): { mounted: boolean; ref: RefObject<T | null> } {
  const ref = useRef<T>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const reduce = prefersReducedMotion();
      if (open) {
        gsap.fromTo(el, { autoAlpha: 0, y: reduce ? 0 : y }, { autoAlpha: 1, y: 0, duration: reduce ? DURATION.fade : DURATION.fade + 0.1, ease: EASE.enter, clearProps: 'transform' });
      } else {
        gsap.to(el, { autoAlpha: 0, y: reduce ? 0 : y / 2, duration: DURATION.micro, ease: EASE.exit, onComplete: () => setMounted(false) });
      }
    },
    { scope: ref, dependencies: [open, mounted] },
  );
  return { mounted, ref };
}
