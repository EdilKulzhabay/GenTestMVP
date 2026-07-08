import crypto from 'crypto';
import {
  IGeneratedTest,
  IQuestion,
  IAIFeedback,
  IAssetCandidate,
  IContentForAI,
  IUserAnswer,
  IMistake,
  TestGenerationProfile,
  EntQuestionType,
} from '../types';
import {
  parseAndValidateEntQuestions,
  parseAndValidateRegularQuestions,
  parseRegularQuestionsLenient,
  parseEntQuestionsLenient,
  formatExpectedAnswer,
  summarizeUserAnswer,
} from '../utils/entQuestion.util';
import { extractFirstJsonObject } from '../utils/jsonExtract.util';
import { AppError } from '../utils';

/**
 * Пер-типовые правила полей для генерации вопросов банка по ОДНОЙ подтеме (KC).
 * Зеркалят форматы validateEntQuestion. text_input в банк по умолчанию НЕ включаем
 * (нечёткий грейдинг по ключевым словам → нечестный зачёт), но правило оставлено.
 */
const KC_TYPE_RULES: Record<EntQuestionType, string> = {
  single_choice:
    'single_choice — ровно 4 различных варианта в "options"; "correctOption" — дословно одна из options (ровно один однозначно верный). Дистракторы правдоподобны, без ловушек («всё перечисленное», «нет верного»).',
  multiple_choice:
    'multiple_choice — "options" 4–6 строк; "correctOptions" — массив из 2–3 строк, каждая входит в options; остальные — правдоподобные дистракторы.',
  matching_single:
    'matching_single (один-к-одному) — "matchingLeft" и "matchingRight" по 3–4 элемента вида {"id":"L1","text":"..."} (id уникальны внутри колонки); "correctMatching" {"L1":"R2",...} — каждый left id → ровно один right id, правые не повторяются.',
  matching_multiple:
    'matching_multiple (один-ко-многим) — "matchingLeft" 2–4, "matchingRight" 4–6 элементов; "correctMatching" {"L1":["R1","R3"],...} — непустые массивы right id из matchingRight.',
  short_answer:
    'short_answer — короткий однозначный ответ (число/слово/термин). "acceptableAnswers": массив 1–4 эквивалентных форм (напр. "4","четыре"). Без options.',
  text_input:
    'text_input — развёрнутый ответ. Задай проверку: "acceptableKeywords" (3–6 ключевых слов/фраз) или "referenceAnswer" (краткий образцовый ответ). Без options.',
};

/** Нормализуем запрошенный микс типов к ровному count (по умолчанию — все single_choice). */
function normalizeKcTypeMix(
  typeMix: Partial<Record<EntQuestionType, number>> | undefined,
  count: number
): Array<{ type: EntQuestionType; n: number }> {
  const entries = Object.entries(typeMix ?? {})
    .map(([t, n]) => ({ type: t as EntQuestionType, n: Math.max(0, Math.floor(Number(n) || 0)) }))
    .filter(e => e.n > 0);
  const total = entries.reduce((s, e) => s + e.n, 0);
  if (total === 0) return [{ type: 'single_choice', n: count }];
  // подгоняем сумму к count, добавляя/убавляя в крупнейшем бакете
  let diff = count - total;
  entries.sort((a, b) => b.n - a.n);
  while (diff !== 0 && entries.length) {
    const i = diff > 0 ? 0 : entries.findIndex(e => e.n > 0);
    if (i < 0) break;
    entries[i].n += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    entries.sort((a, b) => b.n - a.n);
  }
  return entries.filter(e => e.n > 0);
}

function pickQuestionsArray(parsed: Record<string, unknown>): unknown[] | null {
  const q = parsed.questions;
  if (Array.isArray(q)) return q;
  const inner = parsed.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const dq = (inner as Record<string, unknown>).questions;
    if (Array.isArray(dq)) return dq;
  }
  return null;
}

const ASSET_CATALOG_MAX = 50;

/** Секция промпта с каталогом ассетов in-scope тем (LLM-B). Пусто, если кандидатов нет. */
function assetCatalogLines(candidates?: IAssetCandidate[]): string[] {
  if (!candidates?.length) return [];
  const shown = candidates.slice(0, ASSET_CATALOG_MAX);
  const lines = shown.map(
    c =>
      `- id=${c.assetId} [${c.kind}]${c.topicTitle ? ` (тема: ${c.topicTitle})` : ''}: ${c.label}`
  );
  const out = [
    '',
    'МАТЕРИАЛЫ ТЕМЫ (ассеты). Если вопрос прямо опирается на конкретную таблицу/изображение/формулу/задачу из списка ниже, добавь в его relatedContent поле "assetIds": ["<id>", ...] — используй ТОЛЬКО id из этого списка, не выдумывай. Если вопрос не опирается на материал — не добавляй assetIds.',
    ...lines,
  ];
  if (candidates.length > ASSET_CATALOG_MAX) {
    out.push(`- (…ещё ${candidates.length - ASSET_CATALOG_MAX} материалов не показаны)`);
  }
  return out;
}

/** Защитный фильтр (анти-галлюцинация): оставляем только assetIds из набора кандидатов. */
function guardAssetIds(questions: IQuestion[], candidates?: IAssetCandidate[]): void {
  const allowed = new Set((candidates ?? []).map(c => c.assetId));
  for (const q of questions) {
    const ids = q.relatedContent?.assetIds;
    if (!ids?.length) continue;
    const filtered = [...new Set(ids.map(String).filter(id => allowed.has(id)))];
    q.relatedContent = { ...q.relatedContent, assetIds: filtered.length ? filtered : undefined };
  }
}

/**
 * AI SERVICE (MOCK)
 * Сервис для работы с AI (сейчас mock, готов к интеграции с OpenAI/LLM)
 *
 * Текущая реализация:
 * - Генерирует mock вопросы на основе контента
 * - Анализирует ответы и создает обратную связь
 *
 * Для production:
 * 1. Заменить mock логику на вызовы OpenAI API
 * 2. Использовать промпты для генерации качественных вопросов
 * 3. Добавить обработку rate limits и ошибок API
 * 4. Кешировать результаты где возможно
 */

class AIService {
  /**
   * Генерация теста на основе контента
   *
   * @param content - текстовый контент для генерации вопросов
   * @param metadata - метаданные о контенте (книга, глава и т.д.)
   * @param previousQuestions - хеши ранее сгенерированных вопросов для избежания повторений
   * @returns Сгенерированный тест с 10 вопросами
   *
   * TODO: Интегрировать с OpenAI API
   * Пример промпта:
   * "Generate 10 multiple-choice questions based on the following text.
   *  Each question should have 4 options with only one correct answer.
   *  Avoid these previously used questions: [previousQuestions]
   *  Format: JSON with questionText, options[], correctOption, explanation"
   */
  async generateTest(
    content: IContentForAI,
    _previousQuestions: string[] = [],
    testProfile: TestGenerationProfile = 'ent',
    options?: { questionCount?: number }
  ): Promise<IGeneratedTest> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined. Set it to enable real test generation.');
    }

    const profile: TestGenerationProfile = testProfile === 'regular' ? 'regular' : 'ent';
    const qc = options?.questionCount;
    if (profile === 'regular' && qc != null && (qc < 1 || qc > 50)) {
      throw AppError.badRequest('Обычный тест: укажите от 1 до 50 вопросов.');
    }
    if (profile === 'ent' && qc != null) {
      if (qc < 10 || qc > 120 || qc % 10 !== 0) {
        throw AppError.badRequest('Формат ЕНТ: от 10 до 120 вопросов, кратно 10.');
      }
      if (qc > 10) {
        return this.generateEntBatchedTest(content, _previousQuestions, qc);
      }
    }

    const expectedN = profile === 'regular' ? Math.min(50, Math.max(1, qc ?? 10)) : 10;

    const sourceContentHash = this.computeTestContentHash(content.text, profile, qc);

    const topicsList = content.metadata.topics?.length
      ? `- relatedContent.topicTitle — точное название темы из списка: [${content.metadata.topics.join(', ')}]. Если вопрос не привязан к конкретной теме, опусти topicTitle.`
      : '';

    const languageRule = content.metadata.contentLanguage?.trim()
      ? `- Язык полей questionText, всех вариантов/текстов заданий, aiExplanation и topicTitle: ${content.metadata.contentLanguage.trim()}. Не смешивай с другим языком.`
      : '- Язык вопросов, вариантов ответов и пояснений должен совпадать с языком приведённого учебного текста (например текст на казахском — весь вывод на казахском; на русском — на русском; на английском — на английском).';

    const focusN = profile === 'regular' ? expectedN : 10;
    const topicFocusHint = content.metadata.topicFocus?.trim()
      ? `- ВАЖНО: Все ${focusN} вопросов должны быть строго по теме «${content.metadata.topicFocus.trim()}» и опираться ТОЛЬКО на приведённый учебный текст. Если материала по теме мало — сократи охват вопросов, но НЕ добавляй сведения извне.`
      : '';

    // Анти-галлюцинации: жёсткое заземление на источник (применяется всегда).
    const groundingRule =
      '- Опирайся ИСКЛЮЧИТЕЛЬНО на приведённый ниже учебный текст. Запрещено добавлять факты, определения, формулы или примеры, которых нет в тексте. Каждый вопрос и его правильный ответ должны однозначно следовать из источника.';

    const regularN = expectedN;
    const regularSpec = [
      `Сгенерируй ровно ${regularN} вопросов по учебному материалу — обычный тест (классический формат, не смешанный ЕНТ).`,
      'Все задания одного типа: один верный ответ из четырёх вариантов.',
      `Формат ответа: один JSON-объект вида {"questions":[ ... ровно ${regularN} элементов ... ]} без Markdown.`,
      '',
      'Каждый элемент массива questions:',
      '- questionType: всегда строка "single_choice"',
      '- questionText: формулировка задания',
      '- options: ровно 4 строки — варианты ответа',
      '- correctOption: одна строка, дословно совпадающая с одним из options',
      '- aiExplanation: кратко 1–2 предложения',
      '- relatedContent: { "pages": [числа], "topicTitle"?: "..." } — pages обязателен (можно приблизительно).',
      topicsList,
      '- Если в контенте есть формулы LaTeX ($...$ или $$...$$), сохраняй их в текстах.',
      _previousQuestions.length > 0
        ? `- Избегай повторения смысла этих вопросов: ${_previousQuestions.join(' | ')}`
        : '',
      '',
      `КРИТИЧНО: массив questions ОБЯЗАТЕЛЬНО ровно из ${regularN} элементов. Не ${regularN - 1}, не ${
        regularN + 1
      } — ровно ${regularN}.`,
    ].join('\n');

    const entSpec = [
      'Ты — эксперт по подготовке к ЕНТ (Казахстан). Сгенерируй ровно 10 вопросов в форматах, приближённых к реальному ЕНТ.',
      'Формат ответа: один JSON-объект вида {"questions":[ ... ровно 10 элементов ... ]} без Markdown, без пояснений до или после JSON.',
      '',
      'РАСПРЕДЕЛЕНИЕ ПО ТИПАМ (строго по одному на каждый номер):',
      '1–3: single_choice — один верный ответ, 4–5 вариантов в поле options, correctOption — точная строка из options.',
      '4–5: multiple_choice — несколько верных, в options от 4 до 10 строк (по возможности не меньше 5), correctOptions — массив из 2–4 строк (каждая должна входить в options).',
      '6–7: matching_single — сопоставление «один к одному». matchingLeft и matchingRight: по 3–5 элементов { "id": "L1", "text": "..." }; id уникальны внутри колонки. correctMatching: объект { "L1": "R2", ... } — каждый ключ из matchingLeft, значение — id из matchingRight; каждый правый id используется ровно один раз.',
      '8: matching_multiple — один ко многим: matchingLeft 2–5 элементов, matchingRight 3–10. correctMatching: { "L1": ["R1","R3"], ... } — непустые массивы id из matchingRight.',
      '9: short_answer — короткий ответ (число или слово). Поля: acceptableAnswers: массив из 1–5 эквивалентных форм (например "4", "четыре"). Без options.',
      '10: text_input — развёрнутый ввод. Обязательно задай проверку: acceptableKeywords (3–6 ключевых слов/фраз) ИЛИ acceptableAnswers (2–4 эталонных фрагмента) ИЛИ referenceAnswer (краткий образцовый ответ). Без options.',
      '',
      'Общие поля каждого объекта вопроса:',
      '- questionType: одно из: single_choice | multiple_choice | matching_single | matching_multiple | short_answer | text_input',
      '- questionText: формулировка задания',
      '- aiExplanation: 1–2 предложения пояснения после ответа (обязательно у каждого вопроса; не пустая строка). Допустимо поле explanation как синоним — сервер примет, но лучше aiExplanation.',
      '- relatedContent: { "pages": [числа], "topicTitle"?: "..." } — pages обязателен (можно приблизительно).',
      topicsList,
      '- Если в контенте есть формулы LaTeX ($...$ или $$...$$), сохраняй их в текстах.',
      _previousQuestions.length > 0
        ? `- Избегай повторения смысла этих вопросов: ${_previousQuestions.join(' | ')}`
        : '',
      '',
      'КРИТИЧНО: массив questions ОБЯЗАТЕЛЬНО ровно из 10 элементов (индексы 0–9). Не 9, не 11 — только 10.',
    ].join('\n');

    const specBody = profile === 'regular' ? regularSpec : entSpec;
    const prompt = [
      specBody,
      ...assetCatalogLines(content.assetCandidates),
      '',
      'Требования:',
      groundingRule,
      languageRule,
      topicFocusHint,
      '',
      'Контент для генерации:',
      content.text,
    ]
      .filter(Boolean)
      .join('\n');

    const contentPreview =
      content.text.length > 800 ? `${content.text.slice(0, 800)}...` : content.text;

    const systemContent =
      profile === 'regular'
        ? `Ты составляешь обычные тесты по учебнику: ровно ${expectedN} вопросов с четырьмя вариантами и одним верным ответом. Ответь одним JSON-объектом с ключом questions; без Markdown и без текста вне JSON.`
        : 'Ты генерируешь проверочные задания по учебному контенту в форматах, приближённых к ЕНТ (Казахстан): один и несколько верных ответов, сопоставление, короткий и развёрнутый ответ. Ответь одним JSON-объектом с ключом questions — массив из ровно 10 элементов; без Markdown и без текста вне JSON.';

    const max_tokens = profile === 'regular' ? Math.min(12000, 1500 + expectedN * 500) : 16000;

    console.log('🤖 [AI] generateTest:start', {
      model: 'gpt-4o-mini',
      profile,
      subject: content.metadata.subjectTitle,
      book: content.metadata.bookTitle,
      chapter: content.metadata.chapterTitle ?? 'Вся книга',
      topicsCount: content.metadata.topics.length,
      contentChars: content.text.length,
      contentHash: sourceContentHash,
      previousQuestionsCount: _previousQuestions.length,
    });
    console.log('🤖 [AI] prompt:begin');
    console.log(prompt);
    console.log('🤖 [AI] prompt:end');
    console.log('🤖 [AI] contentPreview', contentPreview);

    type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
    const chatMessages: ChatMsg[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt },
    ];

    let questions: IQuestion[] | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.openAiJsonCompletion(
        apiKey,
        chatMessages,
        max_tokens,
        attempt === 0 ? 0.45 : 0.2
      );
      console.log('🤖 [AI] response:raw', raw);

      const jsonStr = extractFirstJsonObject(raw);
      if (!jsonStr) {
        console.error('🤖 [AI] response:parse-error', {
          attempt: attempt + 1,
          rawPreview: raw.slice(0, 500),
        });
        if (attempt === 1) {
          throw new Error('OpenAI response does not contain a parseable JSON object.');
        }
        chatMessages.push(
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `Ответ не удалось разобрать как JSON-объект. Верни один JSON-объект с ключом questions (массив из ровно ${expectedN} элементов), без текста до или после.`,
          }
        );
        continue;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      } catch (e) {
        console.error('🤖 [AI] response:json-parse', { attempt: attempt + 1, error: e });
        if (attempt === 1) {
          throw new Error('OpenAI response is not valid JSON.');
        }
        chatMessages.push(
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content:
              'JSON синтаксически неверен. Исправь и верни один корректный JSON-объект с ключом questions.',
          }
        );
        continue;
      }

      const rawQuestions = pickQuestionsArray(parsed);
      if (!rawQuestions) {
        console.error('🤖 [AI] response:no-questions-array', {
          attempt: attempt + 1,
          keys: Object.keys(parsed),
        });
        if (attempt === 1) {
          throw new Error('OpenAI JSON must contain root key "questions" (array).');
        }
        chatMessages.push(
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `В JSON нет массива questions в корне. Верни объект вида {"questions":[ ... ]} с ровно ${expectedN} вопросами.`,
          }
        );
        continue;
      }

      const n = rawQuestions.length;
      if (n !== expectedN) {
        console.warn('🤖 [AI] questions:wrong-length', { attempt: attempt + 1, profile, count: n });
        if (attempt === 1) {
          throw new Error(
            profile === 'regular'
              ? `Обычный тест: ожидалось ровно ${expectedN} вопросов, получено ${n}.`
              : `OpenAI response: ожидалось ровно 10 вопросов, получено ${n}. Проверьте промпт и повторите запрос.`
          );
        }
        const fixMsg =
          profile === 'regular'
            ? `В твоём JSON массив questions содержит ${n} элементов, а нужно РОВНО ${expectedN}. Верни полный JSON-объект: ${expectedN} вопросов, каждый single_choice с ровно 4 вариантами.`
            : `В твоём JSON массив questions содержит ${n} элементов, а нужно РОВНО 10 по схеме ЕНТ (номера 1–10 и типы как в задании выше). Верни полный JSON-объект с ключом questions длиной 10 — допиши недостающие вопросы или пересобери массив целиком.`;
        chatMessages.push({ role: 'assistant', content: raw }, { role: 'user', content: fixMsg });
        continue;
      }

      try {
        questions =
          profile === 'regular'
            ? parseAndValidateRegularQuestions(rawQuestions, expectedN)
            : parseAndValidateEntQuestions(rawQuestions);
        break;
      } catch (e) {
        console.error('🤖 [AI] response:invalid-questions', {
          attempt: attempt + 1,
          profile,
          error: e,
          questionsCount: n,
        });
        if (attempt === 1) {
          throw e instanceof Error ? e : new Error('Invalid questions from model.');
        }
        chatMessages.push(
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `Массив из ${expectedN} элементов есть, но проверка не прошла: ${
              e instanceof Error ? e.message : String(e)
            }. Исправь структуру каждого вопроса и верни полный JSON с questions (ровно ${expectedN} элементов).`,
          }
        );
      }
    }

    if (!questions) {
      throw new Error('Не удалось сгенерировать вопросы после повторной попытки.');
    }

    for (const question of questions) {
      if (!question.relatedContent?.pages?.length) {
        question.relatedContent = { ...question.relatedContent, pages: [1] };
      }
    }
    guardAssetIds(questions, content.assetCandidates);

    console.log('🤖 [AI] generateTest:done', { questionsCount: questions.length });
    return { questions, sourceContentHash };
  }

  /**
   * Несколько подряд серий по 10 вопросов (ЕНТ) без дублирования смысла между сериями.
   */
  private async generateEntBatchedTest(
    content: IContentForAI,
    _previousQuestions: string[],
    total: number
  ): Promise<IGeneratedTest> {
    const batches = total / 10;
    const all: IQuestion[] = [];
    let prev = [..._previousQuestions];
    for (let b = 0; b < batches; b++) {
      const paddedContent: IContentForAI =
        batches > 1 && b > 0
          ? {
              ...content,
              text: `${content.text}\n\n(Продолжение: серия ${b + 1} из ${batches}, по 10 вопросов в формате ЕНТ. Не повторяй смыслы вопросов из предыдущих серий; опирайся на другие разделы и факты учебного материала.)`,
            }
          : content;
      const part = await this.generateTest(paddedContent, prev, 'ent');
      all.push(...part.questions);
      prev = [...prev, ...part.questions.map(q => Buffer.from(q.questionText).toString('base64'))];
    }
    for (const question of all) {
      if (!question.relatedContent?.pages?.length) {
        question.relatedContent = { ...question.relatedContent, pages: [1] };
      }
    }
    const sourceContentHash = this.computeTestContentHash(content.text, 'ent', total);
    return { questions: all, sourceContentHash };
  }

  /**
   * Банк вопросов: генерация проверочных вопросов строго по одному компоненту знания (KC),
   * заземлённых на переданный текст источника. По умолчанию single_choice; если задан typeMix —
   * генерит смешанные ENT-типы (single/multiple/matching/short/text). Возвращает провалидированные IQuestion.
   */
  async generateKcQuestions(input: {
    nodeTitle: string;
    kcTitle: string;
    kcDescription?: string;
    sourceText: string;
    language?: string;
    count: number;
    difficulty: number;
    typeMix?: Partial<Record<EntQuestionType, number>>;
    assetCandidates?: IAssetCandidate[];
  }): Promise<IQuestion[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not defined.');

    const count = Math.min(10, Math.max(1, input.count));
    const body =
      input.sourceText.length > 14000
        ? `${input.sourceText.slice(0, 14000)}\n[обрезано]`
        : input.sourceText;
    const langRule = input.language?.trim()
      ? `Язык вопросов/вариантов/пояснений: ${input.language.trim()}.`
      : 'Язык — как у текста источника.';
    const diffWord =
      input.difficulty <= 2 ? 'базовая' : input.difficulty >= 4 ? 'повышенная' : 'средняя';

    const mix = normalizeKcTypeMix(input.typeMix, count);
    const isMixed = mix.length > 1 || mix[0].type !== 'single_choice';

    const common = [
      `Подтема (компонент знания): «${input.kcTitle}»${input.kcDescription ? ` — ${input.kcDescription}` : ''}.`,
      `Тема: «${input.nodeTitle}». Сложность: ${diffWord}.`,
      'Требования:',
      '- Опирайся ИСКЛЮЧИТЕЛЬНО на текст источника ниже. НЕ добавляй фактов, которых там нет.',
      '- Каждый вопрос строго в рамках указанной подтемы; правильный ответ однозначно следует из источника.',
      '- questionText — законченный вопрос-предложение (не короче 15 символов), без сокращений.',
      '- aiExplanation: 1–2 предложения. relatedContent: { "pages": [числа] } (можно приблизительно).',
    ];

    const prompt = isMixed
      ? [
          `Сгенерируй ровно ${count} проверочных вопросов СМЕШАННЫХ типов по ОДНОЙ подтеме.`,
          ...common,
          'Состав по типам (создай ровно столько каждого типа):',
          ...mix.map(m => `- ${m.type}: ${m.n}`),
          '- В каждом вопросе явно укажи "questionType".',
          'Форматы полей по типам:',
          ...mix.map(m => `- ${KC_TYPE_RULES[m.type]}`),
          langRule,
          ...assetCatalogLines(input.assetCandidates),
          `Формат ответа: один JSON-объект {"questions":[ ... ровно ${count} ... ]} без Markdown.`,
          '',
          'Текст источника:',
          body,
        ].join('\n')
      : [
          `Сгенерируй ровно ${count} проверочных вопросов (single_choice) по ОДНОЙ подтеме.`,
          ...common,
          '- questionType: "single_choice"; options: ровно 4 строки; correctOption — дословно одна из options.',
          '- Дистракторы (неверные варианты): правдоподобные, из той же темы/текста, сопоставимой длины и стиля с верным; все 4 варианта различны; ровно один однозначно верный.',
          '- Запрещены варианты-«ловушки» вида «всё перечисленное», «нет верного ответа», «оба варианта».',
          langRule,
          ...assetCatalogLines(input.assetCandidates),
          `Формат ответа: один JSON-объект {"questions":[ ... ровно ${count} ... ]} без Markdown.`,
          '',
          'Текст источника:',
          body,
        ].join('\n');

    const messages = [
      {
        role: 'system' as const,
        content:
          'Ты составляешь тестовые задания строго по переданному фрагменту. Ответ — строгий JSON с ключом questions.',
      },
      { role: 'user' as const, content: prompt },
    ];

    const raw = await this.openAiJsonCompletion(
      apiKey,
      messages,
      Math.min(8000, 1400 + count * 500),
      0.4
    );
    const jsonStr = extractFirstJsonObject(raw);
    if (!jsonStr) throw new Error('generateKcQuestions: no JSON in response');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const arr = pickQuestionsArray(parsed);
    if (!arr) throw new Error('generateKcQuestions: no questions array');
    // Банк: best-effort — оставляем валидные вопросы, битые отбрасываем (а не валим весь батч).
    const questions = isMixed ? parseEntQuestionsLenient(arr) : parseRegularQuestionsLenient(arr);
    for (const q of questions) {
      if (!q.relatedContent?.pages?.length) q.relatedContent = { ...q.relatedContent, pages: [1] };
    }
    guardAssetIds(questions, input.assetCandidates);
    return questions;
  }

  /**
   * Верификация вопроса банка (LLM-judge, анти-галлюцинации):
   * корректен ли заявленный правильный ответ и однозначно ли он следует из источника.
   */
  async verifyQuestionItem(input: {
    question: IQuestion;
    sourceText: string;
  }): Promise<{ ok: boolean; reason?: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: true }; // без ключа верификацию не делаем (не блокируем поток)

    const q = input.question;
    const body =
      input.sourceText.length > 12000
        ? `${input.sourceText.slice(0, 12000)}\n[обрезано]`
        : input.sourceText;
    const correct = formatExpectedAnswer(q) || q.correctOption || '';
    const matchingCtx =
      q.matchingLeft?.length && q.matchingRight?.length
        ? `Левый столбец: ${q.matchingLeft.map(x => `${x.id}:${x.text}`).join(' | ')}\nПравый столбец: ${q.matchingRight
            .map(x => `${x.id}:${x.text}`)
            .join(' | ')}`
        : '';
    const prompt = [
      'Проверь тестовый вопрос на ФАКТИЧЕСКУЮ корректность относительно текста источника.',
      'Верни строгий JSON: { "ok": true|false, "reason": "кратко" }.',
      'Задача — отсеять только реально плохие вопросы (галлюцинации, неверный ключ). Не придирайся к стилю и типу.',
      'ok=true, если выполнены ОБА условия:',
      '  (1) заявленный правильный ответ фактически верен;',
      '  (2) он не противоречит источнику и не опирается на факты, которых в источнике явно нет.',
      'ok=false ставь только при ЯВНОЙ проблеме: ключ неверен, либо другой вариант очевидно тоже полностью верен,',
      'либо ответа в источнике нет вовсе. В сомнительных/пограничных случаях ставь ok=true.',
      '',
      `Тип вопроса: ${q.questionType ?? 'single_choice'}`,
      `Вопрос: ${q.questionText}`,
      q.options?.length ? `Варианты: ${q.options.join(' | ')}` : '',
      matchingCtx,
      `Заявленный правильный ответ: ${correct}`,
      '',
      'Текст источника:',
      body,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const raw = await this.openAiJsonCompletion(
        apiKey,
        [
          {
            role: 'system',
            content: 'Ты строгий рецензент тестовых заданий. Отвечай строгим JSON.',
          },
          { role: 'user', content: prompt },
        ],
        400,
        0.0
      );
      const jsonStr = extractFirstJsonObject(raw);
      if (!jsonStr) return { ok: false, reason: 'verifier: no JSON' };
      const parsed = JSON.parse(jsonStr) as { ok?: unknown; reason?: unknown };
      return {
        ok: parsed.ok === true,
        ...(typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
      };
    } catch (e) {
      console.warn('[AI] verifyQuestionItem failed', e);
      return { ok: false, reason: 'verifier error' };
    }
  }

  /**
   * Анализ ответов пользователя и генерация обратной связи
   *
   * @param test - тест с правильными ответами
   * @param userAnswers - ответы пользователя
   * @param content - контент для ссылок на материал
   * @returns AI обратная связь с анализом ошибок
   *
   * TODO: Интегрировать с OpenAI для персонализированной обратной связи
   * Пример промпта:
   * "Analyze the student's answers and provide personalized feedback.
   *  Identify weak areas and suggest specific sections to review.
   *  Be encouraging but point out areas for improvement."
   */
  async analyzeAnswers(
    correctAnswers: Array<{
      question: string;
      correctSummary: string;
      explanation: string;
      relatedContent?: { pages?: number[]; topicTitle?: string };
    }>,
    userAnswers: IUserAnswer[],
    contentMetadata: IContentForAI['metadata']
  ): Promise<IAIFeedback> {
    // Симуляция задержки API
    await this.delay(800);

    // Подсчитываем правильные ответы
    const correctCount = userAnswers.filter(a => a.isCorrect).length;
    const totalCount = userAnswers.length;
    const scorePercent = Math.round((correctCount / totalCount) * 100);

    // Анализируем ошибки
    const mistakes: IMistake[] = [];

    for (let i = 0; i < userAnswers.length; i++) {
      const userAnswer = userAnswers[i];
      const correctAnswer = correctAnswers[i];

      if (!userAnswer.isCorrect) {
        const mistake: IMistake = {
          question: userAnswer.question,
          explanation: `Ваш ответ: ${summarizeUserAnswer(userAnswer.selectedOption)}. Ожидается: ${correctAnswer.correctSummary}. ${correctAnswer.explanation}`,
        };
        if (contentMetadata.bookTitle?.trim()) {
          const rcPages = correctAnswer.relatedContent?.pages;
          const pages = rcPages && rcPages.length > 0 ? rcPages : [1];
          mistake.whereToRead = {
            bookTitle: contentMetadata.bookTitle,
            chapterTitle: contentMetadata.chapterTitle || 'Вся книга',
            pages,
            topicTitle: correctAnswer.relatedContent?.topicTitle,
          };
        }
        mistakes.push(mistake);
      }
    }

    // Генерируем общий вывод
    let summary = '';

    if (scorePercent >= 90) {
      summary = `Отличная работа! Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Вы демонстрируете отличное понимание материала по теме "${contentMetadata.bookTitle}".`;
    } else if (scorePercent >= 70) {
      summary = `Хороший результат! Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Рекомендуем повторить материал по темам, где были допущены ошибки.`;
    } else if (scorePercent >= 50) {
      summary = `Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Необходимо более внимательно изучить материал. Обратите особое внимание на разделы, указанные в ошибках ниже.`;
    } else {
      summary = `Вы ответили правильно на ${correctCount} из ${totalCount} вопросов (${scorePercent}%). Рекомендуем полностью перечитать главу "${contentMetadata.chapterTitle || contentMetadata.bookTitle}" и попробовать пройти тест снова.`;
    }

    if (mistakes.length > 0) {
      summary += ` Всего допущено ошибок: ${mistakes.length}. Подробный разбор ошибок представлен ниже.`;
    }

    return {
      summary,
      mistakes,
    };
  }

  /**
   * Перефразирование вопроса для избежания повторений
   * Используется когда вопрос уже задавался ранее
   *
   * TODO: Интегрировать с OpenAI
   */
  async rephraseQuestion(originalQuestion: string): Promise<string> {
    await this.delay(300);

    // Mock перефразирование
    return `[Перефразировано] ${originalQuestion}`;
  }

  /**
   * Вспомогательные методы
   */

  private async openAiJsonCompletion(
    apiKey: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    max_tokens: number,
    temperature: number
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature,
        max_tokens,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🤖 [AI] response:error', { status: response.status, errorText });
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Единый хэш контента теста — источник правды для кэша.
   * ВАЖНО: должен возвращать ровно тот же хэш, что и generateTest/generateEntBatchedTest,
   * чтобы предгенерационный поиск в кэше совпадал с тем, под которым тест сохранится.
   */
  computeTestContentHash(
    text: string,
    profile: TestGenerationProfile = 'ent',
    questionCount?: number
  ): string {
    const p: TestGenerationProfile = profile === 'regular' ? 'regular' : 'ent';
    if (p === 'ent' && questionCount != null && questionCount > 10) {
      return this.hashContent(JSON.stringify({ v: 3, profile: 'ent', n: questionCount, text }));
    }
    const expectedN = p === 'regular' ? Math.min(50, Math.max(1, questionCount ?? 10)) : 10;
    return this.hashContent(JSON.stringify({ v: 4, profile: p, n: expectedN, text }));
  }

  /**
   * Создание хеша контента для кеширования тестов
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Симуляция задержки API
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Проверка, не повторяется ли вопрос
   * Сравнивает хеш нового вопроса с предыдущими
   */
  isQuestionDuplicate(questionText: string, previousHashes: string[]): boolean {
    const questionHash = Buffer.from(questionText).toString('base64');
    return previousHashes.includes(questionHash);
  }

  /**
   * Создание хеша вопроса
   */
  hashQuestion(questionText: string): string {
    return Buffer.from(questionText).toString('base64');
  }
}

// Singleton паттерн для AI сервиса
export const aiService = new AIService();

/**
 * INTEGRATION GUIDE для замены на реальный AI:
 *
 * 1. Установить OpenAI SDK:
 *    npm install openai
 *
 * 2. Добавить в .env:
 *    OPENAI_API_KEY=your_api_key
 *
 * 3. Заменить методы generateTest и analyzeAnswers:
 *
 * import { Configuration, OpenAIApi } from 'openai';
 *
 * const configuration = new Configuration({
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * const openai = new OpenAIApi(configuration);
 *
 * async generateTest(content, previousQuestions) {
 *   const response = await openai.createChatCompletion({
 *     model: "gpt-4",
 *     messages: [{
 *       role: "system",
 *       content: "You are an educational test generator..."
 *     }, {
 *       role: "user",
 *       content: `Generate 10 questions based on: ${content.text}...`
 *     }],
 *     temperature: 0.7,
 *   });
 *
 *   return JSON.parse(response.data.choices[0].message.content);
 * }
 */
