/**
 * Visible "Refreshing…" state for a manual refresh.
 *
 * Render it inside a `relative` container (the Card or section being reloaded);
 * it covers that content while the request is in flight and disappears when the
 * fresh data is on screen.
 */
export function RefreshOverlay({
  active,
  label = 'Refreshing…',
}: {
  active: boolean;
  label?: string;
}) {
  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-dark-950/55 pt-16 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 rounded-xl border border-dark-600 bg-dark-900/95 px-4 py-2.5 shadow-2xl">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-dark-600 border-t-brand-500" />
        <span className="text-sm font-medium text-gray-200">{label}</span>
      </div>
    </div>
  );
}
