import { Link } from 'react-router';

/** Bridge mark: a deck on three hangers under an arch. The arch is the span, so it takes the signal colour. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect className="logo-mark-ground" width="32" height="32" rx="6" />
      <path className="logo-mark-hangers" d="M10 23v-4.6M16 23v-6M22 23v-4.6" fill="none" strokeWidth="1.6" strokeLinecap="round" />
      <path className="logo-mark-deck" d="M5 23h22" fill="none" strokeWidth="2.2" strokeLinecap="round" />
      <path className="logo-mark-span" d="M5 21c3.5-7 18.5-7 22 0" fill="none" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="ProjectBridge home">
      <LogoMark />
      <span className="logo-text" aria-hidden="true">
        Project<span>Bridge</span>
      </span>
    </Link>
  );
}
