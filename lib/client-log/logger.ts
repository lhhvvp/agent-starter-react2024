import { type Room, RoomEvent } from 'livekit-client';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ClientLogV1 = {
  schema: 'client.log@1';
  level?: LogLevel;
  message: string;
  ts?: number; // ms timestamp
  logger?: string;
  data?: Record<string, unknown>;
  // Allow extra correlation fields (reqId/traceId/page/clientVersion/etc).
  [key: string]: unknown;
};

export type LiveKitClientLogger = {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  flush(): void;
  dispose(): void;
};

type CreateLiveKitClientLoggerOptions = {
  topic?: string;
  minLevel?: LogLevel;
  maxBytes?: number; // must be <= backend CLIENT_LOG_INGEST_MAX_BYTES
  base?:
    | Omit<ClientLogV1, 'schema' | 'level' | 'message' | 'ts'>
    | (() => Omit<ClientLogV1, 'schema' | 'level' | 'message' | 'ts'>);
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function safeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err ?? '') };
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Error) return safeError(v);
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  });
}

function summarizeData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const entries = Object.entries(data);
  const MAX_KEYS = 24;
  for (const [key, value] of entries.slice(0, MAX_KEYS)) {
    if (typeof value === 'string') {
      out[key] = value.length > 300 ? `${value.slice(0, 300)} …(truncated)` : value;
      continue;
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (value instanceof Error) {
      out[key] = safeError(value);
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = `[Array(${value.length})]`;
      continue;
    }
    if (typeof value === 'object') {
      out[key] = '[Object]';
      continue;
    }
    out[key] = String(value);
  }
  if (entries.length > MAX_KEYS) out.__truncated_keys__ = entries.length - MAX_KEYS;
  return out;
}

function truncateClientLog(item: ClientLogV1): ClientLogV1 {
  const out: ClientLogV1 = { ...item };
  const msg = typeof out.message === 'string' ? out.message : String(out.message ?? '');
  if (msg.length > 2000) out.message = `${msg.slice(0, 2000)} …(truncated)`;

  if (out.data && typeof out.data === 'object') {
    out.data = { ...summarizeData(out.data), __data_truncated__: true };
  }
  return out;
}

export function createLiveKitClientLogger(
  room: Room,
  opts?: CreateLiveKitClientLoggerOptions
): LiveKitClientLogger {
  const topic = opts?.topic ?? 'lk.client.log';
  const maxBytes = Number.isFinite(opts?.maxBytes) ? Number(opts?.maxBytes) : 32 * 1024;
  const minLevel = opts?.minLevel ?? 'debug';
  const baseProvider = typeof opts?.base === 'function' ? opts.base : () => opts?.base ?? {};

  const encoder = new TextEncoder();
  const queue: ClientLogV1[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const enabled = (lvl: LogLevel) => LEVEL_ORDER[lvl] >= LEVEL_ORDER[minLevel];

  function tryPublish(bytes: Uint8Array) {
    if (room.state !== 'connected') return false;
    try {
      room.localParticipant.publishData(bytes, { reliable: true, topic });
      return true;
    } catch {
      return false;
    }
  }

  function enqueue(level: LogLevel, message: string, data?: Record<string, unknown>) {
    if (disposed) return;
    if (!enabled(level)) return;

    const base = baseProvider();
    queue.push({
      schema: 'client.log@1',
      level,
      message: String(message ?? ''),
      ts: Date.now(),
      ...base,
      ...(data ? { data } : {}),
    });

    const MAX_QUEUE = 500;
    if (queue.length > MAX_QUEUE) {
      queue.splice(0, queue.length - MAX_QUEUE);
    }

    if (timer == null) timer = setTimeout(flush, 200);
  }

  function flush() {
    timer = null;
    if (disposed) return;
    if (!queue.length) return;
    if (room.state !== 'connected') return;

    const batch = queue.splice(0, queue.length);

    try {
      const json = safeJsonStringify(batch);
      const bytes = encoder.encode(json);
      if (bytes.byteLength <= maxBytes) {
        const ok = tryPublish(bytes);
        if (!ok) queue.unshift(...batch);
        return;
      }
    } catch {
      // fall through to per-item publish
    }

    const remaining: ClientLogV1[] = [];
    for (const item of batch) {
      let payload: ClientLogV1 = item;
      let json: string;
      let bytes: Uint8Array;

      try {
        json = safeJsonStringify(payload);
      } catch {
        payload = {
          schema: 'client.log@1',
          level: item.level,
          message: String(item.message ?? ''),
          ts: item.ts,
          logger: item.logger,
          data: { error: 'failed_to_stringify' },
        };
        json = safeJsonStringify(payload);
      }

      bytes = encoder.encode(json);

      if (bytes.byteLength > maxBytes) {
        payload = truncateClientLog(payload);
        json = safeJsonStringify(payload);
        bytes = encoder.encode(json);
      }

      if (bytes.byteLength > maxBytes) {
        payload = {
          schema: 'client.log@1',
          level: item.level,
          message: `${String(item.message ?? '').slice(0, 256)} …(dropped: too_large)`,
          ts: item.ts,
        };
        json = safeJsonStringify(payload);
        bytes = encoder.encode(json);
      }

      const ok = tryPublish(bytes);
      if (!ok) {
        remaining.push(item, ...batch.slice(batch.indexOf(item) + 1));
        break;
      }
    }

    if (remaining.length) queue.unshift(...remaining);
  }

  const onConnected = () => flush();
  room.on(RoomEvent.Connected, onConnected);

  return {
    debug: (m, d) => enqueue('debug', m, d),
    info: (m, d) => enqueue('info', m, d),
    warn: (m, d) => enqueue('warn', m, d),
    error: (m, d) => enqueue('error', m, d),
    flush,
    dispose: () => {
      disposed = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      room.off(RoomEvent.Connected, onConnected);
      queue.splice(0, queue.length);
    },
  };
}

export function installGlobalErrorHandlers(log: {
  error: (message: string, data?: Record<string, unknown>) => void;
}) {
  const onError = (e: ErrorEvent) => {
    log.error('window.error', {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  };
  const onUnhandledRejection = (e: PromiseRejectionEvent) => {
    log.error('unhandledrejection', {
      reason: e.reason instanceof Error ? safeError(e.reason) : String(e.reason ?? ''),
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}

export function installConsoleRelay(
  log: Pick<LiveKitClientLogger, 'debug' | 'info' | 'warn' | 'error'>
) {
  const orig = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const wrap = (level: LogLevel, fn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      try {
        fn(...args);
      } finally {
        const msg = args
          .map((a) => (typeof a === 'string' ? a : ''))
          .filter(Boolean)
          .join(' ');
        const data: Record<string, unknown> = {
          args: args.map((a) => {
            if (a instanceof Error) return safeError(a);
            if (typeof a === 'string')
              return a.length > 300 ? `${a.slice(0, 300)} …(truncated)` : a;
            if (a == null || typeof a === 'number' || typeof a === 'boolean') return a;
            if (Array.isArray(a)) return `[Array(${a.length})]`;
            if (typeof a === 'object') return '[Object]';
            return String(a);
          }),
        };

        if (level === 'debug') log.debug(msg || 'console.debug', data);
        else if (level === 'info') log.info(msg || 'console.info', data);
        else if (level === 'warn') log.warn(msg || 'console.warn', data);
        else log.error(msg || 'console.error', data);
      }
    };
  };

  console.debug = wrap('debug', orig.debug);
  console.info = wrap('info', orig.info);
  console.warn = wrap('warn', orig.warn);
  console.error = wrap('error', orig.error);

  return () => {
    console.debug = orig.debug;
    console.info = orig.info;
    console.warn = orig.warn;
    console.error = orig.error;
  };
}
