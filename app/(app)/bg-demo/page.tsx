'use client';

import { useEffect, useMemo, useState } from 'react';

export default function BgDemoPage() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);
  const [forceMotion, setForceMotion] = useState(false);
  const [autoForced, setAutoForced] = useState(false);

  const initialForce = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('forceMotion');
  }, []);

  useEffect(() => {
    setForceMotion(initialForce);
  }, [initialForce]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mql.matches);
    update();
    mql.addEventListener?.('change', update);
    return () => mql.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    // If the OS/browser requests reduced motion, auto-enable "Force motion" once
    // so the demo still shows an obvious effect.
    if (prefersReducedMotion !== true) return;
    if (forceMotion) return;
    if (autoForced) return;
    setAutoForced(true);
    setForceMotion(true);
  }, [autoForced, forceMotion, prefersReducedMotion]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (forceMotion) root.setAttribute('data-force-motion', '1');
    else root.removeAttribute('data-force-motion');
    return () => root.removeAttribute('data-force-motion');
  }, [forceMotion]);

  return (
    <div className="relative isolate h-svh w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden login-bg-root">
        <div className="login-bg-base" />
        <div className="login-bg-blobs">
          <div className="login-bg-blob login-bg-blob-1" />
          <div className="login-bg-blob login-bg-blob-2" />
          <div className="login-bg-blob login-bg-blob-3" />
        </div>
        <div className="login-bg-noise" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.0),rgba(255,255,255,0.82))] dark:bg-[linear-gradient(to_bottom,rgba(0,0,0,0.0),rgba(0,0,0,0.68))]" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-2xl flex-col justify-center gap-4 px-6">
        <div className="rounded-2xl border border-border/60 bg-background/75 p-5 shadow-sm backdrop-blur">
          <div className="text-lg font-semibold">Background Demo</div>
          <div className="text-muted-foreground mt-1 text-sm">
            当前浏览器 prefers-reduced-motion：{prefersReducedMotion === null ? '…' : String(prefersReducedMotion)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setForceMotion(false)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 bg-background/60 px-4 text-sm font-semibold hover:bg-muted"
            >
              Respect motion setting
            </button>
            <button
              type="button"
              onClick={() => setForceMotion(true)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 bg-background/60 px-4 text-sm font-semibold hover:bg-muted"
            >
              Force motion
            </button>
          </div>
          <div className="text-muted-foreground mt-3 text-xs leading-5">
            如果你的系统开启了“减少动态效果”，动画会被暂停；点 “Force motion” 可强制预览。
          </div>
        </div>
      </div>
    </div>
  );
}
