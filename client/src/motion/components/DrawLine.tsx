import { useRef } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DURATION, EASE, VIEW_START, prefersReducedMotion } from '../tokens';

/**
 * A hairline that draws itself from one end, like a rule being ruled on a drawing.
 * Decorative: it is hidden from screen readers. Place content after it so the line arrives first.
 */
export function DrawLine({ vertical = false, signal = false, delay = 0, className = '' }: { vertical?: boolean; signal?: boolean; delay?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      const line = ref.current?.querySelector('line');
      if (!line || prefersReducedMotion()) return;
      gsap.from(line, { drawSVG: '0%', duration: DURATION.draw, ease: EASE.travel, delay, scrollTrigger: { trigger: ref.current, start: VIEW_START, once: true } });
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} className={`draw-line${vertical ? ' draw-line-vertical' : ''}${signal ? ' draw-line-signal' : ''} ${className}`} aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 100">
      {vertical ? <line x1="50" y1="0" x2="50" y2="100" vectorEffect="non-scaling-stroke" /> : <line x1="0" y1="50" x2="100" y2="50" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
