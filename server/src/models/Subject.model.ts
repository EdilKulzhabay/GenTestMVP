import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  ISubject,
  IBook,
  IChapter,
  ITopic,
  IParagraph,
  IContent,
  IMetadata,
  Difficulty
} from '../types';

/**
 * SUBJECT MODEL
 * Корневая модель для иерархической структуры образовательного контента
 * Содержит: Subject -> Book -> Chapter -> Topic -> Paragraph -> Content
 * 
 * Оптимизация: Использую вложенные схемы (embedded documents) вместо ссылок,
 * так как контент всегда читается целиком для генерации тестов.
 * Это уменьшает количество запросов к БД.
 */

// ==================== SUB-SCHEMAS ====================

const MetadataSchema = new Schema<IMetadata>({
  keywords: [{ type: String }],
  difficulty: { 
    type: String, 
    enum: Object.values(Difficulty),
    required: false 
  },
  source: { type: String }
}, { _id: false });

const ContentSchema = new Schema<IContent>({
  text: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1
  },
  pages: [{ 
    type: Number, 
    required: true 
  }],
  metadata: { 
    type: MetadataSchema, 
    required: true 
  }
}, { _id: false });

const ParagraphSchema = new Schema<IParagraph>({
  order: { 
    type: Number, 
    required: true,
    min: 0
  },
  content: { 
    type: ContentSchema, 
    required: true 
  }
}, { timestamps: false });

const TopicSchema = new Schema<ITopic>({
  title: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  paragraphs: [ParagraphSchema]
}, { timestamps: false });

const ChapterSchema = new Schema<IChapter>({
  title: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200
  },
  order: { 
    type: Number, 
    required: true,
    min: 0
  },
  topics: [TopicSchema]
}, { timestamps: false });

const BookSchema = new Schema<IBook>({
  title: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 300
  },
  author: { 
    type: String,
    trim: true,
    maxlength: 200
  },
  contentLanguage: {
    type: String,
    trim: true,
    maxlength: 80
  },
  chapters: [ChapterSchema]
}, { timestamps: false });

// ==================== MAIN SCHEMA ====================

type ISubjectDocument = Document &
  Omit<ISubject, '_id'> & {
    getBookContent(bookId: string): string;
    getChapterContent(bookId: string, chapterId: string): string;
    getTopicsContent(bookId: string, chapterId: string, topicIds: string[]): string;
  };

const SubjectSchema = new Schema<ISubjectDocument>({
  title: { 
    type: String, 
    required: true,
    trim: true,
    unique: true,
    minlength: 1,
    maxlength: 200,
    index: true
  },
  description: { 
    type: String,
    trim: true,
    maxlength: 1000
  },
  books: [BookSchema]
}, { 
  timestamps: true,
  collection: 'subjects'
});

// ==================== INDEXES ====================
// Индексы для быстрого поиска по вложенным структурам
SubjectSchema.index({ 'books._id': 1 });
SubjectSchema.index({ 'books.chapters._id': 1 });
SubjectSchema.index({ 'books.chapters.topics._id': 1 });

// ==================== METHODS ====================

/**
 * Метод для получения текста всей книги
 * Используется для генерации тестов по всей книге
 */
SubjectSchema.methods.getBookContent = function(bookId: string): string {
  const book = this.books.id(bookId);
  if (!book) return '';
  
  return book.chapters
    .flatMap((chapter: IChapter) => chapter.topics)
    .flatMap((topic: ITopic) => topic.paragraphs)
    .map((paragraph: IParagraph) => paragraph.content.text)
    .join('\n\n');
};

/**
 * Метод для получения текста конкретной главы
 * Используется для генерации тестов по главе
 */
SubjectSchema.methods.getChapterContent = function(bookId: string, chapterId: string): string {
  const book = this.books.id(bookId);
  if (!book) return '';
  
  const chapter = book.chapters.id(chapterId);
  if (!chapter) return '';
  
  return chapter.topics
    .flatMap((topic: ITopic) => topic.paragraphs)
    .map((paragraph: IParagraph) => paragraph.content.text)
    .join('\n\n');
};

/**
 * Метод для получения текста по выбранным темам
 * Используется для генерации тестов по конкретным темам
 */
SubjectSchema.methods.getTopicsContent = function(bookId: string, chapterId: string, topicIds: string[]): string {
  const book = this.books.id(bookId);
  if (!book) return '';
  
  const chapter = book.chapters.id(chapterId);
  if (!chapter) return '';
  
  return chapter.topics
    .filter((topic: ITopic) => topicIds.includes(topic._id!.toString()))
    .flatMap((topic: ITopic) => topic.paragraphs)
    .map((paragraph: IParagraph) => paragraph.content.text)
    .join('\n\n');
};

// ==================== MODEL ====================

export const Subject: Model<ISubjectDocument> = mongoose.model<ISubjectDocument>('Subject', SubjectSchema);
