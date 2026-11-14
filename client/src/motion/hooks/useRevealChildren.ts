import { useRef, type RefObject } from 'react';
import { gsap, ScrollTrigger, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, STAGGER, prefersReducedMotion } from '../tokens';

/**
 * The sections of a page dock in one after another as they come into view. Attach the ref to the
 * container; its direct children present when it mounts are the sections.
 */
export function useRevealChildren<T extends HTMLElement = HTMLDivElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      const children = Array.from(ref.current?.children ?? []).filter((el) => el.tagName !== 'DIALOG');
      if (children.length === 0) return;
      if (prefersReducedMotion()) {
        gsap.from(children, { autoAlpha: 0, duration: DURATION.fade, clearProps: 'opacity,visibility' });
        return;
      }
      gsap.set(children, { autoAlpha: 0, y: DISTANCE.near });
      ScrollTrigger.batch(children, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: DURATION.enter, ease: EASE.enter, stagger: STAGGER.list, clearProps: 'transform,opacity,visibility' }),
      });
    },
    { scope: ref },
  );
  return ref;
}
