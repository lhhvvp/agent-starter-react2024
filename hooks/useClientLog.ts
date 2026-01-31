'use client';

import * as React from 'react';
import { ClientLogContext } from '@/components/client-log/context';

export function useClientLog() {
  return React.useContext(ClientLogContext);
}
