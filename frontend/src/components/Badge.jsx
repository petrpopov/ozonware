const PILL_VARIANT = {
  default: '',
  success: 'closed',
  warning: 'partial',
  danger: 'returned',
  info: 'shipped',
  planned: 'planned',
  partial: 'partial',
  shipped: 'shipped',
  closed: 'closed',
  returned: 'returned',
};

export default function Badge({ label, variant = 'default', style }) {
  const pillClass = PILL_VARIANT[variant] ?? '';
  return (
    <span className={`pill${pillClass ? ` ${pillClass}` : ''}`} style={style}>
      {pillClass && <span className="pill-dot" />}
      {label}
    </span>
  );
}
