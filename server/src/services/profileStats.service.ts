import { SoloAttempt, Subject, User } from '../models';
import { roadmapService } from './roadmap.service';
import { getLearnerSubjectIds } from '../utils/learnerSubjectAccess.util';

export interface IProfileStats {
  /** Стрик ежедневных кахутов (дней подряд с ranked-попыткой) */
  dailyStreak: number;
  /** Темы: изучено / всего по предметам пользователя */
  topics: { studied: number; total: number };
  /** Предметы: выбрано / всего (main обязательны + 2 профильных, если пара выбрана) */
  subjects: { selected: number; total: number; hasProfileSubject: boolean };
}

/**
 * PROFILE STATS SERVICE
 * Карточки профиля: стрик, изучено тем, выбрано предметов. Все три метрики считаются из
 * существующих данных (SoloAttempt / роадмап-прогресс / Subject), отдельных коллекций не вводим.
 */
class ProfileStatsService {
  async getProfileStats(userId: string): Promise<IProfileStats> {
    const [dailyStreak, topics, subjects] = await Promise.all([
      this.computeDailyStreak(userId),
      this.computeTopicsStudied(userId),
      this.computeSubjectsSelected(userId)
    ]);
    return { dailyStreak, topics, subjects };
  }

  /** Дней подряд с ranked-кахутом, заканчивая сегодня (или вчера, если сегодня ещё не играл). */
  async computeDailyStreak(userId: string): Promise<number> {
    const attempts = await SoloAttempt.find({ userId, attemptType: 'ranked' })
      .select('createdAt')
      .sort({ createdAt: -1 })
      .lean();
    if (attempts.length === 0) return 0;

    const dayKeys = new Set(
      attempts.map((a) => this.dayKey(a.createdAt as Date)).filter(Boolean) as string[]
    );

    let cursor = this.startOfUtcDay(new Date());
    // если сегодня ещё нет активности — стрик может «висеть» со вчера
    if (!dayKeys.has(this.dayKey(cursor))) {
      cursor = this.addDays(cursor, -1);
      if (!dayKeys.has(this.dayKey(cursor))) return 0;
    }

    let streak = 0;
    while (dayKeys.has(this.dayKey(cursor))) {
      streak += 1;
      cursor = this.addDays(cursor, -1);
    }
    return streak;
  }

  /** Изучено (mastered) / всего тем по всем предметам пользователя (main + профильная пара). */
  async computeTopicsStudied(userId: string): Promise<{ studied: number; total: number }> {
    const subjectIds = await getLearnerSubjectIds(userId);
    let studied = 0;
    let total = 0;
    for (const sid of subjectIds) {
      const { nodesTotal, nodesMastered } = await roadmapService.getProgressCounts(userId, sid);
      total += nodesTotal;
      studied += nodesMastered;
    }
    return { studied, total };
  }

  /**
   * Предметы: выбрано / всего.
   * Все main-предметы обязательны (всегда «выбраны»); профильных выбирается 2 (если пара выбрана).
   * total = все main + все профильные. hasProfileSubject — выбрана ли профильная пара.
   */
  async computeSubjectsSelected(
    userId: string
  ): Promise<{ selected: number; total: number; hasProfileSubject: boolean }> {
    const user = await User.findById(userId).select('profileSubjectPairId').lean();
    const hasProfileSubject = !!user?.profileSubjectPairId;

    const [mainTotal, profileTotal] = await Promise.all([
      Subject.countDocuments({ subjectKind: { $ne: 'profile' } }),
      Subject.countDocuments({ subjectKind: 'profile' })
    ]);

    const selected = mainTotal + (hasProfileSubject ? 2 : 0);
    const total = mainTotal + profileTotal;
    return { selected, total, hasProfileSubject };
  }

  // ==================== private ====================

  private startOfUtcDay(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  private dayKey(date: Date | undefined): string {
    if (!date) return '';
    return new Date(date).toISOString().slice(0, 10);
  }
}

export const profileStatsService = new ProfileStatsService();
