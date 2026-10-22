import { z } from "zod";

/** The stored lesson is private: answer keys and explanations never leave the server before a check. */
export const LearningModeSchema = z.enum(["fundamentals", "answering"]);
export type LearningMode = z.infer<typeof LearningModeSchema>;
export const SourceKindSchema = z.enum(["improvement", "next_step"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;
export const OptionIdSchema = z.enum(["A", "B", "C"]);
export type OptionId = z.infer<typeof OptionIdSchema>;

export const LESSON_MAX_BYTES = 16 * 1024;

const requiredText = (max: number) => z.string().min(1).max(max);
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

export const LessonSchema = z.object({
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
  questions: z.array(QuestionSchema).min(2).max(3),
}).strict();
export type Lesson = z.infer<typeof LessonSchema>;

/** Parse model output or a stored JSON blob without repairing malformed/truncated data. */
export function parseLesson(raw: unknown): Lesson | null {
  try {
    if (typeof raw === "string") {
      if (Buffer.byteLength(raw, "utf8") > LESSON_MAX_BYTES) return null;
      raw = JSON.parse(raw) as unknown;
    }
    const parsed = LessonSchema.safeParse(raw);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > LESSON_MAX_BYTES) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/** An explicit allowlist prevents accidental exposure of private quiz fields on GET/SSR. */
export function publicLesson(lesson: Lesson) {
  return {
    version: lesson.version,
    title: lesson.title,
    goal: lesson.goal,
    objectives: [...lesson.objectives],
    explanation: lesson.explanation,
    example: lesson.example,
    sections: lesson.sections.map((section) => ({
      heading: section.heading,
      body: section.body,
      ...(section.code === undefined ? {} : { code: section.code }),
    })),
    questions: lesson.questions.map((question) => ({
      stem: question.stem,
      options: question.options.map((option) => ({ id: option.id, text: option.text })),
    })),
  };
}
export type PublicLesson = ReturnType<typeof publicLesson>;

/** Completeness is checked against the persisted lesson when submitting a check. */
export const AttemptInputSchema = z.object({
  clientAttemptId: z.string().uuid(),
  answers: z.array(OptionIdSchema).min(2).max(3),
}).strict();
export type AttemptInput = z.infer<typeof AttemptInputSchema>;
