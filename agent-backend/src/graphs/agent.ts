/**
 * LangGraph ReAct-style agent with MCP tools.
 *
 * Graph structure:
 *   agent → (tool_calls?) → tools → agent → …
 *                         ↓ (no tool calls)
 *                         END
 */

import fs from "fs";
import path from "path";

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { StateGraph, END, Annotation } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";

import { config } from "../config";
import { loadMcpTools } from "../mcp/adapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use __dirname-compatible path in CommonJS (tsconfig targets commonjs)
const PROMPT_PATH = path.join(__dirname, "prompts", "system.prompt.txt");

function loadSystemPrompt(): string {
  try {
    return fs.readFileSync(PROMPT_PATH, "utf-8");
  } catch (err) {
    console.error(`[Agent] Failed to load system prompt from ${PROMPT_PATH}: ${err}`);
    return "You are a helpful assistant.";
  }
}

function buildSystemPromptContent(): string {
  const template = loadSystemPrompt();
  const currentTime = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return template.replace("{currentTime}", currentTime);
}

// ---------------------------------------------------------------------------
// LLM factory
// ---------------------------------------------------------------------------

function createLlm(): BaseChatModel {
  if (config.anthropicApiKey) {
    console.info("[Agent] Using Anthropic LLM");
    return new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.openaiModel.startsWith("claude")
        ? config.openaiModel
        : "claude-3-5-sonnet-latest",
    });
  }

  console.info(`[Agent] Using OpenAI LLM: ${config.openaiModel}`);
  const openaiOptions: ConstructorParameters<typeof ChatOpenAI>[0] = {
    apiKey: config.openaiApiKey,
    model: config.openaiModel,
  };
  if (config.openaiBaseUrl) {
    (openaiOptions as Record<string, unknown>)["configuration"] = {
      baseURL: config.openaiBaseUrl,
    };
  }
  return new ChatOpenAI(openaiOptions);
}

// ---------------------------------------------------------------------------
// State annotation
// ---------------------------------------------------------------------------

const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing: BaseMessage[], incoming: BaseMessage[]) =>
      existing.concat(incoming),
    default: () => [],
  }),
});

type AgentState = typeof AgentStateAnnotation.State;

// ---------------------------------------------------------------------------
// Cached tools + LLM (module-level singletons, lazily initialized)
// ---------------------------------------------------------------------------

let _tools: StructuredToolInterface[] | null = null;
let _llm: BaseChatModel | null = null;

function getLlm(): BaseChatModel {
  if (!_llm) {
    _llm = createLlm();
  }
  return _llm;
}

async function getTools(): Promise<StructuredToolInterface[]> {
  if (_tools === null) {
    _tools = await loadMcpTools();
  }
  return _tools;
}

// ---------------------------------------------------------------------------
// Graph nodes
// ---------------------------------------------------------------------------

async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  const tools = await getTools();
  const llm = getLlm();
  // bindTools is defined on the concrete classes; cast via unknown to avoid
  // the strict BaseChatModel type gap
  const llmWithTools =
    tools.length > 0
      ? (llm as unknown as { bindTools: (t: StructuredToolInterface[]) => BaseChatModel }).bindTools(tools)
      : llm;

  const systemContent = buildSystemPromptContent();
  const systemMsg = new SystemMessage(systemContent);
  const messages: BaseMessage[] = [systemMsg, ...state.messages];

  console.info(`[Agent] Calling LLM with ${tools.length} tool(s) bound`);
  const response = await llmWithTools.invoke(messages);

  const toolCallCount =
    response instanceof AIMessage && Array.isArray(response.tool_calls)
      ? response.tool_calls.length
      : 0;
  console.info(`[Agent] LLM response: tool_calls=${toolCallCount}`);

  return { messages: [response] };
}

async function callToolNode(state: AgentState): Promise<Partial<AgentState>> {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
    return { messages: [] };
  }

  const tools = await getTools();
  const toolMessages: ToolMessage[] = [];

  for (const toolCall of lastMessage.tool_calls) {
    const toolName = toolCall.name;
    const toolArgs = toolCall.args as Record<string, unknown>;

    const tool = tools.find((t) => t.name === toolName);

    if (tool) {
      try {
        const result = await tool.invoke(toolArgs);
        toolMessages.push(
          new ToolMessage({
            content:
              typeof result === "string" ? result : JSON.stringify(result),
            tool_call_id: toolCall.id ?? "",
            name: toolName,
          })
        );
      } catch (err) {
        toolMessages.push(
          new ToolMessage({
            content: `Error calling tool ${toolName}: ${String(err)}`,
            tool_call_id: toolCall.id ?? "",
            name: toolName,
          })
        );
      }
    } else {
      toolMessages.push(
        new ToolMessage({
          content: `Tool "${toolName}" not found`,
          tool_call_id: toolCall.id ?? "",
          name: toolName,
        })
      );
    }
  }

  return { messages: toolMessages };
}

function shouldContinue(state: AgentState): "tools" | typeof END {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];

  if (
    lastMessage instanceof AIMessage &&
    Array.isArray(lastMessage.tool_calls) &&
    lastMessage.tool_calls.length > 0
  ) {
    return "tools";
  }
  return END;
}

// ---------------------------------------------------------------------------
// Compiled graph types
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CompiledAgentGraph = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CompiledBasicGraph = any;

// ---------------------------------------------------------------------------
// Agent graph factory
// ---------------------------------------------------------------------------

function buildAgentGraph(): CompiledAgentGraph {
  // We cast the graph to `any` after addNode/addEdge calls because
  // StateGraph's TypeScript generics for node names are extremely strict and
  // vary between minor LangGraph versions. The runtime behaviour is correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(AgentStateAnnotation) as any;

  graph.addNode("agent", callModel);
  graph.addNode("tools", callToolNode);
  graph.setEntryPoint("agent");
  graph.addConditionalEdges("agent", shouldContinue);
  graph.addEdge("tools", "agent");

  // MemorySaver enables thread_id-based multi-turn memory
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

let _agentGraph: CompiledAgentGraph | null = null;

export function getAgentGraph(): CompiledAgentGraph {
  if (!_agentGraph) {
    _agentGraph = buildAgentGraph();
  }
  return _agentGraph;
}

// ---------------------------------------------------------------------------
// Basic chat graph (no tools, no checkpointer)
// ---------------------------------------------------------------------------

const BasicStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (existing: BaseMessage[], incoming: BaseMessage[]) =>
      existing.concat(incoming),
    default: () => [],
  }),
});

type BasicState = typeof BasicStateAnnotation.State;

async function basicChatNode(state: BasicState): Promise<Partial<BasicState>> {
  const systemMsg = new SystemMessage("You are a helpful assistant.");
  const messages: BaseMessage[] = [systemMsg, ...state.messages];
  const response = await getLlm().invoke(messages);
  return { messages: [response] };
}

function buildBasicGraph(): CompiledBasicGraph {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(BasicStateAnnotation) as any;
  graph.addNode("chat", basicChatNode);
  graph.setEntryPoint("chat");
  graph.addEdge("chat", END);
  return graph.compile();
}

let _basicGraph: CompiledBasicGraph | null = null;

export function getBasicGraph(): CompiledBasicGraph {
  if (!_basicGraph) {
    _basicGraph = buildBasicGraph();
  }
  return _basicGraph;
}
