import { NICKNAME_MAX_CODE_POINTS } from "@hangul-rummikub/shared";

/**
 * Keep the controlled input within the shared Unicode code-point limit.
 * Validation still owns trimming, NFC normalization, and the allowed alphabet.
 */
export function limitNicknameInput(value: string): string {
  return Array.from(value).slice(0, NICKNAME_MAX_CODE_POINTS).join("");
}
