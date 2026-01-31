import { NextResponse } from 'next/server';

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;

function getBackendBaseUrl() {
  if (!USER_MGMT_BASE_URL) {
    throw new Error('USER_MGMT_BASE_URL is not defined (required for /api/conversations proxy)');
  }
  return USER_MGMT_BASE_URL.replace(/\/$/, '');
}

export async function POST(
  request: Request,
  context: { params: Promise<{ convId: string; msgId: string }> }
) {
  const { convId, msgId } = await context.params;

  if (!convId || !msgId) {
    return NextResponse.json({ error: 'convId and msgId are required' }, { status: 400 });
  }

  try {
    const base = getBackendBaseUrl();
    const url = `${base}/api/v1/conversations/${encodeURIComponent(
      convId
    )}/messages/${encodeURIComponent(msgId)}/feedback`;

    const auth = request.headers.get('authorization');
    const upstreamRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: await request.text(),
      cache: 'no-store',
    });

    const text = await upstreamRes.text().catch(() => '');
    if (!upstreamRes.ok) {
      return NextResponse.json(
        {
          error: 'Upstream feedback error',
          status: upstreamRes.status,
          body: text || undefined,
        },
        { status: upstreamRes.status }
      );
    }

    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/conversations] feedback proxy error', error);
    return NextResponse.json({ error: 'Internal feedback proxy error' }, { status: 500 });
  }
}

