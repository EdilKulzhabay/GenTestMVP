import mongoose from 'mongoose';
import { IContentAsset } from '../types';

/** Краткое описание темы из её текста (или fallback на заголовок). */
export function makeChapterSummary(text: string, title: string, maxLen = 400): string {
  const raw = (text || '').trim();
  if (!raw) return title;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}…`;
}

/** Текст одной темы книги (параграфы в порядке order). Используется билдером КТП-узлов. */
export function extractTopicText(
  subject: unknown,
  bookId: string,
  chapterId: string,
  topicId: string
): string {
  const s = subject as {
    books?: Array<{
      _id?: mongoose.Types.ObjectId;
      chapters?: Array<{
        _id?: mongoose.Types.ObjectId;
        topics?: Array<{
          _id?: mongoose.Types.ObjectId;
          paragraphs?: Array<{ order?: number; content?: { text?: string } }>;
        }>;
      }>;
    }>;
  };
  const book = s.books?.find(b => b._id?.toString() === bookId);
  if (!book) return '';
  const chapter = book.chapters?.find(c => c._id?.toString() === chapterId);
  if (!chapter) return '';
  const topic = chapter.topics?.find(t => t._id?.toString() === topicId);
  if (!topic) return '';
  return (topic.paragraphs || [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(p => (p.content?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Ассеты одной темы книги (payload для resolved-сайдкара урока/теста). */
export function extractTopicAssets(
  subject: unknown,
  bookId: string,
  chapterId: string,
  topicId: string
): IContentAsset[] {
  const s = subject as {
    books?: Array<{
      _id?: mongoose.Types.ObjectId;
      chapters?: Array<{
        _id?: mongoose.Types.ObjectId;
        topics?: Array<{ _id?: mongoose.Types.ObjectId; assets?: IContentAsset[] }>;
      }>;
    }>;
  };
  const book = s.books?.find(b => b._id?.toString() === bookId);
  if (!book) return [];
  const chapter = book.chapters?.find(c => c._id?.toString() === chapterId);
  if (!chapter) return [];
  const topic = chapter.topics?.find(t => t._id?.toString() === topicId);
  if (!topic) return [];
  return topic.assets ?? [];
}
