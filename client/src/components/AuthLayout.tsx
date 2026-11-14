import type { ReactNode } from 'react';
import { Reveal } from '../motion';
import { LogoMark } from './Logo';

/**
 * Shared by the sign-in, register and password pages: the form on paper, and beside it on wide
 * screens a still slice of the bridge drawing on ink. The drawing is decoration.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-shell">
      <aside className="auth-art" aria-hidden="true">
        <p className="annotation">Span 01 / Access</p>
        <svg viewBox="0 0 400 300" focusable="false">
          <path className="auth-art-line" d="M0 250h400M70 250V70M330 250V70" />
          <path className="auth-art-cable" d="M-60 250Q10 120 70 76Q200 270 330 76Q390 120 460 250" />
          <path className="auth-art-hanger" d="M110 130V250M150 164V250M200 173V250M250 164V250M290 130V250" />
          <path className="auth-art-signal" d="M70 76C150 -10 250 -10 330 76" />
          <circle className="auth-art-node" cx="70" cy="76" r="6" />
          <circle className="auth-art-node" cx="330" cy="76" r="6" />
        </svg>
        <p className="auth-art-line-text">Two banks. One span.</p>
        <p className="auth-art-sub">Students publish what they build. Professionals find it and help it carry weight.</p>
      </aside>
      <div className="auth-panel">
        <Reveal className="auth-card card" immediate>
          <div className="auth-head">
            <LogoMark size={40} />
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </Reveal>
      </div>
    </main>
  );
}
