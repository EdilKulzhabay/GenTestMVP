import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { CanonicalRoadmap } from '../models/CanonicalRoadmap.model';
import { KtpCatalog } from '../models/KtpCatalog.model';
import { RoadmapChatAttachment } from '../models/RoadmapChatAttachment.model';
import { Subject } from '../models';
import {
  ICanonicalRoadmapNode,
  ICanonicalNodeLesson,
  IRoadmapLessonListItem,
  IRoadmapLessonResponse,
} from '../types/roadmap.types';
import {
  resolveNodeLessons,
  nodeLessonIds,
  describeNodeSources,
  resolveNodeAssets,
  persistNodeLessonSummary,
} from './nodeLessonContent.service';
import { roadmapAIService } from './roadmap.ai.service';
import { roadmapService } from './roadmap.service';
import { AppError } from '../utils';
import { ROADMAP_CHAT_MAX_BYTES } from '../middlewares/roadmapChatUpload.middleware';

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLessonContent(raw: string, format: 'markdown' | 'html'): string {
  if (!raw.trim()) return '';
  return format === 'html' ? stripHtmlToText(raw) : raw;
}

/** Завершён ли узел live-сборкой из КТП (тогда нет сохранённого документа для кэша summary). */
async function isLiveBuiltFromKtp(subjectId: string): Promise<boolean> {
  const ktp = await KtpCatalog.findOne({ subjectId }).select('topics').lean();
  return !!ktp && Array.isArray(ktp.topics) && ktp.topics.length > 0;
}

/** Сохранить summary урока в сохранённый документ карты (только для не-live карт). */
async function persistLessonSummary(
  subjectId: string,
  nodeId: string,
  lessonId: string,
  summary: string
): Promise<void> {
  if (await isLiveBuiltFromKtp(subjectId)) return;

  const subjectOid = new mongoose.Types.ObjectId(subjectId);
  const doc = await CanonicalRoadmap.findOne({ subjectId: subjectOid }).sort({ version: -1 });
  if (!doc) return;

  const updatedNodes = doc.nodes.map(n => {
    if (n.nodeId !== nodeId) return n;
    const meta =
      n.metadata && typeof n.metadata === 'object' && n.metadata !== null
        ? { ...(n.metadata as Record<string, unknown>) }
        : {};

    // metadata.lessons[] — обновляем урок по lessonId
    if (Array.isArray(meta.lessons)) {
      meta.lessons = (meta.lessons as Array<Record<string, unknown>>).map(l =>
        l && l.lessonId === lessonId ? { ...l, summary } : l
      );
    }
    // single metadata.lesson — обратная совместимость
    if (meta.lesson && typeof meta.lesson === 'object' && !Array.isArray(meta.lesson)) {
      const oldLesson = meta.lesson as Record<string, unknown>;
      if (!oldLesson.lessonId || oldLesson.lessonId === lessonId) {
        meta.lesson = { ...oldLesson, summary };
      }
    }
    return { ...n, metadata: meta };
  });

  doc.set('nodes', updatedNodes);
  doc.markModified('nodes');
  await doc.save();
}

function lessonListItems(
  lessons: ICanonicalNodeLesson[],
  completedSet: Set<string>
): IRoadmapLessonListItem[] {
  let prevCompleted = true;
  return lessons.map((l, i) => {
    const completed = completedSet.has(l.lessonId);
    const locked = i > 0 && !prevCompleted;
    prevCompleted = completed;
    return { lessonId: l.lessonId, title: l.title, order: l.order, completed, locked };
  });
}

class RoadmapLessonService {
  private async resolveNode(subjectId: string, nodeId: string): Promise<ICanonicalRoadmapNode> {
    const bundle = await roadmapService.resolveCanonical(subjectId);
    const node = bundle.nodes.find(n => n.nodeId === nodeId);
    if (!node) throw AppError.notFound('Roadmap node not found for this subject');
    return node;
  }

  async getLesson(
    userId: string,
    subjectId: string,
    nodeId: string,
    lessonId?: string
  ): Promise<IRoadmapLessonResponse> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');

    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const node = await this.resolveNode(subjectId, nodeId);
    const lessons = await resolveNodeLessons(subjectId, subject, node);
    if (lessons.length === 0) throw AppError.notFound('Lesson not found for this node');

    const progress = await roadmapService.getNodeProgress(userId, subjectId, nodeId);
    const readAtByLesson = new Map<string, Date | undefined>(
      (progress?.lessons ?? []).map(l => [l.lessonId, l.readAt])
    );
    const completedSet = new Set([...readAtByLesson.keys()]);
    const listItems = lessonListItems(lessons, completedSet);

    // Целевой урок: явный lessonId → он; иначе первый незавершённый; иначе первый.
    let targetIdx = lessonId ? lessons.findIndex(l => l.lessonId === lessonId) : -1;
    if (targetIdx < 0 && !lessonId) {
      targetIdx = lessons.findIndex(l => !completedSet.has(l.lessonId));
    }
    if (targetIdx < 0) targetIdx = 0;
    const target = lessons[targetIdx];

    const contentNormalized = normalizeLessonContent(target.content, target.contentFormat);

    let summary = target.summary?.trim() ?? '';
    if (!summary && contentNormalized.trim() && process.env.OPENAI_API_KEY) {
      summary = await roadmapAIService.generateLessonSummary({
        subjectTitle: subject.title,
        nodeTitle: target.title || node.title,
        lessonText: contentNormalized,
      });
      if (summary) {
        // live-КТП: пишем summary в NodeLessonContent (иначе регенерация на каждый просмотр).
        // Не-live карты (CanonicalRoadmap): fallback-персист в сам документ карты.
        const persistedToCache = await persistNodeLessonSummary(
          subjectId,
          node,
          target.lessonId,
          summary
        ).catch(e => {
          console.warn('[roadmapLesson] persist summary (cache) failed', e);
          return false;
        });
        if (!persistedToCache) {
          await persistLessonSummary(subjectId, nodeId, target.lessonId, summary).catch(e =>
            console.warn('[roadmapLesson] persist summary failed', e)
          );
        }
      }
    }

    const readAt = readAtByLesson.get(target.lessonId);

    return {
      nodeId: node.nodeId,
      lessonId: target.lessonId,
      title: target.title || node.title,
      summary,
      content: contentNormalized,
      contentFormat: 'markdown',
      textFormat: 'markdown',
      video: target.video ?? null,
      readCompletedAt: readAt ? readAt.toISOString() : null,
      lessons: listItems,
      lessonsTotal: lessons.length,
      lessonIndex: targetIdx,
      nextLessonId: targetIdx < lessons.length - 1 ? lessons[targetIdx + 1].lessonId : null,
      prevLessonId: targetIdx > 0 ? lessons[targetIdx - 1].lessonId : null,
      locked: listItems[targetIdx]?.locked ?? false,
      sources: describeNodeSources(subject, node),
      assets: resolveNodeAssets(subject, node),
    };
  }

  /**
   * Отметить урок прочитанным. Если lessonId не задан — завершаем первый незавершённый урок узла.
   * Последовательный гейтинг: нельзя завершить урок, пока не завершены предыдущие.
   */
  async markLessonRead(
    userId: string,
    subjectId: string,
    nodeId: string,
    lessonId?: string
  ): Promise<{
    readCompletedAt: string;
    lessonId: string;
    allCompleted: boolean;
    nextLessonId: string | null;
  }> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');

    const node = await this.resolveNode(subjectId, nodeId);
    const lessonIds = await nodeLessonIds(subjectId, node);
    if (lessonIds.length === 0) throw AppError.notFound('Lesson not found for this node');

    let targetId = lessonId?.trim();
    if (!targetId) {
      const progress = await roadmapService.getNodeProgress(userId, subjectId, nodeId);
      const completed = new Set((progress?.lessons ?? []).map(l => l.lessonId));
      targetId = lessonIds.find(id => !completed.has(id)) ?? lessonIds[lessonIds.length - 1];
    }

    // Валидация lessonId и последовательный гейтинг — в markLessonComplete.
    return roadmapService.markLessonComplete(userId, subjectId, nodeId, targetId);
  }

  async postChatMessage(input: {
    userId: string;
    subjectId: string;
    nodeId: string;
    lessonId?: string;
    text: string;
    attachmentIds?: string[];
  }): Promise<{ reply: string }> {
    const { userId, subjectId, nodeId, text } = input;
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const trimmed = text?.trim() ?? '';
    if (!trimmed) throw AppError.badRequest('text is required');

    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const node = await this.resolveNode(subjectId, nodeId);
    const lessons = await resolveNodeLessons(subjectId, subject, node);
    const lesson =
      (input.lessonId && lessons.find(l => l.lessonId === input.lessonId)) || lessons[0];
    const lessonText = lesson ? normalizeLessonContent(lesson.content, lesson.contentFormat) : '';

    const images: Array<{ mimeType: string; base64: string }> = [];
    const ids = (input.attachmentIds ?? []).filter(Boolean);
    for (const id of ids) {
      if (!mongoose.isValidObjectId(id)) throw AppError.badRequest(`Invalid attachment id: ${id}`);
      const att = await RoadmapChatAttachment.findOne({
        _id: id,
        userId,
        subjectId,
        nodeId,
      }).lean();
      if (!att) throw AppError.badRequest(`Attachment not found: ${id}`);
      if (att.sizeBytes > ROADMAP_CHAT_MAX_BYTES) throw AppError.badRequest('Attachment too large');

      const abs = path.join(process.cwd(), att.storageRelativePath);
      const buf = await fs.readFile(abs);
      images.push({
        mimeType: att.mimeType,
        base64: buf.toString('base64'),
      });
    }

    const reply = await roadmapAIService.chatLessonNode({
      subjectTitle: subject.title,
      nodeTitle: lesson?.title || node.title,
      nodeDescription: node.description?.trim(),
      lessonText,
      userMessage: trimmed,
      ...(images.length ? { images } : {}),
    });

    return { reply };
  }

  async saveChatAttachment(input: {
    userId: string;
    subjectId: string;
    nodeId: string;
    attachmentId: mongoose.Types.ObjectId;
    absolutePath: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  }): Promise<{ attachmentId: string }> {
    const bundle = await roadmapService.resolveCanonical(input.subjectId);
    if (!bundle.nodes.some(n => n.nodeId === input.nodeId)) {
      await fs.unlink(input.absolutePath).catch(() => undefined);
      throw AppError.notFound('Roadmap node not found for this subject');
    }

    const rel = path.relative(process.cwd(), input.absolutePath);
    await RoadmapChatAttachment.create({
      _id: input.attachmentId,
      userId: input.userId,
      subjectId: input.subjectId,
      nodeId: input.nodeId,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageRelativePath: rel,
      originalName: input.originalName.slice(0, 512),
    });
    return { attachmentId: input.attachmentId.toString() };
  }
}

export const roadmapLessonService = new RoadmapLessonService();
