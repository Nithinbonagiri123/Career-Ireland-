'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { motion } from 'framer-motion';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabs primitive backed by base-ui — same accessibility guarantees as
 * the other base-ui-backed primitives (Dialog, Dropdown). The active
 * underline indicator is a real element that base-ui positions +
 * animates automatically. Panels rise + fade on mount via framer-motion.
 */

export function Tabs({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'relative inline-flex h-9 items-center gap-1 border-b border-border',
        className,
      )}
      {...props}
    >
      {props.children}
      <TabsPrimitive.Indicator
        className={cn(
          'absolute bottom-[-1px] left-0 h-[2px] bg-foreground',
          'transition-[left,width] duration-200 ease-out',
        )}
        style={{
          width: 'var(--active-tab-width)',
          left: 'var(--active-tab-left)',
        }}
      />
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Tab>) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        'relative inline-flex h-9 items-center gap-1.5 rounded-t-md px-3 text-sm text-muted-foreground transition-colors',
        'hover:text-foreground',
        'data-[selected]:font-medium data-[selected]:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>) {
  // Motion sits INSIDE the Panel — placing it on `render` swallowed the
  // panel's children (previous iteration). Panels rise 8px + fade with
  // the emphasised easing curve so tab switches feel intentional.
  return (
    <TabsPrimitive.Panel
      className={cn('outline-none focus-visible:ring-2 focus-visible:ring-ring/40', className)}
      {...props}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
      >
        {children}
      </motion.div>
    </TabsPrimitive.Panel>
  );
}
