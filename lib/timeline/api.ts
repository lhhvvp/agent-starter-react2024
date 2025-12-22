import { TimelineEvent, TimelineEventSchema } from '@/lib/timeline/schema';

type FetchConversationTimelineParams = {
  conversationId: string;
  afterTs?: number;
  beforeTs?: number;
  kinds?: string[];
  limit?: number;
};

// 从后端加载某个会话的时间线历史事件
// 前端调用 Next.js 本地 API：GET /api/timeline/{conv_id}
// 由 Next.js 在服务端 proxy 到 Python 后端的 /api/v1/timeline/{conv_id}
export async function fetchConversationTimeline(
  params: FetchConversationTimelineParams
): Promise<TimelineEvent[]> {
  const { conversationId, afterTs, beforeTs, kinds, limit = 200 } = params;

  const search = new URLSearchParams();
  if (afterTs != null) search.set('after_ts', String(afterTs));
  if (beforeTs != null) search.set('before_ts', String(beforeTs));
  if (kinds && kinds.length) search.set('kinds', kinds.join(','));
  if (limit) search.set('limit', String(limit));

  const res = await fetch(`/api/timeline/${encodeURIComponent(conversationId)}?${search.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Failed to load timeline: ${res.status}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error('Timeline API should return an array');
  }

  return json.map((item) => TimelineEventSchema.parse(item));
}


