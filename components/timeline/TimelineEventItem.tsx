'use client';

import * as React from 'react';
import type { TimelineEvent } from '@/lib/timeline/schema';
import { cn } from '@/lib/utils';

export type TimelineEventItemProps = {
  event: TimelineEvent;
  onSelectArtifact?(artifactId: string): void;
  onSelectStep?(stepId: string): void;
};

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pickIcon(ev: TimelineEvent) {
  switch (ev.kind) {
    case 'task_created':
      return '📋';
    case 'task_status_changed':
      return '🔁';
    case 'step_started':
      return '🏁';
    case 'step_finished':
      return '✅';
    case 'step_blocked':
      return '⛔';
    case 'tool_called':
      return '🛠️';
    case 'tool_result':
      return ev.status === 'error' ? '⚠️' : '✅';
    case 'artifact_created':
      return '📄';
    case 'artifact_updated':
      return '✏️';
    case 'summary':
      return '📝';
    case 'system':
    default:
      return '⚙️';
  }
}

function labelForKind(ev: TimelineEvent) {
  switch (ev.kind) {
    case 'task_created':
      return '任务创建';
    case 'task_status_changed':
      return '任务状态变更';
    case 'step_started':
      return '步骤开始';
    case 'step_finished':
      return '步骤完成';
    case 'step_blocked':
      return '步骤阻塞';
    case 'tool_called':
      return '工具调用';
    case 'tool_result':
      return ev.status === 'error' ? '工具失败' : '工具完成';
    case 'artifact_created':
      return '文档生成';
    case 'artifact_updated':
      return '文档更新';
    case 'summary':
      return '总结';
    case 'system':
    default:
      return '系统';
  }
}

function pickStatusClass(ev: TimelineEvent) {
  if (!ev.status) return 'text-muted-foreground';
  switch (ev.status) {
    case 'success':
      return 'text-emerald-600';
    case 'error':
      return 'text-red-600';
    case 'running':
      return 'text-blue-600';
    case 'info':
    default:
      return 'text-muted-foreground';
  }
}

export function TimelineEventItem({
  event,
  onSelectArtifact,
  onSelectStep,
}: TimelineEventItemProps) {
  const time = formatTime(event.created_at);
  const icon = pickIcon(event);
  const statusClass = pickStatusClass(event);

  const clickableArtifact = event.artifact_id && onSelectArtifact;
  const clickableStep = event.step_id && onSelectStep;

  const handleClick = () => {
    if (clickableArtifact) {
      onSelectArtifact!(event.artifact_id!);
    } else if (clickableStep) {
      onSelectStep!(event.step_id!);
    }
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-md px-2 py-1.5',
        clickableArtifact || clickableStep
          ? 'cursor-pointer hover:bg-muted/60'
          : undefined
      )}
      onClick={handleClick}
    >
      <div className="mt-0.5 text-xs text-muted-foreground">{time}</div>
      <div className="flex flex-1 items-start gap-2">
        <div className="mt-0.5 text-base">{icon}</div>
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium', statusClass)}>
              {labelForKind(event)}
            </span>
            {event.tool_name && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                {event.tool_name}
              </span>
            )}
            {event.step_id && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                步骤 {event.step_id}
              </span>
            )}
          </div>

          {event.summary && (
            <div className="text-xs text-foreground">{event.summary}</div>
          )}

          {event.kind === 'step_blocked' &&
            typeof event.data.reason === 'string' && (
              <div className="text-xs text-orange-600">
                阻塞原因：{String(event.data.reason)}
              </div>
            )}

          {event.kind === 'tool_result' && event.status === 'error' && (
            <div className="text-xs text-red-500">
              {typeof event.data.error_message === 'string'
                ? String(event.data.error_message)
                : '工具执行失败'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



