/**
 * MCP Server Registry.
 * Manages named MCP server configurations loaded from the environment.
 */

import { config, MCPServerConfig } from "../config";

export interface McpServerEntry {
  name: string;
  serverConfig: MCPServerConfig;
}

class MCPRegistry {
  private entries: Map<string, MCPServerConfig> = new Map();
  private initialized: boolean = false;

  private initialize(): void {
    if (this.initialized) return;

    for (const serverConfig of config.mcpServers) {
      if (!this.entries.has(serverConfig.name)) {
        this.entries.set(serverConfig.name, serverConfig);
        console.info(`[MCPRegistry] Registered MCP server: ${serverConfig.name}`);
      }
    }

    this.initialized = true;
  }

  /**
   * Get all registered server configurations.
   */
  getAllConfigs(): MCPServerConfig[] {
    this.initialize();
    return Array.from(this.entries.values());
  }

  /**
   * Get a specific server config by name.
   */
  getConfig(name: string): MCPServerConfig | undefined {
    this.initialize();
    return this.entries.get(name);
  }

  /**
   * List all registered server names.
   */
  listServerNames(): string[] {
    this.initialize();
    return Array.from(this.entries.keys());
  }
}

// Global singleton
export const mcpRegistry = new MCPRegistry();
