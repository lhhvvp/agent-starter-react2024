import { useCallback, useEffect, useState } from 'react';
import { ConnectionDetails } from '@/app/api/connection-details/route';
import { toastAlert } from '@/components/alert-toast';

type RefreshOpts = { ticket?: string; profile?: { display_name?: string } };

export default function useConnectionDetails(options?: { autoFetch?: boolean }) {
  // Generate room connection details, including:
  //   - A random Room name
  //   - A random Participant name
  //   - An Access Token to permit the participant to join the room
  //   - The URL of the LiveKit server to connect to
  //
  // In real-world application, you would likely allow the user to specify their
  // own participant name, and possibly to choose from existing rooms to join.

  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

  const fetchConnectionDetails = useCallback(async (opts?: RefreshOpts) => {
    try {
      setConnectionDetails(null);
      const endpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
      const url = new URL(endpoint, window.location.origin);
      if (!opts?.ticket && opts?.profile?.display_name) {
        url.searchParams.set('display_name', opts.profile.display_name);
      }

      const res = await fetch(url.toString(), {
        method: opts?.ticket ? 'POST' : 'GET',
        headers: opts?.ticket ? { 'Content-Type': 'application/json' } : undefined,
        body: opts?.ticket ? JSON.stringify(opts) : undefined,
        cache: 'no-store',
      });

      if (!res.ok) {
        // Map errors for POST branch per spec
        if (opts?.ticket) {
          const status = res.status;
          let title = '连接失败';
          let description: string | undefined;
          if (status === 404) {
            title = '票据无效';
            description = '票据无效，请联系服务方获取新链接';
          } else if (status === 410) {
            title = '票据已过期';
            description = '票据已过期，请重新获取';
          } else if (status === 409) {
            title = '票据已被使用';
            description = '票据已被使用，请使用新的票据';
          } else if (status === 501) {
            title = '未配置用户管理后端';
            description = 'POST 不可用，请设置 USER_MGMT_BASE_URL 或使用无票据方式进入';
          } else if (status >= 500) {
            title = '上游错误';
            description = '上游错误，请稍后再试';
          } else {
            description = `请求失败（${status}）`;
          }
          toastAlert({ title, description });
        }
        throw new Error(`Failed to fetch connection details: ${res.status}`);
      }

      const data = (await res.json()) as ConnectionDetails & { conv_id?: string };

      if (process.env.NODE_ENV !== 'production') {
        try {
          const urlObj = new URL(data.serverUrl);
          const summary = summarizeJwt(data.participantToken);
          // eslint-disable-next-line no-console
          console.info(
            '[conn-details][client] received',
            {
              server: { protocol: urlObj.protocol, host: urlObj.host },
              roomPresent: Boolean(data.roomName),
              participantNameLen: data.participantName?.length ?? 0,
              token: summary,
            },
            '\nfull payload:',
            data
          );
        } catch {
          // ignore
        }
      }

      setConnectionDetails(data);
    } catch (error) {
      console.error('Error fetching connection details:', error);
    }
  }, []);

  const setConnectionDetailsExternal = useCallback((details: ConnectionDetails) => {
    setConnectionDetails(details);
  }, []);

  useEffect(() => {
    if (options?.autoFetch === false) return;
    fetchConnectionDetails();
  }, [fetchConnectionDetails, options?.autoFetch]);

  return {
    connectionDetails,
    refreshConnectionDetails: fetchConnectionDetails,
    setConnectionDetailsExternal,
  };
}

function b64urlDecodeBrowser(input: string) {
  try {
    const pad = (s: string) => s + '==='.slice((s.length + 3) % 4);
    const normalized = pad(input.replace(/-/g, '+').replace(/_/g, '/'));
    return atob(normalized);
  } catch {
    return '';
  }
}

function summarizeJwt(jwt: string) {
  const [h, p] = jwt.split('.');
  let header: Record<string, unknown> | null = null;
  let payload: Record<string, unknown> | null = null;
  try {
    header = h ? (JSON.parse(b64urlDecodeBrowser(h)) as Record<string, unknown>) : null;
  } catch {}
  try {
    payload = p ? (JSON.parse(b64urlDecodeBrowser(p)) as Record<string, unknown>) : null;
  } catch {}
  const payloadKeys = payload ? Object.keys(payload) : [];
  const grants = (payload?.video ?? {}) as Record<string, unknown>;
  const grantSummary: Record<string, unknown> = {};
  if (typeof grants === 'object' && grants) {
    for (const k of ['roomJoin', 'canPublish', 'canPublishData', 'canSubscribe']) {
      if (k in grants) grantSummary[k] = Boolean((grants as any)[k]);
    }
    grantSummary.roomPresent = Boolean((grants as any)['room']);
  }
  const exp = typeof (payload as any)?.exp === 'number' ? (payload as any).exp : undefined;
  const nbf = typeof (payload as any)?.nbf === 'number' ? (payload as any).nbf : undefined;
  return {
    header,
    payloadKeys,
    grantSummary,
    hasSub: typeof (payload as any)?.sub === 'string',
    hasName: typeof (payload as any)?.name === 'string',
    hasIdentity: typeof (payload as any)?.identity === 'string',
    expISO: exp ? new Date(exp * 1000).toISOString() : undefined,
    nbfISO: nbf ? new Date(nbf * 1000).toISOString() : undefined,
  };
}
