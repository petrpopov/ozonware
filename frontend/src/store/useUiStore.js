import { create } from 'zustand';

let seq = 0;

export const useUiStore = create((set) => ({
  toasts: [],
  pushToast: (message, kind = 'info') =>
    set((state) => ({
      toasts: [...state.toasts, { id: ++seq, message, kind }]
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
}));
