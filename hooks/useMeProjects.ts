'use client';

import { useEffect, useState } from 'react';

export type MeProjectStatus = 'planning' | 'active' | 'done' | 'archived';

export interface MeProjectSummary {
  id: number;
  name: string;
  status: MeProjectStatus;
  brief_artifact_id: number | null;
  org_id: string | null;
  room_id: string | null;
  conversation_id: string | null;
  created_at: string;
  last_active_at: string;
}

interface UseMeProjectsOptions {
  orgId?: string | null;
  limit?: number;
}

interface UseMeProjectsResult {
  projects: MeProjectSummary[];
  loading: boolean;
  error: string | null;
}

export function useMeProjects(options?: UseMeProjectsOptions): UseMeProjectsResult {
  const { orgId, limit } = options ?? {};
  const [projects, setProjects] = useState<MeProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (orgId) params.set('org_id', orgId);
        if (limit != null) params.set('limit', String(limit));
        const query = params.toString();
        const url = query ? `/api/me/projects?${query}` : '/api/me/projects';
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          let message = `加载项目失败（${res.status}）`;
          try {
            const data = await res.json();
            const m =
              data?.error?.message || data?.message || (typeof data === 'string' ? data : null);
            if (m) message = m;
          } catch {
            // ignore
          }
          if (!cancelled) {
            setError(message);
            setProjects([]);
          }
          return;
        }
        const data = (await res.json()) as MeProjectSummary[];
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '加载项目失败');
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [orgId, limit]);

  return { projects, loading, error };
}


