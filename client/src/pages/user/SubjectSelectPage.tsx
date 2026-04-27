import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';
import { useGuestMode } from '../../hooks/useGuestMode';
import { useAuth } from '../../store/auth.store';
import { filterSubjectsForLearner } from '../../utils/learnerSubjects.util';

type SubjectSelectLocation = { nextFlow?: 'liveKahoot' };

export const SubjectSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const nextFlow = (location.state as SubjectSelectLocation | null)?.nextFlow;
  const { basePath, isGuest } = useGuestMode();
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await subjectApi.getSubjects();
        setSubjects(isGuest ? data : filterSubjectsForLearner(data, user));
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isGuest, user]);

  return (
    <div className="space-y-4">
      <h1 className="section-title">Выберите предмет</h1>
      {nextFlow === 'liveKahoot' ? (
        <p className="text-sm text-slate-600">
          Live Kahoot: затем выберите книгу — тест подставится из последнего сохранённого по предмету или сгенерируется.
        </p>
      ) : null}
      {loading ? <Loader /> : null}
      {error ? <ErrorMessage message={error} /> : null}
      {!loading && !error && subjects.length === 0 ? (
        <div className="card text-sm text-slate-600">Нет доступных предметов.</div>
      ) : null}
      {!loading && !error && subjects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.map((subject) => (
            <button
              key={subject._id}
              className="card text-left transition hover:border-blue-200 hover:bg-blue-50"
              onClick={() =>
                navigate(`${basePath}/books`, { state: { subjectId: subject._id, ...(nextFlow ? { nextFlow } : {}) } })
              }
            >
              <h2 className="text-lg font-semibold text-slate-900">{subject.title}</h2>
              <p className="text-sm text-slate-600">{subject.description || 'Без описания'}</p>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
