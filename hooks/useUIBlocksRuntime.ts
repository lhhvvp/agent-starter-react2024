import * as React from 'react';
import { UIBlocksRuntime, type RuntimeCallState } from '@/lib/ui-blocks/runtime';
import type { UIPayload } from '@/lib/ui-blocks';

export function useUIBlocksRuntime() {
  const [blocks, setBlocks] = React.useState<UIPayload[]>(() => UIBlocksRuntime.getBlocks());
  const [calls, setCalls] = React.useState<RuntimeCallState[]>(() => UIBlocksRuntime.getCalls());
  const [snippets, setSnippets] = React.useState<UIPayload[]>(() => UIBlocksRuntime.getSnippets());

  React.useEffect(() => {
    const unsubscribe = UIBlocksRuntime.subscribeBlocks(setBlocks);
    return () => {
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    const unsubscribe = UIBlocksRuntime.subscribeCalls(setCalls);
    return () => {
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    const unsubscribe = UIBlocksRuntime.subscribeSnippets(setSnippets);
    return () => {
      unsubscribe();
    };
  }, []);

  return { blocks, calls, snippets } as const;
}
