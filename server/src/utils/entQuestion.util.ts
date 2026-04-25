import type { EntQuestionType, IMatchingItem, IQuestion, IRelatedContent } from '../types';

export const ENT_QUESTION_TYPES: EntQuestionType[] = [
  'single_choice',
  'multiple_choice',
  'matching_single',
  'matching_multiple',
  'short_answer',
  'text_input'
];

export function getQuestionType(q: Partial<IQuestion>): EntQuestionType {
  const t = (q as { questionType?: string }).questionType;
  if (t && ENT_QUESTION_TYPES.includes(t as EntQuestionType)) return t as EntQuestionType;
  return 'single_choice';
}

export function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.trim();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x.trim());
    }
  }
  return out;
}

function setsEqualStrings(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map(normText).sort();
  const sb = [...b].map(normText).sort();
  return sa.every((v, i) => v === sb[i]);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseJsonArray(raw: string): unknown[] | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Сводка правильного ответа для UI и AI-разбора */
export function formatExpectedAnswer(q: IQuestion): string {
  const qt = getQuestionType(q);
  switch (qt) {
    case 'single_choice':
      return q.correctOption ?? '';
    case 'multiple_choice':
      return (q.correctOptions ?? []).join('; ');
    case 'matching_single': {
      const cm = q.correctMatching ?? {};
      const left = q.matchingLeft ?? [];
      const right = q.matchingRight ?? [];
      const lines = Object.keys(cm).map((lid) => {
        const lt = left.find((x) => x.id === lid)?.text ?? lid;
        const rid = cm[lid] as string;
        const rt = right.find((x) => x.id === rid)?.text ?? rid;
        return `${lt} → ${rt}`;
      });
      return lines.join(' | ');
    }
    case 'matching_multiple': {
      const cm = q.correctMatching ?? {};
      const left = q.matchingLeft ?? [];
      const right = q.matchingRight ?? [];
      const lines = Object.keys(cm).map((lid) => {
        const lt = left.find((x) => x.id === lid)?.text ?? lid;
        const rids = cm[lid] as string[];
        const rt = (rids || []).map((rid) => right.find((x) => x.id === rid)?.text ?? rid).join(', ');
        return `${lt} → [${rt}]`;
      });
      return lines.join(' | ');
    }
    case 'short_answer':
      return (q.acceptableAnswers ?? []).join(' или ');
    case 'text_input':
      return (
        q.referenceAnswer?.trim() ||
        (q.acceptableAnswers ?? []).join(' / ') ||
        (q.acceptableKeywords ?? []).join(', ')
      );
    default:
      return '';
  }
}

/**
 * Значение для `selectedOption` / состояния ввода на клиенте (как при отправке теста).
 * Включать в ответ API только в dev (вместе с correctAnswerHint).
 */
export function clientPrefillValueForQuestion(q: IQuestion): string {
  const qt = getQuestionType(q);
  switch (qt) {
    case 'single_choice':
      return (q.correctOption ?? '').trim();
    case 'multiple_choice': {
      const co = (q.correctOptions ?? []).filter((x) => String(x).trim());
      if (co.length === 0) return '';
      return JSON.stringify([...co].map(String).sort());
    }
    case 'matching_single':
    case 'matching_multiple': {
      const cm = q.correctMatching;
      if (!cm || typeof cm !== 'object') return '';
      return JSON.stringify(cm);
    }
    case 'short_answer': {
      const a = (q.acceptableAnswers ?? []).find((x) => String(x).trim());
      return a ? String(a).trim() : '';
    }
    case 'text_input': {
      const ref = (q.referenceAnswer ?? '').trim();
      if (ref) return ref;
      const aa = (q.acceptableAnswers ?? []).find((x) => String(x).trim());
      if (aa) return String(aa).trim();
      const kw = (q.acceptableKeywords ?? []).find((x) => String(x).trim());
      return kw ? String(kw).trim() : '';
    }
    default:
      return (q.correctOption ?? '').trim();
  }
}

/** Кратко показать ответ пользователя в тексте ошибки */
export function summarizeUserAnswer(selectedOption: string): string {
  const t = selectedOption.trim();
  if (!t) return '(пусто)';
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const v = JSON.parse(t) as unknown;
      if (Array.isArray(v)) return v.join(', ');
      if (v && typeof v === 'object') return JSON.stringify(v);
    } catch {
      /* fallthrough */
    }
  }
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

export function gradeAnswer(question: IQuestion, selectedOption: string): boolean {
  const qt = getQuestionType(question);
  const raw = selectedOption.trim();

  switch (qt) {
    case 'single_choice': {
      const co = question.correctOption?.trim() ?? '';
      return normText(raw) === normText(co);
    }
    case 'multiple_choice': {
      const arr = parseJsonArray(raw);
      if (!arr || !arr.every((x) => typeof x === 'string')) return false;
      const user = (arr as string[]).map((x) => x.trim());
      const correct = question.correctOptions ?? [];
      return setsEqualStrings(user, correct);
    }
    case 'matching_single': {
      const userObj = parseJsonObject(raw);
      const correct = question.correctMatching ?? {};
      if (!userObj) return false;
      const keys = Object.keys(correct);
      if (keys.length !== Object.keys(userObj).length) return false;
      return keys.every((k) => {
        const cv = correct[k];
        const uv = userObj[k];
        return typeof cv === 'string' && typeof uv === 'string' && normText(cv) === normText(uv);
      });
    }
    case 'matching_multiple': {
      const userObj = parseJsonObject(raw);
      const correct = question.correctMatching ?? {};
      if (!userObj) return false;
      const keys = Object.keys(correct);
      if (keys.length !== Object.keys(userObj).length) return false;
      for (const k of keys) {
        const cVal = correct[k];
        const uVal = userObj[k];
        if (!Array.isArray(cVal) || !Array.isArray(uVal)) return false;
        if (!cVal.every((x) => typeof x === 'string') || !uVal.every((x) => typeof x === 'string')) {
          return false;
        }
        if (!setsEqualStrings(cVal as string[], uVal as string[])) return false;
      }
      return true;
    }
    case 'short_answer': {
      const user = normText(raw);
      const ok = question.acceptableAnswers ?? [];
      return ok.some((a) => normText(a) === user || user.includes(normText(a)));
    }
    case 'text_input': {
      const user = normText(raw);
      if (user.length < 2) return false;
      const answers = question.acceptableAnswers ?? [];
      if (answers.some((a) => normText(a) === user || user.includes(normText(a)))) return true;
      const kws = question.acceptableKeywords ?? [];
      if (kws.length > 0) {
        const hit = kws.filter((k) => user.includes(normText(k))).length;
        return hit >= Math.min(kws.length, Math.max(1, Math.ceil(kws.length * 0.6)));
      }
      const ref = question.referenceAnswer?.trim();
      if (ref) {
        const nr = normText(ref);
        return user === nr || (nr.length > 4 && (user.includes(nr) || nr.includes(user)));
      }
      return false;
    }
    default:
      return false;
  }
}

export function sanitizeQuestionForClient(q: IQuestion): Record<string, unknown> {
  const qt = getQuestionType(q);
  const base: Record<string, unknown> = {
    questionType: qt,
    questionText: q.questionText,
    relatedContent: q.relatedContent
  };
  switch (qt) {
    case 'single_choice':
      base.options = q.options ?? [];
      break;
    case 'multiple_choice':
      base.options = q.options ?? [];
      break;
    case 'matching_single':
    case 'matching_multiple':
      base.matchingLeft = q.matchingLeft ?? [];
      base.matchingRight = q.matchingRight ?? [];
      break;
    case 'short_answer':
      break;
    case 'text_input':
      break;
    default:
      break;
  }
  return base;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function validateMatchingItems(label: string, items: IMatchingItem[] | undefined, min: number, max: number) {
  assert(items && items.length >= min && items.length <= max, `${label}: ожидается ${min}–${max} элементов`);
  const ids = items.map((x) => x.id?.trim()).filter(Boolean);
  assert(ids.length === items.length, `${label}: у каждого элемента нужен id`);
  assert(uniqStrings(ids as string[]).length === ids.length, `${label}: id должны быть уникальными`);
}

/** LLM иногда пишет explanation вместо aiExplanation или оставляет пусто */
function pickAiExplanation(o: Record<string, unknown>): string {
  const candidates = [o.aiExplanation, o.explanation, o.ai_explanation, o.feedback];
  for (const c of candidates) {
    const v = String(c ?? '').trim();
    if (v.length >= 3) return v;
  }
  return 'Краткое пояснение см. в соответствующем разделе учебника по этой теме.';
}

/** Проверка и нормализация одного вопроса после парсинга JSON от LLM */
export function validateEntQuestion(q: unknown, index: number): IQuestion {
  const o = q as Record<string, unknown>;
  const qt = (o.questionType as EntQuestionType) || 'single_choice';
  assert(ENT_QUESTION_TYPES.includes(qt), `Вопрос ${index + 1}: неверный questionType`);

  const questionText = String(o.questionText ?? '').trim();
  assert(questionText.length >= 5, `Вопрос ${index + 1}: слишком короткий questionText`);

  const aiExplanation = pickAiExplanation(o);

  const rc = (o.relatedContent as Record<string, unknown>) || {};
  const pages = Array.isArray(rc.pages) ? rc.pages.map((p) => Number(p)).filter((n) => !Number.isNaN(n)) : [];
  const relatedContent = {
    pages: pages.length ? pages : [1],
    topicTitle: rc.topicTitle != null ? String(rc.topicTitle) : undefined
  } as IQuestion['relatedContent'];

  const base: IQuestion = {
    questionType: qt,
    questionText,
    aiExplanation,
    relatedContent
  };

  if (qt === 'single_choice') {
    const options = (o.options as string[])?.map((x) => String(x).trim()).filter(Boolean) ?? [];
    assert(options.length >= 4 && options.length <= 5, `Вопрос ${index + 1}: single_choice — 4–5 вариантов`);
    const correctOption = String(o.correctOption ?? '').trim();
    assert(options.includes(correctOption), `Вопрос ${index + 1}: correctOption должен быть из options`);
    return { ...base, options, correctOption };
  }

  if (qt === 'multiple_choice') {
    const options = (o.options as string[])?.map((x) => String(x).trim()).filter(Boolean) ?? [];
    /** 4–10: как single_choice, модель иногда даёт ровно 4 варианта */
    assert(
      options.length >= 4 && options.length <= 10,
      `Вопрос ${index + 1}: multiple_choice — от 4 до 10 вариантов (сейчас ${options.length})`
    );
    const correctOptions = ((o.correctOptions as string[]) ?? []).map((x) => String(x).trim()).filter(Boolean);
    assert(correctOptions.length >= 2, `Вопрос ${index + 1}: минимум 2 правильных варианта`);
    assert(correctOptions.every((c) => options.includes(c)), `Вопрос ${index + 1}: correctOptions ⊆ options`);
    return { ...base, options, correctOptions: uniqStrings(correctOptions) };
  }

  if (qt === 'matching_single') {
    const matchingLeft = (o.matchingLeft as IMatchingItem[]) ?? [];
    const matchingRight = (o.matchingRight as IMatchingItem[]) ?? [];
    validateMatchingItems('matchingLeft', matchingLeft, 3, 5);
    validateMatchingItems('matchingRight', matchingRight, 3, 6);
    const correctMatching = o.correctMatching as Record<string, string>;
    assert(correctMatching && typeof correctMatching === 'object', `Вопрос ${index + 1}: нужен correctMatching`);
    const leftIds = matchingLeft.map((x) => x.id);
    assert(
      leftIds.every((id) => typeof correctMatching[id] === 'string'),
      `Вопрос ${index + 1}: для каждого left id нужна пара в correctMatching`
    );
    const rightIds = matchingRight.map((x) => x.id);
    const usedRight: string[] = [];
    for (const lid of leftIds) {
      const rid = correctMatching[lid];
      assert(rightIds.includes(rid), `Вопрос ${index + 1}: значение correctMatching должно быть id из matchingRight`);
      usedRight.push(rid);
    }
    assert(
      uniqStrings(usedRight).length === usedRight.length,
      `Вопрос ${index + 1}: matching_single — каждый правый вариант не более одного раза`
    );
    return { ...base, matchingLeft, matchingRight, correctMatching };
  }

  if (qt === 'matching_multiple') {
    const matchingLeft = (o.matchingLeft as IMatchingItem[]) ?? [];
    const matchingRight = (o.matchingRight as IMatchingItem[]) ?? [];
    /** Левая колонка 2–5; правая 3–10 — LLM часто даёт 3 пункта справа */
    validateMatchingItems('matchingLeft', matchingLeft, 2, 5);
    validateMatchingItems('matchingRight', matchingRight, 3, 10);
    const correctMatching = o.correctMatching as Record<string, string[]>;
    assert(
      correctMatching && typeof correctMatching === 'object' && !Array.isArray(correctMatching),
      `Вопрос ${index + 1}: нужен correctMatching`
    );
    const leftIds = matchingLeft.map((x) => x.id);
    const rightIds = matchingRight.map((x) => x.id);
    for (const lid of leftIds) {
      const arr = correctMatching[lid];
      assert(Array.isArray(arr) && arr.length >= 1, `Вопрос ${index + 1}: для ${lid} нужен непустой массив правых id`);
      assert(arr.every((rid) => typeof rid === 'string' && rightIds.includes(rid)), `Вопрос ${index + 1}: неверные right id`);
    }
    return { ...base, matchingLeft, matchingRight, correctMatching };
  }

  if (qt === 'short_answer') {
    const acceptableAnswers = ((o.acceptableAnswers as string[]) ?? []).map((x) => String(x).trim()).filter(Boolean);
    assert(acceptableAnswers.length >= 1, `Вопрос ${index + 1}: short_answer — нужен acceptableAnswers`);
    return { ...base, acceptableAnswers: uniqStrings(acceptableAnswers) };
  }

  if (qt === 'text_input') {
    const acceptableAnswers = ((o.acceptableAnswers as string[]) ?? []).map((x) => String(x).trim()).filter(Boolean);
    const acceptableKeywords = ((o.acceptableKeywords as string[]) ?? []).map((x) => String(x).trim()).filter(Boolean);
    const referenceAnswer = o.referenceAnswer != null ? String(o.referenceAnswer).trim() : '';
    assert(
      acceptableAnswers.length > 0 || acceptableKeywords.length > 0 || referenceAnswer.length > 0,
      `Вопрос ${index + 1}: text_input — укажите acceptableAnswers, acceptableKeywords или referenceAnswer`
    );
    return {
      ...base,
      acceptableAnswers: acceptableAnswers.length ? uniqStrings(acceptableAnswers) : undefined,
      acceptableKeywords: acceptableKeywords.length ? uniqStrings(acceptableKeywords) : undefined,
      referenceAnswer: referenceAnswer || undefined
    };
  }

  return base;
}

export function parseAndValidateEntQuestions(questions: unknown): IQuestion[] {
  if (!Array.isArray(questions)) {
    throw new Error('OpenAI response: поле questions отсутствует или не массив.');
  }
  if (questions.length !== 10) {
    throw new Error(
      `OpenAI response: ожидалось ровно 10 вопросов, получено ${questions.length}. Проверьте промпт и повторите запрос.`
    );
  }
  return questions.map((q, i) => validateEntQuestion(q, i));
}

/** Обычный тест: N× single_choice, ровно 4 варианта (N по запросу, по умолчанию 10) */
export function parseAndValidateRegularQuestions(questions: unknown, expectedCount = 10): IQuestion[] {
  if (!Array.isArray(questions)) {
    throw new Error('OpenAI response: поле questions отсутствует или не массив.');
  }
  if (questions.length !== expectedCount) {
    throw new Error(
      `Обычный тест: ожидалось ровно ${expectedCount} вопросов, получено ${questions.length}.`
    );
  }
  return questions.map((raw, index) => {
    const o = raw as Record<string, unknown>;
    const questionText = String(o.questionText ?? '').trim();
    assert(questionText.length >= 5, `Вопрос ${index + 1}: слишком короткий questionText`);
    const options = (o.options as string[])?.map((x) => String(x).trim()).filter(Boolean) ?? [];
    assert(options.length === 4, `Вопрос ${index + 1}: нужно ровно 4 варианта ответа`);
    const correctOption = String(o.correctOption ?? '').trim();
    assert(options.includes(correctOption), `Вопрос ${index + 1}: correctOption должен совпадать с одним из options`);
    const aiExplanation = pickAiExplanation(o);
    const rc = (o.relatedContent as Record<string, unknown>) || {};
    const pages = Array.isArray(rc.pages) ? rc.pages.map((p) => Number(p)).filter((n) => !Number.isNaN(n)) : [];
    const relatedContent: IRelatedContent = {
      pages: pages.length ? pages : [1],
      topicTitle: rc.topicTitle != null ? String(rc.topicTitle) : undefined
    };
    return {
      questionType: 'single_choice',
      questionText,
      options,
      correctOption,
      aiExplanation,
      relatedContent
    };
  });
}