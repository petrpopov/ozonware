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

  const politeToasts = toasts.filter((t) => t.kind !== 'error');
  const urgentToasts = toasts.filter((t) => t.kind === 'error');

  return (
    <div className="toast-host">
      <div role="status" aria-live="polite" aria-atomic="false">
        {politeToasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind} toast-clickable`}
            onClick={() => removeToast(toast.id)}
            aria-label={`${toast.message} — нажмите, чтобы закрыть`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true">
        {urgentToasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.kind} toast-clickable`}
            onClick={() => removeToast(toast.id)}
            aria-label={`Ошибка: ${toast.message} — нажмите, чтобы закрыть`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
