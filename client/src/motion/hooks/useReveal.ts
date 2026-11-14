import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, MEDIA, VIEW_START, type MotionConditions } from '../tokens';

interface RevealOptions {
  /** Pixels travelled upwards while arriving. */
  y?: number;
  delay?: number;
  /** Play as soon as it mounts rather than when scrolled into view. */
  immediate?: boolean;
}

/**
 * One element docks into place when it comes into view. The element is visible in the markup;
 * the starting state is set by script, so the page still reads if the script never runs.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>({ y = DISTANCE.near, delay = 0, immediate = false }: RevealOptions = {}): RefObject<T | null> {
  const ref = useRef<T>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add(MEDIA, (ctx) => {
        const { reduce } = ctx.conditions as MotionConditions;
        gsap.from(el, {
          autoAlpha: 0,
          y: reduce ? 0 : y,
          duration: reduce ? DURATION.fade : DURATION.enter,
          ease: EASE.enter,
          delay,
          clearProps: 'transform,opacity,visibility',
          scrollTrigger: immediate ? undefined : { trigger: el, start: VIEW_START, once: true },
        });
      });
    },
    { scope: ref },
  );
  return ref;
}
