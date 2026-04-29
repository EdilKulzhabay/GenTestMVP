import { Request, Response } from 'express';
import { User, ProfileSubjectPair } from '../models';
import { success, AppError } from '../utils';

class UserController {
  /** GET /users/me */
  async getCurrentUser(req: Request, res: Response): Promise<void> {
    const user = await User.findById((req as any).user?.userId)
      .select('-password')
      .populate({
        path: 'profileSubjectPairId',
        populate: [
          { path: 'subject1Id', select: 'title subjectKind' },
          { path: 'subject2Id', select: 'title subjectKind' }
        ]
      });
    if (!user) throw AppError.notFound('User not found');
    success(res, user);
  }

  /** PATCH /users/me/profile-subject-pair — id пары из GET /profile-subject-pairs или null для сброса */
  async setProfileSubjectPair(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId;
    const { profileSubjectPairId } = req.body as { profileSubjectPairId?: string | null };

    if (profileSubjectPairId === undefined) {
      throw AppError.badRequest('profileSubjectPairId is required (Mongo id или null для сброса)');
    }

    if (profileSubjectPairId === null || profileSubjectPairId === '') {
      await User.findByIdAndUpdate(userId, { $unset: { profileSubjectPairId: 1 } });
      const user = await User.findById(userId)
        .select('-password')
        .populate({
          path: 'profileSubjectPairId',
          populate: [
            { path: 'subject1Id', select: 'title subjectKind' },
            { path: 'subject2Id', select: 'title subjectKind' }
          ]
        });
      success(res, user, 'Profile subject pair cleared');
      return;
    }

    const pair = await ProfileSubjectPair.findById(profileSubjectPairId);
    if (!pair) throw AppError.notFound('Profile subject pair not found');

    await User.findByIdAndUpdate(userId, { profileSubjectPairId: pair._id });
    const user = await User.findById(userId)
      .select('-password')
      .populate({
        path: 'profileSubjectPairId',
        populate: [
          { path: 'subject1Id', select: 'title subjectKind' },
          { path: 'subject2Id', select: 'title subjectKind' }
        ]
      });
    success(res, user, 'Profile subject pair saved');
  }

  /** GET /users/me/tests */
  async getTestHistory(req: Request, res: Response): Promise<void> {
    const { subjectId, limit, sortBy = 'createdAt', order = 'desc' } = req.query;

    const user = await User.findById((req as any).user?.userId)
      .select('testHistory')
      .populate('testHistory.subjectId', 'title');
    if (!user) throw AppError.notFound('User not found');

    let tests = user.testHistory || [];

    if (subjectId) {
      tests = tests.filter((t) => t.subjectId.toString() === subjectId);
    }

    tests.sort((a, b) => {
      const aVal = sortBy === 'scorePercent' ? a.result.scorePercent : new Date(a.createdAt!).getTime();
      const bVal = sortBy === 'scorePercent' ? b.result.scorePercent : new Date(b.createdAt!).getTime();
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    if (limit) tests = tests.slice(0, parseInt(limit as string));

    success(res, { total: tests.length, tests });
  }

  /** GET /users/me/stats */
  async getUserStats(req: Request, res: Response): Promise<void> {
    const user = await User.findById((req as any).user?.userId)
      .select('testHistory')
      .populate('testHistory.subjectId', 'title');
    if (!user) throw AppError.notFound('User not found');

    const tests = user.testHistory || [];
    if (tests.length === 0) {
      success(res, { totalTests: 0, averageScore: 0, bestResult: null, worstResult: null, recentProgress: [] });
      return;
    }

    const totalTests = tests.length;
    const averageScore = Math.round(
      tests.reduce((sum, t) => sum + t.result.scorePercent, 0) / totalTests
    );

    const sorted = [...tests].sort((a, b) => b.result.scorePercent - a.result.scorePercent);
    const pick = (t: typeof sorted[0]) => ({ testId: t._id, score: t.result.scorePercent, date: t.createdAt });

    success(res, {
      totalTests,
      averageScore,
      bestResult: pick(sorted[0]),
      worstResult: pick(sorted[sorted.length - 1]),
      recentProgress: tests.slice(-5).map(pick)
    });
  }

  /** GET /users/me/tests/:testHistoryId */
  async getTestHistoryDetails(req: Request, res: Response): Promise<void> {
    const user = await User.findById((req as any).user?.userId)
      .select('testHistory')
      .populate('testHistory.subjectId', 'title');
    if (!user) throw AppError.notFound('User not found');

    const entry = user.testHistory.find((t) => t._id?.toString() === req.params.testHistoryId);
    if (!entry) throw AppError.notFound('Test history not found');

    success(res, entry);
  }
}

export const userController = new UserController();
