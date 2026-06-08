import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

// A11Y: Trap Tab focus inside a modal container, move focus in on open, and restore
// focus to the previously-focused element on close. Optionally close on Escape.
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const prevFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);

    // Move focus into the dialog (first focusable, else the container itself).
    const first = focusables()[0];
    if (first) first.focus();
    else { node.setAttribute('tabindex', '-1'); node.focus(); }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl  = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement;
      if (e.shiftKey && activeEl === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && activeEl === lastEl) { e.preventDefault(); firstEl.focus(); }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever was focused before the dialog opened.
      if (prevFocused && typeof prevFocused.focus === 'function') prevFocused.focus();
    };
  }, [active, onEscape]);

  return ref;
}
