import React, { useState } from 'react';

export const ConfirmDeleteBtn: React.FC<{ label?: string; onConfirm: () => Promise<void> }> = ({
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
            try {
              await onConfirm();
            } finally {
              setDeleting(false);
            }
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
    <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red-400 hover:text-red-600">
      {label}
    </button>
  );
};
