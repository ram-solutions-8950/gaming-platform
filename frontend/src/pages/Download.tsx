import React from 'react';
import { Link } from 'react-router-dom';
import corona888Logo from '../assets/corona888-logo.webp';
import '../styles/download-page.css';

const APK_DOWNLOAD_URL = 'http://76.13.177.44/GameStack.apk';

export const DownloadPage: React.FC = () => {
  return (
    <main className="download-page-root">
      <div className="download-card">
        {/* Brand Logo using existing optimized WebP asset */}
        <div className="download-logo-wrap">
          <img
            src={corona888Logo}
            alt="Corona 888 Logo"
            className="download-logo-img"
            loading="eager"
            decoding="sync"
          />
        </div>

        {/* Header Content */}
        <h1 className="download-title">Corona 888</h1>
        <p className="download-subtitle">Official Android Application</p>
        <p className="download-desc">
          Download the official Corona 888 Android application.
        </p>

        {/* APK Information Chips */}
        <div className="download-info-badges">
          <div className="download-badge">
            <svg
              className="download-badge-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            <span>Android APK</span>
          </div>

          <div className="download-badge">
            <svg
              className="download-badge-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Official App</span>
          </div>
        </div>

        {/* Direct APK Download Button */}
        <a
          href={APK_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="download-btn"
          download
        >
          <svg
            className="download-btn-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download APK</span>
        </a>

        {/* Installation Safety Note */}
        <div className="download-note-box">
          <svg
            className="download-note-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="download-note-text">
            <strong>Installation Note:</strong> If Android blocks the installation, allow installation from your browser or file manager when prompted.
          </p>
        </div>

        {/* Quick 3-Step Guide */}
        <div className="download-steps">
          <div className="download-step-item">
            <span className="download-step-num">1</span>
            <span className="download-step-label">Download APK</span>
          </div>
          <div className="download-step-item">
            <span className="download-step-num">2</span>
            <span className="download-step-label">Open File</span>
          </div>
          <div className="download-step-item">
            <span className="download-step-num">3</span>
            <span className="download-step-label">Install & Play</span>
          </div>
        </div>

        {/* Navigation to Web Version */}
        <div className="download-footer-links">
          <Link to="/login" className="download-web-link">
            ← Play in Web Browser
          </Link>
        </div>
      </div>
    </main>
  );
};

export default DownloadPage;
