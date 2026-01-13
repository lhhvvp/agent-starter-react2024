'use client';

import * as React from 'react';
import { useTextStream } from '@livekit/components-react';
import {
  TimelineWirePayloadSchema,
  type TimelineEvent,
} from '@/lib/timeline/schema';

const TIMELINE_TOPIC = 'lk.timeline.events';
const DEBUG_TIMELINE = process.env.NEXT_PUBLIC_UIBLOCKS_DEBUG === '1';

// 直接从 LiveKit TextStream 订阅时间线事件流，并做 JSON + Zod 校验与去重
export function useLiveKitTimelineStream(): TimelineEvent[] {
  const { textStreams } = useTextStream(TIMELINE_TOPIC);
  const [events, setEvents] = React.useState<TimelineEvent[]>([]);

  React.useEffect(() => {
    if (!textStreams.length) return;

    if (DEBUG_TIMELINE) {
      // eslint-disable-next-line no-console
      console.debug('[lk.timeline.events] textStreams count', textStreams.length);
    }

    const next: TimelineEvent[] = [];

    // 为了调试，当前版本对每次 textStreams 全量解析并输出日志
    for (const s of textStreams) {
      if (DEBUG_TIMELINE) {
        // eslint-disable-next-line no-console
        console.debug('[lk.timeline.events:text] received', {
          ts: s.streamInfo?.timestamp,
          text: s.text,
        });
      }
      try {
        const parsed = JSON.parse(s.text);
        const validated = TimelineWirePayloadSchema.parse(parsed);
        next.push(...validated);
      } catch (err) {
        if (DEBUG_TIMELINE) {
          // eslint-disable-next-line no-console
          console.warn('[timeline] invalid LiveKit payload', err, {
            raw: s.text,
          });
        }
      }
    }

    if (next.length) {
      // 仍然按 id 去重并排序
      const byId = new Map<string, TimelineEvent>();
      for (const ev of events) byId.set(ev.id, ev);
      for (const ev of next) byId.set(ev.id, ev);

      const merged = Array.from(byId.values());
      merged.sort((a, b) => {
        if (a.created_at === b.created_at) {
          const aSeq = a.sequence ?? Number.MAX_SAFE_INTEGER;
          const bSeq = b.sequence ?? Number.MAX_SAFE_INTEGER;
          return aSeq - bSeq;
        }
        return a.created_at - b.created_at;
      });

      if (DEBUG_TIMELINE) {
        // eslint-disable-next-line no-console
        console.debug('[timeline] merged events', {
          added: next.length,
          total: merged.length,
        });
      }

      setEvents(merged);
    }
  }, [textStreams]);

  return events;
}


