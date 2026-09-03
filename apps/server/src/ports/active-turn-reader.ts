import type { ScheduledTurnDeadline } from "./system.js";

/** Read-only recovery view; implementations must return detached identities. */
export interface ActiveTurnReader {
  listActiveTurnDeadlines(): Promise<readonly ScheduledTurnDeadline[]>;
}
