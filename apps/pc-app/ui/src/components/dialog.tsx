import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { useRef, useState, type ReactNode } from 'react';
import { MotionPanel } from './motion';

/** Radix supplies trapping and dismissal; callers mount without a DialogTrigger. */
export function AppDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  // Capture before Radix moves focus into the portal. Never restore a detached
  // trigger or override focus deliberately moved to another page/control.
  const [returnFocus] = useState(() => typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const content = useRef<HTMLDivElement>(null);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent ref={content} onCloseAutoFocus={event => {
      event.preventDefault();
      const active = document.activeElement;
      if (active && active !== document.body && active !== returnFocus && !content.current?.contains(active)) return;
      if (returnFocus?.isConnected && !returnFocus.closest('[inert], [hidden], [aria-hidden="true"]') && !returnFocus.matches(':disabled')) returnFocus.focus({ preventScroll: true });
    }} className="app-dialog-content border-0 bg-transparent p-0 shadow-none" aria-describedby={undefined} showCloseButton={false} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogTitle className="sr-only">{title}</DialogTitle><MotionPanel>{children}</MotionPanel>
    </DialogContent>
  </Dialog>;
}
