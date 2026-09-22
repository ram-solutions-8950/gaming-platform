/**
 * Extracts a human-readable message from a failed API call.
 *
 * The backend wraps every error as `{ success: false, error: { code, message } }`,
 * including HTTPExceptions — it never sends FastAPI's raw `detail` field. The
 * `detail` fallbacks below only cover responses that bypass that handler.
 */
export function getApiErrorMessage(err: any, fallback = 'Something went wrong'): string {
  const data = err?.response?.data;

  const message =
    data?.error?.message ??
    (typeof data?.detail === 'string' ? data.detail : undefined) ??
    data?.detail?.[0]?.msg ??
    data?.message;

  if (typeof message === 'string' && message.trim()) return message;
  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return fallback;
}

/** The machine-readable error code, when the backend supplied one. */
export function getApiErrorCode(err: any): string | undefined {
  return err?.response?.data?.error?.code;
}
