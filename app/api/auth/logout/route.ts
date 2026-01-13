import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export async function POST(_req: NextRequest) {
  try {
    if (!USER_MGMT_BASE_URL) {
      return jsonError(500, 'CONFIG_ERROR', 'USER_MGMT_BASE_URL not configured');
    }

    const cookieJar = await cookies();
    const sessionId = cookieJar.get('session_id')?.value;
    const isProd = process.env.NODE_ENV === 'production';

    if (!sessionId) {
      // Clear cookie anyway
      cookieJar.set('session_id', '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProd,
        maxAge: 0,
      });
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'not logged in' } }, {
        status: 401,
        headers: new Headers({ 'Cache-Control': 'no-store' }),
      });
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`${USER_MGMT_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${sessionId}`,
          'accept': 'application/json',
        },
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        console.error('[auth] logout upstream error', { code: 'UPSTREAM_UNAVAILABLE', base: USER_MGMT_BASE_URL, reason: e?.message });
      }
      // Clear cookie anyway and report 502
      cookieJar.set('session_id', '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProd,
        maxAge: 0,
      });
      return NextResponse.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'user management service unavailable' }, ...(AUTH_DEBUG ? { debug: { base: USER_MGMT_BASE_URL } } : {}) },
        { status: 502, headers: new Headers({ 'Cache-Control': 'no-store' }) },
      );
    }

    // Clear cookie regardless of upstream result
    cookieJar.set('session_id', '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isProd,
      maxAge: 0,
    });

    if (!upstreamRes.ok) {
      let upstreamBody: any = null;
      try { upstreamBody = await upstreamRes.json(); } catch {}
      if (AUTH_DEBUG) {
        console.error('[auth] logout upstream non-OK', { status: upstreamRes.status, up_code: upstreamBody?.error?.code });
      }
      return NextResponse.json(
        { error: { code: 'UPSTREAM_ERROR', message: 'logout failed' }, ...(AUTH_DEBUG && upstreamBody?.error?.code ? { debug: { upstream_code: upstreamBody.error.code } } : {}) },
        { status: upstreamRes.status, headers: new Headers({ 'Cache-Control': 'no-store' }) },
      );
    }

    return NextResponse.json({ ok: true }, { headers: new Headers({ 'Cache-Control': 'no-store' }) });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      console.error('[auth] logout unhandled', { message: err?.message });
    }
    return jsonError(500, 'UPSTREAM_ERROR', 'unexpected error');
  }
}
