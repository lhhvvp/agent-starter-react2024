import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;
const AUTH_DEBUG = process.env.AUTH_DEBUG === '1' || process.env.NODE_ENV !== 'production';

function logDebug(...args: unknown[]) {
  if (AUTH_DEBUG) {
    // eslint-disable-next-line no-console
    console.info('[conn-details]', ...args);
  }
}

function base64urlDecode(input: string) {
  try {
    // Support base64url payloads
    const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
    const normalized = pad(input.replace(/-/g, '+').replace(/_/g, '/'));
    const buf = Buffer.from(normalized, 'base64');
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function summarizeJwt(jwt: string) {
  const [h, p] = jwt.split('.');
  const headerRaw = base64urlDecode(h || '');
  const payloadRaw = base64urlDecode(p || '');
  let header: Record<string, unknown> | null = null;
  let payload: Record<string, unknown> | null = null;
  try {
    header = headerRaw ? (JSON.parse(headerRaw) as Record<string, unknown>) : null;
  } catch {}
  try {
    payload = payloadRaw ? (JSON.parse(payloadRaw) as Record<string, unknown>) : null;
  } catch {}
  const payloadKeys = payload ? Object.keys(payload) : [];
  const grants = (payload?.video ?? {}) as Record<string, unknown>;
  const grantSummary: Record<string, unknown> = {};
  if (typeof grants === 'object' && grants) {
    for (const k of ['roomJoin', 'canPublish', 'canPublishData', 'canSubscribe']) {
      if (k in grants) grantSummary[k] = Boolean((grants as any)[k]);
    }
    grantSummary.roomPresent = Boolean((grants as any)['room']);
  }
  const exp = typeof (payload as any)?.exp === 'number' ? (payload as any).exp : undefined;
  const nbf = typeof (payload as any)?.nbf === 'number' ? (payload as any).nbf : undefined;
  return {
    header,
    payloadKeys,
    grantSummary,
    hasSub: typeof (payload as any)?.sub === 'string',
    hasName: typeof (payload as any)?.name === 'string',
    hasIdentity: typeof (payload as any)?.identity === 'string',
    expISO: exp ? new Date(exp * 1000).toISOString() : undefined,
    nbfISO: nbf ? new Date(nbf * 1000).toISOString() : undefined,
  };
}

// don't cache the results
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
  // 与后端 TimelineEvent.conversation_id 对齐的会话 ID（可选，兼容旧实现）
  conv_id?: string;
  // 来自上游用户管理 / ticket 系统的 org_id（如果存在）
  org_id?: string;
};

export async function GET() {
  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;
    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken: participantToken,
      participantName,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

export async function POST(req: Request) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });

  if (!USER_MGMT_BASE_URL) {
    // Not configured: POST not available, keep GET for local fallback
    return NextResponse.json(
      { code: 'NOT_CONFIGURED', message: 'USER_MGMT_BASE_URL is not configured' },
      { status: 501, headers }
    );
  }

  try {
    const body = (await req.json()) as {
      ticket?: string;
      profile?: { display_name?: string };
    };

    if (!body?.ticket) {
      return NextResponse.json(
        { code: 'INVALID_REQUEST', message: 'ticket is required' },
        { status: 400, headers }
      );
    }

    logDebug('POST /api/connection-details (ticket flow)', {
      hasTicket: Boolean(body.ticket),
      profileKeys: body.profile ? Object.keys(body.profile) : [],
      userMgmtHost: USER_MGMT_BASE_URL,
    });

    const consumeUrl = `${USER_MGMT_BASE_URL.replace(/\/$/, '')}/api/v1/tickets/${encodeURIComponent(
      body.ticket
    )}/consume`;
    logDebug('Upstream consume URL', { consumeUrl });
    const upstreamRes = await fetch(consumeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: body.profile ?? undefined }),
      cache: 'no-store',
    });

    if (!upstreamRes.ok) {
      // Map upstream errors
      const status = upstreamRes.status;
      let code = 'UPSTREAM_ERROR';
      let message = 'Upstream error';
      if (status === 404) {
        code = 'TICKET_NOT_FOUND';
        message = 'Ticket is invalid';
      } else if (status === 410) {
        code = 'TICKET_EXPIRED';
        message = 'Ticket is expired';
      } else if (status === 409) {
        code = 'TICKET_CONSUMED';
        message = 'Ticket was already consumed';
      }

      // Try to surface upstream error text if available (best-effort)
      try {
        const data = await upstreamRes.json();
        if (data?.message && typeof data.message === 'string') {
          message = data.message;
        }
        logDebug('Upstream error', { status, code, upstreamMessage: data?.message });
      } catch {
        // ignore parse errors
      }

      return NextResponse.json({ code, message }, { status, headers });
    }

    const upstreamData = (await upstreamRes.json()) as {
      token: string;
      identity?: string;
      url: string;
      room: string;
      conv_id?: string;
      expires_at?: number;
      metadata?: Record<string, unknown>;
    };

    logDebug('Upstream raw data', upstreamData);

    try {
      const urlObj = new URL(upstreamData.url);
      const tokenSummary = summarizeJwt(upstreamData.token);
      logDebug('Upstream success summary', {
        url: { protocol: urlObj.protocol, host: urlObj.host },
        roomPresent: Boolean(upstreamData.room),
        identityPresent: Boolean(upstreamData.identity),
        metadataKeys: upstreamData.metadata ? Object.keys(upstreamData.metadata) : [],
        token: tokenSummary,
      });
    } catch (e) {
      logDebug('Upstream success summary (failed to parse)', String(e));
    }

    const participantName = body?.profile?.display_name || upstreamData.identity || 'guest';
    const data: ConnectionDetails = {
      serverUrl: upstreamData.url,
      roomName: upstreamData.room,
      participantToken: upstreamData.token,
      participantName,
      conv_id: upstreamData.conv_id,
      org_id: (upstreamData.metadata as any)?.org_id as string | undefined,
    };
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return NextResponse.json(
        { code: 'INTERNAL_ERROR', message: error.message },
        { status: 500, headers }
      );
    }
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Unknown error' },
      { status: 500, headers }
    );
  }
}

function createParticipantToken(userInfo: AccessTokenOptions, roomName: string) {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);
  return at.toJwt();
}
