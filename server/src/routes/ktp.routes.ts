import { Router } from 'express';
import { body, param } from 'express-validator';
import { ktpController } from '../controllers/ktp.controller';
import { authenticate, isAdmin, isTeacherOrAdmin, asyncHandler, validate } from '../middlewares';

/**
 * KTP ROUTES
 * Справочник КТП по предмету. Эталон РЕДАКТИРУЕТ только admin; чтение доступно и учителю
 * (нужно для маппинга тем книг на КТП при декомпозиции).
 */
const router = Router();

router.use(authenticate);

router.get(
  '/:subjectId',
  isTeacherOrAdmin,
  [param('subjectId').isMongoId().withMessage('Invalid subjectId')],
  validate,
  asyncHandler(ktpController.getCatalog.bind(ktpController))
);

router.post(
  '/:subjectId',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    body('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('year must be 2000..2100'),
    body('version').optional().isInt({ min: 1 }).withMessage('version must be >= 1')
  ],
  validate,
  asyncHandler(ktpController.upsertMeta.bind(ktpController))
);

router.post(
  '/:subjectId/topics',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    body('title').trim().isLength({ min: 1, max: 300 }).withMessage('title is required (1..300)'),
    body('description').optional().trim().isLength({ max: 8000 }),
    body('order').optional().isInt({ min: 0 }).withMessage('order must be a non-negative integer'),
    body('code').optional().trim().isLength({ max: 80 })
  ],
  validate,
  asyncHandler(ktpController.addTopic.bind(ktpController))
);

router.patch(
  '/:subjectId/topics/:topicId',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    body('title').optional().trim().isLength({ min: 1, max: 300 }),
    body('description').optional().trim().isLength({ max: 8000 }),
    body('order').optional().isInt({ min: 0 }),
    body('code').optional().trim().isLength({ max: 80 })
  ],
  validate,
  asyncHandler(ktpController.updateTopic.bind(ktpController))
);

router.delete(
  '/:subjectId/topics/:topicId',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId')
  ],
  validate,
  asyncHandler(ktpController.deleteTopic.bind(ktpController))
);

router.post(
  '/:subjectId/reorder',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    body('orderedTopicIds').isArray({ min: 1 }).withMessage('orderedTopicIds must be a non-empty array'),
    body('orderedTopicIds.*').isMongoId().withMessage('orderedTopicIds must contain valid ids')
  ],
  validate,
  asyncHandler(ktpController.reorderTopics.bind(ktpController))
);

router.post(
  '/:subjectId/import',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    body('topics').isArray({ min: 1 }).withMessage('topics must be a non-empty array'),
    body('topics.*.title').trim().isLength({ min: 1, max: 300 }).withMessage('each topic needs a title'),
    body('year').optional().isInt({ min: 2000, max: 2100 }),
    body('version').optional().isInt({ min: 1 }),
    body('replace').optional().isBoolean()
  ],
  validate,
  asyncHandler(ktpController.importTopics.bind(ktpController))
);

export default router;
