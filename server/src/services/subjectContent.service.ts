import { Subject } from '../models';
import { IBook, IContentForAI, IGenerateTestDTO } from '../types';
import { AppError } from '../utils';

/**
 * Загрузка текста книги/главы для ИИ (тесты, roadmap и т.д.).
 * Если передан topicFocus (из roadmap-узла), пытается найти подходящую главу
 * по названию и сужает контент; иначе отдаёт всю книгу с директивой topicFocus.
 */
export async function resolveBookContentForAI(dto: IGenerateTestDTO): Promise<{
  subject: NonNullable<Awaited<ReturnType<typeof Subject.findById>>>;
  book: IBook;
  contentForAI: IContentForAI;
}> {
  const subject = await Subject.findById(dto.subjectId);
  if (!subject) throw AppError.notFound('Subject not found');

  const book = subject.books.find((b) => b._id?.toString() === dto.bookId);
  if (!book) throw AppError.notFound('Book not found');

  let contentText = '';
  let chapterTitle = '';
  const topics: string[] = [];
  let resolvedChapterId = dto.chapterId;

  if (!resolvedChapterId && dto.topicFocus && !dto.fullBook) {
    const focusLower = dto.topicFocus.toLowerCase();
    const matched = book.chapters.find(
      (ch) => ch.title.toLowerCase().includes(focusLower) || focusLower.includes(ch.title.toLowerCase())
    );
    if (matched) {
      resolvedChapterId = matched._id?.toString();
    }
  }

  if (dto.fullBook || !resolvedChapterId) {
    contentText = subject.getBookContent(dto.bookId);
    chapterTitle = 'Вся книга';
    book.chapters.forEach((ch) => ch.topics.forEach((t) => topics.push(t.title)));
  } else {
    const chapter = book.chapters.find((c) => c._id?.toString() === resolvedChapterId);
    if (!chapter) throw AppError.notFound('Chapter not found');
    contentText = subject.getChapterContent(dto.bookId, resolvedChapterId!);
    chapterTitle = chapter.title;
    chapter.topics.forEach((t) => topics.push(t.title));
  }

  if (!contentText?.trim()) {
    throw AppError.badRequest('No content available');
  }

  const chapterTitles = [...book.chapters]
    .sort((a, b) => a.order - b.order)
    .map((c) => c.title);

  const contentForAI: IContentForAI = {
    text: contentText,
    metadata: {
      subjectTitle: subject.title,
      bookTitle: book.title,
      chapterTitle: dto.fullBook ? undefined : chapterTitle,
      topics,
      bookAuthor: book.author,
      contentLanguage: book.contentLanguage,
      chapterTitles,
      topicFocus: dto.topicFocus
    }
  };

  return { subject, book, contentForAI };
}
