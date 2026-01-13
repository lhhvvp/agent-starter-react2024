import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

function secondsUntil(exp: number) {
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.max(0, exp - nowSec);
}

export async function POST(req: NextRequest) {
  try {
    if (!USER_MGMT_BASE_URL) {
      return jsonError(500, 'CONFIG_ERROR', 'USER_MGMT_BASE_URL not configured');
    }
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (!token) {
      return jsonError(400, 'INVALID_REQUEST', 'token required');
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`${USER_MGMT_BASE_URL}/api/v1/auth/magic-link/consume`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        console.error('[auth] consume upstream error', { code: 'UPSTREAM_UNAVAILABLE', base: USER_MGMT_BASE_URL, reason: e?.message });
      }
      return NextResponse.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'user management service unavailable' }, ...(AUTH_DEBUG ? { debug: { base: USER_MGMT_BASE_URL } } : {}) },
        { status: 502, headers },
      );
    }

    const headers = new Headers({ 'Cache-Control': 'no-store' });

    if (!upstreamRes.ok) {
      const status = upstreamRes.status;
      // Map some expected statuses
      let code = 'UPSTREAM_ERROR';
      if (status === 401 || status === 403) code = 'INVALID_TOKEN';
      if (status === 410) code = 'TOKEN_EXPIRED';
      if (status === 409) code = 'TOKEN_CONSUMED';
      let upstreamBody: any = null;
      try { upstreamBody = await upstreamRes.json(); } catch {}
      if (AUTH_DEBUG) {
        console.error('[auth] consume upstream non-OK', { status, code, up_code: upstreamBody?.error?.code });
      }
      return NextResponse.json(
        { error: { code, message: 'cannot consume token' }, ...(AUTH_DEBUG && upstreamBody?.error?.code ? { debug: { upstream_code: upstreamBody.error.code } } : {}) },
        { status, headers },
      );
    }

    let body: any = {};
    try {
      body = await upstreamRes.json();
    } catch {
      // ignore malformed body
    }

    const sessionId: string | undefined = body?.session_id ?? body?.sessionId ?? body?.session?.id;
    if (!sessionId) {
      // Upstream must return a session id
      return jsonError(500, 'UPSTREAM_ERROR', 'missing session id');
    }

    // Determine maxAge in seconds. Prefer explicit TTL fields if available.
    let maxAgeSec = 0;
    const ttlSec: number | undefined = body?.ttl ?? body?.expires_in ?? body?.session?.ttl;
    if (typeof ttlSec === 'number' && Number.isFinite(ttlSec)) {
      maxAgeSec = Math.max(0, Math.floor(ttlSec));
    }
    const expiresAtRaw: number | string | undefined = body?.session_expires_at ?? body?.expires_at ?? body?.session?.expires_at;
    if (!maxAgeSec && expiresAtRaw) {
      const expNum = typeof expiresAtRaw === 'string' ? Number(expiresAtRaw) : expiresAtRaw;
      if (Number.isFinite(expNum!)) {
        // auto-detect ms vs s
        const isMs = expNum! > 10_000_000_000; // roughly > year in seconds
        const expSec = isMs ? Math.floor(expNum! / 1000) : Math.floor(expNum!);
        maxAgeSec = secondsUntil(expSec);
      }
    }
    // Reasonable fallback for dev/MVP: 7 days
    if (!maxAgeSec) maxAgeSec = 7 * 24 * 60 * 60;

    const isProd = process.env.NODE_ENV === 'production';
    (await cookies()).set('session_id', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProd,
      maxAge: maxAgeSec,
    });

    const resp: Record<string, any> = { ok: true };
    if (expiresAtRaw) resp.session_expires_at = expiresAtRaw;
    return NextResponse.json(resp, { headers });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      console.error('[auth] consume unhandled', { message: err?.message });
    }
    return jsonError(500, 'UPSTREAM_ERROR', 'unexpected error');
  }
}
