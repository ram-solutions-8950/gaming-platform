/**
 * Copy text to the clipboard, and say whether it worked.
 *
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost). The
 * admin portal is routinely opened over plain HTTP on a LAN address, where the
 * property is `undefined` and `navigator.clipboard.writeText(...)` throws a
 * TypeError — which is why every copy icon in the portal silently did nothing
 * while still flashing a confirmation tick. Fall back to a hidden textarea plus
 * the legacy `execCommand('copy')` there, and report failure honestly so callers
 * can tell the admin to select the value by hand instead of lying to them.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Blocked by permissions policy or an insecure context — try the old way.
  }

  return legacyCopy(value);
}

function legacyCopy(value: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    // Off-screen but still focusable: `display: none` would make the copy a no-op.
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    textarea.setSelectionRange(0, value.length);
    const copied = document.execCommand('copy');

    document.body.removeChild(textarea);
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    return copied;
  } catch {
    return false;
  }
}
