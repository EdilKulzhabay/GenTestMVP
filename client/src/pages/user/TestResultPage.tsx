import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { MathText } from '../../components/MathText';
import { getLastResult } from '../../utils/session';

export const TestResultPage: React.FC = () => {
  const result = getLastResult();

  if (!result) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">Нет данных по последнему тесту.</p>
        <Link to="/user/subjects">
          <Button>Создать тест</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-2">
        <h1 className="section-title">Результат теста</h1>
        <p className="text-sm text-slate-600">
          Правильных ответов: {result.result.correctAnswers} из {result.result.totalQuestions}
        </p>
        <p className="text-lg font-semibold text-blue-600">{result.result.scorePercent}%</p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">AI анализ</h2>
        <p className="text-sm text-slate-600"><MathText>{result.aiFeedback.summary}</MathText></p>
        {result.aiFeedback.mistakes.length === 0 ? (
          <p className="text-sm text-emerald-600">Ошибок не найдено. Отлично!</p>
        ) : (
          <div className="space-y-3">
            {result.aiFeedback.mistakes.map((mistake, index) => (
              <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900"><MathText>{mistake.question}</MathText></p>
                <p className="text-sm text-slate-600"><MathText>{mistake.explanation}</MathText></p>
                <p className="text-xs text-slate-500">
                  Где перечитать: {mistake.whereToRead.bookTitle} • {mistake.whereToRead.chapterTitle} •
                  стр. {mistake.whereToRead.pages.join(', ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link to="/user/subjects">
        <Button>Новый тест</Button>
      </Link>
    </div>
  );
};
