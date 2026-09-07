import {
  GameRevisionSchema,
  type GameRevision,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

/** Returns the sole successor used by a successful canonical game mutation. */
export function nextGameRevision(revision: GameRevision): GameRevision {
  return parse(GameRevisionSchema, revision + 1);
}
