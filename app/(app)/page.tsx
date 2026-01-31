import { cookies, headers } from 'next/headers';
import { App } from '@/components/app';
import { getAppConfig } from '@/lib/utils';

export default async function Page() {
  const hdrs = await headers();
  const cookieJar = await cookies();

  // 基于 cookie 在服务端做一次登录校验：已登录进入「我的」模式；未登录进入「公众」免登录模式
  let sessionUser: { display_name?: string | null; email?: string | null } | null = null;
  try {
    const cookieHeader = cookieJar
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const proto = hdrs.get('x-forwarded-proto') ?? 'http';
    const host = hdrs.get('host') ?? 'localhost:3000';
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/api/auth/session`, {
      headers: cookieHeader ? { cookie: cookieHeader } : undefined,
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      sessionUser = {
        display_name: data?.user?.display_name ?? null,
        email: data?.user?.email ?? null,
      };
    }
  } catch {
    sessionUser = null;
  }

  const appConfig = await getAppConfig(hdrs);

  return <App appConfig={appConfig} mode={sessionUser ? 'me' : 'public'} sessionUser={sessionUser} />;
}
