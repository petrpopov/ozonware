import { useEffect } from 'react';
import { useUiStore } from '../store/useUiStore.js';

export default function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);

  useEffect(() => {
    const timers = toasts.map((toast) => {
      const duration = toast.kind === 'error' ? 5000 : 3000;
      return setTimeout(() => removeToast(toast.id), duration);
    });

    return () => timers.forEach(clearTimeout);
  }, [toasts, removeToast]);

  return (
    <div className="toast-host">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          onClick={() => removeToast(toast.id)}
          style={{ cursor: 'pointer' }}
          title="Закрыть"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
