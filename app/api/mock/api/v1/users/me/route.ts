import { NextRequest, NextResponse } from 'next/server';
import { sessionFromAuthz, userInfoForSession } from '@/lib/dev-mock-user-mgmt';

export const revalidate = 0;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: new Headers({ 'Cache-Control': 'no-store' }) });
}

export async function GET(req: NextRequest) {
  const authz = req.headers.get('authorization');
  const sess = sessionFromAuthz(authz);
  if (!sess) return jsonError(401, 'UNAUTHORIZED', 'not logged in');
  const info = userInfoForSession(sess.sessionId);
  if (!info) return jsonError(401, 'UNAUTHORIZED', 'not logged in');
  return NextResponse.json(info, { headers: new Headers({ 'Cache-Control': 'no-store' }) });
}

