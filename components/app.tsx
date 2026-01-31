'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
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
  List,
  ShareNetwork,
  DownloadSimple,
  GearSix,
  UserCircle,
  Check,
  Plus,
  UsersThree,
  SlidersHorizontal,
  Question,
  SignOut,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { RoomContext } from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { LogoutButton } from '@/components/auth/logout-button';
import { ClientLogProvider } from '@/components/client-log/ClientLogProvider';
import { SessionView } from '@/components/session-view';
import { Toaster } from '@/components/ui/sonner';
import { Welcome } from '@/components/welcome';
import { ThemeToggle } from '@/components/theme-toggle';
import useConnectionDetails from '@/hooks/useConnectionDetails';
import { useMeProjects, type MeProjectSummary } from '@/hooks/useMeProjects';
import useConversationMessagesV1, { type UiMessageV1 } from '@/hooks/useConversationMessagesV1';
import type { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

const MotionWelcome = motion.create(Welcome);
const MotionSessionView = motion.create(SessionView);

type AppMode = 'ticket' | 'me' | 'public';

interface AppProps {
  appConfig: AppConfig;
  mode?: AppMode;
  sessionUser?: { display_name?: string | null; email?: string | null } | null;
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

export function App({ appConfig, mode = 'ticket', sessionUser }: AppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(mode === 'public');
  const insecureContextToastShownRef = useRef(false);
  const [startPayload, setStartPayload] = useState<{
    ticket?: string;
    displayName?: string;
    prefillMessage?: string;
  } | null>(null);
  const { connectionDetails, refreshConnectionDetails, setConnectionDetailsExternal } =
    useConnectionDetails({ autoFetch: false });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarLabelsVisible, setSidebarLabelsVisible] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [conversationTitleOverride, setConversationTitleOverride] = useState<string | null>(null);

  const isMeMode = mode === 'me';
  const isPublicUnauthed = mode === 'public' && !sessionUser;
  const showSidebar = !isPublicUnauthed;

  // 控制侧边栏文字在展开动画结束后再显示，避免宽度很窄时文字竖排闪烁
  useEffect(() => {
    // 侧边栏收起时，不显示文字
    if (sidebarCollapsed) {
      setSidebarLabelsVisible(false);
      return;
    }
    // 展开时，等待宽度动画完成后再显示文字
    const timer = window.setTimeout(() => {
      setSidebarLabelsVisible(true);
    }, 260); // 与 transition duration 300ms 匹配，略小一点更自然

    return () => window.clearTimeout(timer);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onDisconnected = () => {
      setSessionStarted(false);
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
  }, [room]);

  useEffect(() => {
    let aborted = false;
    if (sessionStarted && room.state === 'disconnected' && connectionDetails) {
      const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
      if (!isSecureContext && !insecureContextToastShownRef.current) {
        insecureContextToastShownRef.current = true;
        toastAlert({
          title: '浏览器安全限制',
          description:
            '麦克风/摄像头仅在 HTTPS 或 localhost 下可用。当前为非安全上下文，语音能力将不可用；如需在局域网 IP 调试，请使用 HTTPS（`pnpm dev -- --experimental-https`）或在 Chrome 中将该地址加入 “Unsafely treat insecure origin as secure”。',
        });
      }
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

      const connectToRoom = async () => {
        const connectPromise = room.connect(
          connectionDetails.serverUrl,
          connectionDetails.participantToken
        );

        if (!isSecureContext) {
          await connectPromise;
          return;
        }

        await connectPromise;
      };

      void connectToRoom().catch((error) => {
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

  // Public mode: auto-start a session (ChatGPT-like, no "Start" gating).
  useEffect(() => {
    if (mode !== 'public') return;
    if (!sessionStarted) {
      setSessionStarted(true);
    }
    void refreshConnectionDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const { startButtonText } = appConfig;

  // 后端通过 connection-details 返回 conv_id（与 timeline.conversation_id 对齐）
  const conversationId =
    (connectionDetails as any)?.conv_id && typeof (connectionDetails as any).conv_id === 'string'
      ? ((connectionDetails as any).conv_id as string)
      : null;
  const roomName =
    connectionDetails && typeof (connectionDetails as any).roomName === 'string'
      ? ((connectionDetails as any).roomName as string)
      : null;

  const { projects } = useMeProjects({ enabled: isMeMode });

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
      const conv = data?.conversation;

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

      setConversationTitleOverride(conv?.title ?? null);
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

  function handleWelcomeStartCall(opts?: {
    ticket?: string;
    displayName?: string;
    prefillMessage?: string;
  }) {
    setStartPayload(opts ?? null);
    setSessionStarted(true);
    const displayName = opts?.displayName?.trim();
    void refreshConnectionDetails(
      opts?.ticket
        ? {
            ticket: opts.ticket,
            profile: displayName ? { display_name: displayName } : undefined,
          }
        : displayName
          ? { profile: { display_name: displayName } }
          : undefined
    );
  }

  return (
    <>
      <RoomContext.Provider value={room}>
        <ClientLogProvider room={room} conversationId={conversationId} roomName={roomName}>
          <AppShell
            appConfig={appConfig}
            mode={mode}
            sessionUser={sessionUser}
            sessionStarted={sessionStarted}
            startButtonText={startButtonText}
            startPayload={startPayload}
            onStartFromWelcome={handleWelcomeStartCall}
            onCreateConversation={handleCreateConversation}
            creatingConversation={creatingConversation}
            showSidebar={showSidebar}
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            sidebarLabelsVisible={sidebarLabelsVisible}
            projects={projects}
            currentProject={currentProject}
            currentProjectId={currentProjectId}
            setCurrentProjectId={setCurrentProjectId}
            projectMenuOpen={projectMenuOpen}
            setProjectMenuOpen={setProjectMenuOpen}
            conversationTitleOverride={conversationTitleOverride}
            conversationId={conversationId}
            initialMessage={mode === 'me' ? null : (startPayload?.prefillMessage ?? null)}
          />
        </ClientLogProvider>
      </RoomContext.Provider>

      <Toaster />
    </>
  );
}

type ModelPreset = 'standard' | 'thinking' | 'fast';

const MODEL_PRESET_STORAGE_KEY = 'app:model_preset';

const MODEL_PRESETS: Array<{ value: ModelPreset; label: string; hint: string }> = [
  { value: 'standard', label: '标准', hint: '平衡速度与效果' },
  { value: 'thinking', label: 'Thinking', hint: '更强推理（更慢）' },
  { value: 'fast', label: '极速', hint: '更快响应（更轻）' },
];

interface AppShellProps {
  appConfig: AppConfig;
  mode: AppMode;
  sessionUser?: { display_name?: string | null; email?: string | null } | null;
  sessionStarted: boolean;
  startButtonText: string;
  startPayload: { ticket?: string; displayName?: string; prefillMessage?: string } | null;
  initialMessage: string | null;
  onStartFromWelcome: (opts?: {
    ticket?: string;
    displayName?: string;
    prefillMessage?: string;
  }) => void;
  onCreateConversation: () => Promise<void>;
  creatingConversation: boolean;
  showSidebar: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (next: boolean | ((prev: boolean) => boolean)) => void;
  sidebarLabelsVisible: boolean;
  projects: MeProjectSummary[];
  currentProject: MeProjectSummary | null;
  currentProjectId: number | null;
  setCurrentProjectId: (id: number | null) => void;
  projectMenuOpen: boolean;
  setProjectMenuOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  conversationTitleOverride: string | null;
  conversationId: string | null;
}

function AppShell({
  appConfig,
  mode,
  sessionUser,
  sessionStarted,
  startButtonText,
  initialMessage,
  onStartFromWelcome,
  onCreateConversation,
  creatingConversation,
  showSidebar,
  sidebarCollapsed,
  setSidebarCollapsed,
  sidebarLabelsVisible,
  projects,
  currentProject,
  currentProjectId,
  setCurrentProjectId,
  projectMenuOpen,
  setProjectMenuOpen,
  conversationTitleOverride,
  conversationId,
}: AppShellProps) {
  const router = useRouter();
  const isMeMode = mode === 'me';
  const isPublicUnauthed = mode === 'public' && !sessionUser;

  // Used for export action in the top bar.
  const { messages } = useConversationMessagesV1(conversationId);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsContainerRef = useRef<HTMLDivElement | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const [modelPreset, setModelPreset] = useState<ModelPreset>('standard');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(MODEL_PRESET_STORAGE_KEY) as ModelPreset | null;
      if (saved && MODEL_PRESETS.some((p) => p.value === saved)) {
        setModelPreset(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MODEL_PRESET_STORAGE_KEY, modelPreset);
    } catch {}
  }, [modelPreset]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMobileSidebarOpen(false);
      setSettingsOpen(false);
      setAccountMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = settingsContainerRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = accountMenuContainerRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onPointerDown);
    };
  }, [accountMenuOpen]);

  const modelLabel = MODEL_PRESETS.find((p) => p.value === modelPreset)?.label ?? '标准';

  const conversationTitle =
    conversationTitleOverride?.trim() ||
    (conversationId ? `会话 ${conversationId.slice(0, 8)}` : isMeMode ? '新会话' : '医保咨询');

  const conversationSubtitle = isMeMode
    ? currentProject?.name
      ? `项目：${currentProject.name}`
      : '我的空间'
    : modelLabel;

  async function handleShare() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toastAlert({ title: '已复制分享链接', description: url });
    } catch {
      toastAlert({ title: '复制失败', description: '浏览器未授予剪贴板权限，请手动复制地址栏链接。' });
    }
  }

  function handleExport() {
    if (typeof window === 'undefined') return;
    try {
      const md = exportMessagesToMarkdown({
        title: conversationTitle,
        modelLabel,
        messages,
      });
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildExportFilename({
        conversationId,
        title: conversationTitle,
      });
      a.click();
      URL.revokeObjectURL(url);
      toastAlert({ title: '已导出对话', description: a.download });
    } catch (e: any) {
      toastAlert({
        title: '导出失败',
        description: e?.message || '未知错误',
      });
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      router.refresh();
    }
  }

  const accountName = sessionUser?.display_name?.trim() || sessionUser?.email?.trim() || null;
  const accountSub = sessionUser?.display_name?.trim() ? sessionUser?.email?.trim() || null : null;
  const avatarText = (accountName || '访客').slice(0, 1).toUpperCase();
  const sidebarWidth = showSidebar ? (sidebarCollapsed ? '64px' : '240px') : '0px';

  return (
    <div
      className="relative flex h-svh"
      style={{ '--app-sidebar-width': sidebarWidth } as CSSProperties}
    >
      {/* Desktop sidebar */}
      {showSidebar && (
        <aside
          className={cn(
            'hidden h-full flex-col border-r border-border bg-sidebar/80 pb-4 pt-4 md:flex transition-[width] duration-300',
            sidebarCollapsed ? 'w-16 px-2' : 'w-60 px-4'
          )}
        >
          {/* Close sidebar (ChatGPT-like) */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={cn(
              'mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted',
              sidebarCollapsed ? 'mx-auto' : 'ml-1'
            )}
            title={sidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            {sidebarCollapsed ? (
              <CaretDoubleRight className="h-4 w-4" />
            ) : (
              <CaretDoubleLeft className="h-4 w-4" />
            )}
          </button>

          {/* Brand (ChatGPT-like) */}
          <a
            href="/"
            className={cn(
              'mb-4 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted',
              sidebarCollapsed ? 'justify-center' : 'justify-start'
            )}
          >
            <img
              src="/yulin-mhsa-mark.svg"
              alt={appConfig.pageTitle}
              className="block h-7 w-auto dark:hidden"
            />
            <img
              src="/yulin-mhsa-mark-dark.svg"
              alt={appConfig.pageTitle}
              className="hidden h-7 w-auto dark:block"
            />
            {!sidebarCollapsed && (
              <span className="truncate text-sm font-semibold">{appConfig.pageTitle}</span>
            )}
          </a>

            <nav className="flex-1 space-y-1 text-sm">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted',
                  sidebarCollapsed ? 'text-foreground' : 'gap-2 text-left font-medium text-foreground'
                )}
              >
                <ChatsCircle className="h-4 w-4" weight="fill" />
                {sidebarLabelsVisible && <span>会话</span>}
              </button>
              {isMeMode && (
                <button
                  type="button"
                  onClick={onCreateConversation}
                  disabled={creatingConversation}
                  className={cn(
                    'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted',
                    sidebarCollapsed
                      ? 'text-muted-foreground'
                      : 'gap-2 text-left text-muted-foreground'
                  )}
                >
                  <PlusCircle className="h-4 w-4" />
                  {sidebarLabelsVisible && (
                    <span>{creatingConversation ? '创建中…' : '新建会话'}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted hover:text-foreground',
                  sidebarCollapsed ? 'text-muted-foreground' : 'gap-2 text-left text-muted-foreground'
                )}
              >
                <ClockCounterClockwise className="h-4 w-4" />
                {sidebarLabelsVisible && <span>时间线</span>}
              </button>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-2 hover:bg-muted hover:text-foreground',
                  sidebarCollapsed ? 'text-muted-foreground' : 'gap-2 text-left text-muted-foreground'
                )}
              >
                <SquaresFour className="h-4 w-4" />
                {sidebarLabelsVisible && <span>工作区</span>}
              </button>
            </nav>

            {/* Account menu (ChatGPT-like bottom-left) */}
            <div className="mt-4 border-t border-border/60 pt-3">
              <div ref={accountMenuContainerRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    if (sidebarCollapsed) {
                      setSidebarCollapsed(false);
                      if (typeof window !== 'undefined') {
                        window.setTimeout(() => setAccountMenuOpen(true), 0);
                      } else {
                        setAccountMenuOpen(true);
                      }
                      return;
                    }
                    setAccountMenuOpen((v) => !v);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-left hover:bg-muted',
                    sidebarCollapsed && 'justify-center px-2',
                    accountMenuOpen && !sidebarCollapsed && 'bg-muted'
                  )}
                  aria-label="Account"
                  aria-expanded={accountMenuOpen}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-sm font-semibold">
                    {avatarText}
                  </div>
                  {!sidebarCollapsed && (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{accountName ?? '未登录'}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {sessionUser
                            ? currentProject?.org_id || currentProject?.name || 'Personal account'
                            : '公众模式'}
                        </div>
                      </div>
                      <CaretDown
                        className={cn('h-4 w-4 text-muted-foreground transition-transform', accountMenuOpen && 'rotate-180')}
                      />
                    </>
                  )}
                </button>

                {accountMenuOpen && !sidebarCollapsed && (
                  <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-2xl border border-border/60 bg-popover/95 p-2 shadow-md backdrop-blur">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 px-2 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserCircle className="h-5 w-5 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {accountName ?? '未登录'}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {accountSub ?? (sessionUser ? '' : '点击下方登录')}
                          </div>
                        </div>
                      </div>
                      {sessionUser && isMeMode && (
                        <button
                          type="button"
                          onClick={() => {
                            toastAlert({ title: '未实现', description: '暂未提供新增工作区能力' });
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:bg-muted"
                          title="Add workspace"
                          aria-label="Add workspace"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Workspaces (projects) */}
                    {sessionUser && isMeMode && (
                      <div className="px-1 pb-1">
                        <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                          工作区
                        </div>
                        <div className="space-y-1">
                          {projects.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">暂无工作区</div>
                          ) : (
                            projects.map((p) => {
                              const isSelected = p.id === (currentProjectId ?? currentProject?.id);
                              const isDisabled = p.status === 'archived';
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  disabled={isDisabled}
                                  onClick={() => {
                                    if (isDisabled) return;
                                    setCurrentProjectId(p.id);
                                    setAccountMenuOpen(false);
                                  }}
                                  className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted',
                                    isSelected && 'bg-muted/70',
                                    isDisabled && 'opacity-60'
                                  )}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate font-medium">{p.name}</div>
                                    <div className="text-muted-foreground truncate text-[11px]">
                                      {p.org_id || 'Personal account'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {p.status === 'archived' && (
                                      <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                        DEACTIVATED
                                      </span>
                                    )}
                                    {isSelected && <Check className="h-4 w-4 text-foreground" />}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <div className="my-2 h-px bg-border/60" />

                    {/* Actions */}
                    <div className="space-y-1 px-1 pb-1">
                      <button
                        type="button"
                        onClick={() => toastAlert({ title: '未实现', description: 'Add teammates' })}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      >
                        <UsersThree className="h-4 w-4 text-muted-foreground" />
                        <span>Add teammates</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toastAlert({ title: '未实现', description: 'Workspace settings' })
                        }
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      >
                        <GearSix className="h-4 w-4 text-muted-foreground" />
                        <span>Workspace settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toastAlert({ title: '未实现', description: 'Personalization' })
                        }
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      >
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                        <span>Personalization</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      >
                        <GearSix className="h-4 w-4 text-muted-foreground" />
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toastAlert({ title: '未实现', description: 'Help' })}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                      >
                        <Question className="h-4 w-4 text-muted-foreground" />
                        <span>Help</span>
                      </button>
                    </div>

                    <div className="my-2 h-px bg-border/60" />

                    <div className="px-1 pb-1">
                      {sessionUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            void handleLogout();
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                        >
                          <SignOut className="h-4 w-4 text-muted-foreground" />
                          <span>Log out</span>
                        </button>
                      ) : (
                        <a
                          href="/login"
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                        >
                          <SignOut className="h-4 w-4 text-muted-foreground" />
                          <span>Login</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
      )}

      {/* Main column */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Top bar: session-level toolbar (model / title / share) */}
	        <header className="sticky top-0 z-50 flex h-[var(--app-topbar-height,56px)] w-full items-center border-b border-border/60 bg-background/80 backdrop-blur">
	          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-3 md:px-0">
	            <div className="flex items-center gap-2">
	              {showSidebar && (
	                <button
	                  type="button"
	                  onClick={() => setMobileSidebarOpen(true)}
	                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted md:hidden"
	                  aria-label="打开侧边栏"
	                >
	                  <List className="h-4 w-4" />
	                </button>
	              )}
	              <label className="shrink-0">
	                <span className="sr-only">选择模型</span>
	                <select
	                  aria-label="选择模型"
	                  value={modelPreset}
	                  onChange={(e) => setModelPreset(e.target.value as ModelPreset)}
	                  className="h-8 rounded-full border border-border/60 bg-background/40 px-3 text-sm font-medium text-foreground shadow-sm outline-none hover:bg-muted focus:ring-2 focus:ring-ring/30"
	                >
	                  {MODEL_PRESETS.map((p) => (
	                    <option key={p.value} value={p.value}>
	                      {p.label}
	                    </option>
	                  ))}
	                </select>
	              </label>
	            </div>

            <div className="min-w-0 flex-1 px-1">
              <div className="truncate text-sm font-semibold leading-5">{conversationTitle}</div>
              <div className="text-muted-foreground truncate text-[11px] leading-4">
                {conversationSubtitle}
              </div>
            </div>

	            <div className="flex items-center gap-1">
		              {isPublicUnauthed ? (
		                <>
		                  <a
		                    href="/login"
		                    className="inline-flex h-9 items-center justify-center rounded-full border border-border/60 bg-background/40 px-4 text-sm font-semibold text-foreground hover:bg-muted"
		                  >
		                    登录
		                  </a>
		                  <div className="hidden sm:block">
		                    <ThemeToggle className="w-[108px] border-border/60 bg-background/40" />
		                  </div>
		                  <a
		                    href="/terms"
		                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
		                    aria-label="帮助"
	                    title="帮助"
	                  >
	                    <Question className="h-4 w-4" />
	                  </a>
	                </>
	              ) : (
	                <>
	                  <button
	                    type="button"
	                    onClick={handleShare}
	                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
	                    aria-label="分享"
	                  >
	                    <ShareNetwork className="h-4 w-4" />
	                  </button>
	                  <button
	                    type="button"
	                    onClick={handleExport}
	                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
	                    aria-label="导出"
	                  >
	                    <DownloadSimple className="h-4 w-4" />
	                  </button>
	                  <div ref={settingsContainerRef} className="relative">
	                    <button
	                      type="button"
	                      onClick={() => setSettingsOpen((v) => !v)}
	                      className={cn(
	                        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted',
	                        settingsOpen && 'bg-muted text-foreground'
	                      )}
	                      aria-label="设置"
	                      aria-expanded={settingsOpen}
	                    >
	                      <GearSix className="h-4 w-4" />
	                    </button>

	                    {settingsOpen && (
	                      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/60 bg-popover p-3 shadow-md">
	                        <div className="mb-3 flex items-start justify-between gap-2">
	                          <div>
	                            <div className="text-sm font-semibold">设置</div>
	                            <div className="text-muted-foreground mt-0.5 text-xs">
	                              外观与快捷入口
	                            </div>
	                          </div>
	                          <button
	                            type="button"
	                            onClick={() => setSettingsOpen(false)}
	                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
	                            aria-label="关闭设置"
	                          >
	                            <X className="h-4 w-4" />
	                          </button>
	                        </div>

	                        <div className="space-y-3">
	                          <div>
	                            <div className="mb-1 text-xs font-semibold text-muted-foreground">主题</div>
	                            <ThemeToggle />
	                          </div>
	                          <div className="flex items-center justify-between gap-2 text-xs">
	                            <a className="underline underline-offset-4" href="/privacy">
	                              隐私声明
	                            </a>
	                            <a className="underline underline-offset-4" href="/terms">
	                              服务条款
	                            </a>
	                            {!sessionUser && (
	                              <a className="underline underline-offset-4" href="/login">
	                                登录
	                              </a>
	                            )}
	                          </div>
	                        </div>
	                      </div>
	                    )}
	                  </div>
	                </>
	              )}
	            </div>
          </div>
        </header>

        {/* Main content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {mode === 'ticket' && !sessionStarted ? (
            <MotionWelcome
              key="welcome-ticket"
              startButtonText={startButtonText}
              mode="ticket"
              branding={{
                companyName: appConfig.companyName,
                logo: appConfig.logo,
                logoDark: appConfig.logoDark,
              }}
              onStartCall={onStartFromWelcome}
              disabled={sessionStarted}
              fullscreen={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: sessionStarted ? 0 : 1 }}
              transition={{ duration: 0.4, ease: 'linear', delay: 0.1 }}
            />
          ) : mode === 'me' && !sessionStarted ? (
            <MotionWelcome
              key="welcome-me"
              startButtonText={startButtonText}
              mode="me"
              branding={{
                companyName: appConfig.companyName,
                logo: appConfig.logo,
                logoDark: appConfig.logoDark,
              }}
              onStartCall={() => {
                void onCreateConversation();
              }}
              disabled={creatingConversation}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: 'linear', delay: 0.1 }}
            />
          ) : (
            <MotionSessionView
              key="session-view"
              appConfig={appConfig}
              disabled={!sessionStarted}
              sessionStarted={sessionStarted}
              conversationId={conversationId}
              initialMessage={initialMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: sessionStarted ? 1 : 0 }}
              transition={{
                duration: 0.4,
                ease: 'linear',
                delay: sessionStarted ? 0.2 : 0,
              }}
            />
          )}
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {showSidebar && mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="关闭侧边栏"
          />
          <div className="absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col border-r border-border bg-sidebar/95 p-4 backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <img src="/yulin-mhsa-mark.svg" alt="" className="block h-6 w-auto dark:hidden" />
                <img
                  src="/yulin-mhsa-mark-dark.svg"
                  alt=""
                  className="hidden h-6 w-auto dark:block"
                />
                <div className="truncate text-sm font-semibold">{appConfig.pageTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 text-muted-foreground hover:bg-muted"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Project pill (me mode only) */}
            {isMeMode && (
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

            <nav className="flex-1 space-y-1 text-sm">
              <button
                type="button"
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 hover:bg-muted')}
              >
                <ChatsCircle className="h-4 w-4" weight="fill" />
                <span>会话</span>
              </button>
              {isMeMode && (
                <button
                  type="button"
                  onClick={async () => {
                    await onCreateConversation();
                    setMobileSidebarOpen(false);
                  }}
                  disabled={creatingConversation}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-muted'
                  )}
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>{creatingConversation ? '创建中…' : '新建会话'}</span>
                </button>
              )}
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <ClockCounterClockwise className="h-4 w-4" />
                <span>时间线</span>
              </button>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <SquaresFour className="h-4 w-4" />
                <span>工作区</span>
              </button>
            </nav>

            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-sm font-semibold">
                  {avatarText}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{accountName ?? '未登录'}</div>
                  {accountSub && (
                    <div className="text-muted-foreground truncate text-xs">{accountSub}</div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                {sessionUser ? (
                  <LogoutButton />
                ) : (
                  <a
                    href="/login"
                    className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
                  >
                    登录
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildExportFilename(opts: { conversationId: string | null; title: string }) {
  const safeTitle = sanitizeFilenamePart(opts.title).slice(0, 40) || 'chat';
  const safeId = opts.conversationId ? sanitizeFilenamePart(opts.conversationId).slice(0, 12) : '';
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `${safeTitle}${safeId ? `_${safeId}` : ''}_${stamp}.md`;
}

function sanitizeFilenamePart(input: string) {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .trim();
}

function exportMessagesToMarkdown(opts: { title: string; modelLabel: string; messages: UiMessageV1[] }) {
  const lines: string[] = [];
  lines.push(`# ${opts.title}`);
  lines.push('');
  lines.push(`- 导出时间：${new Date().toLocaleString()}`);
  lines.push(`- 模式：${opts.modelLabel}`);
  lines.push('');

  for (const m of opts.messages) {
    const roleLabel =
      m.role === 'human' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System';
    lines.push(`## ${roleLabel}`);
    lines.push('');
    lines.push(m.text || '');
    lines.push('');
  }

  return lines.join('\n');
}
