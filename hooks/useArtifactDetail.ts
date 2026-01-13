'use client';

import * as React from 'react';
import type { ArtifactDetail } from '@/lib/artifacts/types';
import { fetchArtifactDetail } from '@/lib/artifacts/api';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 简单的 Artifact 详情 hook。
 * - 负责合并「初次 HTTP 加载」与后续刷新（当前仅实现首次加载）。
 * - 与页面 / 组件解耦，纯粹作为数据层。
 */
export function useArtifactDetail(params: {
  projectId?: string | null;
  artifactId?: string | null;
}) {
  const [detail, setDetail] = React.useState<ArtifactDetail | null>(null);
  const [status, setStatus] = React.useState<Status>('idle');
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const { projectId, artifactId } = params;

    if (!projectId || !artifactId) {
      setDetail(null);
      setStatus('idle');
      setError(null);
      return;
    }

    let cancelled = false;

    setStatus('loading');
    setError(null);

    (async () => {
      try {
        const data = await fetchArtifactDetail({ projectId, artifactId });
        if (cancelled) return;
        setDetail(data);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[useArtifactDetail] failed to load artifact', err);
        setError(err as Error);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.projectId, params.artifactId]);

  return { detail, status, error } as const;
}


