'use client';

import * as React from 'react';
import { useUIBlocksRuntime } from '@/hooks/useUIBlocksRuntime';
import { useSendUIEvent } from '@/hooks/useSendUIEvent';
import { useTaskViewRuntime } from '@/hooks/useTaskViewRuntime';
import { ArtifactView } from '@/components/artifacts/ArtifactView';
import { UIBlocksProvider } from './context';
import { BlockRenderer } from './BlockRenderer';

export function WorkspaceContent({
  activeArtifact,
}: {
  activeArtifact?: { id: string; projectId?: string | null } | null;
}) {
  const { blocks, calls, snippets } = useUIBlocksRuntime();
  const sendUIEvent = useSendUIEvent();
  const { latestTask } = useTaskViewRuntime();

  const merged = React.useMemo(() => {
    const out = [...blocks];
    const seen = new Set(out.map((p) => p.messageId));
    for (const s of snippets) {
      if (!s.messageId || seen.has(s.messageId)) continue;
      seen.add(s.messageId);
      out.push(s);
    }
    return out;
  }, [blocks, snippets]);

  const hasActiveCalls = calls.some((c) => !c.final && (c.progress == null || c.progress < 1));
  const hasErrors = calls.some((c) => c.error);

  if (!merged.length && !latestTask && !activeArtifact) {
    return (
      <div className="m-3 space-y-3">
        {(hasActiveCalls || hasErrors) && <ToolActivity calls={calls} />}
        <div className="border-border bg-muted/20 text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          暂无结构化结果。与助手继续对话或触发流程后，将在此显示最新内容。
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-3">
          {(hasActiveCalls || hasErrors) && <ToolActivity calls={calls} />}
          {activeArtifact && (
            <ArtifactView artifactId={activeArtifact.id} projectId={activeArtifact.projectId ?? null} />
          )}
          {latestTask && (
            <section className="rounded-lg border bg-background/60">
              <header className="flex items-center justify-between border-b px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-muted-foreground">
                    任务视图 · {latestTask.taskId}
                  </div>
                  {latestTask.payload.text && (
                    <div className="truncate text-[11px] text-muted-foreground/80">
                      {latestTask.payload.text}
                    </div>
                  )}
                </div>
              </header>
              <div className="p-3">
                <UIBlocksProvider
                  value={{
                    sendUIEvent,
                    current: {
                      requestId: latestTask.payload.requestId,
                      messageId: latestTask.payload.messageId,
                      lang: latestTask.payload.lang,
                      text: latestTask.payload.text,
                    },
                  }}
                >
                  <BlockRenderer blocks={latestTask.payload.blocks} msgId={latestTask.payload.messageId} />
                </UIBlocksProvider>
              </div>
            </section>
          )}
          {merged.map((payload, idx) => (
            <UIBlocksProvider
              key={`${payload.messageId}-${idx}`}
              value={{
                sendUIEvent,
                current: {
                  requestId: payload.requestId,
                  messageId: payload.messageId,
                  lang: payload.lang,
                  text: payload.text,
                },
              }}
            >
              <article className="rounded-lg border">
                <header className="flex items-center justify-between border-b px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-muted-foreground">
                      {payload.text ?? `消息 ${shortId(payload.messageId)}`}
                    </div>
                  </div>
                </header>
                <div className="p-3">
                  <BlockRenderer blocks={payload.blocks} msgId={payload.messageId} />
                </div>
              </article>
            </UIBlocksProvider>
          ))}
        </div>
      </div>
    </div>
  );
}

function shortId(id: string) {
  if (!id) return '';
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function ToolActivity({ calls }: { calls: Array<{ callId: string; progress?: number; final?: boolean; error?: { code: string; message: string } | undefined; tool?: { name?: string } }> }) {
  if (!calls.length) return null;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">工具调用</div>
      <div className="flex flex-col gap-2">
        {calls.map((c) => {
          const isError = !!c.error;
          const isFinal = !!c.final && !isError;
          const showProgress = !c.final && (c.progress == null || c.progress < 1);
          const pct = Math.round(((c.progress ?? 0) * 100));
          return (
            <div key={c.callId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs">
                  {c.tool?.name ?? '调用'} — {c.callId}
                </div>
                {showProgress && (
                  <div className="mt-1 h-1.5 w-40 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-foreground/60" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {isFinal && (
                  <div className="text-[11px] text-green-600">完成</div>
                )}
                {isError && (
                  <div className="text-[11px] text-red-600">{c.error?.code}: {c.error?.message}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
