import { useEffect, useState } from 'react';
import { systemService, type AppVersionInfo } from '../../services/systemService';
import { APP_VERSION } from '../../version';
import { Download, Sparkles, X, ArrowRight, ShieldCheck } from 'lucide-react';

function isNewerVersion(latest: string, current: string): boolean {
  try {
    const lParts = latest.replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const cParts = current.replace(/^[vV]/, '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  } catch {
    return false;
  }
}

export function AppUpdateModal() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    // Don't show APK update prompt on admin portal
    const isAdmin = typeof window !== 'undefined' && (
      window.location.hostname.startsWith('admin.') ||
      window.location.hostname === 'admin.corona888.tech' ||
      window.location.hostname === 'admin.crona888.com' ||
      window.location.pathname.startsWith('/admin')
    );
    if (isAdmin) return;

    // Check if dismissed in this session
    const dismissedVer = sessionStorage.getItem('dismissed_update_version');

    systemService
      .getAppVersion()
      .then((info) => {
        if (info && info.latest_version) {
          setUpdateInfo(info);
          if (isNewerVersion(info.latest_version, APP_VERSION)) {
            if (!info.force_update && dismissedVer === info.latest_version) {
              return;
            }
            setIsOpen(true);
          }
        }
      })
      .catch(() => {
        // Silently ignore if offline
      });
  }, []);

  if (!isOpen || !updateInfo) return null;

  const handleDismiss = () => {
    if (updateInfo.force_update) return;
    sessionStorage.setItem('dismissed_update_version', updateInfo.latest_version);
    setIsOpen(false);
  };

  const handleDownload = () => {
    setDownloading(true);
    const link = document.createElement('a');
    link.href = updateInfo.download_url || '/Corona888.apk';
    link.setAttribute('download', 'Corona888.apk');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#180a2e] via-[#0f051e] to-[#080212] rounded-3xl border-2 border-purple-500/50 shadow-[0_0_60px_rgba(168,85,247,0.35)] overflow-hidden text-white p-6">
        {/* Glow circle background */}
        <div className="absolute -top-16 -left-16 w-40 h-40 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-cyan-600/25 rounded-full blur-3xl pointer-events-none" />

        {/* Close button if not forced */}
        {!updateInfo.force_update && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}

        {/* Update Graphic */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 p-0.5 shadow-xl shadow-purple-600/30 mb-4 animate-bounce">
            <div className="w-full h-full bg-[#120624] rounded-2xl flex items-center justify-center text-3xl">
              🚀
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500"></span>
            </span>
          </div>

          <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 mb-2">
            New Version Available
          </span>

          <h3 className="text-xl font-black text-white tracking-wide">
            Update to v{updateInfo.latest_version}
          </h3>

          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1 mb-4 font-mono">
            <span className="text-gray-400">Current: v{APP_VERSION}</span>
            <ArrowRight size={12} className="text-cyan-400" />
            <span className="text-emerald-400 font-bold">Latest: v{updateInfo.latest_version}</span>
          </div>

          {/* Release Notes Card */}
          <div className="w-full bg-[#1e0d38]/80 border border-purple-500/30 rounded-2xl p-4 text-left mb-6 shadow-inner">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 mb-1.5">
              <Sparkles size={14} />
              <span>What's New in this Update:</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed font-sans">
              {updateInfo.release_notes || 'Major performance enhancements, new payment gateways, and instant ticket support.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-2.5">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full py-3.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-gray-950 shadow-lg shadow-teal-500/25 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download size={18} />
              <span>{downloading ? 'Downloading Update...' : 'Download & Update Now'}</span>
            </button>

            {!updateInfo.force_update && (
              <button
                onClick={handleDismiss}
                className="w-full py-2.5 text-xs font-semibold text-gray-400 hover:text-white transition"
              >
                Remind Me Later
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-4">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>Official Verified Corona888 APK Package</span>
          </div>
        </div>
      </div>
    </div>
  );
}
