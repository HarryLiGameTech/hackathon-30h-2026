/**
 * toponavi-mcp-server — MCP server for Trent Building indoor navigation
 *
 * Architecture:
 *   LLM Host  ←→  MCP Client  ←→  MCP Server (this file)  ←→  Spring Boot Backend
 *
 * Supported spec cases:
 *   1. Exact pathfinding (A → B with named nodes)
 *   2. Fuzzy pathfinding (destination only as precise as floor)
 *   3. Very-fuzzy navigation (floor → floor, no specific nodes)
 *   4. Normal node-info query (attributes like closing time)
 *   5. O(n) attribute search across all nodes
 *   6. Pathfinding with user preferences (minimize stairs, minimize transfers, etc.)
 *   7. Speculative node query when relevant attributes are absent
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// File logger (stderr is swallowed by the MCP stdio client)
// ---------------------------------------------------------------------------
const LOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp-debug.log");
function log(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  fs.appendFileSync(LOG_FILE, line);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = "http://192.168.50.65:8080/api/v1";
log(`MCP server starting. BASE_URL=${BASE_URL}`);

// ---------------------------------------------------------------------------
// Server instantiation
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "toponavi-mcp-server",
  version: "0.2.0",
});

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Converts a seconds-since-midnight value (as used in topo-script DSL) to a
 * human-readable HH:MM time string.
 * e.g. 79200 → "22:00"
 */
function secondsToTimeOfDay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Converts any numeric attribute value that looks like a seconds-of-day value
 * (0–86400) into an annotated string so the LLM can present it naturally.
 * Attribute names containing time-related keywords trigger the conversion.
 */
function annotateAttributeValue(key: string, value: unknown): string {
  const timeKeys = /time|open|close|hour|start|end/i;
  if (typeof value === "number" && timeKeys.test(key) && value >= 0 && value <= 86400) {
    return `${value} (≈ ${secondsToTimeOfDay(value)})`;
  }
  return String(value);
}

/**
 * Simple fuzzy string matcher — returns a score in [0, 1].
 */
function fuzzyScore(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return 1;
  if (c.includes(q)) return 0.9;
  if (q.includes(c)) return 0.8;
  // character-level prefix overlap
  let overlap = 0;
  const maxLen = Math.min(q.length, c.length);
  for (let i = 0; i < maxLen; i++) {
    if (q[i] === c[i]) overlap++;
  }
  const overlapScore = overlap / Math.max(q.length, c.length);
  const lengthRatio = Math.min(q.length, c.length) / Math.max(q.length, c.length);
  return overlapScore * 0.6 + lengthRatio * 0.3;
}

function findBestMatch(fuzzyName: string, candidates: string[]): string | null {
  if (!candidates?.length) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = fuzzyScore(fuzzyName, c);
    if (s > bestScore && s > 0.4) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// TOOLS
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Fuzzy submap (floor) name → exact name
// ---------------------------------------------------------------------------
server.registerTool(
  "resolve-submap-name",
  {
    title: "Resolve Fuzzy Floor / Submap Name",
    description:
      "Converts a user-supplied fuzzy floor or submap name (e.g. 'floor 1', 'basement', 'B1') to the " +
      "exact submap name used inside the building navigation database. Always call this before " +
      "constructing a node identifier like 'Floor1::SomeNode'.",
    inputSchema: z.object({
      fuzzyName: z
        .string()
        .describe("The floor or submap name as typed by the user, without underscores."),
    }),
  },
  async ({ fuzzyName }) => {
    const response = await axios.get(`${BASE_URL}/quick-demo-available-submaps`);
    const { availableMaps } = response.data;
    const best = findBestMatch(fuzzyName, availableMaps);
    return {
      content: [
        {
          type: "text",
          text: best
            ? `Exact submap name for "${fuzzyName}": ${best}`
            : `No matching submap found for "${fuzzyName}". Available: ${availableMaps?.join(", ")}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// 2. Fuzzy node name → exact node identifier
// ---------------------------------------------------------------------------
server.registerTool(
  "resolve-node-name",
  {
    title: "Resolve Fuzzy Node Name to Exact Node Identifier",
    description:
      "Converts a user-supplied fuzzy node/room/location name (e.g. 'room 405', 'arabina', 'grand gate') " +
      "to the exact node identifier (in '{submap}::{node}' format) used in the navigation database. " +
      "Use this whenever the user mentions a location name that may not be an exact match.",
    inputSchema: z.object({
      fuzzyNodeName: z
        .string()
        .describe("The node, room, or location name as described by the user."),
      mapName: z
        .string()
        .optional()
        .describe(
          "Fuzzy floor or submap hint as given by the user (e.g. '1st floor', 'floor 2', 'basement'). " +
          "Provide this when the user specifies a floor alongside the location; it will be resolved to an exact submap name automatically."
        ),
    }),
  },
  async ({ fuzzyNodeName, mapName }) => {
    let candidates: string[];

    if (mapName) {
      // Resolve fuzzy floor name to exact submap identifier first
      const submapsResponse = await axios.get(`${BASE_URL}/quick-demo-available-submaps`);
      const { availableMaps } = submapsResponse.data as { availableMaps: string[] };
      const exactMapName = findBestMatch(mapName, availableMaps) ?? mapName;

      const response = await axios.get(`${BASE_URL}/quick-demo-available-nodes`, {
        params: { mapName: exactMapName },
      });
      const { availableFiles } = response.data as { availableFiles: string[] };
      // availableFiles are bare node identifiers; prefix them so fuzzy match
      // returns a fully-qualified '{submap}::{node}' result
      candidates = (availableFiles ?? []).map((n) => `${exactMapName}::${n}`);
    } else {
      const allNodesUrl = `${BASE_URL}/quick-demo-all-available-nodes`;
      log(`[resolve-node-name] → GET ${allNodesUrl}`);
      let allNodesResponse: import("axios").AxiosResponse;
      try {
        allNodesResponse = await axios.get(allNodesUrl);
        log(`[resolve-node-name] ← ${allNodesResponse.status}`);
      } catch (err: any) {
        const status = err?.response?.status ?? "NO_RESPONSE";
        const body = err?.response?.data;
        log(`[resolve-node-name] ✗ ${status}`, body ?? err?.message);
        return {
          content: [{
            type: "text" as const,
            text: [
              `[resolve-node-name] HTTP ERROR`,
              `URL: ${allNodesUrl}`,
              `Status: ${status}`,
              `Body: ${JSON.stringify(body ?? err?.message)}`,
            ].join("\n"),
          }],
        };
      }
      const { allNodes } = allNodesResponse.data as { allNodes: string[] | Record<string, unknown> };
      candidates = Array.isArray(allNodes) ? allNodes : Object.keys(allNodes);
    }

    const best = findBestMatch(fuzzyNodeName, candidates);
    return {
      content: [
        {
          type: "text",
          text: best
            ? `Exact node identifier for "${fuzzyNodeName}": ${best}`
            : `No matching node found for "${fuzzyNodeName}". Available nodes: ${candidates?.join(", ")}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// 3. Exact / fuzzy node-to-node navigation  (Specs 1, 2, 3)
// ---------------------------------------------------------------------------
// TODO: Get rid of "any"
server.registerTool(
  "navigate",
  {
    title: "Indoor Navigation — Point to Point",
    description:
      "Finds the optimal route between two locations inside the Trent Building. " +
      "Both startNode and endNode must be exact node identifiers in '{submap}::{node}' format " +
      "(e.g. 'Floor1::GrandGate', 'Floor4::Room405'). " +
      "To navigate to/from an entire floor without a specific node, use the wildcard '_' as the node part " +
      "(e.g. 'Floor1::_'). This handles spec cases 1 (exact), 2 (floor-level destination), " +
      "and 3 (floor-to-floor). " +
      "Returns the route path, step-by-step directions, named waypoints, and estimated travel time.",
    inputSchema: z.object({
      startNode: z
        .string()
        .describe(
          "Exact start node in '{submap}::{node}' format. Use '_' as node for floor-level (e.g. 'Floor1::_')."
        ),
      endNode: z
        .string()
        .describe(
          "Exact end node in '{submap}::{node}' format. Use '_' as node for floor-level (e.g. 'Floor3::_')."
        ),
    }),
  },
  async ({ startNode, endNode }) => {
    const response = await axios.get(`${BASE_URL}/quick-demo-navigation`, {
      params: { startNode, endNode },
    });
    const { steps, path } = response.data;
    const stepsText = steps
      .map((step: any, i: number) => {
        const time = step.costSeconds
          ? ` (${Math.floor(step.costSeconds / 60)}m ${Math.round(step.costSeconds % 60)}s)`
          : "";
        const waypoints =
          step.namedWaypoints?.length
            ? `\n   Waypoints: ${step.namedWaypoints.join(" → ")}`
            : "";
        const desc =
          step.description ||
          `${step.type}: ${step.from || step.fromGraph} → ${step.to || step.toGraph}`;
        return `${i + 1}. ${desc}${time}${waypoints}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Route: ${path}\n\nStep-by-step directions:\n${stepsText}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// 4. Navigation with route preference  (Spec 6)
// ---------------------------------------------------------------------------
// TODO: LLM not using this correctly
server.registerTool(
  "navigate-with-preference",
  {
    title: "Indoor Navigation — With Route Preference",
    description:
      "Finds a route between two locations while honouring a routing preference. " +
      "Use this when the user expresses a preference such as avoiding stairs (carrying heavy/bulky items, " +
      "wheelchair users), minimising elevator transfers, or wanting the fastest route. " +
      "startNode and endNode must be exact '{submap}::{node}' identifiers.",
    inputSchema: z.object({
      startNode: z
        .string()
        .describe("Exact start node in '{submap}::{node}' format."),
      endNode: z
        .string()
        .describe("Exact end node in '{submap}::{node}' format."),
      preference: z
        .enum(["MinimizePhysicalDemands", "MinimizeTransfers", "MinimizeTime"])
        .describe(
          "Route preference: " +
            "'MinimizePhysicalDemands' avoids stairs and long walking distances (good for heavy items or mobility issues); " +
            "'MinimizeTransfers' reduces elevator/escalator changes; " +
            "'MinimizeTime' finds the fastest overall route."
        ),
    }),
  },
  async ({ startNode, endNode, preference }) => {
    const response = await axios.get(`${BASE_URL}/quick-demo-navigation`, {
      params: { startNode, endNode, routePlanningPreference: preference },
    });
    const { steps, path, fromCache } = response.data;
    const stepsText = steps
      .map((step: any, i: number) => {
        const time = step.costSeconds
          ? ` (${Math.floor(step.costSeconds / 60)}m ${Math.round(step.costSeconds % 60)}s)`
          : "";
        const waypoints =
          step.namedWaypoints?.length
            ? `\n   Waypoints: ${step.namedWaypoints.join(" → ")}`
            : "";
        const desc =
          step.description ||
          `${step.type}: ${step.from || step.fromGraph} → ${step.to || step.toGraph}`;
        return `${i + 1}. ${desc}${time}${waypoints}`;
      })
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: [
            `Route (preference: ${preference}): ${path}`,
            fromCache ? "(served from cache)" : "",
            "",
            "Step-by-step directions:",
            stepsText,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// 5. Get specific node info / attributes  (Spec 4)
// ---------------------------------------------------------------------------
server.registerTool(
  "get-node-info",
  {
    title: "Get Node Information & Attributes",
    description:
      "Retrieves all attribute data stored on a specific node (room, facility, or location) " +
      "inside the Trent Building. Use this to answer questions like opening/closing times, " +
      "room purpose, capacity, contact info, etc. " +
      "Numeric time attributes (e.g. closingTime) are automatically converted from seconds-since-midnight to HH:MM. " +
      "The nodeName must be the exact '{submap}::{node}' identifier.",
    inputSchema: z.object({
      nodeName: z
        .string()
        .describe(
          "Exact node identifier in '{submap}::{node}' format (e.g. 'Floor1::ArabinaRestaurant')."
        ),
    }),
  },
  async ({ nodeName }) => {
    const response = await axios.get(`${BASE_URL}/quick-demo-node-info`, {
      params: { nodeName },
    });
    const { name, attributes } = response.data as {
      name: string;
      attributes: Record<string, unknown>;
    };

    if (!attributes || Object.keys(attributes).length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No attribute data found for node "${name ?? nodeName}".`,
          },
        ],
      };
    }

    const attrLines = Object.entries(attributes)
      .map(([k, v]) => `  ${k}: ${annotateAttributeValue(k, v)}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Node: ${name ?? nodeName}\nAttributes:\n${attrLines}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// 6. Get all nodes with attributes — for O(n) / speculative queries  (Specs 5, 7)
// ---------------------------------------------------------------------------
// Completed
server.registerTool(
  "get-all-nodes",
  {
    title: "Get All Nodes With Attributes",
    description:
      "Returns every node in the Trent Building database together with its full attribute set. " +
      "Use this tool to: " +
      "(a) find which node matches a natural-language criterion (e.g. 'where does Jane Doe work'); " +
      "(b) identify nodes that might satisfy a qualitative query when direct attributes are absent " +
      "    (e.g. 'best scenic view') — in that case fall back to inferring from node names and be transparent; " +
      "(c) answer comparative questions (e.g. 'which office is the biggest'). " +
      "Numeric time attributes are automatically annotated with HH:MM equivalents.",
    inputSchema: z.object({
      withNodesAttributes: z
        .boolean()
        .optional()
        .describe(
          "If true, each node is returned with its attribute map. " +
          "Use when you need attribute data (e.g. descriptions, office owners). " +
          "Omit or set false for a lighter listing of node identifiers only."
        ),
    }),
  },
  async ({ withNodesAttributes }) => {
    const params = withNodesAttributes ? { withNodesAttributes: "true" } : {};
    const fullUrl = `${BASE_URL}/quick-demo-all-available-nodes`;
    let response: import("axios").AxiosResponse;
    log(`[get-all-nodes] → GET ${fullUrl}`, params);
    try {
      response = await axios.get(fullUrl, { params });
      log(`[get-all-nodes] ← ${response.status}`);
    } catch (err: any) {
      const status = err?.response?.status ?? "NO_RESPONSE";
      const body = err?.response?.data;
      log(`[get-all-nodes] ✗ ${status}`, body ?? err?.message);
      return {
        content: [{
          type: "text" as const,
          text: [
            `[get-all-nodes] HTTP ERROR`,
            `URL: ${fullUrl}`,
            `Params: ${JSON.stringify(params)}`,
            `Status: ${status}`,
            `Body: ${JSON.stringify(body ?? err?.message)}`,
          ].join("\n"),
        }],
      };
    }
    const { allNodes, message } = response.data as {
      allNodes: string[] | Record<string, Record<string, unknown>>;
      message: string;
    };

    if (!allNodes || (Array.isArray(allNodes) ? allNodes.length === 0 : Object.keys(allNodes).length === 0)) {
      return {
        content: [{ type: "text", text: "No nodes found in the database." }],
      };
    }

    let nodeLines: string;
    let total: number;

    if (Array.isArray(allNodes)) {
      total = allNodes.length;
      nodeLines = allNodes.map((name) => `• ${name}`).join("\n");
    } else {
      const entries = Object.entries(allNodes);
      total = entries.length;
      nodeLines = entries
        .map(([name, attrs]) => {
          const attrText = Object.entries(attrs)
            .map(([k, v]) => `    ${k}: ${annotateAttributeValue(k, v)}`)
            .join("\n");
          return attrText ? `• ${name}\n${attrText}` : `• ${name}  (no attributes)`;
        })
        .join("\n\n");
    }

    return {
      content: [
        {
          type: "text",
          text: `Total nodes: ${total}${message ? ` (${message})` : ""}\n\n${nodeLines}`,
        },
      ],
    };
  }
);


// ---------------------------------------------------------------------------
// 7. List available submaps (floors)
// ---------------------------------------------------------------------------
// Completed
server.registerTool(
  "list-submaps",
  {
    title: "List Available Floors / Submaps",
    description:
      "Returns the complete list of floor/submap names available in the Trent Building " +
      "navigation database. Use this to discover valid submap names before constructing " +
      "node identifiers.",
    inputSchema: z.object({}),
  },
  async () => {
    const response = await axios.get(`${BASE_URL}/quick-demo-available-submaps`);
    const { availableMaps } = response.data;
    return {
      content: [
        {
          type: "text",
          text: `Available floors/submaps:\n${availableMaps?.map((m: string) => `  • ${m}`).join("\n")}`,
        },
      ],
    };
  }
);

// ---------------------------------------------------------------------------
// PROMPTS  — reusable navigation assistant system prompt
// ---------------------------------------------------------------------------

server.registerPrompt(
  "navigation-assistant",
  {
    title: "Trent Building Navigation Assistant",
    description:
      "Configures the LLM as a knowledgeable Trent Building navigation and info assistant.",
  },
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are a helpful indoor navigation and information assistant for the Trent Building at UNNC (University of Nottingham Ningbo China).

You have access to tools that let you:
- Resolve fuzzy floor/submap names and fuzzy node/room names to exact database identifiers
- Find routes between any two locations (point-to-point, floor-level wildcards, or with preferences)
- Look up detailed attribute data for any room, facility, or service
- Search across all nodes to answer comparative or open-ended natural-language questions

Workflow guidelines:
1. Always resolve fuzzy names (resolve-submap-name, resolve-node-name) before calling navigation or info tools.
2. When the user expresses physical constraints or preferences (heavy items, wheelchair, fast), use navigate-with-preference.
3. For floor-to-floor queries without specific rooms, use '{SubMap}::_' wildcards with the navigate tool.
4. For "does it require elevator transfers?" questions, check the navigation result step list for the number of elevator-ride legs.
5. When attribute data is absent for qualitative questions (e.g. best view), make a reasonable inference from node names and explicitly say you are guessing, and explain your reasoning.
6. Time values in seconds are automatically converted to HH:MM by the tools — present them naturally (e.g. "closes at 22:00").
7. After answering an info query, actively suggest a navigation route if relevant (e.g. "Would you like directions to get there?")`,
        },
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Transport & connection
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
