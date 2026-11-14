import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useExitTransition } from '../../motion';
import { Icon } from '../Icon';

interface ToastItem {
  id: number;
  text: string;
  open: boolean;
}

const ToastContext = createContext<(text: string) => void>(() => undefined);
const LIFETIME_MS = 4500;

/** Shows a short confirmation ("Draft saved", "Link copied"). Errors stay inline, next to their cause. */
export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.map((t) => (t.id === id ? { ...t, open: false } : t))), []);
  const remove = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (text: string) => {
      const id = ++nextId.current;
      // At most three at once; the oldest leaves.
      setToasts((list) => [...list.map((t, i) => (i < list.length - 2 ? { ...t, open: false } : t)), { id, text, open: true }]);
      window.setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* Polite: read when the screen reader is next idle, never interrupting. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} item={t} onDismiss={dismiss} onGone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss, onGone }: { item: ToastItem; onDismiss: (id: number) => void; onGone: (id: number) => void }) {
  const { mounted, ref } = useExitTransition<HTMLDivElement>(item.open);
  useEffect(() => {
    if (!mounted) onGone(item.id);
  }, [mounted, item.id, onGone]);
  if (!mounted) return null;
  return (
    <div ref={ref} className="toast">
      <Icon name="check" />
      <span>{item.text}</span>
      <button type="button" className="toast-close" onClick={() => onDismiss(item.id)} aria-label="Dismiss">
        <Icon name="close" />
      </button>
    </div>
  );
}
