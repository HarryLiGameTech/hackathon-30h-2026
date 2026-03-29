# Trent Navigator — Android App Requirements

## 1. Overview

This document defines the requirements for an Android mobile application that replicates and extends the functionality of the existing **Trent Navigator** PC web app. The app provides AI-powered information query and in-building navigation for Trent Building, powered by a LangGraph-based AI agent backend.

The existing system architecture is preserved:

```
Android App
    ↓  (HTTP/SSE)
Agent Backend (Express + LangGraph)   ← remains unchanged
    ↓  (MCP Stdio/HTTP)
MCP Server (Node.js)                  ← remains unchanged
    ↓  (HTTP REST)
Spring Boot Building Data API         ← remains unchanged
```

The Android app replaces only the React frontend. All backend services are deployed and exposed over the network.

---

## 2. Software Specifications

| Item | Requirement |
|------|-------------|
| **Android Studio** | Ladybug Feature Drop 2024.2.2 or later |
| **AGP (Android Gradle Plugin)** | 8.9.0 or later |
| **Gradle** | 8.11.1 or later |
| **Kotlin** | 2.0.21 or later |
| **JVM Target** | 11 |
| **Min SDK** | API 26 (Android 8.0 Oreo) |
| **Target SDK** | API 35 (Android 15) |
| **Compile SDK** | API 35 |
| **Build Type** | Debug + Release (ProGuard/R8 enabled on Release) |

### Core Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Jetpack Compose BOM | 2025.03.00 | Declarative UI toolkit |
| Compose Material 3 | via BOM | Material You components |
| Compose Navigation | 2.9.0 | Screen navigation |
| Kotlin Coroutines Android | 1.10.1 | Async/suspend support |
| Kotlin Coroutines Core | 1.10.1 | Coroutines runtime |
| Ktor Client Android | 3.1.2 | HTTP client (SSE support) |
| Ktor Client Content Negotiation | 3.1.2 | JSON serialization |
| Ktor Serialization Kotlinx JSON | 3.1.2 | JSON codec |
| Kotlinx Serialization JSON | 1.8.0 | Data class serialization |
| Markwon | 4.6.2 | Markdown rendering in Compose |
| DataStore Preferences | 1.1.3 | Persistent local storage |
| Lifecycle ViewModel Compose | 2.9.0 | ViewModel integration with Compose |
| Hilt Android | 2.56 | Dependency injection |
| Hilt Navigation Compose | 1.2.0 | Hilt + Compose Navigation integration |

### Development Tools

| Tool | Version |
|------|---------|
| KSP (Kotlin Symbol Processing) | 2.0.21-1.0.29 |
| ktlint | 1.5.0 |

---

## 3. Architecture

### Pattern
**MVVM (Model–View–ViewModel)** with a Repository layer.

```
UI Layer (Compose Screens)
    ↓↑
ViewModel Layer (StateFlow, coroutines)
    ↓↑
Repository Layer (business logic)
    ↓↑
Network Layer (Ktor HTTP client, SSE parser)
```

### Package Structure

```
com.trentnavigator.app
├── ui/
│   ├── chat/           # Chat screen + components
│   ├── components/     # Shared UI components
│   └── theme/          # Colors, typography, shapes
├── viewmodel/
│   └── ChatViewModel.kt
├── repository/
│   └── ChatRepository.kt
├── network/
│   ├── ApiClient.kt
│   ├── SseParser.kt
│   └── models/         # Request/response DTOs
├── data/
│   └── SessionStore.kt # DataStore-backed session persistence
├── render/
│   ├── SketchRouteRenderer.kt  # Pure Bitmap rendering logic
│   ├── NodePositionMap.kt      # Loads + caches node_positions.json
│   └── RouteNodeParser.kt      # Extracts node list from navigate result string
└── di/
    └── AppModule.kt    # Hilt module
```

---

## 4. Functional Requirements

### 4.1 Chat Interface

| ID | Requirement |
|----|-------------|
| F-01 | The app shall display a scrollable chat history of user messages and AI responses. |
| F-02 | Messages shall show a timestamp (HH:mm format). |
| F-03 | User messages and AI messages shall be visually distinct (alignment and color). |
| F-04 | AI responses shall be rendered as formatted Markdown (bold, lists, code blocks, tables). |
| F-05 | The chat history shall persist within the app session (not cleared on rotation). |
| F-06 | On first launch, the chat shall display a welcome message introducing available commands. |

### 4.2 Message Input

| ID | Requirement |
|----|-------------|
| F-07 | A text input field shall be visible at the bottom of the screen. |
| F-08 | The input field shall auto-expand vertically up to 5 lines as the user types. |
| F-09 | Pressing the send button or the IME action key shall submit the message. |
| F-10 | While a response is being received, the send button shall become a cancel (stop) button. |
| F-11 | Pressing cancel shall immediately abort the in-flight request and mark the current task as cancelled via `DELETE /api/v1/chat/task/:taskId`. |
| F-12 | The input field shall be disabled (non-focusable) while a response is streaming. |

### 4.3 Slash Commands

The app shall support the following slash commands, identical to the web version:

| Command | Expansion |
|---------|-----------|
| `/navigate [from] [to]` | "How do I get from [from] to [to]?" |
| `/info [node_name]` | "Tell me all information about [node_name]" |
| `/query [node_name] [attr?]` | "What is the [attr] of [node_name]?" |

| ID | Requirement |
|----|-------------|
| F-13 | Typing `/` in the input field shall open a command suggestion popup above the input bar. |
| F-14 | The popup shall list available commands and their argument hints. |
| F-15 | Tapping a suggestion shall insert the command text into the input field. |
| F-16 | Slash commands shall be expanded to natural language before being sent to the backend. |

### 4.4 Tool Call Visualization

The AI agent executes backend tools during reasoning. The app shall visualize each tool execution step.

| ID | Requirement |
|----|-------------|
| F-17 | While the agent is running tools, an expandable "Thinking…" section shall appear above the final response. |
| F-18 | Each tool call step shall show: tool name, status indicator, and elapsed time. |
| F-19 | Status indicators: animated spinner (running), green checkmark (success), red X (error). |
| F-20 | Tapping a tool step shall expand/collapse to show the tool arguments and result. |
| F-21 | The "Thinking…" section shall collapse automatically when the final answer arrives, but remain tappable to re-expand. |

### 4.5 Session Management

| ID | Requirement |
|----|-------------|
| F-22 | The app shall generate and persist a `session_id` (UUID) on first launch using DataStore. |
| F-23 | All chat requests shall include the persisted `session_id` to maintain multi-turn conversation context. |
| F-24 | A "New Conversation" action (e.g., via top-bar menu) shall clear local chat history and generate a new `session_id`. |

### 4.6 Sketch-Route Rendering

When the agent executes a `navigate` or `navigate-with-preference` tool call, the app shall automatically render a visual "sketch-route" image and insert it inline into the chat as a message bubble, immediately after the tool step completes and before (or alongside) the final text response.

#### How it works

The renderer is a **purely deterministic, client-side function** — no network calls involved. It takes the ordered list of node names from the navigation result, looks up each node's (x, y) position in a bundled static mapping, and draws the path on an Android `Canvas`.

#### Static Position Mapping

A JSON asset file bundled with the app (`assets/node_positions.json`) defines the position of every navigation node on a normalised coordinate space (0.0–1.0 in both axes, representing a virtual canvas):

```json
{
  "Floor1::GrandGate":   { "x": 0.10, "y": 0.85 },
  "Floor1::Lift":        { "x": 0.50, "y": 0.50 },
  "Floor2::Lift":        { "x": 0.50, "y": 0.50 },
  "Floor4::Room405":     { "x": 0.72, "y": 0.30 },
  ...
}
```

Coordinates are authored manually by the developer to match the rough spatial layout of Trent Building floors. Floors are stacked vertically (higher floor number = lower y value), with a fixed vertical stride (e.g., `0.20`) between floors.

#### Rendering Algorithm (`SketchRouteRenderer`)

```
fun renderRoute(nodeNames: List<String>, mapping: Map<String, NodePosition>): Bitmap

1. Create a Bitmap (e.g., 800×600 px, ARGB_8888).
2. Draw a dark background (#1a1d27).
3. For each consecutive pair of nodes (A, B) that both exist in mapping:
   a. Look up pixelA = toPixel(mapping[A], bitmapWidth, bitmapHeight)
   b. Look up pixelB = toPixel(mapping[B], bitmapWidth, bitmapHeight)
   c. Draw a dashed line from pixelA to pixelB (color: #3b82f6, stroke 4dp).
4. For each node that exists in mapping:
   a. Draw a filled circle at its pixel position (radius 8dp, color: #6366f1).
   b. Draw the short node label (text after "::") in white below the circle.
5. Highlight the start node circle in green (#22c55e) and the end node in amber (#f59e0b).
6. Return the Bitmap.
```

Nodes absent from the mapping are silently skipped (they still appear in the text response).

#### Integration with SSE events

The trigger is the `tool_call_end` SSE event where `tool_name` is `"navigate"` or `"navigate-with-preference"` and `status` is `"success"`. The node list is parsed from the `result` string of that event.

Node names must be extracted from the navigation result text. The result from the MCP `navigate` tool lists waypoints as `{SubMap}::{NodeName}` tokens. The parser shall extract all tokens matching the regex `[A-Za-z0-9]+::[A-Za-z0-9_]+` in the order they appear.

| ID | Requirement |
|----|-------------|
| F-32 | The app shall bundle `assets/node_positions.json` containing the static `node_name → {x, y}` mapping for all known Trent Building navigation nodes. |
| F-33 | On receiving a successful `tool_call_end` for `navigate` or `navigate-with-preference`, the app shall synchronously invoke `SketchRouteRenderer.renderRoute()` on a background dispatcher. |
| F-34 | The rendered `Bitmap` shall be inserted into the chat list as a dedicated **route image bubble** (left-aligned, assistant side), appearing after the tool steps and before the final text response. |
| F-35 | The route image bubble shall be scrollable/zoomable (pinch-to-zoom on the image). |
| F-36 | If fewer than 2 nodes in the navigation result are found in the position mapping, no image bubble shall be inserted (degrade gracefully). |
| F-37 | The renderer shall run entirely on-device with no network calls; it shall complete within 100 ms for paths up to 50 nodes. |
| F-38 | `SketchRouteRenderer` shall be implemented as a pure function (no side effects, no Android context dependency beyond `Bitmap` creation) to allow unit testing without an emulator. |

#### Package placement

```
com.trentnavigator.app
└── render/
    ├── SketchRouteRenderer.kt   # Pure rendering logic
    ├── NodePositionMap.kt       # Loads + caches node_positions.json
    └── RouteNodeParser.kt       # Extracts node list from navigate result string
```

---

### 4.7 Streaming (SSE)

The primary API endpoint is `POST /api/v1/chat/single/toolcalls/stream/v2`, which returns a Server-Sent Events (SSE) stream.

| ID | Requirement |
|----|-------------|
| F-25 | The app shall connect to the SSE endpoint and process events in real time. |
| F-26 | `content_delta` events shall incrementally append text to the assistant's current message bubble. |
| F-27 | `tool_call_start` events shall create a new tool step card in the "Thinking…" section. |
| F-28 | `tool_call_end` events shall update the corresponding tool step's status and result, and trigger sketch-route rendering if applicable (see F-33). |
| F-29 | `done` events shall finalize the message and re-enable the input field. |
| F-30 | `error` events shall display an error message bubble and re-enable the input field. |
| F-31 | `task_created` events shall store the `task_id` for potential cancellation (F-11). |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
|----|-------------|
| NF-01 | The app shall remain responsive during SSE streaming (no UI jank). All network I/O shall occur on background coroutine dispatchers. |
| NF-02 | The chat list shall use lazy composition (LazyColumn) to handle long conversation histories efficiently. |
| NF-03 | Cold start to interactive (first frame drawn) shall be under 2 seconds on a mid-range device. |

### 5.2 Reliability

| ID | Requirement |
|----|-------------|
| NF-04 | If the SSE connection drops mid-stream, the app shall display an error message and re-enable the input. |
| NF-05 | If the backend is unreachable on launch, the app shall show an error state rather than crashing. |

### 5.3 Security

| ID | Requirement |
|----|-------------|
| NF-06 | The backend base URL shall be configured via `local.properties` (not hardcoded in source). It shall be injected at build time via `BuildConfig`. |
| NF-07 | No API keys shall be stored or transmitted from the Android app — all LLM keys remain on the backend. |

### 5.4 Usability

| ID | Requirement |
|----|-------------|
| NF-08 | The app shall support both portrait and landscape orientations without losing chat history. |
| NF-09 | The soft keyboard appearing shall not obscure the input field (`WindowCompat.setDecorFitsSystemWindows` + `imeNestedScroll`). |

---

## 6. API Contract

### Base URL

Configured via `BuildConfig.BACKEND_BASE_URL` (e.g., `http://192.168.50.65:8000`).

### Primary Endpoint

**`POST /api/v1/chat/single/toolcalls/stream/v2`**

Request body:
```json
{
  "message": "string",
  "session_id": "string (UUID)"
}
```

Response: `Content-Type: text/event-stream`

SSE event format:
```
data: {"event": "<event_type>", ...payload...}
```

| Event | Payload Fields |
|-------|---------------|
| `task_created` | `task_id: string`, `session_id: string` |
| `tool_call_start` | `tool_name: string`, `arguments: object` |
| `tool_call_end` | `tool_name: string`, `result: string`, `status: "success" \| "error"` |
| `content_delta` | `content: string` |
| `done` | `status: "complete"` |
| `cancelled` | `task_id: string`, `reason: string` |
| `error` | `message: string` |

### Cancel Endpoint

**`DELETE /api/v1/chat/task/:taskId`**

Response:
```json
{ "status": "cancelled", "task_id": "string" }
```

---

## 7. UI Design

### Theme

- **Color scheme**: Dark theme (matching web app)
    - Background: `#0f1117` (near-black)
    - Surface: `#1a1d27` (elevated cards)
    - Primary accent: Blue `#3b82f6` → Indigo `#6366f1` gradient
    - User bubble: `#1e3a5f`
    - Assistant bubble: `#1a1d27`
    - Tool running: Amber `#f59e0b` border
    - Tool success: Green `#22c55e`
    - Tool error: Red `#ef4444`
- **Typography**: System sans-serif; code blocks in monospace

### Screen Layout

```
┌─────────────────────────────────────────┐
│  [≡]  Trent Navigator        [⋯]        │  ← TopAppBar
├─────────────────────────────────────────┤
│                                         │
│   [User message bubble]          →      │
│                                         │
│   ← [Thinking… ▼]                       │  ← collapsible tool steps
│     ├ 🔄 navigate  (1.2s)               │
│     └ ✓ get-node-info  (0.8s)           │
│                                         │
│   ← [Sketch-route image bubble]         │  ← auto-inserted after navigate
│                                         │
│   ← [AI response with markdown]         │
│                                         │
├─────────────────────────────────────────┤
│  /navigate from to  [↑ Send / ■ Stop]   │  ← BottomBar (input + button)
│  ┌───────────────────────────────────┐  │
│  │ /navigate  /info  /query          │  │  ← command suggestion popup
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Navigation Drawer (optional, accessible via `[≡]`)

- App title and version
- Command reference list (`/navigate`, `/info`, `/query`)
- "New Conversation" button
- Building info summary (static text)

---

## 8. Project Setup Instructions

1. Clone the repository and open the `android/` subdirectory in Android Studio Ladybug Feature Drop 2024.2.2+.
2. Create `local.properties` in the project root and add:
   ```properties
   BACKEND_BASE_URL=http://<server-ip>:8000
   ```
3. Sync Gradle. All dependencies will be downloaded from Maven Central and Google Maven.
4. Ensure the agent backend and MCP server are running and reachable at the configured URL.
5. Run the app on an emulator (API 26+) or physical device.

---

## 9. Out of Scope

The following are explicitly **not** required for this implementation:

- Offline mode or local caching of navigation data
- Full interactive floor-plan map (the sketch-route image is sufficient; a full SVG/bitmap map overlay is not required)
- User authentication or login
- Push notifications
- In-app LLM inference (all AI runs on the backend)
- iOS port
- Tablet-optimized layout

---

## 10. Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-01 | A user can type a natural language question, submit it, and receive a streamed AI response rendered with Markdown. |
| AC-02 | Tool call steps appear with correct status indicators during and after agent reasoning. |
| AC-03 | Slash commands are auto-expanded and submitted correctly. |
| AC-04 | The session persists across app restarts; multi-turn context is maintained. |
| AC-05 | The cancel button successfully stops a streaming response mid-flight. |
| AC-06 | The app does not crash on network failure; a user-visible error is shown. |
| AC-07 | Portrait ↔ landscape rotation does not lose chat history. |
| AC-08 | A navigation query produces a sketch-route image bubble in the chat showing the path drawn between correctly positioned nodes. |
| AC-09 | If a navigation result contains nodes absent from `node_positions.json`, no image bubble is shown and no crash occurs. |
