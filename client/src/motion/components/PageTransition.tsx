import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { gsap, ScrollTrigger, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, prefersReducedMotion } from '../tokens';

/**
 * The blueprint wipe between routes: a hairline sweeps across and the new page docks in behind it.
 *
 * The new route is already mounted and usable while this plays; nothing waits on it. It never
 * holds the old page back, so the browser's back and forward buttons and its own scroll
 * restoration behave exactly as before. Each page's own ScrollTriggers are removed with that page;
 * here they are only re-measured once the new one has laid out.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  // Compared with the current path, so nothing plays on first load (or on StrictMode's second pass).
  const shownPath = useRef(pathname);

  useGSAP(
    () => {
      if (shownPath.current === pathname) return;
      shownPath.current = pathname;
      const content = root.current?.querySelector('.page-transition-content');
      const sweep = root.current?.querySelector('.page-transition-sweep');
      if (!content || !sweep) return;
      if (prefersReducedMotion()) {
        gsap.fromTo(content, { autoAlpha: 0 }, { autoAlpha: 1, duration: DURATION.fade, clearProps: 'opacity,visibility' });
        return;
      }
      gsap
        .timeline({ defaults: { overwrite: true } })
        .fromTo(sweep, { xPercent: -100, autoAlpha: 1 }, { xPercent: 0, duration: DURATION.page, ease: EASE.travel })
        .set(sweep, { autoAlpha: 0 })
        .fromTo(content, { autoAlpha: 0, y: DISTANCE.near }, { autoAlpha: 1, y: 0, duration: DURATION.enter, ease: EASE.enter, clearProps: 'transform,opacity,visibility' }, 0.12);
    },
    { scope: root, dependencies: [pathname] },
  );

  // Positions depend on the new page's layout, fonts and images.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div ref={root} className="page-transition">
      <div className="page-transition-sweep" aria-hidden="true" />
      <div className="page-transition-content">{children}</div>
    </div>
  );
}
