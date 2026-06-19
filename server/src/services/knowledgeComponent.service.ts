import mongoose from 'mongoose';
import { KtpCatalog } from '../models/KtpCatalog.model';
import { Subject } from '../models';
import { AppError } from '../utils';
import {
  IKnowledgeComponent,
  IKtpCatalog,
  KnowledgeComponentStatus
} from '../types/roadmap.types';
import { buildKtpCanonicalNodes } from '../utils/roadmapKtp.util';
import { roadmapAIService } from './roadmap.ai.service';

/**
 * KNOWLEDGE COMPONENT SERVICE
 * CRUD + AI-предложение компонентов знания (подтем) внутри темы КТП.
 * KC встроены в KtpTopic.knowledgeComponents[], _id стабилен.
 */

function normTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sortKc(list: IKnowledgeComponent[]): IKnowledgeComponent[] {
  return [...list].sort((a, b) => a.order - b.order);
}

class KnowledgeComponentService {
  private async assertSubject(subjectId: string): Promise<void> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId).select('_id').lean();
    if (!subject) throw AppError.notFound('Subject not found');
  }

  /** Найти документ КТП и тему по id; тема должна существовать. */
  private async loadCatalogTopic(subjectId: string, ktpTopicId: string) {
    if (!mongoose.isValidObjectId(ktpTopicId)) throw AppError.badRequest('Invalid КТП topicId');
    const doc = await KtpCatalog.findOne({ subjectId });
    if (!doc) throw AppError.notFound('КТП catalog not found');
    const topic = doc.topics.find((t) => String(t._id) === ktpTopicId);
    if (!topic) throw AppError.notFound('КТП topic not found');
    return { doc, topic };
  }

  /** Источники узла (книга·тема + текст) для грунтинга AI-предложения KC. */
  private async resolveNodeSources(
    subjectId: string,
    ktpTopicId: string
  ): Promise<{ nodeTitle: string; nodeDescription?: string; sources: Array<{ label: string; text: string }> }> {
    const subject = await Subject.findById(subjectId).lean();
    const ktp = await KtpCatalog.findOne({ subjectId }).lean<IKtpCatalog>();
    if (!subject || !ktp) return { nodeTitle: '', sources: [] };
    const nodes = buildKtpCanonicalNodes(subject, ktp);
    const node = nodes.find(
      (n) => (n.metadata as Record<string, unknown> | undefined)?.ktpTopicId === ktpTopicId
    );
    if (!node) return { nodeTitle: '', sources: [] };
    const lessons = ((node.metadata as Record<string, unknown>)?.lessons as
      | Array<{ title?: string; content?: string }>
      | undefined) ?? [];
    const sources = lessons
      .map((l) => ({ label: l.title || node.title, text: (l.content || '').trim() }))
      .filter((s) => s.text);
    return {
      nodeTitle: node.title,
      ...(node.description ? { nodeDescription: node.description } : {}),
      sources
    };
  }

  /** Список KC темы (отсортирован по order). */
  async list(subjectId: string, ktpTopicId: string): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);
    return sortKc((topic.knowledgeComponents ?? []) as IKnowledgeComponent[]);
  }

  /** Подтверждённые KC (для консолидации урока и сборки тестов). [] если нет. */
  async getConfirmed(subjectId: string, ktpTopicId: string): Promise<Array<{ id: string; title: string }>> {
    const ktp = await KtpCatalog.findOne({ subjectId })
      .select('topics._id topics.knowledgeComponents')
      .lean<IKtpCatalog>();
    const topic = ktp?.topics.find((t) => String(t._id) === ktpTopicId);
    if (!topic?.knowledgeComponents?.length) return [];
    return sortKc(topic.knowledgeComponents)
      .filter((k) => k.status === 'confirmed')
      .map((k) => ({ id: String(k._id), title: k.title }));
  }

  /**
   * AI-предложение KC: добавляет НОВЫЕ компоненты со статусом 'proposed'.
   * Не трогает уже существующие (по нормализованному названию) и подтверждённые.
   */
  async propose(subjectId: string, ktpTopicId: string): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { doc, topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);

    const { nodeTitle, nodeDescription, sources } = await this.resolveNodeSources(subjectId, ktpTopicId);
    const proposed = await roadmapAIService.proposeKnowledgeComponents({
      subjectTitle: '',
      nodeTitle: nodeTitle || topic.title,
      ...(nodeDescription || topic.description ? { nodeDescription: nodeDescription || topic.description } : {}),
      sources
    });

    const topicAny = topic as unknown as {
      knowledgeComponents?: IKnowledgeComponent[];
    };
    if (!Array.isArray(topicAny.knowledgeComponents)) topicAny.knowledgeComponents = [];
    const existingTitles = new Set(topicAny.knowledgeComponents.map((k) => normTitle(k.title)));
    let nextOrder = topicAny.knowledgeComponents.reduce((m, k) => Math.max(m, k.order + 1), 0);

    for (const p of proposed) {
      if (existingTitles.has(normTitle(p.title))) continue;
      existingTitles.add(normTitle(p.title));
      topicAny.knowledgeComponents.push({
        title: p.title,
        ...(p.description ? { description: p.description } : {}),
        order: nextOrder++,
        status: 'proposed'
      } as IKnowledgeComponent);
    }

    doc.markModified('topics');
    await doc.save();
    return sortKc(topicAny.knowledgeComponents);
  }

  /** Подтвердить KC (status='confirmed') по списку id. */
  async confirm(subjectId: string, ktpTopicId: string, kcIds: string[]): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { doc, topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);
    const ids = new Set(kcIds.map(String));
    const list = (topic.knowledgeComponents ?? []) as IKnowledgeComponent[];
    list.forEach((k) => {
      if (ids.has(String(k._id))) k.status = 'confirmed';
    });
    doc.markModified('topics');
    await doc.save();
    return sortKc(list);
  }

  /** Создать (id отсутствует) или обновить KC. Ручные KC по умолчанию confirmed. */
  async upsert(
    subjectId: string,
    ktpTopicId: string,
    input: { id?: string; title?: string; description?: string; order?: number; status?: KnowledgeComponentStatus }
  ): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { doc, topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);
    const topicAny = topic as unknown as { knowledgeComponents?: IKnowledgeComponent[] };
    if (!Array.isArray(topicAny.knowledgeComponents)) topicAny.knowledgeComponents = [];
    const list = topicAny.knowledgeComponents;

    if (input.id) {
      const kc = list.find((k) => String(k._id) === input.id);
      if (!kc) throw AppError.notFound('Knowledge component not found');
      if (typeof input.title === 'string') {
        const t = input.title.trim();
        if (!t) throw AppError.badRequest('title cannot be empty');
        kc.title = t;
      }
      if (input.description !== undefined) kc.description = input.description.trim() || undefined;
      if (typeof input.order === 'number') kc.order = input.order;
      if (input.status) kc.status = input.status;
    } else {
      const title = input.title?.trim();
      if (!title) throw AppError.badRequest('title is required');
      const order = typeof input.order === 'number' ? input.order : list.reduce((m, k) => Math.max(m, k.order + 1), 0);
      list.push({
        title,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        order,
        status: input.status ?? 'confirmed'
      } as IKnowledgeComponent);
    }

    doc.markModified('topics');
    await doc.save();
    return sortKc(list);
  }

  async remove(subjectId: string, ktpTopicId: string, kcId: string): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { doc, topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);
    const topicAny = topic as unknown as { knowledgeComponents?: IKnowledgeComponent[] };
    const list = (topicAny.knowledgeComponents ?? []).filter((k) => String(k._id) !== kcId);
    topicAny.knowledgeComponents = list;
    doc.markModified('topics');
    await doc.save();
    // NB: чистка ссылок QuestionItem.knowledgeComponentIds на удалённый KC — в Фазе 2.
    return sortKc(list);
  }

  /** Переупорядочить KC: orderedKcIds — полный список id в нужном порядке. */
  async reorder(subjectId: string, ktpTopicId: string, orderedKcIds: string[]): Promise<IKnowledgeComponent[]> {
    await this.assertSubject(subjectId);
    const { doc, topic } = await this.loadCatalogTopic(subjectId, ktpTopicId);
    const idx = new Map(orderedKcIds.map((id, i) => [String(id), i]));
    const list = (topic.knowledgeComponents ?? []) as IKnowledgeComponent[];
    list.forEach((k) => {
      const pos = idx.get(String(k._id));
      if (typeof pos === 'number') k.order = pos;
    });
    doc.markModified('topics');
    await doc.save();
    return sortKc(list);
  }
}

export const knowledgeComponentService = new KnowledgeComponentService();
