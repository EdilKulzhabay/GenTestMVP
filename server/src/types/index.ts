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
  chapters: IChapter[];
}

export interface ISubject {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
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
  whereToRead: {
    bookTitle: string;
    chapterTitle: string;
    pages: number[];
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
  userName: string;
  email?: string;
  password: string;
  role: UserRole;
  testHistory: ITestHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== TEST & QUESTIONS ====================

export interface IRelatedContent {
  chapterId?: Types.ObjectId;
  topicId?: Types.ObjectId;
  pages: number[];
}

export interface IQuestion {
  questionText: string;
  options: string[]; // Ровно 4 опции
  correctOption: string;
  aiExplanation: string;
  relatedContent: IRelatedContent;
}

export interface ITest {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  bookId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  questions: IQuestion[];
  sourceContentHash: string; // Для кеширования
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== DTO (Data Transfer Objects) ====================

// Auth DTOs
export interface IRegisterDTO {
  fullName: string;
  email: string;
  userName: string;
  password: string;
}

export interface IVerifyEmailDTO {
  email: string;
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
    userName: string;
    role: UserRole;
  };
}

// Subject DTOs
export interface ICreateSubjectDTO {
  title: string;
  description?: string;
}

export interface IAddBookDTO {
  title: string;
  author?: string;
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

// Test Generation DTOs
export interface IGenerateTestDTO {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
}

export interface ISubmitTestDTO {
  testId: string;
  answers: {
    questionText: string;
    selectedOption: string;
  }[];
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
