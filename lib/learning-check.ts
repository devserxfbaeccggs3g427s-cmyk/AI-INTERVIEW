import { OptionIdSchema, type Lesson, type OptionId } from "./learning-schema";

export interface GradedQuestion {
  selectedOption: OptionId;
  correctOption: OptionId;
  explanation: string;
  isCorrect: boolean;
}

export interface GradedAnswers {
  score: number;
  total: number;
  questions: GradedQuestion[];
}

/** Grade only the saved immutable lesson; do not call a provider or interpret model prose. */
export function gradeAnswers(lesson: Lesson, answers: OptionId[]): GradedAnswers {
  if (!Array.isArray(answers) || answers.length !== lesson.questions.length ||
      !answers.every((answer) => OptionIdSchema.safeParse(answer).success)) {
    throw new Error("Invalid answers for lesson");
  }
  const questions = lesson.questions.map((question, index) => ({
    selectedOption: answers[index],
    correctOption: question.correctOption,
    explanation: question.explanation,
    isCorrect: answers[index] === question.correctOption,
  }));
  return {
    score: questions.filter((question) => question.isCorrect).length,
    total: questions.length,
    questions,
  };
}
