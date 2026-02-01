'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  EnvelopeSimpleIcon,
  InfoIcon,
  KeyIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import { Alert, AlertDescription, AlertTitle } from '@/components/livekit/alert';
import { Button } from '@/components/livekit/button';
import { cn } from '@/lib/utils';

const COPYRIGHT_TEXT = '陕西中融辰知科技有限公司 版权所有';

function StepPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        active
          ? 'border-primary/25 bg-primary/10 text-foreground'
          : 'border-border/60 bg-background/60 text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState<'email' | 'token' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [debugBg, setDebugBg] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const enabled = params.has('debugBg');
    setDebugBg(enabled);
    const forceMotion = params.has('forceMotion');

    const root = document.documentElement;
    if (forceMotion) root.setAttribute('data-force-motion', '1');
    else root.removeAttribute('data-force-motion');

    if (enabled) {
      root.setAttribute('data-login-bg-debug', '1');

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const beams = Array.from(document.querySelectorAll<HTMLElement>('.aurora-beam'));
      const beamsContainer = document.querySelector<HTMLElement>('.aurora-bg-beams');
      const base = document.querySelector<HTMLElement>('.aurora-bg-base');
      const noise = document.querySelector<HTMLElement>('.aurora-bg-noise');

      // eslint-disable-next-line no-console
      console.info('[login-bg] debug enabled: /login?debugBg=1');
      // eslint-disable-next-line no-console
      console.groupCollapsed('[login-bg] computed styles');
      // eslint-disable-next-line no-console
      console.log('prefersReducedMotion', prefersReducedMotion);
      // eslint-disable-next-line no-console
      console.log('forceMotion', forceMotion);
      // eslint-disable-next-line no-console
      console.log('beams.count', beams.length);
      // eslint-disable-next-line no-console
      console.log('base', base ? getComputedStyle(base).backgroundImage : null);
      // eslint-disable-next-line no-console
      console.log('beamsContainer', beamsContainer ? getComputedStyle(beamsContainer).transform : null);
      // eslint-disable-next-line no-console
      console.log('noise', noise ? getComputedStyle(noise).mixBlendMode : null);

      beams.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        // eslint-disable-next-line no-console
        console.log(`beam[${idx}]`, {
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          opacity: cs.opacity,
          backgroundImage: cs.backgroundImage,
          filter: cs.filter,
          mixBlendMode: cs.mixBlendMode,
          animationName: cs.animationName,
          animationDuration: cs.animationDuration,
          animationDelay: cs.animationDelay,
          animationTimingFunction: cs.animationTimingFunction,
          animationDirection: cs.animationDirection,
          animationPlayState: cs.animationPlayState,
          visibility: cs.visibility,
          display: cs.display,
          zIndex: cs.zIndex,
        });
      });
      // eslint-disable-next-line no-console
      console.groupEnd();
    } else {
      root.removeAttribute('data-login-bg-debug');
    }

    return () => {
      root.removeAttribute('data-login-bg-debug');
      root.removeAttribute('data-force-motion');
    };
  }, []);

  const submitEmail = useCallback(async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || 'failed to send magic link';
        const code = data?.error?.code ? `[${data.error.code}] ` : '';
        const dbg = data?.debug?.base ? `（upstream: ${data.debug.base}）` : '';
        throw new Error(`${code}${msg}${dbg}`);
      }
      setInfo('已发送邮件（若在开发模式，您可直接使用一次性 token）。');
      if (data?.demo?.token) {
        setToken(data.demo.token);
      }
      setStep('token');
    } catch (e: any) {
      setError(e?.message ?? '请求失败');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const consumeToken = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/magic-link/consume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || '登录失败';
        const code = data?.error?.code ? `[${data.error.code}] ` : '';
        const dbg = data?.debug?.upstream_code
          ? `（upstream_code: ${data.debug.upstream_code}）`
          : '';
        throw new Error(`${code}${msg}${dbg}`);
      }
      setStep('done');
      // redirect to main page
      router.push('/');
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? '请求失败');
    } finally {
      setLoading(false);
    }
  }, [router, token]);

  const stepContent =
    step === 'email' ? (
      <div className="mt-6 space-y-4">
        <label className="block" htmlFor="email">
          <span className="text-muted-foreground block text-xs font-medium">工作邮箱</span>
          <div className="border-border/60 bg-background/80 focus-within:border-primary/25 focus-within:ring-primary/10 mt-1 flex items-center gap-2 rounded-md border px-3 py-2 transition-shadow focus-within:ring-4">
            <EnvelopeSimpleIcon className="text-muted-foreground size-4" weight="bold" />
            <input
              id="email"
              type="email"
              className="placeholder:text-muted-foreground/70 w-full bg-transparent text-sm outline-none"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading && email) void submitEmail();
              }}
            />
          </div>
        </label>

        <Button
          variant="primary"
          size="lg"
          onClick={submitEmail}
          disabled={loading || !email}
          className="w-full"
        >
          {loading ? '发送中…' : '发送登录令牌'}
        </Button>

        <div className="text-muted-foreground text-xs leading-5">
          将向该邮箱发送一次性登录链接；开发模式可能直接展示 Token 便于调试。
        </div>

        {info && (
          <Alert className="bg-primary/5 border-primary/15">
            <InfoIcon weight="bold" />
            <AlertTitle>已发送</AlertTitle>
            <AlertDescription>
              <p>{info}</p>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert className="bg-destructive/10 border-destructive/20 text-foreground">
            <WarningCircleIcon weight="bold" />
            <AlertTitle>请求失败</AlertTitle>
            <AlertDescription>
              <p className="text-foreground">{error}</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    ) : step === 'token' ? (
      <div className="mt-6 space-y-4">
        <label className="block" htmlFor="token">
          <span className="text-muted-foreground block text-xs font-medium">一次性 Token</span>
          <div className="border-border/60 bg-background/80 focus-within:border-primary/25 focus-within:ring-primary/10 mt-1 flex items-center gap-2 rounded-md border px-3 py-2 transition-shadow focus-within:ring-4">
            <KeyIcon className="text-muted-foreground size-4" weight="bold" />
            <input
              id="token"
              type="text"
              className="placeholder:text-muted-foreground/70 w-full bg-transparent text-sm outline-none"
              placeholder="tkn_...（从邮件或开发输出获取）"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading && token) void consumeToken();
              }}
            />
          </div>
        </label>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={consumeToken}
            disabled={loading || !token}
            className="flex-1"
          >
            {loading ? '登录中…' : '登录'}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setStep('email')}
            disabled={loading}
            className="shrink-0"
          >
            返回
          </Button>
        </div>

        {error && (
          <Alert className="bg-destructive/10 border-destructive/20 text-foreground">
            <WarningCircleIcon weight="bold" />
            <AlertTitle>登录失败</AlertTitle>
            <AlertDescription>
              <p className="text-foreground">{error}</p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    ) : (
      <div className="mt-6">
        <Alert className="bg-primary/5 border-primary/15">
          <ShieldCheckIcon weight="bold" />
          <AlertTitle>登录成功</AlertTitle>
          <AlertDescription>
            <p>正在跳转…</p>
          </AlertDescription>
        </Alert>
      </div>
    );

  return (
    <div className="relative isolate min-h-svh w-full overflow-auto">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Aurora curtain background (CSS-only) */}
        <div className="aurora-bg-base" />
        <div className="aurora-bg-beams">
          <div className="aurora-beam aurora-beam-1" />
          <div className="aurora-beam aurora-beam-2" />
          <div className="aurora-beam aurora-beam-3" />
        </div>
        <div className="aurora-bg-noise" />
        <div className="aurora-bg-vignette" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.92))] dark:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.0),rgba(0,0,0,0.72))]" />
      </div>

      {debugBg && (
        <div className="border-border/60 bg-background/80 text-foreground pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
          BG DEBUG ON
        </div>
      )}

      <main className="relative z-10 mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12 md:px-6">
        <div className="border-border/60 bg-background/70 rounded-2xl border p-6 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="border-primary/15 bg-primary/10 inline-flex size-10 items-center justify-center rounded-2xl border">
                  <img src="/yulin-mhsa-mark.svg" alt="" className="block h-6 w-auto dark:hidden" />
                  <img
                    src="/yulin-mhsa-mark-dark.svg"
                    alt=""
                    className="hidden h-6 w-auto dark:block"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-foreground truncate text-xl font-semibold tracking-tight">
                    工作人员登录
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-xs leading-5">
                    使用邮箱获取一次性登录令牌
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <StepPill active={step === 'email'}>1 邮箱</StepPill>
                <div className="bg-border/60 h-px flex-1" />
                <StepPill active={step === 'token' || step === 'done'}>2 Token</StepPill>
              </div>
            </div>

            <a
              href="/"
              className="text-muted-foreground hover:text-foreground border-border/60 bg-background/60 inline-flex items-center gap-1 rounded-full border px-3 py-2 text-xs font-semibold transition-colors"
            >
              <ArrowLeftIcon weight="bold" className="size-4" />
              返回
            </a>
          </div>

          {stepContent}
        </div>

        <div className="text-muted-foreground mt-5 text-center text-xs">{COPYRIGHT_TEXT}</div>
      </main>
    </div>
  );
}
