import { useRef, type RefObject, type SyntheticEvent } from 'react';
import { gsap, useGSAP } from '../../lib/gsap';
import { DISTANCE, DURATION, EASE, prefersReducedMotion } from '../tokens';

/**
 * Opens a native <dialog> with an entrance and lets it finish leaving before it is removed.
 *
 * Attach `ref` and `onCancel` to the dialog, and call `requestClose` wherever it used to call
 * `onClose`. The dialog keeps the browser's own focus trap and Escape handling; Escape now plays
 * the exit first. `onClose` runs once, when the exit has finished.
 */
export function useDialogMotion(onClose: () => void): { ref: RefObject<HTMLDialogElement | null>; requestClose: () => void; onCancel: (e: SyntheticEvent) => void } {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  const { contextSafe } = useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (!el.open) el.showModal();
      const reduce = prefersReducedMotion();
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: reduce ? 0 : DISTANCE.near, scale: reduce ? 1 : 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: reduce ? DURATION.fade : 0.35, ease: EASE.enter, clearProps: 'transform' },
      );
    },
    { scope: ref },
  );

  const requestClose = contextSafe(() => {
    const el = ref.current;
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      el?.close();
      latestClose.current();
    };
    if (!el) return finish();
    gsap.to(el, { autoAlpha: 0, y: prefersReducedMotion() ? 0 : DISTANCE.near / 2, duration: DURATION.micro, ease: EASE.exit, onComplete: finish });
  });

  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault();
    requestClose();
  };
  return { ref, requestClose, onCancel };
}
