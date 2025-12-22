import { headers, cookies } from 'next/headers';
import { getAppConfig } from '@/lib/utils';
import { LogoutButton } from '@/components/auth/logout-button';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const hdrs = await headers();
  const { companyName, logo, logoDark } = await getAppConfig(hdrs);

  // Fetch session on the server; ignore errors
  let sessionUser: { display_name?: string | null; email?: string | null } | null = null;
  try {
    const cookieHeader = (await cookies())
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
  } catch {}

  return (
    <>
      <header className="lka-header fixed top-0 left-0 z-50 hidden w-full items-center justify-between p-6 md:flex">
        <a
          target="_blank"
          rel="noopener noreferrer"
          href="https://livekit.io"
          className="scale-100 transition-transform duration-300 hover:scale-110"
        >
          <img src={logo} alt={`${companyName} Logo`} className="block size-6 dark:hidden" />
          <img
            src={logoDark ?? logo}
            alt={`${companyName} Logo`}
            className="hidden size-6 dark:block"
          />
        </a>
        <div className="flex items-center gap-4">
          <span className="text-foreground font-mono text-xs font-bold tracking-wider uppercase">
            Built with{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://docs.livekit.io/agents"
              className="underline underline-offset-4"
            >
              LiveKit Agents
            </a>
          </span>
          <div className="h-4 w-px bg-border" />
          {sessionUser ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {sessionUser.display_name || sessionUser.email || '已登录'}
              </span>
              <LogoutButton />
            </div>
          ) : (
            <a
              href="/login"
              className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
              title="登录"
            >
              登录
            </a>
          )}
        </div>
      </header>
      {children}
    </>
  );
}
