import React from 'react';
import { MathText } from './MathText';
import { TestMistake } from '../types/test.types';

interface ErrorBreakdownProps {
  mistakes: TestMistake[];
  summary?: string;
}

/**
 * Разбор ошибок — mobile-first, короткий и практичный.
 * Один путь: прочитал → понял → пошёл повторять.
 * Источник: книга/раздел/страница, если есть. Иначе — честная альтернатива «что повторить».
 */
export const ErrorBreakdown: React.FC<ErrorBreakdownProps> = ({ mistakes, summary }) => {
  if (mistakes.length === 0) {
    return (
      <p className="text-sm text-emerald-600 font-medium">
        Ошибок не найдено. Отлично!
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <p className="text-sm text-slate-600">
          <MathText>{summary}</MathText>
        </p>
      )}
      <p className="text-xs text-slate-500">
        {mistakes.length} {mistakes.length === 1 ? 'ошибка' : 'ошибок'} — разберём по порядку
      </p>
      <div className="space-y-3 sm:space-y-4">
        {mistakes.map((mistake, index) => (
          <MistakeCard key={index} mistake={mistake} index={index + 1} />
        ))}
      </div>
    </div>
  );
};

function MistakeCard({ mistake, index }: { mistake: TestMistake; index: number }) {
  const hasSource = Boolean(mistake.whereToRead?.bookTitle || mistake.whereToRead?.chapterTitle);
  const w = hasSource ? mistake.whereToRead! : undefined;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm touch-manipulation">
      <span className="text-xs font-medium text-slate-400">Ошибка {index}</span>
      <p className="mt-1 text-sm font-medium text-slate-900 leading-snug">
        <MathText>{mistake.question}</MathText>
      </p>

      <div className="mt-3 space-y-2">
        <div>
          <span className="text-xs font-medium text-slate-500">Почему правильно</span>
          <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">
            <MathText>{mistake.explanation}</MathText>
          </p>
        </div>

        {w ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-xs font-medium text-slate-500">Где в учебнике</span>
            <p className="mt-0.5 text-sm text-slate-800 leading-snug">
              {w.bookTitle}
              {w.chapterTitle && ` · ${w.chapterTitle}`}
              {w.topicTitle && ` · ${w.topicTitle}`}
              {w.pages?.length > 0 && (
                <> · стр. {w.pages.join(', ')}</>
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5">
            <span className="text-xs font-medium text-amber-700">Что повторить</span>
            <p className="mt-0.5 text-sm text-amber-800">
              Опирайтесь на объяснение выше. Перечитайте тему в учебнике.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
