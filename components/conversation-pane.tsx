'use client';

import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReceivedChatMessage, useRoomContext } from '@livekit/components-react';
import { AgentControlBar } from '@/components/livekit/agent-control-bar/agent-control-bar';
import { ChatEntry } from '@/components/livekit/chat/chat-entry';
import { ChatMessageView } from '@/components/livekit/chat/chat-message-view';
import { MediaTiles } from '@/components/livekit/media-tiles';
import { useAgentCapabilities } from '@/hooks/useAgentCapabilities';
import type { ReactionValue, UiBlockV1, UiMessageV1 } from '@/hooks/useConversationMessagesV1';
import type { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ConversationPaneProps extends React.HTMLAttributes<HTMLDivElement> {
  appConfig: AppConfig;
  sessionStarted: boolean;
  messages: UiMessageV1[];
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  onSendMessage: (message: string) => Promise<void>;
  onSetReaction?: (messageId: string, value: ReactionValue) => Promise<void>;
  onCreateFeedback?: (messageId: string, reasonCode: string, text?: string) => Promise<void>;
  onToggleCanvas?: () => void;
  canvasOpen?: boolean;
  anchor?: 'viewport' | 'container';
  // Optional surface selector passthrough
  onSelectSurface?: (surface: 'none' | 'canvas' | 'workspace') => void;
  surface?: 'none' | 'canvas' | 'workspace';
  onOpenArtifact?: (artifactId: string, projectId?: string | null) => void;
}

// 轻量适配器：将 UiMessageV1 转换为 ChatEntry 需要的 ReceivedChatMessage 结构
function UiChatEntry({
  msg,
  onSetReaction,
  onCreateFeedback,
}: {
  msg: UiMessageV1;
  onSetReaction?: (messageId: string, value: ReactionValue) => Promise<void>;
  onCreateFeedback?: (messageId: string, reasonCode: string, text?: string) => Promise<void>;
}) {
  const room = useRoomContext();

  let from: ReceivedChatMessage['from'] = undefined;

  if (room) {
    if (msg.isLocal) {
      from = room.localParticipant;
    } else {
      const firstRemote = Array.from(room.remoteParticipants.values())[0];
      from = firstRemote ?? room.localParticipant;
    }
  }

  const entry: ReceivedChatMessage = {
    id: msg.id,
    timestamp: msg.tsMs,
    message: msg.text,
    from,
  };

  return (
    <ChatEntry
      hideName
      entry={entry}
      conversationId={msg.conversationId}
      interactions={msg.interactions}
      llmCallId={msg.llmCallId ?? undefined}
      traceId={msg.traceId ?? undefined}
      onSetReaction={async (value) => {
        await onSetReaction?.(msg.id, value);
      }}
      onCreateFeedback={async (reasonCode, text) => {
        await onCreateFeedback?.(msg.id, reasonCode, text);
      }}
    />
  );
}

function SimpleArtifactChip({
  block,
  onOpen,
}: {
  block: Extract<UiBlockV1, { kind: 'artifact' }>;
  onOpen?: (artifactId: string, projectId?: string | null) => void;
}) {
  const handleClick = () => {
    onOpen?.(block.artifactId, block.projectId ?? null);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="bg-muted/40 hover:bg-muted/70 border-border/60 mt-2 flex w-full max-w-md items-start gap-2 rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition-colors"
    >
      <div className="bg-primary/10 text-primary mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold">
        文
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate font-medium">{block.title}</span>
        </div>
        {block.snippet && (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] leading-snug">
            {block.snippet}
          </p>
        )}
      </div>
    </button>
  );
}

export function ConversationPane({
  appConfig,
  sessionStarted,
  messages,
  chatOpen,
  setChatOpen,
  onSendMessage,
  onSetReaction,
  onCreateFeedback,
  onToggleCanvas,
  canvasOpen,
  anchor = 'viewport',
  onSelectSurface,
  surface,
  onOpenArtifact,
  className,
  ...props
}: ConversationPaneProps) {
  const { supportsChatInput, supportsAudioInput, supportsVideoInput, supportsScreenShare } =
    appConfig;
  const agentCaps = useAgentCapabilities();

  const capabilities = {
    supportsChatInput: supportsChatInput && (agentCaps.supportsChatInput ?? true),
    supportsAudioInput: supportsAudioInput && (agentCaps.supportsAudioInput ?? true),
    supportsVideoInput: supportsVideoInput && (agentCaps.supportsVideoInput ?? true),
    supportsScreenShare: supportsScreenShare && (agentCaps.supportsScreenShare ?? true),
  };

  return (
    <div
      data-scroll-container
      className={cn('relative h-full min-h-0 overflow-y-auto overscroll-contain', className)}
      {...props}
    >
      {/* Chat timeline */}
      <ChatMessageView
        className={cn(
          'mx-auto min-h-full w-full max-w-2xl px-3 pt-32 pb-40 transition-[opacity,translate] duration-300 ease-out md:px-0 md:pt-36 md:pb-48',
          chatOpen ? 'translate-y-0 opacity-100 delay-200' : 'translate-y-20 opacity-0'
        )}
      >
        <div className="space-y-3 whitespace-pre-wrap">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 1, height: 'auto', translateY: 0.001 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <div className="space-y-1">
                  <UiChatEntry
                    msg={message}
                    onSetReaction={onSetReaction}
                    onCreateFeedback={onCreateFeedback}
                  />
                  {message.blocks?.map((block, idx) =>
                    block.kind === 'artifact' ? (
                      <SimpleArtifactChip
                        key={`${message.id}-art-${idx}`}
                        block={block}
                        onOpen={onOpenArtifact}
                      />
                    ) : null
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ChatMessageView>

      {/* Media tiles (can anchor to viewport or enclosing container) */}
      <div className={cn(anchor === 'container' && 'relative')}>
        <MediaTiles chatOpen={chatOpen} anchor={anchor} canvasOpen={canvasOpen} />
      </div>

      {/* Bottom control bar */}
      <div
        className={cn(
          'bg-background sticky right-0 bottom-0 left-0 z-50 px-3 pt-2 pb-3 md:px-12 md:pb-12'
        )}
      >
        <motion.div
          key="control-bar"
          initial={{ opacity: 0, translateY: '100%' }}
          animate={{
            opacity: sessionStarted ? 1 : 0,
            translateY: sessionStarted ? '0%' : '100%',
          }}
          transition={{ duration: 0.3, delay: sessionStarted ? 0.5 : 0, ease: 'easeOut' }}
        >
          <div className="relative z-10 mx-auto w-full max-w-2xl">
            {appConfig.isPreConnectBufferEnabled && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{
                  opacity: sessionStarted && messages.length === 0 ? 1 : 0,
                  transition: {
                    ease: 'easeIn',
                    delay: messages.length > 0 ? 0 : 0.8,
                    duration: messages.length > 0 ? 0.2 : 0.5,
                  },
                }}
                aria-hidden={messages.length > 0}
                className={cn(
                  'absolute inset-x-0 -top-12 text-center',
                  sessionStarted && messages.length === 0 && 'pointer-events-none'
                )}
              >
                <p className="animate-text-shimmer inline-block !bg-clip-text text-sm font-semibold text-transparent">
                  Agent is listening, ask it a question
                </p>
              </motion.div>
            )}

            <AgentControlBar
              capabilities={capabilities}
              chatOpen={chatOpen}
              onChatOpenChange={setChatOpen}
              onSendMessage={onSendMessage}
              onToggleCanvas={onToggleCanvas}
              canvasOpen={canvasOpen}
              onSelectSurface={onSelectSurface}
              surface={surface}
            />
          </div>
          <div className="from-background border-background absolute top-0 left-0 h-12 w-full -translate-y-full bg-gradient-to-t to-transparent" />
        </motion.div>
      </div>
    </div>
  );
}
