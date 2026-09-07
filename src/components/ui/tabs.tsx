'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabs primitive using base-ui's Tabs. Same accessibility guarantees as
 * the other base-ui-backed primitives (Dialog, Dropdown). The active
 * indicator is a real element (`TabsPrimitive.Indicator`) that base-ui
 * animates positionally, so we don't need framer-motion here.
 *
 * Convention:
 *   <Tabs defaultValue="overview">
 *     <TabsList>
 *       <TabsTrigger value="overview">Overview</TabsTrigger>
 *       ...
 *     </TabsList>
 *     <TabsContent value="overview">...</TabsContent>
 *   </Tabs>
 */

export function Tabs({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
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
        'data-[selected]:text-foreground data-[selected]:font-medium',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Panel>) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
      {...props}
    />
  );
}
