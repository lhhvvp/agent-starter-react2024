import { NextRequest, NextResponse } from 'next/server';

// don't cache the results
export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const IS_DEV = process.env.NODE_ENV !== 'production';
// 在开发环境默认暴露 demo token，生产环境必须显式开启 EXPOSE_DEMO_TOKEN=1 才会透出
const EXPOSE_DEMO_TOKEN = process.env.EXPOSE_DEMO_TOKEN === '1' || IS_DEV;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || IS_DEV;

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

function validEmail(email: string) {
  // Simple RFC5322-like pattern for basic validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// extremely simple in-memory rate limiter for dev/MVP
const windowMs = 60_000; // 1 minute
const maxPerWindow = 10; // allow 10 requests per minute
const ipCounters = new Map<string, { count: number; resetAt: number }>();
const emailCounters = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, map: Map<string, { count: number; resetAt: number }>) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || now > rec.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (rec.count >= maxPerWindow) return false;
  rec.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!USER_MGMT_BASE_URL) {
      return jsonError(500, 'CONFIG_ERROR', 'USER_MGMT_BASE_URL not configured');
    }

    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email || !validEmail(email)) {
      return jsonError(400, 'INVALID_EMAIL', 'invalid email');
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (!checkRateLimit(ip, ipCounters) || !checkRateLimit(email.toLowerCase(), emailCounters)) {
      return jsonError(429, 'RATE_LIMITED', 'too many requests');
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`${USER_MGMT_BASE_URL}/api/v1/auth/magic-link`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email }),
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        console.error('[auth] magic-link upstream error', {
          code: 'UPSTREAM_UNAVAILABLE',
          base: USER_MGMT_BASE_URL,
          reason: e?.message,
        });
      }
      return NextResponse.json(
        {
          error: { code: 'UPSTREAM_UNAVAILABLE', message: 'user management service unavailable' },
          ...(AUTH_DEBUG ? { debug: { base: USER_MGMT_BASE_URL } } : {}),
        },
        { status: 502, headers: new Headers({ 'Cache-Control': 'no-store' }) },
      );
    }

    const headers = new Headers({ 'Cache-Control': 'no-store' });
    if (!upstreamRes.ok) {
      // Map upstream status to a generic error; do not log email
      const status = upstreamRes.status;
      let code = 'UPSTREAM_ERROR';
      if (status === 400) code = 'INVALID_EMAIL';
      if (status === 429) code = 'RATE_LIMITED';
      let upstreamBody: any = null;
      try { upstreamBody = await upstreamRes.json(); } catch {}
      if (AUTH_DEBUG) {
        console.error('[auth] magic-link upstream non-OK', {
          status,
          code,
          up_code: upstreamBody?.error?.code,
        });
      }
      return NextResponse.json(
        {
          error: { code, message: 'request failed' },
          ...(AUTH_DEBUG && upstreamBody?.error?.code ? { debug: { upstream_code: upstreamBody.error.code } } : {}),
        },
        { status, headers },
      );
    }

    let body: any = {};
    try {
      body = await upstreamRes.json();
    } catch {
      // ignore malformed body
    }

    const resp: Record<string, any> = { ok: true };
    if (EXPOSE_DEMO_TOKEN) {
      const token = body?.token ?? body?.token_demo_only ?? body?.demo?.token;
      if (token) resp.demo = { token };
    }

    return NextResponse.json(resp, { headers });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      console.error('[auth] magic-link unhandled', { message: err?.message });
    }
    return jsonError(500, 'UPSTREAM_ERROR', 'unexpected error');
  }
}
