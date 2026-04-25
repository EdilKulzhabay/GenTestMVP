export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ContentMetadata {
  keywords: string[];
  difficulty?: Difficulty;
  source?: string;
}

export interface ParagraphContent {
  text: string;
  pages: number[];
  metadata: ContentMetadata;
}

export interface Paragraph {
  _id: string;
  order: number;
  content: ParagraphContent;
}

export interface Topic {
  _id: string;
  title: string;
  paragraphs: Paragraph[];
}

export interface Chapter {
  _id: string;
  title: string;
  order: number;
  topics: Topic[];
}

export interface Book {
  _id: string;
  title: string;
  author?: string;
  /** Язык текста (для генерации тестов и roadmap) */
  contentLanguage?: string;
  chapters: Chapter[];
}

/** Основной предмет (3 общих) или профильный (пара ЕНТ) */
export type SubjectKind = 'main' | 'profile';

export interface Subject {
  _id: string;
  title: string;
  description?: string;
  /** По умолчанию main для старых записей */
  subjectKind?: SubjectKind;
  books: Book[];
}
