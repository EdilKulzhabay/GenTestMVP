/**
 * API Constants
 * Версия API, пути маршрутов и общие константы
 */

export const API_VERSION = 'v1';
export const API_BASE_PATH = `/api/${API_VERSION}`;

/** Пути маршрутов API */
export const ROUTES = {
  AUTH: '/auth',
  SUBJECTS: '/subjects',
  TESTS: '/tests',
  USERS: '/users',
  ROADMAPS: '/roadmaps',
  KTP: '/ktp',
  TRIAL: '/trial',
  PROFILE_SUBJECT_PAIRS: '/profile-subject-pairs',
  HEALTH: '/health',
  API_DOCS: '/api-docs'
} as const;

/** Полные пути эндпоинтов */
export const API_PATHS = {
  AUTH: {
    REGISTER: `${ROUTES.AUTH}/register`,
    VERIFY_EMAIL: `${ROUTES.AUTH}/verify-email`,
    LOGIN: `${ROUTES.AUTH}/login`,
    ME: `${ROUTES.AUTH}/me`
  },
  SUBJECTS: {
    BASE: ROUTES.SUBJECTS,
    BY_ID: `${ROUTES.SUBJECTS}/:id`,
    BOOKS: `${ROUTES.SUBJECTS}/:id/books`,
    CHAPTERS: `${ROUTES.SUBJECTS}/books/:bookId/chapters`,
    TOPICS: `${ROUTES.SUBJECTS}/chapters/:chapterId/topics`,
    PARAGRAPHS: `${ROUTES.SUBJECTS}/topics/:topicId/paragraphs`
  },
  TESTS: {
    GENERATE: `${ROUTES.TESTS}/generate`,
    GENERATE_GUEST: `${ROUTES.TESTS}/generate-guest`,
    SUBMIT: `${ROUTES.TESTS}/submit`,
    SUBMIT_GUEST: `${ROUTES.TESTS}/submit-guest`,
    BY_ID: `${ROUTES.TESTS}/:id`
  },
  USERS: {
    ME: `${ROUTES.USERS}/me`,
    ME_PROFILE_STATS: `${ROUTES.USERS}/me/profile-stats`,
    ME_ENT_PROGRESS: `${ROUTES.USERS}/me/ent-progress`,
    ME_ACHIEVEMENTS: `${ROUTES.USERS}/me/achievements`,
    ME_SCORE: `${ROUTES.USERS}/me/score`,
    ME_TESTS: `${ROUTES.USERS}/me/tests`,
    ME_STATS: `${ROUTES.USERS}/me/stats`,
    ME_TEST_DETAILS: `${ROUTES.USERS}/me/tests/:testHistoryId`,
    ME_TEST_RESULT: `${ROUTES.USERS}/me/tests/:testHistoryId/result`,
    ME_TEST_BREAKDOWN: `${ROUTES.USERS}/me/tests/:testHistoryId/breakdown`,
    ME_TEST_AI: `${ROUTES.USERS}/me/tests/:testHistoryId/ai-explanation`
  },
  ROADMAPS: {
    NEXT: `${ROUTES.ROADMAPS}/next`,
    HOME: `${ROUTES.ROADMAPS}/home`
  },
  AUTH_EXTRA: {
    LOGOUT: `${ROUTES.AUTH}/logout`
  }
} as const;
