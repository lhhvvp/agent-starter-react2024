import { headers } from 'next/headers';
import { App } from '@/components/app';
import { getAppConfig } from '@/lib/utils';

export default async function TicketsPage() {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);

  // tickets 路由保留原有 ticket 模式行为，不做登录强制校验
  return <App appConfig={appConfig} mode="ticket" />;
}


