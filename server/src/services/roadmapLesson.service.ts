import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { CanonicalRoadmap } from '../models/CanonicalRoadmap.model';
import { RoadmapChatAttachment } from '../models/RoadmapChatAttachment.model';
import { Subject } from '../models';
import { buildTopicCanonicalNodes } from '../utils/roadmapChapter.util';
import {
  ICanonicalRoadmapNode,
  IRoadmapLessonResponse,
  IRoadmapLessonVideo
} from '../types/roadmap.types';
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

function parseVideo(meta: Record<string, unknown>): IRoadmapLessonVideo | null {
  const v = meta.video;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const url = typeof o.url === 'string' ? o.url.trim() : '';
  if (!url) return null;
  const durationSec =
    typeof o.durationSec === 'number' && Number.isFinite(o.durationSec) ? o.durationSec : undefined;
  const posterUrl =
    typeof o.posterUrl === 'string' && o.posterUrl.trim() ? o.posterUrl.trim() : undefined;
  return { url, ...(durationSec !== undefined ? { durationSec } : {}), ...(posterUrl ? { posterUrl } : {}) };
}

function lessonMetaFromNode(node: ICanonicalRoadmapNode): {
  lessonId: string;
  rawContent: string;
  contentStorageFormat: 'markdown' | 'html';
  summary?: string;
  video: IRoadmapLessonVideo | null;
} {
  const md = node.metadata;
  const lessonRaw =
    md && typeof md === 'object' && md !== null && 'lesson' in md ? (md as { lesson?: unknown }).lesson : undefined;

  if (lessonRaw && typeof lessonRaw === 'object' && lessonRaw !== null && !Array.isArray(lessonRaw)) {
    const L = lessonRaw as Record<string, unknown>;
    const lessonId =
      typeof L.lessonId === 'string' && L.lessonId.trim() ? L.lessonId.trim() : node.nodeId;
    const summary = typeof L.summary === 'string' ? L.summary : undefined;
    const rawContent =
      typeof L.content === 'string'
        ? L.content
        : node.description?.trim() ?? '';
    const contentStorageFormat = L.contentFormat === 'html' ? 'html' : 'markdown';
    const video = parseVideo(L);
    return { lessonId, rawContent, contentStorageFormat, summary, video };
  }

  return {
    lessonId: node.nodeId,
    rawContent: node.description?.trim() ?? '',
    contentStorageFormat: 'markdown',
    summary: undefined,
    video: null
  };
}

async function persistLessonSummary(subjectId: string, nodeId: string, summary: string): Promise<void> {
  const sub = await Subject.findById(subjectId).lean();
  if (sub && buildTopicCanonicalNodes(sub).length > 0) {
    return;
  }
  const subjectOid = new mongoose.Types.ObjectId(subjectId);
  const doc = await CanonicalRoadmap.findOne({ subjectId: subjectOid }).sort({ version: -1 });
  if (!doc) return;

  const updatedNodes = doc.nodes.map((n) => {
    if (n.nodeId !== nodeId) return n;
    const oldMeta =
      n.metadata && typeof n.metadata === 'object' && n.metadata !== null
        ? { ...(n.metadata as Record<string, unknown>) }
        : {};
    const oldLesson =
      oldMeta.lesson &&
      typeof oldMeta.lesson === 'object' &&
      oldMeta.lesson !== null &&
      !Array.isArray(oldMeta.lesson)
        ? { ...(oldMeta.lesson as Record<string, unknown>) }
        : {};
    oldMeta.lesson = { ...oldLesson, summary };
    return { ...n, metadata: oldMeta };
  });

  doc.set('nodes', updatedNodes);
  doc.markModified('nodes');
  await doc.save();
}

class RoadmapLessonService {
  async getLesson(
    userId: string,
    subjectId: string,
    nodeId: string
  ): Promise<IRoadmapLessonResponse> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');

    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const canonical = await roadmapService.getCanonical(subjectId);
    const node = canonical.nodes.find((n) => n.nodeId === nodeId);
    if (!node) throw AppError.notFound('Roadmap node not found for this subject');

    const meta = lessonMetaFromNode(node as ICanonicalRoadmapNode);
    const contentNormalized = normalizeLessonContent(meta.rawContent, meta.contentStorageFormat);

    const readCompletedAt = await roadmapService.getLessonReadAtIso(userId, subjectId, nodeId);

    let summary = meta.summary?.trim() ?? '';
    if (!summary && contentNormalized.trim() && process.env.OPENAI_API_KEY) {
      summary = await roadmapAIService.generateLessonSummary({
        subjectTitle: subject.title,
        nodeTitle: node.title,
        lessonText: contentNormalized
      });
      if (summary) {
        await persistLessonSummary(subjectId, nodeId, summary).catch((e) =>
          console.warn('[roadmapLesson] persist summary failed', e)
        );
      }
    }

    return {
      nodeId: node.nodeId,
      lessonId: meta.lessonId,
      title: node.title,
      summary,
      content: contentNormalized,
      contentFormat: 'markdown',
      textFormat: 'markdown',
      video: meta.video,
      readCompletedAt
    };
  }

  async markLessonRead(userId: string, subjectId: string, nodeId: string): Promise<{ readCompletedAt: string }> {
    return roadmapService.markLessonRead(userId, subjectId, nodeId);
  }

  async postChatMessage(input: {
    userId: string;
    subjectId: string;
    nodeId: string;
    text: string;
    attachmentIds?: string[];
  }): Promise<{ reply: string }> {
    const { userId, subjectId, nodeId, text } = input;
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const trimmed = text?.trim() ?? '';
    if (!trimmed) throw AppError.badRequest('text is required');

    const subject = await Subject.findById(subjectId).lean();
    if (!subject) throw AppError.notFound('Subject not found');

    const canonical = await roadmapService.getCanonical(subjectId);
    const node = canonical.nodes.find((n) => n.nodeId === nodeId);
    if (!node) throw AppError.notFound('Roadmap node not found for this subject');

    const meta = lessonMetaFromNode(node as ICanonicalRoadmapNode);
    const lessonText = normalizeLessonContent(meta.rawContent, meta.contentStorageFormat);

    const images: Array<{ mimeType: string; base64: string }> = [];
    const ids = (input.attachmentIds ?? []).filter(Boolean);
    for (const id of ids) {
      if (!mongoose.isValidObjectId(id)) throw AppError.badRequest(`Invalid attachment id: ${id}`);
      const att = await RoadmapChatAttachment.findOne({
        _id: id,
        userId,
        subjectId,
        nodeId
      }).lean();
      if (!att) throw AppError.badRequest(`Attachment not found: ${id}`);
      if (att.sizeBytes > ROADMAP_CHAT_MAX_BYTES) throw AppError.badRequest('Attachment too large');

      const abs = path.join(process.cwd(), att.storageRelativePath);
      const buf = await fs.readFile(abs);
      images.push({
        mimeType: att.mimeType,
        base64: buf.toString('base64')
      });
    }

    const reply = await roadmapAIService.chatLessonNode({
      subjectTitle: subject.title,
      nodeTitle: node.title,
      nodeDescription: node.description?.trim(),
      lessonText,
      userMessage: trimmed,
      ...(images.length ? { images } : {})
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
    const canonical = await roadmapService.getCanonical(input.subjectId);
    if (!canonical.nodes.some((n) => n.nodeId === input.nodeId)) {
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
      originalName: input.originalName.slice(0, 512)
    });
    return { attachmentId: input.attachmentId.toString() };
  }
}

export const roadmapLessonService = new RoadmapLessonService();
