'use client';

import * as React from 'react';
import type { UIEvent, UIPayload } from '@/lib/ui-blocks';

type UIBlocksContextValue = {
  sendUIEvent?: (e: UIEvent) => Promise<void>;
  current?: Pick<UIPayload, 'requestId' | 'messageId' | 'lang' | 'text'>;
};

const UIBlocksContext = React.createContext<UIBlocksContextValue | undefined>(undefined);

export function UIBlocksProvider({
  value,
  children,
}: {
  value: UIBlocksContextValue;
  children: React.ReactNode;
}) {
  return <UIBlocksContext.Provider value={value}>{children}</UIBlocksContext.Provider>;
}

export function useUIBlocksContext() {
  return React.useContext(UIBlocksContext) ?? {};
}

