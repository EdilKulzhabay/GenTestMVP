import { IContentForAI } from '../types';
import { ICanonicalRoadmapNode } from '../types/roadmap.types';
import { assertValidCanonicalNodes } from '../utils/roadmapGraph';
import { AppError } from '../utils';

const MAX_CHARS = 16000;
const MODEL = 'gpt-4o-mini';

function parseJsonObject(raw: string): Record<string, unknown> {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('OpenAI response does not contain JSON');
  }
  return JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
}

export interface RoadmapPersonalAiInsights {
  coachSummary: string;
  nextStepExplanation?: string;
  /** Подсказки по узлам (nodeId → короткий текст) */
  nodeHints?: Record<string, string>;
}

class RoadmapAIService {
  /**
   * Генерация canonical roadmap по тексту книги/главы (структура и prereq — решает модель).
   */
  async generateCanonicalFromBookContent(contentForAI: IContentForAI): Promise<ICanonicalRoadmapNode[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw AppError.badRequest('OPENAI_API_KEY is not set');
    }

    let text = contentForAI.text;
    if (text.length > MAX_CHARS) {
      text = `${text.slice(0, MAX_CHARS)}\n\n[Текст обрезан для модели; при необходимости сгенерируйте roadmap по главам отдельно.]`;
    }

    const topicsHint =
      contentForAI.metadata.topics?.length > 0
        ? `Список тем/заголовков из учебника (ориентир): ${contentForAI.metadata.topics.slice(0, 40).join(', ')}`
        : '';

    const chapterTitles = contentForAI.metadata.chapterTitles;
    const chaptersHint =
      chapterTitles && chapterTitles.length > 0
        ? `Оглавление глав книги (порядок важен): ${chapterTitles.slice(0, 30).join(' → ')}`
        : '';

    const authorHint = contentForAI.metadata.bookAuthor?.trim()
      ? `Автор учебника: ${contentForAI.metadata.bookAuthor.trim()}.`
      : '';

    const langHint = contentForAI.metadata.contentLanguage?.trim()
      ? `Язык названий узлов (title) и любых пояснений в metadata: ${contentForAI.metadata.contentLanguage.trim()}.`
      : 'Названия узлов (title) пиши на том же языке, что основной текст фрагмента учебника (определи по тексту).';

    const prompt = [
      'Ты методист. По приведённому фрагменту учебника построй учебный roadmap — граф тем (узлов), отражающий реальную структуру материала.',
      'Требования:',
      '- Верни ТОЛЬКО строгий JSON без Markdown.',
      '- Формат: { "nodes": [ { "nodeId": "латиница-цифры-дефисы", "title": "краткое название темы", "description": "2-4 предложения: о чём тема, что ученик должен понять", "prerequisites": ["nodeId", ...], "metadata": { } } ] }',
      '- Поле description обязательно для каждого узла (коротко, по делу).',
      '- nodeId: уникальные строки, латиница/цифры/дефисы, без пробелов.',
      '- prerequisites: логика AND — все перечисленные узлы должны быть пройдены до текущего. Пустой массив = можно начинать с этого узла.',
      '- Связи должны быть ациклическими (без циклов).',
      '- 8–20 узлов в зависимости от объёма текста; опирайся на темы и логику учебника, не выдумывай лишнего.',
      '- metadata опционально: order, estimatedMinutes, chapterHint (строка — к какой главе/разделу ближе узел).',
      langHint,
      topicsHint,
      chaptersHint,
      authorHint,
      '',
      `Предмет: ${contentForAI.metadata.subjectTitle}. Книга: ${contentForAI.metadata.bookTitle}.`,
      contentForAI.metadata.chapterTitle
        ? `Фрагмент: глава/раздел «${contentForAI.metadata.chapterTitle}».`
        : 'Фрагмент: вся выбранная книга или крупный блок.',
      '',
      'Текст учебника:',
      text
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: 'Ты генерируешь структурированные учебные карты (roadmap) в JSON для школьной платформы.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[roadmap AI] canonical error', response.status, errText);
      throw new Error(`OpenAI: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = parseJsonObject(raw);
    const nodesRaw = parsed.nodes;
    if (!Array.isArray(nodesRaw)) {
      throw AppError.badRequest('AI returned invalid shape: nodes must be an array');
    }

    const nodes: ICanonicalRoadmapNode[] = nodesRaw.map((n: any) => ({
      nodeId: String(n.nodeId).trim(),
      title: String(n.title).trim(),
      ...(typeof n.description === 'string' && n.description.trim()
        ? { description: String(n.description).trim() }
        : {}),
      prerequisites: Array.isArray(n.prerequisites) ? n.prerequisites.map(String) : [],
      metadata:
        n.metadata && typeof n.metadata === 'object' && !Array.isArray(n.metadata)
          ? (n.metadata as Record<string, unknown>)
          : undefined
    }));

    assertValidCanonicalNodes(nodes);
    return nodes;
  }

  /**
   * Обогащение personal roadmap: краткий коучинг и пояснения на основе прогресса и истории тестов.
   * Детерминированные locked/available/mastered не заменяет — только текстовый слой для UI.
   */
  async enrichPersonalRoadmap(input: {
    subjectTitle: string;
    nodesSummary: Array<{
      nodeId: string;
      title: string;
      availability: string;
      mastered: boolean;
      bestScore: number;
    }>;
    nextRecommended?: { nodeId: string; reason: string; priority: number } | null;
    testHistorySummary: Array<{
      scorePercent: number;
      correctAnswers: number;
      totalQuestions: number;
      createdAt?: string;
      mistakesCount: number;
    }>;
  }): Promise<RoadmapPersonalAiInsights> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { coachSummary: '' };
    }

    const prompt = [
      'Ты наставник по подготовке к ЕНТ. По данным прогресса по узлам roadmap и краткой истории тестов дай поддерживающую обратную связь.',
      'Верни строгий JSON без Markdown:',
      '{ "coachSummary": "2-4 предложения по-русски", "nextStepExplanation": "1-2 предложения почему логично заняться следующим узлом (если есть nextRecommended)", "nodeHints": { "nodeId": "короткая подсказка для карточки узла" } }',
      '- nodeHints только для 3–5 узлов, где ученику сейчас важнее всего: слабые места или текущий фокус.',
      '- Если данных мало, всё равно дай coachSummary.',
      '',
      `Предмет: ${input.subjectTitle}`,
      '',
      'Следующий рекомендуемый узел (от системы):',
      input.nextRecommended
        ? JSON.stringify(input.nextRecommended)
        : 'нет (все пройдено или нет доступных)',
      '',
      'Узлы (прогресс):',
      JSON.stringify(input.nodesSummary, null, 0),
      '',
      'Последние тесты по предмету (агрегат):',
      JSON.stringify(input.testHistorySummary.slice(0, 15), null, 0)
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        messages: [
          { role: 'system', content: 'Ты даёшь краткие, практичные советы ученику, без морализации.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      console.error('[roadmap AI] personal enrich failed', response.status);
      return { coachSummary: '' };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    try {
      const parsed = parseJsonObject(raw) as Record<string, unknown>;
      const coachSummary = String(parsed.coachSummary || '').trim();
      const nextStepExplanation = parsed.nextStepExplanation
        ? String(parsed.nextStepExplanation).trim()
        : undefined;
      const nodeHints = parsed.nodeHints && typeof parsed.nodeHints === 'object' && !Array.isArray(parsed.nodeHints)
        ? (parsed.nodeHints as Record<string, string>)
        : undefined;
      return {
        coachSummary: coachSummary || 'Продолжайте по плану: закрепляйте узлы с низким баллом.',
        nextStepExplanation,
        nodeHints
      };
    } catch {
      return { coachSummary: '' };
    }
  }

  /**
   * Краткая выжимка урока (markdown), для кэша на canonical metadata.lesson.summary.
   */
  async generateLessonSummary(input: {
    subjectTitle: string;
    nodeTitle: string;
    lessonText: string;
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw AppError.badRequest('OPENAI_API_KEY is not set');
    }

    const body = input.lessonText.length > 12000 ? `${input.lessonText.slice(0, 12000)}\n\n[Текст обрезан.]` : input.lessonText;

    const prompt = [
      'По тексту урока составь очень краткую выжимку для ученика (до 900 символов).',
      'Формат ответа: только Markdown (заголовки ###, маркеры, без преамбулы «Конечно» и без JSON).',
      'Без общих советов про интернет и без тем вне этого урока.',
      '',
      `Предмет: ${input.subjectTitle}. Тема узла: ${input.nodeTitle}.`,
      '',
      'Текст урока:',
      body
    ].join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content:
              'Ты методист; пишешь только по переданному фрагменту урока. Ответ краткий, Markdown.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[roadmap AI] lesson summary failed', response.status, errText);
      throw new Error(`OpenAI: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return String(data.choices?.[0]?.message?.content ?? '').trim();
  }

  /**
   * Чат по одному узлу roadmap: контекст только урок + предмет; опционально изображения (base64).
   */
  async chatLessonNode(input: {
    subjectTitle: string;
    nodeTitle: string;
    nodeDescription?: string;
    lessonText: string;
    userMessage: string;
    images?: Array<{ mimeType: string; base64: string }>;
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw AppError.badRequest('OPENAI_API_KEY is not set');
    }

    const ctx = input.lessonText.length > 14000 ? `${input.lessonText.slice(0, 14000)}\n\n[Фрагмент обрезан.]` : input.lessonText;

    const system =
      'Ты репетитор по подготовке к ЕНТ. Отвечай только в рамках переданного контекста урока и темы узла. ' +
      'Не выдумывай факты из интернета и не расширяй тему на весь мир. Если вопрос касается только фото — опирайся на изображение и контекст темы. ' +
      'Язык ответа: как у сообщения ученика (русский/казахский и т.д.), если язык неочевиден — русский.';

    const contextBlock = [
      `Предмет: ${input.subjectTitle}`,
      `Узел (тема): ${input.nodeTitle}`,
      input.nodeDescription?.trim() ? `Описание узла: ${input.nodeDescription.trim()}` : '',
      '',
      'Текст урока (единственный допустимый источник теории):',
      ctx
    ]
      .filter(Boolean)
      .join('\n');

    type Part =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } };

    const userParts: Part[] = [{ type: 'text', text: `${contextBlock}\n\n---\nВопрос ученика:\n${input.userMessage}` }];

    for (const img of input.images ?? []) {
      const mime = img.mimeType.trim() || 'image/jpeg';
      userParts.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${img.base64}` }
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.45,
        max_tokens: 1800,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userParts }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[roadmap AI] lesson chat failed', response.status, errText);
      throw new Error(`OpenAI: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return String(data.choices?.[0]?.message?.content ?? '').trim();
  }
}

export const roadmapAIService = new RoadmapAIService();
