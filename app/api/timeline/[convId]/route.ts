import { NextResponse } from 'next/server';

// 复用用户管理 / 后端服务的 BASE_URL。可根据需要单独拆出 TIMELINE_BASE_URL。
const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;

function getTimelineBaseUrl() {
  if (!USER_MGMT_BASE_URL) {
    throw new Error('USER_MGMT_BASE_URL is not defined (required for /api/timeline proxy)');
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
    const base = getTimelineBaseUrl();
    const url = new URL(`${base}/api/v1/timeline/${encodeURIComponent(convId)}`);

    // 透传查询参数（after_ts, before_ts, kinds, limit 等）
    const incomingUrl = new URL(request.url);
    for (const [key, value] of incomingUrl.searchParams.entries()) {
      url.searchParams.set(key, value);
    }

    const upstreamRes = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!upstreamRes.ok) {
      const text = await upstreamRes.text().catch(() => '');
      return NextResponse.json(
        { error: 'Upstream timeline error', status: upstreamRes.status, body: text || undefined },
        { status: upstreamRes.status }
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/timeline] proxy error', error);
    return NextResponse.json(
      { error: 'Internal timeline proxy error' },
      { status: 500 }
    );
  }
}


