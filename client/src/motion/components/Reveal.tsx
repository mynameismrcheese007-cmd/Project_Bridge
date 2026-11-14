import type { HTMLAttributes, ReactNode } from 'react';
import { useReveal } from '../hooks/useReveal';

/** Wraps a block so it docks into place when scrolled into view. */
export function Reveal({ children, y, delay, immediate, ...rest }: { children: ReactNode; y?: number; delay?: number; immediate?: boolean } & HTMLAttributes<HTMLDivElement>) {
  const ref = useReveal<HTMLDivElement>({ y, delay, immediate });
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}
