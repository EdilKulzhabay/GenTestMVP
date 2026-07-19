import { ProfileSubjectPair, SoloAttempt, Subject, User } from '../models';
import { AppError } from '../utils';
import { ENT_MAIN_BLOCKS, ENT_MAX_SCORE, ENT_PROFILE_BLOCK } from '../config/entScale';

export interface IEntSubjectForecast {
  /** null — main-предмет блока отсутствует в каталоге */
  subjectId: string | null;
  title: string;
  kind: 'main' | 'profile';
  maxPoints: number;
  predictedPoints: number;
  /** null — по предмету ещё нет отвеченных вопросов */
  accuracyPercent: number | null;
  questionsAnswered: number;
}

export interface IEntProgress {
  /** Прогноз в шкале ЕНТ (0..max) */
  score: number;
  max: number;
  /** Дата последнего результата, повлиявшего на прогноз (ISO) */
  updatedAt: string;
  hasProfilePair: boolean;
  /** Разбивка по блокам ЕНТ: 3 обязательных + до 2 профильных из пары */
  subjects: IEntSubjectForecast[];
}

interface SubjectAccuracy {
  correct: number;
  answered: number;
  lastAt: Date | null;
}

/**
 * ENT PROGRESS SERVICE
 * Прогноз балла ЕНТ: аккуратность по предмету (Σ правильных / Σ отвеченных из
 * testHistory + solo-кахутов) проецируется на вес блока. Блоки без данных дают 0,
 * шкала всегда полная (ENT_MAX_SCORE) — прогноз честно растёт с покрытием.
 */
class EntProgressService {
  async getEntProgress(userId: string): Promise<IEntProgress> {
    const user = await User.findById(userId)
      .select('testHistory profileSubjectPairId createdAt')
      .lean();
    if (!user) throw AppError.notFound('User not found');

    const accuracyBySubject = new Map<string, SubjectAccuracy>();
    const bump = (subjectId: unknown, correct: number, answered: number, at?: Date): void => {
      if (!subjectId || answered <= 0) return;
      const key = String(subjectId);
      const entry = accuracyBySubject.get(key) ?? { correct: 0, answered: 0, lastAt: null };
      entry.correct += correct;
      entry.answered += answered;
      const when = at ? new Date(at) : null;
      if (when && (!entry.lastAt || when > entry.lastAt)) entry.lastAt = when;
      accuracyBySubject.set(key, entry);
    };

    for (const t of user.testHistory ?? []) {
      bump(t.subjectId, t.result?.correctAnswers ?? 0, t.result?.totalQuestions ?? 0, t.createdAt);
    }

    const soloAttempts = await SoloAttempt.find({ userId })
      .select('subjectId correctCount answeredCount createdAt')
      .lean();
    for (const a of soloAttempts) {
      bump(a.subjectId, a.correctCount ?? 0, a.answeredCount ?? 0, a.createdAt as Date | undefined);
    }

    // Обязательные блоки — по точному тайтлу каталога (как в trial.service)
    const mainSubjects = await Subject.find({
      subjectKind: 'main',
      title: { $in: ENT_MAIN_BLOCKS.map(b => b.title) }
    })
      .select('_id title')
      .lean();
    const mainByTitle = new Map(mainSubjects.map(s => [s.title, s]));

    const subjects: IEntSubjectForecast[] = ENT_MAIN_BLOCKS.map(block => {
      const subj = mainByTitle.get(block.title);
      return this.buildForecast(
        subj?._id ? String(subj._id) : null,
        block.title,
        'main',
        block.points,
        accuracyBySubject
      );
    });

    let hasProfilePair = false;
    if (user.profileSubjectPairId) {
      const pair = await ProfileSubjectPair.findById(user.profileSubjectPairId).lean();
      if (pair) {
        hasProfilePair = true;
        const pairSubjects = await Subject.find({
          _id: { $in: [pair.subject1Id, pair.subject2Id] }
        })
          .select('_id title')
          .lean();
        const pairById = new Map(pairSubjects.map(s => [String(s._id), s]));
        for (const id of [pair.subject1Id, pair.subject2Id]) {
          const subj = pairById.get(String(id));
          if (!subj) continue;
          subjects.push(
            this.buildForecast(
              String(subj._id),
              subj.title,
              'profile',
              ENT_PROFILE_BLOCK.points,
              accuracyBySubject
            )
          );
        }
      }
    }

    const score = subjects.reduce((sum, s) => sum + s.predictedPoints, 0);

    let lastAt: Date | null = null;
    for (const s of subjects) {
      const entry = s.subjectId ? accuracyBySubject.get(s.subjectId) : undefined;
      if (entry?.lastAt && (!lastAt || entry.lastAt > lastAt)) lastAt = entry.lastAt;
    }
    const updatedAt = (lastAt ?? user.createdAt ?? new Date()).toISOString();

    return { score, max: ENT_MAX_SCORE, updatedAt, hasProfilePair, subjects };
  }

  // ==================== private ====================

  private buildForecast(
    subjectId: string | null,
    title: string,
    kind: 'main' | 'profile',
    maxPoints: number,
    accuracyBySubject: Map<string, SubjectAccuracy>
  ): IEntSubjectForecast {
    const entry = subjectId ? accuracyBySubject.get(subjectId) : undefined;
    if (!entry || entry.answered === 0) {
      return {
        subjectId,
        title,
        kind,
        maxPoints,
        predictedPoints: 0,
        accuracyPercent: null,
        questionsAnswered: 0
      };
    }
    const accuracy = entry.correct / entry.answered;
    return {
      subjectId,
      title,
      kind,
      maxPoints,
      predictedPoints: Math.round(accuracy * maxPoints),
      accuracyPercent: Math.round(accuracy * 100),
      questionsAnswered: entry.answered
    };
  }
}

export const entProgressService = new EntProgressService();
