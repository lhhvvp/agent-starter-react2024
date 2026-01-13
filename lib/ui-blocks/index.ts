export const LK_UI_BLOCKS_TOPIC = 'lk.ui.blocks' as const;
export const LK_UI_EVENTS_TOPIC = 'lk.ui.events' as const;
export const LK_UI_BLOCKS_CONTENT_TYPE = 'application/vnd.ui-blocks+json' as const;
export const LK_UI_BLOCKS_VERSION = '2' as const;

// Minimal types to align with the schema without adding a runtime validator yet.
export type UIBlockBase = { id: string; type: string; state?: { loading?: boolean; disabled?: boolean; reason?: string } };

export type UITextBlock = UIBlockBase & { type: 'text'; content: string; variant?: 'muted' | 'body' | 'title' | 'subtitle'; format?: 'plain' | 'md' };
export type UIKVItem = { id: string; key: string; value: string; copyable?: boolean };
export type UIKVBlock = UIBlockBase & { type: 'kv'; items: UIKVItem[] };
export type UITableColumn = { id: string; label: string; align?: 'left' | 'center' | 'right'; width?: number };
export type UITableRow = { id: string; cells: Record<string, unknown> };
export type UITableBlock = UIBlockBase & { type: 'table'; columns: UITableColumn[]; rows: UITableRow[] };
export type UICardBlock = UIBlockBase & { type: 'card'; title?: string; subtitle?: string; body: UIBlock[] };
export type UIToolAction = {
  type: 'tool';
  name: string;
  arguments?: Record<string, unknown>;
  argumentsSchema?: Record<string, unknown>;
  argumentsSchemaRef?: string;
  resultSchema?: Record<string, unknown>;
  resultSchemaRef?: string;
};
export type UIActionItem = { id: string; label: string; style?: 'primary' | 'secondary' | 'danger'; action: UIToolAction };
export type UIActionsBlock = UIBlockBase & { type: 'actions'; items: UIActionItem[] };
export type UIFormField = {
  id: string;
  label: string;
  input: 'text' | 'number' | 'textarea' | 'select' | 'tel' | 'email' | 'password' | 'date';
  required: boolean;
  options?: { id: string; label: string }[];
  placeholder?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  pattern?: string;
  hint?: string;
  errorMessage?: string;
  sensitive?: boolean;
  redact?: boolean;
  maskOnClient?: boolean;
  readonly?: boolean;
  disabled?: boolean;
};
export type UIFormBlock = UIBlockBase & { type: 'form'; title?: string; fields: UIFormField[]; submit: { label?: string; action: UIToolAction } };
export type UIButtonBlock = UIBlockBase & { type: 'button'; text: string; action: UIToolAction };
export type UIBlock =
  | UITextBlock
  | UIKVBlock
  | UITableBlock
  | UICardBlock
  | UIActionsBlock
  | UIFormBlock
  | UIButtonBlock;

export type UIPayload = {
  schema: 'ui-blocks@2';
  requestId: string;
  messageId: string;
  lang?: string;
  text?: string;
  blocks: UIBlock[];
};

export type UIEvent =
  | { name: 'tool.invoke'; args: { callId: string; requestId: string; messageId: string; origin: { blockId: string; actionId?: string; type: 'actions' | 'button' | 'form' }; tool: { name: string; argumentsSchemaRef?: string; resultSchemaRef?: string }; arguments: Record<string, unknown> } }
  | { name: 'tool.cancel'; args: { callId: string; reason?: string } }
  | { name: 'tool.result'; args: { callId: string; final: boolean; progress?: number; content?: Record<string, unknown>; output?: Record<string, unknown>; outputSchemaRef?: string; ui?: { text?: string; lang?: string; blocks: UIBlock[] } } }
  | { name: 'tool.error'; args: { callId: string; code: 'INVALID_ARGS' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'PRECONDITION_FAILED' | 'RATE_LIMITED' | 'BACKEND_UNAVAILABLE' | 'TIMEOUT' | 'CANCELLED' | 'INTERNAL'; message: string; retriable?: boolean } }
  | { name: 'ui.rendered'; args: { requestId: string; messageId: string } }
  | { name: 'ui.error'; args: { requestId: string; messageId: string; code: string; message: string } };

