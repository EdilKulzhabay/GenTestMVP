import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { subjectApi } from '../../api/subject.api';
import { roadmapApi } from '../../api/roadmap.api';
import { Subject } from '../../types/subject.types';
import { Loader } from '../../components/ui/Loader';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { Button } from '../../components/ui/Button';
import { getApiErrorMessage } from '../../utils/error';
import { useAuth } from '../../store/auth.store';
import {
  filterSubjectsForLearner,
  isSubjectAllowedForLearner
} from '../../utils/learnerSubjects.util';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Страница: чат с ИИ по контексту темы (узла) роадмапа. Query: ?subjectId=&nodeId= */
export const RoadmapChatPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectIdParam = searchParams.get('subjectId') || '';
  const nodeIdParam = searchParams.get('nodeId') || '';

  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [nodes, setNodes] = useState<Array<{ nodeId: string; title: string }>>([]);
  const [nodesLoading, setNodesLoading] = useState(false);

  const [topicTitle, setTopicTitle] = useState<string>('');
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasSession = Boolean(subjectIdParam && nodeIdParam);

  useEffect(() => {
    const load = async () => {
      setListLoading(true);
      setListError(null);
      try {
        const data = await subjectApi.getSubjects();
        setAllSubjects(data);
        setSubjects(filterSubjectsForLearner(data, user));
      } catch (e) {
        setListError(getApiErrorMessage(e));
      } finally {
        setListLoading(false);
      }
    };
    void load();
  }, [user]);

  const loadNodesForSubject = useCallback(
    async (sid: string) => {
      setNodesLoading(true);
      setListError(null);
      try {
        const can = await roadmapApi.getCanonical(sid);
        setNodes(
          (can.nodes || []).map((n) => ({ nodeId: n.nodeId, title: n.title || n.nodeId }))
        );
      } catch (e) {
        setListError(getApiErrorMessage(e));
        setNodes([]);
      } finally {
        setNodesLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!subjectIdParam) {
      setNodes([]);
      return;
    }
    const sub = allSubjects.find((s) => s._id === subjectIdParam);
    if (sub && !isSubjectAllowedForLearner(user, sub)) {
      setNodes([]);
      return;
    }
    void loadNodesForSubject(subjectIdParam);
  }, [subjectIdParam, allSubjects, user, loadNodesForSubject]);

  useEffect(() => {
    if (!hasSession) {
      setTopicTitle('');
      setMessages([]);
      return;
    }

    const run = async () => {
      setContextLoading(true);
      setContextError(null);
      setMessages([]);
      try {
        const sub = await subjectApi.getSubjectById(subjectIdParam);
        if (!isSubjectAllowedForLearner(user, sub)) {
          setContextError('Предмет недоступен для вашего профиля.');
          return;
        }
        const lesson = await roadmapApi.getNodeLesson(nodeIdParam, subjectIdParam);
        setTopicTitle(lesson.title);
        setMessages([
          {
            id: id(),
            role: 'assistant',
            text:
              'Здравствуйте! Я отвечаю в контексте выбранной темы. Задавайте вопросы по уроку ' +
              `(можно прикрепить скриншот до ${MAX_IMAGE_BYTES / 1024 / 1024} МБ).`
          }
        ]);
      } catch (e) {
        setContextError(getApiErrorMessage(e));
        setTopicTitle('');
      } finally {
        setContextLoading(false);
      }
    };
    void run();
  }, [hasSession, subjectIdParam, nodeIdParam, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onPickSubject = (sid: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('subjectId', sid);
      p.delete('nodeId');
      return p;
    });
  };

  const onPickNode = (nid: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('subjectId', subjectIdParam);
      p.set('nodeId', nid);
      return p;
    });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !hasSession) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setSendError('Файл слишком большой (макс. 5 МБ).');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setSendError('Нужен файл изображения (JPEG, PNG, WebP, GIF).');
      return;
    }
    setUploading(true);
    setSendError(null);
    try {
      const { attachmentId } = await roadmapApi.postNodeChatAttachment(
        nodeIdParam,
        file,
        subjectIdParam
      );
      setPendingAttachmentIds((prev) => [...prev, attachmentId]);
    } catch (err) {
      setSendError(getApiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || !hasSession || sending) return;
    setSending(true);
    setSendError(null);
    setInput('');

    const userMsg: ChatMessage = {
      id: id(),
      role: 'user',
      text: pendingAttachmentIds.length
        ? `${text}\n\n[вложения: ${pendingAttachmentIds.length} фото]`
        : text
    };
    setMessages((m) => [...m, userMsg]);

    try {
      const { reply } = await roadmapApi.postNodeChatMessage(nodeIdParam, {
        subjectId: subjectIdParam,
        text,
        ...(pendingAttachmentIds.length ? { attachmentIds: pendingAttachmentIds } : {})
      });
      setPendingAttachmentIds([]);
      setMessages((m) => [...m, { id: id(), role: 'assistant', text: reply }]);
    } catch (err) {
      setSendError(getApiErrorMessage(err));
      setMessages((m) => [
        ...m,
        {
          id: id(),
          role: 'assistant',
          text: 'Не удалось получить ответ. Попробуйте ещё раз.'
        }
      ]);
    } finally {
      setSending(false);
    }
  };

  if (listLoading) {
    return <Loader />;
  }

  if (listError && subjects.length === 0) {
    return <ErrorMessage message={listError} />;
  }

  if (!hasSession) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="section-title">Чат с ИИ по теме</h1>
          <p className="muted-text mt-1">
            Выберите предмет и тему (узел) карты знаний — ответы будут с учётом урока по этой теме.
          </p>
        </div>
        {listError && <ErrorMessage message={listError} />}

        <div className="card space-y-2">
          <p className="text-sm font-medium text-slate-800">1. Предмет</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {subjects.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => onPickSubject(s._id!)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  subjectIdParam === s._id
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 hover:border-emerald-200'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {subjectIdParam && (
          <div className="card space-y-2">
            <p className="text-sm font-medium text-slate-800">2. Тема (узел)</p>
            {nodesLoading && <Loader />}
            {!nodesLoading && nodes.length === 0 && (
              <p className="text-sm text-amber-700">Карта для этого предмета не настроена.</p>
            )}
            {!nodesLoading && nodes.length > 0 && (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {nodes.map((n) => (
                  <button
                    key={n.nodeId}
                    type="button"
                    onClick={() => onPickNode(n.nodeId)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/50"
                  >
                    {n.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-slate-500">
          Или откройте чат с{' '}
          <Link to="/user/roadmap" className="text-emerald-700 underline">
            карты знаний
          </Link>
          , нажав «Чат» у темы.
        </p>
      </div>
    );
  }

  if (contextLoading) {
    return <Loader />;
  }

  if (contextError) {
    return (
      <div className="space-y-3">
        <ErrorMessage message={contextError} />
        <Button variant="outline" onClick={() => navigate('/user/roadmap/chat')}>
          Выбрать другую тему
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[min(70vh,640px)] flex-col space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link to="/user/roadmap/chat" className="text-emerald-700 hover:underline">
              Другая тема
            </Link>
            <span>·</span>
            <span className="font-mono text-xs">{nodeIdParam}</span>
          </div>
          <h1 className="section-title mt-1">{topicTitle || 'Тема'}</h1>
        </div>
        <Button variant="outline" onClick={() => navigate(`/user/roadmap?subjectId=${subjectIdParam}`)}>
          К карте
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-100 bg-slate-50 text-slate-800'
                }`}
              >
                {m.text.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1' : undefined}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {pendingAttachmentIds.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-1 text-xs text-slate-500">
            К сообщению будут прикреплены: {pendingAttachmentIds.length} файл(а)
          </p>
        )}

        {sendError && (
          <div className="px-4 pb-1">
            <p className="text-xs text-red-600">{sendError}</p>
          </div>
        )}

        <div className="border-t border-slate-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            <Button
              type="button"
              variant="outline"
              disabled={uploading || sending}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? '…' : '📎'}
            </Button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={2}
              placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"
              className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <Button onClick={() => void onSend()} isLoading={sending} disabled={!input.trim() || sending}>
              Отправить
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
