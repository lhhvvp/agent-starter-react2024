'use client';

import * as React from 'react';
import type { LiveKitClientLogger } from '@/lib/client-log/logger';

export type ClientLogger = Pick<LiveKitClientLogger, 'debug' | 'info' | 'warn' | 'error' | 'flush'>;

const noop: ClientLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  flush: () => {},
};

export const ClientLogContext = React.createContext<ClientLogger>(noop);
