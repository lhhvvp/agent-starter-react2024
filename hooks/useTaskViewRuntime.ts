import * as React from 'react';
import { TaskRuntime, type TaskViewState } from '@/lib/ui-blocks/taskRuntime';

export function useTaskViewRuntime() {
  const [tasks, setTasks] = React.useState<TaskViewState[]>(() => TaskRuntime.getTasks());

  React.useEffect(() => TaskRuntime.subscribe(setTasks), []);

  const latestTask = tasks.length ? tasks[tasks.length - 1] : undefined;

  return { tasks, latestTask } as const;
}


