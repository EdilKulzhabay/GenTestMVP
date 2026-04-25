import { Types } from 'mongoose';

// ==================== ENUMS ====================

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard'
}

// ==================== CONTENT STRUCTURE ====================

export interface IMetadata {
  keywords?: string[];
  difficulty?: Difficulty;
  source?: string;
}

export interface IContent {
  text: string;
  pages: number[];
  metadata: IMetadata;
}

export interface IParagraph {
  _id?: Types.ObjectId;
  order: number;
  content: IContent;
}

export interface ITopic {
  _id?: Types.ObjectId;
  title: string;
  paragraphs: IParagraph[];
}

export interface IChapter {
  _id?: Types.ObjectId;
  title: string;
  order: number;
  topics: ITopic[];
}

export interface IBook {
  _id?: Types.ObjectId;
  title: string;
  author?: string;
  /** Язык текста книги (для ИИ: тесты и roadmap на этом языке) */
  contentLanguage?: string;
  chapters: IChapter[];
}

/** Предмет: основной (общий) или профильный (для пары ЕНТ) */
export type SubjectKind = 'main' | 'profile';

export interface ISubject {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
  /** По умолчанию main; profile — только для пар профильных предметов */
  subjectKind?: SubjectKind;
  books: IBook[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== USER & AUTH ====================

export interface IUserAnswer {
  question: string;
  selectedOption: string;
  isCorrect: boolean;
}

export interface ITestResult {
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
}

export interface IMistake {
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

export interface IAIFeedback {
  summary: string;
  mistakes: IMistake[];
}

export interface ITestHistory {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  bookId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  generatedQuestionsHash: string[]; // Хеши вопросов для избежания повторений
  answers: IUserAnswer[];
  result: ITestResult;
  aiFeedback: IAIFeedback;
  createdAt?: Date;
}

export interface IUser {
  _id?: Types.ObjectId;
  fullName: string;
  userName?: string;
  email?: string;
  phone?: string;
  password?: string;
  googleId?: string;
  role: UserRole;
  /** Выбранная пара профильных предметов */
  profileSubjectPairId?: Types.ObjectId;
  testHistory: ITestHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== TEST & QUESTIONS ====================

export interface IRelatedContent {
  chapterId?: Types.ObjectId;
  topicId?: Types.ObjectId;
  pages: number[];
  /** Временное поле от LLM до resolveTopicTitleToId */
  topicTitle?: string;
}

/** Типы заданий в духе форматов ЕНТ (Казахстан) */
export type EntQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'matching_single'
  | 'matching_multiple'
  | 'short_answer'
  | 'text_input';

export interface IMatchingItem {
  id: string;
  text: string;
}

export interface IQuestion {
  questionType?: EntQuestionType;
  questionText: string;
  aiExplanation: string;
  relatedContent: IRelatedContent;
  /** single_choice: 4–5 вариантов */
  options?: string[];
  correctOption?: string;
  /** multiple_choice: подмножество options */
  correctOptions?: string[];
  matchingLeft?: IMatchingItem[];
  matchingRight?: IMatchingItem[];
  /** matching_single: leftId -> rightId; matching_multiple: leftId -> rightId[] */
  correctMatching?: Record<string, string | string[]>;
  acceptableAnswers?: string[];
  acceptableKeywords?: string[];
  referenceAnswer?: string;
}

export interface ITest {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  bookId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  questions: IQuestion[];
  sourceContentHash: string; // Для кеширования
  testProfile?: TestGenerationProfile;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== DTO (Data Transfer Objects) ====================

// Auth DTOs
export interface IRegisterDTO {
  fullName: string;
  phone: string;
  email: string;
  userName: string;
  password: string;
}

export interface IVerifyPhoneDTO {
  phone: string;
  code: string;
}

export interface ILoginDTO {
  userName: string;
  password: string;
}

export interface IAuthResponse {
  token: string;
  user: {
    id: string;
    fullName: string;
    userName?: string;
    email?: string;
    role: UserRole;
  };
}

// Subject DTOs
export interface ICreateSubjectDTO {
  title: string;
  description?: string;
  subjectKind?: SubjectKind;
}

export interface IAddBookDTO {
  title: string;
  author?: string;
  contentLanguage?: string;
}

export interface IAddChapterDTO {
  title: string;
  order: number;
}

export interface IAddTopicDTO {
  title: string;
}

export interface IAddParagraphDTO {
  order: number;
  content: IContent;
}

/** Режим генерации: обычный (10 MCQ) или профильный как ЕНТ (смешанные типы) */
export type TestGenerationProfile = 'regular' | 'ent';

// Test Generation DTOs
export interface IGenerateTestDTO {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
  /** Тема-фокус для генерации (из roadmap-узла). AI сфокусирует вопросы на этой теме */
  topicFocus?: string;
  /** Узел карты знаний — сервер проверяет, не превышен ли лимит неудачных попыток */
  roadmapNodeId?: string;
  /** По умолчанию ent — как раньше для API без поля */
  testProfile?: TestGenerationProfile;
  /** Формат ЕНТ: 10, 20, 40… (кратно 10, макс. 120). Пробник задаёт 20/10/10/40/40. */
  questionCount?: number;
}

export interface ISubmitTestDTO {
  testId: string;
  answers: {
    questionText: string;
    selectedOption: string;
  }[];
  /** Опционально: связать сессию теста с узлом roadmap (после submit обновится прогресс) */
  roadmapNodeId?: string;
  roadmapSessionId?: string;
  /** Пробник: в ответе придут trialTopicMastery (темы ≥ порога) для обновления карты после всех шагов */
  forTrial?: boolean;
}

// ==================== AI SERVICE TYPES ====================

export interface IGeneratedTest {
  questions: IQuestion[];
  sourceContentHash: string;
}

export interface IContentForAI {
  text: string;
  metadata: {
    subjectTitle: string;
    bookTitle: string;
    chapterTitle?: string;
    topics: string[];
    bookAuthor?: string;
    contentLanguage?: string;
    /** Заголовки глав по порядку (оглавление) */
    chapterTitles?: string[];
    /** Узел roadmap — AI фокусирует вопросы на этой теме */
    topicFocus?: string;
  };
}

// ==================== UTILITY TYPES ====================

export interface IJWTPayload {
  userId: string;
  role: UserRole;
}

export interface IErrorResponse {
  success: false;
  message: string;
  errors?: any[];
}

export interface ISuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}
