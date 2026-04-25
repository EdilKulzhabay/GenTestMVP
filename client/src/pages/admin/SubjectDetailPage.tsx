import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { Subject, Book, Chapter, Topic } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';

/* ───── inline-edit hook ───── */

function useInlineEdit(initial: string, onSave: (v: string) => Promise<void>) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const start = () => {
    setValue(initial);
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (!value.trim() || value.trim() === initial) {
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

  return { editing, value, setValue, saving, start, cancel, save };
}

/* ───── small reusable pieces ───── */

const EditableTitle: React.FC<{
  text: string;
  onSave: (v: string) => Promise<void>;
  className?: string;
  tag?: 'h1' | 'h2' | 'h3' | 'p';
}> = ({ text, onSave, className = '', tag = 'p' }) => {
  const ed = useInlineEdit(text, onSave);
  const Tag = tag;

  if (ed.editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          autoFocus
          value={ed.value}
          onChange={(e) => ed.setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ed.save();
            if (e.key === 'Escape') ed.cancel();
          }}
          className="rounded border border-blue-300 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button onClick={ed.save} disabled={ed.saving} className="text-xs text-blue-600 hover:underline">
          {ed.saving ? '…' : 'OK'}
        </button>
        <button onClick={ed.cancel} className="text-xs text-slate-400 hover:underline">
          Отмена
        </button>
      </span>
    );
  }

  return (
    <Tag className={`group/edit cursor-pointer ${className}`} onClick={ed.start} title="Нажмите для редактирования">
      {text}
      <span className="ml-1.5 text-xs text-slate-300 opacity-0 transition group-hover/edit:opacity-100">✏️</span>
    </Tag>
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

const AddInline: React.FC<{
  placeholder: string;
  onAdd: (v: string) => Promise<void>;
  btnLabel?: string;
}> = ({ placeholder, onAdd, btnLabel = 'Добавить' }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition hover:border-blue-300 hover:text-blue-600"
      >
        + {btnLabel}
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
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
      />
      <button onClick={submit} disabled={saving} className="text-xs font-medium text-blue-600 hover:underline">
        {saving ? '…' : 'OK'}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:underline">
        Отмена
      </button>
    </div>
  );
};

const RebuildRoadmapButton: React.FC<{
  subjectId: string;
  onDone: () => Promise<void>;
  flash: (m: string) => void;
}> = ({ subjectId, onDone, flash }) => {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const run = async () => {
    setLocalError(null);
    setLoading(true);
    try {
      const r = await roadmapApi.rebuildFromTopics(subjectId);
      await onDone();
      flash(`Карта знаний актуализирована: ${r.nodesCount} узлов (версия ${r.version}).`);
    } catch (e) {
      setLocalError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <span className="inline-flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <span>Пересобрать карту по главам учебника?</span>
          <Button type="button" className="text-xs" disabled={loading} onClick={() => void run()}>
            {loading ? '…' : 'Да, пересобрать'}
          </Button>
          <button
            type="button"
            className="text-xs text-slate-500 hover:underline"
            onClick={() => setConfirming(false)}
            disabled={loading}
          >
            Отмена
          </button>
        </span>
        {localError ? <p className="text-xs text-red-600">{localError}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Актуализировать карту знаний
      </Button>
      {localError ? <p className="text-xs text-red-600">{localError}</p> : null}
    </div>
  );
};

/* ───── main page ───── */

export const SubjectDetailPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const reload = useCallback(async () => {
    if (!subjectId) return;
    setError(null);
    try {
      const data = await subjectApi.getSubjectById(subjectId);
      setSubject(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }, [subjectId]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3000);
  };

  if (!subjectId) return <ErrorMessage message="subjectId не указан" />;
  if (loading) return <Loader />;
  if (error) return <ErrorMessage message={error} />;
  if (!subject) return <ErrorMessage message="Предмет не найден" />;

  const sid = subject._id;

  const totalChapters = subject.books.reduce((s, b) => s + b.chapters.length, 0);
  const totalTopics = subject.books.reduce(
    (s, b) => s + b.chapters.reduce((cs, c) => cs + c.topics.length, 0), 0
  );
  const totalParagraphs = subject.books.reduce(
    (s, b) =>
      s + b.chapters.reduce((cs, c) => cs + c.topics.reduce((ts, t) => ts + t.paragraphs.length, 0), 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <div>
        <Link to="/admin" className="text-sm text-slate-500 hover:text-slate-800">
          ← Админ-панель
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <EditableTitle
            text={subject.title}
            tag="h1"
            className="text-xl font-bold text-slate-900"
            onSave={async (v) => {
              await subjectApi.updateSubject(sid, { title: v });
              await reload();
              flash('Название обновлено');
            }}
          />
        </div>
        {subject.description && (
          <p className="mt-1 text-sm text-slate-500">{subject.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Тип:</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
            value={subject.subjectKind ?? 'main'}
            onChange={async (e) => {
              const subjectKind = e.target.value as 'main' | 'profile';
              try {
                await subjectApi.updateSubject(sid, { subjectKind });
                await reload();
                flash('Тип предмета обновлён');
              } catch (err) {
                setError(getApiErrorMessage(err));
              }
            }}
          >
            <option value="main">Основной</option>
            <option value="profile">Профильный</option>
          </select>
        </div>
      </div>

      {msg && <SuccessMessage message={msg} />}

      {/* stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { n: subject.books.length, l: 'Книг' },
          { n: totalChapters, l: 'Глав' },
          { n: totalTopics, l: 'Тем' },
          { n: totalParagraphs, l: 'Параграфов' }
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-slate-200 bg-white p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-slate-900">{s.n}</p>
            <p className="text-[11px] text-slate-500">{s.l}</p>
          </div>
        ))}
      </div>

      {/* books tree */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Книги и контент</h2>
          <AddInline
            placeholder="Название книги"
            btnLabel="Книга"
            onAdd={async (title) => {
              await subjectApi.createBook(sid, { title });
              await reload();
              flash('Книга добавлена');
            }}
          />
        </div>

        {subject.books.length === 0 && (
          <p className="text-sm text-slate-500">Нет книг. Добавьте первую.</p>
        )}

        {subject.books.map((book) => (
          <BookSection
            key={book._id}
            book={book}
            subjectId={sid}
            expanded={expanded}
            toggle={toggle}
            reload={reload}
            flash={flash}
          />
        ))}
      </div>

      {/* roadmap link */}
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap gap-3">
          <Link to={`/admin/roadmaps/${sid}`}>
            <Button variant="outline">Карта знаний</Button>
          </Link>
          <Link to="/admin/roadmaps/create">
            <Button variant="outline">Создать / обновить roadmap</Button>
          </Link>
          <RebuildRoadmapButton subjectId={sid} onDone={reload} flash={flash} />
        </div>
        <p className="text-xs text-slate-500">
          «Актуализировать» удаляет сохранённую запись карты в БД и строит её заново по текущим темам (в главах) и
          контенту учебника.
        </p>
      </div>
    </div>
  );
};

/* ───── Book ───── */

const BookSection: React.FC<{
  book: Book;
  subjectId: string;
  expanded: Record<string, boolean>;
  toggle: (k: string) => void;
  reload: () => Promise<void>;
  flash: (m: string) => void;
}> = ({ book, subjectId, expanded, toggle, reload, flash }) => {
  const bk = `book-${book._id}`;
  const isOpen = expanded[bk] ?? false;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3"
        onClick={() => toggle(bk)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-slate-400">{isOpen ? '▼' : '▶'}</span>
          <EditableTitle
            text={book.title}
            tag="h3"
            className="font-semibold text-slate-900"
            onSave={async (v) => {
              await subjectApi.updateBook(subjectId, book._id, { title: v });
              await reload();
              flash('Книга обновлена');
            }}
          />
          {book.author && <span className="text-xs text-slate-400">— {book.author}</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
          <span>{book.chapters.length} глав</span>
          <ConfirmDeleteBtn
            onConfirm={async () => {
              await subjectApi.deleteBook(subjectId, book._id);
              await reload();
              flash('Книга удалена');
            }}
          />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2 space-y-3">
          {book.chapters
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((ch) => (
              <ChapterSection
                key={ch._id}
                chapter={ch}
                subjectId={subjectId}
                bookId={book._id}
                expanded={expanded}
                toggle={toggle}
                reload={reload}
                flash={flash}
              />
            ))}
          <AddInline
            placeholder="Название главы"
            btnLabel="Глава"
            onAdd={async (title) => {
              await subjectApi.createChapter(subjectId, book._id, {
                title,
                order: book.chapters.length
              });
              await reload();
              flash('Глава добавлена');
            }}
          />
        </div>
      )}
    </div>
  );
};

/* ───── Chapter ───── */

const ChapterSection: React.FC<{
  chapter: Chapter;
  subjectId: string;
  bookId: string;
  expanded: Record<string, boolean>;
  toggle: (k: string) => void;
  reload: () => Promise<void>;
  flash: (m: string) => void;
}> = ({ chapter, subjectId, bookId, expanded, toggle, reload, flash }) => {
  const ck = `ch-${chapter._id}`;
  const isOpen = expanded[ck] ?? false;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"
        onClick={() => toggle(ck)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs text-slate-400">{isOpen ? '▼' : '▶'}</span>
          <span className="text-xs font-medium text-slate-400">#{chapter.order}</span>
          <EditableTitle
            text={chapter.title}
            className="text-sm font-medium text-slate-800"
            onSave={async (v) => {
              await subjectApi.updateChapter(subjectId, bookId, chapter._id, { title: v });
              await reload();
              flash('Глава обновлена');
            }}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400" onClick={(e) => e.stopPropagation()}>
          <span>{chapter.topics.length} тем</span>
          <ConfirmDeleteBtn
            onConfirm={async () => {
              await subjectApi.deleteChapter(subjectId, bookId, chapter._id);
              await reload();
              flash('Глава удалена');
            }}
          />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2">
          {chapter.topics.map((topic) => (
            <TopicSection
              key={topic._id}
              topic={topic}
              subjectId={subjectId}
              bookId={bookId}
              chapterId={chapter._id}
              expanded={expanded}
              toggle={toggle}
              reload={reload}
              flash={flash}
            />
          ))}
          <AddInline
            placeholder="Название темы"
            btnLabel="Тема"
            onAdd={async (title) => {
              await subjectApi.createTopic(subjectId, bookId, chapter._id, { title });
              await reload();
              flash('Тема добавлена');
            }}
          />
        </div>
      )}
    </div>
  );
};

/* ───── Topic ───── */

const TopicSection: React.FC<{
  topic: Topic;
  subjectId: string;
  bookId: string;
  chapterId: string;
  expanded: Record<string, boolean>;
  toggle: (k: string) => void;
  reload: () => Promise<void>;
  flash: (m: string) => void;
}> = ({ topic, subjectId, bookId, chapterId, expanded, toggle, reload, flash }) => {
  const tk = `topic-${topic._id}`;
  const isOpen = expanded[tk] ?? false;

  return (
    <div className="rounded-md border border-slate-100 bg-white">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5"
        onClick={() => toggle(tk)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] text-slate-400">{isOpen ? '▼' : '▶'}</span>
          <EditableTitle
            text={topic.title}
            className="text-sm text-slate-700"
            onSave={async (v) => {
              await subjectApi.updateTopic(subjectId, bookId, chapterId, topic._id, { title: v });
              await reload();
              flash('Тема обновлена');
            }}
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400" onClick={(e) => e.stopPropagation()}>
          <span>{topic.paragraphs.length} пар.</span>
          <ConfirmDeleteBtn
            onConfirm={async () => {
              await subjectApi.deleteTopic(subjectId, bookId, chapterId, topic._id);
              await reload();
              flash('Тема удалена');
            }}
          />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-50 px-3 pb-2 pt-1 space-y-1.5">
          {topic.paragraphs.length === 0 && (
            <p className="text-xs text-slate-400 italic">Нет параграфов</p>
          )}
          {topic.paragraphs
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((para) => (
              <div
                key={para._id}
                className="group flex items-start justify-between gap-2 rounded border border-slate-50 bg-slate-50/50 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-600 line-clamp-2">{para.content.text}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    стр. {para.content.pages.join(', ')}
                    {para.content.metadata.keywords?.length > 0 &&
                      ` · ${para.content.metadata.keywords.slice(0, 3).join(', ')}`}
                  </p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition">
                  <ConfirmDeleteBtn
                    onConfirm={async () => {
                      await subjectApi.deleteParagraph(subjectId, bookId, chapterId, topic._id, para._id);
                      await reload();
                      flash('Параграф удалён');
                    }}
                  />
                </div>
              </div>
            ))}
          <Link
            to="/admin/contents/new"
            state={{ subjectId, bookId, chapterId, topicId: topic._id }}
            className="inline-block text-xs text-blue-600 hover:underline"
          >
            + Добавить параграф
          </Link>
        </div>
      )}
    </div>
  );
};
