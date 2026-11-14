import { useRef } from 'react';
import { gsap, useGSAP } from '../lib/gsap';
import { DURATION, EASE, prefersReducedMotion } from '../motion';
import { Avatar } from './Avatar';

/**
 * The moment two sides are joined: a line shoots from one person to the other and locks in with a
 * pulse. Played once when a contact request is accepted. It does not block the page; the result
 * is already saved, and the same news is announced to screen readers as text.
 */
export function MatchMoment({ from, to, onDone }: { from: string; to: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const done = () => onDone();
      if (prefersReducedMotion()) {
        gsap.timeline({ onComplete: done }).from(root.current, { autoAlpha: 0, duration: DURATION.fade }).to(root.current, { autoAlpha: 0, duration: DURATION.fade }, '+=1.4');
        return;
      }
      gsap
        .timeline({ onComplete: done })
        .from('.match-card', { autoAlpha: 0, y: 12, duration: 0.3, ease: EASE.enter })
        .from('.match-node', { scale: 0.6, autoAlpha: 0, duration: 0.3, ease: EASE.enter, stagger: 0.08 }, '<0.05')
        .from('.match-line', { drawSVG: '0%', duration: 0.45, ease: EASE.travel })
        .fromTo('.match-node', { scale: 1 }, { scale: 1.12, duration: 0.18, ease: EASE.micro, yoyo: true, repeat: 1 })
        .fromTo('.match-pulse', { scale: 0.6, autoAlpha: 0.9, transformOrigin: '50% 50%' }, { scale: 2.2, autoAlpha: 0, duration: 0.6, ease: EASE.enter }, '<')
        .from('.match-text', { autoAlpha: 0, y: 6, duration: 0.3, ease: EASE.enter }, '<0.1')
        .to('.match-card', { autoAlpha: 0, y: -8, duration: 0.25, ease: EASE.exit }, '+=1.1');
    },
    { scope: root },
  );
  return (
    <div ref={root} className="match" role="status" aria-live="polite">
      <div className="match-card">
        <div className="match-row">
          <span className="match-node">
            <Avatar name={from} size={48} />
          </span>
          <svg className="match-span" viewBox="0 0 160 48" aria-hidden="true" focusable="false">
            <path className="match-line" d="M4 24C50 -4 110 -4 156 24" />
            <circle className="match-pulse" cx="80" cy="6" r="6" />
          </svg>
          <span className="match-node">
            <Avatar name={to} size={48} />
          </span>
        </div>
        <p className="match-text">
          <span className="annotation">Connection made</span>
          <strong>
            {from} and {to} can now talk privately.
          </strong>
        </p>
      </div>
    </div>
  );
}
