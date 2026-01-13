'use client';

import * as React from 'react';
import { useUIBlocksChannel } from '@/hooks/useUIBlocksChannel';
import { useUIEventsChannel } from '@/hooks/useUIEventsChannel';
import { UIBlocksRuntime } from '@/lib/ui-blocks/runtime';
import { TaskRuntime } from '@/lib/ui-blocks/taskRuntime';

// Registers TextStream/Chat handlers for both lk.ui.blocks and lk.ui.events
// as early as possible to avoid dropped messages.
export function UIBlocksBootstrap() {
  const { uiMessages } = useUIBlocksChannel();
  const { orderedCalls, uiSnippets } = useUIEventsChannel();

  // Bridge incoming messages/events into a shared runtime store so other
  // components can consume without re-registering TextStream handlers.
  React.useEffect(() => {
    if (!uiMessages.length) return;

    const payloads = uiMessages.map((m) => m.payload);
    UIBlocksRuntime.pushBlocks(payloads);

    // 同时将标记为 Task 的 UI 推入 TaskRuntime，供 Plan/Task 视图使用
    TaskRuntime.pushFromMessages(
      uiMessages
        .filter((m) => m.raw?.attributes && typeof m.raw.attributes['x-ui-surface'] === 'string')
        .map((m) => ({
          payload: m.payload,
          attributes: m.raw.attributes,
        }))
    );
  }, [uiMessages]);

  React.useEffect(() => {
    if (uiSnippets.length) UIBlocksRuntime.pushSnippets(uiSnippets);
  }, [uiSnippets]);

  React.useEffect(() => {
    if (orderedCalls.length) UIBlocksRuntime.upsertCalls(orderedCalls);
  }, [orderedCalls]);
  return null;
}
