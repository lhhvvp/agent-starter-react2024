import { NextRequest, NextResponse } from 'next/server';
import { createMagicLink } from '@/lib/dev-mock-user-mgmt';

export const revalidate = 0;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: new Headers({ 'Cache-Control': 'no-store' }) });
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    if (!email || !validEmail(email)) {
      return jsonError(400, 'INVALID_EMAIL', 'invalid email');
    }
    const { token, ttlSec, expiresAt } = createMagicLink(email.toLowerCase());
    // For mock, directly return a demo token
    return NextResponse.json(
      { ok: true, token_demo_only: token, ttl: ttlSec, expires_at: expiresAt },
      { headers: new Headers({ 'Cache-Control': 'no-store' }) },
    );
  } catch (e) {
    return jsonError(500, 'UPSTREAM_ERROR', 'mock error');
  }
}

