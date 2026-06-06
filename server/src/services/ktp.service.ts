import mongoose from 'mongoose';
import { KtpCatalog } from '../models/KtpCatalog.model';
import { Subject } from '../models';
import { AppError } from '../utils';
import { IKtpCatalog, IKtpTopic } from '../types/roadmap.types';

export interface KtpTopicInput {
  title: string;
  description?: string;
  order?: number;
  code?: string;
}

/** Сортированная копия тем по order (для стабильного порядка в UI и при сборке роудмапа). */
function sortedTopics<T extends { order: number }>(topics: T[]): T[] {
  return [...topics].sort((a, b) => a.order - b.order);
}

class KtpService {
  private async assertSubject(subjectId: string): Promise<void> {
    if (!mongoose.isValidObjectId(subjectId)) throw AppError.badRequest('Invalid subjectId');
    const subject = await Subject.findById(subjectId).select('_id').lean();
    if (!subject) throw AppError.notFound('Subject not found');
  }

  /** Возвращает справочник КТП предмета (или null, если ещё не заведён). */
  async getCatalog(subjectId: string): Promise<IKtpCatalog | null> {
    await this.assertSubject(subjectId);
    const doc = await KtpCatalog.findOne({ subjectId }).lean<IKtpCatalog>();
    if (!doc) return null;
    doc.topics = sortedTopics(doc.topics);
    return doc;
  }

  /** Гарантирует существование документа справочника (создаёт пустой при отсутствии). */
  private async ensureCatalog(subjectId: string) {
    const existing = await KtpCatalog.findOne({ subjectId });
    if (existing) return existing;
    return KtpCatalog.create({ subjectId: new mongoose.Types.ObjectId(subjectId), version: 1, topics: [] });
  }

  async upsertMeta(subjectId: string, meta: { year?: number; version?: number }): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    const doc = await this.ensureCatalog(subjectId);
    if (typeof meta.year === 'number') doc.year = meta.year;
    if (typeof meta.version === 'number') doc.version = meta.version;
    await doc.save();
    return doc.toObject();
  }

  async addTopic(subjectId: string, input: KtpTopicInput): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    const title = input.title?.trim();
    if (!title) throw AppError.badRequest('title is required');
    const doc = await this.ensureCatalog(subjectId);
    const nextOrder =
      typeof input.order === 'number'
        ? input.order
        : doc.topics.reduce((m, t) => Math.max(m, t.order + 1), 0);
    doc.topics.push({
      title,
      description: input.description?.trim() || undefined,
      order: nextOrder,
      code: input.code?.trim() || undefined
    } as IKtpTopic);
    await doc.save();
    return doc.toObject();
  }

  async updateTopic(
    subjectId: string,
    topicId: string,
    patch: Partial<KtpTopicInput>
  ): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    if (!mongoose.isValidObjectId(topicId)) throw AppError.badRequest('Invalid КТП topicId');
    const doc = await KtpCatalog.findOne({ subjectId });
    if (!doc) throw AppError.notFound('КТП catalog not found');
    const topic = doc.topics.find((t) => String(t._id) === topicId);
    if (!topic) throw AppError.notFound('КТП topic not found');
    if (typeof patch.title === 'string') {
      const t = patch.title.trim();
      if (!t) throw AppError.badRequest('title cannot be empty');
      topic.title = t;
    }
    if (patch.description !== undefined) topic.description = patch.description.trim() || undefined;
    if (patch.code !== undefined) topic.code = patch.code.trim() || undefined;
    if (typeof patch.order === 'number') topic.order = patch.order;
    doc.markModified('topics');
    await doc.save();
    return doc.toObject();
  }

  async deleteTopic(subjectId: string, topicId: string): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    if (!mongoose.isValidObjectId(topicId)) throw AppError.badRequest('Invalid КТП topicId');
    const doc = await KtpCatalog.findOne({ subjectId });
    if (!doc) throw AppError.notFound('КТП catalog not found');
    if (!doc.topics.some((t) => String(t._id) === topicId)) {
      throw AppError.notFound('КТП topic not found');
    }
    doc.set('topics', doc.topics.filter((t) => String(t._id) !== topicId));
    await doc.save();
    // NB: очистка ссылок Subject.Topic.ktpTopicIds на удалённую тему добавляется в Фазе 2.
    return doc.toObject();
  }

  /** Переупорядочивание: orderedTopicIds — полный список id тем в нужном порядке. */
  async reorderTopics(subjectId: string, orderedTopicIds: string[]): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    const doc = await KtpCatalog.findOne({ subjectId });
    if (!doc) throw AppError.notFound('КТП catalog not found');
    const idx = new Map(orderedTopicIds.map((id, i) => [String(id), i]));
    doc.topics.forEach((t) => {
      const pos = idx.get(String(t._id));
      if (typeof pos === 'number') t.order = pos;
    });
    doc.markModified('topics');
    await doc.save();
    return doc.toObject();
  }

  /** Массовый импорт: заменяет темы списком из payload (вставка JSON). */
  async importTopics(
    subjectId: string,
    payload: { topics: KtpTopicInput[]; year?: number; version?: number; replace?: boolean }
  ): Promise<IKtpCatalog> {
    await this.assertSubject(subjectId);
    if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
      throw AppError.badRequest('topics array is required');
    }
    const doc = await this.ensureCatalog(subjectId);
    const baseOrder = payload.replace === false ? doc.topics.length : 0;
    const mapped = payload.topics.map((t, i) => {
      const title = t.title?.trim();
      if (!title) throw AppError.badRequest(`topics[${i}].title is required`);
      return {
        title,
        description: t.description?.trim() || undefined,
        order: typeof t.order === 'number' ? t.order : baseOrder + i,
        code: t.code?.trim() || undefined
      } as IKtpTopic;
    });
    if (payload.replace === false) {
      doc.topics.push(...mapped);
    } else {
      doc.set('topics', mapped);
    }
    if (typeof payload.year === 'number') doc.year = payload.year;
    if (typeof payload.version === 'number') doc.version = payload.version;
    await doc.save();
    return doc.toObject();
  }
}

export const ktpService = new KtpService();
