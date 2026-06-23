import React, { useState } from 'react';
import { ktpApi } from '../../api/ktp.api';
import { KnowledgeComponent, BankCoverage, BankItem } from '../../types/ktp.types';
import { Button } from '../ui/Button';
import { ConfirmDeleteBtn } from '../ui/ConfirmDeleteBtn';
import { useAuth } from '../../store/auth.store';
import { getApiErrorMessage } from '../../utils/error';

/**
 * Per-topic блок «Подтемы (KC) и банк вопросов» для экрана КТП.
 * Лениво грузится при разворачивании. Мутации (предложить/подтвердить/удалить KC, генерация,
 * просмотр вопросов с ответами) — только для admin; teacher видит список/покрытие read-only.
 */

interface Props {
  subjectId: string;
  topicId: string;
}

export const TopicKnowledgeBank: React.FC<Props> = ({ subjectId, topicId }) => {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [kcs, setKcs] = useState<KnowledgeComponent[]>([]);
  const [coverage, setCoverage] = useState<BankCoverage | null>(null);
  const [sel, setSel] = useState<string[]>([]);

  const [proposing, setProposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [minPerKc, setMinPerKc] = useState(3);
  const [difficulty, setDifficulty] = useState(3);

  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState('');

  const [items, setItems] = useState<BankItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const flash = (m: string): void => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  };

  const load = async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    try {
      const [kc, cov] = await Promise.all([
        ktpApi.listComponents(subjectId, topicId),
        ktpApi.bankCoverage(subjectId, topicId)
      ]);
      setKcs(kc);
      setCoverage(cov);
      setLoaded(true);
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const reloadCoverage = async (): Promise<void> => {
    try {
      setCoverage(await ktpApi.bankCoverage(subjectId, topicId));
    } catch {
      /* покрытие не критично — молча */
    }
  };

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void load();
  };

  const runMutation = async (fn: () => Promise<void>): Promise<void> => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(getApiErrorMessage(e));
    }
  };

  const propose = (): Promise<void> =>
    runMutation(async () => {
      setProposing(true);
      try {
        setKcs(await ktpApi.proposeComponents(subjectId, topicId));
        flash('ИИ предложил подтемы — отметьте нужные и подтвердите');
      } finally {
        setProposing(false);
      }
    });

  const confirmSelected = (): Promise<void> =>
    runMutation(async () => {
      if (sel.length === 0) return;
      setConfirming(true);
      try {
        setKcs(await ktpApi.confirmComponents(subjectId, topicId, sel));
        setSel([]);
        await reloadCoverage();
        flash('Подтемы подтверждены');
      } finally {
        setConfirming(false);
      }
    });

  const removeKc = (kcId: string): Promise<void> =>
    runMutation(async () => {
      setKcs(await ktpApi.deleteComponent(subjectId, topicId, kcId));
      setSel((s) => s.filter((id) => id !== kcId));
      await reloadCoverage();
      flash('Подтема удалена');
    });

  const addManual = (): Promise<void> =>
    runMutation(async () => {
      const title = addTitle.trim();
      if (!title) return;
      setKcs(await ktpApi.upsertComponent(subjectId, topicId, { title, status: 'confirmed' }));
      setAddTitle('');
      setAddOpen(false);
      await reloadCoverage();
      flash('Подтема добавлена');
    });

  const generate = (): Promise<void> =>
    runMutation(async () => {
      setGenerating(true);
      try {
        const res = await ktpApi.bankGenerate(subjectId, topicId, { minPerKc, difficulty });
        setCoverage(res.coverage);
        setItems(null); // список вопросов устарел
        flash(`Сгенерировано: +${res.created}, отклонено судьёй: ${res.rejected}`);
      } finally {
        setGenerating(false);
      }
    });

  const showItems = (): Promise<void> =>
    runMutation(async () => {
      setLoadingItems(true);
      try {
        setItems(await ktpApi.bankItems(subjectId, topicId));
      } finally {
        setLoadingItems(false);
      }
    });

  const activeByKc = new Map<string, number>();
  for (const p of coverage?.perKc ?? []) activeByKc.set(p.kcId, p.active);

  const confirmedKcs = kcs.filter((k) => k.status === 'confirmed');
  const proposedKcs = kcs.filter((k) => k.status === 'proposed');

  return (
    <div className="mt-1 border-t border-slate-100 pt-1.5">
      <button
        onClick={toggle}
        className="text-xs font-medium text-blue-600 hover:underline"
        title="Подтемы (KC) и банк вопросов"
      >
        {open ? '▾' : '▸'} Подтемы (KC) и банк
        {coverage ? <span className="ml-1 text-slate-400">· {coverage.totalActive} вопр.</span> : null}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
          {loading && <p className="text-xs text-slate-500">Загрузка…</p>}
          {err && <p className="text-xs text-red-600">{err}</p>}
          {msg && <p className="text-xs text-green-700">{msg}</p>}

          {/* ── KC: подтверждённые ── */}
          {confirmedKcs.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Подтверждённые подтемы
              </p>
              <ul className="space-y-1">
                {confirmedKcs.map((k) => {
                  const active = activeByKc.get(k._id) ?? 0;
                  const deficit = active < minPerKc;
                  return (
                    <li key={k._id} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-700">{k.title}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] ${
                          deficit ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                        }`}
                        title="активных вопросов в банке"
                      >
                        {active} вопр.
                      </span>
                      {canEdit && <ConfirmDeleteBtn onConfirm={() => removeKc(k._id)} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── KC: предложенные (ожидают подтверждения) ── */}
          {proposedKcs.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Предложено ИИ — выберите и подтвердите
              </p>
              <ul className="space-y-1">
                {proposedKcs.map((k) => (
                  <li key={k._id} className="flex items-center gap-2 text-sm">
                    {canEdit && (
                      <input
                        type="checkbox"
                        checked={sel.includes(k._id)}
                        onChange={(e) =>
                          setSel((s) => (e.target.checked ? [...s, k._id] : s.filter((id) => id !== k._id)))
                        }
                      />
                    )}
                    <span className="text-slate-600">{k.title}</span>
                    {canEdit && <ConfirmDeleteBtn onConfirm={() => removeKc(k._id)} />}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <Button
                  variant="secondary"
                  className="mt-2 !px-3 !py-1 !text-xs"
                  isLoading={confirming}
                  disabled={sel.length === 0}
                  onClick={() => void confirmSelected()}
                >
                  Подтвердить выбранные ({sel.length})
                </Button>
              )}
            </div>
          )}

          {loaded && kcs.length === 0 && (
            <p className="text-xs text-slate-500">Подтем пока нет. Предложите их ИИ или добавьте вручную.</p>
          )}

          {/* ── действия с KC ── */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="!px-3 !py-1 !text-xs" isLoading={proposing} onClick={() => void propose()}>
                Предложить KC (ИИ)
              </Button>
              {addOpen ? (
                <span className="inline-flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addManual();
                      if (e.key === 'Escape') setAddOpen(false);
                    }}
                    placeholder="Название подтемы"
                    className="w-56 rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
                  />
                  <button onClick={() => void addManual()} className="text-xs font-medium text-blue-600 hover:underline">
                    OK
                  </button>
                  <button onClick={() => setAddOpen(false)} className="text-xs text-slate-400 hover:underline">
                    Отмена
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setAddOpen(true)}
                  className="rounded-lg border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
                >
                  + добавить вручную
                </button>
              )}
            </div>
          )}

          {/* ── покрытие + генерация банка ── */}
          {coverage && (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-xs text-slate-600">
                В банке: <b>{coverage.totalActive}</b> активных вопросов
                {coverage.unassigned > 0 ? `, из них вне подтем: ${coverage.unassigned}` : ''}
              </p>
              {canEdit && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-slate-500">
                    мин/KC{' '}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={minPerKc}
                      onChange={(e) => setMinPerKc(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    сложн.{' '}
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={difficulty}
                      onChange={(e) => setDifficulty(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
                      className="w-14 rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                  <Button
                    variant="primary"
                    className="!px-3 !py-1 !text-xs"
                    isLoading={generating}
                    onClick={() => void generate()}
                    title="Генерация дёргает ИИ и может занять время"
                  >
                    Сгенерировать банк
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── просмотр сгенерированных вопросов ── */}
          {canEdit && (
            <div>
              <Button variant="ghost" className="!px-2 !py-1 !text-xs" isLoading={loadingItems} onClick={() => void showItems()}>
                {items ? 'Обновить вопросы' : 'Показать вопросы'}
              </Button>
              {items && items.length === 0 && <p className="mt-1 text-xs text-slate-500">Вопросов пока нет.</p>}
              {items && items.length > 0 && (
                <ol className="mt-2 space-y-2">
                  {items.map((it) => (
                    <li key={it._id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-slate-800">{it.question.questionText}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          ур.{it.difficulty} · {it.status}
                        </span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {(it.question.options ?? []).map((opt, i) => {
                          const correct = opt === it.question.correctOption;
                          return (
                            <li
                              key={i}
                              className={`text-xs ${correct ? 'font-medium text-green-700' : 'text-slate-600'}`}
                            >
                              {correct ? '✓ ' : '• '}
                              {opt}
                            </li>
                          );
                        })}
                      </ul>
                      {it.question.aiExplanation && (
                        <p className="mt-1 text-[11px] italic text-slate-400">{it.question.aiExplanation}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-300">
                        <span>
                          показов {it.qualityStats?.timesUsed ?? 0} · верных {it.qualityStats?.timesCorrect ?? 0}
                        </span>
                        {/* TODO Phase A-next: включить правку/ретайр/удаление item'а */}
                        <button disabled className="cursor-not-allowed text-slate-300" title="скоро">
                          Править
                        </button>
                        <button disabled className="cursor-not-allowed text-slate-300" title="скоро">
                          Ретайр
                        </button>
                        <button disabled className="cursor-not-allowed text-slate-300" title="скоро">
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
