'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceContent } from '@/components/ui-blocks/WorkspaceContent';

interface WorkspaceOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  title?: string;
  activeArtifact?: { id: string; projectId?: string | null } | null;
}

// Mobile full-screen workspace overlay. Mirrors CanvasOverlay behavior.
export function WorkspaceOverlay({
  open,
  onClose,
  title = 'Workspace',
  className,
  activeArtifact,
}: WorkspaceOverlayProps) {

  // No-op effect to keep similar structure and allow future hooks
  useEffect(() => {}, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'bg-background/80 fixed inset-0 z-[100] backdrop-blur supports-[backdrop-filter]:backdrop-blur',
        className
      )}
      aria-modal="true"
      role="dialog"
    >
      <div className="pointer-events-none absolute inset-0" />
      <div className="fixed inset-0 mx-auto flex max-w-5xl flex-col p-3 md:p-6">
        <div className="bg-background border-bg2 relative z-[101] flex items-center justify-between rounded-t-lg border px-3 py-2 md:px-4">
          <span className="font-mono text-sm font-semibold tracking-wider uppercase">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded px-2 py-1 font-mono text-xs"
            aria-label="Close workspace"
          >
            CLOSE
          </button>
        </div>
        {/* 移动端全屏 Workspace 内容区域，支持垂直滚动 */}
        <div className="bg-background border-bg2 relative -mt-px flex-1 min-h-0 overflow-y-auto rounded-b-lg border">
          <WorkspaceContent activeArtifact={activeArtifact} />
        </div>
      </div>
    </div>
  );
}
