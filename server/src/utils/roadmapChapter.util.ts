import mongoose from 'mongoose';
import { IAssetCandidate, IContentAsset } from '../types';

/** Краткое описание темы из её текста (или fallback на заголовок). */
export function makeChapterSummary(text: string, title: string, maxLen = 400): string {
  const raw = (text || '').trim();
  if (!raw) return title;
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen).trim()}…`;
}

/** Текст одной темы книги (параграфы в порядке order). Используется билдером КТП-узлов. */
export function extractTopicText(
  subject: unknown,
  bookId: string,
  chapterId: string,
  topicId: string
): string {
  const s = subject as {
    books?: Array<{
      _id?: mongoose.Types.ObjectId;
      chapters?: Array<{
        _id?: mongoose.Types.ObjectId;
        topics?: Array<{
          _id?: mongoose.Types.ObjectId;
          paragraphs?: Array<{ order?: number; content?: { text?: string } }>;
        }>;
      }>;
    }>;
  };
  const book = s.books?.find(b => b._id?.toString() === bookId);
  if (!book) return '';
  const chapter = book.chapters?.find(c => c._id?.toString() === chapterId);
  if (!chapter) return '';
  const topic = chapter.topics?.find(t => t._id?.toString() === topicId);
  if (!topic) return '';
  return (topic.paragraphs || [])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(p => (p.content?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

type TopicLike = { _id?: mongoose.Types.ObjectId; title?: string; assets?: IContentAsset[] };

/** Найти тему книги по (bookId, chapterId, topicId). */
export function findTopic(
  subject: unknown,
  bookId?: string,
  chapterId?: string,
  topicId?: string
): TopicLike | null {
  const s = subject as {
    books?: Array<{
      _id?: mongoose.Types.ObjectId;
      chapters?: Array<{ _id?: mongoose.Types.ObjectId; topics?: TopicLike[] }>;
    }>;
  };
  const book = s.books?.find(b => b._id?.toString() === bookId);
  const chapter = book?.chapters?.find(c => c._id?.toString() === chapterId);
  const topic = chapter?.topics?.find(t => t._id?.toString() === topicId);
  return topic ?? null;
}

/** Ассеты одной темы книги (payload для resolved-сайдкара урока/теста). */
export function extractTopicAssets(
  subject: unknown,
  bookId: string,
  chapterId: string,
  topicId: string
): IContentAsset[] {
  return findTopic(subject, bookId, chapterId, topicId)?.assets ?? [];
}

/** Короткая метка ассета для промпта генератора (caption → тип-специфичное поле → kind). */
export function assetCandidateLabel(asset: IContentAsset): string {
  const byKind =
    asset.kind === 'table'
      ? asset.llmSummary?.trim() || (asset.columns ?? []).join(', ')
      : asset.kind === 'image'
        ? asset.alt?.trim() || asset.llmDescription?.trim() || ''
        : asset.kind === 'formula'
          ? asset.plainText?.trim() || asset.latex?.trim() || ''
          : asset.kind === 'problem'
            ? asset.promptMarkdown?.trim() || ''
            : '';
  const raw = (asset.caption?.trim() || byKind || asset.kind).replace(/\s+/g, ' ').trim();
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}

/** Кандидат-ассеты одной темы (для инъекции в промпт LLM-B). */
export function topicAssetCandidates(
  topicTitle: string,
  assets?: IContentAsset[]
): IAssetCandidate[] {
  return (assets ?? [])
    .filter(a => a._id)
    .map(a => ({
      assetId: String(a._id),
      kind: a.kind,
      topicTitle: topicTitle || undefined,
      label: assetCandidateLabel(a),
    }));
}

function assetIdOf(asset: unknown): string {
  const id = (asset as { _id?: unknown })._id;
  return id ? String(id) : '';
}

/** Все assetId, процитированные вопросами теста (relatedContent.assetIds). */
function citedAssetIds(
  questions: Array<{ relatedContent?: { assetIds?: unknown } }> | undefined
): Set<string> {
  const cited = new Set<string>();
  for (const q of questions ?? []) {
    const ids = q?.relatedContent?.assetIds;
    if (Array.isArray(ids)) {
      for (const id of ids) if (id != null) cited.add(String(id));
    }
  }
  return cited;
}

type SubjectAssetsShape = {
  books?: Array<{
    _id?: mongoose.Types.ObjectId;
    chapters?: Array<{
      _id?: mongoose.Types.ObjectId;
      topics?: Array<{ assets?: IContentAsset[] }>;
    }>;
  }>;
};

/**
 * Resolved-сайдкар теста: супермножество ассетов in-scope тем ПЛЮС любые ассеты,
 * которые вопросы теста явно цитируют (relatedContent.assetIds) — где бы они ни лежали
 * в предмете. Гарантирует инвариант «сайдкар ⊇ все процитированные assetId», даже когда
 * область теста (bookId/chapterId) уже, чем область-кандидат на момент генерации
 * (полная книга, node-bank с sourceRefs через несколько глав). Дедуп по String(_id).
 */
export function collectTestAssets(
  subject: unknown,
  test: {
    bookId?: unknown;
    chapterId?: unknown;
    questions?: Array<{ relatedContent?: { assetIds?: unknown } }>;
  }
): IContentAsset[] {
  const s = subject as SubjectAssetsShape;
  const bookId = test.bookId != null ? String(test.bookId) : undefined;
  const chapterId = test.chapterId != null ? String(test.chapterId) : undefined;

  const out: IContentAsset[] = [];
  const seen = new Set<string>();
  const push = (asset: IContentAsset): void => {
    const id = assetIdOf(asset);
    if (!id) {
      out.push(asset);
      return;
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(asset);
    }
  };

  // (a) in-scope темы: глава теста (если задана), иначе вся книга.
  const book = s.books?.find(b => b._id?.toString() === bookId);
  if (book) {
    const chapters = chapterId
      ? (book.chapters ?? []).filter(c => c._id?.toString() === chapterId)
      : (book.chapters ?? []);
    for (const chapter of chapters) {
      for (const topic of chapter.topics ?? []) {
        for (const asset of topic.assets ?? []) push(asset);
      }
    }
  }

  // (b) явно процитированные ассеты вне in-scope области — ищем по всему предмету.
  const cited = citedAssetIds(test.questions);
  const missing = [...cited].filter(id => !seen.has(id));
  if (missing.length) {
    const want = new Set(missing);
    for (const b of s.books ?? []) {
      for (const c of b.chapters ?? []) {
        for (const t of c.topics ?? []) {
          for (const asset of t.assets ?? []) {
            const id = assetIdOf(asset);
            if (id && want.has(id)) push(asset);
          }
        }
      }
    }
  }

  return out;
}
