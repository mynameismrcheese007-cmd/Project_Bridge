import type { ReactNode } from 'react';

/**
 * What a page shows when there is nothing yet: an unfinished span between two piers, a sentence
 * saying what will appear here, and the next thing to do. The drawing is decoration.
 */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="empty-state">
      <svg className="empty-art" viewBox="0 0 148 64" aria-hidden="true" focusable="false">
        <path className="pier" d="M6 58h40M26 58V22M110 58h32M122 58V22" />
        <path className="pier" d="M26 30h18M122 30h-18" />
        <path className="gap" d="M44 30c14 14 46 14 60 0" />
        <circle className="node" cx="26" cy="20" r="4" />
        <circle className="node" cx="122" cy="20" r="4" />
      </svg>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  );
}
