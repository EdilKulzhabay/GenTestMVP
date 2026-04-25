import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trialApi, type TrialConfigResponse } from '../../api/trial.api';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Loader } from '../../components/ui/Loader';
import { getApiErrorMessage } from '../../utils/error';
import { useGuestMode } from '../../hooks/useGuestMode';
import { useAuth } from '../../store/auth.store';
import { startTrialSession } from '../../utils/trialSession';

export const TrialEntryPage: React.FC = () => {
  const navigate = useNavigate();
  const { basePath, isGuest } = useGuestMode();
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mainSubjects, setMainSubjects] = useState<Array<{ _id: string; title: string }>>([]);
  const [profileSubjects, setProfileSubjects] = useState<Array<{ _id: string; title: string }>>([]);
  const [pairedProfileIds, setPairedProfileIds] = useState<string[] | null>(null);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [entInfo, setEntInfo] = useState<TrialConfigResponse['entTrialInfo']>();
  const [trialMainsOk, setTrialMainsOk] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const cfg = await trialApi.getConfig();
        setMainSubjects(cfg.mainSubjects.map((s) => ({ _id: s._id, title: s.title })));
        setProfileSubjects(cfg.profileSubjects.map((s) => ({ _id: s._id, title: s.title })));
        setPairedProfileIds(cfg.pairedProfileIds);
        setEntInfo(cfg.entTrialInfo);
        if (typeof cfg.trialMainsOk === 'boolean') setTrialMainsOk(cfg.trialMainsOk);
        if (cfg.pairedProfileIds && cfg.pairedProfileIds.length === 2) {
          setP1(cfg.pairedProfileIds[0]);
          setP2(cfg.pairedProfileIds[1]);
        }
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const startWithProfileIds = async (ids: string[]) => {
    setSubmitting(true);
    setError(null);
    try {
      const plan = await trialApi.postPlan(ids);
      startTrialSession(plan.steps);
      const first = plan.steps[0];
      navigate(`${basePath}/test/start`, {
        state: {
          subjectId: first.subjectId,
          bookId: first.bookId,
          fullBook: true,
          trialFlow: true,
          trialQuestionCount: first.questionCount,
          trialBlockLabel: first.trialBlockLabel,
          roadmapNodeTitle: first.topicTitle || first.chapterTitle
        }
      });
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = () => {
    if (pairedProfileIds && pairedProfileIds.length === 2 && isAuthenticated && user?.role === 'user') {
      void startWithProfileIds(pairedProfileIds);
      return;
    }
    if (!p1 || !p2 || p1 === p2) {
      setError('Выберите два разных профильных предмета.');
      return;
    }
    void startWithProfileIds([p1, p2]);
  };

  if (loading) return <Loader />;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="section-title">Пробное тестирование</h1>
        <p className="muted-text mt-2 text-sm leading-relaxed">
          Один сценарий в формате заданий ЕНТ (Казахстан), без выбора типа теста. Пять блоков: три обязательных
          (история Казахстана, математическая и читательская грамотность) и два выбранных вами профильных. На карте
          знаний тема отмечается «освоено», если в пробнике по этой теме из учебника набрано{' '}
          <span className="font-medium">не ниже 80%</span> правильных ответов в рамках блока.
        </p>
        {entInfo ? (
          <ul className="mt-3 list-inside list-disc text-sm text-slate-600">
            {entInfo.mainBlocks.map((b) => (
              <li key={b.blockLabel}>{b.blockLabel}</li>
            ))}
            <li>
              Профильный 1: {entInfo.profileBlockQuestions} вопросов ({entInfo.profileBlockPoints} баллов)
            </li>
            <li>
              Профильный 2: {entInfo.profileBlockQuestions} вопросов ({entInfo.profileBlockPoints} баллов)
            </li>
          </ul>
        ) : null}
      </div>

      {trialMainsOk === false ? (
        <ErrorMessage message="В каталоге нет трёх обязательных предметов ВНО (точные названия: История Казахстана, Математическая грамотность, Грамотность чтения). Импортируйте seed субъектов." />
      ) : null}

      {profileSubjects.length < 2 ? (
        <ErrorMessage message="Недостаточно профильных предметов в каталоге." />
      ) : null}

      {isAuthenticated && user?.role === 'user' && pairedProfileIds && pairedProfileIds.length === 2 ? (
        <div className="card space-y-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Ваши профильные предметы (из пары)</p>
          <p>
            {profileSubjects.find((s) => s._id === pairedProfileIds[0])?.title ?? pairedProfileIds[0]},{' '}
            {profileSubjects.find((s) => s._id === pairedProfileIds[1])?.title ?? pairedProfileIds[1]}
          </p>
        </div>
      ) : (
        <div className="card space-y-3">
          <p className="text-sm font-medium text-slate-900">Выберите два профильных предмета</p>
          <label className="block text-xs font-medium text-slate-600">Профильный 1</label>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
          >
            <option value="">—</option>
            {profileSubjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.title}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-slate-600">Профильный 2</label>
          <select
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
          >
            <option value="">—</option>
            {profileSubjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <ErrorMessage message={error} />}

      <Button
        className="w-full"
        disabled={
          submitting ||
          trialMainsOk === false ||
          profileSubjects.length < 2 ||
          (!(pairedProfileIds && pairedProfileIds.length === 2 && isAuthenticated && user?.role === 'user') &&
            (!p1 || !p2))
        }
        onClick={() => void handleStart()}
      >
        {submitting ? 'Подготовка…' : 'Начать'}
      </Button>

      {isGuest ? (
        <p className="text-center text-xs text-slate-500">
          После пробника — баллы по блокам; перенос тем с ≥ 80% на карту — после регистрации или входа.
        </p>
      ) : null}
    </div>
  );
};
