/**
 * All chat endpoints — mirrors the Python FastAPI chat API.
 *
 * Routes:
 *  POST   /api/v1/chat/basic
 *  POST   /api/v1/chat/basic/stream
 *  POST   /api/v1/chat/single/basic
 *  POST   /api/v1/chat/single/toolcalls
 *  POST   /api/v1/chat/single/toolcalls/stream/v2
 *  DELETE /api/v1/chat/task/:taskId
 *  POST   /api/v1/chat/continue/:taskId
 *  GET    /api/v1/chat/session/:sessionId
 *  GET    /api/v1/chat/task/:taskId
 *  GET    /api/v1/chat/endpoints
 */

import { Router, Request, Response } from "express";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

import { getBasicGraph, getAgentGraph } from "../graphs/agent";
import { sessionManager } from "../core/session";
import { taskManager, TaskCancelledError, CancellationToken } from "../core/taskManager";
import { ChatResponse, ToolCallStep } from "../models/schemas";

export const chatRouter = Router();

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function setSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();
}

function sendSseEvent(res: Response, event: string, data: unknown): void {
  const payload =
    typeof data === "string" ? data : JSON.stringify(data);
  res.write(`event: ${event}\ndata: ${payload}\n\n`);
  console.debug(`[SSE → client] event=${event} data=${payload.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------
// Streaming utility: stream graph events with optional tool events + cancellation
// ---------------------------------------------------------------------------

interface SseEvent {
  event: string;
  data: string;
}

/**
 * Logs the current timestamp (HH:MM:SS.mmm) to help trace timing issues.
 */
function ts(): string {
  const now = new Date();
  return `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

/**
 * Runs graph.invoke() and converts the result into SSE events.
 *
 * `invoke()` (not `stream()`) is used because it reliably passes the
 * RunnableConfig with `configurable.thread_id` to MemorySaver — avoiding the
 * `graph.stream is not a function` error seen with some LangGraph versions.
 *
 * For real token-level streaming the LLM must be in streaming mode and a
 * callback handler must be wired up; for now content is sent as a single
 * `content_delta` once the full response is ready.
 */
async function* streamGraphEvents(
  graph: ReturnType<typeof getAgentGraph> | ReturnType<typeof getBasicGraph>,
  inputs: { messages: HumanMessage[] },
  options: {
    config?: Record<string, unknown>;
    includeTools?: boolean;
    cancelToken?: CancellationToken;
  } = {}
): AsyncGenerator<SseEvent> {
  const { config: graphConfig, includeTools = true, cancelToken } = options;

  try {
    cancelToken?.throwIfCancelled();

    console.info("[streamGraphEvents] Calling graph.invoke()...");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (graph as any).invoke(inputs, graphConfig);
    cancelToken?.throwIfCancelled();
    console.info("[streamGraphEvents] invoke() returned, emitting events");

    // Extract messages from result (can be { messages: [...] } or just [...])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultAny = result as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allMessages: any[] = Array.isArray(resultAny)
      ? resultAny
      : Array.isArray(resultAny.messages)
        ? resultAny.messages
        : [resultAny];

    // First pass: emit tool_call_start for each tool call in AIMessages
    if (includeTools) {
      for (const msg of allMessages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = msg as any;
        if (m.constructor?.name === "AIMessage" && Array.isArray(m.tool_calls)) {
          for (const tc of m.tool_calls) {
            yield {
              event: "tool_call_start",
              data: JSON.stringify({
                event: "tool_call_start",
                tool_name: tc.name ?? "unknown",
                arguments: tc.args ?? {},
              }),
            };
          }
        }
      }
    }

    // Second pass: emit tool_call_end for each ToolMessage
    if (includeTools) {
      for (const msg of allMessages) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = msg as any;
        if (m.constructor?.name === "ToolMessage" || m?.name) {
          yield {
            event: "tool_call_end",
            data: JSON.stringify({
              event: "tool_call_end",
              tool_name: m.name ?? "unknown",
              result:
                typeof m.content === "string"
                  ? m.content
                  : JSON.stringify(m.content ?? ""),
              status: "success",
            }),
          };
        }
      }
    }

    // Third pass: emit content_delta for the final AIMessage content
    let finalContent = "";
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = msg as any;
      if (
        m.constructor?.name === "AIMessage" ||
        m._getType?.() === "ai" ||
        m.role === "assistant"
      ) {
        if (typeof m.content === "string") {
          finalContent = m.content;
        } else if (Array.isArray(m.content)) {
          finalContent = m.content
            .map((block: unknown) =>
              typeof block === "object" && block !== null && "text" in block
                ? (block as { text: string }).text
                : String(block)
            )
            .join("");
        }
        break;
      }
    }

    if (finalContent.trim()) {
      yield {
        event: "content_delta",
        data: JSON.stringify({ event: "content_delta", content: finalContent }),
      };
    }

    yield { event: "done", data: JSON.stringify({ event: "done", status: "complete" }) };
  } catch (err) {
    if (err instanceof TaskCancelledError) {
      throw err;
    }
    console.error("[streamGraphEvents] Unexpected error:", err);
    yield {
      event: "error",
      data: JSON.stringify({ event: "error", message: String(err) }),
    };
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/chat/endpoints
// ---------------------------------------------------------------------------

const ENDPOINT_METADATA = {
  basic: {
    path: "/api/v1/chat/basic",
    label: "Basic Chat",
    description: "Simple LLM conversation without tools",
    streaming: false,
    category: "basic",
  },
  "basic/stream": {
    path: "/api/v1/chat/basic/stream",
    label: "Basic Chat (Streaming)",
    description: "Simple LLM conversation with streaming output",
    streaming: true,
    category: "basic",
  },
  "single/basic": {
    path: "/api/v1/chat/single/basic",
    label: "Agent Chat",
    description: "Single agent conversation with MCP tools",
    streaming: false,
    category: "agent",
  },
  "single/toolcalls": {
    path: "/api/v1/chat/single/toolcalls",
    label: "Agent Chat (with Steps)",
    description: "Single agent conversation showing tool call steps",
    streaming: false,
    category: "agent",
  },
  "single/toolcalls/stream/v2": {
    path: "/api/v1/chat/single/toolcalls/stream/v2",
    label: "Agent Chat (Streaming + Session)",
    description:
      "Multi-turn streaming chat with session, task cancellation and continuation support",
    streaming: true,
    category: "agent",
    features: ["session", "cancellation", "continue"],
  },
};

chatRouter.get("/endpoints", (_req: Request, res: Response) => {
  res.json({
    endpoints: ENDPOINT_METADATA,
    default: "single/toolcalls/stream/v2",
    management_endpoints: {
      cancel_task: "DELETE /api/v1/chat/task/{taskId}",
      continue_task: "POST /api/v1/chat/continue/{taskId}",
      get_session: "GET /api/v1/chat/session/{sessionId}",
      get_task: "GET /api/v1/chat/task/{taskId}",
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/basic  — non-streaming basic chat
// ---------------------------------------------------------------------------

chatRouter.post("/basic", async (req: Request, res: Response) => {
  try {
    const message: string =
      typeof req.body === "string" ? req.body : req.body?.message ?? "";

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const graph = getBasicGraph();
    const result = await graph.invoke({ messages: [new HumanMessage(message)] });
    const lastMessage = result.messages[result.messages.length - 1];
    const content =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    res.json({ message: content });
  } catch (err) {
    console.error("[POST /basic]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/basic/stream  — SSE streaming basic chat
// ---------------------------------------------------------------------------

chatRouter.post("/basic/stream", async (req: Request, res: Response) => {
  const message: string =
    typeof req.body === "string" ? req.body : req.body?.message ?? "";

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  setSseHeaders(res);

  try {
    const graph = getBasicGraph();

    for await (const evt of streamGraphEvents(
      graph,
      { messages: [new HumanMessage(message)] },
      { includeTools: false }
    )) {
      sendSseEvent(res, evt.event, evt.data);
    }
  } catch (err) {
    if (err instanceof TaskCancelledError) {
      sendSseEvent(res, "cancelled", { event: "cancelled", reason: "user_cancelled" });
    } else {
      console.error("[POST /basic/stream]", err);
      sendSseEvent(res, "error", { event: "error", message: String(err) });
    }
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/single/basic  — non-streaming agent chat with MCP tools
// ---------------------------------------------------------------------------

chatRouter.post("/single/basic", async (req: Request, res: Response) => {
  try {
    const message: string =
      typeof req.body === "string" ? req.body : req.body?.message ?? "";

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const graph = getAgentGraph();
    // MemorySaver requires thread_id in configurable — use an ephemeral one per request
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await graph.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId } }
    );
    const lastMessage = result.messages[result.messages.length - 1];
    const content =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    res.json({ message: content });
  } catch (err) {
    console.error("[POST /single/basic]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/single/toolcalls  — structured tool call steps (non-streaming)
// ---------------------------------------------------------------------------

chatRouter.post("/single/toolcalls", async (req: Request, res: Response) => {
  try {
    const message: string =
      typeof req.body === "string" ? req.body : req.body?.message ?? "";

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const graph = getAgentGraph();
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const result = await graph.invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId } }
    );
    const messages = result.messages as (AIMessage | ToolMessage | HumanMessage)[];

    // Build tool_call_id → ToolMessage lookup
    const toolResults = new Map<string, ToolMessage>();
    for (const msg of messages) {
      if (msg instanceof ToolMessage) {
        toolResults.set(msg.tool_call_id, msg);
      }
    }

    // Extract tool call steps from AIMessages
    const steps: ToolCallStep[] = [];
    for (const msg of messages) {
      if (msg instanceof AIMessage && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const resultMsg = toolResults.get(toolCall.id ?? "");
          const resultContent = resultMsg
            ? typeof resultMsg.content === "string"
              ? resultMsg.content
              : JSON.stringify(resultMsg.content)
            : "No result";

          steps.push({
            type: "tool_call",
            tool_name: toolCall.name,
            arguments: toolCall.args as Record<string, unknown>,
            result: resultContent,
            status: resultMsg ? "success" : "error",
          });
        }
      }
    }

    const lastMessage = messages[messages.length - 1];
    const finalMessage =
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);

    const response: ChatResponse = { final_message: finalMessage, steps };
    res.json(response);
  } catch (err) {
    console.error("[POST /single/toolcalls]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/single/toolcalls/stream/v2
// Recommended: streaming with session + task management
// ---------------------------------------------------------------------------

chatRouter.post(
  "/single/toolcalls/stream/v2",
  async (req: Request, res: Response) => {
    // Parse body — accept string (plain message) or object {message, session_id}
    let message: string;
    let sessionId: string | undefined;

    if (typeof req.body === "string") {
      message = req.body;
    } else {
      message = req.body?.message ?? "";
      sessionId = req.body?.session_id as string | undefined;
    }

    console.info(`[v2] Received message: "${message.slice(0, 80)}" session=${sessionId ?? "(new)"}`);

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // 1. Get or create session
    let threadId: string;

    if (sessionId) {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        const [newSessionId, newThreadId] = sessionManager.createSession();
        sessionId = newSessionId;
        threadId = newThreadId;
        console.info(`[v2] Session ${req.body?.session_id} not found, created ${sessionId}`);
      } else {
        threadId = session.thread_id;
        console.info(`[v2] Using existing session ${sessionId}`);
      }
    } else {
      const [newSessionId, newThreadId] = sessionManager.createSession();
      sessionId = newSessionId;
      threadId = newThreadId;
      console.info(`[v2] Created new session ${sessionId}`);
    }

    // 2. Create task
    const [taskId, cancelToken] = taskManager.createTask(sessionId);

    // 3. Set SSE headers
    setSseHeaders(res);

    // Track whether streaming has started — used to distinguish real
    // mid-stream disconnects from OkHttp/proxy spurious closes during invoke().
    let streamingStarted = false;

    // 4. Handle client disconnect → cancel task
    req.on("close", () => {
      // Only treat as a real disconnect once we are actively streaming.
      // During the initial invoke() window, OkHttp (and some proxies) may
      // close the TCP connection after receiving headers — this is NOT a
      // user cancellation and should not cancel the task.
      if (streamingStarted && taskManager.getTask(taskId)?.status === "running") {
        console.info(`[v2] Client disconnected mid-stream — cancelling task ${taskId}`);
        taskManager.cancelTask(taskId);
      }
    });

    // 5. Stream
    try {
      sendSseEvent(res, "task_created", {
        event: "task_created",
        task_id: taskId,
        session_id: sessionId,
      });

      const graph = getAgentGraph();
      const graphConfig = { configurable: { thread_id: threadId } };

      // Use a manual iterator so we can check cancel state after invoke().
      // This prevents spurious close events (e.g. proxy/TCP drops) from
      // being mislabeled as "user_cancelled" — we only treat a cancelled
      // token as user cancellation when it occurs during active streaming.
      const iterator = streamGraphEvents(
        graph,
        { messages: [new HumanMessage(message)] },
        { config: graphConfig, includeTools: true, cancelToken }
      );

      let result: IteratorResult<SseEvent>;
      let streamErr: unknown;

      // Drain the iterator. Because invoke() is blocking, a "close" event
      // from the TCP layer can fire during invoke() and set _cancelled=true
      // — this is NOT a user cancellation. We only treat it as such once we
      // have actually sent at least one event to the client (streaming started).
      while (true) {
        try {
          result = await iterator.next();
        } catch (err) {
          streamErr = err;
          break;
        }
        if (result.done) break;
        streamingStarted = true;
        sendSseEvent(res, result.value.event, result.value.data);
      }

      if (streamErr instanceof TaskCancelledError) {
        // Only emit "cancelled" if we were genuinely streaming when the token
        // was cancelled. If the close fired before any data was sent (e.g.
        // proxy/TCP drop during invoke()), this is a spurious cancellation — emit
        // "done" so the client gets a clean completion instead of a cancel event.
        if (streamingStarted) {
          sendSseEvent(res, "cancelled", {
            event: "cancelled",
            task_id: taskId,
            reason: "user_cancelled",
          });
          console.info(`[v2] Task ${taskId} was cancelled mid-stream`);
        } else {
          console.info(`[v2] Spurious close before streaming — treating as complete`);
          taskManager.completeTask(taskId);
          sessionManager.incrementMessages(sessionId);
        }
      } else if (streamErr != null) {
        console.error("[v2] Unexpected error:", streamErr);
        sendSseEvent(res, "error", { event: "error", message: String(streamErr) });
        taskManager.completeTask(taskId, "error");
      } else {
        taskManager.completeTask(taskId);
        sessionManager.incrementMessages(sessionId);
        console.info(`[v2] Task ${taskId} completed`);
      }
    } finally {
      res.end();
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/chat/task/:taskId  — cancel a running task
// ---------------------------------------------------------------------------

chatRouter.delete("/task/:taskId", (req: Request, res: Response) => {
  const { taskId } = req.params;
  const success = taskManager.cancelTask(taskId);

  if (success) {
    res.json({ status: "cancelled", task_id: taskId });
  } else {
    res.status(404).json({ error: "Task not found or already completed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/chat/continue/:taskId  — continue a cancelled task (SSE)
// ---------------------------------------------------------------------------

chatRouter.post("/continue/:taskId", async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const instruction: string = req.body?.instruction ?? "Please continue.";

  const originalTask = taskManager.getTask(taskId);
  if (!originalTask) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const session = sessionManager.getSession(originalTask.session_id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [newTaskId, cancelToken] = taskManager.createTask(session.session_id);

  const continueMessage =
    `[Continue from previous task: ${taskId}]\n` +
    `Instruction: ${instruction}\n\n` +
    `Please continue your response naturally.`;

  setSseHeaders(res);

  let streamingStarted = false;

  req.on("close", () => {
    if (streamingStarted && taskManager.getTask(newTaskId)?.status === "running") {
      taskManager.cancelTask(newTaskId);
    }
  });

  try {
    sendSseEvent(res, "task_created", {
      event: "task_created",
      task_id: newTaskId,
      session_id: session.session_id,
      continuing_from: taskId,
    });

    const graph = getAgentGraph();
    const graphConfig = { configurable: { thread_id: session.thread_id } };

    const iterator = streamGraphEvents(
      graph,
      { messages: [new HumanMessage(continueMessage)] },
      { config: graphConfig, includeTools: true, cancelToken }
    );

    let result: IteratorResult<SseEvent>;
    let streamErr: unknown;

    while (true) {
      try {
        result = await iterator.next();
      } catch (err) {
        streamErr = err;
        break;
      }
      if (result.done) break;
      streamingStarted = true;
      sendSseEvent(res, result.value.event, result.value.data);
    }

    if (streamErr instanceof TaskCancelledError) {
      if (streamingStarted) {
        sendSseEvent(res, "cancelled", {
          event: "cancelled",
          task_id: newTaskId,
          reason: "user_cancelled",
        });
      } else {
        console.info(`[POST /continue] Spurious close before streaming — treating as complete`);
        taskManager.completeTask(newTaskId);
        sessionManager.incrementMessages(session.session_id);
      }
    } else if (streamErr != null) {
      console.error("[POST /continue]", streamErr);
      sendSseEvent(res, "error", { event: "error", message: String(streamErr) });
      taskManager.completeTask(newTaskId, "error");
    } else {
      taskManager.completeTask(newTaskId);
      sessionManager.incrementMessages(session.session_id);
    }
  } catch (err) {
    console.error("[POST /continue]", err);
    sendSseEvent(res, "error", { event: "error", message: String(err) });
    taskManager.completeTask(newTaskId, "error");
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/chat/session/:sessionId
// ---------------------------------------------------------------------------

chatRouter.get("/session/:sessionId", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    session_id: session.session_id,
    thread_id: session.thread_id,
    created_at: session.created_at,
    updated_at: session.updated_at,
    message_count: session.message_count,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/chat/task/:taskId
// ---------------------------------------------------------------------------

chatRouter.get("/task/:taskId", (req: Request, res: Response) => {
  const { taskId } = req.params;
  const task = taskManager.getTask(taskId);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json({
    task_id: task.task_id,
    session_id: task.session_id,
    status: task.status,
    created_at: task.created_at,
    cancelled_at: task.cancelled_at ?? null,
    error: task.error ?? null,
  });
});
