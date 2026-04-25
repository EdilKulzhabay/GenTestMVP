import type { EntQuestionType, TestQuestion } from '../types/test.types';

export function getClientQuestionType(q: TestQuestion): EntQuestionType {
  const t = q.questionType;
  if (
    t === 'single_choice' ||
    t === 'multiple_choice' ||
    t === 'matching_single' ||
    t === 'matching_multiple' ||
    t === 'short_answer' ||
    t === 'text_input'
  ) {
    return t;
  }
  return 'single_choice';
}

export function isAnswerComplete(q: TestQuestion, value: string | undefined): boolean {
  const v = (value ?? '').trim();
  const type = getClientQuestionType(q);
  if (type === 'single_choice') return v.length > 0;
  if (type === 'multiple_choice') {
    try {
      const a = JSON.parse(v || '[]') as unknown;
      return Array.isArray(a) && a.length > 0 && a.every((x) => typeof x === 'string');
    } catch {
      return false;
    }
  }
  if (type === 'matching_single' || type === 'matching_multiple') {
    try {
      const o = JSON.parse(v || '{}') as Record<string, unknown>;
      const leftIds = q.matchingLeft?.map((x) => x.id) ?? [];
      if (leftIds.length === 0) return false;
      if (type === 'matching_single') {
        return leftIds.every((id) => typeof o[id] === 'string' && String(o[id]).trim().length > 0);
      }
      return leftIds.every((id) => {
        const x = o[id];
        return Array.isArray(x) && x.length > 0 && x.every((y) => typeof y === 'string' && y.trim());
      });
    } catch {
      return false;
    }
  }
  if (type === 'short_answer' || type === 'text_input') return v.length > 0;
  return false;
}
