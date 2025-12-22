import * as React from 'react';
import { useChat, useTextStream } from '@livekit/components-react';
import type { UIEvent, UIPayload } from '@/lib/ui-blocks';
import {
  LK_UI_EVENTS_TOPIC,
  LK_UI_BLOCKS_VERSION,
} from '@/lib/ui-blocks';

export type UseUIEventsChannelOptions = {
  validate?: (evt: unknown) => evt is UIEvent;
};

export type UIEventRecord = {
  event: UIEvent;
  ts?: number;
  raw: {
    message: string;
    attributes?: Record<string, string>;
  };
};

export type CallState = {
  callId: string;
  requestId?: string;
  messageId?: string;
  origin?: { blockId: string; actionId?: string; type: 'actions' | 'button' | 'form' };
  tool?: { name: string; argumentsSchemaRef?: string; resultSchemaRef?: string };
  progress?: number;
  final?: boolean;
  error?: { code: string; message: string; retriable?: boolean };
  updatedAt?: number;
};

export type UseUIEventsChannelResult = {
  events: UIEventRecord[];
  callsById: Record<string, CallState>;
  orderedCalls: CallState[];
  uiSnippets: UIPayload[]; // normalized to UIPayload for reuse in UI Blocks renderer
};

export function useUIEventsChannel(options?: UseUIEventsChannelOptions): UseUIEventsChannelResult {
  // Debug toggle
  const DEBUG_UI = process.env.NEXT_PUBLIC_UIBLOCKS_DEBUG === '1';
  const dbg = (...args: any[]) => {
    if (DEBUG_UI) console.debug(...args);
  };

  // Avoid duplicate debug prints across re-renders by tracking what we've logged.
  const loggedKeysRef = React.useRef<Set<string>>(new Set());
  const lastCountRef = React.useRef<number>(-1);

  // Receive via TextStream (topic-based)
  const { textStreams } = useTextStream(LK_UI_EVENTS_TOPIC);
  // Also listen via Chat on the same topic for robustness
  const chatTopicOptions = React.useMemo(() => ({ channelTopic: LK_UI_EVENTS_TOPIC }), []);
  const { chatMessages } = useChat(chatTopicOptions as any);

  const events = React.useMemo<UIEventRecord[]>(() => {
    const tmp: UIEventRecord[] = [];

    // TextStream path
    for (const s of textStreams) {
      try {
        const obj = JSON.parse(s.text);
        const evt = safeParseUIEvent(obj, undefined, options?.validate);
        if (!evt) continue;
        const rec = { event: evt, ts: s.streamInfo?.timestamp, raw: { message: s.text } } as const;
        tmp.push(rec as any);
        const key = `text|${rec.ts ?? 'na'}|${String(rec.event?.name)}|${String((rec.event as any)?.args?.callId ?? '')}`;
        if (!loggedKeysRef.current.has(key)) {
          loggedKeysRef.current.add(key);
          dbg('[lk.ui.events:text] received', {
            ts: rec.ts,
            name: rec.event?.name,
            callId: (rec.event as any)?.args?.callId,
          });
        }
      } catch {
        // ignore invalid json
      }
    }

    // Chat path
    for (const m of chatMessages) {
      if (typeof m.message !== 'string') continue;
      try {
        const obj = JSON.parse(m.message);
        const evt = safeParseUIEvent(obj, m.attributes, options?.validate);
        if (!evt) continue;
        const ts: number | undefined = (m as any)?.timestamp;
        const rec = { event: evt, ts, raw: { message: m.message, attributes: m.attributes } } as const;
        tmp.push(rec as any);
        const key = `chat|${ts ?? 'na'}|${String(rec.event?.name)}|${String((rec.event as any)?.args?.callId ?? '')}`;
        if (!loggedKeysRef.current.has(key)) {
          loggedKeysRef.current.add(key);
          dbg('[lk.ui.events:chat] received', {
            ts,
            name: rec.event?.name,
            callId: (rec.event as any)?.args?.callId,
            attrs: m.attributes,
          });
        }
      } catch {
        // ignore
      }
    }

    // Sort by timestamp
    tmp.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    if (lastCountRef.current !== tmp.length) {
      lastCountRef.current = tmp.length;
      dbg('[lk.ui.events] merged events', { count: tmp.length });
    }
    return tmp;
  }, [textStreams, chatMessages, options?.validate]);

  const { callsById, orderedCalls, uiSnippets } = React.useMemo(() => {
    const calls = new Map<string, CallState>();
    const snippets: UIPayload[] = [];

    const upsert = (id: string): CallState => {
      const cur = calls.get(id) ?? { callId: id };
      calls.set(id, cur);
      return cur;
    };

    for (const rec of events) {
      const e = rec.event;
      const name = e?.name as UIEvent['name'];
      if (name === 'tool.invoke') {
        const a = (e as Extract<UIEvent, { name: 'tool.invoke' }>).args;
        const cs = upsert(a.callId);
        cs.requestId = a.requestId;
        cs.messageId = a.messageId;
        cs.origin = a.origin;
        cs.tool = a.tool as any;
        cs.updatedAt = rec.ts;
      } else if (name === 'tool.result') {
        const a = (e as Extract<UIEvent, { name: 'tool.result' }>).args;
        const cs = upsert(a.callId);
        cs.progress = typeof a.progress === 'number' ? clamp01(a.progress) : cs.progress;
        cs.final = !!a.final;
        cs.updatedAt = rec.ts;

        // Normalize ui snippet (if provided) into UIPayload for reuse in Blocks renderer
        const ui = a.ui as any;
        if (ui && ui.blocks && Array.isArray(ui.blocks)) {
          const requestId = cs.requestId || `req.${a.callId}`;
          const messageId = cs.messageId || `msg.${a.callId}`;
          const payload: UIPayload = {
            schema: 'ui-blocks@2',
            requestId,
            messageId,
            lang: ui.lang,
            text: ui.text,
            blocks: ui.blocks as any,
          };
          snippets.push(payload);
        }
      } else if (name === 'tool.error') {
        const a = (e as Extract<UIEvent, { name: 'tool.error' }>).args;
        const cs = upsert(a.callId);
        cs.error = { code: a.code, message: a.message, retriable: a.retriable };
        cs.final = true;
        cs.updatedAt = rec.ts;
      } else if (name === 'tool.cancel') {
        const a = (e as Extract<UIEvent, { name: 'tool.cancel' }>).args;
        const cs = upsert(a.callId);
        cs.error = { code: 'CANCELLED', message: a.reason ?? 'cancelled', retriable: false };
        cs.final = true;
        cs.updatedAt = rec.ts;
      } else {
        // ui.rendered / ui.error or unknowns: informational
      }
    }

    const byId: Record<string, CallState> = {};
    const list: CallState[] = Array.from(calls.values()).sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
    for (const cs of list) {
      byId[cs.callId] = cs;
    }
    return { callsById: byId, orderedCalls: list, uiSnippets: snippets };
  }, [events]);

  return { events, callsById, orderedCalls, uiSnippets };
}

function safeParseUIEvent(
  obj: unknown,
  attributes?: Record<string, string>,
  validate?: (evt: unknown) => evt is UIEvent
): UIEvent | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const name = (obj as any).name;
  const args = (obj as any).args;
  if (typeof name !== 'string' || !args || typeof args !== 'object') return undefined;

  // Minimal version/content-type guard (soft): accept if version missing or matches expected
  if (attributes) {
    const v = attributes['version'];
    if (v && v !== LK_UI_BLOCKS_VERSION) return undefined;
  }
  if (validate && !validate(obj)) return undefined;
  return obj as UIEvent;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return undefined as any;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
