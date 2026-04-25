import { Router } from 'express';
import { body, param } from 'express-validator';
import { profileSubjectPairController } from '../controllers';
import { authenticate, isAdmin, asyncHandler, validate } from '../middlewares';

const router = Router();

router.use(authenticate);

router.get('/', asyncHandler(profileSubjectPairController.list.bind(profileSubjectPairController)));

router.post(
  '/',
  isAdmin,
  [
    body('subject1Id').isMongoId().withMessage('Invalid subject1Id'),
    body('subject2Id').isMongoId().withMessage('Invalid subject2Id')
  ],
  validate,
  asyncHandler(profileSubjectPairController.create.bind(profileSubjectPairController))
);

router.patch(
  '/:id',
  isAdmin,
  [
    param('id').isMongoId(),
    body('subject1Id').optional().isMongoId(),
    body('subject2Id').optional().isMongoId()
  ],
  validate,
  asyncHandler(profileSubjectPairController.update.bind(profileSubjectPairController))
);

router.delete(
  '/:id',
  isAdmin,
  [param('id').isMongoId()],
  validate,
  asyncHandler(profileSubjectPairController.remove.bind(profileSubjectPairController))
);

export default router;
