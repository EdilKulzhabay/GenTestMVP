import { Router } from 'express';
import { body, param, query } from 'express-validator';
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

// ==================== Knowledge Components (подтемы темы КТП) ====================

router.get(
  '/:subjectId/topics/:topicId/components',
  isTeacherOrAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId')
  ],
  validate,
  asyncHandler(ktpController.listComponents.bind(ktpController))
);

router.post(
  '/:subjectId/topics/:topicId/components/propose',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId')
  ],
  validate,
  asyncHandler(ktpController.proposeComponents.bind(ktpController))
);

router.post(
  '/:subjectId/topics/:topicId/components',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    body('id').optional().isMongoId().withMessage('Invalid component id'),
    body('title').optional().trim().isLength({ min: 1, max: 300 }),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('order').optional().isInt({ min: 0 }),
    body('status').optional().isIn(['proposed', 'confirmed'])
  ],
  validate,
  asyncHandler(ktpController.upsertComponent.bind(ktpController))
);

router.post(
  '/:subjectId/topics/:topicId/components/confirm',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    body('kcIds').isArray({ min: 1 }).withMessage('kcIds must be a non-empty array'),
    body('kcIds.*').isMongoId().withMessage('kcIds must contain valid ids')
  ],
  validate,
  asyncHandler(ktpController.confirmComponents.bind(ktpController))
);

router.post(
  '/:subjectId/topics/:topicId/components/reorder',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    body('orderedKcIds').isArray({ min: 1 }).withMessage('orderedKcIds must be a non-empty array'),
    body('orderedKcIds.*').isMongoId().withMessage('orderedKcIds must contain valid ids')
  ],
  validate,
  asyncHandler(ktpController.reorderComponents.bind(ktpController))
);

router.delete(
  '/:subjectId/topics/:topicId/components/:kcId',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    param('kcId').isMongoId().withMessage('Invalid component id')
  ],
  validate,
  asyncHandler(ktpController.deleteComponent.bind(ktpController))
);

// ==================== Question Bank (банк вопросов узла) ====================

router.get(
  '/:subjectId/topics/:topicId/bank/coverage',
  isTeacherOrAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId')
  ],
  validate,
  asyncHandler(ktpController.bankCoverage.bind(ktpController))
);

router.post(
  '/:subjectId/topics/:topicId/bank/generate',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    body('minPerKc').optional().isInt({ min: 1, max: 20 }),
    body('difficulty').optional().isInt({ min: 1, max: 5 })
  ],
  validate,
  asyncHandler(ktpController.bankGenerate.bind(ktpController))
);

// Просмотр сгенерированных вопросов (с правильными ответами) — только admin.
router.get(
  '/:subjectId/topics/:topicId/bank/items',
  isAdmin,
  [
    param('subjectId').isMongoId().withMessage('Invalid subjectId'),
    param('topicId').isMongoId().withMessage('Invalid КТП topicId'),
    query('kcId').optional().isMongoId().withMessage('Invalid kcId'),
    query('status').optional().isIn(['draft', 'active', 'retired'])
  ],
  validate,
  asyncHandler(ktpController.listBankItems.bind(ktpController))
);

// TODO Phase A-next: PATCH/POST retire/DELETE для /:subjectId/topics/:topicId/bank/items/:itemId

export default router;
