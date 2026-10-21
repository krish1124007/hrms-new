import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * What gets focus when the dialog opens. Default: a control that already
   * took focus (`autoFocus`), else the first focusable control in the body
   * or footer, else the dialog itself.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/** Ties `DialogTitle` / `DialogDescription` to the dialog's `aria-labelledby` / `aria-describedby`. */
const DialogIdsContext = createContext<{
  titleId: string;
  descriptionId: string;
  /** A `DialogDescription` announces itself, so `aria-describedby` never points at nothing. */
  registerDescription: () => () => void;
} | null>(null);

/**
 * Open dialogs, innermost last: only the topmost one closes on Esc and traps
 * Tab (a confirm opened from a detail dialog must not close both).
 */
const openDialogs: string[] = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], .hidden, [aria-hidden="true"]'),
  );
}

/**
 * A modal dialog: `role="dialog"`, `aria-modal`, named by its `DialogTitle`.
 * On open it moves focus inside (see `initialFocusRef`), keeps Tab within
 * it, closes on Esc or a click outside, and on close gives focus back to
 * whatever had it before.
 */
export function Dialog({
  open,
  onClose,
  children,
  className,
  size = 'md',
  initialFocusRef,
}: DialogProps): ReactElement | null {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const [described, setDescribed] = useState(false);
  const registerDescription = useCallback(() => {
    setDescribed(true);
    return () => setDescribed(false);
  }, []);
  const ids = useMemo(
    () => ({ titleId, descriptionId, registerDescription }),
    [titleId, descriptionId, registerDescription],
  );
  // The latest onClose, without re-running the open effect (and re-focusing) on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(id);
    const isTopmost = (): boolean => openDialogs[openDialogs.length - 1] === id;

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const target =
        initialFocusRef?.current ??
        focusables(panel).find((el) => !el.hasAttribute('data-dialog-close')) ??
        panel;
      target.focus();
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = focusables(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = panelRef.current.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openDialogs.lastIndexOf(id);
      if (at !== -1) openDialogs.splice(at, 1);
      if (openDialogs.length === 0) document.body.style.overflow = '';
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [open, id, initialFocusRef]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onCloseRef.current()}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={described ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-elevated focus:outline-none',
              SIZE_MAP[size],
              className,
            )}
          >
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
              data-dialog-close=""
            >
              <X className="size-4" />
            </button>
            <DialogIdsContext.Provider value={ids}>{children}</DialogIdsContext.Provider>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('border-b border-border px-6 py-4', className)}>
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  const ids = useContext(DialogIdsContext);
  return (
    <h2 id={ids?.titleId} className={cn('text-lg font-semibold text-foreground', className)}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  const ids = useContext(DialogIdsContext);
  const register = ids?.registerDescription;
  useEffect(() => register?.(), [register]);
  return (
    <p id={ids?.descriptionId} className={cn('mt-1 text-sm text-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-6 py-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
