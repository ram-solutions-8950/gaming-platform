import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { lockLandscape } from './utils/nativeOrientation'

// Enforce default fixed landscape orientation across Android APK & browser
lockLandscape().catch(() => {});

// Synchronize true viewport height and safe-area metrics across Android WebViews
function syncDynamicViewport() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}

syncDynamicViewport();
window.addEventListener('resize', syncDynamicViewport, { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(syncDynamicViewport, 100);
}, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncDynamicViewport, { passive: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
