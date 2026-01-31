'use client';

import * as React from 'react';
import type { MessageFormatter, ReceivedChatMessage } from '@livekit/components-react';
import {
  ArrowClockwiseIcon,
  CopyIcon,
  DownloadSimpleIcon,
  DotsThreeVerticalIcon,
  ShareIcon,
  SpeakerHighIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from '@phosphor-icons/react/dist/ssr';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { makeEventId, useReliableUIEventSender } from '@/hooks/useReliableUIEventSender';
import { useChatMessage } from './hooks/utils';

export interface ChatEntryProps extends React.HTMLAttributes<HTMLLIElement> {
  /** The chat massage object to display. */
  entry: ReceivedChatMessage;
  /** Hide sender name. Useful when displaying multiple consecutive chat messages from the same person. */
  hideName?: boolean;
  /** Hide message timestamp. */
  hideTimestamp?: boolean;
  /** An optional formatter for the message body. */
  messageFormatter?: MessageFormatter;
  /** Optional interaction aggregates + my state (from include_interactions=true). */
  interactions?: {
    reactions: { up: number; down: number };
    feedbackCount: number;
    myReaction: 'up' | 'down' | 'none';
  };
  conversationId?: string;
  llmCallId?: string;
  traceId?: string;
  onSetReaction?: (value: 'up' | 'down' | 'none') => Promise<void>;
  onCreateFeedback?: (reasonCode: string, text?: string) => Promise<void>;
}

export const ChatEntry = ({
  entry,
  messageFormatter,
  hideName,
  hideTimestamp,
  interactions,
  conversationId,
  llmCallId,
  traceId,
  onSetReaction,
  onCreateFeedback,
  className,
  ...props
}: ChatEntryProps) => {
  const { message, hasBeenEdited, time, locale, name } = useChatMessage(entry, messageFormatter);
  const { sendMessageInteractionEvent } = useReliableUIEventSender();

  const isUser = entry.from?.isLocal ?? false;
  const messageOrigin = isUser ? 'remote' : 'local';
  const anchorId = props.id ?? `msg-${entry.id}`;

  const [downReason, setDownReason] = React.useState<string | null>(null);
  const [downReasonOpen, setDownReasonOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [reactionPending, setReactionPending] = React.useState(false);
  const [readAloudPending, setReadAloudPending] = React.useState(false);

  const popoverRootRef = React.useRef<HTMLDivElement | null>(null);
  const readAloudStartedAtRef = React.useRef<number | null>(null);

  const links = React.useMemo(() => extractUrls(entry.message), [entry.message]);
  const codeBlocks = React.useMemo(
    () => extractFencedCodeBlocks(entry.message),
    [entry.message]
  );

  React.useEffect(() => {
    if (!menuOpen && !downReasonOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRootRef.current?.contains(target)) return;
      setMenuOpen(false);
      setDownReasonOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen, downReasonOpen]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(entry.message ?? '');
    if (ok) toast.success('已复制');
    else toast.error('复制失败');

    if (ok && !isUser) {
      void sendMessageInteractionEvent(
        {
          name: 'msg.copy',
          args: {
            messageId: String(entry.id),
            eventId: makeEventId('evt'),
            clientTsMs: Date.now(),
            scope: codeBlocks.length > 0 ? 'full_with_code' : 'full',
            length: (entry.message ?? '').length,
            hasCode: codeBlocks.length > 0,
            hasLinks: links.length > 0,
            ...(llmCallId ? { llmCallId } : {}),
            ...(traceId ? { traceId } : {}),
          },
        },
        { timeoutMs: 1200, maxRetries: 5 }
      ).then((res) => {
        if (!res.ok) {
          // non-blocking
        }
      });
    }
  };

  const handleReadAloud = () => {
    if (isUser) return;

    // Toggle behavior: if currently speaking, stop.
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        synth.cancel();
        const startedAt = readAloudStartedAtRef.current;
        const durationMs = startedAt ? Date.now() - startedAt : undefined;
        readAloudStartedAtRef.current = null;
        void sendMessageInteractionEvent(
          {
            name: 'msg.read_aloud.stop',
            args: {
              messageId: String(entry.id),
              eventId: makeEventId('evt'),
              clientTsMs: Date.now(),
              engine: 'browser',
              lang: locale,
              ...(typeof durationMs === 'number' ? { duration_ms: durationMs } : {}),
              ...(llmCallId ? { llmCallId } : {}),
              ...(traceId ? { traceId } : {}),
            },
          },
          { timeoutMs: 1200, maxRetries: 5 }
        );
        toast.message('已停止朗读');
        return;
      }
    }

    const startedAt = Date.now();
    setReadAloudPending(true);
    void sendMessageInteractionEvent(
      {
        name: 'msg.read_aloud.start',
        args: {
          messageId: String(entry.id),
          eventId: makeEventId('evt'),
          clientTsMs: startedAt,
          engine: 'browser',
          lang: locale,
          ...(llmCallId ? { llmCallId } : {}),
          ...(traceId ? { traceId } : {}),
        },
      },
      { timeoutMs: 1200, maxRetries: 5 }
    );

    const ok = speakText(
      entry.message ?? '',
      locale,
      {
        onStart: () => {
          readAloudStartedAtRef.current = startedAt;
          setReadAloudPending(false);
        },
        onEnd: () => {
          const durationMs = Date.now() - startedAt;
          readAloudStartedAtRef.current = null;
          void sendMessageInteractionEvent(
            {
              name: 'msg.read_aloud.complete',
              args: {
                messageId: String(entry.id),
                eventId: makeEventId('evt'),
                clientTsMs: Date.now(),
                engine: 'browser',
                lang: locale,
                duration_ms: durationMs,
                ...(llmCallId ? { llmCallId } : {}),
                ...(traceId ? { traceId } : {}),
              },
            },
            { timeoutMs: 1200, maxRetries: 5 }
          );
        },
        onError: (errorCode) => {
          readAloudStartedAtRef.current = null;
          setReadAloudPending(false);
          void sendMessageInteractionEvent(
            {
              name: 'msg.read_aloud.complete',
              args: {
                messageId: String(entry.id),
                eventId: makeEventId('evt'),
                clientTsMs: Date.now(),
                engine: 'browser',
                lang: locale,
                error_code: errorCode,
                ...(llmCallId ? { llmCallId } : {}),
                ...(traceId ? { traceId } : {}),
              },
            },
            { timeoutMs: 1200, maxRetries: 5 }
          );
        },
      }
    );

    if (!ok) {
      setReadAloudPending(false);
      toast.error('当前浏览器不支持朗读');
      void sendMessageInteractionEvent(
        {
          name: 'msg.read_aloud.complete',
          args: {
            messageId: String(entry.id),
            eventId: makeEventId('evt'),
            clientTsMs: Date.now(),
            engine: 'browser',
            lang: locale,
            error_code: 'unsupported',
            ...(llmCallId ? { llmCallId } : {}),
            ...(traceId ? { traceId } : {}),
          },
        },
        { timeoutMs: 1200, maxRetries: 5 }
      );
    }
  };

  const handleDownload = () => {
    const suggestedName = `message-${String(entry.id).slice(0, 8)}.md`;
    const ok = downloadText(entry.message ?? '', suggestedName, 'text/markdown;charset=utf-8');
    if (!ok) toast.error('下载失败');
  };

  const handleRegenerate = () => {
    toast.message('暂未支持重新生成');
  };

  const handleThumbUp = () => {
    if (reactionPending || !onSetReaction) return;
    setMenuOpen(false);
    setDownReasonOpen(false);

    setReactionPending(true);
    void onSetReaction(interactions?.myReaction === 'up' ? 'none' : 'up')
      .catch((e) => {
        toast.error(e?.message || '点赞失败');
      })
      .finally(() => setReactionPending(false));
  };

  const handleThumbDown = () => {
    if (reactionPending || !onSetReaction) return;
    setMenuOpen(false);

    const willSetDown = interactions?.myReaction !== 'down';
    setReactionPending(true);
    void onSetReaction(willSetDown ? 'down' : 'none')
      .then(() => {
        if (willSetDown) {
          setDownReason(null);
          setDownReasonOpen(true);
        } else {
          setDownReason(null);
          setDownReasonOpen(false);
        }
      })
      .catch((e) => {
        toast.error(e?.message || '点踩失败');
      })
      .finally(() => setReactionPending(false));
  };

  const handlePickDownReason = (reason: string) => {
    setDownReason(reason);
    setDownReasonOpen(false);
    const code = mapDownReasonToCode(reason);
    if (onCreateFeedback && code) {
      void onCreateFeedback(code).catch((e) => {
        toast.error(e?.message || '反馈提交失败');
      });
    }
    toast.success('感谢反馈');
  };

  return (
    <li
      id={anchorId}
      data-lk-message-origin={messageOrigin}
      data-conversation-id={conversationId}
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
      className={cn('group flex flex-col gap-0.5', className)}
      {...props}
    >
      {(!hideTimestamp || !hideName || hasBeenEdited) && (
        <span className="text-muted-foreground flex text-sm">
          {!hideName && <strong className="mt-2">{name}</strong>}

          {!hideTimestamp && (
            <span className="align-self-end ml-auto font-mono text-xs opacity-0 transition-opacity ease-linear group-hover:opacity-100">
              {hasBeenEdited && '*'}
              {time.toLocaleTimeString(locale, { timeStyle: 'short' })}
            </span>
          )}
        </span>
      )}

      <span className={cn('max-w-4/5 rounded-[20px] p-2', isUser ? 'bg-muted ml-auto' : 'mr-auto')}>
        {message}
      </span>

      {/* Assistant toolbar */}
      {!isUser && (
        <div
          ref={popoverRootRef}
          className={cn(
            'mt-0.5 flex items-center gap-1 text-muted-foreground',
            'opacity-100',
            'mr-auto'
          )}
        >
          <ChatEntryActionButton
            onClick={handleCopy}
            label="复制"
            title="复制"
            disabled={reactionPending}
          >
            <CopyIcon size={16} />
          </ChatEntryActionButton>
          <ChatEntryActionButton
            onClick={handleThumbUp}
            label="赞"
            title="赞"
            count={interactions?.reactions?.up}
            active={interactions?.myReaction === 'up'}
            disabled={reactionPending}
          >
            <ThumbsUpIcon size={16} />
          </ChatEntryActionButton>
          <div className="relative">
            <ChatEntryActionButton
              onClick={handleThumbDown}
              label="踩"
              title={interactions?.myReaction === 'down' && downReason ? `踩（${downReason}）` : '踩'}
              count={interactions?.reactions?.down}
              active={interactions?.myReaction === 'down'}
              disabled={reactionPending}
            >
              <ThumbsDownIcon size={16} />
            </ChatEntryActionButton>
            {downReasonOpen && (
              <div className="bg-popover text-popover-foreground absolute left-0 z-50 mt-1 w-52 rounded-md border border-border p-1 shadow-md">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  选择原因
                </div>
                {[
                  '不准确/有错误',
                  '不相关',
                  '表达不清晰',
                  '有害/违规',
                  '其他',
                ].map((r) => (
                  <MenuItem
                    key={r}
                    onClick={() => {
                      handlePickDownReason(r);
                    }}
                    label={r}
                  />
                ))}
              </div>
            )}
          </div>
          <ChatEntryActionButton
            onClick={handleReadAloud}
            label="朗读"
            title="朗读"
            disabled={readAloudPending}
          >
            <SpeakerHighIcon size={16} />
          </ChatEntryActionButton>

          <div className="relative">
            <ChatEntryActionButton
              onClick={() => {
                setDownReasonOpen(false);
                setMenuOpen((v) => !v);
              }}
              label="更多"
              title="更多"
              active={menuOpen}
            >
              <DotsThreeVerticalIcon size={16} />
            </ChatEntryActionButton>

            {menuOpen && (
              <div
                role="menu"
                aria-label="消息菜单"
                className="bg-popover text-popover-foreground absolute left-0 z-50 mt-1 w-56 rounded-md border border-border p-1 shadow-md"
              >
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {formatMessageTimestamp(time, locale)}
                </div>
                {codeBlocks.length > 0 && (
                  <MenuItem
                    onClick={async () => {
                      const ok = await copyToClipboard(codeBlocks.join('\n\n'));
                      if (ok) toast.success('代码已复制');
                      else toast.error('复制失败');
                      setMenuOpen(false);
                    }}
                    icon={<CopyIcon size={16} />}
                    label={`复制代码 (${codeBlocks.length})`}
                  />
                )}
                <MenuItem
                  onClick={async () => {
                    const url =
                      typeof window !== 'undefined'
                        ? `${window.location.origin}${window.location.pathname}${window.location.search}#${anchorId}`
                        : undefined;

                    try {
                      if (navigator?.share) {
                        await navigator.share({
                          title: 'AI 回复',
                          text: entry.message ?? '',
                          url,
                        });
                        toast.success('已分享');
                      } else {
                        const ok = await copyToClipboard(url ?? '');
                        if (ok) toast.success('链接已复制');
                        else toast.error('复制失败');
                      }
                    } catch {
                      // user cancelled or share failed
                    } finally {
                      setMenuOpen(false);
                    }
                  }}
                  icon={<ShareIcon size={16} />}
                  label="分享链接"
                />
                <MenuItem
                  onClick={() => {
                    handleDownload();
                    setMenuOpen(false);
                  }}
                  icon={<DownloadSimpleIcon size={16} />}
                  label="下载为 Markdown"
                />
                <MenuItem
                  onClick={() => {
                    handleRegenerate();
                    setMenuOpen(false);
                  }}
                  icon={<ArrowClockwiseIcon size={16} />}
                  label="重新生成"
                />

                {links.length > 0 && (
                  <div className="mt-1 border-t border-border pt-1">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      链接 ({links.length})
                    </div>
                    <div className="max-h-40 overflow-auto">
                      {links.map((u) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:bg-accent block truncate rounded px-2 py-1 text-xs"
                          title={u}
                        >
                          {u}
                        </a>
                      ))}
                    </div>
                    <MenuItem
                      onClick={async () => {
                        const ok = await copyToClipboard(links.join('\n'));
                        if (ok) toast.success('链接已复制');
                        else toast.error('复制失败');
                        setMenuOpen(false);
                      }}
                      icon={<CopyIcon size={16} />}
                      label="复制全部链接"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

function ChatEntryActionButton({
  children,
  label,
  title,
  active,
  count,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  title?: string;
  active?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={label}
      className={cn(
        count == null
          ? 'hover:bg-accent inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors'
          : 'hover:bg-accent inline-flex h-7 items-center justify-center gap-1 rounded-md px-2 text-xs transition-colors',
        active && 'bg-accent text-foreground',
        props.disabled && 'opacity-50',
        className
      )}
      {...props}
    >
      {children}
      {typeof count === 'number' && (
        <span className={cn('min-w-[1ch]', active ? 'text-foreground' : 'text-muted-foreground')}>
          {count}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm',
        className
      )}
    >
      {icon ? <span className="text-muted-foreground">{icon}</span> : <span className="w-4" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

function downloadText(text: string, filename: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function speakText(
  text: string,
  locale: string,
  hooks?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (errorCode: string) => void;
  }
): boolean {
  if (!text) return false;
  if (typeof window === 'undefined') return false;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;

  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.onstart = () => hooks?.onStart?.();
    utterance.onend = () => hooks?.onEnd?.();
    utterance.onerror = () => hooks?.onError?.('tts_error');
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

function mapDownReasonToCode(reason: string): string | null {
  if (reason.includes('不准确')) return 'inaccurate';
  if (reason.includes('不相关')) return 'irrelevant';
  if (reason.includes('不清晰')) return 'unclear';
  if (reason.includes('有害') || reason.includes('违规')) return 'policy';
  if (reason.includes('其他')) return 'other';
  return null;
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>()\[\]{}]+/g) ?? [];

  const cleaned = matches
    .map((m) => m.replace(/[),.;!?]+$/, ''))
    .filter((m) => m.length > 0);

  return Array.from(new Set(cleaned));
}

function extractFencedCodeBlocks(text: string): string[] {
  if (!text) return [];

  const fence = '```';
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(fence, cursor);
    if (start === -1) break;
    const afterStart = start + fence.length;
    const end = text.indexOf(fence, afterStart);
    if (end === -1) break;

    let inside = text.slice(afterStart, end);
    inside = inside.replace(/^\n/, '');

    const newlineIdx = inside.indexOf('\n');
    if (newlineIdx !== -1) {
      const firstLine = inside.slice(0, newlineIdx).trim();
      const rest = inside.slice(newlineIdx + 1);
      if (firstLine && /^[a-z0-9_-]+$/i.test(firstLine)) {
        inside = rest;
      }
    }

    inside = inside.replace(/\n$/, '');
    if (inside.trim().length > 0) {
      blocks.push(inside);
    }

    cursor = end + fence.length;
  }

  return blocks;
}

function formatMessageTimestamp(time: Date, locale: string): string {
  // Compare by local day boundaries.
  const now = new Date();
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart(now) - dayStart(time)) / (24 * 60 * 60 * 1000));

  const timePart = time.toLocaleTimeString(locale, { timeStyle: 'short' });

  if (diffDays === 0) return `Today, ${timePart}`;
  if (diffDays === 1) return `Yesterday, ${timePart}`;

  const datePart = time.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return `${datePart}, ${timePart}`;
}
