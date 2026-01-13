"use client";

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState<'email' | 'token' | 'done'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
        const dbg = data?.debug?.upstream_code ? `（upstream_code: ${data.debug.upstream_code}）` : '';
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
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">登录</h1>

        {step === 'email' && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">邮箱</span>
              <input
                type="email"
                className="w-full rounded-md border bg-background px-3 py-2"
                placeholder="alice@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              onClick={submitEmail}
              disabled={loading || !email}
              className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
            >
              {loading ? '发送中…' : '发送魔法链接'}
            </button>
            {info && <p className="text-sm text-muted-foreground">{info}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {step === 'token' && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">一次性 Token</span>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-2"
                placeholder="tkn_...（从邮件或开发输出获取）"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={consumeToken}
                disabled={loading || !token}
                className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
              >
                {loading ? '登录中…' : '消费 Token 并登录'}
              </button>
              <button
                onClick={() => setStep('email')}
                className="inline-flex items-center rounded-md border px-4 py-2"
              >
                返回
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-2">
            <p>登录成功，正在跳转…</p>
          </div>
        )}
      </div>
    </div>
  );
}
