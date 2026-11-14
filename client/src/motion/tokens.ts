/**
 * Motion tokens. Every animation takes its timing from here, so the whole product moves with one
 * weight. The CSS copies of these numbers are in styles/tokens.css.
 *
 * The rules they serve:
 *  1. Motion means connection: something links, transfers or settles. Nothing floats for decoration.
 *  2. Lines draw before content arrives.
 *  3. Circular easing with a long settle, as in the Sharp UI kit: no linear tweens, nothing bounces.
 *  4. The interface is usable before any animation finishes.
 *  5. One hero moment per page at most.
 */
export const DURATION = {
  /** Hover, press, focus. */
  micro: 0.25,
  /** Opacity-only changes, and everything under reduced motion. */
  fade: 0.35,
  /** A component arriving. */
  enter: 0.8,
  /** A line or stroke drawing. */
  draw: 0.95,
  /** The sweep between routes. */
  page: 0.65,
  /** The longest a hero sequence may run in total. */
  hero: 1.6,
} as const;

export const EASE = {
  /** Entrances: fast start, long settle. */
  enter: 'circ.out',
  /** Exits: leave quickly. */
  exit: 'power2.in',
  /** Route transitions and strokes that travel. */
  travel: 'circ.inOut',
  /** Only for the moment a connection is made. */
  lock: 'expo.out',
  micro: 'power2.out',
} as const;

export const STAGGER = {
  /** Between items of a list. */
  list: 0.07,
  /** Between lines of a headline. */
  lines: 0.1,
  /** Between strokes of a drawing. */
  strokes: 0.12,
} as const;

/** How far an entering element travels, in pixels. */
export const DISTANCE = { near: 16, far: 26 } as const;

/** Where an element must be in the viewport before it enters. */
export const VIEW_START = 'top 88%';

/**
 * The conditions every animation checks, for gsap.matchMedia().
 * `reduce`: the person asked for less motion, so movement becomes a short fade.
 * `fine`: a mouse or trackpad, the only place hover and magnetic effects run.
 */
export const MEDIA = {
  reduce: '(prefers-reduced-motion: reduce)',
  motion: '(prefers-reduced-motion: no-preference)',
  fine: '(hover: hover) and (pointer: fine)',
  wide: '(min-width: 768px)',
} as const;

export type MotionConditions = Record<keyof typeof MEDIA, boolean>;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MEDIA.reduce).matches;
}
