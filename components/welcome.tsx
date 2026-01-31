'use client';

import { useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type WelcomeMode = 'ticket' | 'me' | 'public';

type WelcomeBranding = {
  companyName?: string;
  logo?: string;
  logoDark?: string;
};

interface WelcomeProps {
  disabled: boolean;
  startButtonText: string;
  mode?: WelcomeMode;
  branding?: WelcomeBranding;
  onStartCall?: (opts?: { ticket?: string; displayName?: string; prefillMessage?: string }) => void;
  /**
   * When true (default), ticket/public mode renders as a fullscreen overlay.
   * Set to false when the welcome screen is embedded in an app shell layout.
   */
  fullscreen?: boolean;
}

export const Welcome = ({
  disabled,
  startButtonText,
  mode = 'ticket',
  branding,
  onStartCall,
  fullscreen = true,
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & WelcomeProps) => {
  const [useTicket, setUseTicket] = useState(false);
  const [ticket, setTicket] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [prefillMessage, setPrefillMessage] = useState('');
  const [consent, setConsent] = useState(false);

  const suggestedIntents = [
    '报销需要哪些材料？',
    '异地就医备案怎么做？',
    '门诊慢特病怎么申请？',
    '医保电子凭证怎么用？',
    '参保缴费怎么查询？',
    '待遇政策有哪些变化？',
  ];

  const handleStart = () => {
    if (mode === 'public' && !consent) return;
    if (mode === 'ticket' && useTicket && ticket.trim()) {
      onStartCall?.({
        ticket: ticket.trim(),
        displayName: displayName.trim() || undefined,
        prefillMessage: prefillMessage.trim() || undefined,
      });
    } else {
      onStartCall?.({
        displayName: displayName.trim() || undefined,
        prefillMessage: prefillMessage.trim() || undefined,
      });
    }
  };

  const logo = branding?.logo;
  const logoDark = branding?.logoDark ?? branding?.logo;
  const companyName = branding?.companyName;

  return (
    <div
      ref={ref}
      inert={disabled}
      {...props}
      className={cn(
        mode === 'ticket' || mode === 'public'
          ? fullscreen
            ? 'fixed inset-0 z-10 mx-auto flex h-svh flex-col items-center justify-center text-center'
            : 'mx-auto flex h-full flex-col items-center justify-center px-4 text-center'
          : 'mx-auto flex h-full flex-col items-center justify-center px-4 pt-24 text-center md:pt-32',
        className
      )}
    >
      {(mode === 'ticket' || mode === 'public') && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.7),rgba(255,255,255,0))] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),rgba(255,255,255,0))]" />
          <div className="absolute -bottom-32 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(220,20,60,0.16),rgba(0,0,0,0))] dark:bg-[radial-gradient(circle_at_center,rgba(220,20,60,0.22),rgba(0,0,0,0))]" />
          <div className="absolute -bottom-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(0,76,255,0.12),rgba(0,0,0,0))] dark:bg-[radial-gradient(circle_at_center,rgba(0,76,255,0.18),rgba(0,0,0,0))]" />
        </div>
      )}

      {logo ? (
        <div className="relative mb-5 w-full max-w-2xl px-4">
          {(mode === 'ticket' || mode === 'public') && (
            <div className="pointer-events-none absolute -top-10 right-[-7rem] hidden w-[26rem] rotate-6 opacity-[0.06] md:block">
              <img src="/yulin-mhsa-mark.svg" alt="" className="block h-auto w-full dark:hidden" />
              <img
                src="/yulin-mhsa-mark-dark.svg"
                alt=""
                className="hidden h-auto w-full dark:block"
              />
            </div>
          )}

          <div className="rounded-2xl border border-border/60 bg-background/70 px-5 py-4 shadow-sm backdrop-blur">
            <img
              src={logo}
              alt={companyName ? `${companyName} Logo` : 'Logo'}
              className="mx-auto block h-auto w-full max-w-[560px] dark:hidden"
            />
            <img
              src={logoDark}
              alt={companyName ? `${companyName} Logo` : 'Logo'}
              className="mx-auto hidden h-auto w-full max-w-[560px] dark:block"
            />

            {(mode === 'ticket' || mode === 'public') && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1">
                  <ShieldCheck className="h-4 w-4 text-primary" weight="fill" />
                  官方服务
                </span>
                <span className="opacity-60">·</span>
                <span>便民咨询</span>
                <span className="opacity-60">·</span>
                <span>不替代线下窗口与正式结论</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-fg0 mb-4 size-16"
        >
          <path
            d="M15 24V40C15 40.7957 14.6839 41.5587 14.1213 42.1213C13.5587 42.6839 12.7956 43 12 43C11.2044 43 10.4413 42.6839 9.87868 42.1213C9.31607 41.5587 9 40.7957 9 40V24C9 23.2044 9.31607 22.4413 9.87868 21.8787C10.4413 21.3161 11.2044 21 12 21C12.7956 21 13.5587 21.3161 14.1213 21.8787C14.6839 22.4413 15 23.2044 15 24ZM22 5C21.2044 5 20.4413 5.31607 19.8787 5.87868C19.3161 6.44129 19 7.20435 19 8V56C19 56.7957 19.3161 57.5587 19.8787 58.1213C20.4413 58.6839 21.2044 59 22 59C22.7956 59 23.5587 58.6839 24.1213 58.1213C24.6839 57.5587 25 56.7957 25 56V8C25 7.20435 24.6839 6.44129 24.1213 5.87868C23.5587 5.31607 22.7956 5 22 5ZM32 13C31.2044 13 30.4413 13.3161 29.8787 13.8787C29.3161 14.4413 29 15.2044 29 16V48C29 48.7957 29.3161 49.5587 29.8787 50.1213C30.4413 50.6839 31.2044 51 32 51C32.7956 51 33.5587 50.6839 34.1213 50.1213C34.6839 49.5587 35 48.7957 35 48V16C35 15.2044 34.6839 14.4413 34.1213 13.8787C33.5587 13.3161 32.7956 13 32 13ZM42 21C41.2043 21 40.4413 21.3161 39.8787 21.8787C39.3161 22.4413 39 23.2044 39 24V40C39 40.7957 39.3161 41.5587 39.8787 42.1213C40.4413 42.6839 41.2043 43 42 43C42.7957 43 43.5587 42.6839 44.1213 42.1213C44.6839 41.5587 45 40.7957 45 40V24C45 23.2044 44.6839 22.4413 44.1213 21.8787C43.5587 21.3161 42.7957 21 42 21ZM52 17C51.2043 17 50.4413 17.3161 49.8787 17.8787C49.3161 18.4413 49 19.2044 49 20V44C49 44.7957 49.3161 45.5587 49.8787 46.1213C50.4413 46.6839 51.2043 47 52 47C52.7957 47 53.5587 46.6839 54.1213 46.1213C54.6839 45.5587 55 44.7957 55 44V20C55 19.2044 54.6839 18.4413 54.1213 17.8787C53.5587 17.3161 52.7957 17 52 17Z"
            fill="currentColor"
          />
        </svg>
      )}

      <div className={cn('max-w-2xl px-4', mode === 'ticket' || mode === 'public' ? '' : 'px-0')}>
        <h1 className="text-fg0 text-3xl font-semibold tracking-tight md:text-4xl">
          医保智能 AI 客服
        </h1>
        <p className="text-fg2 mt-2 text-sm leading-6 md:text-base">
          {mode === 'me' ? '登录后可查看历史会话与工作区。' : '免登录 · 7×24 小时 · 支持语音与文字'}
        </p>
        {companyName && (
          <p className="text-fg3 mt-1 text-xs md:text-sm">
            {companyName}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-foreground shadow-sm md:text-sm">
            陕西中融辰知科技有限公司 版权所有
          </span>
        </div>
      </div>

      {(mode === 'public' || mode === 'ticket') && (
        <div className="mt-5 w-full max-w-lg text-left">
          <div className="grid gap-3 rounded-xl border border-border/60 bg-background/70 p-4 backdrop-blur">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">称呼（可选）</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                placeholder="如：张先生（请勿输入身份证/手机号等敏感信息）"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            {mode === 'public' && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">你可以从下面直接开始：</div>
                <div className="flex flex-wrap gap-2">
                  {suggestedIntents.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPrefillMessage(t)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs transition-colors',
                        prefillMessage === t
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Optional ticket entry（仅在 ticket 模式下展示） */}
            {mode === 'ticket' && (
              <div className="pt-1">
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  onClick={() => setUseTicket((v) => !v)}
                >
                  我有票据（可选）
                </button>
                {useTicket && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Ticket</label>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                        placeholder="tkt_..."
                        value={ticket}
                        onChange={(e) => setTicket(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'public' && (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  我已阅读并同意{' '}
                  <a className="text-foreground underline underline-offset-4" href="/privacy">
                    《隐私声明》
                  </a>{' '}
                  与{' '}
                  <a className="text-foreground underline underline-offset-4" href="/terms">
                    《服务条款》
                  </a>
                  。紧急情况请拨打 120/110。
                </span>
              </label>
            )}
          </div>
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        onClick={handleStart}
        className="mt-6 w-64 font-mono"
        disabled={disabled || (mode === 'public' && !consent)}
      >
        {startButtonText}
      </Button>

      {mode !== 'me' && (
        <div className="mt-4 flex items-center justify-center text-xs text-muted-foreground">
          <a className="underline underline-offset-4" href="/login">
            工作人员登录
          </a>
        </div>
      )}
    </div>
  );
};
