import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ktpApi } from '../../api/ktp.api';
import { subjectApi } from '../../api/subject.api';
import { KtpCatalog, KtpTopic, KtpTopicInput } from '../../types/ktp.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Button } from '../../components/ui/Button';
import { TopicKnowledgeBank } from '../../components/ktp/TopicKnowledgeBank';
import { getApiErrorMessage } from '../../utils/error';

/* ───── inline-edit pieces (в стиле SubjectDetailPage) ───── */

const EditableText: React.FC<{
  text: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (v: string) => Promise<void>;
  className?: string;
  emptyLabel?: string;
}> = ({ text, placeholder, multiline = false, onSave, className = '', emptyLabel }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValue(text), [text]);

  const save = async () => {
    if (value.trim() === text.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex w-full items-start gap-1.5">
        {multiline ? (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            className="w-full rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        ) : (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-full rounded border border-blue-300 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}
        <button onClick={() => void save()} disabled={saving} className="text-xs text-blue-600 hover:underline">
          {saving ? '…' : 'OK'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:underline">
          Отмена
        </button>
      </span>
    );
  }

  return (
    <span
      className={`group/edit cursor-pointer ${className} ${!text && emptyLabel ? 'text-slate-400 italic' : ''}`}
      onClick={() => {
        setValue(text);
        setEditing(true);
      }}
      title="Нажмите для редактирования"
    >
      {text || emptyLabel || ''}
      <span className="ml-1.5 text-xs text-slate-300 opacity-0 transition group-hover/edit:opacity-100">✏️</span>
    </span>
  );
};

const ConfirmDeleteBtn: React.FC<{ label?: string; onConfirm: () => Promise<void> }> = ({
  label = 'Удалить',
  onConfirm
}) => {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <span className="text-red-600">Точно?</span>
        <button
          onClick={async () => {
            setDeleting(true);
            await onConfirm();
          }}
          disabled={deleting}
          className="font-medium text-red-600 hover:underline"
        >
          {deleting ? '…' : 'Да'}
        </button>
        <button onClick={() => setConfirming(false)} className="text-slate-400 hover:underline">
          Нет
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-xs text-red-400 hover:text-red-600">
      {label}
    </button>
  );
};

const AddInline: React.FC<{ placeholder: string; onAdd: (v: string) => Promise<void> }> = ({
  placeholder,
  onAdd
}) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
      >
        + Добавить тему КТП
      </button>
    );
  }

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onAdd(value.trim());
      setValue('');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className="w-72 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
      />
      <button onClick={() => void submit()} disabled={saving} className="text-xs font-medium text-blue-600 hover:underline">
        {saving ? '…' : 'OK'}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
        Отмена
      </button>
    </div>
  );
};

/* ───── main page ───── */

export const KtpCatalogPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [subjectTitle, setSubjectTitle] = useState('');
  const [catalog, setCatalog] = useState<KtpCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [yearInput, setYearInput] = useState('');
  const [versionInput, setVersionInput] = useState('');

  const [importText, setImportText] = useState('');
  const [importReplace, setImportReplace] = useState(true);
  const [importing, setImporting] = useState(false);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  const applyCatalog = (c: KtpCatalog) => {
    setCatalog(c);
    setYearInput(c.year != null ? String(c.year) : '');
    setVersionInput(String(c.version));
  };

  const reload = useCallback(async () => {
    if (!subjectId) return;
    setError(null);
    try {
      const [subject, cat] = await Promise.all([
        subjectApi.getSubjectById(subjectId),
        ktpApi.getCatalog(subjectId)
      ]);
      setSubjectTitle(subject.title);
      if (cat) applyCatalog(cat);
      else {
        setCatalog(null);
        setYearInput('');
        setVersionInput('1');
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [subjectId]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  if (!subjectId) return <ErrorMessage message="subjectId не указан" />;
  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} />;

  const sid = subjectId;
  const topics: KtpTopic[] = catalog ? [...catalog.topics].sort((a, b) => a.order - b.order) : [];

  const guard = async (fn: () => Promise<KtpCatalog>, okMsg: string) => {
    try {
      const updated = await fn();
      applyCatalog(updated);
      flash(okMsg);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const saveMeta = async () => {
    const year = yearInput.trim() ? Number(yearInput.trim()) : undefined;
    const version = versionInput.trim() ? Number(versionInput.trim()) : undefined;
    await guard(() => ktpApi.upsertMeta(sid, { year, version }), 'Параметры КТП сохранены');
  };

  const move = async (topicId: string, dir: -1 | 1) => {
    const idx = topics.findIndex((t) => t._id === topicId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= topics.length) return;
    const reordered = [...topics];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    await guard(() => ktpApi.reorder(sid, reordered.map((t) => t._id)), 'Порядок обновлён');
  };

  const doImport = async () => {
    if (!importText.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setError('Невалидный JSON');
      return;
    }
    const raw = Array.isArray(parsed)
      ? parsed
      : (parsed as { topics?: unknown })?.topics;
    if (!Array.isArray(raw)) {
      setError('Ожидается массив тем или объект { "topics": [...] }');
      return;
    }
    const list = raw as KtpTopicInput[];
    setImporting(true);
    try {
      const updated = await ktpApi.import(sid, { topics: list, replace: importReplace });
      applyCatalog(updated);
      setImportText('');
      flash(`Импортировано тем: ${updated.topics.length}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <Link to={`/admin/subjects/${sid}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← К предмету
        </Link>
        <h1 className="mt-2 text-xl font-bold text-slate-900">
          КТП: <span className="text-slate-700">{subjectTitle}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Канонический упорядоченный список тем предмета (от центра тестирования). Роудмап строится из КТП:
          темы книг (разных классов) мапятся на эти темы, узел роудмапа агрегирует материал.
        </p>
      </div>

      {msg && <SuccessMessage message={msg} />}

      {/* meta */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Год
          <input
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            placeholder="2026"
            inputMode="numeric"
            className="w-28 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Версия
          <input
            value={versionInput}
            onChange={(e) => setVersionInput(e.target.value)}
            placeholder="1"
            inputMode="numeric"
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
          />
        </label>
        <Button type="button" variant="outline" onClick={() => void saveMeta()}>
          Сохранить параметры
        </Button>
      </div>

      {/* topics */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Темы КТП ({topics.length})</h2>
          <AddInline
            placeholder="Название темы КТП"
            onAdd={async (title) => {
              await guard(() => ktpApi.addTopic(sid, { title }), 'Тема КТП добавлена');
            }}
          />
        </div>

        {topics.length === 0 && (
          <p className="text-sm text-slate-500">
            Тем пока нет. Добавьте вручную или импортируйте JSON ниже.
          </p>
        )}

        <ol className="space-y-2">
          {topics.map((t, i) => (
            <li
              key={t._id}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex flex-col items-center pt-0.5">
                <button
                  onClick={() => void move(t._id, -1)}
                  disabled={i === 0}
                  className="text-xs text-slate-400 hover:text-blue-600 disabled:opacity-30"
                  title="Выше"
                >
                  ▲
                </button>
                <span className="text-[11px] font-medium text-slate-400">{i + 1}</span>
                <button
                  onClick={() => void move(t._id, 1)}
                  disabled={i === topics.length - 1}
                  className="text-xs text-slate-400 hover:text-blue-600 disabled:opacity-30"
                  title="Ниже"
                >
                  ▼
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <EditableText
                    text={t.code ?? ''}
                    emptyLabel="код"
                    placeholder="код ЦТ"
                    className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                    onSave={async (v) => {
                      await guard(() => ktpApi.updateTopic(sid, t._id, { code: v }), 'Код обновлён');
                    }}
                  />
                  <EditableText
                    text={t.title}
                    className="text-sm font-medium text-slate-800"
                    onSave={async (v) => {
                      await guard(() => ktpApi.updateTopic(sid, t._id, { title: v }), 'Тема обновлена');
                    }}
                  />
                </div>
                <EditableText
                  text={t.description ?? ''}
                  emptyLabel="+ описание темы"
                  multiline
                  className="block text-xs text-slate-500"
                  onSave={async (v) => {
                    await guard(() => ktpApi.updateTopic(sid, t._id, { description: v }), 'Описание обновлено');
                  }}
                />

                <TopicKnowledgeBank subjectId={sid} topicId={t._id} />
              </div>

              <ConfirmDeleteBtn
                onConfirm={async () => {
                  await guard(() => ktpApi.deleteTopic(sid, t._id), 'Тема КТП удалена');
                }}
              />
            </li>
          ))}
        </ol>
      </div>

      {/* import */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Массовый импорт (вставка JSON)</h2>
        <p className="text-xs text-slate-500">
          Формат: массив <code>{`[{ "title": "…", "code": "…", "description": "…", "order": 0 }]`}</code> или
          объект <code>{`{ "topics": [...] }`}</code>. Порядок берётся из <code>order</code> или из позиции в массиве.
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={6}
          placeholder='[{ "title": "Клетка", "code": "1.1" }, { "title": "Митохондрии" }]'
          className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs focus:border-blue-400 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={importReplace}
              onChange={(e) => setImportReplace(e.target.checked)}
              className="rounded border-slate-300"
            />
            Заменить существующие темы (иначе — добавить в конец)
          </label>
          <Button type="button" onClick={() => void doImport()} isLoading={importing} disabled={importing}>
            Импортировать
          </Button>
        </div>
      </div>
    </div>
  );
};
