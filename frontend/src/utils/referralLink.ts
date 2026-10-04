const PUBLIC_DOWNLOAD_URL = 'https://polandexim.com/download';

/** Build a shareable public APK landing URL, never a WebView's localhost origin. */
export function buildReferralDownloadLink(referralCode?: string | null): string {
  const url = new URL(PUBLIC_DOWNLOAD_URL);
  const code = referralCode?.trim();
  if (code) url.searchParams.set('ref', code);
  return url.toString();
}
