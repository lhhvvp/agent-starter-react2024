<<<<<<< HEAD
import { headers } from 'next/headers';
import { App } from '@/components/app/app';
=======
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { App } from '@/components/app';
>>>>>>> origin/main
import { getAppConfig } from '@/lib/utils';

export default async function Page() {
  const hdrs = await headers();
  const cookieJar = await cookies();

  // 基于 cookie 在服务端做一次登录校验，未登录用户跳转到 /login
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
    if (!res.ok) {
      // 未登录或会话失效：跳转到登录页
      redirect('/login');
    }
  } catch {
    // 上游异常时也视为未登录，统一跳转至登录页
    redirect('/login');
  }

  const appConfig = await getAppConfig(hdrs);

  return <App appConfig={appConfig} mode="me" />;
}
