import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export async function GET() {
  try {
    if (!USER_MGMT_BASE_URL) {
      return jsonError(500, 'CONFIG_ERROR', 'USER_MGMT_BASE_URL not configured');
    }
    const cookieJar = await cookies();
    const sessionId = cookieJar.get('session_id')?.value;
    if (!sessionId) {
      return jsonError(401, 'UNAUTHORIZED', 'not logged in');
    }

    const headers = new Headers({ 'Cache-Control': 'no-store' });

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(`${USER_MGMT_BASE_URL}/api/v1/users/me`, {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${sessionId}`,
          'accept': 'application/json',
        },
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        console.error('[auth] session upstream error', { code: 'UPSTREAM_UNAVAILABLE', base: USER_MGMT_BASE_URL, reason: e?.message });
      }
      return NextResponse.json(
        { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'user management service unavailable' }, ...(AUTH_DEBUG ? { debug: { base: USER_MGMT_BASE_URL } } : {}) },
        { status: 502, headers },
      );
    }

    if (!upstreamRes.ok) {
      const status = upstreamRes.status;
      if (status === 401) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'not logged in' } },
          { status: 401, headers },
        );
      }
      let upstreamBody: any = null;
      try { upstreamBody = await upstreamRes.json(); } catch {}
      if (AUTH_DEBUG) {
        console.error('[auth] session upstream non-OK', { status, up_code: upstreamBody?.error?.code });
      }
      return NextResponse.json(
        { error: { code: 'UPSTREAM_ERROR', message: 'failed to fetch user' }, ...(AUTH_DEBUG && upstreamBody?.error?.code ? { debug: { upstream_code: upstreamBody.error.code } } : {}) },
        { status, headers },
      );
    }

    const data = await upstreamRes.json();
    // Expecting something like: { id/email/display_name/orgs, ... }
    // Wrap to stable shape per spec.
    const resp = {
      user: {
        id: data?.id ?? data?.user?.id ?? null,
        email: data?.email ?? data?.user?.email ?? null,
        display_name: data?.display_name ?? data?.name ?? data?.user?.display_name ?? null,
        orgs: data?.orgs ?? data?.organizations ?? data?.user?.orgs ?? [],
      },
      session: {
        expires_at: data?.session?.expires_at ?? data?.expires_at ?? null,
      },
    };

    return NextResponse.json(resp, { headers });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      console.error('[auth] session unhandled', { message: err?.message });
    }
    return jsonError(500, 'UPSTREAM_ERROR', 'unexpected error');
  }
}
