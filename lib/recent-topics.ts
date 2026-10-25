/**
 * Cross-session topic memory.
 *
 * The opening question used to be derived from the role alone, so every new
 * interview for the same role asked about the same subject (idempotency, every
 * time). This module reads the topics of the most recent finished interviews so
 * the opener can be steered towards something else.
 *
 * Only topic labels leave the database — never CV text, transcripts, answers or
 * candidate quotes. Topics are model-written prose, so they are treated as
 * untrusted data (see the "Topic preferences" block in lib/prompts.ts).
 */
import { query } from "./db";
import { practiceFocusLabel } from "./practice-prefill";
import { safeParseStoredReport } from "./zod-schemas";

const DEFAULT_MAX_SESSIONS = 4;
const DEFAULT_MAX_TOPICS = 6;
const DEFAULT_MAX_CHARS = 480;
/** A report bigger than this is not worth parsing for a topic label. */
const MAX_REPORT_CHARS = 131072;
/** Below this length a word carries no topic meaning ("AI", "Go", "DB"). */
const SIGNIFICANT_LENGTH = 3;

interface ReportRow { report_json: string }

export interface RecentTopicsOptions {
  /** The session being started — never a source of topics for itself. */
  excludeSessionId: string;
  /** Explicit focus of the new session; it always wins over the avoid list. */
  focus?: string[];
  maxSessions?: number;
  maxTopics?: number;
  maxChars?: number;
}

/** Lowercase word tokens. */
function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The words of a topic that actually carry meaning. */
function significant(text: string): Set<string> {
  return new Set(words(text).filter((word) => word.length >= SIGNIFICANT_LENGTH));
}

interface FocusTokens {
  significant: Set<string>;
  words: Set<string>;
}

function focusTokens(label: string): FocusTokens {
  const all = words(label);
  return {
    significant: new Set(all.filter((word) => word.length >= SIGNIFICANT_LENGTH)),
    words: new Set(all.filter((word) => word.length >= 2)),
  };
}

/**
 * True when the topic repeats an explicitly requested focus topic. The user's
 * choice always wins, so such a topic is dropped from the avoid list.
 */
function matchesFocus(topic: string, labels: FocusTokens[]): boolean {
  if (labels.length === 0) return false;
  const topicWords = words(topic);
  const topicSignificant = new Set(
    topicWords.filter((word) => word.length >= SIGNIFICANT_LENGTH),
  );
  const topicWordSet = new Set(topicWords);
  return labels.some((label) => {
    if (label.significant.size > 0) {
      for (const token of label.significant) if (!topicSignificant.has(token)) return false;
      return true;
    }
    // Short labels ("AI", "Go") have no significant token — fall back to whole
    // words so "AI model serving" still counts as the "AI" topic.
    if (label.words.size === 0) return false;
    for (const word of label.words) if (!topicWordSet.has(word)) return false;
    return true;
  });
}

/**
 * Topics covered by the most recent finished interviews, newest first.
 *
 * A broken or schema-invalid report is skipped rather than fatal: a stale
 * evaluation must never break a brand new session.
 */
export function recentCoveredTopics(options: RecentTopicsOptions): string[] {
  const maxSessions = Math.max(1, Math.min(20, options.maxSessions ?? DEFAULT_MAX_SESSIONS));
  const maxTopics = Math.max(0, Math.min(20, options.maxTopics ?? DEFAULT_MAX_TOPICS));
  const maxChars = Math.max(0, Math.min(4000, options.maxChars ?? DEFAULT_MAX_CHARS));
  if (maxTopics === 0 || maxChars === 0) return [];

  const labels = (options.focus ?? []).map(focusTokens).filter((tokens) => tokens.words.size > 0);

  const rows = query<ReportRow>(
    `SELECT e.report_json FROM evaluations e
     JOIN sessions s ON s.id = e.session_id
     WHERE s.status = 'completed' AND s.id <> ? AND length(e.report_json) <= ?
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT ?`,
    [options.excludeSessionId, MAX_REPORT_CHARS, maxSessions],
  );

  const seen = new Set<string>();
  const topics: string[] = [];
  let usedChars = 0;

  for (const row of rows) {
    const report = safeParseStoredReport(row.report_json);
    if (!report) continue;
    // The opening question of a session comes from turn 1, so that topic is the
    // one a new session is most likely to repeat.
    const turns = [...report.per_turn].sort(
      (a, b) =>
        (a.turn_number === 1 ? 0 : 1) - (b.turn_number === 1 ? 0 : 1) ||
        a.turn_number - b.turn_number,
    );
    for (const turn of turns) {
      const label = practiceFocusLabel(turn.topic);
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      if (matchesFocus(label, labels)) continue;
      seen.add(key);
      if (usedChars + label.length > maxChars) continue;
      topics.push(label);
      usedChars += label.length;
      if (topics.length >= maxTopics) return topics;
    }
  }
  return topics;
}
