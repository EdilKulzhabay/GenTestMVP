import mongoose from 'mongoose';
import { User, Subject } from '../models';
import { AppError } from './AppError';

/**
 * Пользователь (не admin) может работать с предметом, если:
 * - subjectKind === main, или
 * - предмет входит в выбранную пару profileSubjectPairId.
 */
export async function assertLearnerSubjectAccess(userId: string, subjectId: string): Promise<void> {
  if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');

  const user = await User.findById(userId)
    .select('role profileSubjectPairId')
    .populate({
      path: 'profileSubjectPairId',
      select: 'subject1Id subject2Id',
      populate: [
        { path: 'subject1Id', select: '_id' },
        { path: 'subject2Id', select: '_id' }
      ]
    })
    .lean();

  if (!user) throw AppError.unauthorized('Not authenticated');
  if (user.role === 'admin') return;

  const subject = await Subject.findById(subjectId).select('subjectKind').lean();
  if (!subject) throw AppError.notFound('Subject not found');
  if (subject.subjectKind !== 'profile') return;

  const pair = user.profileSubjectPairId as
    | { subject1Id?: { _id?: unknown }; subject2Id?: { _id?: unknown } }
    | null
    | undefined;

  if (!pair) {
    throw AppError.forbidden('Выберите пару профильных предметов, чтобы открыть этот предмет');
  }

  const s1 = pair.subject1Id?._id?.toString() ?? (pair.subject1Id as string | undefined)?.toString();
  const s2 = pair.subject2Id?._id?.toString() ?? (pair.subject2Id as string | undefined)?.toString();
  const sid = subjectId.toString();

  if (sid !== s1 && sid !== s2) {
    throw AppError.forbidden('Этот профильный предмет недоступен для вашей выбранной пары');
  }
}
