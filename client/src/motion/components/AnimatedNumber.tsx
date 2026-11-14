import { useMemo } from 'react';
import { useCountUp } from '../hooks/useCountUp';

/**
 * A number that counts up when it comes into view, formatted for the reader's locale.
 * Screen readers get the final value once; the moving digits are hidden from them.
 */
export function AnimatedNumber({ value, suffix = '', options, className }: { value: number; suffix?: string; options?: Intl.NumberFormatOptions; className?: string }) {
  const formatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, ...options }), [options]);
  const format = (n: number) => `${formatter.format(Math.round(n))}${suffix}`;
  const ref = useCountUp<HTMLSpanElement>(value, format);
  return (
    <span className={className}>
      <span className="visually-hidden">{format(value)}</span>
      <span ref={ref} aria-hidden="true" className="tabular">
        {format(value)}
      </span>
    </span>
  );
}
