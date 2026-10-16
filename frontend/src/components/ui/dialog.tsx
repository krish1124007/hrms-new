import {
  type ReactNode,
  type ReactElement,
  useEffect,
  useCallback,
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
}

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  children,
  className,
  size = 'md',
}: DialogProps): ReactElement | null {
  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, handleEsc]);

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
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-elevated',
              SIZE_MAP[size],
              className,
            )}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
            {children}
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
  return <h2 className={cn('text-lg font-semibold text-foreground', className)}>{children}</h2>;
}

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)}>{children}</p>;
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
