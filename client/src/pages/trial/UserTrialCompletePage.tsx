import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

export const UserTrialCompletePage: React.FC = () => {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="section-title">Пробное тестирование завершено</h1>
      <p className="text-sm leading-relaxed text-slate-600">
        Темы, где в пробнике ≥ 80% заданий по соответствующей теме из учебника пройдены верно, отмечены на карте как
        «освоено» и открывают дальнейшие узлы. Откройте «Карта знаний», чтобы продолжить обучение.
      </p>
      <Link to="/user/roadmap">
        <Button className="w-full">Открыть карту знаний</Button>
      </Link>
      <Link to="/user">
        <Button variant="outline" className="w-full">
          На главную
        </Button>
      </Link>
    </div>
  );
};
