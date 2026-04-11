import { useEffect, useRef, useState } from 'react';

export default function Dropdown({ label, items, disabled = false, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setTimeout(() => itemRefs.current[0]?.focus(), 0);
    }
  };

  const handleItemKeyDown = (event, index) => {
    if (event.key === 'Escape') {
      setOpen(false);
      ref.current?.querySelector('button')?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      itemRefs.current[Math.min(index + 1, items.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) {
        setOpen(false);
        ref.current?.querySelector('button')?.focus();
      } else {
        itemRefs.current[index - 1]?.focus();
      }
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="dropdown" ref={ref}>
      <button
        className="btn"
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <div
          className={`dropdown-menu${align === 'right' ? ' dropdown-menu--right' : ''}`}
          role="menu"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="dropdown-item"
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onKeyDown={(e) => handleItemKeyDown(e, index)}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
