import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { subjectController } from '../controllers';
import { authenticate, isAdmin, asyncHandler, validate } from '../middlewares';

/**
 * SUBJECT ROUTES
 * Маршруты для управления образовательным контентом
 */

const router = Router();

/**
 * Публичные маршруты (для гостевого режима)
 */
router.get(
  '/',
  asyncHandler(subjectController.getAllSubjects.bind(subjectController))
);

router.get(
  '/:id',
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid subject ID')
  ],
  validate,
  asyncHandler(subjectController.getSubjectById.bind(subjectController))
);

// Защищённые маршруты
router.use(authenticate);

/**
 * @route   POST /subjects/import
 * @desc    Импорт предмета целиком (с книгами, главами, темами, параграфами)
 * @access  Admin only
 */
router.post(
  '/import',
  isAdmin,
  [
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title is required')
  ],
  validate,
  asyncHandler(subjectController.importSubject.bind(subjectController))
);

/**
 * @route   POST /subjects
 * @desc    Создать новый предмет
 * @access  Admin only
 */
router.post(
  '/',
  isAdmin,
  [
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
  ],
  validate,
  asyncHandler(subjectController.createSubject.bind(subjectController))
);

/**
 * @route   POST /subjects/:id/books
 * @desc    Добавить книгу к предмету
 * @access  Admin only
 */
router.post(
  '/:id/books',
  isAdmin,
  [
    param('id')
      .isMongoId()
      .withMessage('Invalid subject ID'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 300 })
      .withMessage('Title must be between 1 and 300 characters'),
    body('author')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Author must be less than 200 characters')
  ],
  validate,
  asyncHandler(subjectController.addBook.bind(subjectController))
);

/**
 * @route   POST /subjects/books/:bookId/chapters
 * @desc    Добавить главу к книге
 * @access  Admin only
 */
router.post(
  '/books/:bookId/chapters',
  isAdmin,
  [
    param('bookId')
      .isMongoId()
      .withMessage('Invalid book ID'),
    query('subjectId')
      .isMongoId()
      .withMessage('Invalid subject ID in query'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
    body('order')
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer')
  ],
  validate,
  asyncHandler(subjectController.addChapter.bind(subjectController))
);

/**
 * @route   POST /subjects/chapters/:chapterId/topics
 * @desc    Добавить тему к главе
 * @access  Admin only
 */
router.post(
  '/chapters/:chapterId/topics',
  isAdmin,
  [
    param('chapterId')
      .isMongoId()
      .withMessage('Invalid chapter ID'),
    query('subjectId')
      .isMongoId()
      .withMessage('Invalid subject ID in query'),
    query('bookId')
      .isMongoId()
      .withMessage('Invalid book ID in query'),
    body('title')
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters')
  ],
  validate,
  asyncHandler(subjectController.addTopic.bind(subjectController))
);

/**
 * @route   POST /subjects/topics/:topicId/paragraphs
 * @desc    Добавить параграф к теме
 * @access  Admin only
 */
router.post(
  '/topics/:topicId/paragraphs',
  isAdmin,
  [
    param('topicId')
      .isMongoId()
      .withMessage('Invalid topic ID'),
    query('subjectId')
      .isMongoId()
      .withMessage('Invalid subject ID in query'),
    query('bookId')
      .isMongoId()
      .withMessage('Invalid book ID in query'),
    query('chapterId')
      .isMongoId()
      .withMessage('Invalid chapter ID in query'),
    body('order')
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer'),
    body('content.text')
      .trim()
      .isLength({ min: 1 })
      .withMessage('Content text is required'),
    body('content.pages')
      .isArray({ min: 1 })
      .withMessage('Content must have at least one page number'),
    body('content.metadata')
      .isObject()
      .withMessage('Content metadata is required')
  ],
  validate,
  asyncHandler(subjectController.addParagraph.bind(subjectController))
);

export default router;
