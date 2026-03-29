/**
 * MCP → LangChain Tool Adapter.
 *
 * Uses @langchain/mcp-adapters MultiServerMCPClient to load tools from all
 * registered MCP servers and expose them as LangChain StructuredTool instances.
 *
 * Note: @langchain/mcp-adapters 0.3.x supports "stdio" and "sse" transports.
 * Servers configured with transport: "streamable_http" are mapped to "sse"
 * as the closest equivalent for HTTP-based MCP servers.
 */

import {
  MultiServerMCPClient,
  StdioConnection,
  SSEConnection,
} from "@langchain/mcp-adapters";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { mcpRegistry } from "./registry";
import { MCPServerConfig } from "../config";

type Connection = StdioConnection | SSEConnection;
type ConnectionsMap = Record<string, Connection>;

// Cache of loaded tools (loaded once per process lifetime)
let _cachedTools: StructuredToolInterface[] | null = null;
let _mcpClient: MultiServerMCPClient | null = null;

/**
 * Build the connections map required by MultiServerMCPClient from our registry.
 *
 * Transport mapping:
 *   stdio           → StdioConnection
 *   sse             → SSEConnection
 *   streamable_http → SSEConnection (HTTP-based, closest match in this lib version)
 */
function buildConnectionsMap(configs: MCPServerConfig[]): ConnectionsMap {
  const connections: ConnectionsMap = {};

  for (const cfg of configs) {
    const transport = cfg.transport ?? (cfg.url ? "sse" : "stdio");

    if (transport === "stdio") {
      connections[cfg.name] = {
        transport: "stdio",
        command: cfg.command ?? "",
        args: cfg.args ?? [],
      } satisfies StdioConnection;
    } else {
      // sse or streamable_http → SSEConnection
      connections[cfg.name] = {
        transport: "sse",
        url: cfg.url ?? "",
      } satisfies SSEConnection;
    }
  }

  return connections;
}

/**
 * Load all MCP tools as LangChain StructuredTool instances.
 * Results are cached — subsequent calls return the same list.
 */
export async function loadMcpTools(): Promise<StructuredToolInterface[]> {
  if (_cachedTools !== null) {
    return _cachedTools;
  }

  const configs = mcpRegistry.getAllConfigs();

  if (configs.length === 0) {
    console.warn(
      "[MCPAdapter] No MCP servers configured — running without tools"
    );
    _cachedTools = [];
    return _cachedTools;
  }

  console.info(
    `[MCPAdapter] Loading tools from ${configs.length} MCP server(s): ${configs.map((c) => c.name).join(", ")}`
  );

  const connections = buildConnectionsMap(configs);
  _mcpClient = new MultiServerMCPClient(connections);

  console.info("[MCPAdapter] Initializing MCP connections (this may take a few seconds)...");
  // Must call initializeConnections() before getTools() — getTools() does NOT
  // auto-initialize in @langchain/mcp-adapters 0.3.x
  // Add a timeout so a stuck MCP server doesn't block the request indefinitely.
  await Promise.race([
    _mcpClient.initializeConnections(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("MCP connection timeout (30s)")), 30_000)
    ),
  ]);

  const tools = await _mcpClient.getTools();
  _cachedTools = tools as StructuredToolInterface[];

  console.info(
    `[MCPAdapter] Loaded ${_cachedTools.length} tool(s): ${_cachedTools.map((t) => t.name).join(", ")}`
  );

  return _cachedTools;
}

/**
 * Reset the tool cache (useful for testing or dynamic reload).
 */
export async function resetMcpTools(): Promise<void> {
  _cachedTools = null;
  if (_mcpClient) {
    const clientAny = _mcpClient as unknown as Record<string, unknown>;
    if (typeof clientAny["close"] === "function") {
      await (clientAny["close"] as () => Promise<void>)();
    }
    _mcpClient = null;
  }
}
