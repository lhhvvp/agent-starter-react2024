'use client';

import { type RefObject, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export function useAutoScroll(scrollContentContainerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    function scrollToBottom() {
      const contentEl = scrollContentContainerRef.current;
      if (!contentEl) return;

      // 优先使用显式标记的滚动容器（例如对话主列），否则退回到自身
      const scrollContainer =
        (contentEl.closest('[data-scroll-container]') as HTMLElement | null) ?? contentEl;

      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }

    const el = scrollContentContainerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(scrollToBottom);

    resizeObserver.observe(el);
    scrollToBottom();

    return () => resizeObserver.disconnect();
  }, [scrollContentContainerRef]);
}
interface ChatProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

export const ChatMessageView = ({ className, children, ...props }: ChatProps) => {
  const scrollContentRef = useRef<HTMLDivElement>(null);

  useAutoScroll(scrollContentRef);

  return (
    <div ref={scrollContentRef} className={cn('flex flex-col justify-end', className)} {...props}>
      {children}
    </div>
  );
};
