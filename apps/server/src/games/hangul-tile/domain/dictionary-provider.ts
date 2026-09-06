export type DictionaryUnavailableReason = "ERROR" | "TIMEOUT";

export type DictionaryLookupResult =
  | Readonly<{ status: "ALLOWED" }>
  | Readonly<{ status: "NOT_ALLOWED" }>
  | Readonly<{
      status: "UNAVAILABLE";
      reason: DictionaryUnavailableReason;
    }>;

export interface DictionaryProvider {
  readonly dictionaryVersion: string;
  lookup(word: string): Promise<DictionaryLookupResult>;
}
