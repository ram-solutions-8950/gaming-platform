interface BadgeProps { label: string; variant?: 'success' | 'danger' | 'warn' | 'info' | 'default'; }

const variantMap = {
  success: 'bg-success/10 text-success border-success/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  info: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  default: 'bg-dark-700 text-gray-400 border-dark-600',
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${variantMap[variant]}`}>{label}</span>;
}
