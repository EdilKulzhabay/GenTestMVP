import type { RoadmapTestSubmittedResponse } from './roadmap.types';

export interface TestQuestion {
  questionText: string;
  options: string[];
  /** TODO: временное поле для быстрого тестирования — убрать в продакшене */
  correctOption?: string;
}

export interface GeneratedTest {
  _id: string;
  subjectId: string;
  bookId: string;
  chapterId?: string;
  questions: TestQuestion[];
  createdAt: string;
}

export interface GenerateTestRequest {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
  /** Тема-фокус из roadmap-узла — AI сфокусирует вопросы на этой теме */
  topicFocus?: string;
}

export interface SubmitAnswer {
  questionText: string;
  selectedOption: string;
}

export interface SubmitTestRequest {
  testId: string;
  answers: SubmitAnswer[];
  /** Узел roadmap + уникальный id сессии (см. roadmap API) */
  roadmapNodeId?: string;
  roadmapSessionId?: string;
}

export interface TestResultSummary {
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
}

export interface TestMistake {
  question: string;
  explanation: string;
  /** Источник в учебнике. Может отсутствовать — тогда показываем "что повторить" текстом */
  whereToRead?: {
    bookTitle: string;
    chapterTitle: string;
    pages: number[];
    topicTitle?: string;
  };
}

export interface AiFeedback {
  summary: string;
  mistakes: TestMistake[];
}

export interface SubmitTestResponse {
  testId: string;
  result: TestResultSummary;
  aiFeedback: AiFeedback;
  detailedAnswers: Array<{
    questionText: string;
    options: string[];
    correctOption: string;
    selectedOption: string;
    isCorrect: boolean;
    explanation?: string;
  }>;
  /** Если в submit передали roadmapNodeId + roadmapSessionId */
  roadmap?: RoadmapTestSubmittedResponse;
}

export interface TestHistoryItem {
  _id: string;
  subjectId: { _id: string; title: string } | string;
  bookId: string;
  chapterId?: string;
  result: TestResultSummary;
  aiFeedback: AiFeedback;
  createdAt: string;
}
