import React, { useEffect, useState } from 'react';
import corona888Logo from '../assets/corona888-logo.webp';
import { soundManager } from '../services/soundManager';
import { copyToClipboard } from '../utils/clipboard';
import '../styles/download-page.css';

export const DownloadPage: React.FC = () => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const referralCode = new URLSearchParams(window.location.search).get('ref')?.trim() || '';

  const copyReferralCode = async () => {
    if (!referralCode || !(await copyToClipboard(referralCode))) return;
    setReferralCopied(true);
    window.setTimeout(() => setReferralCopied(false), 2500);
  };

  useEffect(() => {
    // Explicit guarantee: Stop all sounds and music on download page
    try {
      soundManager.stopMusic();
    } catch {
      /* ignore */
    }
  }, []);

  const triggerApkDownload = () => {
    const link = document.createElement('a');
    link.href = '/Corona888.apk';
    link.download = 'Corona888.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadStarted(true);
  };

  return (
    <div className="c888-download-root">
      {/* Outer Tactical Cyberpunk Poster Frame */}
      <div className="c888-poster-frame">
        {/* Tactical Corner Accents */}
        <div className="c888-frame-corner corner-tl" />
        <div className="c888-frame-corner corner-tr" />
        <div className="c888-frame-corner corner-bl" />
        <div className="c888-frame-corner corner-br" />

        {!downloadStarted ? (
          <>
            {/* 1. Corona 888 Tactical Shield Logo Artwork */}
            <div className="c888-logo-container">
              <img
                src={corona888Logo}
                alt="Corona 888 - Tactical Gaming App"
                className="c888-logo-img"
                loading="eager"
                decoding="sync"
              />
            </div>

            {/* 2. Main Title */}
            <h1 className="c888-title">
              <span className="title-corona">Corona</span>{' '}
              <span className="title-888">888</span>
            </h1>

            {/* 3. Sub-title */}
            <div className="c888-subtitle">OFFICIAL ANDROID APPLICATION</div>

            {/* 4. Description */}
            <p className="c888-desc">
              Download the official Corona 888 Android application.
            </p>

            {/* 5. Trust / Information Badges */}
            <div className="c888-badges-row">
              <div className="c888-badge">
                <div className="c888-badge-icon-wrap">
                  <svg
                    className="c888-badge-icon"
                    viewBox="0 0 24 24"
                    fill="#22c55e"
                    width="20"
                    height="20"
                  >
                    <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4126 13.8533 8.125 12 8.125c-1.8533 0-3.5902.2876-5.1368.8247L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396" />
                  </svg>
                </div>
                <div className="c888-badge-text">
                  <div className="c888-badge-title">100% SAFE</div>
                  <div className="c888-badge-sub">Secure &amp; Trusted</div>
                </div>
              </div>

              <div className="c888-badge">
                <div className="c888-badge-icon-wrap">
                  <svg
                    className="c888-badge-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="20"
                    height="20"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
                <div className="c888-badge-text">
                  <div className="c888-badge-title">OFFICIAL APP</div>
                  <div className="c888-badge-sub">Latest Release</div>
                </div>
              </div>
            </div>

            {referralCode && (
              <div className="mt-4 w-full rounded-xl border border-amber-400/40 bg-black/35 p-3 text-center">
                <p className="text-xs font-semibold text-amber-200">Referral code from your friend</p>
                <div className="mt-1 flex items-center justify-center gap-3">
                  <strong className="font-mono text-lg font-black tracking-widest text-amber-300">{referralCode}</strong>
                  <button type="button" onClick={copyReferralCode} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black">
                    {referralCopied ? 'Copied!' : 'Copy code'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-white/75">After installing, enter this code in the app signup form.</p>
              </div>
            )}

            {/* 6. Primary DOWNLOAD APK Button */}
            <button
              type="button"
              onClick={triggerApkDownload}
              className="c888-download-btn"
              id="btn-download-apk"
            >
              <svg
                className="c888-btn-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="22"
                height="22"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>DOWNLOAD APK</span>
            </button>

            {/* 7. Installation Note Card */}
            <div className="c888-install-note">
              <div className="c888-note-icon-wrap">
                <svg
                  className="c888-note-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="18"
                  height="18"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="c888-note-content">
                <strong className="c888-note-lead">Tip:</strong> Android warning aane par &ldquo;Download anyway&rdquo; ya &ldquo;Allow from this source&rdquo; select karein.
              </div>
            </div>
          </>
        ) : (
          /* DOWNLOAD STARTED VIEW - MATCHING VOICE NOTE REQUIREMENT */
          <div className="c888-success-container">
            {/* Status Pulse Animation */}
            <div className="c888-success-icon-wrap">
              <div className="c888-pulse-ring" />
              <div className="c888-pulse-circle">
                <svg
                  className="c888-success-check-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="32"
                  height="32"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <div className="c888-success-badge">DOWNLOAD STARTED 🚀</div>

            <h2 className="c888-success-title">
              डाउनलोड शुरू हो गया है!
            </h2>

            {/* DIRECT USER VOICE NOTE PROMPT IN GOLDEN HIGHLIGHT BOX */}
            <div className="c888-voice-alert-box">
              <div className="c888-voice-alert-icon">📲</div>
              <div className="c888-voice-alert-text">
                <div className="c888-voice-alert-lead">
                  Aapke download me ja kar ke usko install kar lo.
                </div>
                <div className="c888-voice-alert-sub">
                  Corona888.apk download ho raha hai. File complete hone par Downloads folder ya Notification bar se tap karke install karein.
                </div>
              </div>
            </div>

            {referralCode && (
              <div className="mb-3 w-full rounded-xl border border-amber-400/40 bg-black/35 p-3 text-center">
                <p className="text-xs font-semibold text-amber-200">Remember to use your referral code after installing</p>
                <div className="mt-1 flex items-center justify-center gap-3">
                  <strong className="font-mono text-lg font-black tracking-widest text-amber-300">{referralCode}</strong>
                  <button type="button" onClick={copyReferralCode} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black">
                    {referralCopied ? 'Copied!' : 'Copy code'}
                  </button>
                </div>
              </div>
            )}

            {/* 3 Step Visual Guidance */}
            <div className="c888-steps-card">
              <div className="c888-step-row">
                <div className="c888-step-number">1</div>
                <div className="c888-step-body">
                  <span className="c888-step-title">Downloads Check Karein</span>
                  <span className="c888-step-desc">Phone ka notification bar pull karein ya Files app me <strong>Downloads</strong> folder kholein.</span>
                </div>
              </div>

              <div className="c888-step-divider" />

              <div className="c888-step-row">
                <div className="c888-step-number">2</div>
                <div className="c888-step-body">
                  <span className="c888-step-title">Corona888.apk Par Tap Karein</span>
                  <span className="c888-step-desc">Downloaded file par tap karke installation start karein.</span>
                </div>
              </div>

              <div className="c888-step-divider" />

              <div className="c888-step-row">
                <div className="c888-step-number">3</div>
                <div className="c888-step-body">
                  <span className="c888-step-title">Install &amp; Play</span>
                  <span className="c888-step-desc">Agar prompt aaye toh &ldquo;Allow from this source&rdquo; karein aur <strong>Install</strong> dabayein.</span>
                </div>
              </div>
            </div>

            {/* Re-download button */}
            <button
              type="button"
              onClick={triggerApkDownload}
              className="c888-redownload-btn"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="16"
                height="16"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download Again (फिर से डाउनलोड करें)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DownloadPage;
