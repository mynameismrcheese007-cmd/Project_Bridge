import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Item<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Tabs with the full keyboard pattern: arrow keys, Home and End move between tabs, and only the
 * selected tab is in the Tab order. Pair with <TabPanel> using the same `name`.
 */
export function Tabs<T extends string>({ name, label, items, value, onChange }: { name: string; label: string; items: Array<Item<T>>; value: T; onChange: (id: T) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${name}-tab-${item.id}`}
          aria-selected={value === item.id}
          aria-controls={`${name}-panel`}
          tabIndex={value === item.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ name, value, className, children }: { name: string; value: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div key={id} role="tabpanel" id={`${name}-panel`} aria-labelledby={`${name}-tab-${value}`} className={className}>
      {children}
    </div>
  );
}
