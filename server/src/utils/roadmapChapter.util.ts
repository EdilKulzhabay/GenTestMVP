import mongoose from 'mongoose';
import { ICanonicalRoadmapNode } from '../types/roadmap.types';

export function extractChapterText(subject: unknown, bookId: string, chapterId: string): string {
  const s = subject as {
    books?: Array<{
      _id?: mongoose.Types.ObjectId;
      chapters?: Array<{
        _id?: mongoose.Types.ObjectId;
        topics?: Array<{ paragraphs?: Array<{ order?: number; content?: { text?: string } }> }>;
      }>;
    }>;
  };
  const book = s.books?.find((b) => b._id?.toString() === bookId);
  if (!book) return '';
  const chapter = book.chapters?.find((c) => c._id?.toString() === chapterId);
  if (!chapter) return '';
  const topics = chapter.topics || [];
  const paras = topics.flatMap((t) => t.paragraphs || []);
  return paras
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => (p.content?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function makeChapterSummary(text: string, title: string, maxLen = 400): string {
  const raw = (text || '').trim();
  if (!raw) return title;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}…`;
}

export function chapterNodeId(bookId: string, chapterId: string): string {
  return `${bookId}:${chapterId}`;
}

export function parseChapterNodeId(nodeId: string): { bookId: string; chapterId: string } | null {
  const i = nodeId.indexOf(':');
  if (i < 1 || i >= nodeId.length - 1) return null;
  const bookId = nodeId.slice(0, i);
  const chapterId = nodeId.slice(i + 1);
  if (!mongoose.isValidObjectId(bookId) || !mongoose.isValidObjectId(chapterId)) return null;
  return { bookId, chapterId };
}

export function topicNodeId(bookId: string, chapterId: string, topicId: string): string {
  return `${bookId}:${chapterId}:${topicId}`;
}

export function parseTopicNodeId(
  nodeId: string
): { bookId: string; chapterId: string; topicId: string } | null {
  const parts = nodeId.split(':');
  if (parts.length !== 3) return null;
  const [bookId, chapterId, topicId] = parts;
  if (
    !mongoose.isValidObjectId(bookId) ||
    !mongoose.isValidObjectId(chapterId) ||
    !mongoose.isValidObjectId(topicId)
  ) {
    return null;
  }
  return { bookId, chapterId, topicId };
}

/** Текст одной темы (параграфы в порядке order) */
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
  const book = s.books?.find((b) => b._id?.toString() === bookId);
  if (!book) return '';
  const chapter = book.chapters?.find((c) => c._id?.toString() === chapterId);
  if (!chapter) return '';
  const topic = chapter.topics?.find((t) => t._id?.toString() === topicId);
  if (!topic) return '';
  return (topic.paragraphs || [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => (p.content?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Узлы роудмапа 1:1 с темами (внутри глав). Порядок: книги → главы по order → темы по порядку в массиве.
 * Prerequisites: линейная цепочка по всем темам подряд.
 */
export function buildTopicCanonicalNodes(subject: unknown): ICanonicalRoadmapNode[] {
  const sub = subject as { _id?: mongoose.Types.ObjectId; books?: unknown[] };
  const subjectIdStr = sub._id?.toString();
  if (!subjectIdStr) return [];

  const nodes: ICanonicalRoadmapNode[] = [];
  let prevNodeId: string | null = null;

  const books = [...(sub.books || [])] as Array<{
    _id?: mongoose.Types.ObjectId;
    chapters?: Array<{
      _id?: mongoose.Types.ObjectId;
      title: string;
      order: number;
      topics?: Array<{ _id?: mongoose.Types.ObjectId; title: string }>;
    }>;
  }>;

  for (const book of books) {
    const bid = book._id?.toString();
    if (!bid) continue;
    const chapters = [...(book.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const ch of chapters) {
      const cid = ch._id?.toString();
      if (!cid) continue;
      const topics = ch.topics || [];
      for (const topic of topics) {
        const tid = topic._id?.toString();
        if (!tid) continue;
        const nodeId = topicNodeId(bid, cid, tid);
        const content = extractTopicText(subject, bid, cid, tid);
        const summary = makeChapterSummary(content, topic.title);
        const prerequisites = prevNodeId ? [prevNodeId] : [];

        nodes.push({
          nodeId,
          title: topic.title,
          description: summary,
          prerequisites,
          metadata: {
            bookId: bid,
            chapterId: cid,
            topicId: tid,
            subjectId: subjectIdStr,
            lesson: {
              lessonId: nodeId,
              summary,
              content: content || topic.title,
              contentFormat: 'markdown' as const
            }
          }
        });
        prevNodeId = nodeId;
      }
    }
  }
  return nodes;
}

/**
 * @deprecated Используйте {@link buildTopicCanonicalNodes} — карта строится по темам, не по главам.
 */
export function buildChapterCanonicalNodes(subject: unknown): ICanonicalRoadmapNode[] {
  return buildTopicCanonicalNodes(subject);
}
