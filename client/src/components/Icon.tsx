import type { ReactNode } from 'react';

/**
 * One set of 1.5px line icons, drawn on a 24px grid, replacing the emoji and text glyphs that
 * render differently on every system. An icon is decoration unless it is given a `label`.
 */
const PATHS = {
  'arrow-left': <path d="M19 12H5m6-6-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14m-6-6 6 6-6 6" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Zm4 10a2 2 0 0 0 4 0" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  comment: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12Z" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4" />,
  filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
  flag: <path d="M5 21V4m0 1h11l-2 4 2 4H5" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  image: <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 10 4.5-4.5L13 16l3-3 4 4M9 9.5h.01" />,
  lightbulb: <path d="M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  lock: <path d="M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm2 0V8a4 4 0 0 1 8 0v3" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  play: <path d="M7 5v14l12-7L7 5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m20 20-4.2-4.2M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />,
  send: <path d="M20 4 3 11l7 3 3 7 7-17Zm-10 10 4-4" />,
  share: <path d="M12 15V4m-4 4 4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />,
  sun: <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  trash: <path d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13M10 11v5m4-5v5" />,
  upload: <path d="M12 16V5m-4 4 4-4 4 4M5 19h14" />,
  user: <path d="M5 20a7 7 0 0 1 14 0M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />,
  users: <path d="M3 20a6 6 0 0 1 12 0m-2-12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm8 12a5 5 0 0 0-4-4.9M16 4.6a3.5 3.5 0 0 1 0 6.8" />,
  warning: <path d="M12 9v4m0 3.5h.01M10.3 4.3 2.7 17.5A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.5L13.7 4.3a2 2 0 0 0-3.4 0Z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label, filled = false, className = '' }: { name: IconName; label?: string; filled?: boolean; className?: string }) {
  return (
    <svg
      className={`icon${filled ? ' icon-filled' : ''} ${className}`}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
