'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import useChatAndTranscription from '@/hooks/useChatAndTranscription';
import { makeEventId, useReliableUIEventSender } from '@/hooks/useReliableUIEventSender';

/**
 * 后端历史消息 DTO（V1 最小子集）
 */
interface HistoryMessageDto {
  message_id: string;
  conversation_id: string;
  role: 'human' | 'assistant' | 'system';
  kind?: string;
  content?: string;
  source?: string;
  sender_identity?: string;
  blocks?: Array<{
    type: string;
    schema?: string | null;
    data?: {
      text?: string;
      artifact_id?: string;
      preview?: {
        title?: string;
        snippet?: string | null;
      };
    };
  }>;
  ts_ms: number;
  created_at: string;
  interactions?: {
    reactions?: { up?: number; down?: number };
    feedback_count?: number;
    my_reaction?: 'up' | 'down' | 'none' | null;
  };
  llmCallId?: string | null;
  llm_call_id?: string | null;
  traceId?: string | null;
  trace_id?: string | null;
}

export type ReactionValue = 'up' | 'down' | 'none';

/**
 * 统一 UI 消息模型（V1 精简版）
 */
export interface UiMessageV1 {
  id: string;
  conversationId: string;
  seq?: number;
  tsMs: number;
  role: 'human' | 'assistant' | 'system';
  text: string;
  isLocal: boolean;
  source: 'http' | 'livekit' | 'local';
  status: 'pending' | 'completed';
  blocks?: UiBlockV1[];
  interactions?: {
    reactions: { up: number; down: number };
    feedbackCount: number;
    myReaction: ReactionValue;
  };
  llmCallId?: string | null;
  traceId?: string | null;
}

export interface UiBlockTextV1 {
  kind: 'text';
  text: string;
}

export interface UiBlockArtifactV1 {
  kind: 'artifact';
  artifactId: string;
  /**
   * 来自 backend artifact_block@2.data.project_id，用于后续调用 Artifact API。
   */
  projectId?: string;
  title: string;
  snippet?: string;
  /**
   * backend preview.kind（如 project_brief / policy_summary 等）。
   */
  previewKind?: string;
  /**
   * backend preview.icon_emoji，用于在聊天中展示不同图标。
   */
  iconEmoji?: string | null;
  /**
   * backend ui_hint.display_mode: auto_open | chip | card。
   */
  displayMode?: 'auto_open' | 'chip' | 'card';
  /**
   * backend narrative_intent: step_output / brief 等。
   */
  narrativeIntent?: string | null;
}

export type UiBlockV1 = UiBlockTextV1 | UiBlockArtifactV1;

interface ChatMessageEnvelopeV1 {
  schema: string;
  conversation_id: string;
  message_id: string;
  client_message_id?: string;
  seq?: number;
  role: 'human' | 'assistant' | 'system';
  kind?: string;
  source?: string;
  status?: string;
  content?: string;
  interactions?: {
    reactions?: { up?: number; down?: number };
    feedback_count?: number;
    my_reaction?: 'up' | 'down' | 'none' | null;
  };
  llmCallId?: string | null;
  llm_call_id?: string | null;
  traceId?: string | null;
  trace_id?: string | null;
  blocks?: Array<{
    type: string;
    schema?: string | null;
    data?: {
      text?: string;
      artifact_id?: string;
      preview?: {
        title?: string;
        snippet?: string | null;
      };
    };
  }>;
  ts_ms?: number;
  created_at?: string;
}

function fromHistoryDtoV1(dto: HistoryMessageDto, localIdentity?: string): UiMessageV1 {
  // 优先使用后端直接给的 content；否则从 text 类型的 blocks 中提取
  const textBlocks = (dto.blocks ?? []).filter((b) => b.type === 'text');
  const fallbackContent =
    textBlocks.length > 0
      ? textBlocks
          .map((b) => b.data?.text ?? '')
          .filter((t) => t.length > 0)
          .join('\n')
      : '';

  const content = dto.content ?? fallbackContent;

  const uiBlocks: UiBlockV1[] = [];

  // 文本块
  for (const b of textBlocks) {
    const text = b.data?.text;
    if (text && text.length > 0) {
      uiBlocks.push({ kind: 'text', text });
    }
  }

  // artifact_block@2
  for (const b of dto.blocks ?? []) {
    if (b.type !== 'artifact' || b.schema !== 'artifact_block@2') continue;
    const data = b.data ?? {};
    const artifactId = data.artifact_id;
    const title = data.preview?.title;
    if (!artifactId || !title) continue;
    const preview = (data as any).preview ?? {};
    const uiHint = (data as any).ui_hint ?? {};
    const snippet = preview?.snippet ?? undefined;
    uiBlocks.push({
      kind: 'artifact',
      artifactId,
      projectId: (data as any).project_id,
      title,
      snippet: snippet ?? undefined,
      previewKind: (preview as any).kind,
      iconEmoji: (preview as any).icon_emoji ?? null,
      displayMode: uiHint?.display_mode,
      narrativeIntent: (data as any).narrative_intent ?? null,
    });
  }

  const isLocal =
    dto.sender_identity != null
      ? dto.sender_identity === localIdentity
      : dto.role === 'human';

  const interactions = normalizeInteractions(dto.interactions);
  const llmCallId = dto.llmCallId ?? dto.llm_call_id ?? null;
  const traceId = dto.traceId ?? dto.trace_id ?? null;

  return {
    id: dto.message_id,
    conversationId: dto.conversation_id,
    seq: undefined,
    tsMs: dto.ts_ms,
    role: dto.role,
    text: content,
    isLocal,
    source: 'http',
    status: 'completed',
    blocks: uiBlocks.length ? uiBlocks : undefined,
    interactions: interactions ?? undefined,
    llmCallId,
    traceId,
  };
}

/**
 * V1：合并「HTTP 历史」与「LiveKit 实时」的对话消息。
 *
 * - 如果有 conversationId：进入页面时先拉一页最近历史；
 * - 同时订阅现有 useChatAndTranscription 的实时消息；
 * - 基于 client_message_id 维护本地 pending 与服务器 chat_message@1 的覆盖关系；
 * - 按 timestamp 升序排序后返回。
 */
export default function useConversationMessagesV1(conversationId?: string | null) {
  const room = useRoomContext();
  const { messages: liveMessagesRaw, send: rawSend } = useChatAndTranscription();
  const { sendMessageInteractionEvent } = useReliableUIEventSender();

  const [historyMessages, setHistoryMessages] = useState<UiMessageV1[]>([]);
  const [pendingMessages, setPendingMessages] = useState<UiMessageV1[]>([]);
  const [interactionOverrides, setInteractionOverrides] = useState<
    Record<string, UiMessageV1['interactions']>
  >({});

  // 拉取首屏历史
  useEffect(() => {
    if (!conversationId) {
      setHistoryMessages([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${conversationId}/messages?limit=50&view=chat&include_interactions=true`
        );
        if (!res.ok) {
          // 失败时直接忽略历史，保留实时流
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const items = Array.isArray(data.items) ? data.items : [];
        const views: UiMessageV1[] = items.map((dto: HistoryMessageDto) =>
          fromHistoryDtoV1(dto, room?.localParticipant?.identity)
        );

        // 调试：打印从 HTTP 历史接口获取到的原始 items 和映射后的 UiMessageV1
        // eslint-disable-next-line no-console
        console.debug('[useConversationMessagesV1] fetched history items', {
          rawCount: items.length,
          uiCount: views.length,
          firstRaw: items[0],
          firstUi: views[0],
        });

        setHistoryMessages(views);
      } catch {
        // 网络 / 解析错误：忽略历史，让实时继续工作
        if (!cancelled) {
          setHistoryMessages([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // 从 LiveKit 原始消息中解析 chat_message@1 / 其它 JSON envelope，转换为 UiMessageV1
  const liveMessages: UiMessageV1[] = useMemo(() => {
    const result: UiMessageV1[] = [];

    for (const msg of liveMessagesRaw) {
      const text = msg.message;

      let asJson: unknown;
      try {
        asJson = JSON.parse(text);
      } catch {
        asJson = null;
      }

      if (asJson && typeof asJson === 'object' && 'schema' in asJson) {
        const env = asJson as ChatMessageEnvelopeV1;

        // 调试：打印来自后端 / LiveKit 的 chat JSON payload
        // eslint-disable-next-line no-console
        console.debug('[useConversationMessagesV1] received LiveKit chat payload', env);

        // 仅处理 chat_message@1，其它 schema 先忽略或后续扩展
        if (env.schema === 'chat_message@1') {
          const textBlocks = (env.blocks ?? []).filter((b) => b.type === 'text');
          const fallbackContent =
            textBlocks.length > 0
              ? textBlocks
                  .map((b) => b.data?.text ?? '')
                  .filter((t) => t.length > 0)
                  .join('\n')
              : '';

          const content = env.content ?? fallbackContent;
          const tsMs =
            typeof env.ts_ms === 'number'
              ? env.ts_ms
              : env.created_at
                ? Date.parse(env.created_at)
                : msg.timestamp;
          const isLocal = env.role === 'human';
          const interactions = normalizeInteractions(env.interactions);
          const llmCallId = env.llmCallId ?? env.llm_call_id ?? null;
          const traceId = env.traceId ?? env.trace_id ?? null;

          const uiBlocks: UiBlockV1[] = [];
          for (const b of textBlocks) {
            const t = b.data?.text;
            if (t && t.length > 0) {
              uiBlocks.push({ kind: 'text', text: t });
            }
          }

          for (const b of env.blocks ?? []) {
            if (b.type !== 'artifact' || b.schema !== 'artifact_block@2') continue;
            const data = b.data ?? {};
            const preview = (data as any).preview ?? {};
            const uiHint = (data as any).ui_hint ?? {};
            const artifactId = (data as any).artifact_id;
            const title = preview?.title;
            if (!artifactId || !title) continue;
            const snippet = preview?.snippet ?? undefined;
            uiBlocks.push({
              kind: 'artifact',
              artifactId,
              projectId: (data as any).project_id,
              title,
              snippet,
              previewKind: (preview as any).kind,
              iconEmoji: (preview as any).icon_emoji ?? null,
              displayMode: uiHint?.display_mode,
              narrativeIntent: (data as any).narrative_intent ?? null,
            });
          }

          result.push({
            id: env.message_id,
            conversationId: env.conversation_id,
            seq: env.seq,
            tsMs,
            role: env.role,
            text: content,
            isLocal,
            source: 'livekit',
            status: 'completed',
            blocks: uiBlocks.length ? uiBlocks : undefined,
            interactions: interactions ?? undefined,
            llmCallId,
            traceId,
          });

          continue;
        }

        // TODO: 未来可以在这里处理 user_input@1 等其它 schema
      }

      // 非 JSON 或未知 schema：保持原行为，退化为简单文本消息
      result.push({
        id: msg.id,
        conversationId: conversationId ?? '',
        seq: undefined,
        tsMs: msg.timestamp,
        role: msg.from?.isLocal ? 'human' : 'assistant',
        text: msg.message,
        isLocal: msg.from?.isLocal ?? false,
        source: 'livekit',
        status: 'completed',
        blocks: msg.message ? [{ kind: 'text', text: msg.message }] : undefined,
      });
    }

    return result;
  }, [liveMessagesRaw, room]);

  // 处理 chat_message@1 与本地 pending 的覆盖：有 client_message_id 时移除对应 pending
  useEffect(() => {
    if (!liveMessagesRaw.length || !pendingMessages.length) return;

    const clientIdsToClear = new Set<string>();

    for (const msg of liveMessagesRaw) {
      let asJson: unknown;
      try {
        asJson = JSON.parse(msg.message);
      } catch {
        continue;
      }

      if (asJson && typeof asJson === 'object' && 'schema' in asJson) {
        const env = asJson as ChatMessageEnvelopeV1;
        if (env.schema === 'chat_message@1' && env.client_message_id) {
          clientIdsToClear.add(env.client_message_id);
        }
      }
    }

    if (clientIdsToClear.size === 0) return;

    setPendingMessages((prev) => prev.filter((m) => !clientIdsToClear.has(m.id)));
  }, [liveMessagesRaw, pendingMessages.length]);

  // 合并历史、pending 与实时，并按时间排序
  const mergedMessages: UiMessageV1[] = useMemo(() => {
    const map = new Map<string, UiMessageV1>();

    for (const msg of historyMessages) {
      map.set(msg.id, msg);
    }

    for (const msg of pendingMessages) {
      map.set(msg.id, msg);
    }

    for (const msg of liveMessages) {
      map.set(msg.id, msg);
    }

    const all = Array.from(map.values());
    all.sort((a, b) => {
      if (a.seq != null && b.seq != null && a.seq !== b.seq) {
        return a.seq - b.seq;
      }
      return a.tsMs - b.tsMs;
    });
    return all;
  }, [historyMessages, liveMessages, pendingMessages]);

  const messagesWithOverrides: UiMessageV1[] = useMemo(() => {
    if (!Object.keys(interactionOverrides).length) return mergedMessages;
    return mergedMessages.map((m) => {
      const override = interactionOverrides[m.id];
      if (!override) return m;
      return { ...m, interactions: override ?? m.interactions };
    });
  }, [interactionOverrides, mergedMessages]);

  function getCurrentReaction(messageId: string): ReactionValue {
    const override = interactionOverrides[messageId];
    if (override) return override.myReaction;
    const msg = mergedMessages.find((m) => m.id === messageId);
    return msg?.interactions?.myReaction ?? 'none';
  }

  function applyReactionLocal(
    messageId: string,
    next: ReactionValue,
    base?: UiMessageV1['interactions']
  ) {
    const cur = base ?? mergedMessages.find((m) => m.id === messageId)?.interactions;
    if (!cur) {
      setInteractionOverrides((prev) => ({
        ...prev,
        [messageId]: { reactions: { up: 0, down: 0 }, feedbackCount: 0, myReaction: next },
      }));
      return;
    }

    const prevVal = cur.myReaction ?? 'none';
    const reactions = { ...cur.reactions };
    if (prevVal === 'up') reactions.up = Math.max(0, reactions.up - 1);
    if (prevVal === 'down') reactions.down = Math.max(0, reactions.down - 1);
    if (next === 'up') reactions.up += 1;
    if (next === 'down') reactions.down += 1;

    setInteractionOverrides((prev) => ({
      ...prev,
      [messageId]: { ...cur, reactions, myReaction: next },
    }));
  }

  async function setReaction(messageId: string, value: ReactionValue) {
    if (!conversationId) return;

    const current = mergedMessages.find((m) => m.id === messageId);
    const prev = getCurrentReaction(messageId);
    const next = prev === value ? 'none' : value;

    // Safer strategy: pending UX is handled in UI; here we only apply local state after ack.
    const eventId = makeEventId('evt');
    const clientTsMs = Date.now();

    const llmCallId = current?.llmCallId ?? null;
    const traceId = current?.traceId ?? null;

    // Prefer LiveKit (lk.ui.events ↔ lk.ui.acks). If room is not connected, fall back to HTTP.
    if (room?.state === 'connected') {
      const res = await sendMessageInteractionEvent(
        {
          name: 'msg.reaction.set',
          args: {
            messageId,
            eventId,
            value: next,
            clientTsMs,
            ...(llmCallId ? { llmCallId } : {}),
            ...(traceId ? { traceId } : {}),
          },
        },
        { timeoutMs: 1200, maxRetries: 5 }
      );
      if (!res.ok) throw res.error;
      applyReactionLocal(messageId, next);
      return;
    }

    const httpRes = await fetch(
      `/api/conversations/${conversationId}/messages/${messageId}/reaction`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: next, event_id: eventId, client_ts_ms: clientTsMs }),
      }
    );
    const data = await httpRes.json().catch(() => ({}));
    if (!httpRes.ok || data?.ok === false) {
      throw new Error(data?.detail?.error || data?.detail?.error_code || 'reaction failed');
    }
    const normalized = normalizeInteractions(data?.interactions);
    if (normalized) setInteractionOverrides((prevMap) => ({ ...prevMap, [messageId]: normalized }));
  }

  async function createFeedback(
    messageId: string,
    reasonCode: string,
    text?: string
  ) {
    if (!conversationId) return;
    const eventId = makeEventId('evt');

    if (room?.state === 'connected') {
      const res = await sendMessageInteractionEvent(
        {
          name: 'msg.feedback.create',
          args: {
            messageId,
            eventId,
            reason_code: reasonCode,
            ...(text ? { text } : {}),
            clientTsMs: Date.now(),
          },
        },
        { timeoutMs: 1200, maxRetries: 5 }
      );
      if (!res.ok) throw res.error;

      // Locally bump feedback count if present
      const cur = mergedMessages.find((m) => m.id === messageId)?.interactions;
      if (cur) {
        setInteractionOverrides((prev) => ({
          ...prev,
          [messageId]: { ...cur, feedbackCount: (cur.feedbackCount ?? 0) + 1 },
        }));
      }
      return;
    }

    const httpRes = await fetch(
      `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: reasonCode, text: text ?? null, event_id: eventId }),
      }
    );
    const data = await httpRes.json().catch(() => ({}));
    if (!httpRes.ok || data?.ok === false) {
      throw new Error(data?.detail?.error || data?.detail?.error_code || 'feedback failed');
    }
  }

  // 发送消息：生成本地 pending，并通过 LiveKit 发送 user_input@1
  async function send(message: string) {
    const now = Date.now();
    const clientId =
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto && crypto.randomUUID()) ||
      `local_${now}_${Math.random().toString(36).slice(2)}`;

    // 本地 pending 消息
    setPendingMessages((prev) => [
      ...prev,
      {
        id: clientId,
        conversationId: conversationId ?? '',
        seq: undefined,
        tsMs: now,
        role: 'human',
        text: message,
        isLocal: true,
        source: 'local',
        status: 'pending',
        blocks: message ? [{ kind: 'text', text: message }] : undefined,
      },
    ]);

    // 发送 user_input@1，携带 client_message_id，供后端在 chat_message@1 中回传
    const payloadObj = {
      schema: 'user_input@1',
      client_message_id: clientId,
      text: message,
    };

    // 调试：打印发送到 LiveKit Chat 的 JSON 数据
    // eslint-disable-next-line no-console
    console.debug('[useConversationMessagesV1] send to LiveKit chat', payloadObj);

    await rawSend(JSON.stringify(payloadObj));
  }

  return {
    messages: messagesWithOverrides,
    send,
    setReaction,
    createFeedback,
  };
}

function normalizeInteractions(
  interactions:
    | {
        reactions?: { up?: number; down?: number };
        feedback_count?: number;
        my_reaction?: 'up' | 'down' | 'none' | null;
      }
    | undefined
    | null
): UiMessageV1['interactions'] | null {
  if (!interactions) return null;
  const up = Number(interactions.reactions?.up ?? 0) || 0;
  const down = Number(interactions.reactions?.down ?? 0) || 0;
  const my = interactions.my_reaction ?? 'none';
  const feedbackCount = Number(interactions.feedback_count ?? 0) || 0;
  return {
    reactions: { up, down },
    feedbackCount,
    myReaction: (my === 'up' || my === 'down' || my === 'none' ? my : 'none') as ReactionValue,
  };
}
