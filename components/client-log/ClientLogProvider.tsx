'use client';

import * as React from 'react';
import type { Room } from 'livekit-client';
import { ClientLogContext, type ClientLogger } from '@/components/client-log/context';
import {
  type ClientLogV1,
  type LiveKitClientLogger,
  type LogLevel,
  createLiveKitClientLogger,
  installConsoleRelay,
  installGlobalErrorHandlers,
} from '@/lib/client-log/logger';

type ClientLogProviderProps = {
  room: Room;
  conversationId?: string | null;
  roomName?: string | null;
  enabled?: boolean;
  children: React.ReactNode;
};

function readBoolFlag(value: string | null | undefined) {
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function readDebugFlags() {
  const envDebug =
    process.env.NEXT_PUBLIC_CLIENT_LOG_DEBUG === '1' ||
    process.env.NEXT_PUBLIC_UIBLOCKS_DEBUG === '1';

  let urlDebug = false;
  let urlConsole = false;
  try {
    const sp = new URLSearchParams(window.location.search);
    urlDebug = readBoolFlag(sp.get('debug')) || readBoolFlag(sp.get('clientlog'));
    urlConsole = readBoolFlag(sp.get('console')) || readBoolFlag(sp.get('clientlog_console'));
  } catch {
    // ignore
  }

  let storageDebug = false;
  let storageConsole = false;
  try {
    storageDebug =
      window.localStorage.getItem('lk_debug') === '1' ||
      window.localStorage.getItem('lk_client_log') === '1';
    storageConsole = window.localStorage.getItem('lk_console_relay') === '1';
  } catch {
    // ignore
  }

  const debugSession = envDebug || urlDebug || storageDebug;
  const consoleRelay = debugSession && (urlConsole || storageConsole);

  return { debugSession, consoleRelay };
}

function parseEnvLogLevel(value: unknown): LogLevel | null {
  switch (value) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value;
    default:
      return null;
  }
}

export function ClientLogProvider({
  room,
  conversationId,
  roomName,
  enabled = true,
  children,
}: ClientLogProviderProps) {
  const loggerRef = React.useRef<LiveKitClientLogger | null>(null);
  const pageRef = React.useRef<string | undefined>(undefined);
  const baseRef = React.useRef<Omit<ClientLogV1, 'schema' | 'level' | 'message' | 'ts'>>({});
  const proxy = React.useMemo<ClientLogger>(() => {
    return {
      debug: (m, d) => loggerRef.current?.debug(m, d),
      info: (m, d) => loggerRef.current?.info(m, d),
      warn: (m, d) => loggerRef.current?.warn(m, d),
      error: (m, d) => loggerRef.current?.error(m, d),
      flush: () => loggerRef.current?.flush(),
    };
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    try {
      pageRef.current = `${window.location.pathname}${window.location.search}`;
    } catch {
      pageRef.current = undefined;
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    baseRef.current = {
      ...baseRef.current,
      logger: 'web',
      page: pageRef.current,
      conversationId: conversationId ?? undefined,
      roomName: roomName ?? undefined,
    };
  }, [enabled, conversationId, roomName]);

  React.useEffect(() => {
    if (!enabled) return;

    const { debugSession, consoleRelay } = readDebugFlags();
    const envMinLevel = parseEnvLogLevel(process.env.NEXT_PUBLIC_CLIENT_LOG_MIN_LEVEL);
    const minLevel: LogLevel = envMinLevel ?? (debugSession ? 'debug' : 'warn');

    const envTopic = process.env.NEXT_PUBLIC_CLIENT_LOG_INGEST_TOPIC;
    const topic = typeof envTopic === 'string' && envTopic ? envTopic : 'lk.client.log';

    const maxBytesEnv = Number(process.env.NEXT_PUBLIC_CLIENT_LOG_MAX_BYTES);
    const maxBytes = Number.isFinite(maxBytesEnv) ? maxBytesEnv : 32 * 1024;

    const logger = createLiveKitClientLogger(room, {
      topic,
      minLevel,
      maxBytes,
      base: () => baseRef.current,
    });
    loggerRef.current = logger;

    // Handy for debugging locally.
    // @ts-expect-error - debug helper
    window.__lk_client_log = proxy;

    // Only install global capture / console relay in explicit debug sessions.
    const cleanupGlobalErrors = debugSession ? installGlobalErrorHandlers(proxy) : null;
    const cleanupConsole = consoleRelay ? installConsoleRelay(proxy) : null;

    proxy.info('client-log.ingest.ready', {
      debugSession,
      consoleRelay,
      minLevel,
      topic,
      maxBytes,
    });

    return () => {
      cleanupConsole?.();
      cleanupGlobalErrors?.();
      logger.dispose();
      loggerRef.current = null;
      // @ts-expect-error - debug helper
      window.__lk_client_log = undefined;
    };
  }, [enabled, proxy, room]);

  return <ClientLogContext.Provider value={proxy}>{children}</ClientLogContext.Provider>;
}
