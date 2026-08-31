import React, { useEffect } from 'react';
import corona888Logo from '../assets/corona888-logo.webp';
import { soundManager } from '../services/soundManager';
import '../styles/download-page.css';

export const DownloadPage: React.FC = () => {
  useEffect(() => {
    // Explicit guarantee: Stop all sounds and music on download page
    try {
      soundManager.stopMusic();
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="c888-download-root">
      {/* Outer Tactical Cyberpunk Poster Frame matching reference image */}
      <div className="c888-poster-frame">
        {/* Tactical Corner Accents */}
        <div className="c888-frame-corner corner-tl" />
        <div className="c888-frame-corner corner-tr" />
        <div className="c888-frame-corner corner-bl" />
        <div className="c888-frame-corner corner-br" />

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
          Download the official Corona 888<br />
          Android application.
        </p>

        {/* 5. Trust / Information Badges */}
        <div className="c888-badges-row">
          <div className="c888-badge">
            <div className="c888-badge-icon-wrap">
              <svg
                className="c888-badge-icon"
                viewBox="0 0 24 24"
                fill="#22c55e"
                width="22"
                height="22"
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
                width="22"
                height="22"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div className="c888-badge-text">
              <div className="c888-badge-title">OFFICIAL APP</div>
              <div className="c888-badge-sub">Latest Version</div>
            </div>
          </div>
        </div>

        {/* 6. Primary DOWNLOAD APK Button */}
        <a
          href="http://76.13.177.44/Corona888.apk"
          download="Corona888.apk"
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
            width="24"
            height="24"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>DOWNLOAD APK</span>
        </a>

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
              width="24"
              height="24"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="c888-note-content">
            <strong className="c888-note-lead">Installation Note:</strong> If Android blocks the
            installation, allow installation from your browser or file manager when prompted.
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;
