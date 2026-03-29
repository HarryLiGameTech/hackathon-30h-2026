/**
 * Universal Agent Backend — TypeScript / Express entry point.
 *
 * Start with:
 *   npm run dev   (ts-node-dev, hot-reload)
 *   npm start     (compiled JS from dist/)
 */

import express from "express";
import cors from "cors";

import { config } from "./config";
import { chatRouter } from "./routes/chat";

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();

// CORS — allow all origins (hackathon MVP)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
    credentials: true,
  })
);

// Body parsers — support JSON objects AND raw strings
app.use(express.json({ type: ["application/json", "text/plain"] }));
app.use(express.text({ type: "text/plain" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

// Root
app.get("/", (_req, res) => {
  res.json({ message: "Universal Agent Backend (TypeScript)" });
});

// Chat API
app.use("/api/v1/chat", chatRouter);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.info(`[Server] Universal Agent Backend listening on http://0.0.0.0:${PORT}`);
  console.info(`[Server] OpenAI model: ${config.openaiModel}`);
  console.info(`[Server] MCP servers configured: ${config.mcpServers.length}`);

  if (config.debug) {
    console.info("[Server] DEBUG mode enabled");
  }
});

// Disable all server-level timeouts so SSE connections stay open while LLM runs
server.timeout = 0;
server.keepAliveTimeout = 60_000;
server.headersTimeout = 65_000;

export default app;
