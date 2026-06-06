import { Request, Response } from 'express';
import { ktpService } from '../services/ktp.service';
import { success } from '../utils';

/**
 * KTP CONTROLLER
 * Админский CRUD справочника КТП (календарно-тематическое планирование) по предмету.
 */
class KtpController {
  async getCatalog(req: Request, res: Response): Promise<void> {
    const subjectId = req.params.subjectId;
    const data = await ktpService.getCatalog(subjectId);
    success(res, data, 'КТП catalog');
  }

  async upsertMeta(req: Request, res: Response): Promise<void> {
    const subjectId = req.params.subjectId;
    const { year, version } = req.body as { year?: number; version?: number };
    const data = await ktpService.upsertMeta(subjectId, { year, version });
    success(res, data, 'КТП catalog updated', 201);
  }

  async addTopic(req: Request, res: Response): Promise<void> {
    const subjectId = req.params.subjectId;
    const { title, description, order, code } = req.body as {
      title: string;
      description?: string;
      order?: number;
      code?: string;
    };
    const data = await ktpService.addTopic(subjectId, { title, description, order, code });
    success(res, data, 'КТП topic added', 201);
  }

  async updateTopic(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { title, description, order, code } = req.body as {
      title?: string;
      description?: string;
      order?: number;
      code?: string;
    };
    const data = await ktpService.updateTopic(subjectId, topicId, { title, description, order, code });
    success(res, data, 'КТП topic updated');
  }

  async deleteTopic(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const data = await ktpService.deleteTopic(subjectId, topicId);
    success(res, data, 'КТП topic deleted');
  }

  async reorderTopics(req: Request, res: Response): Promise<void> {
    const subjectId = req.params.subjectId;
    const { orderedTopicIds } = req.body as { orderedTopicIds: string[] };
    const data = await ktpService.reorderTopics(subjectId, orderedTopicIds);
    success(res, data, 'КТП topics reordered');
  }

  async importTopics(req: Request, res: Response): Promise<void> {
    const subjectId = req.params.subjectId;
    const { topics, year, version, replace } = req.body as {
      topics: Array<{ title: string; description?: string; order?: number; code?: string }>;
      year?: number;
      version?: number;
      replace?: boolean;
    };
    const data = await ktpService.importTopics(subjectId, { topics, year, version, replace });
    success(res, data, 'КТП topics imported', 201);
  }
}

export const ktpController = new KtpController();
