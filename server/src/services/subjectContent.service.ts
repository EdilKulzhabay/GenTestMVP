import { Subject } from '../models';
import { IAssetCandidate, IBook, IContentAsset, IContentForAI, IGenerateTestDTO } from '../types';
import { AppError } from '../utils';
import { collectTestAssets, topicAssetCandidates } from '../utils/roadmapChapter.util';

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

  const book = subject.books.find(b => b._id?.toString() === dto.bookId);
  if (!book) throw AppError.notFound('Book not found');

  let contentText = '';
  let chapterTitle = '';
  const topics: string[] = [];
  const assetCandidates: IAssetCandidate[] = [];
  let resolvedChapterId = dto.chapterId;

  if (!resolvedChapterId && dto.topicFocus && !dto.fullBook) {
    const focusLower = dto.topicFocus.toLowerCase();
    const matched = book.chapters.find(
      ch =>
        ch.title.toLowerCase().includes(focusLower) || focusLower.includes(ch.title.toLowerCase())
    );
    if (matched) {
      resolvedChapterId = matched._id?.toString();
    }
  }

  if (dto.fullBook || !resolvedChapterId) {
    contentText = subject.getBookContent(dto.bookId);
    chapterTitle = 'Вся книга';
    book.chapters.forEach(ch =>
      ch.topics.forEach(t => {
        topics.push(t.title);
        assetCandidates.push(...topicAssetCandidates(t.title, t.assets));
      })
    );
  } else {
    const chapter = book.chapters.find(c => c._id?.toString() === resolvedChapterId);
    if (!chapter) throw AppError.notFound('Chapter not found');
    contentText = subject.getChapterContent(dto.bookId, resolvedChapterId!);
    chapterTitle = chapter.title;
    chapter.topics.forEach(t => {
      topics.push(t.title);
      assetCandidates.push(...topicAssetCandidates(t.title, t.assets));
    });
  }

  if (!contentText?.trim()) {
    throw AppError.badRequest('No content available');
  }

  const chapterTitles = [...book.chapters].sort((a, b) => a.order - b.order).map(c => c.title);

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
      topicFocus: dto.topicFocus,
    },
    ...(assetCandidates.length ? { assetCandidates } : {}),
  };

  return { subject, book, contentForAI };
}

/**
 * Resolved-сайдкар теста: грузит Subject (lean) и собирает супермножество ассетов
 * in-scope тем (глава теста / вся книга) + любые процитированные вопросами ассеты.
 * Best-effort — при отсутствии предмета вернёт [].
 */
export async function resolveTestAssets(test: {
  subjectId: unknown;
  bookId?: unknown;
  chapterId?: unknown;
  questions?: Array<{ relatedContent?: { assetIds?: unknown } }>;
}): Promise<IContentAsset[]> {
  // Проекция: тянем только то, что читает collectTestAssets (book/chapter _id + topics.assets),
  // без объёмного текста параграфов. Пути-сиблинги, чистое включение — без коллизий/микса.
  const subject = await Subject.findById(String(test.subjectId), {
    'books._id': 1,
    'books.chapters._id': 1,
    'books.chapters.topics.assets': 1,
  }).lean();
  if (!subject) return [];
  return collectTestAssets(subject, test);
}
