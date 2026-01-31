'use client';

import * as React from 'react';
import { useTextStream } from '@livekit/components-react';
import { useClientLog } from '@/hooks/useClientLog';
import { type TimelineEvent, TimelineWirePayloadSchema } from '@/lib/timeline/schema';

const TIMELINE_TOPIC = 'lk.timeline.events';
const DEBUG_TIMELINE = process.env.NEXT_PUBLIC_UIBLOCKS_DEBUG === '1';

// 直接从 LiveKit TextStream 订阅时间线事件流，并做 JSON + Zod 校验与去重
export function useLiveKitTimelineStream(): TimelineEvent[] {
  const { textStreams } = useTextStream(TIMELINE_TOPIC);
  const [events, setEvents] = React.useState<TimelineEvent[]>([]);
  const log = useClientLog();
  const invalidKeysRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!textStreams.length) return;

    if (DEBUG_TIMELINE) {
      console.debug('[lk.timeline.events] textStreams count', textStreams.length);
    }

    const next: TimelineEvent[] = [];

    // 为了调试，当前版本对每次 textStreams 全量解析并输出日志
    for (const s of textStreams) {
      if (DEBUG_TIMELINE) {
        console.debug('[lk.timeline.events:text] received', {
          ts: s.streamInfo?.timestamp,
          text: s.text,
        });
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(s.text);
        const validated = TimelineWirePayloadSchema.parse(parsed);
        next.push(...validated);
      } catch (err) {
        const key = s.streamInfo?.id
          ? `id:${s.streamInfo.id}`
          : `raw:${String(s.text ?? '').slice(0, 160)}`;

        if (!invalidKeysRef.current.has(key)) {
          invalidKeysRef.current.add(key);
          if (invalidKeysRef.current.size > 500) invalidKeysRef.current.clear();

          const parsedObj =
            typeof parsed === 'object' && parsed != null && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : null;

          log.warn('timeline.invalid_payload', {
            streamId: s.streamInfo?.id,
            streamTs: s.streamInfo?.timestamp,
            rawPreview: String(s.text ?? '').slice(0, 800),
            parsedKind:
              parsedObj && typeof parsedObj.kind === 'string' ? parsedObj.kind : undefined,
            parsedCreatedAt:
              parsedObj && typeof parsedObj.created_at === 'number'
                ? parsedObj.created_at
                : undefined,
            error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          });
        }

        if (DEBUG_TIMELINE) {
          console.warn('[timeline] invalid LiveKit payload', err, {
            raw: s.text,
          });
        }
      }
    }

    if (next.length) {
      setEvents((prev) => {
        const byId = new Map<string, TimelineEvent>();
        for (const ev of prev) byId.set(ev.id, ev);
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
          console.debug('[timeline] merged events', {
            added: next.length,
            total: merged.length,
          });
        }

        return merged;
      });
    }
  }, [textStreams, log]);

  return events;
}
