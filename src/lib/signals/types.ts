/** Derived metrics extracted from a raw entry. Every field is optional/nullable. */
export interface ExtractedSignals {
  mood?: number | null; // -2..2
  didRun?: boolean | null;
  sleepQuality?: number | null; // 1..5
  energy?: number | null; // 1..5
  tags?: string[];
}

/** Optional context that helps interpret terse replies (e.g. "yes" to "did you run?"). */
export interface ProcessContext {
  promptText?: string;
}

/**
 * Turns a raw entry into derived signals.
 *
 * v1: RuleBasedProcessor (keyword + sentiment heuristics).
 * v2: an AI processor implements this same interface. Because signals are stored
 *     separately from raw entries, a new processor can re-run over the entire
 *     history and write fresh signal rows without touching the originals.
 */
export interface ResponseProcessor {
  /** Stored on each produced row as `signals.extractedBy`. */
  readonly name: string;
  process(entry: { text: string }, context?: ProcessContext): Promise<ExtractedSignals>;
}
