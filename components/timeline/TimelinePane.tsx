'use client';

import * as React from 'react';
import type { TimelineEvent } from '@/lib/timeline/schema';
import { TimelineEventItem } from '@/components/timeline/TimelineEventItem';

export type TimelinePaneProps = {
  events: TimelineEvent[];
  loading?: boolean;
  error?: Error | null;
  onSelectArtifact?(artifactId: string): void;
  onSelectStep?(stepId: string): void;
};

function dayKeyFromTs(ts: number) {
  // 使用 ISO 日期作为分组 key，避免 locale 差异导致解析问题
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function TimelinePane({
  events,
  loading,
  error,
  onSelectArtifact,
  onSelectStep,
}: TimelinePaneProps) {
  if (loading && !events.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        正在加载时间线…
      </div>
    );
  }

  if (error && !events.length) {
    return (
      <div className="p-4 text-sm text-red-500">
        加载时间线失败：{error.message}
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">暂无可显示的事件。</div>
    );
  }

  const grouped = events.reduce<Record<string, TimelineEvent[]>>((acc, ev) => {
    const key = dayKeyFromTs(ev.created_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(ev);
    return acc;
  }, {});

  const days = Object.keys(grouped).sort();

  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="flex flex-none items-center justify-between border-b px-4 py-2">
        <div className="text-sm font-medium">时间线</div>
        {loading && (
          <div className="text-xs text-muted-foreground">实时更新中…</div>
        )}
      </div>
      <div className="flex-1 space-y-4 px-3 py-3 text-sm">
        {days.map((key) => {
          const list = grouped[key]!;
          const dateLabel = new Date(list[0]!.created_at * 1000).toLocaleDateString();
          return (
            <div key={key}>
              <div className="mb-1 select-none text-xs font-semibold uppercase text-muted-foreground">
                {dateLabel}
              </div>
              <div className="space-y-1">
                {list.map((ev) => (
                  <TimelineEventItem
                    key={ev.id}
                    event={ev}
                    onSelectArtifact={onSelectArtifact}
                    onSelectStep={onSelectStep}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


