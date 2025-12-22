'use client';

import { useEffect, useMemo, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { motion } from 'motion/react';
import {
  ChatsCircle,
  ClockCounterClockwise,
  SquaresFour,
  CaretDoubleLeft,
  CaretDoubleRight,
  PlusCircle,
  CaretDown,
} from '@phosphor-icons/react/dist/ssr';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { SessionView } from '@/components/session-view';
import { Toaster } from '@/components/ui/sonner';
import { Welcome } from '@/components/welcome';
import useConnectionDetails from '@/hooks/useConnectionDetails';
import { useMeProjects } from '@/hooks/useMeProjects';
import type { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

const MotionWelcome = motion.create(Welcome);
const MotionSessionView = motion.create(SessionView);

type AppMode = 'ticket' | 'me';

interface AppProps {
  appConfig: AppConfig;
  mode?: AppMode;
}

interface MeConversationsCreateResponse {
  conversation: {
    id: string;
    orgId: string;
    roomId: string;
    projectId: string | null;
    title: string | null;
    summary: string | null;
    visibility: 'shared' | 'private';
    isArchived: boolean;
    createdAt: string;
    lastMessageAt: string | null;
    participantCount: number;
    lastMessagePreview: string | null;
  };
  connection: {
    serverUrl: string;
    roomName: string;
    participantToken: string;
    participantName: string | null;
    participantIdentity: string;
    roomId: string;
    convId: string;
    orgId: string;
    metadata?: Record<string, unknown>;
  };
}

export function App({ appConfig, mode = 'ticket' }: AppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [startPayload, setStartPayload] = useState<{
    ticket?: string;
    displayName?: string;
  } | null>(null);
  const { connectionDetails, refreshConnectionDetails, setConnectionDetailsExternal } =
    useConnectionDetails();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarLabelsVisible, setSidebarLabelsVisible] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);

  const showSidebar = mode === 'me' ? true : sessionStarted;

  // 控制侧边栏文字在展开动画结束后再显示，避免宽度很窄时文字竖排闪烁
  useEffect(() => {
    // 会话未开始或侧边栏收起时，不显示文字
    if (!sessionStarted || sidebarCollapsed) {
      setSidebarLabelsVisible(false);
      return;
    }
    // 展开时，等待宽度动画完成后再显示文字
    const timer = window.setTimeout(() => {
      setSidebarLabelsVisible(true);
    }, 260); // 与 transition duration 300ms 匹配，略小一点更自然

    return () => window.clearTimeout(timer);
  }, [sessionStarted, sidebarCollapsed]);

  useEffect(() => {
    const onDisconnected = () => {
      setSessionStarted(false);
      refreshConnectionDetails();
    };
    const onMediaDevicesError = (error: Error) => {
      toastAlert({
        title: 'Encountered an error with your media devices',
        description: `${error.name}: ${error.message}`,
      });
    };
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails]);

  useEffect(() => {
    let aborted = false;
    if (sessionStarted && room.state === 'disconnected' && connectionDetails) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          const urlObj = new URL(connectionDetails.serverUrl);
          // eslint-disable-next-line no-console
          console.info('[connect] attempting', {
            server: { protocol: urlObj.protocol, host: urlObj.host },
            roomPresent: Boolean(connectionDetails.roomName),
            participantNameLen: connectionDetails.participantName?.length ?? 0,
          });
        } catch {}
      }
      Promise.all([
        room.localParticipant.setMicrophoneEnabled(true, undefined, {
          preConnectBuffer: appConfig.isPreConnectBufferEnabled,
        }),
        room.connect(connectionDetails.serverUrl, connectionDetails.participantToken),
      ]).catch((error) => {
        if (aborted) {
          // Once the effect has cleaned up after itself, drop any errors
          //
          // These errors are likely caused by this effect rerunning rapidly,
          // resulting in a previous run `disconnect` running in parallel with
          // a current run `connect`
          return;
        }

        toastAlert({
          title: 'There was an error connecting to the agent',
          description: `${error.name}: ${error.message}`,
        });
      });
    }
    return () => {
      aborted = true;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.info('[connect] cleanup: disconnecting');
      }
      room.disconnect();
    };
  }, [room, sessionStarted, connectionDetails, appConfig.isPreConnectBufferEnabled]);

  const { startButtonText } = appConfig;

  // 后端通过 connection-details 返回 conv_id（与 timeline.conversation_id 对齐）
  const conversationId =
    (connectionDetails as any)?.conv_id && typeof (connectionDetails as any).conv_id === 'string'
      ? ((connectionDetails as any).conv_id as string)
      : null;

  const { projects } = useMeProjects();

  const currentProject =
    projects.find((p) => p.id === currentProjectId) ?? (projects.length ? projects[0] : null);

  // 当项目列表首次加载完成且尚未选择当前项目时，默认选中最近一个
  useEffect(() => {
    if (!currentProjectId && projects.length > 0) {
      setCurrentProjectId(projects[0]!.id);
    }
  }, [currentProjectId, projects]);

  async function handleCreateConversation() {
    if (creatingConversation) return;
    setCreatingConversation(true);
    try {
      const res = await fetch('/api/me/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        let description: string | undefined;
        try {
          const data = await res.json();
          const message =
            data?.error?.message || data?.message || (typeof data === 'string' ? data : null);
          if (message) {
            description = message;
          } else if (res.status === 401) {
            description = '请先登录后再新建会话';
          }
        } catch {
          // ignore parse error
        }

        if (!description) {
          description = `创建会话失败（${res.status}）`;
        }

        toastAlert({
          title: '新建会话失败',
          description,
        });
        return;
      }

      const data = (await res.json()) as MeConversationsCreateResponse;
      const conn = data?.connection;

      if (!conn || !conn.serverUrl || !conn.roomName || !conn.participantToken) {
        toastAlert({
          title: '新建会话失败',
          description: '返回的连接参数不完整，请稍后重试',
        });
        return;
      }

      const participantName = conn.participantName ?? 'guest';

      setConnectionDetailsExternal({
        serverUrl: conn.serverUrl,
        roomName: conn.roomName,
        participantToken: conn.participantToken,
        participantName,
        conv_id: conn.convId,
        org_id: conn.orgId,
      } as any);

      setSessionStarted(true);
    } catch (error: any) {
      toastAlert({
        title: '新建会话失败',
        description: `${error?.name || 'Error'}: ${error?.message || '未知错误'}`,
      });
    } finally {
      setCreatingConversation(false);
    }
  }

  return (
    <>
      {mode === 'ticket' && (
        <MotionWelcome
          key="welcome-ticket"
          startButtonText={startButtonText}
          mode="ticket"
          onStartCall={(opts) => {
            setStartPayload(opts ?? null);
            setSessionStarted(true);
            if (opts?.ticket) {
              refreshConnectionDetails({
                ticket: opts.ticket,
                profile: opts.displayName ? { display_name: opts.displayName } : undefined,
              });
            }
          }}
          disabled={sessionStarted}
          initial={{ opacity: 0 }}
          animate={{ opacity: sessionStarted ? 0 : 1 }}
          transition={{ duration: 0.5, ease: 'linear', delay: sessionStarted ? 0 : 0.5 }}
        />
      )}

      <RoomContext.Provider value={room}>
        <RoomAudioRenderer />
        <StartAudio label="Start Audio" />
        {/* --- */}
        {/* me 模式下始终显示左侧菜单；ticket 模式下仅在会话已开始时显示左侧菜单 */}
        <div className="flex h-svh">
          {/* 左侧菜单列 */}
          {showSidebar && (
            <aside
              className={cn(
                'hidden h-full flex-col border-r border-border bg-sidebar/80 pt-20 pb-4 md:flex transition-[width] duration-300',
                sidebarCollapsed ? 'w-16 px-2' : 'w-60 px-4'
              )}
            >
              {/* 项目 pill */}
              {!sidebarCollapsed && (
                <div className="mb-4 relative">
                  <button
                    type="button"
                    onClick={() => setProjectMenuOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2 text-left text-xs hover:bg-muted"
                    aria-haspopup="listbox"
                    aria-expanded={projectMenuOpen}
                  >
                    <div className="flex flex-col">
                      <span className="truncate text-[13px] font-medium">
                        {currentProject ? currentProject.name : '加载项目中…'}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {currentProject
                          ? currentProject.org_id || '我的项目'
                          : projects.length === 0
                            ? '暂无项目'
                            : ' '}
                      </span>
                    </div>
                    <CaretDown className="ml-2 h-3 w-3 text-muted-foreground" />
                  </button>
                  {projectMenuOpen && projects.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border/60 bg-popover text-xs shadow-md">
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setCurrentProjectId(p.id);
                            setProjectMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted',
                            p.id === currentProject?.id ? 'bg-muted/70' : ''
                          )}
                        >
                          <span className="truncate text-[13px] font-medium">{p.name}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {p.org_id || '我的项目'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 折叠 / 展开按钮 */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
                aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
              >
                {sidebarCollapsed ? (
                  <CaretDoubleRight className="h-4 w-4" />
                ) : (
                  <CaretDoubleLeft className="h-4 w-4" />
                )}
              </button>

              <nav className="flex-1 space-y-1 text-sm">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted',
                    sidebarCollapsed
                      ? 'text-foreground'
                      : 'gap-2 text-left font-medium text-foreground'
                  )}
                >
                  <ChatsCircle className="h-4 w-4" weight="fill" />
                  {sidebarLabelsVisible && <span>会话</span>}
                </button>
                <button
                  type="button"
                  onClick={handleCreateConversation}
                  disabled={creatingConversation}
                  className={cn(
                    'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted',
                    sidebarCollapsed
                      ? 'text-muted-foreground'
                      : 'gap-2 text-left text-muted-foreground'
                  )}
                >
                  <PlusCircle className="h-4 w-4" />
                  {sidebarLabelsVisible && <span>{creatingConversation ? '创建中…' : '新建会话'}</span>}
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted hover:text-foreground',
                    sidebarCollapsed
                      ? 'text-muted-foreground'
                      : 'gap-2 text-left text-muted-foreground'
                  )}
                >
                  <ClockCounterClockwise className="h-4 w-4" />
                  {sidebarLabelsVisible && <span>时间线</span>}
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted hover:text-foreground',
                    sidebarCollapsed
                      ? 'text-muted-foreground'
                      : 'gap-2 text-left text-muted-foreground'
                  )}
                >
                  <SquaresFour className="h-4 w-4" />
                  {sidebarLabelsVisible && <span>工作区</span>}
                </button>
              </nav>

              {!sidebarCollapsed && (
                <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  Yuan 的空间
                </div>
              )}
            </aside>
          )}

          {/* 右侧主聊天区域 */}
          <div className="flex-1 overflow-hidden">
            {mode === 'me' && !sessionStarted ? (
              <MotionWelcome
                key="welcome-me"
                startButtonText={startButtonText}
                mode="me"
                onStartCall={() => {
                  void handleCreateConversation();
                }}
                disabled={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: 'linear', delay: 0.2 }}
              />
            ) : (
              <MotionSessionView
                key="session-view"
                appConfig={appConfig}
                disabled={!sessionStarted}
                sessionStarted={sessionStarted}
                conversationId={conversationId}
                initial={{ opacity: 0 }}
                animate={{ opacity: sessionStarted ? 1 : 0 }}
                transition={{
                  duration: 0.5,
                  ease: 'linear',
                  delay: sessionStarted ? 0.5 : 0,
                }}
              />
            )}
          </div>
        </div>
      </RoomContext.Provider>

      <Toaster />
    </>
  );
}
