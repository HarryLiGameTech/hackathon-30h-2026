/**
 * TypeScript types mirroring the Python Pydantic schemas.
 */

export interface ChatRequest {
  message: string;
  session_id?: string;
}

export interface ToolCallStep {
  type: "tool_call";
  tool_name: string;
  arguments: Record<string, unknown>;
  result: string;
  status: "success" | "error";
}

export interface ChatResponse {
  final_message: string;
  steps: ToolCallStep[];
}

// ============ Session & Task Management ============

export type TaskStatus = "running" | "completed" | "cancelled" | "error";

export interface TaskInfo {
  task_id: string;
  session_id: string;
  status: TaskStatus;
  created_at: Date;
  cancelled_at?: Date;
  error?: string;
}

export interface SessionState {
  session_id: string;
  thread_id: string; // LangGraph thread_id
  created_at: Date;
  updated_at: Date;
  message_count: number;
}

// ============ SSE Event Shapes ============

export interface SseTaskCreatedData {
  task_id: string;
  session_id: string;
  continuing_from?: string;
}

export interface SseToolCallStartData {
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface SseToolCallEndData {
  tool_name: string;
  result: string;
  status: "success" | "error";
}

export interface SseContentDeltaData {
  content: string;
}

export interface SseCancelledData {
  task_id: string;
  reason: string;
}

export interface SseDoneData {
  status: "complete";
}
