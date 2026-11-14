'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: '',
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (val: string) => void;
}

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  ({ className, defaultValue = '', value: controlledValue, onValueChange, children, ...props }, ref) => {
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
    const activeValue = controlledValue !== undefined ? controlledValue : uncontrolledValue;

    const handleValueChange = React.useCallback(
      (nextVal: string) => {
        if (controlledValue === undefined) {
          setUncontrolledValue(nextVal);
        }
        onValueChange?.(nextVal);
      },
      [controlledValue, onValueChange]
    );

    const contextValue = React.useMemo(
      () => ({ value: activeValue, onValueChange: handleValueChange }),
      [activeValue, handleValueChange]
    );

    return (
      <TabsContext.Provider value={contextValue}>
        <div ref={ref} className={cn('w-full', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        'inline-flex h-8 items-center justify-center rounded-md bg-[#0b0d13] p-1 text-slate-400 border border-slate-800/90',
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = 'TabsList';

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, onClick, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    const isSelected = ctx.value === value;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={`prismatone-tab-${value}`}
        aria-selected={isSelected}
        aria-controls={`prismatone-tabpanel-${value}`}
        data-state={isSelected ? 'active' : 'inactive'}
        onClick={(e) => {
          ctx.onValueChange(value);
          onClick?.(e);
        }}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[#1b202e] data-[state=active]:text-amber-300 data-[state=active]:shadow-sm shrink-0',
          className
        )}
        {...props}
      />
    );
  }
);
TabsTrigger.displayName = 'TabsTrigger';

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = React.useContext(TabsContext);
    const isSelected = ctx.value === value;

    if (!isSelected) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`prismatone-tabpanel-${value}`}
        aria-labelledby={`prismatone-tab-${value}`}
        data-state="active"
        className={cn(
          'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
