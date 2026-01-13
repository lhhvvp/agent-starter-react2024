import type { UIPayload } from '@/lib/ui-blocks';

export type RuntimeCallState = {
  callId: string;
  requestId?: string;
  messageId?: string;
  origin?: { blockId: string; actionId?: string; type: 'actions' | 'button' | 'form' };
  tool?: { name: string; argumentsSchemaRef?: string; resultSchemaRef?: string };
  progress?: number;
  final?: boolean;
  error?: { code: string; message: string; retriable?: boolean };
  updatedAt?: number;
};

type Listener<T> = (value: T) => void;

class UIBlocksRuntimeStore {
  private blocks: UIPayload[] = [];
  private blockListeners: Set<Listener<UIPayload[]>> = new Set();

  private callsById: Map<string, RuntimeCallState> = new Map();
  private callListeners: Set<Listener<RuntimeCallState[]>> = new Set();

  private snippets: UIPayload[] = [];
  private snippetListeners: Set<Listener<UIPayload[]>> = new Set();

  // UI Blocks
  pushBlocks(payloads: UIPayload[]) {
    let changed = false;
    for (const p of payloads) {
      if (!p || !p.messageId) continue;
      const idx = this.blocks.findIndex((b) => b.messageId === p.messageId);
      if (idx >= 0) {
        // 同一个 messageId 视为“同一条 UI 消息”的不同快照，后来的覆盖之前的
        this.blocks[idx] = p;
      } else {
        this.blocks.push(p);
      }
      changed = true;
    }
    if (changed) this.emitBlocks();
  }

  getBlocks() {
    return this.blocks.slice();
  }

  subscribeBlocks(fn: Listener<UIPayload[]>) {
    this.blockListeners.add(fn);
    fn(this.getBlocks());
    return () => this.blockListeners.delete(fn);
  }

  private emitBlocks() {
    const cur = this.getBlocks();
    for (const fn of this.blockListeners) fn(cur);
  }

  // Calls
  upsertCalls(list: RuntimeCallState[]) {
    let changed = false;
    for (const c of list) {
      const prev = this.callsById.get(c.callId);
      if (!prev || (c.updatedAt ?? 0) > (prev.updatedAt ?? 0)) {
        this.callsById.set(c.callId, { ...prev, ...c });
        changed = true;
      }
    }
    if (changed) this.emitCalls();
  }

  getCalls() {
    return Array.from(this.callsById.values()).sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
  }

  subscribeCalls(fn: Listener<RuntimeCallState[]>) {
    this.callListeners.add(fn);
    fn(this.getCalls());
    return () => this.callListeners.delete(fn);
  }

  private emitCalls() {
    const cur = this.getCalls();
    for (const fn of this.callListeners) fn(cur);
  }

  // UI snippets
  pushSnippets(snips: UIPayload[]) {
    let changed = false;
    const seen = new Set(this.snippets.map((b) => b.messageId));
    for (const s of snips) {
      if (!s || !s.messageId || seen.has(s.messageId)) continue;
      this.snippets.push(s);
      seen.add(s.messageId);
      changed = true;
    }
    if (changed) this.emitSnippets();
  }

  getSnippets() {
    return this.snippets.slice();
  }

  subscribeSnippets(fn: Listener<UIPayload[]>) {
    this.snippetListeners.add(fn);
    fn(this.getSnippets());
    return () => this.snippetListeners.delete(fn);
  }

  private emitSnippets() {
    const cur = this.getSnippets();
    for (const fn of this.snippetListeners) fn(cur);
  }
}

export const UIBlocksRuntime = new UIBlocksRuntimeStore();

