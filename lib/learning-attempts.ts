import { gradeAnswers } from "./learning-check";
import type { Lesson, OptionId } from "./learning-schema";

export const MAX_LEARNING_ATTEMPTS = 20;

export interface LearningAttemptRow {
  id: string;
  client_attempt_id: string;
  answers_json: string;
  score: number;
  total: number;
  created_at: number;
}

/** Never return a stored lesson body: only the per-question result after submission. */
export function learningAttemptDto(row: LearningAttemptRow, lesson: Lesson) {
  const answers = JSON.parse(row.answers_json) as OptionId[];
  const grade = gradeAnswers(lesson, answers);
  return {
    id: row.id,
    clientAttemptId: row.client_attempt_id,
    answers,
    score: row.score,
    total: row.total,
    createdAt: row.created_at,
    questions: grade.questions,
  };
}
