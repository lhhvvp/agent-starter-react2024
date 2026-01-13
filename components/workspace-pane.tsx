'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceContent } from '@/components/ui-blocks/WorkspaceContent';

interface WorkspacePaneProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  onClose?: () => void;
  activeArtifact?: { id: string; projectId?: string | null } | null;
}

// A docked workspace pane on the right, mirroring CanvasPane layout.
// Uses a lightweight grid background as placeholder content.
export function WorkspacePane({
  title = 'Workspace',
  onClose,
  activeArtifact,
  className,
  ...props
}: WorkspacePaneProps) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} {...props}>
      <div className="bg-background border-bg2 flex items-center justify-between border-b px-3 py-2 md:px-4">
        <span className="font-mono text-xs font-semibold tracking-wider uppercase">{title}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded px-2 py-1 font-mono text-[10px] tracking-wide"
            aria-label="Close workspace"
          >
            CLOSE
          </button>
        )}
      </div>
      {/* 主体区域占满可用高度，具体滚动由父容器控制（桌面右侧分栏时） */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <WorkspaceContent activeArtifact={activeArtifact} />
      </div>
    </div>
  );
}
