import type { RoadmapTestSubmittedResponse } from './roadmap.types';

/** Режим генерации теста */
export type TestGenerationProfile = 'regular' | 'ent';

/** Форматы заданий в духе ЕНТ (Казахстан) */
export type EntQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'matching_single'
  | 'matching_multiple'
  | 'short_answer'
  | 'text_input';

export interface TestQuestion {
  questionType?: EntQuestionType;
  questionText: string;
  options?: string[];
  matchingLeft?: { id: string; text: string }[];
  matchingRight?: { id: string; text: string }[];
  relatedContent?: { pages?: number[] };
  /** Временно с сервера (SHOW_TEST_CORRECT_ANSWERS); убрать из прод-режима */
  correctAnswerHint?: string;
  /** Временно: готовая строка ответа для полей (как в submit) — убрать вместе с dev-подсказками */
  devPrefillValue?: string;
}

export interface GeneratedTest {
  _id: string;
  subjectId: string;
  bookId: string;
  chapterId?: string;
  /** regular — 10 MCQ; ent — смешанные типы как в ЕНТ */
  testProfile?: TestGenerationProfile;
  questions: TestQuestion[];
  createdAt: string;
  mode?: 'daily_pack' | 'practice';
  dailyPackId?: string;
  attemptType?: 'ranked' | 'practice';
  rankedUsedToday?: boolean;
  questionTimeLimitSec?: number;
  soloSessionId?: string;
  soloCurrentQuestionIndex?: number;
  soloQuestionStartedAt?: string;
}

export interface GenerateTestRequest {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
  /** Тема-фокус из roadmap-узла — AI сфокусирует вопросы на этой теме */
  topicFocus?: string;
  /** Для теста с карты знаний — сервер проверяет лимит неудач */
  roadmapNodeId?: string;
  testProfile?: TestGenerationProfile;
  /** Пробник ЕНТ: 20, 10, 40… */
  questionCount?: number;
  /** Пробник: сервер не подменяет тест «последним по предмету», а генерирует под выбранную книгу/главу */
  forTrial?: boolean;
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
  /** Пробник: в ответе — trialTopicMastery по темам (≥ 80% в тесте) */
  forTrial?: boolean;
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
    questionType?: EntQuestionType;
    questionText: string;
    options: string[];
    /** Текстовая сводка правильного ответа (все типы) */
    correctOption: string;
    selectedOption: string;
    isCorrect: boolean;
    explanation?: string;
    matchingLeft?: { id: string; text: string }[];
    matchingRight?: { id: string; text: string }[];
  }>;
  /** Если в submit передали roadmapNodeId + roadmapSessionId */
  roadmap?: RoadmapTestSubmittedResponse;
  /** Пробник (forTrial): темы с ≥ 80% за этот тест, для /trial/apply-results */
  trialTopicMastery?: Array<{ subjectId: string; nodeId: string; scorePercent: number }>;
  solo?: {
    dailyPackId: string;
    mode: 'daily_pack' | 'practice';
    attemptType: 'ranked' | 'practice';
    finalScore: number;
    questionTimeLimitSec: number;
    rank: number | null;
  };
}

export interface StartSoloTestRequest extends GenerateTestRequest {
  mode: 'daily_pack' | 'practice';
}

export interface SubmitSoloAnswerRequest {
  soloSessionId: string;
  questionIndex: number;
  selectedOption: string;
}

export interface SubmitSoloAnswerResponse {
  accepted: boolean;
  questionIndex: number;
  isCorrect: boolean;
  questionScore: number;
  responseTimeMs: number;
  finished: boolean;
  nextQuestionIndex: number | null;
  questionStartedAt: string | null;
}

export interface FinishSoloTestRequest {
  soloSessionId: string;
}

export interface SoloLeaderboardResponse {
  period: 'today' | 'week';
  dailyPackId: string;
  top10: Array<{ rank: number; userId: string; fullName: string; score: number }>;
  me: { rank: number | null; score: number } | null;
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
