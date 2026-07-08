import fs from 'fs/promises';
import path from 'path';
import { Subject } from '../models';
import { ASSET_UPLOAD_ROOT } from '../middlewares/assetUpload.middleware';
import { AppError } from '../utils';

const ENRICH_VERSION = 1;
const ENRICH_MODEL = 'gpt-4o-mini';

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/**
 * Vision-описание учебного изображения (gpt-4o-mini) для семантики/грунтинга LLM.
 * Один image_url part + describe-промпт → строка-описание.
 */
export async function describeImageAsset(input: {
  mimeType: string;
  base64: string;
  caption?: string;
  alt?: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw AppError.badRequest('OPENAI_API_KEY is not set');
  const mime = input.mimeType.trim() || 'image/jpeg';

  const contextLines = [
    input.caption?.trim() ? `Подпись: ${input.caption.trim()}` : '',
    input.alt?.trim() ? `Alt-текст: ${input.alt.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const promptText = [
    'Опиши это учебное изображение для семантического поиска и грунтинга LLM.',
    'Кратко (2–4 предложения): что изображено, ключевые объекты/подписи/оси/величины, учебный смысл.',
    'Только факты с изображения; не выдумывай. Язык — русский.',
    contextLines,
  ]
    .filter(Boolean)
    .join('\n');

  const userParts: Part[] = [
    { type: 'text', text: promptText },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${input.base64}` } },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: 'Ты ассистент, описывающий учебные изображения кратко и точно.',
        },
        { role: 'user', content: userParts },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[asset AI] describeImageAsset failed', response.status, errText);
    throw new Error(`OpenAI: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return String(data.choices?.[0]?.message?.content ?? '').trim();
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

/** Диск-путь локального аплоада из URL ассета (только загруженные файлы). */
function localDiskPathFromUrl(url: string): string | null {
  const marker = '/uploads/subject-assets/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rel = url.slice(idx + marker.length);
  if (!rel || rel.includes('..') || rel.includes('\0')) return null;
  return path.join(ASSET_UPLOAD_ROOT, rel);
}

type EnrichParams = {
  subjectId: string;
  bookId: string;
  chapterId: string;
  topicId: string;
  assetId: string;
};

async function enrichImageAsset(params: EnrichParams): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const subject = await Subject.findById(params.subjectId);
  if (!subject) return;

  const book = subject.books.find(b => b._id?.toString() === params.bookId);
  const chapter = book?.chapters.find(c => c._id?.toString() === params.chapterId);
  const topic = chapter?.topics.find(t => t._id?.toString() === params.topicId);
  const asset = topic?.assets?.find(a => a._id?.toString() === params.assetId);
  if (!asset || asset.kind !== 'image' || !asset.url) return;

  const diskPath = localDiskPathFromUrl(asset.url);
  if (!diskPath) return;

  const mimeType = mimeFromExt(path.extname(diskPath));
  if (mimeType === 'image/svg+xml') return;

  let buf: Buffer;
  try {
    buf = await fs.readFile(diskPath);
  } catch {
    return;
  }

  const description = await describeImageAsset({
    mimeType,
    base64: buf.toString('base64'),
    caption: asset.caption,
    alt: asset.alt,
  });
  if (!description) return;

  asset.llmDescription = description;
  asset.enrichment = {
    version: ENRICH_VERSION,
    model: ENRICH_MODEL,
    generatedAt: new Date(),
    status: 'done',
  };
  await subject.save();
}

/**
 * Best-effort фоновой enrich изображения (llmDescription + enrichment). Не блокирует upload/CRUD:
 * ошибки логируются и глотаются.
 */
export function enrichImageAssetInBackground(params: EnrichParams): void {
  void enrichImageAsset(params).catch(err => {
    console.error('[asset AI] enrich failed (ignored)', err);
  });
}
