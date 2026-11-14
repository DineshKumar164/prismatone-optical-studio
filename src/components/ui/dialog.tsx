'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open = false, onOpenChange = () => {}, children }: DialogProps) {
  const value = React.useMemo(() => ({ open, onOpenChange }), [open, onOpenChange]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const ctx = React.useContext(DialogContext);
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        ctx.onOpenChange(true);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
DialogTrigger.displayName = 'DialogTrigger';

const DialogPortal = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, ...props }, ref) => {
  const ctx = React.useContext(DialogContext);
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        ctx.onOpenChange(false);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
DialogClose.displayName = 'DialogClose';

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const ctx = React.useContext(DialogContext);
    return (
      <div
        ref={ref}
        onClick={() => ctx.onOpenChange(false)}
        className={cn('fixed inset-0 z-50 bg-black/75', className)}
        {...props}
      />
    );
  }
);
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const ctx = React.useContext(DialogContext);
    if (!ctx.open) return null;

    return (
      <DialogPortal>
        <DialogOverlay />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-800 bg-[#11131a] p-6 shadow-2xl duration-200 rounded-lg text-slate-100',
            className
          )}
          {...props}
        >
          {children}
          <button
            type="button"
            onClick={() => ctx.onOpenChange(false)}
            className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <X className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Close</span>
          </button>
        </div>
      </DialogPortal>
    );
  }
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />
);

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-base font-semibold leading-none tracking-tight text-slate-100', className)}
      {...props}
    />
  )
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-slate-400', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
};
