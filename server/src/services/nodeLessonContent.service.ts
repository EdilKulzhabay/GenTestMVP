import { createHash } from 'crypto';
import { NodeLessonContent } from '../models/NodeLessonContent.model';
import {
  ICanonicalRoadmapNode,
  ICanonicalNodeLesson,
  ICanonicalNodeSource,
  IRoadmapLessonSource
} from '../types/roadmap.types';
import { getNodeLessons } from '../utils/nodeLessons.util';
import { extractTopicText } from '../utils/roadmapChapter.util';
import { roadmapAIService } from './roadmap.ai.service';

type SubjectShape = {
  title?: string;
  books?: Array<{ _id?: { toString(): string }; title?: string }>;
};

function nodeKtpTopicId(node: ICanonicalRoadmapNode): string | null {
  const md = node.metadata as Record<string, unknown> | undefined;
  const id = md && typeof md.ktpTopicId === 'string' ? md.ktpTopicId : undefined;
  return id ?? null;
}

function nodeSources(node: ICanonicalRoadmapNode): ICanonicalNodeSource[] {
  const md = node.metadata as Record<string, unknown> | undefined;
  const arr = md?.sources;
  return Array.isArray(arr) ? (arr as ICanonicalNodeSource[]) : [];
}

function bookTitleOf(subject: SubjectShape, bookId: string): string | undefined {
  return subject.books?.find((b) => b._id?.toString() === bookId)?.title;
}

/** Источники узла с метками и текстами (для AI-консолидации). */
function sourcesWithText(
  subject: unknown,
  sources: ICanonicalNodeSource[]
): Array<{ source: ICanonicalNodeSource; label: string; text: string }> {
  const sub = subject as SubjectShape;
  return sources
    .map((s) => {
      const bookTitle = bookTitleOf(sub, s.bookId) || 'Книга';
      const label = s.title ? `${bookTitle} · ${s.title}` : bookTitle;
      const text = extractTopicText(subject, s.bookId, s.chapterId, s.topicId) || s.title || '';
      return { source: s, label, text };
    })
    .filter((x) => x.text.trim());
}

function computeSourceHash(items: Array<{ topicId: string; text: string }>): string {
  return createHash('sha256').update(JSON.stringify(items.map((i) => [i.topicId, i.text]))).digest('hex');
}

function storedToLessons(row: { lessons?: ICanonicalNodeLesson[] }): ICanonicalNodeLesson[] {
  return [...(row.lessons ?? [])]
    .map((l) => ({
      lessonId: l.lessonId,
      title: l.title,
      order: l.order,
      content: l.content,
      contentFormat: l.contentFormat === 'html' ? ('html' as const) : ('markdown' as const),
      ...(l.summary ? { summary: l.summary } : {}),
      video: null
    }))
    .sort((a, b) => a.order - b.order);
}

/** Описание источников узла для UI (книга/класс + тема), без текстов. */
export function describeNodeSources(subject: unknown, node: ICanonicalRoadmapNode): IRoadmapLessonSource[] {
  const sub = subject as SubjectShape;
  return nodeSources(node).map((s) => ({
    ...(bookTitleOf(sub, s.bookId) ? { bookTitle: bookTitleOf(sub, s.bookId) } : {}),
    ...(s.title ? { topicTitle: s.title } : {})
  }));
}

/** Кэшированные уроки узла (без генерации). null — кэша нет или узел не из КТП. */
export async function getCachedNodeLessons(
  subjectId: string,
  node: ICanonicalRoadmapNode
): Promise<ICanonicalNodeLesson[] | null> {
  const ktpTopicId = nodeKtpTopicId(node);
  if (!ktpTopicId) return null;
  const row = await NodeLessonContent.findOne({ subjectId, ktpTopicId }).lean<{ lessons?: ICanonicalNodeLesson[] }>();
  if (!row || !row.lessons?.length) return null;
  return storedToLessons(row);
}

/**
 * Уроки узла для показа: AI-консолидация из замапленных тем книг, кэш по sourceHash.
 * Промах/устаревший хэш → генерация и кэширование. Без OPENAI_API_KEY или при ошибке — сырой fallback.
 */
export async function resolveNodeLessons(
  subjectId: string,
  subject: unknown,
  node: ICanonicalRoadmapNode
): Promise<ICanonicalNodeLesson[]> {
  const ktpTopicId = nodeKtpTopicId(node);
  const sources = nodeSources(node);
  if (!ktpTopicId || sources.length === 0) return getNodeLessons(node);

  const withText = sourcesWithText(subject, sources);
  if (withText.length === 0) return getNodeLessons(node);

  const hash = computeSourceHash(withText.map((x) => ({ topicId: x.source.topicId, text: x.text })));

  const row = await NodeLessonContent.findOne({ subjectId, ktpTopicId });
  if (row && row.lessons?.length && (row.generatedBy === 'manual' || row.sourceHash === hash)) {
    return storedToLessons(row);
  }

  if (!process.env.OPENAI_API_KEY) {
    return getNodeLessons(node); // сырой fallback, не кэшируем
  }

  let consolidated: Array<{ title: string; summary?: string; content: string }>;
  try {
    consolidated = await roadmapAIService.consolidateLessonContent({
      subjectTitle: (subject as SubjectShape).title || '',
      nodeTitle: node.title,
      sources: withText.map((x) => ({ label: x.label, text: x.text }))
    });
  } catch (e) {
    console.warn('[nodeLessonContent] consolidation failed, using raw sources', e);
    return getNodeLessons(node);
  }

  const lessons: ICanonicalNodeLesson[] = consolidated.map((l, i) => ({
    lessonId: `${node.nodeId}::c${i}`,
    title: l.title || node.title,
    order: i,
    content: l.content,
    contentFormat: 'markdown',
    ...(l.summary ? { summary: l.summary } : {}),
    video: null
  }));

  await NodeLessonContent.findOneAndUpdate(
    { subjectId, ktpTopicId },
    {
      $set: {
        subjectId,
        ktpTopicId,
        sourceHash: hash,
        generatedBy: 'ai',
        lessons: lessons.map((l) => ({
          lessonId: l.lessonId,
          title: l.title,
          order: l.order,
          content: l.content,
          contentFormat: l.contentFormat,
          ...(l.summary ? { summary: l.summary } : {})
        }))
      }
    },
    { upsert: true, new: true }
  ).catch((e) => console.warn('[nodeLessonContent] cache write failed', e));

  return lessons;
}

/** Упорядоченные lessonId узла (кэш, иначе сырой fallback) — для гейтинга/прогресса. */
export async function nodeLessonIds(subjectId: string, node: ICanonicalRoadmapNode): Promise<string[]> {
  const cached = await getCachedNodeLessons(subjectId, node);
  if (cached) return cached.map((l) => l.lessonId);
  return getNodeLessons(node).map((l) => l.lessonId);
}
