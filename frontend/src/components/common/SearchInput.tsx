import { Search, X } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Applied to the wrapper, e.g. "sm:col-span-6". */
  className?: string;
  /** True while the debounced query is still being fetched. */
  busy?: boolean;
  ariaLabel?: string;
}

/** Search box with a clear button and an in-flight hint. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
  busy = false,
  ariaLabel = 'Search',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-dark-700 bg-dark-800 py-2 pl-9 pr-16 text-sm text-white placeholder-gray-500 transition focus:border-brand-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {busy && (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-dark-600 border-t-brand-500"
            role="status"
            aria-label="Searching"
          />
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear search"
            aria-label="Clear search"
            className="cursor-pointer rounded p-1 text-gray-400 transition hover:bg-dark-700 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
