import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { QuestionItem, Test, Subject } from '../models';
import { KtpCatalog } from '../models/KtpCatalog.model';
import { AppError } from '../utils';
import { IKtpCatalog, ICanonicalRoadmapNode } from '../types/roadmap.types';
import { IQuestion, IQuestionItem } from '../types';
import { buildKtpCanonicalNodes } from '../utils/roadmapKtp.util';
import { aiService } from './ai.service';
import { knowledgeComponentService } from './knowledgeComponent.service';
import { userKcMasteryService } from './userKcMastery.service';
import { IUserKcComponentProgress } from '../types';

/**
 * QUESTION BANK SERVICE (Фаза 2)
 * Банк переиспользуемых вопросов, привязанных к узлу знания (ktpTopicId) и KC.
 * Генерация — только под ПРОБЕЛ покрытия (а не на каждую попытку); сборка теста = выборка item'ов.
 */

const BANK_PROMPT_VERSION = 'gpt-4o-mini/bank-v1';
const DEFAULT_MIN_ITEMS_PER_KC = 3;
const TEST_SIZE = 10; // Test-валидатор требует ровно 10 вопросов

function contentHashOf(questionText: string): string {
  const norm = questionText.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(norm).digest('hex');
}

type ResolvedNode = {
  node: ICanonicalRoadmapNode;
  nodeTitle: string;
  language?: string;
  sourceText: string;
  sourceRefs: Array<{ bookId?: string; chapterId?: string; topicId?: string }>;
  primary: { bookId?: string; chapterId?: string };
};

class QuestionBankService {
  private async assertSubject(subjectId: string): Promise<void> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
  }

  /** Разрешить узел КТП: текст источников (для грунтинга) + первичная книга/глава (для Test). */
  private async resolveNode(subjectId: string, ktpTopicId: string): Promise<ResolvedNode> {
    const subject = await Subject.findById(subjectId).lean();
    const ktp = await KtpCatalog.findOne({ subjectId }).lean<IKtpCatalog>();
    if (!subject || !ktp) throw AppError.notFound('Subject or KTP catalog not found');
    const nodes = buildKtpCanonicalNodes(subject, ktp);
    const node = nodes.find(
      (n) => (n.metadata as Record<string, unknown> | undefined)?.ktpTopicId === ktpTopicId
    );
    if (!node) throw AppError.notFound('KTP node not found or has no sources');

    const md = node.metadata as Record<string, unknown>;
    const lessons = (md.lessons as Array<{ title?: string; content?: string }> | undefined) ?? [];
    const sources = (md.sources as Array<{ bookId: string; chapterId: string; topicId: string }> | undefined) ?? [];
    const sourceText = lessons
      .map((l) => (l.content || '').trim())
      .filter(Boolean)
      .join('\n\n');

    const primaryBookId = typeof md.bookId === 'string' ? md.bookId : sources[0]?.bookId;
    const book = (subject as { books?: Array<{ _id?: { toString(): string }; contentLanguage?: string }> }).books?.find(
      (b) => b._id?.toString() === primaryBookId
    );

    return {
      node,
      nodeTitle: node.title,
      ...(book?.contentLanguage ? { language: book.contentLanguage } : {}),
      sourceText,
      sourceRefs: sources.map((s) => ({ bookId: s.bookId, chapterId: s.chapterId, topicId: s.topicId })),
      primary: {
        ...(primaryBookId ? { bookId: primaryBookId } : {}),
        ...(typeof md.chapterId === 'string' ? { chapterId: md.chapterId } : {})
      }
    };
  }

  /** Покрытие узла: активных item'ов всего и по каждому подтверждённому KC. */
  async coverage(
    subjectId: string,
    ktpTopicId: string
  ): Promise<{
    totalActive: number;
    perKc: Array<{ kcId: string; title: string; active: number }>;
    unassigned: number;
  }> {
    await this.assertSubject(subjectId);
    const kcs = await knowledgeComponentService.getConfirmed(subjectId, ktpTopicId);
    const active = await QuestionItem.find({ subjectId, knowledgeNodeId: ktpTopicId, status: 'active' })
      .select('knowledgeComponentIds')
      .lean();
    const countByKc = new Map<string, number>();
    let unassigned = 0;
    for (const it of active) {
      const ids = (it.knowledgeComponentIds ?? []) as string[];
      if (ids.length === 0) unassigned++;
      for (const id of ids) countByKc.set(id, (countByKc.get(id) ?? 0) + 1);
    }
    return {
      totalActive: active.length,
      perKc: kcs.map((k) => ({ kcId: k.id, title: k.title, active: countByKc.get(k.id) ?? 0 })),
      unassigned
    };
  }

  /**
   * Дозаполнить банк под покрытие: для каждого KC с дефицитом активных вопросов
   * генерируем недостающие, верифицируем (LLM-judge), дедуплицируем и сохраняем.
   * Если подтверждённых KC нет — генерируем на уровне узла (без KC-тега).
   */
  async generateForCoverage(
    subjectId: string,
    ktpTopicId: string,
    opts?: { minPerKc?: number; difficulty?: number }
  ): Promise<{ created: number; rejected: number; coverage: Awaited<ReturnType<QuestionBankService['coverage']>> }> {
    await this.assertSubject(subjectId);
    const minPerKc = Math.max(1, opts?.minPerKc ?? DEFAULT_MIN_ITEMS_PER_KC);
    const difficulty = Math.min(5, Math.max(1, opts?.difficulty ?? 3));

    const resolved = await this.resolveNode(subjectId, ktpTopicId);
    if (!resolved.sourceText.trim()) throw AppError.badRequest('Node has no source text to ground questions');

    const kcs = await knowledgeComponentService.getConfirmed(subjectId, ktpTopicId);
    const cov = await this.coverage(subjectId, ktpTopicId);

    // Список «целей»: либо по KC с дефицитом, либо одна цель на узел (если KC нет).
    const targets: Array<{ kcId?: string; title: string; deficit: number }> = kcs.length
      ? cov.perKc
          .filter((p) => p.active < minPerKc)
          .map((p) => ({ kcId: p.kcId, title: p.title, deficit: minPerKc - p.active }))
      : cov.totalActive < minPerKc
        ? [{ title: resolved.nodeTitle, deficit: minPerKc - cov.totalActive }]
        : [];

    let created = 0;
    let rejected = 0;
    const rejectReasons: string[] = [];

    for (const target of targets) {
      let generated: IQuestion[];
      try {
        generated = await aiService.generateKcQuestions({
          nodeTitle: resolved.nodeTitle,
          kcTitle: target.title,
          sourceText: resolved.sourceText,
          ...(resolved.language ? { language: resolved.language } : {}),
          count: target.deficit,
          difficulty
        });
      } catch (e) {
        console.warn('[questionBank] generation failed for', target.title, e);
        continue;
      }

      for (const q of generated) {
        // Верификация (анти-галлюцинации).
        const verdict = await aiService.verifyQuestionItem({ question: q, sourceText: resolved.sourceText });
        if (!verdict.ok) {
          rejected++;
          if (verdict.reason) rejectReasons.push(verdict.reason);
          continue;
        }
        const hash = contentHashOf(q.questionText);
        const doc: Omit<IQuestionItem, '_id' | 'createdAt' | 'updatedAt'> = {
          subjectId: new mongoose.Types.ObjectId(subjectId),
          knowledgeNodeId: ktpTopicId,
          knowledgeComponentIds: target.kcId ? [target.kcId] : [],
          question: q,
          difficulty,
          status: 'active',
          sourceRefs: resolved.sourceRefs.map((r) => ({
            ...(r.bookId ? { bookId: new mongoose.Types.ObjectId(r.bookId) } : {}),
            ...(r.chapterId ? { chapterId: new mongoose.Types.ObjectId(r.chapterId) } : {}),
            ...(r.topicId ? { topicId: new mongoose.Types.ObjectId(r.topicId) } : {})
          })),
          provenance: {
            model: 'gpt-4o-mini',
            promptVersion: BANK_PROMPT_VERSION,
            generatedAt: new Date(),
            verified: true,
            ...(verdict.reason ? { verifyReason: verdict.reason } : {})
          },
          contentHash: hash,
          qualityStats: { timesUsed: 0, timesCorrect: 0 }
        };
        try {
          await QuestionItem.create(doc);
          created++;
        } catch (e: unknown) {
          // Дубликат (уникальный индекс по contentHash в узле) — молча пропускаем.
          if ((e as { code?: number }).code === 11000) continue;
          console.warn('[questionBank] insert failed', e);
        }
      }
    }

    if (rejectReasons.length) {
      console.warn(`[questionBank] отклонено верификатором: ${rejected}. Примеры причин:`);
      for (const r of rejectReasons.slice(0, 8)) console.warn('   •', r);
    }

    const coverageAfter = await this.coverage(subjectId, ktpTopicId);
    return { created, rejected, coverage: coverageAfter };
  }

  /**
   * Собрать тест из банка по покрытию KC (round-robin), при нехватке — дозаполнить и пересобрать.
   * Возвращает обычный Test-документ (переиспользует существующий submit/grade пайплайн).
   */
  async assembleNodeTest(
    subjectId: string,
    ktpTopicId: string,
    opts?: { userId?: string }
  ): Promise<InstanceType<typeof Test>> {
    await this.assertSubject(subjectId);
    // Test-валидатор требует ровно 10 вопросов — размер фиксирован.
    const size = TEST_SIZE;

    // Адаптивный контекст: пер-KC mastery (слабые темы вперёд) + недавние item'ы (SR).
    const ctx = opts?.userId
      ? {
          componentMap: await userKcMasteryService.getComponentMap(opts.userId, subjectId),
          recentItems: await userKcMasteryService.getRecentItemIds(opts.userId, subjectId)
        }
      : undefined;

    let items = await this.selectCovering(subjectId, ktpTopicId, size, ctx);
    if (items.length < size) {
      // дозаполняем банк и пробуем ещё раз
      await this.generateForCoverage(subjectId, ktpTopicId, { minPerKc: DEFAULT_MIN_ITEMS_PER_KC });
      items = await this.selectCovering(subjectId, ktpTopicId, size, ctx);
    }
    if (items.length < size) {
      throw AppError.badRequest(
        `Недостаточно вопросов в банке для сборки теста (есть ${items.length} из ${size}). Сгенерируйте больше.`
      );
    }

    const resolved = await this.resolveNode(subjectId, ktpTopicId);
    if (!resolved.primary.bookId) throw AppError.badRequest('Node has no primary book to attach test');

    const selected = items.slice(0, size);
    const sourceContentHash =
      'bank:' +
      createHash('sha256')
        .update(selected.map((i) => String(i._id)).sort().join(','))
        .digest('hex');

    // Реюз: та же выборка → тот же тест.
    const existing = await Test.findOne({ subjectId, sourceContentHash }).sort({ createdAt: -1 });
    if (existing) return existing;

    const questions: IQuestion[] = selected.map((it) => {
      const q = it.question as IQuestion;
      return {
        ...q,
        relatedContent: {
          ...q.relatedContent,
          ...(resolved.primary.chapterId
            ? { chapterId: new mongoose.Types.ObjectId(resolved.primary.chapterId) }
            : {})
        },
        questionItemId: it._id as mongoose.Types.ObjectId,
        ...(it.knowledgeComponentIds?.length ? { knowledgeComponentIds: it.knowledgeComponentIds } : {})
      };
    });

    await QuestionItem.updateMany(
      { _id: { $in: selected.map((i) => i._id) } },
      { $inc: { 'qualityStats.timesUsed': 1 } }
    );

    return Test.create({
      subjectId,
      bookId: resolved.primary.bookId,
      ...(resolved.primary.chapterId ? { chapterId: resolved.primary.chapterId } : {}),
      questions,
      sourceContentHash,
      testProfile: 'ent'
    });
  }

  /**
   * Выбрать активные item'ы, максимизируя покрытие KC (round-robin по KC), до `size`.
   * Если задан ctx (пер-KC mastery + недавние item'ы): слабые/неосвоенные KC идут первыми,
   * внутри KC — деприоритет недавно показанных (SR) и подбор сложности под уровень освоения.
   */
  private async selectCovering(
    subjectId: string,
    ktpTopicId: string,
    size: number,
    ctx?: { componentMap: Map<string, IUserKcComponentProgress>; recentItems: Set<string> }
  ) {
    const active = await QuestionItem.find({ subjectId, knowledgeNodeId: ktpTopicId, status: 'active' })
      .sort({ 'qualityStats.timesUsed': 1, createdAt: 1 })
      .lean();
    if (active.length === 0) return [];

    // Группируем по KC (item без KC → ключ '_node').
    const byKc = new Map<string, typeof active>();
    for (const it of active) {
      const keys = (it.knowledgeComponentIds ?? []) as string[];
      const groupKeys = keys.length ? keys : ['_node'];
      for (const k of groupKeys) {
        if (!byKc.has(k)) byKc.set(k, []);
        byKc.get(k)!.push(it);
      }
    }

    const masteryOf = (kcId: string): number => ctx?.componentMap.get(kcId)?.bestScore ?? 0;
    const isRecent = (id: string): boolean => ctx?.recentItems.has(id) ?? false;

    // Порядок KC: слабые/неосвоенные первыми (по возрастанию bestScore).
    const kcKeys = [...byKc.keys()];
    if (ctx) kcKeys.sort((a, b) => masteryOf(a) - masteryOf(b));

    // Внутри KC: не показанные недавно — первыми; сложность под уровень (слабому — проще).
    for (const k of kcKeys) {
      const weak = ctx ? masteryOf(k) < 80 : false;
      byKc.get(k)!.sort((x, y) => {
        if (ctx) {
          const rx = isRecent(String(x._id)) ? 1 : 0;
          const ry = isRecent(String(y._id)) ? 1 : 0;
          if (rx !== ry) return rx - ry; // не-недавние вперёд
          const dx = x.difficulty ?? 3;
          const dy = y.difficulty ?? 3;
          if (dx !== dy) return weak ? dx - dy : dy - dx; // слабому проще, сильному сложнее
        }
        return (x.qualityStats?.timesUsed ?? 0) - (y.qualityStats?.timesUsed ?? 0);
      });
    }

    const picked: typeof active = [];
    const usedIds = new Set<string>();
    let progress = true;
    while (picked.length < size && progress) {
      progress = false;
      for (const k of kcKeys) {
        if (picked.length >= size) break;
        const pool = byKc.get(k)!;
        const next = pool.find((it) => !usedIds.has(String(it._id)));
        if (next) {
          usedIds.add(String(next._id));
          picked.push(next);
          progress = true;
        }
      }
    }
    return picked;
  }
}

export const questionBankService = new QuestionBankService();
