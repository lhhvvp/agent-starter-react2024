'use client';

import * as React from 'react';
import { useArtifactDetail } from '@/hooks/useArtifactDetail';
import { cn } from '@/lib/utils';

interface ArtifactViewProps extends React.HTMLAttributes<HTMLDivElement> {
  artifactId?: string | null;
  projectId?: string | null;
}

/**
 * Workspace 中的基础 Artifact 详情视图。
 * - 使用 useArtifactDetail 拉取快照与历史；
 * - 当前仅做最小可用展示，后续可在此基础上演进（Diff / 多 Tab / 富文本等）。
 */
export function ArtifactView({ artifactId, projectId, className, ...props }: ArtifactViewProps) {
  const { detail, status, error } = useArtifactDetail({ artifactId, projectId });

  if (!artifactId || !projectId) {
    return null;
  }

  if (status === 'loading' && !detail && !error) {
    return (
      <section
        className={cn('rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground', className)}
        {...props}
      >
        正在加载 Artifact（{artifactId}）…
      </section>
    );
  }

  if (error) {
    return (
      <section
        className={cn('rounded-lg border bg-background/60 p-3 text-sm text-red-600', className)}
        {...props}
      >
        加载 Artifact 失败：{error.message}
      </section>
    );
  }

  if (!detail) {
    return null;
  }

  const { snapshot, history } = detail;

  return (
    <section className={cn('rounded-lg border bg-background/60', className)} {...props}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase text-muted-foreground">
            Artifact · {snapshot.id}
          </div>
          <div className="truncate text-sm font-medium text-foreground">{snapshot.title}</div>
          {snapshot.snippet && (
            <div className="truncate text-[11px] text-muted-foreground/80">{snapshot.snippet}</div>
          )}
        </div>
      </header>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">内容</div>
          <div className="rounded-md border bg-background px-3 py-2 text-sm whitespace-pre-wrap">
            {snapshot.contentMd}
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">历史</div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border bg-background px-3 py-2 text-[11px]">
            {history.length === 0 && <div className="text-muted-foreground">暂无历史记录。</div>}
            {history.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{h.summary ?? '变更'}</div>
                  {h.actorLabel && (
                    <div className="truncate text-[10px] text-muted-foreground">by {h.actorLabel}</div>
                  )}
                </div>
                <div className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(h.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


