import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'signal' | 'secondary' | 'ghost' | 'danger';
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  /** Shows a turning arc over the label; the button keeps its width. */
  loading?: boolean;
  /** Turns the button green for a moment after the action succeeded. */
  success?: boolean;
  block?: boolean;
  children: ReactNode;
}

/**
 * The button primitive. `signal` is kept for actions that connect the two sides
 * (contact, accept, apply); everything else is `primary`, `secondary` or `ghost`.
 */
export function Button({ variant = 'primary', size = 'md', loading = false, success = false, block = false, className = '', disabled, children, ...rest }: Props) {
  const classes = ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', block ? 'btn-block' : '', className].filter(Boolean).join(' ');
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} data-state={loading ? 'loading' : success ? 'success' : undefined} {...rest}>
      {children}
    </button>
  );
}
