'use client';

import { cn } from '@/lib/utils';

export function Container({ className, children, ref, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      ref={ref}
      className={cn('bg-background border-border/60 space-y-4 rounded-2xl border p-4', className)}
      {...props}
    >
      {children}
    </section>
  );
}
