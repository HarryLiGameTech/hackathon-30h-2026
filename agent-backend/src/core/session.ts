/**
 * Session manager for multi-turn conversations.
 * In-memory storage mapping session_id → SessionState + LangGraph thread_id.
 */

import { v4 as uuidv4 } from "uuid";
import { SessionState } from "../models/schemas.js";

class SessionManager {
  private sessions: Map<string, SessionState> = new Map();

  /**
   * Create a new session and return its ID and thread_id.
   */
  createSession(): [string, string] {
    const sessionId = uuidv4();
    const threadId = `thread_${uuidv4().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();

    const state: SessionState = {
      session_id: sessionId,
      thread_id: threadId,
      created_at: now,
      updated_at: now,
      message_count: 0,
    };

    this.sessions.set(sessionId, state);
    console.info(`[SessionManager] Created session ${sessionId} with thread ${threadId}`);
    return [sessionId, threadId];
  }

  /**
   * Get a session by ID. Returns undefined if not found.
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Increment the message count for a session and update updated_at.
   */
  incrementMessages(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.message_count += 1;
      state.updated_at = new Date();
      console.debug(
        `[SessionManager] Session ${sessionId} message count: ${state.message_count}`
      );
    }
  }

  /**
   * Delete a session by ID.
   */
  deleteSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      console.info(`[SessionManager] Deleted session ${sessionId}`);
    }
  }

  /**
   * Clean up sessions older than maxAgeMs milliseconds.
   */
  cleanupOldSessions(maxAgeMs: number = 86400 * 1000): void {
    const now = Date.now();
    for (const [id, state] of this.sessions) {
      if (now - state.updated_at.getTime() > maxAgeMs) {
        this.sessions.delete(id);
        console.info(`[SessionManager] Cleaned up session ${id}`);
      }
    }
  }
}

// Global singleton
export const sessionManager = new SessionManager();
