import type { ArtifactDetail } from '@/lib/artifacts/types';

/**
 * 拉取单个 Artifact 的详情（快照 + 历史）。
 *
 * 对接本地 BFF：
 *   GET /api/artifacts/:artifactId?project_id={projectId}
 * 由 BFF 再代理到后端 project-scoped API：
 *   - GET /api/v1/projects/{project_id}/artifacts/{artifact_id}
 *   - GET /api/v1/projects/{project_id}/artifacts/{artifact_id}/history
 */
export async function fetchArtifactDetail(params: {
  projectId: string;
  artifactId: string;
}): Promise<ArtifactDetail> {
  const { projectId, artifactId } = params;

  if (!projectId) {
    throw new Error('projectId 不能为空');
  }
  if (!artifactId) {
    throw new Error('artifactId 不能为空');
  }

  const search = new URLSearchParams({ project_id: projectId });

  const res = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}?${search.toString()}`);
  if (!res.ok) {
    throw new Error(`加载 Artifact 失败（${res.status}）`);
  }

  const data = (await res.json()) as ArtifactDetail;
  return data;
}


