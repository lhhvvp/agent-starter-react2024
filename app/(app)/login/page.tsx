'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  EnvelopeSimpleIcon,
  FirstAidKitIcon,
  HeartbeatIcon,
  IdentificationCardIcon,
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

function FeatureItem({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheckIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border/60 bg-background/60 flex items-start gap-3 rounded-xl border p-3 backdrop-blur">
      <div className="border-primary/20 bg-primary/10 text-primary mt-0.5 inline-flex size-9 items-center justify-center rounded-full border">
        <Icon weight="bold" className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-foreground text-sm font-semibold">{title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs leading-5">{description}</div>
      </div>
    </div>
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

    if (!enabled) return;

    root.setAttribute('data-login-bg-debug', '1');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const blobs = Array.from(document.querySelectorAll<HTMLElement>('.login-bg-blob'));
    const blobsContainer = document.querySelector<HTMLElement>('.login-bg-blobs');
    const noise = document.querySelector<HTMLElement>('.login-bg-noise');

    // eslint-disable-next-line no-console
    console.info('[login-bg] debug enabled: /login?debugBg=1');
    // eslint-disable-next-line no-console
    console.groupCollapsed('[login-bg] computed styles');
    // eslint-disable-next-line no-console
    console.log('prefersReducedMotion', prefersReducedMotion);
    // eslint-disable-next-line no-console
    console.log('forceMotion', forceMotion);
    // eslint-disable-next-line no-console
    console.log('blobs.count', blobs.length);
    // eslint-disable-next-line no-console
    console.log('blobsContainer', blobsContainer ? getComputedStyle(blobsContainer).filter : null);
    // eslint-disable-next-line no-console
    console.log('noise', noise ? getComputedStyle(noise).mixBlendMode : null);
    blobs.forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // eslint-disable-next-line no-console
      console.log(`blob[${idx}]`, {
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        opacity: cs.opacity,
        backgroundImage: cs.backgroundImage,
        mixBlendMode: cs.mixBlendMode,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        animationPlayState: cs.animationPlayState,
        visibility: cs.visibility,
        display: cs.display,
        zIndex: cs.zIndex,
      });
    });
    // eslint-disable-next-line no-console
    console.groupEnd();

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

  return (
    <div className="relative isolate h-svh w-full overflow-auto">
      <div className="login-bg-root pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Animated background (Manus/ChatGPT-like subtle motion) */}
        <div className="login-bg-base" />
        <div className="login-bg-blobs">
          <div className="login-bg-blob login-bg-blob-1" />
          <div className="login-bg-blob login-bg-blob-2" />
          <div className="login-bg-blob login-bg-blob-3" />
        </div>
        <div className="login-bg-noise" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.82))] dark:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.0),rgba(0,0,0,0.68))]" />
      </div>

      {debugBg && (
        <div className="border-border/60 bg-background/80 text-foreground pointer-events-none fixed bottom-3 left-3 z-[9999] rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur">
          BG DEBUG ON
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-stretch gap-8 px-4 pt-24 pb-10 md:flex-row md:items-center md:gap-10 md:px-8 md:pt-28">
        {/* Left: brand / medical-insurance-themed panel */}
        <div className="hidden w-full max-w-md flex-col justify-center md:flex">
          <div className="border-primary/20 bg-primary/10 text-foreground inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-sm">
            <ShieldCheckIcon weight="fill" className="text-primary size-4" />
            官方服务 · 工作人员入口
          </div>

          <h1 className="text-foreground mt-5 text-4xl font-semibold tracking-tight">
            医保智能 AI 客服
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            通过工作邮箱获取一次性登录令牌，安全进入会话、票据与工作区。
          </p>

          <div className="mt-6 grid gap-3">
            <FeatureItem
              icon={IdentificationCardIcon}
              title="医保场景融合"
              description="面向医保咨询、票据与政策解读等常见场景优化交互。"
            />
            <FeatureItem
              icon={FirstAidKitIcon}
              title="便民与高效"
              description="支持语音与文字双通道，减少等待，提高处理效率。"
            />
            <FeatureItem
              icon={HeartbeatIcon}
              title="安全可控"
              description="一次性令牌登录，降低账号泄露风险。"
            />
          </div>

          <div className="mt-6">
            <span className="border-primary/20 bg-background/60 text-foreground inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold shadow-sm">
              {COPYRIGHT_TEXT}
            </span>
          </div>
        </div>

        {/* Right: login card */}
        <div className="w-full md:flex md:flex-1 md:justify-end">
          <div className="w-full max-w-md">
            <div className="border-border/60 bg-background/70 rounded-2xl border p-6 shadow-sm backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="border-primary/15 bg-primary/10 inline-flex size-10 items-center justify-center rounded-2xl border">
                      <img
                        src="/yulin-mhsa-mark.svg"
                        alt=""
                        className="block h-6 w-auto dark:hidden"
                      />
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

              {step === 'email' && (
                <div className="mt-6 space-y-4">
                  <label className="block" htmlFor="email">
                    <span className="text-muted-foreground block text-xs font-medium">
                      工作邮箱
                    </span>
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
              )}

              {step === 'token' && (
                <div className="mt-6 space-y-4">
                  <label className="block" htmlFor="token">
                    <span className="text-muted-foreground block text-xs font-medium">
                      一次性 Token
                    </span>
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
              )}

              {step === 'done' && (
                <div className="mt-6">
                  <Alert className="bg-primary/5 border-primary/15">
                    <ShieldCheckIcon weight="bold" />
                    <AlertTitle>登录成功</AlertTitle>
                    <AlertDescription>
                      <p>正在跳转…</p>
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <div className="border-border/60 mt-6 border-t pt-4 text-center">
                <div className="border-primary/20 bg-primary/10 text-foreground inline-flex items-center rounded-full border px-4 py-2 text-xs font-semibold shadow-sm">
                  {COPYRIGHT_TEXT}
                </div>
              </div>
            </div>

            <div className="text-muted-foreground mt-4 text-center text-xs md:hidden">
              <span className="inline-flex items-center gap-1">
                <ShieldCheckIcon weight="fill" className="text-primary size-4" />
                官方服务 · 便民咨询
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
