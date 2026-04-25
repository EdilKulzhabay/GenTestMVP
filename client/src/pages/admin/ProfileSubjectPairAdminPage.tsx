import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { profileSubjectPairApi } from '../../api/profileSubjectPair.api';
import type { Subject } from '../../types/subject.types';
import type { ProfileSubjectPair } from '../../types/profileSubjectPair.types';
import { Button } from '../../components/ui/Button';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { getApiErrorMessage } from '../../utils/error';

export const ProfileSubjectPairAdminPage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pairs, setPairs] = useState<ProfileSubjectPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [subject1Id, setSubject1Id] = useState('');
  const [subject2Id, setSubject2Id] = useState('');

  const profileSubjects = subjects.filter((s) => s.subjectKind === 'profile');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([subjectApi.getSubjects(), profileSubjectPairApi.list()]);
      setSubjects(s);
      setPairs(p);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject1Id || !subject2Id || subject1Id === subject2Id) {
      setError('Выберите два разных профильных предмета.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await profileSubjectPairApi.create({ subject1Id, subject2Id });
      setSubject1Id('');
      setSubject2Id('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить эту пару?')) return;
    setError(null);
    try {
      await profileSubjectPairApi.remove(id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Пары профильных предметов</h1>
          <p className="mt-1 text-sm text-slate-500">
            Название собирается как «Предмет 1 - Предмет 2». Оба предмета в админке должны быть отмечены как профильные.
          </p>
        </div>
        <Link to="/admin">
          <Button variant="outline">← К предметам</Button>
        </Link>
      </div>

      {error && <ErrorMessage message={error} />}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Создать пару</h2>
        {profileSubjects.length < 2 ? (
          <p className="text-sm text-amber-700">
            Нужно минимум два предмета с типом «Профильный». Создайте или отредактируйте предметы в разделе предметов (PATCH: subjectKind).
          </p>
        ) : (
          <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={handleCreate}>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">Предмет 1</span>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                value={subject1Id}
                onChange={(e) => setSubject1Id(e.target.value)}
              >
                <option value="">— выберите —</option>
                {profileSubjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-600">Предмет 2</span>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
                value={subject2Id}
                onChange={(e) => setSubject2Id(e.target.value)}
              >
                <option value="">— выберите —</option>
                {profileSubjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" isLoading={submitting}>
              Создать пару
            </Button>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-6 py-3 text-sm font-semibold text-slate-900">Список пар</h2>
        {pairs.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-slate-500">Пока нет записей.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pairs.map((p) => {
              const s1 =
                typeof p.subject1Id === 'object' && p.subject1Id && 'title' in p.subject1Id
                  ? p.subject1Id.title
                  : '';
              const s2 =
                typeof p.subject2Id === 'object' && p.subject2Id && 'title' in p.subject2Id
                  ? p.subject2Id.title
                  : '';
              return (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{p.title}</p>
                    <p className="text-xs text-slate-500">
                      {s1 && s2 ? `${s1} + ${s2}` : '—'}
                    </p>
                  </div>
                  <Button type="button" variant="outline" className="text-red-700" onClick={() => handleDelete(p._id)}>
                    Удалить
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
