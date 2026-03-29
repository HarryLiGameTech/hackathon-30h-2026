// ============================================================
// Domain types for Trent Building Navigator chat frontend
// ============================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export type ToolCallStatus = 'running' | 'success' | 'error';

export interface ToolCallStep {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
  startedAt: number;
  endedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Tool call steps associated with this assistant message */
  steps?: ToolCallStep[];
  /** Whether this message is still being streamed */
  streaming?: boolean;
  timestamp: number;
}

// ============================================================
// SSE event payloads from POST /api/v1/chat/single/toolcalls/stream/v2
// ============================================================

export interface SSETaskCreated {
  task_id: string;
  session_id: string;
}

export interface SSEToolCallStart {
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface SSEToolCallEnd {
  tool_name: string;
  result: string;
  status: 'success' | 'error';
}

export interface SSEContentDelta {
  content: string;
}

export interface SSECancelled {
  task_id: string;
  reason: string;
}

export interface SSEDone {
  status: string;
}

export type SSEEventType =
  | 'task_created'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'content_delta'
  | 'cancelled'
  | 'done';

// ============================================================
// Command definitions
// ============================================================

export type CommandName = '/navigate' | '/info' | '/query';

export interface CommandDefinition {
  name: CommandName;
  description: string;
  usage: string;
  example: string;
}

export const COMMANDS: CommandDefinition[] = [
  {
    name: '/navigate',
    description: 'Navigate between two locations',
    usage: '/navigate [from] [to]',
    example: '/navigate grand gate room 405',
  },
  {
    name: '/info',
    description: 'Get all information about a location',
    usage: '/info [node_name]',
    example: '/info Arabina',
  },
  {
    name: '/query',
    description: 'Query a specific attribute of a location',
    usage: '/query [node_name] [attribute?]',
    example: '/query ArabinaRestaurant closingTime',
  },
];

// ============================================================
// API request / response
// ============================================================

export interface ChatRequest {
  message: string;
  session_id?: string;
}
