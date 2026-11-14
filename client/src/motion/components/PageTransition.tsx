import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType, type Location } from 'react-router';
import { gsap, ScrollTrigger, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, prefersReducedMotion } from '../tokens';

/**
 * The curtain between pages. An ink panel rises over the page being left, the new page takes its
 * place behind it, and the panel carries on upward while the new page settles in.
 *
 * The address changes at once; only the picture is held for the half second the curtain takes to
 * close. Changes that stay on the same page (search filters, tabs) pass straight through. Back and
 * forward go through the same sequence, and a second click while the curtain is closing simply
 * changes where it opens. With reduced motion the page swaps at once with a short fade.
 */
export function PageTransition({ children }: { children: (location: Location) => ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const root = useRef<HTMLDivElement>(null);
  const [shownPath, setShownPath] = useState(location.pathname);
  // The newest location for the page on screen, so a held page never falls back to stale filters.
  const held = useRef(location);
  if (location.pathname === shownPath) held.current = location;
  const leaving = location.pathname !== shownPath;
  const target = useRef(location.pathname);
  target.current = location.pathname;
  const revealedPath = useRef(shownPath);

  // Close: the curtain rises over the page being left, then the pages are exchanged.
  useGSAP(
    () => {
      if (!leaving) return;
      if (prefersReducedMotion()) {
        setShownPath(target.current);
        return;
      }
      gsap
        .timeline({
          onComplete: () => {
            if (navigationType !== 'POP') window.scrollTo(0, 0);
            setShownPath(target.current);
          },
        })
        .set('.page-curtain', { autoAlpha: 1 })
        .fromTo('.page-curtain', { yPercent: 100 }, { yPercent: 0, duration: DURATION.page, ease: EASE.travel })
        .fromTo('.page-curtain-mark span', { yPercent: 110 }, { yPercent: 0, duration: DURATION.page, ease: EASE.enter }, 0.2);
    },
    { scope: root, dependencies: [location.pathname, leaving] },
  );

  // Open: the curtain leaves upward and the new page rises into place.
  useGSAP(
    () => {
      if (revealedPath.current === shownPath) return;
      revealedPath.current = shownPath;
      const content = '.page-transition-content';
      if (prefersReducedMotion()) {
        gsap.set('.page-curtain', { autoAlpha: 0 });
        gsap.fromTo(content, { autoAlpha: 0 }, { autoAlpha: 1, duration: DURATION.fade, clearProps: 'opacity,visibility' });
        return;
      }
      gsap
        .timeline()
        .set('.page-curtain', { autoAlpha: 1, yPercent: 0 })
        .to('.page-curtain', { yPercent: -100, duration: DURATION.page + 0.15, ease: EASE.travel }, 0.1)
        .set('.page-curtain', { autoAlpha: 0 })
        .fromTo(content, { y: DISTANCE.far * 2 }, { y: 0, duration: DURATION.draw, ease: EASE.enter, clearProps: 'transform' }, 0.25);
    },
    { scope: root, dependencies: [shownPath] },
  );

  // Positions depend on the new page's layout, fonts and images.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => window.cancelAnimationFrame(id);
  }, [shownPath]);

  return (
    <div ref={root} className="page-transition">
      <div className="page-curtain" aria-hidden="true">
        <div className="page-curtain-mark">
          <span>ProjectBridge</span>
        </div>
        <div className="page-curtain-label">Students to industry</div>
      </div>
      <div className="page-transition-content">{children(leaving ? held.current : location)}</div>
    </div>
  );
}
