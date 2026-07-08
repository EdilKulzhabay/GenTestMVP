import { Types } from 'mongoose';
import { IContentAsset } from './index';

export type RoadmapAvailability = 'locked' | 'available';
export type RoadmapProgressStatus = 'not_started' | 'in_progress' | 'mastered';

export type KnowledgeComponentStatus = 'proposed' | 'confirmed';

/**
 * Компонент знания (подтема) — атомарная учебно-проверяемая единица внутри темы КТП.
 * _id стабилен: на него ссылаются вопросы банка (QuestionItem) и пер-KC mastery.
 * Жизненный цикл: AI предлагает (proposed) → куратор подтверждает (confirmed).
 */
export interface IKnowledgeComponent {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  status: KnowledgeComponentStatus;
}

/** Тема КТП (встроенная в KtpCatalog). _id — стабильный id для маппинга и nodeId роудмапа. */
export interface IKtpTopic {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  /** Код темы от центра тестирования (отображение/импорт, НЕ стабильный id) */
  code?: string;
  /** Явные пререквизиты (задел; по умолчанию линейный порядок по order) */
  prerequisiteKtpTopicIds?: Types.ObjectId[];
  /** Компоненты знания (подтемы) этой темы — атом для тестов и mastery (Фаза 1+). */
  knowledgeComponents?: IKnowledgeComponent[];
}

/** Справочник КТП по предмету: канонический упорядоченный список тем. */
export interface IKtpCatalog {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  /** Год актуальности справочника ЦТ (меняется ежегодно) */
  year?: number;
  version: number;
  topics: IKtpTopic[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICanonicalRoadmapNode {
  nodeId: string;
  title: string;
  /** Подробное описание темы узла для UI и методистов */
  description?: string;
  prerequisites: string[];
  metadata?: Record<string, unknown>;
}

/** Источник контента узла КТП: тема книги (книга/глава/тема). */
export interface ICanonicalNodeSource {
  bookId: string;
  chapterId: string;
  topicId: string;
  title?: string;
}

/** Урок внутри узла КТП. Сырой режим: 1 урок = 1 источник; консолидированный: 1..N секций. */
export interface ICanonicalNodeLesson {
  lessonId: string;
  title: string;
  order: number;
  content: string;
  contentFormat: 'markdown' | 'html';
  summary?: string;
  video?: IRoadmapLessonVideo | null;
  source?: ICanonicalNodeSource;
  /** Компоненты знания (KC), которые покрывает эта секция урока (Фаза 1+). */
  knowledgeComponentIds?: string[];
}

/** Кэш AI-консолидированного контента урока узла КТП (коллекция node_lesson_content). */
export interface INodeLessonContent {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  ktpTopicId: Types.ObjectId;
  /** Хэш текстов замапленных источников: при изменении — кэш пересобирается */
  sourceHash: string;
  lessons: ICanonicalNodeLesson[];
  generatedBy: 'ai' | 'manual';
  createdAt?: Date;
  updatedAt?: Date;
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

/** Прогресс по отдельному уроку внутри узла (для последовательного гейтинга) */
export interface IUserLessonProgress {
  lessonId: string;
  readAt?: Date;
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
  /** Прогресс по урокам узла (узел = тема КТП, внутри упорядоченные уроки) */
  lessons?: IUserLessonProgress[];
  /** Отметка «материал узла пройден» — ставится при завершении ПОСЛЕДНЕГО урока */
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

/** Источник урока для UI («Источники»): книга/класс + тема книги */
export interface IRoadmapLessonSource {
  bookTitle?: string;
  topicTitle?: string;
}

/** Элемент списка уроков узла (для степпера с последовательным гейтингом) */
export interface IRoadmapLessonListItem {
  lessonId: string;
  title: string;
  order: number;
  completed: boolean;
  /** Заблокирован: предыдущий по порядку урок не завершён */
  locked: boolean;
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
  /** Уроки узла (тема КТП может содержать несколько уроков из разных книг/классов) */
  lessons: IRoadmapLessonListItem[];
  lessonsTotal: number;
  /** Позиция текущего урока (0-based) */
  lessonIndex: number;
  nextLessonId: string | null;
  prevLessonId: string | null;
  /** Текущий урок заблокирован (предыдущий не завершён) */
  locked: boolean;
  /** Источники узла (темы книг разных классов) — для трассируемости консолидированного урока */
  sources: IRoadmapLessonSource[];
  /** Resolved-сайдкар: ассеты source-тем узла (payload для токенов ```asset id=```). */
  assets?: IContentAsset[];
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
  /** Лучший балл по узлу (0..100) — для прогресса и тем «на повторение» */
  bestScore: number;
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
  /** Заголовок темы узла — чтобы клиент показал название без доп. запроса */
  topicTitle?: string;
  /** Название предмета этого узла */
  subjectName?: string;
}
