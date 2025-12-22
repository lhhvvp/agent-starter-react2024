import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const USER_MGMT_BASE_URL = process.env.USER_MGMT_BASE_URL;

function getBackendBaseUrl() {
  if (!USER_MGMT_BASE_URL) {
    throw new Error('USER_MGMT_BASE_URL is not defined (required for /api/artifacts proxy)');
  }
  return USER_MGMT_BASE_URL.replace(/\/$/, '');
}

export async function GET(
  request: Request,
  { params }: { params: { artifactId: string } }
) {
  const { artifactId } = params;

  if (!artifactId) {
    return NextResponse.json({ error: 'artifactId is required' }, { status: 400 });
  }

  const incomingUrl = new URL(request.url);
  const projectId = incomingUrl.searchParams.get('project_id');

  if (!projectId) {
    return NextResponse.json({ error: 'project_id query param is required' }, { status: 400 });
  }

  // 从登录流程写入的 session_id cookie 中获取会话令牌，
  // 用于调用后端 project-scoped Artifact API 的 Bearer 验证。
  const cookieJar = await cookies();
  const sessionId = cookieJar.get('session_id')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'not logged in' }, { status: 401 });
  }

  try {
    const base = getBackendBaseUrl();
    const baseProject = `${base}/api/v1/projects/${encodeURIComponent(projectId)}`;

    // 1) 拉取 Artifact 快照（含 content_md）
    const snapshotUrl = `${baseProject}/artifacts/${encodeURIComponent(artifactId)}`;
    const snapshotRes = await fetch(snapshotUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${sessionId}`,
      },
      cache: 'no-store',
    });

    if (!snapshotRes.ok) {
      const text = await snapshotRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Upstream artifact snapshot error',
          status: snapshotRes.status,
          body: text || undefined,
        },
        { status: snapshotRes.status }
      );
    }

    const snapshotRaw = await snapshotRes.json();

    // 2) 拉取历史
    let historyRaw: unknown[] = [];
    const historyUrl = `${baseProject}/artifacts/${encodeURIComponent(artifactId)}/history`;
    const historyRes = await fetch(historyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${sessionId}`,
      },
      cache: 'no-store',
    });

    if (historyRes.ok) {
      historyRaw = await historyRes.json();
    } else if (historyRes.status !== 404) {
      // 404 视为“无历史”，其它错误向前透传
      const text = await historyRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Upstream artifact history error',
          status: historyRes.status,
          body: text || undefined,
        },
        { status: historyRes.status }
      );
    }

    // 3) 适配后端返回结构到前端约定的 ArtifactDetail 结构
    const meta = (snapshotRaw as any)?.meta ?? {};
    const snapshot = {
      id: String(meta.id ?? artifactId),
      title: String(meta.title ?? ''),
      snippet: meta.summary ?? undefined,
      contentMd: String((snapshotRaw as any)?.content_md ?? ''),
      createdAt: String(meta.created_at ?? (snapshotRaw as any)?.version_created_at ?? ''),
      updatedAt: meta.updated_at ?? undefined,
      meta: {
        projectId: meta.project_id,
        kind: meta.kind,
        tags: meta.tags,
        versionId: (snapshotRaw as any)?.version_id,
        versionSummary: (snapshotRaw as any)?.version_summary,
        versionCreatedAt: (snapshotRaw as any)?.version_created_at,
        versionCreatedBy: (snapshotRaw as any)?.version_created_by,
      },
    };

    const history =
      Array.isArray(historyRaw)
        ? historyRaw.map((h: any, idx: number) => ({
            id: String(h.project_run_id ?? h.id ?? `${artifactId}-hist-${idx}`),
            artifactId: String(artifactId),
            createdAt: String(h.occurred_at ?? ''),
            summary: h.summary ?? h.phase ?? undefined,
            actorLabel: h.actor_name ?? h.actor_id ?? undefined,
          }))
        : [];

    return NextResponse.json({ snapshot, history }, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/artifacts] proxy error', error);
    return NextResponse.json({ error: 'Internal artifacts proxy error' }, { status: 500 });
  }
}

