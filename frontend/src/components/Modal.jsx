import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, footer, size = 'sm', children, className = '' }) {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;

    const trapFocus = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;
      const elements = [...modal.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null
      );
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    requestAnimationFrame(() => {
      const modal = modalRef.current;
      if (!modal) return;
      const first = modal.querySelector(FOCUSABLE);
      first?.focus();
    });

    window.addEventListener('keydown', trapFocus);
    return () => {
      window.removeEventListener('keydown', trapFocus);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal modal--${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className="modal-header">{title}</div>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
