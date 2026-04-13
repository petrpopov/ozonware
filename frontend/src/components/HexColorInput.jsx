import { useRef } from 'react';

const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

export default function HexColorInput({ value, onChange, className }) {
  const pickerRef = useRef(null);
  const valid = HEX6_RE.test(String(value || ''));

  return (
    <div className="hex-input-wrap">
      <input
        type="text"
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label
        className={`hex-input-wrap__swatch${valid ? '' : ' hex-input-wrap__swatch--empty'}`}
        style={valid ? { backgroundColor: value } : undefined}
        title="Выбрать цвет"
      >
        <input
          ref={pickerRef}
          type="color"
          className="hex-input-wrap__picker"
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
        />
      </label>
    </div>
  );
}
