import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Small leading icon, e.g. <Filter className="w-4 h-4" />. */
  icon?: ReactNode;
  wrapperClassName?: string;
  children: ReactNode;
}

/**
 * A filter dropdown that looks like one.
 *
 * `appearance-none` is needed to style the control, but it also strips the native
 * arrow, which left the filters looking like plain read-only boxes. The chevron is
 * drawn back in so it is obvious that clicking opens more options.
 */
export function FilterSelect({
  icon,
  wrapperClassName = '',
  className = '',
  children,
  ...selectProps
}: FilterSelectProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      {icon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
      )}
      <select
        {...selectProps}
        className={`w-full ${icon ? 'pl-9' : 'pl-3'} cursor-pointer appearance-none rounded-lg border border-dark-700 bg-dark-800 py-2 pr-9 text-sm text-white transition focus:border-brand-500 focus:outline-none ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}
