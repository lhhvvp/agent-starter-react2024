import type { UIPayload } from '@/lib/ui-blocks';

export type TaskViewState = {
  taskId: string;
  payload: UIPayload;
  attributes?: Record<string, string>;
};

type Listener<T> = (value: T) => void;

class TaskRuntimeStore {
  private tasksById = new Map<string, TaskViewState>();
  private listeners: Set<Listener<TaskViewState[]>> = new Set();

  pushFromMessages(
    messages: Array<{
      payload: UIPayload;
      attributes?: Record<string, string>;
    }>
  ) {
    let changed = false;
    for (const m of messages) {
      const attrs = m.attributes ?? {};
      const surface = attrs['x-ui-surface'];
      // 只处理标记为 task 的 UI
      if (surface !== 'task') continue;

      const taskId = attrs['x-task-id'] || m.payload.requestId;
      if (!taskId) continue;

      const prev = this.tasksById.get(taskId);
      const next: TaskViewState = {
        taskId,
        payload: m.payload,
        attributes: attrs,
      };

      // 简单策略：后来的覆盖旧的（无论 messageId 是否变化）
      if (!prev || prev.payload !== next.payload) {
        this.tasksById.set(taskId, next);
        changed = true;
      }
    }

    if (changed) {
      this.emit();
    }
  }

  getTasks(): TaskViewState[] {
    // 按插入顺序返回各任务的最新快照
    return Array.from(this.tasksById.values());
  }

  subscribe(fn: Listener<TaskViewState[]>) {
    this.listeners.add(fn);
    fn(this.getTasks());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const cur = this.getTasks();
    for (const fn of this.listeners) {
      fn(cur);
    }
  }
}

export const TaskRuntime = new TaskRuntimeStore();


