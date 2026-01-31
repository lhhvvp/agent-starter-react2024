'use client';

import * as React from 'react';
import { useChat, useTextStream } from '@livekit/components-react';
import {
  LK_UI_ACKS_TOPIC,
  LK_UI_BLOCKS_CONTENT_TYPE,
  LK_UI_BLOCKS_VERSION,
  LK_UI_EVENTS_TOPIC,
} from '@/lib/ui-blocks';

export type MsgInteractionAck = {
  name: 'msg.interaction.ack';
  args: {
    ok: boolean;
    eventId: string;
    messageId?: string;
    eventType?: string;
    serverTsMs?: number;
    ackId?: string;
    journalSeq?: number;
    error_code?: string | null;
    error?: string | null;
  };
};

export type UIAck = {
  name: 'ui.ack';
  args: {
    ok: boolean;
    name: string; // e.g. tool.invoke
    requestId?: string;
    messageId?: string;
    callId: string;
    ackId?: string;
    journalSeq?: number;
    serverTsMs?: number;
    error_code?: string | null;
    error?: string | null;
  };
};

export type UIAckEvent = MsgInteractionAck | UIAck;

export type ReliableSendResult =
  | { ok: true; ack: UIAckEvent; attempts: number }
  | { ok: false; error: Error; attempts: number; lastAck?: UIAckEvent };

export function makeEventId(prefix: string) {
  const now = Date.now();
  const rand =
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID()) ||
    `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${now}_${rand}`;
}

type Waiter = {
  resolve: (ack: UIAckEvent) => void;
  reject: (err: Error) => void;
  timeoutId: number;
};

type SendOptions = {
  timeoutMs?: number;
  maxRetries?: number;
};

export function useReliableUIEventSender() {
  // IMPORTANT: pass stable options objects to LiveKit hooks; recreating the object
  // each render can cause internal resubscribe loops (and "MaxListenersExceededWarning").
  const chatOptions = React.useMemo(() => ({ channelTopic: LK_UI_ACKS_TOPIC } as any), []);
  const { send, chatMessages } = useChat(chatOptions);
  const { textStreams } = useTextStream(LK_UI_ACKS_TOPIC);

  const waitersRef = React.useRef<Map<string, Waiter>>(new Map());

  const parsedAcks = React.useMemo(() => {
    const tmp: UIAckEvent[] = [];

    for (const s of textStreams) {
      const evt = safeParseAck(s.text);
      if (evt) tmp.push(evt);
    }

    for (const m of chatMessages) {
      if (typeof m.message !== 'string') continue;
      const evt = safeParseAck(m.message, m.attributes);
      if (evt) tmp.push(evt);
    }

    return tmp;
  }, [textStreams, chatMessages]);

  React.useEffect(() => {
    if (!parsedAcks.length) return;

    for (const ack of parsedAcks) {
      const key = ackKey(ack);
      if (!key) continue;
      const waiter = waitersRef.current.get(key);
      if (!waiter) continue;
      window.clearTimeout(waiter.timeoutId);
      waitersRef.current.delete(key);
      waiter.resolve(ack);
    }
  }, [parsedAcks]);

  const sendRaw = React.useCallback(
    async (payload: unknown) => {
      const msg = JSON.stringify(payload);
      const opts = {
        topic: LK_UI_EVENTS_TOPIC,
        attributes: {
          'content-type': LK_UI_BLOCKS_CONTENT_TYPE,
          version: LK_UI_BLOCKS_VERSION,
        },
      } as unknown as { topic?: string; attributes?: Record<string, string> };
      await send(msg, opts as any);
    },
    [send]
  );

  const sendWithAck = React.useCallback(
    async (
      payload: unknown,
      expectedKey: string,
      isAckOk: (ack: UIAckEvent) => boolean,
      isRetriableAck: (ack: UIAckEvent) => boolean,
      options?: SendOptions
    ): Promise<ReliableSendResult> => {
      const timeoutMs = options?.timeoutMs ?? 1200;
      const maxRetries = options?.maxRetries ?? 5;

      let lastAck: UIAckEvent | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const ack = await waitForAckOnce({
            waitersRef,
            expectedKey,
            timeoutMs,
            send: async () => {
              await sendRaw(payload);
            },
          });
          lastAck = ack;

          if (isAckOk(ack)) return { ok: true, ack, attempts: attempt };
          if (isRetriableAck(ack) && attempt < maxRetries) {
            await backoff(attempt);
            continue;
          }

          return {
            ok: false,
            error: new Error(getAckErrorMessage(ack) ?? 'interaction failed'),
            attempts: attempt,
            lastAck,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error('interaction failed');
          if (attempt >= maxRetries) {
            return { ok: false, error: e, attempts: attempt, lastAck };
          }
          await backoff(attempt);
        }
      }

      return {
        ok: false,
        error: new Error('interaction failed'),
        attempts: maxRetries,
        lastAck,
      };
    },
    [sendRaw]
  );

  const sendMessageInteractionEvent = React.useCallback(
    async (
      event: {
        name:
          | 'msg.reaction.set'
          | 'msg.feedback.create'
          | 'msg.copy'
          | 'msg.read_aloud.start'
          | 'msg.read_aloud.stop'
          | 'msg.read_aloud.complete';
        args: Record<string, unknown> & { eventId: string };
      },
      options?: SendOptions
    ) => {
      const expectedKey = `eventId:${event.args.eventId}`;
      return sendWithAck(
        event,
        expectedKey,
        (ack) => ack.name === 'msg.interaction.ack' && ack.args.ok === true,
        (ack) =>
          ack.name === 'msg.interaction.ack' && ack.args.error_code === 'journal_append_failed',
        options
      );
    },
    [sendWithAck]
  );

  const sendToolInvokeWithAck = React.useCallback(
    async (
      event: {
        name: 'tool.invoke';
        args: { callId: string; requestId: string; messageId: string } & Record<string, unknown>;
      },
      options?: SendOptions
    ) => {
      const expectedKey = `callId:${event.args.callId}`;
      return sendWithAck(
        event,
        expectedKey,
        (ack) => ack.name === 'ui.ack' && ack.args.ok === true,
        (ack) =>
          ack.name === 'ui.ack' &&
          (ack.args.error_code === 'journal_append_failed' || ack.args.error_code === 'resume_failed'),
        options
      );
    },
    [sendWithAck]
  );

  return {
    sendRaw,
    sendMessageInteractionEvent,
    sendToolInvokeWithAck,
  } as const;
}

function waitForAckOnce({
  waitersRef,
  expectedKey,
  timeoutMs,
  send,
}: {
  waitersRef: React.RefObject<Map<string, Waiter>>;
  expectedKey: string;
  timeoutMs: number;
  send: () => Promise<void>;
}): Promise<UIAckEvent> {
  return new Promise((resolve, reject) => {
    const existing = waitersRef.current.get(expectedKey);
    if (existing) {
      window.clearTimeout(existing.timeoutId);
      waitersRef.current.delete(expectedKey);
    }

    const timeoutId = window.setTimeout(() => {
      waitersRef.current.delete(expectedKey);
      reject(new Error('ack timeout'));
    }, timeoutMs);

    waitersRef.current.set(expectedKey, { resolve, reject, timeoutId });

    void send().catch((err) => {
      window.clearTimeout(timeoutId);
      waitersRef.current.delete(expectedKey);
      reject(err instanceof Error ? err : new Error('send failed'));
    });
  });
}

function backoff(attempt: number) {
  const ms = [0, 200, 500, 1000, 2000, 4000][Math.min(attempt, 5)] ?? 4000;
  return new Promise((r) => window.setTimeout(r, ms));
}

function ackKey(evt: UIAckEvent): string | null {
  if (evt.name === 'msg.interaction.ack') {
    if (!evt.args.eventId) return null;
    return `eventId:${evt.args.eventId}`;
  }
  if (evt.name === 'ui.ack') {
    if (!evt.args.callId) return null;
    return `callId:${evt.args.callId}`;
  }
  return null;
}

function getAckErrorMessage(ack: UIAckEvent): string | null {
  const code = (ack as any)?.args?.error_code;
  const msg = (ack as any)?.args?.error;
  if (code && msg) return `${code}: ${msg}`;
  if (code) return String(code);
  if (msg) return String(msg);
  return null;
}

function safeParseAck(
  json: string,
  attributes?: Record<string, string>
): UIAckEvent | undefined {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return undefined;

    // Soft guards: content-type/version may be missing depending on backend transport.
    if (attributes) {
      const ct = attributes['content-type'];
      if (ct && ct !== LK_UI_BLOCKS_CONTENT_TYPE) return undefined;
      const v = attributes.version;
      if (v && v !== LK_UI_BLOCKS_VERSION) return undefined;
    }

    const name = (obj as any).name;
    const args = (obj as any).args;
    if (typeof name !== 'string' || !args || typeof args !== 'object') return undefined;

    if (name === 'msg.interaction.ack') {
      if (typeof (args as any).eventId !== 'string') return undefined;
      if (typeof (args as any).ok !== 'boolean') return undefined;
      return obj as MsgInteractionAck;
    }

    if (name === 'ui.ack') {
      if (typeof (args as any).callId !== 'string') return undefined;
      if (typeof (args as any).ok !== 'boolean') return undefined;
      return obj as UIAck;
    }

    return undefined;
  } catch {
    return undefined;
  }
}
