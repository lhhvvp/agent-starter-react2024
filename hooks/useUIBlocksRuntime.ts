import * as React from 'react';
import { UIBlocksRuntime, type RuntimeCallState } from '@/lib/ui-blocks/runtime';
import type { UIPayload } from '@/lib/ui-blocks';

export function useUIBlocksRuntime() {
  const [blocks, setBlocks] = React.useState<UIPayload[]>(() => UIBlocksRuntime.getBlocks());
  const [calls, setCalls] = React.useState<RuntimeCallState[]>(() => UIBlocksRuntime.getCalls());
  const [snippets, setSnippets] = React.useState<UIPayload[]>(() => UIBlocksRuntime.getSnippets());

  React.useEffect(() => UIBlocksRuntime.subscribeBlocks(setBlocks), []);
  React.useEffect(() => UIBlocksRuntime.subscribeCalls(setCalls), []);
  React.useEffect(() => UIBlocksRuntime.subscribeSnippets(setSnippets), []);

  return { blocks, calls, snippets } as const;
}

