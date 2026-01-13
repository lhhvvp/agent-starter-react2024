import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const revalidate = 0;

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function jsonError(status: number, code: string, message: string) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

type UpstreamConversation = {
  id: string;
  org_id: string;
  room_id: string;
  project_id: string | null;
  title: string | null;
  summary: string | null;
  visibility: string;
  is_archived: boolean;
  created_at: string;
  last_message_at: string | null;
  participant_count: number;
  last_message_preview: string | null;
};

type UpstreamRtc = {
  token: string;
  identity: string;
  url: string;
  room: string;
  expires_at: number;
  metadata?: {
    org_id?: string;
    room_role?: string;
    // 允许未来扩展其它字段
    [key: string]: unknown;
  };
  room_id: string;
  conv_id: string;
};

export async function POST(req: Request) {
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
    const upstreamUrl = `${base}/api/v1/me/conversations`;

    let body: unknown = undefined;
    try {
      body = await req.json();
    } catch {
      // body 为空时允许直接使用 {}
      body = undefined;
    }

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sessionId}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: body ? JSON.stringify(body) : '{}',
        cache: 'no-store',
      });
    } catch (e: any) {
      if (AUTH_DEBUG) {
        // eslint-disable-next-line no-console
        console.error('[me/conversations] upstream error', {
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
        console.error('[me/conversations] upstream non-OK', {
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
            message: messageFromUpstream || 'failed to create conversation',
          },
          ...(AUTH_DEBUG && upstreamBody?.error?.code
            ? { debug: { upstream_code: upstreamBody.error.code } }
            : {}),
        },
        { status, headers }
      );
    }

    const upstreamData = (await upstreamRes.json()) as {
      conversation: UpstreamConversation;
      rtc: UpstreamRtc;
    };

    const conv = upstreamData.conversation;
    const rtc = upstreamData.rtc;
    const meta = (rtc.metadata ?? {}) as Record<string, unknown>;

    const orgId = (meta.org_id as string | undefined) ?? conv.org_id;
    const roomRole = (meta.room_role as string | undefined) ?? 'member';

    const responseBody = {
      conversation: {
        id: conv.id,
        orgId: conv.org_id,
        roomId: conv.room_id,
        projectId: conv.project_id,
        title: conv.title,
        summary: conv.summary,
        visibility: conv.visibility,
        isArchived: Boolean(conv.is_archived),
        createdAt: conv.created_at,
        lastMessageAt: conv.last_message_at,
        participantCount: conv.participant_count,
        lastMessagePreview: conv.last_message_preview,
      },
      connection: {
        serverUrl: rtc.url,
        roomName: rtc.room,
        participantToken: rtc.token,
        // participantName 交由前端根据用户 profile / 会话上下文决定，这里先返回 null
        participantName: null as string | null,
        participantIdentity: rtc.identity,
        roomId: rtc.room_id,
        convId: rtc.conv_id,
        orgId,
        metadata: {
          orgId,
          roomRole,
          ...meta,
        },
      },
    };

    return NextResponse.json(responseBody, { status: 200, headers });
  } catch (err: any) {
    if (AUTH_DEBUG) {
      // eslint-disable-next-line no-console
      console.error('[me/conversations] unhandled', { message: err?.message });
    }
    return jsonError(500, 'INTERNAL_ERROR', 'unexpected error');
  }
}


