import { Types } from 'mongoose';
import { LiveMatchResult, SoloAttempt, Subject, User, UserRoadmapProgress } from '../models';
import { ITestHistory } from '../types';
import { AppError } from '../utils';
import { profileStatsService } from './profileStats.service';
import { scoreService } from './score.service';

export type AchievementStatus = 'locked' | 'in_progress' | 'unlocked';

/**
 * Статус достижения; id соответствует статичному каталогу клиента (edu-pwa
 * ACHIEVEMENT_CATALOG) — клиент держит мету (названия, описания, тиры), сервер
 * отдаёт только пользовательский статус. Достижения, для которых на сервере нет
 * событий (bookworm, fast, rising), в ответ не включаются — клиент их не рисует.
 */
export interface IAchievementState {
  id: string;
  status: AchievementStatus;
  /** 0–1, присутствует при in_progress */
  ratio?: number;
  /** ISO-дата события, давшего разблокировку (где она известна) */
  unlockedAt?: string;
  current?: number;
  target?: number;
}

export interface IAchievementsPayload {
  achievements: IAchievementState[];
  updatedAt: string;
}

/** Казахстан с 2024 — единая зона UTC+5; «часы» и «сутки» достижений считаем по ней */
const KZ_UTC_OFFSET_HOURS = 5;
/** «Ночная сова» — тест после 23:00, «ранняя пташка» — до 7:00 */
const NIGHT_OWL_FROM_HOUR = 23;
const EARLY_BIRD_BEFORE_HOUR = 7;
const SNIPER_STREAK = 5;
const SNIPER_MIN_PERCENT = 80;
const THIRST_TESTS_PER_DAY = 10;
const MARATHON_TESTS = 50;
const ERUDITE_SCORE = 10_000;
const RICH_SCORE = 100_000;
/** Сколько последних завершённых дневных пакетов учитывать для мест в лидерборде */
const LEADERBOARD_PACKS_SCAN_LIMIT = 365;
/** «Топ-10 дня» имеет смысл при >10 участниках пакета (иначе любой — в десятке) */
const LEADERBOARD_TOP10_MIN_PARTICIPANTS = 11;
/** «1 место» требует хотя бы одного соперника */
const LEADERBOARD_FIRST_MIN_PARTICIPANTS = 2;

/** «Идеальный балл по предмету» → тайтлы каталога, любой из которых засчитывается */
const SUBJECT_ACHIEVEMENTS: ReadonlyArray<{ id: string; titles: string[] }> = [
  { id: 'ach-math', titles: ['Математическая грамотность', 'Математика'] },
  { id: 'ach-history', titles: ['История Казахстана'] },
  { id: 'ach-biology', titles: ['Биология'] },
  { id: 'ach-chemistry', titles: ['Химия'] },
  { id: 'ach-reading', titles: ['Грамотность чтения'] },
  { id: 'ach-language', titles: ['Шетел тілі', 'Қазақ тілі', 'Орыс тілі'] }
];

function kzHour(date: Date): number {
  return (date.getUTCHours() + KZ_UTC_OFFSET_HOURS) % 24;
}

function kzDayKey(date: Date): string {
  return new Date(date.getTime() + KZ_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function iso(date: Date | undefined | null): string | undefined {
  return date ? new Date(date).toISOString() : undefined;
}

function fromCount(
  id: string,
  current: number,
  target: number,
  unlockedAt?: string
): IAchievementState {
  if (current >= target) return { id, status: 'unlocked', unlockedAt, current: target, target };
  if (current <= 0) return { id, status: 'locked', current: 0, target };
  return {
    id,
    status: 'in_progress',
    ratio: Math.min(1, Math.max(0, current / target)),
    current,
    target
  };
}

function fromBool(id: string, unlocked: boolean, unlockedAt?: string): IAchievementState {
  return unlocked ? { id, status: 'unlocked', unlockedAt } : { id, status: 'locked' };
}

interface HistoryEntry {
  subjectId?: Types.ObjectId;
  correct: number;
  total: number;
  scorePercent: number;
  createdAt: Date | null;
}

/**
 * ACHIEVEMENTS SERVICE
 * Пользовательский статус достижений, целиком выводимый из реальных данных:
 * testHistory, solo-кахуты (SoloAttempt), live-матчи (LiveMatchResult),
 * роадмап-прогресс и серверный счёт баллов (score.service).
 */
class AchievementsService {
  async getAchievements(userId: string): Promise<IAchievementsPayload> {
    // Точная проекция: testHistory с answers/aiFeedback может весить мегабайты
    const user = await User.findById(userId)
      .select('testHistory.subjectId testHistory.result testHistory.createdAt profileSubjectPairId createdAt')
      .lean();
    if (!user) throw AppError.notFound('User not found');

    const [profileStats, score, soloAttempts, liveResults, hasRoadmap] = await Promise.all([
      profileStatsService.getProfileStats(userId),
      scoreService.getMyScore(userId),
      SoloAttempt.find({ userId })
        .select('dailyPackId attemptType finalScore createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      LiveMatchResult.find({ userId })
        .select('rank participantsCount finishedAt')
        .sort({ finishedAt: 1 })
        .lean(),
      UserRoadmapProgress.exists({ userId }).then(doc => doc != null)
    ]);

    const history = this.normalizeHistory(user.testHistory ?? []);
    const achievements: IAchievementState[] = [];

    // ---------- start ----------
    achievements.push({ id: 'ach-start', status: 'unlocked', unlockedAt: iso(user.createdAt) });
    achievements.push(
      fromCount('ach-first-test', history.length, 1, iso(history[0]?.createdAt)),
      fromBool('ach-pick-subjects', !!user.profileSubjectPairId),
      fromBool('ach-first-roadmap', hasRoadmap)
    );

    // ---------- streak ----------
    achievements.push(
      fromCount('ach-streak-3', profileStats.dailyStreak, 3),
      fromCount('ach-streak-7', profileStats.dailyStreak, 7),
      fromCount('ach-streak-30', profileStats.dailyStreak, 30)
    );
    const nightOwl = history.find(h => h.createdAt && kzHour(h.createdAt) >= NIGHT_OWL_FROM_HOUR);
    const earlyBird = history.find(
      h => h.createdAt && kzHour(h.createdAt) < EARLY_BIRD_BEFORE_HOUR
    );
    achievements.push(
      fromBool('ach-night-owl', !!nightOwl, iso(nightOwl?.createdAt)),
      fromBool('ach-early-bird', !!earlyBird, iso(earlyBird?.createdAt))
    );

    // ---------- mastery ----------
    const perfect = history.find(h => h.total > 0 && h.correct === h.total);
    achievements.push(
      fromBool('ach-perfect', !!perfect, iso(perfect?.createdAt)),
      fromBool('ach-no-mistakes', !!perfect, iso(perfect?.createdAt)),
      this.computeSniper(history)
    );
    if (profileStats.topics.total > 0) {
      achievements.push(
        fromCount(
          'ach-half-way',
          profileStats.topics.studied,
          Math.ceil(profileStats.topics.total / 2)
        ),
        fromCount('ach-full-set', profileStats.topics.studied, profileStats.topics.total)
      );
    }
    achievements.push(fromCount('ach-erudite', score.total, ERUDITE_SCORE));

    // ---------- speed ----------
    achievements.push(
      fromCount('ach-marathon', history.length, MARATHON_TESTS),
      this.computeThirst(history)
    );

    // ---------- quiz / kahoot ----------
    const firstWin = liveResults.find(r => r.rank === 1 && r.participantsCount >= 2);
    const rankedAttempts = soloAttempts.filter(a => a.attemptType === 'ranked');
    achievements.push(
      fromBool('ach-kahoot-first', soloAttempts.length > 0 || liveResults.length > 0),
      fromBool('ach-kahoot-win', !!firstWin, iso(firstWin?.finishedAt)),
      fromBool(
        'ach-daily-pack',
        rankedAttempts.length > 0,
        // отсортировано по createdAt desc — последний элемент = первый пакет
        iso(rankedAttempts[rankedAttempts.length - 1]?.createdAt)
      )
    );
    const places = await this.computeDailyLeaderboardPlaces(userId, rankedAttempts);
    achievements.push(
      fromBool('ach-leaderboard-top10', places.top10, places.top10At),
      fromBool('ach-leaderboard-1', places.first, places.firstAt)
    );

    // ---------- subject (идеальный балл по конкретным предметам) ----------
    achievements.push(...(await this.computeSubjectPerfects(history)));

    // ---------- special ----------
    achievements.push(fromCount('ach-rich', score.total, RICH_SCORE));

    return { achievements, updatedAt: new Date().toISOString() };
  }

  // ==================== private ====================

  private normalizeHistory(entries: ITestHistory[]): HistoryEntry[] {
    return entries
      .map(t => ({
        subjectId: t.subjectId,
        correct: t.result?.correctAnswers ?? 0,
        total: t.result?.totalQuestions ?? 0,
        scorePercent: t.result?.scorePercent ?? 0,
        createdAt: t.createdAt ? new Date(t.createdAt) : null
      }))
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
  }

  /** «Снайпер»: 5 тестов подряд с результатом 80%+. Прогресс — лучшая серия. */
  private computeSniper(history: HistoryEntry[]): IAchievementState {
    let run = 0;
    let bestRun = 0;
    let unlockedAt: string | undefined;
    for (const h of history) {
      run = h.scorePercent >= SNIPER_MIN_PERCENT ? run + 1 : 0;
      if (run > bestRun) bestRun = run;
      if (run === SNIPER_STREAK && !unlockedAt) unlockedAt = iso(h.createdAt);
    }
    return fromCount('ach-sniper', bestRun, SNIPER_STREAK, unlockedAt);
  }

  /** «Жажда знаний»: 10 тестов за один день (по KZ-суткам). Прогресс — лучший день. */
  private computeThirst(history: HistoryEntry[]): IAchievementState {
    const perDay = new Map<string, number>();
    let best = 0;
    let unlockedAt: string | undefined;
    for (const h of history) {
      if (!h.createdAt) continue;
      const key = kzDayKey(h.createdAt);
      const count = (perDay.get(key) ?? 0) + 1;
      perDay.set(key, count);
      if (count > best) best = count;
      if (count === THIRST_TESTS_PER_DAY && !unlockedAt) unlockedAt = iso(h.createdAt);
    }
    return fromCount('ach-thirst', best, THIRST_TESTS_PER_DAY, unlockedAt);
  }

  /**
   * Места в дневном лидерборде — одна агрегация по завершённым пакетам
   * пользователя (день пакета прошёл, UTC — как dateKey в buildDailyPackId),
   * чтобы место было финальным и достижение не «отзывалось». Ранжирование как
   * в solo-лидерборде: finalScore desc, при равенстве раньше отправивший выше.
   * Пороги: «топ-10» — при >10 участниках (победа пакета засчитывает и его),
   * «1 место» — при ≥2. unlockedAt — самый ранний квалифицирующий пакет.
   */
  private async computeDailyLeaderboardPlaces(
    userId: string,
    rankedAttempts: Array<{ dailyPackId: string; createdAt?: Date }>
  ): Promise<{ top10: boolean; top10At?: string; first: boolean; firstAt?: string }> {
    const today = utcDayKey(new Date());
    // rankedAttempts отсортированы по createdAt desc — берём последние N завершённых
    const finished = rankedAttempts
      .filter(a => a.createdAt && utcDayKey(new Date(a.createdAt)) < today)
      .slice(0, LEADERBOARD_PACKS_SCAN_LIMIT)
      .reverse(); // хронологически: unlockedAt = первый квалифицирующий пакет
    if (finished.length === 0) return { top10: false, first: false };

    const packs = await SoloAttempt.aggregate<{
      _id: string;
      total: number;
      top: Types.ObjectId[];
    }>([
      { $match: { dailyPackId: { $in: finished.map(a => a.dailyPackId) }, attemptType: 'ranked' } },
      { $sort: { finalScore: -1, createdAt: 1 } },
      { $group: { _id: '$dailyPackId', total: { $sum: 1 }, top: { $push: '$userId' } } },
      { $project: { total: 1, top: { $slice: ['$top', 10] } } }
    ]);
    const byPack = new Map(packs.map(p => [p._id, p]));

    let top10 = false;
    let top10At: string | undefined;
    let first = false;
    let firstAt: string | undefined;
    for (const attempt of finished) {
      const pack = byPack.get(attempt.dailyPackId);
      if (!pack) continue;
      const idx = pack.top.findIndex(u => String(u) === userId);
      const wonPack = idx === 0 && pack.total >= LEADERBOARD_FIRST_MIN_PARTICIPANTS;
      const inTop10 =
        (idx >= 0 && pack.total >= LEADERBOARD_TOP10_MIN_PARTICIPANTS) || wonPack;
      if (inTop10 && !top10) {
        top10 = true;
        top10At = iso(attempt.createdAt);
      }
      if (wonPack && !first) {
        first = true;
        firstAt = iso(attempt.createdAt);
      }
      if (top10 && first) break;
    }
    return { top10, top10At, first, firstAt };
  }

  /** Идеальные баллы по конкретным предметам — по тайтлам каталога. */
  private async computeSubjectPerfects(history: HistoryEntry[]): Promise<IAchievementState[]> {
    const perfectBySubject = new Map<string, Date | null>();
    for (const h of history) {
      if (h.total > 0 && h.correct === h.total && h.subjectId) {
        const key = String(h.subjectId);
        if (!perfectBySubject.has(key)) perfectBySubject.set(key, h.createdAt);
      }
    }

    const perfectTitleDates = new Map<string, Date | null>();
    if (perfectBySubject.size > 0) {
      const subjects = await Subject.find({
        _id: { $in: [...perfectBySubject.keys()].map(id => new Types.ObjectId(id)) }
      })
        .select('title')
        .lean();
      for (const s of subjects) {
        perfectTitleDates.set(s.title, perfectBySubject.get(String(s._id)) ?? null);
      }
    }

    return SUBJECT_ACHIEVEMENTS.map(def => {
      const hitTitle = def.titles.find(t => perfectTitleDates.has(t));
      return fromBool(
        def.id,
        hitTitle != null,
        hitTitle != null ? iso(perfectTitleDates.get(hitTitle)) : undefined
      );
    });
  }
}

export const achievementsService = new AchievementsService();
