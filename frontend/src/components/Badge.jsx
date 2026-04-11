const VARIANT_STYLES = {
  default: { background: 'var(--bg-hover)', color: 'var(--text-muted)' },
  success: { background: 'var(--color-success-bg)', color: 'var(--color-success)' },
  warning: { background: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
  danger:  { background: 'var(--color-danger-bg)',  color: 'var(--danger)' },
};

export default function Badge({ label, variant = 'default', style }) {
  const base = VARIANT_STYLES[variant] ?? VARIANT_STYLES.default;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        ...base,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
