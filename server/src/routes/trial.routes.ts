import { Router } from 'express';
import { body } from 'express-validator';
import { trialController } from '../controllers/trial.controller';
import { authenticate, optionalAuthenticate, asyncHandler, validate } from '../middlewares';

const router = Router();

router.get(
  '/config',
  optionalAuthenticate,
  asyncHandler(trialController.getConfig.bind(trialController))
);

router.post(
  '/plan',
  [
    body('profileSubjectIds')
      .isArray({ min: 2, max: 2 })
      .withMessage('profileSubjectIds must contain exactly 2 subject ids'),
    body('profileSubjectIds.*').isMongoId().withMessage('Invalid profile subject id')
  ],
  validate,
  asyncHandler(trialController.postPlan.bind(trialController))
);

router.post(
  '/apply-results',
  authenticate,
  [
    body('results').isArray({ min: 1 }).withMessage('results required'),
    body('results.*.subjectId').isMongoId(),
    body('results.*.nodeId').trim().notEmpty(),
    body('results.*.scorePercent').isFloat({ min: 0, max: 100 })
  ],
  validate,
  asyncHandler(trialController.applyResults.bind(trialController))
);

export default router;
