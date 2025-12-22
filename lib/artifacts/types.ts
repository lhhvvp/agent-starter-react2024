export interface ArtifactSnapshot {
  id: string;
  /**
   * 由后端生成的 Artifact 标题。用于 Workspace 与时间线等处展示。
   */
  title: string;
  /**
   * 精简摘要，可选。通常来自模型总结或用户输入。
   */
  snippet?: string;
  /**
   * Artifact 主体内容，使用 Markdown 文本表示。
   */
  contentMd: string;
  /**
   * 创建时间 ISO 字符串。
   */
  createdAt: string;
  /**
   * 最近一次更新时间 ISO 字符串。
   */
  updatedAt?: string;
  /**
   * 额外的领域元数据（标签、所属项目等）。
   */
  meta?: Record<string, unknown>;
}

export interface ArtifactHistoryEntry {
  id: string;
  artifactId: string;
  /**
   * 本次变更的时间。
   */
  createdAt: string;
  /**
   * 简要说明本次变更内容。
   */
  summary?: string;
  /**
   * 触发变更的主体（用户 / Agent 名称等）。
   */
  actorLabel?: string;
}

export interface ArtifactDetail {
  snapshot: ArtifactSnapshot;
  history: ArtifactHistoryEntry[];
}


