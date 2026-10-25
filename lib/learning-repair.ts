/**
 * lib/learning-repair.ts — reshape a model's answer into the v3 contract.
 *
 * The prompt asks for one exact JSON shape, but a real provider — especially a
 * small local one — often answers with the right ideas in the wrong wrapper:
 * markdown fences, `"version":"3"`, a `sections` array instead of `blocks`, a
 * `kind` the prompt never mentioned, options as plain strings, a missing hook.
 * Rejecting that throws away a paid call and leaves the learner with nothing,
 * so the payload is reshaped here instead.
 *
 * Rules of the repair:
 *  - no second model call and no invented facts: every fallback value is text the
 *    model itself wrote, or a neutral label;
 *  - the result still has to pass `FlexibleLessonSchema`; the repair can only move
 *    a payload closer to the contract, never past it;
 *  - the raw model text is never logged or stored by this module.
 */
import { FlexibleLessonSchema, type LearningMode } from "./learning-schema";

type Json = Record<string, unknown>;

export type BlockKind = "explain" | "walkthrough" | "compare" | "misconception" | "answer";

export interface RepairOutcome {
  /** True when the payload satisfies the v3 contract. */
  ok: boolean;
  /** The reshaped payload; only meaningful when `ok` is true. */
  payload?: unknown;
  /** Safe, structural notes about what was changed or what is missing. */
  notes: string[];
  /** Zod issue paths and codes when the payload still does not validate. */
  issues: string[];
}

/**
 * Field ceilings mirror the schema, and the floors mirror `teachingText` (12
 * characters) or `requiredText` (1 character), so a repaired value is never
 * rejected for its length.
 */
const LIMIT = {
  title: 120, goal: 240, objective: 240, hook: 600,
  heading: 120, body: 2000, why: 800, situation: 500, input: 500,
  step: 400, outcome: 600, when: 400, compareWhy: 500,
  label: 80, takeaway: 600, belief: 400, correction: 1500, evidence: 700,
  question: 400, answer: 2400, point: 350, noteReason: 500,
  followUpQuestion: 400, followUpAnswer: 900,
  stem: 400, option: 240, explanation: 400,
} as const;

const TEACHING_MIN = 12;
const TEXT_MIN = 1;

const KIND_ALIASES: Record<string, BlockKind> = {
  explain: "explain", explanation: "explain", concept: "explain", concepts: "explain",
  theory: "explain", idea: "explain", intro: "explain", introduction: "explain",
  overview: "explain", summary: "explain", context: "explain", mechanism: "explain",
  walkthrough: "walkthrough", "walk-through": "walkthrough", walk_through: "walkthrough",
  worked_example: "walkthrough", example: "walkthrough", examples: "walkthrough",
  scenario: "walkthrough", case: "walkthrough", "case-study": "walkthrough",
  demo: "walkthrough", steps: "walkthrough", process: "walkthrough", procedure: "walkthrough",
  practice: "walkthrough", application: "walkthrough",
  compare: "compare", comparison: "compare", tradeoff: "compare", trade_off: "compare",
  "trade-offs": "compare", choices: "compare", choice: "compare", alternatives: "compare",
  options: "compare", decision: "compare",
  misconception: "misconception", myth: "misconception", pitfall: "misconception",
  common_mistake: "misconception", "common-mistake": "misconception", warning: "misconception",
  trap: "misconception",
  answer: "answer", sample_answer: "answer", "sample-answer": "answer",
  model_answer: "answer", interview_answer: "answer", response: "answer",
  speech: "answer", talking_points: "answer",
};

const KIND_LABEL: Record<BlockKind, string> = {
  explain: "Giải thích", walkthrough: "Từng bước", compare: "So sánh",
  misconception: "Sai lầm thường gặp", answer: "Câu trả lời mẫu",
};

/** Envelopes a small model puts around the lesson object. */
const WRAPPER_KEYS = [
  "lesson", "lessons", "data", "result", "results", "payload", "output", "response", "content",
];

function asObject(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Json : null;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Read the first field that holds text, so alias lists stay in one place. */
function pick(source: Json, keys: string[]): string | null {
  for (const key of keys) {
    const text = asText(source[key]);
    if (text) return text;
  }
  return null;
}

/** Cut on a word boundary so a clipped lesson still reads like a sentence. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"), cut.lastIndexOf("."));
  const kept = boundary > max * 0.6 ? cut.slice(0, boundary) : cut;
  return `${kept.trimEnd()}…`;
}

/**
 * A teaching field needs 12 characters; a plain text field only needs one.
 * The first key that holds a long enough value wins, so a too-short alias does
 * not hide a good one further down the list.
 */
function text(source: Json, keys: string[], max: number, min = TEACHING_MIN): string | undefined {
  for (const key of keys) {
    const value = asText(source[key]) ?? joinedText(source[key]);
    if (!value) continue;
    const clipped = clip(value, max);
    if (clipped.length >= min) return clipped;
  }
  return undefined;
}

/** A model may split the teaching text into a list of paragraphs. */
function joinedText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const parts = value.map((item) => asText(item)).filter((item): item is string => Boolean(item));
  return parts.length ? parts.join("\n\n") : null;
}

function list(source: Json, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  JSON extraction: fences, prose around the object, cut-off output   */
/* ------------------------------------------------------------------ */

/** Strip a markdown fence and any prose around the outermost JSON object. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```[a-zA-Z]*\s*/, "");
  return withoutOpen.replace(/```[\s\S]*$/, "").trim();
}

/** Close a JSON value that was cut off by the token limit. */
function closeTruncated(text: string): string | null {
  let stack: string[] = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') { inString = false; stringStart = -1; }
      continue;
    }
    if (char === '"') { inString = true; stringStart = index; }
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }
  if (!stack.length && !inString) return null;
  let closed = text;
  if (inString) {
    // The last sentence was cut mid-word: keep what is readable and show the cut.
    const partial = text.slice(stringStart + 1);
    const trimmed = partial.replace(/\s+\S*$/, "").trimEnd();
    const kept = trimmed.length >= TEACHING_MIN ? trimmed : partial.trimEnd();
    closed = `${text.slice(0, stringStart + 1)}${kept}…"`;
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    closed += stack[index] === "{" ? "}" : "]";
  }
  return closed;
}

/** Drop the incomplete tail member of a cut-off object and close it. */
function closeAtLastMember(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastComma = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 1) lastComma = index;
  }
  if (lastComma < 0) return null;
  return closeTruncated(text.slice(0, lastComma));
}

export interface ExtractedJson {
  value: unknown;
  /** True when the JSON had to be closed by hand after the model was cut off. */
  salvaged: boolean;
}

/** The first complete JSON object in the text, respecting strings. */
function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Read a JSON object out of whatever the provider actually sent. Complete
 * objects are preferred over salvaged ones: a cut-off repair must never win
 * over a whole object that is sitting later in the same answer.
 */
export function extractJson(raw: string): ExtractedJson | null {
  const text = stripFence(raw);
  const candidates: string[] = [];
  const add = (value: string | null | undefined) => {
    if (value && value.includes("{") && !candidates.includes(value)) candidates.push(value);
  };
  for (const match of raw.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)) add(match[1].trim());
  add(stripFence(raw));
  add(firstObject(text));
  const start = text.indexOf("{");
  if (start >= 0) {
    add(text.slice(start));
    const end = text.lastIndexOf("}");
    if (end > start) add(text.slice(start, end + 1));
  }
  if (!candidates.length) return null;
  for (const candidate of candidates) {
    try { return { value: JSON.parse(candidate) as unknown, salvaged: false }; } catch { /* next */ }
  }
  for (const candidate of candidates) {
    const closed = closeTruncated(candidate);
    if (!closed) continue;
    try { return { value: JSON.parse(closed) as unknown, salvaged: true }; } catch { /* next */ }
  }
  for (const candidate of candidates) {
    const trimmed = closeAtLastMember(candidate);
    if (!trimmed) continue;
    try { return { value: JSON.parse(trimmed) as unknown, salvaged: true }; } catch { /* next */ }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Block normalisation                                                 */
/* ------------------------------------------------------------------ */

function blockKind(source: Json): BlockKind {
  const raw = (pick(source, ["kind", "type", "blockType", "block_type"]) ?? "")
    .toLowerCase().replace(/\s+/g, "_");
  const aliased = KIND_ALIASES[raw];
  if (aliased) return aliased;
  if (source.steps || source.procedure) return "walkthrough";
  if (source.options || source.choices) return "compare";
  if (source.question && (source.answer || source.modelAnswer)) return "answer";
  return "explain";
}

function normalizeStep(item: unknown): { action: string; reason?: string } | null {
  const object = asObject(item);
  if (!object) {
    const value = asText(item);
    if (!value) return null;
    return { action: clip(value, LIMIT.step) };
  }
  const action = text(object, ["action", "step", "what", "task", "move", "instruction"], LIMIT.step);
  if (!action) return null;
  const reason = text(object, ["reason", "why", "because", "rationale", "note"], LIMIT.step);
  return reason ? { action, reason } : { action };
}

/** A step list may arrive as objects, plain strings or one numbered blob. */
function normalizeSteps(source: Json): { action: string; reason?: string }[] | undefined {
  const raw = list(source, ["steps", "actions", "procedure", "process", "procedure_steps"]);
  if (!raw) return undefined;
  const steps = raw.map(normalizeStep).filter((step): step is { action: string; reason?: string } => Boolean(step));
  if (steps.length) return steps;
  const blob = pick(source, ["steps_text", "steps_paragraph"]);
  if (!blob) return undefined;
  const parts = blob.split(/\n+|(?:\d+[.)]\s)/).map((part) => part.trim()).filter(Boolean);
  const derived = parts.map((part) => ({ action: clip(part, LIMIT.step) }));
  return derived.length ? derived : undefined;
}

function normalizeCompareOptions(source: Json): { label: string; when?: string; why?: string }[] | undefined {
  const raw = list(source, ["options", "choices", "alternatives", "columns"]);
  if (!raw) return undefined;
  const options = raw.flatMap((item) => {
    const object = asObject(item);
    if (!object) {
      const value = asText(item);
      return value ? [{ label: clip(value, LIMIT.label) }] : [];
    }
    const label = text(object, ["label", "name", "title", "option"], LIMIT.label, TEXT_MIN);
    if (!label) return [];
    const when = text(object, ["when", "use_case", "useCase", "condition", "when_to_use", "situation"], LIMIT.when);
    const why = text(object, ["why", "reason", "because", "tradeoff"], LIMIT.compareWhy);
    return [{ label, ...(when ? { when } : {}), ...(why ? { why } : {}) }];
  });
  return options.length ? options : undefined;
}

function normalizeNotes(source: Json): { point: string; reason?: string }[] | undefined {
  const raw = list(source, ["notes", "annotations", "key_points", "keyPoints", "points"]);
  if (!raw) return undefined;
  const notes = raw.flatMap((item) => {
    const object = asObject(item);
    if (!object) {
      const value = asText(item);
      return value ? [{ point: clip(value, LIMIT.point) }] : [];
    }
    const point = text(object, ["point", "text", "note", "claim"], LIMIT.point);
    if (!point) return [];
    const reason = text(object, ["reason", "why", "because", "explanation"], LIMIT.noteReason);
    return [{ point, ...(reason ? { reason } : {}) }];
  });
  return notes.length ? notes : undefined;
}

function normalizeFollowUps(source: Json): { question: string; answer?: string }[] | undefined {
  const raw = list(source, ["followUps", "follow_ups", "followups", "probes", "follow_questions"]);
  if (!raw) return undefined;
  const followUps = raw.flatMap((item) => {
    const object = asObject(item);
    if (!object) {
      const value = asText(item);
      return value ? [{ question: clip(value, LIMIT.followUpQuestion) }] : [];
    }
    const question = text(object, ["question", "q", "prompt", "text"], LIMIT.followUpQuestion);
    if (!question) return [];
    const answer = text(object, ["answer", "a", "response", "reply"], LIMIT.followUpAnswer);
    return [{ question, ...(answer ? { answer } : {}) }];
  });
  return followUps.length ? followUps : undefined;
}

/** Rebuild one block in the v3 shape; unknown kinds become an explanation. */
function normalizeBlock(input: unknown, index: number, fallbackQuestion: string): Json | null {
  const source = asObject(input);
  if (!source) {
    const value = asText(input);
    return value ? { kind: "explain", heading: `Phần ${index + 1}`, body: clip(value, LIMIT.body) } : null;
  }
  const kind = blockKind(source);
  const heading = text(source, ["heading", "title", "name", "topic", "label"], LIMIT.heading, TEXT_MIN)
    ?? text(source, ["subtitle", "subheading"], LIMIT.heading, TEXT_MIN)
    ?? KIND_LABEL[kind];
  const common = { kind, heading };

  if (kind === "explain") {
    const body = text(source, ["body", "text", "content", "explanation", "paragraph", "detail"], LIMIT.body)
      ?? text(source, ["description"], LIMIT.body);
    if (!body) return null;
    const why = text(source, ["why", "reason", "because", "rationale", "significance"], LIMIT.why);
    return { ...common, body, ...(why ? { why } : {}) };
  }

  if (kind === "walkthrough") {
    const situation = text(source, ["situation", "context", "scenario", "case", "setup", "story"], LIMIT.situation)
      ?? text(source, ["body", "text", "content", "description"], LIMIT.situation);
    if (!situation) return null;
    const steps = normalizeSteps(source);
    if (!steps?.length) {
      // A "walkthrough" without steps is prose; keep it as an explanation.
      const body = text(source, ["body", "text", "content", "description"], LIMIT.body) ?? situation;
      return { kind: "explain", heading, body };
    }
    const input = text(source, ["input", "given", "starting_point", "startingPoint", "data"], LIMIT.input);
    const outcome = text(source, ["outcome", "result", "resulting", "conclusion", "final_state"], LIMIT.outcome)
      ?? text(source, ["why", "reason"], LIMIT.outcome);
    if (!outcome) return null;
    const why = text(source, ["why", "reason", "because", "rationale"], LIMIT.why);
    return { ...common, situation, ...(input ? { input } : {}), steps, outcome, ...(why ? { why } : {}) };
  }

  if (kind === "compare") {
    const options = normalizeCompareOptions(source);
    if (!options?.length) return null;
    const takeaway = text(source, ["takeaway", "rule", "decision_rule", "conclusion", "summary"], LIMIT.takeaway)
      ?? text(source, ["why", "body", "text"], LIMIT.takeaway)
      ?? options.find((option) => option.when)?.when
      ?? options.find((option) => option.why)?.why
      ?? options.map((option) => option.label).join(" · ");
    return { ...common, options, takeaway };
  }

  if (kind === "misconception") {
    const belief = text(source, ["belief", "myth", "wrong", "assumption", "common_mistake", "misconception"], LIMIT.belief)
      ?? text(source, ["title", "heading"], LIMIT.belief);
    const correction = text(source, ["correction", "truth", "reality", "fact", "fix", "explanation"], LIMIT.correction)
      ?? text(source, ["body", "text", "content"], LIMIT.correction);
    if (!belief || !correction) return null;
    const evidence = text(source, ["evidence", "example", "proof", "reason", "source"], LIMIT.evidence);
    return { ...common, belief, correction, ...(evidence ? { evidence } : {}) };
  }

  // answer
  const question = text(source, ["question", "prompt", "interview_question", "q"], LIMIT.question)
    ?? fallbackQuestion;
  const answer = text(source, ["answer", "model_answer", "modelAnswer", "response", "script", "body", "text"], LIMIT.answer)
    ?? text(source, ["content", "explanation"], LIMIT.answer);
  if (!answer) return null;
  const notes = normalizeNotes(source) ?? notesFromText(answer) ?? [{ point: clip(answer, LIMIT.point) }];
  const followUps = normalizeFollowUps(source);
  return { ...common, question, answer, notes, ...(followUps ? { followUps } : {}) };
}

/* ------------------------------------------------------------------ */
/*  Legacy payload shapes (v1 / v2) rebuilt as v3 blocks                */
/* ------------------------------------------------------------------ */

function legacyBlocks(source: Json, mode: LearningMode): Json[] {
  const blocks: Json[] = [];
  const push = (block: Json | null) => { if (block) blocks.push(block); };

  const concepts = list(source, ["concepts", "terms"]);
  const mechanism = pick(source, ["mechanism", "how_it_works", "howItWorks"]);
  const walkthrough = asObject(source.walkthrough);
  const interviewQuestion = pick(source, ["interviewQuestion", "interview_question"]);
  const modelAnswer = pick(source, ["modelAnswer", "model_answer"]);
  const tradeOff = asObject(source.tradeOff ?? source.trade_off);
  const explanation = pick(source, ["explanation", "intro"]);
  const example = pick(source, ["example", "worked_example"]);
  const takeaways = list(source, ["takeaways", "objectives"]);

  if (mode === "fundamentals" && (concepts?.length || mechanism)) {
    for (const concept of concepts ?? []) {
      const object = asObject(concept);
      if (!object) continue;
      const term = pick(object, ["term", "name", "title"]);
      const meaning = pick(object, ["meaning", "definition", "body", "text"]);
      if (!term || !meaning) continue;
      push({ kind: "explain", heading: clip(term, LIMIT.heading), body: clip(meaning, LIMIT.body) });
    }
    if (mechanism) {
      push({ kind: "explain", heading: "Cơ chế", body: clip(mechanism, LIMIT.body) });
    }
    if (walkthrough) {
      const steps = (list(walkthrough, ["steps"]) ?? [])
        .map(normalizeStep)
        .filter((step): step is { action: string; reason?: string } => Boolean(step));
      const situation = pick(walkthrough, ["situation", "context"]);
      const outcome = pick(walkthrough, ["result", "outcome"]);
      if (situation && steps.length && outcome) {
        push({
          kind: "walkthrough",
          heading: "Một ví dụ thực tế",
          situation: clip(situation, LIMIT.situation),
          ...(walkthrough.input ? { input: clip(String(walkthrough.input), LIMIT.input) } : {}),
          steps,
          outcome: clip(outcome, LIMIT.outcome),
          ...(walkthrough.why ? { why: clip(String(walkthrough.why), LIMIT.why) } : {}),
        });
      }
    }
  }

  if (mode === "answering" && (modelAnswer || interviewQuestion)) {
    const answer = clip(modelAnswer ?? "", LIMIT.answer);
    if (answer.length >= TEACHING_MIN) {
      push({
        kind: "answer",
        heading: "Câu trả lời mẫu",
        question: clip(interviewQuestion ?? "Bạn trình bày câu trả lời này như thế nào?", LIMIT.question),
        answer,
        notes: notesFromText(answer) ?? [{ point: clip(answer, LIMIT.point) }],
      });
    }
    if (tradeOff) {
      const benefit = pick(tradeOff, ["benefit", "upside", "gain"]);
      const cost = pick(tradeOff, ["cost", "downside", "price"]);
      const when = pick(tradeOff, ["when", "condition"]);
      const options = [
        { label: "Chọn khi", when: clip(when ?? benefit ?? "", LIMIT.when), why: benefit ? clip(benefit, LIMIT.compareWhy) : undefined },
        { label: "Đánh đổi", when: clip(cost ?? "", LIMIT.when), why: cost ? clip(cost, LIMIT.compareWhy) : undefined },
      ].filter((option) => option.when);
      if (options.length >= 2) {
        push({ kind: "compare", heading: "Đánh đổi", options, takeaway: clip(when ?? benefit ?? "", LIMIT.takeaway) });
      }
    }
  }

  if (!blocks.length) {
    // The first stored format had no mode: one explanation and one worked example.
    if (explanation) push({ kind: "explain", heading: "Giải thích", body: clip(explanation, LIMIT.body) });
    if (example && example.length >= TEACHING_MIN) {
      const answer = clip(example, LIMIT.answer);
      push({
        kind: "answer",
        heading: "Áp dụng thực tế",
        question: clip(pick(source, ["goal"]) ?? "Áp dụng kiến thức này vào tình huống thật thế nào?", LIMIT.question),
        answer,
        notes: notesFromText(answer) ?? [{ point: clip(answer, LIMIT.point) }],
      });
    }
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Quiz normalisation                                                  */
/* ------------------------------------------------------------------ */

const OPTION_IDS = ["A", "B", "C"] as const;

function normalizeOption(item: unknown, index: number): { id: string; text: string } | null {
  const object = asObject(item);
  if (!object) {
    const value = asText(item);
    if (!value) return null;
    const match = value.match(/^\s*([ABC])[).:]\s*(.+)$/i);
    if (match) return { id: match[1].toUpperCase(), text: clip(match[2], LIMIT.option) };
    return { id: OPTION_IDS[index] ?? String(index), text: clip(value, LIMIT.option) };
  }
  const label = pick(object, ["id", "key", "label", "letter", "code"]);
  const textValue = pick(object, ["text", "label", "value", "body", "content", "option"]);
  if (!textValue) return null;
  const id = label && /^[abc]$/i.test(label) ? label.toUpperCase() : OPTION_IDS[index] ?? String(index);
  return { id, text: clip(textValue, LIMIT.option) };
}

interface QuizQuestion {
  stem: string;
  options: { id: string; text: string }[];
  correctOption: string;
  explanation: string;
}

function normalizeQuestion(item: unknown): QuizQuestion | null {
  const object = asObject(item);
  if (!object) return null;
  const stem = text(object, ["stem", "question", "prompt", "text", "q"], LIMIT.stem, TEXT_MIN);
  if (!stem) return null;
  const rawOptions = list(object, ["options", "choices", "answers", "alternatives"]);
  if (!rawOptions || rawOptions.length < 3) return null;
  const options = rawOptions.slice(0, 3)
    .map(normalizeOption)
    .filter((option): option is { id: string; text: string } => Boolean(option));
  if (options.length < 3) return null;
  for (let index = 0; index < 3; index += 1) {
    if (options[index].id !== OPTION_IDS[index]) options[index].id = OPTION_IDS[index];
  }
  const rawCorrect = pick(object, ["correctOption", "correct_option", "correct", "answer", "key", "answerId"]);
  let correctIndex = 0;
  if (rawCorrect) {
    const letter = rawCorrect.match(/[abc]/i);
    const number = rawCorrect.match(/\d+/);
    if (letter && /^[abc]$/i.test(rawCorrect.trim())) {
      correctIndex = OPTION_IDS.indexOf(letter[0].toUpperCase() as "A" | "B" | "C");
    } else if (number) {
      const value = Number(number[0]);
      correctIndex = Math.min(2, Math.max(0, value > 2 ? value - 1 : value));
    } else {
      const matched = options.findIndex((option) => option.text.toLowerCase() === rawCorrect.toLowerCase());
      correctIndex = matched >= 0 ? matched : 0;
    }
  }
  const correctOption = OPTION_IDS[correctIndex];
  const explanation = text(object, ["explanation", "reason", "rationale", "why", "justification"], LIMIT.explanation, TEXT_MIN)
    ?? options[correctIndex].text;
  return { stem, options, correctOption, explanation };
}

/* ------------------------------------------------------------------ */
/*  Self-check synthesis from the lesson's own words                    */
/* ------------------------------------------------------------------ */

const SENTENCE_MIN = 30;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= SENTENCE_MIN);
}

/** Talking points for an answer block, taken from the answer's own sentences. */
function notesFromText(answer: string): { point: string; reason?: string }[] | undefined {
  const parts = sentences(answer).slice(0, 3);
  if (!parts.length) return undefined;
  return parts.map((part) => ({ point: clip(part, LIMIT.point) }));
}

/** Words that start a sentence and therefore say nothing about the topic. */
const STOP_WORDS = new Set([
  "the", "this", "that", "these", "those", "if", "when", "while", "because", "but", "and",
  "or", "in", "on", "at", "as", "for", "it", "its", "they", "we", "you", "i", "there",
  "here", "example", "case", "note", "step", "first", "second", "third", "finally",
  "also", "then", "so", "however", "therefore", "instead", "moreover", "besides",
  "unlike", "similarly", "vi", "du", "va", "nhung", "khi", "neu", "hay", "mot",
  "cac", "do", "day", "nen", "tuy", "con", "sau", "truoc", "dung", "sai", "de",
  "voi", "trong", "ngoai", "ra", "them", "nua", "ma", "bi", "boi", "theo", "ve",
]);

/** Terms worth turning into a question: quoted, code-like or introduced by "là/means". */
function extractTerms(texts: string[]): string[] {
  const terms = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim().replace(/^["'“”`]+|["'“”`,.;:!?]+$/g, "");
    if (trimmed.length < 3 || trimmed.length > 60) return;
    if (STOP_WORDS.has(trimmed.toLowerCase())) return;
    terms.add(trimmed);
  };
  for (const text of texts) {
    for (const match of text.matchAll(/["“]([^"“”]{3,60})["”]/g)) add(match[1]);
    for (const match of text.matchAll(/`([^`]{3,60})`/g)) add(match[1]);
    for (const match of text.matchAll(/\b(?:gọi là|được gọi là|tức là|nghĩa là|means|called|is called)\s+([^,.;:!?\n]{3,60})/gi)) {
      add(match[1]);
    }
    const words = text.split(/\s+/);
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index].replace(/[.,;:!?()[\]"“”]/g, "");
      if (word.length < 3 || word.length > 40) continue;
      const previous = words[index - 1] ?? "";
      const startsSentence = index === 0 || /[.!?]["”]?$/.test(previous);
      if (STOP_WORDS.has(word.toLowerCase())) continue;
      // Only a Latin proper noun counts: a Vietnamese word such as "đọc" also
      // starts with a capital-looking letter and would flood the distractors.
      if (!/^[A-Z][A-Za-z]*$/.test(word)) continue;
      if (startsSentence && !/^[A-Z]{2,}/.test(word)) continue;
      add(word);
    }
  }
  return Array.from(terms);
}

/** A statement taken from the lesson, used as the correct answer of a question. */
interface Statement { text: string }

function collectStatements(blocks: Json[], extra: string[]): Statement[] {
  const statements: Statement[] = [];
  const seen = new Set<string>();
  const add = (sentence: string) => {
    const key = sentence.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    statements.push({ text: sentence });
  };
  for (const block of blocks) {
    const object = asObject(block);
    if (!object) continue;
    for (const key of ["body", "answer", "correction", "outcome", "situation", "takeaway", "why", "evidence"]) {
      const value = asText(object[key]);
      if (!value) continue;
      for (const sentence of sentences(value)) add(sentence);
    }
  }
  for (const value of extra) {
    for (const sentence of sentences(value)) add(sentence);
  }
  return statements;
}

/** Put the correct option in a different slot for every question. */
function buildQuestion(
  stem: string, correct: string, distractors: string[], index: number,
): QuizQuestion | null {
  const unique = [correct, ...distractors].filter((option, position, all) =>
    option && all.findIndex((other) => other.toLowerCase() === option.toLowerCase()) === position);
  if (unique.length < 3) return null;
  const slot = index % 3;
  // The correct option moves through A, B and C; the wrong ones follow.
  const ordered = unique.slice(1);
  ordered.splice(slot, 0, unique[0]);
  return {
    stem: clip(stem, LIMIT.stem),
    options: ordered.map((text, position) => ({ id: OPTION_IDS[position], text: clip(text, LIMIT.option) })),
    correctOption: OPTION_IDS[slot],
    explanation: "",
  };
}

/**
 * Builds a self-check from the lesson's own words: a term is blanked out of a
 * sentence the lesson already made, and other terms of the lesson become the
 * wrong options. Nothing is invented and the answer key stays correct.
 */
function synthesizeQuestions(blocks: Json[], extra: string[], language: "vi" | "en"): QuizQuestion[] {
  const statements = collectStatements(blocks, extra);
  if (!statements.length) return [];
  const texts: string[] = [];
  for (const block of blocks) {
    const object = asObject(block);
    if (!object) continue;
    for (const value of Object.values(object)) {
      if (typeof value === "string") texts.push(value);
      else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") texts.push(item);
          else if (item && typeof item === "object") {
            for (const nested of Object.values(item)) if (typeof nested === "string") texts.push(nested);
          }
        }
      }
    }
  }
  texts.push(...extra);
  const terms = extractTerms(texts);
  const questions: QuizQuestion[] = [];
  const usedTerms = new Set<string>();

  for (const statement of statements) {
    if (questions.length >= 2) break;
    const term = terms.find((candidate) =>
      !usedTerms.has(candidate) &&
      statement.text.includes(candidate) &&
      !statement.text.startsWith(candidate));
    if (!term) continue;
    // A term used as the key before may still serve as a wrong option here:
    // the lesson is the only source of distractors, and it has few terms.
    const others = terms.filter((candidate) => candidate.toLowerCase() !== term.toLowerCase());
    if (others.length < 2) continue;
    usedTerms.add(term);
    const stem = statement.text.replace(term, "____");
    const question = buildQuestion(stem, term, [others[0], others[1]], questions.length);
    if (!question) continue;
    question.explanation = clip(statement.text, LIMIT.explanation);
    questions.push(question);
  }

  if (questions.length < 2) {
    // No usable term: the wrong options stay neutral, because another true
    // sentence of the lesson would be a wrong answer key.
    const wrong = language === "vi"
      ? ["Bài học không nêu điều này.", "Bài học nói ngược lại điểm này."]
      : ["The lesson does not cover this.", "The lesson states the opposite here."];
    for (const statement of statements) {
      if (questions.length >= 2) break;
      const stem = language === "vi"
        ? "Theo bài học, câu nào sau đây đúng?"
        : "According to the lesson, which statement is correct?";
      const question = buildQuestion(stem, statement.text, wrong, questions.length);
      if (!question) continue;
      question.explanation = clip(statement.text, LIMIT.explanation);
      questions.push(question);
    }
  }
  return questions;
}

/* ------------------------------------------------------------------ */
/*  Prose that never became JSON                                       */
/* ------------------------------------------------------------------ */

/**
 * Some providers ignore the requested shape and answer with plain teaching
 * prose. The words are still worth keeping, so each paragraph becomes one
 * explanation block instead of the whole paid answer being thrown away.
 */
function proseBlocks(raw: string): Json[] {
  const paragraphs = raw
    .split(/\n{2,}|(?<=[.!?])\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 80)
    .slice(0, 4);
  const blocks: Json[] = [];
  for (const paragraph of paragraphs) {
    const body = clip(paragraph, LIMIT.body);
    if (body.length < TEACHING_MIN) continue;
    const heading = clip(sentences(paragraph)[0] ?? paragraph, LIMIT.heading);
    blocks.push({ kind: "explain", heading, body });
  }
  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                         */
/* ------------------------------------------------------------------ */

/** The first sentence of the first block, used when the model sent no hook. */
function firstSentence(blocks: Json[]): string | null {
  for (const block of blocks) {
    const object = asObject(block);
    if (!object) continue;
    for (const key of ["body", "situation", "answer", "correction", "belief"]) {
      const value = asText(object[key]);
      if (value) {
        const [first] = sentences(value);
        return first ?? value;
      }
    }
  }
  return null;
}

/**
 * A small model often wraps the lesson in one more object, or answers with a
 * list holding the single lesson. Look one level down before giving up.
 */
function unwrapLesson(source: Json): Json {
  if (hasLessonShape(source)) return source;
  for (const key of WRAPPER_KEYS) {
    const inner = source[key];
    const object = Array.isArray(inner) ? asObject(inner[0]) : asObject(inner);
    if (!object || !hasLessonShape(object)) continue;
    // Keep the outer wording when the inner object did not provide it.
    const merged: Json = { ...object };
    for (const field of ["title", "goal", "hook", "objectives"]) {
      if (merged[field] === undefined && source[field] !== undefined) merged[field] = source[field];
    }
    return merged;
  }
  return source;
}

/** True when the object carries teaching content rather than being an envelope. */
function hasLessonShape(source: Json): boolean {
  if (list(source, ["blocks", "sections", "parts", "items", "body_blocks"])?.length) return true;
  return Boolean(
    pick(source, ["title", "name", "topic", "subject"]) &&
    pick(source, ["goal", "objective", "purpose", "aim"]),
  );
}

/**
 * Reshape any reasonable model answer into the v3 contract.
 * `raw` may be the raw text, a parsed object, or a v1/v2 payload.
 */
export function repairLessonOutput(
  raw: unknown,
  mode: LearningMode,
  language: "vi" | "en" = "vi",
): RepairOutcome {
  const notes: string[] = [];
  let value: unknown = raw;
  if (typeof raw === "string") {
    const extracted = extractJson(raw);
    if (!extracted) {
      // No JSON at all: keep the teaching prose the model did write.
      const prose = proseBlocks(raw);
      if (!prose.length) return { ok: false, notes: ["no-JSON-object"], issues: ["not-json"] };
      const opening = sentences(prose[0].body as string)[0] ?? (prose[0].body as string);
      value = { title: opening, goal: opening, blocks: prose };
      notes.push("built-the-lesson-from-the-prose-the-model-wrote");
    } else {
      value = extracted.value;
      if (extracted.salvaged) notes.push("closed-a-cut-off-JSON-object");
    }
  }
  const envelope = asObject(value);
  if (!envelope) return { ok: false, notes, issues: ["not-an-object"] };
  const source = unwrapLesson(envelope);
  if (source !== envelope) notes.push("unwrapped-the-lesson-from-its-envelope");

  const title = text(source, ["title", "name", "topic", "subject"], LIMIT.title, TEXT_MIN);
  const goal = text(source, ["goal", "objective", "purpose", "summary", "aim"], LIMIT.goal);
  const hook = text(source, ["hook", "intro", "opening", "lead", "scenario"], LIMIT.hook);
  const objectives = (list(source, ["objectives", "goals", "key_points", "keyPoints", "takeaways", "outcomes"]) ?? [])
    .flatMap((item) => {
      const value = asText(item);
      return value ? [clip(value, LIMIT.objective)] : [];
    })
    .filter((item) => item.length >= TEACHING_MIN)
    .slice(0, 3);

  const rawBlocks = list(source, ["blocks", "sections", "parts", "content", "items", "body_blocks"]);
  const blocks: Json[] = [];
  const fallbackQuestion = goal ?? title ?? "Bạn trình bày câu trả lời này như thế nào?";
  if (rawBlocks?.length) {
    rawBlocks.forEach((item, index) => {
      const block = normalizeBlock(item, index, fallbackQuestion);
      if (block) blocks.push(block);
      else notes.push(`dropped-unreadable-block-${index + 1}`);
    });
  } else {
    blocks.push(...legacyBlocks(source, mode));
    if (blocks.length) notes.push("rebuilt-from-an-older-lesson-shape");
  }

  // Distinct headings keep the outline readable.
  const seen = new Set<string>();
  for (const block of blocks) {
    const heading = String(block.heading ?? "").trim();
    const key = heading.toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      let counter = 2;
      let candidate = `${heading} (${counter})`;
      while (seen.has(candidate.toLowerCase())) { counter += 1; candidate = `${heading} (${counter})`; }
      block.heading = clip(candidate, LIMIT.heading);
    }
    seen.add(String(block.heading).toLowerCase());
  }

  // Each mode needs one block that makes the topic concrete.
  const kinds = new Set(blocks.map((block) => block.kind));
  if (mode === "answering" && !kinds.has("answer")) {
    const converted = toAnswerBlock(blocks, fallbackQuestion);
    if (converted) { blocks.push(converted); notes.push("turned-a-block-into-a-speakable-answer"); }
  }
  if (mode === "fundamentals" && !blocks.some((block) => ["walkthrough", "compare", "answer"].includes(String(block.kind)))) {
    const converted = toAnswerBlock(blocks, fallbackQuestion);
    if (converted) { blocks.push(converted); notes.push("turned-a-block-into-a-spoken-explanation"); }
  }

  const finalBlocks = blocks.slice(0, 5);
  // The goal and the hook fall back to the model's own first sentence, so the
  // lesson never carries a made-up claim about the topic.
  const opening = firstSentence(finalBlocks);
  const resolvedGoal = (() => {
    for (const candidate of [goal, objectives[0], opening, title]) {
      if (candidate && candidate.length >= TEACHING_MIN) return clip(candidate, LIMIT.goal);
    }
    return language === "vi"
      ? "Hiểu được chủ đề này và cách dùng nó trong một tình huống thật."
      : "Understand this topic and how to use it in a real situation.";
  })();
  const rawQuestions = list(source, ["questions", "quiz", "checks", "quiz_questions"]);
  const questions = (rawQuestions ?? [])
    .map(normalizeQuestion)
    .filter((question): question is QuizQuestion => Boolean(question))
    .slice(0, 3);
  if (questions.length < 2 && finalBlocks.length) {
    const fallback = synthesizeQuestions(finalBlocks, [resolvedGoal, hook ?? opening].filter((item): item is string => Boolean(item)), language);
    if (fallback.length) notes.push("built-the-self-check-from-the-lesson");
    questions.push(...fallback);
  }

  const payload: Json = {
    version: 3,
    mode,
    title: title ?? clip(resolvedGoal, LIMIT.title),
    goal: resolvedGoal,
    objectives: objectives.length ? objectives : [clip(resolvedGoal, LIMIT.objective)],
    hook: hook ?? clip(opening ?? resolvedGoal, LIMIT.hook),
    blocks: finalBlocks,
    questions: questions.slice(0,  3),
  };

  const parsed = FlexibleLessonSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      notes,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}:${issue.code}`),
    };
  }
  return { ok: true, payload: parsed.data, notes, issues: [] };
}

/** The teaching content of one block, as one readable stretch of prose. */
function blockNarrative(block: Json): string {
  const kind = String(block.kind);
  if (kind === "walkthrough") {
    const steps = Array.isArray(block.steps)
      ? block.steps.map((step) => {
        const object = asObject(step);
        if (!object) return asText(step) ?? "";
        const action = asText(object.action) ?? "";
        const reason = asText(object.reason) ?? "";
        return reason ? `${action} (${reason})` : action;
      }).filter(Boolean)
      : [];
    return [asText(block.situation), ...steps, asText(block.outcome), asText(block.why)]
      .filter((value): value is string => Boolean(value)).join(" ");
  }
  if (kind === "compare") {
    const options = Array.isArray(block.options)
      ? block.options.map((option) => {
        const object = asObject(option);
        if (!object) return asText(option) ?? "";
        return [asText(object.label), asText(object.when), asText(object.why)]
          .filter((value): value is string => Boolean(value)).join(": ");
      }).filter(Boolean)
      : [];
    return [asText(block.takeaway), ...options].join(" ");
  }
  if (kind === "misconception") {
    return [asText(block.correction), asText(block.evidence)].filter(Boolean).join(" ");
  }
  return [asText(block.body), asText(block.why)].filter(Boolean).join(" ");
}

/** Reuse the model's own prose as a speakable answer when a mode needs one. */
function toAnswerBlock(blocks: Json[], fallbackQuestion: string): Json | null {
  const source = blocks.find((block) => ["explain", "walkthrough", "misconception", "compare"].includes(String(block.kind)));
  if (!source) return null;
  const body = blockNarrative(source);
  if (!body || body.length < TEACHING_MIN) return null;
  const notes = notesFromText(body) ?? [{ point: clip(body, LIMIT.point) }];
  return {
    kind: "answer",
    heading: KIND_LABEL.answer,
    question: clip(asText(source.question) ?? fallbackQuestion, LIMIT.question),
    answer: clip(body, LIMIT.answer),
    notes,
  };
}
