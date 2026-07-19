import type { ExtractedSignals, ProcessContext, ResponseProcessor } from "./types";

const POSITIVE = [
  "good", "great", "awesome", "amazing", "happy", "fine", "ok", "okay", "relaxed",
  "calm", "productive", "grateful", "excited", "content", "well", "better",
  "fantastic", "love", "nice", "good day", "solid",
];
const NEGATIVE = [
  "bad", "terrible", "awful", "sad", "tired", "exhausted", "stressed", "anxious",
  "angry", "upset", "sick", "down", "worse", "rough", "drained", "frustrated",
  "lonely", "meh", "horrible", "overwhelmed",
];
const RUN_WORDS = [
  "run", "ran", "running", "jog", "jogged", "jogging",
];

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => hasWord(text, w));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Affirmative/negative read of a terse reply; null when unclear. Negatives win. */
function yesNo(text: string): boolean | null {
  if (/\b(no|nope|nah|didn'?t|did not|not really|haven'?t|never|negative|skipped|missed|couldn'?t)\b/i.test(text)) {
    return false;
  }
  if (/\b(yes|yeah|yep|yup|ya|sure|did|done|totally|definitely|absolutely)\b/i.test(text)) {
    return true;
  }
  return null;
}

function numericScore(text: string, label: string, lo: number, hi: number): number | null {
  const match = text.match(new RegExp(`\\b${label}\\s*(?:was|is|[:=-])?\\s*(\\d{1,2})(?:\\s*\\/\\s*${hi})?\\b`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  return value >= lo && value <= hi ? value : null;
}

function reportedMinutes(text: string): number | null {
  const match = text.match(/\b(\d{1,3})\s*(?:min|mins|minute|minutes)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value > 0 && value <= 600 ? value : null;
}

function isNegated(text: string): boolean {
  return /\b(no|not|didn'?t|did not|never|skip(ped)?|missed|couldn'?t)\b/i.test(text);
}

function promptIsSpecificallyAboutRunning(prompt: string): boolean {
  return /\b(did you run|long run|recovery run|easy run|running|run\/walk)\b|\brun\s*(?:\/\s*quality|·)/i.test(
    prompt,
  );
}

/**
 * Maps quality language to 1..5. Negative phrasings (incl. negated positives like
 * "didn't sleep well") are checked before positives so they win. null if nothing matches.
 */
function scoreQuality(text: string): number | null {
  if (/\b(terrible|awful|horrible|no sleep|couldn'?t sleep|barely slept|hardly slept|insomnia)\b/i.test(text)) return 1;
  if (/\b(poorly|badly|bad|rough|restless|not well|not great|not good|didn'?t sleep well|did not sleep well|slept badly|slept poorly|rough night)\b/i.test(text)) return 2;
  if (/\b(amazing|incredible|fantastic|great|so well|really well|like a baby|perfectly)\b/i.test(text)) return 5;
  if (/\b(well|good|solid|decent|pretty good)\b/i.test(text)) return 4;
  if (/\b(ok|okay|fine|alright|average|so-?so|meh|enough)\b/i.test(text)) return 3;
  return null;
}

/**
 * Heuristic v1 extractor. Deliberately simple and explainable; swap in an AI
 * processor later behind the ResponseProcessor interface for richer signals.
 */
export class RuleBasedProcessor implements ResponseProcessor {
  readonly name = "rules";

  async process(
    entry: { text: string },
    context?: ProcessContext,
  ): Promise<ExtractedSignals> {
    const text = entry.text.toLowerCase();
    const prompt = (context?.promptText ?? "").toLowerCase();
    const tags = new Set<string>();

    // --- mood (sentiment balance) ---
    let mood: number | null = null;
    const pos = POSITIVE.filter((w) => hasWord(text, w)).length;
    const neg = NEGATIVE.filter((w) => hasWord(text, w)).length;
    if (pos || neg) {
      mood = clamp(pos - neg, -2, 2);
      tags.add("mood");
    }

    // --- did run ---
    let didRun: boolean | null = null;
    if (hasAny(text, RUN_WORDS)) {
      didRun = !isNegated(text);
      tags.add("run");
    } else if (promptIsSpecificallyAboutRunning(prompt)) {
      const yn = yesNo(text);
      if (yn !== null) {
        didRun = yn;
        tags.add("run");
      }
    }

    const runMinutes = didRun === true ? reportedMinutes(text) : null;
    if (runMinutes !== null) tags.add("run-duration");

    // --- sleep quality ---
    let sleepQuality: number | null = null;
    const promptAboutSleep = hasAny(prompt, ["sleep", "slept", "rest", "rested"]);
    const textAboutSleep = hasAny(text, ["sleep", "slept", "rest", "rested", "nap"]);
    if (textAboutSleep || promptAboutSleep) {
      sleepQuality = scoreQuality(text);
      if (sleepQuality === null && promptAboutSleep) {
        const yn = yesNo(text);
        if (yn !== null) sleepQuality = yn ? 4 : 2;
      }
      if (sleepQuality !== null) tags.add("sleep");
    }

    // --- energy ---
    let energy: number | null = numericScore(text, "energy", 1, 5);
    if (energy !== null) {
      tags.add("energy");
    } else if (hasAny(text, ["tired", "exhausted", "drained", "sleepy", "wiped"])) {
      energy = 2;
      tags.add("energy");
    } else if (hasAny(text, ["energetic", "energized", "pumped", "refreshed"])) {
      energy = 4;
      tags.add("energy");
    }

    const pain = numericScore(text, "pain", 0, 10);
    if (pain !== null) tags.add("pain");

    return { mood, didRun, runMinutes, sleepQuality, energy, pain, tags: [...tags] };
  }
}
