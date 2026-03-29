/**
 * Task manager with cancellation support.
 * Tracks running tasks and provides cancellation tokens.
 */

import { v4 as uuidv4 } from "uuid";
import { TaskInfo, TaskStatus } from "../models/schemas.js";

export class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was cancelled`);
    this.name = "TaskCancelledError";
  }
}

export class CancellationToken {
  readonly taskId: string;
  private _cancelled: boolean = false;

  constructor(taskId: string) {
    this.taskId = taskId;
  }

  cancel(): void {
    this._cancelled = true;
    console.info(`[CancellationToken] Cancelled for task ${this.taskId}`);
  }

  get isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Throw TaskCancelledError if this token has been cancelled.
   * Call this inside streaming loops to enable cooperative cancellation.
   */
  throwIfCancelled(): void {
    if (this._cancelled) {
      throw new TaskCancelledError(this.taskId);
    }
  }
}

class TaskManager {
  private tasks: Map<string, TaskInfo> = new Map();
  private tokens: Map<string, CancellationToken> = new Map();

  /**
   * Create a new task for the given session.
   * Returns [taskId, cancellationToken].
   */
  createTask(sessionId: string): [string, CancellationToken] {
    const taskId = uuidv4();
    const token = new CancellationToken(taskId);

    const taskInfo: TaskInfo = {
      task_id: taskId,
      session_id: sessionId,
      status: "running",
      created_at: new Date(),
    };

    this.tasks.set(taskId, taskInfo);
    this.tokens.set(taskId, token);

    console.info(`[TaskManager] Created task ${taskId} for session ${sessionId}`);
    return [taskId, token];
  }

  /**
   * Cancel a running task.
   * Returns true if the task was found and cancelled, false otherwise.
   */
  cancelTask(taskId: string): boolean {
    const token = this.tokens.get(taskId);
    if (!token) {
      console.warn(`[TaskManager] Task ${taskId} not found for cancellation`);
      return false;
    }

    token.cancel();

    const task = this.tasks.get(taskId);
    if (task) {
      task.status = "cancelled";
      task.cancelled_at = new Date();
    }

    console.info(`[TaskManager] Cancelled task ${taskId}`);
    return true;
  }

  /**
   * Mark a task as completed (or a custom final status).
   */
  completeTask(taskId: string, status: TaskStatus = "completed"): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      console.info(`[TaskManager] Completed task ${taskId} with status ${status}`);
    }
    // Remove the cancellation token — no longer needed
    this.tokens.delete(taskId);
  }

  /**
   * Get task info by ID. Returns undefined if not found.
   */
  getTask(taskId: string): TaskInfo | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Clean up completed/cancelled tasks older than maxAgeMs milliseconds.
   */
  cleanupOldTasks(maxAgeMs: number = 3600 * 1000): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (
        (task.status === "completed" || task.status === "cancelled") &&
        now - task.created_at.getTime() > maxAgeMs
      ) {
        this.tasks.delete(id);
        this.tokens.delete(id);
        console.info(`[TaskManager] Cleaned up task ${id}`);
      }
    }
  }
}

// Global singleton
export const taskManager = new TaskManager();
