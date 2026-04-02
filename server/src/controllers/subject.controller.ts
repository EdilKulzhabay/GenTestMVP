import { Request, Response } from 'express';
import { Subject } from '../models';
import {
  ICreateSubjectDTO,
  IAddBookDTO,
  IAddChapterDTO,
  IAddTopicDTO,
  IAddParagraphDTO
} from '../types';
import { success, AppError } from '../utils';

class SubjectController {
  private async findSubject(id: string) {
    const subject = await Subject.findById(id);
    if (!subject) throw AppError.notFound('Subject not found');
    return subject;
  }

  /** POST /subjects */
  async createSubject(req: Request, res: Response): Promise<void> {
    const { title, description }: ICreateSubjectDTO = req.body;
    const subject = await Subject.create({ title, description, books: [] });
    success(res, subject, 'Subject created successfully', 201);
  }

  /** POST /subjects/import — импорт предмета целиком с книгами, главами, темами, параграфами */
  async importSubject(req: Request, res: Response): Promise<void> {
    const { title, description, books } = req.body;
    if (!title) throw AppError.badRequest('title is required');

    const existing = await Subject.findOne({ title: title.trim() });
    if (existing) throw AppError.badRequest(`Subject "${title}" already exists`);

    const subject = await Subject.create({
      title: title.trim(),
      description: description || '',
      books: books || []
    });

    const bookCount = subject.books?.length ?? 0;
    const chapterCount = subject.books.reduce((s: number, b: any) => s + (b.chapters?.length ?? 0), 0);
    const topicCount = subject.books.reduce(
      (s: number, b: any) => s + b.chapters.reduce((cs: number, c: any) => cs + (c.topics?.length ?? 0), 0), 0
    );
    const paragraphCount = subject.books.reduce(
      (s: number, b: any) => s + b.chapters.reduce(
        (cs: number, c: any) => cs + c.topics.reduce(
          (ts: number, t: any) => ts + (t.paragraphs?.length ?? 0), 0
        ), 0
      ), 0
    );

    success(res, {
      subject,
      stats: { books: bookCount, chapters: chapterCount, topics: topicCount, paragraphs: paragraphCount }
    }, `Imported: ${bookCount} books, ${chapterCount} chapters, ${topicCount} topics, ${paragraphCount} paragraphs`, 201);
  }

  /** GET /subjects */
  async getAllSubjects(_req: Request, res: Response): Promise<void> {
    const subjects = await Subject.find().select('title description books createdAt updatedAt');
    success(res, subjects);
  }

  /** GET /subjects/:id */
  async getSubjectById(req: Request, res: Response): Promise<void> {
    const subject = await this.findSubject(req.params.id);
    success(res, subject);
  }

  /** POST /subjects/:id/books */
  async addBook(req: Request, res: Response): Promise<void> {
    const subject = await this.findSubject(req.params.id);
    const { title, author, contentLanguage }: IAddBookDTO = req.body;
    subject.books.push({
      title,
      author,
      contentLanguage: contentLanguage?.trim() || undefined,
      chapters: []
    });
    await subject.save();
    success(res, subject, 'Book added successfully', 201);
  }

  /** POST /subjects/books/:bookId/chapters */
  async addChapter(req: Request, res: Response): Promise<void> {
    const { subjectId } = req.query;
    if (!subjectId) throw AppError.badRequest('subjectId is required in query params');

    const subject = await this.findSubject(String(subjectId));
    const book = subject.books.find((b) => b._id?.toString() === req.params.bookId);
    if (!book) throw AppError.notFound('Book not found');

    const { title, order }: IAddChapterDTO = req.body;
    book.chapters.push({ title, order, topics: [] });
    await subject.save();
    success(res, subject, 'Chapter added successfully', 201);
  }

  /** POST /subjects/chapters/:chapterId/topics */
  async addTopic(req: Request, res: Response): Promise<void> {
    const { subjectId, bookId } = req.query;
    if (!subjectId || !bookId) throw AppError.badRequest('subjectId and bookId are required in query params');

    const subject = await this.findSubject(String(subjectId));
    const book = subject.books.find((b) => b._id?.toString() === String(bookId));
    if (!book) throw AppError.notFound('Book not found');
    const chapter = book.chapters.find((c) => c._id?.toString() === req.params.chapterId);
    if (!chapter) throw AppError.notFound('Chapter not found');

    const { title }: IAddTopicDTO = req.body;
    chapter.topics.push({ title, paragraphs: [] });
    await subject.save();
    success(res, subject, 'Topic added successfully', 201);
  }

  /** POST /subjects/topics/:topicId/paragraphs */
  async addParagraph(req: Request, res: Response): Promise<void> {
    const { subjectId, bookId, chapterId } = req.query;
    if (!subjectId || !bookId || !chapterId) {
      throw AppError.badRequest('subjectId, bookId, and chapterId are required in query params');
    }

    const subject = await this.findSubject(String(subjectId));
    const book = subject.books.find((b) => b._id?.toString() === String(bookId));
    if (!book) throw AppError.notFound('Book not found');
    const chapter = book.chapters.find((c) => c._id?.toString() === String(chapterId));
    if (!chapter) throw AppError.notFound('Chapter not found');
    const topic = chapter.topics.find((t) => t._id?.toString() === req.params.topicId);
    if (!topic) throw AppError.notFound('Topic not found');

    const { order, content }: IAddParagraphDTO = req.body;
    topic.paragraphs.push({ order, content });
    await subject.save();
    success(res, subject, 'Paragraph added successfully', 201);
  }
}

export const subjectController = new SubjectController();
