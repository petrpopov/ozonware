/**
 * Select — обёртка над нативным <select> в стиле проекта.
 *
 * Props:
 *   options  – [{value, label}]
 *   value    – string
 *   onChange – (value: string) => void
 *   placeholder – string (необязательно)
 *   disabled – bool
 *   className – string
 */
export default function Select({ options = [], value, onChange, placeholder, disabled = false, className = '' }) {
  return (
    <select
      className={`input${className ? ` ${className}` : ''}`}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
