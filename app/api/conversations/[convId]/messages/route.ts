import { NextResponse } from 'next/server';

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;

function getBackendBaseUrl() {
  if (!USER_MGMT_BASE_URL) {
    throw new Error('USER_MGMT_BASE_URL is not defined (required for /api/conversations proxy)');
  }
  return USER_MGMT_BASE_URL.replace(/\/$/, '');
}

export async function GET(
  request: Request,
  context: { params: Promise<{ convId: string }> }
) {
  const { convId } = await context.params;

  if (!convId) {
    return NextResponse.json({ error: 'convId is required' }, { status: 400 });
  }

  try {
    const base = getBackendBaseUrl();
    const url = new URL(
      `${base}/api/v1/conversations/${encodeURIComponent(convId)}/messages`
    );

    // 透传查询参数（limit、view 等）
    const incomingUrl = new URL(request.url);
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      url.searchParams.set(key, value);
    }

    const upstreamRes = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization')! }
          : {}),
      },
      cache: 'no-store',
    });

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Upstream conversations messages error',
          status: upstreamRes.status,
          body: text || undefined,
        },
        { status: upstreamRes.status }
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/conversations] proxy error', error);
    return NextResponse.json(
      { error: 'Internal conversations proxy error' },
      { status: 500 }
    );
  }
}


