"use client";

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ConsumePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!token) {
        setError('缺少 token');
        return;
      }
      try {
        const res = await fetch('/api/auth/magic-link/consume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.error?.message || '消费失败';
          const code = data?.error?.code ? `[${data.error.code}] ` : '';
          const dbg = data?.debug?.upstream_code ? `（upstream_code: ${data.debug.upstream_code}）` : '';
          throw new Error(`${code}${msg}${dbg}`);
        }
        if (!aborted) {
          router.push('/');
          router.refresh();
        }
      } catch (e: any) {
        if (!aborted) setError(e?.message ?? '请求失败');
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [router, token]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        {!error ? (
          <>
            <div className="animate-pulse">正在消费魔法链接…</div>
          </>
        ) : (
          <>
            <p className="text-red-600">{error}</p>
            <a href="/login" className="underline">
              返回登录
            </a>
          </>
        )}
      </div>
    </div>
  );
}
