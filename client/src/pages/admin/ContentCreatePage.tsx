import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { subjectApi } from '../../api/subject.api';
import { Book, Chapter, Subject, Topic } from '../../types/subject.types';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { SuccessMessage } from '../../components/ui/SuccessMessage';
import { Loader } from '../../components/ui/Loader';
import { MathText } from '../../components/MathText';
import { getApiErrorMessage } from '../../utils/error';

const schema = z
  .object({
    subjectId: z.string().min(1, 'Выберите предмет'),
    bookId: z.string().min(1, 'Выберите книгу'),
    chapterId: z.string().min(1, 'Выберите главу'),
    topicId: z.string().optional(),
    topicTitle: z.string().optional(),
    paragraphOrder: z.coerce.number().int().min(0, 'Порядок должен быть >= 0'),
    contentText: z.string().min(1, 'Введите текст параграфа'),
    pages: z.string().min(1, 'Укажите страницы'),
    keywords: z.string().optional(),
    difficulty: z.string().optional(),
    source: z.string().optional()
  })
  .refine((data) => Boolean(data.topicId || data.topicTitle?.trim()), {
    message: 'Укажите тему или выберите существующую',
    path: ['topicTitle']
  });

type ContentForm = z.infer<typeof schema>;

export const ContentCreatePage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset
  } = useForm<ContentForm>({ resolver: zodResolver(schema) });

  const subjectId = watch('subjectId');
  const bookId = watch('bookId');
  const chapterId = watch('chapterId');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await subjectApi.getSubjects();
        setSubjects(data);
      } catch (error) {
        setServerError(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const loadSubject = async () => {
      if (!subjectId) { setBooks([]); setChapters([]); setTopics([]); return; }
      try {
        const subject = await subjectApi.getSubjectById(subjectId);
        setBooks(subject.books || []);
      } catch (error) {
        setServerError(getApiErrorMessage(error));
      }
    };
    void loadSubject();
  }, [subjectId]);

  useEffect(() => {
    if (!bookId) { setChapters([]); setTopics([]); return; }
    const book = books.find((b) => b._id === bookId);
    setChapters(book?.chapters || []);
  }, [bookId, books]);

  useEffect(() => {
    if (!chapterId) { setTopics([]); return; }
    const chapter = chapters.find((c) => c._id === chapterId);
    setTopics(chapter?.topics || []);
  }, [chapterId, chapters]);

  const topicOptions = useMemo(() => topics, [topics]);
  const contentPreview = watch('contentText') || '';

  const onSubmit = async (values: ContentForm) => {
    setServerError(null);
    setSuccessMsg(null);
    try {
      let targetTopicId = values.topicId;

      if (!targetTopicId) {
        if (!values.topicTitle?.trim()) throw new Error('Укажите тему');
        const subject = await subjectApi.createTopic(values.subjectId, values.bookId, values.chapterId, {
          title: values.topicTitle.trim()
        });
        const createdBook = subject.books.find((b) => b._id === values.bookId);
        const createdChapter = createdBook?.chapters.find((c) => c._id === values.chapterId);
        const createdTopic = createdChapter?.topics?.[createdChapter.topics.length - 1];
        targetTopicId = createdTopic?._id;
      }

      if (!targetTopicId) throw new Error('Не удалось определить тему');

      const pages = values.pages.split(',').map((p) => Number(p.trim())).filter((p) => !Number.isNaN(p));
      const keywords = values.keywords ? values.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [];

      await subjectApi.createParagraph(values.subjectId, values.bookId, values.chapterId, targetTopicId, {
        order: values.paragraphOrder,
        content: {
          text: values.contentText,
          pages,
          metadata: {
            keywords,
            difficulty: values.difficulty || undefined,
            source: values.source || undefined
          }
        }
      });

      setSuccessMsg('Контент успешно добавлен');
      reset();
    } catch (error) {
      setServerError(getApiErrorMessage(error));
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Добавить контент</h1>
      <p className="mb-6 text-sm text-slate-500">Параграф — единица учебного текста, из которого AI генерирует вопросы.</p>

      {subjects.length === 0 ? (
        <p className="text-sm text-slate-500">Сначала создайте предмет, книгу и главу.</p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Предмет" error={errors.subjectId?.message} {...register('subjectId')}>
              <option value="">Выберите</option>
              {subjects.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
            </Select>
            <Select label="Книга" error={errors.bookId?.message} {...register('bookId')}>
              <option value="">Выберите</option>
              {books.map((b) => <option key={b._id} value={b._id}>{b.title}</option>)}
            </Select>
            <Select label="Глава" error={errors.chapterId?.message} {...register('chapterId')}>
              <option value="">Выберите</option>
              {chapters.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Существующая тема" {...register('topicId')}>
              <option value="">Создать новую</option>
              {topicOptions.map((t) => <option key={t._id} value={t._id}>{t.title}</option>)}
            </Select>
            <Input label="Или название новой темы" error={errors.topicTitle?.message} placeholder="Название темы" {...register('topicTitle')} />
          </div>

          <Input label="Порядок параграфа" type="number" placeholder="0" error={errors.paragraphOrder?.message} {...register('paragraphOrder')} />

          <label className="flex w-full flex-col gap-2 text-sm font-medium text-slate-700">
            <span>Текст параграфа</span>
            <textarea
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:outline-none font-mono ${
                errors.contentText ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'
              }`}
              rows={8}
              placeholder="Вставьте учебный текст. Формулы: $E=mc^2$ (inline) или $$\frac{a}{b}$$ (блок)"
              {...register('contentText')}
            />
            {contentPreview && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-slate-700">Предпросмотр с формулами</summary>
                <div className="mt-2 rounded border border-slate-200 bg-white p-3 text-sm text-slate-800">
                  <MathText>{contentPreview}</MathText>
                </div>
              </details>
            )}
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Формулы (LaTeX)</summary>
              <ul className="mt-2 space-y-1">
                <li><code className="rounded bg-slate-200 px-1">{'$x^2$'}</code> — степень</li>
                <li><code className="rounded bg-slate-200 px-1">{'$\\frac{a}{b}$'}</code> — дробь</li>
                <li><code className="rounded bg-slate-200 px-1">{'$\\sqrt{x}$'}</code> — корень</li>
                <li><code className="rounded bg-slate-200 px-1">{'$\\sum_{i=1}^n$'}</code> — сумма</li>
                <li><code className="rounded bg-slate-200 px-1">{'$$\\int_0^1 f(x)dx$$'}</code> — интеграл (блок)</li>
                <li><code className="rounded bg-slate-200 px-1">{'\\(...\\)'}</code> и <code className="rounded bg-slate-200 px-1">{'\\[...\\]'}</code> — альтернативный синтаксис</li>
              </ul>
            </details>
            {errors.contentText && <span className="text-xs text-red-600">{errors.contentText.message}</span>}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Страницы (через запятую)" placeholder="12, 13, 14" error={errors.pages?.message} {...register('pages')} />
            <Input label="Ключевые слова" placeholder="алгебра, уравнения" {...register('keywords')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Сложность" {...register('difficulty')}>
              <option value="">Не указано</option>
              <option value="easy">Легко</option>
              <option value="medium">Средне</option>
              <option value="hard">Сложно</option>
            </Select>
            <Input label="Источник" placeholder="URL или название" {...register('source')} />
          </div>

          {serverError && <ErrorMessage message={serverError} />}
          {successMsg && <SuccessMessage message={successMsg} />}
          <Button type="submit" isLoading={isSubmitting}>
            Сохранить
          </Button>
        </form>
      )}
    </div>
  );
};
