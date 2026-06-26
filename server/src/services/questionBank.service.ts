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

const BANK_PROMPT_VERSION = 'gpt-4o-mini/bank-v2';
const DEFAULT_MIN_ITEMS_PER_KC = 3;
const DEFAULT_TEST_SIZE = 10;
const ALLOWED_TEST_SIZES = [5, 10, 15, 20];

function normalizeTestSize(size?: number): number {
  return size != null && ALLOWED_TEST_SIZES.includes(size) ? size : DEFAULT_TEST_SIZE;
}

/**
 * Ключ дедупа item'а: текст + (отсортированные) варианты + правильный ответ.
 * Включение вариантов ловит перефразировки-с-теми-же-опциями, которые text-only хэш пропускал.
 */
function contentHashOf(q: IQuestion): string {
  const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const parts = [
    norm(q.questionText),
    ...(q.options ?? []).map(norm).sort(),
    `=${norm(q.correctOption ?? '')}`
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

/** Старый (v1) ключ дедупа — только по тексту. Для переходной дедупликации против pre-v2 item'ов. */
function legacyContentHashOf(questionText: string): string {
  const norm = questionText.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256').update(norm).digest('hex');
}

/**
 * Разложить дефицит на уровни сложности вокруг центра (для разброса в банке —
 * иначе адаптивному отбору нечем варьировать сложность). Малый дефицит не размазываем.
 */
function buildDifficultyPlan(count: number, center: number): Array<{ difficulty: number; count: number }> {
  if (count <= 0) return [];
  if (count <= 2) return [{ difficulty: center, count }];
  const levels = [...new Set([Math.max(1, center - 1), center, Math.min(5, center + 1)])];
  const plan = levels.map((difficulty) => ({ difficulty, count: 0 }));
  for (let i = 0; i < count; i++) plan[i % plan.length].count++;
  return plan.filter((p) => p.count > 0);
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
   * Полный список item'ов банка узла (для admin-просмотра качества) — с правильными ответами.
   * В отличие от sanitizeQuestionForClient, отдаёт correctOption/пояснения целиком.
   */
  async listItems(
    subjectId: string,
    ktpTopicId: string,
    filter?: { kcId?: string; status?: 'draft' | 'active' | 'retired' }
  ): Promise<IQuestionItem[]> {
    await this.assertSubject(subjectId);
    const query: Record<string, unknown> = { subjectId, knowledgeNodeId: ktpTopicId };
    if (filter?.status) query.status = filter.status;
    if (filter?.kcId) query.knowledgeComponentIds = filter.kcId;
    const items = await QuestionItem.find(query).sort({ status: 1, createdAt: -1 }).lean();
    return items as unknown as IQuestionItem[];
  }

  // TODO Phase A-next: ручное управление item'ами банка из админки (заложено, не реализовано):
  //   updateItem(subjectId, ktpTopicId, itemId, patch)   — правка questionText/options/difficulty/KC-тега
  //   setItemStatus(subjectId, ktpTopicId, itemId, status: 'active'|'retired')  — ретайр/возврат (флип статуса)
  //   removeItem(subjectId, ktpTopicId, itemId)          — удаление (QuestionItem.deleteOne)
  // Ретайр/удаление тривиальны; вынесены, чтобы первая итерация UI оставалась read-only.

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
    const centerDifficulty = Math.min(5, Math.max(1, opts?.difficulty ?? 3));

    const resolved = await this.resolveNode(subjectId, ktpTopicId);
    if (!resolved.sourceText.trim()) throw AppError.badRequest('Node has no source text to ground questions');

    const kcs = await knowledgeComponentService.getConfirmed(subjectId, ktpTopicId);

    let created = 0;
    let rejected = 0;
    const rejectReasons: string[] = [];
    const MAX_ROUNDS = 3; // верификатор режет часть — добираем в несколько проходов

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const cov = await this.coverage(subjectId, ktpTopicId);
      // Цели: KC с дефицитом активных, либо одна цель на узел (если KC нет).
      const targets: Array<{ kcId?: string; title: string; deficit: number }> = kcs.length
        ? cov.perKc
            .filter((p) => p.active < minPerKc)
            .map((p) => ({ kcId: p.kcId, title: p.title, deficit: minPerKc - p.active }))
        : cov.totalActive < minPerKc
          ? [{ title: resolved.nodeTitle, deficit: minPerKc - cov.totalActive }]
          : [];
      if (targets.length === 0) break;

      let producedThisRound = 0;
      for (const target of targets) {
        for (const bucket of buildDifficultyPlan(target.deficit, centerDifficulty)) {
          let generated: IQuestion[];
          try {
            generated = await aiService.generateKcQuestions({
              nodeTitle: resolved.nodeTitle,
              kcTitle: target.title,
              sourceText: resolved.sourceText,
              ...(resolved.language ? { language: resolved.language } : {}),
              count: bucket.count,
              difficulty: bucket.difficulty
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
            const hash = contentHashOf(q);
            // Переходный дедуп: ловим near-дубли и против старых (v1, text-only) item'ов до бэкфилла.
            const dup = await QuestionItem.exists({
              subjectId,
              knowledgeNodeId: ktpTopicId,
              contentHash: { $in: [hash, legacyContentHashOf(q.questionText)] }
            });
            if (dup) continue;
            const doc: Omit<IQuestionItem, '_id' | 'createdAt' | 'updatedAt'> = {
              subjectId: new mongoose.Types.ObjectId(subjectId),
              knowledgeNodeId: ktpTopicId,
              knowledgeComponentIds: target.kcId ? [target.kcId] : [],
              question: q,
              difficulty: bucket.difficulty,
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
              producedThisRound++;
            } catch (e: unknown) {
              // Дубликат (уникальный индекс по contentHash в узле) — молча пропускаем.
              if ((e as { code?: number }).code === 11000) continue;
              console.warn('[questionBank] insert failed', e);
            }
          }
        }
      }
      if (producedThisRound === 0) break; // прогресса нет — не крутим вхолостую
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
    opts?: { userId?: string; size?: number; allowRefill?: boolean }
  ): Promise<InstanceType<typeof Test>> {
    await this.assertSubject(subjectId);
    const size = normalizeTestSize(opts?.size);
    // По умолчанию при нехватке банк синхронно дозаполняется через LLM (для прогрева куратором).
    // Студенческий hot-path передаёт allowRefill:false — быстрый 400 при нехватке (клиент уйдёт на LLM-фолбэк),
    // чтобы не блокировать запрос медленной генерацией банка.
    const allowRefill = opts?.allowRefill !== false;

    // Адаптивный контекст: пер-KC mastery (слабые темы вперёд) + недавние item'ы (SR).
    const ctx = opts?.userId
      ? {
          componentMap: await userKcMasteryService.getComponentMap(opts.userId, subjectId),
          recentItems: await userKcMasteryService.getRecentItemIds(opts.userId, subjectId)
        }
      : undefined;

    let items = await this.selectCovering(subjectId, ktpTopicId, size, ctx);
    if (allowRefill && items.length < size) {
      // дозаполняем банк под нужный размер (минимум на KC масштабируем от size) и пробуем ещё раз
      const cov = await this.coverage(subjectId, ktpTopicId);
      const kcCount = Math.max(1, cov.perKc.length);
      const minPerKc = Math.max(DEFAULT_MIN_ITEMS_PER_KC, Math.ceil(size / kcCount));
      await this.generateForCoverage(subjectId, ktpTopicId, { minPerKc });
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
      `bank:${size}:` +
      createHash('sha256')
        .update(`${size}|` + selected.map((i) => String(i._id)).sort().join(','))
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
