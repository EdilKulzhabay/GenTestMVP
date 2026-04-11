import { Router } from 'express';
import { query, body } from 'express-validator';
import { roadmapController } from '../controllers/roadmap.controller';
import { authenticate, isAdmin, asyncHandler, validate } from '../middlewares';

const router = Router();

router.use(authenticate);

router.get(
  '/canonical',
  [query('subjectId').isMongoId().withMessage('Invalid subjectId')],
  validate,
  asyncHandler(roadmapController.getCanonical.bind(roadmapController))
);

router.get(
  '/personal',
  [query('subjectId').isMongoId().withMessage('Invalid subjectId')],
  validate,
  asyncHandler(roadmapController.getPersonal.bind(roadmapController))
);

router.get(
  '/next',
  [query('subjectId').isMongoId().withMessage('Invalid subjectId')],
  validate,
  asyncHandler(roadmapController.getNext.bind(roadmapController))
);

router.post(
  '/events/test-submitted',
  [
    body('subjectId').isMongoId(),
    body('nodeId').trim().notEmpty(),
    body('score').isFloat({ min: 0, max: 100 }),
    body('sessionId').trim().notEmpty(),
    body('submittedAt').optional().isISO8601()
  ],
  validate,
  asyncHandler(roadmapController.postTestSubmitted.bind(roadmapController))
);

router.post(
  '/admin/canonical',
  isAdmin,
  [
    body('subjectId').isMongoId(),
    body('version').optional().isInt({ min: 1 }),
    body('description').optional().isString().isLength({ max: 8000 }),
    body('nodes').isArray({ min: 1 }),
    body('nodes.*.nodeId').trim().notEmpty(),
    body('nodes.*.title').trim().notEmpty(),
    body('nodes.*.description').optional().isString().isLength({ max: 8000 }),
    body('nodes.*.prerequisites').optional().isArray()
  ],
  validate,
  asyncHandler(roadmapController.upsertCanonicalAdmin.bind(roadmapController))
);

/**
 * Админ: сгенерировать canonical по книге через ИИ (как выбор контента для теста).
 */
router.post(
  '/admin/generate-canonical',
  isAdmin,
  [
    body('subjectId').isMongoId(),
    body('bookId').isMongoId(),
    body('chapterId').optional().isMongoId(),
    body('fullBook').optional().isBoolean()
  ],
  validate,
  asyncHandler(roadmapController.generateCanonicalFromBookAdmin.bind(roadmapController))
);

export default router;
