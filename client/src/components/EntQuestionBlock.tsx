import React from 'react';
import { MathText } from './MathText';
import type { TestQuestion } from '../types/test.types';
import { getClientQuestionType } from '../utils/entAnswer.util';

interface Props {
  question: TestQuestion;
  index: number;
  value: string;
  onChange: (next: string) => void;
}

/** Пока включено на сервере (SHOW_TEST_CORRECT_ANSWERS) — убрать вместе с флагом */
function DevCorrectHint({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return (
    <p className="mt-2 rounded border border-amber-200/90 bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-950">
      Верно (временно): <MathText>{text}</MathText>
    </p>
  );
}

const typeLabel: Record<string, string> = {
  single_choice: 'Один верный ответ (ЕНТ)',
  multiple_choice: 'Несколько верных (ЕНТ)',
  matching_single: 'Сопоставление 1:1 (ЕНТ)',
  matching_multiple: 'Сопоставление 1:много (ЕНТ)',
  short_answer: 'Короткий ответ (ЕНТ)',
  text_input: 'Ввод текста (ЕНТ)'
};

export const EntQuestionBlock: React.FC<Props> = ({ question, index, value, onChange }) => {
  const t = getClientQuestionType(question);

  const badge = (
    <span className="mb-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
      {typeLabel[t] ?? t}
    </span>
  );

  if (t === 'single_choice') {
    const opts = question.options ?? [];
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <div className="space-y-2">
          {opts.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`q-${index}`}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
              />
              <MathText>{option}</MathText>
            </label>
          ))}
        </div>
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  if (t === 'multiple_choice') {
    let selected: string[] = [];
    try {
      const a = JSON.parse(value || '[]') as unknown;
      if (Array.isArray(a)) selected = a.filter((x) => typeof x === 'string') as string[];
    } catch {
      selected = [];
    }
    const opts = question.options ?? [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt];
      onChange(JSON.stringify([...next].sort()));
    };
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <p className="text-xs text-slate-500">Отметьте все верные варианты.</p>
        <div className="space-y-2">
          {opts.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
              <MathText>{option}</MathText>
            </label>
          ))}
        </div>
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  if (t === 'matching_single') {
    let map: Record<string, string> = {};
    try {
      const o = JSON.parse(value || '{}') as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        if (typeof o[k] === 'string') map[k] = o[k] as string;
      }
    } catch {
      map = {};
    }
    const left = question.matchingLeft ?? [];
    const right = question.matchingRight ?? [];
    const setPair = (leftId: string, rightId: string) => {
      onChange(JSON.stringify({ ...map, [leftId]: rightId }));
    };
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <div className="space-y-3">
          {left.map((l) => (
            <div key={l.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 flex-1 text-sm text-slate-800">
                <MathText>{l.text}</MathText>
              </span>
              <select
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                value={map[l.id] || ''}
                onChange={(e) => setPair(l.id, e.target.value)}
              >
                <option value="">— выберите —</option>
                {right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  if (t === 'matching_multiple') {
    let map: Record<string, string[]> = {};
    try {
      const o = JSON.parse(value || '{}') as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (Array.isArray(v)) map[k] = v.filter((x) => typeof x === 'string') as string[];
      }
    } catch {
      map = {};
    }
    const left = question.matchingLeft ?? [];
    const right = question.matchingRight ?? [];
    const toggleM = (leftId: string, rightId: string) => {
      const cur = map[leftId] || [];
      const next = cur.includes(rightId) ? cur.filter((x) => x !== rightId) : [...cur, rightId];
      onChange(JSON.stringify({ ...map, [leftId]: next }));
    };
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <p className="text-xs text-slate-500">Для каждого пункта слева отметьте все подходящие справа.</p>
        <div className="space-y-4">
          {left.map((l) => (
            <div key={l.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <p className="mb-2 text-sm font-medium text-slate-900">
                <MathText>{l.text}</MathText>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {right.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(map[l.id] || []).includes(r.id)}
                      onChange={() => toggleM(l.id, r.id)}
                    />
                    <MathText>{r.text}</MathText>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  if (t === 'short_answer') {
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <input
          type="text"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ответ"
          autoComplete="off"
        />
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  if (t === 'text_input') {
    return (
      <div className="card space-y-3">
        {badge}
        <p className="text-sm font-medium text-slate-900">
          {index + 1}. <MathText>{question.questionText}</MathText>
        </p>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Введите развёрнутый ответ"
          rows={4}
        />
        <DevCorrectHint text={question.correctAnswerHint} />
      </div>
    );
  }

  return null;
};
