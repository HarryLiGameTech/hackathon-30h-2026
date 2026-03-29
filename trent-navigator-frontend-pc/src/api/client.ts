/**
 * Non-streaming API client for Trent Building Navigator.
 *
 * Uses POST /api/v1/chat/single/toolcalls which reliably returns the full
 * response (including tool steps) as JSON — avoiding all SSE/streaming issues.
 * Tool steps and final content are emitted via callbacks for a uniform interface.
 */

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  'http://localhost:8000/api/v1/chat';
const ENDPOINT = `${API_BASE}/single/toolcalls`;

export interface StreamCallbacks {
  onToolCallStart?: (data: { tool_name: string; arguments: Record<string, unknown> }) => void;
  onToolCallEnd?: (data: { tool_name: string; result: string; status: string }) => void;
  onContentDelta?: (data: { content: string }) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Send a chat message (non-streaming) and receive the complete response.
 */
export function streamChat(
  request: { message: string; session_id?: string },
  callbacks: StreamCallbacks
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = (await response.json()) as {
        steps: Array<{
          tool_name: string;
          arguments: Record<string, unknown>;
          result: string;
          status: string;
        }>;
        final_message: string;
      };

      for (const step of data.steps ?? []) {
        callbacks.onToolCallStart?.({
          tool_name: step.tool_name,
          arguments: step.arguments,
        });
        callbacks.onToolCallEnd?.({
          tool_name: step.tool_name,
          result: step.result,
          status: step.status,
        });
      }

      if (data.final_message) {
        callbacks.onContentDelta?.({ content: data.final_message });
      }

      callbacks.onDone?.();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}

/**
 * Transform a slash command into a natural language query.
 */
export function transformCommand(input: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith('/navigate ')) {
    const rest = trimmed.slice('/navigate '.length).trim();
    const toMatch = rest.match(/^(.+?)\s+to\s+(.+)$/i);
    if (toMatch) {
      return `How do I get from ${toMatch[1].trim()} to ${toMatch[2].trim()}?`;
    }
    return `How do I navigate to ${rest}?`;
  }

  if (trimmed.startsWith('/info ')) {
    const nodeName = trimmed.slice('/info '.length).trim();
    return `Tell me all information about ${nodeName}.`;
  }

  if (trimmed.startsWith('/query ')) {
    const rest = trimmed.slice('/query '.length).trim();
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      return `What is the ${parts.slice(1).join(' ')} of ${parts[0]}?`;
    }
    return `What attributes does ${rest} have?`;
  }

  return trimmed;
}
