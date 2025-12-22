'use client';

import * as React from 'react';
import type { TimelineEvent } from '@/lib/timeline/schema';
import { fetchConversationTimeline } from '@/lib/timeline/api';
import { useLiveKitTimelineStream } from '@/hooks/useLiveKitTimelineStream';

type Status = 'idle' | 'loading' | 'ready' | 'error';

// 聚合「HTTP 历史 + LiveKit 实时」的会话时间线 hook
// conversationId 为空时：返回所有会话的实时事件（调试用）；
// conversationId 有值时：仅返回该会话的历史 + 实时事件。
export function useConversationTimeline(conversationId: string | null | undefined) {
  const [history, setHistory] = React.useState<TimelineEvent[]>([]);
  const [status, setStatus] = React.useState<Status>('idle');
  const [error, setError] = React.useState<Error | null>(null);

  const realtimeEvents = useLiveKitTimelineStream();

  React.useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const events = await fetchConversationTimeline({
          conversationId,
          limit: 200,
        });
        if (cancelled) return;
        setHistory(events);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[timeline] failed to load history', err);
        setError(err as Error);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const events = React.useMemo(() => {
    const byId = new Map<string, TimelineEvent>();

    for (const ev of history) {
      if (!conversationId || ev.conversation_id === conversationId) {
        byId.set(ev.id, ev);
      }
    }

    for (const ev of realtimeEvents) {
      if (!conversationId || ev.conversation_id === conversationId) {
        byId.set(ev.id, ev);
      }
    }

    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
      if (a.created_at === b.created_at) {
        const aSeq = a.sequence ?? Number.MAX_SAFE_INTEGER;
        const bSeq = b.sequence ?? Number.MAX_SAFE_INTEGER;
        return aSeq - bSeq;
      }
      return a.created_at - b.created_at;
    });

    const MAX_EVENTS = 500;
    if (merged.length > MAX_EVENTS) {
      return merged.slice(merged.length - MAX_EVENTS);
    }

    return merged;
  }, [conversationId, history, realtimeEvents]);

  const lastEventTs = events.length ? events[events.length - 1]!.created_at : null;

  return {
    status,
    error,
    events,
    lastEventTs,
  };
}


