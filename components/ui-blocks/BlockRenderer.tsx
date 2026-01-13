'use client';

import * as React from 'react';
import type {
  UIBlock,
  UICardBlock,
  UIActionsBlock,
  UIFormBlock,
  UIButtonBlock,
  UITextBlock,
  UIKVBlock,
  UITableBlock,
} from '@/lib/ui-blocks';
import { useUIBlocksContext } from './context';

export function BlockRenderer({ blocks, msgId }: { blocks: UIBlock[]; msgId?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) => (
        <BlockNode key={b.id || `${b.type}-${Math.random().toString(36).slice(2)}`} block={b} msgId={msgId} />)
      )}
    </div>
  );
}

function BlockNode({ block, msgId }: { block: UIBlock; msgId?: string }) {
  switch (block.type) {
    case 'text':
      return <Text b={block} />;
    case 'kv':
      return <KV b={block} />;
    case 'table':
      return <Table b={block} />;
    case 'card':
      return <Card b={block} msgId={msgId} />;
    case 'actions':
      return <Actions b={block} msgId={msgId} />;
    case 'form':
      return <FormBlock b={block} msgId={msgId} />;
    case 'button':
      return <ButtonBlock b={block} msgId={msgId} />;
    default:
      return null;
  }
}

// ---- Text ----

function Text({ b }: { b: UITextBlock }) {
  const classByVariant: Record<string, string> = {
    muted: 'text-sm text-muted-foreground',
    body: 'text-sm',
    title: 'text-base font-semibold',
    subtitle: 'text-sm font-medium text-muted-foreground',
  };
  const cls = classByVariant[b.variant ?? 'body'];
  return <p className={cls}>{b.content}</p>;
}

// ---- KV ----

function KV({ b }: { b: UIKVBlock }) {
  return (
    <div className="border-border bg-muted/20 rounded-lg border p-3">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {b.items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground w-28 shrink-0 text-xs">{it.key}</dt>
            <dd className="text-sm break-all flex-1">
              <span>{String(it.value)}</span>
              {it.copyable && (
                <button
                  type="button"
                  className="hover:bg-muted ml-2 inline-flex rounded px-1 text-[10px] text-muted-foreground"
                  onClick={() => navigator?.clipboard?.writeText(String(it.value)).catch(() => {})}
                >
                  COPY
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---- Table ----

function Table({ b }: { b: UITableBlock }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {b.columns.map((c) => (
              <th key={c.id} className="px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => (
            <tr key={r.id} className="border-t">
              {b.columns.map((c) => (
                <td key={c.id} className="px-3 py-2">
                  {formatCell(r.cells[c.id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): React.ReactNode {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---- Card ----

function Card({ b, msgId }: { b: UICardBlock; msgId?: string }) {
  return (
    <div className="rounded-lg border">
      {(b.title || b.subtitle) && (
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="min-w-0">
            {b.title && <div className="truncate text-sm font-semibold">{b.title}</div>}
            {b.subtitle && <div className="truncate text-xs text-muted-foreground">{b.subtitle}</div>}
          </div>
        </div>
      )}
      <div className="p-3">
        <BlockRenderer blocks={b.body} msgId={msgId} />
      </div>
    </div>
  );
}

// ---- Actions ----

function Actions({ b, msgId }: { b: UIActionsBlock; msgId?: string }) {
  const { sendUIEvent, current } = useUIBlocksContext();
  const disabled = !!b.state?.disabled || !!b.state?.loading;
  return (
    <div className="flex flex-wrap gap-2">
      {b.items.map((it) => (
        <button
          key={it.id}
          type="button"
          disabled={disabled}
          className={
            'inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm ' +
            (it.style === 'danger'
              ? 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400'
              : it.style === 'secondary'
              ? 'border bg-background hover:bg-muted disabled:opacity-50'
              : 'bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50')
          }
          onClick={() => {
            if (!sendUIEvent || !current) return;
            const callId = `${current.requestId}.${b.id}.${it.id}.${Date.now()}`;
            void sendUIEvent({
              name: 'tool.invoke',
              args: {
                callId,
                requestId: current.requestId,
                messageId: current.messageId,
                origin: { blockId: b.id, actionId: it.id, type: 'actions' },
                tool: {
                  name: it.action.name,
                  argumentsSchemaRef: it.action.argumentsSchemaRef,
                  resultSchemaRef: it.action.resultSchemaRef,
                },
                arguments: it.action.arguments ?? {},
              },
            });
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---- Button ----

function ButtonBlock({ b, msgId }: { b: UIButtonBlock; msgId?: string }) {
  const { sendUIEvent, current } = useUIBlocksContext();
  const disabled = !!b.state?.disabled || !!b.state?.loading;
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        className="bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm"
        onClick={() => {
          if (!sendUIEvent || !current) return;
          const callId = `${current.requestId}.${b.id}.${Date.now()}`;
          void sendUIEvent({
            name: 'tool.invoke',
            args: {
              callId,
              requestId: current.requestId,
              messageId: current.messageId,
              origin: { blockId: b.id, type: 'button' },
              tool: {
                name: b.action.name,
                argumentsSchemaRef: b.action.argumentsSchemaRef,
                resultSchemaRef: b.action.resultSchemaRef,
              },
              arguments: b.action.arguments ?? {},
            },
          });
        }}
      >
        {b.text}
      </button>
    </div>
  );
}

// ---- Form ----

function FormBlock({ b, msgId }: { b: UIFormBlock; msgId?: string }) {
  const { sendUIEvent, current } = useUIBlocksContext();
  const [values, setValues] = React.useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of b.fields) init[f.id] = f.defaultValue ?? '';
    return init;
  });

  const disabled = !!b.state?.disabled || !!b.state?.loading;

  const setField = (id: string, v: any) => setValues((prev) => ({ ...prev, [id]: v }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendUIEvent || !current) return;
    const callId = `${current.requestId}.${b.id}.${Date.now()}`;
    void sendUIEvent({
      name: 'tool.invoke',
      args: {
        callId,
        requestId: current.requestId,
        messageId: current.messageId,
        origin: { blockId: b.id, type: 'form' },
        tool: { name: b.submit.action.name, argumentsSchemaRef: b.submit.action.argumentsSchemaRef, resultSchemaRef: b.submit.action.resultSchemaRef },
        arguments: values,
      },
    });
  };

  return (
    <form className="rounded-lg border p-3" onSubmit={onSubmit}>
      {b.title && <div className="mb-2 text-sm font-semibold">{b.title}</div>}
      <div className="flex flex-col gap-3">
        {b.fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor={`${b.id}-${f.id}`}>
              {f.label}
              {f.required && <span className="ml-1 text-red-600">*</span>}
            </label>
            {renderInputField({ field: f, value: values[f.id], onChange: (v) => setField(f.id, v), disabled })}
            {f.hint && <div className="text-[11px] text-muted-foreground">{f.hint}</div>}
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button
          type="submit"
          disabled={disabled}
          className="bg-primary text-primary-foreground hover:brightness-95 disabled:opacity-50 inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm"
        >
          {b.submit.label ?? 'Submit'}
        </button>
      </div>
    </form>
  );
}

function renderInputField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: UIFormBlock['fields'][number];
  value: any;
  onChange: (v: any) => void;
  disabled?: boolean;
}) {
  const common = {
    id: `${field.id}`,
    name: field.id,
    required: field.required,
    placeholder: field.placeholder,
    disabled: disabled || field.disabled,
    readOnly: field.readonly,
    className:
      'bg-background border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
  } as const;

  switch (field.input) {
    case 'textarea':
      return (
        <textarea
          {...(common as any)}
          rows={4}
          value={value as any}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case 'select':
      return (
        <select {...(common as any)} value={value as any} onChange={(e) => onChange(e.currentTarget.value)}>
          {field.options?.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'number':
      return (
        <input
          {...(common as any)}
          type="number"
          value={value as any}
          onChange={(e) => onChange(e.currentTarget.value === '' ? '' : Number(e.currentTarget.value))}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      );
    case 'date':
      return (
        <input
          {...(common as any)}
          type="date"
          value={value as any}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case 'password':
    case 'email':
    case 'tel':
    case 'text':
    default:
      return (
        <input
          {...(common as any)}
          type={field.input === 'password' ? 'password' : field.input === 'email' ? 'email' : field.input === 'tel' ? 'tel' : 'text'}
          value={value as any}
          onChange={(e) => onChange(e.currentTarget.value)}
          maxLength={field.maxLength}
          pattern={field.pattern}
        />
      );
  }
}

