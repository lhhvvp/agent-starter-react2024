// Development-only in-memory mock for user management service.
// Stores tokens and sessions in module scope for the lifetime of the server process.

type TokenRecord = {
  email: string;
  createdAt: number; // ms
  expiresAt: number; // ms
  used: boolean;
};

type SessionRecord = {
  email: string;
  createdAt: number; // ms
  expiresAt: number; // ms
};

const tokens = new Map<string, TokenRecord>();
const sessions = new Map<string, SessionRecord>();

function randId(prefix: string) {
  const rnd = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

function now() {
  return Date.now();
}

export function createMagicLink(email: string) {
  const token = randId('tkn');
  const ttlMs = 10 * 60 * 1000; // 10 minutes
  const rec: TokenRecord = { email, createdAt: now(), expiresAt: now() + ttlMs, used: false };
  tokens.set(token, rec);
  return { token, ttlSec: Math.floor(ttlMs / 1000), expiresAt: rec.expiresAt };
}

export function consumeMagicToken(token: string) {
  const rec = tokens.get(token);
  if (!rec) {
    return { ok: false as const, status: 401, code: 'INVALID_TOKEN' };
  }
  if (rec.used) {
    return { ok: false as const, status: 409, code: 'TOKEN_CONSUMED' };
  }
  if (now() > rec.expiresAt) {
    return { ok: false as const, status: 410, code: 'TOKEN_EXPIRED' };
  }
  rec.used = true;
  const sessionId = randId('sess');
  const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  const srec: SessionRecord = { email: rec.email, createdAt: now(), expiresAt: now() + ttlMs };
  sessions.set(sessionId, srec);
  return { ok: true as const, sessionId, ttlSec: Math.floor(ttlMs / 1000), expiresAt: srec.expiresAt };
}

export function sessionFromAuthz(authz?: string | null) {
  if (!authz) return null;
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sessionId = m[1];
  const srec = sessions.get(sessionId);
  if (!srec) return null;
  if (now() > srec.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return { sessionId, ...srec };
}

export function logoutSession(sessionId: string) {
  sessions.delete(sessionId);
  return { ok: true };
}

export function userInfoForSession(sessionId: string) {
  const srec = sessions.get(sessionId);
  if (!srec) return null;
  if (now() > srec.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  const email = srec.email;
  // simple display name from email
  const displayName = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return {
    user: {
      id: randId('usr'),
      email,
      display_name: displayName,
      orgs: [
        { id: 'org_1', name: 'Acme', role: 'member' },
      ],
    },
    session: { expires_at: srec.expiresAt },
  };
}

