import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicToken } from '@/lib/dev-mock-user-mgmt';

export const revalidate = 0;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: new Headers({ 'Cache-Control': 'no-store' }) });
}

export async function POST(req: NextRequest) {
  try {
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (!token) return jsonError(400, 'INVALID_REQUEST', 'token required');
    const res = consumeMagicToken(token);
    if (!res.ok) {
      return jsonError(res.status, res.code, 'cannot consume token');
    }
    return NextResponse.json(
      { ok: true, session_id: res.sessionId, ttl: res.ttlSec, session_expires_at: res.expiresAt },
      { headers: new Headers({ 'Cache-Control': 'no-store' }) },
    );
  } catch (e) {
    return jsonError(500, 'UPSTREAM_ERROR', 'mock error');
  }
}

