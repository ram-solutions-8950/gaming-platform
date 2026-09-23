import { useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

export interface CopyableIdProps {
  value: string;
  /** Used in the tooltip, e.g. "User ID" / "Round ID". */
  label?: string;
  /** Render the whole value instead of clipping it to `widthClass`. */
  full?: boolean;
  /** Clip width applied when `full` is false. */
  widthClass?: string;
  /** Classes for the value itself, e.g. a different text colour or size. */
  valueClassName?: string;
  /** Classes for the wrapper (layout, spacing). */
  className?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * An ID with a copy button that actually copies.
 *
 * The complete value always stays in the DOM: long ids are clipped with CSS, not
 * by slicing the string, so selecting the text by hand yields the whole id rather
 * than a fragment ending in "...". Copy failures are reported instead of being
 * masked by a confirmation tick.
 */
export function CopyableId({
  value,
  label = 'ID',
  full = false,
  widthClass = 'max-w-[7.5rem]',
  valueClassName = 'text-gray-300',
  className = '',
}: CopyableIdProps) {
  const [state, setState] = useState<CopyState>('idle');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const copied = await copyToClipboard(value);
    setState(copied ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div className={`flex items-center gap-1.5 font-mono text-xs ${className}`}>
      <span
        className={`${full ? 'select-all break-all' : `select-all truncate ${widthClass}`} ${valueClassName}`}
        title={value}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        title={
          state === 'failed'
            ? `Could not copy — select the ${label} and copy it manually`
            : `Copy full ${label}`
        }
        aria-label={`Copy full ${label}`}
        className="shrink-0 cursor-pointer rounded p-1 text-gray-400 transition hover:bg-dark-700 hover:text-white"
      >
        {state === 'copied' ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : state === 'failed' ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
