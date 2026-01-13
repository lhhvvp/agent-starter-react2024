import { z } from 'zod';

// 所有时间线事件的语义类型（后端应与之对齐）
export const TimelineKindSchema = z.union([
  z.literal('task_created'),
  z.literal('task_status_changed'),
  z.literal('step_started'),
  z.literal('step_finished'),
  z.literal('step_blocked'),
  z.literal('tool_called'),
  z.literal('tool_result'),
  z.literal('artifact_created'),
  z.literal('artifact_updated'),
  z.literal('summary'),
  z.literal('system'),
]);

export type TimelineKind = z.infer<typeof TimelineKindSchema>;

// 单条时间线事件协议
export const TimelineEventSchema = z.object({
  id: z.string(),

  // 协议版本，便于后续演进
  protocol: z.literal('timeline.v1').default('timeline.v1'),

  // 事件来源（服务名 / agent 名等）
  source: z.string().default('core'),

  kind: TimelineKindSchema,

  conversation_id: z.string(),

  org_id: z.string().nullable().optional(),
  task_id: z.string().nullable().optional(),
  step_id: z.string().nullable().optional(),
  artifact_id: z.string().nullable().optional(),
  tool_name: z.string().nullable().optional(),
  run_id: z.string().nullable().optional(),

  // 事件创建时间（秒级时间戳）
  created_at: z.number(),

  // 同一 created_at 内用于稳定排序的序号
  sequence: z.number().nullable().optional(),

  status: z
    .union([
      z.literal('success'),
      z.literal('error'),
      z.literal('info'),
      z.literal('running'),
    ])
    .nullable()
    .optional(),

  summary: z.string().default(''),

  tags: z.array(z.string()).default([]),

  // 事件特定的附加数据；保持弱约束，避免前端被绑死
  data: z.record(z.unknown()).default({}),
});

export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

// LiveKit 可能发单条或数组，这里统一成 TimelineEvent[]
export const TimelineWirePayloadSchema = z
  .union([TimelineEventSchema, z.array(TimelineEventSchema)])
  .transform((v) => (Array.isArray(v) ? v : [v]));



