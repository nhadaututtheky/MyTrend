import pb from '$lib/config/pocketbase';
import type { ClaudeTaskSession, ClaudeTask, ClaudeTodoList } from '$lib/types';

interface TaskSessionsResponse {
  sessions: ClaudeTaskSession[];
}

interface TaskDetailResponse {
  sessionId: string;
  highwatermark: number;
  tasks: ClaudeTask[];
}

interface TodoListsResponse {
  todoLists: ClaudeTodoList[];
}

export async function fetchTaskSessions(): Promise<ClaudeTaskSession[]> {
  const res = await pb.send<TaskSessionsResponse>('/api/mytrend/tasks/sessions', {
    method: 'GET',
  });
  return res.sessions;
}

export async function fetchSessionTasks(sessionId: string): Promise<TaskDetailResponse> {
  return pb.send<TaskDetailResponse>(`/api/mytrend/tasks/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
  });
}

export async function fetchTodoLists(): Promise<ClaudeTodoList[]> {
  const res = await pb.send<TodoListsResponse>('/api/mytrend/tasks/todos', {
    method: 'GET',
  });
  return res.todoLists;
}
