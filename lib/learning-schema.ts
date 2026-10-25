import { z } from "zod";

/** The stored lesson is private: answer keys and explanations never leave the server before a check. */
export const LearningModeSchema = z.enum(["fundamentals", "answering"]);
export type LearningMode = z.infer<typeof LearningModeSchema>;
export const SourceKindSchema = z.enum(["improvement", "next_step"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;
export const OptionIdSchema = z.enum(["A", "B", "C"]);
export type OptionId = z.infer<typeof OptionIdSchema>;

export const LEGACY_LESSON_MAX_BYTES = 16 * 1024;
export const LESSON_MAX_BYTES = 24 * 1024;

/**
 * Why a lesson could not be stored. The code is safe to show and to persist:
 * it never contains model output, a provider message or a credential.
 */
export const LessonFailureReasonSchema = z.enum([
  "provider_error",
  "timeout",
  "truncated",
  "too_large",
  "invalid_format",
  "empty",
]);
export type LessonFailureReason = z.infer<typeof LessonFailureReasonSchema>;

const requiredText = (max: number) => z.string().min(1).max(max);
const teachingText = (max: number) => z.string().trim().min(12).max(max);
const OptionSchema = z.object({
  id: OptionIdSchema,
  text: requiredText(240),
}).strict();

const QuestionSchema = z.object({
  stem: requiredText(400),
  options: z.tuple([OptionSchema, OptionSchema, OptionSchema]).refine(
    (options) => options[0].id === "A" && options[1].id === "B" && options[2].id === "C",
    "Options must be exactly A, B, C, in order",
  ),
  correctOption: OptionIdSchema,
  explanation: requiredText(400),
}).strict();

const questions = z.array(QuestionSchema).min(2).max(3);
export const LegacyLessonSchema = z.object({
  version: z.literal(1),
  title: requiredText(120),
  goal: requiredText(240),
  objectives: z.array(requiredText(240)).min(1).max(3),
  explanation: requiredText(3000),
  example: requiredText(2000),
  sections: z.array(z.object({
    heading: requiredText(120),
    body: requiredText(1600),
    code: requiredText(1200).optional(),
  }).strict()).min(1).max(4),
  questions,
}).strict();

const V2Base = z.object({
  version: z.literal(2),
  title: requiredText(120),
  goal: teachingText(240),
  objectives: z.array(teachingText(240)).min(1).max(3),
  questions,
});

export const FundamentalsLessonSchema = V2Base.extend({
  mode: z.literal("fundamentals"),
  concepts: z.array(z.object({ term: requiredText(100), meaning: teachingText(500) }).strict()).min(2).max(3),
  mechanism: teachingText(1800),
  walkthrough: z.object({
    situation: teachingText(500),
    input: teachingText(600),
    steps: z.array(z.object({ action: teachingText(500), reason: teachingText(500) }).strict()).min(2).max(4),
    result: teachingText(600),
    why: teachingText(700),
  }).strict(),
}).strict();

export const AnsweringLessonSchema = V2Base.extend({
  mode: z.literal("answering"),
  interviewQuestion: teachingText(400),
  modelAnswer: teachingText(2400),
  annotations: z.array(z.object({ point: teachingText(350), reason: teachingText(500) }).strict()).min(2).max(4),
  tradeOff: z.object({
    benefit: teachingText(500),
    cost: teachingText(500),
    when: teachingText(500),
  }).strict(),
  followUps: z.array(z.object({ question: teachingText(400), answer: teachingText(900) }).strict()).min(1).max(2),
}).strict();

/**
 * v3 lets the lesson choose its own shape: 1-5 ordered blocks whose kind depends on
 * the topic, so a mechanism topic, a decision topic and an interview-answer topic
 * do not all share one template.
 *
 * The rationale fields (`why`, a step `reason`, a compare option's `when`/`why`) are
 * optional on purpose: they are the part a small model most often skips, and losing
 * one sentence must not throw away a paid lesson. The teaching content itself stays
 * mandatory.
 */
const V3BlockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("explain"),
    heading: requiredText(120),
    body: teachingText(2000),
    why: teachingText(800).optional(),
  }).strict(),
  z.object({
    kind: z.literal("walkthrough"),
    heading: requiredText(120),
    situation: teachingText(500),
    input: teachingText(500).optional(),
    steps: z.array(z.object({ action: teachingText(400), reason: teachingText(400).optional() }).strict()).min(1).max(6),
    outcome: teachingText(600),
    why: teachingText(700).optional(),
  }).strict(),
  z.object({
    kind: z.literal("compare"),
    heading: requiredText(120),
    options: z.array(z.object({
      label: requiredText(80),
      when: teachingText(400).optional(),
      why: teachingText(500).optional(),
    }).strict()).min(2).max(4),
    takeaway: teachingText(600),
  }).strict(),
  z.object({
    kind: z.literal("misconception"),
    heading: requiredText(120),
    belief: teachingText(400),
    correction: teachingText(1500),
    evidence: teachingText(700).optional(),
  }).strict(),
  z.object({
    kind: z.literal("answer"),
    heading: requiredText(120),
    question: teachingText(400),
    answer: teachingText(2400),
    notes: z.array(z.object({ point: teachingText(350), reason: teachingText(500).optional() }).strict()).min(1).max(4),
    followUps: z.array(z.object({ question: teachingText(400), answer: teachingText(900) }).strict()).max(2).optional(),
  }).strict(),
]);

/** Blocks that make the topic concrete instead of only describing it. */
const APPLIED_BLOCK_KINDS = new Set(["walkthrough", "compare", "answer"]);

function countText(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.reduce((total, item) => total + countText(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((total, item) => total + countText(item), 0);
  }
  return 0;
}

const V3Base = z.object({
  version: z.literal(3),
  mode: LearningModeSchema,
  title: requiredText(120),
  goal: teachingText(240),
  objectives: z.array(teachingText(240)).min(1).max(3),
  hook: teachingText(600),
  blocks: z.array(V3BlockSchema).min(1).max(5),
  questions,
}).strict();

export const FlexibleLessonSchema = V3Base.superRefine((lesson, ctx) => {
  const kinds = new Set(lesson.blocks.map((block) => block.kind));
  if (lesson.mode === "answering" && !kinds.has("answer")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocks"],
      message: "An answering lesson needs at least one speakable answer block",
    });
  }
  if (lesson.mode === "fundamentals" && !lesson.blocks.some((block) => APPLIED_BLOCK_KINDS.has(block.kind))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocks"],
      message: "A fundamentals lesson needs a concrete worked example, comparison or spoken answer",
    });
  }
  const headings = lesson.blocks.map((block) => block.heading.trim().toLowerCase());
  if (new Set(headings).size !== headings.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocks"],
      message: "Block headings must be distinct",
    });
  }
  // A lesson that repeats the goal in a few sentences is not a lesson.
  const minimum = lesson.mode === "answering" ? 450 : 400;
  if (countText(lesson.blocks) < minimum) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["blocks"],
      message: "Lesson content is too thin to teach the topic",
    });
  }
});

export const LessonSchema = z.union([
  LegacyLessonSchema,
  FundamentalsLessonSchema,
  AnsweringLessonSchema,
  FlexibleLessonSchema,
]);
export type Lesson = z.infer<typeof LessonSchema>;
export type LessonBlock = z.infer<typeof V3BlockSchema>;

/**
 * The first stored format had no `version`/`objectives`/`sections`: it kept
 * `schema_version`, one `explanation`, one `example` and a list of `takeaways`.
 * Those lessons must stay readable, so they are mapped onto the v1 shape instead
 * of being rejected. The stored bytes are never rewritten.
 */
const StoredLegacySchema = z.object({
  schema_version: z.union([z.literal(1), z.literal("1"), z.literal("v1")]),
  title: requiredText(120),
  goal: requiredText(240),
  explanation: requiredText(3000),
  example: requiredText(2000),
  takeaways: z.array(requiredText(600)).min(1).max(6),
  questions,
}).passthrough();

function clipText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Maps a first-generation stored lesson onto the v1 contract. */
function adaptStoredLegacy(raw: unknown): unknown | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== undefined || record.schema_version === undefined) return null;
  const parsed = StoredLegacySchema.safeParse(record);
  if (!parsed.success) return null;
  const takeaways = parsed.data.takeaways.map((item) => clipText(item, 240));
  return {
    version: 1,
    title: parsed.data.title,
    goal: parsed.data.goal,
    objectives: takeaways.slice(0, 3),
    explanation: clipText(parsed.data.explanation, 3000),
    example: clipText(parsed.data.example, 2000),
    sections: takeaways.map((item, index) => ({
      heading: `Điều cần nhớ ${index + 1}`,
      body: clipText(item, 1600),
    })),
    questions: parsed.data.questions,
  };
}

/** Parse model output or stored JSON without repairing it; v1 has no embedded mode. */
export function parseLesson(raw: unknown, expectedMode?: LearningMode): Lesson | null {
  try {
    const rawBytes = typeof raw === "string" ? Buffer.byteLength(raw, "utf8") : 0;
    if (rawBytes > LESSON_MAX_BYTES) return null;
    if (typeof raw === "string") raw = JSON.parse(raw) as unknown;
    const adapted = adaptStoredLegacy(raw);
    if (adapted) raw = adapted;
    const parsed = LessonSchema.safeParse(raw);
    if (!parsed.success || (parsed.data.version !== 1 && expectedMode && parsed.data.mode !== expectedMode)) return null;
    const limit = parsed.data.version === 1 ? LEGACY_LESSON_MAX_BYTES : LESSON_MAX_BYTES;
    if (rawBytes > limit || Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > limit) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** An explicit allowlist prevents accidental exposure of private quiz fields on GET/SSR. */
export function publicLesson(lesson: Lesson) {
  const common = {
    version: lesson.version,
    title: lesson.title,
    goal: lesson.goal,
    objectives: [...lesson.objectives],
    questions: lesson.questions.map((question) => ({
      stem: question.stem,
      options: question.options.map((option) => ({ id: option.id, text: option.text })),
    })),
  };
  if (lesson.version === 1) {
    return {
      ...common, version: lesson.version,
      explanation: lesson.explanation,
      example: lesson.example,
      sections: lesson.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
        ...(section.code === undefined ? {} : { code: section.code }),
      })),
    };
  }
  if (lesson.version === 3) {
    return {
      ...common, version: lesson.version, mode: lesson.mode,
      hook: lesson.hook,
      blocks: lesson.blocks.map((block) => {
        switch (block.kind) {
          case "explain":
            return {
              kind: block.kind, heading: block.heading, body: block.body,
              ...(block.why === undefined ? {} : { why: block.why }),
            };
          case "walkthrough":
            return {
              kind: block.kind, heading: block.heading, situation: block.situation,
              ...(block.input === undefined ? {} : { input: block.input }),
              steps: block.steps.map(({ action, reason }) => (
                reason === undefined ? { action } : { action, reason }
              )),
              outcome: block.outcome,
              ...(block.why === undefined ? {} : { why: block.why }),
            };
          case "compare":
            return {
              kind: block.kind, heading: block.heading,
              options: block.options.map(({ label, when, why }) => ({
                label,
                ...(when === undefined ? {} : { when }),
                ...(why === undefined ? {} : { why }),
              })),
              takeaway: block.takeaway,
            };
          case "misconception":
            return {
              kind: block.kind, heading: block.heading, belief: block.belief,
              correction: block.correction,
              ...(block.evidence === undefined ? {} : { evidence: block.evidence }),
            };
          case "answer":
            return {
              kind: block.kind, heading: block.heading, question: block.question, answer: block.answer,
              notes: block.notes.map(({ point, reason }) => (
                reason === undefined ? { point } : { point, reason }
              )),
              followUps: (block.followUps ?? []).map(({ question, answer }) => ({ question, answer })),
            };
        }
      }),
    };
  }
  if (lesson.mode === "fundamentals") {
    return {
      ...common, version: lesson.version, mode: lesson.mode,
      concepts: lesson.concepts.map(({ term, meaning }) => ({ term, meaning })),
      mechanism: lesson.mechanism,
      walkthrough: {
        situation: lesson.walkthrough.situation,
        input: lesson.walkthrough.input,
        steps: lesson.walkthrough.steps.map(({ action, reason }) => ({ action, reason })),
        result: lesson.walkthrough.result,
        why: lesson.walkthrough.why,
      },
    };
  }
  return {
    ...common, version: lesson.version, mode: lesson.mode,
    interviewQuestion: lesson.interviewQuestion,
    modelAnswer: lesson.modelAnswer,
    annotations: lesson.annotations.map(({ point, reason }) => ({ point, reason })),
    tradeOff: {
      benefit: lesson.tradeOff.benefit,
      cost: lesson.tradeOff.cost,
      when: lesson.tradeOff.when,
    },
    followUps: lesson.followUps.map(({ question, answer }) => ({ question, answer })),
  };
}
export type PublicLesson = ReturnType<typeof publicLesson>;

/** Completeness is checked against the persisted lesson when submitting a check. */
export const AttemptInputSchema = z.object({
  clientAttemptId: z.string().uuid(),
  answers: z.array(OptionIdSchema).min(2).max(3),
}).strict();
export type AttemptInput = z.infer<typeof AttemptInputSchema>;
