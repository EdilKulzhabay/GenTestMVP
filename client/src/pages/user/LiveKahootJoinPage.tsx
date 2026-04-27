import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLiveKahootSocket, LiveJoinAck } from '../../api/liveKahoot.socket';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { useAuth } from '../../store/auth.store';

export const LiveKahootJoinPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleJoin = () => {
    setErr(null);
    const d = code.replace(/\D/g, '');
    if (d.length !== 6) {
      setErr('Введите 6-значный код комнаты.');
      return;
    }
    setLoading(true);
    const socket = getLiveKahootSocket();
    socket.emit('live:join', { pin: d }, (ack: LiveJoinAck) => {
      setLoading(false);
      if (ack?.success && ack.state && ack.roomId) {
        navigate('/user/kahoot/room', {
          replace: true,
          state: { role: 'player', roomId: ack.roomId, seed: ack.state }
        });
        return;
      }
      if (ack?.code === 'ALREADY_STARTED') {
        window.alert('Live Kahoot уже начался. К этой комнате больше нельзя присоединиться.');
        return;
      }
      if (ack?.code === 'NOT_FOUND') {
        setErr(ack?.message || 'Код не найден. Проверьте цифры и попробуйте снова.');
        return;
      }
      setErr(ack?.message || 'Не удалось присоединиться');
    });
  };

  return (
    <div className="card max-w-md space-y-4">
      <h1 className="section-title">Войти в Live Kahoot</h1>
      <p className="text-sm text-slate-600">
        Введите 6-значный код, который прислал ведущий.
      </p>
      {err && <ErrorMessage message={err} />}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-800" htmlFor="kahoot-pin">
          Код комнаты
        </label>
        <input
          id="kahoot-pin"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-lg tracking-widest"
          inputMode="numeric"
          maxLength={12}
          autoComplete="off"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button isLoading={loading} onClick={() => void handleJoin()}>
          Присоединиться
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate('/user')}>
          Назад
        </Button>
      </div>
    </div>
  );
};
