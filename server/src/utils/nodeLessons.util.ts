import {
  ICanonicalRoadmapNode,
  ICanonicalNodeLesson,
  ICanonicalNodeSource,
  IRoadmapLessonVideo
} from '../types/roadmap.types';

function parseVideo(raw: unknown): IRoadmapLessonVideo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  if (!url) return null;
  const durationSec =
    typeof o.durationSec === 'number' && Number.isFinite(o.durationSec) ? o.durationSec : undefined;
  const posterUrl = typeof o.posterUrl === 'string' && o.posterUrl.trim() ? o.posterUrl.trim() : undefined;
  return { url, ...(durationSec !== undefined ? { durationSec } : {}), ...(posterUrl ? { posterUrl } : {}) };
}

function parseSource(raw: unknown): ICanonicalNodeSource | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const bookId = typeof o.bookId === 'string' ? o.bookId : '';
  const chapterId = typeof o.chapterId === 'string' ? o.chapterId : '';
  const topicId = typeof o.topicId === 'string' ? o.topicId : '';
  if (!bookId || !chapterId || !topicId) return undefined;
  return { bookId, chapterId, topicId, ...(typeof o.title === 'string' ? { title: o.title } : {}) };
}

function normalizeLesson(raw: unknown, node: ICanonicalRoadmapNode, index: number): ICanonicalNodeLesson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const L = raw as Record<string, unknown>;
  const lessonId = typeof L.lessonId === 'string' && L.lessonId.trim() ? L.lessonId.trim() : `${node.nodeId}::l${index}`;
  const content = typeof L.content === 'string' ? L.content : '';
  return {
    lessonId,
    title: typeof L.title === 'string' && L.title.trim() ? L.title.trim() : node.title,
    order: typeof L.order === 'number' ? L.order : index,
    content,
    contentFormat: L.contentFormat === 'html' ? 'html' : 'markdown',
    ...(typeof L.summary === 'string' ? { summary: L.summary } : {}),
    video: parseVideo(L.video),
    ...(parseSource(L.source) ? { source: parseSource(L.source) } : {})
  };
}

/**
 * Возвращает упорядоченный список уроков узла.
 * - КТП-узлы: metadata.lessons[] (несколько уроков из разных книг/классов).
 * - Старые/ручные узлы: одиночный metadata.lesson или node.description (fallback, 1 урок).
 */
export function getNodeLessons(node: ICanonicalRoadmapNode): ICanonicalNodeLesson[] {
  const md = (node.metadata && typeof node.metadata === 'object' ? node.metadata : {}) as Record<string, unknown>;

  const rawLessons = md.lessons;
  if (Array.isArray(rawLessons) && rawLessons.length > 0) {
    const lessons = rawLessons
      .map((l, i) => normalizeLesson(l, node, i))
      .filter((l): l is ICanonicalNodeLesson => l !== null);
    if (lessons.length > 0) return lessons.sort((a, b) => a.order - b.order);
  }

  const single = md.lesson;
  if (single && typeof single === 'object' && !Array.isArray(single)) {
    const L = single as Record<string, unknown>;
    return [
      {
        lessonId: typeof L.lessonId === 'string' && L.lessonId.trim() ? L.lessonId.trim() : node.nodeId,
        title: node.title,
        order: 0,
        content: typeof L.content === 'string' ? L.content : node.description?.trim() ?? '',
        contentFormat: L.contentFormat === 'html' ? 'html' : 'markdown',
        ...(typeof L.summary === 'string' ? { summary: L.summary } : {}),
        video: parseVideo(L.video)
      }
    ];
  }

  return [
    {
      lessonId: node.nodeId,
      title: node.title,
      order: 0,
      content: node.description?.trim() ?? '',
      contentFormat: 'markdown',
      video: null
    }
  ];
}

/** Упорядоченные lessonId узла (для гейтинга/прогресса). */
export function getNodeLessonIds(node: ICanonicalRoadmapNode): string[] {
  return getNodeLessons(node).map((l) => l.lessonId);
}
