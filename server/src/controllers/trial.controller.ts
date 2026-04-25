import { Request, Response } from 'express';
import { trialService } from '../services/trial.service';
import { roadmapService } from '../services/roadmap.service';
import { success, AppError } from '../utils';

class TrialController {
  async getConfig(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string | undefined;
    const data = await trialService.getConfig(userId);
    success(res, data, 'Trial config');
  }

  async postPlan(req: Request, res: Response): Promise<void> {
    const profileSubjectIds = req.body?.profileSubjectIds as string[] | undefined;
    if (!Array.isArray(profileSubjectIds)) {
      throw AppError.badRequest('profileSubjectIds must be an array of 2 ids');
    }
    const data = await trialService.buildPlan(profileSubjectIds);
    success(res, data, 'Trial plan');
  }

  async applyResults(req: Request, res: Response): Promise<void> {
    const userId = (req as any).user?.userId as string;
    const results = req.body?.results as
      | Array<{ subjectId: string; nodeId: string; scorePercent: number }>
      | undefined;
    if (!Array.isArray(results) || results.length === 0) {
      throw AppError.badRequest('results must be a non-empty array');
    }
    for (const r of results) {
      if (!r.subjectId || !r.nodeId || typeof r.scorePercent !== 'number') {
        throw AppError.badRequest('Each result needs subjectId, nodeId, scorePercent');
      }
    }
    const out = await roadmapService.applyTrialChapterResults(userId, results);
    success(res, out, 'Trial results applied to roadmap');
  }
}

export const trialController = new TrialController();
