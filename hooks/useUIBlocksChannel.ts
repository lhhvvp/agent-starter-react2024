import * as React from 'react';
import { useChat, useTextStream } from '@livekit/components-react';
import type { UIPayload, UIEvent } from '@/lib/ui-blocks';
import { LK_UI_BLOCKS_TOPIC, LK_UI_EVENTS_TOPIC, LK_UI_BLOCKS_CONTENT_TYPE, LK_UI_BLOCKS_VERSION } from '@/lib/ui-blocks';

type MessageRecord = {
  payload: UIPayload;
  raw: {
    message: string;
    attributes?: Record<string, string>;
  };
};

export type UseUIBlocksChannelOptions = {
  validate?: (payload: unknown) => payload is UIPayload;
};

export function useUIBlocksChannel(options?: UseUIBlocksChannelOptions) {
  // Debug toggle (set NEXT_PUBLIC_UIBLOCKS_DEBUG=1 to enable)
  const DEBUG_UI = process.env.NEXT_PUBLIC_UIBLOCKS_DEBUG === '1';
  const dbg = (...args: any[]) => {
    if (DEBUG_UI) console.debug(...args);
  };

  // Receive via BOTH TextStream (topic-based) and Chat (channelTopic-based) to be robust.
  // - TextStream: aligns with room.local_participant.send_text from backend agents
  // - Chat: supports cases where backend uses Chat and lets us reuse send() with topic
  const { textStreams } = useTextStream(LK_UI_BLOCKS_TOPIC);
  const chatTopicOptions = React.useMemo(() => ({ channelTopic: LK_UI_BLOCKS_TOPIC }), []);
  const { chatMessages, send } = useChat(chatTopicOptions as any);

  const uiMessages = React.useMemo(() => {
    type Rec = MessageRecord & { ts?: number };
    const tmp: Rec[] = [];

    // From TextStream
    for (const s of textStreams) {
      try {
        const obj = JSON.parse(s.text);
        if (!obj || obj.schema !== 'ui-blocks@2') continue;
        if (options?.validate && !options.validate(obj)) continue;
        const rec = { payload: obj as UIPayload, raw: { message: s.text }, ts: s.streamInfo?.timestamp };
        tmp.push(rec);
        dbg('[lk.ui.blocks:text] received', {
          ts: rec.ts,
          messageId: rec.payload?.messageId,
          requestId: rec.payload?.requestId,
          blocks: Array.isArray(rec.payload?.blocks) ? rec.payload.blocks.length : undefined,
          lang: (rec.payload as any)?.lang,
          payload: rec.payload,
        });
      } catch {
        // ignore invalid JSON
      }
    }

    // From Chat
    for (const m of chatMessages) {
      if (typeof m.message !== 'string') continue;
      const payload = safeParseUIPayload(m.message, m.attributes, options?.validate);
      if (!payload) continue;
      // include timestamp if available on chat message
      const ts: number | undefined = (m as any)?.timestamp;
      const rec = { payload, raw: { message: m.message, attributes: m.attributes }, ts } as const;
      tmp.push(rec as any);
      dbg('[lk.ui.blocks:chat] received', {
        ts,
        messageId: payload?.messageId,
        requestId: payload?.requestId,
        attrs: m.attributes,
        blocks: Array.isArray(payload?.blocks) ? payload.blocks.length : undefined,
        payload,
      });
    }

    // Deduplicate by messageId, keep LATEST snapshot per id
    // 这样当后端用相同 messageId 多次推送更新时，前端会展示最新的一版。
    const byId = new Map<string, Rec>();
    // Sort by timestamp if available so“后来的”在 Map 覆盖“之前的”
    tmp.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    for (const r of tmp) {
      const id = r.payload?.messageId;
      if (typeof id === 'string' && id) {
        byId.set(id, r);
      } else {
        // 无 messageId 的保留为独立记录
        const key = `__idx_${byId.size}`;
        byId.set(key, r);
      }
    }

    const out = Array.from(byId.values()).map(({ ts: _ts, ...rest }) => rest);
    dbg('[lk.ui.blocks] merged messages', { count: out.length });
    return out;
  }, [textStreams, chatMessages, options?.validate]);

  const sendUIEvent = React.useCallback(
    async (event: UIEvent) => {
      const msg = JSON.stringify(event);
      // The SendTextOptions type is internal to components-core; cast at callsite to avoid importing internals.
      const opts = {
        topic: LK_UI_EVENTS_TOPIC,
        attributes: {
          'content-type': LK_UI_BLOCKS_CONTENT_TYPE,
          version: LK_UI_BLOCKS_VERSION,
        },
      } as unknown as { topic?: string; attributes?: Record<string, string> };
      dbg('[lk.ui.events:out] sending', {
        name: (event as any)?.name,
        callId: (event as any)?.args?.callId,
        attrs: (opts as any).attributes,
      });
      await send(msg, opts as any);
    },
    [send]
  );

  return { uiMessages, sendUIEvent } as const;
}

function safeParseUIPayload(
  json: string,
  attributes?: Record<string, string>,
  validate?: (payload: unknown) => payload is UIPayload
): UIPayload | undefined {
  try {
    const obj = JSON.parse(json);
    // Basic guards aligned to spec
    if (obj?.schema !== 'ui-blocks@2') return undefined;
    if (attributes && attributes['content-type'] && attributes['content-type'] !== LK_UI_BLOCKS_CONTENT_TYPE) return undefined;
    if (attributes && attributes.version && attributes.version !== LK_UI_BLOCKS_VERSION) return undefined;
    if (validate && !validate(obj)) return undefined;
    return obj as UIPayload;
  } catch {
    return undefined;
  }
}
