import mongoose from 'mongoose';
import { UserKcMastery, QuestionItem } from '../models';
import { IQuestion, IUserAnswer, IUserKcComponentProgress } from '../types';

/**
 * USER KC MASTERY SERVICE (Фаза 3)
 * Обновляет пер-KC mastery и статистику item'ов по результату теста из банка;
 * ретайрит «плохие» вопросы; ведёт список недавних item'ов для spaced repetition.
 */

const KC_MASTERY_PERCENT = 80;
const RECENT_ITEMS_CAP = 200;
const RETIRE_MIN_USES = 10;
const RETIRE_MAX_CORRECT_RATE = 0.15; // почти все ошибаются → вопрос, вероятно, сломан

class UserKcMasteryService {
  /**
   * Учесть результат сабмита: пер-KC баллы, статистика item'ов, ретайр, SR-exposure.
   * Безопасно для обычных тестов (без KC-тегов) — тогда ничего не делает.
   */
  async recordFromSubmission(
    userId: string,
    subjectId: string,
    questions: IQuestion[],
    userAnswers: IUserAnswer[]
  ): Promise<void> {
    const correctByText = new Map<string, boolean>();
    for (const ua of userAnswers) correctByText.set(ua.question, ua.isCorrect);

    // Агрегация по KC + статистика item'ов.
    const perKc = new Map<string, { correct: number; total: number }>();
    const itemCorrect: Array<{ itemId: string; correct: boolean }> = [];
    const seenItemIds: string[] = [];

    for (const q of questions) {
      const isCorrect = correctByText.get(q.questionText) ?? false;
      const kcIds = q.knowledgeComponentIds ?? [];
      for (const kcId of kcIds) {
        const acc = perKc.get(kcId) ?? { correct: 0, total: 0 };
        acc.total++;
        if (isCorrect) acc.correct++;
        perKc.set(kcId, acc);
      }
      if (q.questionItemId) {
        const itemId = String(q.questionItemId);
        itemCorrect.push({ itemId, correct: isCorrect });
        seenItemIds.push(itemId);
      }
    }

    if (perKc.size === 0 && itemCorrect.length === 0) return; // обычный тест — нечего обновлять

    if (perKc.size > 0 || seenItemIds.length > 0) {
      await this.applyKcProgress(userId, subjectId, perKc, seenItemIds);
    }
    if (itemCorrect.length > 0) {
      await this.applyItemStats(itemCorrect);
    }
  }

  private async applyKcProgress(
    userId: string,
    subjectId: string,
    perKc: Map<string, { correct: number; total: number }>,
    seenItemIds: string[]
  ): Promise<void> {
    const doc =
      (await UserKcMastery.findOne({ userId, subjectId })) ??
      new UserKcMastery({ userId, subjectId, components: [], recentItemIds: [] });

    const now = new Date();
    for (const [kcId, agg] of perKc.entries()) {
      const score = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0;
      let comp = doc.components.find((c) => c.kcId === kcId);
      if (!comp) {
        comp = { kcId, bestScore: 0, attempts: 0, mastered: false } as IUserKcComponentProgress;
        doc.components.push(comp);
        comp = doc.components[doc.components.length - 1];
      }
      comp.bestScore = Math.max(comp.bestScore, score);
      comp.attempts += 1;
      comp.mastered = comp.bestScore >= KC_MASTERY_PERCENT;
      comp.lastAttemptAt = now;
    }

    if (seenItemIds.length) {
      const merged = [...seenItemIds, ...doc.recentItemIds];
      // уникальные, с сохранением порядка (свежие впереди), обрезка
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const id of merged) {
        if (seen.has(id)) continue;
        seen.add(id);
        unique.push(id);
        if (unique.length >= RECENT_ITEMS_CAP) break;
      }
      doc.recentItemIds = unique;
    }

    doc.markModified('components');
    await doc.save();
  }

  private async applyItemStats(itemCorrect: Array<{ itemId: string; correct: boolean }>): Promise<void> {
    const ops = itemCorrect
      .filter((x) => mongoose.isValidObjectId(x.itemId))
      .map((x) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(x.itemId) },
          update: { $inc: { 'qualityStats.timesCorrect': x.correct ? 1 : 0 } }
        }
      }));
    if (ops.length) await QuestionItem.bulkWrite(ops);

    // Ретайр явно «сломанных»: достаточно показов, но почти все ошибаются.
    const ids = itemCorrect.map((x) => x.itemId).filter((id) => mongoose.isValidObjectId(id));
    const candidates = await QuestionItem.find({ _id: { $in: ids }, status: 'active' })
      .select('qualityStats')
      .lean();
    const toRetire = candidates
      .filter((c) => {
        const used = c.qualityStats?.timesUsed ?? 0;
        const correct = c.qualityStats?.timesCorrect ?? 0;
        return used >= RETIRE_MIN_USES && correct / used < RETIRE_MAX_CORRECT_RATE;
      })
      .map((c) => c._id);
    if (toRetire.length) {
      await QuestionItem.updateMany({ _id: { $in: toRetire } }, { $set: { status: 'retired' } });
    }
  }

  /** Прогресс по KC (для UI и адаптивной сборки). Map kcId → component. */
  async getComponentMap(userId: string, subjectId: string): Promise<Map<string, IUserKcComponentProgress>> {
    const doc = await UserKcMastery.findOne({ userId, subjectId }).lean();
    const map = new Map<string, IUserKcComponentProgress>();
    for (const c of doc?.components ?? []) map.set(c.kcId, c);
    return map;
  }

  /** Недавно показанные item'ы (для spaced repetition: их деприоритизируем при сборке). */
  async getRecentItemIds(userId: string, subjectId: string): Promise<Set<string>> {
    const doc = await UserKcMastery.findOne({ userId, subjectId }).select('recentItemIds').lean();
    return new Set(doc?.recentItemIds ?? []);
  }
}

export const userKcMasteryService = new UserKcMasteryService();
