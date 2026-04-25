import React, { useEffect, useState } from 'react';
import { profileSubjectPairApi } from '../api/profileSubjectPair.api';
import { userApi } from '../api/user.api';
import type { ProfileSubjectPair } from '../types/profileSubjectPair.types';
import { Loader } from './ui/Loader';
import { ErrorMessage } from './ui/ErrorMessage';
import { getApiErrorMessage } from '../utils/error';

type Props = {
  onComplete: () => void;
};

function pairSubjectIds(pair: ProfileSubjectPair): [string, string] {
  const a = pair.subject1Id;
  const b = pair.subject2Id;
  const id1 = typeof a === 'object' && a?._id ? a._id : (a as string);
  const id2 = typeof b === 'object' && b?._id ? b._id : (b as string);
  return [String(id1), String(id2)];
}

export const ProfilePairRequiredModal: React.FC<Props> = ({ onComplete }) => {
  const [pairs, setPairs] = useState<ProfileSubjectPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await profileSubjectPairApi.list();
        setPairs(data);
        if (data.length === 0) {
          setError(
            'В системе ещё нет разрешённых пар предметов. Обратитесь к администратору.'
          );
        }
      } catch (e) {
        setError(getApiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const selectPair = async (pair: ProfileSubjectPair) => {
    setSaving(true);
    setError(null);
    try {
      const ids = pairSubjectIds(pair);
      await userApi.putProfileSubjects(ids);
      onComplete();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-pair-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="profile-pair-title" className="text-lg font-semibold text-slate-900">
          Выберите профильные предметы
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Для обучения и тестов доступны только основные предметы и одна выбранная пара профильных
          (ЕНТ). Без выбора продолжить нельзя.
        </p>

        {loading && (
          <div className="mt-6">
            <Loader />
          </div>
        )}

        {!loading && error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        {!loading && pairs.length > 0 && (
          <ul className="mt-6 max-h-72 space-y-2 overflow-y-auto">
            {pairs.map((pair) => (
              <li key={pair._id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void selectPair(pair)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-900 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <span>{pair.title}</span>
                  <span className="text-xs text-slate-400">Выбрать →</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {saving && (
          <p className="mt-4 text-center text-sm text-slate-500">Сохраняем…</p>
        )}
      </div>
    </div>
  );
}
