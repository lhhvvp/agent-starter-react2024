import * as React from 'react';
import { useChat } from '@livekit/components-react';
import type { UIEvent } from '@/lib/ui-blocks';
import { LK_UI_EVENTS_TOPIC, LK_UI_BLOCKS_CONTENT_TYPE, LK_UI_BLOCKS_VERSION } from '@/lib/ui-blocks';

export function useSendUIEvent() {
  const { send } = useChat();
  return React.useCallback(
    async (event: UIEvent) => {
      const msg = JSON.stringify(event);
      const opts = {
        topic: LK_UI_EVENTS_TOPIC,
        attributes: {
          'content-type': LK_UI_BLOCKS_CONTENT_TYPE,
          version: LK_UI_BLOCKS_VERSION,
        },
      } as unknown as { topic?: string; attributes?: Record<string, string> };
      await send(msg, opts as any);
    },
    [send]
  );
}

