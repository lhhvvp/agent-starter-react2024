'use client';

import React, { useEffect, useRef, useState } from 'react';
import { RoomEvent } from 'livekit-client';
import { type AgentState, useRoomContext, useVoiceAssistant } from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { CanvasPane } from '@/components/canvas-pane';
import { CanvasOverlay } from '@/components/canvas-overlay';
import { WorkspacePane } from '@/components/workspace-pane';
import { WorkspaceOverlay } from '@/components/workspace-overlay';
import { ConversationPane } from '@/components/conversation-pane';
import { TimelinePane } from '@/components/timeline/TimelinePane';
import { useConversationTimeline } from '@/hooks/useConversationTimeline';
import useConversationMessagesV1 from '@/hooks/useConversationMessagesV1';
import { useDebugMode } from '@/hooks/useDebug';
import type { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { UIBlocksBootstrap } from '@/components/ui-blocks/Bootstrap';

function isAgentAvailable(agentState: AgentState) {
  return agentState == 'listening' || agentState == 'thinking' || agentState == 'speaking';
}

interface SessionViewProps {
  appConfig: AppConfig;
  disabled: boolean;
  sessionStarted: boolean;
  conversationId?: string | null;
  initialMessage?: string | null;
}

export const SessionView = ({
  appConfig,
  disabled,
  sessionStarted,
  conversationId,
  initialMessage,
  ref,
}: React.ComponentProps<'div'> & SessionViewProps) => {
  const { state: agentState } = useVoiceAssistant();
  const [chatOpen, setChatOpen] = useState(true);
  const { messages, send, setReaction, createFeedback } = useConversationMessagesV1(conversationId);
  const room = useRoomContext();
  const [initialMessageSent, setInitialMessageSent] = useState(false);
  const [roomConnected, setRoomConnected] = useState(room.state === 'connected');
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<{ id: string; projectId?: string | null } | null>(null);
  const [rightSplit, setRightSplit] = useState<number>(0.4); // percentage of viewport width allocated to right canvas (0..1)
  const [dragging, setDragging] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  useDebugMode();

  async function handleSendMessage(message: string) {
    await send(message);
  }

  useEffect(() => {
    const onConnected = () => setRoomConnected(true);
    const onDisconnected = () => setRoomConnected(false);
    // Sync initial value in case the component mounted after connect.
    setRoomConnected(room.state === 'connected');
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);

  // Send a one-time "starter" message when the room is connected (public/ticket entry).
  useEffect(() => {
    if (!sessionStarted) {
      setInitialMessageSent(false);
      return;
    }
    if (initialMessageSent) return;
    const msg = initialMessage?.trim();
    if (!msg) return;
    if (!roomConnected) return;

    void send(msg)
      .then(() => setInitialMessageSent(true))
      .catch((e: any) => {
        toastAlert({
          title: '发送失败',
          description: e?.message || '请稍后重试',
        });
      });
  }, [initialMessage, initialMessageSent, roomConnected, send, sessionStarted]);

  useEffect(() => {
    if (sessionStarted) {
      const timeout = setTimeout(() => {
        if (!isAgentAvailable(agentState)) {
          const reason =
            agentState === 'connecting'
              ? 'Agent did not join the room. '
              : 'Agent connected but did not complete initializing. ';

          toastAlert({
            title: 'Session ended',
            description: (
              <p className="w-full">
                {reason}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://docs.livekit.io/agents/start/voice-ai/"
                  className="whitespace-nowrap underline"
                >
                  See quickstart guide
                </a>
                .
              </p>
            ),
          });
          room.disconnect();
        }
      }, 10_000);

      return () => clearTimeout(timeout);
    }
  }, [agentState, sessionStarted, room]);

  // Load saved split from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('canvasRightSplit');
      if (saved != null) {
        const n = parseFloat(saved);
        if (!Number.isNaN(n) && n > 0.05 && n < 0.95) setRightSplit(n);
      }
    } catch {}
  }, []);

  // Keep a CSS variable in sync for use by global styles
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const paneOpen = canvasOpen || workspaceOpen;
    if (paneOpen) {
      const rect = layoutRef.current?.getBoundingClientRect();
      const widthPx = rect?.width ?? window.innerWidth;
      const rightWidthPx = Math.max(0, Math.round(widthPx * rightSplit));
      body.style.setProperty('--canvas-right-width', `${rightWidthPx}px`);
      try {
        window.localStorage.setItem('canvasRightSplit', String(rightSplit));
      } catch {}
    } else {
      body.style.removeProperty('--canvas-right-width');
    }
    return () => {
      body.style.removeProperty('--canvas-right-width');
    };
  }, [canvasOpen, workspaceOpen, rightSplit]);

  // Handle drag to resize (desktop only)
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const container = layoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const width = rect.width || 1;
      const x = e.clientX - rect.left;
      // right fraction based on mouse position within the layout container
      let next = (width - x) / width;
      // clamp right width between 20% and 80%
      const min = 0.2;
      const max = 0.8;
      if (next < min) next = min;
      if (next > max) next = max;
      setRightSplit(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp);
    };
  }, [dragging]);

  // Touch support (mostly for tablets; hidden on small screens anyway)
  useEffect(() => {
    if (!dragging) return;
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const container = layoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const width = rect.width || 1;
      const x = t.clientX - rect.left;
      let next = (width - x) / width;
      const min = 0.2;
      const max = 0.8;
      if (next < min) next = min;
      if (next > max) next = max;
      setRightSplit(next);
    };
    const onTouchEnd = () => setDragging(false);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    };
  }, [dragging]);

  // Surface selection: none | canvas | workspace
  const surface: 'none' | 'canvas' | 'workspace' = canvasOpen ? 'canvas' : workspaceOpen ? 'workspace' : 'none';

  const handleSelectSurface = (mode: 'none' | 'canvas' | 'workspace') => {
    if (mode === 'none') {
      setCanvasOpen(false);
      setWorkspaceOpen(false);
      setActiveArtifact(null);
    } else if (mode === 'canvas') {
      setCanvasOpen(true);
      setWorkspaceOpen(false);
    } else if (mode === 'workspace') {
      setWorkspaceOpen(true);
      setCanvasOpen(false);
    }
  };

  const { events, status, error } = useConversationTimeline(conversationId);
  const timelineLoading = status === 'idle' || status === 'loading';

  return (
    // 整个 SessionView 占满可用高度（由外层 AppShell 控制），页面本身不再滚动，只在内部滚动
    <main
      ref={ref}
      inert={disabled}
      className={cn('h-full', !chatOpen && 'overflow-hidden')}
    >
      {/* 内部容器固定填满 main，高度不再额外增加 padding，避免把底部 chatbox 推出视口 */}
      <div className="mx-auto h-full w-full">
        <div
          ref={layoutRef}
          className="relative grid h-full"
          style={
            canvasOpen || workspaceOpen
              ? {
                  gridTemplateColumns: `${((1 - rightSplit) * 100).toFixed(
                    2
                  )}% auto ${(rightSplit * 100).toFixed(2)}%`,
                }
              : { gridTemplateColumns: '1fr' }
          }
        >
          {/* Ensure UI Blocks TextStream/Chat handlers are registered early */}
          <UIBlocksBootstrap />
          {/* 左列：完整 SessionView 会话体验 */}
          <div className="relative">
            <ConversationPane
              appConfig={appConfig}
              sessionStarted={sessionStarted}
              messages={messages}
              chatOpen={chatOpen}
              setChatOpen={setChatOpen}
              onSendMessage={handleSendMessage}
              onSetReaction={setReaction}
              onCreateFeedback={createFeedback}
              onToggleCanvas={() => {
                setCanvasOpen((v) => {
                  const next = !v;
                  if (next) setWorkspaceOpen(false);
                  return next;
                });
              }}
              canvasOpen={canvasOpen || workspaceOpen}
              onSelectSurface={handleSelectSurface}
              surface={surface}
              onOpenArtifact={(artifactId, projectId) => {
                setActiveArtifact({ id: artifactId, projectId: projectId ?? null });
                setWorkspaceOpen(true);
                setCanvasOpen(false);
              }}
              anchor="viewport"
            />
          </div>

          {/* 中间分隔线：仅桌面端，pane 打开时 */}
          {(canvasOpen || workspaceOpen) && (
            <div className="hidden md:block">
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize canvas"
                className="group relative mx-[-4px] h-full w-2 cursor-col-resize"
                onMouseDown={() => setDragging(true)}
                onTouchStart={() => setDragging(true)}
              >
                {/* Hit area */}
                <div className="absolute inset-y-0 -left-2 right-2" />
                {/* Visual guide line */}
                <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                {/* Hover hint */}
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-muted px-2 py-1 text-[10px] font-mono text-foreground/60 opacity-0 shadow group-hover:opacity-100">
                  drag
                </div>
              </div>
            </div>
          )}

          {/* 右列：Workspace / Canvas + Timeline（桌面端） */}
          {(canvasOpen || workspaceOpen) && (
            // 右侧 workspace / canvas 区通过 min-h-0 确保内部容器可以正确收缩并启用滚动
            <div className="hidden md:flex md:min-h-0 md:flex-col md:pr-3 md:pl-3">
              <div className={cn('flex-1 min-h-0 border-b', workspaceOpen && !canvasOpen && 'overflow-y-auto')}>
                {canvasOpen && !workspaceOpen && <CanvasPane className="h-full" />}
                {workspaceOpen && !canvasOpen && (
                  <WorkspacePane
                    className="h-full"
                    activeArtifact={activeArtifact}
                    onClose={() => {
                      setWorkspaceOpen(false);
                      setActiveArtifact(null);
                    }}
                  />
                )}
              </div>
              <div className="h-64 min-h-[12rem] overflow-y-auto">
                <TimelinePane
                  events={events}
                  loading={timelineLoading}
                  error={error ?? undefined}
                  onSelectArtifact={(artifactId) => {
                    setActiveArtifact({ id: artifactId, projectId: null });
                    setWorkspaceOpen(true);
                    setCanvasOpen(false);
                  }}
                  onSelectStep={(_stepId) => {
                    // TODO: 打通到任务/步骤视图，高亮或滚动到对应 step
                  }}
                />
              </div>
            </div>
          )}

          {/* Mobile overlay: canvas (sm screens) */}
          {canvasOpen && (
            <CanvasOverlay
              open={canvasOpen}
              onClose={() => setCanvasOpen(false)}
              className="md:hidden"
            />
          )}

          {/* Mobile overlay: workspace (sm screens) */}
          {workspaceOpen && (
            <WorkspaceOverlay
              open={workspaceOpen}
              onClose={() => {
                setWorkspaceOpen(false);
                setActiveArtifact(null);
              }}
              title="Workspace"
              activeArtifact={activeArtifact}
              className="md:hidden"
            />
          )}
        </div>
      </div>
    </main>
  );
};
