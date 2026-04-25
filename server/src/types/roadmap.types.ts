import { Types } from 'mongoose';

export type RoadmapAvailability = 'locked' | 'available';
export type RoadmapProgressStatus = 'not_started' | 'in_progress' | 'mastered';

export interface ICanonicalRoadmapNode {
  nodeId: string;
  title: string;
  /** Подробное описание темы узла для UI и методистов */
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
}

/** Откуда сгенерирована статичная карта (книга/глава) — для UI и трассировки */
export interface ICanonicalRoadmapSourceMeta {
  bookId?: string;
  bookTitle?: string;
  bookAuthor?: string;
  chapterTitle?: string;
  fullBook?: boolean;
  contentLanguage?: string;
}

export interface ICanonicalRoadmap {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  version: number;
  /** О чём карта в целом: цели, охват, связь с учебником */
  description?: string;
  nodes: ICanonicalRoadmapNode[];
  sourceMeta?: ICanonicalRoadmapSourceMeta;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Прогресс по узлу в БД (для расчёта освоения и «урок прочитан») */
export interface IUserRoadmapNodeProgress {
  nodeId: string;
  /** Освоено: обычный тест ≥70% (best) или пробный ≥80% */
  mastered: boolean;
  /** Лучший балл по узлу (0..100), служебное поле */
  bestScore: number;
  /** Сколько раз подряд сдали тест по узлу карты < ROADMAP_KNOWLEDGE_TEST_PASS_PERCENT; сбрасывается при успехе или «Освоил» */
  lowScoreFailCount?: number;
  /** Отметка «урок прочитан» (страница теории по узлу) */
  lessonReadAt?: Date;
}

/** Видео к уроку узла (в canonical metadata.lesson или в ответе API) */
export interface IRoadmapLessonVideo {
  url: string;
  durationSec?: number;
  posterUrl?: string;
}

/**
 * Контент урока в canonical-узле: metadata.lesson
 * summary кэшируется после генерации ИИ.
 */
export interface IRoadmapLessonMeta {
  lessonId?: string;
  summary?: string;
  content?: string;
  /** Если не указано — считаем markdown */
  contentFormat?: 'markdown' | 'html';
  video?: IRoadmapLessonVideo | null;
}

/** Ответ GET …/lesson — один текстовый формат на всё API (summary + content) */
export interface IRoadmapLessonResponse {
  nodeId: string;
  lessonId: string;
  title: string;
  summary: string;
  content: string;
  /** Единый формат текста для summary и content */
  contentFormat: 'markdown' | 'html';
  /** @deprecated используйте contentFormat */
  textFormat?: 'markdown' | 'html';
  video: IRoadmapLessonVideo | null;
  readCompletedAt: string | null;
}

/** Элемент списка предметов для bottom sheet (согласован с GET /roadmaps/personal) */
export interface IRoadmapPickerSubjectItem {
  subjectId: string;
  title: string;
  /** Вторая строка карточки (например описание предмета) */
  subtitle?: string;
  /** Есть canonical roadmap в системе */
  roadmapConfigured: boolean;
  /** Можно открыть personal roadmap (тоже true только при roadmapConfigured) */
  isRoadmapAvailable: boolean;
  /** 0..100, доля пройденных (mastered) узлов */
  progressPercent: number;
  /** Агрегат по узлам personal для карточки (не путать с progressStatus узла в /personal) */
  progressStatus: 'not_started' | 'in_progress' | 'completed';
  nodesTotal: number;
  nodesMastered: number;
}

export interface IUserRoadmapProgress {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  subjectId: Types.ObjectId;
  canonicalVersion: number;
  nodes: IUserRoadmapNodeProgress[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRoadmapAttempt {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  sessionId: string;
  subjectId: Types.ObjectId;
  nodeId: string;
  scorePercent: number;
  submittedAt: Date;
  createdAt?: Date;
}

export interface IPersonalRoadmapNodeView {
  nodeId: string;
  title: string;
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
  availability: RoadmapAvailability;
  /** Освоено (true/false) — единственное отличие персональной карты от canonical */
  mastered: boolean;
  /** Ссылка на страницу главы (относительный путь приложения) */
  chapterUrl?: string;
  bookId?: string;
  chapterId?: string;
  /** Тема (узел карты = тема, не глава) */
  topicId?: string;
  /** Id сохранённого теста по главе, если есть */
  testId?: string;
  isRecommended: boolean;
  recommendedPriority: number;
  recommendedReason: string;
  /** Сколько неудачных попыток (балл < 80%) по тесту этого узла */
  lowScoreFailCount: number;
  /** Нельзя начать тест с карты, пока не пройдёте материал и не нажмёте «Освоил» */
  knowledgeMapTestBlocked: boolean;
  /** Краткая ИИ-подсказка по узлу (если запрошен слой AI) */
  aiHint?: string;
}

export interface INextRecommended {
  nodeId: string;
  reason: string;
  priority: number;
}
