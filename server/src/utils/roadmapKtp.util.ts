import mongoose from 'mongoose';
import {
  ICanonicalRoadmapNode,
  ICanonicalNodeLesson,
  ICanonicalNodeSource,
  IKtpCatalog
} from '../types/roadmap.types';
import { extractTopicText, makeChapterSummary } from './roadmapChapter.util';
import { ktpNodeId, ktpLessonId } from './ktpNode.util';

type SubjectShape = {
  _id?: mongoose.Types.ObjectId;
  updatedAt?: Date;
  books?: Array<{
    _id?: mongoose.Types.ObjectId;
    chapters?: Array<{
      _id?: mongoose.Types.ObjectId;
      order?: number;
      topics?: Array<{
        _id?: mongoose.Types.ObjectId;
        title: string;
        ktpTopicIds?: Array<mongoose.Types.ObjectId | string>;
      }>;
    }>;
  }>;
};

/**
 * Строит canonical-узлы роудмапа ИЗ КТП.
 *
 * - Порядок узлов и линейные prerequisites берутся из порядка тем КТП (`order`).
 * - Узел = тема КТП; агрегирует ВСЕ темы книг (разных классов), замапленные на неё
 *   (`Subject.Topic.ktpTopicIds`), в упорядоченный список уроков (`metadata.lessons[]`).
 * - Темы КТП без единого источника ПРОПУСКАЮТСЯ (не рвут линейную цепочку).
 *
 * Для обратной совместимости в metadata также кладём «первичный» источник
 * (bookId/chapterId/topicId первой темы) и single `lesson` — их читают
 * getCanonical/enrichPersonalNodeView и (до Фазы 3) roadmapLesson.service.
 */
export function buildKtpCanonicalNodes(subject: unknown, ktp: IKtpCatalog): ICanonicalRoadmapNode[] {
  const sub = subject as SubjectShape;
  const subjectIdStr = sub._id?.toString();
  if (!subjectIdStr) return [];

  // 1. Обратный индекс: ktpTopicId -> источники (в порядке книга → глава(order) → тема).
  const sourcesByKtp = new Map<string, ICanonicalNodeSource[]>();
  for (const book of sub.books || []) {
    const bid = book._id?.toString();
    if (!bid) continue;
    const chapters = [...(book.chapters || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const ch of chapters) {
      const cid = ch._id?.toString();
      if (!cid) continue;
      for (const topic of ch.topics || []) {
        const tid = topic._id?.toString();
        if (!tid) continue;
        for (const k of topic.ktpTopicIds || []) {
          const key = String(k);
          const arr = sourcesByKtp.get(key) ?? [];
          arr.push({ bookId: bid, chapterId: cid, topicId: tid, title: topic.title });
          sourcesByKtp.set(key, arr);
        }
      }
    }
  }

  // 2. Итерация тем КТП по порядку; узел на каждую тему с ≥1 источником.
  const ktpTopics = [...(ktp.topics || [])].sort((a, b) => a.order - b.order);
  const nodes: ICanonicalRoadmapNode[] = [];
  let prevNodeId: string | null = null;

  for (const kt of ktpTopics) {
    const ktpTopicIdStr = kt._id?.toString();
    if (!ktpTopicIdStr) continue;
    const sources = sourcesByKtp.get(ktpTopicIdStr) ?? [];
    if (sources.length === 0) continue; // пропускаем пустые темы КТП — цепочка не рвётся

    const nodeId = ktpNodeId(ktpTopicIdStr);

    const lessons: ICanonicalNodeLesson[] = sources.map((s, i) => {
      const content = extractTopicText(subject, s.bookId, s.chapterId, s.topicId) || s.title || '';
      const summary = makeChapterSummary(content, s.title || kt.title);
      return {
        lessonId: ktpLessonId(nodeId, s.topicId),
        title: s.title || kt.title,
        order: i,
        content,
        contentFormat: 'markdown',
        summary,
        source: s
      };
    });

    const primary = sources[0];
    const description = kt.description?.trim() || lessons[0]?.summary || kt.title;

    nodes.push({
      nodeId,
      title: kt.title,
      description,
      prerequisites: prevNodeId ? [prevNodeId] : [],
      metadata: {
        subjectId: subjectIdStr,
        ktpTopicId: ktpTopicIdStr,
        sources,
        lessons,
        // первичный источник — для chapterUrl/testId в getCanonical/enrichPersonalNodeView
        bookId: primary.bookId,
        chapterId: primary.chapterId,
        topicId: primary.topicId,
        // single lesson — обратная совместимость до Фазы 3
        lesson: {
          lessonId: lessons[0].lessonId,
          summary: lessons[0].summary,
          content: lessons[0].content,
          contentFormat: 'markdown'
        }
      }
    });
    prevNodeId = nodeId;
  }

  return nodes;
}

/**
 * Тема книги (bookId/chapterId/topicId) → КТП-узлы (`ktp:*`), на которые она замаплена.
 * Используется для фанаута mastery из пробника на узлы КТП.
 */
export function mapBookTopicToKtpNodeIds(
  subject: unknown,
  bookId: string,
  chapterId: string,
  topicId: string
): string[] {
  const sub = subject as SubjectShape;
  const book = sub.books?.find((b) => b._id?.toString() === bookId);
  const chapter = book?.chapters?.find((c) => c._id?.toString() === chapterId);
  const topic = chapter?.topics?.find((t) => t._id?.toString() === topicId);
  const ids = (topic?.ktpTopicIds ?? []).map((x) => String(x));
  return ids.map((id) => ktpNodeId(id));
}
