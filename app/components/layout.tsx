'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Room } from 'livekit-client';
import { RoomContext } from '@livekit/components-react';
import { toastAlert } from '@/components/livekit/alert-toast';
import { ClientLogProvider } from '@/components/client-log/ClientLogProvider';
import useConnectionDetails from '@/hooks/useConnectionDetails';
import { cn } from '@/lib/utils';

export default function ComponentsLayout({ children }: { children: React.ReactNode }) {
  const { connectionDetails } = useConnectionDetails();

  const pathname = usePathname();
  const room = React.useMemo(() => new Room(), []);
  const insecureContextToastShownRef = React.useRef(false);

  React.useEffect(() => {
    if (room.state === 'disconnected' && connectionDetails) {
      const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
      if (!isSecureContext && !insecureContextToastShownRef.current) {
        insecureContextToastShownRef.current = true;
        toastAlert({
          title: '浏览器安全限制',
          description:
            '麦克风/摄像头仅在 HTTPS 或 localhost 下可用。当前为非安全上下文；如需在局域网 IP 调试，请使用 HTTPS（`pnpm dev -- --experimental-https`）或在 Chrome 中将该地址加入 “Unsafely treat insecure origin as secure”。',
        });
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

        await Promise.all([
          room.localParticipant.setMicrophoneEnabled(true, undefined, {
            preConnectBuffer: true,
          }),
          connectPromise,
        ]);
      };

      void connectToRoom().catch((error) => {
        toastAlert({
          title: 'There was an error connecting to the agent',
          description: `${error.name}: ${error.message}`,
        });
      });
    }
    return () => {
      room.disconnect();
    };
  }, [room, connectionDetails]);

  return (
    <div className="mx-auto min-h-svh max-w-3xl space-y-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Quick Start UI overview</h1>
        <p className="text-muted-foreground">
          A quick start UI overview for the LiveKit Voice Assistant.
        </p>
      </header>

      <div className="flex flex-row justify-between border-b">
        <Link
          href="/components/base"
          className={cn(
            'text-fg0 -mb-px cursor-pointer px-4 pt-2 text-xl font-bold tracking-tight uppercase',
            pathname === '/components/base' &&
              'bg-background rounded-t-lg border-t border-r border-l'
          )}
        >
          Base components
        </Link>
        <Link
          href="/components/livekit"
          className={cn(
            'text-fg0 -mb-px cursor-pointer px-4 py-2 text-xl font-bold tracking-tight uppercase',
            pathname === '/components/livekit' &&
              'bg-background rounded-t-lg border-t border-r border-l'
          )}
        >
          LiveKit components
        </Link>
      </div>

      <RoomContext.Provider value={room}>
        <ClientLogProvider room={room} roomName={connectionDetails?.roomName ?? null}>
          <main className="flex w-full flex-1 flex-col items-stretch gap-8">{children}</main>
        </ClientLogProvider>
      </RoomContext.Provider>
    </div>
  );
}
