'use client';

import * as React from 'react';
import type { UIEvent } from '@/lib/ui-blocks';
import { useReliableUIEventSender } from '@/hooks/useReliableUIEventSender';

export function useSendUIEvent() {
  const { sendRaw, sendToolInvokeWithAck } = useReliableUIEventSender();
  return React.useCallback(
    async (event: UIEvent) => {
      // For HITL (tool.invoke), front-end must wait for ui.ack and retry idempotently.
      if (event.name === 'tool.invoke') {
        const res = await sendToolInvokeWithAck(event as any);
        if (!res.ok) throw res.error;
        return;
      }

      await sendRaw(event);
    },
    [sendRaw, sendToolInvokeWithAck]
  );
}
