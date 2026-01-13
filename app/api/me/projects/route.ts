import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

type MeProjectSummary = {
  id: number;
  name: string;
  status: 'planning' | 'active' | 'done' | 'archived';
  brief_artifact_id: number | null;
  org_id: string | null;
  room_id: string | null;
  conversation_id: string | null;
  created_at: string;
  last_active_at: string;
};

export async function GET(req: Request) {
  try {
    if (!USER_MGMT_BASE_URL) {
      return jsonError(500, 'CONFIG_ERROR', 'USER_MGMT_BASE_URL not configured');
    }

    const cookieJar = await cookies();
    const sessionId = cookieJar.get('session_id')?.value;
    if (!sessionId) {
      return jsonError(401, 'UNAUTHORIZED', 'not logged in');
    }

    const base = USER_MGMT_BASE_URL.replace(/\/$/, '');
    const incomingUrl = new URL(req.url);
    const upstreamUrl = new URL(`${base}/api/v1/me/projects`);

    // 透传 org_id、limit 等查询参数
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      upstreamUrl.searchParams.set(key, value);
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl.toString(), {
        method: 'GET',
        headers: {
          authorization: `Bearer ${sessionId}`,
          accept: 'application/json',
        },
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[me/projects] upstream error', {
          code: 'UPSTREAM_UNAVAILABLE',
          base: USER_MGMT_BASE_URL,
          reason: e?.message,
        });
      }
      return NextResponse.json(
        {
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: 'user management service unavailable',
          },
          ...(AUTH_DEBUG ? { debug: { base: USER_MGMT_BASE_URL } } : {}),
        },
        { status: 502, headers: new Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const headers = new Headers({ 'Cache-Control': 'no-store' });

    if (!upstreamRes.ok) {
      const status = upstreamRes.status;
      let upstreamBody: any = null;
      try {
        upstreamBody = await upstreamRes.json();
      } catch {
        // ignore
      }

      if (AUTH_DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[me/projects] upstream non-OK', {
          status,
          upstream_body: upstreamBody,
        });
      }

      if (status === 401) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'not logged in' } },
          { status: 401, headers }
        );
      }

      const messageFromUpstream =
        upstreamBody?.error?.message ||
        upstreamBody?.message ||
        (typeof upstreamBody === 'string' ? upstreamBody : null);

      return NextResponse.json(
        {
          error: {
            code: 'UPSTREAM_ERROR',
            message: messageFromUpstream || 'failed to load projects',
          },
        },
        { status, headers }
      );
    }

    const upstreamData = (await upstreamRes.json()) as MeProjectSummary[];
    return NextResponse.json(upstreamData, { status: 200, headers });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      // eslint-disable-next-line no-console
      console.error('[me/projects] unhandled', { message: err?.message });
    }
    return jsonError(500, 'INTERNAL_ERROR', 'unexpected error');
  }
}


