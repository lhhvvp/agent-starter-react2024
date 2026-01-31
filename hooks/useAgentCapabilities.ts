'use client';

import * as React from 'react';
import { RoomEvent } from 'livekit-client';
import { useRemoteParticipants, useRoomContext } from '@livekit/components-react';
import type { AppConfig } from '@/lib/types';

type CapabilityKeys =
  | 'supportsChatInput'
  | 'supportsAudioInput'
  | 'supportsVideoInput'
  | 'supportsScreenShare';

export type AgentCapabilities = Partial<Pick<AppConfig, CapabilityKeys>>;

const CAPABILITIES_TOPICS = ['lk-agent-capabilities', 'agent.capabilities'] as const;

const KEY_ALIASES: Record<CapabilityKeys, readonly string[]> = {
  supportsChatInput: ['supportsChatInput', 'supports_chat_input', 'chat', 'text'],
  supportsAudioInput: [
    'supportsAudioInput',
    'supports_audio_input',
    'audio',
    'voice',
    'mic',
    'microphone',
  ],
  supportsVideoInput: ['supportsVideoInput', 'supports_video_input', 'video', 'camera', 'cam'],
  supportsScreenShare: [
    'supportsScreenShare',
    'supports_screen_share',
    'screenShare',
    'screenshare',
    'screen_share',
  ],
};

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  }
  return undefined;
}

function parseCapabilitiesFromRecord(record: Record<string, unknown>): AgentCapabilities | null {
  const result: AgentCapabilities = {};

  const readKey = (key: CapabilityKeys, obj: Record<string, unknown>) => {
    for (const alias of KEY_ALIASES[key]) {
      if (!(alias in obj)) continue;
      const v = coerceBoolean(obj[alias]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  // Prefer nested { capabilities: { ... } } when present
  const nested =
    record.capabilities && typeof record.capabilities === 'object' && record.capabilities
      ? (record.capabilities as Record<string, unknown>)
      : null;

  for (const k of Object.keys(KEY_ALIASES) as CapabilityKeys[]) {
    const fromNested = nested ? readKey(k, nested) : undefined;
    const fromTop = readKey(k, record);
    const v = fromTop ?? fromNested;
    if (v !== undefined) result[k] = v;
  }

  return Object.keys(result).length ? result : null;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mergeCapabilities(base: AgentCapabilities, next: AgentCapabilities | null | undefined) {
  if (!next) return base;
  return { ...base, ...next };
}

function extractCapabilitiesFromParticipant(p: { metadata?: string | null; attributes?: Record<string, string> }) {
  let caps: AgentCapabilities = {};

  if (typeof p.metadata === 'string' && p.metadata.trim().length) {
    const parsed = parseJson(p.metadata);
    if (parsed && typeof parsed === 'object') {
      caps = mergeCapabilities(caps, parseCapabilitiesFromRecord(parsed as Record<string, unknown>));
    }
  }

  const attrs = p.attributes ?? {};
  // Try direct boolean-ish attributes first (supports_video_input="false", etc.)
  caps = mergeCapabilities(caps, parseCapabilitiesFromRecord(attrs as unknown as Record<string, unknown>));

  // Also support a single JSON blob attribute, e.g. capabilities='{"supportsVideoInput":false}'
  for (const key of ['capabilities', 'agent_capabilities', 'lk.capabilities', 'lk.agent.capabilities']) {
    const raw = attrs[key];
    if (!raw) continue;
    const parsed = parseJson(raw);
    if (parsed && typeof parsed === 'object') {
      caps = mergeCapabilities(caps, parseCapabilitiesFromRecord(parsed as Record<string, unknown>));
    }
  }

  return Object.keys(caps).length ? caps : null;
}

function decodeUtf8(payload: Uint8Array): string {
  try {
    return new TextDecoder().decode(payload);
  } catch {
    // Fallback (should be rare in modern browsers)
    let s = '';
    for (const b of payload) s += String.fromCharCode(b);
    return s;
  }
}

/**
 * Best-effort agent capability detection.
 *
 * Sources (in priority order):
 * - Agent participant `metadata` JSON
 * - Agent participant `attributes` (boolean-ish strings or JSON under common keys)
 * - Room `metadata` JSON
 * - Data messages sent on `lk-agent-capabilities` / `agent.capabilities` topics
 *
 * Anything not advertised falls back to `undefined` (caller should default to app config).
 */
export function useAgentCapabilities(): AgentCapabilities {
  const room = useRoomContext();
  const participants = useRemoteParticipants();
  const [caps, setCaps] = React.useState<AgentCapabilities>({});

  const recomputeFromMetadata = React.useCallback(() => {
    const next: AgentCapabilities = {};

    // Room-level metadata (optional)
    const roomMeta = room?.metadata;
    if (typeof roomMeta === 'string' && roomMeta.trim().length) {
      const parsed = parseJson(roomMeta);
      if (parsed && typeof parsed === 'object') {
        Object.assign(next, parseCapabilitiesFromRecord(parsed as Record<string, unknown>) ?? {});
      }
    }

    // Agent participant metadata / attributes
    for (const p of participants) {
      if (!p.isAgent) continue;
      Object.assign(next, extractCapabilitiesFromParticipant(p) ?? {});
    }

    setCaps((prev) => {
      // Avoid re-render churn if nothing actually changed
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(next);
      return prevJson === nextJson ? prev : next;
    });
  }, [participants, room?.metadata]);

  // Recompute on participant list changes
  React.useEffect(() => {
    recomputeFromMetadata();
  }, [recomputeFromMetadata]);

  // Subscribe to updates (metadata/attrs/data)
  React.useEffect(() => {
    if (!room) return;

    const onAnyMetaChange = () => recomputeFromMetadata();

    const onDataReceived = (
      payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string
    ) => {
      if (!topic || !CAPABILITIES_TOPICS.includes(topic as any)) return;
      const text = decodeUtf8(payload);
      const parsed = typeof text === 'string' ? parseJson(text) : null;
      if (!parsed || typeof parsed !== 'object') return;
      const parsedCaps = parseCapabilitiesFromRecord(parsed as Record<string, unknown>);
      if (!parsedCaps) return;
      setCaps((prev) => ({ ...prev, ...parsedCaps }));
    };

    room.on(RoomEvent.RoomMetadataChanged, onAnyMetaChange);
    room.on(RoomEvent.ParticipantConnected, onAnyMetaChange);
    room.on(RoomEvent.ParticipantDisconnected, onAnyMetaChange);
    room.on(RoomEvent.ParticipantMetadataChanged, onAnyMetaChange);
    room.on(RoomEvent.ParticipantAttributesChanged, onAnyMetaChange);
    room.on(RoomEvent.DataReceived, onDataReceived as any);

    return () => {
      room.off(RoomEvent.RoomMetadataChanged, onAnyMetaChange);
      room.off(RoomEvent.ParticipantConnected, onAnyMetaChange);
      room.off(RoomEvent.ParticipantDisconnected, onAnyMetaChange);
      room.off(RoomEvent.ParticipantMetadataChanged, onAnyMetaChange);
      room.off(RoomEvent.ParticipantAttributesChanged, onAnyMetaChange);
      room.off(RoomEvent.DataReceived, onDataReceived as any);
    };
  }, [recomputeFromMetadata, room]);

  return caps;
}

