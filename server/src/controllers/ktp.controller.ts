import { Request, Response } from 'express';
import { ktpService } from '../services/ktp.service';
import { knowledgeComponentService } from '../services/knowledgeComponent.service';
import { questionBankService } from '../services/questionBank.service';
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

  // ==================== Knowledge Components (подтемы) ====================

  async listComponents(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const data = await knowledgeComponentService.list(subjectId, topicId);
    success(res, data, 'Knowledge components');
  }

  async proposeComponents(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const data = await knowledgeComponentService.propose(subjectId, topicId);
    success(res, data, 'Knowledge components proposed', 201);
  }

  async upsertComponent(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { id, title, description, order, status } = req.body as {
      id?: string;
      title?: string;
      description?: string;
      order?: number;
      status?: 'proposed' | 'confirmed';
    };
    const data = await knowledgeComponentService.upsert(subjectId, topicId, { id, title, description, order, status });
    success(res, data, 'Knowledge component saved', 201);
  }

  async confirmComponents(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { kcIds } = req.body as { kcIds: string[] };
    const data = await knowledgeComponentService.confirm(subjectId, topicId, kcIds);
    success(res, data, 'Knowledge components confirmed');
  }

  async reorderComponents(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { orderedKcIds } = req.body as { orderedKcIds: string[] };
    const data = await knowledgeComponentService.reorder(subjectId, topicId, orderedKcIds);
    success(res, data, 'Knowledge components reordered');
  }

  async deleteComponent(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId, kcId } = req.params;
    const data = await knowledgeComponentService.remove(subjectId, topicId, kcId);
    success(res, data, 'Knowledge component deleted');
  }

  // ==================== Question Bank (банк вопросов) ====================

  async bankCoverage(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const data = await questionBankService.coverage(subjectId, topicId);
    success(res, data, 'Question bank coverage');
  }

  async bankGenerate(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { minPerKc, difficulty } = req.body as { minPerKc?: number; difficulty?: number };
    const data = await questionBankService.generateForCoverage(subjectId, topicId, { minPerKc, difficulty });
    success(res, data, 'Question bank topped up', 201);
  }

  /** Admin: просмотр сгенерированных вопросов банка узла (с правильными ответами). */
  async listBankItems(req: Request, res: Response): Promise<void> {
    const { subjectId, topicId } = req.params;
    const { kcId, status } = req.query as { kcId?: string; status?: 'draft' | 'active' | 'retired' };
    const data = await questionBankService.listItems(subjectId, topicId, { kcId, status });
    success(res, data, 'Question bank items');
  }

  // TODO Phase A-next: эндпоинты управления item'ами банка (заложено, не реализовано):
  //   PATCH  /:subjectId/topics/:topicId/bank/items/:itemId       — updateItem
  //   POST   /:subjectId/topics/:topicId/bank/items/:itemId/retire — setItemStatus
  //   DELETE /:subjectId/topics/:topicId/bank/items/:itemId       — removeItem
}

export const ktpController = new KtpController();
