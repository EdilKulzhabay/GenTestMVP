import { Types } from 'mongoose';

// ==================== ENUMS ====================

export enum UserRole {
  USER = 'user',
  /** Учитель: декомпозиция книг + маппинг на КТП. Эталон КТП и управление — за ADMIN. */
  TEACHER = 'teacher',
  ADMIN = 'admin',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

// ==================== CONTENT STRUCTURE ====================

export interface IMetadata {
  keywords?: string[];
  difficulty?: Difficulty;
  source?: string;
}

export interface IContent {
  text: string;
  pages: number[];
  metadata: IMetadata;
}

export interface IParagraph {
  _id?: Types.ObjectId;
  order: number;
  content: IContent;
}

export type AssetKind = 'table' | 'image' | 'formula' | 'problem';

export interface IAssetEnrichment {
  version: number;
  model?: string;
  generatedAt: Date;
  status: string;
}

export interface IContentAsset {
  _id?: Types.ObjectId;
  kind: AssetKind;
  caption?: string;
  pages?: number[];
  enrichment?: IAssetEnrichment;
  embedding?: number[];
  columns?: string[];
  rows?: string[][];
  llmSummary?: string;
  url?: string;
  webpUrl?: string;
  alt?: string;
  width?: number;
  height?: number;
  pixelDependent?: boolean;
  llmDescription?: string;
  ocrText?: string;
  latex?: string;
  display?: boolean;
  imageUrl?: string;
  plainText?: string;
  promptMarkdown?: string;
  answer?: string;
  solutionMarkdown?: string;
}

export type INewContentAsset = Omit<IContentAsset, '_id' | 'enrichment' | 'embedding'>;

export interface ITopic {
  _id?: Types.ObjectId;
  title: string;
  /** Порядок темы в главе (для drag-and-drop сортировки; необязателен для старых данных). */
  order?: number;
  /** Темы КТП (KtpCatalog.topics._id), на которые замаплена эта тема книги. M:N. */
  ktpTopicIds?: Types.ObjectId[];
  paragraphs: IParagraph[];
  /** Переиспользуемые ассеты темы (таблицы/изображения/формулы/задачи). */
  assets?: IContentAsset[];
}

export interface IChapter {
  _id?: Types.ObjectId;
  title: string;
  order: number;
  topics: ITopic[];
}

export interface IBook {
  _id?: Types.ObjectId;
  title: string;
  author?: string;
  /** Язык текста книги (для ИИ: тесты и roadmap на этом языке) */
  contentLanguage?: string;
  chapters: IChapter[];
}

/** Предмет: основной (общий) или профильный (для пары ЕНТ) */
export type SubjectKind = 'main' | 'profile';

export interface ISubject {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
  /** По умолчанию main; profile — только для пар профильных предметов */
  subjectKind?: SubjectKind;
  books: IBook[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== USER & AUTH ====================

export interface IUserAnswer {
  question: string;
  selectedOption: string;
  isCorrect: boolean;
}

export interface ITestResult {
  totalQuestions: number;
  correctAnswers: number;
  scorePercent: number;
}

export interface IMistake {
  question: string;
  explanation: string;
  /** Источник в учебнике. Может отсутствовать — тогда показываем "что повторить" текстом */
  whereToRead?: {
    bookTitle: string;
    chapterTitle: string;
    pages: number[];
    topicTitle?: string;
  };
}

export interface IAIFeedback {
  summary: string;
  mistakes: IMistake[];
}

export interface ITestHistory {
  _id?: Types.ObjectId;
  /** Ссылка на исходный (кэшируемый, неизменяемый) тест — для ленивого разбора и AI-объяснения */
  testId?: Types.ObjectId;
  subjectId: Types.ObjectId;
  bookId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  generatedQuestionsHash: string[]; // Хеши вопросов для избежания повторений
  answers: IUserAnswer[];
  result: ITestResult;
  /** Заполняется лениво при первом запросе GET /users/me/tests/:id/ai-explanation */
  aiFeedback?: IAIFeedback;
  createdAt?: Date;
}

export interface IUser {
  _id?: Types.ObjectId;
  fullName: string;
  userName?: string;
  email?: string;
  phone?: string;
  password?: string;
  googleId?: string;
  /** URL аватарки пользователя (загруженной или внешней). Денормализуется в лидерборды/кахут. */
  avatarUrl?: string;
  role: UserRole;
  /** Выбранная пара профильных предметов */
  profileSubjectPairId?: Types.ObjectId;
  testHistory: ITestHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== TEST & QUESTIONS ====================

export interface IRelatedContent {
  chapterId?: Types.ObjectId;
  topicId?: Types.ObjectId;
  pages: number[];
  /** Временное поле от LLM до resolveTopicTitleToId */
  topicTitle?: string;
  /** Ссылки на ContentAsset (Topic.assets._id), которые цитирует вопрос. */
  assetIds?: string[];
}

/** Типы заданий в духе форматов ЕНТ (Казахстан) */
export type EntQuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'matching_single'
  | 'matching_multiple'
  | 'short_answer'
  | 'text_input';

export interface IMatchingItem {
  id: string;
  text: string;
}

export interface IQuestion {
  questionType?: EntQuestionType;
  questionText: string;
  aiExplanation: string;
  relatedContent: IRelatedContent;
  /** single_choice: 4–5 вариантов */
  options?: string[];
  correctOption?: string;
  /** multiple_choice: подмножество options */
  correctOptions?: string[];
  matchingLeft?: IMatchingItem[];
  matchingRight?: IMatchingItem[];
  /** matching_single: leftId -> rightId; matching_multiple: leftId -> rightId[] */
  correctMatching?: Record<string, string | string[]>;
  acceptableAnswers?: string[];
  acceptableKeywords?: string[];
  referenceAnswer?: string;
  /** Банк (Фаза 2/3): из какого item банка собран вопрос (для статистики/SR) */
  questionItemId?: Types.ObjectId;
  /** Банк: KC (подтемы), которые проверяет вопрос — для пер-KC mastery */
  knowledgeComponentIds?: string[];
}

export interface ITest {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  bookId: Types.ObjectId;
  chapterId?: Types.ObjectId;
  questions: IQuestion[];
  sourceContentHash: string; // Для кеширования
  testProfile?: TestGenerationProfile;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== QUESTION BANK (Фаза 2) ====================

export type QuestionItemStatus = 'draft' | 'active' | 'retired';

/** Происхождение вопроса (для грунтинга/аудита/анти-галлюцинаций). */
export interface IQuestionSourceRef {
  bookId?: Types.ObjectId;
  chapterId?: Types.ObjectId;
  topicId?: Types.ObjectId;
  pages?: number[];
}

/**
 * Элемент банка вопросов — переиспользуемый вопрос, привязанный к узлу знания (теме КТП)
 * и компонентам знания (KC). Тест-инстанс = выборка таких item'ов (а не встроенные копии).
 */
export interface IQuestionItem {
  _id?: Types.ObjectId;
  subjectId: Types.ObjectId;
  /** Стабильный id темы КТП (ktpTopicId) — узел знания */
  knowledgeNodeId: string;
  /** KC (подтемы), которые проверяет вопрос */
  knowledgeComponentIds: string[];
  /** Содержимое вопроса (формат ЕНТ, переиспользуем IQuestion) */
  question: IQuestion;
  /** Сложность 1..5 */
  difficulty: number;
  status: QuestionItemStatus;
  sourceRefs: IQuestionSourceRef[];
  provenance?: {
    model?: string;
    promptVersion?: string;
    generatedAt?: Date;
    verified?: boolean;
    verifyReason?: string;
  };
  /** Хэш нормализованного текста — дедуп в пределах узла */
  contentHash: string;
  qualityStats?: { timesUsed: number; timesCorrect: number };
  createdAt?: Date;
  updatedAt?: Date;
}

/** Пер-KC mastery (Фаза 3): тонкий сигнал освоения по компонентам знания. */
export interface IUserKcComponentProgress {
  kcId: string;
  bestScore: number; // 0..100
  attempts: number;
  mastered: boolean;
  lastAttemptAt?: Date;
}

export interface IUserKcMastery {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  subjectId: Types.ObjectId;
  components: IUserKcComponentProgress[];
  /** Недавно показанные item'ы (для spaced repetition), ограниченный список */
  recentItemIds: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

// ==================== DTO (Data Transfer Objects) ====================

// Auth DTOs
export interface IRegisterDTO {
  fullName: string;
  phone: string;
  email: string;
  userName: string;
  password: string;
}

export interface IVerifyPhoneDTO {
  phone: string;
  code: string;
}

export interface ILoginDTO {
  userName: string;
  password: string;
}

export interface IAuthResponse {
  token: string;
  user: {
    id: string;
    fullName: string;
    userName?: string;
    email?: string;
    avatarUrl?: string;
    role: UserRole;
  };
}

// Subject DTOs
export interface ICreateSubjectDTO {
  title: string;
  description?: string;
  subjectKind?: SubjectKind;
}

export interface IAddBookDTO {
  title: string;
  author?: string;
  contentLanguage?: string;
}

export interface IAddChapterDTO {
  title: string;
  order: number;
}

export interface IAddTopicDTO {
  title: string;
}

export interface IAddParagraphDTO {
  order: number;
  content: IContent;
}

/** Режим генерации: обычный (10 MCQ) или профильный как ЕНТ (смешанные типы) */
export type TestGenerationProfile = 'regular' | 'ent';

// Test Generation DTOs
export interface IGenerateTestDTO {
  subjectId: string;
  bookId: string;
  chapterId?: string;
  fullBook?: boolean;
  /** Тема-фокус для генерации (из roadmap-узла). AI сфокусирует вопросы на этой теме */
  topicFocus?: string;
  /** Узел карты знаний — сервер проверяет, не превышен ли лимит неудачных попыток */
  roadmapNodeId?: string;
  /** По умолчанию ent — как раньше для API без поля */
  testProfile?: TestGenerationProfile;
  /** Формат ЕНТ: 10, 20, 40… (кратно 10, макс. 120). Пробник задаёт 20/10/10/40/40. */
  questionCount?: number;
  /**
   * Пробник: запрашиваем именно тест по выбранной книге/главе (с relatedContent тем),
   * чтобы submit мог посчитать trialTopicMastery и /trial/apply-results корректно открыл узлы.
   */
  forTrial?: boolean;
}

export interface ISubmitTestDTO {
  testId: string;
  answers: {
    questionText: string;
    selectedOption: string;
  }[];
  /** Опционально: связать сессию теста с узлом roadmap (после submit обновится прогресс) */
  roadmapNodeId?: string;
  roadmapSessionId?: string;
  /** Пробник: в ответе придут trialTopicMastery (темы ≥ порога) для обновления карты после всех шагов */
  forTrial?: boolean;
}

// ==================== AI SERVICE TYPES ====================

export interface IGeneratedTest {
  questions: IQuestion[];
  sourceContentHash: string;
}

/** Кандидат-ассет для промпта генератора (LLM-B): id + kind + краткая метка. */
export interface IAssetCandidate {
  assetId: string;
  kind: AssetKind;
  topicTitle?: string;
  label: string;
}

export interface IContentForAI {
  text: string;
  metadata: {
    subjectTitle: string;
    bookTitle: string;
    chapterTitle?: string;
    topics: string[];
    bookAuthor?: string;
    contentLanguage?: string;
    /** Заголовки глав по порядку (оглавление) */
    chapterTitles?: string[];
    /** Узел roadmap — AI фокусирует вопросы на этой теме */
    topicFocus?: string;
  };
  /** Ассеты in-scope тем — генератор может сослаться на них через relatedContent.assetIds. */
  assetCandidates?: IAssetCandidate[];
}

// ==================== UTILITY TYPES ====================

export interface IJWTPayload {
  userId: string;
  role: UserRole;
}

export interface IErrorResponse {
  success: false;
  message: string;
  errors?: any[];
}

export interface ISuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}
