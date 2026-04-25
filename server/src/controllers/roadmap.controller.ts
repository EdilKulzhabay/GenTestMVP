import { Request, Response } from 'express';
import { roadmapService, roadmapLessonService } from '../services';
import { roadmapAIService } from '../services/roadmap.ai.service';
import { resolveBookContentForAI } from '../services/subjectContent.service';
import { CanonicalRoadmap } from '../models/CanonicalRoadmap.model';
import { Subject } from '../models';
import { IGenerateTestDTO } from '../types';
import mongoose from 'mongoose';
import { assertValidCanonicalNodes } from '../utils/roadmapGraph';
import { parseCanonicalNodesFromPayload } from '../utils/roadmapJson';
import { assertLearnerSubjectAccess } from '../utils/learnerSubjectAccess.util';
import { success, AppError } from '../utils';

function wantAiInsights(req: Request): boolean {
  const v = req.query.ai;
  return v === '1' || v === 'true';
}

class RoadmapController {
  async getCanonical(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const subjectId = req.query.subjectId as string;
    if (!subjectId) throw AppError.badRequest('subjectId is required');
    if (userId) await assertLearnerSubjectAccess(userId, subjectId);
    const data = await roadmapService.getCanonical(subjectId);
    success(res, data, 'Canonical roadmap');
  }

  async getPersonal(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const subjectId = req.query.subjectId as string;
    if (!subjectId) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId);
    const data = await roadmapService.getPersonalSnapshot(userId, subjectId, {
      includeAiInsights: wantAiInsights(req)
    });
    success(res, data, 'Personal roadmap');
  }

  async getNext(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const subjectId = req.query.subjectId as string;
    if (!subjectId) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId);
    const data = await roadmapService.getNext(userId, subjectId, {
      includeAiInsights: wantAiInsights(req)
    });
    success(res, data, 'Next step');
  }

  async getPickerSubjects(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const data = await roadmapService.getPickerSubjects(userId);
    success(res, { subjects: data }, 'Roadmap subject picker');
  }

  async postTestSubmitted(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const { subjectId, nodeId, score, sessionId, submittedAt } = req.body;
    if (!subjectId || !nodeId || sessionId === undefined || score === undefined) {
      throw AppError.badRequest('subjectId, nodeId, score, sessionId are required');
    }
    await assertLearnerSubjectAccess(userId, String(subjectId));
    const scoreNum = Number(score);
    if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      throw AppError.badRequest('score must be a number 0..100');
    }
    const data = await roadmapService.recordTestSubmitted({
      userId,
      subjectId,
      nodeId,
      scorePercent: scoreNum,
      sessionId: String(sessionId),
      submittedAt: submittedAt ? new Date(submittedAt) : new Date()
    });
    success(res, data, 'Roadmap updated');
  }

  /**
   * Админ: сгенерировать canonical roadmap по тексту книги через ИИ и сохранить.
   * Тело как у POST /tests/generate: subjectId, bookId, chapterId?, fullBook?
   */
  async generateCanonicalFromBookAdmin(req: Request, res: Response): Promise<void> {
    const dto = req.body as IGenerateTestDTO;
    if (!dto.subjectId || !dto.bookId) {
      throw AppError.badRequest('subjectId and bookId are required');
    }

    const { contentForAI, book } = await resolveBookContentForAI(dto);
    const nodes = await roadmapAIService.generateCanonicalFromBookContent(contentForAI);

    const subjectObjectId = new mongoose.Types.ObjectId(dto.subjectId);
    const existing = await CanonicalRoadmap.findOne({ subjectId: subjectObjectId });
    const nextVersion = (existing?.version ?? 0) + 1;

    const sourceMeta = {
      bookId: dto.bookId,
      bookTitle: book.title,
      bookAuthor: book.author?.trim() || undefined,
      chapterTitle: dto.fullBook ? undefined : contentForAI.metadata.chapterTitle,
      fullBook: Boolean(dto.fullBook),
      contentLanguage: book.contentLanguage?.trim() || undefined
    };

    const doc = await CanonicalRoadmap.findOneAndUpdate(
      { subjectId: subjectObjectId },
      {
        subjectId: subjectObjectId,
        version: nextVersion,
        nodes,
        sourceMeta
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    success(
      res,
      {
        subjectId: doc!.subjectId,
        version: doc!.version,
        nodes: doc!.nodes,
        source: 'ai',
        sourceMeta,
        bookId: dto.bookId,
        chapterId: dto.chapterId,
        fullBook: Boolean(dto.fullBook)
      },
      'Canonical roadmap generated by AI',
      201
    );
  }

  /**
   * Админ: создать/обновить canonical roadmap вручную (JSON).
   */
  async rebuildFromTopicsAdmin(req: Request, res: Response): Promise<void> {
    const subjectId = (req.body as { subjectId?: string })?.subjectId;
    if (!subjectId || !mongoose.isValidObjectId(subjectId)) {
      throw AppError.badRequest('subjectId is required');
    }
    const data = await roadmapService.adminRebuildCanonicalFromTopics(subjectId);
    success(res, data, 'Карта знаний пересобрана из тем');
  }

  async upsertCanonicalAdmin(req: Request, res: Response): Promise<void> {
    const { subjectId, version: bodyVersion } = req.body;
    if (!subjectId) {
      throw AppError.badRequest('subjectId is required');
    }
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');

    const subject = await Subject.findById(subjectId);
    if (!subject) throw AppError.notFound('Subject not found');

    const { nodes: mapped, version: parsedVersion, description: parsedDescription } =
      parseCanonicalNodesFromPayload(req.body);
    assertValidCanonicalNodes(mapped);

    const bodyDescription =
      typeof req.body === 'object' &&
      req.body !== null &&
      typeof (req.body as { description?: unknown }).description === 'string'
        ? String((req.body as { description: string }).description).trim()
        : '';
    const roadmapDescription = bodyDescription || parsedDescription;

    const existing = await CanonicalRoadmap.findOne({ subjectId });
    const nextVersion =
      typeof bodyVersion === 'number'
        ? bodyVersion
        : typeof parsedVersion === 'number'
          ? parsedVersion
          : (existing?.version ?? 0) + 1;

    const doc = await CanonicalRoadmap.findOneAndUpdate(
      { subjectId },
      {
        $set: {
          subjectId,
          version: nextVersion,
          nodes: mapped,
          ...(roadmapDescription ? { description: roadmapDescription } : {})
        },
        $unset: { sourceMeta: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    success(
      res,
      {
        subjectId: doc!.subjectId,
        version: doc!.version,
        nodes: doc!.nodes,
        ...(doc!.description?.trim() ? { description: doc!.description.trim() } : {})
      },
      'Canonical roadmap saved',
      201
    );
  }

  async getNodeLesson(req: Request, res: Response): Promise<void> {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId as string;
    const nodeId = req.params.nodeId as string;
    const subjectId = req.query.subjectId as string;
    if (!subjectId?.trim()) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId.trim());
    const data = await roadmapLessonService.getLesson(userId, subjectId.trim(), nodeId);
    success(res, data, 'Lesson');
  }

  async postNodeLessonRead(req: Request, res: Response): Promise<void> {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId as string;
    const nodeId = req.params.nodeId as string;
    const subjectId = (req.body as { subjectId?: string })?.subjectId;
    if (!subjectId?.trim()) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId.trim());
    const data = await roadmapLessonService.markLessonRead(userId, subjectId.trim(), nodeId);
    success(res, data, 'Lesson marked read');
  }

  async postNodeAcknowledgeMaterial(req: Request, res: Response): Promise<void> {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId as string;
    const nodeId = req.params.nodeId as string;
    const subjectId = (req.body as { subjectId?: string })?.subjectId;
    if (!subjectId?.trim()) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId.trim());
    const data = await roadmapService.acknowledgeMaterialMastery(
      userId,
      subjectId.trim(),
      nodeId
    );
    success(res, data, 'Material acknowledged');
  }

  async postNodeChatMessage(req: Request, res: Response): Promise<void> {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId as string;
    const nodeId = req.params.nodeId as string;
    const { subjectId, text, attachmentIds } = req.body as {
      subjectId?: string;
      text?: string;
      attachmentIds?: string[];
    };
    if (!subjectId?.trim()) throw AppError.badRequest('subjectId is required');
    await assertLearnerSubjectAccess(userId, subjectId.trim());
    const data = await roadmapLessonService.postChatMessage({
      userId,
      subjectId: subjectId.trim(),
      nodeId,
      text: text ?? '',
      attachmentIds
    });
    success(res, data, 'Chat reply');
  }

  async postNodeChatAttachment(req: Request, res: Response): Promise<void> {
    const userId = (req as Request & { user?: { userId: string } }).user?.userId as string;
    const nodeId = req.params.nodeId as string;
    const fromBody = (req.body as { subjectId?: string })?.subjectId;
    const fromQuery = (req.query as { subjectId?: string })?.subjectId;
    const subjectId = (fromBody && String(fromBody).trim()) || (fromQuery && String(fromQuery).trim());
    if (!subjectId) throw AppError.badRequest('subjectId is required (form field or query ?subjectId=)');
    await assertLearnerSubjectAccess(userId, subjectId.trim());
    const file = req.file;
    if (!file) throw AppError.badRequest('file is required (multipart field name: file)');

    const attachId = (req as Request & { roadmapAttachmentId?: mongoose.Types.ObjectId }).roadmapAttachmentId;
    if (!attachId) throw AppError.badRequest('Upload failed');

    const data = await roadmapLessonService.saveChatAttachment({
      userId,
      subjectId: subjectId.trim(),
      nodeId,
      attachmentId: attachId,
      absolutePath: file.path,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sizeBytes: file.size
    });

    success(res, data, 'Attachment saved', 201);
  }
}

export const roadmapController = new RoadmapController();
