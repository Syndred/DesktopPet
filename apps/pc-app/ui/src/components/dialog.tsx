import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import type { ReactNode } from 'react';
import { MotionPanel } from './motion';

/** Radix supplies focus trapping, Escape handling, accessible naming and focus return. */
export function AppDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="app-dialog-content border-0 bg-transparent p-0 shadow-none" aria-describedby={undefined} showCloseButton={false} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogTitle className="sr-only">{title}</DialogTitle><MotionPanel>{children}</MotionPanel>
    </DialogContent>
  </Dialog>;
}
