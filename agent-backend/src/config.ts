import dotenv from "dotenv";
import path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export interface AppConfig {
  port: number;
  debug: boolean;
  openaiApiKey: string;
  openaiModel: string;
  openaiBaseUrl: string | undefined;
  anthropicApiKey: string | undefined;
  mcpServers: MCPServerConfig[];
  langsmithTracing: boolean;
  langsmithEndpoint: string;
  langsmithApiKey: string | undefined;
  langsmithProject: string;
}

export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  transport?: "stdio" | "sse" | "streamable_http";
}

function parseMcpServers(raw: string): MCPServerConfig[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as MCPServerConfig[];
  } catch {
    console.warn("Failed to parse MCP_SERVERS env var, defaulting to []");
    return [];
  }
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT ?? "8000", 10),
  debug: process.env.DEBUG?.toLowerCase() === "true",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  openaiBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  mcpServers: parseMcpServers(process.env.MCP_SERVERS ?? "[]"),
  langsmithTracing: process.env.LANGSMITH_TRACING?.toLowerCase() === "true",
  langsmithEndpoint:
    process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com",
  langsmithApiKey: process.env.LANGSMITH_API_KEY || undefined,
  langsmithProject: process.env.LANGSMITH_PROJECT ?? "universal-agent",
};
