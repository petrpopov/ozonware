import { useEffect, useRef, useState } from 'react';

/**
 * Combobox — searchable dropdown с фильтрацией и опциональным quick-add.
 *
 * Props:
 *   options    – [{value, label}]
 *   value      – string | null
 *   onChange   – (value: string) => void
 *   onQuickAdd – (inputText: string) => Promise<void>  (если задан — показывает кнопку "Создать")
 *   placeholder – string
 *   disabled   – bool
 *   className  – string
 */
export default function Combobox({
  options = [],
  value,
  onChange,
  onQuickAdd,
  placeholder = 'Выберите...',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleQuickAdd = async () => {
    if (!query.trim() || !onQuickAdd) return;
    await onQuickAdd(query.trim());
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className={`combobox${className ? ` ${className}` : ''}`} style={{ position: 'relative' }}>
      <button
        type="button"
        className="input combobox-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span style={{ color: selected ? 'var(--text)' : 'var(--text-muted)' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-card)',
            boxShadow: 'var(--shadow-modal)',
            borderRadius: '6px',
            overflow: 'hidden',
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '6px' }}>
            <input
              ref={inputRef}
              className="input"
              style={{ width: '100%' }}
              placeholder="Поиск..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0].value);
              }}
            />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Ничего не найдено
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  fontSize: '14px',
                  background: opt.value === value ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = opt.value === value ? 'var(--bg-hover)' : 'transparent'; }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {onQuickAdd && query.trim() && filtered.every((o) => o.label !== query.trim()) && (
            <div style={{ borderTop: '1px solid var(--bg-hover)', padding: '6px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: '13px' }}
                onClick={handleQuickAdd}
              >
                + Создать «{query.trim()}»
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
