import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:pointer-events-none disabled:opacity-50 shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400',
        secondary: 'bg-[#171a24] text-slate-200 border border-slate-800 hover:bg-[#1e2230]',
        outline: 'border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800/60',
        ghost: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
        destructive: 'bg-rose-600 text-white hover:bg-rose-500',
      },
      size: {
        default: 'h-8 px-3.5 py-1.5',
        sm: 'h-7 px-2.5 py-1 text-[11px]',
        lg: 'h-9 px-4 py-2 text-sm',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
