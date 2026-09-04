import type { ScheduledGameDeadline } from "./system.js";

/** Read-only recovery view; implementations must return detached identities. */
export interface ActiveGameReader {
  listActiveGameDeadlines(): Promise<readonly ScheduledGameDeadline[]>;
}
